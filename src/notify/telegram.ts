export async function notifyTelegram(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn("Skipping Telegram notification: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing.");
    return;
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
}
