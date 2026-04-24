import test from "node:test";
import assert from "node:assert/strict";

import { buildTokenRescorePreview } from "../src/cli/tokenRescoreShared.ts";

test("tokenRescoreShared preview contract", async (t) => {
  await t.test("builds a stable zero-score preview for neutral text", async () => {
    const preview = await buildTokenRescorePreview(
      {
        mint: "So11111111111111111111111111111111111111112",
        name: "Zorb",
        symbol: "QWX",
        description: "plain neutral signal",
      },
      new Date("2026-04-24T10:20:30.000Z"),
    );

    assert.equal(preview.mint, "So11111111111111111111111111111111111111112");
    assert.equal(preview.normalizedText, "zorb qwx plain neutral signal");
    assert.equal(preview.hardRejected, false);
    assert.equal(preview.hardRejectReason, null);
    assert.equal(preview.scoreTotal, 0);
    assert.equal(preview.scoreRank, "C");
    assert.equal(preview.rescoredAt, "2026-04-24T10:20:30.000Z");

    assert.equal(typeof preview.scoreBreakdown, "object");
    assert.notEqual(preview.scoreBreakdown, null);

    const breakdown = preview.scoreBreakdown as {
      totals: {
        core: number;
        learned: number;
        trend: number;
        combo: number;
      };
      hits: unknown[];
      trendFresh: boolean;
      trendCapped: boolean;
      trendOnly: boolean;
    };

    assert.deepEqual(breakdown.totals, {
      core: 0,
      learned: 0,
      trend: 0,
      combo: 0,
    });
    assert.deepEqual(breakdown.hits, []);
    assert.equal(typeof breakdown.trendFresh, "boolean");
    assert.equal(breakdown.trendCapped, false);
    assert.equal(breakdown.trendOnly, false);
  });

  await t.test("marks the preview hard-rejected when HARD_NG text is present", async () => {
    const preview = await buildTokenRescorePreview(
      {
        mint: "PzcEKaaQ5csrxfhu2bFqVfxJm7Cmm1QHJ4mjuD894wW",
        name: "Plain Rug",
        symbol: "RUG",
        description: "neutral wording only",
      },
      new Date("2026-04-24T11:11:11.000Z"),
    );

    assert.equal(preview.normalizedText, "plain rug rug neutral wording only");
    assert.equal(preview.hardRejected, true);
    assert.equal(preview.hardRejectReason, "Matched HARD_NG: rug");
    assert.equal(preview.scoreTotal, 0);
    assert.equal(preview.scoreRank, "C");
    assert.equal(preview.rescoredAt, "2026-04-24T11:11:11.000Z");
  });

  await t.test("throws when the token is not ready for rescore", async () => {
    await assert.rejects(
      buildTokenRescorePreview({
        mint: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
        name: "Missing Symbol",
        symbol: null,
        description: "still incomplete",
      }),
      /Token is not ready for rescore: name and symbol are required for mint 9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump/,
    );
  });
});
