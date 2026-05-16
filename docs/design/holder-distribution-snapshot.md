# Holder Distribution Snapshot Design

## Purpose

Holder distribution is a core LowcapBot observation gap. It belongs to the risk
and scam-surface side of the observation OS, not to buy-signal generation.

This document fixes the design boundary for filling
`holder_distribution_not_recorded`. It names the fields, source constraints,
safety rules, storage path, and migration boundary before any holder capture
command exists. As of the production migration apply step, the Prisma schema
and production DB schema include `HolderSnapshot`, but holder snapshot writes,
external fetch, and holder snapshot read/write CLIs remain unimplemented.

## Non-goals

- No external API fetch.
- No on-chain fetch.
- No holder snapshot row write without a separate one-token Red rehearsal.
- No production migration apply without a separate Red task.
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
safe summary before production persistence. The first persistent storage path is
the `HolderSnapshot` model after schema-file rehearsal and separate Red
production migration approval.

The source contract fixes the parser-facing safe summary type. The storage
decision now keeps external report only as the immediate pre-production path and
uses `HolderSnapshot` as the first persistent candidate after migration approval.

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

The model has now been added to `prisma/schema.prisma`, the additive migration
file has been created, and production `prisma/dev.db` has applied it. No
`HolderSnapshot` rows have been written.

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

## HolderSnapshot Model Proposal

This proposal is now reflected in `prisma/schema.prisma`,
`prisma/migrations/20260515000100_add_holder_snapshot/migration.sql`, and the
production `prisma/dev.db` schema. `holder:snapshot:add` /
`holder:snapshot:show` are still not implemented.

### Proposed Prisma Model Sketch

```prisma
model Token {
  // existing fields...
  holderSnapshots HolderSnapshot[]
}

model HolderSnapshot {
  id                      Int      @id @default(autoincrement())
  tokenId                 Int
  token                   Token    @relation(fields: [tokenId], references: [id], onDelete: Cascade)

  source                  String
  observedAt              DateTime

  topHolderPct            Float?
  top10HolderPct          Float?
  holderCount             Int?
  freshWalletCount        Int?

  bundlerSignal           String
  sameFundingOriginSignal String
  lpWalletExcluded        Boolean?

  confidence              String
  rawFree                 Boolean
  secretFree              Boolean

  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@index([tokenId, observedAt])
  @@index([source, observedAt])
}
```

Optional fields considered but deferred:

- `schemaVersion`: useful if the safe summary contract changes, but not needed
  while the first persistent model is gated by one validator version and docs.
- `sourceRunId`: useful for batch provenance, but batch holder capture is not
  admitted yet.
- `note`: useful for manual context, but it risks mixing source facts with
  operator narrative. Manual notes should stay outside the first persistent
  holder snapshot unless a later contract makes them safe and source-labeled.

### Field Definitions

- `id`: row identity for rollback and read-only inspection.
- `tokenId` / `token`: required relation to `Token`; `onDelete: Cascade`
  follows existing `Metric` behavior and prevents orphan holder snapshots if a
  token is intentionally deleted.
- `source`: non-empty source label from `HolderDistributionSafeSummary`, such
  as `rugcheck.safe_summary`, `manual_holder_review`, or
  `external_holder_report`.
- `observedAt`: source observation time parsed from the safe summary ISO
  timestamp.
- `topHolderPct` / `top10HolderPct`: nullable percentages, `0` through `100`.
- `holderCount` / `freshWalletCount`: nullable non-negative integers.
- `bundlerSignal` / `sameFundingOriginSignal`: safe summary enum strings
  (`none`, `low`, `medium`, `high`, `unknown`). Keep as strings in the first
  model to avoid adding database enum complexity in SQLite.
- `lpWalletExcluded`: nullable boolean indicating whether the source explicitly
  excluded LP / pool / program wallets from concentration fields.
- `confidence`: source confidence string (`low`, `medium`, `high`, `unknown`),
  not trading confidence.
- `rawFree` / `secretFree`: literal true in accepted writes. These remain
  columns so read-only verification can assert the persisted safety boundary.
- `createdAt` / `updatedAt`: operational audit timestamps.

No raw provider response body, wallet list, request URL, API key, Telegram
value, free-form `rawJson`, or raw payload field belongs in this model.

### Relation / Index / Constraint Decisions

Relation:

- Add `Token.holderSnapshots HolderSnapshot[]` when the model is implemented.
- Keep holder snapshots separate from `Metric` and `Token.entrySnapshot` so
  holder risk observations remain source-labeled and repeatable.

Indexes:

- `@@index([tokenId, observedAt])` supports token-level history and future
  `holder:snapshot:show --mint <MINT>` style inspection.
- `@@index([source, observedAt])` supports source-specific audit and bounded
  source review.

Unique constraints:

- Do not add a unique constraint in the first proposal.
- Rationale: repeated snapshots from the same source at the same reported
  `observedAt` may need manual investigation during early Red rehearsals, and a
  uniqueness failure would complicate one-token validation. Dedupe policy can
  be added later after source behavior is known.
- If needed later, consider a soft dedupe check in the write CLI before adding
  a database uniqueness constraint.

### Retention / Repeated Snapshot Policy

The model is intentionally historical. Repeated snapshots are allowed because
holder distribution changes over time and can be compared with later outcome
evidence. The first Red rehearsal should write at most one row. Batch capture,
retention pruning, and repeated scheduled capture remain out of scope until a
separate operations design exists.

Future retention policy candidates:

- keep all one-token rehearsals until outcome review is complete;
- cap repeated source snapshots per token only after real storage volume is
  known;
- never delete rows as automated cleanup without a specific Red-approved
  rollback or retention task.

### Validation Boundary

Any future `HolderSnapshot` write must pass through
`parseHolderDistributionSafeSummary` first. The write path may only persist the
parsed safe summary fields and must enforce:

- `rawFree === true`;
- `secretFree === true`;
- no raw wallet lists;
- no raw response bodies;
- no `rawJson`;
- no request URL with secrets;
- no `apiKey`, `token`, `chatId`, Telegram token, or env material;
- `confidence` as source confidence only;
- holder fields used as risk observation context only, never as buy / sell /
  position / exit guidance.

### Migration Boundary

Schema-file creation and production migration application must stay separate:

- Yellow schema proposal refinement may edit docs only.
- The schema-file rehearsal task may edit `prisma/schema.prisma`, create the
  migration file, and rehearse against a temp DB only.
- Red production migration apply may apply the migration after backup and
  read-only verification planning. This has been completed once for
  `20260515000100_add_holder_snapshot`.
- Red write task may run a one-token holder snapshot write only after migration,
  backup, rollback, and read-only verification are fixed.
- External or on-chain fetch remains a separate Red task.
- Queue, scheduler, systemd, checkpoint, `--write`, and `--watch` remain
  unapproved for holder snapshots.

### Migration Risk

Main risks:

- adding a new relation to `Token` can affect generated Prisma Client types and
  report queries;
- migration must be tested against SQLite and production backup/restore flow;
- future reports must not accidentally expose raw payload fields, although the
  proposed model intentionally has no raw payload columns;
- cascading delete behavior must be understood before any cleanup task touches
  Token rows.

Mitigations:

- keep the first model narrow and safe-summary-only;
- validate migration with `pnpm exec prisma validate` and temp DB migration
  rehearsal before production;
- verify read-only reports expose only safe fields;
- keep rollback limited to `HolderSnapshot` rows created by the rehearsal.

### Rollback Strategy

Before any Red rehearsal:

- create a production DB backup;
- record the target mint;
- record the expected safe summary fixture hash or file path;
- record the future write command exactly.

For a one-token rehearsal:

- capture the inserted `HolderSnapshot.id`;
- rollback SQL deletes only that `HolderSnapshot` row by `id`;
- do not delete or patch `Token`, `Metric`, or `Notification`;
- do not run broad cleanup by mint pattern or source pattern;
- raw payload cleanup should be unnecessary because the parser gate prevents
  raw payload persistence.

