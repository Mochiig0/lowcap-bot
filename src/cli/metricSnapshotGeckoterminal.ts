import "dotenv/config";

import { readFile } from "node:fs/promises";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE = "geckoterminal.token_snapshot";
const DEFAULT_GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const DEFAULT_LIMIT = 20;
const DEFAULT_SINCE_MINUTES = 180;
const DEFAULT_INTERVAL_SECONDS = 60;
const LOG_PREFIX = "[metric:snapshot:geckoterminal]";
let injectedSnapshotErrorConsumed = false;

function getTokenApiUrl(): string {
  return process.env.GECKOTERMINAL_TOKEN_API_URL ?? DEFAULT_GECKOTERMINAL_TOKEN_API_URL;
}

type MetricSnapshotArgs = {
  write: boolean;
  watch: boolean;
  mint?: string;
  limit: number;
  sinceMinutes: number;
  pumpOnly: boolean;
  minGapMinutes?: number;
  intervalSeconds: number;
  maxIterations?: number;
  source: string;
};

type JsonObject = Record<string, unknown>;

type SelectedToken = {
  id: number;
  mint: string;
  currentSource: string | null;
  createdAt: string;
  originSource: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
};

type SnapshotTopPool = {
  address: string;
  name: string | null;
  dexId: string | null;
  poolCreatedAt: string | null;
  tokenPriceUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  reserveInUsd: number | null;
  volume24h: number | null;
  priceChangeH24: number | null;
  baseTokenAddress: string | null;
  quoteTokenAddress: string | null;
};

type SanitizedSnapshot = {
  network: string;
  token: {
    address: string;
    name: string | null;
    symbol: string | null;
    priceUsd: number | null;
    fdvUsd: number | null;
    marketCapUsd: number | null;
    totalReserveInUsd: number | null;
    volume24h: number | null;
  };
  topPoolCount: number;
  topPool: SnapshotTopPool | null;
};

type MetricCandidate = {
  observedAt: string;
  source: string;
  volume24h: number | null;
  rawJson: SanitizedSnapshot;
  rawJsonBytes: number;
};

type ProcessedTokenResult = {
  token: {
    id: number;
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    createdAt: string;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    isGeckoterminalOrigin: boolean;
  };
  metricSource: string;
  status: "ok" | "error" | "skipped_recent_metric";
  metricCandidate?: MetricCandidate;
  writeSummary: {
    dryRun: boolean;
    wouldCreateMetric: boolean;
    metricId: number | null;
  };
  latestObservedAt?: string;
  minGapMinutes?: number;
  error?: string;
};

type CliOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  metricSource: string;
  originSource: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    selectedCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    skippedCount: number;
    errorCount: number;
    writtenCount: number;
  };
  items: ProcessedTokenResult[];
};

type WatchCycleResult = {
  cycle: number;
  failed: boolean;
  errorMessage?: string;
  mode: "single" | "recent_batch";
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    selectedCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    skippedCount: number;
    errorCount: number;
    writtenCount: number;
    rateLimited: boolean;
    rateLimitedCount: number;
    abortedDueToRateLimit: boolean;
    skippedAfterRateLimit: number;
  };
  items: ProcessedTokenResult[];
};

type WatchOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  watchEnabled: boolean;
  intervalSeconds: number;
  maxIterations?: number;
  metricSource: string;
  originSource: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    pumpOnly: boolean;
  };
  cycleCount: number;
  failedCount: number;
  selectedCount: number;
  okCount: number;
  skippedCount: number;
  errorCount: number;
  writtenCount: number;
  rateLimited: boolean;
  rateLimitedCount: number;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  items: ProcessedTokenResult[];
  cycles: WatchCycleResult[];
};

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
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
    "pnpm metric:snapshot:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--pumpOnly] [--minGapMinutes <N>] [--source <SOURCE>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>]",
    "",
    "Defaults:",
    `- fetches live GeckoTerminal token snapshots from ${getTokenApiUrl()}/{mint}?include=top_pools`,
    `- recent batch mode selects up to ${DEFAULT_LIMIT} recent GeckoTerminal-origin tokens`,
    `- recent batch mode uses firstSeenSourceSnapshot.detectedAt when present, otherwise Token.createdAt`,
    `- recent batch mode looks back ${DEFAULT_SINCE_MINUTES} minutes by default`,
    `- recent batch mode may be narrowed to mint strings ending with pump via --pumpOnly; --mint single mode still ignores that batch filter`,
    `- skips a token before fetch only when --minGapMinutes is set and the latest Metric for the same token+source is still recent`,
    `- stays dry-run by default and writes Metric rows only when --write is set`,
    `- loops only when --watch is set`,
    `- waits --intervalSeconds ${DEFAULT_INTERVAL_SECONDS} between watch cycles`,
    `- persists observedAt, source, rawJson, and volume24h only when the source clearly exposes 24h volume`,
    `- keeps FDV, market cap, and liquidity-style fields in rawJson only`,
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

