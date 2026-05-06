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
type NextRedCommandKind =
  | "gecko_enrich_rescore_single_mint"
  | "gecko_metric_snapshot_single_mint"
  | "tmux_metric_single_mint"
  | null;
type StopConditionCode =
  | "mint_missing_or_ambiguous"
  | "guard_mismatch"
  | "invalid_args"
  | "selected_count_gt_1"
  | "written_count_gt_1"
  | "error_count_gt_0"
  | "rawjson_output_risk"
  | "secret_output_risk"
  | "telegram_expansion_risk"
  | "ops_expansion_risk"
  | "systemd_expansion_risk"
  | "scheduler_queue_expansion_risk"
  | "unbounded_watch_expansion_risk"
  | "default_checkpoint_expansion_risk"
  | "git_dirty";

type SideEffectUpperBoundSpec = {
  metricWriteMax: number;
  tokenWrite: boolean;
  tokenWriteMax: number;
  telegramSend: boolean;
  tmux: boolean;
  tmuxSession: string | null;
  checkpointWrite: boolean;
  systemd: boolean;
  multiMint: boolean;
};

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
  nextRedCommandKind: NextRedCommandKind;
  requiresHumanApproval: boolean;
  executor: "human" | "none";
  willExecute: false;
  sideEffectUpperBound: string | null;
  sideEffectUpperBoundSpec: SideEffectUpperBoundSpec;
  stopConditions: string[];
  stopConditionCodes: StopConditionCode[];
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

function expectedSideEffectUpperBoundSpec(
  kind: NextRedCommandKind,
): SideEffectUpperBoundSpec {
  const base: SideEffectUpperBoundSpec = {
    metricWriteMax: 0,
    tokenWrite: false,
    tokenWriteMax: 0,
    telegramSend: false,
    tmux: false,
    tmuxSession: null,
    checkpointWrite: false,
    systemd: false,
    multiMint: false,
  };

  if (kind === "gecko_enrich_rescore_single_mint") {
    return {
      ...base,
      tokenWrite: true,
      tokenWriteMax: 1,
    };
  }

  if (kind === "gecko_metric_snapshot_single_mint") {
    return {
      ...base,
      metricWriteMax: 1,
    };
  }

  if (kind === "tmux_metric_single_mint") {
    return {
      ...base,
      metricWriteMax: 1,
      tmux: true,
      tmuxSession: "lowcap-gecko-metric-single",
    };
  }

  return base;
}

function expectedStopConditions(): string[] {
  return [
    "mint is missing or ambiguous",
    "expected metadataStatus / metricsCount guard mismatch",
    "selectedCount or writtenCount would exceed 1",
    "errorCount > 0",
    "rawJson / secret / env output risk",
    "Telegram / ops / systemd / scheduler / queue expansion risk",
    "unbounded watch / default checkpoint expansion risk",
    "git status dirty",
  ];
}

function expectedStopConditionCodes(): StopConditionCode[] {
  return [
    "mint_missing_or_ambiguous",
    "guard_mismatch",
    "invalid_args",
    "selected_count_gt_1",
    "written_count_gt_1",
    "error_count_gt_0",
    "rawjson_output_risk",
    "secret_output_risk",
    "telegram_expansion_risk",
    "ops_expansion_risk",
    "systemd_expansion_risk",
    "scheduler_queue_expansion_risk",
    "unbounded_watch_expansion_risk",
    "default_checkpoint_expansion_risk",
    "git_dirty",
  ];
}

function assertNoRedCommandSafety(output: PlannerOutput): void {
  assert.equal(output.nextRedCommand, null);
  assert.equal(output.nextRedCommandKind, null);
  assert.equal(output.requiresHumanApproval, false);
  assert.equal(output.executor, "none");
  assert.equal(output.willExecute, false);
  assert.deepEqual(
    output.sideEffectUpperBoundSpec,
    expectedSideEffectUpperBoundSpec(null),
  );
  assert.deepEqual(output.stopConditions, expectedStopConditions());
  assert.deepEqual(output.stopConditionCodes, expectedStopConditionCodes());
}