Migration rollback is separate from row rollback. If the migration itself must
be rolled back, restore from backup rather than improvising destructive schema
edits.

### One-Token Red Rehearsal Flow

Future command names are sketches only and are not implemented yet.

1. Use `pnpm holder:gaps:plan -- --limit <N> --pumpOnly` to choose one target
   mint with `holder_distribution_not_recorded`.
2. Prepare a static safe summary fixture for that mint.
3. Run `pnpm holder:safe-summary:report -- --file <SAFE_SUMMARY_FILE>` and
   confirm `validCount=1`, `invalidCount=0`, no raw payload / secret output,
   and no trading guidance.
4. Create a production DB backup.
5. Run one future exact write command once, for example:
   `pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>`.
6. Record the inserted `HolderSnapshot.id`.
7. Verify through read-only commands:
   - future `pnpm holder:snapshot:show -- --mint <MINT>`;
   - `pnpm token:observation -- --mint <MINT>` once it knows how to read holder
     snapshots;
   - `pnpm holder:gaps:plan -- --limit <N> --pumpOnly` once it knows how to
     treat persisted holder snapshots.
8. Confirm Token / Metric / Notification rows were not modified by the holder
   snapshot write.
9. Update docs with command, row id, verification output summary, and rollback
   status.

### Read-Only Verification Flow

Future read-only verification should show:

- target mint;
- holder snapshot row id;
- source and observedAt;
- safe summary fields;
- `rawFree=true`;
- `secretFree=true`;
- no raw payload, raw wallet list, request URL, API key, Telegram value, or
  free-form raw JSON;
- no buy / sell / position / exit guidance.

### HolderSnapshot Stop Conditions

Stop before schema or write implementation if:

- the model needs a raw payload, raw response body, wallet list, request URL,
  API key, token, chat id, or free-form raw JSON field;
- parser output cannot map cleanly into scalar safe summary fields;
- a source requires unbounded holder crawl or funding graph traversal before
  the one-token rehearsal;
- rollback cannot be limited to the new holder snapshot row;
- verification would require Telegram, queue, scheduler, systemd, checkpoint,
  `--write`, or `--watch`;
- the output starts to read like buy / sell / position / exit guidance.

## Future Holder Snapshot CLI Contract

This section defines future command contracts only. These commands are not
implemented, are not listed in `package.json`, and must not be run until the
schema / migration Red work has completed.

### `holder:snapshot:add`

Sketch:

```bash
pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>
```

Responsibility:

- Red production DB write command.
- Writes exactly one `HolderSnapshot` row.
- Requires an exact `--mint`; no implicit candidate selection.
- Requires one safe summary file; no batch default and no `items` array write.
- Requires the target `Token` row to exist.
- Validates the file with the same boundary as `holder:safe-summary:report` and
  `parseHolderDistributionSafeSummary`.
- Persists only validated safe summary scalar fields.
- Returns the inserted `holderSnapshotId`.
- Does not update `Token`, `Metric`, or `Notification`.
- Does not fetch external API data or on-chain data.
- Does not send Telegram.
- Does not use queue, scheduler, systemd, checkpoint, `--watch`, or batch
  execution.

Input contract:

- `--mint <MINT>` is required and must identify one existing Token.
- `--file <SAFE_SUMMARY_FILE>` is required.
- The file should contain one safe summary object or one `{ mint, summary }`
  wrapper. If both CLI mint and file mint are present, they must match.
- The parsed summary must have `rawFree=true` and `secretFree=true`.
- Raw payload fields, wallet lists, `rawJson`, response bodies, request URLs
  with secrets, `apiKey`, `token`, `chatId`, Telegram material, and env values
  are rejected.

Output shape proposal:

```json
{
  "status": "ok",
  "mode": "holder_snapshot_add_one",
  "mint": "<MINT>",
  "updated": true,
  "holderSnapshotId": 1,
  "source": "rugcheck.safe_summary",
  "observedAt": "2026-05-10T00:00:00.000Z",
  "rawFree": true,
  "secretFree": true,
  "safetyBoundary": {
    "writeScope": "one_holder_snapshot_row",
    "tokenUpdated": false,
    "metricUpdated": false,
    "notificationUpdated": false,
    "externalFetch": false,
    "telegramSend": false,
    "queue": false,
    "systemd": false
  }
}
```

Error output statuses:

- `not_found`: the target Token does not exist; no write.
- `invalid_safe_summary`: the file fails safe summary validation; no write.

The error output must include issue text only, never raw payload values or
secret values. The command must not include buy / sell / position / exit
guidance.

### `holder:snapshot:show`

Sketch:

```bash
pnpm holder:snapshot:show -- --mint <MINT> [--limit <N>]
```

Responsibility:

- Read-only command.
- Requires exact `--mint`.
- Returns the latest N holder snapshots for the token, ordered by
  `observedAt desc`, then `id desc`.
- Emits safe fields only.
- Emits no raw payload, wallet list, raw response body, request URL, API key,
  Telegram value, env value, or free-form raw JSON.
- Provides review context only; no buy / sell / position / exit guidance.
- Can be used after a Red rehearsal to verify the inserted holder snapshot.

Output shape proposal:

```json
{
  "status": "ok",
  "mode": "read_only_holder_snapshot_show",
  "mint": "<MINT>",
  "count": 1,
  "items": [
    {
      "holderSnapshotId": 1,
      "source": "rugcheck.safe_summary",
      "observedAt": "2026-05-10T00:00:00.000Z",
      "topHolderPct": 12.5,
      "top10HolderPct": 42.25,
      "holderCount": 1234,
      "freshWalletCount": 17,
      "bundlerSignal": "low",
      "sameFundingOriginSignal": "unknown",
      "lpWalletExcluded": true,
      "confidence": "medium",
      "rawFree": true,
      "secretFree": true,
      "riskReviewHints": [
        "review holder concentration manually",
        "compare with later outcome",
        "do not infer trading decision"
      ]
    }
  ]
}
```

Error output statuses:

- `not_found`: the target Token does not exist.

`holder:snapshot:show` must not mutate DB state and must not trigger any
external fetch or notification.

### Red Rehearsal Flow For Future Commands

1. Select a target token with:
   `pnpm holder:gaps:plan -- --limit <N> --pumpOnly`.
2. Prepare a single safe summary fixture for the target mint.
3. Validate the fixture with:
   `pnpm holder:safe-summary:report -- --file <SAFE_SUMMARY_FILE>`.
4. Confirm `validCount=1`, `invalidCount=0`, no raw payload / secret output,
   and no buy / sell / position / exit guidance.
5. Create a production DB backup.
6. Run exactly one future write command:
   `pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>`.
7. Record `holderSnapshotId` from the output.
8. Verify with:
   `pnpm holder:snapshot:show -- --mint <MINT> --limit 5`.
9. Confirm `rawFree=true`, `secretFree=true`, source / observedAt / fields
   match the fixture, and no unsafe payload text appears.
10. Confirm `Token`, `Metric`, and `Notification` were not updated by the
   holder snapshot write.
11. Treat `token:observation` holder snapshot integration and
   `holder:gaps:plan` gap handling as future post-implementation work unless
   those readers have already been updated.
12. Update docs with the exact command, inserted id, verification result, and
   rollback status.

### Rollback Command Sketch

If rollback is needed after the one-token rehearsal:

```sql
DELETE FROM HolderSnapshot WHERE id = <INSERTED_ID>;
```

Rollback rules:

- Use the exact inserted `holderSnapshotId`.
- Delete only that `HolderSnapshot` row.
- Do not patch or delete `Token`, `Metric`, or `Notification`.
- Do not run source-wide, mint-pattern, or broad cleanup SQL.
- If schema migration rollback is needed, restore the pre-migration backup
  instead of improvising destructive schema edits.

