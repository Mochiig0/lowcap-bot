import type { Notification, PrismaClient } from "@prisma/client";

import {
  isSmokeOrRehearsalNotification,
  SMOKE_OR_REHEARSAL_NOTIFICATION_BLOCK_REASON,
} from "./rehearsalNotificationGuard.js";

type NotificationClient = Pick<PrismaClient, "notification">;

export const NOTIFICATION_AUTO_SEND_ENABLED_ENV = "NOTIFICATION_AUTO_SEND_ENABLED";
export const NOTIFICATION_AUTO_SEND_ONE_RUN_MAX = 1;

type AutoSendPlanBlockReason =
  | "auto_send_disabled"
  | "failed_notifications_present"
  | "not_captured_status"
  | "not_capture_only_mode"
  | "already_sent"
  | "sent_at_present"
  | "failed_at_present"
  | "error_code_present"
  | "non_allowlisted_trigger"
  | "smoke_or_rehearsal_notification"
  | "non_production_notification_key"
  | "retry_candidate"
  | "safe_preview_unavailable";

type AutoSendPlanStopCondition =
  | "auto_send_disabled"
  | "failed_notifications_present"
  | "no_allowed_candidate"
  | "candidate_count_exceeds_one_run_max"
  | "only_smoke_or_rehearsal_candidates"
  | "only_sent_or_blocked_candidates";

type CandidateSummary = {
  notificationId: number;
  trigger: string;
  status: string;
  mode: string;
  notificationKeySummary: string;
  blockedBy: AutoSendPlanBlockReason[];
};

type SideEffectSpec = {
  externalFetchMax: 0;
  telegramSendMax: 0;
  notificationCreateMax: 0;
  notificationUpdateMax: 0;
  tokenWriteMax: 0;
  metricWriteMax: 0;
  holderSnapshotWriteMax: 0;
  scheduler: false;
  systemd: false;
};

type ExpectedNonEffects = {
  externalFetch: false;
  telegramSend: false;
  notificationCreate: false;
  notificationUpdate: false;
  tokenWrite: false;
  metricWrite: false;
  holderSnapshotWrite: false;
  retryExecution: false;
  scheduler: false;
  systemd: false;
  rawJsonFullDump: false;
};

export type NotificationAutoSendPlanResult = {
  mode: "read_only_auto_send_planner";
  readOnly: true;
  dryRun: true;
  autoSendEnabled: boolean;
  autoSendEnabledSource: typeof NOTIFICATION_AUTO_SEND_ENABLED_ENV;
  oneRunMax: typeof NOTIFICATION_AUTO_SEND_ONE_RUN_MAX;
  totalCapturedCount: number;
  failedCount: number;
  candidateCount: number;
  allowedCandidateCount: number;
  blockedCandidateCount: number;
  selectedNotificationId: number | null;
  selectedTrigger: "metric_appended" | null;
  selectedNotificationKeySummary: string | null;
  wouldSend: false;
  wouldUpdateNotification: false;
  stopConditionCodes: AutoSendPlanStopCondition[];
  blockedReasons: Partial<Record<AutoSendPlanBlockReason, number>>;
  candidates: CandidateSummary[];
  expectedSideEffects: SideEffectSpec;
  expectedNonEffects: ExpectedNonEffects;
};

type BuildNotificationAutoSendPlanInput = {
  env?: NodeJS.ProcessEnv;
};

const NO_SIDE_EFFECTS: SideEffectSpec = {
  externalFetchMax: 0,
  telegramSendMax: 0,
  notificationCreateMax: 0,
  notificationUpdateMax: 0,
  tokenWriteMax: 0,
  metricWriteMax: 0,
  holderSnapshotWriteMax: 0,
  scheduler: false,
  systemd: false,
};

const EXPECTED_NON_EFFECTS: ExpectedNonEffects = {
  externalFetch: false,
  telegramSend: false,
  notificationCreate: false,
  notificationUpdate: false,
  tokenWrite: false,
  metricWrite: false,
  holderSnapshotWrite: false,
  retryExecution: false,
  scheduler: false,
  systemd: false,
  rawJsonFullDump: false,
};

function isAutoSendEnabled(env: NodeJS.ProcessEnv): boolean {
  return env[NOTIFICATION_AUTO_SEND_ENABLED_ENV] === "true";
}

function isProductionMetricAppendedKey(notification: Notification): boolean {
  if (notification.metricId === null) {
    return false;
  }

  return (
    notification.notificationKey ===
    `${notification.mint}:metric_appended:${notification.metricId}`
  );
}

function summarizeNotificationKey(notification: Notification): string {
  if (notification.metricId === null) {
    return "missing_metric_id";
  }

  if (isSmokeOrRehearsalNotification(notification)) {
    return "smoke_or_rehearsal_notification";
  }

  if (isProductionMetricAppendedKey(notification)) {
    return `production_metric_appended:${notification.metricId}`;
  }

  return "non_production_notification_key";
}

