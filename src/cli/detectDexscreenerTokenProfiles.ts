import "dotenv/config";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db } from "./db.js";
import { importMint, type ImportMintResult } from "./importMintShared.js";
import {
  evaluateDetectorCandidate,
  type AcceptResult,
  type DetectorCandidate,
  type RejectResult,
} from "../scoring/evaluateDetectorCandidate.js";

const SOURCE = "dexscreener-token-profiles-latest-v1";
const EVENT_TYPE = "token_detected";
const API_URL = "https://api.dexscreener.com/token-profiles/latest/v1";

type DetectDexscreenerTokenProfilesArgs = {
  file?: string;
  limit: number;
  write: boolean;
};

type SourceEvent = {
  source: string;
  eventType: string;
  detectedAt: string;
  payload: {
    mintAddress: string;
    [key: string]: unknown;
  };
};

type DexscreenerTokenProfile = Record<string, unknown> & {
  chainId?: unknown;
  tokenAddress?: unknown;
  updatedAt?: unknown;
};

type LoadedInput = {
  mode: "fetch" | "file";
  file?: string;
  apiUrl?: string;
  inputCount: number;
  solanaCount: number;
  events: SourceEvent[];
};

type MinimalHandoffPayload = {
  mint: string;
  source?: string;
};

type DetectItemResult = {
  index: number;
  sourceEvent: SourceEvent;
  detectorCandidate: DetectorCandidate;
  detectorResult: AcceptResult | RejectResult;
  handoffPayload?: MinimalHandoffPayload;
  importResult?: ImportMintResult;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm detect:dexscreener:token-profiles [--file <PATH>] [--limit <N>] [--write]",
      "",
      "Defaults:",
      `- fetches ${API_URL}`,
      "- filters to chainId=solana",
      "- evaluates up to --limit 1 items as a dry-run only",
      "- writes accepted items into import:mint only when --write is set",
    ].join("\n"),
  );
  process.exit(1);
}

function parsePositiveIntegerArg(value: string, key: string): number {
  if (value.trim().length === 0) {
    printUsageAndExit(`Invalid integer for ${key}: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid integer for ${key}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): DetectDexscreenerTokenProfilesArgs {
  const out: Partial<DetectDexscreenerTokenProfilesArgs> = {
    limit: 1,
    write: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--write") {
      out.write = true;
      continue;
    }

    if (!key.startsWith("--")) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--file":
        out.file = value;
        break;
      case "--limit":
        out.limit = parsePositiveIntegerArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out as DetectDexscreenerTokenProfilesArgs;
}

function ensureObject(
  value: unknown,
  context: string,
  errorMessage: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    printUsageAndExit(errorMessage);
  }

  return value as Record<string, unknown>;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = normalizeOptionalString(input[key]);
  if (!value) {
    printUsageAndExit(`Invalid payload in ${context}: "${key}" must be a non-empty string`);
  }

  return value;
}

function looksLikeSourceEvent(input: Record<string, unknown>): boolean {
  return "source" in input || "eventType" in input || "detectedAt" in input || "payload" in input;
}

function isSolanaRawProfile(item: DexscreenerTokenProfile): boolean {
  return normalizeOptionalString(item.chainId) === "solana";
}

function isSolanaSourceEvent(event: SourceEvent): boolean {
  const chainId = normalizeOptionalString(event.payload.chainId);
  return chainId === undefined || chainId === "solana";
}

function parseSourceEventInput(
  input: Record<string, unknown>,
  context: string,
): SourceEvent {
  const payload = ensureObject(
    input.payload,
    context,
    `Invalid payload in ${context}: "payload" must be an object`,
  );
  const source = readRequiredString(input, "source", context);
  const eventType = readRequiredString(input, "eventType", context);
  const detectedAt = readRequiredString(input, "detectedAt", context);
  const mintAddress = readRequiredString(payload, "mintAddress", context);

  if (source !== SOURCE) {
    printUsageAndExit(`Invalid payload in ${context}: "source" must be "${SOURCE}"`);
  }

  if (eventType !== EVENT_TYPE) {
    printUsageAndExit(`Invalid payload in ${context}: "eventType" must be "${EVENT_TYPE}"`);
  }

  return {
    source,
    eventType,
    detectedAt,
    payload: {
      ...payload,
      mintAddress,
    },
  };
}

function normalizeRawProfileToSourceEvent(
  item: DexscreenerTokenProfile,
  fallbackDetectedAt: string,
): SourceEvent {
  const mintAddress = normalizeOptionalString(item.tokenAddress) ?? "";
  const detectedAt = normalizeOptionalString(item.updatedAt) ?? fallbackDetectedAt;

  return {
    source: SOURCE,
    eventType: EVENT_TYPE,
    detectedAt,
    payload: {
      ...item,
      mintAddress,
    },
  };
}

function parseRawProfilesArray(
  parsed: unknown,
  context: string,
  fallbackDetectedAt: string,
): LoadedInput {
  if (!Array.isArray(parsed)) {
    printUsageAndExit(`Invalid JSON in ${context}: expected an array response`);
  }

  const rawProfiles = parsed.map((item, index) =>
    ensureObject(
      item,
      context,
      `Invalid JSON in ${context}: item ${index} must be an object`,
    ) as DexscreenerTokenProfile,
  );
  const solanaProfiles = rawProfiles.filter(isSolanaRawProfile);

  return {
    mode: "file",
    file: context,
    inputCount: rawProfiles.length,
    solanaCount: solanaProfiles.length,
    events: solanaProfiles.map((item) =>
      normalizeRawProfileToSourceEvent(item, fallbackDetectedAt),
    ),
  };
}

async function loadFromFile(filePath: string): Promise<LoadedInput> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      printUsageAndExit(`File not found: ${filePath}`);
    }

    printUsageAndExit(
      `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    printUsageAndExit(
      `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const fallbackDetectedAt = new Date().toISOString();

  if (Array.isArray(parsed)) {
    return parseRawProfilesArray(parsed, filePath, fallbackDetectedAt);
  }

  const input = ensureObject(
    parsed,
    filePath,
    `Invalid JSON in ${filePath}: expected one source event object or one raw profile object`,
  );

  if (looksLikeSourceEvent(input)) {
    const sourceEvent = parseSourceEventInput(input, filePath);
    const events = isSolanaSourceEvent(sourceEvent) ? [sourceEvent] : [];

    return {
      mode: "file",
      file: filePath,
      inputCount: 1,
      solanaCount: events.length,
      events,
    };
  }

  const rawProfile = input as DexscreenerTokenProfile;
  const events = isSolanaRawProfile(rawProfile)
    ? [normalizeRawProfileToSourceEvent(rawProfile, fallbackDetectedAt)]
    : [];

  return {
    mode: "file",
    file: filePath,
    inputCount: 1,
    solanaCount: events.length,
    events,
  };
}

async function loadFromApi(): Promise<LoadedInput> {
  const response = await fetch(API_URL, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed: ${response.status} ${response.statusText}`);
  }

  const parsed = (await response.json()) as unknown;
  const fallbackDetectedAt = new Date().toISOString();

  if (!Array.isArray(parsed)) {
    throw new Error("DexScreener response was not an array");
  }

  const rawProfiles = parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`DexScreener response item ${index} was not an object`);
    }

    return item as DexscreenerTokenProfile;
  });
  const solanaProfiles = rawProfiles.filter(isSolanaRawProfile);

  return {
    mode: "fetch",
    apiUrl: API_URL,
    inputCount: rawProfiles.length,
    solanaCount: solanaProfiles.length,
    events: solanaProfiles.map((item) =>
      normalizeRawProfileToSourceEvent(item, fallbackDetectedAt),
    ),
  };
}

