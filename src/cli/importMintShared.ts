import { db } from "./db.js";

export type ImportMintInput = {
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

export type ImportMintResult = {
  mint: string;
  metadataStatus: string;
  importedAt: string;
  created: boolean;
};

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

export async function importMint(input: ImportMintInput): Promise<ImportMintResult> {
  const existing = await db.token.findUnique({
    where: { mint: input.mint },
    select: {
      mint: true,
      metadataStatus: true,
      importedAt: true,
    },
  });

  if (existing) {
    return {
      mint: existing.mint,
      metadataStatus: existing.metadataStatus,
      importedAt: existing.importedAt.toISOString(),
      created: false,
    };
  }

  const importedAt = new Date();
  const token = await db.token.create({
    data: {
      mint: input.mint,
      source: input.source,
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

  return {
    mint: token.mint,
    metadataStatus: token.metadataStatus,
    importedAt: token.importedAt.toISOString(),
    created: true,
  };
}
