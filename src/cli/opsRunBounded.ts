import "dotenv/config";

import { pathToFileURL } from "node:url";

import { db } from "./db.js";
import { readBoundedOperationPlannerInput } from "../ops/boundedOperationPlanner.js";
import {
  DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS,
  runBoundedOperationRunner,
  type BoundedOperationRunnerOptions,
} from "../ops/boundedOperationRunner.js";

type CliArgs = Omit<BoundedOperationRunnerOptions, "repoRoot"> & {
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
    "pnpm ops:run:bounded -- [--hours <N>] [--pumpOnly] [--checkpointFile <PATH>] [--metricLimit <N>] [--enrichLimit <N>] [--postRunMetricCycles <N>] [--postRunEnrichCycles <N>] [--intervalSeconds <N>] [--maxIterations <N>] [--postRunBufferMinutes <N>] [--interItemDelayMs <N>] [--execute] [--json]",
    "",
    "Default-safe bounded 6H pipeline runner. Without --execute it only plans:",
    "detect write -> metric pending snapshot -> enrich/rescore -> report review -> notification planner review.",
    "Post-run metric/enrich cycles default to 1 each; set a cycle count to 0 to skip that phase.",
    "",
    "--execute is required before any production fetch/write can run. Notification send, retry execution,",
    "auto live send, scheduler, systemd, rawJson full dump, and pnpm smoke are not part of this runner.",
    "When --execute is used, --checkpointFile is required and must be outside the repo.",
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

function parseNonNegativeInteger(value: string, key: string): number {
  if (value.trim().length === 0) {
    throw new CliUsageError(`Missing value for ${key}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliUsageError(`Invalid non-negative integer for ${key}: ${value}`);
  }
  return parsed;
}

export function parseOpsRunBoundedArgs(argv: string[]): CliArgs {
  const normalized = argv.filter((arg) => arg !== "--");
  const out: Partial<CliArgs> = {
    hours: DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.hours,
    pumpOnly: false,
    metricLimit: DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.metricLimit,
    enrichLimit: DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.enrichLimit,
    intervalSeconds: DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.intervalSeconds,
    postRunBufferMinutes:
      DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.postRunBufferMinutes,
    interItemDelayMs: DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.interItemDelayMs,
    postRunMetricCycles:
      DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.postRunMetricCycles,
    postRunEnrichCycles:
      DEFAULT_BOUNDED_OPERATION_RUNNER_OPTIONS.postRunEnrichCycles,
    executeRequested: false,
    json: false,
  };

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

    if (key === "--execute") {
      out.executeRequested = true;
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
      case "--checkpointFile":
        out.checkpointFile = value;
        break;
      case "--metricLimit":
        out.metricLimit = parsePositiveInteger(value, key);
        break;
      case "--enrichLimit":
        out.enrichLimit = parsePositiveInteger(value, key);
        break;
      case "--postRunMetricCycles":
        out.postRunMetricCycles = parseNonNegativeInteger(value, key);
        break;
      case "--postRunEnrichCycles":
        out.postRunEnrichCycles = parseNonNegativeInteger(value, key);
        break;
      case "--intervalSeconds":
        out.intervalSeconds = parsePositiveInteger(value, key);
        break;
      case "--maxIterations":
        out.maxIterations = parsePositiveInteger(value, key);
        break;
      case "--postRunBufferMinutes":
        out.postRunBufferMinutes = parseNonNegativeInteger(value, key);
        break;
      case "--interItemDelayMs":
        out.interItemDelayMs = parseNonNegativeInteger(value, key);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return out as CliArgs;
}

export async function runOpsRunBoundedCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseOpsRunBoundedArgs(argv);
  const input = await readBoundedOperationPlannerInput(db, {
    hours: args.hours,
    sinceHours: args.hours,
    limit: args.metricLimit,
    pumpOnly: args.pumpOnly,
    postRunPlan: true,
    metricLimit: args.metricLimit,
    enrichLimit: args.enrichLimit,
  });
  const report = await runBoundedOperationRunner(input, {
    ...args,
    repoRoot: process.cwd(),
  });
  console.log(JSON.stringify(report, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runOpsRunBoundedCli().catch((error: unknown) => {
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
