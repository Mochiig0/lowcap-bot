import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";

import { buildCommunityGapPlan } from "../src/cli/communityGapPlan.ts";
import {
  captureManualCommunityReview,
  parseCommunityReviewArgs,
} from "../src/cli/communityReview.ts";
import { buildTokenObservationReport } from "../src/cli/tokenObservation.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient; databaseUrl: string }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-community-review-"));
  const databaseUrl = `file:${join(dir, "community-review.db")}`;

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
    return await fn({ client, databaseUrl });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedToken(
  client: PrismaClient,
  input: {
    mint: string;
    reviewFlagsJson?: Prisma.InputJsonValue | null;
    metadataStatus?: string;
    enrichedAt?: Date | null;
  },
): Promise<void> {
  await client.token.create({
    data: {
      mint: input.mint,
      name: `Community Review ${input.mint.slice(0, 4)}`,
      symbol: "CREV",
      source: "test-community-review",
      metadataStatus: input.metadataStatus ?? "partial",
      scoreRank: "B",
      scoreTotal: 17,
      hardRejected: false,
      hardRejectReason: null,
      reviewFlagsJson: input.reviewFlagsJson ?? undefined,
      enrichedAt: input.enrichedAt ?? undefined,
      importedAt: new Date("2026-05-10T00:00:00.000Z"),
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
    },
  });
}

async function counts(client: PrismaClient): Promise<{
  token: number;
  metric: number;
  notification: number;
}> {
  return {
    token: await client.token.count(),
    metric: await client.metric.count(),
    notification: await client.notification.count(),
  };
}

test("manual community review stores reviewFlagsJson and updates observation and gap plan views", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "CommunityReviewLinks111111111111111pump";
    await seedToken(client, {
      mint,
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: false,
        linkCount: 0,
      },
      enrichedAt: new Date("2026-05-10T00:01:00.000Z"),
    });

    const before = await counts(client);
    const result = await captureManualCommunityReview(
      client,
      {
        mint,
        hasWebsite: true,
        hasX: true,
        hasTelegram: false,
        descriptionPresent: true,
        operatorNote: "community review context only",
      },
      {
        now: new Date("2026-05-10T00:20:00.000Z"),
      },
    );
    const after = await counts(client);

    assert.deepEqual(after, before);
    assert.equal(result.status, "ok");
    assert.equal(result.updated, true);
    assert.deepEqual(result.reviewFlagsJson, {
      hasWebsite: true,
      hasX: true,
      hasTelegram: false,
      metaplexHit: true,
      descriptionPresent: true,
      linkCount: 2,
      source: "manual_community_review",
      reviewedAt: "2026-05-10T00:20:00.000Z",
      operatorNote: "community review context only",
    });
    assert.equal(result.safetyBoundary.externalFetch, false);
    assert.equal(result.safetyBoundary.telegramSend, false);
    assert.equal(result.safetyBoundary.queue, false);
    assert.equal(result.safetyBoundary.systemd, false);

    const observation = await buildTokenObservationReport(client, mint);
    assert.equal(observation.communitySnapshot.hasWebsite, true);
    assert.equal(observation.communitySnapshot.hasX, true);
    assert.equal(observation.communitySnapshot.hasTelegram, false);
    assert.equal(observation.communitySnapshot.linkCount, 2);
    assert.equal(observation.communitySnapshot.descriptionPresent, true);
    assert.equal(observation.communitySnapshot.source, "reviewFlagsJson");
    assert.ok(!observation.observationGaps.includes("community_links_not_recorded"));
    assert.ok(!observation.observationGaps.includes("description_not_recorded"));

    const gapPlan = await buildCommunityGapPlan(
      client,
      {
        limit: 10,
        sinceHours: 48,
        pumpOnly: true,
      },
      {
        now: new Date("2026-05-10T00:30:00.000Z"),
      },
    );
    assert.equal(gapPlan.selection.totalScanned, 1);
    assert.equal(gapPlan.selection.totalMatched, 0);
    assert.equal(gapPlan.items.length, 0);
  });
});

