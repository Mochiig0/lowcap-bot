import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { buildHolderSafeSummaryReport } from "../observation/holderSafeSummaryReport.js";

type HolderSafeSummaryReportArgs = {
  file: string;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm holder:safe-summary:report -- --file <PATH>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<HolderSafeSummaryReportArgs>,
  key: keyof HolderSafeSummaryReportArgs,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): HolderSafeSummaryReportArgs {
  const out: Partial<HolderSafeSummaryReportArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key.startsWith("--")) {
      continue;
    }

    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--file":
        out.file = value;
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return {
    file: readRequiredArg(out, "file"),
  };
}

async function readJsonFile(file: string): Promise<unknown> {
  let content: string;
  try {
    content = await readFile(file, "utf-8");
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "UNKNOWN";
    throw new Error(`Unable to read holder safe summary file: ${code}`);
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("Invalid holder safe summary JSON file");
  }
}

export async function runHolderSafeSummaryReportCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const input = await readJsonFile(args.file);
  const result = buildHolderSafeSummaryReport(input);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runHolderSafeSummaryReportCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
