import test from "node:test";
import assert from "node:assert/strict";

import {
  GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR,
  buildUnsupportedGeckoTokenWriteResult,
  runGeckoTokenWriteForMint,
  type GeckoTokenWriteDeps,
  type GeckoTokenWriteExistingToken,
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
    assert.equal(result.enrichPlan, null);
    assert.equal(result.rescorePreview, null);
    assert.equal(result.contextWouldWrite, false);
    assert.equal(result.metaplexContextWouldWrite, false);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.contextWritten, false);
    assert.equal(result.metaplexContextWritten, false);
    assert.deepEqual(result.writeSummary, {
      wouldEnrich: false,
      wouldRescore: false,
      wouldWriteContext: false,
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
      enrichPlan: null,
      rescorePreview: null,
      contextWouldWrite: false,
      metaplexContextWouldWrite: false,
      enrichWritten: false,
      rescoreWritten: false,
      contextWritten: false,
      metaplexContextWritten: false,
      writeSummary: {
        wouldEnrich: false,
        wouldRescore: false,
        wouldWriteContext: false,
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

  await t.test("keeps the unsupported result when no fetch dependency is provided", async () => {
    const existingToken: GeckoTokenWriteExistingToken = {
      mint: "GeckoTokenWriteDeps111111111111111111111111pump",
      name: null,
      symbol: null,
      description: null,
      source: "geckoterminal.new_pools",
      metadataStatus: "mint_only",
      importedAt: "2026-04-25T00:00:00.000Z",
      enrichedAt: null,
      scoreRank: "C",
      scoreTotal: 0,
      hardRejected: false,
    };
    const deps: GeckoTokenWriteDeps = {
      now: () => new Date("2026-04-25T00:00:00.000Z"),
      fetchMetaplexContext: async () => {
        throw new Error("fetchMetaplexContext should not be called");
      },
      logger: console,
    };

    const result = await runGeckoTokenWriteForMint(
      {
        mint: "GeckoTokenWriteDeps111111111111111111111111pump",
        write: false,
        existingToken,
      },
      deps,
    );

    assert.equal(result.status, "error");
    assert.equal(result.error, GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED);
    assert.equal(result.enrichPlan, null);
    assert.equal(result.rescorePreview, null);
  });

  await t.test("fetches and classifies a valid injected Gecko snapshot", async () => {
    const calls: string[] = [];

    const result = await runGeckoTokenWriteForMint(
      {
        mint: "GeckoTokenWriteFetch11111111111111111111111pump",
        write: false,
      },
      {
        fetchTokenSnapshot: async (mint) => {
          calls.push(mint);
          return {
            data: {
              attributes: {
                address: mint,
                name: "Fetched Name",
                symbol: "FETCH",
              },
            },
          };
        },
      },
    );

    assert.deepEqual(calls, [
      "GeckoTokenWriteFetch11111111111111111111111pump",
    ]);
    assert.equal(result.status, "ok");
    assert.equal(result.name, "Fetched Name");
    assert.equal(result.symbol, "FETCH");
    assert.equal(result.enrichPlan, null);
    assert.equal(result.rescorePreview, null);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.contextWritten, false);
    assert.equal(result.metaplexContextWritten, false);
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.equal(result.error, undefined);
  });

  await t.test("builds an enrich preview when existing token and snapshot are present", async () => {
    const existingToken: GeckoTokenWriteExistingToken = {
      mint: "GeckoTokenWritePreview111111111111111111111pump",
      name: null,
      symbol: null,
      description: null,
      source: "geckoterminal.new_pools",
      metadataStatus: "mint_only",
      importedAt: "2026-04-25T00:00:00.000Z",
      enrichedAt: null,
      scoreRank: "C",
      scoreTotal: 0,
      hardRejected: false,
    };

    const result = await runGeckoTokenWriteForMint(
      {
        mint: existingToken.mint,
        write: false,
        existingToken,
      },
      {
        now: () => new Date("2026-04-25T01:00:00.000Z"),
        fetchTokenSnapshot: async (mint) => ({
          data: {
            attributes: {
              address: mint,
              name: "Preview Name",
              symbol: "PREV",
            },
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.metadataStatus, "partial");
    assert.deepEqual(result.enrichPlan, {
      hasPatch: true,
      willUpdate: true,
      patch: {
        name: "Preview Name",
        symbol: "PREV",
      },
      preview: {
        metadataStatus: "partial",
        name: "Preview Name",
        symbol: "PREV",
        description: null,
      },
    });
    assert.equal(result.writeSummary.wouldEnrich, true);
    assert.equal(result.writeSummary.wouldRescore, false);
    assert.equal(result.rescorePreview, null);
    assert.equal(result.enrichWritten, false);
  });

  await t.test("returns a no-patch enrich preview without planning writes", async () => {
    const existingToken: GeckoTokenWriteExistingToken = {
      mint: "GeckoTokenWriteNoPatch11111111111111111111pump",
      name: "Same Name",
      symbol: "SAME",
      description: null,
      source: "geckoterminal.new_pools",
      metadataStatus: "partial",
      importedAt: new Date("2026-04-25T00:00:00.000Z"),
      enrichedAt: new Date("2026-04-25T00:30:00.000Z"),
      scoreRank: "C",
      scoreTotal: 0,
      hardRejected: false,
    };

    const result = await runGeckoTokenWriteForMint(
      {
        mint: existingToken.mint,
        write: false,
        existingToken,
      },
      {
        fetchTokenSnapshot: async (mint) => ({
          data: {
            attributes: {
              address: mint,
              name: "Same Name",
              symbol: "SAME",
            },
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.deepEqual(result.enrichPlan, {
      hasPatch: false,
      willUpdate: false,
      patch: {},
      preview: {
        metadataStatus: "partial",
        name: "Same Name",
        symbol: "SAME",
        description: null,
      },
    });
    assert.equal(result.writeSummary.wouldEnrich, false);
    assert.equal(result.rescorePreview, null);
  });

  await t.test("classifies injected Gecko 429 errors as rate_limited", async () => {
    const result = await runGeckoTokenWriteForMint(
      {
        mint: "GeckoTokenWriteRateLimit111111111111111111pump",
        write: false,
      },
      {
        fetchTokenSnapshot: async () => {
          throw new Error(
            "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
          );
        },
      },
    );

    assert.equal(result.status, "rate_limited");
    assert.equal(result.rateLimited, true);
    assert.equal(result.rateLimitScope, "geckoterminal");
    assert.match(result.error ?? "", /429 Too Many Requests/);
  });

  await t.test("classifies invalid injected Gecko snapshot shapes as errors", async () => {
    const result = await runGeckoTokenWriteForMint(
      {
        mint: "GeckoTokenWriteShape1111111111111111111111pump",
        write: false,
      },
      {
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              name: "Missing Address",
              symbol: "MISS",
            },
          },
        }),
      },
    );

    assert.equal(result.status, "error");
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.equal(result.error, GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
  });
});
