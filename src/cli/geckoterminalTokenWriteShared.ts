import { buildTokenEnrichPlan } from "./tokenEnrichShared.js";
import { buildTokenRescorePreview } from "./tokenRescoreShared.js";

export type GeckoTokenWriteStatus = "ok" | "error" | "rate_limited";

export type GeckoTokenWriteRateLimitScope =
  | "geckoterminal"
  | "metaplex"
  | null;

export type GeckoTokenWriteDeps = {
  db?: unknown;
  now?: () => Date;
  fetchTokenSnapshot?: (mint: string) => Promise<unknown>;
  fetchMetaplexContext?: (mint: string) => Promise<unknown>;
  logger?: Pick<Console, "error">;
};

export type GeckoTokenWriteInput = {
  mint: string;
  write: boolean;
  notify?: false;
  captureFile?: string | null;
  existingToken?: GeckoTokenWriteExistingToken;
};

export type GeckoTokenWriteExistingToken = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  source: string | null;
  metadataStatus: string;
  importedAt: Date | string;
  enrichedAt: Date | string | null;
  scoreRank: string | null;
  scoreTotal: number | null;
  hardRejected: boolean | null;
  entrySnapshot?: unknown;
};

export type GeckoTokenWriteEnrichPlan = {
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

export type GeckoTokenWriteRescorePreview = {
  ready: boolean;
  normalizedText: string;
  scoreTotal: number;
  scoreRank: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
};

export type GeckoTokenWriteFetchedSnapshot = Record<string, unknown>;

export type GeckoTokenWriteContextPreview = {
  available: boolean;
  availableFields: string[];
  savedFields: string[];
  wouldWrite: boolean;
  patch: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
};

export type GeckoTokenWriteMetaplexPreview = {
  attempted: boolean;
  available: boolean;
  availableFields: string[];
  savedFields: string[];
  wouldWrite: boolean;
  patch: Record<string, unknown> | null;
  preview: Record<string, unknown> | null;
  errorKind: string | null;
  rateLimited: boolean;
};

export type GeckoTokenWriteSummary = {
  wouldEnrich: boolean;
  wouldRescore: boolean;
  wouldWriteContext: boolean;
  enrichWritten: boolean;
  rescoreWritten: boolean;
  contextWritten: boolean;
  metaplexContextWritten: boolean;
  notifySent: boolean;
};

export type GeckoTokenWriteResult = {
  mint: string;
  status: GeckoTokenWriteStatus;
  selectedReason: string | null;
  name: string | null;
  symbol: string | null;
  metadataStatus: string | null;
  scoreRank: string | null;
  scoreTotal: number | null;
  hardRejected: boolean | null;
  fetchedSnapshot: GeckoTokenWriteFetchedSnapshot | null;
  enrichPlan: GeckoTokenWriteEnrichPlan | null;
  rescorePreview: GeckoTokenWriteRescorePreview | null;
  contextPreview: GeckoTokenWriteContextPreview | null;
  metaplexPreview: GeckoTokenWriteMetaplexPreview | null;
  contextWouldWrite: boolean;
  metaplexContextWouldWrite: boolean;
  enrichWritten: boolean;
  rescoreWritten: boolean;
  contextWritten: boolean;
  metaplexContextWritten: boolean;
  writeSummary: GeckoTokenWriteSummary;
  notifyEligibleBefore: boolean | null;
  notifyEligibleAfter: boolean | null;
  notifyWouldSend: boolean;
  notifySent: boolean;
  rateLimited: boolean;
  rateLimitScope: GeckoTokenWriteRateLimitScope;
  metaplexErrorKind: string | null;
  error?: string;
};

export type GeckoTokenEnrichRescoreCliToken = {
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

export type GeckoTokenEnrichRescoreCliItem = {
  token: GeckoTokenEnrichRescoreCliToken;
  selectedReason: "firstSeenSourceSnapshot.detectedAt" | "Token.createdAt";
  status: "ok" | "error";
  fetchedSnapshot?: GeckoTokenWriteFetchedSnapshot;
  contextAvailable: boolean;
  contextWouldWrite: boolean;
  savedContextFields: string[];
  metaplexAttempted: boolean;
  metaplexAvailable: boolean;
  metaplexWouldWrite: boolean;
  metaplexSavedFields: string[];
  metaplexErrorKind: string | null;
  enrichPlan?: GeckoTokenWriteEnrichPlan;
  rescorePreview?: GeckoTokenWriteRescorePreview;
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

export type GeckoTokenCliItemAdapterInput = {
  result: GeckoTokenWriteResult;
  token: GeckoTokenEnrichRescoreCliToken;
  selectedReason: "firstSeenSourceSnapshot.detectedAt" | "Token.createdAt";
  writeEnabled: boolean;
};

export const GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED =
  "not_implemented";
export const GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR =
  "geckoterminal_snapshot_shape_error";

const GECKO_CONTEXT_CAPTURE_SOURCE = "geckoterminal.token_snapshot";
const GECKO_CONTEXT_FIELDS = [
  "metadata.name",
  "metadata.symbol",
  "metadata.description",
  "links.website",
  "links.x",
  "links.telegram",
  "links.other",
];

type GeckoSnapshotMetadata = {
  address: string;
  name: string | null;
  symbol: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(
  object: Record<string, unknown>,
  key: string,
): string | null {
  const value = object[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function pickNestedRecord(
  object: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = object[key];
  return isRecord(value) ? value : null;
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
    if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function parseGeckoSnapshotMetadata(raw: unknown): GeckoSnapshotMetadata {
  if (!isRecord(raw) || !isRecord(raw.data) || !isRecord(raw.data.attributes)) {
    throw new Error(GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
  }

  const attributes = raw.data.attributes;
  const address = attributes.address;
  if (typeof address !== "string" || address.trim().length === 0) {
    throw new Error(GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
  }

  return {
    address,
    name: readOptionalString(attributes, "name"),
    symbol: readOptionalString(attributes, "symbol"),
  };
}

function extractGeckoLinkCandidates(attributes: Record<string, unknown>): {
  websites: string[];
  xCandidates: string[];
  telegramCandidates: string[];
  otherLinks: string[];
} {
  const socials = pickNestedRecord(attributes, "socials");

  return {
    websites: dedupeStrings(
      [
        ...collectStringCandidates(attributes.website),
        ...collectStringCandidates(attributes.website_url),
        ...collectStringCandidates(attributes.websites),
        ...collectStringCandidates(socials?.website),
        ...collectStringCandidates(socials?.websites),
      ].map((value) => normalizeWebsiteCandidate(value)),
    ),
    xCandidates: dedupeStrings(
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
    ),
    telegramCandidates: dedupeStrings(
      [
        ...collectStringCandidates(attributes.telegram),
        ...collectStringCandidates(attributes.telegram_url),
        ...collectStringCandidates(attributes.telegram_handle),
        ...collectStringCandidates(socials?.telegram),
      ].map((value) => normalizeTelegramCandidate(value)),
    ),
    otherLinks: dedupeStrings(
      [
        ...collectStringCandidates(attributes.discord_url),
        ...collectStringCandidates(attributes.discord),
        ...collectStringCandidates(socials?.discord),
      ].map((value) => normalizeGenericLinkCandidate(value)),
    ),
  };
}

function extractSavedGeckoContext(
  entrySnapshot: unknown,
): Record<string, unknown> | null {
  if (!isRecord(entrySnapshot)) {
    return null;
  }
  const contextCapture = pickNestedRecord(entrySnapshot, "contextCapture");
  if (!contextCapture) {
    return null;
  }
  return pickNestedRecord(contextCapture, "geckoterminalTokenSnapshot");
}

function extractContextFields(context: Record<string, unknown> | null): string[] {
  if (!context || !Array.isArray(context.availableFields)) {
    return [];
  }
  return context.availableFields.filter(
    (value): value is string => typeof value === "string",
  );
}

function withoutCapturedAt(
  context: Record<string, unknown>,
): Record<string, unknown> {
  const { capturedAt: _capturedAt, ...rest } = context;
  return rest;
}

function buildGeckoTokenWriteContextPreview(params: {
  rawSnapshot: unknown;
  existingToken?: GeckoTokenWriteExistingToken;
  now: Date;
}): GeckoTokenWriteContextPreview | null {
  if (
    !isRecord(params.rawSnapshot) ||
    !isRecord(params.rawSnapshot.data) ||
    !isRecord(params.rawSnapshot.data.attributes)
  ) {
    throw new Error(GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
  }

  const attributes = params.rawSnapshot.data.attributes;
  const address = attributes.address;
  if (typeof address !== "string" || address.trim().length === 0) {
    throw new Error(GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
  }

  const description =
    readOptionalString(attributes, "description") ??
    readOptionalString(attributes, "bio");
  const links = extractGeckoLinkCandidates(attributes);
  const name = readOptionalString(attributes, "name");
  const symbol = readOptionalString(attributes, "symbol");
  const availableFields: string[] = [];

  if (name !== null) availableFields.push("metadata.name");
  if (symbol !== null) availableFields.push("metadata.symbol");
  if (description !== null) availableFields.push("metadata.description");
  if (links.websites.length > 0) availableFields.push("links.website");
  if (links.xCandidates.length > 0) availableFields.push("links.x");
  if (links.telegramCandidates.length > 0) availableFields.push("links.telegram");
  if (links.otherLinks.length > 0) availableFields.push("links.other");

  if (availableFields.length === 0) {
    return null;
  }

  const availableFieldSet = new Set(availableFields);
  const preview = {
    source: GECKO_CONTEXT_CAPTURE_SOURCE,
    capturedAt: params.now.toISOString(),
    address,
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
    missingFields: GECKO_CONTEXT_FIELDS.filter(
      (field) => !availableFieldSet.has(field),
    ),
  };
  const savedContext = extractSavedGeckoContext(
    params.existingToken?.entrySnapshot,
  );
  const savedFields = extractContextFields(savedContext);
  const sameAsSaved =
    savedContext !== null &&
    JSON.stringify(withoutCapturedAt(savedContext)) ===
      JSON.stringify(withoutCapturedAt(preview));
  const wouldWrite = !sameAsSaved;

  return {
    available: true,
    availableFields,
    savedFields,
    wouldWrite,
    patch: wouldWrite ? { geckoterminalTokenSnapshot: preview } : null,
    preview,
  };
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  return value === null ? null : toDate(value);
}

function buildCurrentEnrichPlan(
  existingToken: GeckoTokenWriteExistingToken,
): GeckoTokenWriteEnrichPlan {
  return {
    hasPatch: false,
    willUpdate: false,
    patch: {},
    preview: {
      metadataStatus: existingToken.metadataStatus,
      name: existingToken.name,
      symbol: existingToken.symbol,
      description: existingToken.description,
    },
  };
}

function buildGeckoTokenWriteEnrichPlan(params: {
  existingToken: GeckoTokenWriteExistingToken;
  snapshot: GeckoSnapshotMetadata;
  now: Date;
}): GeckoTokenWriteEnrichPlan {
  const patch = {
    ...(params.snapshot.name !== null &&
    params.snapshot.name !== params.existingToken.name
      ? { name: params.snapshot.name }
      : {}),
    ...(params.snapshot.symbol !== null &&
    params.snapshot.symbol !== params.existingToken.symbol
      ? { symbol: params.snapshot.symbol }
      : {}),
  };
  const hasPatch = Object.keys(patch).length > 0;

  if (!hasPatch) {
    return buildCurrentEnrichPlan(params.existingToken);
  }

  const plan = buildTokenEnrichPlan(
    {
      mint: params.existingToken.mint,
      name: params.existingToken.name,
      symbol: params.existingToken.symbol,
      description: params.existingToken.description,
      source: params.existingToken.source,
      metadataStatus: params.existingToken.metadataStatus,
      importedAt: toDate(params.existingToken.importedAt),
      enrichedAt: toNullableDate(params.existingToken.enrichedAt),
    },
    patch,
    params.now,
  );

  return {
    hasPatch,
    willUpdate: plan.hasChange,
    patch,
    preview: {
      metadataStatus: plan.preview.metadataStatus,
      name: plan.preview.name,
      symbol: plan.preview.symbol,
      description: plan.preview.description,
    },
  };
}

async function buildGeckoTokenWriteRescorePreview(
  input: GeckoTokenWriteInput,
  enrichPlan: GeckoTokenWriteEnrichPlan | null,
  now: Date,
): Promise<GeckoTokenWriteRescorePreview | null> {
  if (!enrichPlan) {
    return null;
  }

  const preview = await buildTokenRescorePreview(
    {
      mint: input.mint,
      name: enrichPlan.preview.name,
      symbol: enrichPlan.preview.symbol,
      description: enrichPlan.preview.description,
    },
    now,
  );

  return {
    ready: true,
    normalizedText: preview.normalizedText,
    scoreTotal: preview.scoreTotal,
    scoreRank: preview.scoreRank,
    hardRejected: preview.hardRejected,
    hardRejectReason: preview.hardRejectReason,
  };
}

function isNotifyEligibleFromScore(
  scoreRank: string | null,
  hardRejected: boolean | null,
): boolean | null {
  if (scoreRank === null || hardRejected === null) {
    return null;
  }

  return scoreRank === "S" && !hardRejected;
}

function isGeckoRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("429 Too Many Requests");
}

export function toGeckoTokenEnrichRescoreCliItem(
  input: GeckoTokenCliItemAdapterInput,
): GeckoTokenEnrichRescoreCliItem {
  const contextPreview = input.result.contextPreview;
  const metaplexPreview = input.result.metaplexPreview;

  return {
    token: input.token,
    selectedReason: input.selectedReason,
    status: input.result.status === "ok" ? "ok" : "error",
    ...(input.result.fetchedSnapshot
      ? { fetchedSnapshot: input.result.fetchedSnapshot }
      : {}),
    contextAvailable: contextPreview?.available ?? false,
    contextWouldWrite:
      contextPreview?.wouldWrite ?? input.result.contextWouldWrite,
    savedContextFields: contextPreview?.savedFields ?? [],
    metaplexAttempted: metaplexPreview?.attempted ?? false,
    metaplexAvailable: metaplexPreview?.available ?? false,
    metaplexWouldWrite:
      metaplexPreview?.wouldWrite ?? input.result.metaplexContextWouldWrite,
    metaplexSavedFields: metaplexPreview?.savedFields ?? [],
    metaplexErrorKind:
      metaplexPreview?.errorKind ?? input.result.metaplexErrorKind,
    ...(input.result.enrichPlan ? { enrichPlan: input.result.enrichPlan } : {}),
    ...(input.result.rescorePreview
      ? { rescorePreview: input.result.rescorePreview }
      : {}),
    notifyCandidate: input.result.notifyEligibleAfter === true,
    notifyEligibleBefore: input.result.notifyEligibleBefore ?? false,
    notifyEligibleAfter: input.result.notifyEligibleAfter ?? false,
    notifyWouldSend: input.result.notifyWouldSend,
    notifySent: input.result.notifySent,
    writeSummary: {
      dryRun: !input.writeEnabled,
      enrichUpdated: input.result.enrichWritten,
      rescoreUpdated: input.result.rescoreWritten,
      contextUpdated: input.result.contextWritten,
      metaplexContextUpdated: input.result.metaplexContextWritten,
    },
    ...(input.result.error ? { error: input.result.error } : {}),
  };
}

export function buildUnsupportedGeckoTokenWriteResult(
  input: GeckoTokenWriteInput,
): GeckoTokenWriteResult {
  return {
    mint: input.mint,
    status: "error",
    selectedReason: null,
    name: null,
    symbol: null,
    metadataStatus: null,
    scoreRank: null,
    scoreTotal: null,
    hardRejected: null,
    fetchedSnapshot: null,
    enrichPlan: null,
    rescorePreview: null,
    contextPreview: null,
    metaplexPreview: null,
    contextWouldWrite: false,
    metaplexContextWouldWrite: false,
    enrichWritten: false,
    rescoreWritten: false,
    contextWritten: false,
    metaplexContextWritten: false,
    writeSummary: {
      wouldEnrich: false,
      wouldRescore: false,
      wouldWriteContext: false,
      enrichWritten: false,
      rescoreWritten: false,
      contextWritten: false,
      metaplexContextWritten: false,
      notifySent: false,
    },
    notifyEligibleBefore: null,
    notifyEligibleAfter: null,
    notifyWouldSend: false,
    notifySent: false,
    rateLimited: false,
    rateLimitScope: null,
    metaplexErrorKind: null,
    error: GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  };
}

export async function runGeckoTokenWriteForMint(
  input: GeckoTokenWriteInput,
  deps: GeckoTokenWriteDeps = {},
): Promise<GeckoTokenWriteResult> {
  if (!deps.fetchTokenSnapshot) {
    return buildUnsupportedGeckoTokenWriteResult(input);
  }

  try {
    const rawSnapshot = await deps.fetchTokenSnapshot(input.mint);
    const snapshot = parseGeckoSnapshotMetadata(rawSnapshot);
    const baseResult = buildUnsupportedGeckoTokenWriteResult(input);
    const now = deps.now?.() ?? new Date();
    const contextPreview = buildGeckoTokenWriteContextPreview({
      rawSnapshot,
      existingToken: input.existingToken,
      now,
    });
    const enrichPlan = input.existingToken
      ? buildGeckoTokenWriteEnrichPlan({
          existingToken: input.existingToken,
          snapshot,
          now,
        })
      : null;
    const rescorePreview = await buildGeckoTokenWriteRescorePreview(
      input,
      enrichPlan,
      now,
    );
    const notifyEligibleBefore = input.existingToken
      ? isNotifyEligibleFromScore(
          input.existingToken.scoreRank,
          input.existingToken.hardRejected,
        )
      : null;
    const notifyEligibleAfter = rescorePreview
      ? isNotifyEligibleFromScore(
          rescorePreview.scoreRank,
          rescorePreview.hardRejected,
        )
      : null;

    return {
      ...baseResult,
      status: "ok",
      name: snapshot.name,
      symbol: snapshot.symbol,
      fetchedSnapshot: snapshot,
      metadataStatus: enrichPlan?.preview.metadataStatus ?? null,
      scoreRank: rescorePreview?.scoreRank ?? null,
      scoreTotal: rescorePreview?.scoreTotal ?? null,
      hardRejected: rescorePreview?.hardRejected ?? null,
      enrichPlan,
      rescorePreview,
      contextPreview,
      contextWouldWrite: contextPreview?.wouldWrite ?? false,
      writeSummary: {
        ...baseResult.writeSummary,
        wouldEnrich: enrichPlan?.willUpdate ?? false,
        wouldRescore: rescorePreview !== null,
        wouldWriteContext: contextPreview?.wouldWrite ?? false,
      },
      notifyEligibleBefore,
      notifyEligibleAfter,
      notifyWouldSend:
        notifyEligibleBefore !== null && notifyEligibleAfter !== null
          ? !notifyEligibleBefore && notifyEligibleAfter
          : false,
      error: undefined,
    };
  } catch (error) {
    if (isGeckoRateLimitError(error)) {
      return {
        ...buildUnsupportedGeckoTokenWriteResult(input),
        status: "rate_limited",
        rateLimited: true,
        rateLimitScope: "geckoterminal",
        error: error instanceof Error ? error.message : String(error),
      };
    }

    return {
      ...buildUnsupportedGeckoTokenWriteResult(input),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
