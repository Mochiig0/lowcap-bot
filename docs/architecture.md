# Architecture

## Overview

`lowcap-bot` is currently a CLI-first MVP centered on mint-driven accumulation.

The main operational paths are now split between:

- `pnpm import` for full manual import with optional notify
- `pnpm import:mint` for minimum mint-first accumulation
- `pnpm token:enrich` for filling current token fields after mint-only intake
- `pnpm token:rescore` for recomputing hard reject and score fields from current text
- `pnpm metric:add` for adding outcome observations after intake
- `pnpm token:compare` and `pnpm tokens:compare-report` for read-only comparison views

`pnpm import:min` is a thin wrapper around that flow for the common manual intake case with only `mint`, `name`, `symbol`, and a few optional descriptive fields.

`pnpm import:file` is another thin wrapper that reads one local JSON object and forwards supported fields into the same import flow.

This repository is not yet an always-on bot. It does not currently include automatic ingestion, a scheduler, workers, or a queue.

## Main Flows

### Import Flow

The main flow lives in `src/cli/import.ts` and runs in this order:

1. Parse CLI args
2. Build normalized text from token fields
3. Run hard reject checks
4. Run dictionary-based scoring
5. Upsert `Dev` and `Token`
6. Optionally create one `Metric`
7. Notify Telegram only when the token is `S` rank and not hard rejected

Current manual-operation note:

- optional metric number/date args on `pnpm import` still treat empty strings as `undefined` instead of usage errors

### Mint-Driven Accumulation Flow

The mint-driven accumulation path is intentionally staged:

1. `src/cli/importMint.ts`
2. `src/cli/tokenEnrich.ts`
3. `src/cli/tokenRescore.ts`
4. `src/cli/metricAdd.ts`
5. `src/cli/tokenCompare.ts` / `src/cli/tokensCompareReport.ts` for read-only inspection

Current intent:

- capture an early `entrySnapshot` as close to mint arrival as possible
- keep current token fields separate from that initial entry view
- add metrics later without forcing token mutation
- inspect both entry and outcome side by side before adding interpretation logic

### Mint-Only Intake Flow

`src/cli/importMint.ts` creates the minimum `Token` row for mint-first accumulation.

It:

- requires only `mint`
- optionally stores `source`
- sets `metadataStatus` to `mint_only`
- stores an initial `entrySnapshot`
- does not score, notify, or create metrics
- returns `created: false` on normal sequential re-runs for an existing mint
- can still hit a unique-constraint race on `mint` if the same mint is submitted concurrently

### Mint-Only Ingest Boundary

The mint-only ingest boundary is currently limited to `pnpm import:mint` and `pnpm import:mint:file`.

Within that boundary:

- `pnpm import:mint` owns the minimum mint-only token base creation
- `pnpm import:mint:file` owns file read, JSON validation, sequential iteration, and delegation into `pnpm import:mint`
- the accepted ingest payload is still intentionally narrow: `mint` plus optional `source`

Outside that boundary:

- future detector or source-adapter code should only discover or normalize mint-first intake candidates, then hand off into `import:mint` or `import:mint:file`
- detector or adapter code should not take over scoring, notify, metric creation, enrich, or rescore responsibilities
- detector or adapter code should not introduce worker, scheduler, or queue behavior at this stage

Boundary rules:

- keep semi-automatic mint intake separate from read-only CLI responsibilities such as `token:compare`, `tokens:compare-report`, and `metrics:report`
- keep Telegram notify on the full `pnpm import` path only
- keep detect-to-mint-only handoff narrow: produce mint-first inputs, then delegate into the existing mint-only entrypoints
- avoid mixing review/report logic into ingest wrappers, and avoid mixing ingest-side mutation into read-only inspection CLIs

Minimal handoff payload:

- the current minimum detector-to-ingest payload candidate is `mint` plus optional `source`
- ingest should only require the minimum information needed to create the mint-only token base
- do not put score fields, notify-related fields, enriched metadata, metric fields, or review status into this handoff payload

Payload shape split:

