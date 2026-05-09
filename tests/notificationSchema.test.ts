import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function extractModelBlock(schema: string, modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName} \\{[\\s\\S]*?\\n\\}`));

  assert.ok(match, `model ${modelName} should exist`);

  return match[0];
}

test("Notification Prisma schema boundary", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf-8");
  const notification = extractModelBlock(schema, "Notification");

  assert.match(notification, /^\s*model Notification \{/m);
  assert.match(notification, /^\s*id\s+Int\s+@id @default\(autoincrement\(\)\)/m);
  assert.match(notification, /^\s*notificationKey\s+String\s+@unique/m);
  assert.match(notification, /^\s*eventType\s+String$/m);
  assert.match(notification, /^\s*mint\s+String$/m);
  assert.match(notification, /^\s*tokenId\s+Int\?$/m);
  assert.match(notification, /^\s*metricId\s+Int\?$/m);
  assert.match(notification, /^\s*trigger\s+String$/m);
  assert.match(notification, /^\s*status\s+String$/m);
  assert.match(notification, /^\s*mode\s+String$/m);
  assert.match(notification, /^\s*messagePreview\s+String$/m);
  assert.match(notification, /^\s*capturedAt\s+DateTime\?$/m);
  assert.match(notification, /^\s*sentAt\s+DateTime\?$/m);
  assert.match(notification, /^\s*failedAt\s+DateTime\?$/m);
  assert.match(notification, /^\s*errorCode\s+String\?$/m);
  assert.match(notification, /^\s*reason\s+String\?$/m);
  assert.match(notification, /^\s*rawJsonFree\s+Boolean$/m);
  assert.match(notification, /^\s*secretFree\s+Boolean$/m);
  assert.match(notification, /^\s*source\s+String\?$/m);
  assert.match(notification, /^\s*createdAt\s+DateTime\s+@default\(now\(\)\)/m);
  assert.match(notification, /^\s*updatedAt\s+DateTime\s+@updatedAt/m);
});

test("Notification schema omits never-store fields", async () => {
  const schema = await readFile("prisma/schema.prisma", "utf-8");
  const notification = extractModelBlock(schema, "Notification");

  const neverStorePatterns = [
    /response\s*body/i,
    /responseBody/,
    /request\s*path/i,
    /requestPath/,
    /bot\s*token/i,
    /botToken/,
    /chat\s*id/i,
    /chatId/,
    /token.*url/i,
    /raw\s*api\s*response/i,
    /rawApiResponse/,
    /raw\s*payload/i,
    /rawPayload/,
    /\brawJson\b/,
    /raw\s*stdout/i,
    /rawStdout/,
    /raw\s*stderr/i,
    /rawStderr/,
    /\.env/,
    /DATABASE_URL/,
    /process\.env/,
  ];

  for (const pattern of neverStorePatterns) {
    assert.doesNotMatch(notification, pattern);
  }
});
