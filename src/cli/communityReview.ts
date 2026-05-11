import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { Prisma, PrismaClient } from "@prisma/client";

import { db } from "./db.js";

type CommunityReviewClient = Pick<PrismaClient, "token">;

type JsonObject = Record<string, unknown>;

type CommunityReviewArgs = {
  mint: string;
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  descriptionPresent: boolean;
  metaplexHit?: boolean;
  linkCount?: number;
  operatorNote?: string;
};

type CommunityReviewResult = {
  status: "ok" | "not_found";
  mode: "manual_community_review_capture";
  mint: string;
  updated: boolean;
  reviewFlagsJson: {
    hasWebsite: boolean;
    hasX: boolean;
    hasTelegram: boolean;
    metaplexHit: boolean;
    descriptionPresent: boolean;
    linkCount: number;
    source: "manual_community_review";
    reviewedAt: string;
    operatorNote?: string;
  } | null;
  safetyBoundary: {
    reviewOnly: true;
    advisoryOutput: false;
    externalFetch: false;
    telegramSend: false;
    queue: false;
    systemd: false;
  };
};

type ReviewFlagsView = {
  hasWebsite: boolean;
  hasX: boolean;
  hasTelegram: boolean;
  metaplexHit: boolean;
  descriptionPresent: boolean;
  linkCount: number;
};

function printUsageAndExit(message?: string, exitCode = 1): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm community:review -- --mint <MINT> --hasWebsite <true|false> --hasX <true|false> --hasTelegram <true|false> --descriptionPresent <true|false> [--metaplexHit <true|false>] [--linkCount <N>] [--operatorNote <TEXT>]",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readTextArg(value: string, key: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    printUsageAndExit(`Empty value for ${key}`);
  }

  return trimmed;
}

