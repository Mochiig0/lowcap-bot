import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

const GECKO_SOURCE = "geckoterminal.new_pools";

type CommandSuccess = {
  ok: true;
  stdout: string;
  stderr: string;
};

type CommandFailure = {
  ok: false;
  stdout: string;
  stderr: string;
  code: number | null;
};

type CommandResult = CommandSuccess | CommandFailure;

type PendingAgeBucket = "lte5m" | "lte15m" | "lte60m" | "gt60m";

type ReviewQueueItem = {
  mint: string;
  metadataStatus: string;
  scoreTotal: number;
  scoreRank: string;
  hardRejected: boolean;
  hardRejectReason: string | null;
  pendingAgeMinutes: number;
  pendingAgeBucket: PendingAgeBucket;
  metricsCount: number;
  notificationCount?: number;
  holderSnapshotCount?: number;
  latestMetricSource: string | null;
  reviewFlagsCount: number;
  reviewFlags?: {
    hasWebsite: boolean;
    hasX: boolean;
    hasTelegram: boolean;
    metaplexHit: boolean;
    descriptionPresent: boolean;
    linkCount: number;
  } | null;
  notifyCandidateEligible?: boolean;
  notifyCandidateBlockers?: string[];
  rankGapToNotify?: {
    currentRank: string;
    requiredRank: "S";
    currentScore: number;
    summary: string;
  } | null;
  notifyCandidateRule?: string;
  queuesMatched: string[];
  reviewReasons: string[];
};

type OldestPendingPreviewItem = {
  mint: string;
  metadataStatus: string;
  selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
  pendingAgeMinutes: number;
  pendingAgeBucket: PendingAgeBucket;
  queuesMatched: string[];
  reviewFlagsCount: number;
};

type ReviewQueueGeckoterminalOutput = {
  readOnly: boolean;
  originSource: string;
  selection: {
    sinceHours: number;
    limit: number;
    pumpOnly: boolean;
    includeBlockers?: boolean;
    staleAfterHours: number;
    sinceCutoff: string;
    geckoOriginTokenCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    geckoOriginTokenCount: number;
    firstSeenSourceSnapshotCount: number;
    enrichPendingCount: number;
    rescorePendingCount: number;
    metricPendingCount: number;
    enrichPendingAgeBuckets: Record<PendingAgeBucket, number>;
    metricPendingAgeBuckets: Record<PendingAgeBucket, number>;
    enrichPendingAgeMinutesSummary: {
      min: number;
      median: number;
      max: number;
    } | null;
    metricPendingAgeMinutesSummary: {
      min: number;
      median: number;
      max: number;
    } | null;
    notifyCandidateCount: number;
    staleReviewCount: number;
    highPriorityRecentCount: number;
    visibility?: {
      scoreRankDistribution: Record<string, number>;
      scoreTotalDistribution: Record<string, number>;
      metadataStatusDistribution: Record<string, number>;
      metricsCountDistribution: Record<string, number>;
      hardRejectedCount: number;
      notifyCandidateEligibleCount: number;
      notifyCandidateBlockerDistribution: Record<string, number>;
      reviewFlagsPresenceDistribution: Record<string, number>;
    };
  };
  queues: {
    notifyCandidate: ReviewQueueItem[];
    highPriorityRecent: ReviewQueueItem[];
    staleReview: ReviewQueueItem[];
    rescorePending: ReviewQueueItem[];
    enrichPending: ReviewQueueItem[];
    metricPending: ReviewQueueItem[];
  };
  oldestPendingPreview: {
    oldestEnrichPending: OldestPendingPreviewItem[];
    oldestMetricPending: OldestPendingPreviewItem[];
  };
  preview: ReviewQueueItem[];
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-review-queue-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runDbPush(databaseUrl: string): Promise<void> {
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
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runReviewQueueGeckoterminal(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-review-queue-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-review-queue-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalReviewQueue.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
        },
      },
    );

    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8"),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    return {
      ok: true,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    };
  } catch (error) {
    const output = error as {
      code?: number | null;
    };
    const [stdout, stderr] = await Promise.all([
      readFile(stdoutPath, "utf-8").catch(() => ""),
      readFile(stderrPath, "utf-8").catch(() => ""),
    ]);

    return {
      ok: false,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      code: output.code ?? null,
    };
  } finally {
    await rm(stdoutPath, { force: true });
    await rm(stderrPath, { force: true });
  }
}

