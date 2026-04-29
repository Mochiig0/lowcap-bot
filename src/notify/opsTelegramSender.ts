import type {
  OpsNotificationSenderInput,
  OpsNotificationSenderResult,
} from "./opsNotificationSendGate.js";
import { request as httpsRequest } from "node:https";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";

export type OpsTelegramSenderDeps = {
  env?: Record<string, string | undefined>;
  request?: HttpsRequest;
  timeoutMs?: number;
  transport?: OpsTelegramTransport;
};

const TELEGRAM_API_HOSTNAME = "api.telegram.org";
const TELEGRAM_SEND_TIMEOUT_MS = 10_000;
const TELEGRAM_TIMEOUT_ERROR_CODE = "telegram_request_timeout";
const TELEGRAM_RESPONSE_BODY_LIMIT = 64 * 1024;

type HttpsRequest = (
  options: RequestOptions,
  callback: (res: IncomingMessage) => void,
) => ClientRequest;

export type OpsTelegramTransportRequest = {
  hostname: string;
  path: string;
  method: "POST";
  family: 4;
  timeoutMs: number;
  headers: Record<string, string>;
  body: string;
};

export type OpsTelegramTransportResult = {
  ok: boolean;
  statusCode: number | null;
};

export type OpsTelegramTransport = (
  request: OpsTelegramTransportRequest,
) => Promise<OpsTelegramTransportResult>;

export function createHttpsOpsTelegramTransport(input: {
  request?: HttpsRequest;
  timeoutMs?: number;
} = {}): OpsTelegramTransport {
  const requestImpl = input.request ?? httpsRequest;
  const timeoutMs = input.timeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS;

  return async (transportRequest) =>
    new Promise<OpsTelegramTransportResult>((resolve, reject) => {
      const req = requestImpl(
        {
          hostname: transportRequest.hostname,
          path: transportRequest.path,
          method: transportRequest.method,
          family: transportRequest.family,
          timeout: timeoutMs,
          headers: transportRequest.headers,
        },
        (res) => {
          const chunks: Buffer[] = [];
          let bodyTooLarge = false;

          res.on("data", (chunk: Buffer | string) => {
            const next = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            const currentSize = chunks.reduce((sum, item) => sum + item.length, 0);
            if (currentSize + next.length > TELEGRAM_RESPONSE_BODY_LIMIT) {
              bodyTooLarge = true;
              return;
            }
            chunks.push(next);
          });

          res.on("end", () => {
            const statusCode = res.statusCode ?? null;
            const statusOk = statusCode !== null && statusCode >= 200 && statusCode < 300;
            const rawBody = bodyTooLarge ? "" : Buffer.concat(chunks).toString("utf-8");
            const telegramOk = parseTelegramOk(rawBody);

            resolve({
              ok: telegramOk ?? statusOk,
              statusCode,
            });
          });
        },
      );

      req.on("timeout", () => {
        req.destroy(Object.assign(new Error("Telegram request timed out"), {
          code: TELEGRAM_TIMEOUT_ERROR_CODE,
        }));
      });
      req.on("error", reject);
      req.write(transportRequest.body);
      req.end();
    });
}

function parseTelegramOk(rawBody: string): boolean | null {
  if (rawBody.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawBody) as { ok?: unknown };
    return typeof parsed.ok === "boolean" ? parsed.ok : null;
  } catch {
    return null;
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === TELEGRAM_TIMEOUT_ERROR_CODE
  );
}

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

  const transport =
    deps.transport ??
    createHttpsOpsTelegramTransport({
      request: deps.request,
      timeoutMs: deps.timeoutMs,
    });
  const body = JSON.stringify({
    chat_id: chatId,
    text: input.message,
    disable_web_page_preview: true,
  });

  try {
    const res = await transport({
      hostname: TELEGRAM_API_HOSTNAME,
      path: `/bot${token}/sendMessage`,
      method: "POST",
      family: 4,
      timeoutMs: deps.timeoutMs ?? TELEGRAM_SEND_TIMEOUT_MS,
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(body)),
      },
      body,
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
  } catch (error) {
    if (isTimeoutError(error)) {
      return {
        status: "failed",
        errorCode: "telegram_timeout",
      };
    }

    return {
      status: "failed",
      errorCode: "telegram_network_error",
    };
  }
}
