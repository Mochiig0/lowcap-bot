#!/usr/bin/env node
import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const DEFAULT_TIMEOUT_MS = 5_000;
const RETRY_DELAY_MS = 250;

function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function parseTimeoutMs(rawValue) {
  if (rawValue === undefined) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return parsed;
}

const runnerName = process.argv[2] ?? "runner";
const timeoutMs = parseTimeoutMs(process.argv[3]);
const prisma = new PrismaClient({
  log: ["error"],
});

let lastError;
const deadlineAt = Date.now() + timeoutMs;

try {
  while (true) {
    try {
      await prisma.token.count();
      process.exit(0);
    } catch (error) {
      lastError = error;

      if (Date.now() >= deadlineAt) {
        break;
      }

      await sleep(RETRY_DELAY_MS);
    }
  }
} finally {
  await prisma.$disconnect();
}

const message = lastError instanceof Error ? lastError.message : String(lastError);
console.error(
  [
    `[${runnerName}] db_preflight_failed=${new Date().toISOString()}`,
    `timeout_ms=${timeoutMs}`,
    `retry_delay_ms=${RETRY_DELAY_MS}`,
    `message=${JSON.stringify(message)}`,
    'hint="Run DATABASE_URL=... pnpm exec prisma db push --skip-generate before starting the runner."',
  ].join(" "),
);
process.exit(1);
