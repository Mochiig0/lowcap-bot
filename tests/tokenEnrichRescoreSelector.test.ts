import assert from "node:assert/strict";
import test from "node:test";

import { selectEligibleBatchTokens } from "../src/cli/tokenEnrichRescoreSelector.js";

const baseTokens = [
  { id: 5, mint: "metric-zero-pump", name: null, symbol: null, metricsCount: 0 },
  { id: 4, mint: "metric-covered-pump", name: null, symbol: null, metricsCount: 1 },
  { id: 3, mint: "complete-covered-pump", name: "Complete", symbol: "CMP", metricsCount: 1 },
  { id: 2, mint: "metric-covered-other", name: null, symbol: null, metricsCount: 2 },
  { id: 1, mint: "metric-zero-other", name: null, symbol: null, metricsCount: 0 },
];

test("default batch selector preserves metric-uncovered eligibility", () => {
  const result = selectEligibleBatchTokens(baseTokens, {
    limit: 10,
    pumpOnly: false,
    onlyMetricCovered: false,
  });

  assert.deepEqual(
    result.selectedTokens.map((token) => token.id),
    [5, 4, 2, 1],
  );
  assert.equal(result.skippedMetricUncoveredCount, 0);
  assert.equal(result.skippedCompleteCount, 1);
});

test("onlyMetricCovered excludes incomplete rows without metrics", () => {
  const result = selectEligibleBatchTokens(baseTokens, {
    limit: 10,
    pumpOnly: false,
    onlyMetricCovered: true,
  });

  assert.deepEqual(
    result.selectedTokens.map((token) => token.id),
    [4, 2],
  );
  assert.equal(result.skippedMetricUncoveredCount, 2);
  assert.equal(result.skippedCompleteCount, 1);
});

test("onlyMetricCovered composes with pumpOnly after metric filtering", () => {
  const result = selectEligibleBatchTokens(baseTokens, {
    limit: 10,
    pumpOnly: true,
    onlyMetricCovered: true,
  });

  assert.deepEqual(
    result.selectedTokens.map((token) => token.id),
    [4],
  );
  assert.equal(result.skippedMetricUncoveredCount, 2);
  assert.equal(result.skippedNonPumpCount, 1);
});

test("onlyMetricCovered returns empty selection when no metric-covered rows exist", () => {
  const result = selectEligibleBatchTokens(
    [
      { id: 2, mint: "missing-one-pump", name: null, symbol: null, metricsCount: 0 },
      { id: 1, mint: "missing-two-pump", name: null, symbol: null, metricsCount: 0 },
    ],
    {
      limit: 50,
      pumpOnly: true,
      onlyMetricCovered: true,
    },
  );

  assert.equal(result.selectedTokens.length, 0);
  assert.equal(result.skippedMetricUncoveredCount, 2);
});
