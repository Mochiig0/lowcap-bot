import "dotenv/config";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const DEFAULT_LIMIT = 2;
const DEFAULT_MAX_CYCLES = 1;
const DEFAULT_SINCE_MINUTES = 10_080;

type Args = {
  pumpOnly: boolean;
  limit: number;
  maxCycles: number;
  sinceMinutes: number;
  dryRun: true;
  captureFile: string | null;
  cooldownSeconds: number | null;
  stopOnNotifyCandidate: boolean;
  stopOnRateLimit: boolean;
};

type JsonObject = Record<string, unknown>;

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

type LatestMetric = {
  id: number;
  source: string | null;
  observedAt: string;
  volume24h: number | null;
} | null;

type SupervisorToken = {
  id: number;
  mint: string;
  currentSource: string | null;
  originSource: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreRank: string;
  scoreTotal: number;
  hardRejected: boolean;
  createdAt: string;
  importedAt: string;
  enrichedAt: string | null;
  rescoredAt: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
  metricsCount: number;
  latestMetric: LatestMetric;
  notifyCandidate: boolean;
};

type CurrentCounts = {
  geckoOriginTokenCount: number;
  pumpTotal: number;
  pumpComplete: number;
  pumpIncomplete: number;
  metricTokenCount: number;
  metricCount: number;
  latestMetricPresentCount: number;
  latestMetricMissingCount: number;
  metricPendingCount: number;
  notifyCandidateCount: number;
  skippedNonPumpCount: number;
};

type SafetyCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: unknown;
};

type SelectedCandidate = {
  cycle: number;
  orderInCycle: number;
  id: number;
  mint: string;
  currentSource: string | null;
  originSource: string | null;
  metadataStatus: string;
  name: string | null;
  symbol: string | null;
  scoreRank: string;
  scoreTotal: number;
  hardRejected: boolean;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  metricsCount: number;
  latestMetric: LatestMetric;
  wouldWriteToken: boolean;
};

type MetricAppendPlanItem = {
  cycle: number;
  mint: string;
  wouldAppendMetric: boolean;
  reason: "selected_incomplete_metric_missing" | "already_has_metric";
  metricsCount: number;
  latestMetric: LatestMetric;
};

type CyclePlan = {
  cycle: number;
  selectedCount: number;
  selectedCandidates: SelectedCandidate[];
  metricAppendPlan: MetricAppendPlanItem[];
};

type OperatorSummary = {
  status: "no_pending" | "ready" | "warning" | "blocked";
  safeToWrite: boolean;
  plannedTokenWrites: number;
  plannedMetricAppends: number;
  blockingSafetyChecks: string[];
  warningSafetyChecks: string[];
  nextRecommendedAction:
    | "no_action"
    | "run_planned_cycles"
    | "inspect_warning_safety_checks"
    | "inspect_blocking_safety_checks";
};

type WritePlan = {
  enabled: false;
  writeModeSupported: false;
  recommendedInitialWriteArgs: {
    limit: 1;
    maxCycles: 1;
    postCheck: true;
    requireMetricAppend: true;
  };
  wouldWriteTokens: Array<{
    cycle: number;
    orderInCycle: number;
    mint: string;
  }>;
  wouldAppendMetrics: Array<{
    cycle: number;
    mint: string;
  }>;
  requiresCaptureOnly: true;
  postCheckPlan: {
    enabled: true;
    requireMetricPendingMatchesIncomplete: true;
    requireSelectedLatestMetricPresent: true;
  };
  recoveryHints: {
    metricOnlyAppendCandidates: string[];
    cooldownRecommended: true;
    resumeWithLimit: 1;
    resumeWithMaxCycles: 1;
  };
};

type WriteModeReadiness = {
  readyForImplementation: false;
  blockingReasons: [
    "token_write_helper_not_extracted",
    "metric_append_helper_not_extracted",
  ];
  nextImplementationStep: "extract_token_write_helper";
};

class CliUsageError extends Error {}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm ops:catchup:gecko -- [--pumpOnly] [--limit <N>] [--maxCycles <N>] [--sinceMinutes <N> | --sinceHours <N>] [--dry-run] [--captureFile <PATH>] [--cooldownSeconds <N>] [--stopOnNotifyCandidate <true|false>] [--stopOnRateLimit <true|false>]",
    "",
    "Defaults:",
    `- dry-run only; DB writes, fast wrapper execution, Metric append, Telegram notify, capture file creation, and watch mode are not supported`,
    `- --write is intentionally rejected in this first supervised runner implementation`,
    `- selects GeckoTerminal-origin incomplete rows by selectionAnchorAt desc + id desc`,
    `- default --limit ${DEFAULT_LIMIT}, --maxCycles ${DEFAULT_MAX_CYCLES}, --sinceMinutes ${DEFAULT_SINCE_MINUTES}`,
  ].join("\n");
}

