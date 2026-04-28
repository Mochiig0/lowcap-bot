import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeckoMetricAppendRunnerInput,
  buildMetricAppendCommandArgs,
  parseGeckoMetricAppendCommandResult,
  runGeckoMetricAppendCommandWithExecFile,
  runGeckoMetricAppendCommandWithNodeExecFile,
  runGeckoMetricAppendCommandWithRunner,
  toGeckoCatchupMetricAppendExecutionResult,
  type GeckoMetricAppendCommandPlan,
  type GeckoMetricAppendCommandRunner,
  type GeckoMetricAppendExecFile,
  type GeckoMetricAppendRunnerInput,
} from "../src/cli/geckoterminalCatchupMetricAppendRunner.ts";

const MINT = "MetricAppendRunner1111111111111111111111111pump";

function buildCommandPlan(
  overrides: Partial<GeckoMetricAppendCommandPlan> = {},
): GeckoMetricAppendCommandPlan {
  return {
    command: "pnpm",
    script: "metric:snapshot:geckoterminal",
    args: buildMetricAppendCommandArgs(MINT),
    mint: MINT,
    cycle: 1,
    orderInCycle: 1,
    metricAppend: true,
    postCheck: true,
    ...overrides,
  };
}

function buildMetricAppendOutput(overrides: {
  topLevel?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  item?: Record<string, unknown>;
  writeSummary?: Record<string, unknown>;
} = {}): string {
  return JSON.stringify({
    mode: "single",
    dryRun: false,
    writeEnabled: true,
    metricSource: "geckoterminal.token_snapshot",
    originSource: "geckoterminal.new_pools",
    selection: {
      mint: MINT,
      limit: null,
      sinceMinutes: null,
      sinceCutoff: null,
      pumpOnly: false,
      prioritizeRichPending: false,
      selectedCount: 1,
      skippedNonPumpCount: 0,
    },
    summary: {
      selectedCount: 1,
      okCount: 1,
      skippedCount: 0,
      errorCount: 0,
      writtenCount: 1,
      ...overrides.summary,
    },
    items: [
      {
        token: {
          mint: MINT,
          isGeckoterminalOrigin: true,
        },
        metricSource: "geckoterminal.token_snapshot",
        status: "ok",
        writeSummary: {
          dryRun: false,
          wouldCreateMetric: true,
          metricId: 123,
          ...overrides.writeSummary,
        },
        ...overrides.item,
      },
    ],
    ...overrides.topLevel,
  });
}

function assertNoRawRunnerDiagnostics(output: object): void {
  assert.equal("stdout" in output, false);
  assert.equal("stderr" in output, false);
  assert.equal("parsedOutput" in output, false);
  assert.equal("args" in output, false);
  assert.equal("env" in output, false);
  assert.equal("cwd" in output, false);
  assert.equal("command" in output, false);
}

test("builds metric append command args for one mint write", () => {
  assert.deepEqual(buildMetricAppendCommandArgs(MINT), [
    "metric:snapshot:geckoterminal",
    "--",
    "--mint",
    MINT,
    "--write",
  ]);
});

test("parses successful metric append command stdout", () => {
  const parsed = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: buildMetricAppendOutput(),
    stderr: "[metric:snapshot:geckoterminal] synthetic summary",
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.parseError, null);
  assert.equal(parsed.metricSource, "geckoterminal.token_snapshot");
  assert.equal(parsed.selectedCount, 1);
  assert.equal(parsed.okCount, 1);
  assert.equal(parsed.errorCount, 0);
  assert.equal(parsed.writtenCount, 1);
  assert.deepEqual(parsed.writeSummary, {
    dryRun: false,
    wouldCreateMetric: true,
    metricId: 123,
  });
  assert.equal(parsed.itemStatus, "ok");
  assert.equal(parsed.itemError, null);
  assert.equal(parsed.rateLimited, false);
});

