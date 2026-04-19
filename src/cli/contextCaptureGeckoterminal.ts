import "dotenv/config";

import { readFile } from "node:fs/promises";

import { Prisma } from "@prisma/client";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const CONTEXT_CAPTURE_SOURCE = "geckoterminal.token_snapshot";
const DEFAULT_LIMIT = 20;
const DEFAULT_SINCE_HOURS = 24;

type JsonObject = Record<string, unknown>;

type Args = {
  write: boolean;
  mint?: string;
  limit: number;
  sinceHours: number;
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
  createdAt: string;
  importedAt: string;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
  entrySnapshot: unknown;
  hasUsefulSavedContextCapture: boolean;
};

type CollectedContext = {
  source: string;
  capturedAt: string;
  address: string;
  metadataText: {
    name: string | null;
    symbol: string | null;
    description: string | null;
  };
  links: {
    website: string | null;
    x: string | null;
    telegram: string | null;
    websites: string[];
    xCandidates: string[];
    telegramCandidates: string[];
    otherLinks: string[];
  };
  availableFields: string[];
  missingFields: string[];
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
    createdAt: string;
    importedAt: string;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    isGeckoterminalOrigin: boolean;
    hasUsefulSavedContextCapture: boolean;
  };
  selectedReason: "explicitMint" | "firstSeenSourceSnapshot.detectedAt" | "Token.createdAt";
  status: "ok" | "error";
  savedContextPresentBefore: boolean;
  collectedContext?: CollectedContext;
  wouldWrite: boolean;
  writeSummary: {
    dryRun: boolean;
    updatedEntrySnapshot: boolean;
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
    sinceHours: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    selectedCount: number;
    skippedAlreadyCapturedCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    errorCount: number;
    writeCount: number;
    savedContextBeforeCount: number;
    availableDescriptionCount: number;
    availableWebsiteCount: number;
    availableXCount: number;
    availableTelegramCount: number;
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
    "pnpm context:capture:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceHours <N>] [--write]",
    "",
    "Defaults:",
    `- fetches live GeckoTerminal token snapshots from ${GECKOTERMINAL_TOKEN_API_URL}/{mint}`,
    `- recent batch mode selects up to ${DEFAULT_LIMIT} recent GeckoTerminal-origin pump mints without useful saved context capture`,
    `- recent batch mode uses firstSeenSourceSnapshot.detectedAt when present, otherwise Token.createdAt`,
    `- recent batch mode looks back ${DEFAULT_SINCE_HOURS} hours by default`,
    "- stays dry-run by default and saves only into Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot with --write",
    "- score, notify, metric, and current token metadata are unchanged",
    "- --mint single mode may inspect or save a non-pump token and ignores the pump-only batch filter",
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
    sinceHours: DEFAULT_SINCE_HOURS,
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
      case "--sinceHours":
        out.sinceHours = parsePositiveIntegerArg(value, key);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out;
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(input: JsonObject, key: string): string | null {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readRequiredString(input: JsonObject, key: string, context: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }

  return value.trim();
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
  if (!isRecord(entrySnapshot)) {
    return null;
  }

  const firstSeenSourceSnapshot = entrySnapshot.firstSeenSourceSnapshot;
  if (!isRecord(firstSeenSourceSnapshot)) {
    return null;
  }

  return firstSeenSourceSnapshot as FirstSeenSourceSnapshot;
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function normalizeWebsiteCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function normalizeXCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\/(www\.)?(x|twitter)\.com\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  if (/^[A-Za-z0-9_]{1,32}$/.test(handle)) {
    return `https://x.com/${handle}`;
  }
  return null;
}

function normalizeTelegramCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(trimmed)) return trimmed;
  const handle = trimmed.replace(/^@/, "");
  if (/^[A-Za-z0-9_]{1,64}$/.test(handle)) {
    return `https://t.me/${handle}`;
  }
  return null;
}

function normalizeGenericLinkCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function collectStringCandidates(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim().length > 0 ? [value.trim()] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStringCandidates(item));
  }
  if (isRecord(value)) {
    return [
      ...collectStringCandidates(value.url),
      ...collectStringCandidates(value.href),
      ...collectStringCandidates(value.link),
      ...collectStringCandidates(value.value),
      ...collectStringCandidates(value.website),
      ...collectStringCandidates(value.website_url),
      ...collectStringCandidates(value.handle),
      ...collectStringCandidates(value.username),
    ];
  }
  return [];
}

function pickNestedRecord(input: JsonObject, key: string): JsonObject | null {
  const value = input[key];
  return isRecord(value) ? value : null;
}

function extractLinkCandidates(
  attributes: JsonObject,
): {
  websites: string[];
  xCandidates: string[];
  telegramCandidates: string[];
  otherLinks: string[];
} {
  const socials = pickNestedRecord(attributes, "socials");
  const websiteCandidates = dedupeStrings(
    [
      ...collectStringCandidates(attributes.website),
      ...collectStringCandidates(attributes.website_url),
      ...collectStringCandidates(attributes.websites),
      ...collectStringCandidates(socials?.website),
      ...collectStringCandidates(socials?.websites),
    ].map((value) => normalizeWebsiteCandidate(value)),
  );
  const xCandidates = dedupeStrings(
    [
      ...collectStringCandidates(attributes.twitter),
      ...collectStringCandidates(attributes.twitter_url),
      ...collectStringCandidates(attributes.twitter_username),
      ...collectStringCandidates(attributes.twitter_handle),
      ...collectStringCandidates(attributes.x),
      ...collectStringCandidates(attributes.x_url),
      ...collectStringCandidates(attributes.x_username),
      ...collectStringCandidates(attributes.x_handle),
      ...collectStringCandidates(socials?.twitter),
      ...collectStringCandidates(socials?.x),
    ].map((value) => normalizeXCandidate(value)),
  );
  const telegramCandidates = dedupeStrings(
    [
      ...collectStringCandidates(attributes.telegram),
      ...collectStringCandidates(attributes.telegram_url),
      ...collectStringCandidates(attributes.telegram_handle),
      ...collectStringCandidates(socials?.telegram),
    ].map((value) => normalizeTelegramCandidate(value)),
  );
  const otherLinks = dedupeStrings(
    [
      ...collectStringCandidates(attributes.discord_url),
      ...collectStringCandidates(attributes.discord),
      ...collectStringCandidates(socials?.discord),
    ].map((value) => normalizeGenericLinkCandidate(value)),
  );

  return {
    websites: websiteCandidates,
    xCandidates,
    telegramCandidates,
    otherLinks,
  };
}

function parseCollectedContext(raw: unknown): CollectedContext {
  if (!isRecord(raw)) {
    throw new Error("raw must be an object");
  }
  const data = raw.data;
  if (!isRecord(data)) {
    throw new Error("raw.data must be an object");
  }
  const attributes = data.attributes;
  if (!isRecord(attributes)) {
    throw new Error("raw.data.attributes must be an object");
  }

  const name = readOptionalString(attributes, "name");
  const symbol = readOptionalString(attributes, "symbol");
  const description =
    readOptionalString(attributes, "description") ?? readOptionalString(attributes, "bio");
  const links = extractLinkCandidates(attributes);
  const availableFields: string[] = [];

  if (name !== null) availableFields.push("metadata.name");
  if (symbol !== null) availableFields.push("metadata.symbol");
  if (description !== null) availableFields.push("metadata.description");
  if (links.websites.length > 0) availableFields.push("links.website");
  if (links.xCandidates.length > 0) availableFields.push("links.x");
  if (links.telegramCandidates.length > 0) availableFields.push("links.telegram");
  if (links.otherLinks.length > 0) availableFields.push("links.other");

  const availableFieldSet = new Set(availableFields);

  return {
    source: CONTEXT_CAPTURE_SOURCE,
    capturedAt: new Date().toISOString(),
    address: readRequiredString(attributes, "address", "raw.data.attributes"),
    metadataText: {
      name,
      symbol,
      description,
    },
    links: {
      website: links.websites[0] ?? null,
      x: links.xCandidates[0] ?? null,
      telegram: links.telegramCandidates[0] ?? null,
      websites: links.websites,
      xCandidates: links.xCandidates,
      telegramCandidates: links.telegramCandidates,
      otherLinks: links.otherLinks,
    },
    availableFields,
    missingFields: [
      "metadata.name",
      "metadata.symbol",
      "metadata.description",
      "links.website",
      "links.x",
      "links.telegram",
      "links.other",
    ].filter((field) => !availableFieldSet.has(field)),
  };
}

