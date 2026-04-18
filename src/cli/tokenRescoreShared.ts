import { Prisma } from "@prisma/client";
import { checkHardReject } from "../scoring/hardReject.js";
import { buildTargetText } from "../scoring/normalize.js";
import { scoreText } from "../scoring/score.js";
import { db } from "./db.js";

export type TokenForRescore = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  rescoredAt: Date | null;
};

export type TokenRescorePreview = {
  mint: string;
  normalizedText: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
  scoreTotal: number;
  scoreRank: string;
  scoreBreakdown: unknown;
  rescoredAt: string;
};

export async function findTokenForRescore(mint: string): Promise<TokenForRescore | null> {
  return db.token.findUnique({
    where: { mint },
    select: {
      mint: true,
      name: true,
      symbol: true,
      description: true,
      rescoredAt: true,
    },
  });
}

export async function buildTokenRescorePreview(
  token: {
    mint: string;
    name: string | null;
    symbol: string | null;
    description: string | null;
  },
  now = new Date(),
): Promise<TokenRescorePreview> {
  if (!token.name || !token.symbol) {
    throw new Error(`Token is not ready for rescore: name and symbol are required for mint ${token.mint}`);
  }

  const normalizedText = buildTargetText({
    name: token.name,
    symbol: token.symbol,
    description: token.description ?? undefined,
  });
  const hardReject = checkHardReject(normalizedText);
  const score = await scoreText(normalizedText);

  return {
    mint: token.mint,
    normalizedText,
    hardRejected: hardReject.rejected,
    hardRejectReason: hardReject.reason,
    scoreTotal: score.total,
    scoreRank: score.rank,
    scoreBreakdown: score.breakdown,
    rescoredAt: now.toISOString(),
  };
}

export async function rescoreTokenByMint(mint: string): Promise<TokenRescorePreview> {
  const existing = await findTokenForRescore(mint);
  if (!existing) {
    throw new Error(`Token not found for mint: ${mint}`);
  }

  const preview = await buildTokenRescorePreview(existing);
  const token = await db.token.update({
    where: { mint },
    data: {
      normalizedText: preview.normalizedText,
      hardRejected: preview.hardRejected,
      hardRejectReason: preview.hardRejectReason,
      scoreTotal: preview.scoreTotal,
      scoreRank: preview.scoreRank,
      scoreBreakdown: preview.scoreBreakdown as Prisma.InputJsonValue,
      rescoredAt: new Date(preview.rescoredAt),
    },
    select: {
      mint: true,
      normalizedText: true,
      hardRejected: true,
      hardRejectReason: true,
      scoreTotal: true,
      scoreRank: true,
      scoreBreakdown: true,
      rescoredAt: true,
    },
  });

  return {
    mint: token.mint,
    normalizedText: token.normalizedText ?? "",
    hardRejected: token.hardRejected,
    hardRejectReason: token.hardRejectReason,
    scoreTotal: token.scoreTotal,
    scoreRank: token.scoreRank,
    scoreBreakdown: token.scoreBreakdown,
    rescoredAt: token.rescoredAt?.toISOString() ?? preview.rescoredAt,
  };
}
