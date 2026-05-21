import type { PrismaClient } from "@prisma/client";

import {
  buildNotificationAutoSendPlan,
  type NotificationAutoSendPlanResult,
} from "./notificationAutoSendPlanner.js";
import { sendNotificationByKey } from "./notificationLiveSend.js";
import type { OpsNotificationSender } from "../notify/opsNotificationSendGate.js";

type NotificationClient = Pick<PrismaClient, "notification">;

type AutoSendExecutionStatus = "sent" | "failed" | "blocked" | "stopped";

type ExecutionSideEffectSpec = {
  externalFetchMax: 0;
  telegramSendMax: 0 | 1;
  notificationCreateMax: 0;
  notificationUpdateMax: 0 | 1;
  tokenWriteMax: 0;
  metricWriteMax: 0;
  holderSnapshotWriteMax: 0;
  scheduler: false;
  systemd: false;
};

type ActualSideEffects = {
  externalFetch: false;
  telegramSendAttempted: boolean;
  notificationCreateCount: 0;
  notificationUpdateCount: 0 | 1;
  tokenWrite: false;
  metricWrite: false;
  holderSnapshotWrite: false;
  retryExecution: false;
  scheduler: false;
  systemd: false;
  rawJsonFullDump: false;
};

type ExpectedNonEffects = {
  externalFetch: false;
  notificationCreate: false;
  tokenWrite: false;
  metricWrite: false;
  holderSnapshotWrite: false;
  retryExecution: false;
  scheduler: false;
  systemd: false;
  rawJsonFullDump: false;
};

export type NotificationAutoSendExecutionResult = {
  mode: "notification_auto_send_execute";
  executeRequested: boolean;
  readOnly: boolean;
  dryRun: boolean;
  autoSendEnabled: boolean;
  selectedNotificationId: number | null;
  selectedTrigger: "metric_appended" | null;
  selectedNotificationKeySummary: string | null;
  sendAttempted: boolean;
  senderCalled: boolean;
  sentCount: 0 | 1;
  updatedCount: 0 | 1;
  status: AutoSendExecutionStatus;
  blockedBy: string[];
  stopConditionCodes: string[];
  errorCode: string | null;
  retryAttempted: false;
  planner: Pick<
    NotificationAutoSendPlanResult,
    | "readOnly"
    | "dryRun"
    | "oneRunMax"
    | "totalCapturedCount"
    | "failedCount"
    | "candidateCount"
    | "allowedCandidateCount"
    | "blockedCandidateCount"
    | "blockedReasons"
  >;
  expectedSideEffects: ExecutionSideEffectSpec;
  actualSideEffects: ActualSideEffects;
  expectedNonEffects: ExpectedNonEffects;
};

type BuildNotificationAutoSendExecutionInput = {
  execute: boolean;
  env?: NodeJS.ProcessEnv;
  sender?: OpsNotificationSender;
};