function sanitizeContextForCompare(context: CollectedContext): Omit<CollectedContext, "capturedAt"> {
  const { capturedAt: _capturedAt, ...rest } = context;
  return rest;
}

function hasUsefulCollectedContext(context: CollectedContext | null): boolean {
  return context !== null && context.availableFields.length > 0;
}

function extractSavedCollectedContext(entrySnapshot: unknown): CollectedContext | null {
  if (!isRecord(entrySnapshot)) {
    return null;
  }
  const contextCapture = entrySnapshot.contextCapture;
  if (!isRecord(contextCapture)) {
    return null;
  }
  const geckoterminalTokenSnapshot = contextCapture.geckoterminalTokenSnapshot;
  if (!isRecord(geckoterminalTokenSnapshot)) {
    return null;
  }

  const metadataText = pickNestedRecord(geckoterminalTokenSnapshot, "metadataText");
  const links = pickNestedRecord(geckoterminalTokenSnapshot, "links");
  const availableFields = Array.isArray(geckoterminalTokenSnapshot.availableFields)
    ? geckoterminalTokenSnapshot.availableFields.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const missingFields = Array.isArray(geckoterminalTokenSnapshot.missingFields)
    ? geckoterminalTokenSnapshot.missingFields.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    source:
      typeof geckoterminalTokenSnapshot.source === "string"
        ? geckoterminalTokenSnapshot.source
        : CONTEXT_CAPTURE_SOURCE,
    capturedAt:
      typeof geckoterminalTokenSnapshot.capturedAt === "string"
        ? geckoterminalTokenSnapshot.capturedAt
        : new Date(0).toISOString(),
    address:
      typeof geckoterminalTokenSnapshot.address === "string"
        ? geckoterminalTokenSnapshot.address
        : "",
    metadataText: {
      name: metadataText ? readOptionalString(metadataText, "name") : null,
      symbol: metadataText ? readOptionalString(metadataText, "symbol") : null,
      description: metadataText ? readOptionalString(metadataText, "description") : null,
    },
    links: {
      website: links ? readOptionalString(links, "website") : null,
      x: links ? readOptionalString(links, "x") : null,
      telegram: links ? readOptionalString(links, "telegram") : null,
      websites: Array.isArray(links?.websites)
        ? links.websites.filter((value): value is string => typeof value === "string")
        : [],
      xCandidates: Array.isArray(links?.xCandidates)
        ? links.xCandidates.filter((value): value is string => typeof value === "string")
        : [],
      telegramCandidates: Array.isArray(links?.telegramCandidates)
        ? links.telegramCandidates.filter((value): value is string => typeof value === "string")
        : [],
      otherLinks: Array.isArray(links?.otherLinks)
        ? links.otherLinks.filter((value): value is string => typeof value === "string")
        : [],
    },
    availableFields,
    missingFields,
  };
}

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  metadataStatus: string;
  name: string | null;
  symbol: string | null;
  createdAt: Date;
  importedAt: Date;
  entrySnapshot: unknown;
}): SelectedToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDateString(firstSeen?.detectedAt);
  const savedContext = extractSavedCollectedContext(token.entrySnapshot);

  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.source,
    originSource: originSource ?? null,
    metadataStatus: token.metadataStatus,
    name: token.name,
    symbol: token.symbol,
    createdAt: token.createdAt.toISOString(),
    importedAt: token.importedAt.toISOString(),
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
    entrySnapshot: token.entrySnapshot,
    hasUsefulSavedContextCapture: hasUsefulCollectedContext(savedContext),
  };
}

