import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "./db.js";
import {
  buildTokenObservationReport,
  type TokenObservationReport,
} from "./tokenObservation.js";

const DEFAULT_LIMIT = 10;
const DEFAULT_SINCE_HOURS = 168;

type ScoreRank = "S" | "A" | "B" | "C";

type TokensObservationGapsArgs = {
  limit: number;
  sinceHours: number;
  pumpOnly: boolean;
  rank?: ScoreRank;
  gap?: string;
};

type TokensObservationGapsClient = Pick<PrismaClient, "token" | "notification">;

type ObservationGapPriority = "high" | "medium" | "low";
type ObservationGapNextAction =
  | "manual_observation_needed"
  | "manual_observation_already_present"
  | "external_metric_needed"
  | "holder_or_market_context_not_supported_yet"
  | "no_action";
type UnsupportedGapCapability =
  | "holder_distribution_snapshot"
  | "market_context_snapshot"
  | "token_enrichment_review_flags"
  | "metric_snapshot_or_append"
  | "notification_lifecycle_observation";
type SchemaRequirement = "false" | "maybe_later";
type ExternalFetchRequirement = "false" | "true" | "maybe" | "true_or_manual";
type RedRequirement = "false_for_design_only" | "required_before_write_or_send";

const TOKEN_OBSERVE_ACTIONABLE_GAPS = [
  "narrativeCategory_not_recorded",
  "thesis_not_recorded",
  "outcome_label_not_recorded",
] as const;

const UNSUPPORTED_CONTEXT_GAPS = [
  "holder_distribution_not_recorded",
  "market_condition_not_recorded",
  "community_links_not_recorded",
] as const;

const UNSUPPORTED_GAP_PLANS = {
  holder_distribution_not_recorded: {
    currentStatus: "not_observed",
    canTokenObserveResolve: false,
    suggestedNextCapability: "holder_distribution_snapshot",
    requiresSchema: "maybe_later",
    requiresExternalFetch: "true",
    requiresRed: "false_for_design_only",
    note: "read-only source/design needed before any holder distribution capture",
  },
  market_condition_not_recorded: {
    currentStatus: "not_observed",
    canTokenObserveResolve: false,
    suggestedNextCapability: "market_context_snapshot",
    requiresSchema: "maybe_later",
    requiresExternalFetch: "true_or_manual",
    requiresRed: "false_for_design_only",
    note: "token-independent context should be designed separately from token thesis",
  },
  community_links_not_recorded: {
    currentStatus: "not_observed",
    canTokenObserveResolve: false,
    suggestedNextCapability: "token_enrichment_review_flags",
    requiresSchema: "false",
    requiresExternalFetch: "maybe",
    requiresRed: "required_before_write_or_send",
    note: "can be filled by existing reviewFlagsJson/enrichment paths, not token:observe",
  },
  metric_observation_missing: {
    currentStatus: "not_observed",
    canTokenObserveResolve: false,
    suggestedNextCapability: "metric_snapshot_or_append",
    requiresSchema: "false",
    requiresExternalFetch: "true",
    requiresRed: "required_before_write_or_send",
    note: "metric evidence should stay in the Metric flow, separate from manual observation",
  },
  notification_observation_missing: {
    currentStatus: "not_observed",
    canTokenObserveResolve: false,
    suggestedNextCapability: "notification_lifecycle_observation",
    requiresSchema: "false",
    requiresExternalFetch: "false",
    requiresRed: "required_before_write_or_send",
    note: "do not send Telegram solely to fill a notification observation gap",
  },
} as const satisfies Record<
  string,
  {
    currentStatus: "not_observed";
    canTokenObserveResolve: false;
    suggestedNextCapability: UnsupportedGapCapability;
    requiresSchema: SchemaRequirement;
    requiresExternalFetch: ExternalFetchRequirement;
    requiresRed: RedRequirement;
    note: string;
  }
>;

type UnsupportedGapPlan = {
  gap: keyof typeof UNSUPPORTED_GAP_PLANS;
  currentStatus: "not_observed";
  canTokenObserveResolve: false;
  suggestedNextCapability: UnsupportedGapCapability;
  requiresSchema: SchemaRequirement;
  requiresExternalFetch: ExternalFetchRequirement;
  requiresRed: RedRequirement;
  note: string;
};

type TokensObservationGapItem = {
  mint: string;
  name: string | null;
  symbol: string | null;
  source: string | null;
  scoreRank: string | null;
  hardRejected: boolean | null;
  metadataStatus: string | null;
  metricCount: number;
  notificationCount: number;
  latestMetricObservedAt: string | null;
  latestNotificationStatus: string | null;
  manualObservationPresent: boolean;
  narrativeCategory: string;
  outcomeLabel: string;
  observationGaps: string[];
  nextReviewHints: string[];
  suggestedManualObserveCommand: string | null;
  nextAction: ObservationGapNextAction;
  unsupportedGapPlan: UnsupportedGapPlan[];
  priority: ObservationGapPriority;
  priorityReason: string;
};

