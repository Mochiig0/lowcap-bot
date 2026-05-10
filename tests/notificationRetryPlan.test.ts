import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import { buildNotificationRetryPlan } from "../src/cli/notificationRetryPlan.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-notification-retry-plan-"));
  const databaseUrl = `file:${join(dir, "notification-retry-plan.db")}`;

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

async function seedNotification(input: {
  client: PrismaClient;
  notificationKey?: string;
  mint?: string;
  metricId?: number | null;
  eventType?: string;
  trigger?: string;
  status?: string;
  mode?: string;
  rawJsonFree?: boolean;
  secretFree?: boolean;
  failedAt?: Date | null;
  updatedAt?: Date;
  errorCode?: string | null;
}): Promise<void> {
  const mint = input.mint ?? "RetryPlan111111111111111111111111111pump";
  const metricId = input.metricId === undefined ? 1264 : input.metricId;
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
      status: input.status ?? "failed",
      mode: input.mode ?? "live_send",
      messagePreview: [
        "[Lowcap Ops] Gecko metric appended",
        `mint: ${mint}`,
        `metricId: ${metricId ?? "none"}`,
        "status: metric_appended",
      ].join("\n"),
      capturedAt: null,
      sentAt: input.status === "sent" ? new Date("2026-05-09T00:01:00.000Z") : null,
      failedAt: input.failedAt ?? new Date("2026-05-09T00:02:00.000Z"),
      errorCode: input.errorCode ?? "telegram_network_error",
      reason: "ops_notify_send_failed",
      rawJsonFree: input.rawJsonFree ?? true,
      secretFree: input.secretFree ?? true,
      source: "test",
      updatedAt: input.updatedAt,
    },
  });
}

test("notification retry planner selects one failed metric_appended row and returns a human-gated command", async () => {
  await withTempDb(async ({ client }) => {
    const notificationKey =
      "RetryPlanSuccess111111111111111111111111pump:metric_appended:1264";
    await seedNotification({
      client,
      notificationKey,
      mint: "RetryPlanSuccess111111111111111111111111pump",
      metricId: 1264,
      failedAt: new Date("2026-05-09T00:02:00.000Z"),
    });
    const beforeCount = await client.notification.count();

    const result = await buildNotificationRetryPlan(client);

    assert.equal(result.status, "ok");
    assert.equal(result.mode, "read_only_retry_planner");
    assert.equal(result.willExecute, false);
    assert.equal(result.executor, "human");
    assert.equal(result.requiresHumanApproval, true);
    assert.equal(result.candidateCount, 1);
    assert.equal(result.selectedCount, 1);
    assert.equal(result.selected?.notificationKey, notificationKey);
    assert.equal(result.selected?.eventType, "metric_appended");
    assert.equal(result.selected?.metricId, 1264);
    assert.equal(result.selected?.status, "failed");
    assert.equal(result.selected?.mode, "live_send");
    assert.equal(result.selected?.errorCode, "telegram_network_error");
    assert.equal(
      result.nextRedCommand,
      `pnpm -s notification:send -- --notificationKey ${notificationKey} --trigger metric_appended --live --retryFailed`,
    );
    assert.deepEqual(result.sideEffectUpperBoundSpec, {
      telegramSendMax: 1,
      notificationUpdateMax: 1,
      notificationCreateMax: 0,
      tokenWriteMax: 0,
      metricWriteMax: 0,
      checkpointWrite: false,
      queue: false,
      systemd: false,
    });
    assert.deepEqual(result.stopConditionCodes, []);
    assert.equal(await client.notification.count(), beforeCount);
  });
});

test("notification retry planner selects the oldest candidate by failedAt updatedAt and id", async () => {
  await withTempDb(async ({ client }) => {
    await seedNotification({
      client,
      notificationKey: "RetryPlanLaterFailedAt111111111111111111pump:metric_appended:1",
      failedAt: new Date("2026-05-09T00:04:00.000Z"),
      updatedAt: new Date("2026-05-09T00:00:00.000Z"),
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanLaterUpdated111111111111111111pump:metric_appended:2",
      failedAt: new Date("2026-05-09T00:01:00.000Z"),
      updatedAt: new Date("2026-05-09T00:03:00.000Z"),
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanOldest111111111111111111111111pump:metric_appended:3",
      failedAt: new Date("2026-05-09T00:01:00.000Z"),
      updatedAt: new Date("2026-05-09T00:02:00.000Z"),
    });

    const result = await buildNotificationRetryPlan(client);

    assert.equal(result.status, "ok");
    assert.equal(result.candidateCount, 3);
    assert.equal(result.selectedCount, 1);
    assert.equal(
      result.selected?.notificationKey,
      "RetryPlanOldest111111111111111111111111pump:metric_appended:3",
    );
  });
});

test("notification retry planner excludes non-retryable rows", async () => {
  await withTempDb(async ({ client }) => {
    await seedNotification({
      client,
      notificationKey: "RetryPlanSent1111111111111111111111111pump:metric_appended:1",
      status: "sent",
      mode: "live_send",
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanCaptured111111111111111111111pump:metric_appended:2",
      status: "captured",
      mode: "capture_only",
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanToken111111111111111111111111pump:token_completed",
      eventType: "token_completed",
      trigger: "token_completed",
      metricId: null,
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanLoop1111111111111111111111111pump:loop_complete",
      eventType: "loop_complete",
      trigger: "loop_complete",
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanRawUnsafe111111111111111111pump:metric_appended:3",
      rawJsonFree: false,
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanSecretUnsafe1111111111111111pump:metric_appended:4",
      secretFree: false,
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanMissingMint1111111111111111pump:metric_appended:5",
      mint: "",
    });
    await seedNotification({
      client,
      notificationKey: "RetryPlanMissingMetric11111111111111pump:metric_appended:none",
      metricId: null,
    });
    await seedNotification({
      client,
      notificationKey: "",
    });
    const beforeCount = await client.notification.count();

    const result = await buildNotificationRetryPlan(client);

    assert.equal(result.status, "stop");
    assert.equal(result.executor, "none");
    assert.equal(result.requiresHumanApproval, false);
    assert.equal(result.candidateCount, 0);
    assert.equal(result.selectedCount, 0);
    assert.equal(result.selected, null);
    assert.equal(result.nextRedCommand, null);
    assert.deepEqual(result.sideEffectUpperBoundSpec, {
      telegramSendMax: 0,
      notificationUpdateMax: 0,
      notificationCreateMax: 0,
      tokenWriteMax: 0,
      metricWriteMax: 0,
      checkpointWrite: false,
      queue: false,
      systemd: false,
    });
    assert.deepEqual(result.stopConditionCodes, ["no_failed_retry_candidate"]);
    assert.equal(await client.notification.count(), beforeCount);
  });
});

test("notification retry planner reports stop when there are no candidates", async () => {
  await withTempDb(async ({ client }) => {
    const result = await buildNotificationRetryPlan(client);

    assert.deepEqual(result, {
      status: "stop",
      mode: "read_only_retry_planner",
      willExecute: false,
      executor: "none",
      requiresHumanApproval: false,
      candidateCount: 0,
      selectedCount: 0,
      selected: null,
      nextRedCommand: null,
      sideEffectUpperBoundSpec: {
        telegramSendMax: 0,
        notificationUpdateMax: 0,
        notificationCreateMax: 0,
        tokenWriteMax: 0,
        metricWriteMax: 0,
        checkpointWrite: false,
        queue: false,
        systemd: false,
      },
      stopConditionCodes: ["no_failed_retry_candidate"],
    });
  });
});
