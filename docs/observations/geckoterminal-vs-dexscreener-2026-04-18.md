# GeckoTerminal vs DexScreener Observation (2026-04-18)

## Scope

- Observation date: `2026-04-18`
- Baseline source: `dexscreener-token-profiles-latest-v1`
- Candidate source under manual review: `geckoterminal.new_pools`
- Status: raw fixture captured; no adapter work started

## Observed Sample

- Mint candidate: `2RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump`
- Pool address: `CXT7Z7uKVWCjEgLiGZdnzeNfturWimAAorvE8EoZfYHc`
- GeckoTerminal pool name: `WTF / SOL`
- GeckoTerminal pool_created_at: `2026-04-18T02:13:55Z`
- GeckoTerminal local observe: `2026-04-18T02:15:37.444Z`
- DexScreener polling window start: `2026-04-18T02:15:37.451Z`
- DexScreener polling window end: `2026-04-18T02:20:25.094Z`
- DexScreener polling window length: about `4m 48s`
- Result inside that window: no matching `token-profiles/latest/v1` item found for the mint

## Interpretation

- This observation gives a lower bound only: GeckoTerminal surfaced one new Solana pool and the same mint did not appear in DexScreener token profiles during the next `4m 48s` of manual polling.
- This is not a superiority proof that GeckoTerminal is always earlier than DexScreener.
- This is also not proof that DexScreener will eventually list the mint.

## Current Shape Mapping Candidate

- `source = "geckoterminal.new_pools"`
- `eventType = "new_pool"`
- `detectedAt = local receive time`
- `payload.mintAddress = base_token address candidate`
- `source-native time = pool_created_at`

## Raw Shape Notes

- `data[0].type` was `pool`
- `data[0].attributes.pool_created_at` was present
- `data[0].relationships.base_token` was present
- `data[0].relationships.quote_token` was present
- `data[0].relationships.dex` was present
- `included` contained matching `base_token`, `quote_token`, and `dex` entries
- `included` resolved the candidate mint to `2RM11G7NBt4HVKWtNGxx1WBtetdUykKuGmXDHBWFpump`

## Unconfirmed Points

- `base_token` looked like the monitored token side in this sample, but that should not yet be treated as always true.
- One raw sample is enough to preserve a fixture, but not enough to freeze final adapter rules.
- The current observation file should be treated as source evaluation context, not production evidence.
