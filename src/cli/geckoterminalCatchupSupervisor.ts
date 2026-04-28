import "dotenv/config";

import { pathToFileURL } from "node:url";

import { db } from "./db.js";
import {
  buildGeckoTokenWriteRunnerInput,
  runGeckoTokenWriteCommandWithNodeExecFile,
  toGeckoCatchupTokenWriteExecutionResult,
  type GeckoCatchupTokenWriteExecutionResult,
  type GeckoTokenWriteCommandRunner,
} from "./geckoterminalCatchupTokenWriteRunner.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const DEFAULT_LIMIT = 2;
const DEFAULT_MAX_CYCLES = 1;
const DEFAULT_SINCE_MINUTES = 10_080;
const GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE = "geckoterminal.token_snapshot";

export type Args = {
  pumpOnly: boolean;
  limit: number;
  maxCycles: number;
  sinceMinutes: number;
  dryRun: true;
  writeRequested: boolean;
  captureFile: string | null;
  cooldownSeconds: number | null;
  stopOnNotifyCandidate: boolean;
  stopOnRateLimit: boolean;
};

export type GeckoCatchupSupervisorDeps = {
  tokenWriteRunner?: GeckoTokenWriteCommandRunner;
};

type GeckoTokenWriteRunnerDecisionPlan = {
  executionSupported: boolean;
  executionEligible: boolean;
  blockedBy: string[];
  notify: boolean;
  metricAppend: boolean;
  postCheck: boolean;
};

type JsonObject = Record<string, unknown>;

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

