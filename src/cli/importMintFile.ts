import "dotenv/config";

import { execFile } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ImportMintFileArgs = {
  file: string;
};

type ImportMintFileItem = {
  mint: string;
  source?: string;
};

type ImportMintResult = {
  mint: string;
  metadataStatus: string;
  importedAt: string;
  created: boolean;
};

type ImportMintBatchPayload = {
  items: ImportMintFileItem[];
};

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm import:mint:file -- --file <PATH>",
      "",
      "Payload shape:",
      '{ "items": [ { "mint": "MINT", "source": "manual" } ] }',
    ].join("\n"),
  );
  process.exit(1);
}

function parseArgs(argv: string[]): ImportMintFileArgs {
  const out: Partial<ImportMintFileArgs> = {};

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

  return out as ImportMintFileArgs;
}

function ensureObject(value: unknown, filePath: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    printUsageAndExit(
      `Invalid JSON in ${filePath}: expected one object with an "items" array`,
    );
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  input: Record<string, unknown>,
  key: "mint",
  filePath: string,
  index: number,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(
      `Invalid payload in ${filePath}: items[${index}].${key} must be a non-empty string`,
    );
  }

  return value;
}

function readOptionalString(
  input: Record<string, unknown>,
  key: "source",
  filePath: string,
  index: number,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    printUsageAndExit(
      `Invalid payload in ${filePath}: items[${index}].${key} must be a string when provided`,
    );
  }

  return value;
}

function parsePayload(raw: string, filePath: string): ImportMintBatchPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    printUsageAndExit(
      `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const input = ensureObject(parsed, filePath);
  const itemsValue = input.items;

  if (!Array.isArray(itemsValue)) {
    printUsageAndExit(
      `Invalid payload in ${filePath}: "items" must be an array`,
    );
  }

  const items = itemsValue.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      printUsageAndExit(
        `Invalid payload in ${filePath}: items[${index}] must be an object`,
      );
    }

    const entry = item as Record<string, unknown>;
    return {
      mint: readRequiredString(entry, "mint", filePath, index),
      source: readOptionalString(entry, "source", filePath, index),
    };
  });

  return { items };
}

function buildImportMintArgs(item: ImportMintFileItem): string[] {
  return [
    "--mint",
    item.mint,
    ...(item.source ? ["--source", item.source] : []),
  ];
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runImportMint(item: ImportMintFileItem): Promise<ImportMintResult> {
  const outputPath = `/tmp/import-mint-file-${process.pid}-${Date.now()}-${item.mint}.json`;
  const command = [
    process.execPath,
    "--import",
    "tsx",
    "src/cli/importMint.ts",
    ...buildImportMintArgs(item),
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
      `import:mint:file child returned non-JSON output: ${error instanceof Error ? error.message : String(error)}`,
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

  const payload = parsePayload(raw, filePath);
  const results: Array<
    ImportMintResult & {
      requestedSource: string | null;
    }
  > = [];

  for (const item of payload.items) {
    const result = await runImportMint(item);
    results.push({
      ...result,
      requestedSource: item.source ?? null,
    });
  }

  console.log(
    JSON.stringify(
      {
        file: filePath,
        count: results.length,
        createdCount: results.filter((item) => item.created).length,
        existingCount: results.filter((item) => !item.created).length,
        items: results,
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
    console.error(error);
  }
  process.exitCode = 1;
});
