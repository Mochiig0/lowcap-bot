import type {
  OpsNotificationPreview,
  OpsNotificationTrigger,
} from "./opsNotificationPreview.js";

export type OpsNotificationSenderInput = {
  trigger: OpsNotificationTrigger;
  mint: string;
  metricId: number | null;
  message: string;
};

export type OpsNotificationSenderResult = {
  status: "sent" | "failed";
  errorCode?: string | null;
};

export type OpsNotificationSender = (
  input: OpsNotificationSenderInput,
) => Promise<OpsNotificationSenderResult>;

export type OpsNotificationSendResult = {
  trigger: OpsNotificationTrigger | null;
  mint: string | null;
  metricId: number | null;
  status: "sent" | "blocked" | "failed";
  blockedBy: string[];
  errorCode: string | null;
};

export type SendSelectedOpsNotificationPreviewInput = {
  sendRequested: boolean;
  trigger: OpsNotificationTrigger | null;
  previews: OpsNotificationPreview[];
  sender?: OpsNotificationSender;
};

export type SendSelectedOpsNotificationPreviewResult = {
  sendSupported: boolean;
  sentCount: number;
  results: OpsNotificationSendResult[];
};

function blockedResult(input: {
  trigger: OpsNotificationTrigger | null;
  mint?: string | null;
  metricId?: number | null;
  blockedBy: string[];
  sendSupported?: boolean;
}): SendSelectedOpsNotificationPreviewResult {
  return {
    sendSupported: input.sendSupported ?? false,
    sentCount: 0,
    results: [
      {
        trigger: input.trigger,
        mint: input.mint ?? null,
        metricId: input.metricId ?? null,
        status: "blocked",
        blockedBy: input.blockedBy,
        errorCode: null,
      },
    ],
  };
}

export async function sendSelectedOpsNotificationPreview(
  input: SendSelectedOpsNotificationPreviewInput,
): Promise<SendSelectedOpsNotificationPreviewResult> {
  const sendSupported = input.sender !== undefined;

  if (!input.sendRequested) {
    return {
      sendSupported,
      sentCount: 0,
      results: [],
    };
  }

  if (input.trigger === null) {
    return blockedResult({
      trigger: null,
      blockedBy: ["ops_notify_trigger_required"],
      sendSupported,
    });
  }

  const selected = input.previews.filter((preview) => preview.trigger === input.trigger);
  if (selected.length === 0) {
    return blockedResult({
      trigger: input.trigger,
      blockedBy: ["ops_notify_preview_not_found"],
      sendSupported,
    });
  }

  if (selected.length > 1) {
    return blockedResult({
      trigger: input.trigger,
      blockedBy: ["ops_notify_preview_not_single"],
      sendSupported,
    });
  }

  const [preview] = selected;
  const blockedBy = [
    ...preview.blockedBy,
    ...(preview.wouldNotify || preview.blockedBy.length > 0 ? [] : ["ops_notify_preview_not_eligible"]),
    ...(preview.mint === null ? ["mint_missing"] : []),
    ...(preview.messagePreview === null ? ["message_preview_unavailable"] : []),
    ...(sendSupported ? [] : ["ops_notify_sender_not_connected"]),
  ];

  if (blockedBy.length > 0) {
    return {
      sendSupported,
      sentCount: 0,
      results: [
        {
          trigger: preview.trigger,
          mint: preview.mint,
          metricId: preview.metricId,
          status: "blocked",
          blockedBy,
          errorCode: null,
        },
      ],
    };
  }

  const sender = input.sender;
  if (!sender) {
    return blockedResult({
      trigger: preview.trigger,
      mint: preview.mint,
      metricId: preview.metricId,
      blockedBy: ["ops_notify_sender_not_connected"],
      sendSupported,
    });
  }

  try {
    const senderResult = await sender({
      trigger: preview.trigger,
      mint: preview.mint as string,
      metricId: preview.metricId,
      message: preview.messagePreview as string,
    });

    if (senderResult.status === "sent") {
      return {
        sendSupported,
        sentCount: 1,
        results: [
          {
            trigger: preview.trigger,
            mint: preview.mint,
            metricId: preview.metricId,
            status: "sent",
            blockedBy: [],
            errorCode: null,
          },
        ],
      };
    }

    return {
      sendSupported,
      sentCount: 0,
      results: [
        {
          trigger: preview.trigger,
          mint: preview.mint,
          metricId: preview.metricId,
          status: "failed",
          blockedBy: [],
          errorCode: senderResult.errorCode ?? "ops_notify_sender_failed",
        },
      ],
    };
  } catch {
    return {
      sendSupported,
      sentCount: 0,
      results: [
        {
          trigger: preview.trigger,
          mint: preview.mint,
          metricId: preview.metricId,
          status: "failed",
          blockedBy: [],
          errorCode: "ops_notify_sender_threw",
        },
      ],
    };
  }
}
