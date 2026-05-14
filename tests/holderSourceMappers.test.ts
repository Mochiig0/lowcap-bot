import test from "node:test";
import assert from "node:assert/strict";

import { mapRugcheckStyleHolderSummary } from "../src/observation/holderSourceMappers.ts";
import {
  isHolderDistributionSafeSummary,
  parseHolderDistributionSafeSummary,
} from "../src/observation/holderDistributionSafeSummary.ts";

const FORBIDDEN_OUTPUT_TERMS = [
  "buySignal",
  "shouldBuy",
  "positionSize",
  "exit",
  "buyRecommendation",
  "tradingRecommendation",
  "financialAdvice",
  "rawJson",
  "holders",
  "wallets",
  "walletList",
  "apiKey",
  "requestUrl",
  "responseBody",
  "chatId",
];

function assertNoForbiddenOutputTerms(output: unknown): void {
  const serialized = JSON.stringify(output);
  for (const term of FORBIDDEN_OUTPUT_TERMS) {
    assert.doesNotMatch(serialized, new RegExp(term, "i"));
  }
}

test("rugcheck-style synthetic mapper maps safe summary fields", () => {
  const result = mapRugcheckStyleHolderSummary({
    observedAt: "2026-05-16T00:00:00.000Z",
    confidence: "medium",
    holderConcentration: {
      topHolderPct: 12.5,
      top10HolderPct: 42.25,
      holderCount: 1234,
      lpWalletExcluded: true,
    },
    walletSignals: {
      freshWalletCount: 17,
      bundlerSignal: "low",
      sameFundingOriginSignal: "unknown",
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, {
    topHolderPct: 12.5,
    top10HolderPct: 42.25,
    holderCount: 1234,
    freshWalletCount: 17,
    bundlerSignal: "low",
    sameFundingOriginSignal: "unknown",
    lpWalletExcluded: true,
    source: "rugcheck.safe_summary.synthetic",
    observedAt: "2026-05-16T00:00:00.000Z",
    confidence: "medium",
    rawFree: true,
    secretFree: true,
  });
  assert.equal(isHolderDistributionSafeSummary(result.summary), true);
  assert.deepEqual(parseHolderDistributionSafeSummary(result.summary), result.summary);
  assertNoForbiddenOutputTerms(result.summary);
});

test("rugcheck-style synthetic mapper keeps missing fields null or unknown", () => {
  const result = mapRugcheckStyleHolderSummary(
    {},
    {
      observedAt: "2026-05-16T00:00:00.000Z",
      confidence: "low",
    },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, {
    topHolderPct: null,
    top10HolderPct: null,
    holderCount: null,
    freshWalletCount: null,
    bundlerSignal: "unknown",
    sameFundingOriginSignal: "unknown",
    lpWalletExcluded: null,
    source: "rugcheck.safe_summary.synthetic",
    observedAt: "2026-05-16T00:00:00.000Z",
    confidence: "low",
    rawFree: true,
    secretFree: true,
  });
  assert.equal(isHolderDistributionSafeSummary(result.summary), true);
  assertNoForbiddenOutputTerms(result.summary);
});

test("rugcheck-style synthetic mapper rejects dangerous raw payload keys without values", () => {
  const secretValue = "secret-value-that-must-not-appear";
  const walletValue = "wallet-value-that-must-not-appear";
  const dangerousInputs = [
    { holders: [walletValue] },
    { topHolders: [walletValue] },
    { rawJson: { hidden: true } },
    { responseBody: "{full-response}" },
    { requestUrl: "https://example.invalid/?apiKey=secret" },
    { apiKey: secretValue },
    { token: secretValue },
    { chatId: secretValue },
    { holderConcentration: { walletList: [walletValue] } },
  ];

  for (const dangerous of dangerousInputs) {
    const result = mapRugcheckStyleHolderSummary({
      observedAt: "2026-05-16T00:00:00.000Z",
      ...dangerous,
    });

    assert.equal(result.ok, false);
    const issueText = result.issues.join("\n");
    assert.match(issueText, /dangerous raw payload|unknown .* field/);
    assert.doesNotMatch(issueText, new RegExp(secretValue));
    assert.doesNotMatch(issueText, new RegExp(walletValue));
    assertNoForbiddenOutputTerms({
      ok: result.ok,
      issues: result.issues.map((issue) =>
        issue.replace(/\b(rawJson|holders|topHolders|walletList|apiKey|token|chatId|requestUrl|responseBody)\b/gi, "unsafe-field"),
      ),
    });
  }
});

test("rugcheck-style synthetic mapper rejects invalid values without raw output", () => {
  const result = mapRugcheckStyleHolderSummary({
    observedAt: "2026-05-16T00:00:00.000Z",
    confidence: "high",
    holderConcentration: {
      topHolderPct: 101,
      holderCount: 1.5,
      lpWalletExcluded: "yes",
    },
    walletSignals: {
      bundlerSignal: "certain",
      sameFundingOriginSignal: "unknown",
    },
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /topHolderPct/.test(issue)));
  assert.ok(result.issues.some((issue) => /holderCount/.test(issue)));
  assert.ok(result.issues.some((issue) => /lpWalletExcluded/.test(issue)));
  assert.ok(result.issues.some((issue) => /bundlerSignal/.test(issue)));
  assertNoForbiddenOutputTerms(result.issues);
});

test("rugcheck-style synthetic mapper rejects unknown fields instead of storing raw provider JSON", () => {
  const result = mapRugcheckStyleHolderSummary({
    observedAt: "2026-05-16T00:00:00.000Z",
    holderConcentration: {
      topHolderPct: 9,
      unexpectedSourceField: "not accepted",
    },
    marketNarrative: "not accepted",
  });

  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => /unexpectedSourceField/.test(issue)));
  assert.ok(result.issues.some((issue) => /marketNarrative/.test(issue)));
  assertNoForbiddenOutputTerms(result.issues);
});
