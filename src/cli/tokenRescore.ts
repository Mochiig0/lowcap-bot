import "dotenv/config";

import { db } from "./db.js";
import { checkHardReject } from "../scoring/hardReject.js";
import { buildTargetText } from "../scoring/normalize.js";
import { scoreText } from "../scoring/score.js";

type TokenRescoreArgs = {
  mint: string;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm token:rescore -- --mint <MINT>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(input: Partial<TokenRescoreArgs>, key: "mint"): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): TokenRescoreArgs {
  const out: Partial<TokenRescoreArgs> = {};

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

  const existing = await db.token.findUnique({
    where: { mint: args.mint },
    select: {
      mint: true,
      name: true,
      symbol: true,
      description: true,
      rescoredAt: true,
    },
  });

  if (!existing) {
    printUsageAndExit(`Token not found for mint: ${args.mint}`);
  }

  if (!existing.name || !existing.symbol) {
    printUsageAndExit(
      `Token is not ready for rescore: name and symbol are required for mint ${args.mint}`,
    );
  }

  const normalizedText = buildTargetText({
    name: existing.name,
    symbol: existing.symbol,
    description: existing.description ?? undefined,
  });
  const hardReject = checkHardReject(normalizedText);
  const score = await scoreText(normalizedText);
  const rescoredAt = new Date();

  const token = await db.token.update({
    where: { mint: args.mint },
    data: {
      normalizedText,
      hardRejected: hardReject.rejected,
      hardRejectReason: hardReject.reason,
      scoreTotal: score.total,
      scoreRank: score.rank,
      scoreBreakdown: score.breakdown,
      rescoredAt,
    },
    select: {
      mint: true,
      normalizedText: true,
      hardRejected: true,
      hardRejectReason: true,
      scoreTotal: true,
      scoreRank: true,
      scoreBreakdown: true,
      rescoredAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        normalizedText: token.normalizedText,
        hardRejected: token.hardRejected,
        hardRejectReason: token.hardRejectReason,
        scoreTotal: token.scoreTotal,
        scoreRank: token.scoreRank,
        scoreBreakdown: token.scoreBreakdown,
        rescoredAt: token.rescoredAt?.toISOString() ?? null,
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
