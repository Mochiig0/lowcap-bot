import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";

import { buildTokensObservationGapsReport } from "../src/cli/tokensObservationGaps.ts";

const execFileAsync = promisify(execFile);

async function withTempDb<T>(
  fn: (ctx: { client: PrismaClient }) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-tokens-observation-gaps-"));
  const databaseUrl = `file:${join(dir, "tokens-observation-gaps.db")}`;

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
    withMetric?: boolean;
    withNotification?: boolean;
    source?: string;
    scoreRank?: string;
    reviewFlagsJson?: Prisma.InputJsonValue | null;
    entrySnapshot?: Prisma.InputJsonValue | null;
  },
): Promise<void> {
  const token = await client.token.create({
    data: {
      mint: input.mint,
      name: `Observation ${input.mint.slice(0, 4)}`,
      symbol: "OGAP",
      source: input.source ?? "test-observation-gaps",
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
        source: "test-observation-gaps-metric",
        observedAt: new Date(input.createdAt.getTime() + 60_000),
        peakFdv24h: 200000,
        volume24h: 40000,
        rawJson: {
          token: {
            priceUsd: 0.001,
            fdvUsd: 150000,
            totalReserveInUsd: 9000,
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
        sentAt: new Date(input.createdAt.getTime() + 120_000),
        rawJsonFree: true,
        secretFree: true,
        source: "test-observation-gaps",
      },
    });
  }
}

function counts(client: PrismaClient): Promise<{
  token: number;
  metric: number;
  notification: number;
}> {
  return Promise.all([
    client.token.count(),
    client.metric.count(),
    client.notification.count(),
  ]).then(([token, metric, notification]) => ({
    token,
    metric,
    notification,
  }));
}

test("tokens observation gaps report extracts multi-token manual-observation candidates", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "GapQueueMetricMissingManual111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      withMetric: true,
      withNotification: true,
    });
    await seedToken(client, {
      mint: "GapQueueManualPresent11111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      withMetric: true,
      withNotification: false,
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

    const before = await counts(client);
    const report = await buildTokensObservationGapsReport(
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
    assert.equal(report.mode, "read_only_tokens_observation_gap_queue");
    assert.equal(report.readOnly, true);
    assert.equal(report.willWrite, false);
    assert.equal(report.advisoryOutput, false);
    assert.equal(report.automaticRetry, false);
    assert.equal(report.queue, false);
    assert.equal(report.systemd, false);
    assert.equal(report.selection.totalScanned, 2);
    assert.equal(report.selection.totalMatched, 2);
    assert.equal(report.summary.manualObservationPresentCount, 1);
    assert.equal(report.summary.manualObservationMissingCount, 1);
    assert.equal(report.summary.narrativeMissingCount, 1);
    assert.equal(report.summary.outcomeMissingCount, 1);
    assert.equal(report.items.length, 2);
    assert.equal(report.items[0]?.manualObservationPresent, false);
    assert.equal(report.items[0]?.priority, "high");
    assert.equal(report.items[0]?.priorityReason, "metrics_present_manual_observation_missing");
    assert.equal(report.items[0]?.nextAction, "manual_observation_needed");
    assert.match(
      report.items[0]?.suggestedManualObserveCommand ?? "",
      /pnpm -s token:observe -- --mint GapQueueMetricMissingManual/,
    );
    assert.match(
      report.items[0]?.suggestedManualObserveCommand ?? "",
      /--whyWatch "manual review context only"/,
    );
    assert.equal(report.items[1]?.manualObservationPresent, true);
    assert.equal(report.items[1]?.nextAction, "manual_observation_already_present");
    assert.equal(report.items[1]?.suggestedManualObserveCommand, null);
    assert.equal(
      report.items[1]?.priorityReason,
      "manual_observation_complete_remaining_unsupported_gaps",
    );
  });
});