- `import:mint` accepts CLI args for one mint-only intake: `mint` plus optional `source`
- `import:mint:file` accepts one file-backed wrapper shape: `{ "items": [{ "mint": "...", "source"?: "..." }] }`
- future detector or source-adapter code does not need to own the file wrapper shape itself; it only needs to produce the same minimum mint-first payload before handoff
- `examples/detect-mint-handoff.sample.json` is only a concrete sample of that minimum handoff contract, not a runtime API or a replacement for the `import:mint:file` wrapper shape
- `examples/source-event-to-mint-handoff.sample.json` is a source-side mapping example: the raw source event is adapter input, while the minimal handoff payload is the separate ingest contract
- `pnpm import:mint:source-file` is one source-specific adapter wrapper outside the ingest boundary; it normalizes one raw event object before delegating into `import:mint`

Detect-to-mint-only handoff principles:

- hand off only the minimum stable identifier and optional source attribution
- keep payload semantics independent from scoring, review, and notification decisions
- prefer extending downstream stages such as enrich, rescore, metric, or read-only review instead of widening the ingest payload too early

Current batch error-handling policy:

- `import:mint:file` should currently be treated as sequential and fail-fast
- duplicate mints in one batch are not rejected up front; they are processed in order, so later duplicates normally surface as `created: false`
- re-running the same batch should currently be expected to shift results toward `existingCount` rather than produce a special rerun mode
- success output is only the current summary shape: `{ file, count, createdCount, existingCount, items }`
- there is no `failedCount` or partial-success summary contract today
- validation errors or child import failures currently end the run with a non-zero exit before any final batch summary is emitted

Current expectations for future detector or source-adapter code:

- treat the current handoff as "submit minimum mint-first inputs and observe process success or failure", not as a resumable batch job API
- do not assume retry, resume, queueing, worker recovery, or per-item failure accounting at this boundary yet
- keep retry or resume policy outside the current mint-only ingest boundary until that behavior is explicitly designed

Detector / source-adapter responsibility memo:

- detector responsibility: identify mint-first intake candidates early and decide what should be handed off for mint-only accumulation
- source-adapter responsibility: normalize source-specific input into the minimum handoff payload shape expected by the mint-only ingest boundary
- mint-only ingest responsibility: accept the minimum mint-first payload, create the mint-only token base, and return the current batch or single-item result

Keep out of detector or adapter scope for now:

- scoring or hard-reject decisions
- Telegram notify behavior
- enrich or rescore behavior
- metric creation or outcome tracking
- review, comparison, or report concerns

Minimal connection image:

- detector finds a candidate
- source adapter normalizes it to `mint` plus optional `source`
- ingest hands that payload into `import:mint` or into the file-backed `import:mint:file` wrapper shape when batching is needed

Not a runtime commitment today:

- no detector runtime loop
- no adapter worker process
- no scheduler, queue, or background orchestration

Source-adapter operating rules:

- add source adapters one source at a time, with one source-specific raw event shape per adapter
- do not rush into a generic or multi-source adapter runtime while only one source-specific adapter exists
- keep source-specific parse and mapping logic inside the adapter, not inside `import:mint` or `import:mint:file`
- keep database writes centered on delegation into `import:mint` rather than adapter-owned write logic
- do not broaden `import:mint:file` beyond the current minimal handoff payload wrapper shape
- do not add scoring, notify, enrich, rescore, or metric creation behavior to source adapters
- do not add pre-dedupe, parallel ingest, queueing, or worker-style runtime behavior before a clear operational need exists

Before adding another source adapter, confirm that:

- the source has a stable mint-first signal that can still normalize into `mint` plus optional `source`
- the source really has a distinct raw event shape rather than just another file wrapper around the same handoff payload
- there is a repeated manual need to ingest that source shape directly, not just a one-off local conversion
- the adapter can stay thinner than the full `pnpm import` path and delegate token creation into `import:mint`
- the adapter can still be kept as one source, one shape, and one thin wrapper
- the required behavior does not actually belong in read-only review/report flows, enrich/rescore stages, or future detector runtime design

Do not add a second source adapter yet when:

- the request is really pushing toward generic or multi-source adapter behavior
- the request starts mixing detector loop, queue, worker, or scheduler concerns into the adapter
- the request wants pre-dedupe, parallel ingest, retry orchestration, or resumable runtime behavior
- the request really wants the richer scoring, notify, metric, or full-import path instead of mint-only normalization

Route requests away from a new adapter when they are really asking for:

