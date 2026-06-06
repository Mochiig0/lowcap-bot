import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type {
  BoundedOperationPlannerInput,
  DbState,
  NotificationState,
  QueueState,
} from "./boundedOperationPlanner.js";

const DEFAULT_HOURS = 6;
const DEFAULT_METRIC_LIMIT = 50;
const DEFAULT_ENRICH_LIMIT = 50;
const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_POST_RUN_BUFFER_MINUTES = 60;
const DEFAULT_INTER_ITEM_DELAY_MS = 15_000;
const DEFAULT_POST_RUN_METRIC_CYCLES = 1;
const DEFAULT_POST_RUN_ENRICH_CYCLES = 1;
const METRIC_MIN_GAP_MINUTES = 60;
const MANUAL_INTERRUPT_CODE = "manual_interrupt";

export type BoundedOperationRunnerOptions = {
  hours: number;
  pumpOnly: boolean;
  checkpointFile?: string;
  metricLimit: number;
  enrichLimit: number;
  intervalSeconds: number;
  maxIterations?: number;
  postRunBufferMinutes: number;
  interItemDelayMs: number;
  postRunMetricCycles: number;
  postRunEnrichCycles: number;
  executeRequested: boolean;
  repoRoot: string;
};

export type BoundedOperationRunnerPhaseName =
  | "preflight"
  | "detect_write"
  | "metric_pending_snapshot"
  | "enrich_rescore"
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
  enrichCyclesExecuted: number;
  metricCyclesStoppedReason: string | null;
  enrichCyclesStoppedReason: string | null;
  totalTokenCreateReuse: number | null;
  totalMetricWrite: number | null;
  totalTokenUpdate: number | null;
  notificationCreateUpdateExpected: 0;
  telegramSendExpected: 0;
  checkpointFile: string | null;
  checkpointExists: boolean | null;
  checkpointSafeCursorSummary: Record<string, unknown> | null;
  blockedBy: string[];
  stopConditionCodes: string[];
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
  maxIterations: number;
  intervalSeconds: number;
  checkpointFile: string | null;
  checkpointExists: boolean | null;
  checkpointSafeCursorSummary: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  interruptedAt: string | null;
  activePhase: BoundedOperationRunnerPhaseName | null;
  activeCycleIndex: number | null;
  activeCycleTotal: number | null;
  partialPhase: BoundedOperationRunnerPhaseName | null;
  dbState: DbState;
  queueState: QueueState;
  notificationState: NotificationState;
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
  postRunEnrichCycles: number;
  metricCyclesExecuted: number;
  enrichCyclesExecuted: number;
  metricCyclesStoppedReason: string | null;
  enrichCyclesStoppedReason: string | null;
  blockedBy: string[];
  stopConditionCodes: string[];
  expectedSideEffects: string[];
  expectedNonEffects: string[];
  progressSummary?: BoundedOperationRunnerProgressSummary;
};

