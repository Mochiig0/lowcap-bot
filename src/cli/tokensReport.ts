import "dotenv/config";

import { db } from "./db.js";

type TokensReportArgs = {
  rank?: string;
  source?: string;
  metadataStatus?: "mint_only" | "partial" | "enriched";
  hasMetrics?: boolean;
  hardRejected?: boolean;
  createdAfter?: Date;
  limit: number;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm tokens:report -- [--rank <RANK>] [--source <SOURCE>] [--metadataStatus <STATUS>] [--hasMetrics <true|false>] [--hardRejected <true|false>] [--createdAfter <ISO8601>] [--limit 20]",
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

function parseBooleanArg(value: string, key: string): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  printUsageAndExit(`Invalid boolean for ${key}: ${value}`);
}

function parseDateArg(value: string, key: string): Date {
  if (value === "") {
    printUsageAndExit(`Invalid ISO8601 date for ${key}: ${value}`);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    printUsageAndExit(`Invalid ISO8601 date for ${key}: ${value}`);
  }

  return parsed;
}

function parseMetadataStatusArg(
  value: string,
  key: string,
): "mint_only" | "partial" | "enriched" {
  if (value === "mint_only" || value === "partial" || value === "enriched") {
    return value;
  }

  printUsageAndExit(`Invalid metadataStatus for ${key}: ${value}`);
}

function parseArgs(argv: string[]): TokensReportArgs {
  const out: Partial<TokensReportArgs> = {
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
        out.metadataStatus = parseMetadataStatusArg(value, key);
        break;
      case "--hasMetrics":
        out.hasMetrics = parseBooleanArg(value, key);
        break;
      case "--hardRejected":
        out.hardRejected = parseBooleanArg(value, key);
        break;
      case "--createdAfter":
        out.createdAfter = parseDateArg(value, key);
        break;
      case "--limit":
        out.limit = parseLimitArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out as TokensReportArgs;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const tokens = await db.token.findMany({
    where: {
      ...(args.rank ? { scoreRank: args.rank } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.metadataStatus ? { metadataStatus: args.metadataStatus } : {}),
      ...(args.hasMetrics !== undefined
        ? { metrics: args.hasMetrics ? { some: {} } : { none: {} } }
        : {}),
      ...(args.hardRejected !== undefined
        ? { hardRejected: args.hardRejected }
        : {}),
      ...(args.createdAfter
        ? { createdAt: { gte: args.createdAfter } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: args.limit,
    include: {
      dev: {
        select: {
          wallet: true,
        },
      },
      metrics: {
        orderBy: [
          { observedAt: "desc" },
          { id: "desc" },
        ],
        take: 1,
        select: {
          observedAt: true,
        },
      },
      _count: {
        select: {
          metrics: true,
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
          hasMetrics: args.hasMetrics ?? null,
          hardRejected: args.hardRejected ?? null,
          metadataStatus: args.metadataStatus ?? null,
          createdAfter: args.createdAfter?.toISOString() ?? null,
          limit: args.limit,
        },
        items: tokens.map((token) => ({
          mint: token.mint,
          name: token.name,
          symbol: token.symbol,
          scoreRank: token.scoreRank,
          scoreTotal: token.scoreTotal,
          hardRejected: token.hardRejected,
          hardRejectReason: token.hardRejectReason,
          metadataStatus: token.metadataStatus,
          source: token.source ?? null,
          metricsCount: token._count.metrics,
          latestMetricObservedAt: token.metrics[0]
            ? token.metrics[0].observedAt.toISOString()
            : null,
          createdAt: token.createdAt.toISOString(),
          updatedAt: token.updatedAt.toISOString(),
          enrichedAt: token.enrichedAt?.toISOString() ?? null,
          rescoredAt: token.rescoredAt?.toISOString() ?? null,
          devWallet: token.dev?.wallet ?? null,
        })),
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
