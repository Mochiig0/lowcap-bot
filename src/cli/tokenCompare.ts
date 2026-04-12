import "dotenv/config";

import { db } from "./db.js";

type TokenCompareArgs = {
  mint: string;
};

type MetricView = {
  id: number;
  source: string | null;
  observedAt: string;
  launchPrice: number | null;
  peakPrice15m: number | null;
  peakPrice1h: number | null;
  maxMultiple15m: number | null;
  maxMultiple1h: number | null;
  peakFdv24h: number | null;
  volume24h: number | null;
  peakFdv7d: number | null;
  volume7d: number | null;
  timeToPeakMinutes: number | null;
  alertedAt: string | null;
  peakMultipleFromAlert: number | null;
  rawJson: unknown;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm token:compare -- --mint <MINT>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<TokenCompareArgs>,
  key: keyof Pick<TokenCompareArgs, "mint">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): TokenCompareArgs {
  const out: Partial<TokenCompareArgs> = {};

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
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return {
    mint: readRequiredArg(out, "mint"),
  };
}

function toMetricView(metric: {
  id: number;
  source: string | null;
  observedAt: Date;
  launchPrice: number | null;
  peakPrice15m: number | null;
  peakPrice1h: number | null;
  maxMultiple15m: number | null;
  maxMultiple1h: number | null;
  peakFdv24h: number | null;
  volume24h: number | null;
  peakFdv7d: number | null;
  volume7d: number | null;
  timeToPeakMinutes: number | null;
  alertedAt: Date | null;
  peakMultipleFromAlert: number | null;
  rawJson: unknown;
}): MetricView {
  return {
    id: metric.id,
    source: metric.source,
    observedAt: metric.observedAt.toISOString(),
    launchPrice: metric.launchPrice,
    peakPrice15m: metric.peakPrice15m,
    peakPrice1h: metric.peakPrice1h,
    maxMultiple15m: metric.maxMultiple15m,
    maxMultiple1h: metric.maxMultiple1h,
    peakFdv24h: metric.peakFdv24h,
    volume24h: metric.volume24h,
    peakFdv7d: metric.peakFdv7d,
    volume7d: metric.volume7d,
    timeToPeakMinutes: metric.timeToPeakMinutes,
    alertedAt: metric.alertedAt?.toISOString() ?? null,
    peakMultipleFromAlert: metric.peakMultipleFromAlert,
    rawJson: metric.rawJson,
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const token = await db.token.findUnique({
    where: {
      mint: args.mint,
    },
    select: {
      mint: true,
      entrySnapshot: true,
      name: true,
      symbol: true,
      description: true,
      source: true,
      metadataStatus: true,
      hardRejected: true,
      hardRejectReason: true,
      scoreTotal: true,
      scoreRank: true,
      scoreBreakdown: true,
      importedAt: true,
      enrichedAt: true,
      rescoredAt: true,
      metrics: {
        orderBy: [
          { observedAt: "desc" },
          { id: "desc" },
        ],
        take: 3,
        select: {
          id: true,
          source: true,
          observedAt: true,
          launchPrice: true,
          peakPrice15m: true,
          peakPrice1h: true,
          maxMultiple15m: true,
          maxMultiple1h: true,
          peakFdv24h: true,
          volume24h: true,
          peakFdv7d: true,
          volume7d: true,
          timeToPeakMinutes: true,
          alertedAt: true,
          peakMultipleFromAlert: true,
          rawJson: true,
        },
      },
    },
  });

  if (!token) {
    printUsageAndExit(`Token not found for mint: ${args.mint}`);
  }

  const recentMetrics = token.metrics.map(toMetricView);

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        entrySnapshot: token.entrySnapshot,
        currentToken: {
          name: token.name,
          symbol: token.symbol,
          description: token.description,
          source: token.source,
          metadataStatus: token.metadataStatus,
          hardRejected: token.hardRejected,
          hardRejectReason: token.hardRejectReason,
          scoreTotal: token.scoreTotal,
          scoreRank: token.scoreRank,
          scoreBreakdown: token.scoreBreakdown,
          importedAt: token.importedAt.toISOString(),
          enrichedAt: token.enrichedAt?.toISOString() ?? null,
          rescoredAt: token.rescoredAt?.toISOString() ?? null,
        },
        latestMetric: recentMetrics[0] ?? null,
        recentMetrics,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
