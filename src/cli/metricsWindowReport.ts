import "dotenv/config";

import { db } from "./db.js";

type EntryAtSource =
  | "firstSeenSourceSnapshot.detectedAt"
  | "importedAt"
  | "createdAt"
  | "cli"
  | "notification.sentAt"
  | "notification.capturedAt";

type AlertedAtSource =
  | "cli_entryAt"
  | "notification_sent_at"
  | "notification_captured_at"
  | "first_seen_detected_at"
  | "token_imported_at"
  | "token_created_at"
  | "unavailable";

type AlertFdvSource =
  | "metric_before_alert"
  | "metric_after_alert"
  | "unavailable";

type FdvSampleCoverageLabel = "no_data" | "thin" | "partial" | "usable";
type OutcomeLabel = "no_data" | "flat" | "small_win" | "hit" | "big_hit";
type NoDataReason =
  | "no_alert_anchor_near_entry"
  | "no_fdv_samples_in_window"
  | "no_peak_fdv"
  | "no_peak_multiple";

type MetricsWindowReportArgs = {
  mint: string;
  entryAt?: Date;
  windows: number[];
};

type WindowReport = {
  sampleCount: number;
  fdvSampleCount: number;
  peakFdv: number | null;
  peakObservedAt: string | null;
  firstObservedFdv: number | null;
  peakMultipleFromFirstObserved: number | null;
  windowMinutes: number;
  windowStartAt: string | null;
  windowEndAt: string | null;
  isWindowComplete: boolean;
  outcomeIsProvisional: boolean;
  fdvFirstObservedAt: string | null;
  fdvLastObservedAt: string | null;
  fdvObservedSpanMinutes: number | null;
  fdvSampleCoverageLabel: FdvSampleCoverageLabel;
  peakMultipleFromAlert: number | null;
  timeToPeakMinutes: number | null;
  drawdownFromPeak: number | null;
  outcomeLabel: OutcomeLabel;
  noDataReasons: NoDataReason[];
  hasAlertFdvAnchor: boolean;
  hasWindowFdvSamples: boolean;
};

type MetricsWindowReportOutput = {
  status: "ok";
  mode: "read_only_metric_window_report";
  readOnly: true;
  willWrite: false;
  willFetch: false;
  willSendTelegram: false;
  mint: string;
  entryAt: string;
  entryAtSource: EntryAtSource;
  reportGeneratedAt: string;
  evaluationAt: string;
  alertedAt: string;
  alertedAtSource: AlertedAtSource;
  alertNotificationId: number | null;
  alertFdv: number | null;
  alertFdvObservedAt: string | null;
  alertFdvSource: AlertFdvSource;
  alertFdvFreshnessSeconds: number | null;
  latestFdv: number | null;
  latestFdvObservedAt: string | null;
  latestFdvAgeSeconds: number | null;
  firstObservedFdv: number | null;
  firstObservedAt: string | null;
  minutesFromFirstObservedToAlert: number | null;
  metricCount: number;
  fdvMetricCount: number;
  windows: Record<string, WindowReport>;
  notes: string[];
} | {
  status: "not_found";
  mode: "read_only_metric_window_report";
  readOnly: true;
  willWrite: false;
  willFetch: false;
  willSendTelegram: false;
  mint: string;
  entryAt: null;
  entryAtSource: null;
  reportGeneratedAt: string;
  evaluationAt: string;
  alertedAt: null;
  alertedAtSource: "unavailable";
  alertNotificationId: null;
  alertFdv: null;
  alertFdvObservedAt: null;
  alertFdvSource: "unavailable";
  alertFdvFreshnessSeconds: null;
  latestFdv: null;
  latestFdvObservedAt: null;
  latestFdvAgeSeconds: null;
  firstObservedFdv: null;
  firstObservedAt: null;
  minutesFromFirstObservedToAlert: null;
  metricCount: 0;
  fdvMetricCount: 0;
  windows: Record<string, never>;
  notes: string[];
};

type JsonObject = Record<string, unknown>;

type MetricSample = {
  observedAt: Date;
  fdv: number | null;
};

type FdvSample = MetricSample & { fdv: number };

type AlertedAtResolution = {
  alertedAt: Date;
  entryAtSource: EntryAtSource;
  alertedAtSource: AlertedAtSource;
  alertNotificationId: number | null;
};

const DEFAULT_WINDOWS = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720, 1440];
const ALERT_FDV_LOOKAROUND_MS = 5 * 60 * 1000;

