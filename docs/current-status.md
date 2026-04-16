# Current Status

## Summary

This repository is an MVP for mint-driven token accumulation, enrichment, rescoring, metric capture, and read-only comparison views backed by SQLite via Prisma. Telegram notification still exists only on the full `pnpm import` path when a token reaches `S` rank without hitting hard reject rules.

`src/index.ts` is the CLI help hub. The current CLI set is:

```bash
pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM> [--desc ...] [--dev ...] [--groupKey ...] [--groupNote ...] [--source ...] [--maxMultiple15m ...] [--peakFdv24h ...] [--volume24h ...] [--peakFdv7d ...] [--volume7d ...] [--metricSource ...] [--observedAt ...]
```

```bash
pnpm import:mint -- --mint <MINT> [--source <SOURCE>]
```

```bash
pnpm import:mint:file -- --file <PATH>
```

```bash
pnpm import:mint:source-file -- --file <PATH>
```

```bash
pnpm token:enrich -- --mint <MINT> --name <NAME> --symbol <SYMBOL> [--desc <TEXT>] [--source <SOURCE>]
```

```bash
pnpm token:rescore -- --mint <MINT>
```

```bash
pnpm metric:add -- --mint <MINT> [--source <SOURCE>] [--launchPrice <NUM>] [--peakPrice15m <NUM>] [--peakPrice1h <NUM>] [--maxMultiple15m <NUM>] [--maxMultiple1h <NUM>] [--peakFdv24h <NUM>] [--volume24h <NUM>] [--timeToPeakMinutes <NUM>]
```

```bash
pnpm import:min -- --mint <MINT> --name <NAME> --symbol <SYM> [--source <SOURCE>] [--desc <TEXT>] [--dev <WALLET>]
```

```bash
pnpm import:file -- --file <PATH>
```

```bash
pnpm trend:update -- --keywords "ai,anime,base" [--ttlHours 24]
```

```bash
pnpm token:show -- --mint <MINT>
```

```bash
pnpm token:compare -- --mint <MINT>
```

```bash
pnpm tokens:report -- [--rank <RANK>] [--source <SOURCE>] [--metadataStatus <STATUS>] [--hasMetrics <true|false>] [--hardRejected <true|false>] [--createdAfter <ISO8601>] [--limit 20]
```

```bash
pnpm tokens:compare-report -- [--rank <RANK>] [--source <SOURCE>] [--metadataStatus <STATUS>] [--limit 20]
```

```bash
pnpm metric:show -- --id <ID>
```

```bash
pnpm metrics:report -- [--mint <MINT>] [--tokenId <ID>] [--source <SOURCE>] [--rank <RANK>] [--limit 20]
```

A minimal smoke-test path is also available:

```bash
pnpm smoke
```

There is no always-on bot, scheduler, queue worker, or automatic ingestion yet.

## Current Operational Flow

### Mint-Driven Accumulation MVP

1. Start with `pnpm import:mint` to create the minimum token base and initial `entrySnapshot`.
2. Use `pnpm import:mint:file` when mint-only intake already exists as one local JSON object with an `items` array.
3. Use `pnpm import:mint:source-file` when one source-specific raw event file needs to be normalized into the same mint-only boundary.
4. Use `pnpm token:enrich` to fill current token fields after mint-only intake.
5. Use `pnpm token:rescore` to recompute current hard reject and score fields from the current text.
6. Use `pnpm metric:add` to append later outcome observations without mutating token score fields.

### Full Import Path

- `pnpm import` remains the full manual import path and owns scoring, persistence, optional metric persistence, and conditional Telegram notify.
- `pnpm import:min` is a thin wrapper for the common minimum manual intake case and delegates into `pnpm import`.
- `pnpm import:file` is a thin wrapper for one local JSON object and delegates supported fields into `pnpm import`.

### Read-Only CLI Positioning

- `pnpm token:compare` is the single-token read-only comparison view.
- `pnpm tokens:compare-report` is the multi-token read-only comparison view.
- `pnpm metrics:report` is the read-only metric inspection view.

