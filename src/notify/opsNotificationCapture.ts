import { appendFile } from "node:fs/promises";

import type { OpsNotificationPreview } from "./opsNotificationPreview.js";

export type OpsNotificationCaptureRecord = {
  capturedAt: string;
  source: "ops:catchup:gecko";
  channel: "telegram";
  delivery: "capture_only";
  trigger: OpsNotificationPreview["trigger"];
  mint: string | null;
  metricId: number | null;
  message: string;
};

export type OpsNotificationCaptureResult = {
  trigger: OpsNotificationPreview["trigger"];
  mint: string | null;
  metricId: number | null;
  status: "captured" | "skipped";
  blockedBy: string[];
};

export type CaptureOpsNotificationPreviewsInput = {
  captureFile: string;
  capturedAt?: Date;
  previews: OpsNotificationPreview[];
};

export type CaptureOpsNotificationPreviewsResult = {
  capturedCount: number;
  results: OpsNotificationCaptureResult[];
};

function toCaptureResult(preview: OpsNotificationPreview): OpsNotificationCaptureResult {
  return {
    trigger: preview.trigger,
    mint: preview.mint,
    metricId: preview.metricId,
    status: preview.wouldNotify ? "captured" : "skipped",
    blockedBy: preview.blockedBy,
  };
}

function toCaptureRecord(
  preview: OpsNotificationPreview,
  capturedAt: Date,
): OpsNotificationCaptureRecord | null {
  if (!preview.wouldNotify || preview.messagePreview === null) {
    return null;
  }

  return {
    capturedAt: capturedAt.toISOString(),
    source: "ops:catchup:gecko",
    channel: "telegram",
    delivery: "capture_only",
    trigger: preview.trigger,
    mint: preview.mint,
    metricId: preview.metricId,
    message: preview.messagePreview,
  };
}

export async function captureOpsNotificationPreviews(
  input: CaptureOpsNotificationPreviewsInput,
): Promise<CaptureOpsNotificationPreviewsResult> {
  const capturedAt = input.capturedAt ?? new Date();
  const records = input.previews
    .map((preview) => toCaptureRecord(preview, capturedAt))
    .filter((record): record is OpsNotificationCaptureRecord => record !== null);

  if (records.length > 0) {
    await appendFile(
      input.captureFile,
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf-8",
    );
  }

  return {
    capturedCount: records.length,
    results: input.previews.map(toCaptureResult),
  };
}
