import "dotenv/config";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Prisma } from "@prisma/client";

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
import {
  runGeckoTokenWriteForMint,
  toGeckoTokenEnrichRescoreCliItem,
  type GeckoTokenEnrichRescoreCliItem,
  type GeckoTokenEnrichRescoreCliToken,
  type GeckoTokenWriteExistingToken,
} from "./geckoterminalTokenWriteShared.js";
import { buildScoreNotifyMessage, notifyTelegram } from "../notify/telegram.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const CONTEXT_CAPTURE_SOURCE = "geckoterminal.token_snapshot";
const METAPLEX_CONTEXT_CAPTURE_SOURCE = "metaplex.metadata_uri";
const METAPLEX_METADATA_PROGRAM_ID = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
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
  scoreTotal: number | null;
  scoreRank: string;
  hardRejected: boolean;
  entrySnapshot: unknown;
  createdAt: string;
  importedAt: string;
  enrichedAt: string | null;
  rescoredAt: string | null;
  reviewFlagsJson: unknown;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
};

type SnapshotMetadata = {
  address: string;
  name: string | null;
  symbol: string | null;
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

type MetaplexCollectedContext = {
  source: string;
  capturedAt: string;
  metadataPda: string;
  uri: string | null;
  metadataText: {
    description: string | null;
  };
  links: {
    website: string | null;
    x: string | null;
    telegram: string | null;
    anyLinks: boolean;
    websites: string[];
    xCandidates: string[];
    telegramCandidates: string[];
    otherLinks: string[];
  };
  availableFields: string[];
  missingFields: string[];
};

type ReviewFlagsJson = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
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
  contextAvailable: boolean;
  contextWouldWrite: boolean;
  savedContextFields: string[];
  metaplexAttempted: boolean;
  metaplexAvailable: boolean;
  metaplexWouldWrite: boolean;
  metaplexSavedFields: string[];
  metaplexErrorKind: string | null;
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
    contextUpdated: boolean;
    metaplexContextUpdated: boolean;
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
    contextAvailableCount: number;
    contextWriteCount: number;
    metaplexAttemptedCount: number;
    metaplexAvailableCount: number;
    metaplexWriteCount: number;
    metaplexSavedCount: number;
    metaplexErrorKindCounts: Record<string, number>;
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

function buildCountMap(values: Array<string | null>): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const value of values) {
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }

    counts[value] = (counts[value] ?? 0) + 1;
  }

  return counts;
}

function serializeCountMapForLog(counts: Record<string, number>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))),
  );
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

class HelperShadowParityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HelperShadowParityError";
  }
}

class MetaplexNotFoundError extends Error {
  reason: string;
  detail: JsonObject | null;

  constructor(message: string, reason: string, detail: JsonObject | null = null) {
    super(message);
    this.name = "MetaplexNotFoundError";
    this.reason = reason;
    this.detail = detail;
  }
}

class MetaplexFetchError extends Error {
  kind: string;
  rateLimited: boolean;
  detail: JsonObject | null;

  constructor(
    message: string,
    kind: string,
    rateLimited = false,
    detail: JsonObject | null = null,
  ) {
    super(message);
    this.name = "MetaplexFetchError";
    this.kind = kind;
    this.rateLimited = rateLimited;
    this.detail = detail;
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
    "- when useful website/X/Telegram-style context exists in the same snapshot, --write also saves it into Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot without changing score or notify rules",
    "- after the Gecko primary snapshot succeeds, a best-effort Metaplex metadata-uri lookup may also preview or save secondary description / website / X / Telegram context into Token.entrySnapshot.contextCapture.metaplexMetadataUri when available",
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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickNestedRecord(input: JsonObject, key: string): JsonObject | null {
  const value = input[key];
  return isRecord(value) ? value : null;
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

function mod(value: bigint, modulus: bigint): bigint {
  const out = value % modulus;
  return out >= 0n ? out : out + modulus;
}

const ED25519_P = (1n << 255n) - 19n;
const ED25519_D =
  37095705934669439343138083508754565189542113879843219016388785533085940283555n;
const ED25519_SQRT_M1 =
  19681161376707505956807079304988542015446066515923890162744021073123829784752n;
const PDA_MARKER = Buffer.from("ProgramDerivedAddress");
const METADATA_SEED = Buffer.from("metadata");

function bigIntPowMod(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let currentBase = mod(base, modulus);
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if ((currentExponent & 1n) === 1n) {
      result = mod(result * currentBase, modulus);
    }
    currentBase = mod(currentBase * currentBase, modulus);
    currentExponent >>= 1n;
  }

  return result;
}

function readLittleEndianBigInt(bytes: Uint8Array): bigint {
  let out = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    out = (out << 8n) | BigInt(bytes[index] ?? 0);
  }
  return out;
}

function decodeBase58(value: string): Uint8Array {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let current = 0n;

  for (const character of value) {
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error(`Invalid base58 character: ${character}`);
    }
    current = current * 58n + BigInt(index);
  }

  const out: number[] = [];
  while (current > 0n) {
    out.push(Number(current & 0xffn));
    current >>= 8n;
  }

  for (const character of value) {
    if (character !== "1") break;
    out.push(0);
  }

  out.reverse();
  return Uint8Array.from(out);
}

function encodeBase58(bytes: Uint8Array): string {
  const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let current = 0n;

  for (const byte of bytes) {
    current = (current << 8n) | BigInt(byte);
  }

  let out = "";
  while (current > 0n) {
    const remainder = Number(current % 58n);
    out = `${alphabet[remainder]}${out}`;
    current /= 58n;
  }

  for (const byte of bytes) {
    if (byte !== 0) break;
    out = `1${out}`;
  }

  return out.length > 0 ? out : "1";
}

