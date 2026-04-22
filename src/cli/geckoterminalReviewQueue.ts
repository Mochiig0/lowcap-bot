import "dotenv/config";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const DEFAULT_SINCE_HOURS = 24;
const DEFAULT_LIMIT = 5;
const DEFAULT_STALE_AFTER_HOURS = 6;

type Args = {
  sinceHours: number;
  limit: number;
  pumpOnly: boolean;
};

type JsonObject = Record<string, unknown>;

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

type QueueName =
  | "notifyCandidate"
  | "highPriorityRecent"
  | "staleReview"
  | "rescorePending"
  | "enrichPending"
  | "metricPending";

type PendingAgeBucket = "lte5m" | "lte15m" | "lte60m" | "gt60m";

type PendingAgeBucketCounts = Record<PendingAgeBucket, number>;

type PendingAgeMinutesSummary = {
  min: number;
  median: number;
  max: number;
};

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type SelectedToken = {
  id: number;
  mint: string;
  currentSource: string | null;
  originSource: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreRank: string;
  hardRejected: boolean;
  createdAt: string;
  importedAt: string;
  enrichedAt: string | null;
  rescoredAt: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
  hasFirstSeenSourceSnapshot: boolean;
  metricsCount: number;
  latestMetricObservedAt: string | null;
  latestMetricSource: string | null;
  reviewFlags: ReviewFlagsView | null;
  reviewFlagsCount: number;
};

type ReviewQueueItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  currentSource: string | null;
  originSource: string | null;
  metadataStatus: string;
  scoreRank: string;
  hardRejected: boolean;
  createdAt: string;
  importedAt: string;
  enrichedAt: string | null;
  rescoredAt: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  ageHours: number;
  pendingAgeMinutes: number;
  pendingAgeBucket: PendingAgeBucket;
  metricsCount: number;
  latestMetricObservedAt: string | null;
  latestMetricSource: string | null;
  reviewFlags: ReviewFlagsView | null;
  reviewFlagsCount: number;
  queuesMatched: QueueName[];
  reviewReasons: string[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm review:queue:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly]",
    ].join("\n"),
  );
  process.exit(1);
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

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = {
    sinceHours: DEFAULT_SINCE_HOURS,
    limit: DEFAULT_LIMIT,
    pumpOnly: false,
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
      case "--sinceHours":
        out.sinceHours = parsePositiveIntArg(value, key);
        break;
      case "--limit":
        out.limit = parsePositiveIntArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out as Args;
}

function readOptionalDateString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function extractFirstSeenSourceSnapshot(entrySnapshot: unknown): FirstSeenSourceSnapshot | null {
  if (!entrySnapshot || typeof entrySnapshot !== "object" || Array.isArray(entrySnapshot)) {
    return null;
  }

  const firstSeenSourceSnapshot = (entrySnapshot as JsonObject).firstSeenSourceSnapshot;
  if (
    !firstSeenSourceSnapshot ||
    typeof firstSeenSourceSnapshot !== "object" ||
    Array.isArray(firstSeenSourceSnapshot)
  ) {
    return null;
  }

  return firstSeenSourceSnapshot as FirstSeenSourceSnapshot;
}

function extractReviewFlags(reviewFlagsJson: unknown): ReviewFlagsView | null {
  if (!reviewFlagsJson || typeof reviewFlagsJson !== "object" || Array.isArray(reviewFlagsJson)) {
    return null;
  }

  const hasWebsite = (reviewFlagsJson as JsonObject).hasWebsite;
  const hasX = (reviewFlagsJson as JsonObject).hasX;
  const hasTelegram = (reviewFlagsJson as JsonObject).hasTelegram;
  const metaplexHit = (reviewFlagsJson as JsonObject).metaplexHit;
  const descriptionPresent = (reviewFlagsJson as JsonObject).descriptionPresent;
  const linkCount = (reviewFlagsJson as JsonObject).linkCount;

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

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreRank: string;
  hardRejected: boolean;
  createdAt: Date;
  importedAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  entrySnapshot: unknown;
  reviewFlagsJson: unknown;
  metrics: Array<{
    observedAt: Date;
    source: string | null;
  }>;
  _count: {
    metrics: number;
  };
}): SelectedToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDateString(firstSeen?.detectedAt);
  const latestMetric = token.metrics[0];
  const reviewFlags = extractReviewFlags(token.reviewFlagsJson);

  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.source,
    originSource: originSource ?? null,
    name: token.name,
    symbol: token.symbol,
    metadataStatus: token.metadataStatus,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    createdAt: token.createdAt.toISOString(),
    importedAt: token.importedAt.toISOString(),
    enrichedAt: token.enrichedAt?.toISOString() ?? null,
    rescoredAt: token.rescoredAt?.toISOString() ?? null,
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
    hasFirstSeenSourceSnapshot: firstSeen !== null,
    metricsCount: token._count.metrics,
    latestMetricObservedAt: latestMetric?.observedAt.toISOString() ?? null,
    latestMetricSource: latestMetric?.source ?? null,
    reviewFlags,
    reviewFlagsCount: countReviewFlags(reviewFlags),
  };
}