### Future CLI Stop Conditions

Stop before running or implementing the future commands if:

- backup is missing;
- schema is not aligned with the documented HolderSnapshot model;
- target Token is not found;
- safe summary validation fails;
- the file contains raw payload, wallet list, `rawJson`, response body, request
  URL with secrets, `apiKey`, `token`, `chatId`, Telegram material, or env
  values;
- the command would write more than one row;
- the command would update `Token`, `Metric`, or `Notification`;
- inserted `holderSnapshotId` is not available for rollback;
- output starts to read like buy / sell / position / exit guidance;
- implementation requires external fetch, on-chain fetch, Telegram, queue,
  scheduler, systemd, checkpoint, `--watch`, or batch execution.

## HolderSnapshot Migration Rehearsal Plan

This section records the schema-file rehearsal boundary. The schema file and
migration file now exist, but production migration apply has not run.

### Future Schema Edit Scope

The first schema edit is strictly additive:

- add the `HolderSnapshot` model only;
- add `Token.holderSnapshots HolderSnapshot[]` only;
- do not change existing `Token`, `Metric`, or `Notification` fields;
- do not add raw payload, raw response body, wallet list, request URL, API key,
  Telegram value, env value, `rawJson`, or free-form JSON columns;
- do not add a unique constraint in the first migration;
- do not implement `holder:snapshot:add` or `holder:snapshot:show` in the same
  schema task.

Expected model diff is the sketch in `HolderSnapshot Model Proposal`: one new
model with safe summary scalar columns and two indexes:

- `@@index([tokenId, observedAt])`;
- `@@index([source, observedAt])`.

Expected Token diff:

```prisma
holderSnapshots HolderSnapshot[]
```

### Migration File Naming

Use a timestamped Prisma migration name that describes the additive change, for
example:

```text
YYYYMMDDHHMMSS_add_holder_snapshot/
```

The generated SQL must be reviewed before production. It should create the
`HolderSnapshot` table and indexes only. If the migration wants to drop,
rewrite, or reset existing tables, stop.

### Future Task Split

A. Yellow or Red schema-file task:

- edit `prisma/schema.prisma`;
- create the migration file;
- run validation and temp DB rehearsal;
- do not run production `prisma migrate deploy`;
- do not write holder snapshot data.

B. Red production migration apply:

- confirm expected HEAD / origin match and clean working tree;
- create production DB backup;
- run production migration apply;
- run read-only schema verification;
- confirm `HolderSnapshot` count is `0`;
- do not run `holder:snapshot:add`.

C. Yellow CLI implementation:

- implement `holder:snapshot:add` and `holder:snapshot:show`;
- use temp SQLite tests only;
- do not write production DB state.

D. Red one-token write rehearsal:

- create production DB backup;
- validate one safe summary fixture;
- run the exact one-row write command once;
- verify with `holder:snapshot:show`;
- record inserted id and rollback status;
- update docs.

### Temp DB Migration Rehearsal

Before production migration, rehearse against a temp SQLite DB. The schema-file
task used this temp-only boundary; production `prisma/dev.db` was not migrated.
Future exact commands may differ, but the intent should be:

```bash
TMP_DIR="$(mktemp -d)"
DATABASE_URL="file:$TMP_DIR/holder-snapshot-rehearsal.db" pnpm exec prisma migrate deploy
DATABASE_URL="file:$TMP_DIR/holder-snapshot-rehearsal.db" pnpm exec prisma validate
DATABASE_URL="file:$TMP_DIR/holder-snapshot-rehearsal.db" pnpm exec prisma generate
DATABASE_URL="file:$TMP_DIR/holder-snapshot-rehearsal.db" pnpm exec prisma migrate status
```

Temp DB verification should inspect the schema only:

```sql
PRAGMA table_info('HolderSnapshot');
PRAGMA index_list('HolderSnapshot');
SELECT COUNT(*) FROM HolderSnapshot;
```

Expected temp DB result:

- `HolderSnapshot` table exists;
- expected columns exist;
- expected indexes exist;
- row count is `0`;
- no Token / Metric / Notification schema drift;
- no data writes beyond migration metadata and empty schema objects.

Schema-file rehearsal result:

- migration file:
  `prisma/migrations/20260515000100_add_holder_snapshot/migration.sql`;
- temp DB migration deploy passed;
- temp DB `PRAGMA table_info('HolderSnapshot')` showed the expected safe
  summary columns only;
- temp DB `PRAGMA index_list('HolderSnapshot')` showed
  `HolderSnapshot_tokenId_observedAt_idx` and
  `HolderSnapshot_source_observedAt_idx`;
- temp DB `SELECT COUNT(*) FROM HolderSnapshot` returned `0`;
- production `prisma/dev.db` migration apply was not run.

Production migration apply result:

- backup:
  `/home/mochi/lowcap-bot-backups/dev.db.before-holder-snapshot-migration-20260515012828.db`;
- `pnpm exec prisma migrate deploy` applied
  `20260515000100_add_holder_snapshot`;
- `pnpm exec prisma migrate status` reported the DB schema up to date;
- `_prisma_migrations` has `finished_at` for
  `20260515000100_add_holder_snapshot` and `rolled_back_at` is null;
- production `PRAGMA table_info('HolderSnapshot')` showed the expected safe
  summary columns only;
- production `PRAGMA index_list('HolderSnapshot')` showed
  `HolderSnapshot_tokenId_observedAt_idx` and
  `HolderSnapshot_source_observedAt_idx`;
- production `SELECT COUNT(*) FROM HolderSnapshot` returned `0`;
- Token / Metric / Notification counts stayed unchanged at `1116 / 191 / 6`;
- no holder snapshot row write, external fetch, Telegram, queue, scheduler,
  systemd, checkpoint, `--write`, `--watch`, or `pnpm smoke` ran.

### Production Migration Apply Boundary

Production migration apply is Red-only. Preconditions:

- expected HEAD and origin/master match;
- working tree is clean;
- production DB backup exists and path is recorded;
- migration SQL has been reviewed as additive;
- temp DB rehearsal has passed;
- `pnpm exec prisma validate` passes;
- `pnpm exec tsc --noEmit` passes;
- no external fetch is needed;
- no holder snapshot write command is part of the same task;
- `pnpm smoke` is not part of the migration task.

Future production apply command sketch:

```bash
pnpm exec prisma migrate deploy
```

Stop immediately if Prisma reports drift, reset requirement, destructive
change, failed migration state, or any need to drop/recreate existing tables.

### Post-Migration Verification

After production migration apply, run read-only checks only:

```bash
pnpm exec prisma validate
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm exec prisma migrate status
```

Production DB schema checks:

```sql
PRAGMA table_info('HolderSnapshot');
PRAGMA index_list('HolderSnapshot');
SELECT COUNT(*) FROM HolderSnapshot;
```

Expected production result:

- `HolderSnapshot` table exists;
- expected indexes exist;
- `HolderSnapshot` row count is `0`;
- Token / Metric / Notification row counts are unchanged;
- no holder snapshot write has run;
- no raw payload or secret-bearing table/column exists.

### Migration Rollback Plan

Before production migration:

- backup is mandatory;
- backup path and file size should be recorded;
- restore criteria should be written before apply.

After migration apply but before data writes:

- prefer backup restore if rollback is needed;
- do not improvise destructive schema edits;
- do not run broad cleanup SQL;
- do not patch Token / Metric / Notification.

After a later one-token holder snapshot write:

- row rollback is separate and limited to:

```sql
DELETE FROM HolderSnapshot WHERE id = <INSERTED_ID>;
```

- use the inserted id from `holder:snapshot:add`;
- do not delete by mint pattern, source pattern, or timestamp range;
- do not edit Token / Metric / Notification.

### Migration Rehearsal Stop Conditions

