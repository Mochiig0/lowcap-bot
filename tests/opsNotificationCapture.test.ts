import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { captureOpsNotificationPreviews } from "../src/notify/opsNotificationCapture.ts";
import { buildOpsNotificationPreview } from "../src/notify/opsNotificationPreview.ts";

test("captures eligible ops notification previews as JSONL without Telegram delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-ops-notify-capture-"));
  try {
    const captureFile = join(dir, "ops-notify.jsonl");
    const result = await captureOpsNotificationPreviews({
      captureFile,
      capturedAt: new Date("2026-04-29T00:00:00.000Z"),
      previews: [
        buildOpsNotificationPreview({
          trigger: "metric_appended",
          mint: "OpsCaptureMetric111111111111111111111111pump",
          metricId: 1114,
          metricSource: "geckoterminal.token_snapshot",
        }),
      ],
    });

    assert.equal(result.capturedCount, 1);
    assert.deepEqual(result.results, [
      {
        trigger: "metric_appended",
        mint: "OpsCaptureMetric111111111111111111111111pump",
        metricId: 1114,
        status: "captured",
        blockedBy: [],
      },
    ]);

    const lines = (await readFile(captureFile, "utf-8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.deepEqual(lines, [
      {
        capturedAt: "2026-04-29T00:00:00.000Z",
        source: "ops:catchup:gecko",
        channel: "telegram",
        delivery: "capture_only",
        trigger: "metric_appended",
        mint: "OpsCaptureMetric111111111111111111111111pump",
        metricId: 1114,
        message: [
          "[Lowcap Ops] Gecko metric appended",
          "mint: OpsCaptureMetric111111111111111111111111pump",
          "metricId: 1114",
          "source: geckoterminal.token_snapshot",
          "status: metric_appended",
        ].join("\n"),
      },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("skips blocked ops notification previews without creating capture output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-ops-notify-capture-"));
  try {
    const captureFile = join(dir, "ops-notify.jsonl");
    const result = await captureOpsNotificationPreviews({
      captureFile,
      capturedAt: new Date("2026-04-29T00:00:00.000Z"),
      previews: [
        buildOpsNotificationPreview({
          trigger: "metric_appended",
          mint: "OpsCaptureBlocked1111111111111111111111pump",
          metricId: null,
          blockedBy: ["metric_append_not_executed"],
        }),
      ],
    });

    assert.equal(result.capturedCount, 0);
    assert.deepEqual(result.results, [
      {
        trigger: "metric_appended",
        mint: "OpsCaptureBlocked1111111111111111111111pump",
        metricId: null,
        status: "skipped",
        blockedBy: ["metric_append_not_executed", "message_preview_unavailable"],
      },
    ]);
    await assert.rejects(readFile(captureFile, "utf-8"), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
