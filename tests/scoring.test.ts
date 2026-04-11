import test from "node:test";
import assert from "node:assert/strict";

import { normalizeText } from "../src/scoring/normalize.ts";
import { checkHardReject } from "../src/scoring/hardReject.ts";

test("normalizeText lowercases input", () => {
  assert.equal(normalizeText("HELLO Meme COIN"), "hello meme coin");
});

test("normalizeText removes URLs", () => {
  assert.equal(
    normalizeText("Visit https://example.com now"),
    "visit now",
  );
});

test("normalizeText removes symbols and collapses whitespace", () => {
  assert.equal(
    normalizeText("  Meme!!!   Coin\tLaunch???  "),
    "meme coin launch",
  );
});

test("checkHardReject rejects rug", () => {
  assert.deepEqual(checkHardReject(normalizeText("rug launch")), {
    rejected: true,
    reason: "Matched HARD_NG: rug",
  });
});

test("checkHardReject rejects honeypot", () => {
  assert.deepEqual(checkHardReject(normalizeText("honeypot warning")), {
    rejected: true,
    reason: "Matched HARD_NG: honeypot",
  });
});

test("checkHardReject rejects scam", () => {
  assert.deepEqual(checkHardReject(normalizeText("scam alert")), {
    rejected: true,
    reason: "Matched HARD_NG: scam",
  });
});

test("checkHardReject rejects pump and dump", () => {
  assert.deepEqual(checkHardReject(normalizeText("pump and dump plan")), {
    rejected: true,
    reason: "Matched HARD_NG: pump and dump",
  });
});

test("checkHardReject keeps current includes-based behavior for 'not a scam'", () => {
  assert.deepEqual(checkHardReject(normalizeText("not a scam")), {
    rejected: true,
    reason: "Matched HARD_NG: scam",
  });
});

test("checkHardReject keeps current includes-based behavior for 'no rug'", () => {
  assert.deepEqual(checkHardReject(normalizeText("no rug here")), {
    rejected: true,
    reason: "Matched HARD_NG: rug",
  });
});