function isEd25519PointOnCurve(bytes: Uint8Array): boolean {
  if (bytes.length !== 32) {
    return false;
  }

  const copy = Uint8Array.from(bytes);
  const sign = (copy[31] ?? 0) >> 7;
  copy[31] = (copy[31] ?? 0) & 0x7f;

  const y = readLittleEndianBigInt(copy);
  if (y >= ED25519_P) {
    return false;
  }

  const ySquared = mod(y * y, ED25519_P);
  const u = mod(ySquared - 1n, ED25519_P);
  const v = mod(ED25519_D * ySquared + 1n, ED25519_P);

  if (v === 0n) {
    return false;
  }

  let x = bigIntPowMod(
    mod(u * bigIntPowMod(v, ED25519_P - 2n, ED25519_P), ED25519_P),
    (ED25519_P + 3n) / 8n,
    ED25519_P,
  );
  let check = mod(x * x * v, ED25519_P);
  if (check !== u) {
    x = mod(x * ED25519_SQRT_M1, ED25519_P);
    check = mod(x * x * v, ED25519_P);
    if (check !== u) {
      return false;
    }
  }

  if (x === 0n && sign === 1) {
    return false;
  }

  return true;
}

function deriveMetaplexMetadataPda(mint: string): string {
  const programId = Buffer.from(decodeBase58(METAPLEX_METADATA_PROGRAM_ID));
  const mintBytes = Buffer.from(decodeBase58(mint));
  const seeds = [METADATA_SEED, programId, mintBytes];

  for (let bump = 255; bump >= 0; bump -= 1) {
    const hash = createHash("sha256")
      .update(Buffer.concat([...seeds, Buffer.from([bump]), programId, PDA_MARKER]))
      .digest();

    if (!isEd25519PointOnCurve(hash)) {
      return encodeBase58(hash);
    }
  }

  throw new Error(`Failed to derive metadata PDA for mint: ${mint}`);
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
  const input = ensureObject(raw, "raw");
  const data = ensureObject(input.data, "raw.data");
  const attributes = ensureObject(data.attributes, "raw.data.attributes");
  const description =
    readOptionalString(attributes, "description") ?? readOptionalString(attributes, "bio");
  const links = extractLinkCandidates(attributes);
  const availableFields: string[] = [];
  const name = readOptionalString(attributes, "name");
  const symbol = readOptionalString(attributes, "symbol");

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

type MetaplexOnchainMetadata = {
  mint: string;
  name: string | null;
  symbol: string | null;
  uri: string | null;
};

type MetaplexLookupResult = {
  onchain: MetaplexOnchainMetadata;
  offchain: JsonObject | null;
  detail: {
    metadataPda: string;
    uri: string | null;
    hasOffchain: boolean;
  };
};

function parseBorshString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
  if (offset + 4 > buffer.length) {
    throw new Error("Invalid Metaplex metadata buffer: truncated string length");
  }

  const byteLength = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + byteLength;
  if (end > buffer.length) {
    throw new Error("Invalid Metaplex metadata buffer: truncated string data");
  }

  return {
    value: buffer.subarray(start, end).toString("utf-8"),
    nextOffset: end,
  };
}