function readBooleanArg(value: string, key: string): boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean for ${key}: ${value}`);
}

function readNonNegativeIntArg(value: string, key: string): number {
  if (value.trim() === "") {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    printUsageAndExit(`Invalid number for ${key}: ${value}`);
  }

  return parsed;
}

function readRequiredArg<T>(
  value: T | undefined,
  key: keyof CommunityReviewArgs,
): T {
  if (value === undefined) {
    printUsageAndExit(`Missing required arg: --${key}`);
  }

  return value;
}

export function parseCommunityReviewArgs(argv: string[]): CommunityReviewArgs {
  const out: Partial<CommunityReviewArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key === "--help" || key === "-h") {
      printUsageAndExit(undefined, 0);
    }

    if (!key.startsWith("--")) continue;
    if (value === undefined || value.startsWith("--")) {
      printUsageAndExit(`Missing value for ${key}`);
    }

    switch (key) {
      case "--mint":
        out.mint = readTextArg(value, key);
        break;
      case "--hasWebsite":
        out.hasWebsite = readBooleanArg(value, key);
        break;
      case "--hasX":
        out.hasX = readBooleanArg(value, key);
        break;
      case "--hasTelegram":
        out.hasTelegram = readBooleanArg(value, key);
        break;
      case "--descriptionPresent":
        out.descriptionPresent = readBooleanArg(value, key);
        break;
      case "--metaplexHit":
        out.metaplexHit = readBooleanArg(value, key);
        break;
      case "--linkCount":
        out.linkCount = readNonNegativeIntArg(value, key);
        break;
      case "--operatorNote":
        out.operatorNote = readTextArg(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return {
    mint: readRequiredArg(out.mint, "mint"),
    hasWebsite: readRequiredArg(out.hasWebsite, "hasWebsite"),
    hasX: readRequiredArg(out.hasX, "hasX"),
    hasTelegram: readRequiredArg(out.hasTelegram, "hasTelegram"),
    descriptionPresent: readRequiredArg(
      out.descriptionPresent,
      "descriptionPresent",
    ),
    metaplexHit: out.metaplexHit,
    linkCount: out.linkCount,
    operatorNote: out.operatorNote,
  };
}

function extractReviewFlags(reviewFlagsJson: unknown): ReviewFlagsView | null {
  if (!isRecord(reviewFlagsJson)) {
    return null;
  }

  const hasWebsite = reviewFlagsJson.hasWebsite;
  const hasX = reviewFlagsJson.hasX;
  const hasTelegram = reviewFlagsJson.hasTelegram;
  const metaplexHit = reviewFlagsJson.metaplexHit;
  const descriptionPresent = reviewFlagsJson.descriptionPresent;
  const linkCount = reviewFlagsJson.linkCount;

  if (
    typeof hasWebsite !== "boolean" ||
    typeof hasX !== "boolean" ||
    typeof hasTelegram !== "boolean" ||
    typeof metaplexHit !== "boolean" ||
    typeof descriptionPresent !== "boolean" ||
    typeof linkCount !== "number" ||
    !Number.isInteger(linkCount) ||
    linkCount < 0
  ) {
    return null;
  }

  return {
    hasWebsite,
    hasX,
    hasTelegram,
    metaplexHit,
    descriptionPresent,
    linkCount,
  };
}

function defaultLinkCount(input: Pick<CommunityReviewArgs, "hasWebsite" | "hasX" | "hasTelegram">): number {
  return [input.hasWebsite, input.hasX, input.hasTelegram].filter(Boolean).length;
}

function validateCommunityReviewInput(input: CommunityReviewArgs): CommunityReviewArgs {
  if (!Number.isInteger(input.linkCount ?? 0) || (input.linkCount ?? 0) < 0) {
    throw new Error(`Invalid linkCount: ${input.linkCount}`);
  }

  return input;
}

function buildReviewFlagsJson(
  existingReviewFlagsJson: unknown,
  input: CommunityReviewArgs,
  now: Date,
): CommunityReviewResult["reviewFlagsJson"] {
  const existingObject = isRecord(existingReviewFlagsJson)
    ? existingReviewFlagsJson
    : {};
  const existingFlags = extractReviewFlags(existingReviewFlagsJson);

  return {
    ...existingObject,
    hasWebsite: input.hasWebsite,
    hasX: input.hasX,
    hasTelegram: input.hasTelegram,
    metaplexHit: input.metaplexHit ?? existingFlags?.metaplexHit ?? false,
    descriptionPresent: input.descriptionPresent,
    linkCount: input.linkCount ?? defaultLinkCount(input),
    source: "manual_community_review",
    reviewedAt: now.toISOString(),
    ...(input.operatorNote !== undefined ? { operatorNote: input.operatorNote } : {}),
  };
}

function safetyBoundary(): CommunityReviewResult["safetyBoundary"] {
  return {
    reviewOnly: true,
    advisoryOutput: false,
    externalFetch: false,
    telegramSend: false,
    queue: false,
    systemd: false,
  };
}

export async function captureManualCommunityReview(
  client: CommunityReviewClient,
  input: CommunityReviewArgs,
  options: { now?: Date } = {},
): Promise<CommunityReviewResult> {
  const safeInput = validateCommunityReviewInput(input);
  const token = await client.token.findUnique({
    where: {
      mint: safeInput.mint,
    },
    select: {
      id: true,
      mint: true,
      reviewFlagsJson: true,
    },
  });

  if (!token) {
    return {
      status: "not_found",
      mode: "manual_community_review_capture",
      mint: safeInput.mint,
      updated: false,
      reviewFlagsJson: null,
      safetyBoundary: safetyBoundary(),
    };
  }

  const reviewFlagsJson = buildReviewFlagsJson(
    token.reviewFlagsJson,
    safeInput,
    options.now ?? new Date(),
  );

  await client.token.update({
    where: {
      id: token.id,
    },
    data: {
      reviewFlagsJson: reviewFlagsJson as Prisma.InputJsonValue,
    },
    select: {
      id: true,
    },
  });

  return {
    status: "ok",
    mode: "manual_community_review_capture",
    mint: token.mint,
    updated: true,
    reviewFlagsJson,
    safetyBoundary: safetyBoundary(),
  };
}

export async function runCommunityReviewCli(argv = process.argv.slice(2)): Promise<void> {
  const args = parseCommunityReviewArgs(argv.filter((arg) => arg !== "--"));
  const result = await captureManualCommunityReview(db, args);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runCommunityReviewCli()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
