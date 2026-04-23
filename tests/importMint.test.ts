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

type ImportMintOutput = {
  mint: string;
  metadataStatus: string;
  importedAt: string;
  created: boolean;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-mint-test-"));

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

async function runImportMint(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `import-mint-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `import-mint-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/importMint.ts",
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
        source: true,
        metadataStatus: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("importMint boundary", async (t) => {
  await t.test("imports a mint-only token with required input", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);

      const result = await runImportMint(
        ["--mint", mint, "--source", "test-import-mint"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ImportMintOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(parsed.metadataStatus, "mint_only");
      assert.equal(parsed.created, true);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        source: "test-import-mint",
        metadataStatus: "mint_only",
      });
    });
  });

  await t.test("exits non-zero when mint is missing", async () => {
    const result = await runImportMint([]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --mint/);
    assert.match(result.stdout, /pnpm import:mint -- --mint <MINT> \[--source <SOURCE>\]/);
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runImportMint([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--name",
      "should-fail",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --name/);
    assert.match(result.stdout, /pnpm import:mint -- --mint <MINT> \[--source <SOURCE>\]/);
  });

  await t.test("keeps created false on sequential re-import of the same mint", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "rerun.db")}`;
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

      await runDbPush(databaseUrl);

      const first = await runImportMint(
        ["--mint", mint, "--source", "test-import-mint-rerun"],
        databaseUrl,
      );
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as ImportMintOutput;
      assert.equal(firstParsed.created, true);

      const second = await runImportMint(
        ["--mint", mint, "--source", "test-import-mint-rerun"],
        databaseUrl,
      );
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as ImportMintOutput;

      assert.equal(secondParsed.mint, mint);
      assert.equal(secondParsed.metadataStatus, "mint_only");
      assert.equal(secondParsed.created, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        source: "test-import-mint-rerun",
        metadataStatus: "mint_only",
      });
    });
  });
});