test("parses metric append stdout when pnpm banner precedes JSON", () => {
  const parsed = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: [
      "",
      "> lowcap-bot@0.1.0 metric:snapshot:geckoterminal /repo",
      "> tsx src/cli/metricSnapshotGeckoterminal.ts",
      "",
      buildMetricAppendOutput(),
      "",
    ].join("\n"),
    stderr: "[metric:snapshot:geckoterminal] synthetic summary",
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.parseError, null);
  assert.equal(parsed.writtenCount, 1);
  assert.equal(parsed.writeSummary?.metricId, 123);
});

test("classifies item-level errors without relying on exit code", () => {
  const parsed = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: buildMetricAppendOutput({
      summary: {
        okCount: 0,
        errorCount: 1,
        writtenCount: 0,
      },
      item: {
        status: "error",
        error: "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
      },
      writeSummary: {
        wouldCreateMetric: false,
        metricId: null,
      },
    }),
    stderr: "raw item diagnostic",
  });

  assert.equal(parsed.status, "item_error");
  assert.equal(parsed.exitCode, 0);
  assert.equal(parsed.itemStatus, "error");
  assert.match(parsed.itemError ?? "", /429 Too Many Requests/);
  assert.equal(parsed.rateLimited, true);
  assert.equal(parsed.abortedDueToRateLimit, false);
  assert.equal(parsed.writtenCount, 0);
  assert.equal(parsed.writeSummary?.metricId, null);
});

test("classifies dry-run shaped output as unexpected for append runner", () => {
  const parsed = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: buildMetricAppendOutput({
      topLevel: {
        dryRun: true,
        writeEnabled: false,
      },
      summary: {
        writtenCount: 0,
      },
      writeSummary: {
        dryRun: true,
        metricId: null,
      },
    }),
    stderr: "",
  });

  assert.equal(parsed.status, "unexpected_output");
  assert.equal(parsed.writeSummary?.dryRun, true);
  assert.equal(parsed.writeSummary?.metricId, null);
});

test("classifies skipped recent metric as its own non-success status", () => {
  const parsed = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: buildMetricAppendOutput({
      summary: {
        okCount: 0,
        skippedCount: 1,
        writtenCount: 0,
      },
      item: {
        status: "skipped_recent_metric",
        latestObservedAt: "2026-04-28T00:00:00.000Z",
      },
      writeSummary: {
        wouldCreateMetric: false,
        metricId: null,
      },
    }),
    stderr: "",
  });

  assert.equal(parsed.status, "skipped_recent_metric");
  assert.equal(parsed.skippedCount, 1);
  assert.equal(parsed.writtenCount, 0);
});

test("normalizes cli errors and parse errors", () => {
  const cliError = parseGeckoMetricAppendCommandResult({
    exitCode: 1,
    stdout: "",
    stderr: "metric append command failed",
  });
  assert.equal(cliError.status, "cli_error");
  assert.equal(cliError.parseError, "stdout was empty");

  const parseError = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: "{not-json",
    stderr: "malformed stdout",
  });
  assert.equal(parseError.status, "parse_error");
  assert.match(parseError.parseError ?? "", /stdout JSON parse failed/);
});

test("builds metric append runner input from command plan", () => {
  const plan = buildCommandPlan();
  const input = buildGeckoMetricAppendRunnerInput(plan, {
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
      EMPTY_VALUE: "",
      OMITTED_VALUE: undefined,
    },
    timeoutMs: 10_000,
  });

  assert.deepEqual(input, {
    command: "pnpm",
    args: buildMetricAppendCommandArgs(MINT),
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
      EMPTY_VALUE: "",
    },
    timeoutMs: 10_000,
    mint: MINT,
    cycle: 1,
    orderInCycle: 1,
    metricAppend: true,
    postCheck: true,
  });
  assert.notEqual(input.args, plan.args);
});