function hasFilledNameSymbol(token: SelectedToken): boolean {
  return Boolean(token.name?.trim()) && Boolean(token.symbol?.trim());
}

function isEnrichPending(token: SelectedToken): boolean {
  return token.metadataStatus === "mint_only" || !hasFilledNameSymbol(token);
}

function isRescorePending(token: SelectedToken): boolean {
  if (isEnrichPending(token) || token.enrichedAt === null) {
    return false;
  }

  if (token.rescoredAt === null) {
    return true;
  }

  return Date.parse(token.rescoredAt) < Date.parse(token.enrichedAt);
}

function isMetricPending(token: SelectedToken): boolean {
  return token.metricsCount === 0;
}

function isNotifyCandidate(token: SelectedToken): boolean {
  return token.scoreRank === "S" && !token.hardRejected;
}

function isHighPriorityRecent(token: SelectedToken): boolean {
  return !token.hardRejected && (token.scoreRank === "S" || token.scoreRank === "A");
}

function getAgeHours(selectionAnchorAt: string): number {
  return Number(((Date.now() - Date.parse(selectionAnchorAt)) / (60 * 60 * 1_000)).toFixed(2));
}

function getPendingAgeMinutes(selectionAnchorAt: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(selectionAnchorAt)) / 60_000));
}

function getPendingAgeBucket(pendingAgeMinutes: number): PendingAgeBucket {
  if (pendingAgeMinutes <= 5) {
    return "lte5m";
  }

  if (pendingAgeMinutes <= 15) {
    return "lte15m";
  }

  if (pendingAgeMinutes <= 60) {
    return "lte60m";
  }

  return "gt60m";
}

function createPendingAgeBucketCounts(): PendingAgeBucketCounts {
  return {
    lte5m: 0,
    lte15m: 0,
    lte60m: 0,
    gt60m: 0,
  };
}

function summarizePendingAgeBuckets(items: ReviewQueueItem[]): PendingAgeBucketCounts {
  return items.reduce<PendingAgeBucketCounts>((counts, item) => {
    counts[item.pendingAgeBucket] += 1;
    return counts;
  }, createPendingAgeBucketCounts());
}

function summarizePendingAgeMinutes(
  items: ReviewQueueItem[],
): PendingAgeMinutesSummary | null {
  if (items.length === 0) {
    return null;
  }

  const sortedMinutes = items
    .map((item) => item.pendingAgeMinutes)
    .sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedMinutes.length / 2);
  const median =
    sortedMinutes.length % 2 === 0
      ? Math.floor((sortedMinutes[middleIndex - 1] + sortedMinutes[middleIndex]) / 2)
      : sortedMinutes[middleIndex];

  return {
    min: sortedMinutes[0],
    median,
    max: sortedMinutes[sortedMinutes.length - 1],
  };
}

