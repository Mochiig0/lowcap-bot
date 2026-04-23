import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

type CommandSuccess = {
  ok: true;
  stdout: string;
  stderr: string;
};

type CommandFailure = {
  ok: false;
  stdout: string;
  stderr: string;
  code: number | null;
};

type CommandResult = CommandSuccess | CommandFailure;

type ImportFileOutput = {
  mint: string;
  rank: string;
  score: number;
  hardRejected: boolean;
  hardRejectReason: string | null;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-file-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
  await execFileAsync(
    "bash",
    ["-lc", "pnpm exec prisma db push --skip-generate"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runImportFile(
  filePath: string,
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `import-file-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `import-file-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/importFile.ts",
          `--file ${shellEscape(filePath)}`,
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
        },
      },
    );

    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8"),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const output = error as {
      code?: number | null;
    };
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8").catch(() => ""),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    return {
      ok: false,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      code: output.code ?? null,
    };
  } finally {
    await rm(stdoutPath, { force: true });
    await rm(stderrPath, { force: true });
  }
}

async function readToken(
  databaseUrl: string,
  mint: string,
): Promise<{
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  source: string | null;
  metadataStatus: string;
  dev: {
    wallet: string;
  } | null;
} | null> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.token.findUnique({
      where: { mint },
      select: {
        mint: true,
        name: true,
        symbol: true,
        description: true,
        source: true,
        metadataStatus: true,
        dev: {
          select: {
            wallet: true,
          },
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("importFile boundary", async (t) => {
  await t.test("imports a valid file-backed payload with the actual wrapper shape", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const filePath = join(dir, "import-file-valid.json");
      const mint = "So11111111111111111111111111111111111111112";
      const devWallet = "DevWallet111111111111111111111111111111111";

      await runDbPush(databaseUrl);
      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            mint,
            name: "Import File Test",
            symbol: "IFILE",
            desc: "file-backed description",
            source: "test-import-file",
            dev: devWallet,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const result = await runImportFile(filePath, databaseUrl);
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ImportFileOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(typeof parsed.rank, "string");
      assert.equal(typeof parsed.score, "number");
      assert.equal(parsed.hardRejected, false);
      assert.equal(parsed.hardRejectReason, null);
      assert.equal("created" in parsed, false);
      assert.equal("count" in parsed, false);
      assert.equal("items" in parsed, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        name: "Import File Test",
        symbol: "IFILE",
        description: "file-backed description",
        source: "test-import-file",
        metadataStatus: "mint_only",
        dev: {
          wallet: devWallet,
        },
      });
    });
  });

  await t.test("exits non-zero when wrapper shape is invalid", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "invalid-wrapper.json");

      await writeFile(filePath, `${JSON.stringify([], null, 2)}\n`, "utf-8");

      const result = await runImportFile(filePath);
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /expected exactly one object/);
      assert.match(result.stdout, /pnpm import:file -- --file <PATH>/);
    });
  });

  await t.test("exits non-zero when a required payload field is missing", async () => {
    await withTempDir(async (dir) => {
      const filePath = join(dir, "missing-name.json");

      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            mint: "So11111111111111111111111111111111111111112",
            symbol: "MISS",
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const result = await runImportFile(filePath);
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /missing required non-empty string field "name"/,
      );
      assert.match(result.stdout, /pnpm import:file -- --file <PATH>/);
    });
  });

  await t.test("keeps token state stable on sequential re-import of the same file input", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "rerun.db")}`;
      const filePath = join(dir, "import-file-rerun.json");
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";
      const devWallet = "DevWallet222222222222222222222222222222222";

      await runDbPush(databaseUrl);
      await writeFile(
        filePath,
        `${JSON.stringify(
          {
            mint,
            name: "Import File Rerun",
            symbol: "IFR",
            desc: "rerun description",
            source: "test-import-file-rerun",
            dev: devWallet,
          },
          null,
          2,
        )}\n`,
        "utf-8",
      );

      const first = await runImportFile(filePath, databaseUrl);
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as ImportFileOutput;
      assert.equal(firstParsed.mint, mint);
      assert.equal("created" in firstParsed, false);

      const second = await runImportFile(filePath, databaseUrl);
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as ImportFileOutput;

      assert.equal(secondParsed.mint, mint);
      assert.equal(secondParsed.rank, firstParsed.rank);
      assert.equal(secondParsed.score, firstParsed.score);
      assert.equal(secondParsed.hardRejected, firstParsed.hardRejected);
      assert.equal(secondParsed.hardRejectReason, firstParsed.hardRejectReason);
      assert.equal("created" in secondParsed, false);
      assert.equal("existingCount" in secondParsed, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        name: "Import File Rerun",
        symbol: "IFR",
        description: "rerun description",
        source: "test-import-file-rerun",
        metadataStatus: "mint_only",
        dev: {
          wallet: devWallet,
        },
      });
    });
  });
});
