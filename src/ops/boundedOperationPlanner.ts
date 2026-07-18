import type { PrismaClient } from "@prisma/client";

import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import { buildNotificationAutoSendPlan } from "../notifications/notificationAutoSendPlanner.js";
import { buildNotificationRetryPlan } from "../cli/notificationRetryPlan.js";

const DEFAULT_REVIEW_QUEUE_HOURS = 24;
const DEFAULT_STALE_AFTER_HOURS = 6;
const DETECT_INTERVAL_SECONDS = 60;
const METRIC_MIN_GAP_MINUTES = 60;
const METRIC_INTER_ITEM_DELAY_MS = 15_000;
const ENRICH_INTER_ITEM_DELAY_MS = 15_000;
const DEFAULT_POST_RUN_METRIC_LIMIT = 50;
const DEFAULT_POST_RUN_ENRICH_LIMIT = 50;

type JsonObject = Record<string, unknown>;

export type BoundedOperationPlannerOptions = {
  hours: number;
  sinceHours: number;
  limit: number;
  pumpOnly: boolean;
  postRunPlan?: boolean;
  metricLimit?: number;
  enrichLimit?: number;
};

export type DbState = {
  tokenCount: number;
  metricCount: number;
  notificationCount: number;
  holderSnapshotCount: number;
  metricZeroTokenCount: number;
  metricOneTokenCount: number;
  metricTwoPlusTokenCount: number;
  notificationStatusCounts: {
    captured: number;
    sent: number;
    failed: number;
  };
};

export type QueueSummary = {
  sinceHours: number;
  geckoOriginTokenCount: number;
  metricPendingCount: number;
  enrichPendingCount: number;
  staleReviewCount: number;
  notifyCandidateCount: number;
};

export type QueueState = {
  defaultWindow: QueueSummary;
  requestedWindow: QueueSummary;
  rolling168h: QueueSummary;
};

export type CleanupWindowSource = "requested_window" | "rolling_168h_backlog";

export type CleanupWindowSelection = {
  source: CleanupWindowSource;
  queue: QueueSummary;
};

export type NotificationState = {
  failedCount: number;
  retryCandidateCount: number;
  allowedAutoSendCandidateCount: number;
};

export type OperationReadiness = {
  canRunDetectDryRun: boolean;
  canRunDetectWriteRehearsal: boolean;
  canRunMetricPending: boolean;
  canRunEnrichPending: boolean;
  canReviewReports: boolean;
  canPlanNotification: boolean;
  canRunAutoSendSingleShot: boolean;
  schedulerUnlocked: false;
  systemdUnlocked: false;
  alwaysOnAutoSendUnlocked: false;
};

export type NextRecommendedStep =
  | "detect_watch_dry_run"
  | "detect_watch_write_rehearsal"
  | "metric_pending_snapshot"
  | "enrich_pending_rescore"
  | "report_review"
  | "notification_manual_review"
  | "auto_send_plan_review"
  | "no_action_queue_clear"
  | "stop_due_to_failed_notifications"
  | "stop_due_to_ambiguous_state";

export type BoundedOperationPlannerInput = {
  dbState: DbState;
  queueState: QueueState;
  notificationState: NotificationState;
  queueStateAvailable?: boolean;
};

export type BoundedOperationPlan = {
  readOnly: true;
  dryRun: true;
  mode: "bounded_operation_planner";
  hours: number;
  sinceHours: number;
  detectHorizonHours: number;
  requestedQueueHorizonHours: number;
  cleanupHorizonHours: number;
  cleanupWindowSource: CleanupWindowSource;
  cleanupWindow: QueueSummary;
  limit: number;
  pumpOnly: boolean;
  dbState: DbState;
  queueState: QueueState;
  notificationState: NotificationState;
  operationReadiness: OperationReadiness;
  nextRecommendedStep: NextRecommendedStep;
  redCommandCandidate: string | null;
  humanApprovalRequired: boolean;
  expectedSideEffects: string[];
  expectedNonEffects: string[];
  blockedBy: string[];
  stopConditionCodes: string[];
  postRunPlan?: PostRunWorkflowPlan;
};