Stop before schema edit, migration creation, or production apply if:

- the change requires editing existing Token / Metric / Notification fields;
- a raw payload / rawJson / wallet-list column seems necessary;
- a unique constraint is needed to proceed;
- generated SQL is not additive;
- Prisma reports drift, reset, destructive change, or failed migration state;
- temp DB rehearsal fails;
- backup is missing before production apply;
- post-migration verification cannot prove `HolderSnapshot` count is `0`;
- rollback cannot be explained as backup restore before writes or
  `HolderSnapshot.id` row delete after the later one-token write;
- the task starts to include external fetch, holder snapshot write CLI
  implementation, production data write, Telegram, queue, scheduler, systemd,
  checkpoint, `--write`, `--watch`, or `pnpm smoke`;
- output or docs start to read like buy / sell / position / exit guidance.

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
- implement holder snapshot commands with temp SQLite tests only;
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
6. HolderSnapshot production migration has been applied once with backup and
   read-only schema verification.
7. `holder:snapshot:add` and `holder:snapshot:show` are implemented and covered
   by temp SQLite tests.
8. The first production one-token Red rehearsal has written one manual
   safe-summary `HolderSnapshot` row.
9. `token:observation` and `holder:gaps:plan` read persisted HolderSnapshot
   rows without production writes.
10. Keep source fetch and holder snapshot CLI work separate from migration
   apply.

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

`pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>` is now
implemented as a one-row write CLI. It requires an exact mint, rejects batch
`items` input, requires a raw safe summary object or `{ mint, summary }`, checks
file mint mismatch, validates with `parseHolderDistributionSafeSummary`, writes
exactly one `HolderSnapshot` row, and returns `holderSnapshotId` plus the safety
boundary. It does not update Token / Metric / Notification, fetch external or
on-chain data, send Telegram, start queue / scheduler / systemd, touch
checkpoint, or use `--write` / `--watch`. Production add remains unrun.

`pnpm holder:snapshot:show -- --mint <MINT> [--limit <N>]` is implemented as a
read-only verifier. It returns latest safe holder snapshots ordered by
`observedAt desc, id desc`, emits safe fields only, and includes review hints
without buy / sell / position / exit guidance.

The first Red one-token holder snapshot write rehearsal is recorded:

- target mint: `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`;
- backup:
  `/home/mochi/lowcap-bot-backups/dev.db.before-holder-snapshot-row-rehearsal-20260515015522.db`;
- fixture source: `manual_holder_review`;
- holder percentage / count fields: `null`;
- bundler and same-funding signals: `unknown`;
- `holder:safe-summary:report`: `validCount=1`, `invalidCount=0`;
- exact add command returned `holderSnapshotId=1`;
- `holder:snapshot:show` confirmed `count=1` and safe fields only;
- Token / Metric / Notification counts stayed unchanged at `1116 / 191 / 6`;
- HolderSnapshot count moved `0 -> 1`;
- `holder:gaps:plan` still reports the gap because persisted HolderSnapshot
  integration is future Yellow work.

The rehearsal was storage / parser / show-path validation only. It did not use
external fetch, on-chain fetch, Telegram, queue, scheduler, systemd, checkpoint,
`--write`, `--watch`, or `pnpm smoke`, and it is not a buy signal.

The reader integration is now implemented:

- `token:observation` exposes `holderDistributionSnapshot` safe fields for the
  latest persisted row;
- `holder_distribution_not_recorded` is removed when a HolderSnapshot exists;
- null / unknown manual fixture rows keep review gaps
  `holder_distribution_values_unknown` and
  `holder_distribution_manual_review_only`;
- `holder:gaps:plan` excludes tokens with persisted HolderSnapshot rows and
  reports `holderSnapshotPresentCount`;
- production read-only verification confirmed HolderSnapshot count remains `1`.

The next step is a separate source-capture design / rehearsal task if a real
holder source should be tried. Source fetch remains a separate future task.

## MVP Loop Closeout

The holder distribution MVP loop is complete for the narrow storage / parser /
write-path / read-path goal:

- HolderSnapshot schema was added.
- Production migration was applied.
- `holder:snapshot:add` and `holder:snapshot:show` were implemented.
- One production Red rehearsal wrote exactly one HolderSnapshot row.
- `token:observation` reads the latest persisted HolderSnapshot.
- `holder:gaps:plan` excludes tokens that already have persisted
  HolderSnapshot rows.
- Production HolderSnapshot count is `1`.
- The rehearsal target was
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, with
  `holderSnapshotId=1`.

This closeout does not mean real holder analysis is complete. The current
production row is a manual/static safe summary fixture:

- `source=manual_holder_review`;
- holder values are `null` / `unknown`;
- no external API fetch was performed;
- no on-chain fetch was performed;
- no holder values were inferred;
- `holder_distribution_values_unknown` and
  `holder_distribution_manual_review_only` remain review gaps.

The completed loop validates storage, parser, one-row write, and read-only
reporting only. It is not buy / sell / position / exit guidance, and holder
state must not become a trading score.

Next-phase candidates:

- Yellow: review one real holder source contract and endpoint boundary.
- Yellow: add a source-specific raw-free mapper fixture.
- Red: run one-source external safe-summary capture only after source,
  endpoint, raw payload, and secret boundaries are approved.
- Yellow: compare holder snapshots with later outcomes once more snapshots
  exist.

## Rugcheck-Style Synthetic Mapper Fixture

`src/observation/holderSourceMappers.ts` adds the first source-specific mapper
rehearsal:

- mapper name: `mapRugcheckStyleHolderSummary`;
- input shape: synthetic/static Rugcheck-style summary fixture only;
- output: `HolderDistributionSafeSummary` with
  `source="rugcheck.safe_summary.synthetic"` by default;
- final output must pass the `HolderDistributionSafeSummary` validator;
- missing or ambiguous concentration / wallet-signal fields stay `null` or
  `unknown`;
- the mapper does not infer holder values from incomplete provider context;
- raw provider JSON, raw response bodies, wallet-list fields, request URLs, and
  secret-like keys are rejected before summary output;
- rejected issues describe key/path and reason without printing raw payload or
  secret values.

This is not real Rugcheck API integration and does not approve a real endpoint,
credential, or response shape. It is a raw-free mapping rehearsal for the source
contract only. It performs no external API fetch, no on-chain fetch, no
production DB write, no `holder:snapshot:add`, and no Telegram / queue /
systemd / checkpoint / watch work.

The mapper output is review context only. It is not buy / sell / position /
exit guidance, and it must not become a holder score or trading recommendation.
Future real source capture needs a separate source / endpoint / raw-boundary
approval task before any Red external safe-summary capture.

## Real Source Contract Review

Reviewed public Rugcheck-style documentation only. No real Rugcheck API request,
on-chain request, production DB write, or `holder:snapshot:add` was run.

Sources reviewed:

- FluxRPC RugCheck docs: base URL `https://api.rugcheck.xyz`, token report,
  token report summary, bulk summary, and insider graph endpoint listings.
- ScreenerBot RugCheck API guide: public examples for full report, summary
  report, holder analysis, and integration practices.
- AgentiPy RugCheck tool docs: confirms token report summary / detailed report
  concepts and warns that availability, rate limits, and API key requirements
  depend on Rugcheck.

Endpoint candidates:

| Candidate | Docs status | Raw payload risk | First-use suitability |
| --- | --- | --- | --- |
| `GET /v1/tokens/{mint}/report/summary` | documented by public guides as a short token report summary | medium: still may include `risks[]`, provider-specific scoring, and undocumented fields | best candidate for a future Red preflight if endpoint / auth / response fields are approved |
| `GET /v1/tokens/{mint}/report` | documented as the full token report | high: public examples include `topHolders[]`, markets, token metadata, and broad risk details | defer; do not use as first source unless a raw-free mapper can discard wallet lists before persistence |
| `GET /v1/tokens/{mint}/insiders/graph` | documented as an insider-network graph and as potentially large | very high: graph/network data is likely raw relationship payload | reject for MVP safe summary capture |
| bulk summary endpoint | documented as summarized reports for many mints | medium plus batch scope risk | defer; the holder loop is one-token-first and should not start with batch capture |

