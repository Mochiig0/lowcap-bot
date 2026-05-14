import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHolderDistributionSafeSummaryIssueList,
  isHolderDistributionSafeSummary,
  parseHolderDistributionSafeSummary,
  type HolderDistributionSafeSummary,
} from "../src/observation/holderDistributionSafeSummary.ts";

function validSummary(
  overrides: Partial<HolderDistributionSafeSummary> = {},
): HolderDistributionSafeSummary {
  return {
    topHolderPct: 12.5,
    top10HolderPct: 42.25,
    holderCount: 1234,
    freshWalletCount: 17,
    bundlerSignal: "low",
    sameFundingOriginSignal: "unknown",
    lpWalletExcluded: true,
    source: "rugcheck.safe_summary",
    observedAt: "2026-05-10T00:00:00.000Z",
    confidence: "medium",
    rawFree: true,
    secretFree: true,
    ...overrides,
  };
}

function assertInvalid(input: unknown, pattern: RegExp): string[] {
  const issues = buildHolderDistributionSafeSummaryIssueList(input);
  assert.ok(issues.some((issue) => pattern.test(issue)), issues.join("\n"));
  assert.equal(isHolderDistributionSafeSummary(input), false);
  assert.throws(
    () => parseHolderDistributionSafeSummary(input),
    pattern,
  );
  return issues;
}

test("holder distribution safe summary accepts static safe fixtures", () => {
  const rugcheck = validSummary({
    source: "rugcheck.safe_summary",
    bundlerSignal: "medium",
    sameFundingOriginSignal: "low",
    confidence: "high",
  });
  const manualHolderReview = validSummary({
    topHolderPct: null,
    top10HolderPct: null,
    holderCount: null,
    freshWalletCount: null,
    bundlerSignal: "unknown",
    sameFundingOriginSignal: "unknown",
    lpWalletExcluded: null,
    source: "manual_holder_review",
    confidence: "low",
  });
  const externalReport = validSummary({
    source: "external_holder_report",
    topHolderPct: 9,
    top10HolderPct: 33,
    holderCount: 2400,
    freshWalletCount: null,
    bundlerSignal: "none",
    sameFundingOriginSignal: "none",
    lpWalletExcluded: false,
    confidence: "medium",
  });

  for (const fixture of [rugcheck, manualHolderReview, externalReport]) {
    assert.equal(isHolderDistributionSafeSummary(fixture), true);
    assert.deepEqual(parseHolderDistributionSafeSummary(fixture), fixture);
    assert.deepEqual(buildHolderDistributionSafeSummaryIssueList(fixture), []);
  }
});

test("holder distribution safe summary rejects invalid percent values", () => {
  assertInvalid(validSummary({ topHolderPct: -1 }), /topHolderPct must be from 0 through 100/);
  assertInvalid(validSummary({ topHolderPct: 101 }), /topHolderPct must be from 0 through 100/);
  assertInvalid(
    validSummary({ topHolderPct: Number.NaN }),
    /topHolderPct must be a finite number/,
  );
  assertInvalid(
    validSummary({ top10HolderPct: Number.POSITIVE_INFINITY }),
    /top10HolderPct must be a finite number/,
  );
});

test("holder distribution safe summary rejects invalid count values", () => {
  assertInvalid(validSummary({ holderCount: -1 }), /holderCount must be a non-negative integer/);
  assertInvalid(
    validSummary({ freshWalletCount: 1.5 }),
    /freshWalletCount must be a non-negative integer/,
  );
});

test("holder distribution safe summary rejects raw payload and secret-like keys", () => {
  const dangerousInputs = [
    { holders: ["wallet-one"] },
    { topHolders: ["wallet-two"] },
    { rawJson: { hidden: true } },
    { responseBody: "{full-response}" },
    { requestUrl: "https://example.invalid/?apiKey=secret" },
    { apiKey: "secret-key" },
    { token: "secret-token" },
    { chatId: "secret-chat" },
    { nested: { walletList: ["wallet-three"] } },
  ];

  for (const dangerous of dangerousInputs) {
    const input = {
      ...validSummary(),
      ...dangerous,
    };
    const issues = buildHolderDistributionSafeSummaryIssueList(input);
    assert.ok(
      issues.some((issue) => /dangerous key present/.test(issue)),
      issues.join("\n"),
    );
    assert.equal(isHolderDistributionSafeSummary(input), false);
  }
});

test("holder distribution safe summary rejects unsafe flags and unknown fields", () => {
  assertInvalid(validSummary({ rawFree: false as true }), /rawFree must be literal true/);
  assertInvalid(validSummary({ secretFree: false as true }), /secretFree must be literal true/);
  assertInvalid(
    {
      ...validSummary(),
      extraContext: "not allowed",
    },
    /unknown field is not allowed: extraContext/,
  );
});

test("holder distribution safe summary rejects invalid timestamp and source", () => {
  assertInvalid(
    validSummary({ observedAt: "not-a-date" }),
    /observedAt must be a valid ISO timestamp string/,
  );
  assertInvalid(
    validSummary({ source: " " }),
    /source must be a non-empty string/,
  );
});

test("holder distribution safe summary rejects non-object inputs", () => {
  assertInvalid(null, /input must be a non-array object/);
  assertInvalid([], /input must be a non-array object/);
  assertInvalid("not-object", /input must be a non-array object/);
});

test("holder distribution safe summary rejects without echoing raw payload values", () => {
  const secretValue = "super-secret-api-key-value";
  const walletValue = "wallet-address-that-must-not-appear";
  const input = {
    ...validSummary(),
    rawJson: {
      holders: [walletValue],
      apiKey: secretValue,
    },
  };

  const issues = buildHolderDistributionSafeSummaryIssueList(input);
  const issueText = issues.join("\n");
  assert.match(issueText, /dangerous key present/);
  assert.doesNotMatch(issueText, new RegExp(secretValue));
  assert.doesNotMatch(issueText, new RegExp(walletValue));

  let errorMessage = "";
  try {
    parseHolderDistributionSafeSummary(input);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
  }

  assert.match(errorMessage, /Invalid HolderDistributionSafeSummary/);
  assert.doesNotMatch(errorMessage, new RegExp(secretValue));
  assert.doesNotMatch(errorMessage, new RegExp(walletValue));
});
