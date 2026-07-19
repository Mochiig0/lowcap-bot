import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import type {
  BoundedOperationPlannerInput,
  CleanupWindowSource,
  DbState,
  NotificationState,
  QueueState,
} from "./boundedOperationPlanner.js";
import { resolveCleanupWindow } from "./boundedOperationPlanner.js";

const DEFAULT_HOURS = 6;
const DEFAULT_METRIC_LIMIT = 50;
const DEFAULT_LONGITUDINAL_METRIC_LIMIT = 50;
const DEFAULT_ENRICH_LIMIT = 50;
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_POST_RUN_BUFFER_MINUTES = 60;
const DEFAULT_INTER_ITEM_DELAY_MS = 15_000;
const DEFAULT_POST_RUN_METRIC_CYCLES = 1;
const DEFAULT_POST_RUN_LONGITUDINAL_METRIC_CYCLES = 0;
const DEFAULT_POST_RUN_ENRICH_CYCLES = 1;
const METRIC_MIN_GAP_MINUTES = 60;
const MANUAL_INTERRUPT_CODE = "manual_interrupt";

type CoreDbCounts = {
  tokenCount: number;
  metricCount: number;
  notificationCount: number;
  holderSnapshotCount: number;
};

type CoreDbDeltas = {
  token: number;
  metric: number;
  notification: number;
  holderSnapshot: number;
};

type CheckpointState = {
  exists: boolean | null;
  valid: boolean | null;
  summary: Record<string, unknown> | null;
  errorCode: string | null;
};

export type BoundedOperationRunnerOptions = {
  hours: number;
  pumpOnly: boolean;
  checkpointFile?: string;
  metricLimit: number;
  longitudinalMetricLimit: number;
  enrichLimit: number;
  intervalSeconds: number;
  maxIterations?: number;
  postRunBufferMinutes: number;
  interItemDelayMs: number;
  postRunMetricCycles: number;
  postRunLongitudinalMetricCycles: number;
  postRunEnrichCycles: number;
  longitudinalMetricMinGapMinutes: number;
  cleanupSinceMinutes?: number;
  executeRequested: boolean;
  repoRoot: string;
};

export type BoundedOperationRunnerPhaseName =
  | "preflight"
  | "detect_write"
  | "metric_pending_snapshot"
  | "enrich_rescore"
  | "metric_longitudinal_snapshot"
  | "report_review"
  | "notification_plan_review";

export type BoundedOperationRunnerPhaseStatus =
  | "ok"
  | "planned"
  | "executed"
  | "skipped"
  | "blocked"
  | "failed"
  | "interrupted";

export type BoundedOperationRunnerStatus =
  | "planned"
  | "completed"
  | "partial"
  | "failed"
  | "blocked"
  | "interrupted";

export type PhaseCommand = {
  label: string;
  commandCandidate: string;
  file: string;
  args: string[];
  env?: Record<string, string>;
};

export type BoundedOperationRunnerPhase = {
  phase: BoundedOperationRunnerPhaseName;
  status: BoundedOperationRunnerPhaseStatus;
  commandCandidate: string | null;
  commandCandidates?: string[];
  summary: Record<string, unknown>;
  expectedSideEffects: string[];
  expectedNonEffects: string[];
  sideEffects: string[];
  blockedBy: string[];
  stopConditionCodes: string[];
  writePhase: boolean;
};

export type PhaseExecutionResult = {
  ok: boolean;
  interrupted?: boolean;
  summary?: Record<string, unknown>;
  blockedBy?: string[];
  stopConditionCodes?: string[];
};

export type BoundedOperationRunnerInterruptSignal = "SIGINT" | "SIGTERM";

type ActivePhaseSnapshot = {
  phase: BoundedOperationRunnerPhaseName | null;
  cycleIndex: number | null;
  cycleTotal: number | null;
};

export type BoundedOperationRunnerExecutionContext = {
  isInterrupted: () => boolean;
  getInterruptSignal: () => BoundedOperationRunnerInterruptSignal | null;
  requestInterrupt: (signal: BoundedOperationRunnerInterruptSignal) => void;
  registerChildTerminator: (terminator: () => void) => () => void;
  getActivePhase: () => ActivePhaseSnapshot;
};

export type PhaseExecutor = (
  phase: BoundedOperationRunnerPhase,
  commands: PhaseCommand[],
  context?: BoundedOperationRunnerExecutionContext,
) => Promise<PhaseExecutionResult>;

export type BoundedOperationRunnerProgressEvent = {
  event: "phase" | "cycle" | "final_summary";
  phase?: BoundedOperationRunnerPhaseName;
  status: string;
  at: string;
  durationMs?: number;
  cycleIndex?: number;
  cycleTotal?: number;
  summary?: Record<string, unknown>;
  blockedBy?: string[];
  stopConditionCodes?: string[];
};

export type BoundedOperationRunnerLogger = (
  event: BoundedOperationRunnerProgressEvent,
) => void;

export type BoundedOperationRunnerProgressSummary = {
  overallStatus: BoundedOperationRunnerStatus;
  executeRequested: boolean;
  readOnly: boolean;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  interruptedAt: string | null;
  durationMs: number;
  elapsedMs: number;
  activePhase: BoundedOperationRunnerPhaseName | null;
  activeCycleIndex: number | null;
  activeCycleTotal: number | null;
  partialPhase: BoundedOperationRunnerPhaseName | null;
  phasesCompleted: string[];
  phasesFailed: string[];
  phasesSkipped: string[];
  detectSummary: Record<string, unknown>;
  metricCyclesExecuted: number;
  longitudinalMetricCyclesExecuted: number;
  enrichCyclesExecuted: number;
  metricCyclesStoppedReason: string | null;
  longitudinalMetricCyclesStoppedReason: string | null;
  enrichCyclesStoppedReason: string | null;
  totalTokenCreateReuse: number | null;
  totalInitialMetricWrite: number | null;
  totalLongitudinalMetricWrite: number | null;
  totalMetricWrite: number | null;
  totalTokenUpdate: number | null;
  notificationCreateUpdateExpected: 0;
  telegramSendExpected: 0;
  checkpointFile: string | null;
  checkpointExists: boolean | null;
  checkpointValid: boolean | null;
  checkpointSafeCursorSummary: Record<string, unknown> | null;
  blockedBy: string[];
  stopConditionCodes: string[];
};

export type BoundedOperatorCycleSummary = {
  overallStatus: BoundedOperationRunnerStatus;
  completedPhases: string[];
  skippedPhases: string[];
  failedPhases: string[];
  stopReason: string | null;
  partialPhase: BoundedOperationRunnerPhaseName | null;
  detectHorizonHours: number;
  cleanupHorizonHours: number;
  cleanupSinceMinutes: number;
  cleanupWindowSource: CleanupWindowSource;
  elapsedMs: number;
  checkpointBefore: {
    file: string | null;
    exists: boolean | null;
    valid: boolean | null;
    safeCursorSummary: Record<string, unknown> | null;
  };
  checkpointAfter: {
    file: string | null;
    exists: boolean | null;
    valid: boolean | null;
    safeCursorSummary: Record<string, unknown> | null;
  };
  dbCountsBefore: CoreDbCounts;
  dbCountsAfter: CoreDbCounts;
  deltas: CoreDbDeltas;
  phaseDeltas: Record<BoundedOperationRunnerPhaseName, CoreDbDeltas | null>;
  detect: {
    selected: number | null;
    imported: number | null;
    existing: number | null;
    failed: number | null;
  };
  metric: {
    selected: number | null;
    ok: number | null;
    written: number | null;
    skipped: number | null;
    error: number | null;
  };
  longitudinalMetric: {
    selected: number | null;
    ok: number | null;
    written: number | null;
    skipped: number | null;
    error: number | null;
  };
  enrich: {
    selected: number | null;
    updated: number | null;
    skipped: number | null;
    error: number | null;
  };
  providerErrorCountByPhase: Record<string, number>;
  itemErrorCountByPhase: Record<string, number>;
  firstErrorCategory: string | null;
  firstHttpStatus: number | null;
  firstErrorClass: string | null;
  firstErrorTokenId: number | null;
  queueAfter: QueueState;
  growthAfter: Record<string, unknown> | null;
  notifyCandidateCount: number;
  autoSendAllowedCount: number;
  retryCandidateCount: number;
  telegramSendCount: 0;
  nextRecommendedStep: string;
  nextCommand: string | null;
};

export type BoundedOperationRunnerReport = {
  mode: "bounded_operation_runner";
  status: BoundedOperationRunnerStatus;
  readOnly: boolean;
  dryRun: boolean;
  executeRequested: boolean;
  hours: number;
  pumpOnly: boolean;
  computedSinceMinutes: number;
  detectHorizonHours: number;
  cleanupHorizonHours: number;
  cleanupSinceMinutes: number;
  cleanupWindowSource: CleanupWindowSource;
  maxIterations: number;
  intervalSeconds: number;
  detectLimitPerCycle: 1;
  metricLimit: number;
  longitudinalMetricLimit: number;
  enrichLimit: number;
  longitudinalMetricMinGapMinutes: number;
  postRunBufferMinutes: number;
  interItemDelayMs: number;
  estimatedMinimumDurationMs: number;
  nextCommand: string | null;
  checkpointFile: string | null;
  checkpointBeforeExists: boolean | null;
  checkpointBeforeValid: boolean | null;
  checkpointBeforeSafeCursorSummary: Record<string, unknown> | null;
  checkpointExists: boolean | null;
  checkpointValid: boolean | null;
  checkpointSafeCursorSummary: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  interruptedAt: string | null;
  activePhase: BoundedOperationRunnerPhaseName | null;
  activeCycleIndex: number | null;
  activeCycleTotal: number | null;
  partialPhase: BoundedOperationRunnerPhaseName | null;
  dbState: DbState;
  finalDbState: DbState;
  queueState: QueueState;
  notificationState: NotificationState;
  finalNotificationState: NotificationState;
  operationReadiness: {
    schedulerUnlocked: false;
    systemdUnlocked: false;
    alwaysOnAutoSendUnlocked: false;
    telegramLiveSendUnlocked: false;
    retryExecutionUnlocked: false;
  };
  phases: BoundedOperationRunnerPhase[];
  finalQueueState: QueueState;
  postRunMetricCycles: number;
  postRunLongitudinalMetricCycles: number;
  postRunEnrichCycles: number;
  metricCyclesExecuted: number;
  longitudinalMetricCyclesExecuted: number;
  enrichCyclesExecuted: number;
  metricCyclesStoppedReason: string | null;
  longitudinalMetricCyclesStoppedReason: string | null;
  enrichCyclesStoppedReason: string | null;
  blockedBy: string[];
  stopConditionCodes: string[];
  expectedSideEffects: string[];
  expectedNonEffects: string[];
  progressSummary?: BoundedOperationRunnerProgressSummary;
  operatorSummary?: BoundedOperatorCycleSummary;
};

export const DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS = {
  hours: DEFAULT_HOURS,
  metricLimit: DEFAULT_METRIC_LIMIT,
  longitudinalMetricLimit: DEFAULT_LONGITUDINAL_METRIC_LIMIT,
  enrichLimit: DEFAULT_ENRICH_LIMIT,
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  postRunBufferMinutes: DEFAULT_POST_RUN_BUFFER_MINUTES,
  interItemDelayMs: DEFAULT_INTER_ITEM_DELAY_MS,
  postRunMetricCycles: DEFAULT_POST_RUN_METRIC_CYCLES,
  postRunLongitudinalMetricCycles:
    DEFAULT_POST_RUN_LONGITUDINAL_METRIC_CYCLES,
  postRunEnrichCycles: DEFAULT_POST_RUN_ENRICH_CYCLES,
  longitudinalMetricMinGapMinutes: METRIC_MIN_GAP_MINUTES,
} as const;

function optionalPumpOnlyArg(pumpOnly: boolean): string[] {
  return pumpOnly ? ["--pumpOnly"] : [];
}

export function computeMaxIterations(input: {
  hours: number;
  intervalSeconds: number;
  maxIterations?: number;
}): number {
  if (input.maxIterations !== undefined) {
    return input.maxIterations;
  }

  return Math.max(1, Math.ceil((input.hours * 60 * 60) / input.intervalSeconds));
}

export function computeSinceMinutes(input: {
  hours: number;
  postRunBufferMinutes: number;
}): number {
  return Math.max(1, Math.ceil(input.hours * 60 + input.postRunBufferMinutes));
}

export function computeEstimatedMinimumDurationMs(
  options: BoundedOperationRunnerOptions,
): number {
  const detectIntervalWaits = Math.max(0, computeMaxIterations(options) - 1);
  const metricInterItemWaits =
    Math.max(0, options.metricLimit - 1) * options.postRunMetricCycles;
  const longitudinalMetricInterItemWaits =
    Math.max(0, options.longitudinalMetricLimit - 1)
    * options.postRunLongitudinalMetricCycles;
  const enrichInterItemWaits =
    Math.max(0, options.enrichLimit - 1) * options.postRunEnrichCycles;

  return detectIntervalWaits * options.intervalSeconds * 1_000
    + (
      metricInterItemWaits
      + enrichInterItemWaits
      + longitudinalMetricInterItemWaits
    ) * options.interItemDelayMs;
}