async function seedReviewQueue(databaseUrl: string): Promise<{
  notifyMint: string;
  pendingMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = Date.now();
    const notifyAt = new Date(now - 30 * 60 * 1_000);
    const pendingAt = new Date(now - 8 * 60 * 60 * 1_000);

    const notifyToken = await db.token.create({
      data: {
        mint: "GeckoQueueNotify111111111111111111111111111111pump",
        name: "Gecko Queue Notify Token",
        symbol: "GQNT",
        source: GECKO_SOURCE,
        metadataStatus: "enriched",
        scoreRank: "S",
        scoreTotal: 91,
        hardRejected: false,
        createdAt: notifyAt,
        importedAt: notifyAt,
        enrichedAt: notifyAt,
        rescoredAt: notifyAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: notifyAt.toISOString(),
          },
        },
        reviewFlagsJson: {
          hasWebsite: true,
          hasX: true,
          hasTelegram: false,
          metaplexHit: true,
          descriptionPresent: true,
          linkCount: 2,
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: notifyToken.id,
        source: "test-gecko-queue-metric",
        observedAt: new Date(now - 10 * 60 * 1_000),
      },
    });

    const pendingToken = await db.token.create({
      data: {
        mint: "GeckoQueuePending11111111111111111111111111111111",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: false,
        createdAt: pendingAt,
        importedAt: pendingAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: pendingAt.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    await db.token.create({
      data: {
        mint: "NonGeckoQueue111111111111111111111111111111111111",
        name: "Non Gecko Queue Token",
        symbol: "NGQT",
        source: "manual",
        metadataStatus: "mint_only",
        scoreRank: "A",
        scoreTotal: 50,
        createdAt: notifyAt,
        importedAt: notifyAt,
      },
    });

    return {
      notifyMint: notifyToken.mint,
      pendingMint: pendingToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

async function seedHighPriorityRecentOnlyToken(databaseUrl: string): Promise<string> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const recentAt = new Date(Date.now() - 5 * 60 * 1_000);
    const token = await db.token.create({
      data: {
        mint: "GeckoQueueRecentA11111111111111111111111111111pump",
        name: "Gecko Queue Recent A Token",
        symbol: "GQRA",
        source: GECKO_SOURCE,
        metadataStatus: "enriched",
        scoreRank: "A",
        scoreTotal: 72,
        hardRejected: false,
        createdAt: recentAt,
        importedAt: recentAt,
        enrichedAt: recentAt,
        rescoredAt: recentAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: recentAt.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    return token.mint;
  } finally {
    await db.$disconnect();
  }
}

async function seedBlockerVisibilityTokens(databaseUrl: string): Promise<{
  eligibleMint: string;
  rankBlockedMint: string;
  hardRejectedMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const baseTime = Date.now() - 2 * 60 * 60 * 1_000;
    const makeDetectedAt = (offsetMinutes: number) =>
      new Date(baseTime - offsetMinutes * 60 * 1_000);

    const eligibleAt = makeDetectedAt(1);
    const eligible = await db.token.create({
      data: {
        mint: "GeckoQueueEligible1111111111111111111111111111pump",
        name: "Eligible Token",
        symbol: "ELIGIBLE",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        scoreRank: "S",
        scoreTotal: 9,
        hardRejected: false,
        createdAt: eligibleAt,
        importedAt: eligibleAt,
        enrichedAt: eligibleAt,
        rescoredAt: eligibleAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: eligibleAt.toISOString(),
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
      },
      select: {
        id: true,
        mint: true,
      },
    });
    await db.metric.create({
      data: {
        tokenId: eligible.id,
        source: "visibility-test-metric",
        observedAt: eligibleAt,
      },
    });

    const rankBlockedAt = makeDetectedAt(2);
    const rankBlocked = await db.token.create({
      data: {
        mint: "GeckoQueueRankBlocked111111111111111111111111pump",
        name: "Rank Blocked Token",
        symbol: "RANKBLOCK",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        scoreRank: "B",
        scoreTotal: 2,
        hardRejected: false,
        createdAt: rankBlockedAt,
        importedAt: rankBlockedAt,
        enrichedAt: rankBlockedAt,
        rescoredAt: rankBlockedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: rankBlockedAt.toISOString(),
          },
        },
        reviewFlagsJson: {
          hasWebsite: true,
          hasX: false,
          hasTelegram: false,
          metaplexHit: false,
          descriptionPresent: false,
          linkCount: 1,
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });
    await db.notification.create({
      data: {
        notificationKey: "visibility-rank-blocked",
        eventType: "test_event",
        mint: rankBlocked.mint,
        tokenId: rankBlocked.id,
        trigger: "test",
        status: "captured",
        mode: "capture_only",
        messagePreview: "safe preview",
        rawJsonFree: true,
        secretFree: true,
      },
    });

    const hardRejectedAt = makeDetectedAt(3);
    const hardRejected = await db.token.create({
      data: {
        mint: "GeckoQueueHardRejected1111111111111111111111pump",
        name: "Hard Rejected Token",
        symbol: "HARDREJ",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        scoreRank: "S",
        scoreTotal: 10,
        hardRejected: true,
        hardRejectReason: "test hard reject",
        createdAt: hardRejectedAt,
        importedAt: hardRejectedAt,
        enrichedAt: hardRejectedAt,
        rescoredAt: hardRejectedAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: hardRejectedAt.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    return {
      eligibleMint: eligible.mint,
      rankBlockedMint: rankBlocked.mint,
      hardRejectedMint: hardRejected.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("reviewQueueGeckoterminal boundary", async (t) => {
  await t.test("returns a gecko review queue with stable top-level counts", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedReviewQueue(databaseUrl);

      const result = await runReviewQueueGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ReviewQueueGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.sinceHours, 24);
      assert.equal(parsed.selection.limit, 5);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.staleAfterHours, 6);
      assert.equal(parsed.selection.geckoOriginTokenCount, 2);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);

      assert.equal(parsed.summary.geckoOriginTokenCount, 2);
      assert.equal(parsed.summary.firstSeenSourceSnapshotCount, 2);
      assert.equal(parsed.summary.enrichPendingCount, 1);
      assert.equal(parsed.summary.rescorePendingCount, 0);
      assert.equal(parsed.summary.metricPendingCount, 1);
      assert.deepEqual(parsed.summary.enrichPendingAgeBuckets, {
        lte5m: 0,
        lte15m: 0,
        lte60m: 0,
        gt60m: 1,
      });
      assert.deepEqual(parsed.summary.metricPendingAgeBuckets, {
        lte5m: 0,
        lte15m: 0,
        lte60m: 0,
        gt60m: 1,
      });
      assert.equal(parsed.summary.enrichPendingAgeMinutesSummary?.min !== null, true);
      assert.equal(parsed.summary.metricPendingAgeMinutesSummary?.min !== null, true);
      assert.equal(parsed.summary.notifyCandidateCount, 1);
      assert.equal(parsed.summary.staleReviewCount, 1);
      assert.equal(parsed.summary.highPriorityRecentCount, 1);

      assert.equal(parsed.queues.notifyCandidate.length, 1);
      assert.equal(parsed.queues.notifyCandidate[0]?.mint, seeded.notifyMint);
      assert.equal(parsed.queues.notifyCandidate[0]?.reviewFlagsCount, 5);
      assert.deepEqual(parsed.queues.notifyCandidate[0]?.queuesMatched, [
        "notifyCandidate",
        "highPriorityRecent",
      ]);
      assert.deepEqual(parsed.queues.notifyCandidate[0]?.reviewReasons, [
        "notify_candidate_s_rank",
        "high_priority_recent_rank",
      ]);
      assert.equal(parsed.queues.highPriorityRecent.length, 1);
      assert.equal(parsed.queues.highPriorityRecent[0]?.mint, seeded.notifyMint);
      assert.equal(parsed.queues.staleReview.length, 1);
      assert.equal(parsed.queues.staleReview[0]?.mint, seeded.pendingMint);
      assert.equal(parsed.queues.staleReview[0]?.pendingAgeBucket, "gt60m");
      assert.equal(parsed.queues.enrichPending.length, 1);
      assert.equal(parsed.queues.enrichPending[0]?.mint, seeded.pendingMint);
      assert.equal(parsed.queues.enrichPending[0]?.metadataStatus, "mint_only");
      assert.equal(parsed.queues.enrichPending[0]?.pendingAgeBucket, "gt60m");
      assert.equal(parsed.queues.metricPending.length, 1);
      assert.equal(parsed.queues.metricPending[0]?.mint, seeded.pendingMint);
      assert.equal(parsed.queues.metricPending[0]?.metricsCount, 0);
      assert.equal(parsed.queues.metricPending[0]?.pendingAgeBucket, "gt60m");
      assert.deepEqual(parsed.queues.rescorePending, []);

      assert.equal(parsed.oldestPendingPreview.oldestEnrichPending.length, 1);
      assert.equal(
        parsed.oldestPendingPreview.oldestEnrichPending[0]?.mint,
        seeded.pendingMint,
      );
      assert.equal(
        parsed.oldestPendingPreview.oldestEnrichPending[0]?.selectionAnchorKind,
        "firstSeenDetectedAt",
      );
      assert.equal(
        parsed.oldestPendingPreview.oldestEnrichPending[0]?.pendingAgeBucket,
        "gt60m",
      );
      assert.equal(parsed.oldestPendingPreview.oldestMetricPending.length, 1);
      assert.equal(
        parsed.oldestPendingPreview.oldestMetricPending[0]?.mint,
        seeded.pendingMint,
      );

      assert.equal(parsed.preview.length, 2);
      assert.equal(parsed.preview[0]?.mint, seeded.notifyMint);
      assert.deepEqual(parsed.preview[0]?.queuesMatched, [
        "notifyCandidate",
        "highPriorityRecent",
      ]);
      assert.equal(parsed.preview[0]?.metricsCount, 1);
      assert.equal(parsed.preview[0]?.latestMetricSource, "test-gecko-queue-metric");
      assert.equal(parsed.preview[1]?.mint, seeded.pendingMint);
      assert.deepEqual(parsed.preview[1]?.queuesMatched, [
        "staleReview",
        "enrichPending",
        "metricPending",
      ]);
      assert.equal(parsed.preview[1]?.metricsCount, 0);
      assert.equal(parsed.preview[1]?.pendingAgeBucket, "gt60m");
      assert.equal(
        parsed.preview[1]!.pendingAgeMinutes >= 6 * 60,
        true,
      );
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runReviewQueueGeckoterminal(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm review:queue:geckoterminal -- \[--sinceHours <N>\] \[--limit <N>\] \[--pumpOnly\] \[--includeBlockers\]/,
    );
  });

  await t.test("includeBlockers adds notify visibility without raw payload fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "blockers.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedBlockerVisibilityTokens(databaseUrl);

      const result = await runReviewQueueGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "10",
          "--pumpOnly",
          "--includeBlockers",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ReviewQueueGeckoterminalOutput;
      assert.equal(parsed.selection.includeBlockers, true);
      assert.equal(parsed.summary.notifyCandidateCount, 1);
      assert.equal(parsed.summary.visibility?.notifyCandidateEligibleCount, 1);
      assert.deepEqual(parsed.summary.visibility?.scoreRankDistribution, {
        S: 2,
        B: 1,
      });
      assert.deepEqual(parsed.summary.visibility?.scoreTotalDistribution, {
        "10": 1,
        "2": 1,
        "9": 1,
      });
      assert.deepEqual(parsed.summary.visibility?.notifyCandidateBlockerDistribution, {
        rank_not_s: 1,
        hard_rejected: 1,
      });
      assert.equal(parsed.summary.visibility?.hardRejectedCount, 1);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.hasWebsite, 2);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.hasX, 1);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.hasTelegram, 1);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.metaplexHit, 1);
      assert.equal(
        parsed.summary.visibility?.reviewFlagsPresenceDistribution.descriptionPresent,
        1,
      );
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.linkPresent, 2);

      const eligible = parsed.queues.notifyCandidate.find(
        (item) => item.mint === seeded.eligibleMint,
      );
      assert.equal(eligible?.notifyCandidateEligible, true);
      assert.deepEqual(eligible?.notifyCandidateBlockers, []);
      assert.equal(eligible?.rankGapToNotify, null);
      assert.equal(eligible?.notifyCandidateRule, "scoreRank === S && hardRejected === false");

      const rankBlocked = parsed.preview.find((item) => item.mint === seeded.rankBlockedMint);
      assert.equal(rankBlocked?.notifyCandidateEligible, false);
      assert.deepEqual(rankBlocked?.notifyCandidateBlockers, ["rank_not_s"]);
      assert.deepEqual(rankBlocked?.rankGapToNotify, {
        currentRank: "B",
        requiredRank: "S",
        currentScore: 2,
        summary: "needs S rank; current B/2",
      });
      assert.equal(rankBlocked?.notificationCount, 1);
      assert.equal(rankBlocked?.holderSnapshotCount, 0);
      assert.equal(rankBlocked?.reviewFlags?.hasWebsite, true);
      assert.equal(rankBlocked?.reviewFlags?.linkCount, 1);

      const hardRejected = parsed.preview.find((item) => item.mint === seeded.hardRejectedMint);
      assert.equal(hardRejected?.notifyCandidateEligible, false);
      assert.deepEqual(hardRejected?.notifyCandidateBlockers, ["hard_rejected"]);
      assert.equal(hardRejected?.hardRejectReason, "test hard reject");
      assert.equal(hardRejected?.rankGapToNotify, null);

      const serialized = JSON.stringify(parsed);
      assert.equal(serialized.includes("rawJson"), false);
      assert.equal(serialized.includes("entrySnapshot"), false);
      assert.equal(serialized.includes("reviewFlagsJson"), false);
    });
  });

  await t.test("sorts highPriorityRecent by selection anchor recency rather than score rank", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "priority-order.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedReviewQueue(databaseUrl);
      const recentAMint = await seedHighPriorityRecentOnlyToken(databaseUrl);

      const result = await runReviewQueueGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ReviewQueueGeckoterminalOutput;
      assert.equal(parsed.summary.notifyCandidateCount, 1);
      assert.equal(parsed.summary.highPriorityRecentCount, 2);
      assert.equal(parsed.queues.highPriorityRecent.length, 2);
      assert.deepEqual(
        parsed.queues.highPriorityRecent.map((item) => item.mint),
        [recentAMint, seeded.notifyMint],
      );
      assert.deepEqual(parsed.queues.highPriorityRecent[0]?.queuesMatched, [
        "highPriorityRecent",
        "metricPending",
      ]);
      assert.deepEqual(parsed.queues.highPriorityRecent[0]?.reviewReasons, [
        "high_priority_recent_rank",
        "metric_pending",
      ]);
      assert.deepEqual(parsed.queues.highPriorityRecent[1]?.queuesMatched, [
        "notifyCandidate",
        "highPriorityRecent",
      ]);
    });
  });

  await t.test("returns empty queue groups when no gecko-origin token matches", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runReviewQueueGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ReviewQueueGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.geckoOriginTokenCount, 0);
      assert.equal(parsed.summary.geckoOriginTokenCount, 0);
      assert.equal(parsed.summary.enrichPendingCount, 0);
      assert.equal(parsed.summary.rescorePendingCount, 0);
      assert.equal(parsed.summary.metricPendingCount, 0);
      assert.equal(parsed.summary.notifyCandidateCount, 0);
      assert.equal(parsed.summary.staleReviewCount, 0);
      assert.equal(parsed.summary.highPriorityRecentCount, 0);
      assert.deepEqual(parsed.summary.enrichPendingAgeBuckets, {
        lte5m: 0,
        lte15m: 0,
        lte60m: 0,
        gt60m: 0,
      });
      assert.deepEqual(parsed.summary.metricPendingAgeBuckets, {
        lte5m: 0,
        lte15m: 0,
        lte60m: 0,
        gt60m: 0,
      });
      assert.equal(parsed.summary.enrichPendingAgeMinutesSummary, null);
      assert.equal(parsed.summary.metricPendingAgeMinutesSummary, null);
      assert.deepEqual(parsed.queues, {
        notifyCandidate: [],
        highPriorityRecent: [],
        staleReview: [],
        rescorePending: [],
        enrichPending: [],
        metricPending: [],
      });
      assert.deepEqual(parsed.oldestPendingPreview, {
        oldestEnrichPending: [],
        oldestMetricPending: [],
      });
      assert.deepEqual(parsed.preview, []);
    });
  });
});
