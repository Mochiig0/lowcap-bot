import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ValidatorOutput = {
  status: "ok" | "stop";
  reason: string;
  mint: string | null;
  currentStage: string | null;
  nextRedCommandKind: string | null;
  approvalReady: boolean;
  canProceedToHumanGate: boolean;
  checks: {
    hasNextRedCommand: boolean;
    requiresHumanApproval: boolean;
    executorIsHuman: boolean;
    plannerWillNotExecute: boolean;
    sideEffectWithinBounds: boolean;
    stopConditionCodesPresent: boolean;
    rawJsonFree: boolean;
  };
  nextRedCommand: string | null;
};

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const STOP_CONDITION_CODES = [
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

function tmuxSideEffectSpec(): Record<string, unknown> {
  return {
    metricWriteMax: 1,
    tokenWrite: false,
    tokenWriteMax: 0,
    telegramSend: false,
    tmux: true,
    tmuxSession: "lowcap-gecko-metric-single",
    checkpointWrite: false,
    systemd: false,
    multiMint: false,
  };
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-validate-test-"));

  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runValidator(
  args: string[],
  stdinText?: string,
): Promise<RunResult> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-validate-run-"));
  const stdinPath = join(dir, "stdin.json");
  const stdoutPath = join(dir, "stdout.json");
  const stderrPath = join(dir, "stderr.log");
  const stdinRedirect =
    stdinText === undefined
      ? "< /dev/null"
      : `< ${shellEscape(stdinPath)}`;

  try {
    if (stdinText !== undefined) {
      await writeFile(stdinPath, stdinText, "utf-8");
    }

    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalSingleCandidateValidate.ts",
          ...args.map(shellEscape),
          stdinRedirect,
          `> ${shellEscape(stdoutPath)}`,
          `2> ${shellEscape(stderrPath)}`,
        ].join(" "),
      ],
      {
        cwd: process.cwd(),
      },
    );

    return {
      code: 0,
      stdout: (await readFile(stdoutPath, "utf-8")).trim(),
      stderr: (await readFile(stderrPath, "utf-8")).trim(),
    };
  } catch (error) {
    const output = error as {
      code?: number | null;
    };

    return {
      code: output.code ?? null,
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

function parseOutput(result: RunResult): ValidatorOutput {
  return JSON.parse(result.stdout) as ValidatorOutput;
}

function plannerOutput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: "ok",
    mint: "ValidatePlannerMint11111111111111111111111111",
    currentStage: "partial_with_one_metric",
    nextStage: "second_metric_write_or_tmux_single",
    reason: "fixture planner output",
    nextRedCommand:
      "tmux new-session -d -s lowcap-gecko-metric-single \"bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint ValidatePlannerMint11111111111111111111111111 --write > /tmp/lowcap-gecko-metric-single.log 2>&1'\"",
    nextRedCommandKind: "tmux_metric_single_mint",
    requiresHumanApproval: true,
    executor: "human",
    willExecute: false,
    sideEffectUpperBoundSpec: tmuxSideEffectSpec(),
    stopConditionCodes: [...STOP_CONDITION_CODES],
    rawJsonFreeRequired: true,
    ...overrides,
  };
}

async function validateJson(
  value: Record<string, unknown>,
): Promise<ValidatorOutput> {
  const result = await runValidator([], `${JSON.stringify(value)}\n`);
  return parseOutput(result);
}

async function assertStops(
  value: Record<string, unknown>,
  expectedReason: string,
): Promise<ValidatorOutput> {
  const output = await validateJson(value);
  assert.equal(output.status, "stop");
  assert.equal(output.approvalReady, false);
  assert.equal(output.canProceedToHumanGate, false);
  assert.equal(output.reason.includes(expectedReason), true);
  return output;
}

