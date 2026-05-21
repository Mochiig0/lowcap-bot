import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import { buildNotificationAutoSendExecution } from "../src/notifications/notificationAutoSendExecutor.ts";
import type { OpsNotificationSenderInput } from "../src/notify/opsNotificationSendGate.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-notification-auto-send-execute-"));
  const databaseUrl = `file:${join(dir, "notification-auto-send-execute.db")}`;

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
  mint?: string;
  metricId?: number | null;
  notificationKey?: string;
  status?: string;
  mode?: string;
  sentAt?: Date | null;
  messagePreview?: string;
}): Promise<number> {
  const mint = input.mint ?? "AutoExecute111111111111111111111111pump";
  const metricId = input.metricId === undefined ? 1600 : input.metricId;
  const notificationKey =
    input.notificationKey ?? `${mint}:metric_appended:${metricId ?? "none"}`;
  const notification = await input.client.notification.create({
    data: {
      notificationKey,
      eventType: "metric_appended",
      mint,
      metricId,
      trigger: "metric_appended",
      status: input.status ?? "captured",
      mode: input.mode ?? "capture_only",
      messagePreview:
        input.messagePreview ??
        [
          "[Lowcap Ops] Gecko metric appended",
          `mint: ${mint}`,
          `metricId: ${metricId ?? "none"}`,
          "status: metric_appended",
        ].join("\n"),
      capturedAt: input.status === "sent" ? null : new Date("2026-05-09T00:00:00.000Z"),
      sentAt:
        input.sentAt !== undefined
          ? input.sentAt
          : input.status === "sent"
            ? new Date("2026-05-09T00:01:00.000Z")
            : null,
      failedAt: null,
      errorCode: null,
      reason: null,
      rawJsonFree: true,
      secretFree: true,
      source: "test",
    },
  });

  return notification.id;
}

async function readNotificationAudit(client: PrismaClient): Promise<
  Array<{
    id: number;
    status: string;
    mode: string;
    sentAtPresent: boolean;
    failedAtPresent: boolean;
    errorCode: string | null;
    lastAttemptAtPresent: boolean;
  }>
> {
  const rows = await client.notification.findMany({
    orderBy: {
      id: "asc",
    },
    select: {
      id: true,
      status: true,
      mode: true,
      sentAt: true,
      failedAt: true,
      errorCode: true,
      lastAttemptAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    mode: row.mode,
    sentAtPresent: row.sentAt !== null,
    failedAtPresent: row.failedAt !== null,
    errorCode: row.errorCode,
    lastAttemptAtPresent: row.lastAttemptAt !== null,
  }));
}

test("auto-send execute defaults to stopped dry-run without sender or DB update", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoExecuteDryRun11111111111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1601,
      notificationKey: keyFor(mint, 1601),
    });
    const beforeRows = await readNotificationAudit(client);
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await buildNotificationAutoSendExecution(client, {
      execute: false,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.readOnly, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.sendAttempted, false);
    assert.equal(result.senderCalled, false);
    assert.deepEqual(result.blockedBy, ["execute_flag_required"]);
    assert.equal(senderCalls.length, 0);
    assert.deepEqual(await readNotificationAudit(client), beforeRows);
  });
});

test("auto-send execute stops before sender when kill switch is disabled", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoExecuteDisabled111111111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1602,
      notificationKey: keyFor(mint, 1602),
    });
    const beforeRows = await readNotificationAudit(client);
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await buildNotificationAutoSendExecution(client, {
      execute: true,
      env: {},
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "stopped");
    assert.equal(result.autoSendEnabled, false);
    assert.ok(result.stopConditionCodes.includes("auto_send_disabled"));
    assert.equal(result.sendAttempted, false);
    assert.equal(senderCalls.length, 0);
    assert.deepEqual(await readNotificationAudit(client), beforeRows);
  });
});

