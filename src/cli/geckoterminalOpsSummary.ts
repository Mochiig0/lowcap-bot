import "dotenv/config";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const DEFAULT_SINCE_HOURS = 24;
const DEFAULT_LIMIT = 5;

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

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type InterestingFlagSummary = {
  count: number;
  andMetricCount: number;
  metricRate: number | null;
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
  latestPeakFdv24h: number | null;
  latestMaxMultiple15m: number | null;
  latestTimeToPeakMinutes: number | null;
  reviewFlags: ReviewFlagsView | null;
};

type CountByValue = {
  value: string | null;
  count: number;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm ops:summary:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly]",
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
    peakFdv24h: number | null;
    maxMultiple15m: number | null;
    timeToPeakMinutes: number | null;
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
    latestPeakFdv24h: latestMetric?.peakFdv24h ?? null,
    latestMaxMultiple15m: latestMetric?.maxMultiple15m ?? null,
    latestTimeToPeakMinutes: latestMetric?.timeToPeakMinutes ?? null,
    reviewFlags,
  };
}

function incrementObjectCount(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function buildCountByValue(values: Array<string | null>): CountByValue[] {
  const counts = new Map<string | null, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return (left.value ?? "").localeCompare(right.value ?? "");
    });
}

function computeRate(numerator: number, denominator: number): number | null {
  if (denominator === 0) {
    return null;
  }

  return Number((numerator / denominator).toFixed(4));
}

