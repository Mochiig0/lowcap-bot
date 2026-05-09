import type { Notification, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

const FORBIDDEN_INPUT_KEYS = [
  "telegramResponseBody",
  "responseBody",
  "requestPath",
  "botToken",
  "chatId",
  "tokenUrl",
  "rawApiResponse",
  "rawPayload",
  "rawJson",
  "stdout",
  "stderr",
  "env",
  "databaseUrl",
  "DATABASE_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "processEnv",
] as const;

type NotificationClient = Pick<PrismaClient, "notification">;

type NotificationBaseInput = {
  notificationKey: string;
  eventType: string;
  mint: string;
  tokenId?: number | null;
  metricId?: number | null;
  trigger: string;
  messagePreview: string;
  source?: string | null;
};

export type CreateCapturedNotificationInput = NotificationBaseInput & {
  capturedAt?: Date;
};

export type MarkNotificationSentInput = {
  sentAt?: Date;
};

export type MarkNotificationFailedInput = {
  failedAt?: Date;
  errorCode?: string | null;
  reason?: string | null;
};

export type MaybeCreateNotificationResult = {
  notification: Notification;
  created: boolean;
};

function assertNoForbiddenInputKeys(input: object): void {
  const forbiddenKeys = FORBIDDEN_INPUT_KEYS.filter((key) =>
    Object.prototype.hasOwnProperty.call(input, key),
  );

  if (forbiddenKeys.length > 0) {
    throw new Error(`Forbidden notification input key: ${forbiddenKeys.join(", ")}`);
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function findNotificationByKey(
  client: NotificationClient,
  notificationKey: string,
): Promise<Notification | null> {
  return client.notification.findUnique({
    where: {
      notificationKey,
    },
  });
}

export async function createCapturedNotification(
  client: NotificationClient,
  input: CreateCapturedNotificationInput,
): Promise<Notification> {
  assertNoForbiddenInputKeys(input);

  return client.notification.create({
    data: {
      notificationKey: input.notificationKey,
      eventType: input.eventType,
      mint: input.mint,
      tokenId: input.tokenId ?? null,
      metricId: input.metricId ?? null,
      trigger: input.trigger,
      status: "captured",
      mode: "capture_only",
      messagePreview: input.messagePreview,
      capturedAt: input.capturedAt ?? new Date(),
      rawJsonFree: true,
      secretFree: true,
      source: input.source ?? null,
    },
  });
}

export async function maybeCreateByNotificationKey(
  client: NotificationClient,
  input: CreateCapturedNotificationInput,
): Promise<MaybeCreateNotificationResult> {
  assertNoForbiddenInputKeys(input);

  const existing = await findNotificationByKey(client, input.notificationKey);
  if (existing) {
    return {
      notification: existing,
      created: false,
    };
  }

  try {
    return {
      notification: await createCapturedNotification(client, input),
      created: true,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const racedExisting = await findNotificationByKey(client, input.notificationKey);
    if (!racedExisting) {
      throw error;
    }

    return {
      notification: racedExisting,
      created: false,
    };
  }
}

export async function markNotificationSent(
  client: NotificationClient,
  notificationKey: string,
  input: MarkNotificationSentInput = {},
): Promise<Notification> {
  assertNoForbiddenInputKeys(input);

  return client.notification.update({
    where: {
      notificationKey,
    },
    data: {
      status: "sent",
      mode: "live_send",
      sentAt: input.sentAt ?? new Date(),
      failedAt: null,
      errorCode: null,
      reason: null,
    },
  });
}

export async function markNotificationFailed(
  client: NotificationClient,
  notificationKey: string,
  input: MarkNotificationFailedInput = {},
): Promise<Notification> {
  assertNoForbiddenInputKeys(input);

  return client.notification.update({
    where: {
      notificationKey,
    },
    data: {
      status: "failed",
      mode: "live_send",
      failedAt: input.failedAt ?? new Date(),
      errorCode: input.errorCode ?? null,
      reason: input.reason ?? null,
    },
  });
}
