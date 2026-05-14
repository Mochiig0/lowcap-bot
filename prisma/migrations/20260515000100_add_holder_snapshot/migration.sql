-- Adds the future holder distribution safe-summary storage table.
-- This migration is intentionally additive: it creates HolderSnapshot and
-- indexes only, without touching existing Token / Metric / Notification fields.

-- CreateTable
CREATE TABLE "HolderSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "topHolderPct" REAL,
    "top10HolderPct" REAL,
    "holderCount" INTEGER,
    "freshWalletCount" INTEGER,
    "bundlerSignal" TEXT NOT NULL,
    "sameFundingOriginSignal" TEXT NOT NULL,
    "lpWalletExcluded" BOOLEAN,
    "confidence" TEXT NOT NULL,
    "rawFree" BOOLEAN NOT NULL,
    "secretFree" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HolderSnapshot_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HolderSnapshot_tokenId_observedAt_idx" ON "HolderSnapshot"("tokenId", "observedAt");

-- CreateIndex
CREATE INDEX "HolderSnapshot_source_observedAt_idx" ON "HolderSnapshot"("source", "observedAt");
