import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http";
import test from "node:test";

import {
  sendOpsTelegramNotification,
  type OpsTelegramTransport,
} from "../src/notify/opsTelegramSender.ts";

const input = {
  trigger: "token_completed" as const,
  mint: "OpsTelegramSender111111111111111111111111pump",
  metricId: null,
  message: "safe message",
};

const env = {
  TELEGRAM_BOT_TOKEN: "secret-token",
  TELEGRAM_CHAT_ID: "secret-chat",
};

function buildTransport(result: { ok: boolean; statusCode: number | null }): OpsTelegramTransport {
  return async () => result;
}

function timeoutError(): Error & { code: string } {
  return Object.assign(new Error("timeout"), { code: "telegram_request_timeout" });
}

function assertSafeResult(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes(env.TELEGRAM_BOT_TOKEN), false);
  assert.equal(serialized.includes(env.TELEGRAM_CHAT_ID), false);
  assert.equal(serialized.includes("do not expose this body"), false);
  assert.equal(serialized.includes("TELEGRAM_BOT_TOKEN"), false);
  assert.equal(serialized.includes("TELEGRAM_CHAT_ID"), false);
}

test("ops Telegram sender returns credentials missing before calling transport", async () => {
  let transportCalled = false;

  const result = await sendOpsTelegramNotification(input, {
    env: {},
    transport: async () => {
      transportCalled = true;
      return { ok: true, statusCode: 200 };
    },
  });

  assert.deepEqual(result, {
    status: "failed",
    errorCode: "telegram_credentials_missing",
  });
  assert.equal(transportCalled, false);
  assertSafeResult(result);
});

test("ops Telegram sender maps injected transport outcomes to safe results", async () => {
  const success = await sendOpsTelegramNotification(input, {
    env,
    transport: buildTransport({ ok: true, statusCode: 200 }),
  });
  assert.deepEqual(success, { status: "sent" });

  const responseFailure = await sendOpsTelegramNotification(input, {
    env,
    transport: buildTransport({ ok: false, statusCode: 500 }),
  });
  assert.deepEqual(responseFailure, {
    status: "failed",
    errorCode: "telegram_response_not_ok",
  });

  const networkFailure = await sendOpsTelegramNotification(input, {
    env,
    transport: async () => {
      throw new Error("network down");
    },
  });
  assert.deepEqual(networkFailure, {
    status: "failed",
    errorCode: "telegram_network_error",
  });

  const timeoutFailure = await sendOpsTelegramNotification(input, {
    env,
    transport: async () => {
      throw timeoutError();
    },
  });
  assert.deepEqual(timeoutFailure, {
    status: "failed",
    errorCode: "telegram_timeout",
  });

  assertSafeResult(success);
  assertSafeResult(responseFailure);
  assertSafeResult(networkFailure);
  assertSafeResult(timeoutFailure);
});

test("ops Telegram sender default transport uses injected https.request shape", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("global fetch must not be used");
  };

  const requestCalls: Array<{
    options: RequestOptions;
    body: string;
  }> = [];

  try {
    const result = await sendOpsTelegramNotification(input, {
      env,
      request: (options, callback) => {
        const req = new EventEmitter() as EventEmitter & {
          body: string;
          write: (chunk: string) => boolean;
          end: () => void;
          destroy: (error?: Error) => ClientRequest;
        };
        req.body = "";
        req.write = (chunk) => {
          req.body += chunk;
          return true;
        };
        req.end = () => {
          requestCalls.push({ options, body: req.body });
          const res = new EventEmitter() as IncomingMessage;
          res.statusCode = 200;
          callback(res);
          res.emit("data", "{\"ok\":true}");
          res.emit("end");
        };
        req.destroy = (error) => {
          if (error) {
            req.emit("error", error);
          }
          return req as unknown as ClientRequest;
        };
        return req as unknown as ClientRequest;
      },
    });

    assert.deepEqual(result, { status: "sent" });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(requestCalls.length, 1);
  assert.equal(requestCalls[0]?.options.hostname, "api.telegram.org");
  assert.equal(requestCalls[0]?.options.method, "POST");
  assert.equal(requestCalls[0]?.options.family, 4);
  assert.equal(requestCalls[0]?.options.path, "/botsecret-token/sendMessage");
  assert.equal(requestCalls[0]?.options.timeout, 10_000);
  assert.equal(requestCalls[0]?.options.headers?.["content-type"], "application/json");

  const body = JSON.parse(requestCalls[0]?.body ?? "{}") as Record<string, unknown>;
  assert.deepEqual(body, {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: input.message,
    disable_web_page_preview: true,
  });
});
