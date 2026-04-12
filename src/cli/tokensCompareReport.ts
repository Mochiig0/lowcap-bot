import "dotenv/config";

import { db } from "./db.js";

type TokensCompareReportArgs = {
  rank?: string;
  source?: string;
  metadataStatus?: string;
  hardRejected?: boolean;
  hasMetrics?: boolean;
  minMetricsCount?: number;
  minEntryScoreTotal?: number;
  minCurrentScoreTotal?: number;
  sortBy?: SortField;
  sortOrder: SortOrder;
  limit: number;
};

type SortField =
  | "entryScoreTotal"
  | "currentScoreTotal"
  | "metricsCount"
  | "latestPeakFdv24h"
  | "latestMaxMultiple15m"
  | "latestTimeToPeakMinutes";

type SortOrder = "asc" | "desc";

type EntrySnapshotView = {
  scoreRank: string | null;
  scoreTotal: number | null;
};

type CompareReportItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  entryScoreRank: string | null;
  entryScoreTotal: number | null;
  currentScoreRank: string;
  currentScoreTotal: number;
  metricsCount: number;
  latestMetricObservedAt: string | null;
  latestPeakFdv24h: number | null;
  latestMaxMultiple15m: number | null;
  latestTimeToPeakMinutes: number | null;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm tokens:compare-report -- [--rank <RANK>] [--source <SOURCE>] [--metadataStatus <STATUS>] [--hardRejected <true|false>] [--hasMetrics <true|false>] [--minMetricsCount <N>] [--minEntryScoreTotal <NUM>] [--minCurrentScoreTotal <NUM>] [--sortBy <FIELD>] [--sortOrder <asc|desc>] [--limit 20]",
    ].join("\n"),
  );
  process.exit(1);
}

function parseLimitArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseBooleanArg(value: string, key: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  printUsageAndExit(`Invalid boolean for ${key}: ${value}`);
}

function parseNonNegativeIntArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseNumberArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseSortFieldArg(value: string, key: string): SortField {
  const sortFields: SortField[] = [
    "entryScoreTotal",
    "currentScoreTotal",
    "metricsCount",
    "latestPeakFdv24h",
    "latestMaxMultiple15m",
    "latestTimeToPeakMinutes",
  ];

  if (sortFields.includes(value as SortField)) {
    return value as SortField;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseSortOrderArg(value: string, key: string): SortOrder {
  if (value === "asc" || value === "desc") {
    return value;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseArgs(argv: string[]): TokensCompareReportArgs {
  const out: Partial<TokensCompareReportArgs> = {
    sortOrder: "desc",
    limit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--rank":
        out.rank = value === "" ? undefined : value;
        break;
      case "--source":
        out.source = value === "" ? undefined : value;
        break;
      case "--metadataStatus":
        out.metadataStatus = value === "" ? undefined : value;
        break;
      case "--hardRejected":
        out.hardRejected = parseBooleanArg(value, key);
        break;
      case "--hasMetrics":
        out.hasMetrics = parseBooleanArg(value, key);
        break;
      case "--minMetricsCount":
        out.minMetricsCount = parseNonNegativeIntArg(value, key);
        break;
      case "--minEntryScoreTotal":
        out.minEntryScoreTotal = parseNumberArg(value, key);
        break;
      case "--minCurrentScoreTotal":
        out.minCurrentScoreTotal = parseNumberArg(value, key);
        break;
      case "--sortBy":
        out.sortBy = parseSortFieldArg(value, key);
        break;
      case "--sortOrder":
        out.sortOrder = parseSortOrderArg(value, key);
        break;
      case "--limit":
        out.limit = parseLimitArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out as TokensCompareReportArgs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && !Number.isNaN(value) ? value : null;
}

function extractEntrySnapshotView(entrySnapshot: unknown): EntrySnapshotView {
  if (!isRecord(entrySnapshot)) {
    return {
      scoreRank: null,
      scoreTotal: null,
    };
  }

  return {
    scoreRank: readOptionalString(entrySnapshot.scoreRank),
    scoreTotal: readOptionalNumber(entrySnapshot.scoreTotal),
  };
}

function compareNullableNumbers(
  left: number | null,
  right: number | null,
  sortOrder: SortOrder,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  if (left === right) return 0;

  return sortOrder === "asc" ? left - right : right - left;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const tokens = await db.token.findMany({
    where: {
      ...(args.rank ? { scoreRank: args.rank } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.metadataStatus ? { metadataStatus: args.metadataStatus } : {}),
      ...(args.hardRejected !== undefined
        ? { hardRejected: args.hardRejected }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: args.limit,
    select: {
      mint: true,
      name: true,
      symbol: true,
      metadataStatus: true,
      scoreRank: true,
      scoreTotal: true,
      entrySnapshot: true,
      _count: {
        select: {
          metrics: true,
        },
      },
      metrics: {
        orderBy: [
          { observedAt: "desc" },
          { id: "desc" },
        ],
        take: 1,
        select: {
          observedAt: true,
          peakFdv24h: true,
          maxMultiple15m: true,
          timeToPeakMinutes: true,
        },
      },
    },
  });

  const items = tokens.map((token): CompareReportItem => {
    const entrySnapshot = extractEntrySnapshotView(token.entrySnapshot);
    const latestMetric = token.metrics[0] ?? null;

    return {
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      metadataStatus: token.metadataStatus,
      entryScoreRank: entrySnapshot.scoreRank,
      entryScoreTotal: entrySnapshot.scoreTotal,
      currentScoreRank: token.scoreRank,
      currentScoreTotal: token.scoreTotal,
      metricsCount: token._count.metrics,
      latestMetricObservedAt: latestMetric
        ? latestMetric.observedAt.toISOString()
        : null,
      latestPeakFdv24h: latestMetric?.peakFdv24h ?? null,
      latestMaxMultiple15m: latestMetric?.maxMultiple15m ?? null,
      latestTimeToPeakMinutes: latestMetric?.timeToPeakMinutes ?? null,
    };
  });

  const filteredItems = items.filter((item) => {
    if (args.hasMetrics === true && item.metricsCount === 0) {
      return false;
    }

    if (args.hasMetrics === false && item.metricsCount > 0) {
      return false;
    }

    if (
      args.minMetricsCount !== undefined &&
      item.metricsCount < args.minMetricsCount
    ) {
      return false;
    }

    if (
      args.minEntryScoreTotal !== undefined &&
      (item.entryScoreTotal === null ||
        item.entryScoreTotal < args.minEntryScoreTotal)
    ) {
      return false;
    }

    if (
      args.minCurrentScoreTotal !== undefined &&
      item.currentScoreTotal < args.minCurrentScoreTotal
    ) {
      return false;
    }

    return true;
  });

  if (args.sortBy) {
    const sortBy = args.sortBy;

    filteredItems.sort((left, right) => {
      const byTarget = compareNullableNumbers(
        left[sortBy],
        right[sortBy],
        args.sortOrder,
      );

      if (byTarget !== 0) {
        return byTarget;
      }

      return left.mint.localeCompare(right.mint);
    });
  }

  console.log(
    JSON.stringify(
      {
        count: tokens.length,
        filters: {
          rank: args.rank ?? null,
          source: args.source ?? null,
          metadataStatus: args.metadataStatus ?? null,
          hardRejected: args.hardRejected ?? null,
          hasMetrics: args.hasMetrics ?? null,
          minMetricsCount: args.minMetricsCount ?? null,
          minEntryScoreTotal: args.minEntryScoreTotal ?? null,
          minCurrentScoreTotal: args.minCurrentScoreTotal ?? null,
          sortBy: args.sortBy ?? null,
          sortOrder: args.sortOrder,
          limit: args.limit,
        },
        items: filteredItems,
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
