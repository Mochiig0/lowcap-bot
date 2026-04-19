import "dotenv/config";

import { readFile } from "node:fs/promises";

import { db } from "./db.js";
import {
  buildTokenEnrichPlan,
  enrichTokenByMint,
  type TokenEnrichPreview,
} from "./tokenEnrichShared.js";
import {
  buildTokenRescorePreview,
  rescoreTokenByMint,
  type TokenRescorePreview,
} from "./tokenRescoreShared.js";
import { buildScoreNotifyMessage, notifyTelegram } from "../notify/telegram.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const DEFAULT_LIMIT = 20;
const DEFAULT_SINCE_MINUTES = 180;
const LOG_PREFIX = "[token:enrich-rescore:geckoterminal]";

let injectedSnapshotErrorConsumed = false;

type JsonObject = Record<string, unknown>;

type Args = {
  write: boolean;
  notify: boolean;
  mint?: string;
  limit: number;
  sinceMinutes: number;
  pumpOnly: boolean;
};

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

type SelectedToken = {
  id: number;
  mint: string;
  currentSource: string | null;
  originSource: string | null;
  metadataStatus: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  groupKey: string | null;
  scoreRank: string;
  hardRejected: boolean;
  createdAt: string;
  importedAt: string;
  enrichedAt: string | null;
  rescoredAt: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
};

type SnapshotMetadata = {
  address: string;
  name: string | null;
  symbol: string | null;
};

type ProcessedItem = {
  token: {
    id: number;
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    metadataStatus: string;
    name: string | null;
    symbol: string | null;
    description: string | null;
    groupKey: string | null;
    scoreRank: string;
    hardRejected: boolean;
    createdAt: string;
    importedAt: string;
    enrichedAt: string | null;
    rescoredAt: string | null;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    isGeckoterminalOrigin: boolean;
  };
  selectedReason: "firstSeenSourceSnapshot.detectedAt" | "Token.createdAt";
  status: "ok" | "error";
  fetchedSnapshot?: SnapshotMetadata;
  enrichPlan?: {
    hasPatch: boolean;
    willUpdate: boolean;
    patch: {
      name?: string;
      symbol?: string;
    };
    preview: {
      metadataStatus: string;
      name: string | null;
      symbol: string | null;
      description: string | null;
    };
  };
  rescorePreview?: {
    ready: boolean;
    normalizedText: string;
    scoreTotal: number;
    scoreRank: string;
    hardRejected: boolean;
    hardRejectReason: string | null;
  };
  notifyCandidate: boolean;
  notifyEligibleBefore: boolean;
  notifyEligibleAfter: boolean;
  notifyWouldSend: boolean;
  notifySent: boolean;
  writeSummary: {
    dryRun: boolean;
    enrichUpdated: boolean;
    rescoreUpdated: boolean;
  };
  error?: string;
};

type Output = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  notifyEnabled: boolean;
  source: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    selectedCount: number;
    selectedIncompleteCount: number;
    skippedCompleteCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    selectedCount: number;
    selectedIncompleteCount: number;
    skippedCompleteCount: number;
    skippedNonPumpCount: number;
    okCount: number;
    errorCount: number;
    enrichWriteCount: number;
    rescoreWriteCount: number;
    notifyCandidateCount: number;
    notifyWouldSendCount: number;
    notifySentCount: number;
    rateLimited: boolean;
    rateLimitedCount: number;
    abortedDueToRateLimit: boolean;
    skippedAfterRateLimit: number;
  };
  items: ProcessedItem[];
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
    "pnpm token:enrich-rescore:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--pumpOnly] [--write] [--notify]",
    "",
    "Defaults:",
    `- fetches live GeckoTerminal token snapshots from ${GECKOTERMINAL_TOKEN_API_URL}/{mint}?include=top_pools`,
    `- recent batch mode selects up to ${DEFAULT_LIMIT} recent GeckoTerminal-origin tokens that still miss name or symbol`,
    `- recent batch mode uses firstSeenSourceSnapshot.detectedAt when present, otherwise Token.createdAt`,
    `- recent batch mode looks back ${DEFAULT_SINCE_MINUTES} minutes by default`,
    "- recent batch mode may be narrowed to mint strings ending with pump via --pumpOnly; --mint single mode still ignores that batch filter",
    "- stays dry-run by default and writes Token enrich/rescore updates only when --write is set",
    "- --notify is allowed only with --write and only sends when the token newly enters S-rank and non-hard-rejected state after rescore",
    "- fetches name and symbol from GeckoTerminal token snapshots and keeps description unchanged",
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

