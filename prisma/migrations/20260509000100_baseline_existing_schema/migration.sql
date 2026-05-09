-- CreateTable
CREATE TABLE "Dev" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wallet" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Token" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mint" TEXT NOT NULL,
    "name" TEXT,
    "symbol" TEXT,
    "description" TEXT,
    "source" TEXT,
    "groupKey" TEXT,
    "groupNote" TEXT,
    "normalizedText" TEXT,
    "hardRejected" BOOLEAN NOT NULL DEFAULT false,
    "hardRejectReason" TEXT,
    "scoreTotal" INTEGER NOT NULL DEFAULT 0,
    "scoreRank" TEXT NOT NULL DEFAULT 'C',
    "scoreBreakdown" JSONB,
    "reviewFlagsJson" JSONB,
    "entrySnapshot" JSONB,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrichedAt" DATETIME,
    "rescoredAt" DATETIME,
    "metadataStatus" TEXT NOT NULL DEFAULT 'mint_only',
    "devId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Token_devId_fkey" FOREIGN KEY ("devId") REFERENCES "Dev" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Metric" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenId" INTEGER NOT NULL,
    "launchPrice" REAL,
    "peakPrice15m" REAL,
    "peakPrice1h" REAL,
    "maxMultiple15m" REAL,
    "maxMultiple1h" REAL,
    "peakFdv24h" REAL,
    "volume24h" REAL,
    "peakFdv7d" REAL,
    "volume7d" REAL,
    "timeToPeakMinutes" INTEGER,
    "alertedAt" DATETIME,
    "peakMultipleFromAlert" REAL,
    "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "rawJson" JSONB,
    CONSTRAINT "Metric_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "Token" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Dev_wallet_key" ON "Dev"("wallet");

-- CreateIndex
CREATE UNIQUE INDEX "Token_mint_key" ON "Token"("mint");

-- CreateIndex
CREATE INDEX "Token_scoreRank_idx" ON "Token"("scoreRank");

-- CreateIndex
CREATE INDEX "Token_groupKey_idx" ON "Token"("groupKey");

-- CreateIndex
CREATE INDEX "Token_metadataStatus_idx" ON "Token"("metadataStatus");

-- CreateIndex
CREATE INDEX "Metric_tokenId_observedAt_idx" ON "Metric"("tokenId", "observedAt");
