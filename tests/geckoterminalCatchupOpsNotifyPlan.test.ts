import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  buildGeckoCatchupSupervisorPlan,
  buildGeckoCatchupSupervisorCliDeps,
  parseGeckoCatchupSupervisorArgs,
  sendOpsNotifyPlan,
} from "../src/cli/geckoterminalCatchupSupervisor.ts";
import { buildOpsNotificationPreview } from "../src/notify/opsNotificationPreview.ts";
import {
  sendSelectedOpsNotificationPreview,
  type OpsNotificationSenderInput,
} from "../src/notify/opsNotificationSendGate.ts";
import { sendOpsTelegramNotification } from "../src/notify/opsTelegramSender.ts";

const GECKO_SOURCE = "geckoterminal.new_pools";
const execFileAsync = promisify(execFile);

async function withTempNotificationDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-ops-notification-db-"));
  const databaseUrl = `file:${join(dir, "ops-notification.db")}`;

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

async function seedCapturedMetricAppendedNotification(input: {
  client: PrismaClient;
  mint: string;
  metricId: number;
  status?: "captured" | "sent" | "failed";
}): Promise<void> {
  await input.client.notification.create({
    data: {
      notificationKey: `${input.mint}:metric_appended:${input.metricId}`,
      eventType: "metric_appended",
      mint: input.mint,
      metricId: input.metricId,
      trigger: "metric_appended",
      status: input.status ?? "captured",
      mode: input.status === "sent" || input.status === "failed" ? "live_send" : "capture_only",
      messagePreview: [
        "[Lowcap Ops] Gecko metric appended",
        `mint: ${input.mint}`,
        `metricId: ${input.metricId}`,
        "source: geckoterminal.token_snapshot",
        "status: metric_appended",
      ].join("\n"),
      capturedAt: new Date("2026-05-09T00:00:00.000Z"),
      sentAt: input.status === "sent" ? new Date("2026-05-09T00:01:00.000Z") : null,
      failedAt: input.status === "failed" ? new Date("2026-05-09T00:01:00.000Z") : null,
      rawJsonFree: true,
      secretFree: true,
      source: "ops:catchup:gecko",
    },
  });
}

test("gecko catchup dry-run includes send-disabled ops notification preview", () => {
  const now = new Date("2026-04-29T00:00:00.000Z");
  const output = buildGeckoCatchupSupervisorPlan(
    parseGeckoCatchupSupervisorArgs([
      "--pumpOnly",
      "--limit",
      "1",
      "--maxCycles",
      "1",
      "--sinceMinutes",
      "10080",
    ]),
    [
      {
        id: 1,
        mint: "OpsNotifyPlan111111111111111111111111111pump",
        source: GECKO_SOURCE,
        name: null,
        symbol: null,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: now,
        importedAt: now,
        enrichedAt: null,
        rescoredAt: null,
        entrySnapshot: {
          firstSeen: {
            source: GECKO_SOURCE,
            detectedAt: now.toISOString(),
          },
        },
        metrics: [],
        _count: {
          metrics: 0,
        },
      },
    ],
    new Date(now.getTime() - 60_000),
  );

  assert.equal(output.opsNotifyPlan.enabled, false);
  assert.equal(output.opsNotifyPlan.sendRequested, false);
  assert.equal(output.opsNotifyPlan.sendSupported, false);
  assert.equal(output.opsNotifyPlan.selectedTrigger, null);
  assert.equal(output.opsNotifyPlan.sentCount, 0);
  assert.deepEqual(output.opsNotifyPlan.sendResults, []);
  assert.equal(output.opsNotifyPlan.captureSupported, true);
  assert.equal(output.opsNotifyPlan.captureRequested, false);
  assert.equal(output.opsNotifyPlan.captureFile, null);
  assert.equal(output.opsNotifyPlan.capturedCount, 0);
  assert.deepEqual(output.opsNotifyPlan.captureResults, []);
  assert.equal(output.opsNotifyPlan.previewCount, 2);
  assert.equal(output.opsNotifyPlan.wouldNotifyCount, 0);
  assert.equal(output.opsNotifyPlan.notificationPreviews[0]?.trigger, "token_completed");
  assert.deepEqual(output.opsNotifyPlan.notificationPreviews[0]?.blockedBy, [
    "token_write_not_executed",
  ]);
  assert.match(
    output.opsNotifyPlan.notificationPreviews[0]?.messagePreview ?? "",
    /Gecko token completed/,
  );
  assert.equal(output.opsNotifyPlan.notificationPreviews[1]?.trigger, "metric_appended");
  assert.deepEqual(output.opsNotifyPlan.notificationPreviews[1]?.blockedBy, [
    "metric_append_not_executed",
    "message_preview_unavailable",
  ]);
});

