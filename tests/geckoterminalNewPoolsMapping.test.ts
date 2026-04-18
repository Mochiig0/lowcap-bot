import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildGeckoterminalNewPoolsDetectorCandidate,
  GECKOTERMINAL_NEW_POOLS_EVENT_TYPE,
  GECKOTERMINAL_NEW_POOLS_SOURCE,
} from "../src/scoring/buildGeckoterminalNewPoolsDetectorCandidate.ts";
import { evaluateDetectorCandidate } from "../src/scoring/evaluateDetectorCandidate.ts";

const CASES = [
  {
    fixturePath: "fixtures/source-events/geckoterminal-new-pools.solana-wtf-first-item.json",
    mintAddress: "2RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump",
    poolAddress: "CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc",
    poolCreatedAt: "2026-04-18T02:13:55Z",
    dexName: "Pump.fun",
    quoteTokenAddress: "So11111111111111111111111111111111111111112",
  },
  {
    fixturePath:
      "fixtures/source-events/geckoterminal-new-pools.solana-irnstof-pumpswap-first-item.json",
    mintAddress: "6EqzzoWno2Mwo6QpRQbhFtE6S7MycamKnxUBk13dpump",
    poolAddress: "9sgXkt6Y9vVNFi9cvJ9wCcwJDhjF29VAzyhnvWkjeABC",
    poolCreatedAt: "2026-04-18T02:35:54Z",
    dexName: "PumpSwap",
    quoteTokenAddress: "So11111111111111111111111111111111111111112",
  },
  {
    fixturePath:
      "fixtures/source-events/geckoterminal-new-pools.solana-777-usdc-orca-first-item.json",
    mintAddress: "9DpzCSRchP1vdnjU1aRCwcBzXGdoTyjn1QwqjzjGBo15",
    poolAddress: "F1sUZyoy5kZ4qWXk3XUQVzfsgBQxBBjVY8Ej1sRHLpT3",
    poolCreatedAt: "2026-04-18T02:36:43Z",
    dexName: "Orca",
    quoteTokenAddress: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
] as const;

for (const item of CASES) {
  test(`buildGeckoterminalNewPoolsDetectorCandidate maps ${item.fixturePath}`, async () => {
    const raw = await readFile(item.fixturePath, "utf8");
    const candidate = buildGeckoterminalNewPoolsDetectorCandidate(
      JSON.parse(raw) as unknown,
      "2026-04-18T03:00:00.000Z",
    );

    assert.equal(candidate.candidateKind, "source_event_hint");
    assert.equal(candidate.source, GECKOTERMINAL_NEW_POOLS_SOURCE);
    assert.equal(candidate.eventType, GECKOTERMINAL_NEW_POOLS_EVENT_TYPE);
    assert.equal(candidate.detectedAt, "2026-04-18T03:00:00.000Z");
    assert.equal(candidate.payload.mintAddress, item.mintAddress);
    assert.equal(candidate.payload.poolAddress, item.poolAddress);
    assert.equal(candidate.payload.poolCreatedAt, item.poolCreatedAt);
    assert.equal(candidate.payload.dexName, item.dexName);
    assert.equal(candidate.payload.baseTokenAddress, item.mintAddress);
    assert.equal(candidate.payload.quoteTokenAddress, item.quoteTokenAddress);

    assert.deepEqual(evaluateDetectorCandidate(candidate), {
      ok: true,
      mint: item.mintAddress,
      source: GECKOTERMINAL_NEW_POOLS_SOURCE,
    });
  });
}