function parsePositiveIntegerArg(value: string, key: string): number {
  if (value.trim().length === 0) {
    throw new CliUsageError(`Invalid integer for ${key}: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`Invalid integer for ${key}: ${value}`);
  }

  return parsed;
}

function parseBooleanArg(value: string, key: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new CliUsageError(`Invalid boolean for ${key}: ${value}`);
}

function parseOptionalStringArg(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseArgs(argv: string[]): Args {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: Args = {
    pumpOnly: false,
    limit: DEFAULT_LIMIT,
    maxCycles: DEFAULT_MAX_CYCLES,
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    dryRun: true,
    captureFile: null,
    cooldownSeconds: null,
    stopOnNotifyCandidate: true,
    stopOnRateLimit: true,
  };
  let sinceMinutesSet = false;
  let sinceHoursSet = false;

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    if (key === "--dry-run") {
      out.dryRun = true;
      continue;
    }

    if (key === "--write") {
      throw new CliUsageError("--write is not supported for ops:catchup:gecko yet");
    }

    if (key === "--pumpOnly") {
      out.pumpOnly = true;
      continue;
    }

    const value = normalizedArgv[i + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Missing value for ${key}`);
    }

    switch (key) {
      case "--limit":
        out.limit = parsePositiveIntegerArg(value, key);
        break;
      case "--maxCycles":
        out.maxCycles = parsePositiveIntegerArg(value, key);
        break;
      case "--sinceMinutes":
        out.sinceMinutes = parsePositiveIntegerArg(value, key);
        sinceMinutesSet = true;
        break;
      case "--sinceHours":
        out.sinceMinutes = parsePositiveIntegerArg(value, key) * 60;
        sinceHoursSet = true;
        break;
      case "--captureFile":
        out.captureFile = parseOptionalStringArg(value);
        break;
      case "--cooldownSeconds":
        out.cooldownSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--stopOnNotifyCandidate":
        out.stopOnNotifyCandidate = parseBooleanArg(value, key);
        break;
      case "--stopOnRateLimit":
        out.stopOnRateLimit = parseBooleanArg(value, key);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (sinceMinutesSet && sinceHoursSet) {
    throw new CliUsageError("Use only one of --sinceMinutes or --sinceHours");
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

function buildSupervisorToken(token: {
  id: number;
  mint: string;
  source: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string;
  scoreRank: string;
  scoreTotal: number;
  hardRejected: boolean;
  createdAt: Date;
  importedAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  entrySnapshot: unknown;
  metrics: Array<{
    id: number;
    source: string | null;
    observedAt: Date;
    volume24h: number | null;
  }>;
  _count: {
    metrics: number;
  };
}): SupervisorToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDateString(firstSeen?.detectedAt);
  const latestMetric = token.metrics[0] ?? null;

  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.source,
    originSource: originSource ?? null,
    name: token.name,
    symbol: token.symbol,
    metadataStatus: token.metadataStatus,
    scoreRank: token.scoreRank,
    scoreTotal: token.scoreTotal,
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
    metricsCount: token._count.metrics,
    latestMetric: latestMetric
      ? {
          id: latestMetric.id,
          source: latestMetric.source,
          observedAt: latestMetric.observedAt.toISOString(),
          volume24h: latestMetric.volume24h,
        }
      : null,
    notifyCandidate: token.scoreRank === "S" && !token.hardRejected,
  };
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function isSmokeMint(mint: string): boolean {
  return mint.startsWith("SMOKE_");
}

function isIncomplete(token: SupervisorToken): boolean {
  return token.name === null || token.symbol === null;
}

function sortBySelectionAnchorDesc(left: SupervisorToken, right: SupervisorToken): number {
  const delta = Date.parse(right.selectionAnchorAt) - Date.parse(left.selectionAnchorAt);
  if (delta !== 0) {
    return delta;
  }

  return right.id - left.id;
}

function buildCurrentCounts(tokens: SupervisorToken[], filteredTokens: SupervisorToken[]): CurrentCounts {
  const complete = filteredTokens.filter((token) => !isIncomplete(token)).length;
  const metricTokenCount = filteredTokens.filter((token) => token.metricsCount > 0).length;
  const latestMetricPresentCount = filteredTokens.filter((token) => token.latestMetric !== null).length;

  return {
    geckoOriginTokenCount: filteredTokens.length,
    pumpTotal: filteredTokens.length,
    pumpComplete: complete,
    pumpIncomplete: filteredTokens.length - complete,
    metricTokenCount,
    metricCount: filteredTokens.reduce((sum, token) => sum + token.metricsCount, 0),
    latestMetricPresentCount,
    latestMetricMissingCount: filteredTokens.length - latestMetricPresentCount,
    metricPendingCount: filteredTokens.filter((token) => token.metricsCount === 0).length,
    notifyCandidateCount: filteredTokens.filter((token) => token.notifyCandidate).length,
    skippedNonPumpCount: tokens.length - filteredTokens.length,
  };
}

function buildSelectedCandidate(
  token: SupervisorToken,
  cycle: number,
  orderInCycle: number,
): SelectedCandidate {
  return {
    cycle,
    orderInCycle,
    id: token.id,
    mint: token.mint,
    currentSource: token.currentSource,
    originSource: token.originSource,
    metadataStatus: token.metadataStatus,
    name: token.name,
    symbol: token.symbol,
    scoreRank: token.scoreRank,
    scoreTotal: token.scoreTotal,
    hardRejected: token.hardRejected,
    selectionAnchorAt: token.selectionAnchorAt,
    selectionAnchorKind: token.selectionAnchorKind,
    metricsCount: token.metricsCount,
    latestMetric: token.latestMetric,
    wouldWriteToken: true,
  };
}

function buildMetricAppendPlanItem(candidate: SelectedCandidate): MetricAppendPlanItem {
  return {
    cycle: candidate.cycle,
    mint: candidate.mint,
    wouldAppendMetric: candidate.metricsCount === 0,
    reason:
      candidate.metricsCount === 0
        ? "selected_incomplete_metric_missing"
        : "already_has_metric",
    metricsCount: candidate.metricsCount,
    latestMetric: candidate.latestMetric,
  };
}

function buildSafetyChecks(
  args: Args,
  currentCounts: CurrentCounts,
  selectedCandidates: SelectedCandidate[],
): SafetyCheck[] {
  const checks: SafetyCheck[] = [];
  const smokeCandidates = selectedCandidates.filter((candidate) => isSmokeMint(candidate.mint));
  const unexpectedSourceCandidates = selectedCandidates.filter(
    (candidate) =>
      candidate.currentSource !== GECKOTERMINAL_NEW_POOLS_SOURCE &&
      candidate.originSource !== GECKOTERMINAL_NEW_POOLS_SOURCE,
  );
  const completeCandidates = selectedCandidates.filter(
    (candidate) => candidate.name !== null && candidate.symbol !== null,
  );
  const hardRejectedCandidates = selectedCandidates.filter((candidate) => candidate.hardRejected);
  const alreadyMetricCandidates = selectedCandidates.filter((candidate) => candidate.metricsCount > 0);

  checks.push({
    name: "dry_run_only",
    status: "pass",
    message: "DB write, fast wrapper execution, Metric append, Telegram notify, and capture file creation are disabled.",
  });
  checks.push({
    name: "notify_candidate_count",
    status:
      args.stopOnNotifyCandidate && currentCounts.notifyCandidateCount > 0 ? "fail" : "pass",
    message: `notifyCandidateCount=${currentCounts.notifyCandidateCount}`,
  });
  checks.push({
    name: "metric_pending_matches_incomplete",
    status:
      currentCounts.metricPendingCount === currentCounts.pumpIncomplete ? "pass" : "warn",
    message: `metricPendingCount=${currentCounts.metricPendingCount}, pumpIncomplete=${currentCounts.pumpIncomplete}`,
  });
  checks.push({
    name: "smoke_candidates",
    status: smokeCandidates.length > 0 ? "fail" : "pass",
    message: `SMOKE candidate count=${smokeCandidates.length}`,
    ...(smokeCandidates.length > 0
      ? { details: smokeCandidates.map((candidate) => candidate.mint) }
      : {}),
  });
  checks.push({
    name: "source_origin",
    status: unexpectedSourceCandidates.length > 0 ? "fail" : "pass",
    message: `unexpected source/origin candidate count=${unexpectedSourceCandidates.length}`,
    ...(unexpectedSourceCandidates.length > 0
      ? {
          details: unexpectedSourceCandidates.map((candidate) => ({
            mint: candidate.mint,
            currentSource: candidate.currentSource,
            originSource: candidate.originSource,
          })),
        }
      : {}),
  });
  checks.push({
    name: "selected_incomplete",
    status: completeCandidates.length > 0 ? "fail" : "pass",
    message: `already-complete selected candidate count=${completeCandidates.length}`,
    ...(completeCandidates.length > 0
      ? { details: completeCandidates.map((candidate) => candidate.mint) }
      : {}),
  });
  checks.push({
    name: "hard_rejected_candidates",
    status: hardRejectedCandidates.length > 0 ? "fail" : "pass",
    message: `hardRejected selected candidate count=${hardRejectedCandidates.length}`,
    ...(hardRejectedCandidates.length > 0
      ? { details: hardRejectedCandidates.map((candidate) => candidate.mint) }
      : {}),
  });
  checks.push({
    name: "metric_append_precheck",
    status: alreadyMetricCandidates.length > 0 ? "fail" : "pass",
    message: `selected candidates with existing metrics=${alreadyMetricCandidates.length}`,
    ...(alreadyMetricCandidates.length > 0
      ? {
          details: alreadyMetricCandidates.map((candidate) => ({
            mint: candidate.mint,
            metricsCount: candidate.metricsCount,
            latestMetric: candidate.latestMetric,
          })),
        }
      : {}),
  });
  checks.push({
    name: "stop_on_rate_limit",
    status: args.stopOnRateLimit ? "pass" : "warn",
    message: `stopOnRateLimit=${args.stopOnRateLimit}`,
  });

  return checks;
}

function firstFailingStopReason(checks: SafetyCheck[]): string | null {
  return checks.find((check) => check.status === "fail")?.name ?? null;
}

function buildStopReason(
  currentCounts: CurrentCounts,
  pendingCount: number,
  plannedCount: number,
  checks: SafetyCheck[],
): string {
  const failingCheck = firstFailingStopReason(checks);
  if (failingCheck) {
    return failingCheck;
  }
  if (pendingCount === 0) {
    return "no_pending_tokens";
  }
  if (plannedCount < pendingCount) {
    return "max_cycles_reached_after_plan";
  }
  if (currentCounts.metricPendingCount !== currentCounts.pumpIncomplete) {
    return "pending_count_mismatch";
  }
  return "none";
}

function buildOperatorSummary(
  pendingCount: number,
  selectedCandidates: SelectedCandidate[],
  metricAppendPlan: MetricAppendPlanItem[],
  safetyChecks: SafetyCheck[],
): OperatorSummary {
  const blockingSafetyChecks = safetyChecks
    .filter((check) => check.status === "fail")
    .map((check) => check.name);
  const warningSafetyChecks = safetyChecks
    .filter((check) => check.status === "warn")
    .map((check) => check.name);
  const plannedTokenWrites = selectedCandidates.filter((candidate) => candidate.wouldWriteToken).length;
  const plannedMetricAppends = metricAppendPlan.filter((item) => item.wouldAppendMetric).length;

  if (blockingSafetyChecks.length > 0) {
    return {
      status: "blocked",
      safeToWrite: false,
      plannedTokenWrites,
      plannedMetricAppends,
      blockingSafetyChecks,
      warningSafetyChecks,
      nextRecommendedAction: "inspect_blocking_safety_checks",
    };
  }

  if (warningSafetyChecks.length > 0) {
    return {
      status: "warning",
      safeToWrite: false,
      plannedTokenWrites,
      plannedMetricAppends,
      blockingSafetyChecks,
      warningSafetyChecks,
      nextRecommendedAction: "inspect_warning_safety_checks",
    };
  }

  if (pendingCount === 0) {
    return {
      status: "no_pending",
      safeToWrite: false,
      plannedTokenWrites,
      plannedMetricAppends,
      blockingSafetyChecks,
      warningSafetyChecks,
      nextRecommendedAction: "no_action",
    };
  }

  return {
    status: "ready",
    safeToWrite: plannedTokenWrites > 0,
    plannedTokenWrites,
    plannedMetricAppends,
    blockingSafetyChecks,
    warningSafetyChecks,
    nextRecommendedAction: "run_planned_cycles",
  };
}

function buildWritePlan(
  selectedCandidates: SelectedCandidate[],
  metricAppendPlan: MetricAppendPlanItem[],
): WritePlan {
  return {
    enabled: false,
    writeModeSupported: false,
    recommendedInitialWriteArgs: {
      limit: 1,
      maxCycles: 1,
      postCheck: true,
      requireMetricAppend: true,
    },
    wouldWriteTokens: selectedCandidates
      .filter((candidate) => candidate.wouldWriteToken)
      .map((candidate) => ({
        cycle: candidate.cycle,
        orderInCycle: candidate.orderInCycle,
        mint: candidate.mint,
      })),
    wouldAppendMetrics: metricAppendPlan
      .filter((item) => item.wouldAppendMetric)
      .map((item) => ({
        cycle: item.cycle,
        mint: item.mint,
      })),
    requiresCaptureOnly: true,
    postCheckPlan: {
      enabled: true,
      requireMetricPendingMatchesIncomplete: true,
      requireSelectedLatestMetricPresent: true,
    },
    recoveryHints: {
      metricOnlyAppendCandidates: metricAppendPlan
        .filter((item) => !item.wouldAppendMetric && item.metricsCount === 0)
        .map((item) => item.mint),
      cooldownRecommended: true,
      resumeWithLimit: 1,
      resumeWithMaxCycles: 1,
    },
  };
}

function buildWriteModeReadiness(): WriteModeReadiness {
  return {
    readyForImplementation: false,
    blockingReasons: [
      "token_write_helper_not_extracted",
      "metric_append_helper_not_extracted",
    ],
    nextImplementationStep: "extract_token_write_helper",
  };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sinceCutoff = new Date(Date.now() - args.sinceMinutes * 60_000);

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
      scoreTotal: true,
      hardRejected: true,
      createdAt: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
      metrics: {
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          source: true,
          observedAt: true,
          volume24h: true,
        },
      },
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const geckoTokens = rawTokens
    .map(buildSupervisorToken)
    .filter(
      (token) =>
        token.isGeckoterminalOrigin &&
        Date.parse(token.selectionAnchorAt) >= sinceCutoff.getTime(),
    )
    .sort(sortBySelectionAnchorDesc);
  const filteredTokens = args.pumpOnly
    ? geckoTokens.filter((token) => isPumpMint(token.mint))
    : geckoTokens;
  const currentCounts = buildCurrentCounts(geckoTokens, filteredTokens);
  const pendingTokens = filteredTokens.filter(isIncomplete).sort(sortBySelectionAnchorDesc);
  const maxPlanned = args.limit * args.maxCycles;
  const plannedTokens = pendingTokens.slice(0, maxPlanned);
  const cycles: CyclePlan[] = [];

  for (let offset = 0; offset < plannedTokens.length; offset += args.limit) {
    const cycle = Math.floor(offset / args.limit) + 1;
    const selectedCandidates = plannedTokens
      .slice(offset, offset + args.limit)
      .map((token, index) => buildSelectedCandidate(token, cycle, index + 1));
    cycles.push({
      cycle,
      selectedCount: selectedCandidates.length,
      selectedCandidates,
      metricAppendPlan: selectedCandidates.map(buildMetricAppendPlanItem),
    });
  }

  const selectedCandidates = cycles.flatMap((cycle) => cycle.selectedCandidates);
  const metricAppendPlan = cycles.flatMap((cycle) => cycle.metricAppendPlan);
  const safetyChecks = buildSafetyChecks(args, currentCounts, selectedCandidates);
  const stopReason = buildStopReason(
    currentCounts,
    pendingTokens.length,
    selectedCandidates.length,
    safetyChecks,
  );
  const summary = buildOperatorSummary(
    pendingTokens.length,
    selectedCandidates,
    metricAppendPlan,
    safetyChecks,
  );
  const writePlan = buildWritePlan(selectedCandidates, metricAppendPlan);
  const writeModeReadiness = buildWriteModeReadiness();

  console.log(
    JSON.stringify(
      {
        readOnly: true,
        dryRun: args.dryRun,
        writeEnabled: false,
        source: GECKOTERMINAL_NEW_POOLS_SOURCE,
        selection: {
          pumpOnly: args.pumpOnly,
          limit: args.limit,
          maxCycles: args.maxCycles,
          sinceMinutes: args.sinceMinutes,
          sinceCutoff: sinceCutoff.toISOString(),
          captureFile: args.captureFile,
          cooldownSeconds: args.cooldownSeconds,
          stopOnNotifyCandidate: args.stopOnNotifyCandidate,
          stopOnRateLimit: args.stopOnRateLimit,
        },
        summary,
        writePlan,
        writeModeReadiness,
        currentCounts,
        pendingCount: pendingTokens.length,
        wouldRunCycles: cycles.length,
        selectedCandidates,
        metricAppendPlan,
        cycles,
        stopReason,
        safetyChecks,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error: unknown) => {
    if (error instanceof CliUsageError) {
      if (error.message.length > 0) {
        console.error(error.message);
      }
      console.error(getUsageText());
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