test("tokens observation gaps report applies gap, pumpOnly, rank, and limit filters", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "GapQueuePumpA11111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      withMetric: true,
      scoreRank: "A",
    });
    await seedToken(client, {
      mint: "GapQueuePumpB11111111111111111111pump",
      createdAt: new Date("2026-05-09T22:00:00.000Z"),
      withMetric: true,
      scoreRank: "B",
    });
    await seedToken(client, {
      mint: "GapQueueNonPumpA1111111111111111111",
      createdAt: new Date("2026-05-09T21:00:00.000Z"),
      withMetric: true,
      scoreRank: "A",
    });

    const report = await buildTokensObservationGapsReport(
      client,
      {
        limit: 1,
        sinceHours: 48,
        pumpOnly: true,
        rank: "A",
        gap: "outcome_label_not_recorded",
      },
      { now },
    );

    assert.equal(report.selection.pumpOnly, true);
    assert.equal(report.selection.rank, "A");
    assert.equal(report.selection.gap, "outcome_label_not_recorded");
    assert.equal(report.selection.totalScanned, 1);
    assert.equal(report.selection.totalMatched, 1);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.mint, "GapQueuePumpA11111111111111111111pump");
  });
});

test("tokens observation gaps report classifies community-link candidates without writing", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "GapQueueCommunity11111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      withMetric: false,
      withNotification: false,
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: true,
        hasTelegram: false,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 2,
      },
    });

    const before = await counts(client);
    const report = await buildTokensObservationGapsReport(
      client,
      {
        limit: 5,
        sinceHours: 48,
        pumpOnly: true,
      },
      { now },
    );
    const after = await counts(client);

    assert.deepEqual(after, before);
    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.priority, "medium");
    assert.equal(report.items[0]?.nextAction, "manual_observation_needed");
    assert.equal(
      report.items[0]?.priorityReason,
      "community_links_present_manual_observation_missing",
    );
    assert.ok(
      !report.items[0]?.observationGaps.includes("community_links_not_recorded"),
    );
  });
});

test("tokens observation gaps report does not suggest token:observe for unsupported-only gaps", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "GapQueueUnsupportedOnly111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      withMetric: true,
      withNotification: true,
      entrySnapshot: {
        manualObservation: {
          schemaVersion: 1,
          source: "manual",
          narrativeCategory: "crypto_meta",
          whyWatch: "manual context",
          outcomeLabel: "watched",
          operatorNote: "review context only",
          reviewedAt: "2026-05-09T23:30:00.000Z",
        },
      },
      reviewFlagsJson: {
        hasWebsite: true,
        hasX: true,
        hasTelegram: true,
        metaplexHit: true,
        descriptionPresent: true,
        linkCount: 3,
      },
    });

    const report = await buildTokensObservationGapsReport(
      client,
      {
        limit: 5,
        sinceHours: 48,
        pumpOnly: true,
      },
      { now },
    );

    assert.equal(report.items.length, 1);
    assert.equal(report.items[0]?.manualObservationPresent, true);
    assert.equal(report.items[0]?.suggestedManualObserveCommand, null);
    assert.equal(report.items[0]?.nextAction, "manual_observation_already_present");
    assert.ok(
      report.items[0]?.observationGaps.includes("holder_distribution_not_recorded"),
    );
    assert.ok(
      report.items[0]?.observationGaps.includes("market_condition_not_recorded"),
    );
    assert.ok(
      !report.items[0]?.observationGaps.includes("narrativeCategory_not_recorded"),
    );
    assert.ok(!report.items[0]?.observationGaps.includes("thesis_not_recorded"));
    assert.ok(
      !report.items[0]?.observationGaps.includes("outcome_label_not_recorded"),
    );
    assert.equal(
      report.items[0]?.priorityReason,
      "manual_observation_complete_remaining_unsupported_gaps",
    );
  });
});

test("tokens observation gaps report does not expose trading recommendation fields", async () => {
  await withTempDb(async ({ client }) => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    await seedToken(client, {
      mint: "GapQueueNoTrading111111111111111111pump",
      createdAt: new Date("2026-05-09T23:00:00.000Z"),
      withMetric: true,
    });

    const report = await buildTokensObservationGapsReport(
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
