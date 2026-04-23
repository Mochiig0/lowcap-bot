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

type TokenShowOutput = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  hasCurrentText: boolean;
  source: string | null;
  metadataStatus: string;
  groupKey: string | null;
  groupNote: string | null;
  normalizedText: string | null;
  hardRejected: boolean;
  hardRejectReason: string | null;
  scoreRank: string;
  scoreTotal: number;
  scoreBreakdown: unknown;
  reviewFlags: unknown;
  devWallet: string | null;
  metricsCount: number;
  latestMetric: {
    id: number;
    observedAt: string;
    source: string | null;
    maxMultiple15m: number | null;
    peakFdv24h: number | null;
    volume24h: number | null;
    peakFdv7d: number | null;
    volume7d: number | null;
  } | null;
  enrichedAt: string | null;
  rescoredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-token-show-test-"));

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

async function runTokenShow(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `token-show-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `token-show-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokenShow.ts",
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

async function seedTokenWithMetric(
  databaseUrl: string,
  mint: string,
): Promise<{
  metricId: number;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const dev = await db.dev.create({
      data: {
        wallet: "DevWallet444444444444444444444444444444444",
      },
      select: {
        id: true,
      },
    });

    const token = await db.token.create({
      data: {
        mint,
        name: "Token Show Token",
        symbol: "TSHOW",
        description: "token show description",
        source: "test-token-show",
        metadataStatus: "partial",
        scoreRank: "B",
        scoreTotal: 12,
        devId: dev.id,
      },
      select: {
        id: true,
      },
    });

    const metric = await db.metric.create({
      data: {
        tokenId: token.id,
        source: "test-token-show-metric",
        peakFdv24h: 180000,
        volume24h: 42000,
      },
      select: {
        id: true,
      },
    });

    return {
      metricId: metric.id,
    };
  } finally {
    await db.$disconnect();
  }
}

test("tokenShow boundary", async (t) => {
  await t.test("shows one token with stable top-level fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      const seeded = await seedTokenWithMetric(databaseUrl, mint);

      const result = await runTokenShow(
        ["--mint", mint],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokenShowOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(parsed.name, "Token Show Token");
      assert.equal(parsed.symbol, "TSHOW");
      assert.equal(parsed.description, "token show description");
      assert.equal(parsed.hasCurrentText, true);
      assert.equal(parsed.source, "test-token-show");
      assert.equal(parsed.metadataStatus, "partial");
      assert.equal(parsed.scoreRank, "B");
      assert.equal(parsed.scoreTotal, 12);
      assert.equal(parsed.hardRejected, false);
      assert.equal(parsed.hardRejectReason, null);
      assert.equal(parsed.devWallet, "DevWallet444444444444444444444444444444444");
      assert.equal(parsed.metricsCount, 1);
      assert.equal(parsed.reviewFlags, null);
      assert.equal(parsed.latestMetric?.id, seeded.metricId);
      assert.equal(parsed.latestMetric?.source, "test-token-show-metric");
      assert.equal(parsed.latestMetric?.peakFdv24h, 180000);
      assert.equal(parsed.latestMetric?.volume24h, 42000);
      assert.match(parsed.latestMetric?.observedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.enrichedAt, null);
      assert.equal(parsed.rescoredAt, null);
      assert.match(parsed.createdAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.match(parsed.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
    });
  });

  await t.test("exits non-zero when mint is missing", async () => {
    const result = await runTokenShow([]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --mint/);
    assert.match(result.stdout, /pnpm token:show -- --mint <MINT>/);
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runTokenShow([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--id",
      "1",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --id/);
    assert.match(result.stdout, /pnpm token:show -- --mint <MINT>/);
  });

  await t.test("exits non-zero when the token does not exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing.db")}`;

      await runDbPush(databaseUrl);

      const result = await runTokenShow(
        ["--mint", "missing-token-mint"],
        databaseUrl,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Token not found for mint: missing-token-mint/);
      assert.match(result.stdout, /pnpm token:show -- --mint <MINT>/);
    });
  });
});
