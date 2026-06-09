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

type MetricsGrowthReportOutput = {
  executionName: "metrics_growth_report";
  readOnly: boolean;
  providerFetchExecuted: boolean;
  dbWriteExecuted: boolean;
  telegramSendExecuted: boolean;
  rawJsonIncluded: boolean;
  summary: {
    tokenCountEvaluated: number;
    missingFirstFdvCount: number;
    missingMaxFdvCount: number;
    missingReserveCount: number;
    topFdvMultiple: number | null;
    topReserveMultiple: number | null;
  };
  buckets: {
    fdvMultipleGte1_1: number;
    fdvMultipleGte1_25: number;
    fdvMultipleGte1_5: number;
    fdvMultipleGte2: number;
    fdvMultipleGte3: number;
    fdvMultipleGte5: number;
    fdvMultipleGte10: number;
    fdvDown: number;
    fdvNearFlat: number;
    fdvNearFlatDefinition: string;
  };
  scoreSummary: {
    byScoreRank: Record<string, number>;
    byScoreRankTotal: Record<string, number>;
    maxFdvMultipleByScoreBucket: Record<string, number | null>;
    fdvMultipleGte2ByScoreBucket: Record<string, number>;
    hardRejectedFdvMultipleGte2Count: number;
  };
  topRows: Array<{
    tokenId: number;
    abbreviatedMint: string;
    metricCount: number;
    firstMetricId: number | null;
    firstFdvUsd: number | null;
    firstReserveUsd: number | null;
    maxFdvMetricId: number | null;
    maxFdvUsd: number | null;
    maxReserveUsd: number | null;
    latestMetricId: number | null;
    latestFdvUsd: number | null;
    latestReserveUsd: number | null;
    fdvMultiple: number | null;
    latestFdvMultiple: number | null;
    reserveMultiple: number | null;
    scoreRank: string;
    scoreTotal: number;
    hardRejected: boolean;
    metadataStatus: string;
    notificationCount: number;
    holderSnapshotCount: number;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metrics-growth-report-test-"));

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

async function runMetricsGrowthReport(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `metrics-growth-report-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `metrics-growth-report-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricsGrowthReport.ts",
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

async function seedGrowthReport(databaseUrl: string): Promise<{
  winnerId: number;
  nonPumpId: number;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const winner = await db.token.create({
      data: {
        mint: "9qKaQRTW1111111111111111111111111111BCpump",
        name: "Raw Winner Name Should Stay Hidden",
        symbol: "RAWX",
        normalizedText: "raw normalized text should stay hidden",
        source: "geckoterminal.new_pools",
        metadataStatus: "partial",
        scoreRank: "C",
        scoreTotal: 1,
      },
      select: {
        id: true,
      },
    });
    const b2 = await db.token.create({
      data: {
        mint: "Bbbbbbbb1111111111111111111111111111BBpump",
        source: "geckoterminal.new_pools",
        metadataStatus: "partial",
        scoreRank: "B",
        scoreTotal: 2,
      },
      select: {
        id: true,
      },
    });
    const missingFirst = await db.token.create({
      data: {
        mint: "Cccccccc1111111111111111111111111111CCpump",
        source: "geckoterminal.new_pools",
      },
      select: {
        id: true,
      },
    });
    const zeroFirst = await db.token.create({
      data: {
        mint: "Dddddddd1111111111111111111111111111DDpump",
        source: "geckoterminal.new_pools",
      },
      select: {
        id: true,
      },
    });
    const metricOne = await db.token.create({
      data: {
        mint: "Eeeeeeee1111111111111111111111111111EEpump",
        source: "geckoterminal.new_pools",
      },
      select: {
        id: true,
      },
    });
    const nonPump = await db.token.create({
      data: {
        mint: "Ffffffff1111111111111111111111111111FFnop",
        source: "geckoterminal.new_pools",
      },
      select: {
        id: true,
      },
    });

    await db.metric.createMany({
      data: [
        {
          tokenId: winner.id,
          observedAt: new Date("2026-06-01T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 100,
              totalReserveInUsd: 100,
            },
          },
        },
        {
          tokenId: winner.id,
          observedAt: new Date("2026-06-02T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 384.45,
              totalReserveInUsd: 370.64,
            },
          },
        },
        {
          tokenId: b2.id,
          observedAt: new Date("2026-06-01T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 100,
              totalReserveInUsd: 100,
            },
          },
        },
        {
          tokenId: b2.id,
          observedAt: new Date("2026-06-02T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 100.58,
              totalReserveInUsd: 100.38,
            },
          },
        },
        {
          tokenId: missingFirst.id,
          observedAt: new Date("2026-06-01T00:00:00.000Z"),
          rawJson: {
            token: {
              totalReserveInUsd: 10,
            },
          },
        },
        {
          tokenId: missingFirst.id,
          observedAt: new Date("2026-06-02T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 20,
              totalReserveInUsd: 20,
            },
          },
        },
        {
          tokenId: zeroFirst.id,
          observedAt: new Date("2026-06-01T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 0,
              totalReserveInUsd: 10,
            },
          },
        },
        {
          tokenId: zeroFirst.id,
          observedAt: new Date("2026-06-02T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 50,
              totalReserveInUsd: 20,
            },
          },
        },
        {
          tokenId: metricOne.id,
          observedAt: new Date("2026-06-01T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 777,
              totalReserveInUsd: 777,
            },
          },
        },
        {
          tokenId: nonPump.id,
          observedAt: new Date("2026-06-01T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 1,
              totalReserveInUsd: 1,
            },
          },
        },
        {
          tokenId: nonPump.id,
          observedAt: new Date("2026-06-02T00:00:00.000Z"),
          rawJson: {
            token: {
              fdvUsd: 10,
              totalReserveInUsd: 10,
            },
          },
        },
      ],
    });

    await db.notification.create({
      data: {
        notificationKey: "growth-report-test",
        eventType: "metric_appended",
        mint: "9qKaQRTW1111111111111111111111111111BCpump",
        tokenId: winner.id,
        trigger: "metric_appended",
        status: "captured",
        mode: "capture_only",
        messagePreview: "hidden",
        rawJsonFree: true,
        secretFree: true,
      },
    });

    await db.holderSnapshot.create({
      data: {
        tokenId: winner.id,
        source: "test",
        observedAt: new Date("2026-06-02T00:00:00.000Z"),
        bundlerSignal: "unknown",
        sameFundingOriginSignal: "unknown",
        confidence: "low",
        rawFree: true,
        secretFree: true,
      },
    });

    return {
      winnerId: winner.id,
      nonPumpId: nonPump.id,
    };
  } finally {
    await db.$disconnect();
  }
}

