import "dotenv/config";

import { readFile } from "node:fs/promises";

import { db } from "./db.js";
import { buildSafeMetricSummary, type SafeMetricSummary } from "./metricSafeSummary.js";
import { maybeCreateByNotificationKey } from "../notifications/notificationRepository.js";
import { GECKOTERMINAL_NEW_POOLS_SOURCE } from "../scoring/buildGeckoterminalNewPoolsDetectorCandidate.js";

const GECKOTERMINAL_NETWORK = "solana";
const GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE = "geckoterminal.token_snapshot";
const METRIC_SNAPSHOT_NOTIFICATION_SOURCE = "metric:snapshot:geckoterminal";
const DEFAULT_GECKOTERMINAL_TOKEN_API_URL =
  `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens`;
const DEFAULT_LIMIT = 20;
const DEFAULT_SINCE_MINUTES = 180;
const DEFAULT_INTERVAL_SECONDS = 60;
const LOG_PREFIX = "[metric:snapshot:geckoterminal]";
const MAX_NOTIFICATION_REHEARSAL_TAG_LENGTH = 40;
const NOTIFICATION_REHEARSAL_TAG_PATTERN = /^[A-Za-z0-9_-]+$/;
let injectedSnapshotErrorConsumed = false;

function getTokenApiUrl(): string {
  return process.env.GECKOTERMINAL_TOKEN_API_URL ?? DEFAULT_GECKOTERMINAL_TOKEN_API_URL;
}

type MetricSnapshotArgs = {
  write: boolean;
  watch: boolean;
  noNotificationCapture: boolean;
  mint?: string;
  limit: number;
  sinceMinutes: number;
  pumpOnly: boolean;
  prioritizeRichPending: boolean;
  onlyMetricPending: boolean;
  onlyMetricOnce: boolean;
  minGapMinutes?: number;
  interItemDelayMs: number;
  intervalSeconds: number;
  maxIterations?: number;
  source: string;
  notificationRehearsalTag?: string;
};

type JsonObject = Record<string, unknown>;

type SelectedToken = {
  id: number;
  mint: string;
  currentSource: string | null;
  createdAt: string;
  originSource: string | null;
  metadataStatus: string;
  hasReviewFlagsJson: boolean;
  reviewFlagsCount: number;
  metricsCount: number;
  notificationCount: number;
  holderSnapshotCount: number;
  latestMetricId: number | null;
  latestMetricObservedAt: string | null;
  selectionAnchorAt: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  isGeckoterminalOrigin: boolean;
};

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

type SnapshotTopPool = {
  address: string;
  name: string | null;
  dexId: string | null;
  poolCreatedAt: string | null;
  tokenPriceUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  reserveInUsd: number | null;
  volume24h: number | null;
  priceChangeH24: number | null;
  baseTokenAddress: string | null;
  quoteTokenAddress: string | null;
};

type SanitizedSnapshot = {
  network: string;
  token: {
    address: string;
    name: string | null;
    symbol: string | null;
    priceUsd: number | null;
    fdvUsd: number | null;
    marketCapUsd: number | null;
    totalReserveInUsd: number | null;
    volume24h: number | null;
  };
  topPoolCount: number;
  topPool: SnapshotTopPool | null;
};

type MetricCandidate = {
  observedAt: string;
  source: string;
  volume24h: number | null;
  safeSummary: SafeMetricSummary;
};

type NotificationSkippedReason =
  | "disabled_by_option"
  | "dry_run"
  | "metric_not_created"
  | "not_single_mint_mode";

type ProviderErrorCategory =
  | "network_fetch_error"
  | "timeout"
  | "http_429"
  | "http_error"
  | "parse_error"
  | "shape_error"
  | "provider_empty"
  | "unknown";

type ProviderErrorCategoryCounts = Record<ProviderErrorCategory, number>;

type ProviderErrorAggregate = {
  providerErrorCount: number;
  errorCategoryCounts: ProviderErrorCategoryCounts;
  networkFetchErrorCount: number;
  timeoutCount: number;
  http429Count: number;
  httpErrorCount: number;
  parseErrorCount: number;
  shapeErrorCount: number;
  providerEmptyCount: number;
  unknownErrorCount: number;
  firstErrorCategory: ProviderErrorCategory | null;
  firstHttpStatus: number | null;
};

type ProcessedTokenResult = {
  token: {
    id: number;
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    createdAt: string;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    isGeckoterminalOrigin: boolean;
    metadataStatus: string;
    metricsCount: number;
    notificationCount: number;
    holderSnapshotCount: number;
    latestMetricId: number | null;
    latestMetricObservedAt: string | null;
  };
  metricSource: string;
  status: "ok" | "error" | "skipped_recent_metric" | "selection_preview";
  metricCandidate?: MetricCandidate;
  writeSummary: {
    dryRun: boolean;
    wouldCreateMetric: boolean;
    metricId: number | null;
    notificationCaptureEnabled: boolean;
    notificationCreated: boolean;
    notificationId: number | null;
    notificationSkippedReason: NotificationSkippedReason | null;
  };
  latestObservedAt?: string;
  minGapMinutes?: number;
  error?: string;
  errorCategory?: ProviderErrorCategory;
  httpStatus?: number | null;
  httpStatusText?: string | null;
  retryable?: boolean;
};

type SelectedTokenSummary = {
  mintOnlyCount: number;
  nonMintOnlyCount: number;
  withReviewFlagsJsonCount: number;
  withReviewFlagsCount: number;
};

type SelectedMetricCountDistribution = {
  zero: number;
  one: number;
  twoPlus: number;
};

type LatestMetricAgeMinutesSummary = {
  min: number | null;
  max: number | null;
};

type CliOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  metricSource: string;
  originSource: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    prioritizeRichPending: boolean;
    onlyMetricPending: boolean;
    onlyMetricOnce: boolean;
    selectedCount: number;
    skippedNonPumpCount: number;
    selectedSummary: SelectedTokenSummary;
    selectedMetricCountDistribution: SelectedMetricCountDistribution;
    latestMetricAgeMinutes: LatestMetricAgeMinutesSummary;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    skippedCount: number;
    errorCount: number;
    writtenCount: number;
    interItemDelayMs: number;
    interItemDelayCount: number;
  } & ProviderErrorAggregate;
  items: ProcessedTokenResult[];
};

type WatchCycleResult = {
  cycle: number;
  failed: boolean;
  errorMessage?: string;
  mode: "single" | "recent_batch";
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    prioritizeRichPending: boolean;
    onlyMetricPending: boolean;
    onlyMetricOnce: boolean;
    selectedCount: number;
    skippedNonPumpCount: number;
    selectedSummary: SelectedTokenSummary;
    selectedMetricCountDistribution: SelectedMetricCountDistribution;
    latestMetricAgeMinutes: LatestMetricAgeMinutesSummary;
  };
  summary: {
    selectedCount: number;
    okCount: number;
    skippedCount: number;
    errorCount: number;
    writtenCount: number;
    rateLimited: boolean;
    rateLimitedCount: number;
    abortedDueToRateLimit: boolean;
    skippedAfterRateLimit: number;
    interItemDelayMs: number;
    interItemDelayCount: number;
  } & ProviderErrorAggregate;
  items: ProcessedTokenResult[];
};

type WatchOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  watchEnabled: boolean;
  intervalSeconds: number;
  interItemDelayMs: number;
  maxIterations?: number;
  metricSource: string;
  originSource: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    pumpOnly: boolean;
    prioritizeRichPending: boolean;
    onlyMetricPending: boolean;
    onlyMetricOnce: boolean;
    selectedSummary: SelectedTokenSummary;
    selectedMetricCountDistribution: SelectedMetricCountDistribution;
    latestMetricAgeMinutes: LatestMetricAgeMinutesSummary;
  };
  cycleCount: number;
  failedCount: number;
  selectedCount: number;
  okCount: number;
  skippedCount: number;
  errorCount: number;
  writtenCount: number;
  rateLimited: boolean;
  rateLimitedCount: number;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  interItemDelayCount: number;
  providerErrorCount: number;
  errorCategoryCounts: ProviderErrorCategoryCounts;
  networkFetchErrorCount: number;
  timeoutCount: number;
  http429Count: number;
  httpErrorCount: number;
  parseErrorCount: number;
  shapeErrorCount: number;
  providerEmptyCount: number;
  unknownErrorCount: number;
  firstErrorCategory: ProviderErrorCategory | null;
  firstHttpStatus: number | null;
  items: ProcessedTokenResult[];
  cycles: WatchCycleResult[];
};

type FirstSeenSourceSnapshot = {
  source?: unknown;
  detectedAt?: unknown;
};

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

class ProviderHttpError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string) {
    super(`GeckoTerminal token snapshot request failed: ${status} ${statusText}`);
    this.name = "ProviderHttpError";
    this.status = status;
    this.statusText = statusText;
  }
}

class ProviderJsonParseError extends Error {
  constructor() {
    super("provider JSON parse failed");
    this.name = "ProviderJsonParseError";
  }
}

class ProviderShapeError extends Error {
  constructor() {
    super("provider response shape invalid");
    this.name = "ProviderShapeError";
  }
}

class ProviderEmptyError extends Error {
  constructor() {
    super("provider response data empty");
    this.name = "ProviderEmptyError";
  }
}

type ClassifiedProviderError = {
  errorCategory: ProviderErrorCategory;
  httpStatus: number | null;
  httpStatusText: string | null;
  retryable: boolean;
  message: string;
};

const PROVIDER_ERROR_CATEGORIES: ProviderErrorCategory[] = [
  "network_fetch_error",
  "timeout",
  "http_429",
  "http_error",
  "parse_error",
  "shape_error",
  "provider_empty",
  "unknown",
];

function createEmptyProviderErrorCategoryCounts(): ProviderErrorCategoryCounts {
  return PROVIDER_ERROR_CATEGORIES.reduce<ProviderErrorCategoryCounts>(
    (counts, category) => {
      counts[category] = 0;
      return counts;
    },
    {
      network_fetch_error: 0,
      timeout: 0,
      http_429: 0,
      http_error: 0,
      parse_error: 0,
      shape_error: 0,
      provider_empty: 0,
      unknown: 0,
    },
  );
}

function classifyProviderError(error: unknown): ClassifiedProviderError {
  if (error instanceof ProviderHttpError) {
    const errorCategory = error.status === 429 ? "http_429" : "http_error";
    return {
      errorCategory,
      httpStatus: error.status,
      httpStatusText: error.statusText,
      retryable: error.status === 429 || error.status === 408 || error.status >= 500,
      message:
        error.status === 429
          ? "provider HTTP 429 rate limit"
          : `provider HTTP error ${error.status}`,
    };
  }

  if (error instanceof ProviderJsonParseError || error instanceof SyntaxError) {
    return {
      errorCategory: "parse_error",
      httpStatus: null,
      httpStatusText: null,
      retryable: false,
      message: "provider JSON parse failed",
    };
  }

  if (error instanceof ProviderShapeError) {
    return {
      errorCategory: "shape_error",
      httpStatus: null,
      httpStatusText: null,
      retryable: false,
      message: "provider response shape invalid",
    };
  }

  if (error instanceof ProviderEmptyError) {
    return {
      errorCategory: "provider_empty",
      httpStatus: null,
      httpStatusText: null,
      retryable: false,
      message: "provider response data empty",
    };
  }

  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  const httpMatch = message.match(
    /^GeckoTerminal token snapshot request failed: (?<status>\d{3})(?: (?<statusText>.*))?$/,
  );

  if (httpMatch?.groups?.status) {
    const status = Number(httpMatch.groups.status);
    const statusText = httpMatch.groups.statusText ?? "";
    const errorCategory = status === 429 ? "http_429" : "http_error";
    return {
      errorCategory,
      httpStatus: status,
      httpStatusText: statusText,
      retryable: status === 429 || status === 408 || status >= 500,
      message: status === 429 ? "provider HTTP 429 rate limit" : `provider HTTP error ${status}`,
    };
  }

  if (
    name === "AbortError" ||
    name === "TimeoutError" ||
    /timeout|timed out|aborted/i.test(message)
  ) {
    return {
      errorCategory: "timeout",
      httpStatus: null,
      httpStatusText: null,
      retryable: true,
      message: "provider request timed out",
    };
  }

  if (message === "fetch failed" || /fetch failed/i.test(message) || name === "TypeError") {
    return {
      errorCategory: "network_fetch_error",
      httpStatus: null,
      httpStatusText: null,
      retryable: true,
      message: "provider fetch failed before HTTP response",
    };
  }

  return {
    errorCategory: "unknown",
    httpStatus: null,
    httpStatusText: null,
    retryable: false,
    message: "provider error unknown",
  };
}

