import "dotenv/config";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const DEFAULT_SINCE_MINUTES_LIST = [30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 360, 720, 1440];
const DEFAULT_TOP_LIMITS = [5, 10, 20];

type Args = {
  sinceMinutesList: number[];
  topLimits: number[];
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

type SelectedToken = {
  id: number;
  mint: string;
  metadataStatus: string;
  hasReviewFlagsJson: boolean;
  reviewFlagsCount: number;
  selectionAnchorAt: string;
  isGeckoterminalOrigin: boolean;
};

type WindowSummary = {
  sinceMinutes: number;
  eligibleCount: number;
  smokeCount: number;
  top5SmokeCount: number;
  top10SmokeCount: number;
  top20SmokeCount: number;
  firstNonMintOnlyRank: number | null;
  firstReviewFlagsJsonRank: number | null;
  firstReviewFlagsCountRank: number | null;
  cleanCandidate: boolean;
  topLimitSmokeCounts: Record<string, number>;
  representativeTopMints: string[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      'pnpm metric:priority-window-check:geckoterminal -- [--sinceMinutesList "30,45,60,75,90,105,120,150,180,240,360,720,1440"] [--topLimits "5,10,20"] [--pumpOnly]',
    ].join("\n"),
  );
  process.exit(1);
}

function parsePositiveInt(value: string, key: string): number {
  if (value.trim() === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parsePositiveIntList(value: string, key: string): number[] {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part.length === 0)) {
    printUsageAndExit(`Invalid list for ${key}: ${value}`);
  }

  const seen = new Set<number>();
  const out: number[] = [];

  for (const part of parts) {
    const parsed = parsePositiveInt(part, key);
    if (seen.has(parsed)) {
      continue;
    }

    seen.add(parsed);
    out.push(parsed);
  }

  if (out.length === 0) {
    printUsageAndExit(`Invalid list for ${key}: ${value}`);
  }

  return out;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    sinceMinutesList: [...DEFAULT_SINCE_MINUTES_LIST],
    topLimits: [...DEFAULT_TOP_LIMITS],
    pumpOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--") {
      continue;
    }

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
      case "--sinceMinutesList":
        out.sinceMinutesList = parsePositiveIntList(value, key);
        break;
      case "--topLimits":
        out.topLimits = parsePositiveIntList(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out;
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

function hasStoredReviewFlags(reviewFlagsJson: unknown): boolean {
  return reviewFlagsJson !== null && reviewFlagsJson !== undefined;
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

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function isSmokeMint(mint: string): boolean {
  return mint.startsWith("SMOKE_");
}

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  createdAt: Date;
  entrySnapshot: unknown;
  metadataStatus: string;
  reviewFlagsJson: unknown;
}): SelectedToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDateString(firstSeen?.detectedAt);
  const reviewFlags = extractReviewFlags(token.reviewFlagsJson);

  return {
    id: token.id,
    mint: token.mint,
    metadataStatus: token.metadataStatus,
    hasReviewFlagsJson: hasStoredReviewFlags(token.reviewFlagsJson),
    reviewFlagsCount: countReviewFlags(reviewFlags),
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
  };
}

function findRank(
  tokens: SelectedToken[],
  predicate: (token: SelectedToken) => boolean,
): number | null {
  const index = tokens.findIndex(predicate);
  return index === -1 ? null : index + 1;
}

function buildWindowSummary(
  sinceMinutes: number,
  tokens: SelectedToken[],
  topLimits: number[],
): WindowSummary {
  const topLimitSmokeCounts = Object.fromEntries(
    topLimits.map((limit) => [
      String(limit),
      tokens.slice(0, limit).filter((token) => isSmokeMint(token.mint)).length,
    ]),
  );
  const top5SmokeCount = tokens.slice(0, 5).filter((token) => isSmokeMint(token.mint)).length;
  const top10SmokeCount = tokens.slice(0, 10).filter((token) => isSmokeMint(token.mint)).length;
  const top20SmokeCount = tokens.slice(0, 20).filter((token) => isSmokeMint(token.mint)).length;

  return {
    sinceMinutes,
    eligibleCount: tokens.length,
    smokeCount: tokens.filter((token) => isSmokeMint(token.mint)).length,
    top5SmokeCount,
    top10SmokeCount,
    top20SmokeCount,
    firstNonMintOnlyRank: findRank(tokens, (token) => token.metadataStatus !== "mint_only"),
    firstReviewFlagsJsonRank: findRank(tokens, (token) => token.hasReviewFlagsJson),
    firstReviewFlagsCountRank: findRank(tokens, (token) => token.reviewFlagsCount > 0),
    cleanCandidate: tokens.length > 0 && top20SmokeCount === 0,
    topLimitSmokeCounts,
    representativeTopMints: tokens.slice(0, 5).map((token) => token.mint),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const tokens = await db.token.findMany({
    select: {
      id: true,
      mint: true,
      source: true,
      createdAt: true,
      entrySnapshot: true,
      metadataStatus: true,
      reviewFlagsJson: true,
    },
  });

  const geckoTokens = tokens
    .map(buildSelectedToken)
    .filter((token) => token.isGeckoterminalOrigin)
    .sort((left, right) => {
      const delta = Date.parse(right.selectionAnchorAt) - Date.parse(left.selectionAnchorAt);
      if (delta !== 0) {
        return delta;
      }

      return right.id - left.id;
    });

  const windows = args.sinceMinutesList.map((sinceMinutes) => {
    const sinceCutoffMs = Date.now() - sinceMinutes * 60_000;
    const recentTokens = geckoTokens.filter(
      (token) => Date.parse(token.selectionAnchorAt) >= sinceCutoffMs,
    );
    const cohortTokens = args.pumpOnly
      ? recentTokens.filter((token) => isPumpMint(token.mint))
      : recentTokens;

    return buildWindowSummary(sinceMinutes, cohortTokens, args.topLimits);
  });

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
        selection: {
          sinceMinutesList: args.sinceMinutesList,
          topLimits: args.topLimits,
          pumpOnly: args.pumpOnly,
        },
        windows,
        cleanCandidates: windows.filter((window) => window.cleanCandidate),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