test("geckoterminal single candidate validator", async (t) => {
  await t.test("accepts a tmux_metric_single_mint planner output from file", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "planner-output.json");
      await writeFile(path, JSON.stringify(plannerOutput()), "utf-8");

      const result = await runValidator(["--plannerJson", path]);
      const output = parseOutput(result);

      assert.equal(result.code, 0);
      assert.equal(output.status, "ok");
      assert.equal(output.approvalReady, true);
      assert.equal(output.canProceedToHumanGate, true);
      assert.equal(output.nextRedCommandKind, "tmux_metric_single_mint");
      assert.equal(output.checks.hasNextRedCommand, true);
      assert.equal(output.checks.requiresHumanApproval, true);
      assert.equal(output.checks.executorIsHuman, true);
      assert.equal(output.checks.plannerWillNotExecute, true);
      assert.equal(output.checks.sideEffectWithinBounds, true);
      assert.equal(output.checks.stopConditionCodesPresent, true);
      assert.equal(output.checks.rawJsonFree, true);
      assert.notEqual(output.nextRedCommand, null);
      assert.equal(result.stdout.includes('"rawJson":'), false);
    });
  });

  await t.test("accepts planner output from stdin", async () => {
    const result = await runValidator([], `${JSON.stringify(plannerOutput())}\n`);
    const output = parseOutput(result);

    assert.equal(result.code, 0);
    assert.equal(output.status, "ok");
    assert.equal(output.approvalReady, true);
  });

  await t.test("stops when nextRedCommand is null", async () => {
    await assertStops(
      plannerOutput({
        nextRedCommand: null,
        nextRedCommandKind: null,
      }),
      "nextRedCommand is missing",
    );
  });

  await t.test("stops on guard_mismatch stage", async () => {
    await assertStops(
      plannerOutput({
        status: "stop",
        currentStage: "guard_mismatch",
      }),
      "currentStage=guard_mismatch must stop",
    );
  });

  await t.test("stops on invalid_args stage", async () => {
    await assertStops(
      plannerOutput({
        status: "stop",
        currentStage: "invalid_args",
      }),
      "currentStage=invalid_args must stop",
    );
  });

  await t.test("stops on manual_review_required stage", async () => {
    await assertStops(
      plannerOutput({
        status: "stop",
        currentStage: "manual_review_required",
      }),
      "currentStage=manual_review_required must stop",
    );
  });

  await t.test("stops when approval metadata is inconsistent", async (t2) => {
    await t2.test("requiresHumanApproval=false with command present", async () => {
      await assertStops(
        plannerOutput({
          requiresHumanApproval: false,
        }),
        "requiresHumanApproval is not true",
      );
    });

    await t2.test("executor is not human with command present", async () => {
      await assertStops(
        plannerOutput({
          executor: "none",
        }),
        "executor is not human",
      );
    });

    await t2.test("willExecute=true", async () => {
      await assertStops(
        plannerOutput({
          willExecute: true,
        }),
        "willExecute is not false",
      );
    });
  });

  await t.test("stops when sideEffectUpperBoundSpec exceeds bounds", async (t2) => {
    await t2.test("metricWriteMax > 1", async () => {
      await assertStops(
        plannerOutput({
          sideEffectUpperBoundSpec: {
            ...tmuxSideEffectSpec(),
            metricWriteMax: 2,
          },
        }),
        "sideEffectUpperBoundSpec is outside validator bounds",
      );
    });

    await t2.test("telegramSend=true", async () => {
      await assertStops(
        plannerOutput({
          sideEffectUpperBoundSpec: {
            ...tmuxSideEffectSpec(),
            telegramSend: true,
          },
        }),
        "sideEffectUpperBoundSpec is outside validator bounds",
      );
    });

    await t2.test("systemd=true", async () => {
      await assertStops(
        plannerOutput({
          sideEffectUpperBoundSpec: {
            ...tmuxSideEffectSpec(),
            systemd: true,
          },
        }),
        "sideEffectUpperBoundSpec is outside validator bounds",
      );
    });

    await t2.test("multiMint=true", async () => {
      await assertStops(
        plannerOutput({
          sideEffectUpperBoundSpec: {
            ...tmuxSideEffectSpec(),
            multiMint: true,
          },
        }),
        "sideEffectUpperBoundSpec is outside validator bounds",
      );
    });

    await t2.test("checkpointWrite=true", async () => {
      await assertStops(
        plannerOutput({
          sideEffectUpperBoundSpec: {
            ...tmuxSideEffectSpec(),
            checkpointWrite: true,
          },
        }),
        "sideEffectUpperBoundSpec is outside validator bounds",
      );
    });
  });

  await t.test("stops when stopConditionCodes are missing", async () => {
    const output = await assertStops(
      plannerOutput({
        stopConditionCodes: undefined,
      }),
      "required stopConditionCodes are missing",
    );

    assert.equal(output.checks.stopConditionCodesPresent, false);
  });

  await t.test("stops when a required stopConditionCode is missing", async () => {
    const output = await assertStops(
      plannerOutput({
        stopConditionCodes: STOP_CONDITION_CODES.filter(
          (code) => code !== "git_dirty",
        ),
      }),
      "required stopConditionCodes are missing",
    );

    assert.equal(output.checks.stopConditionCodesPresent, false);
  });

  await t.test("stops and does not echo command when a rawJson key is present", async () => {
    const result = await runValidator(
      [],
      `${JSON.stringify(
        plannerOutput({
          latestMetric: {
            rawJson: {
              token: "payload",
            },
          },
        }),
      )}\n`,
    );
    const output = parseOutput(result);

    assert.equal(output.status, "stop");
    assert.equal(output.checks.rawJsonFree, false);
    assert.equal(output.nextRedCommand, null);
    assert.equal(result.stdout.includes('"rawJson":'), false);
  });

  await t.test("stops and does not echo command when secret marker is present", async () => {
    const result = await runValidator(
      [],
      `${JSON.stringify(
        plannerOutput({
          nextRedCommand: "echo TELEGRAM_BOT_TOKEN",
        }),
      )}\n`,
    );
    const output = parseOutput(result);

    assert.equal(output.status, "stop");
    assert.equal(output.checks.rawJsonFree, false);
    assert.equal(output.nextRedCommand, null);
    assert.equal(result.stdout.includes("TELEGRAM_BOT_TOKEN"), false);
  });

  await t.test("stops on invalid JSON", async () => {
    const result = await runValidator([], "{not-json");
    const output = parseOutput(result);

    assert.equal(result.code, 1);
    assert.equal(output.status, "stop");
    assert.equal(output.reason.includes("planner JSON parse failed"), true);
  });

  await t.test("stops when no input is provided", async () => {
    const result = await runValidator([]);
    const output = parseOutput(result);

    assert.equal(result.code, 1);
    assert.equal(output.status, "stop");
    assert.equal(output.reason.includes("provide --plannerJson"), true);
  });

  await t.test("stops when both stdin and --plannerJson are provided", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "planner-output.json");
      await writeFile(path, JSON.stringify(plannerOutput()), "utf-8");

      const result = await runValidator(
        ["--plannerJson", path],
        `${JSON.stringify(plannerOutput())}\n`,
      );
      const output = parseOutput(result);

      assert.equal(result.code, 1);
      assert.equal(output.status, "stop");
      assert.equal(output.reason.includes("use either --plannerJson or stdin"), true);
    });
  });
});
