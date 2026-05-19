import type { PrismaClient } from "@prisma/client";

import {
  findNotificationByKey,
  markNotificationFailed,
  markNotificationSent,
} from "./notificationRepository.js";
import {
  isSmokeOrRehearsalNotification,
  SMOKE_OR_REHEARSAL_NOTIFICATION_BLOCK_REASON,
} from "./rehearsalNotificationGuard.js";
import type { OpsNotificationTrigger } from "../notify/opsNotificationPreview.js";
import type { OpsNotificationSender } from "../notify/opsNotificationSendGate.js";

type NotificationClient = Pick<PrismaClient, "notification">;

export type NotificationLiveSendTrigger = Extract<OpsNotificationTrigger, "metric_appended">;

export type NotificationLiveSendResult = {
  notificationKey: string;
  trigger: OpsNotificationTrigger;
  status: "ready" | "sent" | "failed" | "blocked";
  blockedBy: string[];
  sentCount: 0 | 1;
  updatedCount: 0 | 1;
  senderCalled: boolean;
  notificationId: number | null;
  mint: string | null;
  metricId: number | null;
  errorCode: string | null;
  notificationStatus?: string | null;
  sentAtPresent?: boolean | null;
};

export type SendNotificationByKeyInput = {
  client: NotificationClient;
  notificationKey: string;
  trigger: OpsNotificationTrigger;
  live: boolean;
  retryFailed?: boolean;
  sender?: OpsNotificationSender;
};

const SAFE_ERROR_CODES = new Set([
  "ops_notify_sender_failed",
  "ops_notify_sender_threw",
  "telegram_credentials_missing",
  "telegram_response_not_ok",
  "telegram_timeout",
  "telegram_network_error",
]);

const FAILED_REASON = "ops_notify_send_failed";

function blocked(input: {
  notificationKey: string;
  trigger: OpsNotificationTrigger;
  blockedBy: string[];
  notificationId?: number | null;
  mint?: string | null;
  metricId?: number | null;
  notificationStatus?: string | null;
  sentAtPresent?: boolean | null;
}): NotificationLiveSendResult {
  return {
    notificationKey: input.notificationKey,
    trigger: input.trigger,
    status: "blocked",
    blockedBy: input.blockedBy,
    sentCount: 0,
    updatedCount: 0,
    senderCalled: false,
    notificationId: input.notificationId ?? null,
    mint: input.mint ?? null,
    metricId: input.metricId ?? null,
    errorCode: null,
    notificationStatus: input.notificationStatus ?? null,
    sentAtPresent: input.sentAtPresent ?? null,
  };
}

function normalizeSafeErrorCode(errorCode: string | null | undefined): string {
  if (errorCode && SAFE_ERROR_CODES.has(errorCode)) {
    return errorCode;
  }

  return "ops_notify_sender_failed";
}

export async function sendNotificationByKey(
  input: SendNotificationByKeyInput,
): Promise<NotificationLiveSendResult> {
  const retryFailed = input.retryFailed ?? false;

  if (input.trigger !== "metric_appended") {
    return blocked({
      notificationKey: input.notificationKey,
      trigger: input.trigger,
      blockedBy: ["notification_trigger_not_supported"],
    });
  }

  const notification = await findNotificationByKey(input.client, input.notificationKey);
  if (!notification) {
    return blocked({
      notificationKey: input.notificationKey,
      trigger: input.trigger,
      blockedBy: ["notification_record_missing"],
    });
  }

  const base = {
    notificationKey: notification.notificationKey,
    trigger: input.trigger,
    notificationId: notification.id,
    mint: notification.mint,
    metricId: notification.metricId,
    notificationStatus: notification.status,
    sentAtPresent: notification.sentAt !== null,
  };

  if (
    notification.eventType !== "metric_appended" ||
    notification.trigger !== "metric_appended"
  ) {
    return blocked({
      ...base,
      blockedBy: ["notification_event_type_not_supported"],
    });
  }

  const missingIdentity = [
    ...(notification.mint.trim().length === 0 ? ["mint_missing"] : []),
    ...(notification.metricId === null ? ["metric_id_missing"] : []),
  ];
  if (missingIdentity.length > 0 || notification.metricId === null) {
    return blocked({
      ...base,
      blockedBy: missingIdentity,
    });
  }

  if (notification.status === "sent" || notification.sentAt !== null) {
    return blocked({
      ...base,
      blockedBy: ["notification_already_sent"],
    });
  }

  if (
    isSmokeOrRehearsalNotification({
      notificationKey: notification.notificationKey,
      mint: notification.mint,
    })
  ) {
    return blocked({
      ...base,
      blockedBy: [SMOKE_OR_REHEARSAL_NOTIFICATION_BLOCK_REASON],
    });
  }

  if (retryFailed) {
    if (notification.status !== "failed" || notification.mode !== "live_send") {
      return blocked({
        ...base,
        blockedBy: ["notification_retry_not_failed"],
      });
    }
  } else if (notification.status !== "captured" || notification.mode !== "capture_only") {
    return blocked({
      ...base,
      blockedBy: ["notification_not_captured"],
    });
  }

  if (!input.live) {
    return {
      notificationKey: notification.notificationKey,
      trigger: input.trigger,
      status: "ready",
      blockedBy: [],
      sentCount: 0,
      updatedCount: 0,
      senderCalled: false,
      notificationId: notification.id,
      mint: notification.mint,
      metricId: notification.metricId,
      errorCode: null,
    };
  }

  if (!input.sender) {
    return blocked({
      ...base,
      blockedBy: ["ops_notify_sender_not_connected"],
    });
  }

  try {
    const sendResult = await input.sender({
      trigger: "metric_appended",
      mint: notification.mint,
      metricId: notification.metricId,
      message: notification.messagePreview,
    });

    if (sendResult.status === "sent") {
      await markNotificationSent(input.client, notification.notificationKey);
      return {
        notificationKey: notification.notificationKey,
        trigger: input.trigger,
        status: "sent",
        blockedBy: [],
        sentCount: 1,
        updatedCount: 1,
        senderCalled: true,
        notificationId: notification.id,
        mint: notification.mint,
        metricId: notification.metricId,
        errorCode: null,
      };
    }

    const errorCode = normalizeSafeErrorCode(sendResult.errorCode);
    await markNotificationFailed(input.client, notification.notificationKey, {
      errorCode,
      reason: FAILED_REASON,
    });

    return {
      notificationKey: notification.notificationKey,
      trigger: input.trigger,
      status: "failed",
      blockedBy: [],
      sentCount: 0,
      updatedCount: 1,
      senderCalled: true,
      notificationId: notification.id,
      mint: notification.mint,
      metricId: notification.metricId,
      errorCode,
    };
  } catch {
    const errorCode = "ops_notify_sender_threw";
    await markNotificationFailed(input.client, notification.notificationKey, {
      errorCode,
      reason: FAILED_REASON,
    });

    return {
      notificationKey: notification.notificationKey,
      trigger: input.trigger,
      status: "failed",
      blockedBy: [],
      sentCount: 0,
      updatedCount: 1,
      senderCalled: true,
      notificationId: notification.id,
      mint: notification.mint,
      metricId: notification.metricId,
      errorCode,
    };
  }
}