function parseArgs(argv: string[]): Args {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: Args = {
    write: false,
    notify: false,
    limit: DEFAULT_LIMIT,
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    pumpOnly: false,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    if (key === "--write") {
      out.write = true;
      continue;
    }

    if (key === "--notify") {
      out.notify = true;
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
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (out.notify && !out.write) {
    throw new CliUsageError("--notify requires --write");
  }

  return out;
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
  name: string | null;
  symbol: string | null;
  description: string | null;
  groupKey: string | null;
  scoreRank: string;
  hardRejected: boolean;
  metadataStatus: string;
  createdAt: Date;
  importedAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
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
    originSource: originSource ?? null,
    metadataStatus: token.metadataStatus,
    name: token.name,
    symbol: token.symbol,
    description: token.description,
    groupKey: token.groupKey,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    createdAt: token.createdAt.toISOString(),
    importedAt: token.importedAt.toISOString(),
    enrichedAt: token.enrichedAt?.toISOString() ?? null,
    rescoredAt: token.rescoredAt?.toISOString() ?? null,
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
  };
}

function needsBatchEnrich(token: SelectedToken): boolean {
  return token.name === null || token.symbol === null;
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

async function selectTokens(args: Args): Promise<{
  mode: "single" | "recent_batch";
  selectedTokens: SelectedToken[];
  sinceCutoff: string | null;
  selectedIncompleteCount: number;
  skippedCompleteCount: number;
  skippedNonPumpCount: number;
}> {
  if (args.mint) {
    const token = await db.token.findUnique({
      where: { mint: args.mint },
      select: {
        id: true,
        mint: true,
        source: true,
        name: true,
        symbol: true,
        description: true,
        groupKey: true,
        scoreRank: true,
        hardRejected: true,
        metadataStatus: true,
        createdAt: true,
        importedAt: true,
        enrichedAt: true,
        rescoredAt: true,
        entrySnapshot: true,
      },
    });

    if (!token) {
      throw new CliUsageError(`Token not found for mint: ${args.mint}`);
    }

    const selectedToken = buildSelectedToken(token);

    return {
      mode: "single",
      selectedTokens: [selectedToken],
      sinceCutoff: null,
      selectedIncompleteCount: needsBatchEnrich(selectedToken) ? 1 : 0,
      skippedCompleteCount: 0,
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
      name: true,
      symbol: true,
      description: true,
      groupKey: true,
      scoreRank: true,
      hardRejected: true,
      metadataStatus: true,
      createdAt: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
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
  const incompleteTokens = recentGeckoTokens.filter(needsBatchEnrich);
  const pumpEligibleTokens = args.pumpOnly
    ? incompleteTokens.filter((token) => isPumpMint(token.mint))
    : incompleteTokens;
  const selectedTokens = pumpEligibleTokens.slice(0, args.limit);

  return {
    mode: "recent_batch",
    selectedTokens,
    sinceCutoff: sinceCutoff.toISOString(),
    selectedIncompleteCount: selectedTokens.length,
    skippedCompleteCount: recentGeckoTokens.length - incompleteTokens.length,
    skippedNonPumpCount: incompleteTokens.length - pumpEligibleTokens.length,
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

  const apiUrl = process.env.GECKOTERMINAL_TOKEN_API_URL ?? GECKOTERMINAL_TOKEN_API_URL;
  const response = await fetch(`${apiUrl}/${encodeURIComponent(mint)}?include=top_pools`, {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(
      `GeckoTerminal token snapshot request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as unknown;
}

function parseSnapshotMetadata(raw: unknown): SnapshotMetadata {
  const input = ensureObject(raw, "raw");
  const data = ensureObject(input.data, "raw.data");
  const attributes = ensureObject(data.attributes, "raw.data.attributes");

  return {
    address: readRequiredString(attributes, "address", "raw.data.attributes"),
    name: readOptionalString(attributes, "name"),
    symbol: readOptionalString(attributes, "symbol"),
  };
}

function buildCurrentEnrichPreview(token: SelectedToken): TokenEnrichPreview {
  return {
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    description: token.description,
    source: token.currentSource,
    metadataStatus: token.metadataStatus,
    normalizedText: null,
    importedAt: token.importedAt,
    enrichedAt: token.enrichedAt,
  };
}

function isNotifyEligibleFromScore(scoreRank: string, hardRejected: boolean): boolean {
  return scoreRank === "S" && !hardRejected;
}

function isRateLimitErrorMessage(message: string | undefined): boolean {
  if (typeof message !== "string") {
    return false;
  }

  return message.includes("429 Too Many Requests");
}

function buildTokenOutput(token: SelectedToken): ProcessedItem["token"] {
  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.currentSource,
    originSource: token.originSource,
    metadataStatus: token.metadataStatus,
    name: token.name,
    symbol: token.symbol,
    description: token.description,
    groupKey: token.groupKey,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    createdAt: token.createdAt,
    importedAt: token.importedAt,
    enrichedAt: token.enrichedAt,
    rescoredAt: token.rescoredAt,
    selectionAnchorAt: token.selectionAnchorAt,
    selectionAnchorKind: token.selectionAnchorKind,
    isGeckoterminalOrigin: token.isGeckoterminalOrigin,
  };
}

async function processToken(token: SelectedToken, args: Args): Promise<ProcessedItem> {
  const baseToken = buildTokenOutput(token);
  const selectedReason =
    token.selectionAnchorKind === "firstSeenDetectedAt"
      ? "firstSeenSourceSnapshot.detectedAt"
      : "Token.createdAt";
  const notifyEligibleBefore = isNotifyEligibleFromScore(token.scoreRank, token.hardRejected);

  let snapshot: SnapshotMetadata | undefined;
  let enrichPlan: ProcessedItem["enrichPlan"];
  let rescorePreview:
    | {
        ready: boolean;
        normalizedText: string;
        scoreTotal: number;
        scoreRank: string;
        hardRejected: boolean;
        hardRejectReason: string | null;
      }
    | undefined;
  let notifyEligibleAfter = false;
  let notifyWouldSend = false;
  let notifySent = false;
  let enrichUpdated = false;
  let rescoreUpdated = false;

  try {
    const raw = await fetchTokenSnapshotRaw(token.mint);
    snapshot = parseSnapshotMetadata(raw);
    const patch = {
      ...(snapshot.name !== null && snapshot.name !== token.name ? { name: snapshot.name } : {}),
      ...(snapshot.symbol !== null && snapshot.symbol !== token.symbol
        ? { symbol: snapshot.symbol }
        : {}),
    };
    const hasPatch = Object.keys(patch).length > 0;

    const enrichPlanResult = hasPatch
      ? buildTokenEnrichPlan(
          {
            mint: token.mint,
            name: token.name,
            symbol: token.symbol,
            description: token.description,
            source: token.currentSource,
            metadataStatus: token.metadataStatus,
            importedAt: new Date(token.importedAt),
            enrichedAt: token.enrichedAt ? new Date(token.enrichedAt) : null,
          },
          patch,
        )
      : null;

    const enrichPreview = enrichPlanResult?.preview ?? buildCurrentEnrichPreview(token);
    enrichPlan = {
      hasPatch,
      willUpdate: enrichPlanResult?.hasChange ?? false,
      patch,
      preview: {
        metadataStatus: enrichPreview.metadataStatus,
        name: enrichPreview.name,
        symbol: enrichPreview.symbol,
        description: enrichPreview.description,
      },
    };
    const builtRescorePreview = await buildTokenRescorePreview({
      mint: token.mint,
      name: enrichPreview.name,
      symbol: enrichPreview.symbol,
      description: enrichPreview.description,
    });
    rescorePreview = {
      ready: true,
      normalizedText: builtRescorePreview.normalizedText,
      scoreTotal: builtRescorePreview.scoreTotal,
      scoreRank: builtRescorePreview.scoreRank,
      hardRejected: builtRescorePreview.hardRejected,
      hardRejectReason: builtRescorePreview.hardRejectReason,
    };
    notifyEligibleAfter = isNotifyEligibleFromScore(
      builtRescorePreview.scoreRank,
      builtRescorePreview.hardRejected,
    );
    notifyWouldSend = !notifyEligibleBefore && notifyEligibleAfter;

    if (args.write) {
      if (enrichPlanResult?.hasChange) {
        await enrichTokenByMint(token.mint, patch);
        enrichUpdated = true;
      }

      const writtenRescore = await rescoreTokenByMint(token.mint);
      rescoreUpdated = true;

      if (args.notify && notifyWouldSend) {
        notifySent = await notifyTelegram(
          buildScoreNotifyMessage({
            title: "S-rank token enriched and rescored",
            mint: token.mint,
            name: enrichPreview.name,
            symbol: enrichPreview.symbol,
            scoreTotal: writtenRescore.scoreTotal,
            groupKey: token.groupKey,
          }),
        );
      }
    }

    return {
      token: baseToken,
      selectedReason,
      status: "ok",
      fetchedSnapshot: snapshot,
      enrichPlan,
      rescorePreview,
      notifyCandidate: notifyEligibleAfter,
      notifyEligibleBefore,
      notifyEligibleAfter,
      notifyWouldSend,
      notifySent,
      writeSummary: {
        dryRun: !args.write,
        enrichUpdated,
        rescoreUpdated,
      },
    };
  } catch (error) {
    return {
      token: baseToken,
      selectedReason,
      status: "error",
      fetchedSnapshot: snapshot,
      enrichPlan,
      rescorePreview,
      notifyCandidate: notifyEligibleAfter,
      notifyEligibleBefore,
      notifyEligibleAfter,
      notifyWouldSend,
      notifySent,
      writeSummary: {
        dryRun: !args.write,
        enrichUpdated,
        rescoreUpdated,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type BatchExecutionResult = {
  mode: "single" | "recent_batch";
  sinceCutoff: string | null;
  selectedTokens: SelectedToken[];
  selectedIncompleteCount: number;
  skippedCompleteCount: number;
  skippedNonPumpCount: number;
  items: ProcessedItem[];
  rateLimited: boolean;
  rateLimitedCount: number;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
};

async function executeBatch(args: Args): Promise<BatchExecutionResult> {
  const selection = await selectTokens(args);
  const items: ProcessedItem[] = [];
  let rateLimited = false;
  let rateLimitedCount = 0;
  let abortedDueToRateLimit = false;
  let skippedAfterRateLimit = 0;

  for (let index = 0; index < selection.selectedTokens.length; index += 1) {
    const token = selection.selectedTokens[index];
    const item = await processToken(token, args);
    items.push(item);

    if (
      selection.mode === "recent_batch" &&
      item.status === "error" &&
      isRateLimitErrorMessage(item.error)
    ) {
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
    selectedIncompleteCount: selection.selectedIncompleteCount,
    skippedCompleteCount: selection.skippedCompleteCount,
    skippedNonPumpCount: selection.skippedNonPumpCount,
    items,
    rateLimited,
    rateLimitedCount,
    abortedDueToRateLimit,
    skippedAfterRateLimit,
  };
}

function logBatchSummary(output: Output): void {
  console.error(
    [
      `${LOG_PREFIX} mode=${output.mode}`,
      `selected=${output.summary.selectedCount}`,
      `selectedIncomplete=${output.summary.selectedIncompleteCount}`,
      `skippedComplete=${output.summary.skippedCompleteCount}`,
      `skippedNonPump=${output.summary.skippedNonPumpCount}`,
      `ok=${output.summary.okCount}`,
      `error=${output.summary.errorCount}`,
      `enrichWritten=${output.summary.enrichWriteCount}`,
      `rescoreWritten=${output.summary.rescoreWriteCount}`,
      `notifyWouldSend=${output.summary.notifyWouldSendCount}`,
      `notifySent=${output.summary.notifySentCount}`,
      `rateLimited=${output.summary.rateLimited}`,
      `rateLimitedCount=${output.summary.rateLimitedCount}`,
      `abortedDueToRateLimit=${output.summary.abortedDueToRateLimit}`,
      `skippedAfterRateLimit=${output.summary.skippedAfterRateLimit}`,
    ].join(" "),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const execution = await executeBatch(args);

  const output: Output = {
    mode: execution.mode,
    dryRun: !args.write,
    writeEnabled: args.write,
    notifyEnabled: args.notify,
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: execution.sinceCutoff,
      pumpOnly: !args.mint && args.pumpOnly,
      selectedCount: execution.selectedTokens.length,
      selectedIncompleteCount: execution.selectedIncompleteCount,
      skippedCompleteCount: execution.skippedCompleteCount,
      skippedNonPumpCount: execution.skippedNonPumpCount,
    },
    summary: {
      selectedCount: execution.selectedTokens.length,
      selectedIncompleteCount: execution.selectedIncompleteCount,
      skippedCompleteCount: execution.skippedCompleteCount,
      skippedNonPumpCount: execution.skippedNonPumpCount,
      okCount: execution.items.filter((item) => item.status === "ok").length,
      errorCount: execution.items.filter((item) => item.status === "error").length,
      enrichWriteCount: execution.items.filter((item) => item.writeSummary.enrichUpdated).length,
      rescoreWriteCount: execution.items.filter((item) => item.writeSummary.rescoreUpdated).length,
      notifyCandidateCount: execution.items.filter((item) => item.notifyCandidate).length,
      notifyWouldSendCount: execution.items.filter((item) => item.notifyWouldSend).length,
      notifySentCount: execution.items.filter((item) => item.notifySent).length,
      rateLimited: execution.rateLimited,
      rateLimitedCount: execution.rateLimitedCount,
      abortedDueToRateLimit: execution.abortedDueToRateLimit,
      skippedAfterRateLimit: execution.skippedAfterRateLimit,
    },
    items: execution.items,
  };

  logBatchSummary(output);
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
