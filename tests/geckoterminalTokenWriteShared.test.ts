import test from "node:test";
import assert from "node:assert/strict";

import {
  GECKO_TOKEN_WRITE_DEPS_MISSING_ERROR,
  GECKO_TOKEN_WRITE_ENRICH_WRITE_ERROR,
  GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  GECKO_TOKEN_WRITE_RESCORE_WRITE_ERROR,
  GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR,
  buildUnsupportedGeckoTokenWriteResult,
  runGeckoTokenWriteForMint,
  toGeckoTokenEnrichRescoreCliItem,
  type GeckoTokenWriteDeps,
  type GeckoTokenWriteContextPreview,
  type GeckoTokenWriteExistingToken,
  type GeckoTokenWriteMetaplexPreview,
  type GeckoTokenWriteInput,
  type GeckoTokenWriteRescoreWriteResult,
  type GeckoTokenWriteResult,
  type GeckoTokenWriteStatus,
} from "../src/cli/geckoterminalTokenWriteShared.ts";

function buildExistingToken(
  mint: string,
  overrides: Partial<GeckoTokenWriteExistingToken> = {},
): GeckoTokenWriteExistingToken {
  return {
    mint,
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
    ...overrides,
  };
}

function buildGeckoSnapshot(mint: string): unknown {
  return {
    data: {
      attributes: {
        address: mint,
        name: "Write Name",
        symbol: "WRITE",
        description: "write helper description",
      },
    },
  };
}

