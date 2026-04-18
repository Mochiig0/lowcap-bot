import "dotenv/config";

import { db } from "./db.js";
import { enrichTokenByMint } from "./tokenEnrichShared.js";

type TokenEnrichArgs = {
  mint: string;
  name?: string;
  symbol?: string;
  desc?: string;
  source?: string;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm token:enrich -- --mint <MINT> [--name <NAME>] [--symbol <SYMBOL>] [--desc <TEXT>] [--source <SOURCE>]",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(input: Partial<TokenEnrichArgs>, key: "mint"): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): TokenEnrichArgs {
  const out: Partial<TokenEnrichArgs> = {};

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
      case "--name":
        out.name = value;
        break;
      case "--symbol":
        out.symbol = value;
        break;
      case "--desc":
        out.desc = value === "" ? undefined : value;
        break;
      case "--source":
        out.source = value === "" ? undefined : value;
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    i += 1;
  }

  return {
    mint: readRequiredArg(out, "mint"),
    name: out.name,
    symbol: out.symbol,
    desc: out.desc,
    source: out.source,
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  let token;
  try {
    token = await enrichTokenByMint(args.mint, {
      ...(args.name !== undefined ? { name: args.name } : {}),
      ...(args.symbol !== undefined ? { symbol: args.symbol } : {}),
      ...(args.desc !== undefined ? { desc: args.desc } : {}),
      ...(args.source !== undefined ? { source: args.source } : {}),
    });
  } catch (error) {
    printUsageAndExit(error instanceof Error ? error.message : String(error));
  }

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        source: token.source,
        metadataStatus: token.metadataStatus,
        importedAt: token.importedAt,
        enrichedAt: token.enrichedAt,
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
