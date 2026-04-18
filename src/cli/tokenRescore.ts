import "dotenv/config";

import { db } from "./db.js";
import { rescoreTokenByMint } from "./tokenRescoreShared.js";

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

  let token;
  try {
    token = await rescoreTokenByMint(args.mint);
  } catch (error) {
    printUsageAndExit(error instanceof Error ? error.message : String(error));
  }

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
        rescoredAt: token.rescoredAt,
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
