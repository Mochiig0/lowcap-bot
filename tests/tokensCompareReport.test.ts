import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

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

type TokensCompareReportOutput = {
  count: number;
  preFilterCount: number;
  filteredCount: number;
  latestMetricMissingCount: number;
  latestMultipleMissingCount: number;
  latestPeakMissingCount: number;
  filters: {
    rank: string | null;
    source: string | null;
    metadataStatus: string | null;
    hardRejected: boolean | null;
    hasLatestMetric: boolean | null;
    hasLatestMultiple: boolean | null;
    hasLatestPeakFdv24h: boolean | null;
    hasLatestTimeToPeak: boolean | null;
    latestMetricSource: string | null;
    outcomeBucket: string | null;
    outcomeBucketReason: string | null;
    interestingFlagsOnly: boolean;
    hasWebsite: boolean | null;
    hasX: boolean | null;
    hasTelegram: boolean | null;
    metaplexHit: boolean | null;
    hasMetrics: boolean | null;
    entryVsCurrentChanged: boolean | null;
    changedField: string | null;
    minChangedFieldsCount: number | null;
    minMetricsCount: number | null;
    minEntryScoreTotal: number | null;
    minCurrentScoreTotal: number | null;
    entryScoreRank: string | null;
    currentScoreRank: string | null;
    sortBy: string | null;
    sortOrder: "asc" | "desc";
    limit: number;
  };
  items: Array<{
    mint: string;
    name: string | null;
    symbol: string | null;
    metadataStatus: string;
    interestingFlags: {
      hasWebsite: boolean;
      descriptionPresent: boolean;
      metaplexHit: boolean;
    } | null;
    metricCompleteness: {
      hasLatestMetric: boolean;
      latestMetricSource: string | null;
      hasLatestMultiple: boolean;
      hasLatestPeakFdv24h: boolean;
      hasLatestTimeToPeak: boolean;
    };
    outcomeBucket: string;
    outcomeBucketReason: string;
    entryScoreRank: string | null;
    entryScoreTotal: number | null;
    currentScoreRank: string;
    currentScoreTotal: number;
    entryVsCurrentChanged: boolean;
    changedFields: string[];
    changedFieldsCount: number;
    metricsCount: number;
    reviewFlags: {
      hasWebsite: boolean;
      hasX: boolean;
      hasTelegram: boolean;
      metaplexHit: boolean;
      descriptionPresent: boolean;
      linkCount: number;
    } | null;
    reviewFlagsCount: number;
    latestMetricObservedAt: string | null;
    latestPeakFdv24h: number | null;
    latestMaxMultiple15m: number | null;
    latestTimeToPeakMinutes: number | null;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-tokens-compare-report-test-"));

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

async function runTokensCompareReport(
  args: string[],
  databaseUrl?: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `tokens-compare-report-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `tokens-compare-report-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/tokensCompareReport.ts",
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

async function seedTokens(databaseUrl: string): Promise<{
  targetMint: string;
}> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const target = await db.token.create({
      data: {
        mint: "CmpRpt1111111111111111111111111111111111111",
        name: "Compare Report Token",
        symbol: "CRPT",
        source: "test-compare-report",
        metadataStatus: "enriched",
        scoreRank: "A",
        scoreTotal: 42,
        description: "current compare report description",
        entrySnapshot: {
          name: "Entry Compare Report Token",
          symbol: "CRPT",
          description: "entry compare report description",
          scoreRank: "C",
          scoreTotal: 12,
          hardRejected: false,
          hardRejectReason: null,
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
        tokenId: target.id,
        source: "compare-report-metric",
        peakFdv24h: 180000,
        maxMultiple15m: 2.5,
        timeToPeakMinutes: 18,
      },
    });

    await db.token.create({
      data: {
        mint: "CmpRpt2222222222222222222222222222222222222",
        name: "Other Compare Report Token",
        symbol: "OCRP",
        source: "other-source",
        metadataStatus: "mint_only",
        scoreRank: "C",
        scoreTotal: 3,
      },
    });

    return {
      targetMint: target.mint,
    };
  } finally {
    await db.$disconnect();
  }
}

test("tokensCompareReport boundary", async (t) => {
  await t.test("returns a filtered compare report with stable top-level fields", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;

      await runDbPush(databaseUrl);
      const seeded = await seedTokens(databaseUrl);

      const result = await runTokensCompareReport(
        [
          "--source",
          "test-compare-report",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokensCompareReportOutput;
      assert.equal(parsed.count, 1);
      assert.equal(parsed.preFilterCount, 1);
      assert.equal(parsed.filteredCount, 1);
      assert.equal(parsed.latestMetricMissingCount, 0);
      assert.equal(parsed.latestMultipleMissingCount, 0);
      assert.equal(parsed.latestPeakMissingCount, 0);
      assert.deepEqual(parsed.filters, {
        rank: null,
        source: "test-compare-report",
        metadataStatus: null,
        hardRejected: null,
        hasLatestMetric: null,
        hasLatestMultiple: null,
        hasLatestPeakFdv24h: null,
        hasLatestTimeToPeak: null,
        latestMetricSource: null,
        outcomeBucket: null,
        outcomeBucketReason: null,
        interestingFlagsOnly: false,
        hasWebsite: null,
        hasX: null,
        hasTelegram: null,
        metaplexHit: null,
        hasMetrics: null,
        entryVsCurrentChanged: null,
        changedField: null,
        minChangedFieldsCount: null,
        minMetricsCount: null,
        minEntryScoreTotal: null,
        minCurrentScoreTotal: null,
        entryScoreRank: null,
        currentScoreRank: null,
        sortBy: null,
        sortOrder: "desc",
        limit: 5,
      });
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.mint, seeded.targetMint);
      assert.equal(parsed.items[0]?.name, "Compare Report Token");
      assert.equal(parsed.items[0]?.symbol, "CRPT");
      assert.equal(parsed.items[0]?.metadataStatus, "enriched");
      assert.equal(parsed.items[0]?.metricsCount, 1);
      assert.equal(parsed.items[0]?.outcomeBucket, "winner");
      assert.equal(
        parsed.items[0]?.outcomeBucketReason,
        "multiple_gte_threshold",
      );
      assert.equal(parsed.items[0]?.entryVsCurrentChanged, true);
      assert.deepEqual(parsed.items[0]?.changedFields, [
        "name",
        "description",
        "scoreTotal",
        "scoreRank",
      ]);
      assert.equal(parsed.items[0]?.changedFieldsCount, 4);
      assert.equal(parsed.items[0]?.reviewFlagsCount, 4);
      assert.deepEqual(parsed.items[0]?.interestingFlags, {
        hasWebsite: true,
        descriptionPresent: true,
        metaplexHit: true,
      });
      assert.equal(parsed.items[0]?.metricCompleteness.hasLatestMetric, true);
      assert.equal(
        parsed.items[0]?.metricCompleteness.latestMetricSource,
        "compare-report-metric",
      );
      assert.equal(parsed.items[0]?.latestPeakFdv24h, 180000);
      assert.equal(parsed.items[0]?.latestMaxMultiple15m, 2.5);
      assert.equal(parsed.items[0]?.latestTimeToPeakMinutes, 18);
      assert.match(parsed.items[0]?.latestMetricObservedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    });
  });

  await t.test("exits non-zero when an unsupported arg widens the boundary", async () => {
    const result = await runTokensCompareReport(["--mint", "SomeMint"]);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 1);
    }
    assert.match(result.stderr, /Unknown arg: --mint/);
    assert.match(
      result.stdout,
      /pnpm tokens:compare-report -- \[--rank <RANK>\]/,
    );
  });

  await t.test("returns an empty result when no tokens match the filters", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);
      await seedTokens(databaseUrl);

      const result = await runTokensCompareReport(
        [
          "--source",
          "missing-source",
          "--limit",
          "5",
        ],
        databaseUrl,
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as TokensCompareReportOutput;
      assert.equal(parsed.count, 0);
      assert.equal(parsed.preFilterCount, 0);
      assert.equal(parsed.filteredCount, 0);
      assert.equal(parsed.latestMetricMissingCount, 0);
      assert.equal(parsed.latestMultipleMissingCount, 0);
      assert.equal(parsed.latestPeakMissingCount, 0);
      assert.deepEqual(parsed.filters, {
        rank: null,
        source: "missing-source",
        metadataStatus: null,
        hardRejected: null,
        hasLatestMetric: null,
        hasLatestMultiple: null,
        hasLatestPeakFdv24h: null,
        hasLatestTimeToPeak: null,
        latestMetricSource: null,
        outcomeBucket: null,
        outcomeBucketReason: null,
        interestingFlagsOnly: false,
        hasWebsite: null,
        hasX: null,
        hasTelegram: null,
        metaplexHit: null,
        hasMetrics: null,
        entryVsCurrentChanged: null,
        changedField: null,
        minChangedFieldsCount: null,
        minMetricsCount: null,
        minEntryScoreTotal: null,
        minCurrentScoreTotal: null,
        entryScoreRank: null,
        currentScoreRank: null,
        sortBy: null,
        sortOrder: "desc",
        limit: 5,
      });
      assert.deepEqual(parsed.items, []);
    });
  });
});
