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

## Source Contract

The first source contract is a safe-summary contract, not a raw response
contract. A source is admissible only if it can be transformed into the safe
summary shape below without storing raw payloads, env values, API keys, private
wallet material, Telegram values, or unbounded address lists.

| Source candidate | topHolderPct | top10HolderPct | holderCount | freshWalletCount | bundlerSignal | sameFundingOriginSignal | can exclude LP wallet | raw payload risk | secret/env risk | rate limit risk | implementation complexity | first MVP suitability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Rugcheck-style API | likely | likely | possible | possible | likely | possible | possible | medium: response may contain wallet lists or broad risk details | medium if API key is required | medium | medium | best first external-source candidate if a raw-free summary can be derived |
| Solscan / on-chain holder endpoint | likely | likely | likely | no, unless extra wallet-age queries are added | no | no, unless funding graph is crawled | possible but source-specific | high: holder lists and account details are likely | medium if API key or RPC key is required | high | high | defer; useful later only as bounded one-token validation |
| Birdeye / DexScreener / GeckoTerminal market-data source | unlikely | unlikely | unlikely | no | no | no | unlikely | low to medium depending on endpoint | low to medium depending on provider | medium | low to medium | use only if a documented endpoint exposes holder summary fields |
| Manual operator review | yes, if operator has source evidence | yes, if operator has source evidence | yes, if operator has source evidence | possible | possible | possible | possible | low if only source-labeled summary is stored | low | low | low | fallback for temp parser and review workflow, not chain-derived truth |
| External report only | yes, in report output | yes, in report output | yes, in report output | possible | possible | possible | possible | lowest production DB risk if not persisted | low | low to medium | low | good pre-storage rehearsal; does not reduce persisted gap |

Field meanings for the first MVP:

- `topHolderPct`: percentage of supply or circulating supply held by the top
  non-excluded holder, as reported by the source. If the source definition is
  unclear, keep `null`.
- `top10HolderPct`: percentage held by the top 10 non-excluded holders, as
  reported by the source. If the source includes LP or program wallets and this
  cannot be normalized safely, keep `null`.
- `holderCount`: holder count reported by the source. Do not derive it from a
  partial page of holders.
- `freshWalletCount`: count reported by the source for fresh or young wallets.
  Do not infer it without wallet-age data.
- `bundlerSignal`: source-labeled bundling or bundled-supply signal. Do not
  invent a threshold until a source-specific contract exists.
- `sameFundingOriginSignal`: source-labeled common-funding signal. Do not
  derive it from partial transaction or wallet samples.
- `lpWalletExcluded`: whether the source explicitly excludes LP / pool /
  program wallets from concentration fields.

## First MVP Source Recommendation

First choice: a Rugcheck-style safe summary, only if the endpoint can provide
holder concentration and risk flags that can be mapped into the safe summary
without persisting raw payloads or wallet lists.

Fallback: manual operator review or external report only, using the same safe
summary shape and explicit `source` labels. Manual review is acceptable for
parser and temp SQLite tests because it avoids fetch and raw payload concerns,
but it must not pretend to be chain-derived data.

Avoid initially: unbounded on-chain holder crawl, funding graph traversal, or
multi-provider aggregation. Those paths create raw payload, rate-limit, and
complexity risk before the safe summary parser is proven.

The next Red task may choose one exact external source and one exact endpoint,
but it must still keep raw payloads out of production persistence unless a
separate raw-storage boundary is approved.

## Safe Summary Contract

The next parser temp test should use this fixed safe summary type:

```ts
type HolderDistributionSafeSummary = {
  topHolderPct: number | null;
  top10HolderPct: number | null;
  holderCount: number | null;
  freshWalletCount: number | null;
  bundlerSignal: "none" | "low" | "medium" | "high" | "unknown";
  sameFundingOriginSignal: "none" | "low" | "medium" | "high" | "unknown";
  lpWalletExcluded: boolean | null;
  source: string;
  observedAt: string;
  confidence: "low" | "medium" | "high" | "unknown";
  rawFree: true;
  secretFree: true;
};
```

Validation rules:

- Percent fields must be finite numbers from `0` through `100`, or `null`.
- Count fields must be non-negative integers, or `null`.
- `source` must be a non-empty source label such as
  `rugcheck.safe_summary`, `manual_holder_review`, or
  `external_holder_report`.
