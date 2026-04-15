import test from "node:test";
import assert from "node:assert/strict";

import { evaluateDetectorCandidate } from "../src/scoring/evaluateDetectorCandidate.ts";

const STABLE_MINT = "So11111111111111111111111111111111111111112";

test("returns_accept_for_stable_mint_hint", () => {
  const result = evaluateDetectorCandidate({
    candidateKind: "mint_hint",
    mint: STABLE_MINT,
    source: "manual",
  });

  assert.deepEqual(result, {
    ok: true,
    mint: STABLE_MINT,
    source: "manual",
  });
});

test("returns_mint_missing_for_mint_hint_without_mint", () => {
  const result = evaluateDetectorCandidate({
    candidateKind: "mint_hint",
    mint: "   ",
    source: "manual",
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "mint_missing",
  });
});

test("returns_mint_unstable_for_mint_hint_with_unstable_mint", () => {
  const result = evaluateDetectorCandidate({
    candidateKind: "mint_hint",
    mint: "not-a-stable-mint",
    source: "manual",
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "mint_unstable",
  });
});

test("returns_source_shape_invalid_for_source_event_hint_with_invalid_shape", () => {
  const result = evaluateDetectorCandidate({
    candidateKind: "source_event_hint",
    source: "source-feed",
    eventType: "",
    detectedAt: "2026-04-16T00:00:00.000Z",
    payload: {
      mintAddress: STABLE_MINT,
    },
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "source_shape_invalid",
  });
});

test("returns_not_mint_first_candidate_for_non_mint_text", () => {
  const result = evaluateDetectorCandidate({
    candidateKind: "non_mint_text",
    text: "watch this launch thread",
    source: "manual",
  });

  assert.deepEqual(result, {
    ok: false,
    reason: "not_mint_first_candidate",
  });
});
