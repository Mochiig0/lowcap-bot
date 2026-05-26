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

function buildDetectCommand(options: BoundedOperationRunnerOptions): PhaseCommand {
  const checkpoint = options.checkpointFile ?? "<CHECKPOINT_FILE>";
  const args = [
    "-s",
    "detect:geckoterminal:new-pools",
    "--",
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

  return {
    label: "detect_write",
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
}

function buildMetricCommand(options: BoundedOperationRunnerOptions): PhaseCommand {
  const args = [
    "-s",
    "metric:snapshot:geckoterminal",
    "--",
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

  return {
    label: "metric_pending_snapshot",
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
}

function buildEnrichCommand(options: BoundedOperationRunnerOptions): PhaseCommand {
  const args = [
    "-s",
    "token:enrich-rescore:geckoterminal",
    "--",
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit",
    String(options.enrichLimit),
    "--sinceMinutes",
    String(computeSinceMinutes(options)),
    "--interItemDelayMs",
    String(options.interItemDelayMs),
    "--write",
  ];

  return {
    label: "enrich_rescore",
    commandCandidate: joinCommand("pnpm", args),
    file: "pnpm",
    args,
  };
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
  const metricCommand = buildMetricCommand(options);
  const enrichCommand = buildEnrichCommand(options);
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
    phase("metric_pending_snapshot", plannedStatus, [metricCommand], {
      writePhase: true,
      expectedSideEffects: [
        "external GeckoTerminal fetch on --execute",
        `production DB Metric write max ${options.metricLimit} on --execute`,
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
    phase("enrich_rescore", plannedStatus, [enrichCommand], {
      writePhase: true,
      expectedSideEffects: [
        "external GeckoTerminal token snapshot fetch on --execute",
        "best-effort Metaplex fetch on --execute",
        `production DB Token update max ${options.enrichLimit} on --execute`,
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
      return [buildMetricCommand(options)];
    case "enrich_rescore":
      return [buildEnrichCommand(options)];
    case "report_review":
      return [buildReviewQueueCommand(options), buildReviewQueueCommand(options, 168)];
    case "notification_plan_review":
      return buildNotificationPlanCommands();
    case "preflight":
      return [];
  }
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

    commandResults.push({
      label: command.label,
      exitCode: result.exitCode,
      stdoutTail: result.stdout.slice(-4_000),
      stderrTail: result.stderr.slice(-4_000),
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
    const result = await executor(phaseItem, commands);
    phaseItem.status = result.ok ? "executed" : "failed";
    phaseItem.summary = result.summary ?? {};
    phaseItem.blockedBy = result.blockedBy ?? [];
    phaseItem.stopConditionCodes = result.stopConditionCodes ?? [];

    if (!result.ok) {
      report.blockedBy.push(`${phaseItem.phase}_failed`);
      report.stopConditionCodes.push(...phaseItem.stopConditionCodes);

      for (const laterPhase of report.phases.slice(report.phases.indexOf(phaseItem) + 1)) {
        laterPhase.status = "skipped";
        laterPhase.blockedBy = [`${phaseItem.phase}_failed`];
        laterPhase.stopConditionCodes = ["prior_phase_failed"];
      }
      break;
    }
  }

  return report;
}
