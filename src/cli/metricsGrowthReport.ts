import "dotenv/config";

import { db } from "./db.js";

const DEFAULT_MIN_METRIC_COUNT = 2;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_BY: SortBy = "fdvMultiple";

type SortBy = "fdvMultiple" | "maxFdv" | "reserveMultiple" | "metricCount";

type Args = {
  pumpOnly: boolean;
  minMetricCount: number;
  limit: number;
  sortBy: SortBy;
  sinceHours?: number;
  tokenId?: number;
};

type JsonObject = Record<string, unknown>;

type MetricInput = {
  id: number;
  observedAt: Date;
  peakFdv24h: number | null;
  peakFdv7d: number | null;
  rawJson: unknown;
};

type GrowthRow = {
  tokenId: number;
  abbreviatedMint: string;
  metricCount: number;
  firstMetricId: number | null;
  firstObservedAt: string | null;
  firstFdvUsd: number | null;
  firstReserveUsd: number | null;
  maxFdvMetricId: number | null;
  maxFdvObservedAt: string | null;
  maxFdvUsd: number | null;
  maxReserveUsd: number | null;
  latestMetricId: number | null;
  latestObservedAt: string | null;
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
};

type MetricValues = {
  fdvUsd: number | null;
  reserveUsd: number | null;
};

type ScoreBucketSummary = {
  count: number;
  maxFdvMultiple: number | null;
  fdvMultipleGte2Count: number;
};

