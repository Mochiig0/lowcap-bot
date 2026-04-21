import "dotenv/config";

import { db } from "./db.js";

type TokensCompareReportArgs = {
  rank?: string;
  source?: string;
  metadataStatus?: string;
  hardRejected?: boolean;
  outcomeBucket?: OutcomeBucket;
  outcomeBucketReason?: OutcomeBucketReason;
  interestingFlagsOnly: boolean;
  hasWebsite?: boolean;
  hasX?: boolean;
  hasTelegram?: boolean;
  metaplexHit?: boolean;
  hasMetrics?: boolean;
  entryVsCurrentChanged?: boolean;
  changedField?: ChangedField;
  minChangedFieldsCount?: number;
  minMetricsCount?: number;
  minEntryScoreTotal?: number;
  minCurrentScoreTotal?: number;
  entryScoreRank?: ScoreRank;
  currentScoreRank?: ScoreRank;
  sortBy?: SortField;
  sortOrder: SortOrder;
  limit: number;
};

type ScoreRank = "S" | "A" | "B" | "C";
type ChangedField =
  | "name"
  | "symbol"
  | "description"
  | "scoreTotal"
  | "scoreRank"
  | "hardRejected"
  | "hardRejectReason";

type SortField =
  | "entryScoreTotal"
  | "currentScoreTotal"
  | "changedFieldsCount"
  | "metricsCount"
  | "latestPeakFdv24h"
  | "latestMaxMultiple15m"
  | "latestTimeToPeakMinutes";

type SortOrder = "asc" | "desc";

type EntrySnapshotView = {
  name: string | null;
  symbol: string | null;
  description: string | null;
  scoreRank: string | null;
  scoreTotal: number | null;
  hardRejected: boolean | null;
  hardRejectReason: string | null;
};

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type InterestingFlagsView = {
  hasWebsite: boolean;
  descriptionPresent: boolean;
  metaplexHit: boolean;
};

type OutcomeBucket = "winner" | "non_winner" | "unresolved";
type OutcomeBucketReason =
  | "no_metric"
  | "multiple_missing"
  | "multiple_gte_threshold"
  | "multiple_below_threshold";

type CompareReportItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  interestingFlags: InterestingFlagsView | null;
  outcomeBucket: OutcomeBucket;
  outcomeBucketReason: OutcomeBucketReason;
  entryScoreRank: string | null;
  entryScoreTotal: number | null;
  currentScoreRank: string;
  currentScoreTotal: number;
  entryVsCurrentChanged: boolean;
  changedFields: ChangedField[];
  changedFieldsCount: number;
  metricsCount: number;
  reviewFlags: ReviewFlagsView | null;
  reviewFlagsCount: number;
  latestMetricObservedAt: string | null;
  latestPeakFdv24h: number | null;
  latestMaxMultiple15m: number | null;
  latestTimeToPeakMinutes: number | null;
};

const WORKING_WINNER_MAX_MULTIPLE_15M = 2;

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm tokens:compare-report -- [--rank <RANK>] [--source <SOURCE>] [--metadataStatus <STATUS>] [--hardRejected <true|false>] [--outcomeBucket <winner|non_winner|unresolved>] [--outcomeBucketReason <no_metric|multiple_missing|multiple_gte_threshold|multiple_below_threshold>] [--interestingFlagsOnly] [--hasWebsite <true|false>] [--hasX <true|false>] [--hasTelegram <true|false>] [--metaplexHit <true|false>] [--hasMetrics <true|false>] [--entryVsCurrentChanged <true|false>] [--changedField <FIELD>] [--minChangedFieldsCount <N>] [--minMetricsCount <N>] [--minEntryScoreTotal <NUM>] [--minCurrentScoreTotal <NUM>] [--entryScoreRank <S|A|B|C>] [--currentScoreRank <S|A|B|C>] [--sortBy <FIELD>] [--sortOrder <asc|desc>] [--limit 20]",
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
    "changedFieldsCount",
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

