import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";

import { captureManualTokenObservation } from "../src/cli/tokenObserve.ts";
import { buildTokenObservationReport } from "../src/cli/tokenObservation.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-token-observation-"));
  const databaseUrl = `file:${join(dir, "token-observation.db")}`;

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
    withMetric?: boolean;
    withNotification?: boolean;
    reviewFlagsJson?: Prisma.InputJsonValue | null;
    entrySnapshot?: Prisma.InputJsonValue | null;
  },
): Promise<void> {
  const token = await client.token.create({
    data: {
      mint: input.mint,
      name: "Observation Token",
      symbol: "OBS",
      source: "test-observation",
      metadataStatus: "partial",
      scoreRank: "B",
      scoreTotal: 17,
      hardRejected: false,
      hardRejectReason: null,
      reviewFlagsJson: input.reviewFlagsJson ?? undefined,
      entrySnapshot: input.entrySnapshot ?? undefined,
      importedAt: new Date("2026-05-01T00:00:00.000Z"),
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
    },
    select: {
      id: true,
    },
  });

  if (input.withMetric) {
    await client.metric.create({
      data: {
        tokenId: token.id,
        source: "test-observation-metric",
        observedAt: new Date("2026-05-01T00:10:00.000Z"),
        peakPrice15m: 0.002,
        maxMultiple15m: 2,
        peakFdv24h: 250000,
        volume24h: 50000,
        rawJson: {
          token: {
            priceUsd: 0.001,
            fdvUsd: 200000,
            totalReserveInUsd: 12000,
          },
          topPool: {
            address: "pool",
          },
        },
      },
    });
  }

  if (input.withNotification) {
    await client.notification.create({
      data: {
        notificationKey: `${input.mint}:metric_appended:1`,
        eventType: "metric_appended",
        mint: input.mint,
        tokenId: token.id,
        metricId: 1,
        trigger: "metric_appended",
        status: "sent",
        mode: "live_send",
        messagePreview: "safe preview",
        sentAt: new Date("2026-05-01T00:11:00.000Z"),
        rawJsonFree: true,
        secretFree: true,
        source: "test-observation",
        lastAttemptAt: new Date("2026-05-01T00:11:00.000Z"),
      },
    });
  }
}

test("token observation report returns a read-only observation view for an existing token", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "Observation111111111111111111111111111pump";
    await seedToken(client, {
      mint,
      withMetric: true,
      withNotification: true,
    });

    const before = {
      token: await client.token.count(),
      metric: await client.metric.count(),
      notification: await client.notification.count(),
    };
    const report = await buildTokenObservationReport(client, mint, {
      now: new Date("2026-05-01T00:12:00.000Z"),
    });
    const after = {
      token: await client.token.count(),
      metric: await client.metric.count(),
      notification: await client.notification.count(),
    };

    assert.deepEqual(after, before);
    assert.equal(report.status, "ok");
    assert.equal(report.mode, "read_only_token_observation_report");
    assert.equal(report.tokenIdentity?.mint, mint);
    assert.equal(report.tokenIdentity?.scoreRank, "B");
    assert.equal(report.narrativeSnapshot.narrativeCategory, "not_observed");
    assert.equal(report.narrativeSnapshot.attentionSource, "test-observation");
    assert.equal(report.communitySnapshot.source, "not_observed");
    assert.equal(report.communitySnapshot.hasWebsite, "not_observed");
    assert.equal(report.riskSnapshot.hardRejected, false);
    assert.equal(report.riskSnapshot.topHolderPct, "not_observed");
    assert.equal(report.metricOutcomeSnapshot.metricCount, 1);
    assert.equal(report.metricOutcomeSnapshot.latestMetricMissing, false);
    assert.equal(report.metricOutcomeSnapshot.latestMetric?.peakFdv24h, 250000);
    assert.deepEqual(report.metricOutcomeSnapshot.latestMetric?.safeSummary, {
      priceUsdPresent: true,
      fdvUsdPresent: true,
      reserveUsdPresent: true,
      topPoolPresent: true,
    });
    assert.equal(report.notificationSnapshot.notificationCount, 1);
    assert.equal(report.notificationSnapshot.sentCount, 1);
    assert.equal(report.notificationSnapshot.failedCount, 0);
    assert.equal(report.notificationSnapshot.retryCandidateCount, 0);
    assert.equal(report.notificationSnapshot.sentRowResendEnabled, false);
    assert.ok(report.observationGaps.includes("narrativeCategory_not_recorded"));
    assert.ok(report.observationGaps.includes("community_links_not_recorded"));
    assert.ok(report.observationGaps.includes("holder_distribution_not_recorded"));
    assert.ok(report.nextReviewHints.includes("classify narrative manually"));
    assert.ok(report.nextReviewHints.includes("add community URL if known"));
    assert.equal(report.safetyBoundary.reviewOnly, true);
    assert.equal(report.safetyBoundary.advisoryOutput, false);
    assert.equal(report.safetyBoundary.sizingGuidance, false);
    assert.equal(report.safetyBoundary.disposalGuidance, false);
  });
});