function trimMetaplexString(value: string): string | null {
  const trimmed = value.replace(/\0/g, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseMetaplexOnchainBuffer(raw: Buffer, mint: string): MetaplexOnchainMetadata {
  if (raw.length < 65) {
    throw new Error("Invalid Metaplex metadata buffer: too short");
  }

  let offset = 1 + 32 + 32;
  const nameField = parseBorshString(raw, offset);
  offset = nameField.nextOffset;
  const symbolField = parseBorshString(raw, offset);
  offset = symbolField.nextOffset;
  const uriField = parseBorshString(raw, offset);

  return {
    mint,
    name: trimMetaplexString(nameField.value),
    symbol: trimMetaplexString(symbolField.value),
    uri: trimMetaplexString(uriField.value),
  };
}

function parseMetaplexFixture(mint: string, raw: unknown): MetaplexLookupResult {
  const fixture = ensureObject(raw, "metaplex.fixture");
  const status = readOptionalString(fixture, "status");
  if (status === "not_found") {
    throw new MetaplexNotFoundError(
      readOptionalString(fixture, "message") ?? `No Metaplex metadata account found for mint: ${mint}`,
      readOptionalString(fixture, "reason") ?? "metadata_account_missing",
      pickNestedRecord(fixture, "detail"),
    );
  }
  if (status === "error") {
    throw new MetaplexFetchError(
      readOptionalString(fixture, "message") ?? `Metaplex fixture error for mint: ${mint}`,
      readOptionalString(fixture, "kind") ?? "fixture_error",
      fixture.rateLimited === true,
      pickNestedRecord(fixture, "detail"),
    );
  }

  const onchain = pickNestedRecord(fixture, "onchain");
  if (!onchain) {
    throw new MetaplexFetchError(
      "Metaplex fixture missing onchain object",
      "fixture_invalid",
      false,
      null,
    );
  }
  const offchain = pickNestedRecord(fixture, "offchain");
  const fixtureMint = readOptionalString(onchain, "mint") ?? mint;

  return {
    onchain: {
      mint: fixtureMint,
      name: readOptionalString(onchain, "name"),
      symbol: readOptionalString(onchain, "symbol"),
      uri: readOptionalString(onchain, "uri"),
    },
    offchain,
    detail: {
      metadataPda:
        readOptionalString(onchain, "metadataPda") ??
        (fixtureMint === mint ? `fixture:${mint}` : `fixture:${mint}->${fixtureMint}`),
      uri: readOptionalString(onchain, "uri"),
      hasOffchain: offchain !== null,
    },
  };
}

function extractMetaplexLinks(metadata: JsonObject): {
  websites: string[];
  xCandidates: string[];
  telegramCandidates: string[];
  otherLinks: string[];
} {
  const properties = pickNestedRecord(metadata, "properties");
  const extensions = pickNestedRecord(metadata, "extensions");
  const socials = pickNestedRecord(metadata, "socials");

  const websites = dedupeStrings(
    [
      ...collectStringCandidates(metadata.external_url),
      ...collectStringCandidates(metadata.website),
      ...collectStringCandidates(metadata.website_url),
      ...collectStringCandidates(metadata.websites),
      ...collectStringCandidates(properties?.website),
      ...collectStringCandidates(properties?.website_url),
      ...collectStringCandidates(extensions?.website),
      ...collectStringCandidates(extensions?.website_url),
      ...collectStringCandidates(socials?.website),
      ...collectStringCandidates(socials?.websites),
    ].map((value) => normalizeWebsiteCandidate(value)),
  );
  const xCandidates = dedupeStrings(
    [
      ...collectStringCandidates(metadata.twitter),
      ...collectStringCandidates(metadata.twitter_url),
      ...collectStringCandidates(metadata.twitter_username),
      ...collectStringCandidates(metadata.twitter_handle),
      ...collectStringCandidates(metadata.x),
      ...collectStringCandidates(metadata.x_url),
      ...collectStringCandidates(metadata.x_username),
      ...collectStringCandidates(metadata.x_handle),
      ...collectStringCandidates(extensions?.twitter),
      ...collectStringCandidates(extensions?.twitter_url),
      ...collectStringCandidates(extensions?.twitterUsername),
      ...collectStringCandidates(extensions?.twitter_username),
      ...collectStringCandidates(extensions?.x),
      ...collectStringCandidates(socials?.twitter),
      ...collectStringCandidates(socials?.x),
    ].map((value) => normalizeXCandidate(value)),
  );
  const telegramCandidates = dedupeStrings(
    [
      ...collectStringCandidates(metadata.telegram),
      ...collectStringCandidates(metadata.telegram_url),
      ...collectStringCandidates(metadata.telegram_handle),
      ...collectStringCandidates(extensions?.telegram),
      ...collectStringCandidates(extensions?.telegram_url),
      ...collectStringCandidates(extensions?.telegram_handle),
      ...collectStringCandidates(socials?.telegram),
    ].map((value) => normalizeTelegramCandidate(value)),
  );
  const otherLinks = dedupeStrings(
    [
      ...collectStringCandidates(metadata.discord),
      ...collectStringCandidates(metadata.discord_url),
      ...collectStringCandidates(extensions?.discord),
      ...collectStringCandidates(extensions?.discord_url),
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

function parseMetaplexCollectedContext(raw: MetaplexLookupResult): MetaplexCollectedContext {
  const description =
    (raw.offchain ? readOptionalString(raw.offchain, "description") : null) ??
    (raw.offchain ? readOptionalString(raw.offchain, "bio") : null);
  const links = raw.offchain
    ? extractMetaplexLinks(raw.offchain)
    : {
        websites: [],
        xCandidates: [],
        telegramCandidates: [],
        otherLinks: [],
      };
  const availableFields: string[] = [];

  if (description !== null) availableFields.push("metadata.description");
  if (links.websites.length > 0) availableFields.push("links.website");
  if (links.xCandidates.length > 0) availableFields.push("links.x");
  if (links.telegramCandidates.length > 0) availableFields.push("links.telegram");
  if (links.otherLinks.length > 0) availableFields.push("links.other");

  const availableFieldSet = new Set(availableFields);
  const anyLinks =
    links.websites.length > 0 ||
    links.xCandidates.length > 0 ||
    links.telegramCandidates.length > 0 ||
    links.otherLinks.length > 0;

  return {
    source: METAPLEX_CONTEXT_CAPTURE_SOURCE,
    capturedAt: new Date().toISOString(),
    metadataPda: raw.detail.metadataPda,
    uri: raw.detail.uri,
    metadataText: {
      description,
    },
    links: {
      website: links.websites[0] ?? null,
      x: links.xCandidates[0] ?? null,
      telegram: links.telegramCandidates[0] ?? null,
      anyLinks,
      websites: links.websites,
      xCandidates: links.xCandidates,
      telegramCandidates: links.telegramCandidates,
      otherLinks: links.otherLinks,
    },
    availableFields,
    missingFields: [
      "metadata.description",
      "links.website",
      "links.x",
      "links.telegram",
      "links.other",
    ].filter((field) => !availableFieldSet.has(field)),
  };
}

function sanitizeMetaplexContextForCompare(
  context: MetaplexCollectedContext,
): Omit<MetaplexCollectedContext, "capturedAt"> {
  const { capturedAt: _capturedAt, ...rest } = context;
  return rest;
}

function getSolanaRpcUrl(): string {
  return process.env.LOWCAP_SOLANA_RPC_URL?.trim() || DEFAULT_SOLANA_RPC_URL;
}

async function fetchMetaplexLookupResult(mint: string): Promise<MetaplexLookupResult> {
  const fixturePath = process.env.METAPLEX_METADATA_URI_FILE;
  if (fixturePath) {
    const content = await readFile(fixturePath, "utf-8");
    return parseMetaplexFixture(mint, JSON.parse(content) as unknown);
  }

  let metadataPda: string;
  try {
    metadataPda = deriveMetaplexMetadataPda(mint);
  } catch (error) {
    throw new MetaplexFetchError(
      error instanceof Error ? error.message : String(error),
      "invalid_mint",
      false,
      { mint },
    );
  }
  const response = await fetch(getSolanaRpcUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "lowcap-bot-gecko-fast-follow-metaplex",
      method: "getAccountInfo",
      params: [
        metadataPda,
        {
          encoding: "base64",
          commitment: "confirmed",
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new MetaplexFetchError(
      `metaplex.metadata_uri request failed: ${response.status} ${response.statusText}`,
      "rpc_http_error",
      response.status === 429,
      { metadataPda },
    );
  }

  const body = (await response.json()) as unknown;
  if (!isRecord(body)) {
    throw new MetaplexFetchError(
      "Metaplex RPC response was not an object",
      "rpc_invalid_response",
      false,
      { metadataPda },
    );
  }
  if (isRecord(body.error)) {
    throw new MetaplexFetchError(
      typeof body.error.message === "string"
        ? body.error.message
        : "Metaplex RPC returned an error object",
      "rpc_error_object",
      false,
      { metadataPda },
    );
  }

  const result = pickNestedRecord(body, "result");
  const value = result ? pickNestedRecord(result, "value") : null;
  if (!value) {
    throw new MetaplexNotFoundError(
      `No Metaplex metadata account found for mint: ${mint}`,
      "metadata_account_missing",
      { metadataPda },
    );
  }

  const rawData = Array.isArray(value.data) ? value.data : null;
  const encoded = rawData && typeof rawData[0] === "string" ? rawData[0] : null;
  if (!encoded) {
    throw new MetaplexFetchError(
      "Metaplex RPC response did not include base64 account data",
      "rpc_missing_account_data",
      false,
      { metadataPda },
    );
  }

  let onchain: MetaplexOnchainMetadata;
  try {
    onchain = parseMetaplexOnchainBuffer(Buffer.from(encoded, "base64"), mint);
  } catch (error) {
    throw new MetaplexFetchError(
      error instanceof Error ? error.message : String(error),
      "onchain_decode_failed",
      false,
      { metadataPda },
    );
  }

  if (!onchain.uri) {
    return {
      onchain,
      offchain: null,
      detail: {
        metadataPda,
        uri: null,
        hasOffchain: false,
      },
    };
  }

  const offchainResponse = await fetch(onchain.uri, {
    headers: {
      accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!offchainResponse.ok) {
    throw new MetaplexFetchError(
      `metaplex.metadata_uri offchain request failed: ${offchainResponse.status} ${offchainResponse.statusText}`,
      "offchain_http_error",
      offchainResponse.status === 429,
      {
        metadataPda,
        uri: onchain.uri,
      },
    );
  }

  let offchainRaw: unknown;
  try {
    offchainRaw = (await offchainResponse.json()) as unknown;
  } catch (error) {
    throw new MetaplexFetchError(
      error instanceof Error ? error.message : String(error),
      "offchain_invalid_json",
      false,
      {
        metadataPda,
        uri: onchain.uri,
      },
    );
  }
  if (!isRecord(offchainRaw)) {
    throw new MetaplexFetchError(
      "Metaplex offchain metadata was not an object",
      "offchain_non_object",
      false,
      {
        metadataPda,
        uri: onchain.uri,
      },
    );
  }

  return {
    onchain,
    offchain: offchainRaw,
    detail: {
      metadataPda,
      uri: onchain.uri,
      hasOffchain: true,
    },
  };
}

function hasUsefulCollectedContext(context: CollectedContext | null): boolean {
  return context !== null && context.availableFields.length > 0;
}

function hasUsefulMetaplexCollectedContext(context: MetaplexCollectedContext | null): boolean {
  return context !== null && context.availableFields.length > 0;
}

function collectReviewFlagLinks(
  geckoContext: CollectedContext | null,
  metaplexContext: MetaplexCollectedContext | null,
): string[] {
  return dedupeStrings([
    geckoContext?.links.website,
    geckoContext?.links.x,
    geckoContext?.links.telegram,
    ...(geckoContext?.links.websites ?? []),
    ...(geckoContext?.links.xCandidates ?? []),
    ...(geckoContext?.links.telegramCandidates ?? []),
    ...(geckoContext?.links.otherLinks ?? []),
    metaplexContext?.links.website,
    metaplexContext?.links.x,
    metaplexContext?.links.telegram,
    ...(metaplexContext?.links.websites ?? []),
    ...(metaplexContext?.links.xCandidates ?? []),
    ...(metaplexContext?.links.telegramCandidates ?? []),
    ...(metaplexContext?.links.otherLinks ?? []),
  ]);
}

function buildReviewFlagsJson(
  geckoContext: CollectedContext | null,
  metaplexContext: MetaplexCollectedContext | null,
): ReviewFlagsJson {
  const links = collectReviewFlagLinks(geckoContext, metaplexContext);

  return {
    hasWebsite:
      typeof geckoContext?.links.website === "string" || typeof metaplexContext?.links.website === "string",
    hasX: typeof geckoContext?.links.x === "string" || typeof metaplexContext?.links.x === "string",
    hasTelegram:
      typeof geckoContext?.links.telegram === "string" ||
      typeof metaplexContext?.links.telegram === "string",
    metaplexHit: metaplexContext !== null,
    descriptionPresent:
      typeof geckoContext?.metadataText.description === "string" ||
      typeof metaplexContext?.metadataText.description === "string",
    linkCount: links.length,
  };
}

function extractSavedReviewFlags(reviewFlagsJson: unknown): ReviewFlagsJson | null {
  if (!isRecord(reviewFlagsJson)) {
    return null;
  }

  const hasWebsite = reviewFlagsJson.hasWebsite;
  const hasX = reviewFlagsJson.hasX;
  const hasTelegram = reviewFlagsJson.hasTelegram;
  const metaplexHit = reviewFlagsJson.metaplexHit;
  const descriptionPresent = reviewFlagsJson.descriptionPresent;
  const linkCount = reviewFlagsJson.linkCount;

  if (
    typeof hasWebsite !== "boolean" ||
    typeof hasX !== "boolean" ||
    typeof hasTelegram !== "boolean" ||
    typeof metaplexHit !== "boolean" ||
    typeof descriptionPresent !== "boolean" ||
    typeof linkCount !== "number"
  ) {
    return null;
  }

  return {
    hasWebsite,
    hasX,
    hasTelegram,
    metaplexHit,
    descriptionPresent,
    linkCount,
  };
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

function extractSavedMetaplexCollectedContext(entrySnapshot: unknown): MetaplexCollectedContext | null {
  if (!isRecord(entrySnapshot)) {
    return null;
  }
  const contextCapture = entrySnapshot.contextCapture;
  if (!isRecord(contextCapture)) {
    return null;
  }
  const metaplexMetadataUri = contextCapture.metaplexMetadataUri;
  if (!isRecord(metaplexMetadataUri)) {
    return null;
  }

  const metadataText = pickNestedRecord(metaplexMetadataUri, "metadataText");
  const links = pickNestedRecord(metaplexMetadataUri, "links");
  const availableFields = Array.isArray(metaplexMetadataUri.availableFields)
    ? metaplexMetadataUri.availableFields.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const missingFields = Array.isArray(metaplexMetadataUri.missingFields)
    ? metaplexMetadataUri.missingFields.filter(
        (value): value is string => typeof value === "string",
      )
    : [];

  return {
    source:
      typeof metaplexMetadataUri.source === "string"
        ? metaplexMetadataUri.source
        : METAPLEX_CONTEXT_CAPTURE_SOURCE,
    capturedAt:
      typeof metaplexMetadataUri.capturedAt === "string"
        ? metaplexMetadataUri.capturedAt
        : new Date(0).toISOString(),
    metadataPda:
      typeof metaplexMetadataUri.metadataPda === "string" ? metaplexMetadataUri.metadataPda : "",
    uri: typeof metaplexMetadataUri.uri === "string" ? metaplexMetadataUri.uri : null,
    metadataText: {
      description: metadataText ? readOptionalString(metadataText, "description") : null,
    },
    links: {
      website: links ? readOptionalString(links, "website") : null,
      x: links ? readOptionalString(links, "x") : null,
      telegram: links ? readOptionalString(links, "telegram") : null,
      anyLinks: links?.anyLinks === true,
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

function mergeEntrySnapshotWithContextCapture(
  entrySnapshot: unknown,
  updates: {
    geckoterminalTokenSnapshot?: CollectedContext;
    metaplexMetadataUri?: MetaplexCollectedContext;
  },
): JsonObject {
  const baseEntrySnapshot =
    entrySnapshot && typeof entrySnapshot === "object" && !Array.isArray(entrySnapshot)
      ? { ...(entrySnapshot as JsonObject) }
      : {};
  const existingContextCapture = pickNestedRecord(baseEntrySnapshot, "contextCapture") ?? {};

  return {
    ...baseEntrySnapshot,
    contextCapture: {
      ...existingContextCapture,
      ...(updates.geckoterminalTokenSnapshot
        ? { geckoterminalTokenSnapshot: updates.geckoterminalTokenSnapshot }
        : {}),
      ...(updates.metaplexMetadataUri ? { metaplexMetadataUri: updates.metaplexMetadataUri } : {}),
    },
  };
}

async function saveCollectedContexts(
  tokenId: number,
  entrySnapshot: unknown,
  updates: {
    geckoterminalTokenSnapshot?: CollectedContext;
    metaplexMetadataUri?: MetaplexCollectedContext;
    reviewFlagsJson?: ReviewFlagsJson;
  },
): Promise<void> {
  await db.token.update({
    where: { id: tokenId },
    data: {
      entrySnapshot: mergeEntrySnapshotWithContextCapture(entrySnapshot, updates) as Prisma.InputJsonValue,
      ...(updates.reviewFlagsJson
        ? { reviewFlagsJson: updates.reviewFlagsJson as Prisma.InputJsonValue }
        : {}),
    },
  });
}

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  name: string | null;
  symbol: string | null;
  description: string | null;
  groupKey: string | null;
  scoreTotal: number | null;
  scoreRank: string;
  hardRejected: boolean;
  metadataStatus: string;
  createdAt: Date;
  importedAt: Date;
  enrichedAt: Date | null;
  rescoredAt: Date | null;
  entrySnapshot: unknown;
  reviewFlagsJson: unknown;
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
    scoreTotal: token.scoreTotal,
    scoreRank: token.scoreRank,
    hardRejected: token.hardRejected,
    entrySnapshot: token.entrySnapshot,
    reviewFlagsJson: token.reviewFlagsJson,
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
        scoreTotal: true,
        scoreRank: true,
        hardRejected: true,
        metadataStatus: true,
        createdAt: true,
        importedAt: true,
        enrichedAt: true,
        rescoredAt: true,
        entrySnapshot: true,
        reviewFlagsJson: true,
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
      scoreTotal: true,
      scoreRank: true,
      hardRejected: true,
      metadataStatus: true,
      createdAt: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
      entrySnapshot: true,
      reviewFlagsJson: true,
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

type ShadowFetchReplay =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      error: unknown;
    };

function isHelperShadowEnabled(): boolean {
  return process.env.LOWCAP_GECKO_TOKEN_WRITE_HELPER_SHADOW === "1";
}

function replayShadowFetch(replay: ShadowFetchReplay | null, context: string): unknown {
  if (!replay) {
    throw new Error(`${context} shadow replay was not captured`);
  }

  if (!replay.ok) {
    throw replay.error;
  }

  return replay.value;
}

function buildHelperExistingToken(token: SelectedToken): GeckoTokenWriteExistingToken {
  return {
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    description: token.description,
    source: token.currentSource,
    metadataStatus: token.metadataStatus,
    importedAt: token.importedAt,
    enrichedAt: token.enrichedAt,
    scoreRank: token.scoreRank,
    scoreTotal: token.scoreTotal,
    hardRejected: token.hardRejected,
    entrySnapshot: token.entrySnapshot,
    reviewFlagsJson: token.reviewFlagsJson,
  };
}

function describeShadowValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }

  return JSON.stringify(value);
}

function assertShadowFieldEqual(
  mismatches: string[],
  path: string,
  actual: unknown,
  expected: unknown,
): void {
  if (!Object.is(actual, expected)) {
    mismatches.push(
      `${path}: adapter=${describeShadowValue(actual)} existing=${describeShadowValue(expected)}`,
    );
  }
}

async function buildDryRunHelperAdapterItem(input: {
  args: Args;
  token: SelectedToken;
  baseToken: GeckoTokenEnrichRescoreCliToken;
  selectedReason: ProcessedItem["selectedReason"];
  geckoSnapshotReplay: ShadowFetchReplay | null;
  metaplexReplay: ShadowFetchReplay | null;
}): Promise<GeckoTokenEnrichRescoreCliItem | null> {
  if (input.args.write) {
    return null;
  }

  const helperResult = await runGeckoTokenWriteForMint(
    {
      mint: input.token.mint,
      write: false,
      notify: false,
      existingToken: buildHelperExistingToken(input.token),
    },
    {
      fetchTokenSnapshot: async () =>
        replayShadowFetch(input.geckoSnapshotReplay, "geckoterminal token snapshot"),
      fetchMetaplexContext: async () =>
        replayShadowFetch(input.metaplexReplay, "metaplex metadata uri"),
    },
  );
  return toGeckoTokenEnrichRescoreCliItem({
    result: helperResult,
    token: input.baseToken,
    selectedReason: input.selectedReason,
    writeEnabled: false,
  });
}

function normalizeAdapterFetchedSnapshot(
  adapterItem: GeckoTokenEnrichRescoreCliItem | null,
): SnapshotMetadata | undefined {
  const snapshot = adapterItem?.fetchedSnapshot;
  if (!snapshot) {
    return undefined;
  }

  const address = snapshot.address;
  if (typeof address !== "string" || address.trim().length === 0) {
    throw new Error("helper adapter fetchedSnapshot.address must be a non-empty string");
  }

  return {
    address,
    name: typeof snapshot.name === "string" ? snapshot.name : null,
    symbol: typeof snapshot.symbol === "string" ? snapshot.symbol : null,
  };
}

function applyDryRunAdapterFetchedSnapshot(input: {
  args: Args;
  item: ProcessedItem;
  adapterItem: GeckoTokenEnrichRescoreCliItem | null;
}): void {
  if (input.args.write) {
    return;
  }

  const fetchedSnapshot = normalizeAdapterFetchedSnapshot(input.adapterItem);
  if (fetchedSnapshot) {
    input.item.fetchedSnapshot = fetchedSnapshot;
  } else {
    delete input.item.fetchedSnapshot;
  }
}

function applyDryRunAdapterContextFields(input: {
  args: Args;
  item: ProcessedItem;
  adapterItem: GeckoTokenEnrichRescoreCliItem | null;
}): void {
  if (input.args.write || !input.adapterItem) {
    return;
  }

  input.item.contextAvailable = input.adapterItem.contextAvailable;
  input.item.contextWouldWrite = input.adapterItem.contextWouldWrite;
  input.item.savedContextFields = input.adapterItem.savedContextFields;
}

function applyDryRunAdapterMetaplexFields(input: {
  args: Args;
  item: ProcessedItem;
  adapterItem: GeckoTokenEnrichRescoreCliItem | null;
}): void {
  if (input.args.write || !input.adapterItem) {
    return;
  }

  input.item.metaplexAttempted = input.adapterItem.metaplexAttempted;
  input.item.metaplexAvailable = input.adapterItem.metaplexAvailable;
  input.item.metaplexWouldWrite = input.adapterItem.metaplexWouldWrite;
  input.item.metaplexErrorKind = input.adapterItem.metaplexErrorKind;
}

function assertDryRunHelperShadowParity(input: {
  args: Args;
  item: ProcessedItem;
  adapterItem: GeckoTokenEnrichRescoreCliItem | null;
}): void {
  if (input.args.write || !isHelperShadowEnabled()) {
    return;
  }

  if (!input.adapterItem) {
    throw new HelperShadowParityError("helper shadow adapter item was not generated");
  }

  const adapterItem = input.adapterItem;
  const mismatches: string[] = [];

  assertShadowFieldEqual(mismatches, "status", adapterItem.status, input.item.status);
  assertShadowFieldEqual(
    mismatches,
    "selectedReason",
    adapterItem.selectedReason,
    input.item.selectedReason,
  );
  assertShadowFieldEqual(
    mismatches,
    "fetchedSnapshot.name",
    adapterItem.fetchedSnapshot?.name,
    input.item.fetchedSnapshot?.name,
  );
  assertShadowFieldEqual(
    mismatches,
    "fetchedSnapshot.symbol",
    adapterItem.fetchedSnapshot?.symbol,
    input.item.fetchedSnapshot?.symbol,
  );
  assertShadowFieldEqual(
    mismatches,
    "contextAvailable",
    adapterItem.contextAvailable,
    input.item.contextAvailable,
  );
  assertShadowFieldEqual(
    mismatches,
    "contextWouldWrite",
    adapterItem.contextWouldWrite,
    input.item.contextWouldWrite,
  );
  assertShadowFieldEqual(
    mismatches,
    "metaplexAttempted",
    adapterItem.metaplexAttempted,
    input.item.metaplexAttempted,
  );
  assertShadowFieldEqual(
    mismatches,
    "metaplexAvailable",
    adapterItem.metaplexAvailable,
    input.item.metaplexAvailable,
  );
  assertShadowFieldEqual(
    mismatches,
    "metaplexWouldWrite",
    adapterItem.metaplexWouldWrite,
    input.item.metaplexWouldWrite,
  );
  assertShadowFieldEqual(
    mismatches,
    "metaplexErrorKind",
    adapterItem.metaplexErrorKind,
    input.item.metaplexErrorKind,
  );
  assertShadowFieldEqual(
    mismatches,
    "enrichPlan.hasPatch",
    adapterItem.enrichPlan?.hasPatch,
    input.item.enrichPlan?.hasPatch,
  );
  assertShadowFieldEqual(
    mismatches,
    "enrichPlan.willUpdate",
    adapterItem.enrichPlan?.willUpdate,
    input.item.enrichPlan?.willUpdate,
  );
  assertShadowFieldEqual(
    mismatches,
    "rescorePreview.ready",
    adapterItem.rescorePreview?.ready,
    input.item.rescorePreview?.ready,
  );
  assertShadowFieldEqual(
    mismatches,
    "rescorePreview.scoreRank",
    adapterItem.rescorePreview?.scoreRank,
    input.item.rescorePreview?.scoreRank,
  );
  assertShadowFieldEqual(
    mismatches,
    "rescorePreview.scoreTotal",
    adapterItem.rescorePreview?.scoreTotal,
    input.item.rescorePreview?.scoreTotal,
  );
  assertShadowFieldEqual(
    mismatches,
    "rescorePreview.hardRejected",
    adapterItem.rescorePreview?.hardRejected,
    input.item.rescorePreview?.hardRejected,
  );
  assertShadowFieldEqual(
    mismatches,
    "notifyEligibleBefore",
    adapterItem.notifyEligibleBefore,
    input.item.notifyEligibleBefore,
  );
  assertShadowFieldEqual(
    mismatches,
    "notifyEligibleAfter",
    adapterItem.notifyEligibleAfter,
    input.item.notifyEligibleAfter,
  );
  assertShadowFieldEqual(
    mismatches,
    "notifyWouldSend",
    adapterItem.notifyWouldSend,
    input.item.notifyWouldSend,
  );
  assertShadowFieldEqual(
    mismatches,
    "notifySent",
    adapterItem.notifySent,
    input.item.notifySent,
  );
  assertShadowFieldEqual(
    mismatches,
    "writeSummary.dryRun",
    adapterItem.writeSummary.dryRun,
    input.item.writeSummary.dryRun,
  );
  assertShadowFieldEqual(
    mismatches,
    "writeSummary.enrichUpdated",
    adapterItem.writeSummary.enrichUpdated,
    input.item.writeSummary.enrichUpdated,
  );
  assertShadowFieldEqual(
    mismatches,
    "writeSummary.rescoreUpdated",
    adapterItem.writeSummary.rescoreUpdated,
    input.item.writeSummary.rescoreUpdated,
  );
  assertShadowFieldEqual(
    mismatches,
    "writeSummary.contextUpdated",
    adapterItem.writeSummary.contextUpdated,
    input.item.writeSummary.contextUpdated,
  );
  assertShadowFieldEqual(
    mismatches,
    "writeSummary.metaplexContextUpdated",
    adapterItem.writeSummary.metaplexContextUpdated,
    input.item.writeSummary.metaplexContextUpdated,
  );

  if (mismatches.length > 0) {
    throw new HelperShadowParityError(
      `helper shadow parity mismatch for ${input.item.token.mint}: ${mismatches.join("; ")}`,
    );
  }
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
  let contextUpdated = false;
  let metaplexContextUpdated = false;
  const savedContext = extractSavedCollectedContext(token.entrySnapshot);
  const savedMetaplexContext = extractSavedMetaplexCollectedContext(token.entrySnapshot);
  const savedReviewFlags = extractSavedReviewFlags(token.reviewFlagsJson);
  const savedContextFields = savedContext?.availableFields ?? [];
  const metaplexSavedFields = savedMetaplexContext?.availableFields ?? [];
  let contextAvailable = false;
  let contextWouldWrite = false;
  let metaplexAttempted = false;
  let metaplexAvailable = false;
  let metaplexWouldWrite = false;
  let metaplexErrorKind: string | null = null;
  let geckoSnapshotReplay: ShadowFetchReplay | null = null;
  let metaplexReplay: ShadowFetchReplay | null = null;

  try {
    let raw: unknown;
    try {
      raw = await fetchTokenSnapshotRaw(token.mint);
      geckoSnapshotReplay = { ok: true, value: raw };
    } catch (error) {
      geckoSnapshotReplay = { ok: false, error };
      throw error;
    }

    snapshot = parseSnapshotMetadata(raw);
    const collectedContext = parseCollectedContext(raw);
    contextAvailable = hasUsefulCollectedContext(collectedContext);
    const sameAsSaved =
      savedContext !== null &&
      JSON.stringify(sanitizeContextForCompare(savedContext)) ===
        JSON.stringify(sanitizeContextForCompare(collectedContext));
    contextWouldWrite = contextAvailable && !sameAsSaved;
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

    let metaplexCollectedContext: MetaplexCollectedContext | null = null;
    try {
      metaplexAttempted = true;
      let metaplexLookup: MetaplexLookupResult;
      try {
        metaplexLookup = await fetchMetaplexLookupResult(token.mint);
        metaplexReplay = { ok: true, value: metaplexLookup };
      } catch (error) {
        metaplexReplay = { ok: false, error };
        throw error;
      }

      metaplexCollectedContext = parseMetaplexCollectedContext(metaplexLookup);
      metaplexAvailable = hasUsefulMetaplexCollectedContext(metaplexCollectedContext);
      const sameAsSaved =
        savedMetaplexContext !== null &&
        JSON.stringify(sanitizeMetaplexContextForCompare(savedMetaplexContext)) ===
          JSON.stringify(sanitizeMetaplexContextForCompare(metaplexCollectedContext));
      metaplexWouldWrite = metaplexAvailable && !sameAsSaved;
    } catch (error) {
      if (error instanceof MetaplexNotFoundError) {
        metaplexErrorKind = error.reason;
      } else if (error instanceof MetaplexFetchError) {
        metaplexErrorKind = error.kind;
      } else {
        metaplexErrorKind = "unknown_error";
      }
    }

    const effectiveGeckoContext = contextWouldWrite ? collectedContext : savedContext;
    const effectiveMetaplexContext =
      metaplexWouldWrite && metaplexCollectedContext ? metaplexCollectedContext : savedMetaplexContext;
    const reviewFlagsJson = buildReviewFlagsJson(effectiveGeckoContext, effectiveMetaplexContext);
    const reviewFlagsWouldWrite =
      savedReviewFlags === null ||
      JSON.stringify(savedReviewFlags) !== JSON.stringify(reviewFlagsJson);

    if (args.write) {
      if (enrichPlanResult?.hasChange) {
        await enrichTokenByMint(token.mint, patch);
        enrichUpdated = true;
      }

      const writtenRescore = await rescoreTokenByMint(token.mint);
      rescoreUpdated = true;

      if (
        contextWouldWrite ||
        (metaplexWouldWrite && metaplexCollectedContext) ||
        reviewFlagsWouldWrite
      ) {
        await saveCollectedContexts(token.id, token.entrySnapshot, {
          ...(contextWouldWrite ? { geckoterminalTokenSnapshot: collectedContext } : {}),
          ...(metaplexWouldWrite && metaplexCollectedContext
            ? { metaplexMetadataUri: metaplexCollectedContext }
            : {}),
          ...(reviewFlagsWouldWrite ? { reviewFlagsJson } : {}),
        });
        contextUpdated = contextWouldWrite;
        metaplexContextUpdated = metaplexWouldWrite && metaplexCollectedContext !== null;
      }

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

    const item: ProcessedItem = {
      token: baseToken,
      selectedReason,
      status: "ok",
      fetchedSnapshot: snapshot,
      contextAvailable,
      contextWouldWrite,
      savedContextFields,
      metaplexAttempted,
      metaplexAvailable,
      metaplexWouldWrite,
      metaplexSavedFields,
      metaplexErrorKind,
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
        contextUpdated,
        metaplexContextUpdated,
      },
    };
    const adapterItem = await buildDryRunHelperAdapterItem({
      args,
      token,
      baseToken,
      selectedReason,
      geckoSnapshotReplay,
      metaplexReplay,
    });
    applyDryRunAdapterFetchedSnapshot({ args, item, adapterItem });
    applyDryRunAdapterContextFields({ args, item, adapterItem });
    applyDryRunAdapterMetaplexFields({ args, item, adapterItem });
    assertDryRunHelperShadowParity({ args, item, adapterItem });

    return item;
  } catch (error) {
    if (error instanceof HelperShadowParityError) {
      throw error;
    }

    const item: ProcessedItem = {
      token: baseToken,
      selectedReason,
      status: "error",
      fetchedSnapshot: snapshot,
      contextAvailable,
      contextWouldWrite,
      savedContextFields,
      metaplexAttempted,
      metaplexAvailable,
      metaplexWouldWrite,
      metaplexSavedFields,
      metaplexErrorKind,
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
        contextUpdated,
        metaplexContextUpdated,
      },
      error: error instanceof Error ? error.message : String(error),
    };
    const adapterItem = await buildDryRunHelperAdapterItem({
      args,
      token,
      baseToken,
      selectedReason,
      geckoSnapshotReplay,
      metaplexReplay,
    });
    applyDryRunAdapterFetchedSnapshot({ args, item, adapterItem });
    applyDryRunAdapterContextFields({ args, item, adapterItem });
    applyDryRunAdapterMetaplexFields({ args, item, adapterItem });
    assertDryRunHelperShadowParity({ args, item, adapterItem });

    return item;
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
      `contextWritten=${output.summary.contextWriteCount}`,
      `metaplexAttemptedCount=${output.summary.metaplexAttemptedCount}`,
      `metaplexAvailableCount=${output.summary.metaplexAvailableCount}`,
      `metaplexContextWritten=${output.summary.metaplexWriteCount}`,
      `metaplexSavedCount=${output.summary.metaplexSavedCount}`,
      `metaplexErrorKindCounts=${serializeCountMapForLog(output.summary.metaplexErrorKindCounts)}`,
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
  const metaplexAttemptedCount = execution.items.filter((item) => item.metaplexAttempted).length;
  const metaplexAvailableCount = execution.items.filter((item) => item.metaplexAvailable).length;
  const metaplexSavedCount = execution.items.filter(
    (item) => item.writeSummary.metaplexContextUpdated,
  ).length;
  const metaplexErrorKindCounts = buildCountMap(
    execution.items.map((item) => item.metaplexErrorKind),
  );

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
      contextAvailableCount: execution.items.filter((item) => item.contextAvailable).length,
      contextWriteCount: execution.items.filter((item) => item.writeSummary.contextUpdated).length,
      metaplexAttemptedCount,
      metaplexAvailableCount,
      metaplexWriteCount: metaplexSavedCount,
      metaplexSavedCount,
      metaplexErrorKindCounts,
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
