import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";

import { buildHolderDistributionGapPlan } from "../src/cli/holderDistributionGapPlan.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-holder-gap-plan-"));
  const databaseUrl = `file:${join(dir, "holder-gap-plan.db")}`;

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
    source?: string;
    scoreRank?: string;
    withMetric?: boolean;
    withHolderSnapshot?: boolean;
    reviewFlagsJson?: Prisma.InputJsonValue | null;
    entrySnapshot?: Prisma.InputJsonValue | null;
  },
): Promise<void> {
  const token = await client.token.create({
    data: {
      mint: input.mint,
      name: `Holder ${input.mint.slice(0, 4)}`,
      symbol: "HGAP",
      source: input.source ?? "test-holder-gap-plan",
      metadataStatus: "partial",
      scoreRank: input.scoreRank ?? "B",
      scoreTotal: 17,
      hardRejected: false,
      hardRejectReason: null,
      reviewFlagsJson: input.reviewFlagsJson ?? undefined,
      entrySnapshot: input.entrySnapshot ?? undefined,
      importedAt: input.createdAt,
      createdAt: input.createdAt,
    },
    select: {
      id: true,
    },
  });

  if (input.withMetric) {
    await client.metric.create({
      data: {
        tokenId: token.id,
        source: "test-holder-gap-metric",
        observedAt: new Date(input.createdAt.getTime() + 60_000),
        peakFdv24h: 200000,
        volume24h: 40000,
        rawJson: {
          token: {
            priceUsd: 0.001,
            fdvUsd: 150000,
          },
        },
      },
    });
  }

  if (input.withHolderSnapshot) {
    await client.holderSnapshot.create({
      data: {
        tokenId: token.id,
        source: "manual_holder_review",
        observedAt: new Date(input.createdAt.getTime() + 120_000),
        topHolderPct: null,
        top10HolderPct: null,
        holderCount: null,
        freshWalletCount: null,
        bundlerSignal: "unknown",
        sameFundingOriginSignal: "unknown",
        lpWalletExcluded: null,
        confidence: "low",
        rawFree: true,
        secretFree: true,
      },
    });
  }
}

function counts(client: PrismaClient): Promise<{
  token: number;
  metric: number;
  holderSnapshot: number;
}> {
  return Promise.all([
    client.token.count(),
    client.metric.count(),
    client.holderSnapshot.count(),
  ]).then(([token, metric, holderSnapshot]) => ({
    token,
    metric,
    holderSnapshot,
  }));
}

test("holder distribution gap plan extracts read-only candidates and priority reasons", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "HolderGapMetric111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      scoreRank: "A",
      withMetric: true,
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 1,
      },
    });
    await seedToken(client, {
      mint: "HolderGapManual11111111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      scoreRank: "A",
      entrySnapshot: {
        manualObservation: {
          schemaVersion: 1,
          source: "manual",
          narrativeCategory: "crypto_meta",
          whyWatch: "manual context",
          outcomeLabel: "watched",
          operatorNote: "review context only",
          reviewedAt: "2026-05-09T22:30:00.000Z",
        },
      },
    });
    await seedToken(client, {
      mint: "HolderGapCommunity11111111111111pump",
      createdAt: new Date("2026-05-09T21:00:00.000Z"),
      scoreRank: "A",
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 0,
        source: "manual_community_review",
        reviewedAt: "2026-05-09T21:30:00.000Z",
      },
    });
    await seedToken(client, {
      mint: "HolderGapSourceOnly111111111111pump",
      createdAt: new Date("2026-05-09T20:00:00.000Z"),
      scoreRank: "A",
    });

    const before = await counts(client);
    const report = await buildHolderDistributionGapPlan(
      client,
      {
        limit: 10,
        sinceHours: 48,
        pumpOnly: true,
        rank: "A",
      },
      { now },
    );
    const after = await counts(client);

    assert.deepEqual(after, before);
    assert.equal(report.safety.mode, "read_only_holder_distribution_gap_plan");
    assert.equal(report.safety.readOnly, true);
    assert.equal(report.safety.willWrite, false);
    assert.equal(report.safety.willFetch, false);
    assert.equal(report.safety.willSendTelegram, false);
    assert.equal(report.safety.queue, false);
    assert.equal(report.safety.systemd, false);
    assert.equal(report.selection.totalScanned, 4);
    assert.equal(report.selection.totalMatched, 4);
    assert.equal(report.summary.holderDistributionMissingCount, 4);
    assert.equal(report.summary.holderSnapshotPresentCount, 0);
    assert.equal(report.summary.holderSnapshotMissingCount, 4);
    assert.equal(report.summary.metricPresentCount, 1);
    assert.equal(report.summary.manualObservationPresentCount, 1);
    assert.equal(report.summary.communityReviewedCount, 2);
    assert.equal(report.summary.highPriorityCandidateCount, 3);
    assert.equal(report.summary.sourcePlanOnlyCount, 1);
    assert.equal(report.items.length, 4);
    assert.ok(report.items.every((item) => item.holderDistributionGapPresent));
    assert.ok(report.items.every((item) => item.suggestedCommand === null));
    assert.ok(
      report.items.every(
        (item) => item.suggestedNextCapability === "holder_distribution_snapshot",
      ),
    );
    assert.ok(
      report.items.every((item) => item.sourcePlan === "read_only_design_first"),
    );

    const byMint = new Map(report.items.map((item) => [item.mint, item]));
    assert.equal(
      byMint.get("HolderGapMetric111111111111111111pump")?.priorityReason,
      "metric_present_holder_gap_missing",
    );
    assert.equal(
      byMint.get("HolderGapManual11111111111111111pump")?.manualObservationPresent,
      true,
    );
    assert.equal(
      byMint.get("HolderGapManual11111111111111111pump")?.outcomeLabel,
      "watched",
    );
    assert.equal(
      byMint.get("HolderGapManual11111111111111111pump")?.priorityReason,
      "manual_context_present_holder_gap_missing",
    );
    assert.equal(
      byMint.get("HolderGapCommunity11111111111111pump")?.communityState,
      "reviewed_no_links",
    );
    assert.equal(
      byMint.get("HolderGapCommunity11111111111111pump")?.priorityReason,
      "community_context_present_holder_gap_missing",
    );
    assert.equal(
      byMint.get("HolderGapSourceOnly111111111111pump")?.priorityReason,
      "holder_gap_source_design_needed",
    );
  });
});

