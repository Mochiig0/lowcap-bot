import "dotenv/config";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { db } from "./db.js";
import {
  importMint,
  type FirstSeenSourceSnapshot,
  type ImportMintResult,
} from "./importMintShared.js";
import {
  buildGeckoterminalNewPoolsDetectorCandidate,
  GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
  GECKOTERMINAL_NEW_POOLS_SOURCE,
  type GeckoterminalNewPoolsDetectorCandidate,
} from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import {
  evaluateDetectorCandidate,
  type AcceptResult,
  type RejectResult,
} from "../scoring/evaluateDetectorCandidate.js";

const API_URL =
  "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token,quote_token,dex";
const DEFAULT_CHECKPOINT_FILE = "data/checkpoints/geckoterminal-new-pools.json";
const LOG_PREFIX = "[detect:geckoterminal:new-pools]";
const RATE_LIMIT_RETRY_DELAY_MS = 3_000;
const DEFAULT_FAILURE_COOLDOWN_MS = 30_000;

let injectedFetchErrorConsumed = false;
let injectedFetchErrorRemainingCount: number | undefined;

type DetectGeckoterminalNewPoolsArgs = {
  file?: string;
  write: boolean;
  watch: boolean;
  intervalSeconds: number;
  maxIterations?: number;
  checkpointFile?: string;
};

type JsonObject = Record<string, unknown>;

type ParsedPage = {
  data: JsonObject[];
  included: JsonObject[];
};

type CursorValue = {
  poolCreatedAt: string;
  poolAddress: string;
  timestampMs: number;
};

type LoadedInput = {
  mode: "fetch" | "file";
  file?: string;
  apiUrl?: string;
  inputCount: number;
  entries: CandidateEntry[];
};

type CandidateEntry = {
  originalIndex: number;
  candidate: GeckoterminalNewPoolsDetectorCandidate;
  cursor: CursorValue;
};

type MinimalHandoffPayload = {
  mint: string;
  source?: string;
  firstSeenSourceSnapshot?: FirstSeenSourceSnapshot;
};

type DetectItemResult = {
  index: number;
  detectedAt: string;
  mintAddress: string;
  poolCreatedAt?: unknown;
  dexName?: unknown;
  poolAddress?: unknown;
  detectorResult: AcceptResult | RejectResult;
  handoffPayload?: MinimalHandoffPayload;
  importResult?: ImportMintResult;
};

type CheckpointCursorView = {
  poolCreatedAt: string;
  poolAddress: string;
};

type DetectCycleResult = LoadedInput & {
  cycle: number;
  failed: boolean;
  errorMessage?: string;
  rateLimitRetried: boolean;
  rateLimitRetrySucceeded: boolean;
  failureCooldownApplied: boolean;
  failureCooldownSeconds: number;
  processedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  importedCount: number;
  existingCount: number;
  checkpointBefore?: CheckpointCursorView;
  checkpointAfter?: CheckpointCursorView;
  checkpointFilteredCount: number;
  items: DetectItemResult[];
};

type OneShotOutput = {
  mode: "fetch" | "file";
  file?: string;
  apiUrl?: string;
  dryRun: boolean;
  writeEnabled: boolean;
  source: string;
  eventType: string;
  detectedAt: string;
  mintAddress: string;
  poolCreatedAt?: unknown;
  dexName?: unknown;
  poolAddress?: unknown;
  handoffPayload?: MinimalHandoffPayload;
  importResult?: ImportMintResult;
  detectorResult: AcceptResult | RejectResult;
};

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm detect:geckoterminal:new-pools [--file <PATH>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>] [--checkpointFile <PATH>]",
    "",
    "Defaults:",
    `- fetches ${API_URL}`,
    "- reads one local raw response instead when --file is set",
    "- one-shot mode reads the first Solana new_pools item only",
    "- watch mode evaluates the current page item set each cycle",
    "- stays dry-run by default",
    "- writes accepted items into import:mint only when --write is set",
    "- loops only when --watch is set",
    "- waits --intervalSeconds 1 between watch cycles",
    "- watch mode adds extra cooldown only after failed 429 or timeout-like cycles",
    `- checkpointing defaults to ${DEFAULT_CHECKPOINT_FILE} and is active only with --watch --write`,
  ].join("\n");
}