export type PostRunWorkflowStepStatus =
  | "ready"
  | "blocked"
  | "not_needed"
  | "pending_previous_step";

export type PostRunWorkflowStepName =
  | "metric_pending_snapshot"
  | "enrich_pending_rescore"
  | "report_review"
  | "notification_plan_review"
  | "optional_auto_send_plan_review"
  | "no_action_queue_clear";

export type PostRunWorkflowStep = {
  stepName: PostRunWorkflowStepName;
  status: PostRunWorkflowStepStatus;
  reason: string;
  commandCandidate: string | null;
  humanApprovalRequired: boolean;
  expectedSideEffects: string[];
  expectedNonEffects: string[];
  blockedBy: string[];
  stopConditionCodes: string[];
};

export type PostRunWorkflowPlan = {
  enabled: true;
  operationWindowHours: number;
  detectHorizonHours: number;
  cleanupHorizonHours: number;
  cleanupWindowSource: CleanupWindowSource;
  steps: PostRunWorkflowStep[];
  recommendedFirstStep: PostRunWorkflowStepName | NextRecommendedStep;
  workflowComplete: boolean;
};

function actionableCount(queue: QueueSummary): number {
  return queue.metricPendingCount
    + queue.enrichPendingCount
    + queue.staleReviewCount
    + queue.notifyCandidateCount;
}

export function resolveCleanupWindow(queueState: QueueState): CleanupWindowSelection {
  const requested = queueState.requestedWindow;
  const rolling = queueState.rolling168h;
  const rollingHasOlderActionableWork =
    rolling.metricPendingCount > requested.metricPendingCount
    || rolling.enrichPendingCount > requested.enrichPendingCount
    || rolling.staleReviewCount > requested.staleReviewCount
    || rolling.notifyCandidateCount > requested.notifyCandidateCount
    || (actionableCount(requested) === 0 && actionableCount(rolling) > 0);

  return rollingHasOlderActionableWork
    ? { source: "rolling_168h_backlog", queue: rolling }
    : { source: "requested_window", queue: requested };
}

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

type SelectedToken = {
  mint: string;
  source: string | null;
  metadataStatus: string;
  scoreRank: string;
  hardRejected: boolean;
  name: string | null;
  symbol: string | null;
  createdAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  selectionAnchorAt: Date;
  metricsCount: number;
  isGeckoterminalOrigin: boolean;
};

type PlannerClient = Pick<
  PrismaClient,
  "token" | "metric" | "notification" | "holderSnapshot"
>;

function optionalPumpOnlyArg(pumpOnly: boolean): string[] {
  return pumpOnly ? ["--pumpOnly"] : [];
}

function buildDetectDryRunCommand(options: BoundedOperationPlannerOptions): string {
  const maxIterations = Math.max(
    1,
    Math.ceil((options.hours * 60 * 60) / DETECT_INTERVAL_SECONDS),
  );

  return [
    "pnpm -s detect:geckoterminal:new-pools -- --watch",
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit 1",
    `--maxIterations ${maxIterations}`,
    `--intervalSeconds ${DETECT_INTERVAL_SECONDS}`,
  ].join(" ");
}

function buildMetricPendingCommand(options: BoundedOperationPlannerOptions): string {
  const sinceMinutes = Math.max(1, Math.ceil(options.sinceHours * 60));

  return [
    "pnpm -s metric:snapshot:geckoterminal --",
    ...optionalPumpOnlyArg(options.pumpOnly),
    `--limit ${options.limit}`,
    `--sinceMinutes ${sinceMinutes}`,
    `--minGapMinutes ${METRIC_MIN_GAP_MINUTES}`,
    `--interItemDelayMs ${METRIC_INTER_ITEM_DELAY_MS}`,
    "--onlyMetricPending",
    "--noNotificationCapture",
    "--write",
  ].join(" ");
}

