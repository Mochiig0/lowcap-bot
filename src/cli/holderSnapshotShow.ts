import "dotenv/config";

import { pathToFileURL } from "node:url";

import type { PrismaClient } from "@prisma/client";

import { db } from "./db.js";

type HolderSnapshotShowArgs = {
  mint: string;
  limit: number;
};

type HolderSnapshotShowItem = {
  holderSnapshotId: number;
  source: string;
  observedAt: string;
  topHolderPct: number | null;
  top10HolderPct: number | null;
  holderCount: number | null;
  freshWalletCount: number | null;
  bundlerSignal: string;
  sameFundingOriginSignal: string;
  lpWalletExcluded: boolean | null;
  confidence: string;
  rawFree: boolean;
  secretFree: boolean;
  riskReviewHints: string[];
};

export type HolderSnapshotShowOutput =
  | {
    status: "ok";
    mode: "read_only_holder_snapshot_show";
    mint: string;
    count: number;
    items: HolderSnapshotShowItem[];
  }
  | {
    status: "not_found";
    mode: "read_only_holder_snapshot_show";
    mint: string;
    count: 0;
    items: [];
  };

const RISK_REVIEW_HINTS = [
  "review holder concentration manually",
  "compare with later outcome",
  "do not infer trading decision",
];

function printUsageAndExit(message?: string): never {
  if (message) {
    console.error(`Error: ${message}`);
  }

  console.log(
    [
      "Usage:",
      "pnpm holder:snapshot:show -- --mint <MINT> [--limit <N>]",
    ].join("\n"),
  );
  process.exit(1);
}

function readRequiredMint(input: Partial<HolderSnapshotShowArgs>): string {
  const value = input.mint;
  if (typeof value !== "string" || value.trim().length === 0) {
    printUsageAndExit("Missing required arg: --mint");
  }

  return value;
}

function parsePositiveInt(value: string, key: string): number {
  if (!/^\d+$/.test(value)) {
    printUsageAndExit(`Invalid positive integer for ${key}: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    printUsageAndExit(`Invalid positive integer for ${key}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv: string[]): HolderSnapshotShowArgs {
  const out: Partial<HolderSnapshotShowArgs> = {
    limit: 5,
  };

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
      case "--limit":
        out.limit = parsePositiveInt(value, key);
        break;
      default:
        printUsageAndExit(`Unknown arg: ${key}`);
    }

    index += 1;
  }

  return {
    mint: readRequiredMint(out),
    limit: out.limit ?? 5,
  };
}

export async function showHolderSnapshots(
  client: PrismaClient,
  input: {
    mint: string;
    limit?: number;
  },
): Promise<HolderSnapshotShowOutput> {
  const limit = input.limit ?? 5;
  const token = await client.token.findUnique({
    where: {
      mint: input.mint,
    },
    select: {
      id: true,
      mint: true,
    },
  });

  if (!token) {
    return {
      status: "not_found",
      mode: "read_only_holder_snapshot_show",
      mint: input.mint,
      count: 0,
      items: [],
    };
  }

  const snapshots = await client.holderSnapshot.findMany({
    where: {
      tokenId: token.id,
    },
    orderBy: [
      {
        observedAt: "desc",
      },
      {
        id: "desc",
      },
    ],
    take: limit,
    select: {
      id: true,
      source: true,
      observedAt: true,
      topHolderPct: true,
      top10HolderPct: true,
      holderCount: true,
      freshWalletCount: true,
      bundlerSignal: true,
      sameFundingOriginSignal: true,
      lpWalletExcluded: true,
      confidence: true,
      rawFree: true,
      secretFree: true,
    },
  });

  return {
    status: "ok",
    mode: "read_only_holder_snapshot_show",
    mint: token.mint,
    count: snapshots.length,
    items: snapshots.map((snapshot) => ({
      holderSnapshotId: snapshot.id,
      source: snapshot.source,
      observedAt: snapshot.observedAt.toISOString(),
      topHolderPct: snapshot.topHolderPct,
      top10HolderPct: snapshot.top10HolderPct,
      holderCount: snapshot.holderCount,
      freshWalletCount: snapshot.freshWalletCount,
      bundlerSignal: snapshot.bundlerSignal,
      sameFundingOriginSignal: snapshot.sameFundingOriginSignal,
      lpWalletExcluded: snapshot.lpWalletExcluded,
      confidence: snapshot.confidence,
      rawFree: snapshot.rawFree,
      secretFree: snapshot.secretFree,
      riskReviewHints: RISK_REVIEW_HINTS,
    })),
  };
}

export async function runHolderSnapshotShowCli(
  argv = process.argv.slice(2),
): Promise<void> {
  const args = parseArgs(argv.filter((arg) => arg !== "--"));
  const result = await showHolderSnapshots(db, args);
  console.log(JSON.stringify(result, null, 2));
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runHolderSnapshotShowCli()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.$disconnect();
    });
}