test("token observation report reflects reviewFlagsJson as community snapshot", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationReviewFlags11111111111111111pump";
    await seedToken(client, {
      mint,
      withMetric: true,
      withNotification: false,
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: true,
        hasTelegram: true,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 3,
      },
    });

    const before = await client.token.count();
    const report = await buildTokenObservationReport(client, mint);
    const after = await client.token.count();

    assert.equal(after, before);
    assert.equal(report.status, "ok");
    assert.deepEqual(report.communitySnapshot, {
      hasWebsite: true,
      hasX: true,
      hasTelegram: true,
      linkCount: 3,
      metaplexHit: true,
      descriptionPresent: true,
      source: "reviewFlagsJson",
    });
    assert.ok(!report.observationGaps.includes("community_links_not_recorded"));
    assert.ok(!report.observationGaps.includes("description_not_recorded"));
    assert.ok(!report.nextReviewHints.includes("add community URL if known"));
    assert.ok(report.observationGaps.includes("holder_distribution_not_recorded"));
    assert.ok(report.observationGaps.includes("market_condition_not_recorded"));
    assert.ok(report.observationGaps.includes("outcome_label_not_recorded"));
  });
});

test("manual token observation capture stores manualObservation without changing review flags", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationManual111111111111111111111pump";
    await seedToken(client, {
      mint,
      withMetric: true,
      withNotification: false,
      entrySnapshot: {
        stage: "mint_only",
        capturedAt: "2026-05-01T00:00:00.000Z",
      },
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: false,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 1,
      },
    });

    const before = {
      token: await client.token.count(),
      metric: await client.metric.count(),
      notification: await client.notification.count(),
    };
    const result = await captureManualTokenObservation(
      client,
      {
        mint,
        narrativeCategory: "animal",
        whyWatch: "community meme under review",
        outcomeLabel: "watched",
        operatorNote: "manual review context only",
      },
      {
        now: new Date("2026-05-01T00:20:00.000Z"),
      },
    );
    const after = {
      token: await client.token.count(),
      metric: await client.metric.count(),
      notification: await client.notification.count(),
    };

    assert.deepEqual(after, before);
    assert.equal(result.status, "ok");
    assert.equal(result.updated, true);
    assert.deepEqual(result.manualObservation, {
      schemaVersion: 1,
      source: "manual",
      narrativeCategory: "animal",
      whyWatch: "community meme under review",
      outcomeLabel: "watched",
      operatorNote: "manual review context only",
      reviewedAt: "2026-05-01T00:20:00.000Z",
    });

    const saved = await client.token.findUniqueOrThrow({
      where: {
        mint,
      },
      select: {
        entrySnapshot: true,
        reviewFlagsJson: true,
      },
    });
    assert.deepEqual(saved.reviewFlagsJson, {
      hasWebsite: true,
      hasX: false,
      hasTelegram: false,
      metaplexHit: true,
      descriptionPresent: true,
      linkCount: 1,
    });
    assert.equal(
      (saved.entrySnapshot as Record<string, unknown>).stage,
      "mint_only",
    );
    assert.deepEqual(
      (saved.entrySnapshot as Record<string, unknown>).manualObservation,
      result.manualObservation,
    );

    const report = await buildTokenObservationReport(client, mint);
    assert.equal(report.manualObservation?.narrativeCategory, "animal");
    assert.equal(report.manualObservation?.whyWatch, "community meme under review");
    assert.equal(report.manualObservation?.outcomeLabel, "watched");
    assert.equal(report.narrativeSnapshot.narrativeCategory, "animal");
    assert.equal(report.metricOutcomeSnapshot.outcomeLabel, "watched");
    assert.ok(!report.observationGaps.includes("narrativeCategory_not_recorded"));
    assert.ok(!report.observationGaps.includes("outcome_label_not_recorded"));
    assert.ok(!report.observationGaps.includes("thesis_not_recorded"));
    assert.ok(!report.nextReviewHints.includes("classify narrative manually"));
    assert.ok(!report.nextReviewHints.includes("capture watch or skip thesis manually"));
    assert.ok(!report.nextReviewHints.includes("add community URL if known"));
  });
});

test("manual token observation capture returns not_found for missing mint", async () => {
  await withTempDb(async ({ client }) => {
    const result = await captureManualTokenObservation(client, {
      mint: "ObservationMissingManual111111111111pump",
      outcomeLabel: "unknown",
    });

    assert.equal(result.status, "not_found");
    assert.equal(result.updated, false);
    assert.equal(result.manualObservation, null);
  });
});

