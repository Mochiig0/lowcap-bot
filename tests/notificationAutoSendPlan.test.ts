import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import { buildNotificationAutoSendPlan } from "../src/notifications/notificationAutoSendPlanner.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-notification-auto-send-plan-"));
  const databaseUrl = `file:${join(dir, "notification-auto-send-plan.db")}`;

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
  eventType?: string;
  trigger?: string;
  status?: string;
  mode?: string;
  sentAt?: Date | null;
  failedAt?: Date | null;
  errorCode?: string | null;
  messagePreview?: string;
  rawJsonFree?: boolean;
  secretFree?: boolean;
}): Promise<void> {
  const mint = input.mint ?? "AutoPlan111111111111111111111111111pump";
  const metricId = input.metricId === undefined ? 1500 : input.metricId;
  const notificationKey =
    input.notificationKey ??
    `${mint}:${input.eventType ?? "metric_appended"}:${metricId ?? "none"}`;

  await input.client.notification.create({
    data: {
      notificationKey,
      eventType: input.eventType ?? "metric_appended",
      mint,
      metricId,
      trigger: input.trigger ?? "metric_appended",
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
      capturedAt: input.status === "captured" ? new Date("2026-05-09T00:00:00.000Z") : null,
      sentAt:
        input.sentAt !== undefined
          ? input.sentAt
          : input.status === "sent"
            ? new Date("2026-05-09T00:01:00.000Z")
            : null,
      failedAt:
        input.failedAt !== undefined
          ? input.failedAt
          : input.status === "failed"
            ? new Date("2026-05-09T00:02:00.000Z")
            : null,
      errorCode:
        input.errorCode !== undefined
          ? input.errorCode
          : input.status === "failed"
            ? "telegram_network_error"
            : null,
      reason: input.status === "failed" ? "ops_notify_send_failed" : null,
      rawJsonFree: input.rawJsonFree ?? true,
      secretFree: input.secretFree ?? true,
      source: "test",
    },
  });
}

test("auto-send planner excludes SMOKE and REHEARSAL rows", async () => {
  await withTempDb(async ({ client }) => {
    await seedNotification({
      client,
      mint: "SMOKE_auto_plan_mint",
      metricId: 1501,
      notificationKey: "SMOKE_auto_plan_mint:metric_appended:1501",
    });
    await seedNotification({
      client,
      mint: "AutoPlanRehearsal111111111111111111pump",
      metricId: 1502,
      notificationKey:
        "REHEARSAL:capture_rehearsal_test:AutoPlanRehearsal111111111111111111pump:metric_appended:1502",
    });

    const result = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });

    assert.equal(result.totalCapturedCount, 2);
    assert.equal(result.allowedCandidateCount, 0);
    assert.equal(result.blockedReasons.smoke_or_rehearsal_notification, 2);
    assert.equal(result.selectedNotificationId, null);
    assert.equal(result.wouldSend, false);
    assert.equal(result.wouldUpdateNotification, false);
    assert.ok(result.stopConditionCodes.includes("only_smoke_or_rehearsal_candidates"));
  });
});

test("auto-send planner excludes sent rows", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoPlanSent11111111111111111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1503,
      notificationKey: keyFor(mint, 1503),
      status: "sent",
      mode: "live_send",
    });

    const result = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });

    assert.equal(result.allowedCandidateCount, 0);
    assert.equal(result.blockedReasons.already_sent, 1);
    assert.equal(result.blockedReasons.sent_at_present, 1);
    assert.equal(result.selectedNotificationId, null);
    assert.equal(result.wouldSend, false);
  });
});

test("auto-send planner stops when failed notifications exist", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoPlanAllowedWithFailure1111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1504,
      notificationKey: keyFor(mint, 1504),
    });
    await seedNotification({
      client,
      mint: "AutoPlanFailed111111111111111111111111pump",
      metricId: 1505,
      notificationKey:
        "AutoPlanFailed111111111111111111111111pump:metric_appended:1505",
      status: "failed",
      mode: "live_send",
    });

    const result = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });

    assert.equal(result.failedCount, 1);
    assert.equal(result.allowedCandidateCount, 0);
    assert.ok(result.stopConditionCodes.includes("failed_notifications_present"));
    assert.equal(result.blockedReasons.failed_notifications_present, 2);
  });
});

