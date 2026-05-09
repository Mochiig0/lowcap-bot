-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "notificationKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "mint" TEXT NOT NULL,
    "tokenId" INTEGER,
    "metricId" INTEGER,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "messagePreview" TEXT NOT NULL,
    "capturedAt" DATETIME,
    "sentAt" DATETIME,
    "failedAt" DATETIME,
    "errorCode" TEXT,
    "reason" TEXT,
    "rawJsonFree" BOOLEAN NOT NULL,
    "secretFree" BOOLEAN NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_notificationKey_key" ON "Notification"("notificationKey");
