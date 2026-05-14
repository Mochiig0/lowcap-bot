export type HolderDistributionSignal = "none" | "low" | "medium" | "high" | "unknown";
export type HolderDistributionConfidence = "low" | "medium" | "high" | "unknown";

export type HolderDistributionSafeSummary = {
  topHolderPct: number | null;
  top10HolderPct: number | null;
  holderCount: number | null;
  freshWalletCount: number | null;
  bundlerSignal: HolderDistributionSignal;
  sameFundingOriginSignal: HolderDistributionSignal;
  lpWalletExcluded: boolean | null;
  source: string;
  observedAt: string;
  confidence: HolderDistributionConfidence;
  rawFree: true;
  secretFree: true;
};

const ALLOWED_KEYS = [
  "topHolderPct",
  "top10HolderPct",
  "holderCount",
  "freshWalletCount",
  "bundlerSignal",
  "sameFundingOriginSignal",
  "lpWalletExcluded",
  "source",
  "observedAt",
  "confidence",
  "rawFree",
  "secretFree",
] as const;

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

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replaceAll(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function findDangerousKeyPaths(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDangerousKeyPaths(item, `${path}[${index}]`));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const current = DANGEROUS_KEY_MARKERS.has(normalizeKey(key))
      ? [`dangerous key present at ${childPath}`]
      : [];
    return [...current, ...findDangerousKeyPaths(child, childPath)];
  });
}

function validatePercentField(
  object: JsonObject,
  key: "topHolderPct" | "top10HolderPct",
): string[] {
  const value = object[key];
  if (value === null) {
    return [];
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [`${key} must be a finite number from 0 through 100 or null`];
  }

  if (value < 0 || value > 100) {
    return [`${key} must be from 0 through 100 or null`];
  }

  return [];
}

function validateCountField(
  object: JsonObject,
  key: "holderCount" | "freshWalletCount",
): string[] {
  const value = object[key];
  if (value === null) {
    return [];
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return [`${key} must be a non-negative integer or null`];
  }

  return [];
}

function validateSignalField(
  object: JsonObject,
  key: "bundlerSignal" | "sameFundingOriginSignal",
): string[] {
  const value = object[key];
  if (typeof value === "string" && SIGNAL_VALUES.includes(value as HolderDistributionSignal)) {
    return [];
  }

  return [`${key} must be one of: ${SIGNAL_VALUES.join(", ")}`];
}

function isValidIsoTimestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const normalizedInput = value.endsWith("Z") && !/\.\d{3}Z$/.test(value)
    ? value.replace(/Z$/, ".000Z")
    : value;
  return new Date(timestamp).toISOString() === normalizedInput;
}

export function buildHolderDistributionSafeSummaryIssueList(input: unknown): string[] {
  const dangerousKeyIssues = findDangerousKeyPaths(input);
  if (!isRecord(input)) {
    return [
      "input must be a non-array object",
      ...dangerousKeyIssues,
    ];
  }

  const issues: string[] = [];
  const keys = Object.keys(input);
  const allowedKeySet = new Set<string>(ALLOWED_KEYS);

  for (const key of ALLOWED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) {
      issues.push(`${key} is required`);
    }
  }

  for (const key of keys) {
    if (!allowedKeySet.has(key)) {
      issues.push(`unknown field is not allowed: ${key}`);
    }
  }

  issues.push(...dangerousKeyIssues);
  issues.push(...validatePercentField(input, "topHolderPct"));
  issues.push(...validatePercentField(input, "top10HolderPct"));
  issues.push(...validateCountField(input, "holderCount"));
  issues.push(...validateCountField(input, "freshWalletCount"));
  issues.push(...validateSignalField(input, "bundlerSignal"));
  issues.push(...validateSignalField(input, "sameFundingOriginSignal"));

  const lpWalletExcluded = input.lpWalletExcluded;
  if (lpWalletExcluded !== null && typeof lpWalletExcluded !== "boolean") {
    issues.push("lpWalletExcluded must be boolean or null");
  }

  const source = input.source;
  if (typeof source !== "string" || source.trim().length === 0) {
    issues.push("source must be a non-empty string");
  }

  const observedAt = input.observedAt;
  if (typeof observedAt !== "string" || !isValidIsoTimestamp(observedAt)) {
    issues.push("observedAt must be a valid ISO timestamp string");
  }

  const confidence = input.confidence;
  if (
    typeof confidence !== "string" ||
    !CONFIDENCE_VALUES.includes(confidence as HolderDistributionConfidence)
  ) {
    issues.push(`confidence must be one of: ${CONFIDENCE_VALUES.join(", ")}`);
  }

  if (input.rawFree !== true) {
    issues.push("rawFree must be literal true");
  }

  if (input.secretFree !== true) {
    issues.push("secretFree must be literal true");
  }

  return issues;
}

export function isHolderDistributionSafeSummary(
  input: unknown,
): input is HolderDistributionSafeSummary {
  return buildHolderDistributionSafeSummaryIssueList(input).length === 0;
}

export function parseHolderDistributionSafeSummary(
  input: unknown,
): HolderDistributionSafeSummary {
  const issues = buildHolderDistributionSafeSummaryIssueList(input);
  if (issues.length > 0) {
    throw new Error(`Invalid HolderDistributionSafeSummary: ${issues.join("; ")}`);
  }

  const object = input as JsonObject;
  return {
    topHolderPct: object.topHolderPct as number | null,
    top10HolderPct: object.top10HolderPct as number | null,
    holderCount: object.holderCount as number | null,
    freshWalletCount: object.freshWalletCount as number | null,
    bundlerSignal: object.bundlerSignal as HolderDistributionSignal,
    sameFundingOriginSignal: object.sameFundingOriginSignal as HolderDistributionSignal,
    lpWalletExcluded: object.lpWalletExcluded as boolean | null,
    source: object.source as string,
    observedAt: object.observedAt as string,
    confidence: object.confidence as HolderDistributionConfidence,
    rawFree: true,
    secretFree: true,
  };
}