test("gecko catchup plan marks explicit ops notification capture without enabling send", () => {
  const now = new Date("2026-04-29T00:00:00.000Z");
  const output = buildGeckoCatchupSupervisorPlan(
    parseGeckoCatchupSupervisorArgs([
      "--pumpOnly",
      "--limit",
      "1",
      "--maxCycles",
      "1",
      "--opsNotifyCaptureFile",
      "/tmp/lowcap-ops-notify.jsonl",
    ]),
    [],
    new Date(now.getTime() - 60_000),
  );

  assert.equal(output.opsNotifyPlan.enabled, false);
  assert.equal(output.opsNotifyPlan.delivery, "capture_only");
  assert.equal(output.opsNotifyPlan.sendRequested, false);
  assert.equal(output.opsNotifyPlan.sendSupported, false);
  assert.equal(output.opsNotifyPlan.selectedTrigger, null);
  assert.equal(output.opsNotifyPlan.sentCount, 0);
  assert.deepEqual(output.opsNotifyPlan.sendResults, []);
  assert.equal(output.opsNotifyPlan.captureSupported, true);
  assert.equal(output.opsNotifyPlan.captureRequested, true);
  assert.equal(output.opsNotifyPlan.captureFile, "/tmp/lowcap-ops-notify.jsonl");
  assert.equal(output.opsNotifyPlan.capturedCount, 0);
  assert.deepEqual(output.opsNotifyPlan.captureResults, []);
});

test("gecko catchup parses explicit ops notification send gate args", () => {
  const parsed = parseGeckoCatchupSupervisorArgs([
    "--opsNotify",
    "--opsNotifyTrigger",
    "metric_appended",
  ]);

  assert.equal(parsed.opsNotifyRequested, true);
  assert.equal(parsed.opsNotifyTrigger, "metric_appended");

  assert.throws(
    () =>
      parseGeckoCatchupSupervisorArgs([
        "--opsNotify",
        "--opsNotifyTrigger",
        "unexpected",
      ]),
    /Invalid --opsNotifyTrigger: unexpected/,
  );
});