test("rejects unsupported metric append command plans", () => {
  assert.throws(
    () =>
      buildGeckoMetricAppendRunnerInput(
        buildCommandPlan({
          args: ["metric:snapshot:geckoterminal", "--", "--mint", MINT],
        }),
        { cwd: "/repo" },
      ),
    /requires --write/,
  );
  assert.throws(
    () =>
      buildGeckoMetricAppendRunnerInput(
        buildCommandPlan({
          args: [...buildMetricAppendCommandArgs(MINT), "--watch"],
        }),
        { cwd: "/repo" },
      ),
    /does not support watch/,
  );
  assert.throws(
    () =>
      buildGeckoMetricAppendRunnerInput(
        buildCommandPlan({
          args: buildMetricAppendCommandArgs("DifferentMint111111111111111111111111111pump"),
        }),
        { cwd: "/repo" },
      ),
    /requires matching --mint/,
  );
  assert.throws(
    () =>
      buildGeckoMetricAppendRunnerInput(
        buildCommandPlan({
          args: ["token:enrich-rescore:geckoterminal", "--", "--mint", MINT, "--write"],
        }),
        { cwd: "/repo" },
      ),
    /does not support token write/,
  );
});

test("runs an injected mock metric append runner with structured input", async () => {
  const input = buildGeckoMetricAppendRunnerInput(buildCommandPlan(), {
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
    },
  });
  const calls: GeckoMetricAppendRunnerInput[] = [];
  const expectedResult = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: buildMetricAppendOutput(),
    stderr: "[metric:snapshot:geckoterminal] synthetic summary",
  });
  const runner: GeckoMetricAppendCommandRunner = async (runnerInput) => {
    calls.push(runnerInput);
    return expectedResult;
  };

  const result = await runGeckoMetricAppendCommandWithRunner(runner, input);

  assert.equal(result, expectedResult);
  assert.deepEqual(calls, [input]);
});

test("runs an injected execFile-like adapter with structured command input", async () => {
  const input = buildGeckoMetricAppendRunnerInput(buildCommandPlan(), {
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
    },
    timeoutMs: 15_000,
  });
  const calls: Array<{
    command: string;
    args: string[];
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
    };
  }> = [];
  const execFile: GeckoMetricAppendExecFile = async (command, args, options) => {
    calls.push({ command, args, options });
    return {
      exitCode: 0,
      stdout: buildMetricAppendOutput(),
      stderr: "[metric:snapshot:geckoterminal] synthetic summary",
    };
  };

  const result = await runGeckoMetricAppendCommandWithExecFile(execFile, input);

  assert.deepEqual(calls, [
    {
      command: "pnpm",
      args: buildMetricAppendCommandArgs(MINT),
      options: {
        cwd: "/repo",
        env: {
          DATABASE_URL: "file:/tmp/lowcap-test.db",
        },
        timeoutMs: 15_000,
      },
    },
  ]);
  assert.equal(result.status, "ok");
  assert.equal(result.writeSummary?.metricId, 123);
});

test("exposes node execFile production runner without executing it in tests", () => {
  assert.equal(typeof runGeckoMetricAppendCommandWithNodeExecFile, "function");
});

test("maps runner input and result to sanitized metric append execution result", () => {
  const input = buildGeckoMetricAppendRunnerInput(buildCommandPlan(), {
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
    },
  });
  const result = parseGeckoMetricAppendCommandResult({
    exitCode: 0,
    stdout: buildMetricAppendOutput(),
    stderr: "[metric:snapshot:geckoterminal] synthetic summary",
  });

  const executionResult = toGeckoCatchupMetricAppendExecutionResult(input, result);

  assert.deepEqual(executionResult, {
    mint: MINT,
    cycle: 1,
    orderInCycle: 1,
    status: "ok",
    exitCode: 0,
    metricSource: "geckoterminal.token_snapshot",
    selectedCount: 1,
    okCount: 1,
    skippedCount: 0,
    errorCount: 0,
    writtenCount: 1,
    writeSummary: {
      dryRun: false,
      wouldCreateMetric: true,
      metricId: 123,
    },
    itemStatus: "ok",
    itemError: null,
    rateLimited: false,
    abortedDueToRateLimit: false,
    skippedAfterRateLimit: 0,
    parseError: null,
  });
  assertNoRawRunnerDiagnostics(executionResult);
});