function printUsageAndExit(message?: string, exitCode = 1): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metrics:growth-report -- [--pumpOnly] [--minMetricCount <N>] [--limit <N>] [--sortBy <fdvMultiple|maxFdv|reserveMultiple|metricCount>] [--sinceHours <N>] [--tokenId <ID>]",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parsePositiveIntArg(value: string, key: string): number {
  if (value.trim() === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseSortByArg(value: string, key: string): SortBy {
  const allowed: SortBy[] = [
    "fdvMultiple",
    "maxFdv",
    "reserveMultiple",
    "metricCount",
  ];

  if (allowed.includes(value as SortBy)) {
    return value as SortBy;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseArgs(argv: string[]): Args {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsageAndExit(undefined, 0);
  }

  const out: Partial<Args> = {
    pumpOnly: false,
    minMetricCount: DEFAULT_MIN_METRIC_COUNT,
    limit: DEFAULT_LIMIT,
    sortBy: DEFAULT_SORT_BY,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key.startsWith("--")) {
      continue;
    }

    if (key === "--pumpOnly") {
      out.pumpOnly = true;
      continue;
    }

    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--minMetricCount":
        out.minMetricCount = parsePositiveIntArg(value, key);
        break;
      case "--limit":
        out.limit = parsePositiveIntArg(value, key);
        break;
      case "--sortBy":
        out.sortBy = parseSortByArg(value, key);
        break;
      case "--sinceHours":
        out.sinceHours = parsePositiveIntArg(value, key);
        break;
      case "--tokenId":
        out.tokenId = parsePositiveIntArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out as Args;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, key: string): JsonObject | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readCandidateNumber(value: JsonObject | null, keys: string[]): number | null {
  if (value === null) return null;

  for (const key of keys) {
    const parsed = readFiniteNumber(value[key]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractFdvUsd(metric: MetricInput): number | null {
  const rawJson = metric.rawJson;
  if (!isRecord(rawJson)) {
    return metric.peakFdv24h ?? metric.peakFdv7d ?? null;
  }

  const token = readRecord(rawJson, "token");
  const topPool = readRecord(rawJson, "topPool");

  return (
    readCandidateNumber(rawJson, ["fdvUsd", "fdv_usd"]) ??
    readCandidateNumber(token, ["fdvUsd", "fdv_usd"]) ??
    readCandidateNumber(topPool, ["fdvUsd", "fdv_usd"]) ??
    metric.peakFdv24h ??
    metric.peakFdv7d ??
    null
  );
}

function extractReserveUsd(metric: MetricInput): number | null {
  const rawJson = metric.rawJson;
  if (!isRecord(rawJson)) return null;

  const token = readRecord(rawJson, "token");
  const topPool = readRecord(rawJson, "topPool");

  return (
    readCandidateNumber(rawJson, [
      "reserveUsd",
      "reserve_usd",
      "reserveInUsd",
      "reserve_in_usd",
      "totalReserveInUsd",
      "total_reserve_in_usd",
    ]) ??
    readCandidateNumber(token, [
      "totalReserveInUsd",
      "total_reserve_in_usd",
      "reserveUsd",
      "reserve_usd",
    ]) ??
    readCandidateNumber(topPool, [
      "reserveInUsd",
      "reserve_in_usd",
      "reserveUsd",
      "reserve_usd",
    ])
  );
}

function abbreviateMint(mint: string): string {
  if (mint.length <= 14) return mint;
  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function dividePositive(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) {
    return null;
  }

  return numerator / denominator;
}

function roundMetric(value: number | null): number | null {
  if (value === null) return null;
  return Number(value.toFixed(4));
}

function incrementCount(target: Record<string, number>, key: string, by = 1): void {
  target[key] = (target[key] ?? 0) + by;
}

function metricBucket(metricCount: number): "0" | "1" | "2+" {
  if (metricCount <= 0) return "0";
  if (metricCount === 1) return "1";
  return "2+";
}

function latestMetricValues(metrics: Array<MetricInput & { values: MetricValues }>) {
  return metrics[metrics.length - 1] ?? null;
}

function buildTokenGrowthRow(input: {
  token: {
    id: number;
    mint: string;
    scoreRank: string;
    scoreTotal: number;
    hardRejected: boolean;
    metadataStatus: string;
    metrics: MetricInput[];
    _count: {
      metrics: number;
      holderSnapshots: number;
    };
  };
  notificationCount: number;
}): GrowthRow {
  const metrics = input.token.metrics
    .map((metric) => ({
      ...metric,
      values: {
        fdvUsd: extractFdvUsd(metric),
        reserveUsd: extractReserveUsd(metric),
      },
    }))
    .sort((left, right) => {
      const byObservedAt = left.observedAt.getTime() - right.observedAt.getTime();
      if (byObservedAt !== 0) return byObservedAt;
      return left.id - right.id;
    });

  const firstMetric = metrics[0] ?? null;
  const latestMetric = latestMetricValues(metrics);
  const maxFdvMetric = metrics
    .filter((metric) => metric.values.fdvUsd !== null)
    .sort((left, right) => {
      const leftFdv = left.values.fdvUsd ?? Number.NEGATIVE_INFINITY;
      const rightFdv = right.values.fdvUsd ?? Number.NEGATIVE_INFINITY;
      if (leftFdv !== rightFdv) return rightFdv - leftFdv;
      return right.id - left.id;
    })[0] ?? null;
  const maxReserveUsd = metrics.reduce<number | null>((max, metric) => {
    const reserveUsd = metric.values.reserveUsd;
    if (reserveUsd === null) return max;
    if (max === null || reserveUsd > max) return reserveUsd;
    return max;
  }, null);

  const firstFdvUsd = firstMetric?.values.fdvUsd ?? null;
  const latestFdvUsd = latestMetric?.values.fdvUsd ?? null;
  const firstReserveUsd = firstMetric?.values.reserveUsd ?? null;
  const fdvMultiple = dividePositive(maxFdvMetric?.values.fdvUsd ?? null, firstFdvUsd);
  const latestFdvMultiple = dividePositive(latestFdvUsd, firstFdvUsd);
  const reserveMultiple = dividePositive(maxReserveUsd, firstReserveUsd);

  return {
    tokenId: input.token.id,
    abbreviatedMint: abbreviateMint(input.token.mint),
    metricCount: input.token._count.metrics,
    firstMetricId: firstMetric?.id ?? null,
    firstObservedAt: firstMetric?.observedAt.toISOString() ?? null,
    firstFdvUsd,
    firstReserveUsd,
    maxFdvMetricId: maxFdvMetric?.id ?? null,
    maxFdvObservedAt: maxFdvMetric?.observedAt.toISOString() ?? null,
    maxFdvUsd: maxFdvMetric?.values.fdvUsd ?? null,
    maxReserveUsd,
    latestMetricId: latestMetric?.id ?? null,
    latestObservedAt: latestMetric?.observedAt.toISOString() ?? null,
    latestFdvUsd,
    latestReserveUsd: latestMetric?.values.reserveUsd ?? null,
    fdvMultiple: roundMetric(fdvMultiple),
    latestFdvMultiple: roundMetric(latestFdvMultiple),
    reserveMultiple: roundMetric(reserveMultiple),
    scoreRank: input.token.scoreRank,
    scoreTotal: input.token.scoreTotal,
    hardRejected: input.token.hardRejected,
    metadataStatus: input.token.metadataStatus,
    notificationCount: input.notificationCount,
    holderSnapshotCount: input.token._count.holderSnapshots,
  };
}

function buildScoreSummary(rows: GrowthRow[]) {
  const byScoreRank: Record<string, number> = {};
  const byScoreRankTotal: Record<string, number> = {};
  const bucketSummary: Record<string, ScoreBucketSummary> = {};
  let hardRejectedFdvMultipleGte2Count = 0;

  for (const row of rows) {
    const rankTotal = `${row.scoreRank}/${row.scoreTotal}`;
    incrementCount(byScoreRank, row.scoreRank);
    incrementCount(byScoreRankTotal, rankTotal);

    const bucket = bucketSummary[rankTotal] ?? {
      count: 0,
      maxFdvMultiple: null,
      fdvMultipleGte2Count: 0,
    };
    bucket.count += 1;
    if (row.fdvMultiple !== null) {
      if (bucket.maxFdvMultiple === null || row.fdvMultiple > bucket.maxFdvMultiple) {
        bucket.maxFdvMultiple = row.fdvMultiple;
      }
      if (row.fdvMultiple >= 2) {
        bucket.fdvMultipleGte2Count += 1;
        if (row.hardRejected) {
          hardRejectedFdvMultipleGte2Count += 1;
        }
      }
    }
    bucketSummary[rankTotal] = bucket;
  }

  const maxFdvMultipleByScoreBucket: Record<string, number | null> = {};
  const fdvMultipleGte2ByScoreBucket: Record<string, number> = {};
  for (const [bucket, value] of Object.entries(bucketSummary)) {
    maxFdvMultipleByScoreBucket[bucket] = value.maxFdvMultiple;
    fdvMultipleGte2ByScoreBucket[bucket] = value.fdvMultipleGte2Count;
  }

  return {
    byScoreRank,
    byScoreRankTotal,
    maxFdvMultipleByScoreBucket,
    fdvMultipleGte2ByScoreBucket,
    hardRejectedFdvMultipleGte2Count,
  };
}

function buildBuckets(rows: GrowthRow[]) {
  const buckets = {
    fdvMultipleGte1_1: 0,
    fdvMultipleGte1_25: 0,
    fdvMultipleGte1_5: 0,
    fdvMultipleGte2: 0,
    fdvMultipleGte3: 0,
    fdvMultipleGte5: 0,
    fdvMultipleGte10: 0,
    fdvDown: 0,
    fdvNearFlat: 0,
    fdvNearFlatDefinition: "0.99 <= latestFdvMultiple <= 1.01",
  };

  for (const row of rows) {
    if (row.fdvMultiple !== null) {
      if (row.fdvMultiple >= 1.1) buckets.fdvMultipleGte1_1 += 1;
      if (row.fdvMultiple >= 1.25) buckets.fdvMultipleGte1_25 += 1;
      if (row.fdvMultiple >= 1.5) buckets.fdvMultipleGte1_5 += 1;
      if (row.fdvMultiple >= 2) buckets.fdvMultipleGte2 += 1;
      if (row.fdvMultiple >= 3) buckets.fdvMultipleGte3 += 1;
      if (row.fdvMultiple >= 5) buckets.fdvMultipleGte5 += 1;
      if (row.fdvMultiple >= 10) buckets.fdvMultipleGte10 += 1;
    }

    if (row.latestFdvMultiple !== null) {
      if (row.latestFdvMultiple < 0.99) buckets.fdvDown += 1;
      if (row.latestFdvMultiple >= 0.99 && row.latestFdvMultiple <= 1.01) {
        buckets.fdvNearFlat += 1;
      }
    }
  }

  return buckets;
}

function compareNullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function sortRows(rows: GrowthRow[], sortBy: SortBy): GrowthRow[] {
  return [...rows].sort((left, right) => {
    let byTarget = 0;

    switch (sortBy) {
      case "fdvMultiple":
        byTarget = compareNullableDesc(left.fdvMultiple, right.fdvMultiple);
        break;
      case "maxFdv":
        byTarget = compareNullableDesc(left.maxFdvUsd, right.maxFdvUsd);
        break;
      case "reserveMultiple":
        byTarget = compareNullableDesc(left.reserveMultiple, right.reserveMultiple);
        break;
      case "metricCount":
        byTarget = right.metricCount - left.metricCount;
        break;
    }

    if (byTarget !== 0) return byTarget;
    if (left.latestObservedAt !== right.latestObservedAt) {
      return (right.latestObservedAt ?? "").localeCompare(left.latestObservedAt ?? "");
    }
    return right.tokenId - left.tokenId;
  });
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const sinceCutoff = args.sinceHours
    ? new Date(Date.now() - args.sinceHours * 60 * 60 * 1000)
    : null;

  const tokenSummaries = await db.token.findMany({
    where: {
      ...(args.tokenId !== undefined ? { id: args.tokenId } : {}),
      ...(sinceCutoff ? { createdAt: { gte: sinceCutoff } } : {}),
    },
    select: {
      id: true,
      mint: true,
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const filteredSummariesByPump = args.pumpOnly
    ? tokenSummaries.filter((token) => token.mint.endsWith("pump"))
    : tokenSummaries;
  const metricBucketSummary = filteredSummariesByPump.reduce<Record<string, number>>(
    (summary, token) => {
      incrementCount(summary, metricBucket(token._count.metrics));
      return summary;
    },
    { "0": 0, "1": 0, "2+": 0 },
  );
  const eligibleTokenIds = filteredSummariesByPump
    .filter((token) => token._count.metrics >= args.minMetricCount)
    .map((token) => token.id);

  const tokens = eligibleTokenIds.length === 0
    ? []
    : await db.token.findMany({
        where: {
          id: {
            in: eligibleTokenIds,
          },
        },
        select: {
          id: true,
          mint: true,
          scoreRank: true,
          scoreTotal: true,
          hardRejected: true,
          metadataStatus: true,
          metrics: {
            orderBy: [
              { observedAt: "asc" },
              { id: "asc" },
            ],
            select: {
              id: true,
              observedAt: true,
              peakFdv24h: true,
              peakFdv7d: true,
              rawJson: true,
            },
          },
          _count: {
            select: {
              metrics: true,
              holderSnapshots: true,
            },
          },
        },
      });
  const eligibleTokens = tokens;
  const notificationCounts = eligibleTokens.length === 0
    ? []
    : await db.notification.groupBy({
        by: ["tokenId"],
        where: {
          tokenId: {
            in: eligibleTokens.map((token) => token.id),
          },
        },
        _count: {
          _all: true,
        },
      });
  const notificationCountByTokenId = new Map(
    notificationCounts
      .filter((item): item is typeof item & { tokenId: number } => item.tokenId !== null)
      .map((item) => [item.tokenId, item._count._all]),
  );
  const rows = eligibleTokens.map((token) => buildTokenGrowthRow({
    token,
    notificationCount: notificationCountByTokenId.get(token.id) ?? 0,
  }));
  const sortedRows = sortRows(rows, args.sortBy);
  const topRows = sortedRows.slice(0, args.limit);
  const topFdvMultiple = sortedRows.find((row) => row.fdvMultiple !== null)?.fdvMultiple ?? null;
  const topReserveMultiple =
    sortRows(rows, "reserveMultiple").find((row) => row.reserveMultiple !== null)
      ?.reserveMultiple ?? null;

  console.log(
    JSON.stringify(
      {
        executionName: "metrics_growth_report",
        readOnly: true,
        providerFetchExecuted: false,
        dbWriteExecuted: false,
        telegramSendExecuted: false,
        rawJsonIncluded: false,
        selection: {
          pumpOnly: args.pumpOnly,
          minMetricCount: args.minMetricCount,
          limit: args.limit,
          sortBy: args.sortBy,
          sinceHours: args.sinceHours ?? null,
          sinceCutoff: sinceCutoff?.toISOString() ?? null,
          tokenId: args.tokenId ?? null,
        },
        summary: {
          tokenCountEvaluated: rows.length,
          sourceTokenCount: filteredSummariesByPump.length,
          pumpOnly: args.pumpOnly,
          minMetricCount: args.minMetricCount,
          metricBucketSummary,
          missingFirstFdvCount: rows.filter((row) => row.firstFdvUsd === null).length,
          missingMaxFdvCount: rows.filter((row) => row.maxFdvUsd === null).length,
          missingReserveCount: rows.filter(
            (row) => row.firstReserveUsd === null || row.maxReserveUsd === null,
          ).length,
          topFdvMultiple,
          topReserveMultiple,
          generatedAt: new Date().toISOString(),
        },
        buckets: buildBuckets(rows),
        scoreSummary: buildScoreSummary(rows),
        topRows,
        safety: {
          rawMintIncluded: false,
          rawTokenNameIncluded: false,
          rawTokenSymbolIncluded: false,
          normalizedTextIncluded: false,
          rawMatchedKeywordsIncluded: false,
          providerBodyIncluded: false,
          notificationCreateOrUpdateExecuted: false,
          tokenWriteExecuted: false,
          metricWriteExecuted: false,
          holderSnapshotWriteExecuted: false,
          schedulerOrSystemdExecuted: false,
        },
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