Public docs indicate a possible summary field such as `topHoldersPct` and LP
fields such as `lpLocked` / `lpLockedPct`. They also show full-report
`topHolders[]` wallet entries and risk arrays. That makes the summary endpoint
plausible for raw-free mapping, but the exact real response contract remains
unresolved until a separate approved preflight confirms the live schema without
persisting raw payload.

Auth / rate-limit status is unresolved. One public guide describes basic
endpoints as usable without an API key, while FluxRPC documentation says most
endpoints require a FluxRPC API key or RugCheck JWT token. Treat auth as
unknown until a future Red preflight explicitly approves the credential
boundary. Do not add `.env` fields, print secrets, or assume anonymous access.

Safe-summary mapping possibility:

| `HolderDistributionSafeSummary` field | Rugcheck-style mapping status |
| --- | --- |
| `topHolderPct` | unresolved; leave `null` unless the real summary has an explicit single top-holder percentage field |
| `top10HolderPct` | possible only if a documented field is explicitly top-10 holder concentration; do not map ambiguous `topHoldersPct` until semantics are confirmed |
| `holderCount` | unresolved; leave `null` unless the summary exposes a holder count |
| `freshWalletCount` | unresolved; leave `null` unless the summary exposes a fresh-wallet count |
| `bundlerSignal` | unresolved; keep `unknown` unless a source-labeled bundling field or approved risk-name mapping exists |
| `sameFundingOriginSignal` | unresolved; keep `unknown`; do not use insider graph payload for MVP |
| `lpWalletExcluded` | unresolved; keep `null` unless the response explicitly states holder concentration excludes LP / pool wallets |
| `source` | future real mapper should use a specific label such as `rugcheck.safe_summary` only after endpoint approval |
| `observedAt` | use capture time only if the source does not provide a reliable observation timestamp |
| `confidence` | source confidence only; not trading confidence |
| `rawFree` / `secretFree` | must remain literal `true` after mapper validation |

Fields to ignore or reject:

- ignore provider scores / risk levels for holder distribution storage unless a
  separate risk contract is approved;
- reject `topHolders`, `holders`, `wallets`, wallet addresses, owner addresses,
  raw response bodies, raw JSON, request URLs, auth headers, API keys, JWTs, and
  chat IDs;
- ignore free-form risk descriptions unless a narrow source-specific enum
  mapping is approved;
- never store raw response fixtures in the repo.

Real endpoint contract status: unresolved. The synthetic mapper remains the
only implemented mapper. `mapRugcheckRealResponseToSafeSummary` is not
implemented, and no real response fixture exists. A future task must approve:

- exact endpoint URL and method;
- whether auth is required and how secrets stay out of output/logs;
- rate-limit and terms boundary;
- exact response fields and whether `topHoldersPct` means top holder, top 10
  holders, or another provider-defined aggregate;
- whether holder percentages exclude LP / pool wallets;
- whether risks can be mapped to `bundlerSignal` or
  `sameFundingOriginSignal` without parsing free text;
- sanitized one-token preflight output shape that stores only
  `HolderDistributionSafeSummary`.

Stop before Red external capture if endpoint docs or terms are unclear, auth is
unknown, rate limits are unknown, the response requires wallet-list
persistence, `topHoldersPct` semantics are ambiguous, a mapper would need
free-text risk inference, output starts reading like buy / sell / position /
exit guidance, or raw payload / secrets would need to be logged.

## Rugcheck Summary Endpoint Preflight Plan

This is a docs-only execution plan for a possible future Red endpoint
preflight. It does not approve capture, does not confirm the endpoint contract,
and does not run a real Rugcheck API request, on-chain request, production DB
write, `holder:snapshot:add`, queue, scheduler, systemd, checkpoint update,
`--write`, `--watch`, or `pnpm smoke`.

Purpose:

- verify whether a single summary response can be inspected without storing
  raw provider JSON;
- confirm the top-level response shape and candidate holder fields before any
  real mapper fixture is implemented;
- confirm whether dangerous raw-payload or secret-like keys are present;
- decide whether the source can advance only to a source-specific mapper
  fixture, not to persistence.

Candidate endpoint:

- candidate: `GET /v1/tokens/{mint}/report/summary`;
- endpoint URL, auth mode, terms, rate limit, and exact response shape remain
  unresolved until the future Red preflight is separately approved;
- full report, insider graph, and bulk endpoints are out of scope.

Target mint policy:

- initial candidate mint:
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`;
- reason: this mint already has Token / HolderSnapshot context from the
  manual rehearsal loop;
- before any Red preflight, re-confirm the target mint, endpoint, and exact
  command with the operator.

Auth / secret boundary:

- do not assume anonymous access;
- if an API key, JWT, bearer token, or provider credential is required, approve
  the credential boundary before the request;
- do not print, persist, commit, screenshot, or paste auth headers, request
  URLs containing secrets, `.env` values, API keys, JWTs, tokens, Telegram
  fields, or any secret-like value;
- preflight output may say that auth was required or not required, but must not
  include the credential material.

Request count limit:

- exactly one mint;
- summary endpoint only;
- exactly one request;
- no retry, batch request, follow-up endpoint, full report fallback, holder
  crawl, queue, scheduler, systemd, checkpoint update, `--write`, `--watch`, or
  `pnpm smoke`.

Allowed output:

- HTTP status;
- response top-level keys only;
- presence / absence of candidate holder fields;
- whether dangerous keys exist, reported by key/path category only;
- sanitized field-shape summary such as primitive type, array/object presence,
  and nullability;
- whether mapping to `HolderDistributionSafeSummary` seems possible;
- whether the response appears to require more source review;
- no actual wallet addresses and no raw response body.

Forbidden output:

- raw response body;
- raw JSON dump;
- raw provider JSON fixture;
- `topHolders[]` entries;
- wallet addresses;
- owner addresses;
- request URL containing secrets;
- auth headers;
- API keys, JWTs, bearer tokens, or provider tokens;
- Telegram bot token, chat id, or Telegram response fields;
- `.env` values;
- screenshots containing wallet lists or secrets;
- free-form provider risk descriptions if they contain wallet-like data.

No persistence boundary:

- do not write production DB state;
- do not run `holder:snapshot:add`;
- do not write a raw response fixture;
- do not commit response bodies, screenshots, provider JSON, wallet lists, or
  secret-bearing output;
- rollback should be unnecessary because the approved preflight must not create
  persisted app state.

Mapping decision boundary:

- after preflight, do not automatically persist holder data;
- do not implement `mapRugcheckRealResponseToSafeSummary` in the same Red
  preflight task;
- do not map ambiguous `topHoldersPct` semantics into `topHolderPct` or
  `top10HolderPct`;
- keep unknown or ambiguous fields as `null` / `unknown`;
- possible outcomes are:
  `approved_for_mapper_fixture_only`, `needs_more_source_review`,
  `rejected_for_raw_payload_risk`, or
  `rejected_for_auth_or_terms_uncertainty`.

Stop conditions:

- endpoint URL, auth, terms, or rate limit remain unclear at approval time;
- more than one request would be needed;
- the summary endpoint redirects the task toward full report, insider graph,
  bulk, or on-chain holder crawl;
- response inspection would require printing or saving a raw response body;
- wallet lists, owner addresses, request URLs with secrets, auth headers, API
  keys, JWTs, Telegram fields, or `.env` values would appear in output;
- source terms prohibit the intended inspection;
- holder fields are too ambiguous to decide fixture mapping;
- output starts to read like buy / sell / position / exit guidance.

Post-preflight next steps:

- if `approved_for_mapper_fixture_only`, add a sanitized source-specific mapper
  fixture shape without storing raw provider JSON;
- if `needs_more_source_review`, keep the source unresolved and do not
  implement a real mapper;
- if rejected for raw payload, auth, terms, or rate-limit risk, keep the
  synthetic mapper as the only implemented mapper;
- any later persistence task needs a separate approval after a real mapper
  fixture is reviewed.

## Rugcheck Summary Endpoint Preflight Result

Red endpoint preflight was run once for mint
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` against the candidate summary
endpoint on 2026-05-16. This was not external safe-summary capture, not
`holder:snapshot:add`, and not a production DB write.