test("manual token observation capture rejects invalid values", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationRejectManual111111111111pump";
    await seedToken(client, {
      mint,
    });

    await assert.rejects(
      captureManualTokenObservation(client, {
        mint,
        narrativeCategory: "buy_now" as never,
      }),
      /Invalid narrativeCategory/,
    );
    await assert.rejects(
      captureManualTokenObservation(client, {
        mint,
        outcomeLabel: "moon" as never,
      }),
      /Invalid outcomeLabel/,
    );
  });
});

test("token observation report treats null reviewFlagsJson as not_observed", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationNullReviewFlags111111111111pump";
    await seedToken(client, {
      mint,
      reviewFlagsJson: null,
    });

    const report = await buildTokenObservationReport(client, mint);

    assert.equal(report.status, "ok");
    assert.equal(report.communitySnapshot.source, "not_observed");
    assert.equal(report.communitySnapshot.hasWebsite, "not_observed");
    assert.equal(report.communitySnapshot.linkCount, "not_observed");
    assert.ok(report.observationGaps.includes("community_links_not_recorded"));
    assert.ok(report.observationGaps.includes("description_not_recorded"));
  });
});

test("token observation report treats invalid reviewFlagsJson shape as not_observed", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationBadReviewFlags1111111111111pump";
    await seedToken(client, {
      mint,
      reviewFlagsJson: {
        hasWebsite: "yes",
        hasX: true,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: -1,
      },
    });

    const report = await buildTokenObservationReport(client, mint);

    assert.equal(report.status, "ok");
    assert.equal(report.communitySnapshot.source, "not_observed");
    assert.equal(report.communitySnapshot.hasX, "not_observed");
    assert.ok(report.observationGaps.includes("community_links_not_recorded"));
    assert.ok(report.nextReviewHints.includes("add community URL if known"));
  });
});

test("token observation report returns safe not_found when the mint is missing", async () => {
  await withTempDb(async ({ client }) => {
    const report = await buildTokenObservationReport(
      client,
      "MissingObservation111111111111111111111pump",
    );

    assert.equal(report.status, "not_found");
    assert.equal(report.tokenIdentity, null);
    assert.equal(report.metricOutcomeSnapshot.metricCount, 0);
    assert.equal(report.notificationSnapshot.notificationCount, 0);
    assert.equal(report.notificationSnapshot.sentRowResendEnabled, false);
    assert.ok(report.observationGaps.includes("metric_observation_missing"));
    assert.ok(report.observationGaps.includes("notification_observation_missing"));
  });
});

test("token observation report handles tokens without metrics or notifications", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationEmpty111111111111111111111111pump";
    await seedToken(client, {
      mint,
      withMetric: false,
      withNotification: false,
    });

    const report = await buildTokenObservationReport(client, mint);

    assert.equal(report.status, "ok");
    assert.equal(report.metricOutcomeSnapshot.metricCount, 0);
    assert.equal(report.metricOutcomeSnapshot.latestMetric, null);
    assert.equal(report.metricOutcomeSnapshot.latestMetricMissing, true);
    assert.equal(report.notificationSnapshot.notificationCount, 0);
    assert.equal(report.notificationSnapshot.latestNotification, null);
    assert.ok(report.observationGaps.includes("metric_observation_missing"));
    assert.ok(report.observationGaps.includes("notification_observation_missing"));
  });
});

test("token observation report does not expose buy-signal or trading recommendation fields", async () => {
  await withTempDb(async ({ client }) => {
    const mint = "ObservationNoBuy11111111111111111111111pump";
    await seedToken(client, {
      mint,
      withMetric: true,
      withNotification: true,
    });

    const report = await buildTokenObservationReport(client, mint);
    const serialized = JSON.stringify(report);

    assert.doesNotMatch(serialized, /shouldBuy/);
    assert.doesNotMatch(serialized, /positionSize/);
    assert.doesNotMatch(serialized, /exitDecision/);
    assert.doesNotMatch(serialized, /buyRecommendation/);
    assert.doesNotMatch(serialized, /tradingRecommendation/);
    assert.doesNotMatch(serialized, /financialAdvice/);
    assert.doesNotMatch(serialized, /rawJson/);
    assert.equal(report.safetyBoundary.reviewOnly, true);
    assert.equal(report.safetyBoundary.advisoryOutput, false);
    assert.equal(report.safetyBoundary.automaticRetry, false);
    assert.equal(report.safetyBoundary.queue, false);
    assert.equal(report.safetyBoundary.systemd, false);
  });
});
