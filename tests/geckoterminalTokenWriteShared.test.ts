import test from "node:test";
import assert from "node:assert/strict";

import {
  GECKO_TOKEN_WRITE_HELPER_NOT_IMPLEMENTED,
  GECKO_TOKEN_WRITE_SNAPSHOT_SHAPE_ERROR,
  buildUnsupportedGeckoTokenWriteResult,
  runGeckoTokenWriteForMint,
  toGeckoTokenEnrichRescoreCliItem,
  type GeckoTokenWriteDeps,
  type GeckoTokenWriteContextPreview,
  type GeckoTokenWriteExistingToken,
  type GeckoTokenWriteMetaplexPreview,
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
    assert.equal(result.fetchedSnapshot, null);
    assert.equal(result.enrichPlan, null);
    assert.equal(result.rescorePreview, null);
    assert.equal(result.contextPreview, null);
    assert.equal(result.metaplexPreview, null);
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
      contextPreview: null,
      metaplexPreview: null,
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
    assert.equal(result.contextPreview, null);
    assert.equal(result.metaplexPreview, null);
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
