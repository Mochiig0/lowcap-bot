export type OpsNotificationTrigger =
  | "token_completed"
  | "metric_appended"
  | "loop_complete";

export type OpsNotificationPreviewInput = {
  trigger: OpsNotificationTrigger;
  mint: string | null;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  metricId?: number | null;
  metricSource?: string | null;
  plannedTokenWrites?: number | null;
  plannedMetricAppends?: number | null;
  metricPendingCount?: number | null;
  latestMetricMissingCount?: number | null;
  nextRecommendedAction?: string | null;
  blockedBy?: string[];
};

export type OpsNotificationPreview = {
  enabled: false;
  channel: "telegram";
  delivery: "preview_only";
  trigger: OpsNotificationTrigger;
  wouldNotify: boolean;
  mint: string | null;
  metricId: number | null;
  blockedBy: string[];
  messagePreview: string | null;
};

function formatTokenLabel(name: string | null | undefined, symbol: string | null | undefined): string {
  const nameLabel = name && name.trim().length > 0 ? name : "-";
  const symbolLabel = symbol && symbol.trim().length > 0 ? symbol : "-";
  return `${nameLabel} (${symbolLabel})`;
}

function buildMessage(input: OpsNotificationPreviewInput): string | null {
  if (!input.mint) {
    return null;
  }

  if (input.trigger === "token_completed") {
    return [
      "[Lowcap Ops] Gecko token completed",
      `mint: ${input.mint}`,
      `token: ${formatTokenLabel(input.tokenName, input.tokenSymbol)}`,
      "status: token_completed",
    ].join("\n");
  }

  if (input.trigger === "metric_appended") {
    if (input.metricId === null || input.metricId === undefined) {
      return null;
    }

    return [
      "[Lowcap Ops] Gecko metric appended",
      `mint: ${input.mint}`,
      `metricId: ${input.metricId}`,
      `source: ${input.metricSource ?? "-"}`,
      "status: metric_appended",
    ].join("\n");
  }

  return [
    "[Lowcap Ops] Gecko token metric loop complete",
    `mint: ${input.mint}`,
    `metricId: ${input.metricId ?? "-"}`,
    `plannedTokenWrites: ${input.plannedTokenWrites ?? "-"}`,
    `plannedMetricAppends: ${input.plannedMetricAppends ?? "-"}`,
    `metricPendingCount: ${input.metricPendingCount ?? "-"}`,
    `latestMetricMissingCount: ${input.latestMetricMissingCount ?? "-"}`,
    `next: ${input.nextRecommendedAction ?? "-"}`,
  ].join("\n");
}

export function buildOpsNotificationPreview(
  input: OpsNotificationPreviewInput,
): OpsNotificationPreview {
  const messagePreview = buildMessage(input);
  const blockedBy = [
    ...(input.blockedBy ?? []),
    ...(messagePreview === null ? ["message_preview_unavailable"] : []),
  ];

  return {
    enabled: false,
    channel: "telegram",
    delivery: "preview_only",
    trigger: input.trigger,
    wouldNotify: blockedBy.length === 0,
    mint: input.mint,
    metricId: input.metricId ?? null,
    blockedBy,
    messagePreview,
  };
}
