import type { DetectorCandidate } from "./evaluateDetectorCandidate.js";

export type GeckoterminalNewPoolsDetectorCandidate = Extract<
  DetectorCandidate,
  { candidateKind: "source_event_hint" }
>;

export const GECKOTERMINAL_NEW_POOLS_SOURCE = "geckoterminal.new_pools";
export const GECKOTERMINAL_NEW_POOLS_EVENT_TYPE = "new_pool";

type JsonObject = Record<string, unknown>;

function ensureObject(value: unknown, context: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }

  return value as JsonObject;
}

function readRequiredString(input: JsonObject, key: string, context: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context}.${key} must be a non-empty string`);
  }

  return value;
}

function readOptionalString(input: JsonObject, key: string): string | undefined {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readIncludedById(
  included: JsonObject[],
  id: string,
  context: string,
): JsonObject {
  const match = included.find((item) => item.id === id);
  if (!match) {
    throw new Error(`${context} included item ${id} not found`);
  }

  return match;
}

export function buildGeckoterminalNewPoolsDetectorCandidate(
  raw: unknown,
  detectedAt: string,
): GeckoterminalNewPoolsDetectorCandidate {
  if (typeof detectedAt !== "string" || detectedAt.trim().length === 0) {
    throw new Error("detectedAt must be a non-empty string");
  }

  const input = ensureObject(raw, "raw");
  const data = input.data;
  const includedRaw = input.included;

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("raw.data must be a non-empty array");
  }

  if (!Array.isArray(includedRaw)) {
    throw new Error("raw.included must be an array");
  }

  const pool = ensureObject(data[0], "raw.data[0]");
  const attributes = ensureObject(pool.attributes, "raw.data[0].attributes");
  const relationships = ensureObject(pool.relationships, "raw.data[0].relationships");
  const baseTokenRelationship = ensureObject(
    ensureObject(relationships.base_token, "raw.data[0].relationships.base_token").data,
    "raw.data[0].relationships.base_token.data",
  );
  const quoteTokenRelationship = ensureObject(
    ensureObject(relationships.quote_token, "raw.data[0].relationships.quote_token").data,
    "raw.data[0].relationships.quote_token.data",
  );
  const dexRelationship = ensureObject(
    ensureObject(relationships.dex, "raw.data[0].relationships.dex").data,
    "raw.data[0].relationships.dex.data",
  );

  const baseTokenId = readRequiredString(
    baseTokenRelationship,
    "id",
    "raw.data[0].relationships.base_token.data",
  );
  const quoteTokenId = readRequiredString(
    quoteTokenRelationship,
    "id",
    "raw.data[0].relationships.quote_token.data",
  );
  const dexId = readRequiredString(
    dexRelationship,
    "id",
    "raw.data[0].relationships.dex.data",
  );

  const included = includedRaw.map((item, index) =>
    ensureObject(item, `raw.included[${index}]`),
  );
  const baseToken = ensureObject(
    readIncludedById(included, baseTokenId, "raw"),
    `raw.included.${baseTokenId}`,
  );
  const quoteToken = ensureObject(
    readIncludedById(included, quoteTokenId, "raw"),
    `raw.included.${quoteTokenId}`,
  );
  const dex = ensureObject(readIncludedById(included, dexId, "raw"), `raw.included.${dexId}`);

  const baseTokenAttributes = ensureObject(
    baseToken.attributes,
    `raw.included.${baseTokenId}.attributes`,
  );
  const quoteTokenAttributes = ensureObject(
    quoteToken.attributes,
    `raw.included.${quoteTokenId}.attributes`,
  );
  const dexAttributes = ensureObject(dex.attributes, `raw.included.${dexId}.attributes`);

  const mintAddress = readRequiredString(
    baseTokenAttributes,
    "address",
    `raw.included.${baseTokenId}.attributes`,
  );

  return {
    candidateKind: "source_event_hint",
    source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    eventType: GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
    detectedAt,
    payload: {
      mintAddress,
      poolAddress: readRequiredString(attributes, "address", "raw.data[0].attributes"),
      poolName: readOptionalString(attributes, "name"),
      poolCreatedAt: readRequiredString(attributes, "pool_created_at", "raw.data[0].attributes"),
      dexId,
      dexName: readRequiredString(dexAttributes, "name", `raw.included.${dexId}.attributes`),
      baseTokenAddress: mintAddress,
      baseTokenSymbol: readOptionalString(baseTokenAttributes, "symbol"),
      quoteTokenAddress: readRequiredString(
        quoteTokenAttributes,
        "address",
        `raw.included.${quoteTokenId}.attributes`,
      ),
      quoteTokenSymbol: readOptionalString(quoteTokenAttributes, "symbol"),
    },
  };
}
