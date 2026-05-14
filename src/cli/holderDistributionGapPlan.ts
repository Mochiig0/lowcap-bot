import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "./db.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_SINCE_HOURS = 168;

type ScoreRank = "S" | "A" | "B" | "C";

type HolderDistributionGapPlanArgs = {
  limit: number;
  sinceHours: number;
  pumpOnly: boolean;
  rank?: ScoreRank;
};

type HolderDistributionGapPlanClient = Pick<PrismaClient, "token">;

type JsonObject = Record<string, unknown>;

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type CommunityState =
  | "present_with_links"
  | "reviewed_no_links"
  | "present_no_links"
  | "missing"
  | "invalid"
  | "unknown";

type ManualObservationView = {
  schemaVersion: 1;
  source: "manual";
  outcomeLabel: string;
  reviewedAt: string;
};

type PriorityReason =
  | "metric_present_holder_gap_missing"
  | "manual_context_present_holder_gap_missing"
  | "community_context_present_holder_gap_missing"
  | "holder_gap_source_design_needed";

type HolderDistributionGapPlanItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  source: string | null;
  scoreRank: string | null;
  hardRejected: boolean | null;
  metadataStatus: string | null;
  metricCount: number;
  latestMetricObservedAt: string | null;
  communityState: CommunityState;
  manualObservationPresent: boolean;
  outcomeLabel: string;
  holderDistributionGapPresent: boolean;
  suggestedNextCapability: "holder_distribution_snapshot";
  sourcePlan: "read_only_design_first";
  suggestedCommand: null;
  note: string;
  priorityReason: PriorityReason;
};

