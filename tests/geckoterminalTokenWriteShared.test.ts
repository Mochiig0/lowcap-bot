import test from "node:test";
import assert from "node:assert/strict";

import {
  GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  buildUnsupportedGeckoTokenWriteResult,
  runGeckoTokenWriteForMint,
  type GeckoTokenWriteDeps,
  type GeckoTokenWriteInput,
  type GeckoTokenWriteResult,
  type GeckoTokenWriteStatus,
} from "../src/cli/geckoterminalTokenWriteShared.ts";

test("geckoterminalTokenWriteShared skeleton contract", async (t) => {
  await t.test("exposes the token write result shape without performing writes", () => {
    const input: GeckoTokenWriteInput = {
      mint: "GeckoTokenWriteSkeleton111111111111111111111pump",
      write: true,
      notify: false,
      captureFile: null,
    };

    const result = buildUnsupportedGeckoTokenWriteResult(input);

    assert.equal(result.mint, input.mint);
    assert.equal(result.status, "error" satisfies GeckoTokenWriteStatus);
    assert.equal(result.selectedReason, null);
    assert.equal(result.name, null);
    assert.equal(result.symbol, null);
    assert.equal(result.metadataStatus, null);
    assert.equal(result.scoreRank, null);
    assert.equal(result.scoreTotal, null);
    assert.equal(result.hardRejected, null);
    assert.equal(result.contextWouldWrite, false);
    assert.equal(result.metaplexContextWouldWrite, false);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.contextWritten, false);
    assert.equal(result.metaplexContextWritten, false);
    assert.deepEqual(result.writeSummary, {
      enrichWritten: false,
      rescoreWritten: false,
      contextWritten: false,
      metaplexContextWritten: false,
      notifySent: false,
    });
    assert.equal(result.notifyEligibleBefore, null);
    assert.equal(result.notifyEligibleAfter, null);
    assert.equal(result.notifyWouldSend, false);
    assert.equal(result.notifySent, false);
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.equal(result.metaplexErrorKind, null);
    assert.equal(result.error, GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED);
  });

  await t.test("returns the same unsupported result through the async boundary", async () => {
    const result: GeckoTokenWriteResult = await runGeckoTokenWriteForMint({
      mint: "GeckoTokenWriteAsync111111111111111111111111pump",
      write: false,
    });

    assert.deepEqual(result, {
      mint: "GeckoTokenWriteAsync111111111111111111111111pump",
      status: "error",
      selectedReason: null,
      name: null,
      symbol: null,
      metadataStatus: null,
      scoreRank: null,
      scoreTotal: null,
      hardRejected: null,
      contextWouldWrite: false,
      metaplexContextWouldWrite: false,
      enrichWritten: false,
      rescoreWritten: false,
      contextWritten: false,
      metaplexContextWritten: false,
      writeSummary: {
        enrichWritten: false,
        rescoreWritten: false,
        contextWritten: false,
        metaplexContextWritten: false,
        notifySent: false,
      },
      notifyEligibleBefore: null,
      notifyEligibleAfter: null,
      notifyWouldSend: false,
      notifySent: false,
      rateLimited: false,
      rateLimitScope: null,
      metaplexErrorKind: null,
      error: GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
    });
  });

  await t.test("accepts dependency injection without invoking dependencies", async () => {
    const deps: GeckoTokenWriteDeps = {
      now: () => new Date("2026-04-25T00:00:00.000Z"),
      fetchTokenSnapshot: async () => {
        throw new Error("fetchTokenSnapshot should not be called");
      },
      fetchMetaplexContext: async () => {
        throw new Error("fetchMetaplexContext should not be called");
      },
      logger: console,
    };

    const result = await runGeckoTokenWriteForMint(
      {
        mint: "GeckoTokenWriteDeps111111111111111111111111pump",
        write: false,
      },
      deps,
    );

    assert.equal(result.status, "error");
    assert.equal(result.error, GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED);
  });
});
