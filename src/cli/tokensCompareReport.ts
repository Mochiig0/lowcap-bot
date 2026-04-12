import "dotenv/config";

import { db } from "./db.js";

type TokensCompareReportArgs = {
  rank?: string;
  source?: string;
  metadataStatus?: string;
  limit: number;
};

type EntrySnapshotView = {
  scoreRank: string | null;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm tokens:compare-report -- [--rank <RANK>] [--source <SOURCE>] [--metadataStatus <STATUS>] [--limit 20]",
    ].join("\n"),
  );
  process.exit(1);
}

function parseLimitArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): TokensCompareReportArgs {
  const out: Partial<TokensCompareReportArgs> = {
    limit: 20,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--rank":
        out.rank = value === "" ? undefined : value;
        break;
      case "--source":
        out.source = value === "" ? undefined : value;
        break;
      case "--metadataStatus":
        out.metadataStatus = value === "" ? undefined : value;
        break;
      case "--limit":
        out.limit = parseLimitArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out as TokensCompareReportArgs;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function extractEntrySnapshotView(entrySnapshot: unknown): EntrySnapshotView {
  if (!isRecord(entrySnapshot)) {
    return {
      scoreRank: null,
    };
  }

  return {
    scoreRank: readOptionalString(entrySnapshot.scoreRank),
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const tokens = await db.token.findMany({
    where: {
      ...(args.rank ? { scoreRank: args.rank } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.metadataStatus ? { metadataStatus: args.metadataStatus } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: args.limit,
    select: {
      mint: true,
      name: true,
      symbol: true,
      metadataStatus: true,
      scoreRank: true,
      scoreTotal: true,
      entrySnapshot: true,
      metrics: {
        orderBy: [
          { observedAt: "desc" },
          { id: "desc" },
        ],
        take: 1,
        select: {
          observedAt: true,
          peakFdv24h: true,
          maxMultiple15m: true,
          timeToPeakMinutes: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        count: tokens.length,
        filters: {
          rank: args.rank ?? null,
          source: args.source ?? null,
          metadataStatus: args.metadataStatus ?? null,
          limit: args.limit,
        },
        items: tokens.map((token) => {
          const entrySnapshot = extractEntrySnapshotView(token.entrySnapshot);
          const latestMetric = token.metrics[0] ?? null;

          return {
            mint: token.mint,
            name: token.name,
            symbol: token.symbol,
            metadataStatus: token.metadataStatus,
            entryScoreRank: entrySnapshot.scoreRank,
            currentScoreRank: token.scoreRank,
            currentScoreTotal: token.scoreTotal,
            latestMetricObservedAt: latestMetric
              ? latestMetric.observedAt.toISOString()
              : null,
            latestPeakFdv24h: latestMetric?.peakFdv24h ?? null,
            latestMaxMultiple15m: latestMetric?.maxMultiple15m ?? null,
            latestTimeToPeakMinutes: latestMetric?.timeToPeakMinutes ?? null,
          };
        }),
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