type HolderDistributionGapPlanReport = {
  safety: {
    mode: "read_only_holder_distribution_gap_plan";
    readOnly: true;
    willWrite: false;
    willFetch: false;
    willSendTelegram: false;
    advisoryOutput: false;
    queue: false;
    systemd: false;
  };
  selection: {
    limit: number;
    sinceHours: number;
    pumpOnly: boolean;
    rank: ScoreRank | null;
    totalScanned: number;
    totalMatched: number;
  };
  summary: {
    holderDistributionMissingCount: number;
    holderSnapshotPresentCount: number;
    holderSnapshotMissingCount: number;
    metricPresentCount: number;
    communityReviewedCount: number;
    manualObservationPresentCount: number;
    highPriorityCandidateCount: number;
    sourcePlanOnlyCount: number;
  };
  items: HolderDistributionGapPlanItem[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm holder:gaps:plan -- [--limit <N>] [--sinceHours <N>] [--pumpOnly] [--rank <S|A|B|C>]",
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

function parseScoreRankArg(value: string, key: string): ScoreRank {
  const ranks: ScoreRank[] = ["S", "A", "B", "C"];
  if (ranks.includes(value as ScoreRank)) {
    return value as ScoreRank;
  }

  printUsageAndExit(`Invalid value for ${key}: ${value}`);
}

function parseArgs(argv: string[]): HolderDistributionGapPlanArgs {
  const out: HolderDistributionGapPlanArgs = {
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
      case "--rank":
        out.rank = parseScoreRankArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractManualObservation(entrySnapshot: unknown): ManualObservationView | null {
  if (!entrySnapshot || typeof entrySnapshot !== "object" || Array.isArray(entrySnapshot)) {
    return null;
  }

  const manualObservation = (entrySnapshot as JsonObject).manualObservation;
  if (
    !manualObservation ||
    typeof manualObservation !== "object" ||
    Array.isArray(manualObservation)
  ) {
    return null;
  }

  const schemaVersion = (manualObservation as JsonObject).schemaVersion;
  const source = (manualObservation as JsonObject).source;
  const reviewedAt = readOptionalString((manualObservation as JsonObject).reviewedAt);

  if (schemaVersion !== 1 || source !== "manual" || reviewedAt === null) {
    return null;
  }

  return {
    schemaVersion: 1,
    source: "manual",
    outcomeLabel:
      readOptionalString((manualObservation as JsonObject).outcomeLabel) ??
      "not_observed",
    reviewedAt,
  };
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

function getCommunityState(reviewFlagsJson: unknown): CommunityState {
  if (reviewFlagsJson === undefined) {
    return "unknown";
  }

  const flags = extractReviewFlags(reviewFlagsJson);
  if (!flags) {
    return hasReviewFlagsObject(reviewFlagsJson) ? "invalid" : "missing";
  }

  if (hasCommunityLinks(flags)) {
    return "present_with_links";
  }

  return isReviewedNoLinks(reviewFlagsJson, flags)
    ? "reviewed_no_links"
    : "present_no_links";
}

function hasCommunityContext(state: CommunityState): boolean {
  return (
    state === "present_with_links" ||
    state === "reviewed_no_links" ||
    state === "present_no_links"
  );
}

function classifyPriorityReason(input: {
  metricCount: number;
  manualObservationPresent: boolean;
  communityState: CommunityState;
}): PriorityReason {
  if (input.metricCount > 0) {
    return "metric_present_holder_gap_missing";
  }

  if (input.manualObservationPresent) {
    return "manual_context_present_holder_gap_missing";
  }

  if (hasCommunityContext(input.communityState)) {
    return "community_context_present_holder_gap_missing";
  }

  return "holder_gap_source_design_needed";
}

function buildNote(priorityReason: PriorityReason): string {
  switch (priorityReason) {
    case "metric_present_holder_gap_missing":
      return "metric context exists, but holder distribution remains not_observed; use only for future holder snapshot planning";
    case "manual_context_present_holder_gap_missing":
      return "manual observation context exists, but holder distribution remains not_observed; do not infer holder data";
    case "community_context_present_holder_gap_missing":
      return "community review context exists, but holder distribution remains not_observed; keep holder capture separately designed";
    case "holder_gap_source_design_needed":
      return "holder distribution remains not_observed; source and storage design must be approved before capture";
  }
}

function buildItem(token: {
  mint: string;
  name: string | null;
  symbol: string | null;
  source: string | null;
  scoreRank: string | null;
  hardRejected: boolean | null;
  metadataStatus: string | null;
  reviewFlagsJson: unknown;
  entrySnapshot: unknown;
  metrics: { observedAt: Date }[];
  holderSnapshots: { source: string }[];
  _count: { metrics: number; holderSnapshots: number };
}): HolderDistributionGapPlanItem {
  const communityState = getCommunityState(token.reviewFlagsJson);
  const manualObservation = extractManualObservation(token.entrySnapshot);
  const manualObservationPresent = manualObservation !== null;
  const metricCount = token._count.metrics;
  const holderSnapshotPresent = token._count.holderSnapshots > 0;
  const priorityReason = classifyPriorityReason({
    metricCount,
    manualObservationPresent,
    communityState,
  });

  return {
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    source: token.source,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    metadataStatus: token.metadataStatus,
    metricCount,
    latestMetricObservedAt: token.metrics[0]?.observedAt.toISOString() ?? null,
    communityState,
    manualObservationPresent,
    outcomeLabel: manualObservation?.outcomeLabel ?? "not_observed",
    holderDistributionGapPresent: !holderSnapshotPresent,
    suggestedNextCapability: "holder_distribution_snapshot",
    sourcePlan: "read_only_design_first",
    suggestedCommand: null,
    note: buildNote(priorityReason),
    priorityReason,
  };
}

function buildSummary(
  scannedItems: HolderDistributionGapPlanItem[],
  matchedItems: HolderDistributionGapPlanItem[],
): HolderDistributionGapPlanReport["summary"] {
  return {
    holderDistributionMissingCount: matchedItems.filter(
      (item) => item.holderDistributionGapPresent,
    ).length,
    holderSnapshotPresentCount: scannedItems.filter(
      (item) => !item.holderDistributionGapPresent,
    ).length,
    holderSnapshotMissingCount: matchedItems.length,
    metricPresentCount: matchedItems.filter((item) => item.metricCount > 0).length,
    communityReviewedCount: matchedItems.filter((item) =>
      hasCommunityContext(item.communityState),
    ).length,
    manualObservationPresentCount: matchedItems.filter(
      (item) => item.manualObservationPresent,
    ).length,
    highPriorityCandidateCount: matchedItems.filter(
      (item) => item.priorityReason !== "holder_gap_source_design_needed",
    ).length,
    sourcePlanOnlyCount: matchedItems.filter(
      (item) => item.priorityReason === "holder_gap_source_design_needed",
    ).length,
  };
}

export async function buildHolderDistributionGapPlan(
  client: HolderDistributionGapPlanClient,
  input: Partial<HolderDistributionGapPlanArgs> = {},
  options: { now?: Date } = {},
): Promise<HolderDistributionGapPlanReport> {
  const args: HolderDistributionGapPlanArgs = {
    limit: input.limit ?? DEFAULT_LIMIT,
    sinceHours: input.sinceHours ?? DEFAULT_SINCE_HOURS,
    pumpOnly: input.pumpOnly ?? false,
    rank: input.rank,
  };
  const now = options.now ?? new Date();
  const createdAfter = new Date(now.getTime() - args.sinceHours * 60 * 60 * 1000);
  const where: Prisma.TokenWhereInput = {
    createdAt: {
      gte: createdAfter,
    },
    ...(args.rank ? { scoreRank: args.rank } : {}),
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
      scoreRank: true,
      hardRejected: true,
      metadataStatus: true,
      reviewFlagsJson: true,
      entrySnapshot: true,
      metrics: {
        orderBy: [
          {
            observedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 1,
        select: {
          observedAt: true,
        },
      },
      holderSnapshots: {
        orderBy: [
          {
            observedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        take: 1,
        select: {
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
  const scannedItems = tokens.map(buildItem);
  const matchedItems = scannedItems.filter(
    (item) => item.holderDistributionGapPresent,
  );
  const items = matchedItems.slice(0, args.limit);

  return {
    safety: {
      mode: "read_only_holder_distribution_gap_plan",
      readOnly: true,
      willWrite: false,
      willFetch: false,
      willSendTelegram: false,
      advisoryOutput: false,
      queue: false,
      systemd: false,
    },
    selection: {
      limit: args.limit,
      sinceHours: args.sinceHours,
      pumpOnly: args.pumpOnly,
      rank: args.rank ?? null,
      totalScanned: scannedItems.length,
      totalMatched: matchedItems.length,
    },
    summary: buildSummary(scannedItems, matchedItems),
    items,
  };
}

export async function runHolderDistributionGapPlanCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const result = await buildHolderDistributionGapPlan(db, args);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runHolderDistributionGapPlanCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
