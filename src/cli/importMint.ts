import "dotenv/config";

import { db } from "./db.js";
import { importMint, type ImportMintInput } from "./importMintShared.js";

type ImportMintArgs = ImportMintInput;

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

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const result = await importMint(args);

  console.log(
    JSON.stringify(
      result,
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