### Current Operational Constraints

- `import:mint` is safe for normal sequential re-runs and returns `created: false` for an existing mint, but concurrent re-runs can still race on the unique `mint` constraint.
- `metric:add` is append-only, so repeated submissions with the same values still create new `Metric` rows.
- Comparison and report CLIs are read-only and do not send Telegram notifications.

## Implemented

- Prisma + SQLite persistence
- `Dev`, `Token`, and `Metric` models in the schema
- CLI import flow in `src/cli/import.ts`
- Mint-only accumulation CLI in `src/cli/importMint.ts`
- Mint-only batch file wrapper CLI in `src/cli/importMintFile.ts`
- Source-specific mint-only adapter CLI in `src/cli/importMintSourceFile.ts`
- Token enrichment CLI in `src/cli/tokenEnrich.ts`
- Token rescore CLI in `src/cli/tokenRescore.ts`
- Manual metric append CLI in `src/cli/metricAdd.ts`
- Minimal import wrapper CLI in `src/cli/importMin.ts`
- File import wrapper CLI in `src/cli/importFile.ts`
- Manual trend update CLI in `src/cli/updateTrend.ts`
- Token detail CLI in `src/cli/tokenShow.ts`
- Token comparison CLI in `src/cli/tokenCompare.ts`
- Token report CLI in `src/cli/tokensReport.ts`
- Token comparison report CLI in `src/cli/tokensCompareReport.ts`
- Metric detail CLI in `src/cli/metricShow.ts`
- Manual metric report CLI in `src/cli/metricsReport.ts`
- Manual smoke-test CLI in `src/cli/smokeTest.ts`
- Pure-function tests in `tests/scoring.test.ts`, `tests/score.test.ts`, and `tests/updateTrend.test.ts`
- Optional metric persistence from the import CLI
- Mint-only token creation with `entrySnapshot`
- Metadata-stage transitions through `mint_only`, `partial`, and `enriched`
- Manual rescoring from current token fields
- Manual metric persistence after mint-driven accumulation
- Text normalization for `name`, `symbol`, and `description`
- Hard reject matching for obvious scam/rug phrases
- Dictionary-based scoring from:
  - core keywords
  - learned keywords
  - learned regex patterns
  - trend keywords
  - combo boosts
