import "dotenv/config";

import { pathToFileURL } from "node:url";

import { db } from "./db.js";
import { buildNotificationAutoSendPlan } from "../notifications/notificationAutoSendPlanner.js";

export async function runNotificationAutoSendPlanCli(): Promise<void> {
  const result = await buildNotificationAutoSendPlan(db);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runNotificationAutoSendPlanCli().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