function parseScoreRankArg(value: string, key: string): ScoreRank {
  const scoreRanks: ScoreRank[] = ["S", "A", "B", "C"];

  if (scoreRanks.includes(value as ScoreRank)) {
    return value as ScoreRank;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseChangedFieldArg(value: string, key: string): ChangedField {
  const changedFields: ChangedField[] = [
    "name",
    "symbol",
    "description",
    "scoreTotal",
    "scoreRank",
    "hardRejected",
    "hardRejectReason",
  ];

  if (changedFields.includes(value as ChangedField)) {
    return value as ChangedField;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseOutcomeBucketArg(value: string, key: string): OutcomeBucket {
  const buckets: OutcomeBucket[] = ["winner", "non_winner", "unresolved"];

  if (buckets.includes(value as OutcomeBucket)) {
    return value as OutcomeBucket;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseOutcomeBucketReasonArg(
  value: string,
  key: string,
): OutcomeBucketReason {
  const reasons: OutcomeBucketReason[] = [
    "no_metric",
    "multiple_missing",
    "multiple_gte_threshold",
    "multiple_below_threshold",
  ];

  if (reasons.includes(value as OutcomeBucketReason)) {
    return value as OutcomeBucketReason;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseArgs(argv: string[]): TokensCompareReportArgs {
  const out: Partial<TokensCompareReportArgs> = {
    interestingFlagsOnly: false,
    sortOrder: "desc",
    limit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (key === "--interestingFlagsOnly") {
      out.interestingFlagsOnly = true;
      continue;
    }
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
      case "--outcomeBucket":
        out.outcomeBucket = parseOutcomeBucketArg(value, key);
        break;
      case "--outcomeBucketReason":
        out.outcomeBucketReason = parseOutcomeBucketReasonArg(value, key);
        break;
      case "--hasWebsite":
        out.hasWebsite = parseBooleanArg(value, key);
        break;
      case "--hasX":
        out.hasX = parseBooleanArg(value, key);
        break;
      case "--hasTelegram":
        out.hasTelegram = parseBooleanArg(value, key);
        break;
      case "--metaplexHit":
        out.metaplexHit = parseBooleanArg(value, key);
        break;
      case "--hasMetrics":
        out.hasMetrics = parseBooleanArg(value, key);
        break;
      case "--entryVsCurrentChanged":
        out.entryVsCurrentChanged = parseBooleanArg(value, key);
        break;
      case "--changedField":
        out.changedField = parseChangedFieldArg(value, key);
        break;
      case "--minChangedFieldsCount":
        out.minChangedFieldsCount = parseNonNegativeIntArg(value, key);
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
      case "--entryScoreRank":
        out.entryScoreRank = parseScoreRankArg(value, key);
        break;
      case "--currentScoreRank":
        out.currentScoreRank = parseScoreRankArg(value, key);
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

function extractReviewFlags(reviewFlagsJson: unknown): ReviewFlagsView | null {
  if (!isRecord(reviewFlagsJson)) {
    return null;
  }

  const hasWebsite = reviewFlagsJson.hasWebsite;
  const hasX = reviewFlagsJson.hasX;
  const hasTelegram = reviewFlagsJson.hasTelegram;
  const metaplexHit = reviewFlagsJson.metaplexHit;
  const descriptionPresent = reviewFlagsJson.descriptionPresent;
  const linkCount = reviewFlagsJson.linkCount;

  if (
    typeof hasWebsite !== "boolean" ||
    typeof hasX !== "boolean" ||
    typeof hasTelegram !== "boolean" ||
    typeof metaplexHit !== "boolean" ||
    typeof descriptionPresent !== "boolean" ||
    typeof linkCount !== "number" ||
    !Number.isInteger(linkCount) ||
    linkCount < 0
  ) {
    return null;
  }

  return {
    hasWebsite,
    hasX,
    hasTelegram,
    metaplexHit,
    descriptionPresent,
    linkCount,
  };
}

function countReviewFlags(reviewFlags: ReviewFlagsView | null): number {
  if (reviewFlags === null) {
    return 0;
  }

  return [
    reviewFlags.hasWebsite,
    reviewFlags.hasX,
    reviewFlags.hasTelegram,
    reviewFlags.metaplexHit,
    reviewFlags.descriptionPresent,
    reviewFlags.linkCount > 0,
  ].filter(Boolean).length;
}

function extractInterestingFlags(reviewFlags: ReviewFlagsView | null): InterestingFlagsView | null {
  if (reviewFlags === null) {
    return null;
  }

  return {
    hasWebsite: reviewFlags.hasWebsite,
    descriptionPresent: reviewFlags.descriptionPresent,
    metaplexHit: reviewFlags.metaplexHit,
  };
}

function deriveOutcomeBucket(
  metricsCount: number,
  latestMaxMultiple15m: number | null,
): {
  outcomeBucket: OutcomeBucket;
  outcomeBucketReason: OutcomeBucketReason;
} {
  if (metricsCount === 0) {
    return {
      outcomeBucket: "unresolved",
      outcomeBucketReason: "no_metric",
    };
  }

  if (latestMaxMultiple15m === null) {
    return {
      outcomeBucket: "unresolved",
      outcomeBucketReason: "multiple_missing",
    };
  }

  if (latestMaxMultiple15m >= WORKING_WINNER_MAX_MULTIPLE_15M) {
    return {
      outcomeBucket: "winner",
      outcomeBucketReason: "multiple_gte_threshold",
    };
  }

  return {
    outcomeBucket: "non_winner",
    outcomeBucketReason: "multiple_below_threshold",
  };
}

function extractEntrySnapshotView(entrySnapshot: unknown): EntrySnapshotView {
  if (!isRecord(entrySnapshot)) {
    return {
      name: null,
      symbol: null,
      description: null,
      scoreRank: null,
      scoreTotal: null,
      hardRejected: null,
      hardRejectReason: null,
    };
  }

  return {
    name: readOptionalString(entrySnapshot.name),
    symbol: readOptionalString(entrySnapshot.symbol),
    description: readOptionalString(entrySnapshot.description),
    scoreRank: readOptionalString(entrySnapshot.scoreRank),
    scoreTotal: readOptionalNumber(entrySnapshot.scoreTotal),
    hardRejected:
      typeof entrySnapshot.hardRejected === "boolean"
        ? entrySnapshot.hardRejected
        : null,
    hardRejectReason: readOptionalString(entrySnapshot.hardRejectReason),
  };
}

type CurrentCompareView = {
  name: string | null;
  symbol: string | null;
  description: string | null;
  scoreTotal: number | null;
  scoreRank: string | null;
  hardRejected: boolean | null;
  hardRejectReason: string | null;
};

function listChangedFields(
  entrySnapshot: EntrySnapshotView,
  currentToken: CurrentCompareView,
): ChangedField[] {
  const fields: ChangedField[] = [
    "name",
    "symbol",
    "description",
    "scoreTotal",
    "scoreRank",
    "hardRejected",
    "hardRejectReason",
  ];

  return fields.filter((field) => entrySnapshot[field] !== currentToken[field]);
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

  const where = {
    ...(args.rank ? { scoreRank: args.rank } : {}),
    ...(args.source ? { source: args.source } : {}),
    ...(args.metadataStatus ? { metadataStatus: args.metadataStatus } : {}),
    ...(args.hardRejected !== undefined
      ? { hardRejected: args.hardRejected }
      : {}),
  };

  const [preFilterCount, tokens] = await Promise.all([
    db.token.count({ where }),
    db.token.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        mint: true,
        name: true,
        symbol: true,
        description: true,
        metadataStatus: true,
        hardRejected: true,
        hardRejectReason: true,
        scoreRank: true,
        scoreTotal: true,
        entrySnapshot: true,
        reviewFlagsJson: true,
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
    }),
  ]);

  const items = tokens.map((token): CompareReportItem => {
    const entrySnapshot = extractEntrySnapshotView(token.entrySnapshot);
    const latestMetric = token.metrics[0] ?? null;
    const reviewFlags = extractReviewFlags(token.reviewFlagsJson);
    const outcomeBucket = deriveOutcomeBucket(
      token._count.metrics,
      latestMetric?.maxMultiple15m ?? null,
    );
    const changedFields = listChangedFields(entrySnapshot, {
      name: token.name,
      symbol: token.symbol,
      description: token.description,
      scoreTotal: token.scoreTotal,
      scoreRank: token.scoreRank,
      hardRejected: token.hardRejected,
      hardRejectReason: token.hardRejectReason,
    });
    const changedFieldsCount = changedFields.length;

    return {
      mint: token.mint,
      name: token.name,
      symbol: token.symbol,
      metadataStatus: token.metadataStatus,
      interestingFlags: extractInterestingFlags(reviewFlags),
      outcomeBucket: outcomeBucket.outcomeBucket,
      outcomeBucketReason: outcomeBucket.outcomeBucketReason,
      entryScoreRank: entrySnapshot.scoreRank,
      entryScoreTotal: entrySnapshot.scoreTotal,
      currentScoreRank: token.scoreRank,
      currentScoreTotal: token.scoreTotal,
      entryVsCurrentChanged: changedFieldsCount > 0,
      changedFields,
      changedFieldsCount,
      metricsCount: token._count.metrics,
      reviewFlags,
      reviewFlagsCount: countReviewFlags(reviewFlags),
      latestMetricObservedAt: latestMetric
        ? latestMetric.observedAt.toISOString()
        : null,
      latestPeakFdv24h: latestMetric?.peakFdv24h ?? null,
      latestMaxMultiple15m: latestMetric?.maxMultiple15m ?? null,
      latestTimeToPeakMinutes: latestMetric?.timeToPeakMinutes ?? null,
    };
  });

  const filteredItems = items.filter((item) => {
    if (
      args.interestingFlagsOnly &&
      (item.interestingFlags === null ||
        (!item.interestingFlags.hasWebsite &&
          !item.interestingFlags.descriptionPresent &&
          !item.interestingFlags.metaplexHit))
    ) {
      return false;
    }

    if (
      args.outcomeBucket !== undefined &&
      item.outcomeBucket !== args.outcomeBucket
    ) {
      return false;
    }

    if (
      args.outcomeBucketReason !== undefined &&
      item.outcomeBucketReason !== args.outcomeBucketReason
    ) {
      return false;
    }

    if (
      args.hasWebsite !== undefined &&
      (item.reviewFlags === null || item.reviewFlags.hasWebsite !== args.hasWebsite)
    ) {
      return false;
    }

    if (args.hasX !== undefined && (item.reviewFlags === null || item.reviewFlags.hasX !== args.hasX)) {
      return false;
    }

    if (
      args.hasTelegram !== undefined &&
      (item.reviewFlags === null || item.reviewFlags.hasTelegram !== args.hasTelegram)
    ) {
      return false;
    }

    if (
      args.metaplexHit !== undefined &&
      (item.reviewFlags === null || item.reviewFlags.metaplexHit !== args.metaplexHit)
    ) {
      return false;
    }

    if (args.hasMetrics === true && item.metricsCount === 0) {
      return false;
    }

    if (args.hasMetrics === false && item.metricsCount > 0) {
      return false;
    }

    if (
      args.entryVsCurrentChanged !== undefined &&
      item.entryVsCurrentChanged !== args.entryVsCurrentChanged
    ) {
      return false;
    }

    if (
      args.changedField !== undefined &&
      !item.changedFields.includes(args.changedField)
    ) {
      return false;
    }

    if (
      args.minChangedFieldsCount !== undefined &&
      item.changedFieldsCount < args.minChangedFieldsCount
    ) {
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

    if (
      args.entryScoreRank !== undefined &&
      item.entryScoreRank !== args.entryScoreRank
    ) {
      return false;
    }

    if (
      args.currentScoreRank !== undefined &&
      item.currentScoreRank !== args.currentScoreRank
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

  const limitedItems = filteredItems.slice(0, args.limit);

  console.log(
    JSON.stringify(
      {
        count: Math.min(preFilterCount, args.limit),
        preFilterCount,
        filteredCount: limitedItems.length,
        filters: {
          rank: args.rank ?? null,
          source: args.source ?? null,
          metadataStatus: args.metadataStatus ?? null,
          hardRejected: args.hardRejected ?? null,
          outcomeBucket: args.outcomeBucket ?? null,
          outcomeBucketReason: args.outcomeBucketReason ?? null,
          interestingFlagsOnly: args.interestingFlagsOnly,
          hasWebsite: args.hasWebsite ?? null,
          hasX: args.hasX ?? null,
          hasTelegram: args.hasTelegram ?? null,
          metaplexHit: args.metaplexHit ?? null,
          hasMetrics: args.hasMetrics ?? null,
          entryVsCurrentChanged: args.entryVsCurrentChanged ?? null,
          changedField: args.changedField ?? null,
          minChangedFieldsCount: args.minChangedFieldsCount ?? null,
          minMetricsCount: args.minMetricsCount ?? null,
          minEntryScoreTotal: args.minEntryScoreTotal ?? null,
          minCurrentScoreTotal: args.minCurrentScoreTotal ?? null,
          entryScoreRank: args.entryScoreRank ?? null,
          currentScoreRank: args.currentScoreRank ?? null,
          sortBy: args.sortBy ?? null,
          sortOrder: args.sortOrder,
          limit: args.limit,
        },
        items: limitedItems,
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
