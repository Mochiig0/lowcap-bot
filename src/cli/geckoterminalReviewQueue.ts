import "dotenv/config";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const DEFAULT_SINCE_HOURS = 24;
const DEFAULT_LIMIT = 5;
const DEFAULT_STALE_AFTER_HOURS = 6;
const OLDEST_PENDING_PREVIEW_LIMIT = 3;
const NOTIFY_REQUIRED_RANK = "S" as const;
const S_RANK_MIN = 8;

type Args = {
  sinceHours: number;
  limit: number;
  pumpOnly: boolean;
  includeBlockers: boolean;
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

type NotifyCandidateBlocker = "rank_not_s" | "hard_rejected";

type RankGapToNotify = {
  currentRank: string;
  requiredRank: "S";
  currentScore: number;
  summary: string;
};

type NotifyCandidateVisibility = {
  notifyCandidateEligible: boolean;
  notifyCandidateBlockers: NotifyCandidateBlocker[];
  rankGapToNotify: RankGapToNotify | null;
  hardRejectReason: string | null;
  notificationCount: number;
  holderSnapshotCount: number;
};

type NotifyCandidateBlockerDistribution = Record<NotifyCandidateBlocker, number>;

type ReviewFlagsPresenceDistribution = {
  hasWebsite: number;
  hasX: number;
  hasTelegram: number;
  metaplexHit: number;
  descriptionPresent: number;
  linkPresent: number;
};

type ScoreComponentTotals = {
  core: number;
  learned: number;
  trend: number;
  combo: number;
};

type SafeScoreBreakdownSummary = {
  available: boolean;
  componentTotals: ScoreComponentTotals;
  hitSourceCounts: Record<string, number>;
  hitTagCounts: Record<string, number>;
};

type RankGapSummary = {
  requiredNotifyRank: "S";
  notifyThresholdDescription: string;
  rankGapDistribution: Record<string, number>;
  maxObservedRank: string | null;
  maxObservedScoreTotal: number | null;
  closestToNotifyCount: number;
};

type WatchlistSummary = {
  watchlistCandidateCount: number;
  watchlistCriteria: {
    scoreRanks: Array<"A" | "B">;
    hardRejected: false;
    notificationCandidate: false;
    readOnly: true;
  };
  watchlistRankDistribution: Record<string, number>;
  watchlistScoreTotalDistribution: Record<string, number>;
  watchlistMetricCoverage: Record<string, number>;
  watchlistReviewFlagsPresence: ReviewFlagsPresenceDistribution;
  representativeSamples: Array<{
    id: number;
    mintAbbrev: string;
    scoreRank: string;
    scoreTotal: number;
    hardRejected: boolean;
    metricsCount: number;
    reviewFlags: ReviewFlagsView | null;
  }>;
};

type ScoreBreakdownVisibilitySummary = {
  scoreBreakdownAvailable: boolean;
  availableCount: number;
  unavailableCount: number;
  componentTotalSums: ScoreComponentTotals;
  hitSourceDistribution: Record<string, number>;
  hitTagDistribution: Record<string, number>;
};

type SelectedToken = {
  id: number;
  mint: string;
  currentSource: string | null;
  originSource: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreTotal: number;
  scoreRank: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
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
  notificationCount: number;
  holderSnapshotCount: number;
  scoreBreakdownSummary: SafeScoreBreakdownSummary;
};

type ReviewQueueItem = {
  id: number;
  mint: string;
  name: string | null;
  symbol: string | null;
  currentSource: string | null;
  originSource: string | null;
  metadataStatus: string;
  scoreTotal: number;
  scoreRank: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
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
  notificationCount?: number;
  holderSnapshotCount?: number;
  notifyCandidateEligible?: boolean;
  notifyCandidateBlockers?: NotifyCandidateBlocker[];
  rankGapToNotify?: RankGapToNotify | null;
  notifyCandidateRule?: "scoreRank === S && hardRejected === false";
  scoreBreakdownSummary?: SafeScoreBreakdownSummary;
  queuesMatched: QueueName[];
  reviewReasons: string[];
};

type OldestPendingPreviewItem = {
  mint: string;
  metadataStatus: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  pendingAgeMinutes: number;
  pendingAgeBucket: PendingAgeBucket;
  queuesMatched: QueueName[];
  reviewFlagsCount: number;
  reviewFlags: ReviewFlagsView | null;
  notificationCount?: number;
  holderSnapshotCount?: number;
  notifyCandidateBlockers?: NotifyCandidateBlocker[];
  rankGapToNotify?: RankGapToNotify | null;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm review:queue:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly] [--includeBlockers]",
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
    includeBlockers: false,
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

    if (key === "--includeBlockers") {
      out.includeBlockers = true;
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

function createZeroComponentTotals(): ScoreComponentTotals {
  return {
    core: 0,
    learned: 0,
    trend: 0,
    combo: 0,
  };
}

function createEmptyScoreBreakdownSummary(): SafeScoreBreakdownSummary {
  return {
    available: false,
    componentTotals: createZeroComponentTotals(),
    hitSourceCounts: {},
    hitTagCounts: {},
  };
}

function readScoreComponentTotals(value: unknown): ScoreComponentTotals | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const object = value as JsonObject;
  const keys: Array<keyof ScoreComponentTotals> = ["core", "learned", "trend", "combo"];
  const totals = createZeroComponentTotals();

  for (const key of keys) {
    const raw = object[key];
    if (raw === undefined) {
      continue;
    }
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      return null;
    }
    totals[key] = raw;
  }

  return totals;
}

