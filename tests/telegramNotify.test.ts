import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildScoreNotifyMessage,
  notifyTelegram,
} from "../src/notify/telegram.ts";

type TelegramEnvSnapshot = {
  captureFile?: string;
  token?: string;
  chatId?: string;
};

function snapshotTelegramEnv(): TelegramEnvSnapshot {
  return {
    captureFile: process.env.LOWCAP_TELEGRAM_CAPTURE_FILE,
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  };
}

function restoreTelegramEnv(snapshot: TelegramEnvSnapshot): void {
  if (snapshot.captureFile === undefined) {
    delete process.env.LOWCAP_TELEGRAM_CAPTURE_FILE;
  } else {
    process.env.LOWCAP_TELEGRAM_CAPTURE_FILE = snapshot.captureFile;
  }

  if (snapshot.token === undefined) {
    delete process.env.TELEGRAM_BOT_TOKEN;
  } else {
    process.env.TELEGRAM_BOT_TOKEN = snapshot.token;
  }

  if (snapshot.chatId === undefined) {
    delete process.env.TELEGRAM_CHAT_ID;
  } else {
    process.env.TELEGRAM_CHAT_ID = snapshot.chatId;
  }
}

test("telegram notify boundary", async (t) => {
  const envSnapshot = snapshotTelegramEnv();
  const tempDir = await mkdtemp(join(tmpdir(), "lowcap-telegram-notify-"));

  t.after(async () => {
    restoreTelegramEnv(envSnapshot);
    await rm(tempDir, { recursive: true, force: true });
  });

  await t.test("captures messages locally when LOWCAP_TELEGRAM_CAPTURE_FILE is set", async () => {
    const captureFilePath = join(tempDir, "telegram-capture.jsonl");
    await writeFile(captureFilePath, "", "utf-8");

    process.env.LOWCAP_TELEGRAM_CAPTURE_FILE = captureFilePath;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const result = await notifyTelegram("captured message");

    assert.equal(result, true);

    const lines = (await readFile(captureFilePath, "utf-8"))
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);

    assert.equal(lines.length, 1);

    const parsed = JSON.parse(lines[0]) as {
      message?: string;
      capturedAt?: string;
    };

    assert.equal(parsed.message, "captured message");
    assert.equal(typeof parsed.capturedAt, "string");
    assert.equal(Number.isNaN(Date.parse(parsed.capturedAt ?? "")), false);
  });

  await t.test("returns false and warns when capture path and credentials are both missing", async () => {
    delete process.env.LOWCAP_TELEGRAM_CAPTURE_FILE;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map((value) => String(value)).join(" "));
    };

    try {
      const result = await notifyTelegram("no credentials");

      assert.equal(result, false);
      assert.equal(warnings.length, 1);
      assert.match(
        warnings[0],
        /Skipping Telegram notification: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing\./,
      );
    } finally {
      console.warn = originalWarn;
    }
  });

  await t.test("builds a stable score notification message shape", () => {
    const message = buildScoreNotifyMessage({
      title: "S rank candidate",
      mint: "So11111111111111111111111111111111111111112",
      name: "Alpha Token",
      symbol: "ALPHA",
      scoreTotal: 8,
      groupKey: null,
    });

    assert.match(message, /^\[Lowcap MVP\] S rank candidate/m);
    assert.match(message, /mint: So11111111111111111111111111111111111111112/);
    assert.match(message, /name: Alpha Token \(ALPHA\)/);
    assert.match(message, /score: 8/);
    assert.match(message, /group: -/);
  });
});