- `observedAt` must be an ISO timestamp string.
- `confidence` is source confidence, not trading confidence.
- `rawFree` and `secretFree` must be literal `true`.
- Unknown extra fields must be rejected.
- Dangerous raw-payload or secret-like keys must be rejected at any depth,
  including `walletList`, `wallets`, `holders`, `topHolders`, `rawJson`,
  `responseBody`, `requestUrl`, `apiKey`, `token`, and `chatId`.
- Missing or ambiguous source fields must stay `null` or `unknown`; do not
  infer holder data from token metadata, community links, market metrics, or
  manual thesis text.

The safe summary intentionally excludes raw wallet addresses, raw transaction
samples, response bodies, request URLs with secrets, API keys, Telegram data,
and free-form raw JSON. `devWalletPct`, `devBuyImpact`, `mcapVolumeRatio`, and
`bottedChartPattern` remain candidate future risk fields, but they are outside
the first holder-distribution safe summary until a source-specific contract
defines them safely.

## Rejected / Deferred Sources

- Unbounded on-chain holder crawls are deferred because they require pagination,
  wallet lists, LP / program wallet classification, and likely RPC or provider
  keys before the field contract is proven.
- Funding-origin graph analysis is deferred because it needs transaction graph
  traversal and can easily become a separate crawler.
- Generic market-data endpoints are deferred unless documentation confirms
  holder concentration fields. Existing GeckoTerminal / DexScreener flows
  should not be stretched into holder capture without a source-specific field.
- Persisting raw provider JSON is rejected for the first MVP. Only the safe
  summary shape above may be considered in temp tests.
- Treating holder distribution as a buy or skip signal is rejected. It is risk
  observation context only.

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

The source contract now fixes the parser-facing safe summary type, but it still
does not choose final storage. A future task may compare external report only,
`Token.entrySnapshot.holderDistribution`, `Metric.rawJson` safe summary, and a
future `HolderSnapshot` model after parser behavior is tested against temp
SQLite fixtures.

## Storage Decision Matrix

| Storage candidate | repeated snapshots | source / observedAt / confidence | outcome analysis fit | schema / migration complexity | raw payload leakage risk | existing report integration | rollback / cleanup complexity | MVP suitability | Red task complexity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Future `HolderSnapshot` model | strong: one token can have many source-labeled observations | strong: columns can make source, observedAt, confidence, rawFree, and secretFree explicit | strong: joins cleanly to Token and later Metric / outcome reports | high: requires schema, migration, indexes, and retention rules | low if only safe summary fields are stored and raw JSON is excluded | medium: reports need a new relation/read path | medium: row-level delete/rollback is clear but migration must be handled carefully | best first persistent candidate after Red approval | high |
| `Token.entrySnapshot.holderDistribution` | weak: best for one-time/manual snapshot, poor history | medium: possible inside JSON namespace but less enforceable | medium-low: mixed into Token snapshot and harder to query across time | low: no schema change | medium: JSON namespace can drift unless parser gates every write | medium: token reports can read it, but cohort queries are awkward | high: JSON patch rollback can collide with other entrySnapshot namespaces | not preferred for holder distribution persistence | medium |
| `Metric.rawJson` safe summary | medium: Metric already has time series, but holder state is not always metric-adjacent | medium-low: source and observedAt exist, confidence/rawFree/secretFree would be embedded | medium: can compare near market metrics, but holder facts become hidden in metric payloads | low: no schema change | high: `rawJson` is already a payload boundary and must not become a holder bucket | low-medium: rawJson-free reports would need strict extraction | medium-high: cleanup risks deleting or editing Metric rows that carry market observations | not preferred; only reconsider if holder context is strictly metric-source derived | medium |
| External report only | none persisted | strong in output, but not stored | weak for later DB analysis unless exported separately | none | lowest: no production persistence | high for current `holder:safe-summary:report` flow, weak for DB-backed reports | low: no production cleanup | safest immediate MVP before persistence | low |

## Recommended MVP Storage Path

Use a two-stage path:

1. Immediate next stage: continue with `holder:safe-summary:report` and external
   report only. This keeps validation, source review, and operator review
   raw-free while storage remains undecided. It does not reduce the persisted
   `holder_distribution_not_recorded` gap.
2. First persistent candidate: add a future `HolderSnapshot` model only after a
   Red task approves schema, migration, backup, exact write command, rollback,
   and verification. This is the preferred persistent route because holder
   distribution is a repeated risk observation, not a Token thesis field and
   not a market Metric payload.

This task does not implement the model and does not change
`prisma/schema.prisma`.

