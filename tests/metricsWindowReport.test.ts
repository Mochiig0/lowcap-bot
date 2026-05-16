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

type MetricsWindowReportOutput = {
  status: string;
  mode: string;
  readOnly: boolean;
  willWrite: boolean;
  willFetch: boolean;
  willSendTelegram: boolean;
  mint: string;
  entryAt: string | null;
  entryAtSource: string | null;
  reportGeneratedAt: string;
  evaluationAt: string;
  alertedAt: string | null;
  alertedAtSource: string | null;
  alertNotificationId: number | null;
  alertFdv: number | null;
  alertFdvObservedAt: string | null;
  alertFdvSource: string;
  alertFdvFreshnessSeconds: number | null;
  latestFdv: number | null;
  latestFdvObservedAt: string | null;
  latestFdvAgeSeconds: number | null;
  firstObservedFdv: number | null;
  firstObservedAt: string | null;
  minutesFromFirstObservedToAlert: number | null;
  metricCount: number;
  fdvMetricCount: number;
  windows: Record<string, {
    sampleCount: number;
    fdvSampleCount: number;
    peakFdv: number | null;
    peakObservedAt: string | null;
    firstObservedFdv: number | null;
    peakMultipleFromFirstObserved: number | null;
    windowMinutes: number;
    windowStartAt: string | null;
    windowEndAt: string | null;
    isWindowComplete: boolean;
    outcomeIsProvisional: boolean;
    fdvFirstObservedAt: string | null;
    fdvLastObservedAt: string | null;
    fdvObservedSpanMinutes: number | null;
    fdvSampleCoverageLabel: string;
    peakMultipleFromAlert: number | null;
    timeToPeakMinutes: number | null;
    drawdownFromPeak: number | null;
    outcomeLabel: string;
  }>;
  notes: string[];
};

type Counts = {
  token: number;
  metric: number;
  notification: number;
};

const FORBIDDEN_OUTPUT_TERMS = [
  "buySignal",
  "shouldBuy",
  "positionSize",
  "exit",
  "tradingRecommendation",
];

