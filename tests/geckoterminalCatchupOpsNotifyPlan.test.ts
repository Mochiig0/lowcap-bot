import test from "node:test";
import assert from "node:assert/strict";

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
    fetch: async () => {
      throw new Error("fetch should not be called without credentials");
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
    fetch: async () => new Response("do not expose this body", { status: 500 }),
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
    fetch: async () => {
      throw new Error("network down");
    },
  });
  assert.deepEqual(networkFailure, {
    status: "failed",
    errorCode: "telegram_network_error",
  });

  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
  const success = await sendOpsTelegramNotification(input, {
    env: {
      TELEGRAM_BOT_TOKEN: "test-token",
      TELEGRAM_CHAT_ID: "test-chat",
    },
    fetch: async (url, init) => {
      fetchCalls.push({ url: String(url), init });
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(success, { status: "sent" });
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0]?.init?.method, "POST");
  assert.equal(fetchCalls[0]?.init?.headers?.["content-type" as keyof HeadersInit], "application/json");
  const body = JSON.parse(String(fetchCalls[0]?.init?.body ?? "{}")) as Record<string, unknown>;
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
    { opsNotifySender: sender },
  );
  assert.equal(senderCalls.length, 1);
  assert.equal(sent.opsNotifyPlan.sentCount, 1);
  assert.equal(sent.opsNotifyPlan.sendResults[0]?.status, "sent");
});
