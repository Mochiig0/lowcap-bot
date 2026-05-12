# Holder Distribution Snapshot Design

## Purpose

Holder distribution is a core LowcapBot observation gap. It belongs to the risk
and scam-surface side of the observation OS, not to buy-signal generation.

This document fixes the first design boundary for filling
`holder_distribution_not_recorded`. It does not introduce schema changes, does
not fetch external data, and does not write production DB state. The goal is to
name the fields, source constraints, safety rules, and MVP route before any
capture command or storage model exists.

## Non-goals

- No external API fetch.
- No on-chain fetch.
- No production DB write.
- No schema or migration change.
- No trading, position sizing, exit, or profit guidance.
- No Telegram send.
- No queue, scheduler, systemd, checkpoint, `--write`, or `--watch` operation.
- No automatic risk scoring based on holder data.

Holder distribution data can support later review, but it must not be presented
as a buy recommendation.

## Candidate Fields

Initial candidate fields:

- `topHolderPct`
- `top10HolderPct`
- `holderCount`
- `freshWalletCount`
- `bundlerSignal`
- `sameFundingOriginSignal`
- `lpWalletExcluded`
- `devWalletPct`
- `devBuyImpact`
- `mcapVolumeRatio`
- `bottedChartPattern`
- `source`
- `observedAt`
- `confidence`
- `rawFree`
- `secretFree`

The first implementation should keep field meanings conservative. A missing
value should stay `not_observed`; it should not be inferred from token metadata
or manual thesis notes.

## Source Candidates

Potential future sources:

- GeckoTerminal or DexScreener summary fields if they expose holder or liquidity
  context in a safe, raw-free form.
- Rugcheck-style APIs for holder concentration, authority, and bundling
  summaries.
- On-chain holder snapshots from a bounded one-token fetch.
- Manual operator review, only if the reviewed fields are source-labeled and do
  not pretend to be chain-derived.

Any source must be reviewed before use for raw payload, secret, and response-body
boundaries. A future Red or Yellow task should explicitly decide whether a
source is raw-free enough to persist directly or needs a safe summary.

## Storage Candidates

### Future `HolderSnapshot` model

Pros:

- Clean history for repeated observations.
- Clear source, `observedAt`, and confidence boundaries.
- Easier to compare holder state with later outcomes.

Cons:

- Requires schema and migration design.
- Needs relation and retention rules.
- Must define how many snapshots per token are useful.

### `Metric.rawJson` safe summary

Pros:

- Holder context may be captured near metric observation time.
- No new top-level concept if the data is strictly metric-adjacent.

Cons:

- `rawJson` must not become an unsafe payload bucket.
- Holder state is not always a market metric.
- Read-only reports would need strict safe-summary extraction.

### `Token.entrySnapshot.holderDistribution`

Pros:

- Works as a narrow manual or one-time observation namespace without immediate
  schema expansion.
- Similar to the existing manual observation namespace pattern.

Cons:

- Can blur source-derived holder facts with manual thesis context.
- Poor fit for repeated snapshots.
- Requires careful parser boundaries to avoid large JSON drift.

### External report only

Pros:

- Lowest production DB risk.
- Good first step for source evaluation and field validation.

Cons:

- Does not reduce the persisted `holder_distribution_not_recorded` gap.
- Harder to compare historical holder state with later outcomes.

Current preference: start with an external read-only report or temp-DB-tested
safe summary before adding persistent production storage. Do not choose final
storage until a source and field contract are fixed.

## Safety Boundaries

- Persist only safe summary fields, never raw response bodies.
- Do not store env values, API keys, Telegram tokens, chat IDs, or private
  wallet material.
- Keep `rawFree` and `secretFree` explicit in any future persisted snapshot.
- Keep holder observations separate from manual narrative / thesis fields.
- Keep holder observations separate from community-link review flags.
- Treat confidence as source quality, not trading confidence.

## Red / Yellow Boundary

Yellow tasks may:

- refine this design;
- add read-only planner output explaining the holder snapshot route;
- add temp SQLite tests for parser or report helpers;
- inspect existing DB schema and docs;
- produce human-gated command strings without executing them.

Red tasks are required before:

- fetching holder data from an external or on-chain source;
- writing holder data to production DB;
- applying a schema migration;
- running any command that updates Token / Metric / a future HolderSnapshot row.

## MVP Route

1. Keep `tokens:observation-gaps` reporting
   `holder_distribution_not_recorded` as unsupported.
2. Use this design document as the fixed capability boundary.
3. Add a read-only holder-source planner only after the source contract is known.
4. Validate parser and safe-summary behavior with temp SQLite fixtures.
5. Run a one-token Red rehearsal only after backup, exact command, and
   verification are fixed.
6. Decide storage after the first source and safe summary shape are proven.

## Stop Conditions

Stop before implementation if:

- a source requires storing raw payloads;
- source terms or output shape are unclear;
- schema changes are required before the field contract is stable;
- a command would fetch or write production DB state without Red approval;
- the output reads like a buy signal or conviction score;
- holder data is mixed into `token:observe` or `community:review`;
- queue, scheduler, systemd, checkpoint, or watch behavior becomes necessary.

## Relation To Existing Reports

`token:observation` should continue to show holder distribution as
`not_observed` until a safe holder snapshot exists.

`tokens:observation-gaps` should continue to surface
`holder_distribution_not_recorded` and point to `holder_distribution_snapshot`
as a future capability. It should not suggest `token:observe` or
`community:review` as a way to fill this gap.

Community link review and manual narrative review remain separate capabilities.
Holder distribution is a risk-observation capability that must be designed and
verified independently before production capture.
