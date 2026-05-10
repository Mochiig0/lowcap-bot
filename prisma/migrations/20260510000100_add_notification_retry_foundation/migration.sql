-- Adds retry scheduling and short lease fields for future human-gated /
-- automatic retry work. This migration is intentionally created but not applied
-- to production dev.db in the Yellow foundation task.

ALTER TABLE "Notification" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notification" ADD COLUMN "nextRetryAt" DATETIME;
ALTER TABLE "Notification" ADD COLUMN "lastAttemptAt" DATETIME;
ALTER TABLE "Notification" ADD COLUMN "leaseUntil" DATETIME;
ALTER TABLE "Notification" ADD COLUMN "workerId" TEXT;

CREATE INDEX "Notification_status_mode_eventType_trigger_nextRetryAt_failedAt_updatedAt_idx"
ON "Notification"("status", "mode", "eventType", "trigger", "nextRetryAt", "failedAt", "updatedAt");

CREATE INDEX "Notification_leaseUntil_idx"
ON "Notification"("leaseUntil");
