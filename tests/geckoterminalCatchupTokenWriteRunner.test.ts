import test from "node:test";
import assert from "node:assert/strict";

import { parseGeckoTokenWriteCommandResult } from "../src/cli/geckoterminalCatchupTokenWriteRunner.ts";

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