const NO_SIDE_EFFECTS: ExecutionSideEffectSpec = {
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

const EXECUTE_SIDE_EFFECTS: ExecutionSideEffectSpec = {
  externalFetchMax: 0,
  telegramSendMax: 1,
  notificationCreateMax: 0,
  notificationUpdateMax: 1,
  tokenWriteMax: 0,
  metricWriteMax: 0,
  holderSnapshotWriteMax: 0,
  scheduler: false,
  systemd: false,
};

const EXPECTED_NON_EFFECTS: ExpectedNonEffects = {
  externalFetch: false,
  notificationCreate: false,
  tokenWrite: false,
  metricWrite: false,
  holderSnapshotWrite: false,
  retryExecution: false,
  scheduler: false,
  systemd: false,
  rawJsonFullDump: false,
};

function getPlannerSummary(
  plan: NotificationAutoSendPlanResult,
): NotificationAutoSendExecutionResult["planner"] {
  return {
    readOnly: plan.readOnly,
    dryRun: plan.dryRun,
    oneRunMax: plan.oneRunMax,
    totalCapturedCount: plan.totalCapturedCount,
    failedCount: plan.failedCount,
    candidateCount: plan.candidateCount,
    allowedCandidateCount: plan.allowedCandidateCount,
    blockedCandidateCount: plan.blockedCandidateCount,
    blockedReasons: plan.blockedReasons,
  };
}

function stoppedResult(input: {
  executeRequested: boolean;
  plan: NotificationAutoSendPlanResult;
  blockedBy?: string[];
  stopConditionCodes?: string[];
}): NotificationAutoSendExecutionResult {
  return {
    mode: "notification_auto_send_execute",
    executeRequested: input.executeRequested,
    readOnly: true,
    dryRun: !input.executeRequested,
    autoSendEnabled: input.plan.autoSendEnabled,
    selectedNotificationId: input.plan.selectedNotificationId,
    selectedTrigger: input.plan.selectedTrigger,
    selectedNotificationKeySummary: input.plan.selectedNotificationKeySummary,
    sendAttempted: false,
    senderCalled: false,
    sentCount: 0,
    updatedCount: 0,
    status: "stopped",
    blockedBy: input.blockedBy ?? [],
    stopConditionCodes: input.stopConditionCodes ?? input.plan.stopConditionCodes,
    errorCode: null,
    retryAttempted: false,
    planner: getPlannerSummary(input.plan),
    expectedSideEffects: NO_SIDE_EFFECTS,
    actualSideEffects: {
      externalFetch: false,
      telegramSendAttempted: false,
      notificationCreateCount: 0,
      notificationUpdateCount: 0,
      tokenWrite: false,
      metricWrite: false,
      holderSnapshotWrite: false,
      retryExecution: false,
      scheduler: false,
      systemd: false,
      rawJsonFullDump: false,
    },
    expectedNonEffects: EXPECTED_NON_EFFECTS,
  };
}

function hasExecutionGatePassed(plan: NotificationAutoSendPlanResult): boolean {
  return (
    plan.autoSendEnabled &&
    plan.allowedCandidateCount === 1 &&
    plan.selectedNotificationId !== null &&
    plan.stopConditionCodes.length === 0
  );
}

export async function buildNotificationAutoSendExecution(
  client: NotificationClient,
  input: BuildNotificationAutoSendExecutionInput,
): Promise<NotificationAutoSendExecutionResult> {
  const plan = await buildNotificationAutoSendPlan(client, {
    env: input.env,
  });

  if (!input.execute) {
    return stoppedResult({
      executeRequested: false,
      plan,
      blockedBy: ["execute_flag_required"],
      stopConditionCodes:
        plan.stopConditionCodes.length > 0
          ? plan.stopConditionCodes
          : ["execute_flag_required"],
    });
  }

  if (!hasExecutionGatePassed(plan)) {
    return stoppedResult({
      executeRequested: true,
      plan,
    });
  }

  const selectedNotificationId = plan.selectedNotificationId;
  if (selectedNotificationId === null) {
    return stoppedResult({
      executeRequested: true,
      plan,
      blockedBy: ["selected_notification_missing"],
      stopConditionCodes: ["selected_notification_missing"],
    });
  }

  const selected = await client.notification.findUnique({
    where: {
      id: selectedNotificationId,
    },
  });

  if (!selected) {
    return stoppedResult({
      executeRequested: true,
      plan,
      blockedBy: ["selected_notification_missing"],
      stopConditionCodes: ["selected_notification_missing"],
    });
  }

  const sendResult = await sendNotificationByKey({
    client,
    notificationKey: selected.notificationKey,
    trigger: "metric_appended",
    live: true,
    sender: input.sender,
  });

  return {
    mode: "notification_auto_send_execute",
    executeRequested: true,
    readOnly: sendResult.updatedCount === 0,
    dryRun: false,
    autoSendEnabled: plan.autoSendEnabled,
    selectedNotificationId: plan.selectedNotificationId,
    selectedTrigger: plan.selectedTrigger,
    selectedNotificationKeySummary: plan.selectedNotificationKeySummary,
    sendAttempted: sendResult.senderCalled,
    senderCalled: sendResult.senderCalled,
    sentCount: sendResult.sentCount,
    updatedCount: sendResult.updatedCount,
    status: sendResult.status === "ready" ? "stopped" : sendResult.status,
    blockedBy: sendResult.blockedBy,
    stopConditionCodes: [],
    errorCode: sendResult.errorCode,
    retryAttempted: false,
    planner: getPlannerSummary(plan),
    expectedSideEffects: EXECUTE_SIDE_EFFECTS,
    actualSideEffects: {
      externalFetch: false,
      telegramSendAttempted: sendResult.senderCalled,
      notificationCreateCount: 0,
      notificationUpdateCount: sendResult.updatedCount,
      tokenWrite: false,
      metricWrite: false,
      holderSnapshotWrite: false,
      retryExecution: false,
      scheduler: false,
      systemd: false,
      rawJsonFullDump: false,
    },
    expectedNonEffects: EXPECTED_NON_EFFECTS,
  };
}