- detector runtime or polling logic
- queue, worker, retry, or resume behavior
- read-only review, comparison, or reporting improvements
- enrich, rescore, metric, or notify expansion after mint-only intake

### Enrich Flow

`src/cli/tokenEnrich.ts` updates the current token fields after mint-only intake.

It:

- fills `name`, `symbol`, and optional `description`
- rebuilds `normalizedText`
- updates `metadataStatus` to `partial` or `enriched`
- does not rescore automatically

### Rescore Flow

`src/cli/tokenRescore.ts` recomputes token evaluation from current fields.

It:

- requires an existing token with `name` and `symbol`
- rebuilds normalized text
- reruns hard reject checks and score calculation
- stores updated score fields on `Token`

### Metric Append Flow

`src/cli/metricAdd.ts` appends one metric observation for an existing token.

It:

- requires `mint`
- requires at least one metric value
- creates one new `Metric` row
- is append-only, so repeated submissions with the same values still create new rows
- does not mutate `Token` score fields

### Minimal Intake Flow

`src/cli/importMin.ts` is a thin wrapper for manual intake.

It:

- accepts only the common minimum fields
- parses `mint`, `name`, `symbol`, and optional `source`, `desc`, and `dev`
- forwards them into `src/cli/import.ts`
- reuses the existing scoring, persistence, and notification flow
- does not add new schema, ingestion, or automation behavior

### File Intake Flow

`src/cli/importFile.ts` is a thin wrapper for one-file manual intake.

It:

- reads one local JSON object from `--file`
- validates the supported `import` fields
- handles file-read and JSON-shape validation before delegation
- forwards them into `src/cli/import.ts`
- does not fetch external data or introduce scheduler behavior

### Trend Update Flow

`src/cli/updateTrend.ts` updates `data/trend.json` for manual trend refresh.

It:

- accepts comma-separated keywords
- removes empty values and duplicates
- updates `generatedAt`
- optionally updates `ttlHours`
- preserves the JSON shape expected by the scoring layer

### Metrics Report Flow

`src/cli/metricsReport.ts` is a read-only CLI for inspecting saved `Metric` rows.

It:

- reads recent metrics from SQLite
- optionally filters by token mint
- returns JSON with token metadata and metric fields

### Comparison Flows

`src/cli/tokenCompare.ts` is the single-token deep view.

It returns:

- `entrySnapshot`
- current token fields
- `latestMetric`
- up to 3 `recentMetrics`

`src/cli/tokensCompareReport.ts` is the multi-token comparison view.

It returns:

- one row per token
- `entryScoreRank` from `entrySnapshot` when present
- current score fields from `Token`
- latest metric summary fields from the newest `Metric`
- no automatic comments or judgments

These comparison/report CLIs remain read-only and do not send Telegram notifications.

### Smoke Flow

`src/cli/smokeTest.ts` is a lightweight operational check, not a full test suite.

It checks:

- TypeScript typecheck
- basic import
- minimal wrapper import
- file wrapper import
- import with metric persistence
- `token:show`
- `token:compare`
- `tokens:compare-report`
- `metric:show`
- trend update
- metrics report

It also restores `data/trend.json` after the run and cleans up smoke-prefixed data from the local database.

## Components

### CLI Layer

- `src/cli/import.ts`
  - main operational entrypoint
  - token import, scoring, persistence, conditional notify
- `src/cli/importMin.ts`
  - thin manual-intake wrapper over `src/cli/import.ts`
- `src/cli/importFile.ts`
  - thin one-file intake wrapper over `src/cli/import.ts`
- `src/cli/updateTrend.ts`
  - manual refresh for `data/trend.json`
- `src/cli/tokenShow.ts`
  - read-only token inspection with latest metric summary
- `src/cli/tokenCompare.ts`
  - read-only single-token comparison view
- `src/cli/tokensReport.ts`
  - read-only token inspection with basic filters
- `src/cli/tokensCompareReport.ts`
  - read-only multi-token comparison view
- `src/cli/metricShow.ts`
  - read-only metric inspection for one row
- `src/cli/metricsReport.ts`
  - read-only metric inspection
- `src/cli/smokeTest.ts`
  - lightweight operational verification

### Scoring Layer

- `src/scoring/normalize.ts`
  - text normalization for `name`, `symbol`, and `description`
