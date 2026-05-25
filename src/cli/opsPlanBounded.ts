import "dotenv/config";

import { pathToFileURL } from "node:url";

import { db } from "./db.js";
import {
  buildBoundedOperationPlan,
  readBoundedOperationPlannerInput,
  type BoundedOperationPlannerOptions,
} from "../ops/boundedOperationPlanner.js";

const DEFAULT_HOURS = 6;
const DEFAULT_LIMIT = 20;

type CliArgs = BoundedOperationPlannerOptions & {
  json: boolean;
};

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function usage(): string {
  return [
    "Usage:",
    "pnpm ops:plan:bounded -- [--hours <N>] [--sinceHours <N>] [--limit <N>] [--pumpOnly] [--json]",
    "",
    "Read-only 6H bounded operation planner. It reads DB, queue, auto-send, and retry state,",
    "then prints the next recommended operator step plus command candidates without writes,",
    "external fetches, Telegram sends, Notification updates, scheduler, or systemd changes.",
  ].join("\n");
}

function parsePositiveNumber(value: string, key: string): number {
  if (value.trim().length === 0) {
    throw new CliUsageError(`Missing value for ${key}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliUsageError(`Invalid positive number for ${key}: ${value}`);
  }

  return parsed;
}

function parsePositiveInteger(value: string, key: string): number {
  const parsed = parsePositiveNumber(value, key);
  if (!Number.isInteger(parsed)) {
    throw new CliUsageError(`Invalid positive integer for ${key}: ${value}`);
  }
  return parsed;
}

export function parseOpsPlanBoundedArgs(argv: string[]): CliArgs {
  const normalized = argv.filter((arg) => arg !== "--");
  const out: Partial<CliArgs> = {
    hours: DEFAULT_HOURS,
    limit: DEFAULT_LIMIT,
    pumpOnly: false,
    json: false,
  };
  let sinceHoursExplicit = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const key = normalized[index];

    if (!key.startsWith("--")) {
      throw new CliUsageError(`Unknown arg: ${key}`);
    }

    if (key === "--help") {
      console.log(usage());
      process.exit(0);
    }

    if (key === "--pumpOnly") {
      out.pumpOnly = true;
      continue;
    }

    if (key === "--json") {
      out.json = true;
      continue;
    }

    const value = normalized[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Missing value for ${key}`);
    }

    switch (key) {
      case "--hours":
        out.hours = parsePositiveNumber(value, key);
        break;
      case "--sinceHours":
        out.sinceHours = parsePositiveNumber(value, key);
        sinceHoursExplicit = true;
        break;
      case "--limit":
        out.limit = parsePositiveInteger(value, key);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  if (!sinceHoursExplicit) {
    out.sinceHours = out.hours;
  }

  return out as CliArgs;
}

export async function runOpsPlanBoundedCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseOpsPlanBoundedArgs(argv);
  const input = await readBoundedOperationPlannerInput(db, args);
  const plan = buildBoundedOperationPlan(input, args);
  console.log(JSON.stringify(plan, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runOpsPlanBoundedCli().catch((error: unknown) => {
    if (error instanceof CliUsageError) {
      console.error(`Error: ${error.message}`);
      console.error(usage());
      process.exitCode = 1;
      return;
    }

    console.error(error);
    process.exitCode = 1;
  });
}
