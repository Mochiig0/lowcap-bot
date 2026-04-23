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

type TokenRescoreOutput = {
  mint: string;
  normalizedText: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
  scoreTotal: number;
  scoreRank: string;
  scoreBreakdown: unknown;
  rescoredAt: string;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-token-rescore-test-"));

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

async function runTokenRescore(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `token-rescore-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `token-rescore-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokenRescore.ts",
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

async function seedToken(
  databaseUrl: string,
  data: {
    mint: string;
    name?: string;
    symbol?: string;
    description?: string;
  },
): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await db.token.create({
      data,
    });
  } finally {
    await db.$disconnect();
  }
}

async function readToken(
  databaseUrl: string,
  mint: string,
): Promise<{
  mint: string;
  normalizedText: string | null;
  hardRejected: boolean;
  hardRejectReason: string | null;
  scoreTotal: number;
  scoreRank: string;
  scoreBreakdown: unknown;
  rescoredAt: Date | null;
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
        normalizedText: true,
        hardRejected: true,
        hardRejectReason: true,
        scoreTotal: true,
        scoreRank: true,
        scoreBreakdown: true,
        rescoredAt: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("tokenRescore boundary", async (t) => {
  await t.test("rescoring one token returns stable top-level score fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        name: "Token Rescore Test",
        symbol: "TRSC",
        description: "token rescore description",
      });

      const result = await runTokenRescore(["--mint", mint], databaseUrl);
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokenRescoreOutput;
      assert.equal(parsed.mint, mint);
      assert.match(parsed.normalizedText, /token rescore test/);
      assert.equal(typeof parsed.hardRejected, "boolean");
      assert.equal(
        parsed.hardRejectReason === null || typeof parsed.hardRejectReason === "string",
        true,
      );
      assert.equal(typeof parsed.scoreTotal, "number");
      assert.equal(typeof parsed.scoreRank, "string");
      assert.equal(typeof parsed.scoreBreakdown, "object");
      assert.notEqual(parsed.scoreBreakdown, null);
      assert.match(parsed.rescoredAt, /^\d{4}-\d{2}-\d{2}T/);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.mint, mint);
      assert.equal(token?.normalizedText, parsed.normalizedText);
      assert.equal(token?.hardRejected, parsed.hardRejected);
      assert.equal(token?.hardRejectReason, parsed.hardRejectReason);
      assert.equal(token?.scoreTotal, parsed.scoreTotal);
      assert.equal(token?.scoreRank, parsed.scoreRank);
      assert.deepEqual(token?.scoreBreakdown, parsed.scoreBreakdown);
      assert.notEqual(token?.rescoredAt, null);
    });
  });

  await t.test("exits non-zero when mint is missing", async () => {
    const result = await runTokenRescore([]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --mint/);
    assert.match(result.stdout, /pnpm token:rescore -- --mint <MINT>/);
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runTokenRescore([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--name",
      "should-fail",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --name/);
    assert.match(result.stdout, /pnpm token:rescore -- --mint <MINT>/);
  });

  await t.test("exits non-zero when the token is not ready for rescore", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "not-ready.db")}`;
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, { mint });

      const result = await runTokenRescore(["--mint", mint], databaseUrl);

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(
        result.stderr,
        /Token is not ready for rescore: name and symbol are required for mint/,
      );
      assert.match(result.stdout, /pnpm token:rescore -- --mint <MINT>/);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.normalizedText, null);
      assert.equal(token?.hardRejected, false);
      assert.equal(token?.hardRejectReason, null);
      assert.equal(token?.scoreTotal, 0);
      assert.equal(token?.scoreRank, "C");
      assert.equal(token?.scoreBreakdown, null);
      assert.equal(token?.rescoredAt, null);
    });
  });
});