function parseOptionalStringArg(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseArgs(argv: string[]): MetricSnapshotArgs {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: MetricSnapshotArgs = {
    write: false,
    watch: false,
    limit: DEFAULT_LIMIT,
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    pumpOnly: false,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    source: GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE,
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

    if (key === "--pumpOnly") {
      out.pumpOnly = true;
      continue;
    }

    const value = normalizedArgv[i + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = parseOptionalStringArg(value);
        break;
      case "--limit":
        out.limit = parsePositiveIntegerArg(value, key);
        break;
      case "--sinceMinutes":
        out.sinceMinutes = parsePositiveIntegerArg(value, key);
        break;
      case "--minGapMinutes":
        out.minGapMinutes = parsePositiveIntegerArg(value, key);
        break;
      case "--intervalSeconds":
        out.intervalSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--maxIterations":
        out.maxIterations = parsePositiveIntegerArg(value, key);
        break;
      case "--source":
        out.source = parseOptionalStringArg(value) ?? GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE;
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (
    !out.watch &&
    (normalizedArgv.includes("--intervalSeconds") || normalizedArgv.includes("--maxIterations"))
  ) {
    throw new CliUsageError("--intervalSeconds and --maxIterations require --watch");
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureObject(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as JsonObject;
}

function readOptionalString(input: JsonObject, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readRequiredString(input: JsonObject, key: string, context: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }

  return value;
}

function readOptionalNumberString(input: JsonObject, key: string): number | null {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalNestedNumberString(
  input: JsonObject,
  key: string,
  nestedKey: string,
): number | null {
  const nested = input[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }

  const value = (nested as JsonObject)[nestedKey];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalDateString(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

function isRateLimitErrorMessage(message: string | undefined): boolean {
  if (typeof message !== "string") {
    return false;
  }

  return message.includes("429 Too Many Requests");
}

function readOptionalRelationshipAddress(
  input: JsonObject,
  relationshipKey: string,
): string | null {
  const relationship = input[relationshipKey];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
    return null;
  }

  const data = (relationship as JsonObject).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const id = (data as JsonObject).id;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }

  const prefix = `${GECKOTERMINAL_NETWORK}_`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function readOptionalRelationshipId(
  input: JsonObject,
  relationshipKey: string,
): string | null {
  const relationship = input[relationshipKey];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
    return null;
  }

  const data = (relationship as JsonObject).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const id = (data as JsonObject).id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

function extractFirstSeenSourceSnapshot(entrySnapshot: unknown): FirstSeenSourceSnapshot | null {
  if (!entrySnapshot || typeof entrySnapshot !== "object" || Array.isArray(entrySnapshot)) {
    return null;
  }

  const firstSeenSourceSnapshot = (entrySnapshot as JsonObject).firstSeenSourceSnapshot;
  if (
    !firstSeenSourceSnapshot ||
    typeof firstSeenSourceSnapshot !== "object" ||
    Array.isArray(firstSeenSourceSnapshot)
  ) {
    return null;
  }

  return firstSeenSourceSnapshot as FirstSeenSourceSnapshot;
}

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  createdAt: Date;
  entrySnapshot: unknown;
}): SelectedToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDateString(firstSeen?.detectedAt);

  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.source,
    createdAt: token.createdAt.toISOString(),
    originSource: originSource ?? null,
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
  };
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

async function selectTokens(args: MetricSnapshotArgs): Promise<{
  mode: "single" | "recent_batch";
  selectedTokens: SelectedToken[];
  sinceCutoff: string | null;
  skippedNonPumpCount: number;
}> {
  if (args.mint) {
    const token = await db.token.findUnique({
      where: { mint: args.mint },
      select: {
        id: true,
        mint: true,
        source: true,
        createdAt: true,
        entrySnapshot: true,
      },
    });

    if (!token) {
      throw new CliUsageError(`Token not found for mint: ${args.mint}`);
    }

    return {
      mode: "single",
      selectedTokens: [buildSelectedToken(token)],
      sinceCutoff: null,
      skippedNonPumpCount: 0,
    };
  }

  const sinceCutoff = new Date(Date.now() - args.sinceMinutes * 60_000);
  const tokens = await db.token.findMany({
    where: {
      createdAt: {
        gte: sinceCutoff,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      mint: true,
      source: true,
      createdAt: true,
      entrySnapshot: true,
    },
  });

  const recentGeckoTokens = tokens
    .map(buildSelectedToken)
    .filter(
      (token) =>
        token.isGeckoterminalOrigin &&
        Date.parse(token.selectionAnchorAt) >= sinceCutoff.getTime(),
    )
    .sort((left, right) => {
      const delta = Date.parse(right.selectionAnchorAt) - Date.parse(left.selectionAnchorAt);
      if (delta !== 0) {
        return delta;
      }

      return right.id - left.id;
    });
  const pumpEligibleTokens = args.pumpOnly
    ? recentGeckoTokens.filter((token) => isPumpMint(token.mint))
    : recentGeckoTokens;
  const selectedTokens = pumpEligibleTokens.slice(0, args.limit);

  return {
    mode: "recent_batch",
    selectedTokens,
    sinceCutoff: sinceCutoff.toISOString(),
    skippedNonPumpCount: recentGeckoTokens.length - pumpEligibleTokens.length,
  };
}

async function fetchTokenSnapshotRaw(mint: string): Promise<unknown> {
  const injectedErrorMessage = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_ERROR_ONCE;
  if (injectedErrorMessage && !injectedSnapshotErrorConsumed) {
    injectedSnapshotErrorConsumed = true;
    throw new Error(injectedErrorMessage);
  }

  const fixtureFilePath = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
  if (fixtureFilePath) {
    const content = await readFile(fixtureFilePath, "utf-8");
    return JSON.parse(content) as unknown;
  }

  const response = await fetch(
    `${getTokenApiUrl()}/${encodeURIComponent(mint)}?include=top_pools`,
    {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GeckoTerminal token snapshot request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as unknown;
}

async function findLatestMetricObservedAt(
  tokenId: number,
  source: string,
): Promise<string | null> {
  const latestMetric = await db.metric.findFirst({
    where: {
      tokenId,
      source,
    },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    select: {
      observedAt: true,
    },
  });

  return latestMetric ? latestMetric.observedAt.toISOString() : null;
}

function parseSnapshotTopPool(
  relationshipIds: string[],
  included: JsonObject[],
): SnapshotTopPool | null {
  if (relationshipIds.length === 0) {
    return null;
  }

  const firstPoolId = relationshipIds[0];
  const firstPool = included.find((item) => item.id === firstPoolId);
  if (!firstPool) {
    return null;
  }

  const attributes = ensureObject(firstPool.attributes, `included.${firstPoolId}.attributes`);
  const relationships =
    firstPool.relationships && typeof firstPool.relationships === "object" && !Array.isArray(firstPool.relationships)
      ? (firstPool.relationships as JsonObject)
      : {};

  return {
    address: readRequiredString(attributes, "address", `included.${firstPoolId}.attributes`),
    name: readOptionalString(attributes, "name"),
    dexId: readOptionalRelationshipId(relationships, "dex"),
    poolCreatedAt: readOptionalDateString(attributes.pool_created_at),
    tokenPriceUsd: readOptionalNumberString(attributes, "token_price_usd"),
    fdvUsd: readOptionalNumberString(attributes, "fdv_usd"),
    marketCapUsd: readOptionalNumberString(attributes, "market_cap_usd"),
    reserveInUsd: readOptionalNumberString(attributes, "reserve_in_usd"),
    volume24h: readOptionalNestedNumberString(attributes, "volume_usd", "h24"),
    priceChangeH24: readOptionalNestedNumberString(
      attributes,
      "price_change_percentage",
      "h24",
    ),
    baseTokenAddress: readOptionalRelationshipAddress(relationships, "base_token"),
    quoteTokenAddress: readOptionalRelationshipAddress(relationships, "quote_token"),
  };
}

function parseSanitizedSnapshot(raw: unknown): SanitizedSnapshot {
  const input = ensureObject(raw, "raw");
  const data = ensureObject(input.data, "raw.data");
  const attributes = ensureObject(data.attributes, "raw.data.attributes");
  const relationships =
    data.relationships && typeof data.relationships === "object" && !Array.isArray(data.relationships)
      ? (data.relationships as JsonObject)
      : {};
  const topPoolsRelationship =
    relationships.top_pools &&
    typeof relationships.top_pools === "object" &&
    !Array.isArray(relationships.top_pools)
      ? (relationships.top_pools as JsonObject).data
      : undefined;

  const topPoolIds = Array.isArray(topPoolsRelationship)
    ? topPoolsRelationship
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }

          const id = (item as JsonObject).id;
          return typeof id === "string" && id.trim().length > 0 ? id : null;
        })
        .filter((value): value is string => value !== null)
    : [];
  const included = Array.isArray(input.included)
    ? input.included
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => item as JsonObject)
    : [];

  return {
    network: GECKOTERMINAL_NETWORK,
    token: {
      address: readRequiredString(attributes, "address", "raw.data.attributes"),
      name: readOptionalString(attributes, "name"),
      symbol: readOptionalString(attributes, "symbol"),
      priceUsd: readOptionalNumberString(attributes, "price_usd"),
      fdvUsd: readOptionalNumberString(attributes, "fdv_usd"),
      marketCapUsd: readOptionalNumberString(attributes, "market_cap_usd"),
      totalReserveInUsd: readOptionalNumberString(attributes, "total_reserve_in_usd"),
      volume24h: readOptionalNestedNumberString(attributes, "volume_usd", "h24"),
    },
    topPoolCount: topPoolIds.length,
    topPool: parseSnapshotTopPool(topPoolIds, included),
  };
}

async function processToken(
  token: SelectedToken,
  args: MetricSnapshotArgs,
): Promise<ProcessedTokenResult> {
  try {
    if (args.minGapMinutes !== undefined) {
      const latestObservedAt = await findLatestMetricObservedAt(token.id, args.source);
      if (latestObservedAt) {
        const diffMs = Date.now() - Date.parse(latestObservedAt);
        if (diffMs < args.minGapMinutes * 60_000) {
          return {
            token: {
              id: token.id,
              mint: token.mint,
              currentSource: token.currentSource,
              originSource: token.originSource,
              createdAt: token.createdAt,
              selectionAnchorAt: token.selectionAnchorAt,
              selectionAnchorKind: token.selectionAnchorKind,
              isGeckoterminalOrigin: token.isGeckoterminalOrigin,
            },
            metricSource: args.source,
            status: "skipped_recent_metric",
            writeSummary: {
              dryRun: !args.write,
              wouldCreateMetric: false,
              metricId: null,
            },
            latestObservedAt,
            minGapMinutes: args.minGapMinutes,
          };
        }
      }
    }

    const raw = await fetchTokenSnapshotRaw(token.mint);
    const observedAt = new Date().toISOString();
    const rawJson = parseSanitizedSnapshot(raw);
    const rawJsonBytes = Buffer.byteLength(JSON.stringify(rawJson), "utf-8");
    const metricCandidate: MetricCandidate = {
      observedAt,
      source: args.source,
      volume24h: rawJson.token.volume24h,
      rawJson,
      rawJsonBytes,
    };

    let metricId: number | null = null;
    if (args.write) {
      const created = await db.metric.create({
        data: {
          tokenId: token.id,
          observedAt: new Date(observedAt),
          source: args.source,
          volume24h: metricCandidate.volume24h ?? undefined,
          rawJson,
        },
        select: {
          id: true,
        },
      });
      metricId = created.id;
    }

    return {
      token: {
        id: token.id,
        mint: token.mint,
        currentSource: token.currentSource,
        originSource: token.originSource,
        createdAt: token.createdAt,
        selectionAnchorAt: token.selectionAnchorAt,
        selectionAnchorKind: token.selectionAnchorKind,
        isGeckoterminalOrigin: token.isGeckoterminalOrigin,
      },
      metricSource: args.source,
      status: "ok",
      metricCandidate,
      writeSummary: {
        dryRun: !args.write,
        wouldCreateMetric: true,
        metricId,
      },
    };
  } catch (error) {
    return {
      token: {
        id: token.id,
        mint: token.mint,
        currentSource: token.currentSource,
        originSource: token.originSource,
        createdAt: token.createdAt,
        selectionAnchorAt: token.selectionAnchorAt,
        selectionAnchorKind: token.selectionAnchorKind,
        isGeckoterminalOrigin: token.isGeckoterminalOrigin,
      },
      metricSource: args.source,
      status: "error",
      writeSummary: {
        dryRun: !args.write,
        wouldCreateMetric: false,
        metricId: null,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type SnapshotExecutionResult = {
  mode: "single" | "recent_batch";
  sinceCutoff: string | null;
  selectedTokens: SelectedToken[];
  skippedNonPumpCount: number;
  items: ProcessedTokenResult[];
  rateLimited: boolean;
  rateLimitedCount: number;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
};

async function executeSnapshotCycle(
  args: MetricSnapshotArgs,
): Promise<SnapshotExecutionResult> {
  const selection = await selectTokens(args);
  const items: ProcessedTokenResult[] = [];
  let rateLimited = false;
  let rateLimitedCount = 0;
  let abortedDueToRateLimit = false;
  let skippedAfterRateLimit = 0;

  for (let index = 0; index < selection.selectedTokens.length; index += 1) {
    const token = selection.selectedTokens[index];
    const result = await processToken(token, args);
    items.push(result);

    if (args.watch && result.status === "error" && isRateLimitErrorMessage(result.error)) {
      rateLimited = true;
      rateLimitedCount += 1;
      abortedDueToRateLimit = true;
      skippedAfterRateLimit = selection.selectedTokens.length - index - 1;
      break;
    }
  }

  return {
    mode: selection.mode,
    sinceCutoff: selection.sinceCutoff,
    selectedTokens: selection.selectedTokens,
    skippedNonPumpCount: selection.skippedNonPumpCount,
    items,
    rateLimited,
    rateLimitedCount,
    abortedDueToRateLimit,
    skippedAfterRateLimit,
  };
}

function buildOneShotOutput(
  args: MetricSnapshotArgs,
  execution: SnapshotExecutionResult,
): CliOutput {
  return {
    mode: execution.mode,
    dryRun: !args.write,
    writeEnabled: args.write,
    metricSource: args.source,
    originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: execution.sinceCutoff,
      pumpOnly: !args.mint && args.pumpOnly,
      selectedCount: execution.selectedTokens.length,
      skippedNonPumpCount: execution.skippedNonPumpCount,
    },
    summary: {
      selectedCount: execution.selectedTokens.length,
      okCount: execution.items.filter((item) => item.status === "ok").length,
      skippedCount: execution.items.filter((item) => item.status === "skipped_recent_metric").length,
      errorCount: execution.items.filter((item) => item.status === "error").length,
      writtenCount: execution.items.filter((item) => item.writeSummary.metricId !== null).length,
    },
    items: execution.items,
  };
}

function createFailedCycleResult(
  args: MetricSnapshotArgs,
  cycle: number,
  error: unknown,
): WatchCycleResult {
  return {
    cycle,
    failed: true,
    errorMessage: error instanceof Error ? error.message : String(error),
    mode: args.mint ? "single" : "recent_batch",
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: null,
      pumpOnly: !args.mint && args.pumpOnly,
      selectedCount: 0,
      skippedNonPumpCount: 0,
    },
    summary: {
      selectedCount: 0,
      okCount: 0,
      skippedCount: 0,
      errorCount: 0,
      writtenCount: 0,
      rateLimited: false,
      rateLimitedCount: 0,
      abortedDueToRateLimit: false,
      skippedAfterRateLimit: 0,
    },
    items: [],
  };
}

function buildWatchCycleResult(
  args: MetricSnapshotArgs,
  cycle: number,
  execution: SnapshotExecutionResult,
): WatchCycleResult {
  return {
    cycle,
    failed: false,
    mode: execution.mode,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: execution.sinceCutoff,
      pumpOnly: !args.mint && args.pumpOnly,
      selectedCount: execution.selectedTokens.length,
      skippedNonPumpCount: execution.skippedNonPumpCount,
    },
    summary: {
      selectedCount: execution.selectedTokens.length,
      okCount: execution.items.filter((item) => item.status === "ok").length,
      skippedCount: execution.items.filter((item) => item.status === "skipped_recent_metric").length,
      errorCount: execution.items.filter((item) => item.status === "error").length,
      writtenCount: execution.items.filter((item) => item.writeSummary.metricId !== null).length,
      rateLimited: execution.rateLimited,
      rateLimitedCount: execution.rateLimitedCount,
      abortedDueToRateLimit: execution.abortedDueToRateLimit,
      skippedAfterRateLimit: execution.skippedAfterRateLimit,
    },
    items: execution.items,
  };
}

function logWatchCycleSummary(cycle: WatchCycleResult): void {
  console.error(
    [
      `${LOG_PREFIX} cycle=${cycle.cycle}`,
      `failed=${cycle.failed}`,
      `selected=${cycle.summary.selectedCount}`,
      `ok=${cycle.summary.okCount}`,
      `skipped=${cycle.summary.skippedCount}`,
      `error=${cycle.summary.errorCount}`,
      `written=${cycle.summary.writtenCount}`,
      `rateLimited=${cycle.summary.rateLimited}`,
      `rateLimitedCount=${cycle.summary.rateLimitedCount}`,
      `abortedDueToRateLimit=${cycle.summary.abortedDueToRateLimit}`,
      `skippedAfterRateLimit=${cycle.summary.skippedAfterRateLimit}`,
      ...(cycle.errorMessage ? [`errorMessage=${JSON.stringify(cycle.errorMessage)}`] : []),
    ].join(" "),
  );
}

function buildWatchOutput(
  args: MetricSnapshotArgs,
  cycles: WatchCycleResult[],
): WatchOutput {
  const flattenedItems = cycles.flatMap((cycle) => cycle.items);

  return {
    mode: cycles[0]?.mode ?? (args.mint ? "single" : "recent_batch"),
    dryRun: !args.write,
    writeEnabled: args.write,
    watchEnabled: args.watch,
    intervalSeconds: args.intervalSeconds,
    ...(args.maxIterations ? { maxIterations: args.maxIterations } : {}),
    metricSource: args.source,
    originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      pumpOnly: !args.mint && args.pumpOnly,
    },
    cycleCount: cycles.length,
    failedCount: cycles.filter((cycle) => cycle.failed).length,
    selectedCount: cycles.reduce((sum, cycle) => sum + cycle.summary.selectedCount, 0),
    okCount: cycles.reduce((sum, cycle) => sum + cycle.summary.okCount, 0),
    skippedCount: cycles.reduce((sum, cycle) => sum + cycle.summary.skippedCount, 0),
    errorCount: cycles.reduce((sum, cycle) => sum + cycle.summary.errorCount, 0),
    writtenCount: cycles.reduce((sum, cycle) => sum + cycle.summary.writtenCount, 0),
    rateLimited: cycles.some((cycle) => cycle.summary.rateLimited),
    rateLimitedCount: cycles.reduce((sum, cycle) => sum + cycle.summary.rateLimitedCount, 0),
    abortedDueToRateLimit: cycles.some((cycle) => cycle.summary.abortedDueToRateLimit),
    skippedAfterRateLimit: cycles.reduce(
      (sum, cycle) => sum + cycle.summary.skippedAfterRateLimit,
      0,
    ),
    items: flattenedItems,
    cycles,
  };
}

async function runOneShot(args: MetricSnapshotArgs): Promise<CliOutput> {
  const execution = await executeSnapshotCycle(args);
  return buildOneShotOutput(args, execution);
}

async function runWatch(args: MetricSnapshotArgs): Promise<WatchOutput> {
  const cycles: WatchCycleResult[] = [];
  const shouldCollectCycles = args.maxIterations !== undefined;
  const watchIterationCount = args.maxIterations ?? Number.POSITIVE_INFINITY;

  for (let cycle = 1; cycle <= watchIterationCount; cycle += 1) {
    let cycleResult: WatchCycleResult;

    try {
      const execution = await executeSnapshotCycle(args);
      cycleResult = buildWatchCycleResult(args, cycle, execution);
    } catch (error) {
      cycleResult = createFailedCycleResult(args, cycle, error);
    }

    if (shouldCollectCycles) {
      cycles.push(cycleResult);
    }

    logWatchCycleSummary(cycleResult);

    if (cycle === watchIterationCount) {
      break;
    }

    await sleep(args.intervalSeconds * 1000);
  }

  return buildWatchOutput(args, cycles);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const output = args.watch ? await runWatch(args) : await runOneShot(args);
  console.log(JSON.stringify(output, null, 2));
}

main()
  .catch((error: unknown) => {
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
  })
  .finally(async () => {
    await db.$disconnect();
  });
