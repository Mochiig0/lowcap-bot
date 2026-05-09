import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  sendNotificationByKey,
  type NotificationLiveSendResult,
} from "../src/notifications/notificationLiveSend.ts";
import type { OpsNotificationSenderInput } from "../src/notify/opsNotificationSendGate.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-notification-live-send-"));
  const databaseUrl = `file:${join(dir, "notification-live-send.db")}`;

  await execFileAsync(
    "bash",
    ["-lc", "pnpm exec prisma db push --skip-generate"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await fn({ client });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

function keyFor(mint: string, metricId: number): string {
  return `${mint}:metric_appended:${metricId}`;
}

async function seedNotification(input: {
  client: PrismaClient;
  mint: string;
  metricId: number | null;
  eventType?: string;
  trigger?: string;
  status?: string;
  mode?: string;
  notificationKey?: string;
  errorCode?: string | null;
  reason?: string | null;
}): Promise<string> {
  const notificationKey =
    input.notificationKey ??
    `${input.mint}:${input.eventType ?? "metric_appended"}:${input.metricId ?? "none"}`;

  await input.client.notification.create({
    data: {
      notificationKey,
      eventType: input.eventType ?? "metric_appended",
      mint: input.mint,
      metricId: input.metricId,
      trigger: input.trigger ?? "metric_appended",
      status: input.status ?? "captured",
      mode: input.mode ?? "capture_only",
      messagePreview: [
        "[Lowcap Ops] Gecko metric appended",
        `mint: ${input.mint}`,
        `metricId: ${input.metricId ?? "none"}`,
        "source: geckoterminal.token_snapshot",
        "status: metric_appended",
      ].join("\n"),
      capturedAt: new Date("2026-05-09T00:00:00.000Z"),
      sentAt: input.status === "sent" ? new Date("2026-05-09T00:01:00.000Z") : null,
      failedAt: input.status === "failed" ? new Date("2026-05-09T00:01:00.000Z") : null,
      errorCode: input.errorCode ?? null,
      reason: input.reason ?? null,
      rawJsonFree: true,
      secretFree: true,
      source: "test",
    },
  });

  return notificationKey;
}

test("notification live send marks a captured metric_appended row sent", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendSuccess111111111111111111111111pump";
    const metricId = 1264;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "sent");
    assert.equal(result.sentCount, 1);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.senderCalled, true);
    assert.equal(senderCalls.length, 1);
    assert.equal(senderCalls[0]?.trigger, "metric_appended");
    assert.equal(senderCalls[0]?.mint, mint);
    assert.equal(senderCalls[0]?.metricId, metricId);
    assert.match(senderCalls[0]?.message ?? "", /Gecko metric appended/);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "sent");
    assert.equal(notification?.mode, "live_send");
    assert.ok(notification?.sentAt);
    assert.equal(notification?.failedAt, null);
  });
});

test("notification live send marks a captured metric_appended row failed safely", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendFailed1111111111111111111111111pump";
    const metricId = 1265;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return {
          status: "failed",
          errorCode: "telegram_response_not_ok",
        };
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.sentCount, 0);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.errorCode, "telegram_response_not_ok");
    assert.equal(senderCalls.length, 1);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "failed");
    assert.equal(notification?.mode, "live_send");
    assert.ok(notification?.failedAt);
    assert.equal(notification?.sentAt, null);
    assert.equal(notification?.errorCode, "telegram_response_not_ok");
    assert.equal(notification?.reason, "ops_notify_send_failed");

    const serialized = JSON.stringify(notification);
    assert.equal(serialized.includes("telegram response body"), false);
    assert.equal(serialized.includes("botToken"), false);
    assert.equal(serialized.includes("chatId"), false);
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.equal(serialized.includes("TELEGRAM_BOT_TOKEN"), false);
    assert.equal(serialized.includes("TELEGRAM_CHAT_ID"), false);
  });
});

test("notification live send blocks missing rows without creating notifications", async () => {
  await withTempDb(async ({ client }) => {
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey: "Missing111111111111111111111111111111111:metric_appended:1",
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_record_missing"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 0);
  });
});

test("notification live send blocks already sent rows", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendAlreadySent11111111111111111111pump";
    const metricId = 1266;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
      status: "sent",
      mode: "live_send",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_already_sent"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "sent");
  });
});

test("notification live send blocks non metric_appended rows", async () => {
  await withTempDb(async ({ client }) => {
    const notificationKey = await seedNotification({
      client,
      mint: "LiveSendTokenCompleted111111111111111111pump",
      metricId: null,
      eventType: "token_completed",
      trigger: "token_completed",
      notificationKey: "LiveSendTokenCompleted111111111111111111pump:token_completed",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_event_type_not_supported"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 1);
  });
});

test("notification live send blocks non-captured rows", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendNonCaptured111111111111111111111pump";
    const metricId = 1267;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
      status: "failed",
      mode: "live_send",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_not_captured"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 1);
  });
});

