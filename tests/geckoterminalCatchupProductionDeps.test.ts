import test from "node:test";
import assert from "node:assert/strict";

import {
  buildGeckoCatchupSupervisorCliDeps,
  shouldRunGeckoMetricAppendRunner,
} from "../src/cli/geckoterminalCatchupSupervisor.ts";
import { runGeckoMetricAppendCommandWithNodeExecFile } from "../src/cli/geckoterminalCatchupMetricAppendRunner.ts";

const readyMetricAppendPlan = {
  executionSupported: true,
  executionEligible: true,
  blockedBy: [],
  metricAppend: true,
  postCheck: true,
};

test("gecko catch-up production deps include metric append runner without executing it", () => {
  const deps = buildGeckoCatchupSupervisorCliDeps();

  assert.equal(deps.metricAppendRunner, runGeckoMetricAppendCommandWithNodeExecFile);
  assert.equal(typeof deps.tokenWriteRunner, "function");

  assert.equal(shouldRunGeckoMetricAppendRunner([], deps), false);
  assert.equal(
    shouldRunGeckoMetricAppendRunner([readyMetricAppendPlan, readyMetricAppendPlan], deps),
    false,
  );

  const blockedCases = [
    ["executionSupported=false", { ...readyMetricAppendPlan, executionSupported: false }],
    ["executionEligible=false", { ...readyMetricAppendPlan, executionEligible: false }],
    [
      "blockedBy present",
      { ...readyMetricAppendPlan, blockedBy: ["metric_append_runner_not_connected"] },
    ],
    ["metricAppend=false", { ...readyMetricAppendPlan, metricAppend: false }],
    ["postCheck=false", { ...readyMetricAppendPlan, postCheck: false }],
  ] as const;

  for (const [label, plan] of blockedCases) {
    assert.equal(shouldRunGeckoMetricAppendRunner([plan], deps), false, label);
  }

  assert.equal(shouldRunGeckoMetricAppendRunner([readyMetricAppendPlan], deps), true);
});