function buildReviewReasons(
  token: SelectedToken,
  staleAfterHours: number,
  ageHours: number,
): string[] {
  const reasons: string[] = [];

  if (isNotifyCandidate(token)) {
    reasons.push("notify_candidate_s_rank");
  }
  if (isHighPriorityRecent(token)) {
    reasons.push("high_priority_recent_rank");
  }
  if (isEnrichPending(token)) {
    reasons.push("enrich_pending");
  }
  if (isRescorePending(token)) {
    reasons.push("rescore_pending");
  }
  if (isMetricPending(token)) {
    reasons.push("metric_pending");
  }
  if (
    ageHours >= staleAfterHours &&
    (isEnrichPending(token) || isRescorePending(token) || isMetricPending(token))
  ) {
    reasons.push("stale_review");
  }

  return reasons;
}

function buildQueuesMatched(
  token: SelectedToken,
  staleAfterHours: number,
  ageHours: number,
): QueueName[] {
  const matched: QueueName[] = [];

  if (isNotifyCandidate(token)) {
    matched.push("notifyCandidate");
  }
  if (isHighPriorityRecent(token)) {
    matched.push("highPriorityRecent");
  }
  if (
    ageHours >= staleAfterHours &&
    (isEnrichPending(token) || isRescorePending(token) || isMetricPending(token))
  ) {
    matched.push("staleReview");
  }
  if (isRescorePending(token)) {
    matched.push("rescorePending");
  }
  if (isEnrichPending(token)) {
    matched.push("enrichPending");
  }
  if (isMetricPending(token)) {
    matched.push("metricPending");
  }

  return matched;
}

function buildReviewQueueItem(token: SelectedToken, staleAfterHours: number): ReviewQueueItem {
  const ageHours = getAgeHours(token.selectionAnchorAt);
  const pendingAgeMinutes = getPendingAgeMinutes(token.selectionAnchorAt);
  const queuesMatched = buildQueuesMatched(token, staleAfterHours, ageHours);

  return {
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    currentSource: token.currentSource,
    originSource: token.originSource,
    metadataStatus: token.metadataStatus,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    createdAt: token.createdAt,
    importedAt: token.importedAt,
    enrichedAt: token.enrichedAt,
    rescoredAt: token.rescoredAt,
    selectionAnchorAt: token.selectionAnchorAt,
    selectionAnchorKind: token.selectionAnchorKind,
    ageHours,
    pendingAgeMinutes,
    pendingAgeBucket: getPendingAgeBucket(pendingAgeMinutes),
    metricsCount: token.metricsCount,
    latestMetricObservedAt: token.latestMetricObservedAt,
    latestMetricSource: token.latestMetricSource,
    reviewFlags: token.reviewFlags,
    reviewFlagsCount: token.reviewFlagsCount,
    queuesMatched,
    reviewReasons: buildReviewReasons(token, staleAfterHours, ageHours),
  };
}

function sortBySelectionAnchorDesc(
  left: ReviewQueueItem,
  right: ReviewQueueItem,
): number {
  const leftTime = Date.parse(left.selectionAnchorAt);
  const rightTime = Date.parse(right.selectionAnchorAt);

  if (rightTime !== leftTime) {
    return rightTime - leftTime;
  }

  return right.mint.localeCompare(left.mint);
}

function sortByAgeDesc(left: ReviewQueueItem, right: ReviewQueueItem): number {
  if (right.ageHours !== left.ageHours) {
    return right.ageHours - left.ageHours;
  }

  return sortBySelectionAnchorDesc(left, right);
}