test("ops notification capture-only records one metric_appended Notification row", async () => {
  await withTempNotificationDb(async ({ client }) => {
    const now = new Date("2026-04-29T00:00:00.000Z");
    const mint = "OpsNotifyRecordMetric111111111111111111111pump";
    const metricId = 1115;
    const preview = buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint,
      metricId,
      metricSource: "geckoterminal.token_snapshot",
    });
    const baseOutput = buildGeckoCatchupSupervisorPlan(
      parseGeckoCatchupSupervisorArgs([
        "--opsNotifyCaptureFile",
        "/tmp/lowcap-ops-notify.jsonl",
      ]),
      [],
      new Date(now.getTime() - 60_000),
    );
    const outputWithCapture = {
      ...baseOutput,
      opsNotifyPlan: {
        ...baseOutput.opsNotifyPlan,
        notificationPreviews: [preview],
        previewCount: 1,
        wouldNotifyCount: 1,
        capturedCount: 1,
        captureResults: [
          {
            trigger: "metric_appended" as const,
            mint,
            metricId,
            status: "captured" as const,
            blockedBy: [],
          },
        ],
      },
    };

    const first = await sendOpsNotifyPlan(outputWithCapture, {
      notificationClient: client,
    });

    assert.equal(first.opsNotifyPlan.sentCount, 0);
    assert.deepEqual(first.opsNotifyPlan.sendResults, []);
    assert.equal(first.opsNotifyPlan.notificationRecordWriteCount, 1);
    assert.deepEqual(first.opsNotifyPlan.notificationRecordResults, [
      {
        trigger: "metric_appended",
        mint,
        metricId,
        notificationKey: `${mint}:metric_appended:${metricId}`,
        status: "created",
        blockedBy: [],
      },
    ]);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey: `${mint}:metric_appended:${metricId}`,
      },
    });
    assert.ok(notification);
    assert.equal(notification.eventType, "metric_appended");
    assert.equal(notification.trigger, "metric_appended");
    assert.equal(notification.status, "captured");
    assert.equal(notification.mode, "capture_only");
    assert.equal(notification.mint, mint);
    assert.equal(notification.metricId, metricId);
    assert.equal(notification.tokenId, null);
    assert.match(notification.messagePreview, /metricId: 1115/);
    assert.equal(notification.rawJsonFree, true);
    assert.equal(notification.secretFree, true);
    assert.equal(notification.source, "ops:catchup:gecko");
    assert.equal(await client.notification.count(), 1);

    const second = await sendOpsNotifyPlan(outputWithCapture, {
      notificationClient: client,
    });

    assert.equal(second.opsNotifyPlan.notificationRecordWriteCount, 0);
    assert.equal(second.opsNotifyPlan.notificationRecordResults[0]?.status, "existing");
    assert.equal(await client.notification.count(), 1);
  });
});

test("ops notification capture-only does not record token_completed or loop_complete", async () => {
  await withTempNotificationDb(async ({ client }) => {
    const now = new Date("2026-04-29T00:00:00.000Z");
    const mint = "OpsNotifyRecordSkip1111111111111111111111pump";
    const previews = [
      buildOpsNotificationPreview({
        trigger: "token_completed",
        mint,
        tokenName: "Record Skip",
        tokenSymbol: "SKIP",
      }),
      buildOpsNotificationPreview({
        trigger: "loop_complete",
        mint,
        metricId: 1116,
        plannedTokenWrites: 0,
        plannedMetricAppends: 0,
        metricPendingCount: 0,
        latestMetricMissingCount: 0,
        nextRecommendedAction: "no_action",
      }),
    ];
    const baseOutput = buildGeckoCatchupSupervisorPlan(
      parseGeckoCatchupSupervisorArgs([
        "--opsNotifyCaptureFile",
        "/tmp/lowcap-ops-notify.jsonl",
      ]),
      [],
      new Date(now.getTime() - 60_000),
    );

    const output = await sendOpsNotifyPlan(
      {
        ...baseOutput,
        opsNotifyPlan: {
          ...baseOutput.opsNotifyPlan,
          notificationPreviews: previews,
          previewCount: previews.length,
          wouldNotifyCount: previews.length,
          capturedCount: 2,
          captureResults: [
            {
              trigger: "token_completed",
              mint,
              metricId: null,
              status: "captured",
              blockedBy: [],
            },
            {
              trigger: "loop_complete",
              mint,
              metricId: 1116,
              status: "captured",
              blockedBy: [],
            },
          ],
        },
      },
      {
        notificationClient: client,
      },
    );

    assert.equal(output.opsNotifyPlan.notificationRecordWriteCount, 0);
    assert.deepEqual(output.opsNotifyPlan.notificationRecordResults, []);
    assert.equal(await client.notification.count(), 0);
  });
});

