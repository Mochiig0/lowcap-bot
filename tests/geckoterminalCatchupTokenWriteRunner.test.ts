import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeckoTokenWriteRunnerInput,
  parseGeckoTokenWriteCommandResult,
  runGeckoTokenWriteCommandWithExecFile,
  runGeckoTokenWriteCommandWithNodeExecFile,
  runGeckoTokenWriteCommandWithRunner,
  type GeckoTokenWriteCommandPlan,
  type GeckoTokenWriteCommandRunner,
  type GeckoTokenWriteExecFile,
  type GeckoTokenWriteRunnerInput,
} from "../src/cli/geckoterminalCatchupTokenWriteRunner.ts";

function buildCommandPlan(overrides: Partial<GeckoTokenWriteCommandPlan> = {}): GeckoTokenWriteCommandPlan {
  return {
    command: "pnpm",
    script: "token:enrich-rescore:geckoterminal",
    args: [
      "token:enrich-rescore:geckoterminal",
      "--",
      "--mint",
      "RunnerInput111111111111111111111111111111111pump",
      "--write",
    ],
    mint: "RunnerInput111111111111111111111111111111111pump",
    cycle: 1,
    orderInCycle: 1,
    notify: false,
    metricAppend: false,
    postCheck: true,
    ...overrides,
  };
}

function buildTokenWriteOutput(overrides: {
  summary?: Record<string, unknown>;
  item?: Record<string, unknown>;
} = {}): string {
  return JSON.stringify({
    mode: "single",
    dryRun: false,
    writeEnabled: true,
    notifyEnabled: false,
    source: "geckoterminal.new_pools",
    selection: {
      mint: "RunnerParse111111111111111111111111111111111pump",
      limit: null,
      sinceMinutes: null,
      sinceCutoff: null,
      pumpOnly: false,
      selectedCount: 1,
      selectedIncompleteCount: 1,
      skippedCompleteCount: 0,
      skippedNonPumpCount: 0,
    },
    summary: {
      selectedCount: 1,
      selectedIncompleteCount: 1,
      skippedCompleteCount: 0,
      skippedNonPumpCount: 0,
      okCount: 1,
      errorCount: 0,
      enrichWriteCount: 1,
      rescoreWriteCount: 1,
      contextAvailableCount: 1,
      contextWriteCount: 1,
      metaplexAttemptedCount: 1,
      metaplexAvailableCount: 1,
      metaplexWriteCount: 1,
      metaplexSavedCount: 1,
      metaplexErrorKindCounts: {},
      notifyCandidateCount: 1,
      notifyWouldSendCount: 1,
      notifySentCount: 0,
      rateLimited: false,
      rateLimitedCount: 0,
      abortedDueToRateLimit: false,
      skippedAfterRateLimit: 0,
      ...overrides.summary,
    },
    items: [
      {
        status: "ok",
        notifySent: false,
        metaplexErrorKind: null,
        writeSummary: {
          dryRun: false,
          enrichUpdated: true,
          rescoreUpdated: true,
          contextUpdated: true,
          metaplexContextUpdated: true,
        },
        ...overrides.item,
      },
    ],
  });
}

test("parses successful token write command stdout as primary result", () => {
  const parsed = parseGeckoTokenWriteCommandResult({
    exitCode: 0,
    stdout: buildTokenWriteOutput(),
    stderr:
      "[token:enrich-rescore:geckoterminal] mode=single selected=1 notifySent=0 rateLimited=false",
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.parseError, null);
  assert.equal(parsed.parsedOutput?.mode, "single");
  assert.deepEqual(parsed.writeSummary, {
    enrichUpdated: true,
    rescoreUpdated: true,
    contextUpdated: true,
    metaplexContextUpdated: true,
  });
  assert.equal(parsed.notifySent, false);
  assert.equal(parsed.rateLimited, false);
  assert.equal(parsed.abortedDueToRateLimit, false);
  assert.equal(parsed.skippedAfterRateLimit, 0);
  assert.equal(parsed.itemError, null);
  assert.equal(parsed.stderr.includes("mode=single"), true);
});

test("builds token-only runner input from write command plan", () => {
  const plan = buildCommandPlan();
  const input = buildGeckoTokenWriteRunnerInput(plan, {
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
    args: [
      "token:enrich-rescore:geckoterminal",
      "--",
      "--mint",
      "RunnerInput111111111111111111111111111111111pump",
      "--write",
    ],
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
      EMPTY_VALUE: "",
    },
    timeoutMs: 10_000,
    mint: "RunnerInput111111111111111111111111111111111pump",
    cycle: 1,
    orderInCycle: 1,
    notify: false,
    metricAppend: false,
    postCheck: true,
  });
  assert.notEqual(input.args, plan.args);
});

test("uses a default timeout for token write runner input", () => {
  const input = buildGeckoTokenWriteRunnerInput(buildCommandPlan(), {
    cwd: "/repo",
  });

  assert.equal(input.timeoutMs, 60_000);
  assert.deepEqual(input.env, {});
});

test("rejects notify command plans before runner execution exists", () => {
  assert.throws(
    () =>
      buildGeckoTokenWriteRunnerInput(
        buildCommandPlan({
          args: [
            "token:enrich-rescore:geckoterminal",
            "--",
            "--mint",
            "RunnerInput111111111111111111111111111111111pump",
            "--write",
            "--notify",
          ],
        }),
        { cwd: "/repo" },
      ),
    /does not support notify/,
  );
});

test("rejects metric append command plans before runner execution exists", () => {
  assert.throws(
    () =>
      buildGeckoTokenWriteRunnerInput(
        buildCommandPlan({
          args: ["metric:add", "--mint", "RunnerInput111111111111111111111111111111111pump"],
        }),
        { cwd: "/repo" },
      ),
    /does not support metric append/,
  );
});

