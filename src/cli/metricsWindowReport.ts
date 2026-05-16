import "dotenv/config";

import { db } from "./db.js";

type EntryAtSource =
  | "firstSeenSourceSnapshot.detectedAt"
  | "importedAt"
  | "createdAt"
  | "cli";

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

const DEFAULT_WINDOWS = [30, 60, 1440];

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metrics:window-report -- --mint <MINT> [--entryAt <ISO>] [--windows 30,60,1440]",
    ].join("\n"),
  );
  process.exit(1);
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
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

function resolveEntryAt(input: {
  cliEntryAt?: Date;
  entrySnapshot: unknown;
  importedAt: Date;
  createdAt: Date;
}): { entryAt: Date; entryAtSource: EntryAtSource } {
  if (input.cliEntryAt) {
    return {
      entryAt: input.cliEntryAt,
      entryAtSource: "cli",
    };
  }

  const firstSeenDetectedAt = readFirstSeenDetectedAt(input.entrySnapshot);
  if (firstSeenDetectedAt) {
    return {
      entryAt: firstSeenDetectedAt,
      entryAtSource: "firstSeenSourceSnapshot.detectedAt",
    };
  }

  if (input.importedAt) {
    return {
      entryAt: input.importedAt,
      entryAtSource: "importedAt",
    };
  }

  return {
    entryAt: input.createdAt,
    entryAtSource: "createdAt",
  };
}

function formatWindowKey(windowMinutes: number): string {
  if (windowMinutes % 1440 === 0) {
    return `${windowMinutes / 1440 * 24}h`;
  }

  return `${windowMinutes}m`;
}

function buildWindowReport(
  samples: MetricSample[],
  entryAt: Date,
  windowMinutes: number,
): WindowReport {
  const windowEnd = new Date(entryAt.getTime() + windowMinutes * 60 * 1000);
  const inWindow = samples.filter(
    (sample) => sample.observedAt >= entryAt && sample.observedAt <= windowEnd,
  );
  const fdvSamples = inWindow.filter((sample): sample is MetricSample & { fdv: number } => sample.fdv !== null);
  const firstObservedFdv = fdvSamples[0]?.fdv ?? null;
  let peakSample: (MetricSample & { fdv: number }) | null = null;

  for (const sample of fdvSamples) {
    if (peakSample === null || sample.fdv > peakSample.fdv) {
      peakSample = sample;
    }
  }

  return {
    sampleCount: inWindow.length,
    fdvSampleCount: fdvSamples.length,
    peakFdv: peakSample?.fdv ?? null,
    peakObservedAt: peakSample?.observedAt.toISOString() ?? null,
    firstObservedFdv,
    peakMultipleFromFirstObserved:
      peakSample && firstObservedFdv && firstObservedFdv > 0
        ? peakSample.fdv / firstObservedFdv
        : null,
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
      metricCount: 0,
      fdvMetricCount: 0,
      windows: {},
      notes: [
        "token not found; no Metric history was evaluated",
        "peakFdv24h is computed from observed Metric history, not a single 24h-later snapshot",
      ],
    };
  }

  const { entryAt, entryAtSource } = resolveEntryAt({
    cliEntryAt: args.entryAt,
    entrySnapshot: token.entrySnapshot,
    importedAt: token.importedAt,
    createdAt: token.createdAt,
  });
  const samples = token.metrics.map((metric) => ({
    observedAt: metric.observedAt,
    fdv: extractFdvUsd(metric.rawJson),
  }));
  const windows = Object.fromEntries(
    args.windows.map((windowMinutes) => [
      formatWindowKey(windowMinutes),
      buildWindowReport(samples, entryAt, windowMinutes),
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
    entryAt: entryAt.toISOString(),
    entryAtSource,
    metricCount: samples.length,
    fdvMetricCount: samples.filter((sample) => sample.fdv !== null).length,
    windows,
    notes: [
      "peakFdv30m, peakFdv60m, and peakFdv24h are computed as max(fdv) over observed Metric history in each window",
      "peakFdv24h is computed from observed Metric history, not a single 24h-later snapshot",
      "provider payload fields are only inspected internally for fdvUsd/fdv_usd candidates and are not printed",
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