function assertRedCommandSafety(
  output: PlannerOutput,
  kind: Exclude<NextRedCommandKind, null>,
): void {
  assert.notEqual(output.nextRedCommand, null);
  assert.equal(output.nextRedCommandKind, kind);
  assert.equal(output.requiresHumanApproval, true);
  assert.equal(output.executor, "human");
  assert.equal(output.willExecute, false);
  assert.deepEqual(
    output.sideEffectUpperBoundSpec,
    expectedSideEffectUpperBoundSpec(kind),
  );
  assert.deepEqual(output.stopConditions, expectedStopConditions());
  assert.deepEqual(output.stopConditionCodes, expectedStopConditionCodes());
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
      assertNoRedCommandSafety(output);
      assert.equal(output.guards.metricsCount, null);
    });
  });

  await t.test("missing token stop takes priority over expected metrics count", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing-expected.db")}`;
      const mint = "MissingExpectedPlanner11111111111111111111111";

      await runDbPush(databaseUrl);

      const output = parsePlannerOutput(
        await runPlanner(
          ["--mint", mint, "--expectedMetricsCount", "1"],
          databaseUrl,
        ),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "missing_token");
      assert.equal(output.nextRedCommand, null);
      assert.equal(output.guards.metricsCount, null);
    });
  });

  await t.test("missing token stop takes priority over expected metadata status", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing-expected-status.db")}`;
      const mint = "MissingExpectedStatusPlanner11111111111111111";

      await runDbPush(databaseUrl);

      const output = parsePlannerOutput(
        await runPlanner(
          ["--mint", mint, "--expectedMetadataStatus", "partial"],
          databaseUrl,
        ),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "missing_token");
      assert.equal(output.nextRedCommand, null);
      assert.equal(output.guards.metadataStatus, null);
    });
  });

  await t.test("missing token stop takes priority over expected stage", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "missing-expected-stage.db")}`;
      const mint = "MissingExpectedStagePlanner1111111111111111";

      await runDbPush(databaseUrl);

      const output = parsePlannerOutput(
        await runPlanner(
          ["--mint", mint, "--expectedStage", "partial_with_one_metric"],
          databaseUrl,
        ),
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
        await runPlanner(
          ["--mint", mint, "--expectedMetadataStatus", "mint_only"],
          databaseUrl,
        ),
      );

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "mint_only_without_metrics");
      assert.equal(output.nextStage, "enrich_write");
      assert.equal(
        output.nextRedCommand,
        `pnpm -s token:enrich-rescore:geckoterminal -- --mint ${mint} --write`,
      );
      assertRedCommandSafety(output, "gecko_enrich_rescore_single_mint");
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
        await runPlanner(
          ["--mint", mint, "--expectedMetadataStatus", "partial"],
          databaseUrl,
        ),
      );

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "partial_without_metrics");
      assert.equal(output.nextStage, "metric_write");
      assert.equal(
        output.nextRedCommand,
        `pnpm -s metric:snapshot:geckoterminal -- --mint ${mint} --write`,
      );
      assertRedCommandSafety(output, "gecko_metric_snapshot_single_mint");
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
      const result = await runPlanner(
        [
          "--mint",
          mint,
          "--expectedMetadataStatus",
          "partial",
          "--expectedMetricsCount",
          "1",
          "--expectedStage",
          "partial_with_one_metric",
        ],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);
      const afterCount = await countMetrics(databaseUrl, mint);

      assert.equal(output.status, "ok");
      assert.equal(output.currentStage, "partial_with_one_metric");
      assert.equal(output.nextStage, "second_metric_write_or_tmux_single");
      assert.equal(output.nextRedCommand?.includes("tmux new-session -d -s lowcap-gecko-metric-single"), true);
      assert.equal(output.nextRedCommand?.includes(`--mint ${mint} --write`), true);
      assert.equal(output.nextRedCommand?.includes("--watch"), false);
      assertRedCommandSafety(output, "tmux_metric_single_mint");
      assert.equal(output.latestMetric?.safeSummary.priceUsdPresent, true);
      assert.equal(result.stdout.includes('"rawJson":'), false);
      assert.equal(beforeCount, 1);
      assert.equal(afterCount, 1);
    });
  });

  await t.test("stops when expected metadata status does not match actual status", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "expected-status-mismatch.db")}`;
      const mint = "ExpectedStatusMismatchPlanner11111111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
      });

      const result = await runPlanner(
        ["--mint", mint, "--expectedMetadataStatus", "mint_only"],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "guard_mismatch");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(
        output.reason.includes("expectedMetadataStatus mismatch: expected mint_only, actual partial"),
        true,
      );
      assert.equal(output.guards.metadataStatus, "partial");
      assert.equal(result.stdout.includes('"rawJson":'), false);
    });
  });

  await t.test("expected metadata status mismatch takes priority over expected stage mismatch", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "expected-status-stage-priority.db")}`;
      const mint = "ExpectedStatusStagePriorityPlanner111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
        metrics: [
          {
            source: "geckoterminal.token_snapshot",
            observedAt: "2026-05-01T00:00:00.000Z",
          },
        ],
      });

      const result = await runPlanner(
        [
          "--mint",
          mint,
          "--expectedMetadataStatus",
          "mint_only",
          "--expectedStage",
          "two_or_more_metrics",
        ],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "guard_mismatch");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(
        output.reason.includes("expectedMetadataStatus mismatch: expected mint_only, actual partial"),
        true,
      );
      assert.equal(output.reason.includes("expectedStage mismatch"), false);
      assert.equal(result.stdout.includes('"rawJson":'), false);
    });
  });

  await t.test("stops when expected metrics count does not match actual count", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "expected-mismatch.db")}`;
      const mint = "ExpectedMismatchPlanner111111111111111111111";

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

      const beforeCount = await countMetrics(databaseUrl, mint);
      const result = await runPlanner(
        ["--mint", mint, "--expectedMetricsCount", "1"],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);
      const afterCount = await countMetrics(databaseUrl, mint);

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "guard_mismatch");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(
        output.reason.includes("expectedMetricsCount mismatch: expected 1, actual 2"),
        true,
      );
      assert.equal(output.guards.metricsCount, 2);
      assert.equal(result.stdout.includes('"rawJson":'), false);
      assert.equal(beforeCount, 2);
      assert.equal(afterCount, 2);
    });
  });

  await t.test("stops when expected stage does not match actual stage", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "expected-stage-mismatch.db")}`;
      const mint = "ExpectedStageMismatchPlanner11111111111111";

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

      const beforeCount = await countMetrics(databaseUrl, mint);
      const result = await runPlanner(
        ["--mint", mint, "--expectedStage", "partial_with_one_metric"],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);
      const afterCount = await countMetrics(databaseUrl, mint);

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "guard_mismatch");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(
        output.reason.includes("expectedStage mismatch: expected partial_with_one_metric, actual two_or_more_metrics"),
        true,
      );
      assert.equal(output.guards.metricsCount, 2);
      assert.equal(result.stdout.includes('"rawJson":'), false);
      assert.equal(beforeCount, 2);
      assert.equal(afterCount, 2);
    });
  });

  await t.test("stops on invalid expected metrics count", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "invalid-expected.db")}`;
      const mint = "InvalidExpectedPlanner1111111111111111111111";

      await runDbPush(databaseUrl);

      const result = await runPlanner(
        ["--mint", mint, "--expectedMetricsCount", "abc"],
        databaseUrl,
      );
      assert.equal(result.ok, false);

      const output = JSON.parse(result.stdout) as PlannerOutput;
      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "invalid_args");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(output.reason.includes("Invalid expectedMetricsCount"), true);
      assert.equal(result.stdout.includes('"rawJson":'), false);
    });
  });

  await t.test("stops on invalid expected metadata status", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "invalid-expected-status.db")}`;
      const mint = "InvalidExpectedStatusPlanner111111111111111";

      await runDbPush(databaseUrl);

      const result = await runPlanner(
        ["--mint", mint, "--expectedMetadataStatus", "unknown"],
        databaseUrl,
      );
      assert.equal(result.ok, false);

      const output = JSON.parse(result.stdout) as PlannerOutput;
      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "invalid_args");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(output.reason.includes("Invalid expectedMetadataStatus"), true);
      assert.equal(result.stdout.includes('"rawJson":'), false);
    });
  });

  await t.test("stops on invalid expected stage", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "invalid-expected-stage.db")}`;
      const mint = "InvalidExpectedStagePlanner1111111111111111";

      await runDbPush(databaseUrl);

      const result = await runPlanner(
        ["--mint", mint, "--expectedStage", "unknown"],
        databaseUrl,
      );
      assert.equal(result.ok, false);

      const output = JSON.parse(result.stdout) as PlannerOutput;
      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "invalid_args");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(output.sideEffectUpperBound, null);
      assert.equal(output.reason.includes("Invalid expectedStage"), true);
      assert.equal(result.stdout.includes('"rawJson":'), false);
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
      assertNoRedCommandSafety(output);
      assert.equal(output.reason.includes("metricsCount>=2"), true);
    });
  });

  await t.test("stops with guard mismatch when hard rejected token is not the expected stage", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "hard-rejected-stage-mismatch.db")}`;
      const mint = "HardRejectedStageMismatchPlanner111111111";

      await runDbPush(databaseUrl);
      await seedToken(databaseUrl, {
        mint,
        metadataStatus: "partial",
        hardRejected: true,
      });

      const result = await runPlanner(
        ["--mint", mint, "--expectedStage", "partial_with_one_metric"],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "guard_mismatch");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(
        output.reason.includes("expectedStage mismatch: expected partial_with_one_metric, actual manual_review_required"),
        true,
      );
      assert.equal(result.stdout.includes('"rawJson":'), false);
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
        await runPlanner(
          ["--mint", mint, "--expectedStage", "manual_review_required"],
          databaseUrl,
        ),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "manual_review_required");
      assert.equal(output.reason.includes("hardRejected=true"), true);
      assertNoRedCommandSafety(output);
    });
  });

  await t.test("stops with guard mismatch when latest metric source mismatch is not the expected stage", async () => {
    await withTempDir(async (dir) => {
      const databaseUrl = `file:${join(dir, "source-stage-mismatch.db")}`;
      const mint = "SourceStageMismatchPlanner111111111111111";

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

      const beforeCount = await countMetrics(databaseUrl, mint);
      const result = await runPlanner(
        ["--mint", mint, "--expectedStage", "partial_with_one_metric"],
        databaseUrl,
      );
      const output = parsePlannerOutput(result);
      const afterCount = await countMetrics(databaseUrl, mint);

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "guard_mismatch");
      assert.equal(output.nextStage, null);
      assertNoRedCommandSafety(output);
      assert.equal(
        output.reason.includes("expectedStage mismatch: expected partial_with_one_metric, actual manual_review_required"),
        true,
      );
      assert.equal(result.stdout.includes('"rawJson":'), false);
      assert.equal(beforeCount, 1);
      assert.equal(afterCount, 1);
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
        await runPlanner(
          ["--mint", mint, "--expectedStage", "manual_review_required"],
          databaseUrl,
        ),
      );

      assert.equal(output.status, "stop");
      assert.equal(output.currentStage, "manual_review_required");
      assert.equal(output.reason.includes("latestMetricSource mismatch"), true);
      assertNoRedCommandSafety(output);
    });
  });
});
