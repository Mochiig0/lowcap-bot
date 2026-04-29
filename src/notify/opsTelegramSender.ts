import type {
  OpsNotificationSenderInput,
  OpsNotificationSenderResult,
} from "./opsNotificationSendGate.js";

export type OpsTelegramSenderDeps = {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
};

const TELEGRAM_SEND_MESSAGE_URL_PREFIX = "https://api.telegram.org/bot";

export async function sendOpsTelegramNotification(
  input: OpsNotificationSenderInput,
  deps: OpsTelegramSenderDeps = {},
): Promise<OpsNotificationSenderResult> {
  const env = deps.env ?? process.env;
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      status: "failed",
      errorCode: "telegram_credentials_missing",
    };
  }

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    return {
      status: "failed",
      errorCode: "telegram_fetch_unavailable",
    };
  }

  try {
    const res = await fetchImpl(`${TELEGRAM_SEND_MESSAGE_URL_PREFIX}${token}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: input.message,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      return {
        status: "failed",
        errorCode: "telegram_response_not_ok",
      };
    }

    return {
      status: "sent",
    };
  } catch {
    return {
      status: "failed",
      errorCode: "telegram_network_error",
    };
  }
}
