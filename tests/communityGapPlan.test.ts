import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";

import { buildCommunityGapPlan } from "../src/cli/communityGapPlan.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-community-gap-plan-"));
  const databaseUrl = `file:${join(dir, "community-gap-plan.db")}`;

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
    return await fn({ client });
  } finally {
    await client.$disconnect();
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedToken(
  client: PrismaClient,
  input: {
    mint: string;
    createdAt: Date;
    metadataStatus?: string;
    source?: string;
    enrichedAt?: Date | null;
    reviewFlagsJson?: Prisma.InputJsonValue | null;
  },
): Promise<void> {
  await client.token.create({
    data: {
      mint: input.mint,
      name: `Community ${input.mint.slice(0, 4)}`,
      symbol: "CGAP",
      source: input.source ?? "geckoterminal.new_pools",
      metadataStatus: input.metadataStatus ?? "partial",
      scoreRank: "B",
      scoreTotal: 17,
      hardRejected: false,
      hardRejectReason: null,
      reviewFlagsJson: input.reviewFlagsJson ?? undefined,
      enrichedAt: input.enrichedAt ?? undefined,
      importedAt: input.createdAt,
      createdAt: input.createdAt,
    },
  });
}

function counts(client: PrismaClient): Promise<{ token: number }> {
  return client.token.count().then((token) => ({ token }));
}

test("community gap plan classifies missing, invalid, no-link, and linked review flags", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "CommunityMissing111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      metadataStatus: "mint_only",
      reviewFlagsJson: null,
    });
    await seedToken(client, {
      mint: "CommunityInvalid111111111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      enrichedAt: new Date("2026-05-09T22:30:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: "yes",
        hasX: false,
        hasTelegram: false,
        metaplexHit: false,
        descriptionPresent: true,
        linkCount: -1,
      },
    });
    await seedToken(client, {
      mint: "CommunityNoLinks11111111111111111pump",
      createdAt: new Date("2026-05-09T21:00:00.000Z"),
      enrichedAt: new Date("2026-05-09T21:30:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 0,
      },
    });
    await seedToken(client, {
      mint: "CommunityReviewedNoLinks11111111pump",
      createdAt: new Date("2026-05-09T20:30:00.000Z"),
      enrichedAt: new Date("2026-05-09T20:45:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: false,
        descriptionPresent: false,
        linkCount: 0,
        source: "manual_community_review",
        reviewedAt: "2026-05-09T20:40:00.000Z",
        operatorNote: "manual community review context only",
      },
    });
    await seedToken(client, {
      mint: "CommunityWithLinks111111111111111pump",
      createdAt: new Date("2026-05-09T20:00:00.000Z"),
      enrichedAt: new Date("2026-05-09T20:30:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: false,
        hasTelegram: true,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 2,
      },
    });

    const before = await counts(client);
    const report = await buildCommunityGapPlan(
      client,
      {
        limit: 10,
        sinceHours: 48,
        pumpOnly: true,
      },
      { now },
    );
    const after = await counts(client);

    assert.deepEqual(after, before);
    assert.equal(report.mode, "read_only_community_gap_plan");
    assert.equal(report.readOnly, true);
    assert.equal(report.willWrite, false);
    assert.equal(report.willFetch, false);
    assert.equal(report.willSendTelegram, false);
    assert.equal(report.advisoryOutput, false);
    assert.equal(report.queue, false);
    assert.equal(report.systemd, false);
    assert.equal(report.selection.totalScanned, 5);
    assert.equal(report.selection.totalMatched, 4);
    assert.equal(report.summary.communityLinksMissingCount, 4);
    assert.equal(report.summary.reviewFlagsMissingCount, 1);
    assert.equal(report.summary.reviewFlagsInvalidCount, 1);
    assert.equal(report.summary.reviewedNoLinksCount, 1);
    assert.equal(report.summary.metadataMintOnlyCount, 1);
    assert.equal(report.summary.enrichedButNoCommunityLinksCount, 2);
    assert.equal(report.summary.suggestedEnrichCount, 1);
    assert.equal(report.summary.suggestedManualReviewCount, 1);
    assert.equal(report.summary.noActionCount, 1);

    const items = new Map(report.items.map((item) => [item.mint, item]));

    assert.equal(
      items.get("CommunityMissing111111111111111111pump")?.reviewFlagsState,
      "missing",
    );
    assert.equal(
      items.get("CommunityMissing111111111111111111pump")?.suggestedNextAction,
      "enrich_metadata",
    );
    assert.match(
      items.get("CommunityMissing111111111111111111pump")?.suggestedCommand ?? "",
      /pnpm -s token:enrich-rescore:geckoterminal -- --mint CommunityMissing/,
    );

    assert.equal(
      items.get("CommunityInvalid111111111111111111pump")?.reviewFlagsState,
      "invalid",
    );
    assert.equal(
      items.get("CommunityInvalid111111111111111111pump")?.suggestedNextAction,
      "inspect_review_flags",
    );
    assert.equal(
      items.get("CommunityInvalid111111111111111111pump")?.suggestedCommand,
      null,
    );

    assert.equal(
      items.get("CommunityNoLinks11111111111111111pump")?.reviewFlagsState,
      "present_no_links",
    );
    assert.equal(
      items.get("CommunityNoLinks11111111111111111pump")?.suggestedNextAction,
      "manual_review_community_links",
    );
    assert.equal(
      items.get("CommunityNoLinks11111111111111111pump")?.hasWebsite,
      false,
    );
    assert.equal(
      items.get("CommunityNoLinks11111111111111111pump")?.linkCount,
      0,
    );
    assert.equal(
      items.get("CommunityReviewedNoLinks11111111pump")?.reviewFlagsState,
      "reviewed_no_links",
    );
    assert.equal(
      items.get("CommunityReviewedNoLinks11111111pump")?.communityGapPresent,
      true,
    );
    assert.equal(
      items.get("CommunityReviewedNoLinks11111111pump")?.suggestedNextAction,
      "no_action",
    );
    assert.equal(
      items.get("CommunityReviewedNoLinks11111111pump")?.suggestedCommand,
      null,
    );
    assert.match(
      items.get("CommunityReviewedNoLinks11111111pump")?.note ?? "",
      /manual community review already confirmed no public community links/,
    );
    assert.equal(items.has("CommunityWithLinks111111111111111pump"), false);
  });
});

