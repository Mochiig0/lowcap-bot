import { appendFile } from "node:fs/promises";

export type ScoreNotifyMessageInput = {
  title: string;
  mint: string;
  name: string | null;
  symbol: string | null;
  scoreTotal: number;
  groupKey?: string | null;
};

export function buildScoreNotifyMessage(input: ScoreNotifyMessageInput): string {
  const nameLabel =
    input.name && input.name.trim().length > 0 ? input.name : "-";
  const symbolLabel =
    input.symbol && input.symbol.trim().length > 0 ? input.symbol : "-";

  return [
    `[Lowcap MVP] ${input.title}`,
    `mint: ${input.mint}`,
    `name: ${nameLabel} (${symbolLabel})`,
    `score: ${input.scoreTotal}`,
    `group: ${input.groupKey ?? "-"}`,
  ].join("\n");
}

export async function notifyTelegram(message: string): Promise<boolean> {
  const captureFile = process.env.LOWCAP_TELEGRAM_CAPTURE_FILE;
  if (captureFile) {
    await appendFile(
      captureFile,
      `${JSON.stringify({ message, capturedAt: new Date().toISOString() })}\n`,
      "utf-8",
    );
    return true;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Skipping Telegram notification: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing.");
    return false;
  }

  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram notify failed (${res.status}): ${body}`);
  }

  return true;
}
