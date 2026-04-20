import "dotenv/config";

import { readFile } from "node:fs/promises";

import { db } from "./db.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const DEXSCREENER_TOKEN_PROFILES_API_URL = "https://api.dexscreener.com/token-profiles/latest/v1";
const DEFAULT_LIMIT = 20;
const DEFAULT_SINCE_HOURS = 24;
const SAMPLE_RESULTS_LIMIT = 5;

type JsonObject = Record<string, unknown>;

type Args = {
  sinceHours: number;
  limit: number;
};

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

type SelectedToken = {
  mint: string;
  currentSource: string | null;
  originSource: string | null;
  createdAt: string;
  importedAt: string;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
};

type ComparedSource = {
  id: string;
  family: string;
  label: string;
  endpoint: string;
  mode: "perMint" | "sharedBatch";
  fixtureEnvVar: string;
};

type ParsedAvailability = {
  address: string;
  metadata: {
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
};

type SourceResult = {
  sourceId: string;
  family: string;
  endpoint: string;
  status: "ok" | "not_found" | "error";
  rateLimited: boolean;
  availableFields: string[];
  metadata: {
    name: string | null;
    symbol: string | null;
    description: string | null;
  } | null;
  links: {
    website: string | null;
    x: string | null;
    telegram: string | null;
    anyLinks: boolean;
  } | null;
  error: string | null;
};

type AvailabilitySummary = {
  sourceId: string;
  family: string;
  endpoint: string;
  totalChecked: number;
  okCount: number;
  notFoundCount: number;
  fetchErrorCount: number;
  rateLimitedCount: number;
  nameAvailableCount: number;
  symbolAvailableCount: number;
  descriptionAvailableCount: number;
  websiteAvailableCount: number;
  xAvailableCount: number;
  telegramAvailableCount: number;
  anyLinksAvailableCount: number;
};

type Output = {
  readOnly: true;
  selection: {
    sinceHours: number;
    limit: number;
    sinceCutoff: string;
    geckoOriginTokenCount: number;
    skippedNonPumpCount: number;
    selectedCount: number;
  };
  comparedSources: Array<{
    id: string;
    family: string;
    label: string;
    endpoint: string;
    mode: "perMint" | "sharedBatch";
  }>;
  availabilitySummary: AvailabilitySummary[];
  sampleResults: Array<{
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    importedAt: string;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    sourceResults: SourceResult[];
  }>;
};

const COMPARED_SOURCES: ComparedSource[] = [
  {
    id: "geckoterminal.token_snapshot",
    family: "geckoterminal",
    label: "GeckoTerminal token snapshot",
    endpoint: `${GECKOTERMINAL_TOKEN_API_URL}/{mint}`,
    mode: "perMint",
    fixtureEnvVar: "GECKOTERMINAL_TOKEN_SNAPSHOT_FILE",
  },
  {
    id: "geckoterminal.token_snapshot_with_top_pools",
    family: "geckoterminal",
    label: "GeckoTerminal token snapshot with top_pools",
    endpoint: `${GECKOTERMINAL_TOKEN_API_URL}/{mint}?include=top_pools`,
    mode: "perMint",
    fixtureEnvVar: "GECKOTERMINAL_TOKEN_SNAPSHOT_WITH_TOP_POOLS_FILE",
  },
  {
    id: "dexscreener.token_profiles_latest_v1",
    family: "dexscreener",
    label: "DexScreener token profiles latest v1",
    endpoint: DEXSCREENER_TOKEN_PROFILES_API_URL,
    mode: "sharedBatch",
    fixtureEnvVar: "DEXSCREENER_TOKEN_PROFILES_LATEST_V1_FILE",
  },
];

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

class SourceFetchError extends Error {
  status: number | null;
  rateLimited: boolean;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "SourceFetchError";
    this.status = status;
    this.rateLimited = status === 429;
  }
}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm context:compare:source-families -- [--sinceHours <N>] [--limit <N>]",
    "",
    "Defaults:",
    `- compares ${COMPARED_SOURCES.length} repo-local context source candidates across GeckoTerminal and DexScreener families`,
    `- selects up to ${DEFAULT_LIMIT} recent Gecko-origin pump mints by default`,
    `- recent selection uses firstSeenSourceSnapshot.detectedAt when present, otherwise Token.createdAt`,
    `- recent selection looks back ${DEFAULT_SINCE_HOURS} hours by default`,
    "- stays read-only and returns JSON only",
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
    sinceHours: DEFAULT_SINCE_HOURS,
    limit: DEFAULT_LIMIT,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    const value = normalizedArgv[i + 1];
    if (!key.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new CliUsageError(`Missing value for ${key}`);
    }

    switch (key) {
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
      ...collectStringCandidates(value.text),
    ];
  }
  return [];
}