test("auto-send planner allows one production-shaped captured row but never sends", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoPlanAllowed111111111111111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1506,
      notificationKey: keyFor(mint, 1506),
    });

    const result = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });

    assert.equal(result.autoSendEnabled, true);
    assert.equal(result.allowedCandidateCount, 1);
    assert.equal(result.blockedCandidateCount, 0);
    assert.equal(result.selectedNotificationId, 1);
    assert.equal(result.selectedTrigger, "metric_appended");
    assert.equal(result.selectedNotificationKeySummary, "production_metric_appended:1506");
    assert.equal(result.wouldSend, false);
    assert.equal(result.wouldUpdateNotification, false);
    assert.deepEqual(result.stopConditionCodes, []);
    assert.deepEqual(result.expectedSideEffects, {
      externalFetchMax: 0,
      telegramSendMax: 0,
      notificationCreateMax: 0,
      notificationUpdateMax: 0,
      tokenWriteMax: 0,
      metricWriteMax: 0,
      holderSnapshotWriteMax: 0,
      scheduler: false,
      systemd: false,
    });
  });
});

test("auto-send planner stops when allowed candidates exceed one-run max", async () => {
  await withTempDb(async ({ client }) => {
    const firstMint = "AutoPlanFirst111111111111111111111111pump";
    const secondMint = "AutoPlanSecond11111111111111111111111pump";
    await seedNotification({
      client,
      mint: firstMint,
      metricId: 1507,
      notificationKey: keyFor(firstMint, 1507),
    });
    await seedNotification({
      client,
      mint: secondMint,
      metricId: 1508,
      notificationKey: keyFor(secondMint, 1508),
    });

    const result = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });

    assert.equal(result.oneRunMax, 1);
    assert.equal(result.allowedCandidateCount, 2);
    assert.equal(result.selectedNotificationId, null);
    assert.ok(
      result.stopConditionCodes.includes("candidate_count_exceeds_one_run_max"),
    );
    assert.equal(result.wouldSend, false);
    assert.equal(result.wouldUpdateNotification, false);
  });
});

test("auto-send planner defaults disabled and honors explicit true without sending", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoPlanSwitch111111111111111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1509,
      notificationKey: keyFor(mint, 1509),
    });

    const disabled = await buildNotificationAutoSendPlan(client, {
      env: {},
    });
    assert.equal(disabled.autoSendEnabled, false);
    assert.equal(disabled.allowedCandidateCount, 0);
    assert.equal(disabled.blockedReasons.auto_send_disabled, 1);
    assert.ok(disabled.stopConditionCodes.includes("auto_send_disabled"));
    assert.equal(disabled.wouldSend, false);
    assert.equal(disabled.wouldUpdateNotification, false);

    const enabled = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });
    assert.equal(enabled.autoSendEnabled, true);
    assert.equal(enabled.allowedCandidateCount, 1);
    assert.equal(enabled.wouldSend, false);
    assert.equal(enabled.wouldUpdateNotification, false);
  });
});

test("auto-send planner output omits message body, raw payload, and secret labels", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "AutoPlanSecret111111111111111111111111pump";
    await seedNotification({
      client,
      mint,
      metricId: 1510,
      notificationKey: keyFor(mint, 1510),
      messagePreview:
        "message full body should stay private TELEGRAM_BOT_TOKEN chat id rawJson",
    });

    const result = await buildNotificationAutoSendPlan(client, {
      env: {
        NOTIFICATION_AUTO_SEND_ENABLED: "true",
      },
    });
    const serialized = JSON.stringify(result);

    assert.doesNotMatch(serialized, /message full body/);
    assert.doesNotMatch(serialized, /TELEGRAM_BOT_TOKEN/);
    assert.doesNotMatch(serialized, /chat id/);
    assert.equal(result.allowedCandidateCount, 1);
  });
});