## First Persistent Storage Candidate

`HolderSnapshot` should be the first persistent storage candidate when the
project is ready for Red work. The model should be designed around safe summary
fields only:

- relation to `Token`;
- source label;
- observedAt;
- topHolderPct / top10HolderPct / holderCount / freshWalletCount;
- bundlerSignal / sameFundingOriginSignal / lpWalletExcluded;
- confidence;
- rawFree=true and secretFree=true;
- createdAt / updatedAt or equivalent audit fields;
- indexes for tokenId+observedAt and source+observedAt if needed.

Do not include raw response bodies, raw wallet lists, request URLs, API keys,
or free-form raw JSON in the first persistent model.

## Why Not `Token.entrySnapshot` For Holder Distribution

`Token.entrySnapshot` is useful for narrow one-time manual context, but holder
distribution is expected to change over time and may come from multiple
sources. Storing it in `Token.entrySnapshot.holderDistribution` would make
history awkward, blur source-derived risk facts with manual thesis context, and
increase JSON patch / rollback risk for a Token-level namespace that already
holds other observation context.

It remains acceptable for temp tests or non-persistent fixtures, but it is not
the preferred persistent holder distribution path.

## Why Not `Metric.rawJson` For Holder Distribution

Holder distribution can be observed near market metrics, but it is not itself a
market metric. Putting holder state into `Metric.rawJson` would hide holder
facts behind a payload boundary, complicate rawJson-free reporting, and risk
turning `rawJson` into a mixed safe-summary bucket. It also makes cleanup and
rollback harder because a Metric row may carry both market observation and
holder context.

Only reconsider this path for a source where holder context is strictly
metric-adjacent and the saved content remains a validated safe summary, not raw
provider JSON.

## Why External Report Only Remains Useful Before Persistence

External report only remains the safest immediate path because it proves source
mapping and parser behavior without production DB writes. It is suitable for
Rugcheck-style fixture review, manual holder review rehearsal, and external
report comparison. Its limitation is explicit: the persisted
`holder_distribution_not_recorded` gap remains unchanged.

## Red Task Requirements Before Schema / Migration

Before implementing `HolderSnapshot` or any persistent holder storage, a Red
task must define:

- exact schema and migration diff;
- backup path and restore criteria;
- one-token write command and no-batch default;
- parser gate using `HolderDistributionSafeSummary`;
- raw payload / secret marker checks;
- rollback / cleanup SQL limited to the new holder snapshot rows;
- read-only verification command;
- docs update plan;
- explicit confirmation that no buy/sell/position/exit guidance is introduced;
- queue, scheduler, systemd, checkpoint, `--write`, and `--watch` boundaries.

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
3. Use `pnpm holder:gaps:plan` to list existing
   `holder_distribution_not_recorded` tokens as read-only future snapshot
   candidates. The planner prints `suggestedCommand=null`, does not fetch or
   infer holder data, and does not reduce the persisted gap.
4. Add a holder-source capture planner only after the source contract is known.
5. Validate parser and safe-summary behavior with temp SQLite fixtures.
6. Run a one-token Red rehearsal only after backup, exact command, and
   verification are fixed.
7. Decide storage after the first source and safe summary shape are proven.

## Next Implementation Step

`src/observation/holderDistributionSafeSummary.ts` now provides the
parser-facing helper API for the fixed safe summary shape:

- `parseHolderDistributionSafeSummary(input: unknown)`;
- `isHolderDistributionSafeSummary(input: unknown)`;
- `buildHolderDistributionSafeSummaryIssueList(input: unknown)`.

The current tests use static fixtures only:

- one Rugcheck-style safe-summary fixture with concentration and risk flags;
- one manual holder review fixture with source-labeled operator values;
- one external holder report fixture;
- invalid fixtures for out-of-range percentages, invalid counts, unsafe flags,
  unknown fields, invalid timestamps, empty source, raw wallet lists, raw
  response bodies, raw JSON, and secret-like keys.

`pnpm holder:safe-summary:report -- --file <PATH>` is the read-only file report
for static safe-summary fixtures. It accepts either a single
`{ mint, summary }` object or `{ items: [{ mint, summary }] }`, validates each
summary through the parser, and prints only safe summary fields, issue text, and
review hints. Invalid raw payload / secret-like keys are rejected without
printing their values.

This parser and report foundation does not fetch, write production DB state,
choose final storage, add schema, start queues, send Telegram, or introduce
`--write` / `--watch`.

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