function getCandidateBlockers(input: {
  notification: Notification;
  failedCount: number;
  autoSendEnabled: boolean;
}): AutoSendPlanBlockReason[] {
  const { notification } = input;
  const blockedBy: AutoSendPlanBlockReason[] = [];

  if (!input.autoSendEnabled) {
    blockedBy.push("auto_send_disabled");
  }
  if (input.failedCount > 0) {
    blockedBy.push("failed_notifications_present");
  }
  if (
    notification.eventType !== "metric_appended" ||
    notification.trigger !== "metric_appended"
  ) {
    blockedBy.push("non_allowlisted_trigger");
  }
  if (notification.status !== "captured") {
    blockedBy.push("not_captured_status");
  }
  if (notification.mode !== "capture_only") {
    blockedBy.push("not_capture_only_mode");
  }
  if (notification.status === "sent") {
    blockedBy.push("already_sent");
  }
  if (notification.sentAt !== null) {
    blockedBy.push("sent_at_present");
  }
  if (notification.failedAt !== null) {
    blockedBy.push("failed_at_present");
  }
  if (notification.errorCode !== null) {
    blockedBy.push("error_code_present");
  }
  if (isSmokeOrRehearsalNotification(notification)) {
    blockedBy.push(SMOKE_OR_REHEARSAL_NOTIFICATION_BLOCK_REASON);
  }
  if (!isProductionMetricAppendedKey(notification)) {
    blockedBy.push("non_production_notification_key");
  }
  if (notification.status === "failed" || notification.mode === "live_send") {
    blockedBy.push("retry_candidate");
  }
  if (
    notification.messagePreview.trim().length === 0 ||
    !notification.rawJsonFree ||
    !notification.secretFree
  ) {
    blockedBy.push("safe_preview_unavailable");
  }

  return blockedBy;
}

function countBlockedReasons(
  candidates: CandidateSummary[],
): Partial<Record<AutoSendPlanBlockReason, number>> {
  const counts: Partial<Record<AutoSendPlanBlockReason, number>> = {};
  for (const candidate of candidates) {
    for (const reason of candidate.blockedBy) {
      counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return counts;
}

function getStopConditionCodes(input: {
  autoSendEnabled: boolean;
  failedCount: number;
  candidates: CandidateSummary[];
  allowedCandidateCount: number;
}): AutoSendPlanStopCondition[] {
  const stopConditions: AutoSendPlanStopCondition[] = [];

  if (!input.autoSendEnabled) {
    stopConditions.push("auto_send_disabled");
  }
  if (input.failedCount > 0) {
    stopConditions.push("failed_notifications_present");
  }
  if (input.allowedCandidateCount === 0) {
    stopConditions.push("no_allowed_candidate");
  }
  if (input.allowedCandidateCount > NOTIFICATION_AUTO_SEND_ONE_RUN_MAX) {
    stopConditions.push("candidate_count_exceeds_one_run_max");
  }

  if (
    input.candidates.length > 0 &&
    input.candidates.every(
      (candidate) => candidate.blockedBy.includes("smoke_or_rehearsal_notification"),
    )
  ) {
    stopConditions.push("only_smoke_or_rehearsal_candidates");
  } else if (
    input.candidates.length > 0 &&
    input.allowedCandidateCount === 0 &&
    !stopConditions.includes("only_smoke_or_rehearsal_candidates")
  ) {
    stopConditions.push("only_sent_or_blocked_candidates");
  }

  return stopConditions;
}

export async function buildNotificationAutoSendPlan(
  client: NotificationClient,
  input: BuildNotificationAutoSendPlanInput = {},
): Promise<NotificationAutoSendPlanResult> {
  const env = input.env ?? process.env;
  const autoSendEnabled = isAutoSendEnabled(env);

  const [failedCount, totalCapturedCount, notifications] = await Promise.all([
    client.notification.count({
      where: {
        status: "failed",
      },
    }),
    client.notification.count({
      where: {
        status: "captured",
      },
    }),
    client.notification.findMany({
      where: {
        OR: [
          {
            status: "captured",
          },
          {
            status: "sent",
          },
          {
            status: "failed",
          },
        ],
      },
      orderBy: {
        id: "asc",
      },
    }),
  ]);

  const candidates = notifications.map((notification) => ({
    notificationId: notification.id,
    trigger: notification.trigger,
    status: notification.status,
    mode: notification.mode,
    notificationKeySummary: summarizeNotificationKey(notification),
    blockedBy: getCandidateBlockers({
      notification,
      failedCount,
      autoSendEnabled,
    }),
  }));
  const allowedCandidates = candidates.filter(
    (candidate) => candidate.blockedBy.length === 0,
  );
  const blockedReasons = countBlockedReasons(candidates);
  const selectedCandidate =
    allowedCandidates.length === 1 ? allowedCandidates[0] : null;

  return {
    mode: "read_only_auto_send_planner",
    readOnly: true,
    dryRun: true,
    autoSendEnabled,
    autoSendEnabledSource: NOTIFICATION_AUTO_SEND_ENABLED_ENV,
    oneRunMax: NOTIFICATION_AUTO_SEND_ONE_RUN_MAX,
    totalCapturedCount,
    failedCount,
    candidateCount: candidates.length,
    allowedCandidateCount: allowedCandidates.length,
    blockedCandidateCount: candidates.length - allowedCandidates.length,
    selectedNotificationId: selectedCandidate?.notificationId ?? null,
    selectedTrigger: selectedCandidate?.trigger === "metric_appended" ? "metric_appended" : null,
    selectedNotificationKeySummary:
      selectedCandidate?.notificationKeySummary ?? null,
    wouldSend: false,
    wouldUpdateNotification: false,
    stopConditionCodes: getStopConditionCodes({
      autoSendEnabled,
      failedCount,
      candidates,
      allowedCandidateCount: allowedCandidates.length,
    }),
    blockedReasons,
    candidates,
    expectedSideEffects: NO_SIDE_EFFECTS,
    expectedNonEffects: EXPECTED_NON_EFFECTS,
  };
}