test("holder distribution gap plan excludes tokens with persisted HolderSnapshot", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "HolderGapPersisted11111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      scoreRank: "B",
      withHolderSnapshot: true,
    });
    await seedToken(client, {
      mint: "HolderGapStillMissing1111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      scoreRank: "B",
    });

    const before = await counts(client);
    const report = await buildHolderDistributionGapPlan(
      client,
      {
        limit: 10,
        sinceHours: 48,
        pumpOnly: true,
        rank: "B",
      },
      { now },
    );
    const after = await counts(client);

    assert.deepEqual(after, before);
    assert.equal(report.selection.totalScanned, 2);
    assert.equal(report.selection.totalMatched, 1);
    assert.equal(report.summary.holderSnapshotPresentCount, 1);
    assert.equal(report.summary.holderSnapshotMissingCount, 1);
    assert.equal(report.summary.holderDistributionMissingCount, 1);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.mint, "HolderGapStillMissing1111111111pump");
    assert.equal(report.items[0]?.holderDistributionGapPresent, true);
    assert.equal(report.items[0]?.suggestedCommand, null);

    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /buySignal/);
    assert.doesNotMatch(serialized, /shouldBuy/);
    assert.doesNotMatch(serialized, /positionSize/);
    assert.doesNotMatch(serialized, /exitDecision/);
    assert.doesNotMatch(serialized, /rawJson/);
  });
});

test("holder distribution gap plan applies pumpOnly, rank, and limit filters", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "HolderGapPumpA111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      scoreRank: "A",
    });
    await seedToken(client, {
      mint: "HolderGapPumpB111111111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      scoreRank: "B",
    });
    await seedToken(client, {
      mint: "HolderGapNonPumpA111111111111111",
      createdAt: new Date("2026-05-09T21:00:00.000Z"),
      scoreRank: "A",
    });

    const report = await buildHolderDistributionGapPlan(
      client,
      {
        limit: 1,
        sinceHours: 48,
        pumpOnly: true,
        rank: "A",
      },
      { now },
    );

    assert.equal(report.selection.pumpOnly, true);
    assert.equal(report.selection.rank, "A");
    assert.equal(report.selection.totalScanned, 1);
    assert.equal(report.selection.totalMatched, 1);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.mint, "HolderGapPumpA111111111111111111pump");
  });
});

test("holder distribution gap plan reads community flags safely and avoids trading fields", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "HolderGapLinks111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: true,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 2,
      },
    });
    await seedToken(client, {
      mint: "HolderGapNoLinks111111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: false,
        linkCount: 0,
      },
    });
    await seedToken(client, {
      mint: "HolderGapInvalid111111111111111pump",
      createdAt: new Date("2026-05-09T21:00:00.000Z"),
      reviewFlagsJson: {
        hasWebsite: "yes",
      },
    });
    await seedToken(client, {
      mint: "HolderGapMissing111111111111111pump",
      createdAt: new Date("2026-05-09T20:00:00.000Z"),
    });

    const before = await counts(client);
    const report = await buildHolderDistributionGapPlan(
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
    const byMint = new Map(report.items.map((item) => [item.mint, item]));
    assert.equal(
      byMint.get("HolderGapLinks111111111111111111pump")?.communityState,
      "present_with_links",
    );
    assert.equal(
      byMint.get("HolderGapNoLinks111111111111111pump")?.communityState,
      "present_no_links",
    );
    assert.equal(
      byMint.get("HolderGapInvalid111111111111111pump")?.communityState,
      "invalid",
    );
    assert.equal(
      byMint.get("HolderGapMissing111111111111111pump")?.communityState,
      "missing",
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