test("notification manual retry requires explicit retry flag for failed rows", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendRetryNeedsFlag1111111111111111pump";
    const metricId = 1270;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
      status: "failed",
      mode: "live_send",
      errorCode: "telegram_response_not_ok",
      reason: "ops_notify_send_failed",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_not_captured"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "failed");
    assert.equal(notification?.mode, "live_send");
    assert.equal(notification?.errorCode, "telegram_response_not_ok");
    assert.equal(notification?.reason, "ops_notify_send_failed");
  });
});

test("notification manual retry marks a failed metric_appended row sent and clears failure fields", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendRetrySuccess111111111111111111pump";
    const metricId = 1271;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
      status: "failed",
      mode: "live_send",
      errorCode: "telegram_response_not_ok",
      reason: "ops_notify_send_failed",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      retryFailed: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "sent");
    assert.equal(result.sentCount, 1);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.senderCalled, true);
    assert.equal(senderCalls.length, 1);
    assert.equal(senderCalls[0]?.trigger, "metric_appended");
    assert.equal(senderCalls[0]?.mint, mint);
    assert.equal(senderCalls[0]?.metricId, metricId);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "sent");
    assert.equal(notification?.mode, "live_send");
    assert.ok(notification?.sentAt);
    assert.equal(notification?.failedAt, null);
    assert.equal(notification?.errorCode, null);
    assert.equal(notification?.reason, null);
  });
});

test("notification manual retry marks a failed metric_appended row failed safely", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendRetryFailed111111111111111111pump";
    const metricId = 1272;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
      status: "failed",
      mode: "live_send",
      errorCode: "telegram_timeout",
      reason: "ops_notify_send_failed",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      retryFailed: true,
      sender: async (input) => {
        senderCalls.push(input);
        return {
          status: "failed",
          errorCode: "telegram_response_not_ok",
        };
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.sentCount, 0);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.errorCode, "telegram_response_not_ok");
    assert.equal(senderCalls.length, 1);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "failed");
    assert.equal(notification?.mode, "live_send");
    assert.ok(notification?.failedAt);
    assert.notEqual(notification?.failedAt?.toISOString(), "2026-05-09T00:01:00.000Z");
    assert.equal(notification?.sentAt, null);
    assert.equal(notification?.errorCode, "telegram_response_not_ok");
    assert.equal(notification?.reason, "ops_notify_send_failed");

    const serialized = JSON.stringify(notification);
    assert.equal(serialized.includes("telegram response body"), false);
    assert.equal(serialized.includes("botToken"), false);
    assert.equal(serialized.includes("chatId"), false);
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.equal(serialized.includes("TELEGRAM_BOT_TOKEN"), false);
    assert.equal(serialized.includes("TELEGRAM_CHAT_ID"), false);
  });
});

test("notification manual retry still blocks already sent rows", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendRetrySentBlocked11111111111111pump";
    const metricId = 1273;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
      status: "sent",
      mode: "live_send",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      retryFailed: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_already_sent"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 1);
  });
});

test("notification manual retry blocks non metric_appended rows", async () => {
  await withTempDb(async ({ client }) => {
    const notificationKey = await seedNotification({
      client,
      mint: "LiveSendRetryLoopComplete111111111111111pump",
      metricId: null,
      eventType: "loop_complete",
      trigger: "loop_complete",
      status: "failed",
      mode: "live_send",
      notificationKey: "LiveSendRetryLoopComplete111111111111111pump:loop_complete",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      retryFailed: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_event_type_not_supported"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 1);
  });
});

test("notification manual retry blocks missing rows without creating notifications", async () => {
  await withTempDb(async ({ client }) => {
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await sendNotificationByKey({
      client,
      notificationKey: "MissingRetry1111111111111111111111111111:metric_appended:1",
      trigger: "metric_appended",
      live: true,
      retryFailed: true,
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "blocked");
    assert.deepEqual(result.blockedBy, ["notification_record_missing"]);
    assert.equal(senderCalls.length, 0);
    assert.equal(await client.notification.count(), 0);
  });
});

test("notification live send dry-run reports ready without sender call or update", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendDryRun111111111111111111111111pump";
    const metricId = 1268;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
    });

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: false,
    });

    assert.equal(result.status, "ready");
    assert.equal(result.senderCalled, false);
    assert.equal(result.updatedCount, 0);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.status, "captured");
    assert.equal(notification?.mode, "capture_only");
  });
});

test("notification live send normalizes unsafe sender error code", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "LiveSendUnsafeError11111111111111111111pump";
    const metricId = 1269;
    const notificationKey = await seedNotification({
      client,
      mint,
      metricId,
      notificationKey: keyFor(mint, metricId),
    });

    const result = await sendNotificationByKey({
      client,
      notificationKey,
      trigger: "metric_appended",
      live: true,
      sender: async () => ({
        status: "failed",
        errorCode: "{\"ok\":false,\"description\":\"raw response\"}",
      }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "ops_notify_sender_failed");

    const notification = await client.notification.findUnique({
      where: {
        notificationKey,
      },
    });
    assert.equal(notification?.errorCode, "ops_notify_sender_failed");
    assert.equal(notification?.reason, "ops_notify_send_failed");
    assert.equal(JSON.stringify(notification).includes("raw response"), false);
  });
});