test("ops notification send gate sends exactly one selected trigger through injected sender", async () => {
  const previews = [
    buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint: "OpsNotifySend111111111111111111111111111pump",
      metricId: 1115,
      metricSource: "geckoterminal.token_snapshot",
    }),
    buildOpsNotificationPreview({
      trigger: "loop_complete",
      mint: "OpsNotifySend111111111111111111111111111pump",
      metricId: 1115,
      plannedTokenWrites: 0,
      plannedMetricAppends: 0,
      metricPendingCount: 0,
      latestMetricMissingCount: 0,
      nextRecommendedAction: "no_action",
    }),
  ];
  const senderCalls: OpsNotificationSenderInput[] = [];

  const result = await sendSelectedOpsNotificationPreview({
    sendRequested: true,
    trigger: "metric_appended",
    previews,
    sender: async (input) => {
      senderCalls.push(input);
      return { status: "sent" };
    },
  });

  assert.equal(senderCalls.length, 1);
  assert.equal(senderCalls[0]?.trigger, "metric_appended");
  assert.equal(senderCalls[0]?.mint, "OpsNotifySend111111111111111111111111111pump");
  assert.equal(senderCalls[0]?.metricId, 1115);
  assert.match(senderCalls[0]?.message ?? "", /Gecko metric appended/);
  assert.equal(result.sendSupported, true);
  assert.equal(result.sentCount, 1);
  assert.deepEqual(result.results, [
    {
      trigger: "metric_appended",
      mint: "OpsNotifySend111111111111111111111111111pump",
      metricId: 1115,
      status: "sent",
      blockedBy: [],
      errorCode: null,
    },
  ]);
  assert.equal("message" in result.results[0], false);
});

test("ops notification send gate sends selected token_completed after capture confirmation", async () => {
  const now = new Date("2026-04-29T00:00:00.000Z");
  const mint = "OpsNotifyTokenCompleted111111111111111111pump";
  const previews = [
    buildOpsNotificationPreview({
      trigger: "token_completed",
      mint,
      tokenName: "Completed Token",
      tokenSymbol: "DONE",
    }),
    buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint,
      metricId: 1116,
      metricSource: "geckoterminal.token_snapshot",
    }),
    buildOpsNotificationPreview({
      trigger: "loop_complete",
      mint,
      metricId: 1116,
      plannedTokenWrites: 0,
      plannedMetricAppends: 0,
      metricPendingCount: 0,
      latestMetricMissingCount: 0,
      nextRecommendedAction: "no_action",
    }),
  ];
  const baseOutput = buildGeckoCatchupSupervisorPlan(
    parseGeckoCatchupSupervisorArgs([
      "--opsNotify",
      "--opsNotifyTrigger",
      "token_completed",
      "--opsNotifyCaptureFile",
      "/tmp/lowcap-ops-notify.jsonl",
    ]),
    [],
    new Date(now.getTime() - 60_000),
  );
  const senderCalls: OpsNotificationSenderInput[] = [];

  const output = await sendOpsNotifyPlan(
    {
      ...baseOutput,
      opsNotifyPlan: {
        ...baseOutput.opsNotifyPlan,
        notificationPreviews: previews,
        previewCount: previews.length,
        wouldNotifyCount: previews.filter((preview) => preview.wouldNotify).length,
        captureResults: [
          {
            trigger: "token_completed",
            mint,
            metricId: null,
            status: "captured",
            blockedBy: [],
          },
        ],
      },
    },
    {
      opsNotifySender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    },
  );

  assert.equal(senderCalls.length, 1);
  assert.equal(senderCalls[0]?.trigger, "token_completed");
  assert.equal(senderCalls[0]?.mint, mint);
  assert.equal(senderCalls[0]?.metricId, null);
  assert.match(senderCalls[0]?.message ?? "", /Gecko token completed/);
  assert.deepEqual(
    senderCalls.map((call) => call.trigger),
    ["token_completed"],
  );
  assert.equal(output.opsNotifyPlan.sentCount, 1);
  assert.deepEqual(output.opsNotifyPlan.sendResults, [
    {
      trigger: "token_completed",
      mint,
      metricId: null,
      status: "sent",
      blockedBy: [],
      errorCode: null,
    },
  ]);
});

