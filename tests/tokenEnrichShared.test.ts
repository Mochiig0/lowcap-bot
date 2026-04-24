import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTokenEnrichPlan,
  computeMetadataStatus,
  type TokenForEnrich,
} from "../src/cli/tokenEnrichShared.ts";

function buildExistingToken(
  overrides: Partial<TokenForEnrich> = {},
): TokenForEnrich {
  return {
    mint: "So11111111111111111111111111111111111111112",
    name: null,
    symbol: null,
    description: null,
    source: "seed-source",
    metadataStatus: "mint_only",
    importedAt: new Date("2026-04-24T00:00:00.000Z"),
    enrichedAt: null,
    ...overrides,
  };
}

test("tokenEnrichShared planning contract", async (t) => {
  await t.test("builds an enrich plan with stable preview and data fields", () => {
    const now = new Date("2026-04-24T12:34:56.000Z");
    const existing = buildExistingToken();

    const plan = buildTokenEnrichPlan(
      existing,
      {
        name: "Sample Token",
        symbol: "STK",
        desc: "Detailed note",
        source: "manual-review",
      },
      now,
    );

    assert.equal(plan.hasRequestedUpdate, true);
    assert.equal(plan.hasTextFieldUpdate, true);
    assert.equal(plan.hasSourceUpdate, true);
    assert.equal(plan.hasChange, true);

    assert.equal(plan.preview.mint, existing.mint);
    assert.equal(plan.preview.name, "Sample Token");
    assert.equal(plan.preview.symbol, "STK");
    assert.equal(plan.preview.description, "Detailed note");
    assert.equal(plan.preview.source, "manual-review");
    assert.equal(plan.preview.metadataStatus, "enriched");
    assert.equal(plan.preview.normalizedText, "sample token stk detailed note");
    assert.equal(plan.preview.importedAt, "2026-04-24T00:00:00.000Z");
    assert.equal(plan.preview.enrichedAt, "2026-04-24T12:34:56.000Z");

    assert.equal(plan.data.name, "Sample Token");
    assert.equal(plan.data.symbol, "STK");
    assert.equal(plan.data.description, "Detailed note");
    assert.equal(plan.data.source, "manual-review");
    assert.equal(plan.data.metadataStatus, "enriched");
    assert.equal(plan.data.normalizedText, "sample token stk detailed note");
    assert.equal(plan.data.enrichedAt?.toISOString(), "2026-04-24T12:34:56.000Z");
  });

  await t.test("returns a no-op source-only plan when the source value is unchanged", () => {
    const existing = buildExistingToken({
      name: "Existing Token",
      symbol: "EXT",
      description: "already here",
      source: "same-source",
      metadataStatus: "enriched",
      enrichedAt: new Date("2026-04-23T08:00:00.000Z"),
    });

    const plan = buildTokenEnrichPlan(existing, {
      source: "same-source",
    });

    assert.equal(plan.hasRequestedUpdate, true);
    assert.equal(plan.hasTextFieldUpdate, false);
    assert.equal(plan.hasSourceUpdate, true);
    assert.equal(plan.hasChange, false);

    assert.equal(plan.preview.source, "same-source");
    assert.equal(plan.preview.metadataStatus, "enriched");
    assert.equal(plan.preview.normalizedText, null);
    assert.equal(plan.preview.enrichedAt, "2026-04-23T08:00:00.000Z");

    assert.deepEqual(plan.data, {
      source: "same-source",
    });
  });

  await t.test("keeps the partial/enriched metadata split minimal and deterministic", () => {
    assert.equal(
      computeMetadataStatus({
        name: "Alpha",
        symbol: "ALP",
      }),
      "partial",
    );
    assert.equal(
      computeMetadataStatus({
        name: "Alpha",
        symbol: "ALP",
        description: "has details",
      }),
      "enriched",
    );

    const partialPlan = buildTokenEnrichPlan(
      buildExistingToken(),
      {
        name: "Alpha",
        symbol: "ALP",
      },
      new Date("2026-04-24T09:00:00.000Z"),
    );

    assert.equal(partialPlan.preview.metadataStatus, "partial");
    assert.equal(partialPlan.preview.description, null);
    assert.equal(partialPlan.preview.normalizedText, "alpha alp");
    assert.equal(partialPlan.data.metadataStatus, "partial");
    assert.equal(partialPlan.data.normalizedText, "alpha alp");
  });
});
