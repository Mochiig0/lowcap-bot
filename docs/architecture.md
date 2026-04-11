# Architecture

## Overview

`lowcap-bot` is currently a CLI-first MVP.

The main operational path is `pnpm import`, which takes one token candidate, runs the current scoring pipeline, stores results in SQLite through Prisma, and optionally sends a Telegram notification.

`pnpm import:min` is a thin wrapper around that flow for the common manual intake case with only `mint`, `name`, `symbol`, and a few optional descriptive fields.

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

### Minimal Intake Flow

`src/cli/importMin.ts` is a thin wrapper for manual intake.

It:

- accepts only the common minimum fields
- forwards them into `src/cli/import.ts`
- reuses the existing scoring, persistence, and notification flow
- does not add new schema, ingestion, or automation behavior

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

### Smoke Flow

`src/cli/smokeTest.ts` is a lightweight operational check, not a full test suite.

It checks:

- TypeScript typecheck
- basic import
- minimal wrapper import
- import with metric persistence
- `token:show`
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
- `src/cli/updateTrend.ts`
  - manual refresh for `data/trend.json`
- `src/cli/tokenShow.ts`
  - read-only token inspection with latest metric summary
- `src/cli/tokensReport.ts`
  - read-only token inspection with basic filters
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

- `src/db.ts`
  - shared `PrismaClient`
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
- source and grouping metadata
- normalized text
- hard reject result
- total score, rank, and score breakdown
- optional relation to `Dev`

### Metric

`Metric` stores observed values for a token at a point in time.

Current use:

- optional metric persistence during import
- read-only inspection through `pnpm metrics:report`

It is intentionally created as separate rows so multiple observations can exist for the same token.

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
- the current operational center is still `pnpm import`