Preflight boundary:

- exactly one mint;
- exactly one summary endpoint request;
- no retry, batch, full-report fallback, insider graph, bulk endpoint, or
  on-chain fetch;
- no raw response body printed or saved;
- no raw JSON dump, raw provider JSON fixture, screenshot, wallet / owner
  address output, auth material output, `.env` output, or secret output;
- no queue, scheduler, systemd, checkpoint update, `--write`, `--watch`, or
  `pnpm smoke`.

Sanitized result:

- HTTP status: `200`;
- JSON parse: ok;
- top-level keys observed: `tokenProgram`, `tokenType`, `risks`, `score`,
  `score_normalised`, `lpLockedPct`;
- candidate holder fields present: `lpLockedPct`, `risks`, `score`;
- candidate holder fields absent: `topHoldersPct`, `holderCount`, `lpLocked`,
  `rugged`, `tokenMeta`, `markets`;
- dangerous key categories present: none observed by key scan;
- shallow shape only: `tokenProgram` / `tokenType` were strings, `risks` was an
  empty array, and `score` / `score_normalised` / `lpLockedPct` were numbers.

Mapping decision: `needs_more_source_review`.

Reason:

- no explicit `topHolderPct`, top-10 holder concentration, or `holderCount`
  field was present in the sanitized shape;
- `lpLockedPct` may be useful context later, but it is not enough to populate
  `HolderDistributionSafeSummary` holder concentration fields;
- provider score fields remain ignored for holder distribution storage unless a
  separate risk contract is approved;
- no real mapper, real response fixture, or persistence path is approved by
  this preflight.

Next step: keep the current synthetic mapper as the only implemented mapper.
If Rugcheck-style support continues, do a source-specific mapper fixture design
using only sanitized field names / shapes, or perform more source review before
any real mapper implementation. Any persistence or safe-summary capture still
requires a separate approval.

## Rugcheck Summary Preflight Closeout

The Rugcheck summary endpoint Red preflight is closed for holder distribution
source admission.

Closeout facts:

- Red preflight completed as exactly one mint, one request, and sanitized
  shape-only output;
- HTTP status was `200`;
- JSON parse was ok;
- observed top-level keys were `tokenProgram`, `tokenType`, `risks`, `score`,
  `score_normalised`, and `lpLockedPct`;
- dangerous key categories were not detected by key scan;
- holder concentration fields were not confirmed:
  - `topHolderPct` absent;
  - `top10HolderPct` absent;
  - `holderCount` absent;
  - `topHoldersPct` absent;
- mapping decision remains `needs_more_source_review`.

Source decision:

- Rugcheck summary endpoint is not approved as a
  `HolderDistributionSafeSummary` holder concentration source yet;
- do not implement `mapRugcheckRealResponseToSafeSummary` yet;
- do not map `score`, `score_normalised`, or `risks` into holder distribution;
- do not map `lpLockedPct` into `topHolderPct`, `top10HolderPct`, or
  `holderCount`;
- `lpLockedPct` may be future risk / liquidity context, but only under a
  separate risk-context safe-summary contract;
- the current Rugcheck-style synthetic mapper remains the only implemented
  mapper.

Future options:

- A. Keep Rugcheck summary unresolved for holder distribution.
- B. Review a different source that exposes explicit holder concentration
  fields without raw wallet-list persistence.
- C. Create a separate risk-context safe-summary contract later for
  `lpLockedPct`, provider `score`, `score_normalised`, and `risks`.
- D. Only with separate approval, consider a full-report preflight; default is
  to avoid it because public examples indicate `topHolders[]` / wallet payload
  risk is high.

Do not treat this closeout as source approval, safe-summary capture readiness,
or holder-derived trading guidance.

## Alternative Holder Source Candidate Review

Reviewed public documentation only. No external API request, on-chain request,
production DB write, `holder:snapshot:add`, mapper implementation, schema
change, queue, scheduler, systemd, checkpoint update, `--write`, `--watch`, or
`pnpm smoke` was run.

Source docs reviewed:

- Birdeye `GET /holder/v1/distribution`: documented as holder distribution
  statistics with an `include_list` option that defaults to returning the
  holder list.
- Solscan Pro `GET /v1.0/token/holders`: documented as a token holders list
  endpoint with API-key authorization and pagination.
- DEX Screener public API reference: pair / token / profile endpoints are
  market and metadata focused; no holder concentration aggregate endpoint was
  found in the public reference reviewed here.
- GeckoTerminal / CoinGecko docs: GeckoTerminal public API is market / pool /
  liquidity focused, while CoinGecko Onchain Token Info docs show beta holder
  count and top-holder distribution percentage fields behind Pro API auth.
- Bubblemaps B2B docs: iFrame and Data API are available for holder / transfer
  / cluster data, but the reviewed public docs describe visualization / API
  product boundaries rather than a raw-free holder concentration aggregate
  contract.
- Existing manual operator review / external report only path in this repo.

Candidate comparison:

| Source candidate | Explicit `topHolderPct` | Explicit `top10HolderPct` | `holderCount` | Fresh / bundler / same-funding fields | Raw wallet list risk | Auth / terms risk | Shape-only preflight fit | Raw-free mapping feasibility | MVP suitability |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Birdeye holder distribution | not confirmed in docs reviewed | plausible but not confirmed; endpoint supports top holder distribution by supply percent | not confirmed from reviewed docs | not documented for this endpoint | medium: `include_list` defaults to `true`, so any future request must explicitly set `include_list=false` and stop if list fields appear | medium-high: API key required; 401 / 403 / 429 documented | possible only with explicit `include_list=false` and one-request shape-only output | unresolved; do not approve until response shape confirms aggregate-only percentages and no wallet list | possible next docs-first preflight candidate, not approved source |
| CoinGecko / GeckoTerminal Onchain Token Info | no single top holder field documented | yes: `holders.distribution_percentage.top_10` documented | yes: `holders.count` documented | no fresh / bundler / same-funding fields; GT score holder subscore is not a holder concentration field | low-medium for Token Info aggregate; separate Top Holders endpoint is raw wallet-address data and should be avoided | high: Pro API key required; holders data is beta with coverage / quality caveats | possible as one-token shape-only preflight with Pro key boundary approval | plausible for `top10HolderPct` / `holderCount` only if auth, beta-quality, and field semantics are approved; `topHolderPct` remains `null` | strongest aggregate candidate, but not approved because auth / beta / terms boundary needs a separate task |
| Solscan token holders | no | no | not confirmed as aggregate in reviewed endpoint | no | high: endpoint is holder-list oriented, max 50 records per request | high: API key required; 429 documented | poor for raw-free summary because it is a list endpoint | not suitable without client-side aggregation, which would require wallet-list handling | reject for current MVP safe-summary source |
| DEX Screener / current GeckoTerminal public API | no holder concentration aggregate found in reviewed API docs | no holder concentration aggregate found in reviewed API docs | no holder count aggregate found in reviewed API docs | no | low for documented market endpoints, but no needed holder fields | low-medium rate-limit risk on market endpoints; no useful holder source | not useful for holder distribution | not feasible for `HolderDistributionSafeSummary` holder fields | not a holder source |
| Bubblemaps public / B2B API | no raw-free aggregate field confirmed | no raw-free aggregate field confirmed | not confirmed | likely cluster / relationship context, not this safe summary | high for Data API: holders, transfers, clusters imply relationship / wallet graph payload | high: B2B product / commercial terms and API boundary need approval | poor until exact aggregate-only contract is documented | unresolved; do not use without explicit aggregate-only response contract | defer; avoid for MVP holder summary |
| Manual operator review | can be entered only when operator has raw-free aggregate evidence | can be entered only when operator has raw-free aggregate evidence | can be entered only when operator has raw-free aggregate evidence | can be entered as `unknown` unless explicitly reviewed | low if operator records only safe summary values and does not paste wallet lists | low internal process risk | already proven as manual safe-summary row path | feasible but low confidence if values remain `null` / `unknown` | continue as fallback |
| External report only continuation | only if report provides aggregate percentages without wallet list | only if report provides aggregate percentages without wallet list | only if report provides count without wallet list | usually unknown | medium: reports may include wallet lists or screenshots | medium: source provenance and reuse terms vary | possible as manual transcription of aggregate fields only | feasible only under manual review with raw-free citation / notes, not raw payload | continue as fallback, not automated source |

