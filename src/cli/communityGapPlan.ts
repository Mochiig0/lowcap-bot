import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "./db.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_SINCE_HOURS = 168;

type CommunityGapPlanArgs = {
  limit: number;
  sinceHours: number;
  pumpOnly: boolean;
};

type CommunityGapPlanClient = Pick<PrismaClient, "token">;

type JsonObject = Record<string, unknown>;

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type ReviewFlagsState =
  | "missing"
  | "invalid"
  | "present_no_links"
  | "reviewed_no_links"
  | "present_with_links";

type SuggestedNextAction =
  | "enrich_metadata"
  | "inspect_review_flags"
  | "manual_review_community_links"
  | "no_action";

type CommunityGapPlanItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  source: string | null;
  metadataStatus: string | null;
  enrichedAt: string | null;
  reviewFlagsSource: "reviewFlagsJson" | "not_available";
  reviewFlagsState: ReviewFlagsState;
  hasWebsite: boolean | null;
  hasX: boolean | null;
  hasTelegram: boolean | null;
  linkCount: number | null;
  descriptionPresent: boolean | null;
  metaplexHit: boolean | null;
  communityGapPresent: boolean;
  suggestedNextAction: SuggestedNextAction;
  suggestedCommand: string | null;
  note: string;
};

type CommunityGapPlanReport = {
  mode: "read_only_community_gap_plan";
  readOnly: true;
  willWrite: false;
  willFetch: false;
  willSendTelegram: false;
  advisoryOutput: false;
  queue: false;
  systemd: false;
  selection: {
    limit: number;
    sinceHours: number;
    pumpOnly: boolean;
    totalScanned: number;
    totalMatched: number;
  };
  summary: {
    communityLinksMissingCount: number;
    reviewFlagsMissingCount: number;
    reviewFlagsInvalidCount: number;
    reviewedNoLinksCount: number;
    metadataMintOnlyCount: number;
    enrichedButNoCommunityLinksCount: number;
    suggestedEnrichCount: number;
    suggestedManualReviewCount: number;
    noActionCount: number;
  };
  items: CommunityGapPlanItem[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm community:gaps:plan -- [--limit <N>] [--sinceHours <N>] [--pumpOnly]",
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

function parseArgs(argv: string[]): CommunityGapPlanArgs {
  const out: CommunityGapPlanArgs = {
    limit: DEFAULT_LIMIT,
    sinceHours: DEFAULT_SINCE_HOURS,
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
      case "--limit":
        out.limit = parsePositiveIntArg(value, key);
        break;
      case "--sinceHours":
        out.sinceHours = parsePositiveIntArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out;
}

function extractReviewFlags(reviewFlagsJson: unknown): ReviewFlagsView | null {
  if (!reviewFlagsJson || typeof reviewFlagsJson !== "object" || Array.isArray(reviewFlagsJson)) {
    return null;
  }

  const object = reviewFlagsJson as JsonObject;
  const hasWebsite = object.hasWebsite;
  const hasX = object.hasX;
  const hasTelegram = object.hasTelegram;
  const metaplexHit = object.metaplexHit;
  const descriptionPresent = object.descriptionPresent;
  const linkCount = object.linkCount;

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

function hasReviewFlagsObject(reviewFlagsJson: unknown): boolean {
  return Boolean(
    reviewFlagsJson &&
      typeof reviewFlagsJson === "object" &&
      !Array.isArray(reviewFlagsJson),
  );
}

function hasCommunityLinks(flags: ReviewFlagsView | null): boolean {
  return Boolean(
    flags &&
      (flags.hasWebsite ||
        flags.hasX ||
        flags.hasTelegram ||
        flags.linkCount > 0),
  );
}

function isReviewedNoLinks(reviewFlagsJson: unknown, flags: ReviewFlagsView): boolean {
  if (!hasReviewFlagsObject(reviewFlagsJson)) {
    return false;
  }

  const object = reviewFlagsJson as JsonObject;
  return (
    flags.hasWebsite === false &&
    flags.hasX === false &&
    flags.hasTelegram === false &&
    flags.linkCount === 0 &&
    object.source === "manual_community_review" &&
    typeof object.reviewedAt === "string" &&
    object.reviewedAt.trim().length > 0
  );
}

function getReviewFlagsState(reviewFlagsJson: unknown): {
  flags: ReviewFlagsView | null;
  state: ReviewFlagsState;
} {
  const flags = extractReviewFlags(reviewFlagsJson);
  if (flags) {
    const state = hasCommunityLinks(flags)
      ? "present_with_links"
      : isReviewedNoLinks(reviewFlagsJson, flags)
        ? "reviewed_no_links"
        : "present_no_links";

    return {
      flags,
      state,
    };
  }

  return {
    flags: null,
    state: hasReviewFlagsObject(reviewFlagsJson) ? "invalid" : "missing",
  };
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildEnrichCommand(mint: string): string {
  return [
    "pnpm -s token:enrich-rescore:geckoterminal -- --mint",
    shellQuote(mint),
  ].join(" ");
}

function getSuggestedNextAction(input: {
  reviewFlagsState: ReviewFlagsState;
  metadataStatus: string | null;
  enrichedAt: Date | null;
}): SuggestedNextAction {
  if (
    input.reviewFlagsState === "present_with_links" ||
    input.reviewFlagsState === "reviewed_no_links"
  ) {
    return "no_action";
  }
  if (input.reviewFlagsState === "invalid") {
    return "inspect_review_flags";
  }
  if (input.reviewFlagsState === "present_no_links") {
    return "manual_review_community_links";
  }
  if (input.metadataStatus === "mint_only" || input.enrichedAt === null) {
    return "enrich_metadata";
  }

  return "inspect_review_flags";
}

function buildNote(action: SuggestedNextAction, reviewFlagsState: ReviewFlagsState): string {
  if (reviewFlagsState === "reviewed_no_links") {
    return "manual community review already confirmed no public community links; future enrichment can revisit if new links appear";
  }

  switch (action) {
    case "enrich_metadata":
      return "dry-run enrichment can inspect metadata/community links before any approved write";
    case "inspect_review_flags":
      return "reviewFlagsJson is missing or invalid; inspect existing metadata state before choosing a write path";
    case "manual_review_community_links":
      return "reviewFlagsJson is present but has no community links; use manual review or future enrichment design";
    case "no_action":
      return "community links are already represented in reviewFlagsJson";
  }
}

function buildItem(token: {
  mint: string;
  name: string | null;
  symbol: string | null;
  source: string | null;
  metadataStatus: string;
  enrichedAt: Date | null;
  reviewFlagsJson: unknown;
}): CommunityGapPlanItem {
  const { flags, state } = getReviewFlagsState(token.reviewFlagsJson);
  const communityGapPresent = state !== "present_with_links";
  const suggestedNextAction = getSuggestedNextAction({
    reviewFlagsState: state,
    metadataStatus: token.metadataStatus,
    enrichedAt: token.enrichedAt,
  });

  return {
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    source: token.source,
    metadataStatus: token.metadataStatus,
    enrichedAt: token.enrichedAt?.toISOString() ?? null,
    reviewFlagsSource: flags ? "reviewFlagsJson" : "not_available",
    reviewFlagsState: state,
    hasWebsite: flags?.hasWebsite ?? null,
    hasX: flags?.hasX ?? null,
    hasTelegram: flags?.hasTelegram ?? null,
    linkCount: flags?.linkCount ?? null,
    descriptionPresent: flags?.descriptionPresent ?? null,
    metaplexHit: flags?.metaplexHit ?? null,
    communityGapPresent,
    suggestedNextAction,
    suggestedCommand:
      suggestedNextAction === "enrich_metadata"
        ? buildEnrichCommand(token.mint)
        : null,
    note: buildNote(suggestedNextAction, state),
  };
}

function buildSummary(items: CommunityGapPlanItem[]): CommunityGapPlanReport["summary"] {
  return {
    communityLinksMissingCount: items.filter((item) => item.communityGapPresent).length,
    reviewFlagsMissingCount: items.filter((item) => item.reviewFlagsState === "missing").length,
    reviewFlagsInvalidCount: items.filter((item) => item.reviewFlagsState === "invalid").length,
    reviewedNoLinksCount: items.filter((item) => item.reviewFlagsState === "reviewed_no_links").length,
    metadataMintOnlyCount: items.filter((item) => item.metadataStatus === "mint_only").length,
    enrichedButNoCommunityLinksCount: items.filter(
      (item) =>
        item.enrichedAt !== null &&
        (item.reviewFlagsState === "present_no_links" ||
          item.reviewFlagsState === "reviewed_no_links"),
    ).length,
    suggestedEnrichCount: items.filter(
      (item) => item.suggestedNextAction === "enrich_metadata",
    ).length,
    suggestedManualReviewCount: items.filter(
      (item) => item.suggestedNextAction === "manual_review_community_links",
    ).length,
    noActionCount: items.filter((item) => item.suggestedNextAction === "no_action").length,
  };
}

export async function buildCommunityGapPlan(
  client: CommunityGapPlanClient,
  input: Partial<CommunityGapPlanArgs> = {},
  options: { now?: Date } = {},
): Promise<CommunityGapPlanReport> {
  const args: CommunityGapPlanArgs = {
    limit: input.limit ?? DEFAULT_LIMIT,
    sinceHours: input.sinceHours ?? DEFAULT_SINCE_HOURS,
    pumpOnly: input.pumpOnly ?? false,
  };
  const now = options.now ?? new Date();
  const createdAfter = new Date(now.getTime() - args.sinceHours * 60 * 60 * 1000);
  const where: Prisma.TokenWhereInput = {
    createdAt: {
      gte: createdAfter,
    },
    ...(args.pumpOnly ? { mint: { endsWith: "pump" } } : {}),
  };
  const tokens = await client.token.findMany({
    where,
    orderBy: [
      {
        createdAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    select: {
      mint: true,
      name: true,
      symbol: true,
      source: true,
      metadataStatus: true,
      enrichedAt: true,
      reviewFlagsJson: true,
    },
  });
  const scannedItems = tokens.map(buildItem);
  const matchedItems = scannedItems.filter((item) => item.communityGapPresent);
  const items = matchedItems.slice(0, args.limit);

  return {
    mode: "read_only_community_gap_plan",
    readOnly: true,
    willWrite: false,
    willFetch: false,
    willSendTelegram: false,
    advisoryOutput: false,
    queue: false,
    systemd: false,
    selection: {
      limit: args.limit,
      sinceHours: args.sinceHours,
      pumpOnly: args.pumpOnly,
      totalScanned: scannedItems.length,
      totalMatched: matchedItems.length,
    },
    summary: buildSummary(matchedItems),
    items,
  };
}

export async function runCommunityGapPlanCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const result = await buildCommunityGapPlan(db, args);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runCommunityGapPlanCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