function buildPostRunMetricPendingCommand(options: BoundedOperationPlannerOptions): string {
  return buildMetricPendingCommand({
    ...options,
    limit: options.metricLimit ?? DEFAULT_POST_RUN_METRIC_LIMIT,
  });
}

function buildEnrichPendingCommand(options: BoundedOperationPlannerOptions): string {
  const sinceMinutes = Math.max(1, Math.ceil(options.sinceHours * 60));

  return [
    "pnpm -s token:enrich-rescore:geckoterminal --",
    ...optionalPumpOnlyArg(options.pumpOnly),
    `--limit ${options.limit}`,
    `--sinceMinutes ${sinceMinutes}`,
    `--interItemDelayMs ${ENRICH_INTER_ITEM_DELAY_MS}`,
    "--onlyMetricCovered",
    "--write",
  ].join(" ");
}

function buildPostRunEnrichPendingCommand(options: BoundedOperationPlannerOptions): string {
  return buildEnrichPendingCommand({
    ...options,
    limit: options.enrichLimit ?? DEFAULT_POST_RUN_ENRICH_LIMIT,
  });
}

function buildReportReviewCommand(options: BoundedOperationPlannerOptions): string {
  return [
    "pnpm -s review:queue:geckoterminal --",
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit 20",
  ].join(" ");
}

function buildNotificationPlanCommand(): string {
  return "pnpm -s notification:auto-send:plan";
}

function buildOptionalAutoSendPlanCommand(): string {
  return "NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:plan";
}

function buildDetectWriteRehearsalCommand(options: BoundedOperationPlannerOptions): string {
  const maxIterations = Math.max(
    1,
    Math.ceil((options.hours * 60 * 60) / DETECT_INTERVAL_SECONDS),
  );

  return [
    "pnpm -s detect:geckoterminal:new-pools -- --watch --write",
    ...optionalPumpOnlyArg(options.pumpOnly),
    "--limit 1",
    `--maxIterations ${maxIterations}`,
    `--intervalSeconds ${DETECT_INTERVAL_SECONDS}`,
    "--checkpointFile /tmp/lowcap-bot-gecko-bounded-write-rehearsal.json",
  ].join(" ");
}

function getStopBlockers(notificationState: NotificationState, queueStateAvailable: boolean): {
  blockedBy: string[];
  stopConditionCodes: string[];
  nextRecommendedStep: NextRecommendedStep | null;
} {
  const blockedBy: string[] = [];
  const stopConditionCodes: string[] = [];
  let nextRecommendedStep: NextRecommendedStep | null = null;

  if (!queueStateAvailable) {
    blockedBy.push("queue_state_unavailable");
    stopConditionCodes.push("queue_state_unavailable");
    nextRecommendedStep = "stop_due_to_ambiguous_state";
  }

  if (notificationState.failedCount > 0) {
    blockedBy.push("failed_notifications_present");
    stopConditionCodes.push("failed_notifications_present");
    nextRecommendedStep = "stop_due_to_failed_notifications";
  }

  if (notificationState.retryCandidateCount > 0) {
    blockedBy.push("retry_candidate_present");
    stopConditionCodes.push("retry_candidate_present");
    nextRecommendedStep ??= "stop_due_to_ambiguous_state";
  }

  if (notificationState.allowedAutoSendCandidateCount > 0) {
    blockedBy.push("auto_send_allowed_candidate_present");
    stopConditionCodes.push("auto_send_allowed_candidate_present");
    nextRecommendedStep ??= "auto_send_plan_review";
  }

  return {
    blockedBy,
    stopConditionCodes,
    nextRecommendedStep,
  };
}