test("ops notification send gate sends selected loop_complete after capture confirmation", async () => {
  const now = new Date("2026-04-29T00:00:00.000Z");
  const mint = "OpsNotifyLoopComplete11111111111111111111pump";
  const previews = [
    buildOpsNotificationPreview({
      trigger: "token_completed",
      mint,
      tokenName: "Loop Token",
      tokenSymbol: "LOOP",
    }),
    buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint,
      metricId: 1116,
      metricSource: "geckoterminal.token_snapshot",
    }),
    buildOpsNotificationPreview({
      trigger: "loop_complete",
      mint,
      metricId: 1116,
      plannedTokenWrites: 0,
      plannedMetricAppends: 0,
      metricPendingCount: 0,
      latestMetricMissingCount: 0,
      nextRecommendedAction: "no_action",
    }),
  ];
  const baseOutput = buildGeckoCatchupSupervisorPlan(
    parseGeckoCatchupSupervisorArgs([
      "--opsNotify",
      "--opsNotifyTrigger",
      "loop_complete",
      "--opsNotifyCaptureFile",
      "/tmp/lowcap-ops-notify.jsonl",
    ]),
    [],
    new Date(now.getTime() - 60_000),
  );
  const senderCalls: OpsNotificationSenderInput[] = [];

  const output = await sendOpsNotifyPlan(
    {
      ...baseOutput,
      opsNotifyPlan: {
        ...baseOutput.opsNotifyPlan,
        notificationPreviews: previews,
        previewCount: previews.length,
        wouldNotifyCount: previews.filter((preview) => preview.wouldNotify).length,
        captureResults: [
          {
            trigger: "loop_complete",
            mint,
            metricId: 1116,
            status: "captured",
            blockedBy: [],
          },
        ],
      },
    },
    {
      opsNotifySender: async (input) => {
        senderCalls.push(input);
        return { status: "sent" };
      },
    },
  );

  assert.equal(senderCalls.length, 1);
  assert.equal(senderCalls[0]?.trigger, "loop_complete");
  assert.equal(senderCalls[0]?.mint, mint);
  assert.equal(senderCalls[0]?.metricId, 1116);
  assert.match(senderCalls[0]?.message ?? "", /Gecko token metric loop complete/);
  assert.deepEqual(
    senderCalls.map((call) => call.trigger),
    ["loop_complete"],
  );
  assert.equal(output.opsNotifyPlan.sentCount, 1);
  assert.deepEqual(output.opsNotifyPlan.sendResults, [
    {
      trigger: "loop_complete",
      mint,
      metricId: 1116,
      status: "sent",
      blockedBy: [],
      errorCode: null,
    },
  ]);
});

test("ops notification send gate blocks ambiguous or unsupported sends", async () => {
  const preview = buildOpsNotificationPreview({
    trigger: "token_completed",
    mint: "OpsNotifyBlocked111111111111111111111111pump",
    tokenName: "Blocked",
    tokenSymbol: "BLOCK",
  });

  const missingTrigger = await sendSelectedOpsNotificationPreview({
    sendRequested: true,
    trigger: null,
    previews: [preview],
    sender: async () => ({ status: "sent" }),
  });
  assert.deepEqual(missingTrigger.results[0]?.blockedBy, ["ops_notify_trigger_required"]);

  const noSender = await sendSelectedOpsNotificationPreview({
    sendRequested: true,
    trigger: "token_completed",
    previews: [preview],
  });
  assert.equal(noSender.sendSupported, false);
  assert.deepEqual(noSender.results[0]?.blockedBy, ["ops_notify_sender_not_connected"]);

  const duplicate = await sendSelectedOpsNotificationPreview({
    sendRequested: true,
    trigger: "token_completed",
    previews: [preview, preview],
    sender: async () => ({ status: "sent" }),
  });
  assert.deepEqual(duplicate.results[0]?.blockedBy, ["ops_notify_preview_not_single"]);
});

