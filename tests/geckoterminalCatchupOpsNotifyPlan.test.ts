import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeckoCatchupSupervisorPlan,
  parseGeckoCatchupSupervisorArgs,
} from "../src/cli/geckoterminalCatchupSupervisor.ts";
import { buildOpsNotificationPreview } from "../src/notify/opsNotificationPreview.ts";
import {
  sendSelectedOpsNotificationPreview,
  type OpsNotificationSenderInput,
} from "../src/notify/opsNotificationSendGate.ts";

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
