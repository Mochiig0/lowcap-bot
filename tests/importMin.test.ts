import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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

type ImportMinOutput = {
  mint: string;
  rank: string;
  score: number;
  hardRejected: boolean;
  hardRejectReason: string | null;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-min-test-"));

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

async function runImportMin(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `import-min-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `import-min-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/importMin.ts",
          ...args.map(shellEscape),
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
  source: string | null;
  metadataStatus: string;
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
        source: true,
        metadataStatus: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("importMin boundary", async (t) => {
  await t.test("imports a token with the actual required args", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);

      const result = await runImportMin(
        [
          "--mint",
          mint,
          "--name",
          "Import Min Test",
          "--symbol",
          "IMIN",
          "--source",
          "test-import-min",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ImportMinOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(typeof parsed.rank, "string");
      assert.equal(typeof parsed.score, "number");
      assert.equal(parsed.hardRejected, false);
      assert.equal(parsed.hardRejectReason, null);
      assert.equal("created" in parsed, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        name: "Import Min Test",
        symbol: "IMIN",
        source: "test-import-min",
        metadataStatus: "mint_only",
      });
    });
  });

  await t.test("exits non-zero when a required arg is missing", async () => {
    const result = await runImportMin([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--symbol",
      "MISS",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --name/);
    assert.match(
      result.stdout,
      /pnpm import:min -- --mint <MINT> --name <NAME> --symbol <SYM>/,
    );
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runImportMin([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--name",
      "Import Min Test",
      "--symbol",
      "IMIN",
      "--groupKey",
      "should-fail",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --groupKey/);
    assert.match(
      result.stdout,
      /pnpm import:min -- --mint <MINT> --name <NAME> --symbol <SYM>/,
    );
  });

  await t.test("keeps token state stable on sequential re-import of the same input", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "rerun.db")}`;
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";
      const args = [
        "--mint",
        mint,
        "--name",
        "Import Min Rerun",
        "--symbol",
        "IMR",
        "--source",
        "test-import-min-rerun",
      ];

      await runDbPush(databaseUrl);

      const first = await runImportMin(args, databaseUrl);
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as ImportMinOutput;
      assert.equal(firstParsed.mint, mint);
      assert.equal("created" in firstParsed, false);

      const second = await runImportMin(args, databaseUrl);
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as ImportMinOutput;

      assert.equal(secondParsed.mint, mint);
      assert.equal(secondParsed.rank, firstParsed.rank);
      assert.equal(secondParsed.score, firstParsed.score);
      assert.equal(secondParsed.hardRejected, firstParsed.hardRejected);
      assert.equal(secondParsed.hardRejectReason, firstParsed.hardRejectReason);
      assert.equal("created" in secondParsed, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        name: "Import Min Rerun",
        symbol: "IMR",
        source: "test-import-min-rerun",
        metadataStatus: "mint_only",
      });
    });
  });
});
