import {
  buildHolderDistributionSafeSummaryIssueList,
  type HolderDistributionConfidence,
  type HolderDistributionSafeSummary,
  type HolderDistributionSignal,
} from "./holderDistributionSafeSummary.js";

type JsonObject = Record<string, unknown>;

export type HolderSourceMapperResult =
  | {
    ok: true;
    summary: HolderDistributionSafeSummary;
  }
  | {
    ok: false;
    issues: string[];
  };

type RugcheckStyleMapperOptions = {
  observedAt?: string;
  source?: "rugcheck.safe_summary.synthetic" | "rugcheck.safe_summary";
  confidence?: HolderDistributionConfidence;
};

const SIGNAL_VALUES: HolderDistributionSignal[] = [
  "none",
  "low",
  "medium",
  "high",
  "unknown",
];

const CONFIDENCE_VALUES: HolderDistributionConfidence[] = [
  "low",
  "medium",
  "high",
  "unknown",
];

const TOP_LEVEL_KEYS = new Set([
  "observedAt",
  "confidence",
  "holderConcentration",
  "walletSignals",
]);

const HOLDER_CONCENTRATION_KEYS = new Set([
  "topHolderPct",
  "top10HolderPct",
  "holderCount",
  "lpWalletExcluded",
]);

const WALLET_SIGNAL_KEYS = new Set([
  "freshWalletCount",
  "bundlerSignal",
  "sameFundingOriginSignal",
]);

const DANGEROUS_KEY_MARKERS = new Set([
  "apikey",
  "authorization",
  "bearer",
  "chatid",
  "holders",
  "privatekey",
  "rawjson",
  "rawresponse",
  "rawresponsebody",
  "requesturl",
  "responsebody",
  "secret",
  "telegrambottoken",
  "telegramchatid",
  "token",
  "topholders",
  "walletlist",
  "wallets",
]);

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replaceAll(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function findDangerousKeyIssues(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDangerousKeyIssues(item, `${path}[${index}]`));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const current = DANGEROUS_KEY_MARKERS.has(normalizeKey(key))
      ? [`dangerous raw payload or secret-like key present at ${childPath}`]
      : [];
    return [...current, ...findDangerousKeyIssues(child, childPath)];
  });
}

function isPercent(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isBooleanOrNull(value: unknown): value is boolean | null {
  return typeof value === "boolean" || value === null;
}

function readPercent(
  object: JsonObject | null,
  key: "topHolderPct" | "top10HolderPct",
  issues: string[],
): number | null {
  if (!object || !Object.prototype.hasOwnProperty.call(object, key)) {
    return null;
  }

  const value = object[key];
  if (value === null) {
    return null;
  }

  if (!isPercent(value)) {
    issues.push(`${key} must be a finite number from 0 through 100 or null`);
    return null;
  }

  return value;
}

function readCount(
  object: JsonObject | null,
  key: "holderCount" | "freshWalletCount",
  issues: string[],
): number | null {
  if (!object || !Object.prototype.hasOwnProperty.call(object, key)) {
    return null;
  }

  const value = object[key];
  if (value === null) {
    return null;
  }

  if (!isCount(value)) {
    issues.push(`${key} must be a non-negative integer or null`);
    return null;
  }

  return value;
}

function readSignal(
  object: JsonObject | null,
  key: "bundlerSignal" | "sameFundingOriginSignal",
  issues: string[],
): HolderDistributionSignal {
  if (!object || !Object.prototype.hasOwnProperty.call(object, key)) {
    return "unknown";
  }

  const value = object[key];
  if (typeof value === "string" && SIGNAL_VALUES.includes(value as HolderDistributionSignal)) {
    return value as HolderDistributionSignal;
  }

  issues.push(`${key} must be one of: ${SIGNAL_VALUES.join(", ")}`);
  return "unknown";
}

function readLpWalletExcluded(
  object: JsonObject | null,
  issues: string[],
): boolean | null {
  if (!object || !Object.prototype.hasOwnProperty.call(object, "lpWalletExcluded")) {
    return null;
  }

  const value = object.lpWalletExcluded;
  if (!isBooleanOrNull(value)) {
    issues.push("lpWalletExcluded must be boolean or null");
    return null;
  }

  return value;
}

function readConfidence(
  input: JsonObject,
  options: RugcheckStyleMapperOptions,
  issues: string[],
): HolderDistributionConfidence {
  const value = options.confidence ?? input.confidence ?? "unknown";
  if (typeof value === "string" && CONFIDENCE_VALUES.includes(value as HolderDistributionConfidence)) {
    return value as HolderDistributionConfidence;
  }

  issues.push(`confidence must be one of: ${CONFIDENCE_VALUES.join(", ")}`);
  return "unknown";
}

function readObservedAt(
  input: JsonObject,
  options: RugcheckStyleMapperOptions,
): string | null {
  const value = options.observedAt ?? input.observedAt;
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function validateObjectKeys(
  object: JsonObject,
  allowedKeys: Set<string>,
  label: string,
): string[] {
  return Object.keys(object)
    .filter((key) => !allowedKeys.has(key))
    .map((key) => `unknown ${label} field is not allowed: ${key}`);
}

function readOptionalSection(
  input: JsonObject,
  key: "holderConcentration" | "walletSignals",
  allowedKeys: Set<string>,
  issues: string[],
): JsonObject | null {
  const value = input[key];
  if (value === undefined || value === null) {
    return null;
  }

  if (!isRecord(value)) {
    issues.push(`${key} must be an object when provided`);
    return null;
  }

  issues.push(...validateObjectKeys(value, allowedKeys, key));
  return value;
}

export function mapRugcheckStyleHolderSummary(
  input: unknown,
  options: RugcheckStyleMapperOptions = {},
): HolderSourceMapperResult {
  const issues = findDangerousKeyIssues(input);
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        "input must be a non-array object",
        ...issues,
      ],
    };
  }

  issues.push(...validateObjectKeys(input, TOP_LEVEL_KEYS, "top-level"));

  const holderConcentration = readOptionalSection(
    input,
    "holderConcentration",
    HOLDER_CONCENTRATION_KEYS,
    issues,
  );
  const walletSignals = readOptionalSection(
    input,
    "walletSignals",
    WALLET_SIGNAL_KEYS,
    issues,
  );
  const observedAt = readObservedAt(input, options);
  if (observedAt === null) {
    issues.push("observedAt is required as an ISO timestamp string");
  }

  const summary: HolderDistributionSafeSummary = {
    topHolderPct: readPercent(holderConcentration, "topHolderPct", issues),
    top10HolderPct: readPercent(holderConcentration, "top10HolderPct", issues),
    holderCount: readCount(holderConcentration, "holderCount", issues),
    freshWalletCount: readCount(walletSignals, "freshWalletCount", issues),
    bundlerSignal: readSignal(walletSignals, "bundlerSignal", issues),
    sameFundingOriginSignal: readSignal(walletSignals, "sameFundingOriginSignal", issues),
    lpWalletExcluded: readLpWalletExcluded(holderConcentration, issues),
    source: options.source ?? "rugcheck.safe_summary.synthetic",
    observedAt: observedAt ?? "",
    confidence: readConfidence(input, options, issues),
    rawFree: true,
    secretFree: true,
  };

  issues.push(...buildHolderDistributionSafeSummaryIssueList(summary));
  const uniqueIssues = [...new Set(issues)];
  if (uniqueIssues.length > 0) {
    return {
      ok: false,
      issues: uniqueIssues,
    };
  }

  return {
    ok: true,
    summary,
  };
}