test("ops notification production sender maps Telegram outcomes to safe codes", async () => {
  assert.equal(typeof buildGeckoCatchupSupervisorCliDeps().opsNotifySender, "function");

  const input = {
    trigger: "metric_appended" as const,
    mint: "OpsNotifyTelegram111111111111111111111111pump",
    metricId: 1115,
    message: "safe message",
  };
  const missingCredentials = await sendOpsTelegramNotification(input, {
    env: {},
    transport: async () => {
      throw new Error("transport should not be called without credentials");
    },
  });
  assert.deepEqual(missingCredentials, {
    status: "failed",
    errorCode: "telegram_credentials_missing",
  });

  const apiFailure = await sendOpsTelegramNotification(input, {
    env: {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat",
    },
    transport: async () => ({ ok: false, statusCode: 500 }),
  });
  assert.deepEqual(apiFailure, {
    status: "failed",
    errorCode: "telegram_response_not_ok",
  });

  const networkFailure = await sendOpsTelegramNotification(input, {
    env: {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat",
    },
    transport: async () => {
      throw new Error("network down");
    },
  });
  assert.deepEqual(networkFailure, {
    status: "failed",
    errorCode: "telegram_network_error",
  });

  const transportCalls: Array<{ body: string; method: string; family: number }> = [];
  const success = await sendOpsTelegramNotification(input, {
    env: {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat",
    },
    transport: async (request) => {
      transportCalls.push({
        body: request.body,
        method: request.method,
        family: request.family,
      });
      return { ok: true, statusCode: 200 };
    },
  });
  assert.deepEqual(success, { status: "sent" });
  assert.equal(transportCalls.length, 1);
  assert.equal(transportCalls[0]?.method, "POST");
  assert.equal(transportCalls[0]?.family, 4);
  const body = JSON.parse(transportCalls[0]?.body ?? "{}") as Record<string, unknown>;
  assert.equal(body["chat_id"], "test-chat");
  assert.equal(body["text"], "safe message");
  assert.equal(body["disable_web_page_preview"], true);
});

test("ops notification send waits for selected trigger capture confirmation", async () => {
  const now = new Date("2026-04-29T00:00:00.000Z");
  const preview = buildOpsNotificationPreview({
    trigger: "metric_appended",
    mint: "OpsNotifyCaptureGate11111111111111111111pump",
    metricId: 1115,
    metricSource: "geckoterminal.token_snapshot",
  });
  const baseOutput = buildGeckoCatchupSupervisorPlan(
    parseGeckoCatchupSupervisorArgs([
      "--opsNotify",
      "--opsNotifyTrigger",
      "metric_appended",
      "--opsNotifyCaptureFile",
      "/tmp/lowcap-ops-notify.jsonl",
    ]),
    [],
    new Date(now.getTime() - 60_000),
  );
  const outputWithPreview = {
    ...baseOutput,
    opsNotifyPlan: {
      ...baseOutput.opsNotifyPlan,
      notificationPreviews: [preview],
      previewCount: 1,
      wouldNotifyCount: 1,
    },
  };
  const senderCalls: OpsNotificationSenderInput[] = [];
  const sender = async (input: OpsNotificationSenderInput) => {
    senderCalls.push(input);
    return { status: "sent" as const };
  };

  const blocked = await sendOpsNotifyPlan(
    {
      ...outputWithPreview,
      opsNotifyPlan: {
        ...outputWithPreview.opsNotifyPlan,
        captureResults: [
          {
            trigger: "metric_appended",
            mint: preview.mint,
            metricId: preview.metricId,
            status: "skipped",
            blockedBy: ["capture_failed"],
          },
        ],
      },
    },
    { opsNotifySender: sender },
  );
  assert.equal(senderCalls.length, 0);
  assert.equal(blocked.opsNotifyPlan.sentCount, 0);
  assert.deepEqual(blocked.opsNotifyPlan.sendResults[0]?.blockedBy, [
    "ops_notify_capture_not_confirmed",
  ]);

  await withTempNotificationDb(async ({ client }) => {
    assert.ok(preview.mint);
    assert.ok(preview.metricId);
    await seedCapturedMetricAppendedNotification({
      client,
      mint: preview.mint,
      metricId: preview.metricId,
    });

    const sent = await sendOpsNotifyPlan(
      {
        ...outputWithPreview,
        opsNotifyPlan: {
          ...outputWithPreview.opsNotifyPlan,
          captureResults: [
            {
              trigger: "metric_appended",
              mint: preview.mint,
              metricId: preview.metricId,
              status: "captured",
              blockedBy: [],
            },
          ],
        },
      },
      {
        opsNotifySender: sender,
        notificationClient: client,
      },
    );

    assert.equal(senderCalls.length, 1);
    assert.equal(sent.opsNotifyPlan.sentCount, 1);
    assert.equal(sent.opsNotifyPlan.sendResults[0]?.status, "sent");

    const notification = await client.notification.findUnique({
      where: {
        notificationKey: `${preview.mint}:metric_appended:${preview.metricId}`,
      },
    });
    assert.equal(notification?.status, "sent");
    assert.equal(notification?.mode, "live_send");
    assert.ok(notification?.sentAt);
    assert.equal(await client.notification.count(), 1);
  });
});

