import "dotenv/config";

import { pathToFileURL } from "node:url";

import { db } from "./db.js";
import { buildNotificationAutoSendExecution } from "../notifications/notificationAutoSendExecutor.js";
import { sendOpsTelegramNotification } from "../notify/opsTelegramSender.js";

type Args = {
  execute: boolean;
};

class CliUsageError extends Error {}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm notification:auto-send:execute -- [--execute]",
    "",
    "Defaults:",
    "- dry-run/stopped summary by default",
    "- sender can be called only with explicit --execute and NOTIFICATION_AUTO_SEND_ENABLED=true",
    "- scheduler/systemd are not enabled by this command",
  ].join("\n");
}

export function parseNotificationAutoSendExecuteArgs(argv: string[]): Args {
  const normalizedArgv = argv.filter((value) => value !== "--");
  let execute = false;

  for (const arg of normalizedArgv) {
    if (arg === "--help") {
      throw new CliUsageError("");
    }

    if (arg === "--execute") {
      execute = true;
      continue;
    }

    throw new CliUsageError(`Unknown arg: ${arg}`);
  }

  return {
    execute,
  };
}

export async function runNotificationAutoSendExecuteCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseNotificationAutoSendExecuteArgs(argv);
  const result = await buildNotificationAutoSendExecution(db, {
    execute: args.execute,
    sender: args.execute ? sendOpsTelegramNotification : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runNotificationAutoSendExecuteCli().catch((error: unknown) => {
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
