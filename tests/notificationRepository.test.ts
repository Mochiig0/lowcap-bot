import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

import {
  createCapturedNotification,
  findNotificationByKey,
  markNotificationFailed,
  markNotificationSent,
  maybeCreateByNotificationKey,
  type CreateCapturedNotificationInput,
} from "../src/notifications/notificationRepository.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { databaseUrl: string; client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-notification-repository-"));
  const databaseUrl = `file:${join(dir, "notification-repository.db")}`;

  await execFileAsync(
    "bash",
    ["-lc", "pnpm exec prisma db push --skip-generate"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
      },
    },
  );

  const client = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await fn({ databaseUrl, client });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

function baseCapturedInput(
  overrides: Partial<CreateCapturedNotificationInput> = {},
): CreateCapturedNotificationInput {
  return {
    notificationKey: "Mint1111111111111111111111111111111111111111:metric_appended:123",
    eventType: "metric_appended",
    mint: "Mint1111111111111111111111111111111111111111",
    tokenId: 11,
    metricId: 123,
    trigger: "metric_appended",
    messagePreview: [
      "[Lowcap Ops] Gecko metric appended",
      "mint: Mint1111111111111111111111111111111111111111",
      "metricId: 123",
      "status: metric_appended",
    ].join("\n"),
    source: "ops:catchup:gecko",
    ...overrides,
  };
}

test("notificationRepository", async (t) => {
  await t.test("creates a captured notification row", async () => {
    await withTempDb(async ({ client }) => {
      const capturedAt = new Date("2026-05-09T00:00:00.000Z");

      const notification = await createCapturedNotification(
        client,
        baseCapturedInput({ capturedAt }),
      );

      assert.equal(notification.status, "captured");
      assert.equal(notification.mode, "capture_only");
      assert.equal(notification.rawJsonFree, true);
      assert.equal(notification.secretFree, true);
      assert.equal(notification.capturedAt?.toISOString(), capturedAt.toISOString());
      assert.equal(notification.sentAt, null);
      assert.equal(notification.failedAt, null);

      const count = await client.notification.count();
      assert.equal(count, 1);

      const found = await findNotificationByKey(client, notification.notificationKey);
      assert.equal(found?.id, notification.id);
    });
  });

  await t.test("maybeCreateByNotificationKey reuses an existing row", async () => {
    await withTempDb(async ({ client }) => {
      const first = await maybeCreateByNotificationKey(
        client,
        baseCapturedInput({
          notificationKey: "MintDuplicate111111111111111111111111111111:metric_appended:456",
          metricId: 456,
          messagePreview: "first safe preview",
        }),
      );
      const second = await maybeCreateByNotificationKey(
        client,
        baseCapturedInput({
          notificationKey: first.notification.notificationKey,
          metricId: 456,
          messagePreview: "second safe preview should not overwrite",
        }),
      );

      assert.equal(first.created, true);
      assert.equal(second.created, false);
      assert.equal(second.notification.id, first.notification.id);
      assert.equal(second.notification.messagePreview, "first safe preview");

      const count = await client.notification.count();
      assert.equal(count, 1);
    });
  });

  await t.test("marks a notification sent", async () => {
    await withTempDb(async ({ client }) => {
      const created = await createCapturedNotification(
        client,
        baseCapturedInput({
          notificationKey: "MintSent1111111111111111111111111111111111:metric_appended:789",
          metricId: 789,
        }),
      );
      const sentAt = new Date("2026-05-09T01:00:00.000Z");

      const sent = await markNotificationSent(
        client,
        created.notificationKey,
        { sentAt },
      );

      assert.equal(sent.status, "sent");
      assert.equal(sent.mode, "live_send");
      assert.equal(sent.sentAt?.toISOString(), sentAt.toISOString());
      assert.equal(sent.failedAt, null);
      assert.equal(sent.errorCode, null);
    });
  });

  await t.test("marks a notification failed with safe error summary", async () => {
    await withTempDb(async ({ client }) => {
      const created = await createCapturedNotification(
        client,
        baseCapturedInput({
          notificationKey: "MintFailed11111111111111111111111111111111:metric_appended:987",
          metricId: 987,
        }),
      );
      const failedAt = new Date("2026-05-09T02:00:00.000Z");

      const failed = await markNotificationFailed(
        client,
        created.notificationKey,
        {
          failedAt,
          errorCode: "telegram_network_error",
          reason: "safe network failure summary",
        },
      );

      assert.equal(failed.status, "failed");
      assert.equal(failed.mode, "live_send");
      assert.equal(failed.failedAt?.toISOString(), failedAt.toISOString());
      assert.equal(failed.errorCode, "telegram_network_error");
      assert.equal(failed.reason, "safe network failure summary");
      assert.equal(failed.sentAt, null);
    });
  });

  await t.test("rejects forbidden never-store input keys", async () => {
    await withTempDb(async ({ client }) => {
      await assert.rejects(
        createCapturedNotification(
          client,
          {
            ...baseCapturedInput({
              notificationKey: "MintForbidden1111111111111111111111111111:metric_appended:654",
              metricId: 654,
            }),
            rawPayload: { unsafe: true },
          } as unknown as CreateCapturedNotificationInput,
        ),
        /Forbidden notification input key: rawPayload/,
      );

      const created = await createCapturedNotification(
        client,
        baseCapturedInput({
          notificationKey: "MintForbiddenSent111111111111111111111111:metric_appended:655",
          metricId: 655,
        }),
      );

      await assert.rejects(
        markNotificationFailed(
          client,
          created.notificationKey,
          {
            errorCode: "telegram_response_not_ok",
            telegramResponseBody: "{\"ok\":false}",
          } as unknown as Parameters<typeof markNotificationFailed>[2],
        ),
        /Forbidden notification input key: telegramResponseBody/,
      );

      const count = await client.notification.count();
      assert.equal(count, 1);
    });
  });
});