function limitItems(items: ReviewQueueItem[], limit: number): ReviewQueueItem[] {
  return items.slice(0, limit);
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const sinceCutoff = new Date(Date.now() - args.sinceHours * 60 * 60 * 1_000);
  const staleAfterHours = Math.max(1, Math.min(DEFAULT_STALE_AFTER_HOURS, args.sinceHours));

  const rawTokens = await db.token.findMany({
    where: {
      createdAt: {
        gte: sinceCutoff,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      mint: true,
      source: true,
      name: true,
      symbol: true,
      metadataStatus: true,
      scoreRank: true,
      hardRejected: true,
      createdAt: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
      reviewFlagsJson: true,
      metrics: {
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          observedAt: true,
          source: true,
        },
      },
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const selectedTokens = rawTokens
    .map(buildSelectedToken)
    .filter((token) => token.isGeckoterminalOrigin)
    .filter((token) => Date.parse(token.selectionAnchorAt) >= sinceCutoff.getTime());
  const filteredTokens = args.pumpOnly
    ? selectedTokens.filter((token) => isPumpMint(token.mint))
    : selectedTokens;
  const skippedNonPumpCount = selectedTokens.length - filteredTokens.length;
  const sortedTokens = filteredTokens
    .sort((left, right) => {
      const leftTime = Date.parse(left.selectionAnchorAt);
      const rightTime = Date.parse(right.selectionAnchorAt);

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.id - left.id;
    });

  const reviewItems = sortedTokens.map((token) => buildReviewQueueItem(token, staleAfterHours));

  const notifyCandidates = reviewItems
    .filter((item) => item.queuesMatched.includes("notifyCandidate"))
    .sort(sortBySelectionAnchorDesc);
  const highPriorityRecent = reviewItems
    .filter((item) => item.queuesMatched.includes("highPriorityRecent"))
    .sort(sortBySelectionAnchorDesc);
  const staleReview = reviewItems
    .filter((item) => item.queuesMatched.includes("staleReview"))
    .sort(sortByAgeDesc);
  const rescorePending = reviewItems
    .filter((item) => item.queuesMatched.includes("rescorePending"))
    .sort(sortBySelectionAnchorDesc);
  const enrichPending = reviewItems
    .filter((item) => item.queuesMatched.includes("enrichPending"))
    .sort(sortBySelectionAnchorDesc);
  const metricPending = reviewItems
    .filter((item) => item.queuesMatched.includes("metricPending"))
    .sort(sortBySelectionAnchorDesc);
  const enrichPendingAgeBuckets = summarizePendingAgeBuckets(enrichPending);
  const metricPendingAgeBuckets = summarizePendingAgeBuckets(metricPending);
  const enrichPendingAgeMinutesSummary = summarizePendingAgeMinutes(enrichPending);
  const metricPendingAgeMinutesSummary = summarizePendingAgeMinutes(metricPending);

  const preview = reviewItems
    .filter((item) => item.queuesMatched.length > 0)
    .sort((left, right) => {
      const leftPriority = left.queuesMatched.length === 0 ? Number.MAX_SAFE_INTEGER : [
        "notifyCandidate",
        "highPriorityRecent",
        "staleReview",
        "rescorePending",
        "enrichPending",
        "metricPending",
      ].indexOf(left.queuesMatched[0] ?? "metricPending");
      const rightPriority = right.queuesMatched.length === 0 ? Number.MAX_SAFE_INTEGER : [
        "notifyCandidate",
        "highPriorityRecent",
        "staleReview",
        "rescorePending",
        "enrichPending",
        "metricPending",
      ].indexOf(right.queuesMatched[0] ?? "metricPending");

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return sortBySelectionAnchorDesc(left, right);
    });

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
        selection: {
          sinceHours: args.sinceHours,
          limit: args.limit,
          pumpOnly: args.pumpOnly,
          staleAfterHours,
          sinceCutoff: sinceCutoff.toISOString(),
          geckoOriginTokenCount: reviewItems.length,
          skippedNonPumpCount,
        },
        summary: {
          geckoOriginTokenCount: reviewItems.length,
          firstSeenSourceSnapshotCount: sortedTokens.filter(
            (token) => token.hasFirstSeenSourceSnapshot,
          ).length,
          enrichPendingCount: enrichPending.length,
          rescorePendingCount: rescorePending.length,
          metricPendingCount: metricPending.length,
          enrichPendingAgeBuckets,
          metricPendingAgeBuckets,
          enrichPendingAgeMinutesSummary,
          metricPendingAgeMinutesSummary,
          notifyCandidateCount: notifyCandidates.length,
          staleReviewCount: staleReview.length,
          highPriorityRecentCount: highPriorityRecent.length,
        },
        queues: {
          notifyCandidate: limitItems(notifyCandidates, args.limit),
          highPriorityRecent: limitItems(highPriorityRecent, args.limit),
          staleReview: limitItems(staleReview, args.limit),
          rescorePending: limitItems(rescorePending, args.limit),
          enrichPending: limitItems(enrichPending, args.limit),
          metricPending: limitItems(metricPending, args.limit),
        },
        preview: limitItems(preview, args.limit),
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
