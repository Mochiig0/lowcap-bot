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
type NotificationRetryClient = Pick<PrismaClient, "$transaction" | "notification">;
type NotificationTransactionClient = Pick<Prisma.TransactionClient, "notification">;

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
  nextRetryAt?: Date | null;
};

export type MaybeCreateNotificationResult = {
  notification: Notification;
  created: boolean;
};

export type FindNotificationRetryCandidateInput = {
  now?: Date;
  maxRetryCount?: number;
};

export type ClaimNotificationRetryCandidateInput =
  FindNotificationRetryCandidateInput & {
    workerId: string;
    leaseMs?: number;
  };

export type ClaimNotificationRetryCandidateResult = {
  notification: Notification | null;
  claimed: boolean;
};

const DEFAULT_MAX_RETRY_COUNT = 3;
const DEFAULT_RETRY_LEASE_MS = 5 * 60 * 1000;

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

function getRetryPolicy(input: FindNotificationRetryCandidateInput = {}): {
  now: Date;
  maxRetryCount: number;
} {
  const maxRetryCount = input.maxRetryCount ?? DEFAULT_MAX_RETRY_COUNT;
  if (!Number.isInteger(maxRetryCount) || maxRetryCount < 1) {
    throw new Error("maxRetryCount must be a positive integer");
  }

  return {
    now: input.now ?? new Date(),
    maxRetryCount,
  };
}

function buildRetryCandidateWhere(input: FindNotificationRetryCandidateInput = {}): Prisma.NotificationWhereInput {
  const { now, maxRetryCount } = getRetryPolicy(input);

  return {
    eventType: "metric_appended",
    trigger: "metric_appended",
    status: "failed",
    mode: "live_send",
    rawJsonFree: true,
    secretFree: true,
    notificationKey: {
      not: "",
    },
    mint: {
      not: "",
    },
    metricId: {
      not: null,
    },
    retryCount: {
      lt: maxRetryCount,
    },
    OR: [
      {
        nextRetryAt: null,
      },
      {
        nextRetryAt: {
          lte: now,
        },
      },
    ],
    AND: [
      {
        OR: [
          {
            leaseUntil: null,
          },
          {
            leaseUntil: {
              lte: now,
            },
          },
        ],
      },
      ...buildSmokeOrRehearsalExclusionWhere(),
    ],
  };
}

function buildSmokeOrRehearsalExclusionWhere(): Prisma.NotificationWhereInput[] {
  return [
    {
      NOT: [
        ...buildMarkerStringExclusions("notificationKey"),
        ...buildMarkerStringExclusions("mint"),
      ],
    },
  ];
}

function buildMarkerStringExclusions(
  field: "notificationKey" | "mint",
): Prisma.NotificationWhereInput[] {
  return [
    {
      [field]: {
        startsWith: "SMOKE_",
      },
    },
    {
      [field]: {
        startsWith: "SMOKE:",
      },
    },
    {
      [field]: {
        startsWith: "REHEARSAL_",
      },
    },
    {
      [field]: {
        startsWith: "REHEARSAL:",
      },
    },
    {
      [field]: {
        contains: "_rehearsal_",
      },
    },
    {
      [field]: {
        contains: "_REHEARSAL_",
      },
    },
  ];
}

const RETRY_CANDIDATE_ORDER: Prisma.NotificationOrderByWithRelationInput[] = [
  {
    failedAt: "asc",
  },
  {
    updatedAt: "asc",
  },
  {
    id: "asc",
  },
];

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

export async function findNextNotificationRetryCandidate(
  client: NotificationClient,
  input: FindNotificationRetryCandidateInput = {},
): Promise<Notification | null> {
  return client.notification.findFirst({
    where: buildRetryCandidateWhere(input),
    orderBy: RETRY_CANDIDATE_ORDER,
  });
}

export async function countNotificationRetryCandidates(
  client: NotificationClient,
  input: FindNotificationRetryCandidateInput = {},
): Promise<number> {
  return client.notification.count({
    where: buildRetryCandidateWhere(input),
  });
}

export async function claimNextNotificationRetryCandidate(
  client: NotificationRetryClient,
  input: ClaimNotificationRetryCandidateInput,
): Promise<ClaimNotificationRetryCandidateResult> {
  assertNoForbiddenInputKeys(input);

  const workerId = input.workerId.trim();
  if (workerId.length === 0) {
    throw new Error("workerId is required");
  }

  const leaseMs = input.leaseMs ?? DEFAULT_RETRY_LEASE_MS;
  if (!Number.isInteger(leaseMs) || leaseMs < 1) {
    throw new Error("leaseMs must be a positive integer");
  }

  const { now, maxRetryCount } = getRetryPolicy(input);
  const leaseUntil = new Date(now.getTime() + leaseMs);

  return client.$transaction(async (tx: NotificationTransactionClient) => {
    const candidate = await findNextNotificationRetryCandidate(tx, {
      now,
      maxRetryCount,
    });

    if (!candidate) {
      return {
        notification: null,
        claimed: false,
      };
    }

    const updateResult = await tx.notification.updateMany({
      where: {
        id: candidate.id,
        ...buildRetryCandidateWhere({
          now,
          maxRetryCount,
        }),
      },
      data: {
        retryCount: {
          increment: 1,
        },
        lastAttemptAt: now,
        leaseUntil,
        workerId,
      },
    });

    if (updateResult.count !== 1) {
      return {
        notification: null,
        claimed: false,
      };
    }

    return {
      notification: await tx.notification.findUnique({
        where: {
          id: candidate.id,
        },
      }),
      claimed: true,
    };
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
  const sentAt = input.sentAt ?? new Date();

  return client.notification.update({
    where: {
      notificationKey,
    },
    data: {
      status: "sent",
      mode: "live_send",
      sentAt,
      failedAt: null,
      errorCode: null,
      reason: null,
      nextRetryAt: null,
      leaseUntil: null,
      workerId: null,
      lastAttemptAt: sentAt,
    },
  });
}

export async function markNotificationFailed(
  client: NotificationClient,
  notificationKey: string,
  input: MarkNotificationFailedInput = {},
): Promise<Notification> {
  assertNoForbiddenInputKeys(input);
  const failedAt = input.failedAt ?? new Date();

  return client.notification.update({
    where: {
      notificationKey,
    },
    data: {
      status: "failed",
      mode: "live_send",
      failedAt,
      errorCode: input.errorCode ?? null,
      reason: input.reason ?? null,
      nextRetryAt: input.nextRetryAt === undefined ? undefined : input.nextRetryAt,
      leaseUntil: null,
      workerId: null,
      lastAttemptAt: failedAt,
    },
  });
}