Recommended source decision:

- no approved real holder concentration source yet;
- keep `manual_holder_review` and external-report-only manual review as the
  current fallback paths;
- do not implement a real holder mapper from these candidates yet;
- do not use wallet-list endpoints that require client-side aggregation for
  this MVP;
- the next source preflight should target a source with explicit aggregate
  concentration fields, not a wallet-list endpoint;
- if a Red preflight is approved, prefer aggregate-first candidates:
  1. CoinGecko / GeckoTerminal Onchain Token Info, because docs show
     `holders.count` and `holders.distribution_percentage.top_10`, but only
     after Pro API auth / beta-quality / terms boundaries are approved.
  2. Birdeye holder distribution, only if the exact request can force
     `include_list=false` and shape-only output confirms aggregate fields
     without wallet-list payload.

Unresolved items:

- whether Birdeye's response can provide aggregate top-10 concentration without
  returning holder list fields;
- whether CoinGecko / GeckoTerminal holders beta data is acceptable for this
  repo's confidence / coverage boundary;
- whether paid API keys can be used without exposing request URLs, headers, or
  secret material;
- whether either source excludes LP / pool / CEX / treasury wallets in a way
  compatible with `lpWalletExcluded`;
- whether any source provides `topHolderPct`, `freshWalletCount`,
  `bundlerSignal`, or `sameFundingOriginSignal` as explicit aggregate fields.

Stop before any Red preflight if auth / terms / rate limits are unclear, more
than one request is needed, the response requires wallet-list persistence,
shape-only output cannot answer field presence, or the output begins to read
like buy / sell / position / exit guidance.

## CoinGecko / GeckoTerminal Onchain Token Info Boundary Review

Reviewed official CoinGecko / GeckoTerminal docs only. No CoinGecko API fetch,
external API request, on-chain request, production DB write,
`holder:snapshot:add`, mapper implementation, schema change, queue, scheduler,
systemd, checkpoint update, `--write`, `--watch`, or `pnpm smoke` was run.

Docs reviewed:

- CoinGecko Pro API authentication docs for Pro API key handling and onchain
  endpoint access;
- CoinGecko endpoint overview for GeckoTerminal-powered Onchain DEX endpoints;
- CoinGecko Onchain Token Info by Token Address docs;
- CoinGecko Top Token Holders by Token Address docs.

Endpoint candidate:

- `GET https://pro-api.coingecko.com/api/v3/onchain/networks/{network}/tokens/{address}/info`
- for the current Solana holder-source path, candidate network would be
  `solana` and `address` would be the token mint / contract address;
- exact target mint, network id, request command, and output shape still need a
  separate Red preflight approval.

Auth / beta / terms boundary:

- Pro API key is required for the Pro API root and Onchain DEX endpoints;
- docs recommend header auth with `x-cg-pro-api-key` and warn that query-string
  auth can expose the key;
- monthly credits and minute rate limits depend on the paid plan;
- each request counts toward minute rate limit, and successful requests deduct
  monthly credits;
- holder data is documented as beta, with ongoing data quality, coverage, and
  update-frequency improvements;
- supported holder chains include Solana, EVM networks, Sui, TON, and Ronin;
- cache / update frequency is documented as every 60 seconds;
- this repo must not add `.env` fields, print API keys, print request URLs with
  query auth, commit raw response bodies, or assume a paid-plan entitlement;
- because auth / paid-plan / beta-quality / account terms need operator
  approval, this endpoint is not an approved source yet.

Field semantics from docs:

- `holders.count` is documented in the Token Info response and can map to
  `holderCount` only after preflight confirms shape and numeric parsing;
- `holders.distribution_percentage.top_10` is documented and can map to
  `top10HolderPct` only after preflight confirms it is present for the target
  Solana token and can be parsed as a percent;
- docs describe `distribution_percentage` as calculated from total supply;
- docs state Solana coverage includes `top_10`, `11_20`, `21_40`, and `rest`;
- no explicit top-1 / top-holder equivalent was found in the Token Info docs;
- no fresh-wallet, bundler, or same-funding-origin aggregate fields were found;
- docs state distribution includes all wallet types, including CEX wallets,
  treasury / issuer wallets, and other wallet types, so
  `lpWalletExcluded` must remain `null` unless a later source-specific contract
  proves an exclusion rule;
- `gt_score` and `gt_score_details.holders` are risk / quality context and
  must not be mapped into holder concentration fields.

Raw payload boundary:

- Token Info sample shows aggregate holder fields, metadata, social URLs, and
  token / authority fields; it does not require holder wallet-list persistence
  for `holders.count` or `holders.distribution_percentage.top_10`;
- the separate Top Token Holders endpoint exists and returns holder addresses,
  ranks, amounts, percentages, values, and explorer URLs;
- Top Token Holders must be avoided for this MVP because it is a wallet-address
  payload endpoint and would reintroduce raw holder-list handling;
- any future preflight must use Token Info only, one request only, shape-only
  output, and no raw JSON dump.

Shape-only preflight possibility:

- possible as a future Red preflight only if the operator approves Pro API key
  use, exact target mint, network id, endpoint, rate-limit / credit boundary,
  and sanitized output fields;
- allowed output should be limited to HTTP status, top-level / shallow keys,
  presence of `holders.count` and `holders.distribution_percentage.top_10`,
  dangerous-key categories, primitive field shapes, and mapping feasibility;
- forbidden output includes raw response body, raw JSON, request URLs with
  query auth, headers, API keys, wallet addresses, explorer URLs, holder lists,
  metadata descriptions if they include unsafe free text, `.env`, screenshots,
  or secrets.

Mapping feasibility:

- `holderCount`: plausible from `holders.count`;
- `top10HolderPct`: plausible from `holders.distribution_percentage.top_10`;
- `topHolderPct`: keep `null` unless a separate explicit top-holder aggregate
  field is documented and preflight-confirmed;
- `freshWalletCount`: keep `null`;
- `bundlerSignal`: keep `unknown`;
- `sameFundingOriginSignal`: keep `unknown`;
- `lpWalletExcluded`: keep `null` because docs say distribution includes all
  wallet types and do not document LP / pool wallet exclusion;
- `confidence`: source confidence only, likely `low` or `unknown` while holder
  data remains beta;
- `rawFree` / `secretFree`: must remain literal `true` after mapper
  validation.

Source decision:

- CoinGecko / GeckoTerminal Onchain Token Info is the best next holder
  concentration preflight candidate found so far because docs expose aggregate
  `holderCount` and top-10 distribution fields;
- it is not an approved `HolderDistributionSafeSummary` source yet;
- do not implement a mapper yet;
- do not use Top Token Holders for this MVP;
- do not persist anything until a separate one-token, one-request, shape-only
  Red preflight confirms target-token field presence and raw-free boundaries.

