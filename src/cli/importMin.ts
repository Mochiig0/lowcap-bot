import "dotenv/config";

import { spawn } from "node:child_process";

type ImportMinArgs = {
  mint: string;
  name: string;
  symbol: string;
  source?: string;
  desc?: string;
  dev?: string;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import:min -- --mint <MINT> --name <NAME> --symbol <SYM> [--source <SOURCE>] [--desc <TEXT>] [--dev <WALLET>]",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<ImportMinArgs>,
  key: keyof Pick<ImportMinArgs, "mint" | "name" | "symbol">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): ImportMinArgs {
  const out: Partial<ImportMinArgs> = {};

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
      case "--source":
        out.source = value === "" ? undefined : value;
        break;
      case "--desc":
        out.desc = value === "" ? undefined : value;
        break;
      case "--dev":
        out.dev = value === "" ? undefined : value;
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
    source: out.source,
    desc: out.desc,
    dev: out.dev,
  };
}

function buildImportArgs(args: ImportMinArgs): string[] {
  return [
    "--mint",
    args.mint,
    "--name",
    args.name,
    "--symbol",
    args.symbol,
    ...(args.source ? ["--source", args.source] : []),
    ...(args.desc ? ["--desc", args.desc] : []),
    ...(args.dev ? ["--dev", args.dev] : []),
  ];
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/import.ts",
        ...buildImportArgs(args),
      ],
      {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      },
    );

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`import:min child exited with code ${code ?? "null"}`));
    });
  });
}

run().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }

  process.exitCode = 1;
});