test("ops notification send marks metric_appended send failures safely", async () => {
  await withTempNotificationDb(async ({ client }) => {
    const now = new Date("2026-04-29T00:00:00.000Z");
    const mint = "OpsNotifyFailedMark111111111111111111111pump";
    const metricId = 2221;
    const preview = buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint,
      metricId,
      metricSource: "geckoterminal.token_snapshot",
    });
    await seedCapturedMetricAppendedNotification({ client, mint, metricId });
    const baseOutput = buildGeckoCatchupSupervisorPlan(
      parseGeckoCatchupSupervisorArgs([
        "--opsNotify",
        "--opsNotifyTrigger",
        "metric_appended",
        "--opsNotifyCaptureFile",
        "/tmp/lowcap-ops-notify.jsonl",
      ]),
      [],
      new Date(now.getTime() - 60_000),
    );
    const senderCalls: OpsNotificationSenderInput[] = [];

    const output = await sendOpsNotifyPlan(
      {
        ...baseOutput,
        opsNotifyPlan: {
          ...baseOutput.opsNotifyPlan,
          notificationPreviews: [preview],
          previewCount: 1,
          wouldNotifyCount: 1,
          captureResults: [
            {
              trigger: "metric_appended",
              mint,
              metricId,
              status: "captured",
              blockedBy: [],
            },
          ],
        },
      },
      {
        opsNotifySender: async (input) => {
          senderCalls.push(input);
          return {
            status: "failed",
            errorCode: "telegram_response_not_ok",
          };
        },
        notificationClient: client,
      },
    );

    assert.equal(senderCalls.length, 1);
    assert.equal(output.opsNotifyPlan.sentCount, 0);
    assert.equal(output.opsNotifyPlan.sendResults[0]?.status, "failed");
    assert.equal(output.opsNotifyPlan.sendResults[0]?.errorCode, "telegram_response_not_ok");

    const notification = await client.notification.findUnique({
      where: {
        notificationKey: `${mint}:metric_appended:${metricId}`,
      },
    });
    assert.equal(notification?.status, "failed");
    assert.equal(notification?.mode, "live_send");
    assert.ok(notification?.failedAt);
    assert.equal(notification?.sentAt, null);
    assert.equal(notification?.errorCode, "telegram_response_not_ok");
    assert.equal(notification?.reason, "ops_notify_send_failed");
    assert.equal(await client.notification.count(), 1);

    const serialized = JSON.stringify(notification);
    assert.equal(serialized.includes("telegram response body"), false);
    assert.equal(serialized.includes("botToken"), false);
    assert.equal(serialized.includes("chatId"), false);
    assert.equal(serialized.includes("DATABASE_URL"), false);
    assert.equal(serialized.includes("TELEGRAM_BOT_TOKEN"), false);
    assert.equal(serialized.includes("TELEGRAM_CHAT_ID"), false);
  });
});