async function withTempDb<T>(
  fn: (ctx: { databaseUrl: string; client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metrics-window-report-"));
  const databaseUrl = `file:${join(dir, "metrics-window-report.db")}`;

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

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await fn({ databaseUrl, client });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

async function countRows(client: PrismaClient): Promise<Counts> {
  return {
    token: await client.token.count(),
    metric: await client.metric.count(),
    notification: await client.notification.count(),
  };
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

async function seedWindowReportRows(client: PrismaClient): Promise<{
  targetMint: string;
  fallbackMint: string;
  notificationMint: string;
  sentNotificationId: number;
  entryAt: Date;
}> {
  const entryAt = new Date("2020-05-16T00:00:00.000Z");
  const target = await client.token.create({
    data: {
      mint: "WindowReport111111111111111111111111111111111",
      name: "Window Report Token",
      symbol: "WRT",
      source: "test-window-report",
      importedAt: addMinutes(entryAt, 3),
      createdAt: addMinutes(entryAt, 4),
      entrySnapshot: {
        firstSeenSourceSnapshot: {
          detectedAt: entryAt.toISOString(),
          source: "test-window-report",
        },
      },
    },
  });

  const fallback = await client.token.create({
    data: {
      mint: "WindowFallback1111111111111111111111111111111",
      name: "Window Fallback Token",
      symbol: "WFB",
      source: "test-window-report",
      importedAt: entryAt,
      createdAt: addMinutes(entryAt, 1),
    },
  });
  const notificationToken = await client.token.create({
    data: {
      mint: "WindowNotification1111111111111111111111111111",
      name: "Window Notification Token",
      symbol: "WNT",
      source: "test-window-report",
      importedAt: addMinutes(entryAt, -20),
      createdAt: addMinutes(entryAt, -25),
      entrySnapshot: {
        firstSeenSourceSnapshot: {
          detectedAt: addMinutes(entryAt, -15).toISOString(),
          source: "test-window-report",
        },
      },
    },
  });

  await client.metric.createMany({
    data: [
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, -2),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: 9000,
          },
        },
      },
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, 5),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: 10000,
          },
        },
      },
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, 10),
        source: "test-window-report",
        rawJson: {
          token: {
            priceUsd: 0.01,
            fdvUsd: 0,
          },
        },
      },
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, 20),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: 80000,
          },
        },
      },
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, 45),
        source: "test-window-report",
        rawJson: {
          token: {
            fdv_usd: 50000,
          },
        },
      },
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, 120),
        source: "test-window-report",
        rawJson: {
          topPool: {
            fdvUsd: 60000,
          },
        },
      },
      {
        tokenId: target.id,
        observedAt: addMinutes(entryAt, 1500),
        source: "test-window-report",
        rawJson: {
          fdvUsd: 100000,
        },
      },
      {
        tokenId: fallback.id,
        observedAt: addMinutes(entryAt, 12),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: "12000",
          },
        },
      },
      {
        tokenId: notificationToken.id,
        observedAt: addMinutes(entryAt, 4),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: 5000,
          },
        },
      },
      {
        tokenId: notificationToken.id,
        observedAt: addMinutes(entryAt, 15),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: 20000,
          },
        },
      },
      {
        tokenId: notificationToken.id,
        observedAt: addMinutes(entryAt, 45),
        source: "test-window-report",
        rawJson: {
          token: {
            fdvUsd: 15000,
          },
        },
      },
    ],
  });
  await client.notification.create({
    data: {
      notificationKey: `${notificationToken.mint}:metric_appended:failed`,
      eventType: "metric_appended",
      mint: notificationToken.mint,
      tokenId: notificationToken.id,
      metricId: null,
      trigger: "metric_appended",
      status: "failed",
      mode: "live_send",
      messagePreview: "failed notification should not anchor outcome",
      failedAt: addMinutes(entryAt, 1),
      errorCode: "test_failed",
      reason: "test_failed",
      rawJsonFree: true,
      secretFree: true,
      source: "test-window-report",
    },
  });
  await client.notification.create({
    data: {
      notificationKey: `${notificationToken.mint}:metric_appended:captured`,
      eventType: "metric_appended",
      mint: notificationToken.mint,
      tokenId: notificationToken.id,
      metricId: null,
      trigger: "metric_appended",
      status: "captured",
      mode: "capture_only",
      messagePreview: "captured notification",
      capturedAt: addMinutes(entryAt, 2),
      rawJsonFree: true,
      secretFree: true,
      source: "test-window-report",
    },
  });
  const sentNotification = await client.notification.create({
    data: {
      notificationKey: `${notificationToken.mint}:metric_appended:sent`,
      eventType: "metric_appended",
      mint: notificationToken.mint,
      tokenId: notificationToken.id,
      metricId: null,
      trigger: "metric_appended",
      status: "sent",
      mode: "live_send",
      messagePreview: "sent notification",
      capturedAt: addMinutes(entryAt, 2),
      sentAt: addMinutes(entryAt, 5),
      rawJsonFree: true,
      secretFree: true,
      source: "test-window-report",
    },
  });

  return {
    targetMint: target.mint,
    fallbackMint: fallback.mint,
    notificationMint: notificationToken.mint,
    sentNotificationId: sentNotification.id,
    entryAt,
  };
}

