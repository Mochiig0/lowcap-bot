import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "./db.js";

const ALLOWED_NARRATIVE_CATEGORIES = [
  "animal",
  "news_event",
  "crypto_meta",
  "celebrity",
  "community",
  "tech_utility",
  "parody",
  "phrase",
  "number",
  "other",
  "unknown",
] as const;

const ALLOWED_OUTCOME_LABELS = [
  "watched",
  "skipped",
  "dead",
  "rugged",
  "failed",
  "ran",
  "sustained",
  "missed_opportunity",
  "unknown",
] as const;

export type NarrativeCategory = (typeof ALLOWED_NARRATIVE_CATEGORIES)[number];
export type OutcomeLabel = (typeof ALLOWED_OUTCOME_LABELS)[number];

type TokenObserveClient = Pick<PrismaClient, "token">;

type TokenObserveArgs = {
  mint: string;
  narrativeCategory?: NarrativeCategory;
  whyWatch?: string;
  whySkip?: string;
  outcomeLabel?: OutcomeLabel;
  operatorNote?: string;
};

export type ManualObservation = {
  schemaVersion: 1;
  source: "manual";
  narrativeCategory?: NarrativeCategory;
  whyWatch?: string;
  whySkip?: string;
  outcomeLabel?: OutcomeLabel;
  operatorNote?: string;
  reviewedAt: string;
};

type TokenObserveResult = {
  status: "ok" | "not_found";
  mode: "manual_token_observation_capture";
  mint: string;
  updated: boolean;
  manualObservation: ManualObservation | null;
};

type JsonObject = Record<string, unknown>;

function printUsageAndExit(message?: string, exitCode = 1): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm token:observe -- --mint <MINT> [--narrativeCategory <VALUE>] [--whyWatch <TEXT>] [--whySkip <TEXT>] [--outcomeLabel <VALUE>] [--operatorNote <TEXT>]",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredArg(
  input: Partial<TokenObserveArgs>,
  key: keyof Pick<TokenObserveArgs, "mint">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function readTextArg(value: string, key: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    printUsageAndExit(`Empty value for ${key}`);
  }

  return trimmed;
}

function isNarrativeCategory(value: string): value is NarrativeCategory {
  return (ALLOWED_NARRATIVE_CATEGORIES as readonly string[]).includes(value);
}

function isOutcomeLabel(value: string): value is OutcomeLabel {
  return (ALLOWED_OUTCOME_LABELS as readonly string[]).includes(value);
}

function readNarrativeCategory(value: string): NarrativeCategory {
  if (!isNarrativeCategory(value)) {
    throw new Error(`Invalid narrativeCategory: ${value}`);
  }

  return value;
}

function readOutcomeLabel(value: string): OutcomeLabel {
  if (!isOutcomeLabel(value)) {
    throw new Error(`Invalid outcomeLabel: ${value}`);
  }

  return value;
}

function parseArgs(argv: string[]): TokenObserveArgs {
  const out: Partial<TokenObserveArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--help" || key === "-h") {
      printUsageAndExit(undefined, 0);
    }

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = readTextArg(value, key);
        break;
      case "--narrativeCategory":
        out.narrativeCategory = readNarrativeCategory(value);
        break;
      case "--whyWatch":
        out.whyWatch = readTextArg(value, key);
        break;
      case "--whySkip":
        out.whySkip = readTextArg(value, key);
        break;
      case "--outcomeLabel":
        out.outcomeLabel = readOutcomeLabel(value);
        break;
      case "--operatorNote":
        out.operatorNote = readTextArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  const parsed = {
    ...out,
    mint: readRequiredArg(out, "mint"),
  };

  if (
    parsed.narrativeCategory === undefined &&
    parsed.whyWatch === undefined &&
    parsed.whySkip === undefined &&
    parsed.outcomeLabel === undefined &&
    parsed.operatorNote === undefined
  ) {
    printUsageAndExit("At least one observation field is required");
  }

  return parsed;
}

function readManualObservation(value: unknown): Partial<ManualObservation> {
  if (!isRecord(value)) {
    return {};
  }

  return value as Partial<ManualObservation>;
}

function buildManualObservation(
  existingEntrySnapshot: unknown,
  input: TokenObserveArgs,
  now: Date,
): ManualObservation {
  const existingManualObservation = isRecord(existingEntrySnapshot)
    ? readManualObservation(existingEntrySnapshot.manualObservation)
    : {};

  return {
    ...existingManualObservation,
    ...(input.narrativeCategory !== undefined
      ? { narrativeCategory: input.narrativeCategory }
      : {}),
    ...(input.whyWatch !== undefined ? { whyWatch: input.whyWatch } : {}),
    ...(input.whySkip !== undefined ? { whySkip: input.whySkip } : {}),
    ...(input.outcomeLabel !== undefined ? { outcomeLabel: input.outcomeLabel } : {}),
    ...(input.operatorNote !== undefined ? { operatorNote: input.operatorNote } : {}),
    schemaVersion: 1,
    source: "manual",
    reviewedAt: now.toISOString(),
  };
}

function buildEntrySnapshotWithManualObservation(
  existingEntrySnapshot: unknown,
  manualObservation: ManualObservation,
): Prisma.InputJsonValue {
  const entrySnapshot = isRecord(existingEntrySnapshot)
    ? existingEntrySnapshot
    : {};

  return {
    ...entrySnapshot,
    manualObservation,
  };
}

export function validateManualObservationInput(input: TokenObserveArgs): TokenObserveArgs {
  return {
    ...input,
    narrativeCategory:
      input.narrativeCategory === undefined
        ? undefined
        : readNarrativeCategory(input.narrativeCategory),
    outcomeLabel:
      input.outcomeLabel === undefined
        ? undefined
        : readOutcomeLabel(input.outcomeLabel),
  };
}

export async function captureManualTokenObservation(
  client: TokenObserveClient,
  input: TokenObserveArgs,
  options: { now?: Date } = {},
): Promise<TokenObserveResult> {
  const safeInput = validateManualObservationInput(input);
  const token = await client.token.findUnique({
    where: {
      mint: safeInput.mint,
    },
    select: {
      id: true,
      mint: true,
      entrySnapshot: true,
    },
  });

  if (!token) {
    return {
      status: "not_found",
      mode: "manual_token_observation_capture",
      mint: safeInput.mint,
      updated: false,
      manualObservation: null,
    };
  }

  const manualObservation = buildManualObservation(
    token.entrySnapshot,
    safeInput,
    options.now ?? new Date(),
  );

  await client.token.update({
    where: {
      id: token.id,
    },
    data: {
      entrySnapshot: buildEntrySnapshotWithManualObservation(
        token.entrySnapshot,
        manualObservation,
      ),
    },
    select: {
      id: true,
    },
  });

  return {
    status: "ok",
    mode: "manual_token_observation_capture",
    mint: token.mint,
    updated: true,
    manualObservation,
  };
}

export async function runTokenObserveCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const result = await captureManualTokenObservation(db, args);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runTokenObserveCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
