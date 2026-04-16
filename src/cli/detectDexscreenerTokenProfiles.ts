import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

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
const DEFAULT_CHECKPOINT_FILE = "data/checkpoints/dexscreener-token-profiles-latest-v1.json";

type DetectDexscreenerTokenProfilesArgs = {
  file?: string;
  limit: number;
  watch: boolean;
  write: boolean;
  intervalSeconds: number;
  maxIterations?: number;
  checkpointFile?: string;
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

type DetectCycleResult = LoadedInput & {
  cycle: number;
  processedCount: number;
  skippedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  existingCount: number;
  checkpointBefore?: string;
  checkpointAfter?: string;
  checkpointFilteredCount: number;
  items: DetectItemResult[];
};

type CursorValue = {
  value: string;
  timestampMs: number;
};

type SourceEventWithCursor = {
  cursor: CursorValue;
  originalIndex: number;
  sourceEvent: SourceEvent;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm detect:dexscreener:token-profiles [--file <PATH>] [--limit <N>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>] [--checkpointFile <PATH>]",
      "",
      "Defaults:",
      `- fetches ${API_URL}`,
      "- filters to chainId=solana",
      "- evaluates up to --limit 1 items as a dry-run only",
      "- writes accepted items into import:mint only when --write is set",
      "- loops only when --watch is set",
      "- waits --intervalSeconds 1 between watch cycles",
      `- checkpointing defaults to ${DEFAULT_CHECKPOINT_FILE} and is active only with --watch --write`,
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
    watch: false,
    write: false,
    intervalSeconds: 1,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--watch" || key === "--write") {
      if (key === "--watch") {
        out.watch = true;
      } else {
        out.write = true;
      }
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
      case "--intervalSeconds":
        out.intervalSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--maxIterations":
        out.maxIterations = parsePositiveIntegerArg(value, key);
        break;
      case "--checkpointFile":
        out.checkpointFile = value;
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (!out.watch && (argv.includes("--intervalSeconds") || argv.includes("--maxIterations"))) {
    printUsageAndExit("--intervalSeconds and --maxIterations require --watch");
  }

  if (out.checkpointFile && (!out.watch || !out.write)) {
    printUsageAndExit("--checkpointFile requires both --watch and --write");
  }

  return out as DetectDexscreenerTokenProfilesArgs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function isCheckpointEnabled(args: DetectDexscreenerTokenProfilesArgs): boolean {
  return args.watch && args.write;
}

function resolveCheckpointFilePath(args: DetectDexscreenerTokenProfilesArgs): string {
  return resolve(process.cwd(), args.checkpointFile ?? DEFAULT_CHECKPOINT_FILE);
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

function normalizeCursorValue(value: string, context: string): CursorValue {
  const timestampMs = Date.parse(value);
  if (Number.isNaN(timestampMs)) {
    throw new Error(`Invalid checkpoint cursor timestamp in ${context}: ${value}`);
  }

  return {
    value: new Date(timestampMs).toISOString(),
    timestampMs,
  };
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

function readSourceEventCursor(
  sourceEvent: SourceEvent,
  context: string,
): CursorValue {
  const raw = normalizeOptionalString(sourceEvent.payload.updatedAt) ?? sourceEvent.detectedAt;
  return normalizeCursorValue(raw, context);
}

async function readCheckpointCursor(filePath: string): Promise<CursorValue | undefined> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw new Error(
      `Failed to read checkpoint file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Invalid JSON in checkpoint file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const input = ensureObject(
    parsed,
    filePath,
    `Invalid JSON in checkpoint file ${filePath}: expected one object`,
  );
  const source = readRequiredString(input, "source", filePath);
  const cursor = readRequiredString(input, "cursor", filePath);

  if (source !== SOURCE) {
    throw new Error(`Invalid checkpoint file ${filePath}: "source" must be "${SOURCE}"`);
  }

  return normalizeCursorValue(cursor, filePath);
}

async function writeCheckpointCursor(filePath: string, cursor: CursorValue): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        source: SOURCE,
        cursor: cursor.value,
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function logCycleSummary(result: DetectCycleResult): void {
  console.error(
    [
      `[detect:dexscreener:token-profiles] cycle=${result.cycle}`,
      `processed=${result.processedCount}`,
      `accepted=${result.acceptedCount}`,
      `rejected=${result.rejectedCount}`,
      `imported=${result.importedCount}`,
      `existing=${result.existingCount}`,
      `checkpointBefore=${result.checkpointBefore ?? "none"}`,
      `checkpointAfter=${result.checkpointAfter ?? "none"}`,
    ].join(" "),
  );
}

async function loadInput(args: DetectDexscreenerTokenProfilesArgs): Promise<LoadedInput> {
  return args.file ? loadFromFile(resolve(process.cwd(), args.file)) : loadFromApi();
}

async function runCycle(
  args: DetectDexscreenerTokenProfilesArgs,
  cycle: number,
  checkpointBefore?: CursorValue,
): Promise<DetectCycleResult> {
  const input = await loadInput(args);
  const checkpointEnabled = isCheckpointEnabled(args);
  const eventsWithCursor = input.events.map((sourceEvent, originalIndex) => ({
    cursor: readSourceEventCursor(sourceEvent, `cycle ${cycle} item ${originalIndex}`),
    originalIndex,
    sourceEvent,
  })) satisfies SourceEventWithCursor[];
  const eligibleEvents = checkpointEnabled && checkpointBefore
    ? eventsWithCursor.filter((entry) => entry.cursor.timestampMs > checkpointBefore.timestampMs)
    : eventsWithCursor;
  const orderedEvents = checkpointEnabled
    ? [...eligibleEvents].sort((left, right) => {
        if (left.cursor.timestampMs !== right.cursor.timestampMs) {
          return left.cursor.timestampMs - right.cursor.timestampMs;
        }

        return left.originalIndex - right.originalIndex;
      })
    : eligibleEvents;
  const selectedEntries = orderedEvents.slice(0, args.limit);
  const items: DetectItemResult[] = [];
  let importedCount = 0;
  let existingCount = 0;

  for (const [index, entry] of selectedEntries.entries()) {
    const { sourceEvent } = entry;
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

  return {
    ...input,
    cycle,
    processedCount: items.length,
    skippedCount: Math.max(input.solanaCount - items.length, 0),
    acceptedCount,
    rejectedCount: items.length - acceptedCount,
    importedCount,
    existingCount,
    checkpointBefore: checkpointBefore?.value,
    checkpointAfter:
      checkpointEnabled && selectedEntries.length > 0
        ? selectedEntries[selectedEntries.length - 1].cursor.value
        : checkpointBefore?.value,
    checkpointFilteredCount: checkpointEnabled
      ? Math.max(eventsWithCursor.length - eligibleEvents.length, 0)
      : 0,
    items,
  };
}

function buildOutput(
  args: DetectDexscreenerTokenProfilesArgs,
  cycles: DetectCycleResult[],
  checkpointFilePath: string | undefined,
  initialCheckpointCursor: string | undefined,
  finalCheckpointCursor: string | undefined,
): Record<string, unknown> {
  const flattenedItems = cycles.flatMap((cycle) => cycle.items);
  const firstCycle = cycles[0];
  const checkpointEnabled = isCheckpointEnabled(args);

  return {
    dryRun: !args.write,
    writeEnabled: args.write,
    watchEnabled: args.watch,
    checkpointEnabled,
    ...(checkpointFilePath ? { checkpointFile: checkpointFilePath } : {}),
    ...(checkpointEnabled
      ? {
          checkpointBefore: initialCheckpointCursor,
          checkpointAfter: finalCheckpointCursor,
          checkpointUpdated: initialCheckpointCursor !== finalCheckpointCursor,
        }
      : {}),
    mode: firstCycle?.mode ?? (args.file ? "file" : "fetch"),
    ...(firstCycle?.file ? { file: firstCycle.file } : {}),
    ...(firstCycle?.apiUrl ? { apiUrl: firstCycle.apiUrl } : {}),
    source: SOURCE,
    eventType: EVENT_TYPE,
    requestedLimit: args.limit,
    ...(args.watch ? { intervalSeconds: args.intervalSeconds } : {}),
    ...(args.watch && args.maxIterations ? { maxIterations: args.maxIterations } : {}),
    cycleCount: cycles.length,
    inputCount: cycles.reduce((sum, cycle) => sum + cycle.inputCount, 0),
    solanaCount: cycles.reduce((sum, cycle) => sum + cycle.solanaCount, 0),
    processedCount: cycles.reduce((sum, cycle) => sum + cycle.processedCount, 0),
    skippedCount: cycles.reduce((sum, cycle) => sum + cycle.skippedCount, 0),
    acceptedCount: cycles.reduce((sum, cycle) => sum + cycle.acceptedCount, 0),
    rejectedCount: cycles.reduce((sum, cycle) => sum + cycle.rejectedCount, 0),
    importedCount: cycles.reduce((sum, cycle) => sum + cycle.importedCount, 0),
    existingCount: cycles.reduce((sum, cycle) => sum + cycle.existingCount, 0),
    items: flattenedItems,
    ...(args.watch
      ? {
          cycles: cycles.map((cycle) => ({
            cycle: cycle.cycle,
            inputCount: cycle.inputCount,
            solanaCount: cycle.solanaCount,
            processedCount: cycle.processedCount,
            skippedCount: cycle.skippedCount,
            acceptedCount: cycle.acceptedCount,
            rejectedCount: cycle.rejectedCount,
            importedCount: cycle.importedCount,
            existingCount: cycle.existingCount,
            checkpointBefore: cycle.checkpointBefore,
            checkpointAfter: cycle.checkpointAfter,
            checkpointFilteredCount: cycle.checkpointFilteredCount,
            items: cycle.items,
          })),
        }
      : {}),
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const cycles: DetectCycleResult[] = [];
  const shouldCollectCycles = !args.watch || args.maxIterations !== undefined;
  const watchIterationCount = args.watch ? (args.maxIterations ?? Number.POSITIVE_INFINITY) : 1;
  const checkpointEnabled = isCheckpointEnabled(args);
  const checkpointFilePath = checkpointEnabled ? resolveCheckpointFilePath(args) : undefined;
  let checkpointCursor = checkpointFilePath
    ? await readCheckpointCursor(checkpointFilePath)
    : undefined;
  const initialCheckpointCursor = checkpointCursor?.value;

  for (let cycle = 1; cycle <= watchIterationCount; cycle += 1) {
    const result = await runCycle(args, cycle, checkpointCursor);

    if (
      checkpointEnabled &&
      checkpointFilePath &&
      result.checkpointAfter &&
      result.checkpointAfter !== checkpointCursor?.value
    ) {
      checkpointCursor = normalizeCursorValue(result.checkpointAfter, checkpointFilePath);
      await writeCheckpointCursor(checkpointFilePath, checkpointCursor);
    }

    if (shouldCollectCycles) {
      cycles.push(result);
    }

    if (args.watch) {
      logCycleSummary(result);
    }

    if (!args.watch || cycle === watchIterationCount) {
      break;
    }

    await sleep(args.intervalSeconds * 1000);
  }

  console.log(
    JSON.stringify(
      buildOutput(
        args,
        cycles,
        checkpointFilePath,
        initialCheckpointCursor,
        checkpointCursor?.value,
      ),
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