- Rank assignment: `S`, `A`, `B`, `C`
- `Token` upsert by `mint`
- `Dev` upsert by `wallet`
- `Metric` create when one or more metric args are provided
- `import:mint` creates a minimum `Token` row and initial `entrySnapshot`
- `import:mint` returns `created: false` on normal sequential re-runs for an existing mint
- `import:mint` can still hit a unique-constraint race on `mint` under concurrent re-runs
- `import:mint:file` reads one JSON object with an `items` array and delegates each item sequentially to `import:mint`
- `import:mint:file` expects `{ "items": [ { "mint": "...", "source"?: "..." } ] }`
- `import:mint:file` success output is `{ file, count, createdCount, existingCount, items }`
- `import:mint:file` processes duplicate mints in one file sequentially, so later duplicates normally return `created: false`
- re-running the same `import:mint:file` payload returns `existingCount` for already imported mints
- `import:mint:file` does not return `failedCount` today; validation errors or child import failures exit non-zero before a final summary
- `import:mint:source-file` reads one source-specific raw event object, normalizes it to `{ mint, source? }`, and delegates the result to `import:mint`
- `import:mint:source-file` expects `source`, `eventType`, `detectedAt`, and `payload.mintAddress`
- `import:mint:source-file` returns `{ file, sourceEvent, handoffPayload, result }`
- re-running the same `import:mint:source-file` payload currently mirrors `import:mint`, so `result.created` returns `false` for an already imported mint
- `import:mint:source-file` exits non-zero on source-event shape validation errors or child import failures
- `import:mint:source-file` keeps source-specific parse and mapping outside the `import:mint` / `import:mint:file` ingest boundary
- `token:enrich` updates current token fields without rescoring
- `token:rescore` recomputes current hard reject and score fields
- `metric:add` appends one metric row without mutating token fields
- `metric:add` is append-only; repeated submissions with the same values still create new `Metric` rows
- `import:min` forwards the minimum manual intake fields into `import`
- `import:min` parses `mint`, `name`, `symbol`, and optional `source`, `desc`, `dev`, then delegates to `src/cli/import.ts`
- `import:file` reads one JSON object and forwards supported fields into `import`
- `import:file` parses `--file`, reads and validates one JSON object, then delegates the supported fields to `src/cli/import.ts`
- `import:file` expects exactly one JSON object with required `mint`, `name`, and `symbol`
- `import:file` also accepts optional `desc`, `dev`, `groupKey`, `groupNote`, `source`, `maxMultiple15m`, `peakFdv24h`, `volume24h`, `peakFdv7d`, `volume7d`, `metricSource`, and `observedAt`
- `token:show` returns `metadataStatus`, `hasCurrentText`, `latestMetric`, and `metricsCount`
- `token:compare` returns `entrySnapshot`, current token fields, `metricsCount`, `hasMetrics`, `entryVsCurrentChanged`, `changedFields`, `latestMetric`, and `recentMetrics`
- `tokens:report` supports `rank`, `source`, `metadataStatus`, `hasMetrics`, `hardRejected`, and `createdAfter` filters
- `tokens:report` returns `metadataStatus`, `latestMetricObservedAt`, `metricsCount`, and `updatedAt`
- `tokens:compare-report` supports `rank`, `source`, `metadataStatus`, and `limit`
- `tokens:compare-report` supports `hardRejected` for current-token reject-state filtering
- `tokens:compare-report` supports `hasMetrics` and `minMetricsCount` for observation-count filtering
- `tokens:compare-report` supports `entryVsCurrentChanged` for entry-vs-current change filtering
- `tokens:compare-report` supports `changedField` for single-field change filtering
- `tokens:compare-report` supports `minChangedFieldsCount` for minimum entry-vs-current change-count filtering
- `tokens:compare-report` supports `minEntryScoreTotal` and `minCurrentScoreTotal` for score-threshold filtering
- `tokens:compare-report` supports `entryScoreRank` and `currentScoreRank` for exact rank filtering
- `tokens:compare-report` supports `sortBy` and `sortOrder` for `entryScoreTotal`, `currentScoreTotal`, `changedFieldsCount`, `metricsCount`, `latestPeakFdv24h`, `latestMaxMultiple15m`, and `latestTimeToPeakMinutes`
- `tokens:compare-report` returns entry-vs-outcome summary rows across multiple tokens, including `entryScoreTotal`, `entryVsCurrentChanged`, `changedFields`, `changedFieldsCount`, and `metricsCount`
- `metrics:report` supports `mint`, `tokenId`, `source`, `rank`, `hasPeakFdv24h`, `hasPeakFdv7d`, `hasMaxMultiple15m`, `hasTimeToPeakMinutes`, `hasVolume24h`, `hasVolume7d`, `hasPeakPrice15m`, `sortBy`, and `sortOrder`; sortable fields include `observedAt`, `peakFdv24h`, `peakFdv7d`, `maxMultiple15m`, `volume7d`, and `timeToPeakMinutes`; items include `peakPrice15m`; `null` sort targets are placed last
- Telegram notification for `S` rank tokens that are not hard rejected

## Partially Implemented

- `groupKey` and `groupNote` are stored on `Token`, but no grouping logic uses them yet
- Trend scoring exists, but depends on fresh `data/trend.json`
- Trend data refresh is manual, not automatic

## Not Implemented

- Automatic import from external sources
- Background processing or scheduled jobs
- Full test framework
- Migrations directory and versioned DB history
- Operational docs and runbooks
- Telegram command handling or inbound bot features

