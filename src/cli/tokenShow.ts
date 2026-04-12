import "dotenv/config";

import { db } from "./db.js";

type TokenShowArgs = {
  mint: string;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm token:show -- --mint <MINT>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<TokenShowArgs>,
  key: keyof Pick<TokenShowArgs, "mint">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): TokenShowArgs {
  const out: Partial<TokenShowArgs> = {};

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

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const token = await db.token.findUnique({
    where: {
      mint: args.mint,
    },
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
          id: true,
          observedAt: true,
          source: true,
          maxMultiple15m: true,
          peakFdv24h: true,
          volume24h: true,
          peakFdv7d: true,
          volume7d: true,
        },
      },
      _count: {
        select: {
          metrics: true,
        },
      },
    },
  });

  if (!token) {
    printUsageAndExit(`Token not found for mint: ${args.mint}`);
  }

  const latestMetric = token.metrics[0]
    ? {
        id: token.metrics[0].id,
        observedAt: token.metrics[0].observedAt.toISOString(),
        source: token.metrics[0].source ?? null,
        maxMultiple15m: token.metrics[0].maxMultiple15m,
        peakFdv24h: token.metrics[0].peakFdv24h,
        volume24h: token.metrics[0].volume24h,
        peakFdv7d: token.metrics[0].peakFdv7d,
        volume7d: token.metrics[0].volume7d,
      }
    : null;

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        source: token.source ?? null,
        groupKey: token.groupKey ?? null,
        groupNote: token.groupNote ?? null,
        normalizedText: token.normalizedText,
        hardRejected: token.hardRejected,
        hardRejectReason: token.hardRejectReason,
        scoreRank: token.scoreRank,
        scoreTotal: token.scoreTotal,
        scoreBreakdown: token.scoreBreakdown,
        devWallet: token.dev?.wallet ?? null,
        metricsCount: token._count.metrics,
        latestMetric,
        createdAt: token.createdAt.toISOString(),
        updatedAt: token.updatedAt.toISOString(),
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
