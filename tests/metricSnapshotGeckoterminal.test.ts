import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import { isRehearsalNotificationKey } from "../src/notifications/rehearsalNotificationGuard.js";

const execFileAsync = promisify(execFile);

const GECKO_ORIGIN_SOURCE = "geckoterminal.new_pools";
const METRIC_SOURCE = "geckoterminal.token_snapshot";

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

type ProviderErrorCategory =
  | "network_fetch_error"
  | "timeout"
  | "http_429"
  | "http_error"
  | "parse_error"
  | "shape_error"
  | "provider_empty"
  | "unknown";

type MetricSnapshotGeckoterminalOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  metricSource: string;
  originSource: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    prioritizeRichPending: boolean;
    onlyMetricPending: boolean;
    onlyMetricOnce: boolean;
    selectedCount: number;
    skippedNonPumpCount: number;
    selectedSummary: {
      mintOnlyCount: number;
      nonMintOnlyCount: number;
      withReviewFlagsJsonCount: number;
      withReviewFlagsCount: number;
    };
    selectedMetricCountDistribution: {
      zero: number;
      one: number;
      twoPlus: number;
    };
    latestMetricAgeMinutes: {
      min: number | null;
      max: number | null;
    };
  };
  summary: {
    selectedCount: number;
    okCount: number;
    skippedCount: number;
    errorCount: number;
    writtenCount: number;
    interItemDelayMs: number;
    interItemDelayCount: number;
    providerErrorCount: number;
    errorCategoryCounts: Record<ProviderErrorCategory, number>;
    networkFetchErrorCount: number;
    timeoutCount: number;
    http429Count: number;
    httpErrorCount: number;
    parseErrorCount: number;
    shapeErrorCount: number;
    providerEmptyCount: number;
    unknownErrorCount: number;
    firstErrorCategory: ProviderErrorCategory | null;
    firstHttpStatus: number | null;
  };
  items: Array<{
    token: {
      id: number;
      mint: string;
      currentSource: string | null;
      originSource: string | null;
      selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
      isGeckoterminalOrigin: boolean;
      metadataStatus: string;
      metricsCount: number;
      notificationCount: number;
      holderSnapshotCount: number;
      latestMetricId: number | null;
      latestMetricObservedAt: string | null;
    };
    metricSource: string;
    status: "ok" | "error" | "skipped_recent_metric" | "selection_preview";
    metricCandidate?: {
      observedAt: string;
      source: string;
      volume24h: number | null;
      safeSummary: {
        priceUsdPresent: boolean;
        fdvUsdPresent: boolean;
        reserveUsdPresent: boolean;
        topPoolPresent: boolean;
      };
    };
    writeSummary: {
      dryRun: boolean;
      wouldCreateMetric: boolean;
      metricId: number | null;
      notificationCaptureEnabled: boolean;
      notificationCreated: boolean;
      notificationId: number | null;
      notificationSkippedReason:
        | "disabled_by_option"
        | "dry_run"
        | "metric_not_created"
        | "not_single_mint_mode"
        | null;
    };
    latestObservedAt?: string;
    minGapMinutes?: number;
    error?: string;
    errorCategory?: ProviderErrorCategory;
    httpStatus?: number | null;
    httpStatusText?: string | null;
    retryable?: boolean;
  }>;
};

type MetricSnapshotGeckoterminalWatchOutput = Omit<
  MetricSnapshotGeckoterminalOutput,
  "selection" | "summary"
> & {
  watchEnabled: boolean;
  cycleCount: number;
  failedCount: number;
  selectedCount: number;
  okCount: number;
  skippedCount: number;
  errorCount: number;
  writtenCount: number;
  providerErrorCount: number;
  errorCategoryCounts: Record<ProviderErrorCategory, number>;
  http429Count: number;
  firstErrorCategory: ProviderErrorCategory | null;
  firstHttpStatus: number | null;
  rateLimited: boolean;
  rateLimitedCount: number;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  cycles: Array<{
    cycle: number;
    failed: boolean;
    summary: MetricSnapshotGeckoterminalOutput["summary"] & {
      rateLimited: boolean;
      rateLimitedCount: number;
      abortedDueToRateLimit: boolean;
      skippedAfterRateLimit: number;
    };
    items: MetricSnapshotGeckoterminalOutput["items"];
  }>;
};

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metric-snapshot-gecko-test-"));

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

async function runMetricSnapshotGeckoterminal(
  args: string[],
  options?: {
    databaseUrl?: string;
    geckoSnapshotFile?: string;
    geckoSnapshotErrorOnce?: string;
  },
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `metric-snapshot-gecko-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `metric-snapshot-gecko-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricSnapshotGeckoterminal.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(options?.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}),
          ...(options?.geckoSnapshotFile
            ? { GECKOTERMINAL_TOKEN_SNAPSHOT_FILE: options.geckoSnapshotFile }
            : {}),
          ...(options?.geckoSnapshotErrorOnce
            ? { GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE: options.geckoSnapshotErrorOnce }
            : {}),
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

