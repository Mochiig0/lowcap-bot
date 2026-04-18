import { buildTargetText } from "../scoring/normalize.js";
import { db } from "./db.js";

export type TokenEnrichPatch = {
  name?: string;
  symbol?: string;
  desc?: string;
  source?: string;
};

export type TokenForEnrich = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  source: string | null;
  metadataStatus: string;
  importedAt: Date;
  enrichedAt: Date | null;
};

export type TokenEnrichPreview = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  source: string | null;
  metadataStatus: string;
  normalizedText: string | null;
  importedAt: string;
  enrichedAt: string | null;
};

export type TokenEnrichPlan = {
  hasRequestedUpdate: boolean;
  hasTextFieldUpdate: boolean;
  hasSourceUpdate: boolean;
  hasChange: boolean;
  preview: TokenEnrichPreview;
  data: {
    name?: string;
    symbol?: string;
    description?: string;
    source?: string | null;
    normalizedText?: string;
    enrichedAt?: Date;
    metadataStatus?: "partial" | "enriched";
  };
};

export function computeMetadataStatus(params: {
  name: string;
  symbol: string;
  description?: string;
}): "partial" | "enriched" {
  return params.description ? "enriched" : "partial";
}

export async function findTokenForEnrich(mint: string): Promise<TokenForEnrich | null> {
  return db.token.findUnique({
    where: { mint },
    select: {
      mint: true,
      name: true,
      symbol: true,
      description: true,
      source: true,
      metadataStatus: true,
      importedAt: true,
      enrichedAt: true,
    },
  });
}

export function buildTokenEnrichPlan(
  existing: TokenForEnrich,
  patch: TokenEnrichPatch,
  now = new Date(),
): TokenEnrichPlan {
  const hasTextFieldUpdate =
    patch.name !== undefined ||
    patch.symbol !== undefined ||
    patch.desc !== undefined;
  const hasSourceUpdate = patch.source !== undefined;
  const hasRequestedUpdate = hasTextFieldUpdate || hasSourceUpdate;

  if (!hasRequestedUpdate) {
    throw new Error(
      "No fields to update: provide at least one of --name, --symbol, --desc, or --source",
    );
  }

  const nextName = patch.name ?? existing.name ?? null;
  const nextSymbol = patch.symbol ?? existing.symbol ?? null;
  const nextDescription = patch.desc ?? existing.description ?? null;
  const nextSource = hasSourceUpdate ? (patch.source ?? null) : existing.source;

  const data: TokenEnrichPlan["data"] = {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.symbol !== undefined ? { symbol: patch.symbol } : {}),
    ...(patch.desc !== undefined ? { description: patch.desc } : {}),
    ...(hasSourceUpdate ? { source: patch.source ?? null } : { source: existing.source }),
  };

  let normalizedText: string | null = null;
  let nextMetadataStatus = existing.metadataStatus;
  let nextEnrichedAt = existing.enrichedAt;

  if (hasTextFieldUpdate) {
    if (!nextName) {
      throw new Error(`Token is not ready for enrich: name is required for mint ${existing.mint}`);
    }

    if (!nextSymbol) {
      throw new Error(`Token is not ready for enrich: symbol is required for mint ${existing.mint}`);
    }

    const computedMetadataStatus = computeMetadataStatus({
      name: nextName,
      symbol: nextSymbol,
      description: nextDescription ?? undefined,
    });
    nextMetadataStatus = computedMetadataStatus;
    normalizedText = buildTargetText({
      name: nextName,
      symbol: nextSymbol,
      description: nextDescription ?? undefined,
    });
    nextEnrichedAt = now;
    data.metadataStatus = computedMetadataStatus;
    data.normalizedText = normalizedText;
    data.enrichedAt = now;
  }

  const hasChange =
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.symbol !== undefined && patch.symbol !== existing.symbol) ||
    (patch.desc !== undefined && patch.desc !== existing.description) ||
    (hasSourceUpdate && (patch.source ?? null) !== existing.source);

  return {
    hasRequestedUpdate,
    hasTextFieldUpdate,
    hasSourceUpdate,
    hasChange,
    preview: {
      mint: existing.mint,
      name: nextName,
      symbol: nextSymbol,
      description: nextDescription,
      source: nextSource,
      metadataStatus: nextMetadataStatus,
      normalizedText,
      importedAt: existing.importedAt.toISOString(),
      enrichedAt: nextEnrichedAt?.toISOString() ?? null,
    },
    data,
  };
}

export async function enrichTokenByMint(
  mint: string,
  patch: TokenEnrichPatch,
): Promise<TokenEnrichPreview> {
  const existing = await findTokenForEnrich(mint);
  if (!existing) {
    throw new Error(`Token not found for mint: ${mint}`);
  }

  const plan = buildTokenEnrichPlan(existing, patch);
  const token = await db.token.update({
    where: { mint },
    data: plan.data,
    select: {
      mint: true,
      name: true,
      symbol: true,
      description: true,
      source: true,
      metadataStatus: true,
      normalizedText: true,
      importedAt: true,
      enrichedAt: true,
    },
  });

  return {
    mint: token.mint,
    name: token.name,
    symbol: token.symbol,
    description: token.description,
    source: token.source,
    metadataStatus: token.metadataStatus,
    normalizedText: token.normalizedText,
    importedAt: token.importedAt.toISOString(),
    enrichedAt: token.enrichedAt?.toISOString() ?? null,
  };
}