test("runs an injected mock token write runner with structured input", async () => {
  const input = buildGeckoTokenWriteRunnerInput(buildCommandPlan(), {
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
    },
  });
  const calls: GeckoTokenWriteRunnerInput[] = [];
  const expectedResult = parseGeckoTokenWriteCommandResult({
    exitCode: 0,
    stdout: buildTokenWriteOutput(),
    stderr:
      "[token:enrich-rescore:geckoterminal] mode=single selected=1 notifySent=0 rateLimited=false",
  });
  const runner: GeckoTokenWriteCommandRunner = async (runnerInput) => {
    calls.push(runnerInput);
    return expectedResult;
  };

  const result = await runGeckoTokenWriteCommandWithRunner(runner, input);

  assert.equal(result, expectedResult);
  assert.deepEqual(calls, [input]);
});

test("runs an injected execFile-like adapter with structured command input", async () => {
  const input = buildGeckoTokenWriteRunnerInput(buildCommandPlan(), {
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
  const execFile: GeckoTokenWriteExecFile = async (command, args, options) => {
    calls.push({ command, args, options });
    return {
      exitCode: 0,
      stdout: buildTokenWriteOutput(),
      stderr:
        "[token:enrich-rescore:geckoterminal] mode=single selected=1 notifySent=0 rateLimited=false",
    };
  };

  const result = await runGeckoTokenWriteCommandWithExecFile(execFile, input);

  assert.deepEqual(calls, [
    {
      command: "pnpm",
      args: [
        "token:enrich-rescore:geckoterminal",
        "--",
        "--mint",
        "RunnerInput111111111111111111111111111111111pump",
        "--write",
      ],
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
  assert.deepEqual(result.writeSummary, {
    enrichUpdated: true,
    rescoreUpdated: true,
    contextUpdated: true,
    metaplexContextUpdated: true,
  });
  assert.equal(result.notifySent, false);
  assert.equal(result.rateLimited, false);
});

test("exposes node execFile production runner without executing it in tests", () => {
  assert.equal(typeof runGeckoTokenWriteCommandWithNodeExecFile, "function");
});

test("normalizes non-zero execFile-like adapter output through the parser", async () => {
  const input = buildGeckoTokenWriteRunnerInput(buildCommandPlan(), {
    cwd: "/repo",
    env: {
      DATABASE_URL: "file:/tmp/lowcap-test.db",
    },
  });
  const execFile: GeckoTokenWriteExecFile = async () => ({
    exitCode: 1,
    stdout: "",
    stderr: "token write command failed",
  });

  const result = await runGeckoTokenWriteCommandWithExecFile(execFile, input);

  assert.equal(result.status, "cli_error");
  assert.equal(result.exitCode, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "token write command failed");
  assert.equal(result.parseError, "stdout was empty");
  assert.equal(result.writeSummary, null);
});

test("keeps item error details from parsed stdout without stderr parsing", () => {
  const parsed = parseGeckoTokenWriteCommandResult({
    exitCode: 0,
    stdout: buildTokenWriteOutput({
      summary: {
        okCount: 0,
        errorCount: 1,
        enrichWriteCount: 0,
        rescoreWriteCount: 0,
      },
      item: {
        status: "error",
        error: "Gecko token write helper failed",
        writeSummary: {
          dryRun: false,
          enrichUpdated: false,
          rescoreUpdated: false,
          contextUpdated: false,
          metaplexContextUpdated: false,
        },
      },
    }),
    stderr: "human-readable diagnostics only",
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.itemError, "Gecko token write helper failed");
  assert.deepEqual(parsed.writeSummary, {
    enrichUpdated: false,
    rescoreUpdated: false,
    contextUpdated: false,
    metaplexContextUpdated: false,
  });
});

test("derives rate-limit fields from parsed summary", () => {
  const parsed = parseGeckoTokenWriteCommandResult({
    exitCode: 0,
    stdout: buildTokenWriteOutput({
      summary: {
        rateLimited: true,
        rateLimitedCount: 1,
        abortedDueToRateLimit: true,
        skippedAfterRateLimit: 2,
      },
      item: {
        status: "error",
        error: "GeckoTerminal rate limited",
      },
    }),
    stderr:
      "[token:enrich-rescore:geckoterminal] rateLimited=true abortedDueToRateLimit=true",
  });

  assert.equal(parsed.status, "ok");
  assert.equal(parsed.rateLimited, true);
  assert.equal(parsed.abortedDueToRateLimit, true);
  assert.equal(parsed.skippedAfterRateLimit, 2);
  assert.equal(parsed.itemError, "GeckoTerminal rate limited");
});

test("treats non-zero exit without stdout JSON as cli error", () => {
  const parsed = parseGeckoTokenWriteCommandResult({
    exitCode: 1,
    stdout: "",
    stderr: "Unknown arg: --bad",
  });

  assert.equal(parsed.status, "cli_error");
  assert.equal(parsed.parsedOutput, null);
  assert.equal(parsed.parseError, "stdout was empty");
  assert.equal(parsed.stderr, "Unknown arg: --bad");
  assert.equal(parsed.writeSummary, null);
  assert.equal(parsed.notifySent, false);
});

test("treats malformed zero-exit stdout as parse error", () => {
  const parsed = parseGeckoTokenWriteCommandResult({
    exitCode: 0,
    stdout: "{not json",
    stderr: "",
  });

  assert.equal(parsed.status, "parse_error");
  assert.equal(parsed.parsedOutput, null);
  assert.match(parsed.parseError ?? "", /stdout JSON parse failed/);
});
