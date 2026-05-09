import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

type PlanOutput = {
  status: "ok" | "stop";
  reason: string;
  mode: string;
  willExecute: boolean;
  executor: string;
  mint: string | null;
  intent: string | null;
  operatorMode: string;
  expectedMetricsCount: number | null;
  expectedMetadataStatus: string | null;
  expectedStage: string | null;
  currentStage: string | null;
  nextStage: string | null;
  stageOrder: string[];
  commands: {
    baseline: string[];
    guide: string;
    planner: string;
    validator: string;
    redExecution: {
      placeholder: boolean;
      exactCommand: string | null;
    };
    reportConfirmation: string[];
  } | null;
  approvalRequest: {
    requiredFields: string[];
  };
  sideEffectUpperBoundSpec: SideEffectUpperBoundSpec;
  stopConditionCodes: string[];
  forbidden: string[];
  rawJsonFreeRequired: boolean;
};

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const TARGET_MINT = "PlanMint1111111111111111111111111111111111";

const EXPECTED_STAGE_ORDER = [
  "baseline",
  "guide",
  "planner",
  "validator",
  "human_gate",
  "red_execution",
  "report_confirmation",
  "docs_record",
];

const EXPECTED_STOP_CONDITION_CODES = [
  "git_dirty",
  "head_mismatch",
  "origin_mismatch",
  "mint_missing_or_ambiguous",
  "intent_missing_or_invalid",
  "guard_mismatch",
  "metadata_status_mismatch",
  "metrics_count_mismatch",
  "expected_stage_mismatch",
  "planner_status_not_ok",
  "validator_not_approval_ready",
  "next_red_command_missing",
  "next_red_command_kind_mismatch",
  "side_effect_bound_exceeded",
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
  "multi_mint_expansion_risk",
];

const EXPECTED_FORBIDDEN = [
  "existing CLI execution by wrapper",
  "planner execution by wrapper",
  "validator execution by wrapper",
  "nextRedCommand execution",
  "Red command execution",
  "--write execution",
  "--watch execution",
  "tmux start",
  "Telegram send",
  "systemd",
  "scheduler",
  "queue",
  "unbounded watch",
  "default checkpoint",
  "multi-mint",
  "silent retry",
];

