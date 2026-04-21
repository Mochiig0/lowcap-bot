import "dotenv/config";

import { readFile } from "node:fs/promises";

import {
  buildGeckoterminalNewPoolsDetectorCandidate,
  GECKOTERMINAL_NEW_POOLS_SOURCE,
} from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";
import {
  evaluateDetectorCandidate,
  type AcceptResult,
  type DetectorCandidate,
} from "../scoring/evaluateDetectorCandidate.js";

const GECKOTERMINAL_API_URL =
  "https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1&include=base_token,quote_token,dex";
const DEXSCREENER_API_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const DEXSCREENER_SOURCE = "dexscreener-token-profiles-latest-v1";
const DEXSCREENER_EVENT_TYPE = "token_detected";

type Args = {
  geckoFile?: string;
  dexFile?: string;
  timeoutSeconds: number;
  intervalSeconds: number;
  recheckAfterSeconds?: number;
  recheckSampleLimit: number;
};

type JsonObject = Record<string, unknown>;

type DexscreenerTokenProfile = Record<string, unknown> & {
  chainId?: unknown;
  tokenAddress?: unknown;
  updatedAt?: unknown;
};

type DexSourceEvent = {
  source: string;
  eventType: string;
  detectedAt: string;
  payload: {
    mintAddress: string;
    chainId?: unknown;
    [key: string]: unknown;
  };
};

type NativeTimeSample = {
  mint: string;
  geckoPoolCreatedAt: string | null;
  dexUpdatedAt: string | null;
};

type RecheckSample = {
  mint: string;
  initialGeckoPoolCreatedAt: string | null;
  laterDexUpdatedAt: string | null;
};

type ComparisonOutput = {
  readOnly: true;
  geckoApiUrl: string;
  dexscreenerApiUrl: string;
  selection: {
    geckoMode: "fetch" | "file";
    geckoFile: string | null;
    dexMode: "poll" | "file";
    dexFile: string | null;
    geckoDetectedAt: string;
    dexCollectionStartedAt: string;
    dexCollectionCompletedAt: string;
    timeoutSeconds: number;
    intervalSeconds: number;
    recheckAfterSeconds: number | null;
    recheckSampleLimit: number;
    dexPollCount: number;
    elapsedMs: number;
  };
  geckoPoolCreatedAtMin: string | null;
  geckoPoolCreatedAtMax: string | null;
  dexUpdatedAtMin: string | null;
  dexUpdatedAtMax: string | null;
  geckoCount: number;
  dexCount: number;
  overlapCount: number;
  onlyGeckoCount: number;
  onlyDexCount: number;
  recheckedMintCount: number;
  laterSeenOnDexCount: number;
  stillOnlyGeckoCount: number;
  overlapMints: string[];
  onlyGeckoMints: string[];
  onlyDexMints: string[];
  laterSeenOnDexMints: string[];
  stillOnlyGeckoMints: string[];
  representativeSamples: {
    overlap: NativeTimeSample[];
    onlyGecko: NativeTimeSample[];
    onlyDex: NativeTimeSample[];
  };
  recheckRepresentativeSamples: {
    laterSeenOnDex: RecheckSample[];
    stillOnlyGecko: RecheckSample[];
  };
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
    "pnpm compare:coverage:geckoterminal:dexscreener [--geckoFile <PATH>] [--dexFile <PATH>] [--timeoutSeconds <N>] [--intervalSeconds <N>] [--recheckAfterSeconds <N>] [--recheckSampleLimit <N>]",
    "",
    "Defaults:",
    `- fetches one live GeckoTerminal new_pools page from ${GECKOTERMINAL_API_URL}`,
    `- polls DexScreener token profiles latest v1 from ${DEXSCREENER_API_URL}`,
    "- stays read-only and does not write, checkpoint, or hand off into import:mint",
    "- compares unique accepted candidate mints only",
    "- defaults to --timeoutSeconds 60 and --intervalSeconds 15",
    "- optional recheck mode waits before one more Dex collection for a small onlyGecko sample",
    "- if --geckoFile or --dexFile is set, that source is read from file instead of live fetch",
  ].join("\n");
}