export const DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS = {
  hours: DEFAULT_HOURS,
  metricLimit: DEFAULT_METRIC_LIMIT,
  enrichLimit: DEFAULT_ENRICH_LIMIT,
  intervalSeconds: DEFAULT_INTERVAL_SECONDS,
  postRunBufferMinutes: DEFAULT_POST_RUN_BUFFER_MINUTES,
  interItemDelayMs: DEFAULT_INTER_ITEM_DELAY_MS,
  postRunMetricCycles: DEFAULT_POST_RUN_METRIC_CYCLES,
  postRunEnrichCycles: DEFAULT_POST_RUN_ENRICH_CYCLES,
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

function joinCommand(file: string, args: string[], env?: Record<string, string>): string {
  const prefix = env && Object.keys(env).length > 0
    ? `${Object.entries(env).map(([key, value]) => `${key}=${value}`).join(" ")} `
    : "";
  return `${prefix}${[file, ...args].join(" ")}`;
}

function abbreviateValue(value: string): string {
  return value.length <= 16 ? value : `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function readCheckpointSafeCursorSummary(checkpointFile: string | null): {
  exists: boolean | null;
  summary: Record<string, unknown> | null;
} {
  if (checkpointFile === null) {
    return {
      exists: null,
      summary: null,
    };
  }

  if (!existsSync(checkpointFile)) {
    return {
      exists: false,
      summary: null,
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(checkpointFile, "utf8")) as unknown;
    const record = asRecord(parsed);
    const cursor = asRecord(record?.cursor);
    const poolCreatedAt = asString(cursor?.poolCreatedAt);
    const poolAddress = asString(cursor?.poolAddress);
    const source = asString(record?.source);
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
      summary: Object.keys(summary).length > 0 ? summary : null,
    };
  } catch {
    return {
      exists: true,
      summary: {
        unreadable: true,
      },
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
    String(computeSinceMinutes(options)),
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

function buildEnrichCommand(options: BoundedOperationRunnerOptions, cycleIndex?: number): PhaseCommand {
  const cliArgs = [
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit",
    String(options.enrichLimit),
    "--sinceMinutes",
    String(computeSinceMinutes(options)),
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
  const maxIterations = computeMaxIterations(options);
  const stop = buildStopBlockers(input, options);
  const blocked = stop.blockedBy.length > 0;
  const plannedStatus: BoundedOperationRunnerPhaseStatus = blocked ? "blocked" : "planned";
  const checkpointState = readCheckpointSafeCursorSummary(options.checkpointFile ?? null);

  const detectCommand = buildDetectCommand(options);
  const metricCommands = buildMetricCycleCommands(options);
  const enrichCommands = buildEnrichCycleCommands(options);
  const reportCommands = [
    buildReviewQueueCommand(options),
    buildReviewQueueCommand(options, 168),
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
        checkpointOutsideRepo:
          options.checkpointFile === undefined
            ? null
            : !isPathInside(options.checkpointFile, options.repoRoot),
        smokeUsed: false,
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
    maxIterations,
    intervalSeconds: options.intervalSeconds,
    checkpointFile: options.checkpointFile ?? null,
    checkpointExists: checkpointState.exists,
    checkpointSafeCursorSummary: checkpointState.summary,
    startedAt: null,
    finishedAt: null,
    interruptedAt: null,
    activePhase: null,
    activeCycleIndex: null,
    activeCycleTotal: null,
    partialPhase: null,
    dbState: input.dbState,
    queueState: input.queueState,
    notificationState: input.notificationState,
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
    postRunEnrichCycles: options.postRunEnrichCycles,
    metricCyclesExecuted: 0,
    enrichCyclesExecuted: 0,
    metricCyclesStoppedReason: options.postRunMetricCycles === 0 ? "cycles_zero" : null,
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
    case "report_review":
      return [buildReviewQueueCommand(options), buildReviewQueueCommand(options, 168)];
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

  for (const key of [
    "cycleCount",
    "completedIterations",
    "failedCount",
    "rateLimitRetryCount",
    "importedCount",
    "existingCount",
    "selected",
    "written",
    "enriched",
    "rescored",
    "skipped",
    "error",
    "contextWritten",
    "metaplexAttempted",
    "metaplexAvailable",
    "notifyWouldSend",
    "notifySent",
    "interItemDelayMs",
    "interItemDelayCount",
    "skippedAfterRateLimit",
    "cyclesPlanned",
    "cyclesExecuted",
  ]) {
    const numericValue = asNumber(source[key]);
    if (numericValue !== undefined) {
      fields[key] = numericValue;
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

  const stoppedReason = asString(source.stoppedReason);
  if (stoppedReason !== undefined) {
    fields.stoppedReason = stoppedReason;
  }

  return fields;
}

function extractCycleSummaryFields(value: unknown): Record<string, unknown> {
  const source = parsedCommandSummary(value);
  const fields: Record<string, unknown> = {};

  for (const key of [
    "selected",
    "written",
    "enriched",
    "rescored",
    "skipped",
    "error",
    "contextWritten",
    "metaplexAttempted",
    "metaplexAvailable",
    "notifyWouldSend",
    "notifySent",
    "interItemDelayMs",
    "interItemDelayCount",
    "skippedAfterRateLimit",
  ]) {
    const numericValue = asNumber(source[key]);
    if (numericValue !== undefined) {
      fields[key] = numericValue;
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
    || (asNumber(fields.error) ?? 0) > 0;
}

function cycleNoWorkReason(
  phaseName: BoundedOperationRunnerPhaseName,
  fields: Record<string, unknown>,
): string | null {
  if (asNumber(fields.selected) === 0) {
    return "selected_zero";
  }

  if (phaseName === "metric_pending_snapshot" && asNumber(fields.written) === 0) {
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

    const parsedSummary = extractProgressSummaryFields(parseJsonObject(result.stdout));
    if (context?.isInterrupted() === true) {
      commandResults.push({
        label: command.label,
        exitCode: result.exitCode,
        signal: result.signal,
        interrupted: true,
        parsedSummary,
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
      stdoutTail: result.stdout.slice(-4_000),
      stderrTail: result.stderr.slice(-4_000),
      parsedSummary,
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
  } else if (phaseItem.phase === "enrich_rescore") {
    report.enrichCyclesExecuted = executedCount;
    report.enrichCyclesStoppedReason = stoppedReason;
  }

  emitProgress(logger, {
    event: "phase",
    phase: phaseItem.phase,
    status: "completed",
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
  const importedCount = asNumber(extractProgressSummaryFields(detectPhase?.summary).importedCount);
  const existingCount = asNumber(extractProgressSummaryFields(detectPhase?.summary).existingCount);
  const totalMetricWrite = sumCycleField(metricPhase, "written");
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
      : report.executeRequested
        ? "completed"
        : "planned";
  const interruptedPhase = report.phases.find((phaseItem) => phaseItem.status === "interrupted");
  const checkpointState = readCheckpointSafeCursorSummary(report.checkpointFile);
  report.checkpointExists = checkpointState.exists;
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
    enrichCyclesExecuted: report.enrichCyclesExecuted,
    metricCyclesStoppedReason: report.metricCyclesStoppedReason,
    enrichCyclesStoppedReason: report.enrichCyclesStoppedReason,
    totalTokenCreateReuse:
      importedCount !== undefined || existingCount !== undefined
        ? (importedCount ?? 0) + (existingCount ?? 0)
        : null,
    totalMetricWrite,
    totalTokenUpdate:
      totalEnriched !== null || totalRescored !== null
        ? Math.max(totalEnriched ?? 0, totalRescored ?? 0)
        : null,
    notificationCreateUpdateExpected: 0,
    telegramSendExpected: 0,
    checkpointFile: report.checkpointFile,
    checkpointExists: report.checkpointExists,
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
): Promise<BoundedOperationRunnerReport> {
  const runStartedAt = Date.now();
  const startedAt = new Date(runStartedAt).toISOString();
  const report = buildBoundedOperationRunnerPlan(input, options);
  report.startedAt = startedAt;

  if (!options.executeRequested || report.blockedBy.length > 0) {
    if (options.executeRequested) {
      const durationMs = Date.now() - runStartedAt;
      const finishedAt = new Date().toISOString();
      report.finishedAt = finishedAt;
      report.progressSummary = buildProgressSummary(report, startedAt, finishedAt, durationMs);
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
          maxIterations: report.maxIterations,
          postRunMetricCycles: report.postRunMetricCycles,
          postRunEnrichCycles: report.postRunEnrichCycles,
          metricCyclesExecuted: report.progressSummary.metricCyclesExecuted,
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

      const commands = commandsForPhase(phaseItem.phase, options);
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

      if (phaseItem.phase === "metric_pending_snapshot" || phaseItem.phase === "enrich_rescore") {
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
        if (!ok) {
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
  report.progressSummary = buildProgressSummary(report, startedAt, finishedAt, durationMs);
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
      maxIterations: report.maxIterations,
      postRunMetricCycles: report.postRunMetricCycles,
      postRunEnrichCycles: report.postRunEnrichCycles,
      metricCyclesExecuted: report.progressSummary.metricCyclesExecuted,
      enrichCyclesExecuted: report.progressSummary.enrichCyclesExecuted,
      metricCyclesStoppedReason: report.progressSummary.metricCyclesStoppedReason ?? "none",
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