function buildOperationReadiness(input: {
  queue: QueueSummary;
  notificationState: NotificationState;
  hasStopBlocker: boolean;
}): OperationReadiness {
  const noStop = !input.hasStopBlocker;

  return {
    canRunDetectDryRun: noStop,
    canRunDetectWriteRehearsal: noStop,
    canRunMetricPending: noStop && input.queue.metricPendingCount > 0,
    canRunEnrichPending: noStop && input.queue.enrichPendingCount > 0,
    canReviewReports: noStop,
    canPlanNotification: true,
    canRunAutoSendSingleShot:
      noStop && input.notificationState.allowedAutoSendCandidateCount > 0,
    schedulerUnlocked: false,
    systemdUnlocked: false,
    alwaysOnAutoSendUnlocked: false,
  };
}

function noWriteNonEffects(): string[] {
  return [
    "DB write 0 by planner",
    "external fetch 0 by planner",
    "Telegram send 0",
    "Notification create/update 0",
    "Token write 0",
    "Metric write 0 by planner",
    "HolderSnapshot write 0",
    "scheduler/systemd 0",
    "rawJson full dump 0",
    "offensive raw text dump 0",
  ];
}

function metricStepEffects(limit: number): {
  expectedSideEffects: string[];
  expectedNonEffects: string[];
} {
  return {
    expectedSideEffects: [
      "external GeckoTerminal fetch on approved Red execution",
      `production DB Metric write max ${limit} on approved Red execution`,
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
  };
}

function enrichStepEffects(limit: number): {
  expectedSideEffects: string[];
  expectedNonEffects: string[];
} {
  return {
    expectedSideEffects: [
      "external GeckoTerminal token snapshot fetch on approved Red execution",
      `production DB Token update max ${limit} on approved Red execution`,
    ],
    expectedNonEffects: [
      "Metric write 0",
      "Notification create/update 0",
      "HolderSnapshot write 0",
      "Telegram send 0 because --notify is omitted",
      "scheduler/systemd 0",
      "rawJson full dump 0",
      "offensive raw text dump 0",
    ],
  };
}

function buildBlockedWorkflowStep(
  stepName: PostRunWorkflowStepName,
  input: {
    reason: string;
    blockedBy: string[];
    stopConditionCodes: string[];
  },
): PostRunWorkflowStep {
  return {
    stepName,
    status: "blocked",
    reason: input.reason,
    commandCandidate: null,
    humanApprovalRequired: false,
    expectedSideEffects: [],
    expectedNonEffects: noWriteNonEffects(),
    blockedBy: input.blockedBy,
    stopConditionCodes: input.stopConditionCodes,
  };
}

function buildPostRunWorkflowPlan(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationPlannerOptions,
  stop: ReturnType<typeof getStopBlockers>,
): PostRunWorkflowPlan {
  const cleanupWindow = resolveCleanupWindow(input.queueState);
  const queue = cleanupWindow.queue;
  const cleanupOptions = {
    ...options,
    sinceHours: queue.sinceHours,
  };
  const metricLimit = options.metricLimit ?? DEFAULT_POST_RUN_METRIC_LIMIT;
  const enrichLimit = options.enrichLimit ?? DEFAULT_POST_RUN_ENRICH_LIMIT;

  if (stop.blockedBy.length > 0) {
    const steps: PostRunWorkflowStep[] = [
      "metric_pending_snapshot",
      "enrich_pending_rescore",
      "report_review",
      "notification_plan_review",
      "optional_auto_send_plan_review",
    ].map((stepName) =>
      buildBlockedWorkflowStep(stepName as PostRunWorkflowStepName, {
        reason: "workflow stopped until notification and queue blockers are reviewed",
        blockedBy: stop.blockedBy,
        stopConditionCodes: stop.stopConditionCodes,
      }),
    );

    return {
      enabled: true,
      operationWindowHours: options.hours,
      detectHorizonHours: options.hours,
      cleanupHorizonHours: queue.sinceHours,
      cleanupWindowSource: cleanupWindow.source,
      steps,
      recommendedFirstStep: stop.nextRecommendedStep ?? "stop_due_to_ambiguous_state",
      workflowComplete: false,
    };
  }

  const metricEffects = metricStepEffects(metricLimit);
  const enrichEffects = enrichStepEffects(enrichLimit);
  const metricPending = queue.metricPendingCount > 0;
  const enrichPending = queue.enrichPendingCount > 0;
  const staleReview = queue.staleReviewCount > 0;
  const notifyCandidate = queue.notifyCandidateCount > 0;

  if (!metricPending && !enrichPending && !staleReview && !notifyCandidate) {
    return {
      enabled: true,
      operationWindowHours: options.hours,
      detectHorizonHours: options.hours,
      cleanupHorizonHours: queue.sinceHours,
      cleanupWindowSource: cleanupWindow.source,
      steps: [
        {
          stepName: "no_action_queue_clear",
          status: "ready",
          reason: "metricPendingCount, enrichPendingCount, staleReviewCount, and notifyCandidateCount are all 0",
          commandCandidate: buildDetectWriteRehearsalCommand(options),
          humanApprovalRequired: true,
          expectedSideEffects: [
            "external GeckoTerminal fetch on approved write rehearsal",
            "production DB Token create/reuse on approved write rehearsal",
            "checkpoint file write outside repo when command is approved",
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
          blockedBy: [],
          stopConditionCodes: [],
        },
      ],
      recommendedFirstStep: "no_action_queue_clear",
      workflowComplete: true,
    };
  }

  const steps: PostRunWorkflowStep[] = [];

  steps.push({
    stepName: "metric_pending_snapshot",
    status: metricPending ? "ready" : "not_needed",
    reason: metricPending ? "metricPendingCount > 0" : "metricPendingCount = 0",
    commandCandidate: metricPending ? buildPostRunMetricPendingCommand(cleanupOptions) : null,
    humanApprovalRequired: metricPending,
    expectedSideEffects: metricPending ? metricEffects.expectedSideEffects : [],
    expectedNonEffects: metricPending ? metricEffects.expectedNonEffects : noWriteNonEffects(),
    blockedBy: [],
    stopConditionCodes: [],
  });

  steps.push({
    stepName: "enrich_pending_rescore",
    status: metricPending ? "pending_previous_step" : enrichPending ? "ready" : "not_needed",
    reason: metricPending
      ? "metricPendingCount > 0; complete Metric pending snapshot first"
      : enrichPending
        ? "metricPendingCount = 0 and enrichPendingCount > 0"
        : "enrichPendingCount = 0",
    commandCandidate: !metricPending && enrichPending
      ? buildPostRunEnrichPendingCommand(cleanupOptions)
      : null,
    humanApprovalRequired: !metricPending && enrichPending,
    expectedSideEffects: !metricPending && enrichPending ? enrichEffects.expectedSideEffects : [],
    expectedNonEffects: !metricPending && enrichPending ? enrichEffects.expectedNonEffects : noWriteNonEffects(),
    blockedBy: metricPending ? ["metric_pending_snapshot_not_complete"] : [],
    stopConditionCodes: [],
  });

  const earlierWritePending = metricPending || enrichPending;
  steps.push({
    stepName: "report_review",
    status: earlierWritePending ? "pending_previous_step" : staleReview ? "ready" : "not_needed",
    reason: earlierWritePending
      ? "complete Metric/enrich pending steps before report review"
      : staleReview
        ? "staleReviewCount > 0"
        : "staleReviewCount = 0",
    commandCandidate: !earlierWritePending && staleReview ? buildReportReviewCommand(options) : null,
    humanApprovalRequired: false,
    expectedSideEffects: [],
    expectedNonEffects: noWriteNonEffects(),
    blockedBy: earlierWritePending ? ["prior_workflow_steps_not_complete"] : [],
    stopConditionCodes: [],
  });

  const beforeNotificationPending = metricPending || enrichPending || staleReview;
  steps.push({
    stepName: "notification_plan_review",
    status: beforeNotificationPending ? "pending_previous_step" : notifyCandidate ? "ready" : "not_needed",
    reason: beforeNotificationPending
      ? "complete Metric/enrich/report steps before notification planner review"
      : notifyCandidate
        ? "notifyCandidateCount > 0; planner review only"
        : "notifyCandidateCount = 0",
    commandCandidate: !beforeNotificationPending && notifyCandidate ? buildNotificationPlanCommand() : null,
    humanApprovalRequired: false,
    expectedSideEffects: [],
    expectedNonEffects: noWriteNonEffects(),
    blockedBy: beforeNotificationPending ? ["prior_workflow_steps_not_complete"] : [],
    stopConditionCodes: [],
  });

  steps.push({
    stepName: "optional_auto_send_plan_review",
    status: notifyCandidate ? "blocked" : "not_needed",
    reason: notifyCandidate
      ? "auto-send execution remains locked; run enabled planner only and require separate approval for any send"
      : "notifyCandidateCount = 0",
    commandCandidate: notifyCandidate ? buildOptionalAutoSendPlanCommand() : null,
    humanApprovalRequired: false,
    expectedSideEffects: [],
    expectedNonEffects: noWriteNonEffects(),
    blockedBy: notifyCandidate ? ["auto_send_execution_requires_separate_approval"] : [],
    stopConditionCodes: [],
  });

  const firstReady = steps.find((step) => step.status === "ready");

  return {
    enabled: true,
    operationWindowHours: options.hours,
    detectHorizonHours: options.hours,
    cleanupHorizonHours: queue.sinceHours,
    cleanupWindowSource: cleanupWindow.source,
    steps,
    recommendedFirstStep: firstReady?.stepName ?? "no_action_queue_clear",
    workflowComplete: false,
  };
}

export function buildBoundedOperationPlan(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationPlannerOptions,
): BoundedOperationPlan {
  const queueStateAvailable = input.queueStateAvailable ?? true;
  const cleanupWindow = resolveCleanupWindow(input.queueState);
  const queue = cleanupWindow.queue;
  const cleanupOptions = {
    ...options,
    sinceHours: queue.sinceHours,
  };
  const stop = getStopBlockers(input.notificationState, queueStateAvailable);
  const hasStopBlocker = stop.blockedBy.length > 0;
  const operationReadiness = buildOperationReadiness({
    queue,
    notificationState: input.notificationState,
    hasStopBlocker,
  });

  let nextRecommendedStep: NextRecommendedStep;
  let redCommandCandidate: string | null = null;
  let humanApprovalRequired = false;
  let expectedSideEffects: string[] = [];
  let expectedNonEffects = noWriteNonEffects();

  if (stop.nextRecommendedStep) {
    nextRecommendedStep = stop.nextRecommendedStep;
  } else if (queue.metricPendingCount > 0) {
    nextRecommendedStep = "metric_pending_snapshot";
    redCommandCandidate = buildMetricPendingCommand(cleanupOptions);
    humanApprovalRequired = true;
    expectedSideEffects = [
      "external GeckoTerminal fetch on approved Red execution",
      `production DB Metric write max ${options.limit} on approved Red execution`,
    ];
    expectedNonEffects = [
      "Token write 0",
      "Notification create/update 0",
      "HolderSnapshot write 0",
      "Telegram send 0",
      "scheduler/systemd 0",
      "rawJson full dump 0",
      "offensive raw text dump 0",
    ];
  } else if (queue.enrichPendingCount > 0) {
    nextRecommendedStep = "enrich_pending_rescore";
    redCommandCandidate = buildEnrichPendingCommand(cleanupOptions);
    humanApprovalRequired = true;
    expectedSideEffects = [
      "external GeckoTerminal token snapshot fetch on approved Red execution",
      `production DB Token update max ${options.limit} on approved Red execution`,
    ];
    expectedNonEffects = [
      "Metric write 0",
      "Notification create/update 0",
      "HolderSnapshot write 0",
      "Telegram send 0 because --notify is omitted",
      "scheduler/systemd 0",
      "rawJson full dump 0",
      "offensive raw text dump 0",
    ];
  } else if (queue.staleReviewCount > 0) {
    nextRecommendedStep = "report_review";
  } else if (queue.notifyCandidateCount > 0) {
    nextRecommendedStep = "notification_manual_review";
  } else {
    nextRecommendedStep = "detect_watch_dry_run";
    redCommandCandidate = buildDetectDryRunCommand(options);
    humanApprovalRequired = false;
    expectedSideEffects = [
      "external GeckoTerminal new_pools fetch on operator-run dry-run command",
    ];
    expectedNonEffects = [
      "DB write 0",
      "Token write 0",
      "Metric write 0",
      "Notification create/update 0",
      "HolderSnapshot write 0",
      "Telegram send 0",
      "scheduler/systemd 0",
      "rawJson full dump 0",
      "offensive raw text dump 0",
    ];
  }

  const plan: BoundedOperationPlan = {
    readOnly: true,
    dryRun: true,
    mode: "bounded_operation_planner",
    hours: options.hours,
    sinceHours: options.sinceHours,
    detectHorizonHours: options.hours,
    requestedQueueHorizonHours: input.queueState.requestedWindow.sinceHours,
    cleanupHorizonHours: queue.sinceHours,
    cleanupWindowSource: cleanupWindow.source,
    cleanupWindow: queue,
    limit: options.limit,
    pumpOnly: options.pumpOnly,
    dbState: input.dbState,
    queueState: input.queueState,
    notificationState: input.notificationState,
    operationReadiness,
    nextRecommendedStep,
    redCommandCandidate,
    humanApprovalRequired,
    expectedSideEffects,
    expectedNonEffects,
    blockedBy: stop.blockedBy,
    stopConditionCodes: stop.stopConditionCodes,
  };

  if (options.postRunPlan) {
    plan.postRunPlan = buildPostRunWorkflowPlan(input, options, stop);
  }

  return plan;
}

function readOptionalDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
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

function hasFilledNameSymbol(token: Pick<SelectedToken, "name" | "symbol">): boolean {
  return Boolean(token.name?.trim()) && Boolean(token.symbol?.trim());
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function buildSelectedToken(token: {
  mint: string;
  source: string | null;
  metadataStatus: string;
  scoreRank: string;
  hardRejected: boolean;
  name: string | null;
  symbol: string | null;
  createdAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  entrySnapshot: unknown;
  _count: {
    metrics: number;
  };
}): SelectedToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDate(firstSeen?.detectedAt);

  return {
    mint: token.mint,
    source: token.source,
    metadataStatus: token.metadataStatus,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    name: token.name,
    symbol: token.symbol,
    createdAt: token.createdAt,
    enrichedAt: token.enrichedAt,
    rescoredAt: token.rescoredAt,
    selectionAnchorAt: detectedAt ?? token.createdAt,
    metricsCount: token._count.metrics,
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
  };
}

function isEnrichPending(token: SelectedToken): boolean {
  return token.metadataStatus === "mint_only" || !hasFilledNameSymbol(token);
}

function isRescorePending(token: SelectedToken): boolean {
  if (isEnrichPending(token) || token.enrichedAt === null) {
    return false;
  }

  if (token.rescoredAt === null) {
    return true;
  }

  return token.rescoredAt.getTime() < token.enrichedAt.getTime();
}

function isPending(token: SelectedToken): boolean {
  return isEnrichPending(token) || isRescorePending(token) || token.metricsCount === 0;
}

async function readQueueSummary(
  client: PlannerClient,
  input: {
    sinceHours: number;
    pumpOnly: boolean;
  },
): Promise<QueueSummary> {
  const sinceCutoff = new Date(Date.now() - input.sinceHours * 60 * 60 * 1_000);
  const staleAfterHours = Math.max(1, Math.min(DEFAULT_STALE_AFTER_HOURS, input.sinceHours));

  const rawTokens = await client.token.findMany({
    where: {
      createdAt: {
        gte: sinceCutoff,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      mint: true,
      source: true,
      name: true,
      symbol: true,
      metadataStatus: true,
      scoreRank: true,
      hardRejected: true,
      createdAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  const tokens = rawTokens
    .map(buildSelectedToken)
    .filter((token) => token.isGeckoterminalOrigin)
    .filter((token) => token.selectionAnchorAt.getTime() >= sinceCutoff.getTime())
    .filter((token) => !input.pumpOnly || isPumpMint(token.mint));

  const nowMs = Date.now();
  const staleAfterMs = staleAfterHours * 60 * 60 * 1_000;

  return {
    sinceHours: input.sinceHours,
    geckoOriginTokenCount: tokens.length,
    metricPendingCount: tokens.filter((token) => token.metricsCount === 0).length,
    enrichPendingCount: tokens.filter(isEnrichPending).length,
    staleReviewCount: tokens.filter(
      (token) => isPending(token) && nowMs - token.selectionAnchorAt.getTime() >= staleAfterMs,
    ).length,
    notifyCandidateCount: tokens.filter(
      (token) => token.scoreRank === "S" && !token.hardRejected,
    ).length,
  };
}

async function readMetricBucketCounts(
  client: PlannerClient,
  tokenCount: number,
): Promise<{
  metricZeroTokenCount: number;
  metricOneTokenCount: number;
  metricTwoPlusTokenCount: number;
}> {
  const metricGroups = await client.metric.groupBy({
    by: ["tokenId"],
    _count: {
      _all: true,
    },
  });

  const metricOneTokenCount = metricGroups.filter((group) => group._count._all === 1).length;
  const metricTwoPlusTokenCount = metricGroups.filter((group) => group._count._all >= 2).length;

  return {
    metricZeroTokenCount: tokenCount - metricGroups.length,
    metricOneTokenCount,
    metricTwoPlusTokenCount,
  };
}

async function readNotificationStatusCounts(
  client: PlannerClient,
): Promise<DbState["notificationStatusCounts"]> {
  const groups = await client.notification.groupBy({
    by: ["status"],
    _count: {
      _all: true,
    },
  });

  const countFor = (status: string): number =>
    groups.find((group) => group.status === status)?._count._all ?? 0;

  return {
    captured: countFor("captured"),
    sent: countFor("sent"),
    failed: countFor("failed"),
  };
}

export async function readBoundedOperationPlannerInput(
  client: PlannerClient,
  options: BoundedOperationPlannerOptions,
): Promise<BoundedOperationPlannerInput> {
  const [tokenCount, metricCount, notificationCount, holderSnapshotCount] =
    await Promise.all([
      client.token.count(),
      client.metric.count(),
      client.notification.count(),
      client.holderSnapshot.count(),
    ]);

  const [
    metricBuckets,
    notificationStatusCounts,
    defaultWindow,
    requestedWindow,
    rolling168h,
    autoSendPlan,
    retryPlan,
  ] = await Promise.all([
    readMetricBucketCounts(client, tokenCount),
    readNotificationStatusCounts(client),
    readQueueSummary(client, {
      sinceHours: DEFAULT_REVIEW_QUEUE_HOURS,
      pumpOnly: options.pumpOnly,
    }),
    readQueueSummary(client, {
      sinceHours: options.sinceHours,
      pumpOnly: options.pumpOnly,
    }),
    readQueueSummary(client, {
      sinceHours: 168,
      pumpOnly: options.pumpOnly,
    }),
    buildNotificationAutoSendPlan(client, {
      env: {
        ...process.env,
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    }),
    buildNotificationRetryPlan(client),
  ]);

  return {
    dbState: {
      tokenCount,
      metricCount,
      notificationCount,
      holderSnapshotCount,
      ...metricBuckets,
      notificationStatusCounts,
    },
    queueState: {
      defaultWindow,
      requestedWindow,
      rolling168h,
    },
    notificationState: {
      failedCount: notificationStatusCounts.failed,
      retryCandidateCount: retryPlan.candidateCount,
      allowedAutoSendCandidateCount: autoSendPlan.allowedCandidateCount,
    },
    queueStateAvailable: true,
  };
}
