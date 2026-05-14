import {
  buildHolderDistributionSafeSummaryIssueList,
  parseHolderDistributionSafeSummary,
  type HolderDistributionConfidence,
  type HolderDistributionSafeSummary,
  type HolderDistributionSignal,
} from "./holderDistributionSafeSummary.js";

type JsonObject = Record<string, unknown>;

type HolderSafeSummaryReportInputItem = {
  mintOrLabel: string | null;
  summary: unknown;
};

type HolderSafeSummaryReportItem = {
  mintOrLabel: string | null;
  status: "valid" | "invalid";
  source: string | null;
  observedAt: string | null;
  confidence: HolderDistributionConfidence | null;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  holderCount: number | null;
  freshWalletCount: number | null;
  bundlerSignal: HolderDistributionSignal | null;
  sameFundingOriginSignal: HolderDistributionSignal | null;
  lpWalletExcluded: boolean | null;
  rawFree: true | null;
  secretFree: true | null;
  issues: string[];
  riskReviewHints: string[];
  rejectedRawPayload: boolean;
  suggestedCommand: null;
};

export type HolderSafeSummaryReport = {
  mode: "read_only_holder_safe_summary_report";
  readOnly: true;
  willWrite: false;
  willFetch: false;
  advisoryOutput: false;
  inputCount: number;
  validCount: number;
  invalidCount: number;
  items: HolderSafeSummaryReportItem[];
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

const DANGEROUS_ISSUE_PATTERN =
  /\b(apiKey|authorization|bearer|chatId|holders|privateKey|rawJson|rawResponse|rawResponseBody|requestUrl|responseBody|secret|telegramBotToken|telegramChatId|token|topHolders|walletList|wallets)\b/i;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readValidPercent(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
    ? value
    : null;
}

function readValidCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

function readSignal(value: unknown): HolderDistributionSignal | null {
  return typeof value === "string" && SIGNAL_VALUES.includes(value as HolderDistributionSignal)
    ? value as HolderDistributionSignal
    : null;
}

function readConfidence(value: unknown): HolderDistributionConfidence | null {
  return typeof value === "string" &&
    CONFIDENCE_VALUES.includes(value as HolderDistributionConfidence)
    ? value as HolderDistributionConfidence
    : null;
}

function readBooleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" || value === null ? value : null;
}

function readTrueOrNull(value: unknown): true | null {
  return value === true ? true : null;
}

function rejectedRawPayload(issues: string[]): boolean {
  return issues.some((issue) => issue.startsWith("dangerous key present at "));
}

function sanitizeIssuesForReport(issues: string[]): string[] {
  return [...new Set(issues.map((issue) => {
    if (issue.startsWith("dangerous key present at ")) {
      return "dangerous raw payload or secret-like key present";
    }

    if (DANGEROUS_ISSUE_PATTERN.test(issue)) {
      return "unsafe raw payload or secret-like field is not allowed";
    }

    return issue;
  }))];
}

function buildRiskReviewHints(input: {
  status: "valid" | "invalid";
  rejectedRawPayload: boolean;
}): string[] {
  return [
    ...(input.rejectedRawPayload
      ? ["remove raw payload or secret-like fields before review"]
      : []),
    ...(input.status === "valid"
      ? ["review holder concentration manually"]
      : ["fix safe summary shape before review"]),
    "compare with later outcome",
    "do not infer trading decision",
  ];
}

function normalizeInputItem(item: unknown, index: number): HolderSafeSummaryReportInputItem {
  if (!isRecord(item)) {
    return {
      mintOrLabel: `item_${index + 1}`,
      summary: item,
    };
  }

  return {
    mintOrLabel: readOptionalString(item.mint) ?? readOptionalString(item.label),
    summary: item.summary,
  };
}

function normalizeInput(input: unknown): HolderSafeSummaryReportInputItem[] {
  if (!isRecord(input)) {
    return [
      {
        mintOrLabel: null,
        summary: input,
      },
    ];
  }

  if (Array.isArray(input.items)) {
    return input.items.map(normalizeInputItem);
  }

  return [normalizeInputItem(input, 0)];
}

function buildValidItem(
  mintOrLabel: string | null,
  summary: HolderDistributionSafeSummary,
): HolderSafeSummaryReportItem {
  return {
    mintOrLabel,
    status: "valid",
    source: summary.source,
    observedAt: summary.observedAt,
    confidence: summary.confidence,
    topHolderPct: summary.topHolderPct,
    top10HolderPct: summary.top10HolderPct,
    holderCount: summary.holderCount,
    freshWalletCount: summary.freshWalletCount,
    bundlerSignal: summary.bundlerSignal,
    sameFundingOriginSignal: summary.sameFundingOriginSignal,
    lpWalletExcluded: summary.lpWalletExcluded,
    rawFree: summary.rawFree,
    secretFree: summary.secretFree,
    issues: [],
    riskReviewHints: buildRiskReviewHints({
      status: "valid",
      rejectedRawPayload: false,
    }),
    rejectedRawPayload: false,
    suggestedCommand: null,
  };
}

function buildInvalidItem(
  mintOrLabel: string | null,
  summary: unknown,
  issues: string[],
): HolderSafeSummaryReportItem {
  const object = isRecord(summary) ? summary : {};
  const rawPayloadRejected = rejectedRawPayload(issues);

  return {
    mintOrLabel,
    status: "invalid",
    source: readOptionalString(object.source),
    observedAt: typeof object.observedAt === "string" ? object.observedAt : null,
    confidence: readConfidence(object.confidence),
    topHolderPct: readValidPercent(object.topHolderPct),
    top10HolderPct: readValidPercent(object.top10HolderPct),
    holderCount: readValidCount(object.holderCount),
    freshWalletCount: readValidCount(object.freshWalletCount),
    bundlerSignal: readSignal(object.bundlerSignal),
    sameFundingOriginSignal: readSignal(object.sameFundingOriginSignal),
    lpWalletExcluded: readBooleanOrNull(object.lpWalletExcluded),
    rawFree: readTrueOrNull(object.rawFree),
    secretFree: readTrueOrNull(object.secretFree),
    issues: sanitizeIssuesForReport(issues),
    riskReviewHints: buildRiskReviewHints({
      status: "invalid",
      rejectedRawPayload: rawPayloadRejected,
    }),
    rejectedRawPayload: rawPayloadRejected,
    suggestedCommand: null,
  };
}

function buildReportItem(input: HolderSafeSummaryReportInputItem): HolderSafeSummaryReportItem {
  const issues = buildHolderDistributionSafeSummaryIssueList(input.summary);
  if (issues.length > 0) {
    return buildInvalidItem(input.mintOrLabel, input.summary, issues);
  }

  return buildValidItem(
    input.mintOrLabel,
    parseHolderDistributionSafeSummary(input.summary),
  );
}

export function buildHolderSafeSummaryReport(input: unknown): HolderSafeSummaryReport {
  const normalizedItems = normalizeInput(input);
  const items = normalizedItems.map(buildReportItem);

  return {
    mode: "read_only_holder_safe_summary_report",
    readOnly: true,
    willWrite: false,
    willFetch: false,
    advisoryOutput: false,
    inputCount: items.length,
    validCount: items.filter((item) => item.status === "valid").length,
    invalidCount: items.filter((item) => item.status === "invalid").length,
    items,
  };
}
