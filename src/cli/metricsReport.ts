import "dotenv/config";

import { db } from "../db.js";

type MetricsReportArgs = {
  mint?: string;
  tokenId?: number;
  source?: string;
  rank?: string;
  limit: number;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm metrics:report -- [--mint <MINT>] [--tokenId <ID>] [--source <SOURCE>] [--rank <RANK>] [--limit 20]",
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

function parseIdArg(value: string, key: string): number {
  if (value === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): MetricsReportArgs {
  const out: Partial<MetricsReportArgs> = {
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
      case "--mint":
        out.mint = value === "" ? undefined : value;
        break;
      case "--tokenId":
        out.tokenId = parseIdArg(value, key);
        break;
      case "--source":
        out.source = value === "" ? undefined : value;
        break;
      case "--rank":
        out.rank = value === "" ? undefined : value;
        break;
      case "--limit":
        out.limit = parseLimitArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return out as MetricsReportArgs;
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const metrics = await db.metric.findMany({
    where: {
      ...(args.tokenId !== undefined ? { tokenId: args.tokenId } : {}),
      ...(args.source ? { source: args.source } : {}),
      ...(args.mint || args.rank
        ? {
            token: {
              ...(args.mint ? { mint: args.mint } : {}),
              ...(args.rank ? { scoreRank: args.rank } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ observedAt: "desc" }, { id: "desc" }],
    take: args.limit,
    include: {
      token: {
        select: {
          mint: true,
          name: true,
          symbol: true,
          scoreRank: true,
          scoreTotal: true,
        },
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        count: metrics.length,
        filters: {
          mint: args.mint ?? null,
          tokenId: args.tokenId ?? null,
          source: args.source ?? null,
          rank: args.rank ?? null,
          limit: args.limit,
        },
        items: metrics.map((metric) => ({
          id: metric.id,
          token: metric.token,
          source: metric.source ?? null,
          observedAt: metric.observedAt.toISOString(),
          maxMultiple15m: metric.maxMultiple15m,
          peakFdv24h: metric.peakFdv24h,
          volume24h: metric.volume24h,
          peakFdv7d: metric.peakFdv7d,
          volume7d: metric.volume7d,
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