function getUsageText(): string {
  return [
    "Usage:",
    "pnpm metric:snapshot:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--pumpOnly] [--prioritizeRichPending] [--onlyMetricPending] [--onlyMetricOnce] [--minGapMinutes <N>] [--interItemDelayMs <N>] [--source <SOURCE>] [--notificationRehearsalTag <TAG>] [--noNotificationCapture] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>]",
    "",
    "Defaults:",
    `- fetches live GeckoTerminal token snapshots from ${getTokenApiUrl()}/{mint}?include=top_pools`,
    `- recent batch mode selects up to ${DEFAULT_LIMIT} recent GeckoTerminal-origin tokens`,
    `- recent batch mode uses firstSeenSourceSnapshot.detectedAt when present, otherwise Token.createdAt`,
    `- recent batch mode looks back ${DEFAULT_SINCE_MINUTES} minutes by default`,
    `- recent batch mode may be narrowed to mint strings ending with pump via --pumpOnly; --mint single mode still ignores that batch filter`,
    `- recent batch mode may also prefer non-mint_only and review-flagged rows via experimental --prioritizeRichPending; default selection order stays unchanged when omitted`,
    `- recent batch mode may be narrowed to Metric-zero rows via opt-in --onlyMetricPending; exact --mint mode rejects that option because the target is already explicit`,
    `- recent batch mode may be narrowed to Metric-one rows via opt-in --onlyMetricOnce for second-snapshot growth follow-up; exact --mint mode rejects that option because the target is already explicit`,
    `- --onlyMetricPending and --onlyMetricOnce dry-runs are selection previews and do not fetch GeckoTerminal snapshots; --write uses the existing Metric append path`,
    `- batch mode excludes recent Metric rows before --limit when --minGapMinutes is set; exact --mint mode still skips before fetch when the latest Metric for the same token+source is still recent`,
    `- waits --interItemDelayMs between selected batch items when set; default is 0 and exact --mint mode is not delayed`,
    `- stays dry-run by default and writes Metric rows only when --write is set`,
    `- single --mint write mode captures a metric_appended Notification by default; --noNotificationCapture suppresses that capture record without changing Metric writes`,
    `- --notificationRehearsalTag <TAG> is allowed only with exact --mint --write one-shot capture and prefixes the capture-only notificationKey with REHEARSAL:<TAG>:`,
    `- loops only when --watch is set`,
    `- waits --intervalSeconds ${DEFAULT_INTERVAL_SECONDS} between watch cycles`,
    `- persists observedAt, source, rawJson, and volume24h only when the source clearly exposes 24h volume`,
    `- keeps FDV, market cap, and liquidity-style fields in rawJson only`,
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

function parseNonNegativeIntegerArg(value: string, key: string): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new CliUsageError(`Invalid non-negative integer for ${key}: ${value}`);
  }

  return Number(trimmed);
}

function parseOptionalStringArg(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function parseNotificationRehearsalTagArg(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new CliUsageError("--notificationRehearsalTag must be non-empty");
  }

  if (trimmed.length > MAX_NOTIFICATION_REHEARSAL_TAG_LENGTH) {
    throw new CliUsageError(
      `--notificationRehearsalTag must be ${MAX_NOTIFICATION_REHEARSAL_TAG_LENGTH} characters or fewer`,
    );
  }

  if (!NOTIFICATION_REHEARSAL_TAG_PATTERN.test(trimmed)) {
    throw new CliUsageError(
      "--notificationRehearsalTag may contain only letters, numbers, underscore, and hyphen",
    );
  }

  return trimmed;
}

