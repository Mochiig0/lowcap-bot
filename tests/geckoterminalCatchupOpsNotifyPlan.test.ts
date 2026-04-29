import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeckoCatchupSupervisorPlan,
  parseGeckoCatchupSupervisorArgs,
} from "../src/cli/geckoterminalCatchupSupervisor.ts";

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
  assert.equal(output.opsNotifyPlan.sendSupported, false);
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
