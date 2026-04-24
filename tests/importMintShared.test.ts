import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

type ImportMintInput = {
  mint: string;
  source?: string;
  firstSeenSourceSnapshot?: {
    source: string;
    detectedAt: string;
    poolCreatedAt?: string;
    poolAddress?: string;
    dexName?: string;
    baseTokenAddress?: string;
    quoteTokenAddress?: string;
  };
};

type ImportMintResult = {
  mint: string;
  metadataStatus: string;
  importedAt: string;
  created: boolean;
};

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

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-import-mint-shared-test-"));

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

async function runImportMintShared(
  input: ImportMintInput,
  databaseUrl: string,
): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-import-mint-shared-run-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          'node --import tsx --eval "$IMPORT_MINT_SHARED_SCRIPT" >"$STDOUT_FILE" 2>"$STDERR_FILE"',
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            IMPORT_MINT_SHARED_INPUT: JSON.stringify(input),
            IMPORT_MINT_SHARED_SCRIPT: [
              'const { importMint } = await import("./src/cli/importMintShared.ts");',
              'const input = JSON.parse(process.env.IMPORT_MINT_SHARED_INPUT ?? "{}");',
              "const result = await importMint(input);",
              "console.log(JSON.stringify(result));",
            ].join(" "),
            STDOUT_FILE: stdoutPath,
            STDERR_FILE: stderrPath,
          },
        },
      );

      return {
        ok: true,
        stdout: (await readFile(stdoutPath, "utf-8")).trim(),
        stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
      };
    } catch (error) {
      const output = error as {
        code?: number | null;
      };

      return {
        ok: false,
        stdout: (await readFile(stdoutPath, "utf-8").catch(() => "")).trim(),
        stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
        code: output.code ?? null,
      };
    }
  } finally {
    await rm(captureDir, { recursive: true, force: true });
  }
}

async function readToken(
  databaseUrl: string,
  mint: string,
): Promise<{
  mint: string;
  source: string | null;
  metadataStatus: string;
  importedAt: Date;
  entrySnapshot: unknown;
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
        importedAt: true,
        entrySnapshot: true,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
}

test("importMintShared contract", async (t) => {
  await t.test("creates a mint-only token with a stable entry snapshot subset", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "entry-snapshot.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);

      const result = await runImportMintShared(
        {
          mint,
          source: "geckoterminal.new_pools",
          firstSeenSourceSnapshot: {
            source: "geckoterminal.new_pools",
            detectedAt: "2026-04-24T01:02:03.000Z",
            poolCreatedAt: "2026-04-24T01:00:00.000Z",
            poolAddress: "pool-123",
            dexName: "Pump.fun",
          },
        },
        databaseUrl,
      );

      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const parsed = JSON.parse(result.stdout) as ImportMintResult;
      assert.equal(parsed.mint, mint);
      assert.equal(parsed.metadataStatus, "mint_only");
      assert.equal(parsed.created, true);
      assert.match(parsed.importedAt, /^\d{4}-\d{2}-\d{2}T/);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.mint, mint);
      assert.equal(token?.source, "geckoterminal.new_pools");
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.importedAt.toISOString(), parsed.importedAt);

      assertRecord(token?.entrySnapshot);
      assert.equal(token.entrySnapshot.stage, "mint_only");
      assert.equal(token.entrySnapshot.capturedAt, parsed.importedAt);
      assert.equal(token.entrySnapshot.name, null);
      assert.equal(token.entrySnapshot.symbol, null);
      assert.equal(token.entrySnapshot.description, null);

      const firstSeenSourceSnapshot = token.entrySnapshot.firstSeenSourceSnapshot;
      assertRecord(firstSeenSourceSnapshot);
      assert.equal(firstSeenSourceSnapshot.source, "geckoterminal.new_pools");
      assert.equal(firstSeenSourceSnapshot.detectedAt, "2026-04-24T01:02:03.000Z");
      assert.equal(firstSeenSourceSnapshot.poolAddress, "pool-123");
      assert.equal(firstSeenSourceSnapshot.dexName, "Pump.fun");
    });
  });

  await t.test("returns created false and preserves the original row on sequential re-import", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "idempotent.db")}`;
      const mint = "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW";

      await runDbPush(databaseUrl);

      const first = await runImportMintShared(
        {
          mint,
          source: "first-source",
        },
        databaseUrl,
      );
      assert.equal(first.ok, true);

      const firstParsed = JSON.parse(first.stdout) as ImportMintResult;
      assert.equal(firstParsed.created, true);

      const second = await runImportMintShared(
        {
          mint,
          source: "second-source",
        },
        databaseUrl,
      );
      assert.equal(second.ok, true);
      assert.equal(second.stderr, "");

      const secondParsed = JSON.parse(second.stdout) as ImportMintResult;
      assert.equal(secondParsed.mint, mint);
      assert.equal(secondParsed.metadataStatus, "mint_only");
      assert.equal(secondParsed.created, false);
      assert.equal(secondParsed.importedAt, firstParsed.importedAt);

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.source, "first-source");
      assert.equal(token?.metadataStatus, "mint_only");
      assert.equal(token?.importedAt.toISOString(), firstParsed.importedAt);
    });
  });

  await t.test("keeps firstSeenSourceSnapshot absent when the shared input does not provide one", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "variant.db")}`;
      const mint = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";

      await runDbPush(databaseUrl);

      const result = await runImportMintShared(
        {
          mint,
          source: "dexscreener-token-profiles-latest-v1",
        },
        databaseUrl,
      );

      assert.equal(result.ok, true);
      const parsed = JSON.parse(result.stdout) as ImportMintResult;
      assert.equal(parsed.created, true);
      assert.equal(parsed.metadataStatus, "mint_only");

      const token = await readToken(databaseUrl, mint);
      assert.equal(token?.source, "dexscreener-token-profiles-latest-v1");
      assert.equal(token?.metadataStatus, "mint_only");

      assertRecord(token?.entrySnapshot);
      assert.equal(token.entrySnapshot.stage, "mint_only");
      assert.equal("firstSeenSourceSnapshot" in token.entrySnapshot, false);
    });
  });
});
