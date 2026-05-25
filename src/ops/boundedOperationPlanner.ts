import type { PrismaClient } from "@prisma/client";

import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import { buildNotificationAutoSendPlan } from "../notifications/notificationAutoSendPlanner.js";
import { buildNotificationRetryPlan } from "../cli/notificationRetryPlan.js";

const DEFAULT_REVIEW_QUEUE_HOURS = 24;
const DEFAULT_STALE_AFTER_HOURS = 6;
const DETECT_INTERVAL_SECONDS = 60;
const METRIC_MIN_GAP_MINUTES = 60;
const METRIC_INTER_ITEM_DELAY_MS = 15_000;

type JsonObject = Record<string, unknown>;

export type BoundedOperationPlannerOptions = {
  hours: number;
  sinceHours: number;
  limit: number;
  pumpOnly: boolean;
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
};

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

function buildEnrichPendingCommand(options: BoundedOperationPlannerOptions): string {
  const sinceMinutes = Math.max(1, Math.ceil(options.sinceHours * 60));

  return [
    "pnpm -s token:enrich-rescore:geckoterminal --",
    ...optionalPumpOnlyArg(options.pumpOnly),
    `--limit ${options.limit}`,
    `--sinceMinutes ${sinceMinutes}`,
    "--write",
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

export function buildBoundedOperationPlan(
  input: BoundedOperationPlannerInput,
  options: BoundedOperationPlannerOptions,
): BoundedOperationPlan {
  const queueStateAvailable = input.queueStateAvailable ?? true;
  const queue = input.queueState.requestedWindow;
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
    redCommandCandidate = buildMetricPendingCommand(options);
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
    redCommandCandidate = buildEnrichPendingCommand(options);
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

  return {
    readOnly: true,
    dryRun: true,
    mode: "bounded_operation_planner",
    hours: options.hours,
    sinceHours: options.sinceHours,
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