## Current Constraints

- Input is manual and one-token-at-a-time through CLI args
- Scoring is entirely rule-based and file-backed
- Trend scoring is currently ineffective unless `data/trend.json` is refreshed
- Metrics are only stored when optional metric args are supplied manually
- In `pnpm import`, optional metric number/date args still treat empty strings as `undefined` instead of usage errors
- Trend updates must be triggered manually through the CLI
- CLI output is JSON-first and intended for manual inspection, not a long-running app runtime
- Comparison views are read-only summaries and do not include automatic interpretation
- Comparison and report CLIs are read-only and do not send Telegram notifications

## Import Example

Basic import:

```bash
pnpm import -- --mint TESTMINT --name "basic token" --symbol BTK
```

Mint-only accumulation:

```bash
pnpm import:mint -- --mint TESTMINT --source manual
```

Mint-only batch file intake:

```bash
pnpm import:mint:file -- --file ./tmp/mint-batch.json
```

Enrich current token fields:

```bash
pnpm token:enrich -- --mint TESTMINT --name "basic token" --symbol BTK --desc "manual enrich"
```

Rescore from current token fields:

```bash
pnpm token:rescore -- --mint TESTMINT
```

Append one metric after import:

```bash
pnpm metric:add -- --mint TESTMINT --peakFdv24h 180000 --volume24h 42000
```

Minimal intake import:

```bash
pnpm import:min -- --mint TESTMINT --name "basic token" --symbol BTK --source manual
```

File intake import:

```bash
pnpm import:file -- --file ./tmp/token.json
```

Import with metrics:

```bash
pnpm import -- --mint TESTMINT --name "metric token" --symbol MTK --maxMultiple15m 2.4 --peakFdv24h 180000 --volume24h 42000 --metricSource manual
```

Trend update:

```bash
pnpm trend:update -- --keywords "ai,anime,base" --ttlHours 24
```

Token show:

```bash
pnpm token:show -- --mint TESTMINT
```

Token compare:

```bash
pnpm token:compare -- --mint TESTMINT
```

Token report with filters:

```bash
pnpm tokens:report -- --rank S --source manual --hardRejected false --limit 10
```

Token compare report with filters:

```bash
pnpm tokens:compare-report -- --metadataStatus enriched --limit 10
```

Metric show:

```bash
pnpm metric:show -- --id 1
```

Metrics report with filters:

```bash
pnpm metrics:report -- --tokenId 1 --source manual --rank B --limit 10
```

Smoke test:

```bash
pnpm smoke
```

Notes:

- `generatedAt` is always set to the current time when the file is updated
- `ttlHours` keeps the current value unless explicitly provided
- this command is for manual refresh only and does not schedule updates
- `import:min` is a thin wrapper for the common manual intake path and does not replace full `import` args
- `import:file` is a thin wrapper for one local JSON object and does not introduce automatic ingestion
- `import:mint:file` is a thin wrapper for one local JSON object with an `items` array and does not add scoring, notify, or metric behavior
- `import:mint:source-file` is a source-specific raw-event adapter and does not add scoring, notify, or metric behavior
- `token:show` includes `metadataStatus` plus the latest metric summary when one exists
- `tokens:report` includes `latestMetricObservedAt` and `metricsCount`
- report and show commands are read-only and return JSON
- smoke runs a lightweight operational check for typecheck, `import`, sequential `import:mint` re-run behavior, `import:mint:file`, `import:mint:source-file`, `import:min`, `import:file`, metric save, `metric:add` append-only behavior, `token:show`, `token:compare`, `tokens:compare-report`, `metric:show`, trend update, and metric report
- `pnpm test` runs the current pure-function tests for normalization, hard reject matching, score calculation, and trend keyword parsing
- smoke restores `data/trend.json` after the run and cleans up its temporary smoke data

## Repository State

- Branch: `master`
- Untracked at the time of inspection: `.codex`
- Recent commits show the repo is still at MVP scaffold stage