function parseArgs(argv: string[]): MetricSnapshotArgs {
  const normalizedArgv = argv.filter((value) => value !== "--");
  const out: MetricSnapshotArgs = {
    write: false,
    watch: false,
    noNotificationCapture: false,
    limit: DEFAULT_LIMIT,
    sinceMinutes: DEFAULT_SINCE_MINUTES,
    pumpOnly: false,
    prioritizeRichPending: false,
    onlyMetricPending: false,
    onlyMetricOnce: false,
    interItemDelayMs: 0,
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    source: GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE,
  };

  for (let i = 0; i < normalizedArgv.length; i += 1) {
    const key = normalizedArgv[i];

    if (key === "--help") {
      throw new CliUsageError("");
    }

    if (
      key === "--write" ||
      key === "--watch" ||
      key === "--prioritizeRichPending" ||
      key === "--onlyMetricPending" ||
      key === "--onlyMetricOnce" ||
      key === "--noNotificationCapture"
    ) {
      if (key === "--write") {
        out.write = true;
      } else if (key === "--watch") {
        out.watch = true;
      } else if (key === "--noNotificationCapture") {
        out.noNotificationCapture = true;
      } else if (key === "--onlyMetricPending") {
        out.onlyMetricPending = true;
      } else if (key === "--onlyMetricOnce") {
        out.onlyMetricOnce = true;
      } else {
        out.prioritizeRichPending = true;
      }
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
      case "--minGapMinutes":
        out.minGapMinutes = parsePositiveIntegerArg(value, key);
        break;
      case "--interItemDelayMs":
        out.interItemDelayMs = parseNonNegativeIntegerArg(value, key);
        break;
      case "--intervalSeconds":
        out.intervalSeconds = parsePositiveIntegerArg(value, key);
        break;
      case "--maxIterations":
        out.maxIterations = parsePositiveIntegerArg(value, key);
        break;
      case "--source":
        out.source = parseOptionalStringArg(value) ?? GECKOTERMINAL_TOKEN_SNAPSHOT_SOURCE;
        break;
      case "--notificationRehearsalTag":
        out.notificationRehearsalTag = parseNotificationRehearsalTagArg(value);
        break;
      default:
        throw new CliUsageError(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  if (
    !out.watch &&
    (normalizedArgv.includes("--intervalSeconds") || normalizedArgv.includes("--maxIterations"))
  ) {
    throw new CliUsageError("--intervalSeconds and --maxIterations require --watch");
  }

  if (out.mint && out.onlyMetricPending) {
    throw new CliUsageError("--onlyMetricPending is only valid in batch mode without --mint");
  }

  if (out.mint && out.onlyMetricOnce) {
    throw new CliUsageError("--onlyMetricOnce is only valid in batch mode without --mint");
  }

  if (out.onlyMetricPending && out.onlyMetricOnce) {
    throw new CliUsageError("--onlyMetricPending and --onlyMetricOnce cannot be used together");
  }

  if (out.notificationRehearsalTag !== undefined) {
    if (!out.write) {
      throw new CliUsageError("--notificationRehearsalTag requires --write");
    }

    if (!out.mint) {
      throw new CliUsageError("--notificationRehearsalTag requires exact --mint mode");
    }

    if (out.watch) {
      throw new CliUsageError("--notificationRehearsalTag cannot be used with --watch");
    }

    if (out.noNotificationCapture) {
      throw new CliUsageError(
        "--notificationRehearsalTag cannot be used with --noNotificationCapture",
      );
    }
  }

  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function readOptionalNumberString(input: JsonObject, key: string): number | null {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readOptionalNestedNumberString(
  input: JsonObject,
  key: string,
  nestedKey: string,
): number | null {
  const nested = input[key];
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }

  const value = (nested as JsonObject)[nestedKey];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function hasStoredReviewFlags(reviewFlagsJson: unknown): boolean {
  return reviewFlagsJson !== null && reviewFlagsJson !== undefined;
}

function extractReviewFlags(reviewFlagsJson: unknown): ReviewFlagsView | null {
  if (!reviewFlagsJson || typeof reviewFlagsJson !== "object" || Array.isArray(reviewFlagsJson)) {
    return null;
  }

  const hasWebsite = (reviewFlagsJson as JsonObject).hasWebsite;
  const hasX = (reviewFlagsJson as JsonObject).hasX;
  const hasTelegram = (reviewFlagsJson as JsonObject).hasTelegram;
  const metaplexHit = (reviewFlagsJson as JsonObject).metaplexHit;
  const descriptionPresent = (reviewFlagsJson as JsonObject).descriptionPresent;
  const linkCount = (reviewFlagsJson as JsonObject).linkCount;

  if (
    typeof hasWebsite !== "boolean" ||
    typeof hasX !== "boolean" ||
    typeof hasTelegram !== "boolean" ||
    typeof metaplexHit !== "boolean" ||
    typeof descriptionPresent !== "boolean" ||
    typeof linkCount !== "number" ||
    !Number.isInteger(linkCount) ||
    linkCount < 0
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

function countReviewFlags(reviewFlags: ReviewFlagsView | null): number {
  if (reviewFlags === null) {
    return 0;
  }

  return [
    reviewFlags.hasWebsite,
    reviewFlags.hasX,
    reviewFlags.hasTelegram,
    reviewFlags.metaplexHit,
    reviewFlags.descriptionPresent,
    reviewFlags.linkCount > 0,
  ].filter(Boolean).length;
}

function isRateLimitErrorMessage(message: string | undefined): boolean {
  if (typeof message !== "string") {
    return false;
  }

  return message.includes("429 Too Many Requests");
}

function buildProviderErrorAggregate(items: ProcessedTokenResult[]): ProviderErrorAggregate {
  const errorCategoryCounts = createEmptyProviderErrorCategoryCounts();
  const errorItems = items.filter((item) => item.status === "error");

  for (const item of errorItems) {
    const category = item.errorCategory ?? "unknown";
    errorCategoryCounts[category] += 1;
  }

  const firstError = errorItems[0];

  return {
    providerErrorCount: errorItems.length,
    errorCategoryCounts,
    networkFetchErrorCount: errorCategoryCounts.network_fetch_error,
    timeoutCount: errorCategoryCounts.timeout,
    http429Count: errorCategoryCounts.http_429,
    httpErrorCount: errorCategoryCounts.http_error,
    parseErrorCount: errorCategoryCounts.parse_error,
    shapeErrorCount: errorCategoryCounts.shape_error,
    providerEmptyCount: errorCategoryCounts.provider_empty,
    unknownErrorCount: errorCategoryCounts.unknown,
    firstErrorCategory: firstError?.errorCategory ?? null,
    firstHttpStatus: firstError?.httpStatus ?? null,
  };
}

function readOptionalRelationshipAddress(
  input: JsonObject,
  relationshipKey: string,
): string | null {
  const relationship = input[relationshipKey];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
    return null;
  }

  const data = (relationship as JsonObject).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const id = (data as JsonObject).id;
  if (typeof id !== "string" || id.trim().length === 0) {
    return null;
  }

  const prefix = `${GECKOTERMINAL_NETWORK}_`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function readOptionalRelationshipId(
  input: JsonObject,
  relationshipKey: string,
): string | null {
  const relationship = input[relationshipKey];
  if (!relationship || typeof relationship !== "object" || Array.isArray(relationship)) {
    return null;
  }

  const data = (relationship as JsonObject).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }

  const id = (data as JsonObject).id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
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

function buildSelectedToken(token: {
  id: number;
  mint: string;
  source: string | null;
  createdAt: Date;
  entrySnapshot: unknown;
  metadataStatus: string;
  reviewFlagsJson: unknown;
  metrics?: { id: number; observedAt: Date }[];
  _count?: {
    metrics?: number;
    holderSnapshots?: number;
  };
}): SelectedToken {
  const firstSeen = extractFirstSeenSourceSnapshot(token.entrySnapshot);
  const originSource =
    typeof firstSeen?.source === "string" && firstSeen.source.trim().length > 0
      ? firstSeen.source
      : token.source;
  const detectedAt = readOptionalDateString(firstSeen?.detectedAt);
  const reviewFlags = extractReviewFlags(token.reviewFlagsJson);

  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.source,
    createdAt: token.createdAt.toISOString(),
    originSource: originSource ?? null,
    metadataStatus: token.metadataStatus,
    hasReviewFlagsJson: hasStoredReviewFlags(token.reviewFlagsJson),
    reviewFlagsCount: countReviewFlags(reviewFlags),
    metricsCount: token._count?.metrics ?? 0,
    notificationCount: 0,
    holderSnapshotCount: token._count?.holderSnapshots ?? 0,
    latestMetricId: token.metrics?.[0]?.id ?? null,
    latestMetricObservedAt: token.metrics?.[0]?.observedAt.toISOString() ?? null,
    selectionAnchorAt: detectedAt ?? token.createdAt.toISOString(),
    selectionAnchorKind: detectedAt ? "firstSeenDetectedAt" : "createdAt",
    isGeckoterminalOrigin:
      token.source === GECKOTERMINAL_NEW_POOLS_SOURCE ||
      originSource === GECKOTERMINAL_NEW_POOLS_SOURCE,
  };
}

async function attachNotificationCounts(tokens: SelectedToken[]): Promise<SelectedToken[]> {
  if (tokens.length === 0) {
    return tokens;
  }

  const counts = await db.notification.groupBy({
    by: ["tokenId"],
    where: {
      tokenId: {
        in: tokens.map((token) => token.id),
      },
    },
    _count: {
      _all: true,
    },
  });
  const countByTokenId = new Map(
    counts
      .filter((item): item is typeof item & { tokenId: number } => item.tokenId !== null)
      .map((item) => [item.tokenId, item._count._all]),
  );

  return tokens.map((token) => ({
    ...token,
    notificationCount: countByTokenId.get(token.id) ?? 0,
  }));
}

function getRichPendingPriorityScore(token: SelectedToken): number {
  return (
    (token.metadataStatus !== "mint_only" ? 4 : 0) +
    (token.hasReviewFlagsJson ? 2 : 0) +
    (token.reviewFlagsCount > 0 ? 1 : 0)
  );
}

function summarizeSelectedTokens(tokens: SelectedToken[]): SelectedTokenSummary {
  return tokens.reduce<SelectedTokenSummary>(
    (summary, token) => {
      if (token.metadataStatus === "mint_only") {
        summary.mintOnlyCount += 1;
      } else {
        summary.nonMintOnlyCount += 1;
      }

      if (token.hasReviewFlagsJson) {
        summary.withReviewFlagsJsonCount += 1;
      }

      if (token.reviewFlagsCount > 0) {
        summary.withReviewFlagsCount += 1;
      }

      return summary;
    },
    {
      mintOnlyCount: 0,
      nonMintOnlyCount: 0,
      withReviewFlagsJsonCount: 0,
      withReviewFlagsCount: 0,
    },
  );
}

function summarizeSelectedMetricCounts(
  tokens: Array<{ metricsCount: number }>,
): SelectedMetricCountDistribution {
  return tokens.reduce<SelectedMetricCountDistribution>(
    (summary, token) => {
      if (token.metricsCount === 0) {
        summary.zero += 1;
      } else if (token.metricsCount === 1) {
        summary.one += 1;
      } else {
        summary.twoPlus += 1;
      }

      return summary;
    },
    {
      zero: 0,
      one: 0,
      twoPlus: 0,
    },
  );
}

function summarizeLatestMetricAgeMinutes(
  tokens: Array<{ latestMetricObservedAt: string | null }>,
): LatestMetricAgeMinutesSummary {
  const now = Date.now();
  const ages = tokens
    .map((token) => token.latestMetricObservedAt)
    .filter((value): value is string => value !== null)
    .map((value) => Math.max(0, Math.floor((now - Date.parse(value)) / 60_000)))
    .filter((value) => Number.isFinite(value));

  if (ages.length === 0) {
    return {
      min: null,
      max: null,
    };
  }

  return {
    min: Math.min(...ages),
    max: Math.max(...ages),
  };
}

function prioritizeRichPendingTokens(tokens: SelectedToken[]): SelectedToken[] {
  return tokens
    .map((token, index) => ({ token, index }))
    .sort((left, right) => {
      const priorityDelta =
        getRichPendingPriorityScore(right.token) - getRichPendingPriorityScore(left.token);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return left.index - right.index;
    })
    .map(({ token }) => token);
}

async function excludeRecentlyMeasuredTokensBeforeLimit(
  tokens: SelectedToken[],
  args: MetricSnapshotArgs,
): Promise<SelectedToken[]> {
  if (args.minGapMinutes === undefined) {
    return tokens;
  }

  const minObservedAtMs = Date.now() - args.minGapMinutes * 60_000;
  const eligibleTokens: SelectedToken[] = [];

  for (const token of tokens) {
    const latestObservedAt = await findLatestMetricObservedAt(token.id, args.source);
    if (latestObservedAt === null || Date.parse(latestObservedAt) <= minObservedAtMs) {
      eligibleTokens.push(token);
    }
  }

  return eligibleTokens;
}

function isPumpMint(mint: string): boolean {
  return mint.endsWith("pump");
}

function buildMetricAppendedNotificationKey(
  mint: string,
  metricId: number,
  rehearsalTag?: string,
): string {
  const productionKey = `${mint}:metric_appended:${metricId}`;
  return rehearsalTag === undefined
    ? productionKey
    : `REHEARSAL:${rehearsalTag}:${productionKey}`;
}

function buildMetricAppendedMessagePreview(input: {
  mint: string;
  metricId: number;
  source: string;
}): string {
  return [
    "eventType=metric_appended",
    `mint=${input.mint}`,
    `metricId=${input.metricId}`,
    `source=${input.source}`,
    "status=captured",
    "trigger=metric_appended",
  ].join(" ");
}

function isNotificationCaptureEnabled(args: MetricSnapshotArgs): boolean {
  return Boolean(args.mint) && !args.noNotificationCapture;
}

function getNotificationSkippedReason(
  args: MetricSnapshotArgs,
  metricId: number | null,
): NotificationSkippedReason | null {
  if (!args.write) {
    return "dry_run";
  }

  if (!args.mint) {
    return "not_single_mint_mode";
  }

  if (args.noNotificationCapture) {
    return "disabled_by_option";
  }

  if (metricId === null) {
    return "metric_not_created";
  }

  return null;
}

function buildWriteSummary(input: {
  args: MetricSnapshotArgs;
  wouldCreateMetric: boolean;
  metricId: number | null;
  notificationId?: number | null;
  notificationCreated?: boolean;
}): ProcessedTokenResult["writeSummary"] {
  return {
    dryRun: !input.args.write,
    wouldCreateMetric: input.wouldCreateMetric,
    metricId: input.metricId,
    notificationCaptureEnabled: isNotificationCaptureEnabled(input.args),
    notificationCreated: input.notificationCreated ?? false,
    notificationId: input.notificationId ?? null,
    notificationSkippedReason: getNotificationSkippedReason(input.args, input.metricId),
  };
}

async function selectTokens(args: MetricSnapshotArgs): Promise<{
  mode: "single" | "recent_batch";
  selectedTokens: SelectedToken[];
  sinceCutoff: string | null;
  skippedNonPumpCount: number;
}> {
  if (args.mint) {
    const token = await db.token.findUnique({
      where: { mint: args.mint },
      select: {
        id: true,
        mint: true,
        source: true,
        createdAt: true,
        entrySnapshot: true,
        metadataStatus: true,
        reviewFlagsJson: true,
        metrics: {
          orderBy: [{ observedAt: "desc" }, { id: "desc" }],
          take: 1,
          select: {
            id: true,
            observedAt: true,
          },
        },
        _count: {
          select: {
            metrics: true,
            holderSnapshots: true,
          },
        },
      },
    });

    if (!token) {
      throw new CliUsageError(`Token not found for mint: ${args.mint}`);
    }

    return {
      mode: "single",
      selectedTokens: await attachNotificationCounts([buildSelectedToken(token)]),
      sinceCutoff: null,
      skippedNonPumpCount: 0,
    };
  }

  const sinceCutoff = new Date(Date.now() - args.sinceMinutes * 60_000);
  const tokens = await db.token.findMany({
    where: {
      createdAt: {
        gte: sinceCutoff,
      },
      ...(args.onlyMetricPending ? { metrics: { none: {} } } : {}),
      ...(args.onlyMetricOnce ? { metrics: { some: {} } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      mint: true,
      source: true,
      createdAt: true,
      entrySnapshot: true,
      metadataStatus: true,
      reviewFlagsJson: true,
      metrics: {
        orderBy: [{ observedAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          observedAt: true,
        },
      },
      _count: {
        select: {
          metrics: true,
          holderSnapshots: true,
        },
      },
    },
  });

  const recentGeckoTokens = tokens
    .map(buildSelectedToken)
    .filter((token) => !args.onlyMetricOnce || token.metricsCount === 1)
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
  const pumpEligibleTokens = args.pumpOnly
    ? recentGeckoTokens.filter((token) => isPumpMint(token.mint))
    : recentGeckoTokens;
  const gapEligibleTokens = await excludeRecentlyMeasuredTokensBeforeLimit(
    pumpEligibleTokens,
    args,
  );
  const orderedTokens = args.prioritizeRichPending
    ? prioritizeRichPendingTokens(gapEligibleTokens)
    : gapEligibleTokens;
  const selectedTokens = await attachNotificationCounts(orderedTokens.slice(0, args.limit));

  return {
    mode: "recent_batch",
    selectedTokens,
    sinceCutoff: sinceCutoff.toISOString(),
    skippedNonPumpCount: recentGeckoTokens.length - pumpEligibleTokens.length,
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
    try {
      return JSON.parse(content) as unknown;
    } catch {
      throw new ProviderJsonParseError();
    }
  }

  const response = await fetch(
    `${getTokenApiUrl()}/${encodeURIComponent(mint)}?include=top_pools`,
    {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new ProviderHttpError(response.status, response.statusText);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderJsonParseError();
  }
}

async function findLatestMetricObservedAt(
  tokenId: number,
  source: string,
): Promise<string | null> {
  const latestMetric = await db.metric.findFirst({
    where: {
      tokenId,
      source,
    },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    select: {
      observedAt: true,
    },
  });

  return latestMetric ? latestMetric.observedAt.toISOString() : null;
}

function parseSnapshotTopPool(
  relationshipIds: string[],
  included: JsonObject[],
): SnapshotTopPool | null {
  if (relationshipIds.length === 0) {
    return null;
  }

  const firstPoolId = relationshipIds[0];
  const firstPool = included.find((item) => item.id === firstPoolId);
  if (!firstPool) {
    return null;
  }

  const attributes = ensureObject(firstPool.attributes, `included.${firstPoolId}.attributes`);
  const relationships =
    firstPool.relationships && typeof firstPool.relationships === "object" && !Array.isArray(firstPool.relationships)
      ? (firstPool.relationships as JsonObject)
      : {};

  return {
    address: readRequiredString(attributes, "address", `included.${firstPoolId}.attributes`),
    name: readOptionalString(attributes, "name"),
    dexId: readOptionalRelationshipId(relationships, "dex"),
    poolCreatedAt: readOptionalDateString(attributes.pool_created_at),
    tokenPriceUsd: readOptionalNumberString(attributes, "token_price_usd"),
    fdvUsd: readOptionalNumberString(attributes, "fdv_usd"),
    marketCapUsd: readOptionalNumberString(attributes, "market_cap_usd"),
    reserveInUsd: readOptionalNumberString(attributes, "reserve_in_usd"),
    volume24h: readOptionalNestedNumberString(attributes, "volume_usd", "h24"),
    priceChangeH24: readOptionalNestedNumberString(
      attributes,
      "price_change_percentage",
      "h24",
    ),
    baseTokenAddress: readOptionalRelationshipAddress(relationships, "base_token"),
    quoteTokenAddress: readOptionalRelationshipAddress(relationships, "quote_token"),
  };
}

function parseSanitizedSnapshot(raw: unknown): SanitizedSnapshot {
  const input = ensureObject(raw, "raw");
  if (input.data === null) {
    throw new ProviderEmptyError();
  }
  const data = ensureObject(input.data, "raw.data");
  const attributes = ensureObject(data.attributes, "raw.data.attributes");
  const relationships =
    data.relationships && typeof data.relationships === "object" && !Array.isArray(data.relationships)
      ? (data.relationships as JsonObject)
      : {};
  const topPoolsRelationship =
    relationships.top_pools &&
    typeof relationships.top_pools === "object" &&
    !Array.isArray(relationships.top_pools)
      ? (relationships.top_pools as JsonObject).data
      : undefined;

  const topPoolIds = Array.isArray(topPoolsRelationship)
    ? topPoolsRelationship
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            return null;
          }

          const id = (item as JsonObject).id;
          return typeof id === "string" && id.trim().length > 0 ? id : null;
        })
        .filter((value): value is string => value !== null)
    : [];
  const included = Array.isArray(input.included)
    ? input.included
        .filter((item) => item && typeof item === "object" && !Array.isArray(item))
        .map((item) => item as JsonObject)
    : [];

  return {
    network: GECKOTERMINAL_NETWORK,
    token: {
      address: readRequiredString(attributes, "address", "raw.data.attributes"),
      name: readOptionalString(attributes, "name"),
      symbol: readOptionalString(attributes, "symbol"),
      priceUsd: readOptionalNumberString(attributes, "price_usd"),
      fdvUsd: readOptionalNumberString(attributes, "fdv_usd"),
      marketCapUsd: readOptionalNumberString(attributes, "market_cap_usd"),
      totalReserveInUsd: readOptionalNumberString(attributes, "total_reserve_in_usd"),
      volume24h: readOptionalNestedNumberString(attributes, "volume_usd", "h24"),
    },
    topPoolCount: topPoolIds.length,
    topPool: parseSnapshotTopPool(topPoolIds, included),
  };
}

function parseProviderSnapshot(raw: unknown): SanitizedSnapshot {
  try {
    return parseSanitizedSnapshot(raw);
  } catch (error) {
    if (error instanceof ProviderEmptyError) {
      throw error;
    }

    throw new ProviderShapeError();
  }
}

function buildProcessedTokenView(token: SelectedToken): ProcessedTokenResult["token"] {
  return {
    id: token.id,
    mint: token.mint,
    currentSource: token.currentSource,
    originSource: token.originSource,
    createdAt: token.createdAt,
    selectionAnchorAt: token.selectionAnchorAt,
    selectionAnchorKind: token.selectionAnchorKind,
    isGeckoterminalOrigin: token.isGeckoterminalOrigin,
    metadataStatus: token.metadataStatus,
    metricsCount: token.metricsCount,
    notificationCount: token.notificationCount,
    holderSnapshotCount: token.holderSnapshotCount,
    latestMetricId: token.latestMetricId,
    latestMetricObservedAt: token.latestMetricObservedAt,
  };
}

function buildSelectionPreviewResult(
  token: SelectedToken,
  args: MetricSnapshotArgs,
): ProcessedTokenResult {
  return {
    token: buildProcessedTokenView(token),
    metricSource: args.source,
    status: "selection_preview",
    writeSummary: buildWriteSummary({
      args,
      wouldCreateMetric: true,
      metricId: null,
    }),
  };
}

async function processToken(
  token: SelectedToken,
  args: MetricSnapshotArgs,
): Promise<ProcessedTokenResult> {
  try {
    if (args.minGapMinutes !== undefined) {
      const latestObservedAt = await findLatestMetricObservedAt(token.id, args.source);
      if (latestObservedAt) {
        const diffMs = Date.now() - Date.parse(latestObservedAt);
        if (diffMs < args.minGapMinutes * 60_000) {
          return {
            token: buildProcessedTokenView(token),
            metricSource: args.source,
            status: "skipped_recent_metric",
            writeSummary: buildWriteSummary({
              args,
              wouldCreateMetric: false,
              metricId: null,
            }),
            latestObservedAt,
            minGapMinutes: args.minGapMinutes,
          };
        }
      }
    }

    const raw = await fetchTokenSnapshotRaw(token.mint);
    const observedAt = new Date().toISOString();
    const rawJson = parseProviderSnapshot(raw);
    const metricCandidate: MetricCandidate = {
      observedAt,
      source: args.source,
      volume24h: rawJson.token.volume24h,
      safeSummary: buildSafeMetricSummary(rawJson),
    };

    let metricId: number | null = null;
    let notificationId: number | null = null;
    let notificationCreated = false;
    if (args.write) {
      const created = await db.metric.create({
        data: {
          tokenId: token.id,
          observedAt: new Date(observedAt),
          source: args.source,
          volume24h: metricCandidate.volume24h ?? undefined,
          rawJson,
        },
        select: {
          id: true,
        },
      });
      metricId = created.id;

      if (isNotificationCaptureEnabled(args)) {
        const notificationResult = await maybeCreateByNotificationKey(db, {
          notificationKey: buildMetricAppendedNotificationKey(
            token.mint,
            metricId,
            args.notificationRehearsalTag,
          ),
          eventType: "metric_appended",
          mint: token.mint,
          tokenId: token.id,
          metricId,
          trigger: "metric_appended",
          messagePreview: buildMetricAppendedMessagePreview({
            mint: token.mint,
            metricId,
            source: args.source,
          }),
          source: METRIC_SNAPSHOT_NOTIFICATION_SOURCE,
        });
        notificationId = notificationResult.notification.id;
        notificationCreated = notificationResult.created;
      }
    }

    return {
      token: buildProcessedTokenView(token),
      metricSource: args.source,
      status: "ok",
      metricCandidate,
      writeSummary: buildWriteSummary({
        args,
        wouldCreateMetric: true,
        metricId,
        notificationId,
        notificationCreated,
      }),
    };
  } catch (error) {
    const classifiedError = classifyProviderError(error);
    return {
      token: buildProcessedTokenView(token),
      metricSource: args.source,
      status: "error",
      writeSummary: buildWriteSummary({
        args,
        wouldCreateMetric: false,
        metricId: null,
      }),
      error: classifiedError.message,
      errorCategory: classifiedError.errorCategory,
      httpStatus: classifiedError.httpStatus,
      httpStatusText: classifiedError.httpStatusText,
      retryable: classifiedError.retryable,
    };
  }
}

type SnapshotExecutionResult = {
  mode: "single" | "recent_batch";
  sinceCutoff: string | null;
  selectedTokens: SelectedToken[];
  skippedNonPumpCount: number;
  items: ProcessedTokenResult[];
  rateLimited: boolean;
  rateLimitedCount: number;
  abortedDueToRateLimit: boolean;
  skippedAfterRateLimit: number;
  interItemDelayCount: number;
};

async function executeSnapshotCycle(
  args: MetricSnapshotArgs,
): Promise<SnapshotExecutionResult> {
  const selection = await selectTokens(args);
  if ((args.onlyMetricPending || args.onlyMetricOnce) && !args.write) {
    return {
      mode: selection.mode,
      sinceCutoff: selection.sinceCutoff,
      selectedTokens: selection.selectedTokens,
      skippedNonPumpCount: selection.skippedNonPumpCount,
      items: selection.selectedTokens.map((token) => buildSelectionPreviewResult(token, args)),
      rateLimited: false,
      rateLimitedCount: 0,
      abortedDueToRateLimit: false,
      skippedAfterRateLimit: 0,
      interItemDelayCount: 0,
    };
  }

  const items: ProcessedTokenResult[] = [];
  let rateLimited = false;
  let rateLimitedCount = 0;
  let abortedDueToRateLimit = false;
  let skippedAfterRateLimit = 0;
  let interItemDelayCount = 0;

  for (let index = 0; index < selection.selectedTokens.length; index += 1) {
    const token = selection.selectedTokens[index];
    const result = await processToken(token, args);
    items.push(result);

    if (
      args.watch &&
      result.status === "error" &&
      (result.errorCategory === "http_429" || isRateLimitErrorMessage(result.error))
    ) {
      rateLimited = true;
      rateLimitedCount += 1;
      abortedDueToRateLimit = true;
      skippedAfterRateLimit = selection.selectedTokens.length - index - 1;
      break;
    }

    if (!args.mint && args.interItemDelayMs > 0 && index < selection.selectedTokens.length - 1) {
      interItemDelayCount += 1;
      await sleep(args.interItemDelayMs);
    }
  }

  return {
    mode: selection.mode,
    sinceCutoff: selection.sinceCutoff,
    selectedTokens: selection.selectedTokens,
    skippedNonPumpCount: selection.skippedNonPumpCount,
    items,
    rateLimited,
    rateLimitedCount,
    abortedDueToRateLimit,
    skippedAfterRateLimit,
    interItemDelayCount,
  };
}

function buildOneShotOutput(
  args: MetricSnapshotArgs,
  execution: SnapshotExecutionResult,
): CliOutput {
  const providerErrorAggregate = buildProviderErrorAggregate(execution.items);

  return {
    mode: execution.mode,
    dryRun: !args.write,
    writeEnabled: args.write,
    metricSource: args.source,
    originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: execution.sinceCutoff,
      pumpOnly: !args.mint && args.pumpOnly,
      prioritizeRichPending: !args.mint && args.prioritizeRichPending,
      onlyMetricPending: !args.mint && args.onlyMetricPending,
      onlyMetricOnce: !args.mint && args.onlyMetricOnce,
      selectedCount: execution.selectedTokens.length,
      skippedNonPumpCount: execution.skippedNonPumpCount,
      selectedSummary: summarizeSelectedTokens(execution.selectedTokens),
      selectedMetricCountDistribution: summarizeSelectedMetricCounts(execution.selectedTokens),
      latestMetricAgeMinutes: summarizeLatestMetricAgeMinutes(execution.selectedTokens),
    },
    summary: {
      selectedCount: execution.selectedTokens.length,
      okCount: execution.items.filter((item) => item.status === "ok").length,
      skippedCount: execution.items.filter((item) => item.status === "skipped_recent_metric").length,
      errorCount: execution.items.filter((item) => item.status === "error").length,
      writtenCount: execution.items.filter((item) => item.writeSummary.metricId !== null).length,
      interItemDelayMs: args.interItemDelayMs,
      interItemDelayCount: execution.interItemDelayCount,
      ...providerErrorAggregate,
    },
    items: execution.items,
  };
}

function createFailedCycleResult(
  args: MetricSnapshotArgs,
  cycle: number,
  error: unknown,
): WatchCycleResult {
  return {
    cycle,
    failed: true,
    errorMessage: error instanceof Error ? error.message : String(error),
    mode: args.mint ? "single" : "recent_batch",
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: null,
      pumpOnly: !args.mint && args.pumpOnly,
      prioritizeRichPending: !args.mint && args.prioritizeRichPending,
      onlyMetricPending: !args.mint && args.onlyMetricPending,
      onlyMetricOnce: !args.mint && args.onlyMetricOnce,
      selectedCount: 0,
      skippedNonPumpCount: 0,
      selectedSummary: summarizeSelectedTokens([]),
      selectedMetricCountDistribution: summarizeSelectedMetricCounts([]),
      latestMetricAgeMinutes: summarizeLatestMetricAgeMinutes([]),
    },
    summary: {
      selectedCount: 0,
      okCount: 0,
      skippedCount: 0,
      errorCount: 0,
      writtenCount: 0,
      rateLimited: false,
      rateLimitedCount: 0,
      abortedDueToRateLimit: false,
      skippedAfterRateLimit: 0,
      interItemDelayMs: args.interItemDelayMs,
      interItemDelayCount: 0,
      ...buildProviderErrorAggregate([]),
    },
    items: [],
  };
}

function buildWatchCycleResult(
  args: MetricSnapshotArgs,
  cycle: number,
  execution: SnapshotExecutionResult,
): WatchCycleResult {
  const providerErrorAggregate = buildProviderErrorAggregate(execution.items);

  return {
    cycle,
    failed: false,
    mode: execution.mode,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      sinceCutoff: execution.sinceCutoff,
      pumpOnly: !args.mint && args.pumpOnly,
      prioritizeRichPending: !args.mint && args.prioritizeRichPending,
      onlyMetricPending: !args.mint && args.onlyMetricPending,
      onlyMetricOnce: !args.mint && args.onlyMetricOnce,
      selectedCount: execution.selectedTokens.length,
      skippedNonPumpCount: execution.skippedNonPumpCount,
      selectedSummary: summarizeSelectedTokens(execution.selectedTokens),
      selectedMetricCountDistribution: summarizeSelectedMetricCounts(execution.selectedTokens),
      latestMetricAgeMinutes: summarizeLatestMetricAgeMinutes(execution.selectedTokens),
    },
    summary: {
      selectedCount: execution.selectedTokens.length,
      okCount: execution.items.filter((item) => item.status === "ok").length,
      skippedCount: execution.items.filter((item) => item.status === "skipped_recent_metric").length,
      errorCount: execution.items.filter((item) => item.status === "error").length,
      writtenCount: execution.items.filter((item) => item.writeSummary.metricId !== null).length,
      rateLimited: execution.rateLimited,
      rateLimitedCount: execution.rateLimitedCount,
      abortedDueToRateLimit: execution.abortedDueToRateLimit,
      skippedAfterRateLimit: execution.skippedAfterRateLimit,
      interItemDelayMs: args.interItemDelayMs,
      interItemDelayCount: execution.interItemDelayCount,
      ...providerErrorAggregate,
    },
    items: execution.items,
  };
}

function logWatchCycleSummary(cycle: WatchCycleResult): void {
  console.error(
    [
      `${LOG_PREFIX} cycle=${cycle.cycle}`,
      `failed=${cycle.failed}`,
      `selected=${cycle.summary.selectedCount}`,
      `ok=${cycle.summary.okCount}`,
      `skipped=${cycle.summary.skippedCount}`,
      `error=${cycle.summary.errorCount}`,
      `written=${cycle.summary.writtenCount}`,
      `providerErrorCount=${cycle.summary.providerErrorCount}`,
      `firstErrorCategory=${cycle.summary.firstErrorCategory ?? "none"}`,
      `firstHttpStatus=${cycle.summary.firstHttpStatus ?? "none"}`,
      `rateLimited=${cycle.summary.rateLimited}`,
      `rateLimitedCount=${cycle.summary.rateLimitedCount}`,
      `abortedDueToRateLimit=${cycle.summary.abortedDueToRateLimit}`,
      `skippedAfterRateLimit=${cycle.summary.skippedAfterRateLimit}`,
      `interItemDelayMs=${cycle.summary.interItemDelayMs}`,
      `interItemDelayCount=${cycle.summary.interItemDelayCount}`,
      ...(cycle.errorMessage ? [`errorMessage=${JSON.stringify(cycle.errorMessage)}`] : []),
    ].join(" "),
  );
}

function buildWatchOutput(
  args: MetricSnapshotArgs,
  cycles: WatchCycleResult[],
): WatchOutput {
  const flattenedItems = cycles.flatMap((cycle) => cycle.items);
  const providerErrorAggregate = buildProviderErrorAggregate(flattenedItems);

  return {
    mode: cycles[0]?.mode ?? (args.mint ? "single" : "recent_batch"),
    dryRun: !args.write,
    writeEnabled: args.write,
    watchEnabled: args.watch,
    intervalSeconds: args.intervalSeconds,
    interItemDelayMs: args.interItemDelayMs,
    ...(args.maxIterations ? { maxIterations: args.maxIterations } : {}),
    metricSource: args.source,
    originSource: GECKOTERMINAL_NEW_POOLS_SOURCE,
    selection: {
      mint: args.mint ?? null,
      limit: args.mint ? null : args.limit,
      sinceMinutes: args.mint ? null : args.sinceMinutes,
      pumpOnly: !args.mint && args.pumpOnly,
      prioritizeRichPending: !args.mint && args.prioritizeRichPending,
      onlyMetricPending: !args.mint && args.onlyMetricPending,
      onlyMetricOnce: !args.mint && args.onlyMetricOnce,
      selectedSummary: cycles.reduce<SelectedTokenSummary>(
        (summary, cycle) => {
          summary.mintOnlyCount += cycle.selection.selectedSummary.mintOnlyCount;
          summary.nonMintOnlyCount += cycle.selection.selectedSummary.nonMintOnlyCount;
          summary.withReviewFlagsJsonCount +=
            cycle.selection.selectedSummary.withReviewFlagsJsonCount;
          summary.withReviewFlagsCount += cycle.selection.selectedSummary.withReviewFlagsCount;
          return summary;
        },
        {
          mintOnlyCount: 0,
          nonMintOnlyCount: 0,
          withReviewFlagsJsonCount: 0,
          withReviewFlagsCount: 0,
        },
      ),
      selectedMetricCountDistribution: summarizeSelectedMetricCounts(
        flattenedItems.map((item) => item.token),
      ),
      latestMetricAgeMinutes: summarizeLatestMetricAgeMinutes(
        flattenedItems.map((item) => item.token),
      ),
    },
    cycleCount: cycles.length,
    failedCount: cycles.filter((cycle) => cycle.failed).length,
    selectedCount: cycles.reduce((sum, cycle) => sum + cycle.summary.selectedCount, 0),
    okCount: cycles.reduce((sum, cycle) => sum + cycle.summary.okCount, 0),
    skippedCount: cycles.reduce((sum, cycle) => sum + cycle.summary.skippedCount, 0),
    errorCount: cycles.reduce((sum, cycle) => sum + cycle.summary.errorCount, 0),
    writtenCount: cycles.reduce((sum, cycle) => sum + cycle.summary.writtenCount, 0),
    rateLimited: cycles.some((cycle) => cycle.summary.rateLimited),
    rateLimitedCount: cycles.reduce((sum, cycle) => sum + cycle.summary.rateLimitedCount, 0),
    abortedDueToRateLimit: cycles.some((cycle) => cycle.summary.abortedDueToRateLimit),
    skippedAfterRateLimit: cycles.reduce(
      (sum, cycle) => sum + cycle.summary.skippedAfterRateLimit,
      0,
    ),
    interItemDelayCount: cycles.reduce(
      (sum, cycle) => sum + cycle.summary.interItemDelayCount,
      0,
    ),
    ...providerErrorAggregate,
    items: flattenedItems,
    cycles,
  };
}

async function runOneShot(args: MetricSnapshotArgs): Promise<CliOutput> {
  const execution = await executeSnapshotCycle(args);
  return buildOneShotOutput(args, execution);
}

async function runWatch(args: MetricSnapshotArgs): Promise<WatchOutput> {
  const cycles: WatchCycleResult[] = [];
  const shouldCollectCycles = args.maxIterations !== undefined;
  const watchIterationCount = args.maxIterations ?? Number.POSITIVE_INFINITY;

  for (let cycle = 1; cycle <= watchIterationCount; cycle += 1) {
    let cycleResult: WatchCycleResult;

    try {
      const execution = await executeSnapshotCycle(args);
      cycleResult = buildWatchCycleResult(args, cycle, execution);
    } catch (error) {
      cycleResult = createFailedCycleResult(args, cycle, error);
    }

    if (shouldCollectCycles) {
      cycles.push(cycleResult);
    }

    logWatchCycleSummary(cycleResult);

    if (cycle === watchIterationCount) {
      break;
    }

    await sleep(args.intervalSeconds * 1000);
  }

  return buildWatchOutput(args, cycles);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const output = args.watch ? await runWatch(args) : await runOneShot(args);
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
