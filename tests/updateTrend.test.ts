import test from "node:test";
import assert from "node:assert/strict";

import { parseKeywordsArg } from "../src/cli/updateTrend.ts";

test("parseKeywordsArg splits a comma-separated string into keywords", () => {
  assert.deepEqual(parseKeywordsArg("ai,anime,base"), ["ai", "anime", "base"]);
});

test("parseKeywordsArg trims whitespace and removes empty items", () => {
  assert.deepEqual(
    parseKeywordsArg(" ai,  anime ,, base  , "),
    ["ai", "anime", "base"],
  );
});

test("parseKeywordsArg keeps current dedupe and sort behavior", () => {
  assert.deepEqual(
    parseKeywordsArg("base,AI, anime, ai,base"),
    ["ai", "anime", "base"],
  );
});