function buildInterestingFlagSummary(
  count: number,
  andMetricCount: number,
): InterestingFlagSummary {
  return {
    count,
    andMetricCount,
    metricRate: computeRate(andMetricCount, count),
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const sinceCutoff = new Date(Date.now() - args.sinceHours * 60 * 60 * 1_000);

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
          peakFdv24h: true,
          maxMultiple15m: true,
          timeToPeakMinutes: true,
        },
      },
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const tokens = rawTokens
    .map(buildSelectedToken)
    .filter(
      (token) =>
        token.isGeckoterminalOrigin &&
        Date.parse(token.selectionAnchorAt) >= sinceCutoff.getTime(),
    );
  const filteredTokens = args.pumpOnly
    ? tokens.filter((token) => isPumpMint(token.mint))
    : tokens;
  const skippedNonPumpCount = tokens.length - filteredTokens.length;
  const sortedTokens = filteredTokens
    .sort((left, right) => {
      const delta = Date.parse(right.selectionAnchorAt) - Date.parse(left.selectionAnchorAt);
      if (delta !== 0) {
        return delta;
      }

      return right.id - left.id;
    });

  const scoreRankCounts: Record<string, number> = {};
  const metadataStatusCounts: Record<string, number> = {};

  let firstSeenSourceSnapshotCount = 0;
  let nameSymbolFilledCount = 0;
  let enrichedTokenCount = 0;
  let rescoredTokenCount = 0;
  let metricTokenCount = 0;
  let metricCount = 0;
  let hardRejectedCount = 0;
  let notifyCandidateCount = 0;
  let reviewFlagsTokenCount = 0;
  let hasWebsiteCount = 0;
  let hasXCount = 0;
  let hasTelegramCount = 0;
  let metaplexHitCount = 0;
  let descriptionPresentCount = 0;
  let hasWebsiteAndMetricCount = 0;
  let hasXAndMetricCount = 0;
  let hasTelegramAndMetricCount = 0;
  let metaplexHitAndMetricCount = 0;
  let descriptionPresentAndMetricCount = 0;
  let latestMetricPresentCount = 0;
  let latestMultiplePresentCount = 0;
  let latestPeakPresentCount = 0;
  let latestTimeToPeakPresentCount = 0;

  for (const token of sortedTokens) {
    incrementObjectCount(scoreRankCounts, token.scoreRank);
    incrementObjectCount(metadataStatusCounts, token.metadataStatus);

    if (token.hasFirstSeenSourceSnapshot) {
      firstSeenSourceSnapshotCount += 1;
    }

    if (token.name !== null && token.symbol !== null) {
      nameSymbolFilledCount += 1;
    }

    if (token.enrichedAt !== null) {
      enrichedTokenCount += 1;
    }

    if (token.rescoredAt !== null) {
      rescoredTokenCount += 1;
    }

    if (token.metricsCount > 0) {
      metricTokenCount += 1;
    }

    metricCount += token.metricsCount;

    if (token.latestMetricObservedAt !== null) {
      latestMetricPresentCount += 1;
    }

    if (token.latestMaxMultiple15m !== null) {
      latestMultiplePresentCount += 1;
    }

    if (token.latestPeakFdv24h !== null) {
      latestPeakPresentCount += 1;
    }

    if (token.latestTimeToPeakMinutes !== null) {
      latestTimeToPeakPresentCount += 1;
    }

    if (token.hardRejected) {
      hardRejectedCount += 1;
    }

    if (token.scoreRank === "S" && !token.hardRejected) {
      notifyCandidateCount += 1;
    }

    if (token.reviewFlags !== null) {
      reviewFlagsTokenCount += 1;
      const hasMetrics = token.metricsCount > 0;

      if (token.reviewFlags.hasWebsite) {
        hasWebsiteCount += 1;
        if (hasMetrics) {
          hasWebsiteAndMetricCount += 1;
        }
      }

      if (token.reviewFlags.hasX) {
        hasXCount += 1;
        if (hasMetrics) {
          hasXAndMetricCount += 1;
        }
      }

      if (token.reviewFlags.hasTelegram) {
        hasTelegramCount += 1;
        if (hasMetrics) {
          hasTelegramAndMetricCount += 1;
        }
      }

      if (token.reviewFlags.metaplexHit) {
        metaplexHitCount += 1;
        if (hasMetrics) {
          metaplexHitAndMetricCount += 1;
        }
      }

      if (token.reviewFlags.descriptionPresent) {
        descriptionPresentCount += 1;
        if (hasMetrics) {
          descriptionPresentAndMetricCount += 1;
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
        selection: {
          sinceHours: args.sinceHours,
          sinceCutoff: sinceCutoff.toISOString(),
          previewLimit: args.limit,
          pumpOnly: args.pumpOnly,
          geckoOriginTokenCount: sortedTokens.length,
          skippedNonPumpCount,
        },
        summary: {
          geckoOriginTokenCount: sortedTokens.length,
          firstSeenSourceSnapshotCount,
          nameSymbolFilledCount,
          enrichedTokenCount,
          rescoredTokenCount,
          metricTokenCount,
          metricCount,
          hardRejectedCount,
          notifyCandidateCount,
          reviewFlagsTokenCount,
          hasWebsiteCount,
          hasXCount,
          hasTelegramCount,
          metaplexHitCount,
          descriptionPresentCount,
          hasWebsiteAndMetricCount,
          hasXAndMetricCount,
          hasTelegramAndMetricCount,
          metaplexHitAndMetricCount,
          descriptionPresentAndMetricCount,
          hasWebsiteMetricRate: computeRate(hasWebsiteAndMetricCount, hasWebsiteCount),
          hasXMetricRate: computeRate(hasXAndMetricCount, hasXCount),
          hasTelegramMetricRate: computeRate(hasTelegramAndMetricCount, hasTelegramCount),
          metaplexHitMetricRate: computeRate(
            metaplexHitAndMetricCount,
            metaplexHitCount,
          ),
          descriptionPresentMetricRate: computeRate(
            descriptionPresentAndMetricCount,
            descriptionPresentCount,
          ),
          interestingFlagComparison: {
            hasWebsite: buildInterestingFlagSummary(
              hasWebsiteCount,
              hasWebsiteAndMetricCount,
            ),
            descriptionPresent: buildInterestingFlagSummary(
              descriptionPresentCount,
              descriptionPresentAndMetricCount,
            ),
            metaplexHit: buildInterestingFlagSummary(
              metaplexHitCount,
              metaplexHitAndMetricCount,
            ),
          },
          metricCompletenessSummary: {
            latestMetricPresentCount,
            latestMultiplePresentCount,
            latestPeakPresentCount,
            latestTimeToPeakPresentCount,
            latestMetricMissingCount: sortedTokens.length - latestMetricPresentCount,
            latestMultipleMissingCount: sortedTokens.length - latestMultiplePresentCount,
            latestPeakMissingCount: sortedTokens.length - latestPeakPresentCount,
            latestTimeToPeakMissingCount:
              sortedTokens.length - latestTimeToPeakPresentCount,
            latestMetricSourceCounts: buildCountByValue(
              sortedTokens.map((token) => token.latestMetricSource),
            ),
          },
        },
        scoreRankCounts,
        metadataStatusCounts,
        currentSourceCounts: buildCountByValue(sortedTokens.map((token) => token.currentSource)),
        originSourceCounts: buildCountByValue(sortedTokens.map((token) => token.originSource)),
        preview: sortedTokens.slice(0, args.limit).map((token) => ({
          mint: token.mint,
          currentSource: token.currentSource,
          originSource: token.originSource,
          metadataStatus: token.metadataStatus,
          name: token.name,
          symbol: token.symbol,
          scoreRank: token.scoreRank,
          hardRejected: token.hardRejected,
          notifyCandidate: token.scoreRank === "S" && !token.hardRejected,
          hasFirstSeenSourceSnapshot: token.hasFirstSeenSourceSnapshot,
          selectionAnchorAt: token.selectionAnchorAt,
          selectionAnchorKind: token.selectionAnchorKind,
          metricsCount: token.metricsCount,
          latestMetricObservedAt: token.latestMetricObservedAt,
          latestMetricSource: token.latestMetricSource,
          latestPeakFdv24h: token.latestPeakFdv24h,
          latestMaxMultiple15m: token.latestMaxMultiple15m,
          latestTimeToPeakMinutes: token.latestTimeToPeakMinutes,
          enrichedAt: token.enrichedAt,
          rescoredAt: token.rescoredAt,
          createdAt: token.createdAt,
          importedAt: token.importedAt,
        })),
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