function buildRescoreWriteResult(
  overrides: Partial<GeckoTokenWriteRescoreWriteResult> = {},
): GeckoTokenWriteRescoreWriteResult {
  return {
    scoreTotal: 10,
    scoreRank: "A",
    hardRejected: false,
    rescoredAt: "2026-04-25T01:30:00.000Z",
    ...overrides,
  };
}

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
    assert.equal(result.fetchedSnapshot, null);
    assert.equal(result.enrichPlan, null);
    assert.equal(result.rescorePreview, null);
    assert.equal(result.rescoreWriteResult, null);
    assert.equal(result.contextPreview, null);
    assert.equal(result.metaplexPreview, null);
    assert.equal(result.reviewFlagsPreview, null);
    assert.equal(result.reviewFlagsWouldWrite, false);
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
      fetchedSnapshot: null,
      enrichPlan: null,
      rescorePreview: null,
      rescoreWriteResult: null,
      contextPreview: null,
      metaplexPreview: null,
      reviewFlagsPreview: null,
      reviewFlagsWouldWrite: false,
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
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: false,
        descriptionPresent: false,
        linkCount: 0,
      },
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
    assert.equal(result.contextPreview, null);
    assert.equal(result.metaplexPreview, null);
    assert.equal(result.reviewFlagsPreview, null);
    assert.equal(result.reviewFlagsWouldWrite, false);
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
    assert.deepEqual(result.fetchedSnapshot, {
      address: "GeckoTokenWriteFetch11111111111111111111111pump",
      name: "Fetched Name",
      symbol: "FETCH",
    });
    assert.equal(result.enrichPlan, null);
    assert.equal(result.rescorePreview, null);
    assert.equal(result.contextPreview?.available, true);
    assert.deepEqual(result.contextPreview?.availableFields, [
      "metadata.name",
      "metadata.symbol",
    ]);
    assert.deepEqual(result.contextPreview?.savedFields, []);
    assert.equal(result.contextPreview?.wouldWrite, true);
    assert.deepEqual(result.contextPreview?.preview?.metadataText, {
      name: "Fetched Name",
      symbol: "FETCH",
      description: null,
    });
    assert.equal(result.contextWouldWrite, true);
    assert.equal(result.writeSummary.wouldWriteContext, true);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.contextWritten, false);
    assert.equal(result.metaplexContextWritten, false);
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.equal(result.error, undefined);
    assert.equal(result.metaplexPreview, null);
    assert.deepEqual(result.reviewFlagsPreview, {
      flags: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: false,
        descriptionPresent: false,
        linkCount: 0,
      },
      savedFlags: null,
      wouldWrite: true,
      patch: {
        reviewFlagsJson: {
          hasWebsite: false,
          hasX: false,
          hasTelegram: false,
          metaplexHit: false,
          descriptionPresent: false,
          linkCount: 0,
        },
      },
      reasons: ["saved_review_flags_missing"],
    });
    assert.equal(result.reviewFlagsWouldWrite, true);
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
    assert.equal(result.writeSummary.wouldRescore, true);
    assert.deepEqual(result.rescorePreview, {
      ready: true,
      normalizedText: "preview name prev",
      scoreTotal: 0,
      scoreRank: "C",
      hardRejected: false,
      hardRejectReason: null,
    });
    assert.equal(result.scoreRank, "C");
    assert.equal(result.scoreTotal, 0);
    assert.equal(result.hardRejected, false);
    assert.deepEqual(result.reviewFlagsPreview?.flags, {
      hasWebsite: false,
      hasX: false,
      hasTelegram: false,
      metaplexHit: false,
      descriptionPresent: false,
      linkCount: 0,
    });
    assert.deepEqual(result.reviewFlagsPreview?.savedFlags, null);
    assert.equal(result.reviewFlagsPreview?.wouldWrite, true);
    assert.deepEqual(result.reviewFlagsPreview?.reasons, [
      "saved_review_flags_missing",
    ]);
    assert.equal(result.reviewFlagsWouldWrite, true);
    assert.equal(result.enrichWritten, false);
  });

  await t.test("does not call write deps during dry-run", async () => {
    const mint = "GeckoTokenWriteDryRunNoWriteDeps111111111pump";
    const existingToken = buildExistingToken(mint);
    const calls: string[] = [];

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
        existingToken,
      },
      {
        fetchTokenSnapshot: async () => buildGeckoSnapshot(mint),
        writeEnrich: async () => {
          calls.push("writeEnrich");
        },
        writeRescore: async () => {
          calls.push("writeRescore");
          return buildRescoreWriteResult();
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.deepEqual(calls, []);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.rescoreWriteResult, null);
    assert.equal(result.writeSummary.enrichWritten, false);
    assert.equal(result.writeSummary.rescoreWritten, false);
  });

  await t.test("runs injected CLI-equivalent enrich and rescore writes when write is enabled", async () => {
    const mint = "GeckoTokenWriteInjectedWrites111111111111pump";
    const existingToken = buildExistingToken(mint);
    const calls: Array<{ name: "writeEnrich" | "writeRescore"; mint: string; patch?: unknown }> = [];
    const rescoreWriteResult = buildRescoreWriteResult({
      scoreTotal: 42,
      scoreRank: "S",
      hardRejected: false,
      rescoredAt: "2026-04-25T02:00:00.000Z",
    });

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: true,
        existingToken,
      },
      {
        fetchTokenSnapshot: async () => buildGeckoSnapshot(mint),
        writeEnrich: async (writeMint, patch) => {
          calls.push({ name: "writeEnrich", mint: writeMint, patch });
        },
        writeRescore: async (writeMint) => {
          calls.push({ name: "writeRescore", mint: writeMint });
          return rescoreWriteResult;
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.deepEqual(
      calls.map((call) => call.name),
      ["writeEnrich", "writeRescore"],
    );
    assert.deepEqual(calls, [
      {
        name: "writeEnrich",
        mint,
        patch: {
          name: "Write Name",
          symbol: "WRITE",
        },
      },
      {
        name: "writeRescore",
        mint,
      },
    ]);
    assert.deepEqual(calls[0]?.patch, result.enrichPlan?.patch);
    assert.equal(result.enrichWritten, true);
    assert.equal(result.rescoreWritten, true);
    assert.deepEqual(result.rescoreWriteResult, rescoreWriteResult);
    assert.equal(result.contextWritten, false);
    assert.equal(result.metaplexContextWritten, false);
    assert.equal(result.reviewFlagsWouldWrite, true);
    assert.equal(result.writeSummary.enrichWritten, true);
    assert.equal(result.writeSummary.rescoreWritten, true);
    assert.equal(result.writeSummary.contextWritten, false);
    assert.equal(result.writeSummary.metaplexContextWritten, false);
    assert.equal(result.notifySent, false);
    assert.equal(result.writeSummary.notifySent, false);
  });

  await t.test("returns a structured error when write deps are missing", async () => {
    const mint = "GeckoTokenWriteMissingWriteDeps11111111111pump";
    const existingToken = buildExistingToken(mint);

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: true,
        existingToken,
      },
      {
        fetchTokenSnapshot: async () => buildGeckoSnapshot(mint),
      },
    );

    assert.equal(result.status, "error");
    assert.equal(result.error, GECKO_TOKEN_WRITE_DEPS_MISSING_ERROR);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.rescoreWriteResult, null);
    assert.equal(result.writeSummary.enrichWritten, false);
    assert.equal(result.writeSummary.rescoreWritten, false);
  });

  await t.test("does not write after primary Gecko rate limits or invalid shapes", async () => {
    const rateLimitedMint = "GeckoTokenWriteNoWriteRateLimit111111111pump";
    const invalidShapeMint = "GeckoTokenWriteNoWriteShape1111111111pump";
    const calls: string[] = [];
    const deps: GeckoTokenWriteDeps = {
      writeEnrich: async () => {
        calls.push("writeEnrich");
      },
      writeRescore: async () => {
        calls.push("writeRescore");
        return buildRescoreWriteResult();
      },
    };

    const rateLimitedResult = await runGeckoTokenWriteForMint(
      {
        mint: rateLimitedMint,
        write: true,
        existingToken: buildExistingToken(rateLimitedMint),
      },
      {
        ...deps,
        fetchTokenSnapshot: async () => {
          throw new Error(
            "GeckoTerminal token snapshot request failed: 429 Too Many Requests",
          );
        },
      },
    );
    const invalidShapeResult = await runGeckoTokenWriteForMint(
      {
        mint: invalidShapeMint,
        write: true,
        existingToken: buildExistingToken(invalidShapeMint),
      },
      {
        ...deps,
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

    assert.equal(rateLimitedResult.status, "rate_limited");
    assert.equal(rateLimitedResult.rateLimited, true);
    assert.equal(rateLimitedResult.rateLimitScope, "geckoterminal");
    assert.equal(invalidShapeResult.status, "error");
    assert.equal(invalidShapeResult.error, GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
    assert.equal(rateLimitedResult.rescoreWriteResult, null);
    assert.equal(invalidShapeResult.rescoreWriteResult, null);
    assert.deepEqual(calls, []);
  });

  await t.test("does not rescore when injected enrich write fails", async () => {
    const mint = "GeckoTokenWriteEnrichWriteFails111111111pump";
    const existingToken = buildExistingToken(mint);
    const calls: string[] = [];

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: true,
        existingToken,
      },
      {
        fetchTokenSnapshot: async () => buildGeckoSnapshot(mint),
        writeEnrich: async () => {
          calls.push("writeEnrich");
          throw new Error("injected enrich failure");
        },
        writeRescore: async () => {
          calls.push("writeRescore");
          return buildRescoreWriteResult();
        },
      },
    );

    assert.equal(result.status, "error");
    assert.match(
      result.error ?? "",
      new RegExp(`${GECKO_TOKEN_WRITE_ENRICH_WRITE_ERROR}: injected enrich failure`),
    );
    assert.deepEqual(calls, ["writeEnrich"]);
    assert.equal(result.enrichWritten, false);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.rescoreWriteResult, null);
    assert.equal(result.writeSummary.enrichWritten, false);
    assert.equal(result.writeSummary.rescoreWritten, false);
  });

  await t.test("preserves enrich write state when injected rescore write fails", async () => {
    const mint = "GeckoTokenWriteRescoreWriteFails11111111pump";
    const existingToken = buildExistingToken(mint);
    const calls: string[] = [];

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: true,
        existingToken,
      },
      {
        fetchTokenSnapshot: async () => buildGeckoSnapshot(mint),
        writeEnrich: async () => {
          calls.push("writeEnrich");
        },
        writeRescore: async () => {
          calls.push("writeRescore");
          throw new Error("injected rescore failure");
        },
      },
    );

    assert.equal(result.status, "error");
    assert.match(
      result.error ?? "",
      new RegExp(`${GECKO_TOKEN_WRITE_RESCORE_WRITE_ERROR}: injected rescore failure`),
    );
    assert.deepEqual(calls, ["writeEnrich", "writeRescore"]);
    assert.equal(result.enrichWritten, true);
    assert.equal(result.rescoreWritten, false);
    assert.equal(result.rescoreWriteResult, null);
    assert.equal(result.writeSummary.enrichWritten, true);
    assert.equal(result.writeSummary.rescoreWritten, false);
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
    assert.equal(result.writeSummary.wouldRescore, true);
    assert.deepEqual(result.rescorePreview, {
      ready: true,
      normalizedText: "same name same",
      scoreTotal: 0,
      scoreRank: "C",
      hardRejected: false,
      hardRejectReason: null,
    });
  });

  await t.test("keeps context preview read-only when saved context already matches", async () => {
    const mint = "GeckoTokenWriteSavedContext1111111111111111pump";
    const existingToken: GeckoTokenWriteExistingToken = {
      mint,
      name: "Saved Name",
      symbol: "SAVED",
      description: null,
      source: "geckoterminal.new_pools",
      metadataStatus: "partial",
      importedAt: "2026-04-25T00:00:00.000Z",
      enrichedAt: "2026-04-25T00:30:00.000Z",
      scoreRank: "C",
      scoreTotal: 0,
      hardRejected: false,
      entrySnapshot: {
        contextCapture: {
          geckoterminalTokenSnapshot: {
            source: "geckoterminal.token_snapshot",
            capturedAt: "2026-04-24T00:00:00.000Z",
            address: mint,
            metadataText: {
              name: "Saved Name",
              symbol: "SAVED",
              description: null,
            },
            links: {
              website: null,
              x: null,
              telegram: null,
              websites: [],
              xCandidates: [],
              telegramCandidates: [],
              otherLinks: [],
            },
            availableFields: ["metadata.name", "metadata.symbol"],
            missingFields: [
              "metadata.description",
              "links.website",
              "links.x",
              "links.telegram",
              "links.other",
            ],
          },
        },
      },
      reviewFlagsJson: {
        hasWebsite: false,
        hasX: false,
        hasTelegram: false,
        metaplexHit: false,
        descriptionPresent: false,
        linkCount: 0,
      },
    };

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
        existingToken,
      },
      {
        now: () => new Date("2026-04-25T03:00:00.000Z"),
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              address: mint,
              name: "Saved Name",
              symbol: "SAVED",
            },
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.contextPreview?.available, true);
    assert.deepEqual(result.contextPreview?.savedFields, [
      "metadata.name",
      "metadata.symbol",
    ]);
    assert.equal(result.contextPreview?.wouldWrite, false);
    assert.equal(result.contextPreview?.patch, null);
    assert.equal(result.contextWouldWrite, false);
    assert.equal(result.writeSummary.wouldWriteContext, false);
    assert.equal(result.contextWritten, false);
    assert.deepEqual(result.reviewFlagsPreview?.flags, {
      hasWebsite: false,
      hasX: false,
      hasTelegram: false,
      metaplexHit: false,
      descriptionPresent: false,
      linkCount: 0,
    });
    assert.deepEqual(result.reviewFlagsPreview?.savedFlags, {
      hasWebsite: false,
      hasX: false,
      hasTelegram: false,
      metaplexHit: false,
      descriptionPresent: false,
      linkCount: 0,
    });
    assert.equal(result.reviewFlagsPreview?.wouldWrite, false);
    assert.equal(result.reviewFlagsPreview?.patch, null);
    assert.deepEqual(result.reviewFlagsPreview?.reasons, []);
    assert.equal(result.reviewFlagsWouldWrite, false);
  });

  await t.test("builds context preview from Gecko metadata text and links", async () => {
    const mint = "GeckoTokenWriteLinksContext111111111111111pump";

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
      },
      {
        now: () => new Date("2026-04-25T04:00:00.000Z"),
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              address: mint,
              name: "Links Name",
              symbol: "LINKS",
              description: "Links description",
              websites: ["www.example.com", "https://example.com/alt"],
              twitter_username: "@links_handle",
              telegram: "links_channel",
              socials: {
                discord: "https://discord.gg/links",
              },
            },
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.deepEqual(result.contextPreview?.availableFields, [
      "metadata.name",
      "metadata.symbol",
      "metadata.description",
      "links.website",
      "links.x",
      "links.telegram",
      "links.other",
    ]);
    assert.deepEqual(result.contextPreview?.preview?.links, {
      website: "https://www.example.com",
      x: "https://x.com/links_handle",
      telegram: "https://t.me/links_channel",
      websites: ["https://www.example.com", "https://example.com/alt"],
      xCandidates: ["https://x.com/links_handle"],
      telegramCandidates: ["https://t.me/links_channel"],
      otherLinks: ["https://discord.gg/links"],
    });
    assert.equal(result.contextPreview?.wouldWrite, true);
    assert.equal(result.writeSummary.wouldWriteContext, true);
    assert.equal(result.contextWritten, false);
    assert.deepEqual(result.reviewFlagsPreview?.flags, {
      hasWebsite: true,
      hasX: true,
      hasTelegram: true,
      metaplexHit: false,
      descriptionPresent: true,
      linkCount: 5,
    });
    assert.equal(result.reviewFlagsPreview?.wouldWrite, true);
    assert.deepEqual(result.reviewFlagsPreview?.reasons, [
      "saved_review_flags_missing",
    ]);
    assert.equal(result.reviewFlagsWouldWrite, true);
  });

  await t.test("builds metaplex preview from an injected metadata lookup", async () => {
    const mint = "GeckoTokenWriteMetaplexHit1111111111111111pump";

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
      },
      {
        now: () => new Date("2026-04-25T05:00:00.000Z"),
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              address: mint,
              name: "Metaplex Hit",
              symbol: "META",
            },
          },
        }),
        fetchMetaplexContext: async () => ({
          onchain: {
            mint,
            uri: "https://metadata.example/meta.json",
            metadataPda: "metadata-pda-hit",
          },
          offchain: {
            description: "Metaplex description",
            external_url: "www.example.org",
            twitter: "@metaplex_hit",
            telegram: "metaplex_hit",
            discord: "https://discord.gg/metaplex-hit",
          },
          detail: {
            metadataPda: "metadata-pda-hit",
            uri: "https://metadata.example/meta.json",
            hasOffchain: true,
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.metaplexPreview?.attempted, true);
    assert.equal(result.metaplexPreview?.available, true);
    assert.deepEqual(result.metaplexPreview?.availableFields, [
      "metadata.description",
      "links.website",
      "links.x",
      "links.telegram",
      "links.other",
    ]);
    assert.deepEqual(result.metaplexPreview?.savedFields, []);
    assert.equal(result.metaplexPreview?.wouldWrite, true);
    assert.equal(result.metaplexPreview?.errorKind, null);
    assert.equal(result.metaplexPreview?.rateLimited, false);
    assert.deepEqual(result.metaplexPreview?.preview?.metadataText, {
      description: "Metaplex description",
    });
    assert.deepEqual(result.metaplexPreview?.preview?.links, {
      website: "https://www.example.org",
      x: "https://x.com/metaplex_hit",
      telegram: "https://t.me/metaplex_hit",
      anyLinks: true,
      websites: ["https://www.example.org"],
      xCandidates: ["https://x.com/metaplex_hit"],
      telegramCandidates: ["https://t.me/metaplex_hit"],
      otherLinks: ["https://discord.gg/metaplex-hit"],
    });
    assert.equal(result.metaplexContextWouldWrite, true);
    assert.equal(result.metaplexContextWritten, false);
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.deepEqual(result.reviewFlagsPreview?.flags, {
      hasWebsite: true,
      hasX: true,
      hasTelegram: true,
      metaplexHit: true,
      descriptionPresent: true,
      linkCount: 4,
    });
    assert.equal(result.reviewFlagsPreview?.wouldWrite, true);
    assert.equal(result.reviewFlagsWouldWrite, true);
  });

  await t.test("keeps metaplex preview read-only when saved context already matches", async () => {
    const mint = "GeckoTokenWriteMetaplexSaved11111111111111pump";
    const existingToken: GeckoTokenWriteExistingToken = {
      mint,
      name: "Saved Metaplex",
      symbol: "SMETA",
      description: null,
      source: "geckoterminal.new_pools",
      metadataStatus: "partial",
      importedAt: "2026-04-25T00:00:00.000Z",
      enrichedAt: null,
      scoreRank: "C",
      scoreTotal: 0,
      hardRejected: false,
      entrySnapshot: {
        contextCapture: {
          metaplexMetadataUri: {
            source: "metaplex.metadata_uri",
            capturedAt: "2026-04-24T00:00:00.000Z",
            metadataPda: "metadata-pda-saved",
            uri: "https://metadata.example/saved.json",
            metadataText: {
              description: "Saved metaplex description",
            },
            links: {
              website: null,
              x: null,
              telegram: null,
              anyLinks: false,
              websites: [],
              xCandidates: [],
              telegramCandidates: [],
              otherLinks: [],
            },
            availableFields: ["metadata.description"],
            missingFields: [
              "links.website",
              "links.x",
              "links.telegram",
              "links.other",
            ],
          },
        },
      },
    };

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
        existingToken,
      },
      {
        now: () => new Date("2026-04-25T06:00:00.000Z"),
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              address: mint,
              name: "Saved Metaplex",
              symbol: "SMETA",
            },
          },
        }),
        fetchMetaplexContext: async () => ({
          onchain: {
            mint,
            uri: "https://metadata.example/saved.json",
          },
          offchain: {
            description: "Saved metaplex description",
          },
          detail: {
            metadataPda: "metadata-pda-saved",
            uri: "https://metadata.example/saved.json",
            hasOffchain: true,
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.metaplexPreview?.attempted, true);
    assert.equal(result.metaplexPreview?.available, true);
    assert.deepEqual(result.metaplexPreview?.savedFields, [
      "metadata.description",
    ]);
    assert.equal(result.metaplexPreview?.wouldWrite, false);
    assert.equal(result.metaplexPreview?.patch, null);
    assert.equal(result.metaplexContextWouldWrite, false);
    assert.equal(result.metaplexContextWritten, false);
  });

  await t.test("classifies missing metaplex metadata as non-fatal preview state", async () => {
    const mint = "GeckoTokenWriteMetaplexMissing111111111111pump";

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
      },
      {
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              address: mint,
              name: "Missing Metaplex",
              symbol: "MISS",
            },
          },
        }),
        fetchMetaplexContext: async () => ({
          status: "not_found",
          reason: "metadata_account_missing",
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.error, undefined);
    assert.equal(result.metaplexPreview?.attempted, true);
    assert.equal(result.metaplexPreview?.available, false);
    assert.equal(result.metaplexPreview?.wouldWrite, false);
    assert.equal(result.metaplexPreview?.errorKind, "metadata_account_missing");
    assert.equal(result.metaplexPreview?.rateLimited, false);
    assert.equal(result.metaplexContextWouldWrite, false);
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.deepEqual(result.reviewFlagsPreview?.flags, {
      hasWebsite: false,
      hasX: false,
      hasTelegram: false,
      metaplexHit: false,
      descriptionPresent: false,
      linkCount: 0,
    });
    assert.equal(result.reviewFlagsPreview?.wouldWrite, true);
    assert.equal(result.reviewFlagsWouldWrite, true);
  });

  await t.test("classifies metaplex rate limit without running writes", async () => {
    const mint = "GeckoTokenWriteMetaplexRateLimit111111111pump";

    const result = await runGeckoTokenWriteForMint(
      {
        mint,
        write: false,
      },
      {
        fetchTokenSnapshot: async () => ({
          data: {
            attributes: {
              address: mint,
              name: "Rate Limited Metaplex",
              symbol: "RLIM",
            },
          },
        }),
        fetchMetaplexContext: async () => {
          throw Object.assign(
            new Error(
              "metaplex.metadata_uri request failed: 429 Too Many Requests",
            ),
            {
              kind: "rpc_http_error",
              rateLimited: true,
            },
          );
        },
      },
    );

    assert.equal(result.status, "ok");
    assert.equal(result.metaplexPreview?.attempted, true);
    assert.equal(result.metaplexPreview?.available, false);
    assert.equal(result.metaplexPreview?.wouldWrite, false);
    assert.equal(result.metaplexPreview?.errorKind, "rate_limited");
    assert.equal(result.metaplexPreview?.rateLimited, true);
    assert.equal(result.metaplexErrorKind, "rate_limited");
    assert.equal(result.metaplexContextWouldWrite, false);
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.equal(result.contextWritten, false);
    assert.equal(result.metaplexContextWritten, false);
    assert.deepEqual(result.reviewFlagsPreview?.flags, {
      hasWebsite: false,
      hasX: false,
      hasTelegram: false,
      metaplexHit: false,
      descriptionPresent: false,
      linkCount: 0,
    });
    assert.equal(result.reviewFlagsPreview?.wouldWrite, true);
    assert.equal(result.reviewFlagsWouldWrite, true);
  });

  await t.test("reflects hard-rejected rescore preview fields", async () => {
    const existingToken: GeckoTokenWriteExistingToken = {
      mint: "GeckoTokenWriteHardReject111111111111111111pump",
      name: null,
      symbol: null,
      description: "neutral wording only",
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
        now: () => new Date("2026-04-25T02:00:00.000Z"),
        fetchTokenSnapshot: async (mint) => ({
          data: {
            attributes: {
              address: mint,
              name: "Plain Rug",
              symbol: "RUG",
            },
          },
        }),
      },
    );

    assert.equal(result.status, "ok");
    assert.deepEqual(result.rescorePreview, {
      ready: true,
      normalizedText: "plain rug rug neutral wording only",
      scoreTotal: 0,
      scoreRank: "C",
      hardRejected: true,
      hardRejectReason: "Matched HARD_NG: rug",
    });
    assert.equal(result.scoreRank, "C");
    assert.equal(result.scoreTotal, 0);
    assert.equal(result.hardRejected, true);
    assert.equal(result.notifyEligibleBefore, false);
    assert.equal(result.notifyEligibleAfter, false);
    assert.equal(result.notifyWouldSend, false);
  });

  await t.test("maps helper result to the CLI-compatible item skeleton", async () => {
    const existingToken: GeckoTokenWriteExistingToken = {
      mint: "GeckoTokenWriteAdapter111111111111111111111pump",
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
        fetchTokenSnapshot: async (mint) => ({
          data: {
            attributes: {
              address: mint,
              name: "Adapter Name",
              symbol: "ADAPT",
            },
          },
        }),
      },
    );

    const item = toGeckoTokenEnrichRescoreCliItem({
      result,
      selectedReason: "Token.createdAt",
      writeEnabled: false,
      token: {
        id: 100,
        mint: existingToken.mint,
        currentSource: "geckoterminal.new_pools",
        originSource: "geckoterminal.new_pools",
        metadataStatus: "mint_only",
        name: null,
        symbol: null,
        description: null,
        groupKey: null,
        scoreRank: "C",
        hardRejected: false,
        createdAt: "2026-04-25T00:00:00.000Z",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        rescoredAt: null,
        selectionAnchorAt: "2026-04-25T00:00:00.000Z",
        selectionAnchorKind: "createdAt",
        isGeckoterminalOrigin: true,
      },
    });

    assert.equal(item.status, "ok");
    assert.equal(item.selectedReason, "Token.createdAt");
    assert.deepEqual(item.fetchedSnapshot, result.fetchedSnapshot ?? undefined);
    assert.deepEqual(item.enrichPlan, result.enrichPlan ?? undefined);
    assert.deepEqual(item.rescorePreview, result.rescorePreview ?? undefined);
    assert.equal(item.contextAvailable, true);
    assert.equal(item.contextWouldWrite, true);
    assert.deepEqual(item.savedContextFields, []);
    assert.equal(item.metaplexAttempted, false);
    assert.equal(item.metaplexAvailable, false);
    assert.equal(item.metaplexWouldWrite, false);
    assert.deepEqual(item.metaplexSavedFields, []);
    assert.equal(item.metaplexErrorKind, null);
    assert.equal(item.notifyCandidate, false);
    assert.equal(item.notifyWouldSend, false);
    assert.equal(item.notifySent, false);
    assert.deepEqual(item.writeSummary, {
      dryRun: true,
      enrichUpdated: false,
      rescoreUpdated: false,
      contextUpdated: false,
      metaplexContextUpdated: false,
    });
  });

  await t.test("maps context preview fields into the CLI-compatible item", () => {
    const contextPreview: GeckoTokenWriteContextPreview = {
      available: true,
      availableFields: ["metadata.name", "links.website"],
      savedFields: ["metadata.name"],
      wouldWrite: true,
      patch: {
        availableFields: ["metadata.name", "links.website"],
      },
      preview: {
        source: "geckoterminal.token_snapshot",
      },
    };
    const result: GeckoTokenWriteResult = {
      ...buildUnsupportedGeckoTokenWriteResult({
        mint: "GeckoTokenWriteContext1111111111111111111pump",
        write: false,
      }),
      contextPreview,
    };

    const item = toGeckoTokenEnrichRescoreCliItem({
      result,
      selectedReason: "Token.createdAt",
      writeEnabled: false,
      token: {
        id: 102,
        mint: "GeckoTokenWriteContext1111111111111111111pump",
        currentSource: "geckoterminal.new_pools",
        originSource: "geckoterminal.new_pools",
        metadataStatus: "mint_only",
        name: null,
        symbol: null,
        description: null,
        groupKey: null,
        scoreRank: "C",
        hardRejected: false,
        createdAt: "2026-04-25T00:00:00.000Z",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        rescoredAt: null,
        selectionAnchorAt: "2026-04-25T00:00:00.000Z",
        selectionAnchorKind: "createdAt",
        isGeckoterminalOrigin: true,
      },
    });

    assert.equal(item.contextAvailable, true);
    assert.equal(item.contextWouldWrite, true);
    assert.deepEqual(item.savedContextFields, ["metadata.name"]);
    assert.deepEqual(item.writeSummary, {
      dryRun: true,
      enrichUpdated: false,
      rescoreUpdated: false,
      contextUpdated: false,
      metaplexContextUpdated: false,
    });
  });

  await t.test("maps metaplex preview fields into the CLI-compatible item", () => {
    const metaplexPreview: GeckoTokenWriteMetaplexPreview = {
      attempted: true,
      available: true,
      availableFields: ["metadata.description", "links.website"],
      savedFields: ["metadata.description"],
      wouldWrite: true,
      patch: {
        metaplexMetadataUri: {
          source: "metaplex.metadata_uri",
        },
      },
      preview: {
        source: "metaplex.metadata_uri",
      },
      errorKind: null,
      rateLimited: false,
    };
    const result: GeckoTokenWriteResult = {
      ...buildUnsupportedGeckoTokenWriteResult({
        mint: "GeckoTokenWriteMetaplex11111111111111111pump",
        write: false,
      }),
      metaplexPreview,
    };

    const item = toGeckoTokenEnrichRescoreCliItem({
      result,
      selectedReason: "Token.createdAt",
      writeEnabled: false,
      token: {
        id: 103,
        mint: "GeckoTokenWriteMetaplex11111111111111111pump",
        currentSource: "geckoterminal.new_pools",
        originSource: "geckoterminal.new_pools",
        metadataStatus: "mint_only",
        name: null,
        symbol: null,
        description: null,
        groupKey: null,
        scoreRank: "C",
        hardRejected: false,
        createdAt: "2026-04-25T00:00:00.000Z",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        rescoredAt: null,
        selectionAnchorAt: "2026-04-25T00:00:00.000Z",
        selectionAnchorKind: "createdAt",
        isGeckoterminalOrigin: true,
      },
    });

    assert.equal(item.metaplexAttempted, true);
    assert.equal(item.metaplexAvailable, true);
    assert.equal(item.metaplexWouldWrite, true);
    assert.deepEqual(item.metaplexSavedFields, ["metadata.description"]);
    assert.equal(item.metaplexErrorKind, null);
    assert.deepEqual(item.writeSummary, {
      dryRun: true,
      enrichUpdated: false,
      rescoreUpdated: false,
      contextUpdated: false,
      metaplexContextUpdated: false,
    });
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
        fetchMetaplexContext: async () => {
          throw new Error("Metaplex preview should not run after Gecko 429");
        },
      },
    );

    assert.equal(result.status, "rate_limited");
    assert.equal(result.rateLimited, true);
    assert.equal(result.rateLimitScope, "geckoterminal");
    assert.equal(result.metaplexPreview, null);
    assert.match(result.error ?? "", /429 Too Many Requests/);

    const item = toGeckoTokenEnrichRescoreCliItem({
      result,
      selectedReason: "Token.createdAt",
      writeEnabled: false,
      token: {
        id: 101,
        mint: "GeckoTokenWriteRateLimit111111111111111111pump",
        currentSource: "geckoterminal.new_pools",
        originSource: "geckoterminal.new_pools",
        metadataStatus: "mint_only",
        name: null,
        symbol: null,
        description: null,
        groupKey: null,
        scoreRank: "C",
        hardRejected: false,
        createdAt: "2026-04-25T00:00:00.000Z",
        importedAt: "2026-04-25T00:00:00.000Z",
        enrichedAt: null,
        rescoredAt: null,
        selectionAnchorAt: "2026-04-25T00:00:00.000Z",
        selectionAnchorKind: "createdAt",
        isGeckoterminalOrigin: true,
      },
    });

    assert.equal(item.status, "error");
    assert.match(item.error ?? "", /429 Too Many Requests/);
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
        fetchMetaplexContext: async () => {
          throw new Error("Metaplex preview should not run after shape error");
        },
      },
    );

    assert.equal(result.status, "error");
    assert.equal(result.rateLimited, false);
    assert.equal(result.rateLimitScope, null);
    assert.equal(result.metaplexPreview, null);
    assert.equal(result.error, GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR);
  });
});
