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

type QueueName = "staleReview" | "rescorePending" | "enrichPending" | "metricPending";

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
  metadataStatus: string;
  name: string | null;
  symbol: string | null;
  enrichedAt: string | null;
  rescoredAt: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
  metricsCount: number;
  reviewFlagsCount: number;
};

type PendingShapeItem = {
  mint: string;
  metadataStatus: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  pendingAgeMinutes: number;
  reviewFlagsCount: number;
  queuesMatched: QueueName[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm review:pending-shape:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly]",
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
  createdAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  entrySnapshot: unknown;
  reviewFlagsJson: unknown;
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

  return {
    id: token.id,
    mint: token.mint,
    metadataStatus: token.metadataStatus,
    name: token.name,
    symbol: token.symbol,
    enrichedAt: token.enrichedAt?.toISOString() ?? null,
    rescoredAt: token.rescoredAt?.toISOString() ?? null,
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
    metricsCount: token._count.metrics,
    reviewFlagsCount: countReviewFlags(extractReviewFlags(token.reviewFlagsJson)),
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

function getAgeHours(selectionAnchorAt: string): number {
  return (Date.now() - Date.parse(selectionAnchorAt)) / (60 * 60 * 1_000);
}

function getPendingAgeMinutes(selectionAnchorAt: string): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(selectionAnchorAt)) / 60_000));
}

function buildQueuesMatched(token: SelectedToken, staleAfterHours: number): QueueName[] {
  const matched: QueueName[] = [];
  const ageHours = getAgeHours(token.selectionAnchorAt);

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

function buildPendingShapeItem(
  token: SelectedToken,
  staleAfterHours: number,
): PendingShapeItem | null {
  const queuesMatched = buildQueuesMatched(token, staleAfterHours);
  const hasPendingQueue = queuesMatched.some(
    (queue) => queue === "enrichPending" || queue === "rescorePending" || queue === "metricPending",
  );

  if (!hasPendingQueue) {
    return null;
  }

  return {
    mint: token.mint,
    metadataStatus: token.metadataStatus,
    selectionAnchorKind: token.selectionAnchorKind,
    pendingAgeMinutes: getPendingAgeMinutes(token.selectionAnchorAt),
    reviewFlagsCount: token.reviewFlagsCount,
    queuesMatched,
  };
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function isSmokeMint(mint: string): boolean {
  return mint.startsWith("SMOKE_");
}

function incrementObjectCount(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
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
      createdAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
      reviewFlagsJson: true,
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const geckoOriginTokens = rawTokens
    .map(buildSelectedToken)
    .filter((token) => token.isGeckoterminalOrigin)
    .filter((token) => Date.parse(token.selectionAnchorAt) >= sinceCutoff.getTime());
  const pumpFilteredTokens = args.pumpOnly
    ? geckoOriginTokens.filter((token) => isPumpMint(token.mint))
    : geckoOriginTokens;
  const smokeExcludedTokens = pumpFilteredTokens
    .filter((token) => !isSmokeMint(token.mint))
    .sort((left, right) => {
      const leftTime = Date.parse(left.selectionAnchorAt);
      const rightTime = Date.parse(right.selectionAnchorAt);

      if (rightTime !== leftTime) {
        return rightTime - leftTime;
      }

      return right.id - left.id;
    });
  const pendingItems = smokeExcludedTokens
    .map((token) => buildPendingShapeItem(token, staleAfterHours))
    .filter((item): item is PendingShapeItem => item !== null);
  const selectedRows = pendingItems.slice(0, args.limit);

  const metadataStatusCounts: Record<string, number> = {};
  const selectionAnchorKindCounts: Record<string, number> = {};
  const reviewFlagsCountDistribution: Record<string, number> = {};
  const queuesMatchedPatternCounts: Record<string, number> = {};

  for (const item of selectedRows) {
    incrementObjectCount(metadataStatusCounts, item.metadataStatus);
    incrementObjectCount(selectionAnchorKindCounts, item.selectionAnchorKind);
    incrementObjectCount(reviewFlagsCountDistribution, String(item.reviewFlagsCount));
    incrementObjectCount(queuesMatchedPatternCounts, item.queuesMatched.join("+"));
  }

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
          geckoOriginTokenCount: geckoOriginTokens.length,
          pumpFilteredTokenCount: pumpFilteredTokens.length,
          excludedSmokeCount: pumpFilteredTokens.length - smokeExcludedTokens.length,
          eligiblePendingCount: pendingItems.length,
          selectedPendingCount: selectedRows.length,
        },
        summary: {
          metadataStatusCounts,
          selectionAnchorKindCounts,
          reviewFlagsCountDistribution,
          queuesMatchedPatternCounts,
        },
        representativeRows: selectedRows,
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