test("community gap plan applies pumpOnly and limit", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "CommunityPumpOne111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      metadataStatus: "mint_only",
      reviewFlagsJson: null,
    });
    await seedToken(client, {
      mint: "CommunityPumpTwo111111111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      metadataStatus: "mint_only",
      reviewFlagsJson: null,
    });
    await seedToken(client, {
      mint: "CommunityNonPump111111111111111111",
      createdAt: new Date("2026-05-09T21:00:00.000Z"),
      metadataStatus: "mint_only",
      reviewFlagsJson: null,
    });

    const report = await buildCommunityGapPlan(
      client,
      {
        limit: 1,
        sinceHours: 48,
        pumpOnly: true,
      },
      { now },
    );

    assert.equal(report.selection.pumpOnly, true);
    assert.equal(report.selection.totalScanned, 2);
    assert.equal(report.selection.totalMatched, 2);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.mint, "CommunityPumpOne111111111111111111pump");
  });
});

test("community gap plan does not expose trading recommendation fields", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "CommunityNoTrading1111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      metadataStatus: "mint_only",
      reviewFlagsJson: null,
    });

    const report = await buildCommunityGapPlan(
      client,
      {
        limit: 5,
        sinceHours: 48,
        pumpOnly: true,
      },
      { now },
    );
    const serialized = JSON.stringify(report);

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
