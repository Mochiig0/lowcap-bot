import "dotenv/config";

import { db } from "./db.js";
import { buildTargetText } from "../scoring/normalize.js";

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
  const hasTextFieldUpdate =
    args.name !== undefined ||
    args.symbol !== undefined ||
    args.desc !== undefined;
  const hasSourceUpdate = args.source !== undefined;

  if (!hasTextFieldUpdate && !hasSourceUpdate) {
    printUsageAndExit(
      "No fields to update: provide at least one of --name, --symbol, --desc, or --source",
    );
  }

  const existing = await db.token.findUnique({
    where: { mint: args.mint },
    select: {
      id: true,
      mint: true,
      name: true,
      symbol: true,
      description: true,
      source: true,
      importedAt: true,
    },
  });

  if (!existing) {
    printUsageAndExit(`Token not found for mint: ${args.mint}`);
  }

  const enrichedAt = new Date();
  const data: {
    name?: string;
    symbol?: string;
    description?: string;
    source?: string | null;
    normalizedText?: string;
    enrichedAt: Date;
    metadataStatus?: "partial" | "enriched";
  } = {
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.symbol !== undefined ? { symbol: args.symbol } : {}),
    ...(args.desc !== undefined ? { description: args.desc } : {}),
    ...(hasSourceUpdate ? { source: args.source } : { source: existing.source }),
    enrichedAt,
  };

  if (hasTextFieldUpdate) {
    const nextName = args.name ?? existing.name ?? undefined;
    const nextSymbol = args.symbol ?? existing.symbol ?? undefined;
    const nextDescription = args.desc ?? existing.description ?? undefined;

    if (!nextName) {
      printUsageAndExit(
        `Token is not ready for enrich: name is required for mint ${args.mint}`,
      );
    }

    if (!nextSymbol) {
      printUsageAndExit(
        `Token is not ready for enrich: symbol is required for mint ${args.mint}`,
      );
    }

    data.metadataStatus = computeMetadataStatus({
      name: nextName,
      symbol: nextSymbol,
      description: nextDescription,
    });
    data.normalizedText = buildTargetText({
      name: nextName,
      symbol: nextSymbol,
      description: nextDescription,
    });
  }

  const token = await db.token.update({
    where: { mint: args.mint },
    data,
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
