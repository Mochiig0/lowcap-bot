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