async function seedToken(databaseUrl: string, mint: string): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await db.token.create({
      data: {
        mint,
        source: GECKO_ORIGIN_SOURCE,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function seedMetricSelectionToken(
  databaseUrl: string,
  input: {
    mint: string;
    createdAt: Date;
    metadataStatus: "mint_only" | "partial" | "enriched";
    reviewFlagsJson?: Record<string, unknown>;
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
      data: {
        mint: input.mint,
        source: GECKO_ORIGIN_SOURCE,
        createdAt: input.createdAt,
        importedAt: input.createdAt,
        metadataStatus: input.metadataStatus,
        ...(input.metadataStatus !== "mint_only"
          ? {
              name: `${input.mint}-name`,
              symbol: `${input.mint.slice(0, 4)}S`,
              enrichedAt: input.createdAt,
            }
          : {}),
        ...(input.reviewFlagsJson ? { reviewFlagsJson: input.reviewFlagsJson } : {}),
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function writeSnapshotFixture(filePath: string, mint: string): Promise<void> {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Metric Snapshot Token",
            symbol: "MST",
            price_usd: "0.123",
            fdv_usd: "25000",
            total_reserve_in_usd: "1500",
            volume_usd: {
              h24: "1234",
            },
          },
          relationships: {
            top_pools: {
              data: [
                {
                  id: "solana_metric_snapshot_pool",
                  type: "pool",
                },
              ],
            },
          },
        },
        included: [
          {
            id: "solana_metric_snapshot_pool",
            type: "pool",
            attributes: {
              address: "metric_snapshot_pool",
              token_price_usd: "0.123",
              fdv_usd: "25000",
              reserve_in_usd: "1500",
              volume_usd: {
                h24: "321",
              },
            },
            relationships: {
              base_token: {
                data: {
                  id: `solana_${mint}`,
                  type: "token",
                },
              },
              quote_token: {
                data: {
                  id: "solana_So11111111111111111111111111111111111111112",
                  type: "token",
                },
              },
              dex: {
                data: {
                  id: "pumpswap",
                  type: "dex",
                },
              },
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function writeRawSnapshotFixture(filePath: string, content: string): Promise<void> {
  await writeFile(filePath, content, "utf8");
}

async function seedRecentMetric(
  databaseUrl: string,
  input: {
    mint: string;
    observedAt: Date;
    source?: string;
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
    const token = await db.token.findUniqueOrThrow({
      where: {
        mint: input.mint,
      },
      select: {
        id: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: token.id,
        observedAt: input.observedAt,
        source: input.source ?? METRIC_SOURCE,
        volume24h: 999,
        rawJson: {
          seeded: true,
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function readMetrics(
  databaseUrl: string,
  mint: string,
): Promise<
  Array<{
    id: number;
    source: string | null;
    volume24h: number | null;
  }>
> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.metric.findMany({
      where: {
        token: {
          mint,
        },
      },
      select: {
        id: true,
        source: true,
        volume24h: true,
      },
      orderBy: {
        id: "asc",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function readNotifications(
  databaseUrl: string,
  mint: string,
): Promise<
  Array<{
    id: number;
    notificationKey: string;
    eventType: string;
    mint: string;
    tokenId: number | null;
    metricId: number | null;
    trigger: string;
    status: string;
    mode: string;
    messagePreview: string;
    rawJsonFree: boolean;
    secretFree: boolean;
    source: string | null;
  }>
> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.notification.findMany({
      where: {
        mint,
      },
      select: {
        id: true,
        notificationKey: true,
        eventType: true,
        mint: true,
        tokenId: true,
        metricId: true,
        trigger: true,
        status: true,
        mode: true,
        messagePreview: true,
        rawJsonFree: true,
        secretFree: true,
        source: true,
      },
      orderBy: {
        id: "asc",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function readMetricRawJson(databaseUrl: string, mint: string): Promise<unknown> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const metric = await db.metric.findFirst({
      where: {
        token: {
          mint,
        },
      },
      select: {
        rawJson: true,
      },
      orderBy: {
        id: "asc",
      },
    });

    return metric?.rawJson ?? null;
  } finally {
    await db.$disconnect();
  }
}

test("metricSnapshotGeckoterminal boundary", async (t) => {
  await t.test("supports a deterministic single dry-run through snapshot fixture override", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);

      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "single");
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.metricSource, METRIC_SOURCE);
      assert.equal(parsed.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.selection.mint, mint);
      assert.equal(parsed.selection.limit, null);
      assert.equal(parsed.selection.sinceMinutes, null);
      assert.equal(parsed.selection.sinceCutoff, null);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.prioritizeRichPending, false);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.deepEqual(parsed.selection.selectedSummary, {
        mintOnlyCount: 1,
        nonMintOnlyCount: 0,
        withReviewFlagsJsonCount: 0,
        withReviewFlagsCount: 0,
      });
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.skippedCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.equal(parsed.summary.interItemDelayMs, 0);
      assert.equal(parsed.summary.interItemDelayCount, 0);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.token.mint, mint);
      assert.equal(parsed.items[0]?.token.currentSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.items[0]?.token.selectionAnchorKind, "createdAt");
      assert.equal(parsed.items[0]?.token.isGeckoterminalOrigin, true);
      assert.equal(parsed.items[0]?.metricSource, METRIC_SOURCE);
      assert.equal(parsed.items[0]?.status, "ok");
      assert.equal(parsed.items[0]?.metricCandidate?.source, METRIC_SOURCE);
      assert.equal(parsed.items[0]?.metricCandidate?.volume24h, 1234);
      assert.deepEqual(parsed.items[0]?.metricCandidate?.safeSummary, {
        priceUsdPresent: true,
        fdvUsdPresent: true,
        reserveUsdPresent: true,
        topPoolPresent: true,
      });
      assert.match(parsed.items[0]?.metricCandidate?.observedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
      assert.equal(parsed.items[0]?.writeSummary.wouldCreateMetric, true);
      assert.equal(parsed.items[0]?.writeSummary.metricId, null);
      assert.equal(parsed.items[0]?.writeSummary.notificationCaptureEnabled, true);
      assert.equal(parsed.items[0]?.writeSummary.notificationCreated, false);
      assert.equal(parsed.items[0]?.writeSummary.notificationId, null);
      assert.equal(parsed.items[0]?.writeSummary.notificationSkippedReason, "dry_run");
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("Metric Snapshot Token"), false);
      assert.equal(result.stdout.includes("metric_snapshot_pool"), false);

      const metrics = await readMetrics(databaseUrl, mint);
      assert.deepEqual(metrics, []);
    });
  });

  await t.test("keeps write output rawJson-free while preserving saved rawJson", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "write-output.db")}`;
      const mint = "MetricSnapshotWrite1111111111111111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-write-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint, "--write"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.dryRun, false);
      assert.equal(parsed.writeEnabled, true);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 1);
      assert.equal(parsed.items[0]?.metricCandidate?.volume24h, 1234);
      assert.deepEqual(parsed.items[0]?.metricCandidate?.safeSummary, {
        priceUsdPresent: true,
        fdvUsdPresent: true,
        reserveUsdPresent: true,
        topPoolPresent: true,
      });
      const metricId = parsed.items[0]?.writeSummary.metricId;
      assert.equal(typeof metricId, "number");
      assert.equal(parsed.items[0]?.writeSummary.notificationCaptureEnabled, true);
      assert.equal(parsed.items[0]?.writeSummary.notificationCreated, true);
      assert.equal(parsed.items[0]?.writeSummary.notificationSkippedReason, null);
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("Metric Snapshot Token"), false);
      assert.equal(result.stdout.includes("metric_snapshot_pool"), false);

      const notifications = await readNotifications(databaseUrl, mint);
      assert.equal(notifications.length, 1);
      assert.equal(parsed.items[0]?.writeSummary.notificationId, notifications[0]?.id);
      assert.equal(
        notifications[0]?.notificationKey,
        `${mint}:metric_appended:${metricId}`,
      );
      assert.equal(notifications[0]?.eventType, "metric_appended");
      assert.equal(notifications[0]?.mint, mint);
      assert.equal(notifications[0]?.tokenId, 1);
      assert.equal(notifications[0]?.metricId, metricId);
      assert.equal(notifications[0]?.trigger, "metric_appended");
      assert.equal(notifications[0]?.status, "captured");
      assert.equal(notifications[0]?.mode, "capture_only");
      assert.equal(notifications[0]?.rawJsonFree, true);
      assert.equal(notifications[0]?.secretFree, true);
      assert.equal(notifications[0]?.source, "metric:snapshot:geckoterminal");
      assert.equal(
        notifications[0]?.messagePreview,
        [
          "eventType=metric_appended",
          `mint=${mint}`,
          `metricId=${metricId}`,
          "source=geckoterminal.token_snapshot",
          "status=captured",
          "trigger=metric_appended",
        ].join(" "),
      );
      assert.equal(notifications[0]?.messagePreview.includes("rawJson"), false);
      assert.equal(notifications[0]?.messagePreview.includes("Metric Snapshot Token"), false);
      assert.equal(notifications[0]?.messagePreview.includes("metric_snapshot_pool"), false);

      const savedRawJson = readRecord(await readMetricRawJson(databaseUrl, mint));
      const savedToken = readRecord(savedRawJson?.token);
      const savedTopPool = readRecord(savedRawJson?.topPool);
      assert.equal(savedRawJson?.network, "solana");
      assert.equal(savedToken?.address, mint);
      assert.equal(savedToken?.name, "Metric Snapshot Token");
      assert.equal(savedToken?.symbol, "MST");
      assert.equal(savedTopPool?.address, "metric_snapshot_pool");
    });
  });

  await t.test("supports rehearsal-tagged capture-only notification keys", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "write-rehearsal-notification.db")}`;
      const mint = "MetricSnapshotRehearsal111111111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-rehearsal-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint, "--write", "--notificationRehearsalTag", "testtag"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      const metricId = parsed.items[0]?.writeSummary.metricId;
      assert.equal(typeof metricId, "number");
      assert.equal(parsed.items[0]?.writeSummary.notificationCaptureEnabled, true);
      assert.equal(parsed.items[0]?.writeSummary.notificationCreated, true);
      assert.equal(parsed.items[0]?.writeSummary.notificationSkippedReason, null);

      const notifications = await readNotifications(databaseUrl, mint);
      const expectedKey = `REHEARSAL:testtag:${mint}:metric_appended:${metricId}`;
      assert.equal(notifications.length, 1);
      assert.equal(notifications[0]?.notificationKey, expectedKey);
      assert.equal(isRehearsalNotificationKey(expectedKey), true);
      assert.equal(notifications[0]?.eventType, "metric_appended");
      assert.equal(notifications[0]?.trigger, "metric_appended");
      assert.equal(notifications[0]?.status, "captured");
      assert.equal(notifications[0]?.mode, "capture_only");
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("TELEGRAM_BOT_TOKEN"), false);
      assert.equal(result.stdout.includes("TELEGRAM_CHAT_ID"), false);
      assert.equal(result.stdout.includes("DATABASE_URL"), false);
    });
  });

  await t.test("supports exact mint metric write without notification capture", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "write-no-notification.db")}`;
      const mint = "MetricSnapshotNoCapture111111111111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-no-notification-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint, "--write", "--noNotificationCapture"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "single");
      assert.equal(parsed.dryRun, false);
      assert.equal(parsed.writeEnabled, true);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 1);
      assert.equal(typeof parsed.items[0]?.writeSummary.metricId, "number");
      assert.equal(parsed.items[0]?.writeSummary.notificationCaptureEnabled, false);
      assert.equal(parsed.items[0]?.writeSummary.notificationCreated, false);
      assert.equal(parsed.items[0]?.writeSummary.notificationId, null);
      assert.equal(
        parsed.items[0]?.writeSummary.notificationSkippedReason,
        "disabled_by_option",
      );
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("Metric Snapshot Token"), false);
      assert.equal(result.stdout.includes("metric_snapshot_pool"), false);

      const metrics = await readMetrics(databaseUrl, mint);
      assert.equal(metrics.length, 1);
      assert.equal(metrics[0]?.source, METRIC_SOURCE);
      assert.equal(metrics[0]?.volume24h, 1234);

      const notifications = await readNotifications(databaseUrl, mint);
      assert.deepEqual(notifications, []);
    });
  });

  await t.test("rejects invalid rehearsal tags before DB writes", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "invalid-rehearsal-tag.db")}`;
      const mint = "MetricSnapshotInvalidTag111111111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-invalid-tag-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint, "--write", "--notificationRehearsalTag", "bad/tag"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.match(
        result.stderr,
        /--notificationRehearsalTag may contain only letters, numbers, underscore, and hyphen/,
      );
      assert.equal(result.stderr.includes("bad/tag"), false);
      assert.equal(result.stderr.includes("TELEGRAM_BOT_TOKEN"), false);
      assert.equal(result.stderr.includes("TELEGRAM_CHAT_ID"), false);
      assert.equal(result.stderr.includes("DATABASE_URL"), false);

      assert.deepEqual(await readMetrics(databaseUrl, mint), []);
      assert.deepEqual(await readNotifications(databaseUrl, mint), []);
    });
  });

  await t.test("rejects colon whitespace and long rehearsal tags", async () => {
    const invalidTags = [
      {
        tag: "bad:tag",
        pattern:
          /--notificationRehearsalTag may contain only letters, numbers, underscore, and hyphen/,
      },
      {
        tag: "bad tag",
        pattern:
          /--notificationRehearsalTag may contain only letters, numbers, underscore, and hyphen/,
      },
      {
        tag: "a".repeat(41),
        pattern: /--notificationRehearsalTag must be 40 characters or fewer/,
      },
    ];

    for (const { tag, pattern } of invalidTags) {
      const result = await runMetricSnapshotGeckoterminal([
        "--mint",
        "MetricSnapshotUnsafeTag11111111111111111111pump",
        "--write",
        "--notificationRehearsalTag",
        tag,
      ]);

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, pattern);
      assert.equal(result.stderr.includes(tag), false);
    }
  });

  await t.test("rejects rehearsal tag with no notification capture", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--mint",
      "MetricSnapshotNoCaptureRehearsal111111111111pump",
      "--write",
      "--notificationRehearsalTag",
      "testtag",
      "--noNotificationCapture",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /--notificationRehearsalTag cannot be used with --noNotificationCapture/,
    );
  });

  await t.test("rejects rehearsal tag in batch mode", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--write",
      "--notificationRehearsalTag",
      "testtag",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--notificationRehearsalTag requires exact --mint mode/);
  });

  await t.test("rejects rehearsal tag without write mode", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--mint",
      "MetricSnapshotDryRunRehearsal111111111111pump",
      "--notificationRehearsalTag",
      "testtag",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--notificationRehearsalTag requires --write/);
  });

  await t.test("keeps recent batch writes notification-free", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "batch-write-no-notification.db")}`;
      const mint = "MetricSnapshotBatch1111111111111111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-batch-write-snapshot.json");

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint,
        createdAt: new Date(),
        metadataStatus: "mint_only",
      });
      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10", "--write"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.dryRun, false);
      assert.equal(parsed.writeEnabled, true);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.writtenCount, 1);
      assert.equal(parsed.items[0]?.token.mint, mint);
      assert.equal(typeof parsed.items[0]?.writeSummary.metricId, "number");
      assert.equal(parsed.items[0]?.writeSummary.notificationCaptureEnabled, false);
      assert.equal(parsed.items[0]?.writeSummary.notificationCreated, false);
      assert.equal(parsed.items[0]?.writeSummary.notificationId, null);
      assert.equal(
        parsed.items[0]?.writeSummary.notificationSkippedReason,
        "not_single_mint_mode",
      );

      const metrics = await readMetrics(databaseUrl, mint);
      assert.equal(metrics.length, 1);

      const notifications = await readNotifications(databaseUrl, mint);
      assert.deepEqual(notifications, []);
    });
  });

  await t.test("accepts interItemDelayMs and delays only between batch items", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "batch-inter-item-delay.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-batch-delay-snapshot.json");
      const now = Date.now();
      const mints = [
        "MetricSnapshotDelayA111111111111111111111111111pump",
        "MetricSnapshotDelayB111111111111111111111111111pump",
        "MetricSnapshotDelayC111111111111111111111111111pump",
      ];

      await runDbPush(databaseUrl);
      for (let index = 0; index < mints.length; index += 1) {
        await seedMetricSelectionToken(databaseUrl, {
          mint: mints[index] ?? "",
          createdAt: new Date(now - index * 1_000),
          metadataStatus: "mint_only",
        });
      }
      await writeSnapshotFixture(geckoSnapshotFile, mints[0] ?? "");

      const result = await runMetricSnapshotGeckoterminal(
        [
          "--limit",
          "3",
          "--sinceMinutes",
          "10",
          "--interItemDelayMs",
          "1",
        ],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.selection.selectedCount, 3);
      assert.equal(parsed.summary.selectedCount, 3);
      assert.equal(parsed.summary.okCount, 3);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.equal(parsed.summary.interItemDelayMs, 1);
      assert.equal(parsed.summary.interItemDelayCount, 2);
    });
  });

  await t.test("does not delay exact mint mode even when interItemDelayMs is set", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "single-inter-item-delay.db")}`;
      const mint = "MetricSnapshotSingleDelay111111111111111111111111pump";
      const geckoSnapshotFile = join(dir, "gecko-single-delay-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);
      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint, "--interItemDelayMs", "15000"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "single");
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.summary.interItemDelayMs, 15000);
      assert.equal(parsed.summary.interItemDelayCount, 0);
    });
  });

  await t.test("rejects invalid interItemDelayMs values", async () => {
    for (const invalidValue of ["-1", "1.5", "abc", "NaN"]) {
      const result = await runMetricSnapshotGeckoterminal([
        "--interItemDelayMs",
        invalidValue,
      ]);

      assert.equal(result.ok, false);
      assert.equal(result.code, 1);
      assert.equal(result.stdout, "");
      assert.match(
        result.stderr,
        new RegExp(
          `Invalid non-negative integer for --interItemDelayMs: ${invalidValue.replace(".", "\\.")}`,
        ),
      );
    }
  });

  await t.test("prioritizeRichPending changes recent batch selection order toward richer pending rows", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "priority.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-priority-snapshot.json");
      const newerThinMint = "MetricSnapshotThin11111111111111111111111111111pump";
      const olderRichMint = "MetricSnapshotRich11111111111111111111111111111pump";
      const now = Date.now();

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: newerThinMint,
        createdAt: new Date(now - 30 * 1_000),
        metadataStatus: "mint_only",
      });
      await seedMetricSelectionToken(databaseUrl, {
        mint: olderRichMint,
        createdAt: new Date(now - 2 * 60 * 1_000),
        metadataStatus: "partial",
        reviewFlagsJson: {
          hasWebsite: true,
          hasX: false,
          hasTelegram: false,
          metaplexHit: false,
          descriptionPresent: true,
          linkCount: 1,
        },
      });
      await writeSnapshotFixture(geckoSnapshotFile, newerThinMint);

      const defaultResult = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(defaultResult.ok, true);

      const prioritizedResult = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10", "--prioritizeRichPending"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(prioritizedResult.ok, true);

      const defaultParsed = JSON.parse(
        defaultResult.stdout,
      ) as MetricSnapshotGeckoterminalOutput;
      const prioritizedParsed = JSON.parse(
        prioritizedResult.stdout,
      ) as MetricSnapshotGeckoterminalOutput;

      assert.equal(defaultParsed.selection.selectedCount, 1);
      assert.equal(defaultParsed.selection.prioritizeRichPending, false);
      assert.equal(defaultParsed.items[0]?.token.mint, newerThinMint);
      assert.equal(defaultParsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);

      assert.equal(prioritizedParsed.selection.selectedCount, 1);
      assert.equal(prioritizedParsed.selection.prioritizeRichPending, true);
      assert.equal(prioritizedParsed.items[0]?.token.mint, olderRichMint);
      assert.equal(prioritizedParsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);
    });
  });

  await t.test("onlyMetricPending previews Metric-zero batch candidates without changing default selection", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "only-metric-pending.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-only-metric-pending-snapshot.json");
      const now = Date.now();
      const newerMeasuredMint = "MetricSnapshotMeasured11111111111111111111111pump";
      const newerNonPumpPendingMint = "MetricSnapshotPendingNonPump111111111111111111";
      const pendingMintA = "MetricSnapshotPendingA111111111111111111111111pump";
      const pendingMintB = "MetricSnapshotPendingB111111111111111111111111pump";
      const pendingMintC = "MetricSnapshotPendingC111111111111111111111111pump";

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: newerMeasuredMint,
        createdAt: new Date(now - 10 * 1_000),
        metadataStatus: "mint_only",
      });
      await seedMetricSelectionToken(databaseUrl, {
        mint: newerNonPumpPendingMint,
        createdAt: new Date(now - 20 * 1_000),
        metadataStatus: "mint_only",
      });
      for (const [index, mint] of [pendingMintA, pendingMintB, pendingMintC].entries()) {
        await seedMetricSelectionToken(databaseUrl, {
          mint,
          createdAt: new Date(now - (30 + index * 10) * 1_000),
          metadataStatus: "mint_only",
        });
      }
      await seedRecentMetric(databaseUrl, {
        mint: newerMeasuredMint,
        observedAt: new Date(now - 60 * 1_000),
      });
      await writeSnapshotFixture(geckoSnapshotFile, newerMeasuredMint);

      const defaultResult = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(defaultResult.ok, true);

      const defaultParsed = JSON.parse(
        defaultResult.stdout,
      ) as MetricSnapshotGeckoterminalOutput;
      assert.equal(defaultParsed.selection.onlyMetricPending, false);
      assert.equal(defaultParsed.items[0]?.token.mint, newerMeasuredMint);
      assert.equal(defaultParsed.items[0]?.token.metricsCount, 1);
      assert.equal(defaultParsed.items[0]?.status, "ok");

      const pendingPreviewResult = await runMetricSnapshotGeckoterminal(
        [
          "--limit",
          "2",
          "--sinceMinutes",
          "10",
          "--pumpOnly",
          "--onlyMetricPending",
          "--minGapMinutes",
          "60",
        ],
        { databaseUrl },
      );
      assert.equal(pendingPreviewResult.ok, true);

      const pendingParsed = JSON.parse(
        pendingPreviewResult.stdout,
      ) as MetricSnapshotGeckoterminalOutput;
      assert.equal(pendingParsed.mode, "recent_batch");
      assert.equal(pendingParsed.dryRun, true);
      assert.equal(pendingParsed.writeEnabled, false);
      assert.equal(pendingParsed.selection.pumpOnly, true);
      assert.equal(pendingParsed.selection.onlyMetricPending, true);
      assert.equal(pendingParsed.selection.selectedCount, 2);
      assert.deepEqual(
        pendingParsed.items.map((item) => item.token.mint),
        [pendingMintA, pendingMintB],
      );
      assert.equal(
        pendingParsed.items.every((item) => item.status === "selection_preview"),
        true,
      );
      assert.equal(
        pendingParsed.items.every((item) => item.token.metricsCount === 0),
        true,
      );
      assert.equal(
        pendingParsed.items.every((item) => item.token.notificationCount === 0),
        true,
      );
      assert.equal(
        pendingParsed.items.every((item) => item.token.holderSnapshotCount === 0),
        true,
      );
      assert.equal(
        pendingParsed.items.every((item) => item.token.latestMetricObservedAt === null),
        true,
      );
      assert.equal(
        pendingParsed.items.every((item) => item.metricCandidate === undefined),
        true,
      );
      assert.equal(pendingParsed.summary.okCount, 0);
      assert.equal(pendingParsed.summary.writtenCount, 0);
      assert.equal(pendingPreviewResult.stdout.includes("rawJson"), false);

      assert.deepEqual(await readMetrics(databaseUrl, pendingMintA), []);
      assert.deepEqual(await readNotifications(databaseUrl, pendingMintA), []);
    });
  });

  await t.test("onlyMetricOnce previews stale Metric-one batch candidates without provider fetch", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "only-metric-once.db")}`;
      const now = Date.now();
      const zeroMint = "MetricSnapshotOnceZero111111111111111111111111pump";
      const recentOnceMint = "MetricSnapshotOnceRecent11111111111111111111pump";
      const nonPumpOnceMint = "MetricSnapshotOnceNonPump111111111111111111";
      const staleOutsideMint = "MetricSnapshotOnceOutside111111111111111111pump";
      const onceMintA = "MetricSnapshotOnceA11111111111111111111111111pump";
      const onceMintB = "MetricSnapshotOnceB11111111111111111111111111pump";
      const onceMintC = "MetricSnapshotOnceC11111111111111111111111111pump";
      const multiMint = "MetricSnapshotOnceMulti11111111111111111111111pump";

      await runDbPush(databaseUrl);
      for (const [index, mint] of [
        zeroMint,
        recentOnceMint,
        nonPumpOnceMint,
        onceMintA,
        onceMintB,
        onceMintC,
        multiMint,
      ].entries()) {
        await seedMetricSelectionToken(databaseUrl, {
          mint,
          createdAt: new Date(now - (10 + index * 10) * 1_000),
          metadataStatus: "partial",
        });
      }
      await seedMetricSelectionToken(databaseUrl, {
        mint: staleOutsideMint,
        createdAt: new Date(now - 2 * 60 * 60_000),
        metadataStatus: "partial",
      });
      await seedRecentMetric(databaseUrl, {
        mint: recentOnceMint,
        observedAt: new Date(now - 5 * 60_000),
      });
      await seedRecentMetric(databaseUrl, {
        mint: nonPumpOnceMint,
        observedAt: new Date(now - 2 * 60 * 60_000),
      });
      for (const mint of [onceMintA, onceMintB, onceMintC, staleOutsideMint, multiMint]) {
        await seedRecentMetric(databaseUrl, {
          mint,
          observedAt: new Date(now - 2 * 60 * 60_000),
        });
      }
      await seedRecentMetric(databaseUrl, {
        mint: multiMint,
        observedAt: new Date(now - 3 * 60 * 60_000),
      });

      const previewResult = await runMetricSnapshotGeckoterminal(
        [
          "--limit",
          "2",
          "--sinceMinutes",
          "10",
          "--pumpOnly",
          "--onlyMetricOnce",
          "--minGapMinutes",
          "60",
          "--noNotificationCapture",
        ],
        {
          databaseUrl,
          geckoSnapshotErrorOnce:
            "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
        },
      );
      assert.equal(previewResult.ok, true);

      const parsed = JSON.parse(previewResult.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.selection.pumpOnly, true);
      assert.equal(parsed.selection.onlyMetricPending, false);
      assert.equal(parsed.selection.onlyMetricOnce, true);
      assert.equal(parsed.selection.selectedCount, 2);
      assert.deepEqual(parsed.selection.selectedMetricCountDistribution, {
        zero: 0,
        one: 2,
        twoPlus: 0,
      });
      assert.equal(typeof parsed.selection.latestMetricAgeMinutes.min, "number");
      assert.equal(typeof parsed.selection.latestMetricAgeMinutes.max, "number");
      assert.ok((parsed.selection.latestMetricAgeMinutes.min ?? 0) >= 60);
      assert.deepEqual(
        parsed.items.map((item) => item.token.mint),
        [onceMintA, onceMintB],
      );
      assert.equal(
        parsed.items.every((item) => item.status === "selection_preview"),
        true,
      );
      assert.equal(
        parsed.items.every((item) => item.token.metricsCount === 1),
        true,
      );
      assert.equal(
        parsed.items.every((item) => typeof item.token.latestMetricId === "number"),
        true,
      );
      assert.equal(
        parsed.items.every((item) => item.token.latestMetricObservedAt !== null),
        true,
      );
      assert.equal(
        parsed.items.every((item) => item.metricCandidate === undefined),
        true,
      );
      assert.equal(parsed.summary.okCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.equal(parsed.summary.providerErrorCount, 0);
      assert.equal(previewResult.stdout.includes("rawJson"), false);
      assert.equal(previewResult.stdout.includes("Metric Snapshot Token"), false);

      assert.equal((await readMetrics(databaseUrl, onceMintA)).length, 1);
      assert.deepEqual(await readMetrics(databaseUrl, zeroMint), []);
      assert.equal((await readMetrics(databaseUrl, multiMint)).length, 2);
      assert.deepEqual(await readNotifications(databaseUrl, onceMintA), []);
    });
  });

  await t.test("rejects onlyMetricPending in exact mint mode", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--mint",
      "MetricSnapshotExactPending11111111111111111111pump",
      "--onlyMetricPending",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /--onlyMetricPending is only valid in batch mode without --mint/,
    );
  });

  await t.test("rejects onlyMetricOnce in exact mint mode", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--mint",
      "MetricSnapshotExactOnce11111111111111111111111pump",
      "--onlyMetricOnce",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /--onlyMetricOnce is only valid in batch mode without --mint/,
    );
  });

  await t.test("rejects onlyMetricPending with onlyMetricOnce before fetch", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--onlyMetricPending",
      "--onlyMetricOnce",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(
      result.stderr,
      /--onlyMetricPending and --onlyMetricOnce cannot be used together/,
    );
  });

  await t.test("excludes recent batch metrics before applying limit", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "batch-min-gap-before-limit.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-batch-min-gap-before-limit.json");
      const now = Date.now();
      const recentMints = [
        "MetricSnapshotRecentA11111111111111111111111111pump",
        "MetricSnapshotRecentB11111111111111111111111111pump",
      ];
      const eligibleMints = [
        "MetricSnapshotEligibleA111111111111111111111111pump",
        "MetricSnapshotEligibleB111111111111111111111111pump",
      ];
      const allMints = [...recentMints, ...eligibleMints];

      await runDbPush(databaseUrl);
      for (let index = 0; index < allMints.length; index += 1) {
        await seedMetricSelectionToken(databaseUrl, {
          mint: allMints[index] ?? "",
          createdAt: new Date(now - index * 1_000),
          metadataStatus: "mint_only",
        });
      }
      for (const mint of recentMints) {
        await seedRecentMetric(databaseUrl, {
          mint,
          observedAt: new Date(now - 60 * 1_000),
        });
      }
      await writeSnapshotFixture(geckoSnapshotFile, eligibleMints[0] ?? "");

      const result = await runMetricSnapshotGeckoterminal(
        ["--limit", "2", "--sinceMinutes", "10", "--minGapMinutes", "60"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.selection.selectedCount, 2);
      assert.equal(parsed.summary.selectedCount, 2);
      assert.equal(parsed.summary.okCount, 2);
      assert.equal(parsed.summary.skippedCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.deepEqual(
        parsed.items.map((item) => item.token.mint),
        eligibleMints,
      );
      assert.equal(parsed.items.every((item) => item.status === "ok"), true);
      assert.equal(result.stdout.includes("rawJson"), false);
    });
  });

  await t.test("keeps old batch metrics eligible before applying limit", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "batch-old-metric-eligible.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-batch-old-metric-eligible.json");
      const oldMetricMint = "MetricSnapshotOldEligible1111111111111111111111pump";
      const now = Date.now();

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: oldMetricMint,
        createdAt: new Date(now - 2 * 60 * 1_000),
        metadataStatus: "mint_only",
      });
      await seedRecentMetric(databaseUrl, {
        mint: oldMetricMint,
        observedAt: new Date(now - 2 * 60 * 60_000),
      });
      await writeSnapshotFixture(geckoSnapshotFile, oldMetricMint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10", "--minGapMinutes", "60"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.skippedCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.items[0]?.token.mint, oldMetricMint);
      assert.equal(parsed.items[0]?.status, "ok");
    });
  });

  await t.test("skips an exact mint before fetch when minGapMinutes is newer than the latest metric", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "min-gap.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-min-gap-snapshot.json");
      const skippedMint = "MetricSnapshotSkip11111111111111111111111111111pump";
      const now = Date.now();

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: skippedMint,
        createdAt: new Date(now - 2 * 60 * 1_000),
        metadataStatus: "mint_only",
      });
      await seedRecentMetric(databaseUrl, {
        mint: skippedMint,
        observedAt: new Date(now - 60 * 1_000),
      });
      await writeSnapshotFixture(geckoSnapshotFile, skippedMint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", skippedMint, "--minGapMinutes", "5"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "single");
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 0);
      assert.equal(parsed.summary.skippedCount, 1);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.token.mint, skippedMint);
      assert.equal(parsed.items[0]?.status, "skipped_recent_metric");
      assert.equal(parsed.items[0]?.metricCandidate, undefined);
      assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
      assert.equal(parsed.items[0]?.writeSummary.wouldCreateMetric, false);
      assert.equal(parsed.items[0]?.writeSummary.metricId, null);
      assert.equal(parsed.items[0]?.minGapMinutes, 5);
      assert.match(parsed.items[0]?.latestObservedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);

      const metrics = await readMetrics(databaseUrl, skippedMint);
      assert.equal(metrics.length, 1);
      assert.equal(metrics[0]?.source, METRIC_SOURCE);
      assert.equal(metrics[0]?.volume24h, 999);
    });
  });

  await t.test("exits non-zero when watch-only timing args are used without --watch", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--intervalSeconds",
      "1",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--intervalSeconds and --maxIterations require --watch/);
    assert.match(
      result.stderr,
        /pnpm metric:snapshot:geckoterminal -- \[--mint <MINT>\] \[--limit <N>\] \[--sinceMinutes <N>\] \[--pumpOnly\] \[--prioritizeRichPending\] \[--onlyMetricPending\] \[--onlyMetricOnce\] \[--minGapMinutes <N>\] \[--interItemDelayMs <N>\] \[--source <SOURCE>\] \[--notificationRehearsalTag <TAG>\] \[--noNotificationCapture\] \[--write\] \[--watch\] \[--intervalSeconds <N>\] \[--maxIterations <N>\]/,
    );
  });

  await t.test("returns an empty recent batch when no gecko-origin tokens are selected", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runMetricSnapshotGeckoterminal(
        ["--limit", "5", "--sinceMinutes", "5"],
        { databaseUrl },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.metricSource, METRIC_SOURCE);
      assert.equal(parsed.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.selection.mint, null);
      assert.equal(parsed.selection.limit, 5);
      assert.equal(parsed.selection.sinceMinutes, 5);
      assert.match(parsed.selection.sinceCutoff ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.prioritizeRichPending, false);
      assert.equal(parsed.selection.selectedCount, 0);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.deepEqual(parsed.selection.selectedSummary, {
        mintOnlyCount: 0,
        nonMintOnlyCount: 0,
        withReviewFlagsJsonCount: 0,
        withReviewFlagsCount: 0,
      });
      assert.equal(parsed.summary.selectedCount, 0);
      assert.equal(parsed.summary.okCount, 0);
      assert.equal(parsed.summary.skippedCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.deepEqual(parsed.items, []);
    });
  });

  await t.test("classifies provider fetch failures without raw provider dumps", async () => {
    const cases: Array<{
      name: string;
      injectedError?: string;
      fixtureContent?: string;
      category: ProviderErrorCategory;
      summaryKey:
        | "networkFetchErrorCount"
        | "timeoutCount"
        | "http429Count"
        | "httpErrorCount"
        | "parseErrorCount"
        | "shapeErrorCount"
        | "providerEmptyCount";
      httpStatus: number | null;
      retryable: boolean;
    }> = [
      {
        name: "network",
        injectedError: "fetch failed",
        category: "network_fetch_error",
        summaryKey: "networkFetchErrorCount",
        httpStatus: null,
        retryable: true,
      },
      {
        name: "timeout",
        injectedError: "The operation was aborted due to timeout",
        category: "timeout",
        summaryKey: "timeoutCount",
        httpStatus: null,
        retryable: true,
      },
      {
        name: "http-429",
        injectedError: "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
        category: "http_429",
        summaryKey: "http429Count",
        httpStatus: 429,
        retryable: true,
      },
      {
        name: "http-500",
        injectedError: "GeckoTerminal token snapshot request failed: 500 Internal Server Error",
        category: "http_error",
        summaryKey: "httpErrorCount",
        httpStatus: 500,
        retryable: true,
      },
      {
        name: "parse",
        fixtureContent: "{ not json",
        category: "parse_error",
        summaryKey: "parseErrorCount",
        httpStatus: null,
        retryable: false,
      },
      {
        name: "shape",
        fixtureContent: JSON.stringify({ data: { attributes: {} } }),
        category: "shape_error",
        summaryKey: "shapeErrorCount",
        httpStatus: null,
        retryable: false,
      },
      {
        name: "empty",
        fixtureContent: JSON.stringify({ data: null }),
        category: "provider_empty",
        summaryKey: "providerEmptyCount",
        httpStatus: null,
        retryable: false,
      },
    ];

    for (const input of cases) {
      await withTempDir(async (dir) => {
        const databaseUrl = `file:${join(dir, `${input.name}.db`)}`;
        const mint = `MetricSnapshotProviderError${input.name.replace("-", "")}111111111pump`;
        const geckoSnapshotFile = join(dir, `${input.name}-snapshot.json`);

        await runDbPush(databaseUrl);
        await seedToken(databaseUrl, mint);
        if (input.fixtureContent !== undefined) {
          await writeRawSnapshotFixture(geckoSnapshotFile, input.fixtureContent);
        }

        const result = await runMetricSnapshotGeckoterminal(
          ["--mint", mint],
          {
            databaseUrl,
            ...(input.fixtureContent !== undefined ? { geckoSnapshotFile } : {}),
            ...(input.injectedError ? { geckoSnapshotErrorOnce: input.injectedError } : {}),
          },
        );
        assert.equal(result.ok, true);

        const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
        assert.equal(parsed.summary.selectedCount, 1);
        assert.equal(parsed.summary.okCount, 0);
        assert.equal(parsed.summary.errorCount, 1);
        assert.equal(parsed.summary.writtenCount, 0);
        assert.equal(parsed.summary.providerErrorCount, 1);
        assert.equal(parsed.summary.errorCategoryCounts[input.category], 1);
        assert.equal(parsed.summary[input.summaryKey], 1);
        assert.equal(parsed.summary.firstErrorCategory, input.category);
        assert.equal(parsed.summary.firstHttpStatus, input.httpStatus);
        assert.equal(parsed.items[0]?.status, "error");
        assert.equal(parsed.items[0]?.errorCategory, input.category);
        assert.equal(parsed.items[0]?.httpStatus, input.httpStatus);
        assert.equal(parsed.items[0]?.retryable, input.retryable);
        assert.equal(parsed.items[0]?.writeSummary.wouldCreateMetric, false);
        assert.equal(parsed.items[0]?.writeSummary.metricId, null);

        assert.equal(result.stdout.includes("rawJson"), false);
        assert.equal(result.stdout.includes("stack"), false);
        assert.equal(result.stdout.includes("api.geckoterminal.com"), false);
        assert.equal(result.stdout.includes("GECKOTERMINAL_TOKEN_API_URL"), false);
        assert.equal(result.stdout.includes("not json"), false);
        assert.deepEqual(await readMetrics(databaseUrl, mint), []);
        assert.deepEqual(await readNotifications(databaseUrl, mint), []);
      });
    }
  });

  await t.test("short-circuits a watch cycle on 429 while preserving structured summary fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "watch-rate-limit.db")}`;
      const geckoSnapshotFile = join(dir, "watch-rate-limit-snapshot.json");
      const now = Date.now();
      const firstMint = "MetricSnapshotWatchRateLimitA111111111111111pump";
      const secondMint = "MetricSnapshotWatchRateLimitB111111111111111pump";

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: firstMint,
        createdAt: new Date(now),
        metadataStatus: "mint_only",
      });
      await seedMetricSelectionToken(databaseUrl, {
        mint: secondMint,
        createdAt: new Date(now - 1_000),
        metadataStatus: "mint_only",
      });
      await writeSnapshotFixture(geckoSnapshotFile, secondMint);

      const result = await runMetricSnapshotGeckoterminal(
        [
          "--watch",
          "--intervalSeconds",
          "1",
          "--maxIterations",
          "2",
          "--limit",
          "2",
          "--sinceMinutes",
          "10",
        ],
        {
          databaseUrl,
          geckoSnapshotFile,
          geckoSnapshotErrorOnce:
            "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
        },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalWatchOutput;
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.watchEnabled, true);
      assert.equal(parsed.cycleCount, 2);
      assert.equal(parsed.failedCount, 0);
      assert.equal(parsed.selectedCount, 4);
      assert.equal(parsed.okCount, 2);
      assert.equal(parsed.skippedCount, 0);
      assert.equal(parsed.errorCount, 1);
      assert.equal(parsed.writtenCount, 0);
      assert.equal(parsed.providerErrorCount, 1);
      assert.equal(parsed.errorCategoryCounts.http_429, 1);
      assert.equal(parsed.http429Count, 1);
      assert.equal(parsed.firstErrorCategory, "http_429");
      assert.equal(parsed.firstHttpStatus, 429);
      assert.equal(parsed.rateLimited, true);
      assert.equal(parsed.rateLimitedCount, 1);
      assert.equal(parsed.abortedDueToRateLimit, true);
      assert.equal(parsed.skippedAfterRateLimit, 1);
      assert.equal(parsed.items.length, 3);
      assert.equal(parsed.cycles.length, 2);

      const firstCycle = parsed.cycles[0];
      assert.equal(firstCycle?.summary.selectedCount, 2);
      assert.equal(firstCycle?.summary.okCount, 0);
      assert.equal(firstCycle?.summary.errorCount, 1);
      assert.equal(firstCycle?.summary.writtenCount, 0);
      assert.equal(firstCycle?.summary.providerErrorCount, 1);
      assert.equal(firstCycle?.summary.errorCategoryCounts.http_429, 1);
      assert.equal(firstCycle?.summary.http429Count, 1);
      assert.equal(firstCycle?.summary.firstErrorCategory, "http_429");
      assert.equal(firstCycle?.summary.firstHttpStatus, 429);
      assert.equal(firstCycle?.summary.rateLimited, true);
      assert.equal(firstCycle?.summary.abortedDueToRateLimit, true);
      assert.equal(firstCycle?.summary.skippedAfterRateLimit, 1);
      assert.equal(firstCycle?.items.length, 1);
      assert.equal(firstCycle?.items[0]?.status, "error");
      assert.equal(firstCycle?.items[0]?.errorCategory, "http_429");
      assert.equal(firstCycle?.items[0]?.httpStatus, 429);
      assert.equal(firstCycle?.items[0]?.writeSummary.metricId, null);
      assert.equal(firstCycle?.items[0]?.writeSummary.notificationCreated, false);

      const secondCycle = parsed.cycles[1];
      assert.equal(secondCycle?.summary.selectedCount, 2);
      assert.equal(secondCycle?.summary.okCount, 2);
      assert.equal(secondCycle?.summary.errorCount, 0);
      assert.equal(secondCycle?.summary.writtenCount, 0);
      assert.equal(secondCycle?.summary.providerErrorCount, 0);
      assert.equal(secondCycle?.summary.errorCategoryCounts.http_429, 0);
      assert.equal(secondCycle?.summary.firstErrorCategory, null);
      assert.equal(secondCycle?.summary.firstHttpStatus, null);
      assert.equal(secondCycle?.summary.rateLimited, false);
      assert.equal(secondCycle?.items.length, 2);
      assert.equal(secondCycle?.items[0]?.metricCandidate?.volume24h, 1234);
      assert.equal(secondCycle?.items[1]?.metricCandidate?.volume24h, 1234);
      assert.equal(
        secondCycle?.items.every(
          (item) =>
            item.writeSummary.dryRun === true &&
            item.writeSummary.wouldCreateMetric === true &&
            item.writeSummary.metricId === null &&
            item.writeSummary.notificationCreated === false &&
            item.writeSummary.notificationId === null,
        ),
        true,
      );

      assert.match(result.stderr, /cycle=1/);
      assert.match(result.stderr, /providerErrorCount=1/);
      assert.match(result.stderr, /firstErrorCategory=http_429/);
      assert.match(result.stderr, /firstHttpStatus=429/);
      assert.match(result.stderr, /rateLimited=true/);
      assert.match(result.stderr, /skippedAfterRateLimit=1/);
      assert.match(result.stderr, /cycle=2/);
      assert.match(result.stderr, /providerErrorCount=0/);
      assert.match(result.stderr, /rateLimited=false/);
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("Metric Snapshot Token"), false);
      assert.deepEqual(await readMetrics(databaseUrl, firstMint), []);
      assert.deepEqual(await readMetrics(databaseUrl, secondMint), []);
      assert.deepEqual(await readNotifications(databaseUrl, firstMint), []);
      assert.deepEqual(await readNotifications(databaseUrl, secondMint), []);
    });
  });

  await t.test("aggregates mixed provider error categories without changing success handling", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "mixed-provider-errors.db")}`;
      const geckoSnapshotFile = join(dir, "mixed-provider-errors-snapshot.json");
      const now = Date.now();
      const firstMint = "MetricSnapshotMixedErrorA111111111111111111111pump";
      const secondMint = "MetricSnapshotMixedOkB1111111111111111111111pump";

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: firstMint,
        createdAt: new Date(now),
        metadataStatus: "mint_only",
      });
      await seedMetricSelectionToken(databaseUrl, {
        mint: secondMint,
        createdAt: new Date(now - 1_000),
        metadataStatus: "mint_only",
      });
      await writeSnapshotFixture(geckoSnapshotFile, secondMint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--limit", "2", "--sinceMinutes", "10"],
        {
          databaseUrl,
          geckoSnapshotFile,
          geckoSnapshotErrorOnce:
            "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
        },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.summary.selectedCount, 2);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.errorCount, 1);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.equal(parsed.summary.providerErrorCount, 1);
      assert.equal(parsed.summary.errorCategoryCounts.http_429, 1);
      assert.equal(parsed.summary.http429Count, 1);
      assert.equal(parsed.summary.firstErrorCategory, "http_429");
      assert.equal(parsed.summary.firstHttpStatus, 429);
      assert.equal(parsed.items[0]?.status, "error");
      assert.equal(parsed.items[0]?.errorCategory, "http_429");
      assert.equal(parsed.items[1]?.status, "ok");
      assert.equal(parsed.items[1]?.metricCandidate?.safeSummary.topPoolPresent, true);
      assert.equal(result.stdout.includes("rawJson"), false);
      assert.equal(result.stdout.includes("Metric Snapshot Token"), false);
    });
  });
});