function baseSideEffectSpec(): SideEffectUpperBoundSpec {
  return {
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
}

function enrichSideEffectSpec(): SideEffectUpperBoundSpec {
  return {
    ...baseSideEffectSpec(),
    tokenWrite: true,
    tokenWriteMax: 1,
  };
}

function firstMetricSideEffectSpec(): SideEffectUpperBoundSpec {
  return {
    ...baseSideEffectSpec(),
    metricWriteMax: 1,
  };
}

function secondMetricSideEffectSpec(): SideEffectUpperBoundSpec {
  return {
    ...baseSideEffectSpec(),
    metricWriteMax: 1,
    tmux: true,
    tmuxSession: "lowcap-gecko-metric-single",
  };
}

async function runPlan(args: string[]): Promise<RunResult> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-flow-plan-test-"));
  const stdoutPath = join(dir, "stdout.json");
  const stderrPath = join(dir, "stderr.log");

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalBoundedFlowPlan.ts",
          ...args.map(shellEscape),
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      { cwd: process.cwd() },
    );
    return {
      code: 0,
      stdout: (await readFile(stdoutPath, "utf-8")).trim(),
      stderr: (await readFile(stderrPath, "utf-8")).trim(),
    };
  } catch (error) {
    const failed = error as {
      code?: number | null;
    };
    return {
      code: failed.code ?? null,
      stdout: (await readFile(stdoutPath, "utf-8").catch(() => "")).trim(),
      stderr: (await readFile(stderrPath, "utf-8").catch(() => "")).trim(),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseOutput(result: RunResult): PlanOutput {
  return JSON.parse(result.stdout) as PlanOutput;
}

function assertCommonNonExecutorOutput(output: PlanOutput): void {
  assert.equal(output.mode, "non_executor_wrapper");
  assert.equal(output.willExecute, false);
  assert.equal(output.executor, "human");
  assert.equal(output.operatorMode, "human_gated");
  assert.equal(output.currentStage, null);
  assert.equal(output.nextStage, null);
  assert.deepEqual(output.stageOrder, EXPECTED_STAGE_ORDER);
  assert.deepEqual(output.stopConditionCodes, EXPECTED_STOP_CONDITION_CODES);
  assert.deepEqual(output.forbidden, EXPECTED_FORBIDDEN);
  assert.equal(output.rawJsonFreeRequired, true);
}

function assertCommands(output: PlanOutput, intent: string): void {
  assert.ok(output.commands);
  assert.ok(output.commands.baseline.some((command) => command.includes("token:compare")));
  assert.ok(output.commands.baseline.some((command) => command.includes("token:show")));
  assert.ok(output.commands.baseline.some((command) => command.includes("metrics:report")));
  assert.match(output.commands.guide, /ops:gecko:bounded-flow:guide/);
  assert.match(output.commands.guide, new RegExp(`--intent ${intent}`));
  assert.match(output.commands.planner, /ops:gecko:single-candidate:plan/);
  assert.match(output.commands.validator, /ops:gecko:single-candidate:validate/);
  assert.ok(
    output.commands.reportConfirmation.some((command) =>
      command.includes("metrics:report"),
    ),
  );
  assert.ok(
    output.commands.reportConfirmation.some((command) =>
      command.includes("token:compare"),
    ),
  );
  assert.ok(
    output.commands.reportConfirmation.some((command) =>
      command.includes("token:show"),
    ),
  );
}

test("geckoterminal bounded flow non-executor plan", async (t) => {
  await t.test("stops when --mint is missing", async () => {
    const result = await runPlan(["--intent", "first_metric_snapshot"]);
    const output = parseOutput(result);

    assert.equal(result.code, 1);
    assert.equal(output.status, "stop");
    assert.match(output.reason, /missing mint/);
    assert.equal(output.willExecute, false);
  });

  await t.test("stops when --intent is missing", async () => {
    const result = await runPlan(["--mint", TARGET_MINT]);
    const output = parseOutput(result);

    assert.equal(result.code, 1);
    assert.equal(output.status, "stop");
    assert.match(output.reason, /missing intent/);
    assert.equal(output.willExecute, false);
  });

  await t.test("stops on invalid --intent", async () => {
    const output = parseOutput(
      await runPlan(["--mint", TARGET_MINT, "--intent", "unknown"]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid intent/);
  });

  await t.test("stops on duplicate --intent", async () => {
    const output = parseOutput(
      await runPlan([
        "--mint",
        TARGET_MINT,
        "--intent",
        "enrich_rescore",
        "--intent",
        "first_metric_snapshot",
      ]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /duplicate --intent/);
  });

  await t.test("stops on invalid expectedMetricsCount", async () => {
    const output = parseOutput(
      await runPlan([
        "--mint",
        TARGET_MINT,
        "--intent",
        "first_metric_snapshot",
        "--expectedMetricsCount",
        "1.5",
      ]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid expectedMetricsCount/);
  });

  await t.test("stops on invalid expectedMetadataStatus", async () => {
    const output = parseOutput(
      await runPlan([
        "--mint",
        TARGET_MINT,
        "--intent",
        "first_metric_snapshot",
        "--expectedMetadataStatus",
        "enriched",
      ]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid expectedMetadataStatus/);
  });

  await t.test("stops on invalid expectedStage", async () => {
    const output = parseOutput(
      await runPlan([
        "--mint",
        TARGET_MINT,
        "--intent",
        "first_metric_snapshot",
        "--expectedStage",
        "partial_with_two_metrics",
      ]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid expectedStage/);
  });

  await t.test("applies enrich_rescore defaults", async () => {
    const output = parseOutput(
      await runPlan(["--mint", TARGET_MINT, "--intent", "enrich_rescore"]),
    );

    assert.equal(output.status, "ok");
    assert.equal(output.intent, "enrich_rescore");
    assert.equal(output.expectedMetricsCount, 0);
    assert.equal(output.expectedMetadataStatus, "mint_only");
    assert.equal(output.expectedStage, "mint_only_without_metrics");
    assert.deepEqual(output.sideEffectUpperBoundSpec, enrichSideEffectSpec());
    assertCommonNonExecutorOutput(output);
    assertCommands(output, "enrich_rescore");
  });

  await t.test("applies first_metric_snapshot defaults", async () => {
    const output = parseOutput(
      await runPlan(["--mint", TARGET_MINT, "--intent", "first_metric_snapshot"]),
    );

    assert.equal(output.status, "ok");
    assert.equal(output.intent, "first_metric_snapshot");
    assert.equal(output.expectedMetricsCount, 0);
    assert.equal(output.expectedMetadataStatus, "partial");
    assert.equal(output.expectedStage, "partial_without_metrics");
    assert.deepEqual(output.sideEffectUpperBoundSpec, firstMetricSideEffectSpec());
    assertCommonNonExecutorOutput(output);
    assertCommands(output, "first_metric_snapshot");
  });

  await t.test("applies second_metric_snapshot defaults", async () => {
    const output = parseOutput(
      await runPlan(["--mint", TARGET_MINT, "--intent", "second_metric_snapshot"]),
    );

    assert.equal(output.status, "ok");
    assert.equal(output.intent, "second_metric_snapshot");
    assert.equal(output.expectedMetricsCount, 1);
    assert.equal(output.expectedMetadataStatus, "partial");
    assert.equal(output.expectedStage, "partial_with_one_metric");
    assert.deepEqual(output.sideEffectUpperBoundSpec, secondMetricSideEffectSpec());
    assertCommonNonExecutorOutput(output);
    assertCommands(output, "second_metric_snapshot");
  });

  await t.test("accepts explicit guards that match intent defaults", async () => {
    const output = parseOutput(
      await runPlan([
        "--mint",
        TARGET_MINT,
        "--intent",
        "second_metric_snapshot",
        "--expectedMetricsCount",
        "1",
        "--expectedMetadataStatus",
        "partial",
        "--expectedStage",
        "partial_with_one_metric",
      ]),
    );

    assert.equal(output.status, "ok");
    assert.equal(output.expectedMetricsCount, 1);
    assert.equal(output.expectedMetadataStatus, "partial");
    assert.equal(output.expectedStage, "partial_with_one_metric");
  });

  await t.test("stops when explicit guards conflict with intent defaults", async () => {
    const result = await runPlan([
      "--mint",
      TARGET_MINT,
      "--intent",
      "second_metric_snapshot",
      "--expectedMetricsCount",
      "0",
    ]);
    const output = parseOutput(result);

    assert.equal(result.code, 1);
    assert.equal(output.status, "stop");
    assert.match(output.reason, /intent conflict/);
    assert.equal(output.willExecute, false);
  });

  await t.test("keeps redExecution as a placeholder without exact command", async () => {
    const output = parseOutput(
      await runPlan(["--mint", TARGET_MINT, "--intent", "second_metric_snapshot"]),
    );

    assert.equal(output.commands?.redExecution.placeholder, true);
    assert.equal(output.commands?.redExecution.exactCommand, null);
    assert.equal(JSON.stringify(output.commands?.redExecution).includes("--write"), false);
    assert.equal(
      JSON.stringify(output.commands?.redExecution).includes("tmux new-session"),
      false,
    );
  });

  await t.test("does not print a concrete tmux new-session command", async () => {
    const result = await runPlan([
      "--mint",
      TARGET_MINT,
      "--intent",
      "second_metric_snapshot",
    ]);

    assert.equal(result.stdout.includes("tmux new-session"), false);
  });

  await t.test("contains the approval request field list", async () => {
    const output = parseOutput(
      await runPlan(["--mint", TARGET_MINT, "--intent", "first_metric_snapshot"]),
    );

    assert.deepEqual(output.approvalRequest.requiredFields, [
      "repo_state",
      "baseline",
      "guide_result",
      "planner_result",
      "validator_result",
      "exact_red_command",
      "side_effect_upper_bound",
      "stop_conditions",
      "rawjson_free_confirmation",
      "not_executed_list",
    ]);
  });

  await t.test("does not expose a rawJson field", async () => {
    const result = await runPlan([
      "--mint",
      TARGET_MINT,
      "--intent",
      "first_metric_snapshot",
    ]);

    assert.equal(result.stdout.includes('"rawJson":'), false);
  });

  await t.test("uses no DB, network, fs, or child_process imports in the CLI", async () => {
    const source = await readFile(
      "src/cli/geckoterminalBoundedFlowPlan.ts",
      "utf-8",
    );

    assert.equal(source.includes("@prisma/client"), false);
    assert.equal(source.includes("./db"), false);
    assert.equal(source.includes("node:child_process"), false);
    assert.equal(source.includes("node:fs"), false);
    assert.equal(source.includes("fetch("), false);
    assert.equal(source.includes("node:https"), false);
  });
});