test("auto-send execute sends one allowed candidate with mocked sender and marks sent", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoExecuteSent11111111111111111111111pump";
    const id = await seedNotification({
      client,
      mint,
      metricId: 1603,
      notificationKey: keyFor(mint, 1603),
      messagePreview:
        "safe message body should not appear in result TELEGRAM_BOT_TOKEN chat id",
    });
    const senderCalls: OpsNotificationSenderInput[] = [];

    const result = await buildNotificationAutoSendExecution(client, {
      execute: true,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(result.status, "sent");
    assert.equal(result.readOnly, false);
    assert.equal(result.dryRun, false);
    assert.equal(result.selectedNotificationId, id);
    assert.equal(result.selectedNotificationKeySummary, "production_metric_appended:1603");
    assert.equal(result.sendAttempted, true);
    assert.equal(result.senderCalled, true);
    assert.equal(result.sentCount, 1);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.retryAttempted, false);
    assert.equal(senderCalls.length, 1);
    assert.equal(senderCalls[0]?.mint, mint);
    assert.equal(senderCalls[0]?.metricId, 1603);

    const rows = await readNotificationAudit(client);
    assert.deepEqual(rows, [
      {
        id,
        status: "sent",
        mode: "live_send",
        sentAtPresent: true,
        failedAtPresent: false,
        errorCode: null,
        lastAttemptAtPresent: true,
      },
    ]);

    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /safe message body/);
    assert.doesNotMatch(serialized, /TELEGRAM_BOT_TOKEN/);
    assert.doesNotMatch(serialized, /chat id/);
    assert.doesNotMatch(serialized, new RegExp(keyFor(mint, 1603)));
  });
});

test("auto-send execute marks one selected notification failed on mocked sender failure", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoExecuteFailed111111111111111111111pump";
    const id = await seedNotification({
      client,
      mint,
      metricId: 1604,
      notificationKey: keyFor(mint, 1604),
    });

    const result = await buildNotificationAutoSendExecution(client, {
      execute: true,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
      sender: async () => ({
        status: "failed",
        errorCode: "telegram_response_not_ok",
      }),
    });

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "telegram_response_not_ok");
    assert.equal(result.sentCount, 0);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.retryAttempted, false);

    assert.deepEqual(await readNotificationAudit(client), [
      {
        id,
        status: "failed",
        mode: "live_send",
        sentAtPresent: false,
        failedAtPresent: true,
        errorCode: "telegram_response_not_ok",
        lastAttemptAtPresent: true,
      },
    ]);
  });
});

test("auto-send execute marks one selected notification failed on sender throw", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoExecuteThrow1111111111111111111111pump";
    const id = await seedNotification({
      client,
      mint,
      metricId: 1605,
      notificationKey: keyFor(mint, 1605),
    });

    const result = await buildNotificationAutoSendExecution(client, {
      execute: true,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
      sender: async () => {
        throw new Error("mock sender throw with secret-looking body");
      },
    });

    assert.equal(result.status, "failed");
    assert.equal(result.errorCode, "ops_notify_sender_threw");
    assert.equal(result.updatedCount, 1);

    assert.deepEqual(await readNotificationAudit(client), [
      {
        id,
        status: "failed",
        mode: "live_send",
        sentAtPresent: false,
        failedAtPresent: true,
        errorCode: "ops_notify_sender_threw",
        lastAttemptAtPresent: true,
      },
    ]);

    assert.doesNotMatch(JSON.stringify(result), /secret-looking body/);
  });
});

test("auto-send execute blocks smoke and duplicate allowed candidates before sender", async () => {
  await withTempDb(async ({ client }) => {
    await seedNotification({
      client,
      mint: "SMOKE_auto_execute_mint",
      metricId: 1606,
      notificationKey: "SMOKE_auto_execute_mint:metric_appended:1606",
    });
    const beforeSmokeRows = await readNotificationAudit(client);
    const senderCalls: OpsNotificationSenderInput[] = [];

    const smokeResult = await buildNotificationAutoSendExecution(client, {
      execute: true,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(smokeResult.status, "stopped");
    assert.equal(smokeResult.sendAttempted, false);
    assert.equal(senderCalls.length, 0);
    assert.deepEqual(await readNotificationAudit(client), beforeSmokeRows);

    const firstMint = "AutoExecuteFirst111111111111111111111pump";
    const secondMint = "AutoExecuteSecond11111111111111111111pump";
    await seedNotification({
      client,
      mint: firstMint,
      metricId: 1607,
      notificationKey: keyFor(firstMint, 1607),
    });
    await seedNotification({
      client,
      mint: secondMint,
      metricId: 1608,
      notificationKey: keyFor(secondMint, 1608),
    });
    const beforeDuplicateRows = await readNotificationAudit(client);

    const duplicateResult = await buildNotificationAutoSendExecution(client, {
      execute: true,
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
      sender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    });

    assert.equal(duplicateResult.status, "stopped");
    assert.ok(
      duplicateResult.stopConditionCodes.includes("candidate_count_exceeds_one_run_max"),
    );
    assert.equal(senderCalls.length, 0);
    assert.deepEqual(await readNotificationAudit(client), beforeDuplicateRows);
  });
});
