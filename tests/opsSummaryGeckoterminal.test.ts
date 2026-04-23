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

type OpsSummaryGeckoterminalOutput = {
  readOnly: boolean;
  originSource: string;
  selection: {
    sinceHours: number;
    sinceCutoff: string;
    previewLimit: number;
    pumpOnly: boolean;
    geckoOriginTokenCount: number;
    skippedNonPumpCount: number;
  };
  summary: {
    geckoOriginTokenCount: number;
    firstSeenSourceSnapshotCount: number;
    nameSymbolFilledCount: number;
    enrichedTokenCount: number;
    rescoredTokenCount: number;
    metricTokenCount: number;
    metricCount: number;
    hardRejectedCount: number;
    notifyCandidateCount: number;
    reviewFlagsTokenCount: number;
    hasWebsiteCount: number;
    hasXCount: number;
    hasTelegramCount: number;
    metaplexHitCount: number;
    descriptionPresentCount: number;
    hasWebsiteAndMetricCount: number;
    hasXAndMetricCount: number;
    hasTelegramAndMetricCount: number;
    metaplexHitAndMetricCount: number;
    descriptionPresentAndMetricCount: number;
    hasWebsiteMetricRate: number | null;
    hasXMetricRate: number | null;
    hasTelegramMetricRate: number | null;
    metaplexHitMetricRate: number | null;
    descriptionPresentMetricRate: number | null;
    interestingFlagComparison: {
      hasWebsite: {
        count: number;
        andMetricCount: number;
        metricRate: number | null;
      };
      descriptionPresent: {
        count: number;
        andMetricCount: number;
        metricRate: number | null;
      };
      metaplexHit: {
        count: number;
        andMetricCount: number;
        metricRate: number | null;
      };
    };
    metricCompletenessSummary: {
      latestMetricPresentCount: number;
      latestMultiplePresentCount: number;
      latestPeakPresentCount: number;
      latestTimeToPeakPresentCount: number;
      latestMetricMissingCount: number;
      latestMultipleMissingCount: number;
      latestPeakMissingCount: number;
      latestTimeToPeakMissingCount: number;
      latestMetricSourceCounts: Array<{
        value: string | null;
        count: number;
      }>;
    };
  };
  scoreRankCounts: Record<string, number>;
  metadataStatusCounts: Record<string, number>;
  currentSourceCounts: Array<{
    value: string | null;
    count: number;
  }>;
  originSourceCounts: Array<{
    value: string | null;
    count: number;
  }>;
  preview: Array<{
    mint: string;
    currentSource: string | null;
    originSource: string | null;
    metadataStatus: string;
    scoreRank: string;
    hardRejected: boolean;
    notifyCandidate: boolean;
    hasFirstSeenSourceSnapshot: boolean;
    selectionAnchorAt: string;
    selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
    metricsCount: number;
    latestMetricObservedAt: string | null;
    latestMetricSource: string | null;
    latestPeakFdv24h: number | null;
    latestMaxMultiple15m: number | null;
    latestTimeToPeakMinutes: number | null;
    enrichedAt: string | null;
    rescoredAt: string | null;
    createdAt: string;
    importedAt: string;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-ops-summary-test-"));

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

async function runOpsSummaryGeckoterminal(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-ops-summary-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-ops-summary-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalOpsSummary.ts",
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

async function seedGeckoSummary(databaseUrl: string): Promise<{
  geckoMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const now = new Date();
    const geckoToken = await db.token.create({
      data: {
        mint: "GeckoSummary111111111111111111111111111111pump",
        name: "Gecko Summary Token",
        symbol: "GSUM",
        source: GECKO_SOURCE,
        metadataStatus: "enriched",
        scoreRank: "S",
        scoreTotal: 88,
        importedAt: now,
        enrichedAt: now,
        rescoredAt: now,
        entrySnapshot: {
          firstSeenSourceSnapshot: {
            source: GECKO_SOURCE,
            detectedAt: now.toISOString(),
          },
        },
        reviewFlagsJson: {
          hasWebsite: true,
          hasX: false,
          hasTelegram: false,
          metaplexHit: true,
          descriptionPresent: true,
          linkCount: 1,
        },
      },
      select: {
        id: true,
        mint: true,
      },
    });

    await db.metric.create({
      data: {
        tokenId: geckoToken.id,
        source: "test-gecko-summary-metric",
        peakFdv24h: 180000,
        maxMultiple15m: 2.5,
        timeToPeakMinutes: 12,
        observedAt: now,
      },
    });

    await db.token.create({
      data: {
        mint: "NonGeckoSummary11111111111111111111111111111111",
        name: "Other Summary Token",
        symbol: "OSUM",
        source: "manual",
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 0,
        importedAt: now,
      },
    });

    return {
      geckoMint: geckoToken.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("opsSummaryGeckoterminal boundary", async (t) => {
  await t.test("returns a gecko summary with stable top-level counts", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedGeckoSummary(databaseUrl);

      const result = await runOpsSummaryGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as OpsSummaryGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.sinceHours, 24);
      assert.equal(parsed.selection.previewLimit, 5);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.geckoOriginTokenCount, 1);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.match(parsed.selection.sinceCutoff, /^\d{4}-\d{2}-\d{2}T/);

      assert.equal(parsed.summary.geckoOriginTokenCount, 1);
      assert.equal(parsed.summary.firstSeenSourceSnapshotCount, 1);
      assert.equal(parsed.summary.nameSymbolFilledCount, 1);
      assert.equal(parsed.summary.enrichedTokenCount, 1);
      assert.equal(parsed.summary.rescoredTokenCount, 1);
      assert.equal(parsed.summary.metricTokenCount, 1);
      assert.equal(parsed.summary.metricCount, 1);
      assert.equal(parsed.summary.hardRejectedCount, 0);
      assert.equal(parsed.summary.notifyCandidateCount, 1);
      assert.equal(parsed.summary.reviewFlagsTokenCount, 1);
      assert.equal(parsed.summary.hasWebsiteCount, 1);
      assert.equal(parsed.summary.metaplexHitCount, 1);
      assert.equal(parsed.summary.descriptionPresentCount, 1);
      assert.equal(parsed.summary.hasWebsiteAndMetricCount, 1);
      assert.equal(parsed.summary.metaplexHitAndMetricCount, 1);
      assert.equal(parsed.summary.descriptionPresentAndMetricCount, 1);
      assert.equal(parsed.summary.hasWebsiteMetricRate, 1);
      assert.equal(parsed.summary.metaplexHitMetricRate, 1);
      assert.equal(parsed.summary.descriptionPresentMetricRate, 1);
      assert.deepEqual(parsed.summary.interestingFlagComparison, {
        hasWebsite: {
          count: 1,
          andMetricCount: 1,
          metricRate: 1,
        },
        descriptionPresent: {
          count: 1,
          andMetricCount: 1,
          metricRate: 1,
        },
        metaplexHit: {
          count: 1,
          andMetricCount: 1,
          metricRate: 1,
        },
      });
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestMetricPresentCount,
        1,
      );
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestMultiplePresentCount,
        1,
      );
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestPeakPresentCount,
        1,
      );
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestTimeToPeakPresentCount,
        1,
      );
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestMetricMissingCount,
        0,
      );
      assert.deepEqual(
        parsed.summary.metricCompletenessSummary.latestMetricSourceCounts,
        [{ value: "test-gecko-summary-metric", count: 1 }],
      );
      assert.deepEqual(parsed.scoreRankCounts, { S: 1 });
      assert.deepEqual(parsed.metadataStatusCounts, { enriched: 1 });
      assert.deepEqual(parsed.currentSourceCounts, [{ value: GECKO_SOURCE, count: 1 }]);
      assert.deepEqual(parsed.originSourceCounts, [{ value: GECKO_SOURCE, count: 1 }]);
      assert.equal(parsed.preview.length, 1);
      assert.equal(parsed.preview[0]?.mint, seeded.geckoMint);
      assert.equal(parsed.preview[0]?.originSource, GECKO_SOURCE);
      assert.equal(parsed.preview[0]?.currentSource, GECKO_SOURCE);
      assert.equal(parsed.preview[0]?.metadataStatus, "enriched");
      assert.equal(parsed.preview[0]?.scoreRank, "S");
      assert.equal(parsed.preview[0]?.notifyCandidate, true);
      assert.equal(parsed.preview[0]?.hasFirstSeenSourceSnapshot, true);
      assert.equal(parsed.preview[0]?.metricsCount, 1);
      assert.equal(parsed.preview[0]?.latestMetricSource, "test-gecko-summary-metric");
      assert.equal(parsed.preview[0]?.latestPeakFdv24h, 180000);
      assert.equal(parsed.preview[0]?.latestMaxMultiple15m, 2.5);
      assert.equal(parsed.preview[0]?.latestTimeToPeakMinutes, 12);
      assert.match(parsed.preview[0]?.latestMetricObservedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runOpsSummaryGeckoterminal(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm ops:summary:geckoterminal -- \[--sinceHours <N>\] \[--limit <N>\] \[--pumpOnly\]/,
    );
  });

  await t.test("returns empty counts when no gecko-origin token matches", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runOpsSummaryGeckoterminal(
        [
          "--sinceHours",
          "24",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as OpsSummaryGeckoterminalOutput;
      assert.equal(parsed.readOnly, true);
      assert.equal(parsed.originSource, GECKO_SOURCE);
      assert.equal(parsed.selection.geckoOriginTokenCount, 0);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.equal(parsed.summary.geckoOriginTokenCount, 0);
      assert.equal(parsed.summary.metricTokenCount, 0);
      assert.equal(parsed.summary.metricCount, 0);
      assert.equal(parsed.summary.notifyCandidateCount, 0);
      assert.equal(parsed.summary.reviewFlagsTokenCount, 0);
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestMetricPresentCount,
        0,
      );
      assert.equal(
        parsed.summary.metricCompletenessSummary.latestMetricMissingCount,
        0,
      );
      assert.deepEqual(
        parsed.summary.metricCompletenessSummary.latestMetricSourceCounts,
        [],
      );
      assert.deepEqual(parsed.scoreRankCounts, {});
      assert.deepEqual(parsed.metadataStatusCounts, {});
      assert.deepEqual(parsed.currentSourceCounts, []);
      assert.deepEqual(parsed.originSourceCounts, []);
      assert.deepEqual(parsed.preview, []);
    });
  });
});