function isCurrentOperatorPreset(options: BoundedOperationRunnerOptions): boolean {
  return options.hours === 3
    && options.pumpOnly
    && options.checkpointFile === "/tmp/lowcap-bot-gecko-bounded-write-rehearsal.json"
    && options.metricLimit === 50
    && options.longitudinalMetricLimit === 50
    && options.enrichLimit === 50
    && options.intervalSeconds === 60
    && computeMaxIterations(options) === 180
    && options.postRunBufferMinutes === 60
    && options.interItemDelayMs === 15_000
    && options.postRunMetricCycles === 4
    && options.postRunEnrichCycles === 4
    && options.postRunLongitudinalMetricCycles === 1
    && options.longitudinalMetricMinGapMinutes === 60;
}

function buildNextExecutionCommand(
  options: BoundedOperationRunnerOptions,
): string | null {
  if (options.executeRequested || options.checkpointFile === undefined) {
    return null;
  }

  if (isCurrentOperatorPreset(options)) {
    return "pnpm -s ops:run:bounded -- --operatorCycle --execute";
  }

  return [
    "pnpm -s ops:run:bounded --",
    `--hours ${options.hours}`,
    ...optionalPumpOnlyArg(options.pumpOnly),
    `--checkpointFile ${options.checkpointFile}`,
    `--metricLimit ${options.metricLimit}`,
    `--longitudinalMetricLimit ${options.longitudinalMetricLimit}`,
    `--enrichLimit ${options.enrichLimit}`,
    `--postRunMetricCycles ${options.postRunMetricCycles}`,
    `--postRunLongitudinalMetricCycles ${options.postRunLongitudinalMetricCycles}`,
    `--postRunEnrichCycles ${options.postRunEnrichCycles}`,
    `--longitudinalMetricMinGapMinutes ${options.longitudinalMetricMinGapMinutes}`,
    `--intervalSeconds ${options.intervalSeconds}`,
    `--maxIterations ${computeMaxIterations(options)}`,
    `--postRunBufferMinutes ${options.postRunBufferMinutes}`,
    `--interItemDelayMs ${options.interItemDelayMs}`,
    "--execute",
  ].join(" ");
}

function joinCommand(file: string, args: string[], env?: Record<string, string>): string {
  const prefix = env && Object.keys(env).length > 0
    ? `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join(" ")} `
    : "";
  return `${prefix}${[file, ...args].join(" ")}`;
}

