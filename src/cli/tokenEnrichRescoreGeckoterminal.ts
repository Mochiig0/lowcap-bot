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
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const DEFAULT_LIMIT = 20;
const DEFAULT_SINCE_MINUTES = 180;

type JsonObject = Record<string, unknown>;

type Args = {
  write: boolean;
  mint?: string;
  limit: number;
  sinceMinutes: number;
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
  source: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    selectedCount: number;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    errorCount: number;
    enrichWriteCount: number;
    rescoreWriteCount: number;
    notifyCandidateCount: number;
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
    "pnpm token:enrich-rescore:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--write]",
    "",
    "Defaults:",
    `- fetches live GeckoTerminal token snapshots from ${GECKOTERMINAL_TOKEN_API_URL}/{mint}?include=top_pools`,
    `- recent batch mode selects up to ${DEFAULT_LIMIT} recent GeckoTerminal-origin tokens`,
    `- recent batch mode uses firstSeenSourceSnapshot.detectedAt when present, otherwise Token.createdAt`,
    `- recent batch mode looks back ${DEFAULT_SINCE_MINUTES} minutes by default`,
    "- stays dry-run by default and writes Token enrich/rescore updates only when --write is set",
    "- fetches name and symbol from GeckoTerminal token snapshots, keeps description unchanged, and does not notify",
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
    limit: DEFAULT_LIMIT,
    sinceMinutes: DEFAULT_SINCE_MINUTES,
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

async function selectTokens(args: Args): Promise<{
  mode: "single" | "recent_batch";
  selectedTokens: SelectedToken[];
  sinceCutoff: string | null;
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

    return {
      mode: "single",
      selectedTokens: [buildSelectedToken(token)],
      sinceCutoff: null,
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
      metadataStatus: true,
      createdAt: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
    },
  });

  const selectedTokens = tokens
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
    })
    .slice(0, args.limit);

  return {
    mode: "recent_batch",
    selectedTokens,
    sinceCutoff: sinceCutoff.toISOString(),
  };
}

async function fetchTokenSnapshotRaw(mint: string): Promise<unknown> {
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

async function processToken(token: SelectedToken, args: Args): Promise<ProcessedItem> {
  try {
    const raw = await fetchTokenSnapshotRaw(token.mint);
    const snapshot = parseSnapshotMetadata(raw);
    const patch = {
      ...(snapshot.name !== null && snapshot.name !== token.name ? { name: snapshot.name } : {}),
      ...(snapshot.symbol !== null && snapshot.symbol !== token.symbol
        ? { symbol: snapshot.symbol }
        : {}),
    };
    const hasPatch = Object.keys(patch).length > 0;

    const enrichPlan = hasPatch
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

    const enrichPreview = enrichPlan?.preview ?? buildCurrentEnrichPreview(token);
    const rescorePreview = await buildTokenRescorePreview({
      mint: token.mint,
      name: enrichPreview.name,
      symbol: enrichPreview.symbol,
      description: enrichPreview.description,
    });

    let enrichUpdated = false;
    let rescoreUpdated = false;
    if (args.write) {
      if (enrichPlan?.hasChange) {
        await enrichTokenByMint(token.mint, patch);
        enrichUpdated = true;
      }

      await rescoreTokenByMint(token.mint);
      rescoreUpdated = true;
    }

    return {
      token: {
        id: token.id,
        mint: token.mint,
        currentSource: token.currentSource,
        originSource: token.originSource,
        metadataStatus: token.metadataStatus,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        createdAt: token.createdAt,
        importedAt: token.importedAt,
        enrichedAt: token.enrichedAt,
        rescoredAt: token.rescoredAt,
        selectionAnchorAt: token.selectionAnchorAt,
        selectionAnchorKind: token.selectionAnchorKind,
        isGeckoterminalOrigin: token.isGeckoterminalOrigin,
      },
      selectedReason:
        token.selectionAnchorKind === "firstSeenDetectedAt"
          ? "firstSeenSourceSnapshot.detectedAt"
          : "Token.createdAt",
      status: "ok",
      fetchedSnapshot: snapshot,
      enrichPlan: {
        hasPatch,
        willUpdate: enrichPlan?.hasChange ?? false,
        patch,
        preview: {
          metadataStatus: enrichPreview.metadataStatus,
          name: enrichPreview.name,
          symbol: enrichPreview.symbol,
          description: enrichPreview.description,
        },
      },
      rescorePreview: {
        ready: true,
        normalizedText: rescorePreview.normalizedText,
        scoreTotal: rescorePreview.scoreTotal,
        scoreRank: rescorePreview.scoreRank,
        hardRejected: rescorePreview.hardRejected,
        hardRejectReason: rescorePreview.hardRejectReason,
      },
      notifyCandidate: rescorePreview.scoreRank === "S" && !rescorePreview.hardRejected,
      writeSummary: {
        dryRun: !args.write,
        enrichUpdated,
        rescoreUpdated,
      },
    };
  } catch (error) {
    return {
      token: {
        id: token.id,
        mint: token.mint,
        currentSource: token.currentSource,
        originSource: token.originSource,
        metadataStatus: token.metadataStatus,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        createdAt: token.createdAt,
        importedAt: token.importedAt,
        enrichedAt: token.enrichedAt,
        rescoredAt: token.rescoredAt,
        selectionAnchorAt: token.selectionAnchorAt,
        selectionAnchorKind: token.selectionAnchorKind,
        isGeckoterminalOrigin: token.isGeckoterminalOrigin,
      },
      selectedReason:
        token.selectionAnchorKind === "firstSeenDetectedAt"
          ? "firstSeenSourceSnapshot.detectedAt"
          : "Token.createdAt",
      status: "error",
      notifyCandidate: false,
      writeSummary: {
        dryRun: !args.write,
        enrichUpdated: false,
        rescoreUpdated: false,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const selection = await selectTokens(args);
  const items: ProcessedItem[] = [];

  for (const token of selection.selectedTokens) {
    items.push(await processToken(token, args));
  }

  const output: Output = {
    mode: selection.mode,
    dryRun: !args.write,
    writeEnabled: args.write,
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: selection.sinceCutoff,
      selectedCount: selection.selectedTokens.length,
    },
    summary: {
      selectedCount: selection.selectedTokens.length,
      okCount: items.filter((item) => item.status === "ok").length,
      errorCount: items.filter((item) => item.status === "error").length,
      enrichWriteCount: items.filter((item) => item.writeSummary.enrichUpdated).length,
      rescoreWriteCount: items.filter((item) => item.writeSummary.rescoreUpdated).length,
      notifyCandidateCount: items.filter((item) => item.notifyCandidate).length,
    },
    items,
  };

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
