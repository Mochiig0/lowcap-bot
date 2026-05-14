import "dotenv/config";

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { db } from "./db.js";
import {
  buildHolderDistributionSafeSummaryIssueList,
  parseHolderDistributionSafeSummary,
  type HolderDistributionSafeSummary,
} from "../observation/holderDistributionSafeSummary.js";

type JsonObject = Record<string, unknown>;

type HolderSnapshotAddArgs = {
  mint: string;
  file: string;
};

type HolderSnapshotSafetyBoundary = {
  writeScope: "one_holder_snapshot_row";
  tokenUpdated: false;
  metricUpdated: false;
  notificationUpdated: false;
  externalFetch: false;
  telegramSend: false;
  queue: false;
  systemd: false;
};

type HolderSnapshotAddOkOutput = {
  status: "ok";
  mode: "holder_snapshot_add_one";
  mint: string;
  updated: true;
  holderSnapshotId: number;
  source: string;
  observedAt: string;
  rawFree: true;
  secretFree: true;
  safetyBoundary: HolderSnapshotSafetyBoundary;
};

type HolderSnapshotAddFailureOutput = {
  status: "not_found" | "invalid_safe_summary" | "mint_mismatch";
  mode: "holder_snapshot_add_one";
  mint: string;
  updated: false;
  holderSnapshotId: null;
  source: null;
  observedAt: null;
  rawFree: null;
  secretFree: null;
  issues: string[];
  safetyBoundary: HolderSnapshotSafetyBoundary;
};

export type HolderSnapshotAddOutput =
  | HolderSnapshotAddOkOutput
  | HolderSnapshotAddFailureOutput;

const DANGEROUS_KEY_MARKERS = new Set([
  "apikey",
  "authorization",
  "bearer",
  "chatid",
  "holders",
  "privatekey",
  "rawjson",
  "rawresponse",
  "rawresponsebody",
  "requesturl",
  "responsebody",
  "secret",
  "telegrambottoken",
  "telegramchatid",
  "token",
  "topholders",
  "walletlist",
  "wallets",
]);

const SAFETY_BOUNDARY: HolderSnapshotSafetyBoundary = {
  writeScope: "one_holder_snapshot_row",
  tokenUpdated: false,
  metricUpdated: false,
  notificationUpdated: false,
  externalFetch: false,
  telegramSend: false,
  queue: false,
  systemd: false,
};

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKey(key: string): string {
  return key.replaceAll(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function findDangerousKeyIssues(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findDangerousKeyIssues(item, `${path}[${index}]`));
  }

  if (!isRecord(value)) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const current = DANGEROUS_KEY_MARKERS.has(normalizeKey(key))
      ? [`dangerous key present at ${childPath}`]
      : [];
    return [...current, ...findDangerousKeyIssues(child, childPath)];
  });
}

function sanitizeIssues(issues: string[]): string[] {
  return [...new Set(issues.map((issue) => {
    if (issue.startsWith("dangerous key present at ")) {
      return "dangerous raw payload or secret-like key present";
    }

    if (/(apiKey|authorization|bearer|chatId|holders|privateKey|rawJson|rawResponse|rawResponseBody|requestUrl|responseBody|secret|telegramBotToken|telegramChatId|token|topHolders|walletList|wallets)/i.test(issue)) {
      return "unsafe raw payload or secret-like field is not allowed";
    }

    return issue;
  }))];
}

function buildFailureOutput(
  status: HolderSnapshotAddFailureOutput["status"],
  mint: string,
  issues: string[],
): HolderSnapshotAddFailureOutput {
  return {
    status,
    mode: "holder_snapshot_add_one",
    mint,
    updated: false,
    holderSnapshotId: null,
    source: null,
    observedAt: null,
    rawFree: null,
    secretFree: null,
    issues: sanitizeIssues(issues),
    safetyBoundary: SAFETY_BOUNDARY,
  };
}

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredArg(
  input: Partial<HolderSnapshotAddArgs>,
  key: keyof HolderSnapshotAddArgs,
): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