function abbreviateValue(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function readCheckpointSafeCursorSummary(checkpointFile: string | null): CheckpointState {
  if (checkpointFile === null) {
    return {
      exists: null,
      valid: null,
      summary: null,
      errorCode: null,
    };
  }

  if (!existsSync(checkpointFile)) {
    return {
      exists: false,
      valid: true,
      summary: null,
      errorCode: null,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(checkpointFile, "utf8")) as unknown;
    const record = asRecord(parsed);
    const cursor = asRecord(record?.cursor);
    const poolCreatedAt = asString(cursor?.poolCreatedAt);
    const poolAddress = asString(cursor?.poolAddress);
    const source = asString(record?.source);
    if (
      source !== GECKOTERMINAL_NEW_POOLS_SOURCE
      || poolCreatedAt === undefined
      || Number.isNaN(Date.parse(poolCreatedAt))
      || poolAddress === undefined
      || poolAddress.trim().length === 0
    ) {
      return {
        exists: true,
        valid: false,
        summary: { invalid: true },
        errorCode: "checkpoint_file_invalid",
      };
    }
    const summary: Record<string, unknown> = {};

    if (source !== undefined) {
      summary.source = source;
    }
    if (poolCreatedAt !== undefined) {
      summary.poolCreatedAt = poolCreatedAt;
    }
    if (poolAddress !== undefined) {
      summary.poolAddressAbbrev = abbreviateValue(poolAddress);
    }

    return {
      exists: true,
      valid: true,
      summary: Object.keys(summary).length > 0 ? summary : null,
      errorCode: null,
    };
  } catch {
    return {
      exists: true,
      valid: false,
      summary: { invalid: true },
      errorCode: "checkpoint_file_invalid",
    };
  }
}

function buildNodeTsxCliExecution(options: BoundedOperationRunnerOptions, cliPath: string, args: string[]): {
  file: string;
  args: string[];
} {
  return {
    file: process.execPath,
    args: ["--import", "tsx", path.join(options.repoRoot, cliPath), ...args],
  };
}

function buildDetectCommand(options: BoundedOperationRunnerOptions): PhaseCommand {
  const checkpoint = options.checkpointFile ?? "<CHECKPOINT_FILE>";
  const cliArgs = [
    "--watch",
    "--write",
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit",
    "1",
    "--maxIterations",
    String(computeMaxIterations(options)),
    "--intervalSeconds",
    String(options.intervalSeconds),
    "--checkpointFile",
    checkpoint,
  ];
  const displayArgs = [
    "-s",
    "detect:geckoterminal:new-pools",
    "--",
    ...cliArgs,
  ];
  const execution = buildNodeTsxCliExecution(
    options,
    "src/cli/detectGeckoterminalNewPools.ts",
    cliArgs,
  );

  return {
    label: "detect_write",
    commandCandidate: joinCommand("pnpm", displayArgs),
    file: execution.file,
    args: execution.args,
  };
}

function buildMetricCommand(options: BoundedOperationRunnerOptions, cycleIndex?: number): PhaseCommand {
  const cliArgs = [
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit",
    String(options.metricLimit),
    "--sinceMinutes",
    String(options.cleanupSinceMinutes ?? computeSinceMinutes(options)),
    "--minGapMinutes",
    String(METRIC_MIN_GAP_MINUTES),
    "--interItemDelayMs",
    String(options.interItemDelayMs),
    "--onlyMetricPending",
    "--noNotificationCapture",
    "--write",
  ];
  const displayArgs = [
    "-s",
    "metric:snapshot:geckoterminal",
    "--",
    ...cliArgs,
  ];
  const execution = buildNodeTsxCliExecution(
    options,
    "src/cli/metricSnapshotGeckoterminal.ts",
    cliArgs,
  );

  return {
    label: cycleIndex === undefined ? "metric_pending_snapshot" : `metric_pending_snapshot_cycle_${cycleIndex}`,
    commandCandidate: joinCommand("pnpm", displayArgs),
    file: execution.file,
    args: execution.args,
  };
}

function buildLongitudinalMetricCommand(
  options: BoundedOperationRunnerOptions,
  cycleIndex?: number,
): PhaseCommand {
  const cliArgs = [
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit",
    String(options.longitudinalMetricLimit),
    "--sinceMinutes",
    String(options.cleanupSinceMinutes ?? computeSinceMinutes(options)),
    "--minGapMinutes",
    String(options.longitudinalMetricMinGapMinutes),
    "--interItemDelayMs",
    String(options.interItemDelayMs),
    "--onlyMetricOnce",
    "--noNotificationCapture",
    "--write",
  ];
  const displayArgs = [
    "-s",
    "metric:snapshot:geckoterminal",
    "--",
    ...cliArgs,
  ];
  const execution = buildNodeTsxCliExecution(
    options,
    "src/cli/metricSnapshotGeckoterminal.ts",
    cliArgs,
  );

  return {
    label: cycleIndex === undefined
      ? "metric_longitudinal_snapshot"
      : `metric_longitudinal_snapshot_cycle_${cycleIndex}`,
    commandCandidate: joinCommand("pnpm", displayArgs),
    file: execution.file,
    args: execution.args,
  };
}

function buildEnrichCommand(options: BoundedOperationRunnerOptions, cycleIndex?: number): PhaseCommand {
  const cliArgs = [
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit",
    String(options.enrichLimit),
    "--sinceMinutes",
    String(options.cleanupSinceMinutes ?? computeSinceMinutes(options)),
    "--interItemDelayMs",
    String(options.interItemDelayMs),
    "--onlyMetricCovered",
    "--write",
  ];
  const displayArgs = [
    "-s",
    "token:enrich-rescore:geckoterminal",
    "--",
    ...cliArgs,
  ];
  const execution = buildNodeTsxCliExecution(
    options,
    "src/cli/tokenEnrichRescoreGeckoterminal.ts",
    cliArgs,
  );

  return {
    label: cycleIndex === undefined ? "enrich_rescore" : `enrich_rescore_cycle_${cycleIndex}`,
    commandCandidate: joinCommand("pnpm", displayArgs),
    file: execution.file,
    args: execution.args,
  };
}

function buildMetricCycleCommands(options: BoundedOperationRunnerOptions): PhaseCommand[] {
  return Array.from({ length: options.postRunMetricCycles }, (_, index) =>
    buildMetricCommand(options, index + 1),
  );
}

function buildLongitudinalMetricCycleCommands(
  options: BoundedOperationRunnerOptions,
): PhaseCommand[] {
  return Array.from(
    { length: options.postRunLongitudinalMetricCycles },
    (_, index) => buildLongitudinalMetricCommand(options, index + 1),
  );
}

function buildEnrichCycleCommands(options: BoundedOperationRunnerOptions): PhaseCommand[] {
  return Array.from({ length: options.postRunEnrichCycles }, (_, index) =>
    buildEnrichCommand(options, index + 1),
  );
}

function buildReviewQueueCommand(options: BoundedOperationRunnerOptions, sinceHours?: number): PhaseCommand {
  const args = [
    "-s",
    "review:queue:geckoterminal",
    "--",
    ...optionalPumpOnlyArg(options.pumpOnly),
    ...(sinceHours === undefined ? [] : ["--sinceHours", String(sinceHours)]),
    "--limit",
    "20",
  ];

  return {
    label: sinceHours === undefined ? "review_queue_default" : `review_queue_${sinceHours}h`,
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
}

function buildGrowthReportCommand(options: BoundedOperationRunnerOptions): PhaseCommand {
  const args = [
    "-s",
    "metrics:growth-report",
    "--",
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--minMetricCount",
    "2",
    "--limit",
    "10",
    "--sortBy",
    "fdvMultiple",
  ];

  return {
    label: "metrics_growth_report",
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
}

function buildBoundedReadinessCommand(): PhaseCommand {
  const args = ["-s", "bounded:watch:readiness"];

  return {
    label: "bounded_watch_readiness",
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
}

function buildBoundedPlannerCommand(options: BoundedOperationRunnerOptions): PhaseCommand {
  const cleanupSinceHours = (options.cleanupSinceMinutes ?? computeSinceMinutes(options)) / 60;
  const args = [
    "-s",
    "ops:plan:bounded",
    "--",
    "--hours",
    String(options.hours),
    "--sinceHours",
    String(cleanupSinceHours),
    "--limit",
    String(options.metricLimit),
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--postRunPlan",
    "--metricLimit",
    String(options.metricLimit),
    "--enrichLimit",
    String(options.enrichLimit),
  ];

  return {
    label: "bounded_next_step_planner",
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
}

function buildNotificationPlanCommands(): PhaseCommand[] {
  const autoSendArgs = ["-s", "notification:auto-send:plan"];
  const retryArgs = ["-s", "notification:retry:plan"];

  return [
    {
      label: "notification_auto_send_plan",
      commandCandidate: joinCommand("pnpm", autoSendArgs),
      file: "pnpm",
      args: autoSendArgs,
    },
    {
      label: "notification_auto_send_plan_enabled",
      commandCandidate: joinCommand("pnpm", autoSendArgs, {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      }),
      file: "pnpm",
      args: autoSendArgs,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    },
    {
      label: "notification_retry_plan",
      commandCandidate: joinCommand("pnpm", retryArgs),
      file: "pnpm",
      args: retryArgs,
    },
  ];
}

function isPathInside(childPath: string, parentPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildStopBlockers(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationRunnerOptions,
  checkpointState: CheckpointState,
): {
  blockedBy: string[];
  stopConditionCodes: string[];
} {
  const blockedBy: string[] = [];
  const stopConditionCodes: string[] = [];

  if (input.notificationState.failedCount > 0) {
    blockedBy.push("failed_notifications_present");
    stopConditionCodes.push("failed_notifications_present");
  }

  if (input.notificationState.retryCandidateCount > 0) {
    blockedBy.push("retry_candidate_present");
    stopConditionCodes.push("retry_candidate_present");
  }

  if (input.notificationState.allowedAutoSendCandidateCount > 0) {
    blockedBy.push("auto_send_allowed_candidate_present");
    stopConditionCodes.push("auto_send_allowed_candidate_present");
  }

  if (options.executeRequested && !options.checkpointFile) {
    blockedBy.push("checkpoint_file_required_for_execute");
    stopConditionCodes.push("checkpoint_file_required_for_execute");
  }

  if (options.checkpointFile && isPathInside(options.checkpointFile, options.repoRoot)) {
    blockedBy.push("checkpoint_file_inside_repo");
    stopConditionCodes.push("checkpoint_file_inside_repo");
  }

  if (checkpointState.exists === true && checkpointState.valid === false) {
    blockedBy.push(checkpointState.errorCode ?? "checkpoint_file_invalid");
    stopConditionCodes.push(checkpointState.errorCode ?? "checkpoint_file_invalid");
  }

  return {
    blockedBy,
    stopConditionCodes,
  };
}

function noWriteNonEffects(): string[] {
  return [
    "DB write 0 in plan-only mode",
    "external fetch 0 in plan-only mode",
    "Telegram send 0",
    "Notification create/update 0",
    "Token write 0 in plan-only mode",
    "Metric write 0 in plan-only mode",
    "HolderSnapshot write 0",
    "scheduler/systemd 0",
    "rawJson full dump 0",
    "offensive raw text dump 0",
  ];
}

function phase(
  phaseName: BoundedOperationRunnerPhaseName,
  status: BoundedOperationRunnerPhaseStatus,
  commands: PhaseCommand[],
  input: {
    writePhase: boolean;
    summary?: Record<string, unknown>;
    expectedSideEffects?: string[];
    expectedNonEffects?: string[];
    blockedBy?: string[];
    stopConditionCodes?: string[];
  },
): BoundedOperationRunnerPhase {
  return {
    phase: phaseName,
    status,
    commandCandidate: commands[0]?.commandCandidate ?? null,
    commandCandidates: commands.map((command) => command.commandCandidate),
    summary: input.summary ?? {},
    expectedSideEffects: input.expectedSideEffects ?? [],
    expectedNonEffects: input.expectedNonEffects ?? noWriteNonEffects(),
    sideEffects: [],
    blockedBy: input.blockedBy ?? [],
    stopConditionCodes: input.stopConditionCodes ?? [],
    writePhase: input.writePhase,
  };
}

export function buildBoundedOperationRunnerPlan(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationRunnerOptions,
): BoundedOperationRunnerReport {
  const computedSinceMinutes = computeSinceMinutes(options);
  const cleanupWindow = resolveCleanupWindow(input.queueState);
  const cleanupSinceMinutes = options.cleanupSinceMinutes
    ?? (cleanupWindow.source === "rolling_168h_backlog"
      ? Math.max(1, Math.ceil(cleanupWindow.queue.sinceHours * 60))
      : computedSinceMinutes);
  const commandOptions = {
    ...options,
    cleanupSinceMinutes,
  };
  const maxIterations = computeMaxIterations(options);
  const checkpointState = readCheckpointSafeCursorSummary(options.checkpointFile ?? null);
  const stop = buildStopBlockers(input, options, checkpointState);
  const blocked = stop.blockedBy.length > 0;
  const plannedStatus: BoundedOperationRunnerPhaseStatus = blocked ? "blocked" : "planned";

  const detectCommand = buildDetectCommand(options);
  const metricCommands = buildMetricCycleCommands(commandOptions);
  const enrichCommands = buildEnrichCycleCommands(commandOptions);
  const longitudinalMetricCommands = buildLongitudinalMetricCycleCommands(commandOptions);
  const reportCommands = [
    buildReviewQueueCommand(options),
    buildReviewQueueCommand(options, 168),
    buildGrowthReportCommand(options),
    buildBoundedReadinessCommand(),
    buildBoundedPlannerCommand(commandOptions),
  ];
  const notificationCommands = buildNotificationPlanCommands();

  const phases: BoundedOperationRunnerPhase[] = [
    phase("preflight", blocked ? "blocked" : "ok", [], {
      writePhase: false,
      summary: {
        schedulerUnlocked: false,
        systemdUnlocked: false,
        alwaysOnAutoSendUnlocked: false,
        checkpointFile: options.checkpointFile ?? null,
        checkpointExists: checkpointState.exists,
        checkpointValid: checkpointState.valid,
        checkpointOutsideRepo:
          options.checkpointFile === undefined
            ? null
            : !isPathInside(options.checkpointFile, options.repoRoot),
        smokeUsed: false,
        detectHorizonHours: options.hours,
        cleanupHorizonHours: cleanupSinceMinutes / 60,
        cleanupSinceMinutes,
        cleanupWindowSource: cleanupWindow.source,
      },
      blockedBy: stop.blockedBy,
      stopConditionCodes: stop.stopConditionCodes,
    }),
    phase("detect_write", plannedStatus, [detectCommand], {
      writePhase: true,
      expectedSideEffects: [
        "external GeckoTerminal fetch on --execute",
        "production DB Token create/reuse on --execute",
        "checkpoint file write on --execute",
      ],
      expectedNonEffects: [
        "Metric write 0",
        "Notification create/update 0",
        "HolderSnapshot write 0",
        "Telegram send 0",
        "scheduler/systemd 0",
        "rawJson full dump 0",
        "offensive raw text dump 0",
      ],
      blockedBy: stop.blockedBy,
      stopConditionCodes: stop.stopConditionCodes,
    }),
    phase("metric_pending_snapshot", options.postRunMetricCycles === 0 && !blocked ? "skipped" : plannedStatus, metricCommands, {
      writePhase: true,
      summary: {
        cyclesPlanned: options.postRunMetricCycles,
        cyclesExecuted: 0,
        cleanupSinceMinutes,
        stoppedReason: options.postRunMetricCycles === 0 ? "cycles_zero" : null,
        cycleCommandCandidates: metricCommands.map((command) => command.commandCandidate),
      },
      expectedSideEffects: [
        "external GeckoTerminal fetch on --execute",
        `production DB Metric write max ${options.metricLimit * options.postRunMetricCycles} on --execute`,
      ],
      expectedNonEffects: [
        "Token write 0",
        "Notification create/update 0",
        "HolderSnapshot write 0",
        "Telegram send 0",
        "scheduler/systemd 0",
        "rawJson full dump 0",
        "offensive raw text dump 0",
      ],
      blockedBy: stop.blockedBy,
      stopConditionCodes: stop.stopConditionCodes,
    }),
    phase("enrich_rescore", options.postRunEnrichCycles === 0 && !blocked ? "skipped" : plannedStatus, enrichCommands, {
      writePhase: true,
      summary: {
        cyclesPlanned: options.postRunEnrichCycles,
        cyclesExecuted: 0,
        cleanupSinceMinutes,
        stoppedReason: options.postRunEnrichCycles === 0 ? "cycles_zero" : null,
        cycleCommandCandidates: enrichCommands.map((command) => command.commandCandidate),
      },
      expectedSideEffects: [
        "external GeckoTerminal token snapshot fetch on --execute",
        "best-effort Metaplex fetch on --execute",
        `production DB Token update max ${options.enrichLimit * options.postRunEnrichCycles} on --execute`,
      ],
      expectedNonEffects: [
        "Metric write 0",
        "Notification create/update 0 because --notify is omitted",
        "HolderSnapshot write 0",
        "Telegram send 0",
        "scheduler/systemd 0",
        "rawJson full dump 0",
        "offensive raw text dump 0",
      ],
      blockedBy: stop.blockedBy,
      stopConditionCodes: stop.stopConditionCodes,
    }),
    phase(
      "metric_longitudinal_snapshot",
      options.postRunLongitudinalMetricCycles === 0 && !blocked ? "skipped" : plannedStatus,
      longitudinalMetricCommands,
      {
        writePhase: true,
        summary: {
          cyclesPlanned: options.postRunLongitudinalMetricCycles,
          cyclesExecuted: 0,
          cleanupSinceMinutes,
          selector: "onlyMetricOnce",
          minGapMinutes: options.longitudinalMetricMinGapMinutes,
          stoppedReason:
            options.postRunLongitudinalMetricCycles === 0 ? "cycles_zero" : null,
          cycleCommandCandidates: longitudinalMetricCommands.map(
            (command) => command.commandCandidate,
          ),
        },
        expectedSideEffects: [
          "external GeckoTerminal fetch on --execute",
          `production DB longitudinal Metric write max ${options.longitudinalMetricLimit * options.postRunLongitudinalMetricCycles} on --execute`,
        ],
        expectedNonEffects: [
          "Token write 0",
          "Notification create/update 0",
          "HolderSnapshot write 0",
          "Telegram send 0",
          "automatic retry 0",
          "scheduler/systemd 0",
          "rawJson full dump 0",
          "offensive raw text dump 0",
        ],
        blockedBy: stop.blockedBy,
        stopConditionCodes: stop.stopConditionCodes,
      },
    ),
    phase("report_review", plannedStatus, reportCommands, {
      writePhase: false,
      expectedSideEffects: [],
      expectedNonEffects: noWriteNonEffects(),
      blockedBy: stop.blockedBy,
      stopConditionCodes: stop.stopConditionCodes,
    }),
    phase("notification_plan_review", plannedStatus, notificationCommands, {
      writePhase: false,
      expectedSideEffects: [],
      expectedNonEffects: [
        "Telegram send 0",
        "Notification create/update 0",
        "retry execution 0",
        "auto live send execution 0",
        "scheduler/systemd 0",
        "rawJson full dump 0",
        "offensive raw text dump 0",
      ],
      blockedBy: stop.blockedBy,
      stopConditionCodes: stop.stopConditionCodes,
    }),
  ];

  return {
    mode: "bounded_operation_runner",
    status: blocked ? "blocked" : options.executeRequested ? "planned" : "planned",
    readOnly: !options.executeRequested,
    dryRun: !options.executeRequested,
    executeRequested: options.executeRequested,
    hours: options.hours,
    pumpOnly: options.pumpOnly,
    computedSinceMinutes,
    detectHorizonHours: options.hours,
    cleanupHorizonHours: cleanupSinceMinutes / 60,
    cleanupSinceMinutes,
    cleanupWindowSource: cleanupWindow.source,
    maxIterations,
    intervalSeconds: options.intervalSeconds,
    detectLimitPerCycle: 1,
    metricLimit: options.metricLimit,
    longitudinalMetricLimit: options.longitudinalMetricLimit,
    enrichLimit: options.enrichLimit,
    longitudinalMetricMinGapMinutes: options.longitudinalMetricMinGapMinutes,
    postRunBufferMinutes: options.postRunBufferMinutes,
    interItemDelayMs: options.interItemDelayMs,
    estimatedMinimumDurationMs: computeEstimatedMinimumDurationMs(options),
    nextCommand: buildNextExecutionCommand(options),
    checkpointFile: options.checkpointFile ?? null,
    checkpointBeforeExists: checkpointState.exists,
    checkpointBeforeValid: checkpointState.valid,
    checkpointBeforeSafeCursorSummary: checkpointState.summary,
    checkpointExists: checkpointState.exists,
    checkpointValid: checkpointState.valid,
    checkpointSafeCursorSummary: checkpointState.summary,
    startedAt: null,
    finishedAt: null,
    interruptedAt: null,
    activePhase: null,
    activeCycleIndex: null,
    activeCycleTotal: null,
    partialPhase: null,
    dbState: input.dbState,
    finalDbState: input.dbState,
    queueState: input.queueState,
    notificationState: input.notificationState,
    finalNotificationState: input.notificationState,
    operationReadiness: {
      schedulerUnlocked: false,
      systemdUnlocked: false,
      alwaysOnAutoSendUnlocked: false,
      telegramLiveSendUnlocked: false,
      retryExecutionUnlocked: false,
    },
    phases,
    finalQueueState: input.queueState,
    postRunMetricCycles: options.postRunMetricCycles,
    postRunLongitudinalMetricCycles: options.postRunLongitudinalMetricCycles,
    postRunEnrichCycles: options.postRunEnrichCycles,
    metricCyclesExecuted: 0,
    longitudinalMetricCyclesExecuted: 0,
    enrichCyclesExecuted: 0,
    metricCyclesStoppedReason: options.postRunMetricCycles === 0 ? "cycles_zero" : null,
    longitudinalMetricCyclesStoppedReason:
      options.postRunLongitudinalMetricCycles === 0 ? "cycles_zero" : null,
    enrichCyclesStoppedReason: options.postRunEnrichCycles === 0 ? "cycles_zero" : null,
    blockedBy: stop.blockedBy,
    stopConditionCodes: stop.stopConditionCodes,
    expectedSideEffects: options.executeRequested
      ? [
          "external GeckoTerminal fetch",
          "best-effort Metaplex fetch",
          "production DB Token create/reuse",
          "production DB Metric write",
          "production DB Token update",
          "checkpoint file write",
        ]
      : [],
    expectedNonEffects: options.executeRequested
      ? [
          "Notification create/update 0",
          "HolderSnapshot write 0",
          "Telegram send 0",
          "notification retry execution 0",
          "auto live send execution 0",
          "scheduler/systemd 0",
          "rawJson full dump 0",
          "offensive raw text dump 0",
        ]
      : noWriteNonEffects(),
  };
}

function commandsForPhase(
  phaseName: BoundedOperationRunnerPhaseName,
  options: BoundedOperationRunnerOptions,
): PhaseCommand[] {
  switch (phaseName) {
    case "detect_write":
      return [buildDetectCommand(options)];
    case "metric_pending_snapshot":
      return buildMetricCycleCommands(options);
    case "enrich_rescore":
      return buildEnrichCycleCommands(options);
    case "metric_longitudinal_snapshot":
      return buildLongitudinalMetricCycleCommands(options);
    case "report_review":
      return [
        buildReviewQueueCommand(options),
        buildReviewQueueCommand(options, 168),
        buildGrowthReportCommand(options),
        buildBoundedReadinessCommand(),
        buildBoundedPlannerCommand(options),
      ];
    case "notification_plan_review":
      return buildNotificationPlanCommands();
    case "preflight":
      return [];
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberFromAny(source: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = asNumber(source[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function stringFromAny(source: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = asString(source[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function parseJsonObject(output: string): Record<string, unknown> | null {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return null;
  }

  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function parsedCommandSummary(value: unknown): Record<string, unknown> {
  const record = asRecord(value) ?? {};
  const summary = asRecord(record.summary) ?? record;
  const commandResults = Array.isArray(record.commandResults) ? record.commandResults : [];
  const parsedSummary = commandResults
    .map((item) => asRecord(item))
    .map((item) => asRecord(item?.parsedSummary))
    .find((item): item is Record<string, unknown> => item !== null);
  return parsedSummary ?? summary;
}

function extractProgressSummaryFields(value: unknown): Record<string, unknown> {
  const source = parsedCommandSummary(value);
  const fields: Record<string, unknown> = {};

  const numericAliases: Record<string, string[]> = {
    cycleCount: ["cycleCount"],
    completedIterations: ["completedIterations"],
    failedCount: ["failedCount"],
    rateLimitRetryCount: ["rateLimitRetryCount"],
    importedCount: ["importedCount"],
    existingCount: ["existingCount"],
    acceptedCount: ["acceptedCount"],
    rejectedCount: ["rejectedCount"],
    selected: ["selected", "selectedCount"],
    ok: ["ok", "okCount"],
    written: ["written", "writtenCount"],
    enriched: ["enriched", "enrichWritten", "enrichWriteCount"],
    rescored: ["rescored", "rescoreWritten", "rescoreWriteCount"],
    skipped: ["skipped", "skippedCount"],
    error: ["error", "errorCount"],
    providerErrorCount: ["providerErrorCount"],
    itemErrorCount: ["itemErrorCount"],
    firstErrorTokenId: ["firstErrorTokenId"],
    firstHttpStatus: ["firstHttpStatus"],
    contextWritten: ["contextWritten", "contextWriteCount"],
    tokenWriteCount: ["tokenWriteCount"],
    tokenUpdateCount: ["tokenUpdateCount"],
    notificationWriteCount: ["notificationWriteCount", "notificationCreateCount"],
    holderSnapshotWriteCount: ["holderSnapshotWriteCount"],
    metaplexAttempted: ["metaplexAttempted", "metaplexAttemptedCount"],
    metaplexAvailable: ["metaplexAvailable", "metaplexAvailableCount"],
    notifyWouldSend: ["notifyWouldSend", "notifyWouldSendCount"],
    notifySent: ["notifySent", "notifySentCount"],
    interItemDelayMs: ["interItemDelayMs"],
    interItemDelayCount: ["interItemDelayCount"],
    skippedAfterRateLimit: ["skippedAfterRateLimit"],
    rateLimitedCount: ["rateLimitedCount"],
    cyclesPlanned: ["cyclesPlanned"],
    cyclesExecuted: ["cyclesExecuted"],
  };

  for (const [field, keys] of Object.entries(numericAliases)) {
    const numericValue = numberFromAny(source, keys);
    if (numericValue !== undefined) {
      fields[field] = numericValue;
    }
  }

  for (const key of [
    "dryRun",
    "writeEnabled",
    "checkpointEnabled",
    "providerErrorPresent",
    "http429Present",
    "rateLimited",
    "abortedDueToRateLimit",
  ]) {
    const booleanValue = asBoolean(source[key]);
    if (booleanValue !== undefined) {
      fields[key] = booleanValue;
    }
  }

  const stoppedReason = stringFromAny(source, ["stoppedReason"]);
  if (stoppedReason !== undefined) {
    fields.stoppedReason = stoppedReason;
  }
  const firstErrorCategory = stringFromAny(source, ["firstErrorCategory"]);
  if (firstErrorCategory !== undefined) {
    fields.firstErrorCategory = firstErrorCategory;
  }
  const firstErrorClass = stringFromAny(source, ["firstErrorClass"]);
  if (firstErrorClass !== undefined) {
    fields.firstErrorClass = firstErrorClass;
  }

  return fields;
}

function extractCycleSummaryFields(value: unknown): Record<string, unknown> {
  const source = parsedCommandSummary(value);
  const fields: Record<string, unknown> = {};

  const numericAliases: Record<string, string[]> = {
    selected: ["selected", "selectedCount"],
    ok: ["ok", "okCount"],
    written: ["written", "writtenCount"],
    enriched: ["enriched", "enrichWritten", "enrichWriteCount"],
    rescored: ["rescored", "rescoreWritten", "rescoreWriteCount"],
    skipped: ["skipped", "skippedCount"],
    error: ["error", "errorCount"],
    providerErrorCount: ["providerErrorCount"],
    itemErrorCount: ["itemErrorCount"],
    firstErrorTokenId: ["firstErrorTokenId"],
    firstHttpStatus: ["firstHttpStatus"],
    contextWritten: ["contextWritten", "contextWriteCount"],
    tokenWriteCount: ["tokenWriteCount"],
    tokenUpdateCount: ["tokenUpdateCount"],
    notificationWriteCount: ["notificationWriteCount", "notificationCreateCount"],
    holderSnapshotWriteCount: ["holderSnapshotWriteCount"],
    metaplexAttempted: ["metaplexAttempted", "metaplexAttemptedCount"],
    metaplexAvailable: ["metaplexAvailable", "metaplexAvailableCount"],
    notifyWouldSend: ["notifyWouldSend", "notifyWouldSendCount"],
    notifySent: ["notifySent", "notifySentCount"],
    interItemDelayMs: ["interItemDelayMs"],
    interItemDelayCount: ["interItemDelayCount"],
    skippedAfterRateLimit: ["skippedAfterRateLimit"],
    rateLimitedCount: ["rateLimitedCount"],
  };

  for (const [field, keys] of Object.entries(numericAliases)) {
    const numericValue = numberFromAny(source, keys);
    if (numericValue !== undefined) {
      fields[field] = numericValue;
    }
  }

  for (const key of [
    "providerErrorPresent",
    "http429Present",
    "rateLimited",
    "abortedDueToRateLimit",
  ]) {
    const booleanValue = asBoolean(source[key]);
    if (booleanValue !== undefined) {
      fields[key] = booleanValue;
    }
  }

  const firstErrorCategory = stringFromAny(source, ["firstErrorCategory"]);
  if (firstErrorCategory !== undefined) {
    fields.firstErrorCategory = firstErrorCategory;
  }
  const firstErrorClass = stringFromAny(source, ["firstErrorClass"]);
  if (firstErrorClass !== undefined) {
    fields.firstErrorClass = firstErrorClass;
  }

  return fields;
}

function emitProgress(
  logger: BoundedOperationRunnerLogger | undefined,
  event: Omit<BoundedOperationRunnerProgressEvent, "at">,
): void {
  if (logger === undefined) {
    return;
  }

  logger({
    ...event,
    at: new Date().toISOString(),
  });
}

function createInterruptController(): {
  context: BoundedOperationRunnerExecutionContext;
  setActivePhase: (
    phase: BoundedOperationRunnerPhaseName | null,
    cycleIndex?: number | null,
    cycleTotal?: number | null,
  ) => void;
  cleanup: () => void;
  interruptedAt: () => string | null;
} {
  const active: ActivePhaseSnapshot = {
    phase: null,
    cycleIndex: null,
    cycleTotal: null,
  };
  const state: {
    interrupted: boolean;
    signal: BoundedOperationRunnerInterruptSignal | null;
    requestedAt: string | null;
  } = {
    interrupted: false,
    signal: null,
    requestedAt: null,
  };
  const childTerminators = new Set<() => void>();
  const handlers = new Map<BoundedOperationRunnerInterruptSignal, () => void>();

  const requestInterrupt = (signal: BoundedOperationRunnerInterruptSignal): void => {
    if (!state.interrupted) {
      state.interrupted = true;
      state.signal = signal;
      state.requestedAt = new Date().toISOString();
    }

    for (const terminate of childTerminators) {
      try {
        terminate();
      } catch {
        // Best-effort child termination only; final summary remains the source of truth.
      }
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      requestInterrupt(signal);
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  return {
    context: {
      isInterrupted: () => state.interrupted,
      getInterruptSignal: () => state.signal,
      requestInterrupt,
      registerChildTerminator: (terminator) => {
        childTerminators.add(terminator);
        return () => {
          childTerminators.delete(terminator);
        };
      },
      getActivePhase: () => ({ ...active }),
    },
    setActivePhase: (phase, cycleIndex = null, cycleTotal = null) => {
      active.phase = phase;
      active.cycleIndex = cycleIndex ?? null;
      active.cycleTotal = cycleTotal ?? null;
    },
    cleanup: () => {
      for (const [signal, handler] of handlers) {
        process.off(signal, handler);
      }
      childTerminators.clear();
    },
    interruptedAt: () => state.requestedAt,
  };
}

function formatProgressValue(value: unknown): string | null {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    return value.length === 0 ? null : value;
  }

  return null;
}

export function formatBoundedOperationProgressEvent(
  event: BoundedOperationRunnerProgressEvent,
): string {
  const parts = ["[ops:run]", `event=${event.event}`, `status=${event.status}`, `at=${event.at}`];

  if (event.phase !== undefined) {
    parts.push(`phase=${event.phase}`);
  }

  if (event.cycleIndex !== undefined && event.cycleTotal !== undefined) {
    parts.push(`cycle=${event.cycleIndex}/${event.cycleTotal}`);
  }

  if (event.durationMs !== undefined) {
    parts.push(`durationMs=${event.durationMs}`);
  }

  for (const [key, value] of Object.entries(event.summary ?? {})) {
    const formatted = formatProgressValue(value);
    if (formatted !== null) {
      parts.push(`${key}=${formatted}`);
    }
  }

  if (event.blockedBy !== undefined && event.blockedBy.length > 0) {
    parts.push(`blockedBy=${event.blockedBy.join(",")}`);
  }

  if (event.stopConditionCodes !== undefined && event.stopConditionCodes.length > 0) {
    parts.push(`stopConditionCodes=${event.stopConditionCodes.join(",")}`);
  }

  return parts.join(" ");
}

export function createConsoleBoundedOperationProgressLogger(
  stream: Pick<NodeJS.WriteStream, "write"> = process.stderr,
): BoundedOperationRunnerLogger {
  return (event) => {
    stream.write(`${formatBoundedOperationProgressEvent(event)}\n`);
  };
}

function cycleHasProviderError(fields: Record<string, unknown>): boolean {
  return fields.providerErrorPresent === true
    || fields.http429Present === true
    || fields.rateLimited === true
    || fields.abortedDueToRateLimit === true
    || (asNumber(fields.providerErrorCount) ?? 0) > 0;
}

function cycleHasItemError(fields: Record<string, unknown>): boolean {
  const explicitCount = asNumber(fields.itemErrorCount);
  if (explicitCount !== undefined) {
    return explicitCount > 0;
  }

  return (asNumber(fields.error) ?? 0) > 0 && !cycleHasProviderError(fields);
}

function metricCycleHasUnexpectedWrite(fields: Record<string, unknown>): boolean {
  return (asNumber(fields.tokenWriteCount) ?? 0) > 0
    || (asNumber(fields.tokenUpdateCount) ?? 0) > 0
    || (asNumber(fields.enriched) ?? 0) > 0
    || (asNumber(fields.rescored) ?? 0) > 0
    || (asNumber(fields.contextWritten) ?? 0) > 0
    || (asNumber(fields.notificationWriteCount) ?? 0) > 0
    || (asNumber(fields.holderSnapshotWriteCount) ?? 0) > 0
    || (asNumber(fields.notifySent) ?? 0) > 0;
}

function detectFailureCode(summary: Record<string, unknown>): string | null {
  const fields = extractProgressSummaryFields(summary);
  return (asNumber(fields.failedCount) ?? 0) > 0
    ? "detect_cycle_failed"
    : null;
}

function cycleNoWorkReason(
  phaseName: BoundedOperationRunnerPhaseName,
  fields: Record<string, unknown>,
): string | null {
  if (asNumber(fields.selected) === 0) {
    return "selected_zero";
  }

  if (
    (phaseName === "metric_pending_snapshot"
      || phaseName === "metric_longitudinal_snapshot")
    && asNumber(fields.written) === 0
  ) {
    return "written_zero";
  }

  if (
    phaseName === "enrich_rescore"
    && asNumber(fields.enriched) === 0
    && asNumber(fields.rescored) === 0
  ) {
    return "enriched_rescored_zero";
  }

  return null;
}

function mergePhaseSummary(
  existing: Record<string, unknown>,
  updates: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existing,
    ...updates,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeGrowthOutput(output: Record<string, unknown>): Record<string, unknown> | null {
  const summary = asRecord(output.summary);
  const buckets = asRecord(output.buckets);
  if (summary === null) {
    return null;
  }

  return {
    summary: {
      tokenCountEvaluated: asNumber(summary.tokenCountEvaluated) ?? null,
      sourceTokenCount: asNumber(summary.sourceTokenCount) ?? null,
      pumpOnly: asBoolean(summary.pumpOnly) ?? null,
      minMetricCount: asNumber(summary.minMetricCount) ?? null,
      topFdvMultiple: asNumber(summary.topFdvMultiple) ?? null,
      topReserveMultiple: asNumber(summary.topReserveMultiple) ?? null,
      generatedAt: asString(summary.generatedAt) ?? null,
    },
    buckets: {
      fdvMultipleGte1_1: asNumber(buckets?.fdvMultipleGte1_1) ?? null,
      fdvMultipleGte1_25: asNumber(buckets?.fdvMultipleGte1_25) ?? null,
      fdvMultipleGte1_5: asNumber(buckets?.fdvMultipleGte1_5) ?? null,
      fdvMultipleGte2: asNumber(buckets?.fdvMultipleGte2) ?? null,
      fdvMultipleGte3: asNumber(buckets?.fdvMultipleGte3) ?? null,
      fdvMultipleGte5: asNumber(buckets?.fdvMultipleGte5) ?? null,
      fdvMultipleGte10: asNumber(buckets?.fdvMultipleGte10) ?? null,
    },
  };
}

export function sanitizeBoundedOperationCommandOutput(
  label: string,
  output: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (output === null) {
    return null;
  }

  if (label === "metrics_growth_report") {
    return safeGrowthOutput(output);
  }

  if (label === "bounded_next_step_planner") {
    return {
      nextRecommendedStep: asString(output.nextRecommendedStep) ?? null,
      blockedBy: stringArray(output.blockedBy),
      stopConditionCodes: stringArray(output.stopConditionCodes),
    };
  }

  if (label === "bounded_watch_readiness") {
    return {
      status: asString(output.status) ?? null,
      nextRecommendedSlice: asString(output.nextRecommendedSlice) ?? null,
    };
  }

  if (label.startsWith("notification_auto_send_plan")) {
    return {
      autoSendEnabled: asBoolean(output.autoSendEnabled) ?? null,
      candidateCount: asNumber(output.candidateCount) ?? null,
      allowedCandidateCount: asNumber(output.allowedCandidateCount) ?? null,
      wouldSend: asBoolean(output.wouldSend) ?? null,
      wouldUpdateNotification: asBoolean(output.wouldUpdateNotification) ?? null,
      stopConditionCodes: stringArray(output.stopConditionCodes),
    };
  }

  if (label === "notification_retry_plan") {
    return {
      status: asString(output.status) ?? null,
      candidateCount: asNumber(output.candidateCount) ?? null,
      selectedCount: asNumber(output.selectedCount) ?? null,
      willExecute: asBoolean(output.willExecute) ?? null,
      stopConditionCodes: stringArray(output.stopConditionCodes),
    };
  }

  return null;
}

export async function defaultPhaseExecutor(
  _phase: BoundedOperationRunnerPhase,
  commands: PhaseCommand[],
  context?: BoundedOperationRunnerExecutionContext,
): Promise<PhaseExecutionResult> {
  const commandResults: Record<string, unknown>[] = [];

  for (const command of commands) {
    if (context?.isInterrupted() === true) {
      return {
        ok: false,
        interrupted: true,
        summary: {
          commandResults,
        },
        blockedBy: [MANUAL_INTERRUPT_CODE],
        stopConditionCodes: [MANUAL_INTERRUPT_CODE],
      };
    }

    const result = await new Promise<{
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const child = spawn(command.file, command.args, {
        env: {
          ...process.env,
          ...command.env,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const unregisterChildTerminator = context?.registerChildTerminator(() => {
        if (!child.killed) {
          child.kill("SIGTERM");
        }
      });
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("close", (exitCode, signal) => {
        unregisterChildTerminator?.();
        resolve({
          exitCode,
          signal,
          stdout,
          stderr,
        });
      });
      child.on("error", (error) => {
        unregisterChildTerminator?.();
        resolve({
          exitCode: 1,
          signal: null,
          stdout,
          stderr: String(error),
        });
      });
    });

    const parsedOutput = parseJsonObject(result.stdout);
    const parsedSummary = extractProgressSummaryFields(parsedOutput);
    const safeOutput = sanitizeBoundedOperationCommandOutput(command.label, parsedOutput);
    if (context?.isInterrupted() === true) {
      commandResults.push({
        label: command.label,
        exitCode: result.exitCode,
        signal: result.signal,
        interrupted: true,
        parsedSummary,
        ...(safeOutput === null ? {} : { safeOutput }),
      });
      return {
        ok: false,
        interrupted: true,
        summary: {
          commandResults,
        },
        blockedBy: [MANUAL_INTERRUPT_CODE],
        stopConditionCodes: [MANUAL_INTERRUPT_CODE],
      };
    }

    commandResults.push({
      label: command.label,
      exitCode: result.exitCode,
      stdoutParsed: parsedOutput !== null,
      stderrPresent: result.stderr.trim().length > 0,
      parsedSummary,
      ...(safeOutput === null ? {} : { safeOutput }),
    });

    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: {
          commandResults,
        },
        stopConditionCodes: [`${command.label}_failed`],
      };
    }
  }

  return {
    ok: true,
    summary: {
      commandResults,
    },
  };
}

function skipLaterPhases(
  report: BoundedOperationRunnerReport,
  phaseItem: BoundedOperationRunnerPhase,
  reason: string,
  stopConditionCode = "prior_phase_failed",
): void {
  for (const laterPhase of report.phases.slice(report.phases.indexOf(phaseItem) + 1)) {
    laterPhase.status = "skipped";
    laterPhase.blockedBy = [reason];
    laterPhase.stopConditionCodes = [stopConditionCode];
  }
}

function markReportInterrupted(
  report: BoundedOperationRunnerReport,
  context: BoundedOperationRunnerExecutionContext,
  phaseItem: BoundedOperationRunnerPhase,
  summary: Record<string, unknown>,
): void {
  const activePhase = context.getActivePhase();
  const interruptedAt = new Date().toISOString();
  phaseItem.status = "interrupted";
  phaseItem.summary = mergePhaseSummary(phaseItem.summary, summary);
  phaseItem.blockedBy = [MANUAL_INTERRUPT_CODE];
  phaseItem.stopConditionCodes = [MANUAL_INTERRUPT_CODE];
  report.status = "interrupted";
  report.activePhase = activePhase.phase ?? phaseItem.phase;
  report.activeCycleIndex = activePhase.cycleIndex;
  report.activeCycleTotal = activePhase.cycleTotal;
  report.partialPhase = phaseItem.phase;
  report.interruptedAt = interruptedAt;
  if (!report.blockedBy.includes(MANUAL_INTERRUPT_CODE)) {
    report.blockedBy.push(MANUAL_INTERRUPT_CODE);
  }
  if (!report.stopConditionCodes.includes(MANUAL_INTERRUPT_CODE)) {
    report.stopConditionCodes.push(MANUAL_INTERRUPT_CODE);
  }
}

async function executeCyclePhase(
  report: BoundedOperationRunnerReport,
  phaseItem: BoundedOperationRunnerPhase,
  commands: PhaseCommand[],
  executor: PhaseExecutor,
  context: BoundedOperationRunnerExecutionContext,
  setActivePhase: (
    phase: BoundedOperationRunnerPhaseName | null,
    cycleIndex?: number | null,
    cycleTotal?: number | null,
  ) => void,
  logger?: BoundedOperationRunnerLogger,
): Promise<boolean> {
  const phaseStartedAt = Date.now();
  emitProgress(logger, {
    event: "phase",
    phase: phaseItem.phase,
    status: "started",
    summary: {
      cyclesPlanned: commands.length,
    },
  });

  const cycleSummaries: Record<string, unknown>[] = [];
  let stoppedReason: string | null = null;
  let executedCount = 0;

  for (const [index, command] of commands.entries()) {
    if (context.isInterrupted()) {
      markReportInterrupted(report, context, phaseItem, {
        cyclesPlanned: commands.length,
        cyclesExecuted: executedCount,
        stoppedReason: MANUAL_INTERRUPT_CODE,
        cycleSummaries,
      });
      return false;
    }

    const cycleStartedAt = Date.now();
    setActivePhase(phaseItem.phase, index + 1, commands.length);
    emitProgress(logger, {
      event: "cycle",
      phase: phaseItem.phase,
      status: "started",
      cycleIndex: index + 1,
      cycleTotal: commands.length,
    });

    const result = await executor(phaseItem, [command], context);
    const fields = extractCycleSummaryFields(result.summary ?? {});
    const cycleSummary = {
      cycleIndex: index + 1,
      status: result.interrupted ? "interrupted" : result.ok ? "executed" : "failed",
      ...fields,
      summary: result.summary ?? {},
    };
    cycleSummaries.push(cycleSummary);

    if (result.ok) {
      executedCount += 1;
    }

    emitProgress(logger, {
      event: "cycle",
      phase: phaseItem.phase,
      status: result.interrupted ? "interrupted" : result.ok ? "completed" : "failed",
      durationMs: Date.now() - cycleStartedAt,
      cycleIndex: index + 1,
      cycleTotal: commands.length,
      summary: fields,
      blockedBy: result.blockedBy ?? [],
      stopConditionCodes: result.stopConditionCodes ?? [],
    });

    if (result.interrupted || context.isInterrupted()) {
      markReportInterrupted(report, context, phaseItem, {
        cyclesPlanned: commands.length,
        cyclesExecuted: executedCount,
        stoppedReason: MANUAL_INTERRUPT_CODE,
        cycleSummaries,
      });
      if (phaseItem.phase === "metric_pending_snapshot") {
        report.metricCyclesExecuted = executedCount;
        report.metricCyclesStoppedReason = MANUAL_INTERRUPT_CODE;
      } else if (phaseItem.phase === "metric_longitudinal_snapshot") {
        report.longitudinalMetricCyclesExecuted = executedCount;
        report.longitudinalMetricCyclesStoppedReason = MANUAL_INTERRUPT_CODE;
      } else if (phaseItem.phase === "enrich_rescore") {
        report.enrichCyclesExecuted = executedCount;
        report.enrichCyclesStoppedReason = MANUAL_INTERRUPT_CODE;
      }
      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "interrupted",
        durationMs: Date.now() - phaseStartedAt,
        summary: extractProgressSummaryFields(phaseItem.summary),
        blockedBy: phaseItem.blockedBy,
        stopConditionCodes: phaseItem.stopConditionCodes,
      });
      return false;
    }

    if (!result.ok) {
      stoppedReason = `${command.label}_failed`;
      phaseItem.status = "failed";
      phaseItem.summary = mergePhaseSummary(phaseItem.summary, {
        cyclesPlanned: commands.length,
        cyclesExecuted: executedCount,
        stoppedReason,
        cycleSummaries,
      });
      phaseItem.blockedBy = result.blockedBy ?? [];
      phaseItem.stopConditionCodes = result.stopConditionCodes ?? [stoppedReason];
      report.blockedBy.push(`${phaseItem.phase}_failed`);
      report.stopConditionCodes.push(...phaseItem.stopConditionCodes);
      if (phaseItem.phase === "metric_pending_snapshot") {
        report.metricCyclesExecuted = executedCount;
        report.metricCyclesStoppedReason = stoppedReason;
      } else if (phaseItem.phase === "metric_longitudinal_snapshot") {
        report.longitudinalMetricCyclesExecuted = executedCount;
        report.longitudinalMetricCyclesStoppedReason = stoppedReason;
      } else if (phaseItem.phase === "enrich_rescore") {
        report.enrichCyclesExecuted = executedCount;
        report.enrichCyclesStoppedReason = stoppedReason;
      }
      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "failed",
        durationMs: Date.now() - phaseStartedAt,
        summary: extractProgressSummaryFields(phaseItem.summary),
        blockedBy: phaseItem.blockedBy,
        stopConditionCodes: phaseItem.stopConditionCodes,
      });
      return false;
    }

    if (cycleHasProviderError(fields)) {
      stoppedReason = "provider_or_rate_limit_error";
      phaseItem.status = "failed";
      phaseItem.summary = mergePhaseSummary(phaseItem.summary, {
        cyclesPlanned: commands.length,
        cyclesExecuted: executedCount,
        stoppedReason,
        cycleSummaries,
      });
      phaseItem.stopConditionCodes = [stoppedReason];
      report.blockedBy.push(`${phaseItem.phase}_failed`);
      report.stopConditionCodes.push(stoppedReason);
      if (phaseItem.phase === "metric_pending_snapshot") {
        report.metricCyclesExecuted = executedCount;
        report.metricCyclesStoppedReason = stoppedReason;
      } else if (phaseItem.phase === "metric_longitudinal_snapshot") {
        report.longitudinalMetricCyclesExecuted = executedCount;
        report.longitudinalMetricCyclesStoppedReason = stoppedReason;
      } else if (phaseItem.phase === "enrich_rescore") {
        report.enrichCyclesExecuted = executedCount;
        report.enrichCyclesStoppedReason = stoppedReason;
      }
      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "failed",
        durationMs: Date.now() - phaseStartedAt,
        summary: extractProgressSummaryFields(phaseItem.summary),
        blockedBy: phaseItem.blockedBy,
        stopConditionCodes: phaseItem.stopConditionCodes,
      });
      return false;
    }

    if (
      (phaseItem.phase === "metric_pending_snapshot"
        || phaseItem.phase === "metric_longitudinal_snapshot")
      && cycleHasItemError(fields)
      && !metricCycleHasUnexpectedWrite(fields)
    ) {
      stoppedReason = "metric_item_error_no_automatic_retry";
      phaseItem.status = "failed";
      phaseItem.summary = mergePhaseSummary(phaseItem.summary, {
        cyclesPlanned: commands.length,
        cyclesExecuted: executedCount,
        stoppedReason,
        cycleSummaries,
      });
      phaseItem.stopConditionCodes = [stoppedReason];
      report.blockedBy.push(`${phaseItem.phase}_failed`);
      report.stopConditionCodes.push(stoppedReason);
      if (phaseItem.phase === "metric_pending_snapshot") {
        report.metricCyclesExecuted = executedCount;
        report.metricCyclesStoppedReason = stoppedReason;
      } else {
        report.longitudinalMetricCyclesExecuted = executedCount;
        report.longitudinalMetricCyclesStoppedReason = stoppedReason;
      }
      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "failed",
        durationMs: Date.now() - phaseStartedAt,
        summary: extractProgressSummaryFields(phaseItem.summary),
        blockedBy: phaseItem.blockedBy,
        stopConditionCodes: phaseItem.stopConditionCodes,
      });
      return false;
    }

    if (phaseItem.phase === "enrich_rescore" && cycleHasItemError(fields)) {
      stoppedReason = "item_error_no_automatic_retry";
      report.partialPhase = phaseItem.phase;
      break;
    }

    if (
      (phaseItem.phase === "metric_pending_snapshot"
        || phaseItem.phase === "metric_longitudinal_snapshot")
      && metricCycleHasUnexpectedWrite(fields)
    ) {
      stoppedReason = "unexpected_metric_phase_side_effect";
      phaseItem.status = "failed";
      phaseItem.summary = mergePhaseSummary(phaseItem.summary, {
        cyclesPlanned: commands.length,
        cyclesExecuted: executedCount,
        stoppedReason,
        cycleSummaries,
      });
      phaseItem.stopConditionCodes = [stoppedReason];
      report.blockedBy.push(`${phaseItem.phase}_failed`);
      report.stopConditionCodes.push(stoppedReason);
      if (phaseItem.phase === "metric_pending_snapshot") {
        report.metricCyclesExecuted = executedCount;
        report.metricCyclesStoppedReason = stoppedReason;
      } else {
        report.longitudinalMetricCyclesExecuted = executedCount;
        report.longitudinalMetricCyclesStoppedReason = stoppedReason;
      }
      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "failed",
        durationMs: Date.now() - phaseStartedAt,
        summary: extractProgressSummaryFields(phaseItem.summary),
        blockedBy: phaseItem.blockedBy,
        stopConditionCodes: phaseItem.stopConditionCodes,
      });
      return false;
    }

    const noWorkReason = cycleNoWorkReason(phaseItem.phase, fields);
    if (noWorkReason !== null) {
      stoppedReason = noWorkReason;
      break;
    }
  }

  setActivePhase(null);
  phaseItem.status = "executed";
  phaseItem.summary = mergePhaseSummary(phaseItem.summary, {
    cyclesPlanned: commands.length,
    cyclesExecuted: executedCount,
    stoppedReason,
    cycleSummaries,
  });

  if (phaseItem.phase === "metric_pending_snapshot") {
    report.metricCyclesExecuted = executedCount;
    report.metricCyclesStoppedReason = stoppedReason;
  } else if (phaseItem.phase === "metric_longitudinal_snapshot") {
    report.longitudinalMetricCyclesExecuted = executedCount;
    report.longitudinalMetricCyclesStoppedReason = stoppedReason;
  } else if (phaseItem.phase === "enrich_rescore") {
    report.enrichCyclesExecuted = executedCount;
    report.enrichCyclesStoppedReason = stoppedReason;
  }

  emitProgress(logger, {
    event: "phase",
    phase: phaseItem.phase,
    status: stoppedReason === "item_error_no_automatic_retry" ? "partial" : "completed",
    durationMs: Date.now() - phaseStartedAt,
    summary: extractProgressSummaryFields(phaseItem.summary),
  });

  return true;
}

function sumCycleField(
  phaseItem: BoundedOperationRunnerPhase | undefined,
  key: string,
): number | null {
  const cycleSummaries = Array.isArray(phaseItem?.summary.cycleSummaries)
    ? phaseItem.summary.cycleSummaries
    : [];
  let total = 0;
  let found = false;

  for (const cycleSummary of cycleSummaries) {
    const record = asRecord(cycleSummary);
    const value = asNumber(record?.[key]);
    if (value !== undefined) {
      total += value;
      found = true;
    }
  }

  return found ? total : null;
}

function firstCycleStringField(
  phaseItem: BoundedOperationRunnerPhase | undefined,
  key: string,
): string | null {
  const cycleSummaries = Array.isArray(phaseItem?.summary.cycleSummaries)
    ? phaseItem.summary.cycleSummaries
    : [];

  for (const cycleSummary of cycleSummaries) {
    const record = asRecord(cycleSummary);
    const value = asString(record?.[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return null;
}

function firstCycleNumberField(
  phaseItem: BoundedOperationRunnerPhase | undefined,
  key: string,
): number | null {
  const cycleSummaries = Array.isArray(phaseItem?.summary.cycleSummaries)
    ? phaseItem.summary.cycleSummaries
    : [];

  for (const cycleSummary of cycleSummaries) {
    const record = asRecord(cycleSummary);
    const value = asNumber(record?.[key]);
    if (value !== undefined) {
      return value;
    }
  }

  return null;
}

function commandResultSafeOutput(
  phaseItem: BoundedOperationRunnerPhase | undefined,
  label: string,
): Record<string, unknown> | null {
  const commandResults = Array.isArray(phaseItem?.summary.commandResults)
    ? phaseItem.summary.commandResults
    : [];

  for (const commandResult of commandResults) {
    const record = asRecord(commandResult);
    if (record?.label !== label) {
      continue;
    }

    return asRecord(record.safeOutput);
  }

  return null;
}

function growthSummaryFromReportPhase(
  phaseItem: BoundedOperationRunnerPhase | undefined,
): Record<string, unknown> | null {
  const growthOutput = commandResultSafeOutput(phaseItem, "metrics_growth_report");
  const summary = asRecord(growthOutput?.summary);
  const buckets = asRecord(growthOutput?.buckets);
  if (summary === null) {
    return null;
  }

  return {
    tokenCountEvaluated: asNumber(summary.tokenCountEvaluated) ?? null,
    sourceTokenCount: asNumber(summary.sourceTokenCount) ?? null,
    pumpOnly: asBoolean(summary.pumpOnly) ?? null,
    minMetricCount: asNumber(summary.minMetricCount) ?? null,
    topFdvMultiple: asNumber(summary.topFdvMultiple) ?? null,
    topReserveMultiple: asNumber(summary.topReserveMultiple) ?? null,
    fdvMultipleGte2Count: asNumber(buckets?.fdvMultipleGte2) ?? null,
    fdvMultipleGte3Count: asNumber(buckets?.fdvMultipleGte3) ?? null,
    generatedAt: asString(summary.generatedAt) ?? null,
  };
}

function nextStepFromReportPhase(
  phaseItem: BoundedOperationRunnerPhase | undefined,
): string | null {
  const plannerOutput = commandResultSafeOutput(
    phaseItem,
    "bounded_next_step_planner",
  );
  return asString(plannerOutput?.nextRecommendedStep) ?? null;
}

function coreDbCounts(state: DbState): CoreDbCounts {
  return {
    tokenCount: state.tokenCount,
    metricCount: state.metricCount,
    notificationCount: state.notificationCount,
    holderSnapshotCount: state.holderSnapshotCount,
  };
}

function coreDbDeltas(before: CoreDbCounts, after: CoreDbCounts): CoreDbDeltas {
  return {
    token: after.tokenCount - before.tokenCount,
    metric: after.metricCount - before.metricCount,
    notification: after.notificationCount - before.notificationCount,
    holderSnapshot: after.holderSnapshotCount - before.holderSnapshotCount,
  };
}

function readPhaseDeltas(
  phaseItem: BoundedOperationRunnerPhase | undefined,
): CoreDbDeltas | null {
  const deltas = asRecord(phaseItem?.summary.dbDeltas);
  if (deltas === null) {
    return null;
  }

  const token = asNumber(deltas.token);
  const metric = asNumber(deltas.metric);
  const notification = asNumber(deltas.notification);
  const holderSnapshot = asNumber(deltas.holderSnapshot);
  if (
    token === undefined
    || metric === undefined
    || notification === undefined
    || holderSnapshot === undefined
  ) {
    return null;
  }

  return { token, metric, notification, holderSnapshot };
}

function unexpectedPhaseDbDeltaCode(
  phaseItem: BoundedOperationRunnerPhase,
  deltas: CoreDbDeltas,
  options: BoundedOperationRunnerOptions,
): string | null {
  const phaseName = phaseItem.phase;
  const noOtherWrites =
    deltas.notification === 0
    && deltas.holderSnapshot === 0;

  switch (phaseName) {
    case "detect_write": {
      const importedCount = asNumber(
        extractProgressSummaryFields(phaseItem.summary).importedCount,
      );
      return deltas.token >= 0
        && deltas.token <= computeMaxIterations(options)
        && (importedCount === undefined || deltas.token === importedCount)
        && deltas.metric === 0
        && noOtherWrites
        ? null
        : "unexpected_detect_write_db_delta";
    }
    case "metric_pending_snapshot": {
      const writtenCount = sumCycleField(phaseItem, "written");
      return deltas.token === 0
        && deltas.metric >= 0
        && deltas.metric <= options.metricLimit * options.postRunMetricCycles
        && (writtenCount === null || deltas.metric === writtenCount)
        && noOtherWrites
        ? null
        : "unexpected_metric_pending_snapshot_db_delta";
    }
    case "metric_longitudinal_snapshot": {
      const writtenCount = sumCycleField(phaseItem, "written");
      return deltas.token === 0
        && deltas.metric >= 0
        && deltas.metric
          <= options.longitudinalMetricLimit * options.postRunLongitudinalMetricCycles
        && (writtenCount === null || deltas.metric === writtenCount)
        && noOtherWrites
        ? null
        : "unexpected_metric_longitudinal_snapshot_db_delta";
    }
    case "enrich_rescore":
    case "report_review":
    case "notification_plan_review":
      return deltas.token === 0
        && deltas.metric === 0
        && noOtherWrites
        ? null
        : `unexpected_${phaseName}_db_delta`;
    case "preflight":
      return null;
  }
}

async function capturePhaseState(
  report: BoundedOperationRunnerReport,
  phaseItem: BoundedOperationRunnerPhase,
  options: BoundedOperationRunnerOptions,
  readCurrentInput: (() => Promise<BoundedOperationPlannerInput>) | undefined,
  validateSideEffects: boolean,
): Promise<boolean> {
  if (readCurrentInput === undefined) {
    return true;
  }

  const before = coreDbCounts(report.finalDbState);
  let currentInput: BoundedOperationPlannerInput;
  try {
    currentInput = await readCurrentInput();
  } catch {
    const stopCode = `${phaseItem.phase}_state_read_failed`;
    phaseItem.status = "failed";
    phaseItem.stopConditionCodes = [stopCode];
    report.blockedBy.push(`${phaseItem.phase}_failed`);
    report.stopConditionCodes.push(stopCode);
    return false;
  }

  const after = coreDbCounts(currentInput.dbState);
  const deltas = coreDbDeltas(before, after);
  phaseItem.summary = mergePhaseSummary(phaseItem.summary, {
    dbCountsBefore: before,
    dbCountsAfter: after,
    dbDeltas: deltas,
  });
  phaseItem.sideEffects = Object.entries(deltas)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => `${key} delta ${value}`);
  report.finalDbState = currentInput.dbState;
  report.finalQueueState = currentInput.queueState;
  report.finalNotificationState = currentInput.notificationState;

  if (!validateSideEffects) {
    return true;
  }

  const stopCode = unexpectedPhaseDbDeltaCode(phaseItem, deltas, options);
  if (stopCode === null) {
    return true;
  }

  phaseItem.status = "failed";
  phaseItem.stopConditionCodes = [stopCode];
  report.blockedBy.push(`${phaseItem.phase}_failed`);
  report.stopConditionCodes.push(stopCode);
  return false;
}

function buildOperatorSummary(
  report: BoundedOperationRunnerReport,
  progressSummary: BoundedOperationRunnerProgressSummary,
): BoundedOperatorCycleSummary {
  const detectPhase = report.phases.find((phaseItem) => phaseItem.phase === "detect_write");
  const metricPhase = report.phases.find((phaseItem) => phaseItem.phase === "metric_pending_snapshot");
  const enrichPhase = report.phases.find((phaseItem) => phaseItem.phase === "enrich_rescore");
  const longitudinalMetricPhase = report.phases.find(
    (phaseItem) => phaseItem.phase === "metric_longitudinal_snapshot",
  );
  const reportPhase = report.phases.find((phaseItem) => phaseItem.phase === "report_review");
  const detectSummary = extractProgressSummaryFields(detectPhase?.summary);
  const detectProviderErrors =
    asNumber(detectSummary.providerErrorCount)
    ?? asNumber(detectSummary.failedCount)
    ?? 0;
  const metricProviderErrors = sumCycleField(metricPhase, "providerErrorCount") ?? 0;
  const longitudinalMetricProviderErrors =
    sumCycleField(longitudinalMetricPhase, "providerErrorCount") ?? 0;
  const enrichProviderErrors = sumCycleField(enrichPhase, "providerErrorCount") ?? 0;
  const metricRateLimitCount = sumCycleField(metricPhase, "rateLimitedCount") ?? 0;
  const longitudinalMetricRateLimitCount =
    sumCycleField(longitudinalMetricPhase, "rateLimitedCount") ?? 0;
  const metricItemErrors =
    sumCycleField(metricPhase, "itemErrorCount")
    ?? Math.max(0, (sumCycleField(metricPhase, "error") ?? 0) - metricProviderErrors);
  const longitudinalMetricItemErrors =
    sumCycleField(longitudinalMetricPhase, "itemErrorCount")
    ?? Math.max(
      0,
      (sumCycleField(longitudinalMetricPhase, "error") ?? 0)
      - longitudinalMetricProviderErrors,
    );
  const enrichItemErrors =
    sumCycleField(enrichPhase, "itemErrorCount")
    ?? Math.max(0, (sumCycleField(enrichPhase, "error") ?? 0) - enrichProviderErrors);
  const enrichRateLimitCount = sumCycleField(enrichPhase, "rateLimitedCount") ?? 0;
  const firstErrorCategory =
    (detectProviderErrors > 0 ? "detect_cycle_failed" : null)
    ?? firstCycleStringField(metricPhase, "firstErrorCategory")
    ?? (metricRateLimitCount > 0 ? "http_429" : null)
    ?? (metricProviderErrors > 0 ? "provider_error" : null)
    ?? (metricItemErrors > 0 ? "item_error" : null)
    ?? firstCycleStringField(enrichPhase, "firstErrorCategory")
    ?? (enrichRateLimitCount > 0 ? "http_429" : null)
    ?? (enrichProviderErrors > 0 ? "provider_error" : null)
    ?? (enrichItemErrors > 0 ? "item_error" : null)
    ?? firstCycleStringField(longitudinalMetricPhase, "firstErrorCategory")
    ?? (longitudinalMetricRateLimitCount > 0 ? "http_429" : null)
    ?? (longitudinalMetricProviderErrors > 0 ? "provider_error" : null)
    ?? (longitudinalMetricItemErrors > 0 ? "item_error" : null);
  const firstHttpStatus =
    firstCycleNumberField(metricPhase, "firstHttpStatus")
    ?? (metricRateLimitCount > 0 ? 429 : null)
    ?? firstCycleNumberField(enrichPhase, "firstHttpStatus")
    ?? (enrichRateLimitCount > 0 ? 429 : null)
    ?? firstCycleNumberField(longitudinalMetricPhase, "firstHttpStatus")
    ?? (longitudinalMetricRateLimitCount > 0 ? 429 : null);
  const firstErrorClass =
    firstCycleStringField(metricPhase, "firstErrorClass")
    ?? firstCycleStringField(enrichPhase, "firstErrorClass")
    ?? firstCycleStringField(longitudinalMetricPhase, "firstErrorClass");
  const firstErrorTokenId =
    firstCycleNumberField(metricPhase, "firstErrorTokenId")
    ?? firstCycleNumberField(enrichPhase, "firstErrorTokenId")
    ?? firstCycleNumberField(longitudinalMetricPhase, "firstErrorTokenId");
  const dbCountsBefore = coreDbCounts(report.dbState);
  const dbCountsAfter = coreDbCounts(report.finalDbState);
  const tokenDelta = dbCountsAfter.tokenCount - dbCountsBefore.tokenCount;
  const metricDelta = dbCountsAfter.metricCount - dbCountsBefore.metricCount;
  const notificationDelta = dbCountsAfter.notificationCount - dbCountsBefore.notificationCount;
  const holderSnapshotDelta = dbCountsAfter.holderSnapshotCount - dbCountsBefore.holderSnapshotCount;
  const phaseDeltas = Object.fromEntries(
    report.phases.map((phaseItem) => [phaseItem.phase, readPhaseDeltas(phaseItem)]),
  ) as Record<BoundedOperationRunnerPhaseName, CoreDbDeltas | null>;
  const enrichUpdated = (() => {
    const enriched = sumCycleField(enrichPhase, "enriched");
    const rescored = sumCycleField(enrichPhase, "rescored");
    if (enriched === null && rescored === null) {
      return null;
    }
    return Math.max(enriched ?? 0, rescored ?? 0);
  })();
  const stopReason = report.partialPhase === "enrich_rescore"
    ? report.enrichCyclesStoppedReason
    : report.stopConditionCodes[0]
      ?? report.metricCyclesStoppedReason
      ?? report.enrichCyclesStoppedReason
      ?? report.longitudinalMetricCyclesStoppedReason
      ?? null;

  return {
    overallStatus: progressSummary.overallStatus,
    completedPhases: progressSummary.phasesCompleted,
    skippedPhases: progressSummary.phasesSkipped,
    failedPhases: progressSummary.phasesFailed,
    stopReason,
    partialPhase: report.partialPhase,
    detectHorizonHours: report.detectHorizonHours,
    cleanupHorizonHours: report.cleanupHorizonHours,
    cleanupSinceMinutes: report.cleanupSinceMinutes,
    cleanupWindowSource: report.cleanupWindowSource,
    elapsedMs: progressSummary.elapsedMs,
    checkpointBefore: {
      file: report.checkpointFile,
      exists: report.checkpointBeforeExists,
      valid: report.checkpointBeforeValid,
      safeCursorSummary: report.checkpointBeforeSafeCursorSummary,
    },
    checkpointAfter: {
      file: report.checkpointFile,
      exists: report.checkpointExists,
      valid: report.checkpointValid,
      safeCursorSummary: report.checkpointSafeCursorSummary,
    },
    dbCountsBefore,
    dbCountsAfter,
    deltas: {
      token: tokenDelta,
      metric: metricDelta,
      notification: notificationDelta,
      holderSnapshot: holderSnapshotDelta,
    },
    phaseDeltas,
    detect: {
      selected: asNumber(detectSummary.selected) ?? null,
      imported: asNumber(detectSummary.importedCount) ?? null,
      existing: asNumber(detectSummary.existingCount) ?? null,
      failed: asNumber(detectSummary.failedCount) ?? null,
    },
    metric: {
      selected: sumCycleField(metricPhase, "selected"),
      ok: sumCycleField(metricPhase, "ok"),
      written: sumCycleField(metricPhase, "written"),
      skipped: sumCycleField(metricPhase, "skipped"),
      error: sumCycleField(metricPhase, "error"),
    },
    longitudinalMetric: {
      selected: sumCycleField(longitudinalMetricPhase, "selected"),
      ok: sumCycleField(longitudinalMetricPhase, "ok"),
      written: sumCycleField(longitudinalMetricPhase, "written"),
      skipped: sumCycleField(longitudinalMetricPhase, "skipped"),
      error: sumCycleField(longitudinalMetricPhase, "error"),
    },
    enrich: {
      selected: sumCycleField(enrichPhase, "selected"),
      updated: enrichUpdated,
      skipped: sumCycleField(enrichPhase, "skipped"),
      error: sumCycleField(enrichPhase, "error"),
    },
    providerErrorCountByPhase: {
      preflight: 0,
      detect_write: detectProviderErrors,
      metric_pending_snapshot: metricProviderErrors,
      enrich_rescore: enrichProviderErrors,
      metric_longitudinal_snapshot: longitudinalMetricProviderErrors,
      report_review: 0,
      notification_plan_review: 0,
    },
    itemErrorCountByPhase: {
      preflight: 0,
      detect_write: 0,
      metric_pending_snapshot: metricItemErrors,
      enrich_rescore: enrichItemErrors,
      metric_longitudinal_snapshot: longitudinalMetricItemErrors,
      report_review: 0,
      notification_plan_review: 0,
    },
    firstErrorCategory,
    firstHttpStatus,
    firstErrorClass,
    firstErrorTokenId,
    queueAfter: report.finalQueueState,
    growthAfter: growthSummaryFromReportPhase(reportPhase),
    notifyCandidateCount: report.finalQueueState.rolling168h.notifyCandidateCount,
    autoSendAllowedCount: report.finalNotificationState.allowedAutoSendCandidateCount,
    retryCandidateCount: report.finalNotificationState.retryCandidateCount,
    telegramSendCount: 0,
    nextRecommendedStep:
      report.partialPhase === "enrich_rescore"
        ? "review_enrich_item_error_before_next_operator_cycle"
        : report.stopConditionCodes.length === 0
        ? nextStepFromReportPhase(reportPhase)
          ?? "review_final_summary_then_run_next_operator_cycle_or_hold_for_telegram_gate"
        : "review_failure_summary_no_automatic_retry",
    nextCommand: report.nextCommand,
  };
}

function buildProgressSummary(
  report: BoundedOperationRunnerReport,
  startedAt: string,
  finishedAt: string,
  durationMs: number,
): BoundedOperationRunnerProgressSummary {
  const phasesCompleted = report.phases
    .filter((phaseItem) => phaseItem.status === "executed" || phaseItem.status === "ok")
    .map((phaseItem) => phaseItem.phase);
  const phasesFailed = report.phases
    .filter((phaseItem) => phaseItem.status === "failed" || phaseItem.status === "blocked")
    .map((phaseItem) => phaseItem.phase);
  const phasesSkipped = report.phases
    .filter((phaseItem) => phaseItem.status === "skipped")
    .map((phaseItem) => phaseItem.phase);
  const detectPhase = report.phases.find((phaseItem) => phaseItem.phase === "detect_write");
  const metricPhase = report.phases.find((phaseItem) => phaseItem.phase === "metric_pending_snapshot");
  const enrichPhase = report.phases.find((phaseItem) => phaseItem.phase === "enrich_rescore");
  const longitudinalMetricPhase = report.phases.find(
    (phaseItem) => phaseItem.phase === "metric_longitudinal_snapshot",
  );
  const importedCount = asNumber(extractProgressSummaryFields(detectPhase?.summary).importedCount);
  const existingCount = asNumber(extractProgressSummaryFields(detectPhase?.summary).existingCount);
  const totalInitialMetricWrite = sumCycleField(metricPhase, "written");
  const totalLongitudinalMetricWrite = sumCycleField(
    longitudinalMetricPhase,
    "written",
  );
  const totalMetricWrite =
    totalInitialMetricWrite !== null || totalLongitudinalMetricWrite !== null
      ? (totalInitialMetricWrite ?? 0) + (totalLongitudinalMetricWrite ?? 0)
      : null;
  const totalEnriched = sumCycleField(enrichPhase, "enriched");
  const totalRescored = sumCycleField(enrichPhase, "rescored");
  const hasBlockedPhase = report.phases.some((phaseItem) => phaseItem.status === "blocked");
  const hasInterruptedPhase = report.phases.some((phaseItem) => phaseItem.status === "interrupted");
  const overallStatus = hasInterruptedPhase || report.status === "interrupted"
    ? "interrupted"
    : hasBlockedPhase
    ? "blocked"
    : report.blockedBy.length > 0 || report.stopConditionCodes.length > 0 || phasesFailed.length > 0
      ? "failed"
      : report.partialPhase !== null
        ? "partial"
      : report.executeRequested
        ? "completed"
        : "planned";
  const interruptedPhase = report.phases.find((phaseItem) => phaseItem.status === "interrupted");
  const checkpointState = readCheckpointSafeCursorSummary(report.checkpointFile);
  report.checkpointExists = checkpointState.exists;
  report.checkpointValid = checkpointState.valid;
  report.checkpointSafeCursorSummary = checkpointState.summary;

  return {
    overallStatus,
    executeRequested: report.executeRequested,
    readOnly: report.readOnly,
    dryRun: report.dryRun,
    startedAt,
    finishedAt,
    interruptedAt: report.interruptedAt,
    durationMs,
    elapsedMs: durationMs,
    activePhase: report.activePhase,
    activeCycleIndex: report.activeCycleIndex,
    activeCycleTotal: report.activeCycleTotal,
    partialPhase: report.partialPhase ?? interruptedPhase?.phase ?? null,
    phasesCompleted,
    phasesFailed,
    phasesSkipped,
    detectSummary: extractProgressSummaryFields(detectPhase?.summary),
    metricCyclesExecuted: report.metricCyclesExecuted,
    longitudinalMetricCyclesExecuted: report.longitudinalMetricCyclesExecuted,
    enrichCyclesExecuted: report.enrichCyclesExecuted,
    metricCyclesStoppedReason: report.metricCyclesStoppedReason,
    longitudinalMetricCyclesStoppedReason:
      report.longitudinalMetricCyclesStoppedReason,
    enrichCyclesStoppedReason: report.enrichCyclesStoppedReason,
    totalTokenCreateReuse:
      importedCount !== undefined || existingCount !== undefined
        ? (importedCount ?? 0) + (existingCount ?? 0)
        : null,
    totalInitialMetricWrite,
    totalLongitudinalMetricWrite,
    totalMetricWrite,
    totalTokenUpdate:
      totalEnriched !== null || totalRescored !== null
        ? Math.max(totalEnriched ?? 0, totalRescored ?? 0)
        : null,
    notificationCreateUpdateExpected: 0,
    telegramSendExpected: 0,
    checkpointFile: report.checkpointFile,
    checkpointExists: report.checkpointExists,
    checkpointValid: report.checkpointValid,
    checkpointSafeCursorSummary: report.checkpointSafeCursorSummary,
    blockedBy: report.blockedBy,
    stopConditionCodes: report.stopConditionCodes,
  };
}

export async function runBoundedOperationRunner(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationRunnerOptions,
  executor: PhaseExecutor = defaultPhaseExecutor,
  logger?: BoundedOperationRunnerLogger,
  readCurrentInput?: () => Promise<BoundedOperationPlannerInput>,
): Promise<BoundedOperationRunnerReport> {
  const runStartedAt = Date.now();
  const startedAt = new Date(runStartedAt).toISOString();
  const report = buildBoundedOperationRunnerPlan(input, options);
  const commandOptions = {
    ...options,
    cleanupSinceMinutes: report.cleanupSinceMinutes,
  };
  report.startedAt = startedAt;

  if (!options.executeRequested || report.blockedBy.length > 0) {
    const durationMs = Date.now() - runStartedAt;
    const finishedAt = new Date().toISOString();
    report.finishedAt = finishedAt;
    report.progressSummary = buildProgressSummary(report, startedAt, finishedAt, durationMs);
    report.operatorSummary = buildOperatorSummary(report, report.progressSummary);
    report.status = report.progressSummary.overallStatus;
    if (options.executeRequested) {
      emitProgress(logger, {
        event: "final_summary",
        status: report.progressSummary.overallStatus,
        durationMs,
        summary: {
          executeRequested: report.progressSummary.executeRequested,
          readOnly: report.progressSummary.readOnly,
          dryRun: report.progressSummary.dryRun,
          computedSinceMinutes: report.computedSinceMinutes,
          detectHorizonHours: report.detectHorizonHours,
          cleanupHorizonHours: report.cleanupHorizonHours,
          cleanupSinceMinutes: report.cleanupSinceMinutes,
          cleanupWindowSource: report.cleanupWindowSource,
          maxIterations: report.maxIterations,
          postRunMetricCycles: report.postRunMetricCycles,
          postRunLongitudinalMetricCycles: report.postRunLongitudinalMetricCycles,
          postRunEnrichCycles: report.postRunEnrichCycles,
          metricCyclesExecuted: report.progressSummary.metricCyclesExecuted,
          longitudinalMetricCyclesExecuted:
            report.progressSummary.longitudinalMetricCyclesExecuted,
          enrichCyclesExecuted: report.progressSummary.enrichCyclesExecuted,
          activePhase: report.progressSummary.activePhase ?? "none",
          partialPhase: report.progressSummary.partialPhase ?? "none",
          completedPhases: report.progressSummary.phasesCompleted,
          failedPhases: report.progressSummary.phasesFailed,
          skippedPhases: report.progressSummary.phasesSkipped,
          checkpointFile: report.progressSummary.checkpointFile ?? "none",
          checkpointExists: report.progressSummary.checkpointExists ?? false,
          elapsedMs: report.progressSummary.elapsedMs,
          startedAt: report.progressSummary.startedAt,
          interruptedAt: report.progressSummary.interruptedAt ?? "none",
          totalTokenCreateReuse: report.progressSummary.totalTokenCreateReuse,
          totalInitialMetricWrite: report.progressSummary.totalInitialMetricWrite,
          totalLongitudinalMetricWrite:
            report.progressSummary.totalLongitudinalMetricWrite,
          totalMetricWrite: report.progressSummary.totalMetricWrite,
          totalTokenUpdate: report.progressSummary.totalTokenUpdate,
          notificationCreateUpdateExpected: 0,
          telegramSendExpected: 0,
        },
        blockedBy: report.blockedBy,
        stopConditionCodes: report.stopConditionCodes,
      });
    }
    return report;
  }

  const interruptController = createInterruptController();

  try {
    const preflightPhase = report.phases.find((phaseItem) => phaseItem.phase === "preflight");
    if (preflightPhase !== undefined) {
      const preflightStartedAt = Date.now();
      interruptController.setActivePhase("preflight");
      emitProgress(logger, {
        event: "phase",
        phase: "preflight",
        status: "started",
      });
      emitProgress(logger, {
        event: "phase",
        phase: "preflight",
        status: preflightPhase.status === "ok" ? "completed" : preflightPhase.status,
        durationMs: Date.now() - preflightStartedAt,
        summary: extractProgressSummaryFields(preflightPhase.summary),
        blockedBy: preflightPhase.blockedBy,
        stopConditionCodes: preflightPhase.stopConditionCodes,
      });
      interruptController.setActivePhase(null);
    }

    for (const phaseItem of report.phases) {
      if (phaseItem.phase === "preflight") {
        continue;
      }

      if (interruptController.context.isInterrupted()) {
        markReportInterrupted(report, interruptController.context, phaseItem, {});
        skipLaterPhases(report, phaseItem, MANUAL_INTERRUPT_CODE, MANUAL_INTERRUPT_CODE);
        break;
      }

      const commands = commandsForPhase(phaseItem.phase, commandOptions);
      if (commands.length === 0) {
        phaseItem.status = "skipped";
        emitProgress(logger, {
          event: "phase",
          phase: phaseItem.phase,
          status: "skipped",
          summary: extractProgressSummaryFields(phaseItem.summary),
        });
        continue;
      }

      if (
        phaseItem.phase === "metric_pending_snapshot"
        || phaseItem.phase === "enrich_rescore"
        || phaseItem.phase === "metric_longitudinal_snapshot"
      ) {
        const ok = await executeCyclePhase(
          report,
          phaseItem,
          commands,
          executor,
          interruptController.context,
          interruptController.setActivePhase,
          logger,
        );
        interruptController.setActivePhase(null);
        const stateOk = await capturePhaseState(
          report,
          phaseItem,
          options,
          readCurrentInput,
          ok,
        );
        if (!ok || !stateOk) {
          if (ok && !stateOk) {
            emitProgress(logger, {
              event: "phase",
              phase: phaseItem.phase,
              status: "failed",
              summary: extractProgressSummaryFields(phaseItem.summary),
              blockedBy: phaseItem.blockedBy,
              stopConditionCodes: phaseItem.stopConditionCodes,
            });
          }
          const interrupted = phaseItem.status === "interrupted";
          skipLaterPhases(
            report,
            phaseItem,
            interrupted ? MANUAL_INTERRUPT_CODE : `${phaseItem.phase}_failed`,
            interrupted ? MANUAL_INTERRUPT_CODE : "prior_phase_failed",
          );
          break;
        }
        continue;
      }

      const phaseStartedAt = Date.now();
      interruptController.setActivePhase(phaseItem.phase);
      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "started",
      });
      const result = await executor(phaseItem, commands, interruptController.context);

      if (result.interrupted || interruptController.context.isInterrupted()) {
        markReportInterrupted(report, interruptController.context, phaseItem, result.summary ?? {});
        await capturePhaseState(
          report,
          phaseItem,
          options,
          readCurrentInput,
          false,
        );
        emitProgress(logger, {
          event: "phase",
          phase: phaseItem.phase,
          status: "interrupted",
          durationMs: Date.now() - phaseStartedAt,
          summary: extractProgressSummaryFields(phaseItem.summary),
          blockedBy: phaseItem.blockedBy,
          stopConditionCodes: phaseItem.stopConditionCodes,
        });
        skipLaterPhases(report, phaseItem, MANUAL_INTERRUPT_CODE, MANUAL_INTERRUPT_CODE);
        interruptController.setActivePhase(null);
        break;
      }

      phaseItem.status = result.ok ? "executed" : "failed";
      phaseItem.summary = result.summary ?? {};
      phaseItem.blockedBy = result.blockedBy ?? [];
      phaseItem.stopConditionCodes = result.stopConditionCodes ?? [];

      if (!result.ok) {
        await capturePhaseState(
          report,
          phaseItem,
          options,
          readCurrentInput,
          false,
        );
        report.blockedBy.push(`${phaseItem.phase}_failed`);
        report.stopConditionCodes.push(...phaseItem.stopConditionCodes);
        emitProgress(logger, {
          event: "phase",
          phase: phaseItem.phase,
          status: "failed",
          durationMs: Date.now() - phaseStartedAt,
          summary: extractProgressSummaryFields(phaseItem.summary),
          blockedBy: phaseItem.blockedBy,
          stopConditionCodes: phaseItem.stopConditionCodes,
        });
        skipLaterPhases(report, phaseItem, `${phaseItem.phase}_failed`);
        interruptController.setActivePhase(null);
        break;
      }

      const detectStopCode = phaseItem.phase === "detect_write"
        ? detectFailureCode(phaseItem.summary)
        : null;
      if (detectStopCode !== null) {
        phaseItem.status = "failed";
        phaseItem.stopConditionCodes = [detectStopCode];
        await capturePhaseState(
          report,
          phaseItem,
          options,
          readCurrentInput,
          false,
        );
        report.blockedBy.push(`${phaseItem.phase}_failed`);
        report.stopConditionCodes.push(detectStopCode);
        emitProgress(logger, {
          event: "phase",
          phase: phaseItem.phase,
          status: "failed",
          durationMs: Date.now() - phaseStartedAt,
          summary: extractProgressSummaryFields(phaseItem.summary),
          blockedBy: phaseItem.blockedBy,
          stopConditionCodes: phaseItem.stopConditionCodes,
        });
        skipLaterPhases(report, phaseItem, `${phaseItem.phase}_failed`);
        interruptController.setActivePhase(null);
        break;
      }

      const stateOk = await capturePhaseState(
        report,
        phaseItem,
        options,
        readCurrentInput,
        true,
      );
      if (!stateOk) {
        emitProgress(logger, {
          event: "phase",
          phase: phaseItem.phase,
          status: "failed",
          durationMs: Date.now() - phaseStartedAt,
          summary: extractProgressSummaryFields(phaseItem.summary),
          blockedBy: phaseItem.blockedBy,
          stopConditionCodes: phaseItem.stopConditionCodes,
        });
        skipLaterPhases(report, phaseItem, `${phaseItem.phase}_failed`);
        interruptController.setActivePhase(null);
        break;
      }

      emitProgress(logger, {
        event: "phase",
        phase: phaseItem.phase,
        status: "completed",
        durationMs: Date.now() - phaseStartedAt,
        summary: extractProgressSummaryFields(phaseItem.summary),
        blockedBy: phaseItem.blockedBy,
        stopConditionCodes: phaseItem.stopConditionCodes,
      });
      interruptController.setActivePhase(null);
    }
  } finally {
    interruptController.cleanup();
  }

  const durationMs = Date.now() - runStartedAt;
  const finishedAt = new Date().toISOString();
  report.finishedAt = finishedAt;
  if (report.interruptedAt === null) {
    report.interruptedAt = interruptController.interruptedAt();
  }
  if (readCurrentInput !== undefined) {
    try {
      const finalInput = await readCurrentInput();
      report.finalDbState = finalInput.dbState;
      report.finalQueueState = finalInput.queueState;
      report.finalNotificationState = finalInput.notificationState;
    } catch {
      report.stopConditionCodes.push("final_state_read_failed");
    }
  }
  const finalCheckpointState = readCheckpointSafeCursorSummary(report.checkpointFile);
  if (
    finalCheckpointState.exists === true
    && finalCheckpointState.valid === false
    && !report.stopConditionCodes.includes("checkpoint_after_invalid")
  ) {
    report.blockedBy.push("checkpoint_after_invalid");
    report.stopConditionCodes.push("checkpoint_after_invalid");
  }
  report.progressSummary = buildProgressSummary(report, startedAt, finishedAt, durationMs);
  report.operatorSummary = buildOperatorSummary(report, report.progressSummary);
  report.status = report.progressSummary.overallStatus;
  emitProgress(logger, {
    event: "final_summary",
    status: report.progressSummary.overallStatus,
    durationMs,
    summary: {
      executeRequested: report.progressSummary.executeRequested,
      readOnly: report.progressSummary.readOnly,
      dryRun: report.progressSummary.dryRun,
      computedSinceMinutes: report.computedSinceMinutes,
      detectHorizonHours: report.detectHorizonHours,
      cleanupHorizonHours: report.cleanupHorizonHours,
      cleanupSinceMinutes: report.cleanupSinceMinutes,
      cleanupWindowSource: report.cleanupWindowSource,
      maxIterations: report.maxIterations,
      postRunMetricCycles: report.postRunMetricCycles,
      postRunLongitudinalMetricCycles: report.postRunLongitudinalMetricCycles,
      postRunEnrichCycles: report.postRunEnrichCycles,
      metricCyclesExecuted: report.progressSummary.metricCyclesExecuted,
      longitudinalMetricCyclesExecuted:
        report.progressSummary.longitudinalMetricCyclesExecuted,
      enrichCyclesExecuted: report.progressSummary.enrichCyclesExecuted,
      metricCyclesStoppedReason: report.progressSummary.metricCyclesStoppedReason ?? "none",
      longitudinalMetricCyclesStoppedReason:
        report.progressSummary.longitudinalMetricCyclesStoppedReason ?? "none",
      enrichCyclesStoppedReason: report.progressSummary.enrichCyclesStoppedReason ?? "none",
      activePhase: report.progressSummary.activePhase ?? "none",
      activeCycleIndex: report.progressSummary.activeCycleIndex ?? 0,
      activeCycleTotal: report.progressSummary.activeCycleTotal ?? 0,
      partialPhase: report.progressSummary.partialPhase ?? "none",
      completedPhases: report.progressSummary.phasesCompleted,
      failedPhases: report.progressSummary.phasesFailed,
      skippedPhases: report.progressSummary.phasesSkipped,
      checkpointFile: report.progressSummary.checkpointFile ?? "none",
      checkpointExists: report.progressSummary.checkpointExists ?? false,
      elapsedMs: report.progressSummary.elapsedMs,
      startedAt: report.progressSummary.startedAt,
      interruptedAt: report.progressSummary.interruptedAt ?? "none",
      totalTokenCreateReuse: report.progressSummary.totalTokenCreateReuse,
      totalInitialMetricWrite: report.progressSummary.totalInitialMetricWrite,
      totalLongitudinalMetricWrite:
        report.progressSummary.totalLongitudinalMetricWrite,
      totalMetricWrite: report.progressSummary.totalMetricWrite,
      totalTokenUpdate: report.progressSummary.totalTokenUpdate,
      notificationCreateUpdateExpected: 0,
      telegramSendExpected: 0,
    },
    blockedBy: report.blockedBy,
    stopConditionCodes: report.stopConditionCodes,
  });

  return report;
}