type RawSupervisorToken = {
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
  enabled: boolean;
  writeModeSupported: boolean;
  writeRequested: boolean;
  recommendedInitialWriteArgs: {
    limit: 1;
    maxCycles: 1;
    postCheck: true;
    requireMetricAppend: false;
  };
  recommendedInitialTokenWriteArgs: {
    limit: 1;
    maxCycles: 1;
    postCheck: true;
    notify: false;
    metricAppend: false;
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
  writeCommandPlan: Array<{
    enabled: boolean;
    executionSupported: boolean;
    executionEligible: boolean;
    command: "pnpm";
    script: "token:enrich-rescore:geckoterminal";
    mint: string;
    cycle: number;
    orderInCycle: number;
    notify: false;
    metricAppend: false;
    postCheck: true;
    reason: "selected_incomplete_token_write";
    blockedBy: string[];
  }>;
  metricAppendCommandPlan: Array<{
    enabled: false;
    executionSupported: false;
    executionEligible: false;
    command: "pnpm";
    script: "metric:snapshot:geckoterminal";
    mint: string;
    cycle: number;
    source: typeof GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE;
    metricAppend: true;
    postCheck: true;
    reason: "selected_incomplete_metric_missing";
    blockedBy: [
      "metric_append_gate_not_implemented",
      "metric_append_runner_not_connected",
    ];
  }>;
  tokenWriteExecutionResults: GeckoCatchupTokenWriteExecutionResult[];
  requiresCaptureOnly: true;
  postCheckPlan: {
    enabled: true;
    requireMetricPendingMatchesIncomplete: true;
    requireSelectedLatestMetricPresent: true;
  };
  postCheckResult: TokenWritePostCheckResult | null;
  recoveryHints: {
    metricOnlyAppendCandidates: string[];
    tokenWriteRetryCandidates: string[];
    inspectTokenCandidates: string[];
    runnerDbMismatchCandidates: string[];
    cooldownRecommended: true;
    resumeWithLimit: 1;
    resumeWithMaxCycles: 1;
  };
};

type TokenWritePostCheckResult = {
  checked: boolean;
  mint: string;
  runnerStatus: GeckoCatchupTokenWriteExecutionResult["status"];
  tokenFound: boolean;
  metadataStatus: string | null;
  hasName: boolean;
  hasSymbol: boolean;
  isStillPending: boolean;
  metricsCount: number;
  hasLatestMetric: boolean;
  warnings: string[];
};

type WriteModeReadiness = {
  readyForImplementation: true;
  supportedWriteMode: "limited_token_only_initial_check";
  blockingReasons: [];
  remainingUnsupportedWriteBehaviors: [
    "metric_append",
    "telegram_notify",
    "multi_token_write",
    "multi_cycle_write",
    "capture_file",
    "cooldown",
  ];
  nextImplementationStep: "run_first_token_only_operational_check";
};

export type GeckoCatchupInitialWriteModeValidationSafetyCheck = {
  name: string;
  status: "pass" | "warn" | "fail";
};

export type GeckoCatchupInitialWriteModeValidationCommandPlan = {
  notify: boolean;
  metricAppend: boolean;
  postCheck: boolean;
};

export type GeckoCatchupInitialWriteModeValidationInput = {
  writeRequested: boolean;
  pumpOnly: boolean;
  limit: number;
  maxCycles: number;
  stopOnNotifyCandidate: boolean;
  stopOnRateLimit: boolean;
  captureFile: string | null;
  cooldownSeconds: number | null;
  selectedCandidates: readonly unknown[];
  safetyChecks: readonly GeckoCatchupInitialWriteModeValidationSafetyCheck[];
  writeCommandPlan: readonly GeckoCatchupInitialWriteModeValidationCommandPlan[];
};

export type GeckoCatchupInitialWriteModeValidationResult = {
  valid: boolean;
  blockedBy: string[];
};

export type GeckoCatchupSupervisorOutput = {
  readOnly: boolean;
  dryRun: boolean;
  writeEnabled: boolean;
  source: typeof GECKOTERMINAL_NEW_POOLS_SOURCE;
  selection: {
    pumpOnly: boolean;
    limit: number;
    maxCycles: number;
    sinceMinutes: number;
    sinceCutoff: string;
    captureFile: string | null;
    cooldownSeconds: number | null;
    stopOnNotifyCandidate: boolean;
    stopOnRateLimit: boolean;
  };
  summary: OperatorSummary;
  writePlan: WritePlan;
  writeModeReadiness: WriteModeReadiness;
  currentCounts: CurrentCounts;
  pendingCount: number;
  wouldRunCycles: number;
  selectedCandidates: SelectedCandidate[];
  metricAppendPlan: MetricAppendPlanItem[];
  cycles: CyclePlan[];
  stopReason: string;
  safetyChecks: SafetyCheck[];
};

class CliUsageError extends Error {}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm ops:catchup:gecko -- [--write] [--pumpOnly] [--limit <N>] [--maxCycles <N>] [--sinceMinutes <N> | --sinceHours <N>] [--dry-run] [--captureFile <PATH>] [--cooldownSeconds <N>] [--stopOnNotifyCandidate <true|false>] [--stopOnRateLimit <true|false>]",
    "",
    "Defaults:",
    `- read-only planning by default; fast wrapper execution, Metric append, Telegram notify, capture file creation, cooldown, and watch mode are not supported`,
    `- --write is supported only for a gated token-only first operational check: --pumpOnly --limit 1 --maxCycles 1, exactly one selected candidate, no failing or warning safety checks, notify=false, metricAppend=false, postCheck=true`,
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

export function parseGeckoCatchupSupervisorArgs(argv: string[]): Args {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: Args = {
    pumpOnly: false,
    limit: DEFAULT_LIMIT,
    maxCycles: DEFAULT_MAX_CYCLES,
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    dryRun: true,
    writeRequested: false,
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
      out.writeRequested = true;
      continue;
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

  if (out.writeRequested) {
    const validation = validateGeckoCatchupInitialWriteMode({
      writeRequested: true,
      pumpOnly: out.pumpOnly,
      limit: out.limit,
      maxCycles: out.maxCycles,
      stopOnNotifyCandidate: out.stopOnNotifyCandidate,
      stopOnRateLimit: out.stopOnRateLimit,
      captureFile: out.captureFile,
      cooldownSeconds: out.cooldownSeconds,
      selectedCandidates: [{}],
      safetyChecks: [],
      writeCommandPlan: [
        {
          notify: false,
          metricAppend: false,
          postCheck: true,
        },
      ],
    });

    if (!validation.valid) {
      throw new CliUsageError(
        `--write is only supported for initial gated token write requests: ${validation.blockedBy.join(", ")}`,
      );
    }
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

function buildSupervisorToken(token: RawSupervisorToken): SupervisorToken {
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

function hasText(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isIncomplete(token: SupervisorToken): boolean {
  return !hasText(token.name) || !hasText(token.symbol);
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
    name: "bounded_token_only_write",
    status: "pass",
    message:
      "Only a gated one-token write is supported; fast wrapper execution, Metric append, Telegram notify, capture file creation, cooldown, and watch mode are disabled.",
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

function buildWriteCommandPlanBlockedBy(
  args: Args,
  selectedCandidates: SelectedCandidate[],
  safetyChecks: SafetyCheck[],
): string[] {
  const initialWriteConditionBlocks = [
    ...(args.limit === 1 ? [] : ["limit_not_one"]),
    ...(args.maxCycles === 1 ? [] : ["max_cycles_not_one"]),
    ...(selectedCandidates.length === 1 ? [] : ["selected_count_not_one"]),
  ];
  const blockingSafetyChecks = safetyChecks
    .filter((check) => check.status === "fail" || check.status === "warn")
    .map((check) => check.name);

  return [
    ...(args.writeRequested ? [] : ["write_not_requested"]),
    ...initialWriteConditionBlocks,
    ...blockingSafetyChecks,
  ];
}

function buildTokenWriteCommandArgs(mint: string): string[] {
  return [
    "token:enrich-rescore:geckoterminal",
    "--",
    "--mint",
    mint,
    "--write",
  ];
}

function buildPostCheckWarnings(
  postCheck: Omit<TokenWritePostCheckResult, "warnings">,
): string[] {
  const warnings: string[] = [];

  if (!postCheck.tokenFound) {
    warnings.push("token_not_found_after_runner");
  }
  if (postCheck.metadataStatus === "mint_only") {
    warnings.push("metadata_status_still_mint_only");
  }
  if (postCheck.tokenFound && postCheck.isStillPending) {
    warnings.push("token_still_pending_after_runner");
  }
  if (postCheck.tokenFound && !postCheck.hasName) {
    warnings.push("name_missing_after_runner");
  }
  if (postCheck.tokenFound && !postCheck.hasSymbol) {
    warnings.push("symbol_missing_after_runner");
  }
  if (postCheck.tokenFound && postCheck.metricsCount === 0) {
    warnings.push("metric_missing_after_token_only_write");
  }
  if (
    (postCheck.runnerStatus === "parse_error" || postCheck.runnerStatus === "cli_error") &&
    postCheck.tokenFound &&
    !postCheck.isStillPending
  ) {
    warnings.push("runner_result_not_ok_but_db_token_updated");
  }
  if (postCheck.runnerStatus === "ok" && (!postCheck.tokenFound || postCheck.isStillPending)) {
    warnings.push("runner_ok_but_db_token_not_complete");
  }

  return warnings;
}

async function buildTokenWritePostCheckResult(
  executionResult: GeckoCatchupTokenWriteExecutionResult,
): Promise<TokenWritePostCheckResult> {
  const token = await db.token.findUnique({
    where: {
      mint: executionResult.mint,
    },
    select: {
      metadataStatus: true,
      name: true,
      symbol: true,
      metrics: {
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
        },
      },
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const hasName = token ? hasText(token.name) : false;
  const hasSymbol = token ? hasText(token.symbol) : false;
  const base = {
    checked: true,
    mint: executionResult.mint,
    runnerStatus: executionResult.status,
    tokenFound: token !== null,
    metadataStatus: token?.metadataStatus ?? null,
    hasName,
    hasSymbol,
    isStillPending: token !== null && (!hasName || !hasSymbol),
    metricsCount: token?._count.metrics ?? 0,
    hasLatestMetric: (token?.metrics.length ?? 0) > 0,
  };

  return {
    ...base,
    warnings: buildPostCheckWarnings(base),
  };
}

function buildRecoveryHints(
  postCheckResult: TokenWritePostCheckResult | null,
): WritePlan["recoveryHints"] {
  const metricOnlyAppendCandidates =
    postCheckResult?.tokenFound === true &&
    !postCheckResult.isStillPending &&
    postCheckResult.metricsCount === 0
      ? [postCheckResult.mint]
      : [];
  const tokenWriteRetryCandidates =
    postCheckResult &&
    (!postCheckResult.tokenFound || postCheckResult.isStillPending)
      ? [postCheckResult.mint]
      : [];
  const inspectTokenCandidates =
    postCheckResult && postCheckResult.warnings.length > 0
      ? [postCheckResult.mint]
      : [];
  const runnerDbMismatchCandidates =
    postCheckResult &&
    postCheckResult.warnings.some((warning) =>
      warning === "runner_result_not_ok_but_db_token_updated" ||
      warning === "runner_ok_but_db_token_not_complete"
    )
      ? [postCheckResult.mint]
      : [];

  return {
    metricOnlyAppendCandidates,
    tokenWriteRetryCandidates,
    inspectTokenCandidates,
    runnerDbMismatchCandidates,
    cooldownRecommended: true,
    resumeWithLimit: 1,
    resumeWithMaxCycles: 1,
  };
}

export function validateGeckoCatchupInitialWriteMode(
  input: GeckoCatchupInitialWriteModeValidationInput,
): GeckoCatchupInitialWriteModeValidationResult {
  const blockedBy = [
    ...(input.writeRequested ? [] : ["write_not_requested"]),
    ...(input.pumpOnly ? [] : ["pump_only_required"]),
    ...(input.limit === 1 ? [] : ["limit_not_one"]),
    ...(input.maxCycles === 1 ? [] : ["max_cycles_not_one"]),
    ...(input.stopOnNotifyCandidate ? [] : ["stop_on_notify_candidate_required"]),
    ...(input.stopOnRateLimit ? [] : ["stop_on_rate_limit_required"]),
    ...(input.captureFile === null ? [] : ["capture_file_not_supported"]),
    ...(input.cooldownSeconds === null ? [] : ["cooldown_seconds_not_supported"]),
    ...(input.selectedCandidates.length === 1 ? [] : ["selected_count_not_one"]),
    ...(input.writeCommandPlan.length === 1 ? [] : ["write_command_plan_count_not_one"]),
    ...input.safetyChecks
      .filter((check) => check.status === "fail" || check.status === "warn")
      .map((check) => check.name),
  ];

  if (input.writeCommandPlan.length === 1) {
    const [plan] = input.writeCommandPlan;
    blockedBy.push(
      ...(plan.notify === false ? [] : ["notify_not_supported"]),
      ...(plan.metricAppend === false ? [] : ["metric_append_not_supported"]),
      ...(plan.postCheck === true ? [] : ["post_check_required"]),
    );
  }

  return {
    valid: blockedBy.length === 0,
    blockedBy,
  };
}

function buildWritePlan(
  args: Args,
  selectedCandidates: SelectedCandidate[],
  metricAppendPlan: MetricAppendPlanItem[],
  safetyChecks: SafetyCheck[],
): WritePlan {
  const writeCommandPlanBlockedBy = buildWriteCommandPlanBlockedBy(
    args,
    selectedCandidates,
    safetyChecks,
  );
  const initialWriteCandidate = selectedCandidates.find((candidate) => candidate.wouldWriteToken);

  return {
    enabled: false,
    writeModeSupported: true,
    writeRequested: args.writeRequested,
    recommendedInitialWriteArgs: {
      limit: 1,
      maxCycles: 1,
      postCheck: true,
      requireMetricAppend: false,
    },
    recommendedInitialTokenWriteArgs: {
      limit: 1,
      maxCycles: 1,
      postCheck: true,
      notify: false,
      metricAppend: false,
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
    writeCommandPlan: initialWriteCandidate
      ? [
          {
            enabled: false,
            executionSupported: true,
            executionEligible: writeCommandPlanBlockedBy.length === 0,
            command: "pnpm",
            script: "token:enrich-rescore:geckoterminal",
            mint: initialWriteCandidate.mint,
            cycle: initialWriteCandidate.cycle,
            orderInCycle: initialWriteCandidate.orderInCycle,
            notify: false,
            metricAppend: false,
            postCheck: true,
            reason: "selected_incomplete_token_write",
            blockedBy: writeCommandPlanBlockedBy,
          },
        ]
      : [],
    metricAppendCommandPlan: metricAppendPlan
      .filter((item) => item.wouldAppendMetric)
      .map((item) => ({
        enabled: false,
        executionSupported: false,
        executionEligible: false,
        command: "pnpm",
        script: "metric:snapshot:geckoterminal",
        mint: item.mint,
        cycle: item.cycle,
        source: GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE,
        metricAppend: true,
        postCheck: true,
        reason: "selected_incomplete_metric_missing",
        blockedBy: [
          "metric_append_gate_not_implemented",
          "metric_append_runner_not_connected",
        ],
      })),
    tokenWriteExecutionResults: [],
    requiresCaptureOnly: true,
    postCheckPlan: {
      enabled: true,
      requireMetricPendingMatchesIncomplete: true,
      requireSelectedLatestMetricPresent: true,
    },
    postCheckResult: null,
    recoveryHints: buildRecoveryHints(null),
  };
}

function buildWriteModeReadiness(): WriteModeReadiness {
  return {
    readyForImplementation: true,
    supportedWriteMode: "limited_token_only_initial_check",
    blockingReasons: [],
    remainingUnsupportedWriteBehaviors: [
      "metric_append",
      "telegram_notify",
      "multi_token_write",
      "multi_cycle_write",
      "capture_file",
      "cooldown",
    ],
    nextImplementationStep: "run_first_token_only_operational_check",
  };
}

export function shouldRunGeckoTokenWriteRunner(
  writeCommandPlan: GeckoTokenWriteRunnerDecisionPlan[],
  deps: GeckoCatchupSupervisorDeps = {},
): boolean {
  if (!deps.tokenWriteRunner || writeCommandPlan.length !== 1) {
    return false;
  }

  const [plan] = writeCommandPlan;
  return (
    plan.executionSupported &&
    plan.executionEligible &&
    plan.blockedBy.length === 0 &&
    plan.notify === false &&
    plan.metricAppend === false &&
    plan.postCheck === true
  );
}

async function runInjectedGeckoTokenWriteRunner(
  args: Args,
  output: GeckoCatchupSupervisorOutput,
  deps: GeckoCatchupSupervisorDeps,
): Promise<GeckoCatchupSupervisorOutput> {
  if (!args.writeRequested || !deps.tokenWriteRunner) {
    return output;
  }

  const validation = validateGeckoCatchupInitialWriteMode({
    writeRequested: args.writeRequested,
    pumpOnly: args.pumpOnly,
    limit: args.limit,
    maxCycles: args.maxCycles,
    stopOnNotifyCandidate: args.stopOnNotifyCandidate,
    stopOnRateLimit: args.stopOnRateLimit,
    captureFile: args.captureFile,
    cooldownSeconds: args.cooldownSeconds,
    selectedCandidates: output.selectedCandidates,
    safetyChecks: output.safetyChecks,
    writeCommandPlan: output.writePlan.writeCommandPlan,
  });

  if (!validation.valid || output.writePlan.writeCommandPlan.length !== 1) {
    return output;
  }

  const [plan] = output.writePlan.writeCommandPlan;
  const executablePlan = {
    ...plan,
    enabled: true,
    executionSupported: true,
    executionEligible: true,
    blockedBy: [],
  };
  const executableOutput: GeckoCatchupSupervisorOutput = {
    ...output,
    readOnly: false,
    dryRun: false,
    writeEnabled: true,
    writePlan: {
      ...output.writePlan,
      enabled: true,
      writeModeSupported: true,
      writeCommandPlan: [executablePlan],
      tokenWriteExecutionResults: [],
    },
  };

  if (!shouldRunGeckoTokenWriteRunner(executableOutput.writePlan.writeCommandPlan, deps)) {
    return output;
  }

  const runnerInput = buildGeckoTokenWriteRunnerInput(
    {
      ...executablePlan,
      args: buildTokenWriteCommandArgs(executablePlan.mint),
    },
    {
      cwd: process.cwd(),
      env: process.env,
    },
  );
  const runnerResult = await deps.tokenWriteRunner(runnerInput);
  const executionResult = toGeckoCatchupTokenWriteExecutionResult(runnerInput, runnerResult);
  const postCheckResult = await buildTokenWritePostCheckResult(executionResult);

  return {
    ...executableOutput,
    writePlan: {
      ...executableOutput.writePlan,
      tokenWriteExecutionResults: [executionResult],
      postCheckResult,
      recoveryHints: buildRecoveryHints(postCheckResult),
    },
  };
}

export function buildGeckoCatchupSupervisorPlan(
  args: Args,
  rawTokens: RawSupervisorToken[],
  sinceCutoff: Date,
): GeckoCatchupSupervisorOutput {
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
  const writePlan = buildWritePlan(args, selectedCandidates, metricAppendPlan, safetyChecks);
  const writeModeReadiness = buildWriteModeReadiness();

  return {
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
  };
}

export async function buildGeckoCatchupSupervisorOutput(
  args: Args,
): Promise<GeckoCatchupSupervisorOutput> {
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

  return buildGeckoCatchupSupervisorPlan(args, rawTokens, sinceCutoff);
}

export async function runGeckoCatchupSupervisor(
  args: Args,
  deps: GeckoCatchupSupervisorDeps = {},
): Promise<GeckoCatchupSupervisorOutput> {
  const output = await buildGeckoCatchupSupervisorOutput(args);
  return runInjectedGeckoTokenWriteRunner(args, output, deps);
}

export function buildGeckoCatchupSupervisorCliDeps(): GeckoCatchupSupervisorDeps {
  return {
    tokenWriteRunner: runGeckoTokenWriteCommandWithNodeExecFile,
  };
}

export async function runGeckoCatchupSupervisorCli(
  argv = process.argv.slice(2),
  deps = buildGeckoCatchupSupervisorCliDeps(),
): Promise<void> {
  const args = parseGeckoCatchupSupervisorArgs(argv);
  const output = await runGeckoCatchupSupervisor(args, deps);

  console.log(
    JSON.stringify(
      output,
      null,
      2,
    ),
  );
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runGeckoCatchupSupervisorCli()
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
}
