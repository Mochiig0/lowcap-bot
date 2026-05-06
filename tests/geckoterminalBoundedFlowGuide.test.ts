import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type GuideStep = {
  order: number;
  stage: string;
  kind: string;
  commands?: string[];
  description?: string;
  willExecute: boolean;
};

type GuideOutput = {
  status: "ok" | "stop";
  reason: string;
  mint: string | null;
  mode: string;
  willExecute: boolean;
  executor: string;
  rawJsonFreeRequired: boolean;
  steps: GuideStep[];
  forbidden: string[];
  notes: string[];
};

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const TARGET_MINT = "GuideMint111111111111111111111111111111111";

async function runGuide(args: string[]): Promise<RunResult> {
  const dir = await mkdtemp(join(tmpdir(), "lowcap-gecko-guide-test-"));
  const stdoutPath = join(dir, "stdout.json");
  const stderrPath = join(dir, "stderr.log");

  try {
    await execFileAsync(
      "bash",
      [
        "-lc",
        [
          "node --import tsx src/cli/geckoterminalBoundedFlowGuide.ts",
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

function parseOutput(result: RunResult): GuideOutput {
  return JSON.parse(result.stdout) as GuideOutput;
}

function allCommands(output: GuideOutput): string[] {
  return output.steps.flatMap((step) => step.commands ?? []);
}

test("geckoterminal bounded flow guide", async (t) => {
  await t.test("requires --mint", async () => {
    const result = await runGuide([]);
    const output = parseOutput(result);

    assert.equal(result.code, 1);
    assert.equal(output.status, "stop");
    assert.match(output.reason, /missing mint/);
    assert.equal(output.mint, null);
    assert.deepEqual(output.steps, []);
  });

  await t.test("prints a non-executor guide for a mint", async () => {
    const result = await runGuide(["--mint", TARGET_MINT]);
    const output = parseOutput(result);

    assert.equal(result.code, 0);
    assert.equal(output.status, "ok");
    assert.equal(output.mint, TARGET_MINT);
    assert.equal(output.mode, "non_executor_guide");
    assert.equal(output.willExecute, false);
    assert.equal(output.executor, "human");
    assert.equal(output.rawJsonFreeRequired, true);
    assert.deepEqual(
      output.steps.map((step) => step.stage),
      [
        "baseline",
        "planner",
        "validator",
        "human_gate",
        "red_execution",
        "report_confirmation",
        "docs_record",
      ],
    );
    assert.deepEqual(
      output.steps.map((step) => step.order),
      [1, 2, 3, 4, 5, 6, 7],
    );
    assert.equal(output.steps.every((step) => step.willExecute === false), true);
  });

  await t.test("includes the expected command strings without executing Red steps", async () => {
    const output = parseOutput(await runGuide(["--mint", TARGET_MINT]));
    const commands = allCommands(output);
    const baseline = output.steps.find((step) => step.stage === "baseline");
    const planner = output.steps.find((step) => step.stage === "planner");
    const validator = output.steps.find((step) => step.stage === "validator");
    const report = output.steps.find((step) => step.stage === "report_confirmation");
    const red = output.steps.find((step) => step.stage === "red_execution");

    assert.ok(baseline?.commands?.some((command) => command.includes("token:compare")));
    assert.ok(baseline?.commands?.some((command) => command.includes("metrics:report")));
    assert.ok(planner?.commands?.[0]?.includes("ops:gecko:single-candidate:plan"));
    assert.ok(validator?.commands?.[0]?.includes("ops:gecko:single-candidate:validate"));
    assert.ok(report?.commands?.some((command) => command.includes("metrics:report")));
    assert.ok(report?.commands?.some((command) => command.includes("token:compare")));
    assert.equal(red?.kind, "red_placeholder");
    assert.equal(red?.commands, undefined);
    assert.equal(commands.some((command) => command.includes("--write")), false);
    assert.equal(commands.some((command) => command.includes("tmux new-session")), false);
  });

  await t.test("passes optional guards into the planner command", async () => {
    const output = parseOutput(
      await runGuide([
        "--mint",
        TARGET_MINT,
        "--expectedMetricsCount",
        "1",
        "--expectedMetadataStatus",
        "partial",
        "--expectedStage",
        "partial_with_one_metric",
      ]),
    );
    const planner = output.steps.find((step) => step.stage === "planner");
    const command = planner?.commands?.[0] ?? "";

    assert.equal(output.status, "ok");
    assert.match(command, /--expectedMetricsCount 1/);
    assert.match(command, /--expectedMetadataStatus partial/);
    assert.match(command, /--expectedStage partial_with_one_metric/);
    assert.match(command, /> \/tmp\/lowcap-planner\.json$/);
  });

  await t.test("rejects invalid expectedMetricsCount", async () => {
    const output = parseOutput(
      await runGuide(["--mint", TARGET_MINT, "--expectedMetricsCount", "1.5"]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid expectedMetricsCount/);
  });

  await t.test("rejects invalid expectedMetadataStatus", async () => {
    const output = parseOutput(
      await runGuide(["--mint", TARGET_MINT, "--expectedMetadataStatus", "unknown"]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid expectedMetadataStatus/);
  });

  await t.test("rejects invalid expectedStage", async () => {
    const output = parseOutput(
      await runGuide(["--mint", TARGET_MINT, "--expectedStage", "unknown"]),
    );

    assert.equal(output.status, "stop");
    assert.match(output.reason, /invalid expectedStage/);
  });

  await t.test("lists forbidden expansions", async () => {
    const output = parseOutput(await runGuide(["--mint", TARGET_MINT]));

    for (const item of [
      "Telegram send",
      "systemd",
      "scheduler",
      "queue",
      "unbounded watch",
      "default checkpoint",
      "multi-mint",
      "silent retry",
    ]) {
      assert.equal(output.forbidden.includes(item), true, item);
    }
  });

  await t.test("does not expose rawJson in output", async () => {
    const result = await runGuide(["--mint", TARGET_MINT]);

    assert.equal(result.stdout.includes('"rawJson":'), false);
  });
});