type TokensObservationGapsReport = {
  mode: "read_only_tokens_observation_gap_queue";
  readOnly: true;
  willWrite: false;
  advisoryOutput: false;
  automaticRetry: false;
  queue: false;
  systemd: false;
  selection: {
    limit: number;
    sinceHours: number;
    pumpOnly: boolean;
    rank: ScoreRank | null;
    gap: string | null;
    totalScanned: number;
    totalMatched: number;
  };
  summary: {
    manualObservationPresentCount: number;
    manualObservationMissingCount: number;
    narrativeMissingCount: number;
    thesisMissingCount: number;
    outcomeMissingCount: number;
    communityLinksMissingCount: number;
    holderDistributionMissingCount: number;
    marketConditionMissingCount: number;
    metricMissingCount: number;
    notificationMissingCount: number;
  };
  items: TokensObservationGapItem[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm tokens:observation-gaps -- [--limit <N>] [--sinceHours <N>] [--pumpOnly] [--rank <S|A|B|C>] [--gap <GAP>]",
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

function parseArgs(argv: string[]): TokensObservationGapsArgs {
  const out: TokensObservationGapsArgs = {
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
      case "--gap":
        out.gap = value;
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out;
}

function hasGap(report: TokenObservationReport, gap: string | undefined): boolean {
  return gap === undefined || report.observationGaps.includes(gap);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function buildSuggestedManualObserveCommand(mint: string): string {
  return [
    "pnpm -s token:observe -- --mint",
    shellQuote(mint),
    "--narrativeCategory unknown",
    '--whyWatch "manual review context only"',
    "--outcomeLabel watched",
    '--operatorNote "manual observation from gaps queue"',
  ].join(" ");
}

function hasAnyGap(
  report: TokenObservationReport,
  gaps: readonly string[],
): boolean {
  return gaps.some((gap) => report.observationGaps.includes(gap));
}

function hasTokenObserveActionableGap(report: TokenObservationReport): boolean {
  return hasAnyGap(report, TOKEN_OBSERVE_ACTIONABLE_GAPS);
}

function hasUnsupportedContextGap(report: TokenObservationReport): boolean {
  return hasAnyGap(report, UNSUPPORTED_CONTEXT_GAPS);
}

function classifyNextAction(report: TokenObservationReport): ObservationGapNextAction {
  if (hasTokenObserveActionableGap(report)) {
    return "manual_observation_needed";
  }

  if (report.manualObservation !== null && hasUnsupportedContextGap(report)) {
    return "manual_observation_already_present";
  }

  if (report.observationGaps.includes("metric_observation_missing")) {
    return "external_metric_needed";
  }

  if (hasUnsupportedContextGap(report)) {
    return "holder_or_market_context_not_supported_yet";
  }

  return "no_action";
}

function hasCommunityLinks(report: TokenObservationReport): boolean {
  const { communitySnapshot } = report;
  return Boolean(
    communitySnapshot.hasWebsite === true ||
      communitySnapshot.hasX === true ||
      communitySnapshot.hasTelegram === true ||
      (typeof communitySnapshot.linkCount === "number" &&
        communitySnapshot.linkCount > 0),
  );
}

function classifyPriority(report: TokenObservationReport): {
  priority: ObservationGapPriority;
  priorityReason: string;
} {
  const manualObservationPresent = report.manualObservation !== null;
  const metricCount = report.metricOutcomeSnapshot.metricCount;
  const notificationCount = report.notificationSnapshot.notificationCount;

  if (!manualObservationPresent && metricCount > 0) {
    return {
      priority: "high",
      priorityReason: "metrics_present_manual_observation_missing",
    };
  }

  if (!manualObservationPresent && hasCommunityLinks(report)) {
    return {
      priority: "medium",
      priorityReason: "community_links_present_manual_observation_missing",
    };
  }

  if (manualObservationPresent && hasUnsupportedContextGap(report)) {
    return {
      priority: "medium",
      priorityReason: "manual_observation_complete_remaining_unsupported_gaps",
    };
  }

  if (metricCount === 0 && notificationCount === 0) {
    return {
      priority: "low",
      priorityReason: "metric_and_notification_missing",
    };
  }

  if (hasTokenObserveActionableGap(report)) {
    return {
      priority: "medium",
      priorityReason: "manual_observation_fields_missing",
    };
  }

  return {
    priority: "medium",
    priorityReason: "observation_gaps_present",
  };
}

function buildItem(report: TokenObservationReport): TokensObservationGapItem | null {
  if (report.status !== "ok" || report.tokenIdentity === null) {
    return null;
  }

  const priority = classifyPriority(report);
  const nextAction = classifyNextAction(report);

  return {
    mint: report.tokenIdentity.mint,
    name: report.tokenIdentity.name,
    symbol: report.tokenIdentity.symbol,
    source: report.tokenIdentity.source,
    scoreRank: report.tokenIdentity.scoreRank,
    hardRejected: report.tokenIdentity.hardRejected,
    metadataStatus: report.tokenIdentity.metadataStatus,
    metricCount: report.metricOutcomeSnapshot.metricCount,
    notificationCount: report.notificationSnapshot.notificationCount,
    latestMetricObservedAt:
      report.metricOutcomeSnapshot.latestMetric?.observedAt ?? null,
    latestNotificationStatus:
      report.notificationSnapshot.latestNotification?.status ?? null,
    manualObservationPresent: report.manualObservation !== null,
    narrativeCategory: report.narrativeSnapshot.narrativeCategory,
    outcomeLabel: report.metricOutcomeSnapshot.outcomeLabel,
    observationGaps: report.observationGaps,
    nextReviewHints: report.nextReviewHints,
    suggestedManualObserveCommand:
      nextAction === "manual_observation_needed"
        ? buildSuggestedManualObserveCommand(report.tokenIdentity.mint)
        : null,
    nextAction,
    unsupportedGapPlan: buildUnsupportedGapPlan(report),
    priority: priority.priority,
    priorityReason: priority.priorityReason,
  };
}

function isUnsupportedGap(gap: string): gap is keyof typeof UNSUPPORTED_GAP_PLANS {
  return Object.prototype.hasOwnProperty.call(UNSUPPORTED_GAP_PLANS, gap);
}

function buildUnsupportedGapPlan(report: TokenObservationReport): UnsupportedGapPlan[] {
  return report.observationGaps.filter(isUnsupportedGap).map((gap) => ({
    gap,
    ...UNSUPPORTED_GAP_PLANS[gap],
  }));
}

function countGap(reports: TokenObservationReport[], gap: string): number {
  return reports.filter((report) => report.observationGaps.includes(gap)).length;
}

function buildSummary(reports: TokenObservationReport[]): TokensObservationGapsReport["summary"] {
  return {
    manualObservationPresentCount: reports.filter(
      (report) => report.manualObservation !== null,
    ).length,
    manualObservationMissingCount: reports.filter(
      (report) => report.manualObservation === null,
    ).length,
    narrativeMissingCount: countGap(reports, "narrativeCategory_not_recorded"),
    thesisMissingCount: countGap(reports, "thesis_not_recorded"),
    outcomeMissingCount: countGap(reports, "outcome_label_not_recorded"),
    communityLinksMissingCount: countGap(reports, "community_links_not_recorded"),
    holderDistributionMissingCount: countGap(
      reports,
      "holder_distribution_not_recorded",
    ),
    marketConditionMissingCount: countGap(reports, "market_condition_not_recorded"),
    metricMissingCount: countGap(reports, "metric_observation_missing"),
    notificationMissingCount: countGap(reports, "notification_observation_missing"),
  };
}

export async function buildTokensObservationGapsReport(
  client: TokensObservationGapsClient,
  input: Partial<TokensObservationGapsArgs> = {},
  options: { now?: Date } = {},
): Promise<TokensObservationGapsReport> {
  const args: TokensObservationGapsArgs = {
    limit: input.limit ?? DEFAULT_LIMIT,
    sinceHours: input.sinceHours ?? DEFAULT_SINCE_HOURS,
    pumpOnly: input.pumpOnly ?? false,
    rank: input.rank,
    gap: input.gap,
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
    },
  });

  const reports = await Promise.all(
    tokens.map((token) =>
      buildTokenObservationReport(client, token.mint, {
        now,
      }),
    ),
  );
  const okReports = reports.filter(
    (report) => report.status === "ok" && report.tokenIdentity !== null,
  );
  const matchedReports = okReports.filter((report) => hasGap(report, args.gap));
  const items = matchedReports
    .slice(0, args.limit)
    .map(buildItem)
    .filter((item): item is TokensObservationGapItem => item !== null);

  return {
    mode: "read_only_tokens_observation_gap_queue",
    readOnly: true,
    willWrite: false,
    advisoryOutput: false,
    automaticRetry: false,
    queue: false,
    systemd: false,
    selection: {
      limit: args.limit,
      sinceHours: args.sinceHours,
      pumpOnly: args.pumpOnly,
      rank: args.rank ?? null,
      gap: args.gap ?? null,
      totalScanned: okReports.length,
      totalMatched: matchedReports.length,
    },
    summary: buildSummary(matchedReports),
    items,
  };
}

export async function runTokensObservationGapsCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const result = await buildTokensObservationGapsReport(db, args);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runTokensObservationGapsCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
