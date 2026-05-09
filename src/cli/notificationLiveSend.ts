import "dotenv/config";

import { pathToFileURL } from "node:url";

import { db } from "./db.js";
import {
  sendNotificationByKey,
  type NotificationLiveSendTrigger,
} from "../notifications/notificationLiveSend.js";
import { sendOpsTelegramNotification } from "../notify/opsTelegramSender.js";

type Args = {
  notificationKey: string;
  trigger: NotificationLiveSendTrigger;
  live: boolean;
};

class CliUsageError extends Error {}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm notification:send -- --notificationKey <KEY> --trigger metric_appended [--live]",
    "",
    "Defaults:",
    "- dry-run lookup by default; sender is called only with explicit --live",
    "- only metric_appended is supported",
  ].join("\n");
}

function readRequiredValue(argv: string[], index: number, key: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--") || value.trim().length === 0) {
    throw new CliUsageError(`Missing value for ${key}`);
  }
  return value;
}

function parseTrigger(value: string): NotificationLiveSendTrigger {
  if (value === "metric_appended") {
    return value;
  }

  throw new CliUsageError(`Unsupported --trigger: ${value}`);
}

export function parseNotificationLiveSendArgs(argv: string[]): Args {
  const normalizedArgv = argv.filter((value) => value !== "--");
  let notificationKey: string | null = null;
  let trigger: NotificationLiveSendTrigger | null = null;
  let live = false;

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    if (key === "--live") {
      live = true;
      continue;
    }

    if (key === "--notificationKey") {
      notificationKey = readRequiredValue(normalizedArgv, i, key);
      i += 1;
      continue;
    }

    if (key === "--trigger") {
      trigger = parseTrigger(readRequiredValue(normalizedArgv, i, key));
      i += 1;
      continue;
    }

    throw new CliUsageError(`Unknown arg: ${key}`);
  }

  if (notificationKey === null) {
    throw new CliUsageError("Missing --notificationKey");
  }
  if (trigger === null) {
    throw new CliUsageError("Missing --trigger");
  }

  return {
    notificationKey,
    trigger,
    live,
  };
}

export async function runNotificationLiveSendCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseNotificationLiveSendArgs(argv);
  const result = await sendNotificationByKey({
    client: db,
    notificationKey: args.notificationKey,
    trigger: args.trigger,
    live: args.live,
    sender: args.live ? sendOpsTelegramNotification : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runNotificationLiveSendCli().catch((error: unknown) => {
    if (error instanceof CliUsageError) {
      if (error.message.length > 0) {
        console.error(error.message);
      }
      console.error(getUsageText());
      process.exitCode = 1;
      return;
    }

    throw error;
  });
}
