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

type TokenCompareOutput = {
  mint: string;
  currentToken: {
    name: string | null;
    symbol: string | null;
    source: string | null;
    metadataStatus: string;
    scoreTotal: number;
    scoreRank: string;
  };
  metricsCount: number;
  hasMetrics: boolean;
  entryVsCurrentChanged: boolean;
  changedFields: string[];
  latestMetric: {
    id: number;
    source: string | null;
    observedAt: string;
    peakFdv24h: number | null;
    volume24h: number | null;
  } | null;
  recentMetrics: Array<{
    id: number;
    source: string | null;
    observedAt: string;
    peakFdv24h: number | null;
    volume24h: number | null;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-token-compare-test-"));

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

async function runTokenCompare(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `token-compare-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `token-compare-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokenCompare.ts",
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

async function seedTokenWithMetrics(
  databaseUrl: string,
  mint: string,
): Promise<{
  latestMetricId: number;
  olderMetricId: number;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const token = await db.token.create({
      data: {
        mint,
        name: "Token Compare Current",
        symbol: "TCMP",
        description: "token compare current description",
        source: "test-token-compare",
        metadataStatus: "enriched",
        scoreRank: "A",
        scoreTotal: 27,
        hardRejected: false,
        hardRejectReason: null,
        entrySnapshot: {
          name: "Token Compare Entry",
          symbol: "TCE",
          description: "token compare entry description",
          scoreTotal: 9,
          scoreRank: "C",
          hardRejected: true,
          hardRejectReason: "entry reject reason",
        },
      },
      select: {
        id: true,
      },
    });

    const olderMetric = await db.metric.create({
      data: {
        tokenId: token.id,
        source: "test-token-compare-older-metric",
        peakFdv24h: 120000,
        volume24h: 24000,
        observedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
      select: {
        id: true,
      },
    });

    const latestMetric = await db.metric.create({
      data: {
        tokenId: token.id,
        source: "test-token-compare-latest-metric",
        peakFdv24h: 180000,
        volume24h: 42000,
        observedAt: new Date("2026-04-21T00:00:00.000Z"),
      },
      select: {
        id: true,
      },
    });

    return {
      latestMetricId: latestMetric.id,
      olderMetricId: olderMetric.id,
    };
  } finally {
    await db.$disconnect();
  }
}

test("tokenCompare boundary", async (t) => {
  await t.test("shows one token compare view with stable top-level fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";

      await runDbPush(databaseUrl);
      const seeded = await seedTokenWithMetrics(databaseUrl, mint);

      const result = await runTokenCompare(
        ["--mint", mint],
        databaseUrl,
      );
      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const parsed = JSON.parse(result.stdout) as TokenCompareOutput;
      assert.equal(parsed.mint, mint);
      assert.equal(parsed.metricsCount, 2);
      assert.equal(parsed.hasMetrics, true);
      assert.equal(parsed.entryVsCurrentChanged, true);
      assert.deepEqual(parsed.changedFields, [
        "name",
        "symbol",
        "description",
        "scoreTotal",
        "scoreRank",
        "hardRejected",
        "hardRejectReason",
      ]);
      assert.equal(parsed.currentToken.name, "Token Compare Current");
      assert.equal(parsed.currentToken.symbol, "TCMP");
      assert.equal(parsed.currentToken.source, "test-token-compare");
      assert.equal(parsed.currentToken.metadataStatus, "enriched");
      assert.equal(parsed.currentToken.scoreTotal, 27);
      assert.equal(parsed.currentToken.scoreRank, "A");
      assert.equal(parsed.latestMetric?.id, seeded.latestMetricId);
      assert.equal(parsed.latestMetric?.source, "test-token-compare-latest-metric");
      assert.equal(parsed.latestMetric?.peakFdv24h, 180000);
      assert.equal(parsed.latestMetric?.volume24h, 42000);
      assert.match(parsed.latestMetric?.observedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.recentMetrics.length, 2);
      assert.equal(parsed.recentMetrics[0]?.id, seeded.latestMetricId);
      assert.equal(parsed.recentMetrics[0]?.source, "test-token-compare-latest-metric");
      assert.equal(parsed.recentMetrics[1]?.id, seeded.olderMetricId);
      assert.equal(parsed.recentMetrics[1]?.source, "test-token-compare-older-metric");
    });
  });

  await t.test("exits non-zero when mint is missing", async () => {
    const result = await runTokenCompare([]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Missing required arg: --mint/);
    assert.match(result.stdout, /pnpm token:compare -- --mint <MINT>/);
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runTokenCompare([
      "--mint",
      "So11111111111111111111111111111111111111112",
      "--id",
      "1",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /Unknown arg: --id/);
    assert.match(result.stdout, /pnpm token:compare -- --mint <MINT>/);
  });

  await t.test("exits non-zero when the token does not exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing.db")}`;

      await runDbPush(databaseUrl);

      const result = await runTokenCompare(
        ["--mint", "missing-token-mint"],
        databaseUrl,
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.match(result.stderr, /Token not found for mint: missing-token-mint/);
      assert.match(result.stdout, /pnpm token:compare -- --mint <MINT>/);
    });
  });
});