function printUsageAndExit(message?: string): never {
  throw new CliUsageError(message ?? "");
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

function parseArgs(argv: string[]): DetectGeckoterminalNewPoolsArgs {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: Partial<DetectGeckoterminalNewPoolsArgs> = {
    write: false,
    watch: false,
    intervalSeconds: 1,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    if (key === "--write" || key === "--watch") {
      if (key === "--write") {
        out.write = true;
      } else {
        out.watch = true;
      }
      continue;
    }

    const value = normalizedArgv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--file":
        out.file = value;
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

  return out as DetectGeckoterminalNewPoolsArgs;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof CliUsageError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function ensureObject(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as JsonObject;
}

function parseRawPage(raw: unknown, context: string): ParsedPage {
  const input = ensureObject(raw, context);
  const dataRaw = input.data;
  const includedRaw = input.included;

  if (!Array.isArray(dataRaw)) {
    throw new Error(`${context}.data must be an array`);
  }

  if (!Array.isArray(includedRaw)) {
    throw new Error(`${context}.included must be an array`);
  }

  return {
    data: dataRaw.map((item, index) => ensureObject(item, `${context}.data[${index}]`)),
    included: includedRaw.map((item, index) =>
      ensureObject(item, `${context}.included[${index}]`),
    ),
  };
}

function normalizeCursorValue(
  poolCreatedAt: string,
  poolAddress: string,
  context: string,
): CursorValue {
  if (typeof poolCreatedAt !== "string" || poolCreatedAt.trim().length === 0) {
    throw new Error(`Invalid checkpoint cursor poolCreatedAt in ${context}`);
  }

  if (typeof poolAddress !== "string" || poolAddress.trim().length === 0) {
    throw new Error(`Invalid checkpoint cursor poolAddress in ${context}`);
  }

  const timestampMs = Date.parse(poolCreatedAt);
  if (Number.isNaN(timestampMs)) {
    throw new Error(`Invalid checkpoint cursor poolCreatedAt in ${context}: ${poolCreatedAt}`);
  }

  return {
    poolCreatedAt: new Date(timestampMs).toISOString(),
    poolAddress,
    timestampMs,
  };
}

function toCheckpointCursorView(cursor?: CursorValue): CheckpointCursorView | undefined {
  return cursor
    ? {
        poolCreatedAt: cursor.poolCreatedAt,
        poolAddress: cursor.poolAddress,
      }
    : undefined;
}

function compareCursor(left: CursorValue, right: CursorValue): number {
  if (left.timestampMs !== right.timestampMs) {
    return left.timestampMs - right.timestampMs;
  }

  return left.poolAddress.localeCompare(right.poolAddress);
}

function formatCursorForLog(cursor?: CheckpointCursorView): string {
  return cursor ? `${cursor.poolCreatedAt}|${cursor.poolAddress}` : "none";
}

function getApiUrl(): string {
  return process.env.GECKOTERMINAL_NEW_POOLS_API_URL ?? API_URL;
}

function isRateLimitErrorMessage(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("429 Too Many Requests");
}

function isFailureCooldownErrorMessage(message: string | undefined): boolean {
  if (typeof message !== "string") {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("429 too many requests") ||
    normalized.includes("aborted due to timeout") ||
    normalized.includes("operation was aborted") ||
    normalized.includes("timeout")
  );
}

function parsePositiveIntegerEnv(value: string | undefined, key: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid integer for ${key}: ${value}`);
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer for ${key}: ${value}`);
  }

  return parsed;
}

function getFailureCooldownMs(): number {
  const overrideSeconds = parsePositiveIntegerEnv(
    process.env.LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS,
    "LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS",
  );
  return (overrideSeconds ?? DEFAULT_FAILURE_COOLDOWN_MS / 1000) * 1000;
}

function isCheckpointEnabled(args: DetectGeckoterminalNewPoolsArgs): boolean {
  return args.watch && args.write;
}

function resolveCheckpointFilePath(args: DetectGeckoterminalNewPoolsArgs): string {
  return resolve(process.cwd(), args.checkpointFile ?? DEFAULT_CHECKPOINT_FILE);
}

async function fetchLiveRaw(): Promise<unknown> {
  const injectedErrorMessage = process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_ONCE;
  const injectedErrorCount = parsePositiveIntegerEnv(
    process.env.GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_COUNT,
    "GECKOTERMINAL_NEW_POOLS_FETCH_ERROR_COUNT",
  );

  if (injectedFetchErrorRemainingCount === undefined) {
    injectedFetchErrorRemainingCount = injectedErrorCount;
  }

  if (injectedErrorCount !== undefined) {
    injectedFetchErrorConsumed = true;
  }

  const shouldInjectCountError =
    injectedErrorMessage &&
    injectedFetchErrorRemainingCount !== undefined &&
    injectedFetchErrorRemainingCount > 0;

  if (shouldInjectCountError) {
    const remainingCount = injectedFetchErrorRemainingCount ?? 0;
    injectedFetchErrorRemainingCount = remainingCount - 1;
    throw new Error(injectedErrorMessage);
  }

  if (injectedErrorMessage && !injectedFetchErrorConsumed) {
    injectedFetchErrorConsumed = true;
    throw new Error(injectedErrorMessage);
  }

  const response = await fetch(getApiUrl(), {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GeckoTerminal request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as unknown;
}

async function readRawFromFile(filePath: string): Promise<unknown> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as unknown;
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

  const input = ensureObject(parsed, `checkpoint file ${filePath}`);
  const source = input.source;
  const cursor = ensureObject(input.cursor, `checkpoint file ${filePath}.cursor`);

  if (source !== GECKOTERMINAL_NEW_POOLS_SOURCE) {
    throw new Error(
      `Invalid checkpoint file ${filePath}: "source" must be "${GECKOTERMINAL_NEW_POOLS_SOURCE}"`,
    );
  }

  return normalizeCursorValue(
    typeof cursor.poolCreatedAt === "string" ? cursor.poolCreatedAt : "",
    typeof cursor.poolAddress === "string" ? cursor.poolAddress : "",
    filePath,
  );
}

async function writeCheckpointCursor(filePath: string, cursor: CursorValue): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(
      {
        source: GECKOTERMINAL_NEW_POOLS_SOURCE,
        cursor: toCheckpointCursorView(cursor),
      },
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

function readCandidateCursor(
  candidate: GeckoterminalNewPoolsDetectorCandidate,
  context: string,
): CursorValue {
  return normalizeCursorValue(
    typeof candidate.payload.poolCreatedAt === "string" ? candidate.payload.poolCreatedAt : "",
    typeof candidate.payload.poolAddress === "string" ? candidate.payload.poolAddress : "",
    context,
  );
}

function buildCandidateEntries(
  page: ParsedPage,
  detectedAt: string,
  context: string,
): CandidateEntry[] {
  return page.data.map((dataItem, index) => {
    const raw = {
      data: [dataItem],
      included: page.included,
    };
    const candidate = buildGeckoterminalNewPoolsDetectorCandidate(raw, detectedAt);

    return {
      originalIndex: index,
      candidate,
      cursor: readCandidateCursor(candidate, `${context} item ${index}`),
    };
  });
}

async function loadInput(
  args: DetectGeckoterminalNewPoolsArgs,
  cycle: number,
): Promise<LoadedInput> {
  const mode = args.file ? "file" : "fetch";
  const raw = args.file ? await readRawFromFile(args.file) : await fetchLiveRaw();
  const page = parseRawPage(raw, mode === "file" ? args.file ?? "file" : API_URL);
  const detectedAt = new Date().toISOString();

  return {
    mode,
    ...(args.file ? { file: args.file } : {}),
    ...(!args.file ? { apiUrl: getApiUrl() } : {}),
    inputCount: page.data.length,
    entries: buildCandidateEntries(page, detectedAt, `cycle ${cycle}`),
  };
}

function buildMinimalHandoffPayload(
  candidate: GeckoterminalNewPoolsDetectorCandidate,
  result: AcceptResult,
): MinimalHandoffPayload {
  return {
    mint: result.mint,
    source: result.source,
    firstSeenSourceSnapshot: {
      source: candidate.source,
      detectedAt: candidate.detectedAt,
      poolCreatedAt:
        typeof candidate.payload.poolCreatedAt === "string"
          ? candidate.payload.poolCreatedAt
          : undefined,
      poolAddress:
        typeof candidate.payload.poolAddress === "string"
          ? candidate.payload.poolAddress
          : undefined,
      dexName:
        typeof candidate.payload.dexName === "string"
          ? candidate.payload.dexName
          : undefined,
      baseTokenAddress:
        typeof candidate.payload.baseTokenAddress === "string"
          ? candidate.payload.baseTokenAddress
          : undefined,
      quoteTokenAddress:
        typeof candidate.payload.quoteTokenAddress === "string"
          ? candidate.payload.quoteTokenAddress
          : undefined,
    },
  };
}

async function buildDetectItemResult(
  entry: CandidateEntry,
  index: number,
  writeEnabled: boolean,
): Promise<DetectItemResult> {
  const detectorResult = evaluateDetectorCandidate(entry.candidate);
  const item: DetectItemResult = {
    index,
    detectedAt: entry.candidate.detectedAt,
    mintAddress: entry.candidate.payload.mintAddress,
    poolCreatedAt: entry.candidate.payload.poolCreatedAt,
    dexName: entry.candidate.payload.dexName,
    poolAddress: entry.candidate.payload.poolAddress,
    detectorResult,
  };

  if (detectorResult.ok) {
    item.handoffPayload = buildMinimalHandoffPayload(entry.candidate, detectorResult);

    if (writeEnabled) {
      item.importResult = await importMint(item.handoffPayload);
    }
  }

  return item;
}

function buildOneShotOutput(
  input: LoadedInput,
  item: DetectItemResult,
  writeEnabled: boolean,
): OneShotOutput {
  return {
    mode: input.mode,
    file: input.file,
    apiUrl: input.apiUrl,
    dryRun: !writeEnabled,
    writeEnabled,
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
    detectedAt: item.detectedAt,
    mintAddress: item.mintAddress,
    poolCreatedAt: item.poolCreatedAt,
    dexName: item.dexName,
    poolAddress: item.poolAddress,
    handoffPayload: item.handoffPayload,
    importResult: item.importResult,
    detectorResult: item.detectorResult,
  };
}

async function runOneShot(args: DetectGeckoterminalNewPoolsArgs): Promise<OneShotOutput> {
  const input = await loadInput(args, 1);

  if (input.entries.length === 0) {
    throw new Error("GeckoTerminal new_pools returned no items");
  }

  const item = await buildDetectItemResult(input.entries[0], 0, args.write);
  return buildOneShotOutput(input, item, args.write);
}

async function runCycle(
  args: DetectGeckoterminalNewPoolsArgs,
  cycle: number,
  checkpointBefore?: CursorValue,
): Promise<DetectCycleResult> {
  const input = await loadInput(args, cycle);
  const checkpointEnabled = isCheckpointEnabled(args);
  const eligibleEntries =
    checkpointEnabled && checkpointBefore
      ? input.entries.filter((entry) => compareCursor(entry.cursor, checkpointBefore) > 0)
      : input.entries;
  const orderedEntries = checkpointEnabled
    ? [...eligibleEntries].sort((left, right) => compareCursor(left.cursor, right.cursor))
    : eligibleEntries;
  const items: DetectItemResult[] = [];
  let importedCount = 0;
  let existingCount = 0;

  for (const [index, entry] of orderedEntries.entries()) {
    const item = await buildDetectItemResult(entry, index, args.write);

    if (item.importResult) {
      if (item.importResult.created) {
        importedCount += 1;
      } else {
        existingCount += 1;
      }
    }

    items.push(item);
  }

  const acceptedCount = items.filter((item) => item.detectorResult.ok).length;

  return {
    ...input,
    cycle,
    failed: false,
    rateLimitRetried: false,
    rateLimitRetrySucceeded: false,
    failureCooldownApplied: false,
    failureCooldownSeconds: 0,
    processedCount: items.length,
    acceptedCount,
    rejectedCount: items.length - acceptedCount,
    importedCount,
    existingCount,
    checkpointBefore: toCheckpointCursorView(checkpointBefore),
    checkpointAfter:
      checkpointEnabled && orderedEntries.length > 0
        ? toCheckpointCursorView(orderedEntries[orderedEntries.length - 1].cursor)
        : toCheckpointCursorView(checkpointBefore),
    checkpointFilteredCount: checkpointEnabled
      ? Math.max(input.entries.length - eligibleEntries.length, 0)
      : 0,
    items,
  };
}

function createFailedCycleResult(
  args: DetectGeckoterminalNewPoolsArgs,
  cycle: number,
  checkpointBefore: CursorValue | undefined,
  error: unknown,
): DetectCycleResult {
  return {
    mode: args.file ? "file" : "fetch",
    ...(args.file ? { file: args.file } : {}),
    ...(!args.file ? { apiUrl: getApiUrl() } : {}),
    inputCount: 0,
    entries: [],
    cycle,
    failed: true,
    errorMessage: formatErrorMessage(error),
    rateLimitRetried: false,
    rateLimitRetrySucceeded: false,
    failureCooldownApplied: false,
    failureCooldownSeconds: 0,
    processedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    importedCount: 0,
    existingCount: 0,
    checkpointBefore: toCheckpointCursorView(checkpointBefore),
    checkpointAfter: toCheckpointCursorView(checkpointBefore),
    checkpointFilteredCount: 0,
    items: [],
  };
}

function logCycleSummary(result: DetectCycleResult): void {
  console.error(
    [
      `${LOG_PREFIX} cycle=${result.cycle}`,
      `failed=${result.failed}`,
      `processed=${result.processedCount}`,
      `rateLimitRetried=${result.rateLimitRetried}`,
      `rateLimitRetrySucceeded=${result.rateLimitRetrySucceeded}`,
      `failureCooldownApplied=${result.failureCooldownApplied}`,
      `failureCooldownSeconds=${result.failureCooldownSeconds}`,
      `accepted=${result.acceptedCount}`,
      `rejected=${result.rejectedCount}`,
      `imported=${result.importedCount}`,
      `existing=${result.existingCount}`,
      `checkpointBefore=${formatCursorForLog(result.checkpointBefore)}`,
      `checkpointAfter=${formatCursorForLog(result.checkpointAfter)}`,
      ...(result.errorMessage ? [`error=${JSON.stringify(result.errorMessage)}`] : []),
    ].join(" "),
  );
}

function buildWatchOutput(
  args: DetectGeckoterminalNewPoolsArgs,
  cycles: DetectCycleResult[],
  checkpointFilePath: string | undefined,
  initialCheckpointCursor: CheckpointCursorView | undefined,
  finalCheckpointCursor: CheckpointCursorView | undefined,
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
          checkpointUpdated:
            JSON.stringify(initialCheckpointCursor ?? null) !==
            JSON.stringify(finalCheckpointCursor ?? null),
        }
      : {}),
    rateLimitRetryCount: cycles.filter((cycle) => cycle.rateLimitRetried).length,
    rateLimitRetrySuccessCount: cycles.filter((cycle) => cycle.rateLimitRetrySucceeded).length,
    failureCooldownCount: cycles.filter((cycle) => cycle.failureCooldownApplied).length,
    failureCooldownSeconds: getFailureCooldownMs() / 1000,
    mode: firstCycle?.mode ?? (args.file ? "file" : "fetch"),
    ...(firstCycle?.file ? { file: firstCycle.file } : {}),
    ...(firstCycle?.apiUrl ? { apiUrl: firstCycle.apiUrl } : {}),
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
    ...(args.watch ? { intervalSeconds: args.intervalSeconds } : {}),
    ...(args.watch && args.maxIterations ? { maxIterations: args.maxIterations } : {}),
    cycleCount: cycles.length,
    failedCount: cycles.filter((cycle) => cycle.failed).length,
    inputCount: cycles.reduce((sum, cycle) => sum + cycle.inputCount, 0),
    processedCount: cycles.reduce((sum, cycle) => sum + cycle.processedCount, 0),
    acceptedCount: cycles.reduce((sum, cycle) => sum + cycle.acceptedCount, 0),
    rejectedCount: cycles.reduce((sum, cycle) => sum + cycle.rejectedCount, 0),
    importedCount: cycles.reduce((sum, cycle) => sum + cycle.importedCount, 0),
    existingCount: cycles.reduce((sum, cycle) => sum + cycle.existingCount, 0),
    items: flattenedItems,
    cycles: cycles.map((cycle) => ({
      cycle: cycle.cycle,
      failed: cycle.failed,
      errorMessage: cycle.errorMessage,
      rateLimitRetried: cycle.rateLimitRetried,
      rateLimitRetrySucceeded: cycle.rateLimitRetrySucceeded,
      failureCooldownApplied: cycle.failureCooldownApplied,
      failureCooldownSeconds: cycle.failureCooldownSeconds,
      inputCount: cycle.inputCount,
      processedCount: cycle.processedCount,
      acceptedCount: cycle.acceptedCount,
      rejectedCount: cycle.rejectedCount,
      importedCount: cycle.importedCount,
      existingCount: cycle.existingCount,
      checkpointBefore: cycle.checkpointBefore,
      checkpointAfter: cycle.checkpointAfter,
      checkpointFilteredCount: cycle.checkpointFilteredCount,
      items: cycle.items,
    })),
  };
}

