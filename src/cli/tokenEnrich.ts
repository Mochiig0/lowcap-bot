import "dotenv/config";

import { db } from "./db.js";
import { buildTargetText } from "../scoring/normalize.js";

type TokenEnrichArgs = {
  mint: string;
  name: string;
  symbol: string;
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
      "pnpm token:enrich -- --mint <MINT> --name <NAME> --symbol <SYMBOL> [--desc <TEXT>] [--source <SOURCE>]",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<TokenEnrichArgs>,
  key: keyof Pick<TokenEnrichArgs, "mint" | "name" | "symbol">,
): string {
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
    name: readRequiredArg(out, "name"),
    symbol: readRequiredArg(out, "symbol"),
    desc: out.desc,
    source: out.source,
  };
}

function computeMetadataStatus(params: {
  name: string;
  symbol: string;
  description?: string;
}): "partial" | "enriched" {
  return params.description ? "enriched" : "partial";
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const existing = await db.token.findUnique({
    where: { mint: args.mint },
    select: {
      id: true,
      mint: true,
      description: true,
      source: true,
      importedAt: true,
    },
  });

  if (!existing) {
    printUsageAndExit(`Token not found for mint: ${args.mint}`);
  }

  const enrichedAt = new Date();
  const nextDescription = args.desc ?? existing.description ?? undefined;
  const metadataStatus = computeMetadataStatus({
    name: args.name,
    symbol: args.symbol,
    description: nextDescription,
  });
  const normalizedText = buildTargetText({
    name: args.name,
    symbol: args.symbol,
    description: nextDescription,
  });

  const token = await db.token.update({
    where: { mint: args.mint },
    data: {
      name: args.name,
      symbol: args.symbol,
      description: args.desc,
      source: args.source ?? existing.source,
      normalizedText,
      enrichedAt,
      metadataStatus,
    },
    select: {
      mint: true,
      name: true,
      symbol: true,
      description: true,
      source: true,
      metadataStatus: true,
      importedAt: true,
      enrichedAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        name: token.name,
        symbol: token.symbol,
        description: token.description,
        source: token.source,
        metadataStatus: token.metadataStatus,
        importedAt: token.importedAt.toISOString(),
        enrichedAt: token.enrichedAt?.toISOString() ?? null,
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