async function runMetricsWindowReport(
  args: string[],
  databaseUrl: string,
): Promise<CommandResult> {
  const captureDir = await mkdtemp(join(tmpdir(), "lowcap-metrics-window-cli-"));
  const stdoutPath = join(captureDir, "stdout.log");
  const stderrPath = join(captureDir, "stderr.log");

  try {
    try {
      await execFileAsync(
        "bash",
        [
          "-lc",
          'node --import tsx src/cli/metricsWindowReport.ts "$@" >"$STDOUT_FILE" 2>"$STDERR_FILE"',
          "bash",
          ...args,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            STDOUT_FILE: stdoutPath,
            STDERR_FILE: stderrPath,
          },
        },
      );

      return {
        ok: true,
        stdout: (await readFile(stdoutPath, "utf-8")).trim(),
        stderr: (await readFile(stderrPath, "utf-8")).trim(),
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

function assertNoForbiddenOutputTerms(output: unknown): void {
  const serialized = JSON.stringify(output);
  for (const term of FORBIDDEN_OUTPUT_TERMS) {
    assert.doesNotMatch(serialized, new RegExp(term, "i"));
  }
}

test("metrics window report boundary", async (t) => {
  await t.test("computes observed FDV peaks by window without changing DB rows", async () => {
    await withTempDb(async ({ databaseUrl, client }) => {
      const seeded = await seedWindowReportRows(client);
      const before = await countRows(client);

      const result = await runMetricsWindowReport([
        "--mint",
        seeded.targetMint,
      ], databaseUrl);

      assert.equal(result.ok, true);
      assert.equal(result.stderr, "");

      const output = JSON.parse(result.stdout) as MetricsWindowReportOutput;
      assert.equal(output.status, "ok");
      assert.equal(output.mode, "read_only_metric_window_report");
      assert.equal(output.readOnly, true);
      assert.equal(output.willWrite, false);
      assert.equal(output.willFetch, false);
      assert.equal(output.willSendTelegram, false);
      assert.equal(output.mint, seeded.targetMint);
      assert.equal(output.entryAt, seeded.entryAt.toISOString());
      assert.equal(output.entryAtSource, "firstSeenSourceSnapshot.detectedAt");
      assert.equal(output.alertedAt, seeded.entryAt.toISOString());
      assert.equal(output.alertedAtSource, "first_seen_detected_at");
      assert.equal(output.alertNotificationId, null);
      assert.equal(new Date(output.reportGeneratedAt).toString() === "Invalid Date", false);
      assert.equal(output.evaluationAt, output.reportGeneratedAt);
      assert.equal(output.metricCount, 7);
      assert.equal(output.fdvMetricCount, 6);
      assert.equal(output.alertFdv, 9000);
      assert.equal(output.alertFdvObservedAt, addMinutes(seeded.entryAt, -2).toISOString());
      assert.equal(output.alertFdvSource, "metric_before_alert");
      assert.equal(output.alertFdvFreshnessSeconds, 120);
      assert.equal(output.firstObservedFdv, 9000);
      assert.equal(output.firstObservedAt, addMinutes(seeded.entryAt, -2).toISOString());
      assert.equal(output.minutesFromFirstObservedToAlert, 2);
      assert.equal(output.latestFdv, 100000);
      assert.equal(output.latestFdvObservedAt, addMinutes(seeded.entryAt, 1500).toISOString());
      assert.equal(output.windows["30m"]?.windowMinutes, 30);
      assert.equal(output.windows["30m"]?.windowStartAt, seeded.entryAt.toISOString());
      assert.equal(output.windows["30m"]?.windowEndAt, addMinutes(seeded.entryAt, 30).toISOString());
      assert.equal(output.windows["30m"]?.sampleCount, 3);
      assert.equal(output.windows["30m"]?.fdvSampleCount, 2);
      assert.equal(output.windows["30m"]?.peakFdv, 80000);
      assert.equal(output.windows["30m"]?.peakObservedAt, addMinutes(seeded.entryAt, 20).toISOString());
      assert.equal(output.windows["30m"]?.firstObservedFdv, 10000);
      assert.equal(output.windows["30m"]?.peakMultipleFromFirstObserved, 8);
      assert.equal(output.windows["30m"]?.fdvFirstObservedAt, addMinutes(seeded.entryAt, 5).toISOString());
      assert.equal(output.windows["30m"]?.fdvLastObservedAt, addMinutes(seeded.entryAt, 20).toISOString());
      assert.equal(output.windows["30m"]?.fdvObservedSpanMinutes, 15);
      assert.equal(output.windows["30m"]?.fdvSampleCoverageLabel, "partial");
      assert.equal(output.windows["30m"]?.peakMultipleFromAlert, 80000 / 9000);
      assert.equal(output.windows["30m"]?.timeToPeakMinutes, 20);
      assert.equal(output.windows["30m"]?.drawdownFromPeak, 0);
      assert.equal(output.windows["30m"]?.outcomeLabel, "hit");
      assert.equal(output.windows["60m"]?.sampleCount, 4);
      assert.equal(output.windows["60m"]?.fdvSampleCount, 3);
      assert.equal(output.windows["60m"]?.peakFdv, 80000);
      assert.equal(output.windows["90m"]?.fdvSampleCoverageLabel, "partial");
      assert.equal(output.windows["2h"]?.windowMinutes, 120);
      assert.equal(output.windows["3h"]?.windowMinutes, 180);
      assert.equal(output.windows["4h"]?.windowMinutes, 240);
      assert.equal(output.windows["5h"]?.windowMinutes, 300);
      assert.equal(output.windows["6h"]?.windowMinutes, 360);
      assert.equal(output.windows["8h"]?.windowMinutes, 480);
      assert.equal(output.windows["10h"]?.windowMinutes, 600);
      assert.equal(output.windows["12h"]?.windowMinutes, 720);
      assert.equal(output.windows["24h"]?.sampleCount, 5);
      assert.equal(output.windows["24h"]?.fdvSampleCount, 4);
      assert.equal(output.windows["24h"]?.peakFdv, 80000);
      assert.match(
        output.notes.join(" "),
        /not a single 24h-later snapshot/,
      );
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("priceUsd"), false);
      assertNoForbiddenOutputTerms(output);

      const after = await countRows(client);
      assert.deepEqual(after, before);
    });
  });

  await t.test("uses explicit entryAt when provided", async () => {
    await withTempDb(async ({ databaseUrl, client }) => {
      const seeded = await seedWindowReportRows(client);

      const result = await runMetricsWindowReport([
        "--mint",
        seeded.targetMint,
        "--entryAt",
        addMinutes(seeded.entryAt, 30).toISOString(),
        "--windows",
        "30,60,1440",
      ], databaseUrl);

      assert.equal(result.ok, true);

      const output = JSON.parse(result.stdout) as MetricsWindowReportOutput;
      assert.equal(output.entryAtSource, "cli");
      assert.equal(output.alertedAtSource, "cli_entryAt");
      assert.equal(output.entryAt, addMinutes(seeded.entryAt, 30).toISOString());
      assert.equal(output.alertedAt, addMinutes(seeded.entryAt, 30).toISOString());
      assert.equal(output.windows["30m"]?.sampleCount, 1);
      assert.equal(output.windows["30m"]?.fdvSampleCount, 1);
      assert.equal(output.windows["30m"]?.peakFdv, 50000);
      assertNoForbiddenOutputTerms(output);
    });
  });

  await t.test("falls back to importedAt when no first-seen snapshot exists", async () => {
    await withTempDb(async ({ databaseUrl, client }) => {
      const seeded = await seedWindowReportRows(client);

      const result = await runMetricsWindowReport([
        "--mint",
        seeded.fallbackMint,
      ], databaseUrl);

      assert.equal(result.ok, true);

      const output = JSON.parse(result.stdout) as MetricsWindowReportOutput;
      assert.equal(output.entryAtSource, "importedAt");
      assert.equal(output.alertedAtSource, "token_imported_at");
      assert.equal(output.windows["30m"]?.sampleCount, 1);
      assert.equal(output.windows["30m"]?.fdvSampleCount, 1);
      assert.equal(output.windows["30m"]?.peakFdv, 12000);
      assertNoForbiddenOutputTerms(output);
    });
  });

  await t.test("prefers sent notification timestamps over captured and failed rows", async () => {
    await withTempDb(async ({ databaseUrl, client }) => {
      const seeded = await seedWindowReportRows(client);

      const result = await runMetricsWindowReport([
        "--mint",
        seeded.notificationMint,
        "--windows",
        "30,60,1440",
      ], databaseUrl);

      assert.equal(result.ok, true);

      const output = JSON.parse(result.stdout) as MetricsWindowReportOutput;
      assert.equal(output.alertedAt, addMinutes(seeded.entryAt, 5).toISOString());
      assert.equal(output.entryAtSource, "notification.sentAt");
      assert.equal(output.alertedAtSource, "notification_sent_at");
      assert.equal(output.alertNotificationId, seeded.sentNotificationId);
      assert.equal(output.alertFdv, 5000);
      assert.equal(output.alertFdvSource, "metric_before_alert");
      assert.equal(output.windows["30m"]?.peakFdv, 20000);
      assert.equal(output.windows["30m"]?.peakMultipleFromAlert, 4);
      assert.equal(output.windows["30m"]?.outcomeLabel, "hit");
      assert.equal(output.windows["60m"]?.fdvSampleCoverageLabel, "partial");
      assertNoForbiddenOutputTerms(output);
    });
  });
});