Stop before Red preflight if Pro API key handling is not approved, paid-plan
terms / rate limits are unclear, the target network or address parameter is
unclear, Token Info cannot answer field presence without raw output, Top
Holders becomes necessary, wallet-list persistence is required, or output reads
like buy / sell / position / exit guidance.

## CoinGecko Token Info Preflight Plan

This is a docs-only plan for a possible future Red preflight. It does not
approve CoinGecko / GeckoTerminal as a `HolderDistributionSafeSummary` source,
does not run a CoinGecko API request, does not write production DB state, does
not run `holder:snapshot:add`, and does not implement a mapper.

Preflight candidate:

- endpoint:
  `GET https://pro-api.coingecko.com/api/v3/onchain/networks/{network}/tokens/{address}/info`;
- likely current params: `network=solana`, `address=<target mint>`;
- candidate target mint:
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`;
- before any Red preflight, re-approve the target mint, network id, exact
  endpoint, exact command, Pro API key boundary, and sanitized output shape.

API key / secret boundary:

- Pro API key is required;
- use header auth candidate `x-cg-pro-api-key`;
- avoid query-string auth because it puts the key in the request URL;
- do not print, paste, commit, screenshot, or log `.env`, API keys, auth
  headers, request URLs containing secrets, raw headers, or secret-like values;
- if the key is not available, stop before Red preflight;
- if paid-plan entitlement, credit consumption, minute rate limit, or terms are
  not approved, stop before Red preflight.

Red preflight scope:

- exactly one mint;
- exactly one request;
- Token Info endpoint only;
- no Top Token Holders endpoint;
- no retry;
- no batch;
- no raw response persistence;
- no production DB write;
- no `holder:snapshot:add`;
- no mapper implementation in the same task;
- no queue, scheduler, systemd, checkpoint update, `--write`, `--watch`, or
  `pnpm smoke`.

Allowed output:

- HTTP status;
- ok / parse status;
- top-level keys;
- shallow keys under `data`, `attributes`, `holders`, and
  `holders.distribution_percentage` if present;
- presence of `holders.count`;
- presence of `holders.distribution_percentage.top_10`;
- primitive type summary only;
- dangerous-key categories presence, without values;
- mapping feasibility.

Forbidden output:

- raw response body;
- raw JSON dump;
- raw provider JSON fixture;
- wallet addresses;
- explorer URLs;
- Top Token Holders response;
- request URL containing an API key;
- auth headers;
- API key;
- `.env`;
- screenshots containing secrets;
- free-form unsafe metadata text if it contains wallet-like data;
- any holder list, owner list, account list, or address-like value.

Mapping decision boundary:

- possible outcomes:
  `approved_for_mapper_fixture_only`, `needs_more_source_review`,
  `rejected_for_auth_or_terms_uncertainty`,
  `rejected_for_raw_payload_risk`, or `rejected_for_beta_data_quality`;
- after preflight, do not automatically persist holder data;
- after preflight, do not automatically implement a mapper;
- if later approved, map `holders.count` to `holderCount`;
- if later approved, map `holders.distribution_percentage.top_10` to
  `top10HolderPct`;
- keep `topHolderPct=null` unless an explicit top-holder aggregate field is
  documented and preflight-confirmed;
- keep `freshWalletCount=null`;
- keep `bundlerSignal="unknown"`;
- keep `sameFundingOriginSignal="unknown"`;
- keep `lpWalletExcluded=null`;
- set `confidence` as source confidence only, likely `low` or `unknown` while
  holder data is beta;
- final mapper output must keep `rawFree=true` and `secretFree=true`.

Stop conditions:

- Pro API key is unavailable or unapproved;
- paid-plan, credit, minute rate-limit, or terms boundary is unclear;
- target mint, network id, endpoint, or exact command is unclear;
- more than one request would be needed;
- Token Info cannot answer field presence with shape-only output;
- Top Token Holders endpoint becomes necessary;
- response inspection would require raw response body, raw JSON, wallet
  addresses, explorer URLs, auth headers, request URLs with secrets, `.env`, or
  screenshots;
- beta holder data quality is not acceptable for even a mapper fixture;
- output starts to read like buy / sell / position / exit guidance.

Post-preflight next steps:

- if `approved_for_mapper_fixture_only`, add a sanitized fixture shape that
  contains only the approved aggregate holder fields and no raw provider JSON;
- if `needs_more_source_review`, keep the source unresolved;
- if rejected for auth / terms / raw-payload / beta-quality risk, keep
  `manual_holder_review` and external-report-only review as the fallback paths.

## CoinGecko Preflight Operator Approval Checklist

This checklist must be completed before any CoinGecko Token Info Red preflight.
Completing the checklist approves at most one shape-only request; it does not
approve CoinGecko as a holder source, does not approve persistence, and does
not approve mapper implementation.

Required operator approvals:

- target mint approval:
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` or a replacement explicitly
  named in the Red task;
- network id approval: expected `solana`;
- endpoint approval:
  `GET /api/v3/onchain/networks/{network}/tokens/{address}/info`;
- exactly one request approval;
- Pro API key use approval;
- header auth approval with `x-cg-pro-api-key`;
- query-string auth prohibited;
- paid plan / credit consumption approval;
- minute rate-limit approval;
- beta holder data acceptance;
- CoinGecko account / terms usage acceptance;
- output sanitation approval: shape-only output, no raw body;
- no raw response persistence;
- no Top Token Holders endpoint;
- no production DB write;
- no `holder:snapshot:add`;
- no mapper implementation in the same task;
- no queue, scheduler, systemd, checkpoint update, `--write`, or `--watch`;
- no `pnpm smoke`.

Stop before execution if any item is not explicitly approved, if
`COINGECKO_PRO_API_KEY` is missing, or if approval requires printing `.env`,
API keys, auth headers, request URLs with secrets, raw response bodies, wallet
addresses, or other secret-like material.

Exact command sketch for the later Red task:

```bash
# Red task only. Do not run during docs-only planning.
# COINGECKO_PRO_API_KEY must already be available in the environment.
# Do not echo it. Do not pass it in the URL. Do not print headers.
node -e '<shape-only Token Info preflight script>'
```

Script requirements for the later Red task:

- read `process.env.COINGECKO_PRO_API_KEY`;
- fail closed before any request if the key is missing;
- call the Token Info endpoint exactly once for the approved network and mint;
- use only the `x-cg-pro-api-key` header for auth;
- never print the header, key, `.env`, request URL containing secrets, or raw
  response body;
- never write the response body to disk, `/tmp`, fixtures, screenshots, or git;
- parse JSON only in memory;
- print sanitized shape only: HTTP / parse status, top-level and shallow
  holder keys, presence of `holders.count`, presence of
  `holders.distribution_percentage.top_10`, primitive type summary, dangerous
  key categories, and mapping feasibility;
- stop if the Token Info response requires raw body inspection, Top Token
  Holders, a retry, batch request, persistence, or mapper implementation.

Forbidden shortcuts:

- Do not jump directly to scheduler, queue, or systemd.
- Do not run an unbounded on-chain holder crawl.
- Do not store raw provider JSON.
- Do not turn holder distribution into a buy signal.

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

`token:observation` should show holder distribution as `not_observed` until a
safe holder snapshot exists. Once a safe snapshot exists, it should show only
the persisted safe summary fields and keep any unknown-value review gaps
separate from trading guidance.

`tokens:observation-gaps` should continue to surface
`holder_distribution_not_recorded` and point to `holder_distribution_snapshot`
as a future capability. It should not suggest `token:observe` or
`community:review` as a way to fill this gap.

Community link review and manual narrative review remain separate capabilities.
Holder distribution is a risk-observation capability that must be designed and
verified independently before production capture.
