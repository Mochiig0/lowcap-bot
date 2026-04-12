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
