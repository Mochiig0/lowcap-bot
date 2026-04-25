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
  return {
    token: input.token,
    selectedReason: input.selectedReason,
    status: input.result.status === "ok" ? "ok" : "error",
    ...(input.result.fetchedSnapshot
      ? { fetchedSnapshot: input.result.fetchedSnapshot }
      : {}),
    contextAvailable: false,
    contextWouldWrite: input.result.contextWouldWrite,
    savedContextFields: [],
    metaplexAttempted: false,
    metaplexAvailable: false,
    metaplexWouldWrite: input.result.metaplexContextWouldWrite,
    metaplexSavedFields: [],
    metaplexErrorKind: input.result.metaplexErrorKind,
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
      writeSummary: {
        ...baseResult.writeSummary,
        wouldEnrich: enrichPlan?.willUpdate ?? false,
        wouldRescore: rescorePreview !== null,
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