- `src/scoring/hardReject.ts`
  - fixed phrase reject checks
- `src/scoring/score.ts`
  - weighted keyword scoring
  - learned pattern scoring
  - combo boosts
  - trend scoring with a cap
  - prevents trend-only `S` rank
- `src/scoring/dictionaries.ts`
  - loads dictionary JSON files from `data/`
  - checks whether trend data is still fresh

### Notification

- `src/notify/telegram.ts`
  - sends Telegram messages through the Bot API
  - skips notification when Telegram environment variables are missing

### Shared Runtime

- `src/cli/db.ts`
  - shared `PrismaClient` for CLI entrypoints
- `src/index.ts`
  - CLI help hub
  - not a router and not the runtime entrypoint for the import flow

### Persistence and File-backed Inputs

- `prisma/schema.prisma`
  - Prisma models and SQLite datasource
- `data/core.json`
  - core scoring keywords
- `data/learned.json`
  - learned keywords and regex patterns
- `data/trend.json`
  - trend keywords with `generatedAt` and `ttlHours`

## Data Model

### Schema Growth Guardrails

Until a real runtime needs them, avoid expanding the Prisma schema for detector-, review-, or alert-oriented concepts too early.

Do not add new schema fields yet for things like:

- review status or review notes
- extra alert-tracking fields beyond the current metric fields
- source trace or detector-specific metadata
- expanded scam flag / scam score columns beyond the current hard-reject and score fields
- extra helper columns that only support manual observation or review workflow

Why not now:

- the current mint-only ingest boundary is intentionally narrow
- detector, scheduler, queue, and worker runtime behavior does not exist yet
- read-only comparison/report flows should stay separate from ingest and schema growth
- adding columns before a stable runtime need exists would harden concepts that are still operationally unclear

What to use instead for now:

- docs for boundary and operational rules
- source-side payloads or local files for pre-ingest context
- temporary operational notes when the information is only for manual review
- later runtime design review when a field becomes necessary for persistence, querying, or handoff contracts

If one future addition becomes necessary first, the most natural candidate is a narrowly scoped ingest-provenance field only after source attribution needs to be queried or replayed reliably across runs.

Schema-change gate:

- add a new field only if the value must survive process boundaries, must be queried repeatedly, and cannot be kept cleaner in docs, payloads, or downstream runtime design
- avoid adding fields that mix ingest, review, scoring, and notification concerns into the same model too early

### Dev

`Dev` stores a developer wallet and links it to imported tokens.

Current use:

- optional relation from imported tokens to a developer wallet

### Token

`Token` stores the main imported candidate record.

Current use:

- token identity
- initial `entrySnapshot`
- current token metadata state via `metadataStatus`
- source and grouping metadata
- normalized text
- hard reject result
- total score, rank, and score breakdown
- optional relation to `Dev`

### Metric

`Metric` stores observed values for a token at a point in time.

Current use:

- optional metric persistence during import
- manual metric accumulation after mint-only intake
- read-only inspection through `pnpm metrics:report`
- latest-outcome lookup for comparison views

It is intentionally created as separate rows so multiple observations can exist for the same token.

## Snapshot Relationship

The current comparison model uses three layers:

1. `entrySnapshot`
   stores how the token looked at the first mint-driven capture
2. current `Token` fields
   store the latest manually enriched and rescored state
3. latest `Metric`
   stores the newest observed outcome row for that token

This is why:

- `token:compare` can show "entry vs now vs latest metric" for one mint
- `tokens:compare-report` can compare many tokens with a compact summary row
- no automatic interpretation is required yet to inspect outcomes

## Runtime Inputs and Dependencies

### Environment Variables

- `DATABASE_URL`
  - required for Prisma / SQLite access
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
  - used only for Telegram notification
  - if either is missing, notification is skipped

### Trend Freshness

Trend scoring depends on a fresh `data/trend.json`.

The scoring layer checks:

- `generatedAt`
- `ttlHours`

If trend data is stale, trend keyword scoring is effectively disabled for that run.

## Current Constraints

- no automatic ingestion
- no scheduler, worker, or queue
- no review UI or operational UI
- no full test framework
- `src/index.ts` is a help hub, not a runtime entrypoint
- the current operational center is split between `pnpm import` and the mint-driven accumulation CLIs