function printUsageAndExit(message?: string, exitCode = 1): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metrics:window-report -- --mint <MINT> [--entryAt <ISO>] [--windows 30,60,90,120,180,240,300,360,480,600,720,1440]",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function readRequiredArg(
  input: Partial<MetricsWindowReportArgs>,
  key: keyof Pick<MetricsWindowReportArgs, "mint">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseDateArg(value: string, key: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    printUsageAndExit(`Invalid ISO datetime for ${key}: ${value}`);
  }
  return parsed;
}

function parseWindowsArg(value: string, key: string): number[] {
  const windows = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part));

  if (
    windows.length === 0 ||
    windows.some((windowMinutes) => !Number.isInteger(windowMinutes) || windowMinutes <= 0)
  ) {
    printUsageAndExit(`Invalid comma-separated minute list for ${key}: ${value}`);
  }

  return [...new Set(windows)].sort((left, right) => left - right);
}

function parseArgs(argv: string[]): MetricsWindowReportArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsageAndExit(undefined, 0);
  }

  const out: Partial<MetricsWindowReportArgs> = {
    windows: DEFAULT_WINDOWS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = value;
        break;
      case "--entryAt":
        out.entryAt = parseDateArg(value, key);
        break;
      case "--windows":
        out.windows = parseWindowsArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return {
    mint: readRequiredArg(out, "mint"),
    entryAt: out.entryAt,
    windows: out.windows ?? DEFAULT_WINDOWS,
  };
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, key: string): JsonObject | null {
  if (!isRecord(value)) return null;
  const child = value[key];
  return isRecord(child) ? child : null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? value : null;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function readCandidateNumber(value: JsonObject | null, keys: string[]): number | null {
  if (value === null) return null;

  for (const key of keys) {
    const parsed = readFiniteNumber(value[key]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function extractFdvUsd(rawJson: unknown): number | null {
  if (!isRecord(rawJson)) return null;

  const token = readRecord(rawJson, "token");
  const topPool = readRecord(rawJson, "topPool");

  return (
    readCandidateNumber(token, ["fdvUsd", "fdv_usd"]) ??
    readCandidateNumber(topPool, ["fdvUsd", "fdv_usd"]) ??
    readCandidateNumber(rawJson, ["fdvUsd", "fdv_usd"])
  );
}

function readFirstSeenDetectedAt(entrySnapshot: unknown): Date | null {
  const firstSeenSourceSnapshot = readRecord(entrySnapshot, "firstSeenSourceSnapshot");
  if (firstSeenSourceSnapshot === null) return null;

  const detectedAt = firstSeenSourceSnapshot.detectedAt;
  if (typeof detectedAt !== "string") return null;

  const parsed = new Date(detectedAt);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveAlertedAt(input: {
  cliEntryAt?: Date;
  entrySnapshot: unknown;
  importedAt: Date;
  createdAt: Date;
  sentNotification: { id: number; sentAt: Date } | null;
  capturedNotification: { id: number; capturedAt: Date } | null;
}): AlertedAtResolution {
  if (input.cliEntryAt) {
    return {
      alertedAt: input.cliEntryAt,
      entryAtSource: "cli",
      alertedAtSource: "cli_entryAt",
      alertNotificationId: null,
    };
  }

  if (input.sentNotification) {
    return {
      alertedAt: input.sentNotification.sentAt,
      entryAtSource: "notification.sentAt",
      alertedAtSource: "notification_sent_at",
      alertNotificationId: input.sentNotification.id,
    };
  }

  if (input.capturedNotification) {
    return {
      alertedAt: input.capturedNotification.capturedAt,
      entryAtSource: "notification.capturedAt",
      alertedAtSource: "notification_captured_at",
      alertNotificationId: input.capturedNotification.id,
    };
  }

  const firstSeenDetectedAt = readFirstSeenDetectedAt(input.entrySnapshot);
  if (firstSeenDetectedAt) {
    return {
      alertedAt: firstSeenDetectedAt,
      entryAtSource: "firstSeenSourceSnapshot.detectedAt",
      alertedAtSource: "first_seen_detected_at",
      alertNotificationId: null,
    };
  }

  if (input.importedAt) {
    return {
      alertedAt: input.importedAt,
      entryAtSource: "importedAt",
      alertedAtSource: "token_imported_at",
      alertNotificationId: null,
    };
  }

  return {
    alertedAt: input.createdAt,
    entryAtSource: "createdAt",
    alertedAtSource: "token_created_at",
    alertNotificationId: null,
  };
}

function formatWindowKey(windowMinutes: number): string {
  if (windowMinutes >= 120 && windowMinutes % 60 === 0) {
    return `${windowMinutes / 60}h`;
  }

  return `${windowMinutes}m`;
}

function secondsBetween(left: Date, right: Date): number {
  return Math.abs(left.getTime() - right.getTime()) / 1000;
}

function minutesBetween(from: Date, to: Date): number | null {
  const minutes = (to.getTime() - from.getTime()) / (60 * 1000);
  return minutes >= 0 ? minutes : null;
}

function getFdvSamples(samples: MetricSample[]): FdvSample[] {
  return samples.filter((sample): sample is FdvSample => sample.fdv !== null);
}

function findAlertFdv(
  fdvSamples: FdvSample[],
  alertedAt: Date,
): {
  alertFdv: number | null;
  alertFdvObservedAt: Date | null;
  alertFdvSource: AlertFdvSource;
  alertFdvFreshnessSeconds: number | null;
} {
  const lowerBound = new Date(alertedAt.getTime() - ALERT_FDV_LOOKAROUND_MS);
  const upperBound = new Date(alertedAt.getTime() + ALERT_FDV_LOOKAROUND_MS);
  const before = [...fdvSamples]
    .filter((sample) => sample.observedAt <= alertedAt && sample.observedAt >= lowerBound)
    .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0];

  if (before) {
    return {
      alertFdv: before.fdv,
      alertFdvObservedAt: before.observedAt,
      alertFdvSource: "metric_before_alert",
      alertFdvFreshnessSeconds: secondsBetween(before.observedAt, alertedAt),
    };
  }

  const after = fdvSamples
    .filter((sample) => sample.observedAt >= alertedAt && sample.observedAt <= upperBound)
    .sort((left, right) => left.observedAt.getTime() - right.observedAt.getTime())[0];

  if (after) {
    return {
      alertFdv: after.fdv,
      alertFdvObservedAt: after.observedAt,
      alertFdvSource: "metric_after_alert",
      alertFdvFreshnessSeconds: secondsBetween(after.observedAt, alertedAt),
    };
  }

  return {
    alertFdv: null,
    alertFdvObservedAt: null,
    alertFdvSource: "unavailable",
    alertFdvFreshnessSeconds: null,
  };
}

function findLatestFdv(
  fdvSamples: FdvSample[],
  evaluationAt: Date,
): {
  latestFdv: number | null;
  latestFdvObservedAt: Date | null;
  latestFdvAgeSeconds: number | null;
} {
  const latest = [...fdvSamples]
    .filter((sample) => sample.observedAt <= evaluationAt)
    .sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())[0];

  if (!latest) {
    return {
      latestFdv: null,
      latestFdvObservedAt: null,
      latestFdvAgeSeconds: null,
    };
  }

  return {
    latestFdv: latest.fdv,
    latestFdvObservedAt: latest.observedAt,
    latestFdvAgeSeconds: (evaluationAt.getTime() - latest.observedAt.getTime()) / 1000,
  };
}

function getFdvSampleCoverageLabel(fdvSampleCount: number): FdvSampleCoverageLabel {
  if (fdvSampleCount === 0) return "no_data";
  if (fdvSampleCount === 1) return "thin";
  if (fdvSampleCount < 4) return "partial";
  return "usable";
}

function getOutcomeLabel(input: {
  alertFdv: number | null;
  fdvSampleCount: number;
  peakFdv: number | null;
  peakMultipleFromAlert: number | null;
}): OutcomeLabel {
  if (
    input.alertFdv === null ||
    input.fdvSampleCount === 0 ||
    input.peakFdv === null ||
    input.peakMultipleFromAlert === null
  ) {
    return "no_data";
  }

  if (input.peakMultipleFromAlert < 1.5) return "flat";
  if (input.peakMultipleFromAlert < 3) return "small_win";
  if (input.peakMultipleFromAlert < 10) return "hit";
  return "big_hit";
}

function getNoDataReasons(input: {
  outcomeLabel: OutcomeLabel;
  alertFdv: number | null;
  fdvSampleCount: number;
  peakFdv: number | null;
  peakMultipleFromAlert: number | null;
}): NoDataReason[] {
  if (input.outcomeLabel !== "no_data") {
    return [];
  }

  const reasons: NoDataReason[] = [];
  if (input.alertFdv === null) reasons.push("no_alert_anchor_near_entry");
  if (input.fdvSampleCount === 0) reasons.push("no_fdv_samples_in_window");
  if (input.peakFdv === null) reasons.push("no_peak_fdv");
  if (input.peakMultipleFromAlert === null) reasons.push("no_peak_multiple");
  return reasons;
}

function buildWindowReport(
  samples: MetricSample[],
  alertedAt: Date,
  evaluationAt: Date,
  windowMinutes: number,
  alertFdv: number | null,
  latestFdv: number | null,
): WindowReport {
  const windowEnd = new Date(alertedAt.getTime() + windowMinutes * 60 * 1000);
  const effectiveWindowEnd = new Date(Math.min(windowEnd.getTime(), evaluationAt.getTime()));
  const inWindow = samples.filter(
    (sample) => sample.observedAt >= alertedAt && sample.observedAt <= effectiveWindowEnd,
  );
  const fdvSamples = getFdvSamples(inWindow);
  const firstObservedFdv = fdvSamples[0]?.fdv ?? null;
  const fdvFirstObservedAt = fdvSamples[0]?.observedAt ?? null;
  const fdvLastObservedAt = fdvSamples[fdvSamples.length - 1]?.observedAt ?? null;
  let peakSample: FdvSample | null = null;

  for (const sample of fdvSamples) {
    if (peakSample === null || sample.fdv > peakSample.fdv) {
      peakSample = sample;
    }
  }

  const peakMultipleFromAlert =
    peakSample && alertFdv !== null && alertFdv > 0 ? peakSample.fdv / alertFdv : null;
  const timeToPeakMinutes =
    peakSample ? minutesBetween(alertedAt, peakSample.observedAt) : null;
  const drawdownFromPeak =
    peakSample && latestFdv !== null && peakSample.fdv > 0
      ? Math.max(0, (peakSample.fdv - latestFdv) / peakSample.fdv)
      : null;
  const peakFdv = peakSample?.fdv ?? null;
  const outcomeLabel = getOutcomeLabel({
    alertFdv,
    fdvSampleCount: fdvSamples.length,
    peakFdv,
    peakMultipleFromAlert,
  });
  const fdvObservedSpanMinutes =
    fdvFirstObservedAt && fdvLastObservedAt && fdvSamples.length >= 2
      ? (fdvLastObservedAt.getTime() - fdvFirstObservedAt.getTime()) / (60 * 1000)
      : null;
  const isWindowComplete = evaluationAt >= windowEnd;

  return {
    sampleCount: inWindow.length,
    fdvSampleCount: fdvSamples.length,
    peakFdv,
    peakObservedAt: peakSample?.observedAt.toISOString() ?? null,
    firstObservedFdv,
    peakMultipleFromFirstObserved:
      peakSample && firstObservedFdv && firstObservedFdv > 0
        ? peakSample.fdv / firstObservedFdv
        : null,
    windowMinutes,
    windowStartAt: alertedAt.toISOString(),
    windowEndAt: windowEnd.toISOString(),
    isWindowComplete,
    outcomeIsProvisional: !isWindowComplete,
    fdvFirstObservedAt: fdvFirstObservedAt?.toISOString() ?? null,
    fdvLastObservedAt: fdvLastObservedAt?.toISOString() ?? null,
    fdvObservedSpanMinutes,
    fdvSampleCoverageLabel: getFdvSampleCoverageLabel(fdvSamples.length),
    peakMultipleFromAlert,
    timeToPeakMinutes,
    drawdownFromPeak,
    outcomeLabel,
    noDataReasons: getNoDataReasons({
      outcomeLabel,
      alertFdv,
      fdvSampleCount: fdvSamples.length,
      peakFdv,
      peakMultipleFromAlert,
    }),
    hasAlertFdvAnchor: alertFdv !== null,
    hasWindowFdvSamples: fdvSamples.length > 0,
  };
}

export async function buildMetricsWindowReport(args: MetricsWindowReportArgs): Promise<MetricsWindowReportOutput> {
  const token = await db.token.findUnique({
    where: {
      mint: args.mint,
    },
    select: {
      id: true,
      mint: true,
      importedAt: true,
      createdAt: true,
      entrySnapshot: true,
      metrics: {
        orderBy: [
          { observedAt: "asc" },
          { id: "asc" },
        ],
        select: {
          observedAt: true,
          rawJson: true,
        },
      },
    },
  });
  const reportGeneratedAt = new Date();
  const evaluationAt = reportGeneratedAt;

  if (token === null) {
    return {
      status: "not_found",
      mode: "read_only_metric_window_report",
      readOnly: true,
      willWrite: false,
      willFetch: false,
      willSendTelegram: false,
      mint: args.mint,
      entryAt: null,
      entryAtSource: null,
      reportGeneratedAt: reportGeneratedAt.toISOString(),
      evaluationAt: evaluationAt.toISOString(),
      alertedAt: null,
      alertedAtSource: "unavailable",
      alertNotificationId: null,
      alertFdv: null,
      alertFdvObservedAt: null,
      alertFdvSource: "unavailable",
      alertFdvFreshnessSeconds: null,
      latestFdv: null,
      latestFdvObservedAt: null,
      latestFdvAgeSeconds: null,
      firstObservedFdv: null,
      firstObservedAt: null,
      minutesFromFirstObservedToAlert: null,
      metricCount: 0,
      fdvMetricCount: 0,
      windows: {},
      notes: [
        "token not found; no Metric history was evaluated",
        "peakFdv24h is computed from observed Metric history, not a single 24h-later snapshot",
      ],
    };
  }

  const [sentNotification, capturedNotification] = await Promise.all([
    db.notification.findFirst({
      where: {
        tokenId: token.id,
        status: "sent",
        sentAt: { not: null },
      },
      orderBy: [
        { sentAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        sentAt: true,
      },
    }),
    db.notification.findFirst({
      where: {
        tokenId: token.id,
        status: "captured",
        capturedAt: { not: null },
      },
      orderBy: [
        { capturedAt: "asc" },
        { id: "asc" },
      ],
      select: {
        id: true,
        capturedAt: true,
      },
    }),
  ]);
  const { alertedAt, entryAtSource, alertedAtSource, alertNotificationId } = resolveAlertedAt({
    cliEntryAt: args.entryAt,
    entrySnapshot: token.entrySnapshot,
    importedAt: token.importedAt,
    createdAt: token.createdAt,
    sentNotification: sentNotification && sentNotification.sentAt
      ? { id: sentNotification.id, sentAt: sentNotification.sentAt }
      : null,
    capturedNotification: capturedNotification && capturedNotification.capturedAt
      ? { id: capturedNotification.id, capturedAt: capturedNotification.capturedAt }
      : null,
  });
  const samples = token.metrics.map((metric) => ({
    observedAt: metric.observedAt,
    fdv: extractFdvUsd(metric.rawJson),
  }));
  const fdvSamples = getFdvSamples(samples);
  const alertFdvResult = findAlertFdv(fdvSamples, alertedAt);
  const latestFdvResult = findLatestFdv(fdvSamples, evaluationAt);
  const firstObserved = fdvSamples[0] ?? null;
  const windows = Object.fromEntries(
    args.windows.map((windowMinutes) => [
      formatWindowKey(windowMinutes),
      buildWindowReport(
        samples,
        alertedAt,
        evaluationAt,
        windowMinutes,
        alertFdvResult.alertFdv,
        latestFdvResult.latestFdv,
      ),
    ]),
  );

  return {
    status: "ok",
    mode: "read_only_metric_window_report",
    readOnly: true,
    willWrite: false,
    willFetch: false,
    willSendTelegram: false,
    mint: token.mint,
    entryAt: alertedAt.toISOString(),
    entryAtSource,
    reportGeneratedAt: reportGeneratedAt.toISOString(),
    evaluationAt: evaluationAt.toISOString(),
    alertedAt: alertedAt.toISOString(),
    alertedAtSource,
    alertNotificationId,
    alertFdv: alertFdvResult.alertFdv,
    alertFdvObservedAt: alertFdvResult.alertFdvObservedAt?.toISOString() ?? null,
    alertFdvSource: alertFdvResult.alertFdvSource,
    alertFdvFreshnessSeconds: alertFdvResult.alertFdvFreshnessSeconds,
    latestFdv: latestFdvResult.latestFdv,
    latestFdvObservedAt: latestFdvResult.latestFdvObservedAt?.toISOString() ?? null,
    latestFdvAgeSeconds: latestFdvResult.latestFdvAgeSeconds,
    firstObservedFdv: firstObserved?.fdv ?? null,
    firstObservedAt: firstObserved?.observedAt.toISOString() ?? null,
    minutesFromFirstObservedToAlert: firstObserved
      ? minutesBetween(firstObserved.observedAt, alertedAt)
      : null,
    metricCount: samples.length,
    fdvMetricCount: fdvSamples.length,
    windows,
    notes: [
      "peakFdv30m through peakFdv24h are computed as max(fdv) over observed Metric history in each window",
      "peakFdv24h is computed from observed Metric history, not a single 24h-later snapshot",
      "provider payload fields are only inspected internally for fdvUsd/fdv_usd candidates and are not printed",
      "outcomeLabel is read-only notification and scoring verification context and is not persisted",
    ],
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const report = await buildMetricsWindowReport(args);
  console.log(JSON.stringify(report, null, 2));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