function pickNestedRecord(input: JsonObject, key: string): JsonObject | null {
  const value = input[key];
  return isRecord(value) ? value : null;
}

function buildAvailability(
  address: string,
  name: string | null,
  symbol: string | null,
  description: string | null,
  links: {
    websites: string[];
    xCandidates: string[];
    telegramCandidates: string[];
    otherLinks: string[];
  },
): ParsedAvailability {
  const availableFields: string[] = [];

  if (name !== null) availableFields.push("metadata.name");
  if (symbol !== null) availableFields.push("metadata.symbol");
  if (description !== null) availableFields.push("metadata.description");
  if (links.websites.length > 0) availableFields.push("links.website");
  if (links.xCandidates.length > 0) availableFields.push("links.x");
  if (links.telegramCandidates.length > 0) availableFields.push("links.telegram");
  if (links.otherLinks.length > 0) availableFields.push("links.other");

  return {
    address,
    metadata: {
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
  };
}

function extractGeckoLinkCandidates(
  attributes: JsonObject,
): {
  websites: string[];
  xCandidates: string[];
  telegramCandidates: string[];
  otherLinks: string[];
} {
  const socials = pickNestedRecord(attributes, "socials");

  const websites = dedupeStrings(
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
    websites,
    xCandidates,
    telegramCandidates,
    otherLinks,
  };
}

function parseGeckoAvailability(raw: unknown): ParsedAvailability {
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
  const links = extractGeckoLinkCandidates(attributes);

  return buildAvailability(
    readRequiredString(attributes, "address", "raw.data.attributes"),
    name,
    symbol,
    description,
    links,
  );
}

type DexscreenerTokenProfile = Record<string, unknown> & {
  tokenAddress?: unknown;
};

function normalizeDexscreenerProfiles(raw: unknown): DexscreenerTokenProfile[] {
  if (Array.isArray(raw)) {
    return raw.filter((item): item is DexscreenerTokenProfile => isRecord(item));
  }

  if (isRecord(raw)) {
    const payload = raw.payload;
    if (isRecord(payload)) {
      return [payload as DexscreenerTokenProfile];
    }

    const items = raw.items;
    if (Array.isArray(items)) {
      return items.filter((item): item is DexscreenerTokenProfile => isRecord(item));
    }

    return [raw as DexscreenerTokenProfile];
  }

  throw new Error("DexScreener profiles response was not an object or array");
}

function findDexscreenerProfile(
  profiles: DexscreenerTokenProfile[],
  mint: string,
): DexscreenerTokenProfile | null {
  const normalizedMint = mint.trim().toLowerCase();

  for (const profile of profiles) {
    const tokenAddress =
      typeof profile.tokenAddress === "string"
        ? profile.tokenAddress
        : typeof profile.address === "string"
          ? profile.address
          : null;
    if (tokenAddress && tokenAddress.trim().toLowerCase() === normalizedMint) {
      return profile;
    }
  }

  return null;
}

function extractDexLinks(
  profile: DexscreenerTokenProfile,
): {
  websites: string[];
  xCandidates: string[];
  telegramCandidates: string[];
  otherLinks: string[];
} {
  const rawLinks = Array.isArray(profile.links) ? profile.links : [];
  const websites: string[] = [];
  const xCandidates: string[] = [];
  const telegramCandidates: string[] = [];
  const otherLinks: string[] = [];

  for (const rawLink of rawLinks) {
    if (!isRecord(rawLink)) continue;
    const type = typeof rawLink.type === "string" ? rawLink.type.trim().toLowerCase() : "";
    const url =
      typeof rawLink.url === "string" && rawLink.url.trim().length > 0 ? rawLink.url.trim() : "";
    if (url.length === 0) continue;

    if (type === "website") {
      const normalized = normalizeWebsiteCandidate(url);
      if (normalized) websites.push(normalized);
      continue;
    }

    if (type === "twitter" || type === "x") {
      const normalized = normalizeXCandidate(url);
      if (normalized) xCandidates.push(normalized);
      continue;
    }

    if (type === "telegram") {
      const normalized = normalizeTelegramCandidate(url);
      if (normalized) telegramCandidates.push(normalized);
      continue;
    }

    const normalized = normalizeGenericLinkCandidate(url);
    if (normalized) otherLinks.push(normalized);
  }

  return {
    websites: dedupeStrings([
      ...websites,
      normalizeWebsiteCandidate(
        typeof profile.website === "string" ? profile.website : "",
      ),
    ]),
    xCandidates: dedupeStrings([
      ...xCandidates,
      normalizeXCandidate(typeof profile.twitter === "string" ? profile.twitter : ""),
      normalizeXCandidate(typeof profile.twitterUsername === "string" ? profile.twitterUsername : ""),
    ]),
    telegramCandidates: dedupeStrings([
      ...telegramCandidates,
      normalizeTelegramCandidate(typeof profile.telegram === "string" ? profile.telegram : ""),
    ]),
    otherLinks: dedupeStrings(otherLinks),
  };
}

function parseDexscreenerAvailability(profile: DexscreenerTokenProfile): ParsedAvailability {
  const name = typeof profile.name === "string" && profile.name.trim().length > 0 ? profile.name.trim() : null;
  const symbol =
    typeof profile.symbol === "string" && profile.symbol.trim().length > 0
      ? profile.symbol.trim()
      : null;
  const description =
    typeof profile.description === "string" && profile.description.trim().length > 0
      ? profile.description.trim()
      : null;
  const address =
    typeof profile.tokenAddress === "string" && profile.tokenAddress.trim().length > 0
      ? profile.tokenAddress.trim()
      : readRequiredString(profile as JsonObject, "mintAddress", "dexscreener.profile");
  const links = extractDexLinks(profile);

  return buildAvailability(address, name, symbol, description, links);
}

function buildSelectedToken(token: {
  mint: string;
  source: string | null;
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

  return {
    mint: token.mint,
    currentSource: token.source,
    originSource: originSource ?? null,
    createdAt: token.createdAt.toISOString(),
    importedAt: token.importedAt.toISOString(),
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
  };
}

async function selectTokens(args: Args): Promise<{
  sinceCutoff: string;
  geckoOriginTokenCount: number;
  skippedNonPumpCount: number;
  selectedTokens: SelectedToken[];
}> {
  const sinceCutoff = new Date(Date.now() - args.sinceHours * 60 * 60 * 1_000);

  const rawTokens = await db.token.findMany({
    where: {
      createdAt: {
        gte: sinceCutoff,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      mint: true,
      source: true,
      createdAt: true,
      importedAt: true,
      entrySnapshot: true,
    },
  });

  const geckoOriginTokens = rawTokens
    .map((token) => buildSelectedToken(token))
    .filter(
      (token) =>
        token.isGeckoterminalOrigin && new Date(token.selectionAnchorAt).getTime() >= sinceCutoff.getTime(),
    );
  const pumpTokens = geckoOriginTokens.filter((token) => isPumpMint(token.mint));

  return {
    sinceCutoff: sinceCutoff.toISOString(),
    geckoOriginTokenCount: geckoOriginTokens.length,
    skippedNonPumpCount: geckoOriginTokens.length - pumpTokens.length,
    selectedTokens: pumpTokens.slice(0, args.limit),
  };
}

function buildGeckoFetchUrl(source: ComparedSource, mint: string): string {
  if (source.id === "geckoterminal.token_snapshot_with_top_pools") {
    return `${GECKOTERMINAL_TOKEN_API_URL}/${encodeURIComponent(mint)}?include=top_pools`;
  }

  return `${GECKOTERMINAL_TOKEN_API_URL}/${encodeURIComponent(mint)}`;
}

async function fetchComparedSourceRaw(source: ComparedSource, mint?: string): Promise<unknown> {
  const fixturePath = process.env[source.fixtureEnvVar];
  const fallbackGeckoFixture = process.env.GECKOTERMINAL_TOKEN_SNAPSHOT_FILE;
  const resolvedFixturePath =
    fixturePath ??
    (source.family === "geckoterminal" ? fallbackGeckoFixture : undefined);

  if (resolvedFixturePath) {
    const content = await readFile(resolvedFixturePath, "utf-8");
    return JSON.parse(content) as unknown;
  }

  const url =
    source.family === "geckoterminal"
      ? buildGeckoFetchUrl(source, mint ?? "")
      : source.endpoint;

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new SourceFetchError(
      `${source.id} request failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }

  return (await response.json()) as unknown;
}

function buildEmptySummary(source: ComparedSource): AvailabilitySummary {
  return {
    sourceId: source.id,
    family: source.family,
    endpoint: source.endpoint,
    totalChecked: 0,
    okCount: 0,
    notFoundCount: 0,
    fetchErrorCount: 0,
    rateLimitedCount: 0,
    nameAvailableCount: 0,
    symbolAvailableCount: 0,
    descriptionAvailableCount: 0,
    websiteAvailableCount: 0,
    xAvailableCount: 0,
    telegramAvailableCount: 0,
    anyLinksAvailableCount: 0,
  };
}

function updateSummaryFromAvailability(summary: AvailabilitySummary, availability: ParsedAvailability): void {
  summary.totalChecked += 1;
  summary.okCount += 1;

  if (availability.metadata.name !== null) summary.nameAvailableCount += 1;
  if (availability.metadata.symbol !== null) summary.symbolAvailableCount += 1;
  if (availability.metadata.description !== null) summary.descriptionAvailableCount += 1;
  if (availability.links.website !== null) summary.websiteAvailableCount += 1;
  if (availability.links.x !== null) summary.xAvailableCount += 1;
  if (availability.links.telegram !== null) summary.telegramAvailableCount += 1;
  if (
    availability.links.website !== null ||
    availability.links.x !== null ||
    availability.links.telegram !== null ||
    availability.links.otherLinks.length > 0
  ) {
    summary.anyLinksAvailableCount += 1;
  }
}

function updateSummaryNotFound(summary: AvailabilitySummary): void {
  summary.totalChecked += 1;
  summary.notFoundCount += 1;
}

function updateSummaryFromError(summary: AvailabilitySummary, error: SourceFetchError | Error): void {
  summary.totalChecked += 1;
  summary.fetchErrorCount += 1;

  if (error instanceof SourceFetchError && error.rateLimited) {
    summary.rateLimitedCount += 1;
  }
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const selection = await selectTokens(args);
  const summaries = new Map<string, AvailabilitySummary>(
    COMPARED_SOURCES.map((source) => [source.id, buildEmptySummary(source)]),
  );
  const sampleResults: Output["sampleResults"] = [];

  let dexscreenerProfiles: DexscreenerTokenProfile[] | null = null;
  let dexscreenerFetchError: SourceFetchError | Error | null = null;

  const dexscreenerSource = COMPARED_SOURCES.find(
    (source) => source.id === "dexscreener.token_profiles_latest_v1",
  );
  if (!dexscreenerSource) {
    throw new Error("Missing DexScreener source definition");
  }

  try {
    const raw = await fetchComparedSourceRaw(dexscreenerSource);
    dexscreenerProfiles = normalizeDexscreenerProfiles(raw);
  } catch (error) {
    dexscreenerFetchError =
      error instanceof SourceFetchError
        ? error
        : new Error(error instanceof Error ? error.message : String(error));
  }

  for (const token of selection.selectedTokens) {
    const sourceResults: SourceResult[] = [];

    for (const source of COMPARED_SOURCES) {
      const summary = summaries.get(source.id);
      if (!summary) {
        throw new Error(`Missing summary bucket for source: ${source.id}`);
      }

      if (source.family === "dexscreener") {
        if (dexscreenerFetchError) {
          updateSummaryFromError(summary, dexscreenerFetchError);
          sourceResults.push({
            sourceId: source.id,
            family: source.family,
            endpoint: source.endpoint,
            status: "error",
            rateLimited:
              dexscreenerFetchError instanceof SourceFetchError && dexscreenerFetchError.rateLimited,
            availableFields: [],
            metadata: null,
            links: null,
            error: dexscreenerFetchError.message,
          });
          continue;
        }

        const profile = findDexscreenerProfile(dexscreenerProfiles ?? [], token.mint);
        if (!profile) {
          updateSummaryNotFound(summary);
          sourceResults.push({
            sourceId: source.id,
            family: source.family,
            endpoint: source.endpoint,
            status: "not_found",
            rateLimited: false,
            availableFields: [],
            metadata: null,
            links: null,
            error: null,
          });
          continue;
        }

        const availability = parseDexscreenerAvailability(profile);
        updateSummaryFromAvailability(summary, availability);
        sourceResults.push({
          sourceId: source.id,
          family: source.family,
          endpoint: source.endpoint,
          status: "ok",
          rateLimited: false,
          availableFields: availability.availableFields,
          metadata: availability.metadata,
          links: {
            website: availability.links.website,
            x: availability.links.x,
            telegram: availability.links.telegram,
            anyLinks:
              availability.links.website !== null ||
              availability.links.x !== null ||
              availability.links.telegram !== null ||
              availability.links.otherLinks.length > 0,
          },
          error: null,
        });
        continue;
      }

      try {
        const raw = await fetchComparedSourceRaw(source, token.mint);
        const availability = parseGeckoAvailability(raw);
        updateSummaryFromAvailability(summary, availability);
        sourceResults.push({
          sourceId: source.id,
          family: source.family,
          endpoint: source.endpoint,
          status: "ok",
          rateLimited: false,
          availableFields: availability.availableFields,
          metadata: availability.metadata,
          links: {
            website: availability.links.website,
            x: availability.links.x,
            telegram: availability.links.telegram,
            anyLinks:
              availability.links.website !== null ||
              availability.links.x !== null ||
              availability.links.telegram !== null ||
              availability.links.otherLinks.length > 0,
          },
          error: null,
        });
      } catch (error) {
        const normalizedError =
          error instanceof SourceFetchError
            ? error
            : new Error(error instanceof Error ? error.message : String(error));
        updateSummaryFromError(summary, normalizedError);
        sourceResults.push({
          sourceId: source.id,
          family: source.family,
          endpoint: source.endpoint,
          status: "error",
          rateLimited: normalizedError instanceof SourceFetchError && normalizedError.rateLimited,
          availableFields: [],
          metadata: null,
          links: null,
          error: normalizedError.message,
        });
      }
    }

    if (sampleResults.length < SAMPLE_RESULTS_LIMIT) {
      sampleResults.push({
        mint: token.mint,
        currentSource: token.currentSource,
        originSource: token.originSource,
        importedAt: token.importedAt,
        selectionAnchorAt: token.selectionAnchorAt,
        selectionAnchorKind: token.selectionAnchorKind,
        sourceResults,
      });
    }
  }

  const output: Output = {
    readOnly: true,
    selection: {
      sinceHours: args.sinceHours,
      limit: args.limit,
      sinceCutoff: selection.sinceCutoff,
      geckoOriginTokenCount: selection.geckoOriginTokenCount,
      skippedNonPumpCount: selection.skippedNonPumpCount,
      selectedCount: selection.selectedTokens.length,
    },
    comparedSources: COMPARED_SOURCES.map((source) => ({
      id: source.id,
      family: source.family,
      label: source.label,
      endpoint: source.endpoint,
      mode: source.mode,
    })),
    availabilitySummary: COMPARED_SOURCES.map(
      (source) => summaries.get(source.id) ?? buildEmptySummary(source),
    ),
    sampleResults,
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch((error) => {
  if (error instanceof CliUsageError) {
    if (error.message.length > 0) {
      console.error(`Error: ${error.message}`);
    }
    console.log(getUsageText());
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});