function safeCategory(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,64}$/.test(normalized)) {
    return "other";
  }

  return normalized;
}

function extractSafeScoreBreakdown(scoreBreakdown: unknown): SafeScoreBreakdownSummary {
  if (!scoreBreakdown || typeof scoreBreakdown !== "object" || Array.isArray(scoreBreakdown)) {
    return createEmptyScoreBreakdownSummary();
  }

  const object = scoreBreakdown as JsonObject;
  const componentTotals = readScoreComponentTotals(object.totals);
  if (componentTotals === null) {
    return createEmptyScoreBreakdownSummary();
  }

  const hitSourceCounts: Record<string, number> = {};
  const hitTagCounts: Record<string, number> = {};
  const hits = Array.isArray(object.hits) ? object.hits : [];

  for (const hit of hits) {
    if (!hit || typeof hit !== "object" || Array.isArray(hit)) {
      continue;
    }

    const hitObject = hit as JsonObject;
    const source = safeCategory(hitObject.source);
    if (source !== null) {
      incrementCount(hitSourceCounts, source);
    }

    const tag = safeCategory(hitObject.tag);
    if (tag !== null) {
      incrementCount(hitTagCounts, tag);
    }
  }

  return {
    available: true,
    componentTotals,
    hitSourceCounts,
    hitTagCounts,
  };
}

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreRank: string;
  scoreTotal: number;
  hardRejected: boolean;
  hardRejectReason: string | null;
  createdAt: Date;
  importedAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  entrySnapshot: unknown;
  reviewFlagsJson: unknown;
  scoreBreakdown: unknown;
  metrics: Array<{
    observedAt: Date;
    source: string | null;
  }>;
  _count: {
    metrics: number;
    holderSnapshots?: number;
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
    scoreTotal: token.scoreTotal,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    hardRejectReason: token.hardRejectReason,
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
    notificationCount: 0,
    holderSnapshotCount: token._count.holderSnapshots ?? 0,
    scoreBreakdownSummary: extractSafeScoreBreakdown(token.scoreBreakdown),
  };
}

