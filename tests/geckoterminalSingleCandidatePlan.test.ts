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

type PlannerOutput = {
  status: "ok" | "stop";
  mint: string | null;
  currentStage: string;
  nextStage: string | null;
  reason: string;
  guards: {
    metadataStatus: string | null;
    metricsCount: number | null;
    hardRejected: boolean | null;
    latestMetricSource: string | null;
  };
  latestMetric: {
    id: number;
    source: string | null;
    observedAt: string;
    volume24h: number | null;
    rawJson?: unknown;
    safeSummary: {
      priceUsdPresent: boolean;
      fdvUsdPresent: boolean;
      reserveUsdPresent: boolean;
      topPoolPresent: boolean;
    };
  } | null;
  recentMetrics: Array<{
    id: number;
    source: string | null;
    observedAt: string;
    volume24h: number | null;
    rawJson?: unknown;
    safeSummary: {
      priceUsdPresent: boolean;
      fdvUsdPresent: boolean;
      reserveUsdPresent: boolean;
      topPoolPresent: boolean;
    };
  }>;
  readOnlyCommands: string[];
  nextRedCommand: string | null;
  sideEffectUpperBound: string | null;
  stopConditions: string[];
  rawJsonFreeRequired: true;
};

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-plan-test-"));

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

async function runPlanner(
  args: string[],
  databaseUrl: string,
): Promise<CommandResult> {
  const stdoutPath = join(
    tmpdir(),
    `gecko-plan-test-${process.pid}-${Date.now()}-stdout.json`,
  );
  const stderrPath = join(
    tmpdir(),
    `gecko-plan-test-${process.pid}-${Date.now()}-stderr.log`,
  );

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalSingleCandidatePlan.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
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

function parsePlannerOutput(result: CommandResult): PlannerOutput {
  assert.equal(result.ok, true, result.stderr);
  return JSON.parse(result.stdout) as PlannerOutput;
}

async function seedToken(
  databaseUrl: string,
  options: {
    mint: string;
    metadataStatus: string;
    hardRejected?: boolean;
    metrics?: Array<{
      source: string;
      observedAt: string;
      volume24h?: number | null;
    }>;
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
    const token = await db.token.create({
      data: {
        mint: options.mint,
        name: "Planner Token",
        symbol: "PLAN",
        source: "geckoterminal.new_pools",
        metadataStatus: options.metadataStatus,
        scoreRank: "C",
        scoreTotal: 0,
        hardRejected: options.hardRejected ?? false,
      },
      select: {
        id: true,
      },
    });

    if (options.metrics) {
      for (const metric of options.metrics) {
        await db.metric.create({
          data: {
            tokenId: token.id,
            source: metric.source,
            observedAt: new Date(metric.observedAt),
            volume24h: metric.volume24h ?? null,
            rawJson: {
              token: {
                priceUsd: 0.001,
                fdvUsd: 100000,
                totalReserveInUsd: 5000,
              },
              topPool: {
                address: "planner-pool",
              },
            },
          },
        });
      }
    }
  } finally {
    await db.$disconnect();
  }
}

async function countMetrics(
  databaseUrl: string,
  mint: string,
): Promise<number> {
  const db = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const token = await db.token.findUnique({
      where: {
        mint,
      },
      select: {
        _count: {
          select: {
            metrics: true,
          },
        },
      },
    });

    return token?._count.metrics ?? 0;
  } finally {
    await db.$disconnect();
  }
}