function parsePositiveIntegerArg(value: string, key: string): number {
  if (value.trim().length === 0) {
    throw new CliUsageError(`Invalid integer for ${key}: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliUsageError(`Invalid integer for ${key}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): Args {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: Args = {
    timeoutSeconds: 60,
    intervalSeconds: 15,
    recheckSampleLimit: 3,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];
    if (key === "--help") {
      throw new CliUsageError("");
    }

    const value = normalizedArgv[i + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Unknown arg: ${key}`);
    }

    switch (key) {
      case "--geckoFile":
        out.geckoFile = value;
        break;
      case "--dexFile":
        out.dexFile = value;
        break;
      case "--timeoutSeconds":
        out.timeoutSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--intervalSeconds":
        out.intervalSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--recheckAfterSeconds":
        out.recheckAfterSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--recheckSampleLimit":
        out.recheckSampleLimit = parsePositiveIntegerArg(value, key);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function ensureObject(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as JsonObject;
}

function readRequiredString(input: JsonObject, key: string, context: string): string {
  const value = normalizeOptionalString(input[key]);
  if (!value) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }

  return value;
}

function normalizeOptionalIsoDateString(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function buildGeckoRawForIndex(raw: unknown, index: number): unknown {
  const input = ensureObject(raw, "raw");
  const dataRaw = input.data;
  const includedRaw = input.included;

  if (!Array.isArray(dataRaw) || dataRaw.length === 0) {
    throw new Error("raw.data must be a non-empty array");
  }

  if (!Array.isArray(includedRaw)) {
    throw new Error("raw.included must be an array");
  }

  const selected = dataRaw[index];
  if (!selected || typeof selected !== "object" || Array.isArray(selected)) {
    throw new Error(`raw.data[${index}] must be an object`);
  }

  return {
    ...input,
    data: [selected],
    included: includedRaw,
  };
}

async function loadGeckoCandidates(args: Args): Promise<{
  detectedAt: string;
  acceptedMints: string[];
  poolCreatedAtByMint: Record<string, string | null>;
}> {
  const detectedAt = new Date().toISOString();
  const raw = args.geckoFile
    ? JSON.parse(await readFile(args.geckoFile, "utf-8"))
    : await fetchGeckoRaw();
  const input = ensureObject(raw, "raw");
  const dataRaw = input.data;

  if (!Array.isArray(dataRaw) || dataRaw.length === 0) {
    throw new Error("GeckoTerminal new_pools returned no items");
  }

  const accepted = new Set<string>();
  const poolCreatedAtByMint: Record<string, string | null> = {};

  for (let index = 0; index < dataRaw.length; index += 1) {
    const candidate = buildGeckoterminalNewPoolsDetectorCandidate(
      buildGeckoRawForIndex(raw, index),
      detectedAt,
    );
    const detectorResult = evaluateDetectorCandidate(candidate);
    if (detectorResult.ok) {
      accepted.add(detectorResult.mint);
      poolCreatedAtByMint[detectorResult.mint] = normalizeOptionalIsoDateString(
        candidate.payload.poolCreatedAt,
      );
    }
  }

  return {
    detectedAt,
    acceptedMints: Array.from(accepted).sort(),
    poolCreatedAtByMint,
  };
}

function isSolanaRawProfile(item: DexscreenerTokenProfile): boolean {
  return normalizeOptionalString(item.chainId) === "solana";
}

function isSolanaSourceEvent(event: DexSourceEvent): boolean {
  const chainId = normalizeOptionalString(event.payload.chainId);
  return chainId === undefined || chainId === "solana";
}

function normalizeRawProfileToSourceEvent(
  item: DexscreenerTokenProfile,
  fallbackDetectedAt: string,
): DexSourceEvent {
  const mintAddress = normalizeOptionalString(item.tokenAddress) ?? "";
  const detectedAt = normalizeOptionalString(item.updatedAt) ?? fallbackDetectedAt;

  return {
    source: DEXSCREENER_SOURCE,
    eventType: DEXSCREENER_EVENT_TYPE,
    detectedAt,
    payload: {
      ...item,
      mintAddress,
    },
  };
}

function looksLikeSourceEvent(input: JsonObject): boolean {
  return "source" in input || "eventType" in input || "detectedAt" in input || "payload" in input;
}

function parseDexSourceEvent(input: JsonObject, context: string): DexSourceEvent {
  const payload = ensureObject(input.payload, `${context}.payload`);
  const source = readRequiredString(input, "source", context);
  const eventType = readRequiredString(input, "eventType", context);
  const detectedAt = readRequiredString(input, "detectedAt", context);
  const mintAddress = readRequiredString(payload, "mintAddress", `${context}.payload`);

  if (source !== DEXSCREENER_SOURCE) {
    throw new Error(`${context}.source must be ${DEXSCREENER_SOURCE}`);
  }

  if (eventType !== DEXSCREENER_EVENT_TYPE) {
    throw new Error(`${context}.eventType must be ${DEXSCREENER_EVENT_TYPE}`);
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

function buildDexDetectorCandidate(event: DexSourceEvent): DetectorCandidate {
  return {
    candidateKind: "source_event_hint",
    source: event.source,
    eventType: event.eventType,
    detectedAt: event.detectedAt,
    payload: {
      mintAddress: event.payload.mintAddress,
    },
  };
}

function extractAcceptedDexMints(
  parsed: unknown,
  fallbackDetectedAt: string,
): {
  acceptedMints: string[];
  updatedAtByMint: Record<string, string | null>;
} {
  const accepted = new Set<string>();
  const updatedAtByMint: Record<string, string | null> = {};

  if (Array.isArray(parsed)) {
    for (const [index, item] of parsed.entries()) {
      const profile = ensureObject(item, `dex[${index}]`) as DexscreenerTokenProfile;
      if (!isSolanaRawProfile(profile)) {
        continue;
      }

      const event = normalizeRawProfileToSourceEvent(profile, fallbackDetectedAt);
      const result = evaluateDetectorCandidate(buildDexDetectorCandidate(event));
      if (result.ok) {
        accepted.add(result.mint);
        updatedAtByMint[result.mint] = normalizeOptionalIsoDateString(profile.updatedAt);
      }
    }

    return {
      acceptedMints: Array.from(accepted).sort(),
      updatedAtByMint,
    };
  }

  const input = ensureObject(parsed, "dex");
  if (looksLikeSourceEvent(input)) {
    const event = parseDexSourceEvent(input, "dex");
    if (!isSolanaSourceEvent(event)) {
      return {
        acceptedMints: [],
        updatedAtByMint,
      };
    }

    const result = evaluateDetectorCandidate(buildDexDetectorCandidate(event));
    if (result.ok) {
      accepted.add(result.mint);
      updatedAtByMint[result.mint] = normalizeOptionalIsoDateString(event.payload.updatedAt);
    }

    return {
      acceptedMints: Array.from(accepted).sort(),
      updatedAtByMint,
    };
  }

  const profile = input as DexscreenerTokenProfile;
  if (!isSolanaRawProfile(profile)) {
    return {
      acceptedMints: [],
      updatedAtByMint,
    };
  }

  const event = normalizeRawProfileToSourceEvent(profile, fallbackDetectedAt);
  const result = evaluateDetectorCandidate(buildDexDetectorCandidate(event));
  if (result.ok) {
    accepted.add(result.mint);
    updatedAtByMint[result.mint] = normalizeOptionalIsoDateString(profile.updatedAt);
  }

  return {
    acceptedMints: Array.from(accepted).sort(),
    updatedAtByMint,
  };
}

async function loadDexMintsFromFile(filePath: string): Promise<{
  acceptedMints: string[];
  updatedAtByMint: Record<string, string | null>;
}> {
  const raw = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(raw) as unknown;
  return extractAcceptedDexMints(parsed, new Date().toISOString());
}

async function fetchGeckoRaw(): Promise<unknown> {
  const response = await fetch(GECKOTERMINAL_API_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`GeckoTerminal request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as unknown;
}

async function fetchDexRaw(): Promise<unknown> {
  const response = await fetch(DEXSCREENER_API_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`DexScreener request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as unknown;
}

async function collectDexMints(args: Args): Promise<{
  startedAt: string;
  completedAt: string;
  elapsedMs: number;
  pollCount: number;
  acceptedMints: string[];
  updatedAtByMint: Record<string, string | null>;
}> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  if (args.dexFile) {
    const { acceptedMints, updatedAtByMint } = await loadDexMintsFromFile(args.dexFile);
    const completedAt = new Date().toISOString();

    return {
      startedAt,
      completedAt,
      elapsedMs: Date.now() - startedMs,
      pollCount: 1,
      acceptedMints,
      updatedAtByMint,
    };
  }

  const accepted = new Set<string>();
  const updatedAtByMint: Record<string, string | null> = {};
  let pollCount = 0;

  while (Date.now() - startedMs <= args.timeoutSeconds * 1_000) {
    const parsed = await fetchDexRaw();
    const { acceptedMints, updatedAtByMint: cycleUpdatedAtByMint } = extractAcceptedDexMints(
      parsed,
      new Date().toISOString(),
    );
    for (const mint of acceptedMints) {
      accepted.add(mint);
    }
    for (const [mint, updatedAt] of Object.entries(cycleUpdatedAtByMint)) {
      if (updatedAtByMint[mint] === undefined) {
        updatedAtByMint[mint] = updatedAt;
      }
    }

    pollCount += 1;

    if (Date.now() - startedMs > args.timeoutSeconds * 1_000) {
      break;
    }

    await sleep(args.intervalSeconds * 1_000);
  }

  const completedAt = new Date().toISOString();

  return {
    startedAt,
    completedAt,
    elapsedMs: Date.now() - startedMs,
    pollCount,
    acceptedMints: Array.from(accepted).sort(),
    updatedAtByMint,
  };
}

function computeDifference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((mint) => !rightSet.has(mint)).sort();
}

function computeOverlap(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((mint) => rightSet.has(mint)).sort();
}

function computeDateRange(values: Array<string | null | undefined>): {
  min: string | null;
  max: string | null;
} {
  const filtered = values.filter((value): value is string => typeof value === "string");
  if (filtered.length === 0) {
    return {
      min: null,
      max: null,
    };
  }

  const sorted = [...filtered].sort();
  return {
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  };
}

function buildRepresentativeSamples(
  mints: string[],
  geckoPoolCreatedAtByMint: Record<string, string | null>,
  dexUpdatedAtByMint: Record<string, string | null>,
  limit = 3,
): NativeTimeSample[] {
  return mints.slice(0, limit).map((mint) => ({
    mint,
    geckoPoolCreatedAt: geckoPoolCreatedAtByMint[mint] ?? null,
    dexUpdatedAt: dexUpdatedAtByMint[mint] ?? null,
  }));
}

function buildRecheckSamples(
  mints: string[],
  geckoPoolCreatedAtByMint: Record<string, string | null>,
  dexUpdatedAtByMint: Record<string, string | null>,
  limit = 3,
): RecheckSample[] {
  return mints.slice(0, limit).map((mint) => ({
    mint,
    initialGeckoPoolCreatedAt: geckoPoolCreatedAtByMint[mint] ?? null,
    laterDexUpdatedAt: dexUpdatedAtByMint[mint] ?? null,
  }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const gecko = await loadGeckoCandidates(args);
  const dex = await collectDexMints(args);
  const overlapMints = computeOverlap(gecko.acceptedMints, dex.acceptedMints);
  const onlyGeckoMints = computeDifference(gecko.acceptedMints, dex.acceptedMints);
  const onlyDexMints = computeDifference(dex.acceptedMints, gecko.acceptedMints);
  const geckoPoolCreatedAtRange = computeDateRange(Object.values(gecko.poolCreatedAtByMint));
  const dexUpdatedAtRange = computeDateRange(Object.values(dex.updatedAtByMint));
  let laterSeenOnDexMints: string[] = [];
  let stillOnlyGeckoMints: string[] = [];
  let laterDexUpdatedAtByMint: Record<string, string | null> = {};

  if (args.recheckAfterSeconds !== undefined) {
    const recheckTargetMints = onlyGeckoMints.slice(0, args.recheckSampleLimit);

    if (recheckTargetMints.length > 0) {
      await sleep(args.recheckAfterSeconds * 1_000);
      const recheckDex = await collectDexMints(args);
      const laterDexMintSet = new Set(recheckDex.acceptedMints);
      laterDexUpdatedAtByMint = recheckDex.updatedAtByMint;

      laterSeenOnDexMints = recheckTargetMints.filter((mint) => laterDexMintSet.has(mint));
      stillOnlyGeckoMints = recheckTargetMints.filter((mint) => !laterDexMintSet.has(mint));
    }
  }

  const output: ComparisonOutput = {
    readOnly: true,
    geckoApiUrl: GECKOTERMINAL_API_URL,
    dexscreenerApiUrl: DEXSCREENER_API_URL,
    selection: {
      geckoMode: args.geckoFile ? "file" : "fetch",
      geckoFile: args.geckoFile ?? null,
      dexMode: args.dexFile ? "file" : "poll",
      dexFile: args.dexFile ?? null,
      geckoDetectedAt: gecko.detectedAt,
      dexCollectionStartedAt: dex.startedAt,
      dexCollectionCompletedAt: dex.completedAt,
      timeoutSeconds: args.timeoutSeconds,
      intervalSeconds: args.intervalSeconds,
      recheckAfterSeconds: args.recheckAfterSeconds ?? null,
      recheckSampleLimit: args.recheckSampleLimit,
      dexPollCount: dex.pollCount,
      elapsedMs: dex.elapsedMs,
    },
    geckoPoolCreatedAtMin: geckoPoolCreatedAtRange.min,
    geckoPoolCreatedAtMax: geckoPoolCreatedAtRange.max,
    dexUpdatedAtMin: dexUpdatedAtRange.min,
    dexUpdatedAtMax: dexUpdatedAtRange.max,
    geckoCount: gecko.acceptedMints.length,
    dexCount: dex.acceptedMints.length,
    overlapCount: overlapMints.length,
    onlyGeckoCount: onlyGeckoMints.length,
    onlyDexCount: onlyDexMints.length,
    recheckedMintCount: laterSeenOnDexMints.length + stillOnlyGeckoMints.length,
    laterSeenOnDexCount: laterSeenOnDexMints.length,
    stillOnlyGeckoCount: stillOnlyGeckoMints.length,
    overlapMints,
    onlyGeckoMints,
    onlyDexMints,
    laterSeenOnDexMints,
    stillOnlyGeckoMints,
    representativeSamples: {
      overlap: buildRepresentativeSamples(
        overlapMints,
        gecko.poolCreatedAtByMint,
        dex.updatedAtByMint,
      ),
      onlyGecko: buildRepresentativeSamples(
        onlyGeckoMints,
        gecko.poolCreatedAtByMint,
        dex.updatedAtByMint,
      ),
      onlyDex: buildRepresentativeSamples(
        onlyDexMints,
        gecko.poolCreatedAtByMint,
        dex.updatedAtByMint,
      ),
    },
    recheckRepresentativeSamples: {
      laterSeenOnDex: buildRecheckSamples(
        laterSeenOnDexMints,
        gecko.poolCreatedAtByMint,
        laterDexUpdatedAtByMint,
      ),
      stillOnlyGecko: buildRecheckSamples(
        stillOnlyGeckoMints,
        gecko.poolCreatedAtByMint,
        laterDexUpdatedAtByMint,
      ),
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    if (error.message.length > 0) {
      console.error(error.message);
    }
    console.error(getUsageText());
    process.exitCode = 1;
    return;
  }

  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