async function attachNotificationCounts(tokens: SelectedToken[]): Promise<SelectedToken[]> {
  if (tokens.length === 0) {
    return tokens;
  }

  const counts = await db.notification.groupBy({
    by: ["tokenId"],
    where: {
      tokenId: {
        in: tokens.map((token) => token.id),
      },
    },
    _count: {
      _all: true,
    },
  });
  const countByTokenId = new Map(
    counts
      .filter((item): item is typeof item & { tokenId: number } => item.tokenId !== null)
      .map((item) => [item.tokenId, item._count._all]),
  );

  return tokens.map((token) => ({
    ...token,
    notificationCount: countByTokenId.get(token.id) ?? 0,
  }));
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

function isWatchlistCandidate(token: Pick<SelectedToken, "scoreRank" | "hardRejected">): boolean {
  return !token.hardRejected && (token.scoreRank === "A" || token.scoreRank === "B");
}

function buildNotifyCandidateBlockers(token: SelectedToken): NotifyCandidateBlocker[] {
  const blockers: NotifyCandidateBlocker[] = [];

  if (token.scoreRank !== "S") {
    blockers.push("rank_not_s");
  }
  if (token.hardRejected) {
    blockers.push("hard_rejected");
  }

  return blockers;
}

function buildRankGapToNotify(token: SelectedToken): RankGapToNotify | null {
  if (token.scoreRank === "S") {
    return null;
  }

  return {
    currentRank: token.scoreRank,
    requiredRank: NOTIFY_REQUIRED_RANK,
    currentScore: token.scoreTotal,
    summary: `needs S rank; current ${token.scoreRank}/${token.scoreTotal}`,
  };
}

function buildNotifyCandidateVisibility(token: SelectedToken): NotifyCandidateVisibility {
  return {
    notifyCandidateEligible: isNotifyCandidate(token),
    notifyCandidateBlockers: buildNotifyCandidateBlockers(token),
    rankGapToNotify: buildRankGapToNotify(token),
    hardRejectReason: token.hardRejectReason,
    notificationCount: token.notificationCount,
    holderSnapshotCount: token.holderSnapshotCount,
  };
}

function isHighPriorityRecent(token: SelectedToken): boolean {
  return !token.hardRejected && (token.scoreRank === "S" || token.scoreRank === "A");
}

function rankPriority(rank: string): number {
  switch (rank) {
    case "S":
      return 4;
    case "A":
      return 3;
    case "B":
      return 2;
    case "C":
      return 1;
    default:
      return 0;
  }
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

function buildReviewQueueItem(
  token: SelectedToken,
  staleAfterHours: number,
  includeBlockers: boolean,
): ReviewQueueItem {
  const ageHours = getAgeHours(token.selectionAnchorAt);
  const pendingAgeMinutes = getPendingAgeMinutes(token.selectionAnchorAt);
  const queuesMatched = buildQueuesMatched(token, staleAfterHours, ageHours);
  const notifyVisibility = includeBlockers ? buildNotifyCandidateVisibility(token) : null;

  return {
    id: token.id,
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    currentSource: token.currentSource,
    originSource: token.originSource,
    metadataStatus: token.metadataStatus,
    scoreTotal: token.scoreTotal,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    hardRejectReason: token.hardRejectReason,
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
    ...(notifyVisibility
      ? {
          notificationCount: notifyVisibility.notificationCount,
          holderSnapshotCount: notifyVisibility.holderSnapshotCount,
          notifyCandidateEligible: notifyVisibility.notifyCandidateEligible,
          notifyCandidateBlockers: notifyVisibility.notifyCandidateBlockers,
          rankGapToNotify: notifyVisibility.rankGapToNotify,
          notifyCandidateRule: "scoreRank === S && hardRejected === false" as const,
          scoreBreakdownSummary: token.scoreBreakdownSummary,
        }
      : {}),
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

function sortByPendingAgeDesc(left: ReviewQueueItem, right: ReviewQueueItem): number {
  if (right.pendingAgeMinutes !== left.pendingAgeMinutes) {
    return right.pendingAgeMinutes - left.pendingAgeMinutes;
  }

  const leftTime = Date.parse(left.selectionAnchorAt);
  const rightTime = Date.parse(right.selectionAnchorAt);
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return left.mint.localeCompare(right.mint);
}

function limitItems(items: ReviewQueueItem[], limit: number): ReviewQueueItem[] {
  return items.slice(0, limit);
}

function incrementCount<T extends string>(counts: Record<T, number>, key: T): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function incrementNumberKeyCount(counts: Record<string, number>, value: number): void {
  const key = String(value);
  counts[key] = (counts[key] ?? 0) + 1;
}

function addComponentTotals(target: ScoreComponentTotals, source: ScoreComponentTotals): void {
  target.core += source.core;
  target.learned += source.learned;
  target.trend += source.trend;
  target.combo += source.combo;
}

function addRecordCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function buildReviewFlagsPresenceDistribution(items: ReviewQueueItem[]): ReviewFlagsPresenceDistribution {
  const distribution: ReviewFlagsPresenceDistribution = {
    hasWebsite: 0,
    hasX: 0,
    hasTelegram: 0,
    metaplexHit: 0,
    descriptionPresent: 0,
    linkPresent: 0,
  };

  for (const item of items) {
    if (item.reviewFlags?.hasWebsite) distribution.hasWebsite += 1;
    if (item.reviewFlags?.hasX) distribution.hasX += 1;
    if (item.reviewFlags?.hasTelegram) distribution.hasTelegram += 1;
    if (item.reviewFlags?.metaplexHit) distribution.metaplexHit += 1;
    if (item.reviewFlags?.descriptionPresent) distribution.descriptionPresent += 1;
    if ((item.reviewFlags?.linkCount ?? 0) > 0) distribution.linkPresent += 1;
  }

  return distribution;
}

function abbreviateMint(mint: string): string {
  if (mint.length <= 16) {
    return mint;
  }

  return `${mint.slice(0, 8)}...${mint.slice(-6)}`;
}

function buildWatchlistSummary(items: ReviewQueueItem[], limit: number): WatchlistSummary {
  const watchlistItems = items
    .filter((item) => isWatchlistCandidate(item))
    .sort((left, right) => {
      if (rankPriority(right.scoreRank) !== rankPriority(left.scoreRank)) {
        return rankPriority(right.scoreRank) - rankPriority(left.scoreRank);
      }
      if (right.scoreTotal !== left.scoreTotal) {
        return right.scoreTotal - left.scoreTotal;
      }
      return sortBySelectionAnchorDesc(left, right);
    });
  const watchlistRankDistribution: Record<string, number> = {};
  const watchlistScoreTotalDistribution: Record<string, number> = {};
  const watchlistMetricCoverage: Record<string, number> = {};

  for (const item of watchlistItems) {
    incrementCount(watchlistRankDistribution, item.scoreRank);
    incrementNumberKeyCount(watchlistScoreTotalDistribution, item.scoreTotal);
    incrementNumberKeyCount(watchlistMetricCoverage, item.metricsCount);
  }

  return {
    watchlistCandidateCount: watchlistItems.length,
    watchlistCriteria: {
      scoreRanks: ["A", "B"],
      hardRejected: false,
      notificationCandidate: false,
      readOnly: true,
    },
    watchlistRankDistribution,
    watchlistScoreTotalDistribution,
    watchlistMetricCoverage,
    watchlistReviewFlagsPresence: buildReviewFlagsPresenceDistribution(watchlistItems),
    representativeSamples: watchlistItems.slice(0, Math.min(5, limit)).map((item) => ({
      id: item.id,
      mintAbbrev: abbreviateMint(item.mint),
      scoreRank: item.scoreRank,
      scoreTotal: item.scoreTotal,
      hardRejected: item.hardRejected,
      metricsCount: item.metricsCount,
      reviewFlags: item.reviewFlags,
    })),
  };
}

function buildRankGapSummary(items: ReviewQueueItem[]): RankGapSummary {
  const rankGapDistribution: Record<string, number> = {};
  let maxObservedRank: string | null = null;
  let maxObservedScoreTotal: number | null = null;

  for (const item of items) {
    if (item.scoreRank !== NOTIFY_REQUIRED_RANK) {
      incrementCount(rankGapDistribution, `${item.scoreRank}_to_${NOTIFY_REQUIRED_RANK}`);
    }

    if (
      maxObservedRank === null ||
      rankPriority(item.scoreRank) > rankPriority(maxObservedRank) ||
      (rankPriority(item.scoreRank) === rankPriority(maxObservedRank) &&
        (maxObservedScoreTotal === null || item.scoreTotal > maxObservedScoreTotal))
    ) {
      maxObservedRank = item.scoreRank;
      maxObservedScoreTotal = item.scoreTotal;
    }
  }

  const closestToNotifyCount =
    maxObservedRank === null || maxObservedScoreTotal === null
      ? 0
      : items.filter(
          (item) =>
            item.scoreRank === maxObservedRank && item.scoreTotal === maxObservedScoreTotal,
        ).length;

  return {
    requiredNotifyRank: NOTIFY_REQUIRED_RANK,
    notifyThresholdDescription:
      `S requires non-trend-only score >= ${S_RANK_MIN}; notifyCandidate also requires hardRejected=false`,
    rankGapDistribution,
    maxObservedRank,
    maxObservedScoreTotal,
    closestToNotifyCount,
  };
}

function buildScoreBreakdownVisibilitySummary(
  items: ReviewQueueItem[],
): ScoreBreakdownVisibilitySummary {
  const componentTotalSums = createZeroComponentTotals();
  const hitSourceDistribution: Record<string, number> = {};
  const hitTagDistribution: Record<string, number> = {};
  let availableCount = 0;

  for (const item of items) {
    const summary = item.scoreBreakdownSummary;
    if (!summary?.available) {
      continue;
    }

    availableCount += 1;
    addComponentTotals(componentTotalSums, summary.componentTotals);
    addRecordCounts(hitSourceDistribution, summary.hitSourceCounts);
    addRecordCounts(hitTagDistribution, summary.hitTagCounts);
  }

  return {
    scoreBreakdownAvailable: availableCount > 0,
    availableCount,
    unavailableCount: items.length - availableCount,
    componentTotalSums,
    hitSourceDistribution,
    hitTagDistribution,
  };
}

function buildVisibilitySummary(items: ReviewQueueItem[], sampleLimit: number): {
  scoreRankDistribution: Record<string, number>;
  scoreTotalDistribution: Record<string, number>;
  metadataStatusDistribution: Record<string, number>;
  metricsCountDistribution: Record<string, number>;
  hardRejectedCount: number;
  notifyCandidateEligibleCount: number;
  notifyCandidateBlockerDistribution: NotifyCandidateBlockerDistribution;
  reviewFlagsPresenceDistribution: ReviewFlagsPresenceDistribution;
  watchlist: WatchlistSummary;
  rankGap: RankGapSummary;
  scoreBreakdown: ScoreBreakdownVisibilitySummary;
} {
  const scoreRankDistribution: Record<string, number> = {};
  const scoreTotalDistribution: Record<string, number> = {};
  const metadataStatusDistribution: Record<string, number> = {};
  const metricsCountDistribution: Record<string, number> = {};
  const notifyCandidateBlockerDistribution: NotifyCandidateBlockerDistribution = {
    rank_not_s: 0,
    hard_rejected: 0,
  };

  let hardRejectedCount = 0;
  let notifyCandidateEligibleCount = 0;

  for (const item of items) {
    incrementCount(scoreRankDistribution, item.scoreRank);
    incrementNumberKeyCount(scoreTotalDistribution, item.scoreTotal);
    incrementCount(metadataStatusDistribution, item.metadataStatus);
    incrementNumberKeyCount(metricsCountDistribution, item.metricsCount);

    if (item.hardRejected) {
      hardRejectedCount += 1;
    }
    if (item.notifyCandidateEligible === true) {
      notifyCandidateEligibleCount += 1;
    }
    for (const blocker of item.notifyCandidateBlockers ?? []) {
      notifyCandidateBlockerDistribution[blocker] += 1;
    }
  }

  return {
    scoreRankDistribution,
    scoreTotalDistribution,
    metadataStatusDistribution,
    metricsCountDistribution,
    hardRejectedCount,
    notifyCandidateEligibleCount,
    notifyCandidateBlockerDistribution,
    reviewFlagsPresenceDistribution: buildReviewFlagsPresenceDistribution(items),
    watchlist: buildWatchlistSummary(items, sampleLimit),
    rankGap: buildRankGapSummary(items),
    scoreBreakdown: buildScoreBreakdownVisibilitySummary(items),
  };
}

function buildOldestPendingPreviewItem(
  item: ReviewQueueItem,
  includeBlockers: boolean,
): OldestPendingPreviewItem {
  return {
    mint: item.mint,
    metadataStatus: item.metadataStatus,
    selectionAnchorKind: item.selectionAnchorKind,
    pendingAgeMinutes: item.pendingAgeMinutes,
    pendingAgeBucket: item.pendingAgeBucket,
    queuesMatched: item.queuesMatched,
    reviewFlagsCount: item.reviewFlagsCount,
    reviewFlags: item.reviewFlags,
    ...(includeBlockers
      ? {
          notificationCount: item.notificationCount,
          holderSnapshotCount: item.holderSnapshotCount,
          notifyCandidateBlockers: item.notifyCandidateBlockers,
          rankGapToNotify: item.rankGapToNotify,
        }
      : {}),
  };
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
      hardRejectReason: true,
      scoreTotal: true,
      createdAt: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
      reviewFlagsJson: true,
      scoreBreakdown: true,
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
          holderSnapshots: true,
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
  const countedTokens = await attachNotificationCounts(filteredTokens);
  const sortedTokens = countedTokens
    .sort((left, right) => {
      const leftTime = Date.parse(left.selectionAnchorAt);
      const rightTime = Date.parse(right.selectionAnchorAt);

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.id - left.id;
    });

  const reviewItems = sortedTokens.map((token) =>
    buildReviewQueueItem(token, staleAfterHours, args.includeBlockers),
  );

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
  const oldestPendingPreview = {
    oldestEnrichPending: [...enrichPending]
      .sort(sortByPendingAgeDesc)
      .slice(0, OLDEST_PENDING_PREVIEW_LIMIT)
      .map((item) => buildOldestPendingPreviewItem(item, args.includeBlockers)),
    oldestMetricPending: [...metricPending]
      .sort(sortByPendingAgeDesc)
      .slice(0, OLDEST_PENDING_PREVIEW_LIMIT)
      .map((item) => buildOldestPendingPreviewItem(item, args.includeBlockers)),
  };

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
          includeBlockers: args.includeBlockers,
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
          ...(args.includeBlockers
            ? { visibility: buildVisibilitySummary(reviewItems, args.limit) }
            : {}),
        },
        queues: {
          notifyCandidate: limitItems(notifyCandidates, args.limit),
          highPriorityRecent: limitItems(highPriorityRecent, args.limit),
          staleReview: limitItems(staleReview, args.limit),
          rescorePending: limitItems(rescorePending, args.limit),
          enrichPending: limitItems(enrichPending, args.limit),
          metricPending: limitItems(metricPending, args.limit),
        },
        oldestPendingPreview,
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