async function readCounts(databaseUrl: string): Promise<{
  tokenCount: number;
  metricCount: number;
  notificationCount: number;
  holderSnapshotCount: number;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const [tokenCount, metricCount, notificationCount, holderSnapshotCount] =
      await Promise.all([
        db.token.count(),
        db.metric.count(),
        db.notification.count(),
        db.holderSnapshot.count(),
      ]);

    return {
      tokenCount,
      metricCount,
      notificationCount,
      holderSnapshotCount,
    };
  } finally {
    await db.$disconnect();
  }
}

test("metricsGrowthReport boundary", async (t) => {
  await t.test("prints a safe read-only growth report with expected buckets", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "growth.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedGrowthReport(databaseUrl);
      const beforeCounts = await readCounts(databaseUrl);

      const result = await runMetricsGrowthReport(
        ["--pumpOnly", "--minMetricCount", "2", "--limit", "10"],
        databaseUrl,
      );
      assert.equal(result.ok, true);
      const afterCounts = await readCounts(databaseUrl);
      assert.deepEqual(afterCounts, beforeCounts);

      const parsed = JSON.parse(result.stdout) as MetricsGrowthReportOutput;
      assert.equal(parsed.executionName, "metrics_growth_report");
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.providerFetchExecuted, false);
      assert.equal(parsed.dbWriteExecuted, false);
      assert.equal(parsed.telegramSendExecuted, false);
      assert.equal(parsed.rawJsonIncluded, false);
      assert.equal(parsed.summary.tokenCountEvaluated, 4);
      assert.equal(parsed.summary.missingFirstFdvCount, 1);
      assert.equal(parsed.summary.missingMaxFdvCount, 0);
      assert.equal(parsed.summary.topFdvMultiple, 3.8445);
      assert.equal(parsed.summary.topReserveMultiple, 3.7064);
      assert.equal(parsed.buckets.fdvMultipleGte2, 1);
      assert.equal(parsed.buckets.fdvMultipleGte3, 1);
      assert.equal(parsed.buckets.fdvMultipleGte5, 0);
      assert.equal(parsed.buckets.fdvMultipleGte10, 0);
      assert.equal(parsed.buckets.fdvNearFlat, 1);
      assert.equal(
        parsed.buckets.fdvNearFlatDefinition,
        "0.99 <= latestFdvMultiple <= 1.01",
      );
      assert.equal(parsed.scoreSummary.byScoreRank.C, 3);
      assert.equal(parsed.scoreSummary.byScoreRankTotal["C/1"], 1);
      assert.equal(parsed.scoreSummary.fdvMultipleGte2ByScoreBucket["C/1"], 1);
      assert.equal(parsed.scoreSummary.hardRejectedFdvMultipleGte2Count, 0);

      const winner = parsed.topRows.find((row) => row.tokenId === seeded.winnerId);
      assert.ok(winner);
      assert.equal(winner.abbreviatedMint, "9qKaQRTW...BCpump");
      assert.equal(winner.metricCount, 2);
      assert.equal(winner.fdvMultiple, 3.8445);
      assert.equal(winner.latestFdvMultiple, 3.8445);
      assert.equal(winner.reserveMultiple, 3.7064);
      assert.equal(winner.scoreRank, "C");
      assert.equal(winner.scoreTotal, 1);
      assert.equal(winner.notificationCount, 1);
      assert.equal(winner.holderSnapshotCount, 1);

      const zeroFirst = parsed.topRows.find((row) => row.firstFdvUsd === 0);
      assert.ok(zeroFirst);
      assert.equal(zeroFirst.fdvMultiple, null);
      assert.equal(zeroFirst.latestFdvMultiple, null);

      assert.equal(result.stdout.includes("Raw Winner Name Should Stay Hidden"), false);
      assert.equal(result.stdout.includes("RAWX"), false);
      assert.equal(result.stdout.includes("raw normalized text should stay hidden"), false);
      assert.equal(result.stdout.includes("\"rawJson\""), false);
    });
  });

  await t.test("tokenId mode returns one safe row", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "token-id.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedGrowthReport(databaseUrl);

      const result = await runMetricsGrowthReport(
        ["--tokenId", String(seeded.winnerId)],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricsGrowthReportOutput;
      assert.equal(parsed.summary.tokenCountEvaluated, 1);
      assert.equal(parsed.topRows.length, 1);
      assert.equal(parsed.topRows[0]?.tokenId, seeded.winnerId);
      assert.equal(parsed.topRows[0]?.fdvMultiple, 3.8445);
      assert.equal(result.stdout.includes("Raw Winner Name Should Stay Hidden"), false);
      assert.equal(result.stdout.includes("RAWX"), false);
    });
  });

  await t.test("pumpOnly and minMetricCount filters narrow the evaluated rows", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "filters.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedGrowthReport(databaseUrl);

      const pumpResult = await runMetricsGrowthReport(
        ["--pumpOnly", "--minMetricCount", "2", "--limit", "10"],
        databaseUrl,
      );
      assert.equal(pumpResult.ok, true);
      const pumpParsed = JSON.parse(pumpResult.stdout) as MetricsGrowthReportOutput;
      assert.equal(
        pumpParsed.topRows.some((row) => row.tokenId === seeded.nonPumpId),
        false,
      );
      assert.equal(pumpParsed.summary.topFdvMultiple, 3.8445);

      const allResult = await runMetricsGrowthReport(
        ["--minMetricCount", "2", "--limit", "10"],
        databaseUrl,
      );
      assert.equal(allResult.ok, true);
      const allParsed = JSON.parse(allResult.stdout) as MetricsGrowthReportOutput;
      assert.equal(
        allParsed.topRows.some((row) => row.tokenId === seeded.nonPumpId),
        true,
      );
      assert.equal(allParsed.summary.topFdvMultiple, 10);

      const minOneResult = await runMetricsGrowthReport(
        ["--pumpOnly", "--minMetricCount", "1", "--sortBy", "metricCount", "--limit", "10"],
        databaseUrl,
      );
      assert.equal(minOneResult.ok, true);
      const minOneParsed = JSON.parse(minOneResult.stdout) as MetricsGrowthReportOutput;
      assert.equal(minOneParsed.summary.tokenCountEvaluated, 5);
      assert.equal(minOneParsed.topRows.some((row) => row.metricCount === 1), true);
    });
  });

  await t.test("limit applies after sorting", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "limit.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedGrowthReport(databaseUrl);

      const result = await runMetricsGrowthReport(
        ["--pumpOnly", "--minMetricCount", "2", "--limit", "1"],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricsGrowthReportOutput;
      assert.equal(parsed.topRows.length, 1);
      assert.equal(parsed.topRows[0]?.tokenId, seeded.winnerId);
    });
  });
});