function parseArgs(argv: string[]): HolderSnapshotAddArgs {
  const out: Partial<HolderSnapshotAddArgs> = {};

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
      case "--mint":
        out.mint = value;
        break;
      case "--file":
        out.file = value;
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return {
    mint: readRequiredArg(out, "mint"),
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
    throw new Error(`Unable to read holder snapshot safe summary file: ${code}`);
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error("Invalid holder snapshot safe summary JSON file");
  }
}

function normalizeAddInput(input: unknown): {
  fileMint: string | null;
  summary: unknown;
  issues: string[];
} {
  if (Array.isArray(input)) {
    return {
      fileMint: null,
      summary: undefined,
      issues: ["batch input is not allowed for holder:snapshot:add"],
    };
  }

  if (!isRecord(input)) {
    return {
      fileMint: null,
      summary: input,
      issues: [],
    };
  }

  const dangerousIssues = findDangerousKeyIssues(input);

  if (Array.isArray(input.items)) {
    return {
      fileMint: typeof input.mint === "string" ? input.mint : null,
      summary: undefined,
      issues: [
        "items array input is not allowed for holder:snapshot:add",
        ...dangerousIssues,
      ],
    };
  }

  if (Object.prototype.hasOwnProperty.call(input, "summary")) {
    const allowedWrapperKeys = new Set(["mint", "summary"]);
    const wrapperIssues = Object.keys(input)
      .filter((key) => !allowedWrapperKeys.has(key))
      .map((key) => `unknown wrapper field is not allowed: ${key}`);

    return {
      fileMint: typeof input.mint === "string" ? input.mint : null,
      summary: input.summary,
      issues: [...wrapperIssues, ...dangerousIssues],
    };
  }

  return {
    fileMint: null,
    summary: input,
    issues: [],
  };
}

export async function addHolderSnapshot(
  client: PrismaClient,
  input: {
    mint: string;
    fileInput: unknown;
  },
): Promise<HolderSnapshotAddOutput> {
  const normalized = normalizeAddInput(input.fileInput);
  if (normalized.fileMint !== null && normalized.fileMint !== input.mint) {
    return buildFailureOutput(
      "mint_mismatch",
      input.mint,
      ["file mint must match CLI mint"],
    );
  }

  const safeSummaryIssues = [
    ...normalized.issues,
    ...buildHolderDistributionSafeSummaryIssueList(normalized.summary),
  ];
  if (safeSummaryIssues.length > 0) {
    return buildFailureOutput(
      "invalid_safe_summary",
      input.mint,
      safeSummaryIssues,
    );
  }

  const token = await client.token.findUnique({
    where: {
      mint: input.mint,
    },
    select: {
      id: true,
    },
  });

  if (!token) {
    return buildFailureOutput(
      "not_found",
      input.mint,
      ["Token not found for mint"],
    );
  }

  const summary: HolderDistributionSafeSummary =
    parseHolderDistributionSafeSummary(normalized.summary);
  const snapshot = await client.holderSnapshot.create({
    data: {
      tokenId: token.id,
      source: summary.source,
      observedAt: new Date(summary.observedAt),
      topHolderPct: summary.topHolderPct,
      top10HolderPct: summary.top10HolderPct,
      holderCount: summary.holderCount,
      freshWalletCount: summary.freshWalletCount,
      bundlerSignal: summary.bundlerSignal,
      sameFundingOriginSignal: summary.sameFundingOriginSignal,
      lpWalletExcluded: summary.lpWalletExcluded,
      confidence: summary.confidence,
      rawFree: summary.rawFree,
      secretFree: summary.secretFree,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "ok",
    mode: "holder_snapshot_add_one",
    mint: input.mint,
    updated: true,
    holderSnapshotId: snapshot.id,
    source: summary.source,
    observedAt: summary.observedAt,
    rawFree: true,
    secretFree: true,
    safetyBoundary: SAFETY_BOUNDARY,
  };
}

export async function runHolderSnapshotAddCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const fileInput = await readJsonFile(args.file);
  const result = await addHolderSnapshot(db, {
    mint: args.mint,
    fileInput,
  });
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runHolderSnapshotAddCli()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
