import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpsNotificationPreview,
} from "../src/notify/opsNotificationPreview.ts";

test("builds token completed ops notification preview without enabling delivery", () => {
  const preview = buildOpsNotificationPreview({
    trigger: "token_completed",
    mint: "OpsNotifyToken111111111111111111111111111pump",
    tokenName: "Ops Token",
    tokenSymbol: "OPS",
  });

  assert.deepEqual(preview, {
    enabled: false,
    channel: "telegram",
    delivery: "preview_only",
    trigger: "token_completed",
    wouldNotify: true,
    mint: "OpsNotifyToken111111111111111111111111111pump",
    metricId: null,
    blockedBy: [],
    messagePreview: [
      "[Lowcap Ops] Gecko token completed",
      "mint: OpsNotifyToken111111111111111111111111111pump",
      "token: Ops Token (OPS)",
      "status: token_completed",
    ].join("\n"),
  });
});

test("builds metric appended ops notification preview", () => {
  const preview = buildOpsNotificationPreview({
    trigger: "metric_appended",
    mint: "OpsNotifyMetric11111111111111111111111111pump",
    metricId: 1114,
    metricSource: "geckoterminal.token_snapshot",
  });

  assert.equal(preview.enabled, false);
  assert.equal(preview.delivery, "preview_only");
  assert.equal(preview.wouldNotify, true);
  assert.equal(preview.metricId, 1114);
  assert.match(preview.messagePreview ?? "", /Gecko metric appended/);
  assert.match(preview.messagePreview ?? "", /metricId: 1114/);
});

test("keeps blocked ops notification preview send-disabled", () => {
  const preview = buildOpsNotificationPreview({
    trigger: "metric_appended",
    mint: "OpsNotifyBlocked111111111111111111111111pump",
    metricId: null,
    blockedBy: ["metric_append_not_executed"],
  });

  assert.equal(preview.enabled, false);
  assert.equal(preview.wouldNotify, false);
  assert.deepEqual(preview.blockedBy, [
    "metric_append_not_executed",
    "message_preview_unavailable",
  ]);
  assert.equal(preview.messagePreview, null);
});

test("builds loop complete ops notification preview", () => {
  const preview = buildOpsNotificationPreview({
    trigger: "loop_complete",
    mint: "OpsNotifyLoop111111111111111111111111111pump",
    metricId: 1114,
    plannedTokenWrites: 0,
    plannedMetricAppends: 0,
    metricPendingCount: 0,
    latestMetricMissingCount: 0,
    nextRecommendedAction: "no_action",
  });

  assert.equal(preview.wouldNotify, true);
  assert.match(preview.messagePreview ?? "", /Gecko token metric loop complete/);
  assert.match(preview.messagePreview ?? "", /plannedTokenWrites: 0/);
  assert.match(preview.messagePreview ?? "", /next: no_action/);
});
