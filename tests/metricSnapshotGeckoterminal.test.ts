import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

import { PrismaClient } from "@prisma/client";

const execFileAsync = promisify(execFile);

const GECKO_ORIGIN_SOURCE = "geckoterminal.new_pools";
const METRIC_SOURCE = "geckoterminal.token_snapshot";

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

type MetricSnapshotGeckoterminalOutput = {
  mode: "single" | "recent_batch";
  dryRun: boolean;
  writeEnabled: boolean;
  metricSource: string;
  originSource: string;
  selection: {
    mint: string | null;
    limit: number | null;
    sinceMinutes: number | null;
    sinceCutoff: string | null;
    pumpOnly: boolean;
    prioritizeRichPending: boolean;
    selectedCount: number;
    skippedNonPumpCount: number;
    selectedSummary: {
      mintOnlyCount: number;
      nonMintOnlyCount: number;
      withReviewFlagsJsonCount: number;
      withReviewFlagsCount: number;
    };
  };
  summary: {
    selectedCount: number;
    okCount: number;
    skippedCount: number;
    errorCount: number;
    writtenCount: number;
  };
  items: Array<{
    token: {
      id: number;
      mint: string;
      currentSource: string | null;
      originSource: string | null;
      selectionAnchorKind: "firstSeenDetectedAt" | "createdAt";
      isGeckoterminalOrigin: boolean;
    };
    metricSource: string;
    status: "ok" | "error" | "skipped_recent_metric";
    metricCandidate?: {
      observedAt: string;
      source: string;
      volume24h: number | null;
      rawJson: {
        network: string;
        token: {
          address: string;
          name: string | null;
          symbol: string | null;
          volume24h: number | null;
        };
        topPoolCount: number;
        topPool: {
          address: string;
          dexId: string | null;
          volume24h: number | null;
        } | null;
      };
      rawJsonBytes: number;
    };
    writeSummary: {
      dryRun: boolean;
      wouldCreateMetric: boolean;
      metricId: number | null;
    };
    latestObservedAt?: string;
    minGapMinutes?: number;
    error?: string;
  }>;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-metric-snapshot-gecko-test-"));

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

async function runMetricSnapshotGeckoterminal(
  args: string[],
  options?: {
    databaseUrl?: string;
    geckoSnapshotFile?: string;
  },
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `metric-snapshot-gecko-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `metric-snapshot-gecko-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/metricSnapshotGeckoterminal.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ...(options?.databaseUrl ? { DATABASE_URL: options.databaseUrl } : {}),
          ...(options?.geckoSnapshotFile
            ? { GECKOTERMINAL_TOKEN_SNAPSHOT_FILE: options.geckoSnapshotFile }
            : {}),
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

async function seedToken(databaseUrl: string, mint: string): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await db.token.create({
      data: {
        mint,
        source: GECKO_ORIGIN_SOURCE,
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function seedMetricSelectionToken(
  databaseUrl: string,
  input: {
    mint: string;
    createdAt: Date;
    metadataStatus: "mint_only" | "partial" | "enriched";
    reviewFlagsJson?: Record<string, unknown>;
  },
): Promise<void> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await db.token.create({
      data: {
        mint: input.mint,
        source: GECKO_ORIGIN_SOURCE,
        createdAt: input.createdAt,
        importedAt: input.createdAt,
        metadataStatus: input.metadataStatus,
        ...(input.metadataStatus !== "mint_only"
          ? {
              name: `${input.mint}-name`,
              symbol: `${input.mint.slice(0, 4)}S`,
              enrichedAt: input.createdAt,
            }
          : {}),
        ...(input.reviewFlagsJson ? { reviewFlagsJson: input.reviewFlagsJson } : {}),
      },
    });
  } finally {
    await db.$disconnect();
  }
}

async function writeSnapshotFixture(filePath: string, mint: string): Promise<void> {
  await writeFile(
    filePath,
    JSON.stringify(
      {
        data: {
          id: `solana_${mint}`,
          type: "token",
          attributes: {
            address: mint,
            name: "Metric Snapshot Token",
            symbol: "MST",
            price_usd: "0.123",
            fdv_usd: "25000",
            total_reserve_in_usd: "1500",
            volume_usd: {
              h24: "1234",
            },
          },
          relationships: {
            top_pools: {
              data: [
                {
                  id: "solana_metric_snapshot_pool",
                  type: "pool",
                },
              ],
            },
          },
        },
        included: [
          {
            id: "solana_metric_snapshot_pool",
            type: "pool",
            attributes: {
              address: "metric_snapshot_pool",
              token_price_usd: "0.123",
              fdv_usd: "25000",
              reserve_in_usd: "1500",
              volume_usd: {
                h24: "321",
              },
            },
            relationships: {
              base_token: {
                data: {
                  id: `solana_${mint}`,
                  type: "token",
                },
              },
              quote_token: {
                data: {
                  id: "solana_So11111111111111111111111111111111111111112",
                  type: "token",
                },
              },
              dex: {
                data: {
                  id: "pumpswap",
                  type: "dex",
                },
              },
            },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function readMetrics(
  databaseUrl: string,
  mint: string,
): Promise<
  Array<{
    id: number;
    source: string | null;
    volume24h: number | null;
  }>
> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    return await db.metric.findMany({
      where: {
        token: {
          mint,
        },
      },
      select: {
        id: true,
        source: true,
        volume24h: true,
      },
      orderBy: {
        id: "asc",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

test("metricSnapshotGeckoterminal boundary", async (t) => {
  await t.test("supports a deterministic single dry-run through snapshot fixture override", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "valid.db")}`;
      const mint = "So11111111111111111111111111111111111111112";
      const geckoSnapshotFile = join(dir, "gecko-snapshot.json");

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, mint);

      await writeSnapshotFixture(geckoSnapshotFile, mint);

      const result = await runMetricSnapshotGeckoterminal(
        ["--mint", mint],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "single");
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.metricSource, METRIC_SOURCE);
      assert.equal(parsed.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.selection.mint, mint);
      assert.equal(parsed.selection.limit, null);
      assert.equal(parsed.selection.sinceMinutes, null);
      assert.equal(parsed.selection.sinceCutoff, null);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.prioritizeRichPending, false);
      assert.equal(parsed.selection.selectedCount, 1);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.deepEqual(parsed.selection.selectedSummary, {
        mintOnlyCount: 1,
        nonMintOnlyCount: 0,
        withReviewFlagsJsonCount: 0,
        withReviewFlagsCount: 0,
      });
      assert.equal(parsed.summary.selectedCount, 1);
      assert.equal(parsed.summary.okCount, 1);
      assert.equal(parsed.summary.skippedCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.items[0]?.token.mint, mint);
      assert.equal(parsed.items[0]?.token.currentSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.items[0]?.token.selectionAnchorKind, "createdAt");
      assert.equal(parsed.items[0]?.token.isGeckoterminalOrigin, true);
      assert.equal(parsed.items[0]?.metricSource, METRIC_SOURCE);
      assert.equal(parsed.items[0]?.status, "ok");
      assert.equal(parsed.items[0]?.metricCandidate?.source, METRIC_SOURCE);
      assert.equal(parsed.items[0]?.metricCandidate?.volume24h, 1234);
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.network, "solana");
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.token.address, mint);
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.token.name, "Metric Snapshot Token");
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.token.symbol, "MST");
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.token.volume24h, 1234);
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.topPoolCount, 1);
      assert.equal(
        parsed.items[0]?.metricCandidate?.rawJson.topPool?.address,
        "metric_snapshot_pool",
      );
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.topPool?.dexId, "pumpswap");
      assert.equal(parsed.items[0]?.metricCandidate?.rawJson.topPool?.volume24h, 321);
      assert.equal(
        typeof parsed.items[0]?.metricCandidate?.rawJsonBytes,
        "number",
      );
      assert.match(parsed.items[0]?.metricCandidate?.observedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.items[0]?.writeSummary.dryRun, true);
      assert.equal(parsed.items[0]?.writeSummary.wouldCreateMetric, true);
      assert.equal(parsed.items[0]?.writeSummary.metricId, null);

      const metrics = await readMetrics(databaseUrl, mint);
      assert.deepEqual(metrics, []);
    });
  });

  await t.test("prioritizeRichPending changes recent batch selection order toward richer pending rows", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "priority.db")}`;
      const geckoSnapshotFile = join(dir, "gecko-priority-snapshot.json");
      const newerThinMint = "MetricSnapshotThin11111111111111111111111111111pump";
      const olderRichMint = "MetricSnapshotRich11111111111111111111111111111pump";
      const now = Date.now();

      await runDbPush(databaseUrl);
      await seedMetricSelectionToken(databaseUrl, {
        mint: newerThinMint,
        createdAt: new Date(now - 30 * 1_000),
        metadataStatus: "mint_only",
      });
      await seedMetricSelectionToken(databaseUrl, {
        mint: olderRichMint,
        createdAt: new Date(now - 2 * 60 * 1_000),
        metadataStatus: "partial",
        reviewFlagsJson: {
          hasWebsite: true,
          hasX: false,
          hasTelegram: false,
          metaplexHit: false,
          descriptionPresent: true,
          linkCount: 1,
        },
      });
      await writeSnapshotFixture(geckoSnapshotFile, newerThinMint);

      const defaultResult = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(defaultResult.ok, true);

      const prioritizedResult = await runMetricSnapshotGeckoterminal(
        ["--limit", "1", "--sinceMinutes", "10", "--prioritizeRichPending"],
        { databaseUrl, geckoSnapshotFile },
      );
      assert.equal(prioritizedResult.ok, true);

      const defaultParsed = JSON.parse(
        defaultResult.stdout,
      ) as MetricSnapshotGeckoterminalOutput;
      const prioritizedParsed = JSON.parse(
        prioritizedResult.stdout,
      ) as MetricSnapshotGeckoterminalOutput;

      assert.equal(defaultParsed.selection.selectedCount, 1);
      assert.equal(defaultParsed.selection.prioritizeRichPending, false);
      assert.equal(defaultParsed.items[0]?.token.mint, newerThinMint);
      assert.equal(defaultParsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);

      assert.equal(prioritizedParsed.selection.selectedCount, 1);
      assert.equal(prioritizedParsed.selection.prioritizeRichPending, true);
      assert.equal(prioritizedParsed.items[0]?.token.mint, olderRichMint);
      assert.equal(prioritizedParsed.items[0]?.token.originSource, GECKO_ORIGIN_SOURCE);
    });
  });

  await t.test("exits non-zero when watch-only timing args are used without --watch", async () => {
    const result = await runMetricSnapshotGeckoterminal([
      "--intervalSeconds",
      "1",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.code, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--intervalSeconds and --maxIterations require --watch/);
    assert.match(
      result.stderr,
      /pnpm metric:snapshot:geckoterminal -- \[--mint <MINT>\] \[--limit <N>\] \[--sinceMinutes <N>\] \[--pumpOnly\] \[--prioritizeRichPending\] \[--minGapMinutes <N>\] \[--source <SOURCE>\] \[--write\] \[--watch\] \[--intervalSeconds <N>\] \[--maxIterations <N>\]/,
    );
  });

  await t.test("returns an empty recent batch when no gecko-origin tokens are selected", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "empty.db")}`;

      await runDbPush(databaseUrl);

      const result = await runMetricSnapshotGeckoterminal(
        ["--limit", "5", "--sinceMinutes", "5"],
        { databaseUrl },
      );
      assert.equal(result.ok, true);

      const parsed = JSON.parse(result.stdout) as MetricSnapshotGeckoterminalOutput;
      assert.equal(parsed.mode, "recent_batch");
      assert.equal(parsed.dryRun, true);
      assert.equal(parsed.writeEnabled, false);
      assert.equal(parsed.metricSource, METRIC_SOURCE);
      assert.equal(parsed.originSource, GECKO_ORIGIN_SOURCE);
      assert.equal(parsed.selection.mint, null);
      assert.equal(parsed.selection.limit, 5);
      assert.equal(parsed.selection.sinceMinutes, 5);
      assert.match(parsed.selection.sinceCutoff ?? "", /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(parsed.selection.pumpOnly, false);
      assert.equal(parsed.selection.prioritizeRichPending, false);
      assert.equal(parsed.selection.selectedCount, 0);
      assert.equal(parsed.selection.skippedNonPumpCount, 0);
      assert.deepEqual(parsed.selection.selectedSummary, {
        mintOnlyCount: 0,
        nonMintOnlyCount: 0,
        withReviewFlagsJsonCount: 0,
        withReviewFlagsCount: 0,
      });
      assert.equal(parsed.summary.selectedCount, 0);
      assert.equal(parsed.summary.okCount, 0);
      assert.equal(parsed.summary.skippedCount, 0);
      assert.equal(parsed.summary.errorCount, 0);
      assert.equal(parsed.summary.writtenCount, 0);
      assert.deepEqual(parsed.items, []);
    });
  });
});
