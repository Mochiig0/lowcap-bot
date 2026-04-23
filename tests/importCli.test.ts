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

type ImportCliOutput = {
  mint: string;
  rank: string;
  score: number;
  hardRejected: boolean;
  hardRejectReason: string | null;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-cli-test-"));

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

async function runImportCli(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `import-cli-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `import-cli-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/import.ts",
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
  description: string | null;
  source: string | null;
  groupKey: string | null;
  groupNote: string | null;
  scoreTotal: number;
  scoreRank: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
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
        groupKey: true,
        groupNote: true,
        scoreTotal: true,
        scoreRank: true,
        hardRejected: true,
        hardRejectReason: true,
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

test("import CLI boundary", async (t) => {
  await t.test("imports a token with the actual required args", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";
      const devWallet = "DevWallet333333333333333333333333333333333";

      await runDbPush(databaseUrl);

      const result = await runImportCli(
        [
          "--mint",
          mint,
          "--name",
          "Import CLI Test",
          "--symbol",
          "ICLI",
          "--desc",
          "cli boundary description",
          "--source",
          "test-import-cli",
          "--groupKey",
          "test-group",
          "--groupNote",
          "test-group-note",
          "--dev",
          devWallet,
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ImportCliOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(typeof parsed.rank, "string");
      assert.equal(typeof parsed.score, "number");
      assert.equal(typeof parsed.hardRejected, "boolean");
      assert.equal(
        parsed.hardRejectReason === null || typeof parsed.hardRejectReason === "string",
        true,
      );
      assert.equal("created" in parsed, false);
      assert.equal("existingCount" in parsed, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        name: "Import CLI Test",
        symbol: "ICLI",
        description: "cli boundary description",
        source: "test-import-cli",
        groupKey: "test-group",
        groupNote: "test-group-note",
        scoreTotal: parsed.score,
        scoreRank: parsed.rank,
        hardRejected: parsed.hardRejected,
        hardRejectReason: parsed.hardRejectReason,
        metadataStatus: "mint_only",
        dev: {
          wallet: devWallet,
        },
      });
    });
  });

  await t.test("exits non-zero when a required arg is missing", async () => {
    const result = await runImportCli([
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
      /pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM>/,
    );
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runImportCli([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--name",
      "Import CLI Test",
      "--symbol",
      "ICLI",
      "--file",
      "should-fail",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --file/);
    assert.match(
      result.stdout,
      /pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM>/,
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
        "Import CLI Rerun",
        "--symbol",
        "ICR",
        "--desc",
        "rerun cli description",
        "--source",
        "test-import-cli-rerun",
        "--groupKey",
        "rerun-group",
        "--groupNote",
        "rerun-group-note",
      ];

      await runDbPush(databaseUrl);

      const first = await runImportCli(args, databaseUrl);
      assert.equal(first.ok, true);
      const firstParsed = JSON.parse(first.stdout) as ImportCliOutput;
      assert.equal(firstParsed.mint, mint);
      assert.equal("created" in firstParsed, false);

      const second = await runImportCli(args, databaseUrl);
      assert.equal(second.ok, true);
      const secondParsed = JSON.parse(second.stdout) as ImportCliOutput;

      assert.equal(secondParsed.mint, mint);
      assert.equal(secondParsed.rank, firstParsed.rank);
      assert.equal(secondParsed.score, firstParsed.score);
      assert.equal(secondParsed.hardRejected, firstParsed.hardRejected);
      assert.equal(secondParsed.hardRejectReason, firstParsed.hardRejectReason);
      assert.equal("created" in secondParsed, false);
      assert.equal("items" in secondParsed, false);

      const token = await readToken(databaseUrl, mint);
      assert.deepEqual(token, {
        mint,
        name: "Import CLI Rerun",
        symbol: "ICR",
        description: "rerun cli description",
        source: "test-import-cli-rerun",
        groupKey: "rerun-group",
        groupNote: "rerun-group-note",
        scoreTotal: secondParsed.score,
        scoreRank: secondParsed.rank,
        hardRejected: secondParsed.hardRejected,
        hardRejectReason: secondParsed.hardRejectReason,
        metadataStatus: "mint_only",
        dev: null,
      });
    });
  });
});