test("geckoterminal single candidate planner", async (t) => {
  await t.test("stops when the token is missing", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing.db")}`;
      const mint = "MissingPlannerMint1111111111111111111111111111";

      await runDbPush(databaseUrl);

      const output = parsePlannerOutput(
        await runPlanner(["--", "--mint", mint], databaseUrl),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "missing_token");
      assert.equal(output.nextRedCommand, null);
      assert.equal(output.guards.metricsCount, null);
    });
  });

  await t.test("plans enrich write for a mint_only token without metrics", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "mint-only.db")}`;
      const mint = "MintOnlyPlanner111111111111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "mint_only",
      });

      const output = parsePlannerOutput(
        await runPlanner(["--mint", mint], databaseUrl),
      );

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "mint_only_without_metrics");
      assert.equal(output.nextStage, "enrich_write");
      assert.equal(
        output.nextRedCommand,
        `pnpm -s token:enrich-rescore:geckoterminal -- --mint ${mint} --write`,
      );
      assert.equal(output.guards.metricsCount, 0);
    });
  });

  await t.test("plans metric write for a partial token without metrics", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "partial-empty.db")}`;
      const mint = "PartialEmptyPlanner111111111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
      });

      const output = parsePlannerOutput(
        await runPlanner(["--mint", mint], databaseUrl),
      );

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "partial_without_metrics");
      assert.equal(output.nextStage, "metric_write");
      assert.equal(
        output.nextRedCommand,
        `pnpm -s metric:snapshot:geckoterminal -- --mint ${mint} --write`,
      );
    });
  });

  await t.test("plans tmux single-mint metric write for a partial token with one metric", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "partial-one.db")}`;
      const mint = "PartialOnePlanner11111111111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
        metrics: [
          {
            source: "geckoterminal.token_snapshot",
            observedAt: "2026-05-01T00:00:00.000Z",
            volume24h: 123,
          },
        ],
      });

      const beforeCount = await countMetrics(databaseUrl, mint);
      const result = await runPlanner(["--mint", mint], databaseUrl);
      const output = parsePlannerOutput(result);
      const afterCount = await countMetrics(databaseUrl, mint);

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "partial_with_one_metric");
      assert.equal(output.nextStage, "second_metric_write_or_tmux_single");
      assert.equal(output.nextRedCommand?.includes("tmux new-session -d -s lowcap-gecko-metric-single"), true);
      assert.equal(output.nextRedCommand?.includes(`--mint ${mint} --write`), true);
      assert.equal(output.nextRedCommand?.includes("--watch"), false);
      assert.equal(output.latestMetric?.safeSummary.priceUsdPresent, true);
      assert.equal(result.stdout.includes('"rawJson":'), false);
      assert.equal(beforeCount, 1);
      assert.equal(afterCount, 1);
    });
  });

  await t.test("does not suggest a write when two or more metrics exist", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "partial-two.db")}`;
      const mint = "PartialTwoPlanner11111111111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
        metrics: [
          {
            source: "geckoterminal.token_snapshot",
            observedAt: "2026-05-01T00:00:00.000Z",
          },
          {
            source: "geckoterminal.token_snapshot",
            observedAt: "2026-05-01T00:10:00.000Z",
          },
        ],
      });

      const output = parsePlannerOutput(
        await runPlanner(["--mint", mint], databaseUrl),
      );

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "two_or_more_metrics");
      assert.equal(output.nextRedCommand, null);
      assert.equal(output.reason.includes("metricsCount>=2"), true);
    });
  });

  await t.test("stops for hard rejected tokens", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "hard-rejected.db")}`;
      const mint = "HardRejectedPlanner11111111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
        hardRejected: true,
      });

      const output = parsePlannerOutput(
        await runPlanner(["--mint", mint], databaseUrl),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "manual_review_required");
      assert.equal(output.reason.includes("hardRejected=true"), true);
      assert.equal(output.nextRedCommand, null);
    });
  });

  await t.test("stops when the latest metric source is not geckoterminal.token_snapshot", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "source-mismatch.db")}`;
      const mint = "SourceMismatchPlanner11111111111111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
        metrics: [
          {
            source: "other.metric.source",
            observedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const output = parsePlannerOutput(
        await runPlanner(["--mint", mint], databaseUrl),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "manual_review_required");
      assert.equal(output.reason.includes("latestMetricSource mismatch"), true);
      assert.equal(output.nextRedCommand, null);
    });
  });
});
