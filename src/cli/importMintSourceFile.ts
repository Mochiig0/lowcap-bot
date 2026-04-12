import "dotenv/config";

import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ImportMintSourceFileArgs = {
  file: string;
};

type RawSourceEvent = {
  source: string;
  eventType: string;
  detectedAt: string;
  payload: {
    mintAddress: string;
  };
};

type MinimalHandoffPayload = {
  mint: string;
  source?: string;
};

type ImportMintResult = {
  mint: string;
  metadataStatus: string;
  importedAt: string;
  created: boolean;
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import:mint:source-file -- --file <PATH>",
      "",
      "Source event shape:",
      '{ "source": "future-launch-feed-sample", "eventType": "token_detected", "detectedAt": "2026-04-13T00:00:00.000Z", "payload": { "mintAddress": "MINT" } }',
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): ImportMintSourceFileArgs {
  const out: Partial<ImportMintSourceFileArgs> = {};

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
    printUsageAndExit("Missing required arg: --file");
  }

  return out as ImportMintSourceFileArgs;
}

function ensureObject(value: unknown, filePath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    printUsageAndExit(
      `Invalid JSON in ${filePath}: expected one source event object`,
    );
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  filePath: string,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(
      `Invalid payload in ${filePath}: "${key}" must be a non-empty string`,
    );
  }

  return value;
}

function parsePayload(raw: string, filePath: string): RawSourceEvent {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    printUsageAndExit(
      `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const input = ensureObject(parsed, filePath);
  const payload = ensureObject(input.payload, filePath);

  return {
    source: readRequiredString(input, "source", filePath),
    eventType: readRequiredString(input, "eventType", filePath),
    detectedAt: readRequiredString(input, "detectedAt", filePath),
    payload: {
      mintAddress: readRequiredString(payload, "mintAddress", filePath),
    },
  };
}

function normalizeToMinimalHandoff(event: RawSourceEvent): MinimalHandoffPayload {
  return {
    mint: event.payload.mintAddress,
    source: event.source,
  };
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runImportMint(
  payload: MinimalHandoffPayload,
): Promise<ImportMintResult> {
  const outputPath = `/tmp/import-mint-source-file-${process.pid}-${Date.now()}-${payload.mint}.json`;
  const command = [
    process.execPath,
    "--import",
    "tsx",
    "src/cli/importMint.ts",
    "--mint",
    payload.mint,
    ...(payload.source ? ["--source", payload.source] : []),
  ]
    .map(shellEscape)
    .join(" ");

  let stdout: string;

  try {
    await execFileAsync("bash", [
      "-lc",
      `${command} > ${shellEscape(outputPath)}`,
    ], {
      cwd: process.cwd(),
      env: process.env,
    });

    stdout = await readFile(outputPath, "utf-8");
  } finally {
    await rm(outputPath, { force: true });
  }

  try {
    return JSON.parse(stdout) as ImportMintResult;
  } catch (error) {
    throw new Error(
      `import:mint:source-file child returned non-JSON output: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function run(): Promise<void> {
  const argv = process.argv.slice(2).filter((arg) => arg !== "--");
  const args = parseArgs(argv);
  const filePath = resolve(process.cwd(), args.file);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      printUsageAndExit(`File not found: ${filePath}`);
    }

    printUsageAndExit(
      `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const sourceEvent = parsePayload(raw, filePath);
  const handoffPayload = normalizeToMinimalHandoff(sourceEvent);
  const result = await runImportMint(handoffPayload);

  console.log(
    JSON.stringify(
      {
        file: filePath,
        sourceEvent: {
          source: sourceEvent.source,
          eventType: sourceEvent.eventType,
          detectedAt: sourceEvent.detectedAt,
        },
        handoffPayload,
        result,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