async function runWatch(args: DetectGeckoterminalNewPoolsArgs): Promise<Record<string, unknown>> {
  const cycles: DetectCycleResult[] = [];
  const shouldCollectCycles = args.maxIterations !== undefined;
  const watchIterationCount = args.maxIterations ?? Number.POSITIVE_INFINITY;
  const checkpointEnabled = isCheckpointEnabled(args);
  const checkpointFilePath = checkpointEnabled ? resolveCheckpointFilePath(args) : undefined;
  const failureCooldownMs = getFailureCooldownMs();
  let checkpointCursor = checkpointFilePath
    ? await readCheckpointCursor(checkpointFilePath)
    : undefined;
  const initialCheckpointCursor = toCheckpointCursorView(checkpointCursor);

  for (let cycle = 1; cycle <= watchIterationCount; cycle += 1) {
    let result: DetectCycleResult;

    try {
      result = await runCycle(args, cycle, checkpointCursor);

      if (
        checkpointEnabled &&
        checkpointFilePath &&
        result.checkpointAfter &&
        (
          checkpointCursor === undefined ||
          compareCursor(
            normalizeCursorValue(
              result.checkpointAfter.poolCreatedAt,
              result.checkpointAfter.poolAddress,
              checkpointFilePath,
            ),
            checkpointCursor,
          ) > 0
        )
      ) {
        checkpointCursor = normalizeCursorValue(
          result.checkpointAfter.poolCreatedAt,
          result.checkpointAfter.poolAddress,
          checkpointFilePath,
        );
        await writeCheckpointCursor(checkpointFilePath, checkpointCursor);
      }
    } catch (error) {
      if (!args.file && isRateLimitErrorMessage(formatErrorMessage(error))) {
        await sleep(RATE_LIMIT_RETRY_DELAY_MS);

        try {
          result = await runCycle(args, cycle, checkpointCursor);
          result.rateLimitRetried = true;
          result.rateLimitRetrySucceeded = true;

          if (
            checkpointEnabled &&
            checkpointFilePath &&
            result.checkpointAfter &&
            (
              checkpointCursor === undefined ||
              compareCursor(
                normalizeCursorValue(
                  result.checkpointAfter.poolCreatedAt,
                  result.checkpointAfter.poolAddress,
                  checkpointFilePath,
                ),
                checkpointCursor,
              ) > 0
            )
          ) {
            checkpointCursor = normalizeCursorValue(
              result.checkpointAfter.poolCreatedAt,
              result.checkpointAfter.poolAddress,
              checkpointFilePath,
            );
            await writeCheckpointCursor(checkpointFilePath, checkpointCursor);
          }
        } catch (retryError) {
          result = createFailedCycleResult(args, cycle, checkpointCursor, retryError);
          result.rateLimitRetried = true;
          result.rateLimitRetrySucceeded = false;
        }
      } else {
        result = createFailedCycleResult(args, cycle, checkpointCursor, error);
      }
    }

    if (result.failed && isFailureCooldownErrorMessage(result.errorMessage)) {
      result.failureCooldownApplied = true;
      result.failureCooldownSeconds = failureCooldownMs / 1000;
    }

    if (shouldCollectCycles) {
      cycles.push(result);
    }

    logCycleSummary(result);

    if (cycle === watchIterationCount) {
      break;
    }

    await sleep(
      args.intervalSeconds * 1000 +
        (result.failureCooldownApplied ? failureCooldownMs : 0),
    );
  }

  return buildWatchOutput(
    args,
    cycles,
    checkpointFilePath,
    initialCheckpointCursor,
    toCheckpointCursorView(checkpointCursor),
  );
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const output = args.watch ? await runWatch(args) : await runOneShot(args);
  console.log(JSON.stringify(output, null, 2));
}

run()
  .catch((error: unknown) => {
    if (error instanceof CliUsageError) {
      if (error.message) {
        console.error(`Error: ${error.message}`);
      }
      console.log(getUsageText());
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
