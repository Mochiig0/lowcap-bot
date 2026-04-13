import test from "node:test";
import assert from "node:assert/strict";

import { scoreTextWithDependencies } from "../src/scoring/score.ts";

const core = {
  keywords: [
    { keyword: "meme", score: 1, tag: "meme" },
    { keyword: "dog", score: 2, tag: "animal" },
    { keyword: "tech", score: 2, tag: "tech" },
    { keyword: "pokemon", score: 2, tag: "ip" },
    { keyword: "newinfo", score: 2, tag: "newinfo" },
  ],
};

const learned = {
  keywords: [
    { keyword: "community", score: 1, tag: "social" },
  ],
  patterns: [],
};

const trend = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  ttlHours: 24,
  keywords: [
    { keyword: "airdrop", score: 2, tag: "trend" },
    { keyword: "viral", score: 2, tag: "trend" },
    { keyword: "cto", score: 2, tag: "trend" },
  ],
};

test("scoreTextWithDependencies adds score from core keywords", () => {
  const result = scoreTextWithDependencies("meme dog", {
    core,
    learned,
    trend,
    trendFresh: false,
  });

  assert.equal(result.total, 3);
  assert.equal(result.rank, "B");
  assert.equal(result.breakdown.totals.core, 3);
});

test("scoreTextWithDependencies keeps trend-only text below S rank", () => {
  const result = scoreTextWithDependencies("airdrop viral cto", {
    core,
    learned,
    trend,
    trendFresh: true,
  });

  assert.equal(result.total, 3);
  assert.equal(result.rank, "B");
  assert.equal(result.breakdown.trendOnly, true);
});

test("scoreTextWithDependencies caps trend score at 3", () => {
  const result = scoreTextWithDependencies("airdrop viral cto", {
    core,
    learned,
    trend,
    trendFresh: true,
  });

  assert.equal(result.breakdown.totals.trend, 3);
  assert.equal(result.breakdown.trendCapped, true);
});

test("scoreTextWithDependencies applies combo boost", () => {
  const result = scoreTextWithDependencies("pokemon dog newinfo", {
    core,
    learned,
    trend,
    trendFresh: false,
  });

  assert.equal(result.total, 8);
  assert.equal(result.rank, "S");
  assert.equal(result.breakdown.totals.combo, 2);
});
