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
  id?: number;
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
  scoreBreakdownSummary?: {
    available: boolean;
    componentTotals: Record<string, number>;
    hitSourceCounts: Record<string, number>;
    hitTagCounts: Record<string, number>;
  };
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
      watchlist: {
        watchlistCandidateCount: number;
        watchlistCriteria: {
          scoreRanks: string[];
          hardRejected: false;
          notificationCandidate: false;
          readOnly: true;
        };
        watchlistRankDistribution: Record<string, number>;
        watchlistScoreTotalDistribution: Record<string, number>;
        watchlistMetadataStatusDistribution: Record<string, number>;
        watchlistMetricCoverage: Record<string, number>;
        watchlistHardRejectedDistribution: Record<string, number>;
        watchlistReviewFlagsPresence: Record<string, number>;
        watchlistScoreBreakdownAvailabilityDistribution: Record<string, number>;
        watchlistReadyCount: number;
        watchlistNotReadyCount: number;
        watchlistReadinessReasonDistribution: Record<string, number>;
        representativeSamples: Array<{
          id: number;
          mintAbbrev: string;
          scoreRank: string;
          scoreTotal: number;
          metadataStatus: string;
          hardRejected: boolean;
          metricsCount: number;
          readiness: "ready" | "not_ready";
          readinessReasons: string[];
          scoreBreakdownAvailable: boolean;
          reviewFlags: ReviewQueueItem["reviewFlags"];
        }>;
      };
      rankGap: {
        requiredNotifyRank: "S";
        notifyThresholdDescription: string;
        rankGapDistribution: Record<string, number>;
        maxObservedRank: string | null;
        maxObservedScoreTotal: number | null;
        closestToNotifyCount: number;
      };
      scoreBreakdown: {
        scoreBreakdownAvailable: boolean;
        availableCount: number;
        unavailableCount: number;
        componentTotalSums: Record<string, number>;
        hitSourceDistribution: Record<string, number>;
        hitTagDistribution: Record<string, number>;
        availabilityReasonDistribution: Record<string, number>;
      };
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
  readyBMint: string;
  mintOnlyBMint: string;
  legacyBMint: string;
  hardRejectedMint: string;
  hardRejectedBMint: string;
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
        scoreBreakdown: {
          totals: {
            core: 8,
            learned: 1,
            trend: 0,
            combo: 0,
          },
          hits: [
            {
              source: "core",
              key: "safe-test-hidden",
              score: 8,
              tag: "meme",
            },
          ],
          trendFresh: false,
          trendCapped: false,
          trendOnly: false,
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
        scoreBreakdown: {
          totals: {
            core: 0,
            learned: 2,
            trend: 0,
            combo: 0,
          },
          hits: [
            {
              source: "learned_keyword",
              key: "not-emitted",
              score: 2,
              tag: "social",
            },
          ],
          trendFresh: false,
          trendCapped: false,
          trendOnly: false,
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

    const readyBAt = makeDetectedAt(5);
    const readyB = await db.token.create({
      data: {
        mint: "GeckoQueueReadyB11111111111111111111111111111pump",
        name: "Ready B Token",
        symbol: "READYB",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        scoreRank: "B",
        scoreTotal: 2,
        hardRejected: false,
        createdAt: readyBAt,
        importedAt: readyBAt,
        enrichedAt: readyBAt,
        rescoredAt: readyBAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: readyBAt.toISOString(),
          },
        },
        scoreBreakdown: {
          totals: {
            core: 2,
            learned: 0,
            trend: 0,
            combo: 0,
          },
          hits: [
            {
              source: "core",
              key: "safe-test-hidden",
              score: 2,
              tag: "animal",
            },
          ],
          trendFresh: false,
          trendCapped: false,
          trendOnly: false,
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });
    await db.metric.create({
      data: {
        tokenId: readyB.id,
        source: "visibility-test-metric",
        observedAt: readyBAt,
      },
    });

    const mintOnlyBAt = makeDetectedAt(6);
    const mintOnlyB = await db.token.create({
      data: {
        mint: "GeckoQueueMintOnlyB111111111111111111111111pump",
        source: GECKO_SOURCE,
        metadataStatus: "mint_only",
        scoreRank: "B",
        scoreTotal: 2,
        hardRejected: false,
        createdAt: mintOnlyBAt,
        importedAt: mintOnlyBAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: mintOnlyBAt.toISOString(),
          },
        },
      },
      select: {
        mint: true,
      },
    });

    const legacyBAt = makeDetectedAt(7);
    const legacyB = await db.token.create({
      data: {
        mint: "GeckoQueueLegacyB111111111111111111111111111pump",
        name: "Legacy B Token",
        symbol: "LEGACYB",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        scoreRank: "B",
        scoreTotal: 2,
        hardRejected: false,
        createdAt: legacyBAt,
        importedAt: legacyBAt,
        enrichedAt: legacyBAt,
        rescoredAt: legacyBAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: legacyBAt.toISOString(),
          },
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });
    await db.metric.create({
      data: {
        tokenId: legacyB.id,
        source: "visibility-test-metric",
        observedAt: legacyBAt,
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

    const hardRejectedBAt = makeDetectedAt(4);
    const hardRejectedB = await db.token.create({
      data: {
        mint: "GeckoQueueHardRejectedB111111111111111111111pump",
        name: "Hard Rejected B Token",
        symbol: "HARDREJB",
        source: GECKO_SOURCE,
        metadataStatus: "partial",
        scoreRank: "B",
        scoreTotal: 2,
        hardRejected: true,
        hardRejectReason: "test hard reject b",
        createdAt: hardRejectedBAt,
        importedAt: hardRejectedBAt,
        enrichedAt: hardRejectedBAt,
        rescoredAt: hardRejectedBAt,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: hardRejectedBAt.toISOString(),
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
      readyBMint: readyB.mint,
      mintOnlyBMint: mintOnlyB.mint,
      legacyBMint: legacyB.mint,
      hardRejectedMint: hardRejected.mint,
      hardRejectedBMint: hardRejectedB.mint,
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
      assert.equal(parsed.summary.visibility, undefined);

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
        B: 5,
      });
      assert.deepEqual(parsed.summary.visibility?.scoreTotalDistribution, {
        "10": 1,
        "2": 5,
        "9": 1,
      });
      assert.deepEqual(parsed.summary.visibility?.notifyCandidateBlockerDistribution, {
        rank_not_s: 5,
        hard_rejected: 2,
      });
      assert.equal(parsed.summary.visibility?.hardRejectedCount, 2);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.hasWebsite, 2);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.hasX, 1);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.hasTelegram, 1);
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.metaplexHit, 1);
      assert.equal(
        parsed.summary.visibility?.reviewFlagsPresenceDistribution.descriptionPresent,
        1,
      );
      assert.equal(parsed.summary.visibility?.reviewFlagsPresenceDistribution.linkPresent, 2);
      assert.equal(parsed.summary.visibility?.watchlist.watchlistCandidateCount, 4);
      assert.deepEqual(parsed.summary.visibility?.watchlist.watchlistCriteria, {
        scoreRanks: ["A", "B"],
        hardRejected: false,
        notificationCandidate: false,
        readOnly: true,
      });
      assert.deepEqual(parsed.summary.visibility?.watchlist.watchlistRankDistribution, {
        B: 4,
      });
      assert.deepEqual(parsed.summary.visibility?.watchlist.watchlistScoreTotalDistribution, {
        "2": 4,
      });
      assert.deepEqual(parsed.summary.visibility?.watchlist.watchlistMetadataStatusDistribution, {
        partial: 3,
        mint_only: 1,
      });
      assert.deepEqual(parsed.summary.visibility?.watchlist.watchlistMetricCoverage, {
        "0": 2,
        "1": 2,
      });
      assert.deepEqual(parsed.summary.visibility?.watchlist.watchlistHardRejectedDistribution, {
        false: 4,
      });
      assert.deepEqual(
        parsed.summary.visibility?.watchlist.watchlistScoreBreakdownAvailabilityDistribution,
        {
          available: 2,
          unavailable: 2,
        },
      );
      assert.equal(parsed.summary.visibility?.watchlist.watchlistReadyCount, 1);
      assert.equal(parsed.summary.visibility?.watchlist.watchlistNotReadyCount, 3);
      assert.deepEqual(
        parsed.summary.visibility?.watchlist.watchlistReadinessReasonDistribution,
        {
          ready_for_review: 1,
          missing_metric: 2,
          missing_context: 1,
          score_breakdown_unavailable: 2,
          hard_rejected: 0,
          unknown: 1,
        },
      );
      assert.deepEqual(parsed.summary.visibility?.metadataStatusDistribution, {
        partial: 6,
        mint_only: 1,
      });
      assert.equal(
        parsed.summary.visibility?.watchlist.watchlistReviewFlagsPresence.hasWebsite,
        1,
      );
      assert.equal(parsed.summary.visibility?.watchlist.representativeSamples.length, 4);
      assert.equal(
        parsed.summary.visibility?.watchlist.representativeSamples[0]?.scoreRank,
        "B",
      );
      assert.equal(
        parsed.summary.visibility?.watchlist.representativeSamples[0]?.hardRejected,
        false,
      );
      assert.equal(
        parsed.summary.visibility?.watchlist.representativeSamples[0]?.readiness,
        "not_ready",
      );
      assert.deepEqual(
        parsed.summary.visibility?.watchlist.representativeSamples[0]?.readinessReasons,
        ["missing_metric", "unknown"],
      );
      assert.equal(
        parsed.summary.visibility?.watchlist.representativeSamples[1]?.readiness,
        "ready",
      );
      assert.deepEqual(
        parsed.summary.visibility?.watchlist.representativeSamples[1]?.readinessReasons,
        ["ready_for_review"],
      );
      assert.equal(
        parsed.summary.visibility?.watchlist.representativeSamples[1]?.scoreBreakdownAvailable,
        true,
      );
      assert.equal(parsed.summary.visibility?.rankGap.requiredNotifyRank, "S");
      assert.match(
        parsed.summary.visibility?.rankGap.notifyThresholdDescription ?? "",
        /S requires non-trend-only score >= 8/,
      );
      assert.deepEqual(parsed.summary.visibility?.rankGap.rankGapDistribution, {
        B_to_S: 5,
      });
      assert.equal(parsed.summary.visibility?.rankGap.maxObservedRank, "S");
      assert.equal(parsed.summary.visibility?.rankGap.maxObservedScoreTotal, 10);
      assert.equal(parsed.summary.visibility?.rankGap.closestToNotifyCount, 1);
      assert.equal(parsed.summary.visibility?.scoreBreakdown.scoreBreakdownAvailable, true);
      assert.equal(parsed.summary.visibility?.scoreBreakdown.availableCount, 3);
      assert.equal(parsed.summary.visibility?.scoreBreakdown.unavailableCount, 4);
      assert.deepEqual(parsed.summary.visibility?.scoreBreakdown.componentTotalSums, {
        core: 10,
        learned: 3,
        trend: 0,
        combo: 0,
      });
      assert.deepEqual(parsed.summary.visibility?.scoreBreakdown.hitSourceDistribution, {
        core: 2,
        learned_keyword: 1,
      });
      assert.deepEqual(parsed.summary.visibility?.scoreBreakdown.hitTagDistribution, {
        animal: 1,
        meme: 1,
        social: 1,
      });
      assert.deepEqual(
        parsed.summary.visibility?.scoreBreakdown.availabilityReasonDistribution,
        {
          available: 3,
          unavailable_mint_only: 1,
          unavailable_not_rescored: 0,
          unavailable_legacy_or_unknown: 3,
        },
      );

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
      assert.deepEqual(rankBlocked?.scoreBreakdownSummary, {
        available: true,
        componentTotals: {
          core: 0,
          learned: 2,
          trend: 0,
          combo: 0,
        },
        hitSourceCounts: {
          learned_keyword: 1,
        },
        hitTagCounts: {
          social: 1,
        },
      });

      const mintOnlyB = parsed.preview.find((item) => item.mint === seeded.mintOnlyBMint);
      assert.equal(mintOnlyB?.notifyCandidateEligible, false);
      assert.deepEqual(mintOnlyB?.notifyCandidateBlockers, ["rank_not_s"]);
      assert.equal(mintOnlyB?.metadataStatus, "mint_only");
      assert.equal(mintOnlyB?.metricsCount, 0);
      assert.equal(mintOnlyB?.scoreBreakdownSummary?.available, false);

      const hardRejected = parsed.preview.find((item) => item.mint === seeded.hardRejectedMint);
      assert.equal(hardRejected?.notifyCandidateEligible, false);
      assert.deepEqual(hardRejected?.notifyCandidateBlockers, ["hard_rejected"]);
      assert.equal(hardRejected?.hardRejectReason, "test hard reject");
      assert.equal(hardRejected?.rankGapToNotify, null);

      const hardRejectedB = parsed.preview.find((item) => item.mint === seeded.hardRejectedBMint);
      assert.equal(hardRejectedB?.notifyCandidateEligible, false);
      assert.deepEqual(hardRejectedB?.notifyCandidateBlockers, [
        "rank_not_s",
        "hard_rejected",
      ]);
      assert.equal(
        parsed.summary.visibility?.watchlist.representativeSamples.every(
          (item) => item.hardRejected === false,
        ),
        true,
      );

      const serialized = JSON.stringify(parsed);
      assert.equal(serialized.includes("rawJson"), false);
      assert.equal(serialized.includes("entrySnapshot"), false);
      assert.equal(serialized.includes("reviewFlagsJson"), false);
      assert.equal(serialized.includes("normalizedText"), false);
      assert.equal(serialized.includes("not-emitted"), false);
      assert.equal(serialized.includes("safe-test-hidden"), false);
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

  await t.test("includeBlockers reports scoreBreakdown unavailable when no safe reasons exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty-blockers.db")}`;

      await runDbPush(databaseUrl);

      const result = await runReviewQueueGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "5",
          "--includeBlockers",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as ReviewQueueGeckoterminalOutput;
      assert.equal(parsed.summary.visibility?.scoreBreakdown.scoreBreakdownAvailable, false);
      assert.equal(parsed.summary.visibility?.scoreBreakdown.availableCount, 0);
      assert.equal(parsed.summary.visibility?.scoreBreakdown.unavailableCount, 0);
      assert.deepEqual(
        parsed.summary.visibility?.scoreBreakdown.availabilityReasonDistribution,
        {
          available: 0,
          unavailable_mint_only: 0,
          unavailable_not_rescored: 0,
          unavailable_legacy_or_unknown: 0,
        },
      );
      assert.equal(parsed.summary.visibility?.watchlist.watchlistCandidateCount, 0);
      assert.equal(parsed.summary.visibility?.watchlist.watchlistReadyCount, 0);
      assert.equal(parsed.summary.visibility?.watchlist.watchlistNotReadyCount, 0);
      assert.deepEqual(
        parsed.summary.visibility?.watchlist.watchlistReadinessReasonDistribution,
        {
          ready_for_review: 0,
          missing_metric: 0,
          missing_context: 0,
          score_breakdown_unavailable: 0,
          hard_rejected: 0,
          unknown: 0,
        },
      );
      assert.deepEqual(parsed.summary.visibility?.rankGap.rankGapDistribution, {});
      assert.equal(parsed.summary.visibility?.rankGap.maxObservedRank, null);
      assert.equal(parsed.summary.visibility?.rankGap.maxObservedScoreTotal, null);
    });
  });
});