test("ops notification send blocks already-sent metric_appended notifications", async () => {
  await withTempNotificationDb(async ({ client }) => {
    const now = new Date("2026-04-29T00:00:00.000Z");
    const mint = "OpsNotifyAlreadySent11111111111111111111pump";
    const metricId = 2222;
    const preview = buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint,
      metricId,
      metricSource: "geckoterminal.token_snapshot",
    });
    await seedCapturedMetricAppendedNotification({
      client,
      mint,
      metricId,
      status: "sent",
    });
    const baseOutput = buildGeckoCatchupSupervisorPlan(
      parseGeckoCatchupSupervisorArgs([
        "--opsNotify",
        "--opsNotifyTrigger",
        "metric_appended",
        "--opsNotifyCaptureFile",
        "/tmp/lowcap-ops-notify.jsonl",
      ]),
      [],
      new Date(now.getTime() - 60_000),
    );
    const senderCalls: OpsNotificationSenderInput[] = [];

    const output = await sendOpsNotifyPlan(
      {
        ...baseOutput,
        opsNotifyPlan: {
          ...baseOutput.opsNotifyPlan,
          notificationPreviews: [preview],
          previewCount: 1,
          wouldNotifyCount: 1,
          captureResults: [
            {
              trigger: "metric_appended",
              mint,
              metricId,
              status: "captured",
              blockedBy: [],
            },
          ],
        },
      },
      {
        opsNotifySender: async (input) => {
          senderCalls.push(input);
          return { status: "sent" };
        },
        notificationClient: client,
      },
    );

    assert.equal(senderCalls.length, 0);
    assert.equal(output.opsNotifyPlan.sentCount, 0);
    assert.deepEqual(output.opsNotifyPlan.sendResults[0]?.blockedBy, [
      "notification_already_sent",
    ]);
    assert.equal(await client.notification.count(), 1);

    const notification = await client.notification.findUnique({
      where: {
        notificationKey: `${mint}:metric_appended:${metricId}`,
      },
    });
    assert.equal(notification?.status, "sent");
    assert.equal(notification?.mode, "live_send");
  });
});

test("ops notification send blocks missing metric_appended notification records", async () => {
  await withTempNotificationDb(async ({ client }) => {
    const now = new Date("2026-04-29T00:00:00.000Z");
    const mint = "OpsNotifyMissingRecord1111111111111111111pump";
    const metricId = 2223;
    const preview = buildOpsNotificationPreview({
      trigger: "metric_appended",
      mint,
      metricId,
      metricSource: "geckoterminal.token_snapshot",
    });
    const baseOutput = buildGeckoCatchupSupervisorPlan(
      parseGeckoCatchupSupervisorArgs([
        "--opsNotify",
        "--opsNotifyTrigger",
        "metric_appended",
        "--opsNotifyCaptureFile",
        "/tmp/lowcap-ops-notify.jsonl",
      ]),
      [],
      new Date(now.getTime() - 60_000),
    );
    const senderCalls: OpsNotificationSenderInput[] = [];

    const output = await sendOpsNotifyPlan(
      {
        ...baseOutput,
        opsNotifyPlan: {
          ...baseOutput.opsNotifyPlan,
          notificationPreviews: [preview],
          previewCount: 1,
          wouldNotifyCount: 1,
          captureResults: [
            {
              trigger: "metric_appended",
              mint,
              metricId,
              status: "captured",
              blockedBy: [],
            },
          ],
        },
      },
      {
        opsNotifySender: async (input) => {
          senderCalls.push(input);
          return { status: "sent" };
        },
        notificationClient: client,
      },
    );

    assert.equal(senderCalls.length, 0);
    assert.equal(output.opsNotifyPlan.sentCount, 0);
    assert.deepEqual(output.opsNotifyPlan.sendResults[0]?.blockedBy, [
      "notification_record_missing",
    ]);
    assert.equal(await client.notification.count(), 0);
  });
});
