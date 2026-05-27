import { spawn } from "node:child_process";
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
  | "failed";

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
  summary?: Record<string, unknown>;
  blockedBy?: string[];
  stopConditionCodes?: string[];
};

export type PhaseExecutor = (
  phase: BoundedOperationRunnerPhase,
  commands: PhaseCommand[],
) => Promise<PhaseExecutionResult>;

export type BoundedOperationRunnerReport = {
  mode: "bounded_operation_runner";
  readOnly: boolean;
  dryRun: boolean;
  executeRequested: boolean;
  hours: number;
  pumpOnly: boolean;
  computedSinceMinutes: number;
  maxIterations: number;
  intervalSeconds: number;
  checkpointFile: string | null;
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
    readOnly: !options.executeRequested,
    dryRun: !options.executeRequested,
    executeRequested: options.executeRequested,
    hours: options.hours,
    pumpOnly: options.pumpOnly,
    computedSinceMinutes,
    maxIterations,
    intervalSeconds: options.intervalSeconds,
    checkpointFile: options.checkpointFile ?? null,
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

function extractCycleSummaryFields(value: unknown): Record<string, unknown> {
  const record = asRecord(value) ?? {};
  const summary = asRecord(record.summary) ?? record;
  const commandResults = Array.isArray(record.commandResults) ? record.commandResults : [];
  const parsedSummary = commandResults
    .map((item) => asRecord(item))
    .map((item) => asRecord(item?.parsedSummary))
    .find((item): item is Record<string, unknown> => item !== null);
  const source = parsedSummary ?? summary;
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
): Promise<PhaseExecutionResult> {
  const commandResults: Record<string, unknown>[] = [];

  for (const command of commands) {
    const result = await new Promise<{
      exitCode: number | null;
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
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("close", (exitCode) => {
        resolve({
          exitCode,
          stdout,
          stderr,
        });
      });
      child.on("error", (error) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: String(error),
        });
      });
    });

    const parsedSummary = extractCycleSummaryFields(parseJsonObject(result.stdout));
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
): void {
  for (const laterPhase of report.phases.slice(report.phases.indexOf(phaseItem) + 1)) {
    laterPhase.status = "skipped";
    laterPhase.blockedBy = [reason];
    laterPhase.stopConditionCodes = ["prior_phase_failed"];
  }
}

async function executeCyclePhase(
  report: BoundedOperationRunnerReport,
  phaseItem: BoundedOperationRunnerPhase,
  commands: PhaseCommand[],
  executor: PhaseExecutor,
): Promise<boolean> {
  const cycleSummaries: Record<string, unknown>[] = [];
  let stoppedReason: string | null = null;
  let executedCount = 0;

  for (const [index, command] of commands.entries()) {
    const result = await executor(phaseItem, [command]);
    const fields = extractCycleSummaryFields(result.summary ?? {});
    const cycleSummary = {
      cycleIndex: index + 1,
      status: result.ok ? "executed" : "failed",
      ...fields,
      summary: result.summary ?? {},
    };
    cycleSummaries.push(cycleSummary);

    if (result.ok) {
      executedCount += 1;
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
      return false;
    }

    const noWorkReason = cycleNoWorkReason(phaseItem.phase, fields);
    if (noWorkReason !== null) {
      stoppedReason = noWorkReason;
      break;
    }
  }

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

  return true;
}

export async function runBoundedOperationRunner(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationRunnerOptions,
  executor: PhaseExecutor = defaultPhaseExecutor,
): Promise<BoundedOperationRunnerReport> {
  const report = buildBoundedOperationRunnerPlan(input, options);

  if (!options.executeRequested || report.blockedBy.length > 0) {
    return report;
  }

  for (const phaseItem of report.phases) {
    if (phaseItem.phase === "preflight") {
      continue;
    }

    const commands = commandsForPhase(phaseItem.phase, options);
    if (commands.length === 0) {
      phaseItem.status = "skipped";
      continue;
    }

    if (phaseItem.phase === "metric_pending_snapshot" || phaseItem.phase === "enrich_rescore") {
      const ok = await executeCyclePhase(report, phaseItem, commands, executor);
      if (!ok) {
        skipLaterPhases(report, phaseItem, `${phaseItem.phase}_failed`);
        break;
      }
      continue;
    }

    const result = await executor(phaseItem, commands);
    phaseItem.status = result.ok ? "executed" : "failed";
    phaseItem.summary = result.summary ?? {};
    phaseItem.blockedBy = result.blockedBy ?? [];
    phaseItem.stopConditionCodes = result.stopConditionCodes ?? [];

    if (!result.ok) {
      report.blockedBy.push(`${phaseItem.phase}_failed`);
      report.stopConditionCodes.push(...phaseItem.stopConditionCodes);
      skipLaterPhases(report, phaseItem, `${phaseItem.phase}_failed`);
      break;
    }
  }

  return report;
}
