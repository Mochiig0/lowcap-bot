import "dotenv/config";

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type ImportFileArgs = {
  file: string;
};

type ImportPayload = {
  mint: string;
  name: string;
  symbol: string;
  desc?: string;
  dev?: string;
  groupKey?: string;
  groupNote?: string;
  source?: string;
  maxMultiple15m?: number;
  peakFdv24h?: number;
  volume24h?: number;
  peakFdv7d?: number;
  volume7d?: number;
  metricSource?: string;
  observedAt?: string;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import:file -- --file <PATH>",
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): ImportFileArgs {
  const out: Partial<ImportFileArgs> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];

    if (!key.startsWith("--")) continue;
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

    i += 1;
  }

  if (!out.file) {
    printUsageAndExit("--file is required");
  }

  return out as ImportFileArgs;
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    printUsageAndExit("JSON file must contain exactly one object");
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: keyof Pick<ImportPayload, "mint" | "name" | "symbol">,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    printUsageAndExit(`${key} must be a non-empty string`);
  }

  return value;
}

function readOptionalString(
  input: Record<string, unknown>,
  key: keyof Omit<
    ImportPayload,
    | "mint"
    | "name"
    | "symbol"
    | "maxMultiple15m"
    | "peakFdv24h"
    | "volume24h"
    | "peakFdv7d"
    | "volume7d"
  >,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    printUsageAndExit(`${key} must be a string when provided`);
  }

  return value;
}

function readOptionalNumber(
  input: Record<string, unknown>,
  key: keyof Pick<
    ImportPayload,
    | "maxMultiple15m"
    | "peakFdv24h"
    | "volume24h"
    | "peakFdv7d"
    | "volume7d"
  >,
): number | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    printUsageAndExit(`${key} must be a number when provided`);
  }

  return value;
}

function parsePayload(raw: string): ImportPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    printUsageAndExit(
      `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const input = ensureObject(parsed);

  return {
    mint: readRequiredString(input, "mint"),
    name: readRequiredString(input, "name"),
    symbol: readRequiredString(input, "symbol"),
    desc: readOptionalString(input, "desc"),
    dev: readOptionalString(input, "dev"),
    groupKey: readOptionalString(input, "groupKey"),
    groupNote: readOptionalString(input, "groupNote"),
    source: readOptionalString(input, "source"),
    maxMultiple15m: readOptionalNumber(input, "maxMultiple15m"),
    peakFdv24h: readOptionalNumber(input, "peakFdv24h"),
    volume24h: readOptionalNumber(input, "volume24h"),
    peakFdv7d: readOptionalNumber(input, "peakFdv7d"),
    volume7d: readOptionalNumber(input, "volume7d"),
    metricSource: readOptionalString(input, "metricSource"),
    observedAt: readOptionalString(input, "observedAt"),
  };
}

function buildImportArgs(payload: ImportPayload): string[] {
  return [
    "--mint",
    payload.mint,
    "--name",
    payload.name,
    "--symbol",
    payload.symbol,
    ...(payload.desc ? ["--desc", payload.desc] : []),
    ...(payload.dev ? ["--dev", payload.dev] : []),
    ...(payload.groupKey ? ["--groupKey", payload.groupKey] : []),
    ...(payload.groupNote ? ["--groupNote", payload.groupNote] : []),
    ...(payload.source ? ["--source", payload.source] : []),
    ...(payload.maxMultiple15m !== undefined
      ? ["--maxMultiple15m", String(payload.maxMultiple15m)]
      : []),
    ...(payload.peakFdv24h !== undefined
      ? ["--peakFdv24h", String(payload.peakFdv24h)]
      : []),
    ...(payload.volume24h !== undefined
      ? ["--volume24h", String(payload.volume24h)]
      : []),
    ...(payload.peakFdv7d !== undefined
      ? ["--peakFdv7d", String(payload.peakFdv7d)]
      : []),
    ...(payload.volume7d !== undefined
      ? ["--volume7d", String(payload.volume7d)]
      : []),
    ...(payload.metricSource ? ["--metricSource", payload.metricSource] : []),
    ...(payload.observedAt ? ["--observedAt", payload.observedAt] : []),
  ];
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const filePath = resolve(process.cwd(), args.file);
  const payload = parsePayload(await readFile(filePath, "utf-8"));

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/import.ts",
        ...buildImportArgs(payload),
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

      reject(new Error(`import:file child exited with code ${code ?? "null"}`));
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