test("manual community review can record reviewed no-link state without breaking parsers", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "CommunityReviewNoLinks111111111111pump";
    await seedToken(client, {
      mint,
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: false,
        descriptionPresent: false,
        linkCount: 0,
      },
    });

    const result = await captureManualCommunityReview(
      client,
      {
        mint,
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        descriptionPresent: true,
        metaplexHit: false,
        operatorNote: "checked manually; no public community link found",
      },
      {
        now: new Date("2026-05-10T00:20:00.000Z"),
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.reviewFlagsJson?.source, "manual_community_review");
    assert.equal(result.reviewFlagsJson?.linkCount, 0);

    const observation = await buildTokenObservationReport(client, mint);
    assert.equal(observation.communitySnapshot.hasWebsite, false);
    assert.equal(observation.communitySnapshot.hasX, false);
    assert.equal(observation.communitySnapshot.hasTelegram, false);
    assert.equal(observation.communitySnapshot.linkCount, 0);
    assert.equal(observation.communitySnapshot.descriptionPresent, true);
    assert.ok(observation.observationGaps.includes("community_links_not_recorded"));
    assert.ok(!observation.observationGaps.includes("description_not_recorded"));

    const gapPlan = await buildCommunityGapPlan(
      client,
      {
        limit: 10,
        sinceHours: 48,
        pumpOnly: true,
      },
      {
        now: new Date("2026-05-10T00:30:00.000Z"),
      },
    );
    assert.equal(gapPlan.items[0]?.mint, mint);
    assert.equal(gapPlan.items[0]?.reviewFlagsState, "reviewed_no_links");
    assert.equal(gapPlan.items[0]?.suggestedNextAction, "no_action");
    assert.equal(gapPlan.items[0]?.suggestedCommand, null);
  });
});

test("manual community review normalizes invalid existing reviewFlagsJson", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "CommunityReviewInvalid111111111111pump";
    await seedToken(client, {
      mint,
      reviewFlagsJson: {
        hasWebsite: "yes",
        hasX: false,
        hasTelegram: false,
        metaplexHit: "unknown",
        descriptionPresent: true,
        linkCount: -1,
        preservedNote: "keep safe metadata",
      },
    });

    const result = await captureManualCommunityReview(
      client,
      {
        mint,
        hasWebsite: false,
        hasX: false,
        hasTelegram: true,
        descriptionPresent: false,
        linkCount: 3,
      },
      {
        now: new Date("2026-05-10T00:20:00.000Z"),
      },
    );

    assert.equal(result.status, "ok");
    const saved = await client.token.findUniqueOrThrow({
      where: {
        mint,
      },
      select: {
        reviewFlagsJson: true,
      },
    });

    assert.deepEqual(saved.reviewFlagsJson, {
      hasWebsite: false,
      hasX: false,
      hasTelegram: true,
      metaplexHit: false,
      descriptionPresent: false,
      linkCount: 3,
      preservedNote: "keep safe metadata",
      source: "manual_community_review",
      reviewedAt: "2026-05-10T00:20:00.000Z",
    });

    const observation = await buildTokenObservationReport(client, mint);
    assert.equal(observation.communitySnapshot.hasTelegram, true);
    assert.equal(observation.communitySnapshot.linkCount, 3);
    assert.ok(!observation.observationGaps.includes("community_links_not_recorded"));
  });
});

test("manual community review returns not_found for missing token", async () => {
  await withTempDb(async ({ client }) => {
    const result = await captureManualCommunityReview(client, {
      mint: "CommunityReviewMissing111111111pump",
      hasWebsite: false,
      hasX: false,
      hasTelegram: false,
      descriptionPresent: false,
    });

    assert.equal(result.status, "not_found");
    assert.equal(result.updated, false);
    assert.equal(result.reviewFlagsJson, null);
  });
});

test("manual community review rejects invalid linkCount", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "CommunityReviewBadLinkCount111111pump";
    await seedToken(client, {
      mint,
    });

    await assert.rejects(
      captureManualCommunityReview(client, {
        mint,
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        descriptionPresent: false,
        linkCount: -1,
      }),
      /Invalid linkCount/,
    );
  });
});

test("community review args reject invalid boolean before writing", async () => {
  await withTempDb(async ({ client }) => {
    await seedToken(client, {
      mint: "CommunityReviewBadBoolean111111pump",
    });
    const before = await counts(client);

    assert.throws(
      () =>
        parseCommunityReviewArgs([
          "--mint",
          "CommunityReviewBadBoolean111111pump",
          "--hasWebsite",
          "yes",
          "--hasX",
          "false",
          "--hasTelegram",
          "false",
          "--descriptionPresent",
          "true",
        ]),
      /Invalid boolean/,
    );

    const after = await counts(client);
    assert.deepEqual(after, before);
  });
});

test("manual community review output does not expose trading recommendation fields", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "CommunityReviewNoTrading111111111pump";
    await seedToken(client, {
      mint,
    });

    const result = await captureManualCommunityReview(client, {
      mint,
      hasWebsite: true,
      hasX: false,
      hasTelegram: false,
      descriptionPresent: true,
    });
    const observation = await buildTokenObservationReport(client, mint);
    const serialized = JSON.stringify({
      result,
      observation,
    });

    assert.doesNotMatch(serialized, /buySignal/);
    assert.doesNotMatch(serialized, /shouldBuy/);
    assert.doesNotMatch(serialized, /positionSize/);
    assert.doesNotMatch(serialized, /exitDecision/);
    assert.doesNotMatch(serialized, /buyRecommendation/);
    assert.doesNotMatch(serialized, /tradingRecommendation/);
    assert.doesNotMatch(serialized, /financialAdvice/);
    assert.doesNotMatch(serialized, /rawJson/);
  });
});