async function fetchTokenSnapshotRaw(mint: string): Promise<unknown> {
  const fixtureFilePath = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
  if (fixtureFilePath) {
    const content = await readFile(fixtureFilePath, "utf-8");
    return JSON.parse(content) as unknown;
  }

  const apiUrl = process.env.GECKOTERMINAL_TOKEN_API_URL ?? GECKOTERMINAL_TOKEN_API_URL;
  const response = await fetch(`${apiUrl}/${encodeURIComponent(mint)}`, {
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

async function selectTokens(args: Args): Promise<{
  mode: "single" | "recent_batch";
  selectedTokens: SelectedToken[];
  sinceCutoff: string | null;
  skippedAlreadyCapturedCount: number;
  skippedNonPumpCount: number;
}> {
  if (args.mint) {
    const token = await db.token.findUnique({
      where: { mint: args.mint },
      select: {
        id: true,
        mint: true,
        source: true,
        metadataStatus: true,
        name: true,
        symbol: true,
        createdAt: true,
        importedAt: true,
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
      skippedAlreadyCapturedCount: 0,
      skippedNonPumpCount: 0,
    };
  }

  const sinceCutoff = new Date(Date.now() - args.sinceHours * 60 * 60 * 1_000);
  const rawTokens = await db.token.findMany({
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
      metadataStatus: true,
      name: true,
      symbol: true,
      createdAt: true,
      importedAt: true,
      entrySnapshot: true,
    },
  });

  const recentGeckoTokens = rawTokens
    .map(buildSelectedToken)
    .filter(
      (token) =>
        token.isGeckoterminalOrigin &&
        Date.parse(token.selectionAnchorAt) >= sinceCutoff.getTime(),
    )
    .sort((left, right) => {
      const delta = Date.parse(right.selectionAnchorAt) - Date.parse(left.selectionAnchorAt);
      if (delta !== 0) return delta;
      return right.id - left.id;
    });
  const pumpTokens = recentGeckoTokens.filter((token) => isPumpMint(token.mint));
  const uncapturedTokens = pumpTokens.filter((token) => !token.hasUsefulSavedContextCapture);

  return {
    mode: "recent_batch",
    selectedTokens: uncapturedTokens.slice(0, args.limit),
    sinceCutoff: sinceCutoff.toISOString(),
    skippedAlreadyCapturedCount: pumpTokens.length - uncapturedTokens.length,
    skippedNonPumpCount: recentGeckoTokens.length - pumpTokens.length,
  };
}

function mergeEntrySnapshotWithContextCapture(
  entrySnapshot: unknown,
  collectedContext: CollectedContext,
): JsonObject {
  const baseEntrySnapshot = isRecord(entrySnapshot) ? { ...entrySnapshot } : {};
  const existingContextCapture = pickNestedRecord(baseEntrySnapshot, "contextCapture") ?? {};

  return {
    ...baseEntrySnapshot,
    contextCapture: {
      ...existingContextCapture,
      geckoterminalTokenSnapshot: collectedContext,
    },
  };
}

async function saveCollectedContext(
  tokenId: number,
  entrySnapshot: unknown,
  collectedContext: CollectedContext,
): Promise<void> {
  await db.token.update({
    where: { id: tokenId },
    data: {
      entrySnapshot: mergeEntrySnapshotWithContextCapture(
        entrySnapshot,
        collectedContext,
      ) as Prisma.InputJsonValue,
    },
  });
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
    createdAt: token.createdAt,
    importedAt: token.importedAt,
    selectionAnchorAt: token.selectionAnchorAt,
    selectionAnchorKind: token.selectionAnchorKind,
    isGeckoterminalOrigin: token.isGeckoterminalOrigin,
    hasUsefulSavedContextCapture: token.hasUsefulSavedContextCapture,
  };
}

async function processToken(token: SelectedToken, args: Args): Promise<ProcessedItem> {
  const selectedReason: ProcessedItem["selectedReason"] = args.mint
    ? "explicitMint"
    : token.selectionAnchorKind === "firstSeenDetectedAt"
      ? "firstSeenSourceSnapshot.detectedAt"
      : "Token.createdAt";
  const savedContext = extractSavedCollectedContext(token.entrySnapshot);

  try {
    const raw = await fetchTokenSnapshotRaw(token.mint);
    const collectedContext = parseCollectedContext(raw);
    const usefulCollectedContext = hasUsefulCollectedContext(collectedContext);
    const sameAsSaved =
      savedContext !== null &&
      JSON.stringify(sanitizeContextForCompare(savedContext)) ===
        JSON.stringify(sanitizeContextForCompare(collectedContext));
    const writeEligible = usefulCollectedContext && !sameAsSaved;
    const wouldWrite = writeEligible;
    let updatedEntrySnapshot = false;

    if (args.write && writeEligible) {
      await saveCollectedContext(token.id, token.entrySnapshot, collectedContext);
      updatedEntrySnapshot = true;
    }

    return {
      token: buildTokenOutput(token),
      selectedReason,
      status: "ok",
      savedContextPresentBefore: token.hasUsefulSavedContextCapture,
      collectedContext,
      wouldWrite,
      writeSummary: {
        dryRun: !args.write,
        updatedEntrySnapshot,
      },
    };
  } catch (error) {
    return {
      token: buildTokenOutput(token),
      selectedReason,
      status: "error",
      savedContextPresentBefore: token.hasUsefulSavedContextCapture,
      wouldWrite: false,
      writeSummary: {
        dryRun: !args.write,
        updatedEntrySnapshot: false,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const selection = await selectTokens(args);
  const items = await Promise.all(selection.selectedTokens.map((token) => processToken(token, args)));

  const output: Output = {
    mode: selection.mode,
    dryRun: !args.write,
    writeEnabled: args.write,
    source: CONTEXT_CAPTURE_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceHours: args.mint ? null : args.sinceHours,
      sinceCutoff: selection.sinceCutoff,
      pumpOnly: !args.mint,
      selectedCount: selection.selectedTokens.length,
      skippedAlreadyCapturedCount: selection.skippedAlreadyCapturedCount,
      skippedNonPumpCount: selection.skippedNonPumpCount,
    },
    summary: {
      selectedCount: selection.selectedTokens.length,
      okCount: items.filter((item) => item.status === "ok").length,
      errorCount: items.filter((item) => item.status === "error").length,
      writeCount: items.filter((item) => item.writeSummary.updatedEntrySnapshot).length,
      savedContextBeforeCount: items.filter((item) => item.savedContextPresentBefore).length,
      availableDescriptionCount: items.filter(
        (item) => item.collectedContext?.metadataText.description !== null,
      ).length,
      availableWebsiteCount: items.filter(
        (item) => item.collectedContext?.links.website !== null,
      ).length,
      availableXCount: items.filter((item) => item.collectedContext?.links.x !== null).length,
      availableTelegramCount: items.filter(
        (item) => item.collectedContext?.links.telegram !== null,
      ).length,
    },
    items,
  };

  console.log(JSON.stringify(output, null, 2));
}

run()
  .catch((error) => {
    if (error instanceof CliUsageError) {
      if (error.message) {
        console.error(`Error: ${error.message}`);
      }
      console.log(getUsageText());
      process.exitCode = 1;
      return;
    }

    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
