import "dotenv/config";

import { db } from "./db.js";

type ImportMintArgs = {
  mint: string;
  source?: string;
};

type EntrySnapshot = {
  stage: "mint_only";
  capturedAt: string;
  name: null;
  symbol: null;
  description: null;
  dev: null;
  links: {
    website: null;
    x: null;
    telegram: null;
  };
  scoreRank: null;
  scoreTotal: null;
  scoreBreakdown: null;
  hardRejected: null;
  price: null;
  fdv: null;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import:mint -- --mint <MINT> [--source <SOURCE>]",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(input: Partial<ImportMintArgs>, key: "mint"): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): ImportMintArgs {
  const out: Partial<ImportMintArgs> = {};

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
    source: out.source,
  };
}

function buildEntrySnapshot(capturedAt: string): EntrySnapshot {
  return {
    stage: "mint_only",
    capturedAt,
    name: null,
    symbol: null,
    description: null,
    dev: null,
    links: {
      website: null,
      x: null,
      telegram: null,
    },
    scoreRank: null,
    scoreTotal: null,
    scoreBreakdown: null,
    hardRejected: null,
    price: null,
    fdv: null,
  };
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  const existing = await db.token.findUnique({
    where: { mint: args.mint },
    select: {
      mint: true,
      metadataStatus: true,
      importedAt: true,
    },
  });

  if (existing) {
    console.log(
      JSON.stringify(
        {
          mint: existing.mint,
          metadataStatus: existing.metadataStatus,
          importedAt: existing.importedAt.toISOString(),
          created: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const importedAt = new Date();
  const token = await db.token.create({
    data: {
      mint: args.mint,
      source: args.source,
      importedAt,
      metadataStatus: "mint_only",
      entrySnapshot: buildEntrySnapshot(importedAt.toISOString()),
    },
    select: {
      mint: true,
      metadataStatus: true,
      importedAt: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        mint: token.mint,
        metadataStatus: token.metadataStatus,
        importedAt: token.importedAt.toISOString(),
        created: true,
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