function buildDetectorCandidate(sourceEvent: SourceEvent): DetectorCandidate {
  return {
    candidateKind: "source_event_hint",
    source: sourceEvent.source,
    eventType: sourceEvent.eventType,
    detectedAt: sourceEvent.detectedAt,
    payload: {
      mintAddress: sourceEvent.payload.mintAddress,
    },
  };
}

function buildMinimalHandoffPayload(result: AcceptResult): MinimalHandoffPayload {
  return result.source ? { mint: result.mint, source: result.source } : { mint: result.mint };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const input = args.file
    ? await loadFromFile(resolve(process.cwd(), args.file))
    : await loadFromApi();
  const selectedEvents = input.events.slice(0, args.limit);
  const items: DetectItemResult[] = [];
  let importedCount = 0;
  let existingCount = 0;

  for (const [index, sourceEvent] of selectedEvents.entries()) {
    const detectorCandidate = buildDetectorCandidate(sourceEvent);
    const detectorResult = evaluateDetectorCandidate(detectorCandidate);
    const item: DetectItemResult = {
      index,
      sourceEvent,
      detectorCandidate,
      detectorResult,
    };

    if (detectorResult.ok) {
      item.handoffPayload = buildMinimalHandoffPayload(detectorResult);

      if (args.write) {
        item.importResult = await importMint(item.handoffPayload);
        if (item.importResult.created) {
          importedCount += 1;
        } else {
          existingCount += 1;
        }
      }
    }

    items.push(item);
  }

  const acceptedCount = items.filter((item) => item.detectorResult.ok).length;
  const rejectedCount = items.length - acceptedCount;

  console.log(
    JSON.stringify(
      {
        dryRun: !args.write,
        writeEnabled: args.write,
        mode: input.mode,
        ...(input.file ? { file: input.file } : {}),
        ...(input.apiUrl ? { apiUrl: input.apiUrl } : {}),
        source: SOURCE,
        eventType: EVENT_TYPE,
        requestedLimit: args.limit,
        inputCount: input.inputCount,
        solanaCount: input.solanaCount,
        processedCount: items.length,
        skippedCount: Math.max(input.solanaCount - items.length, 0),
        acceptedCount,
        rejectedCount,
        importedCount,
        existingCount,
        items,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
}).finally(async () => {
  await db.$disconnect();
});
