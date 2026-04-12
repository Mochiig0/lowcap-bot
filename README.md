# lowcap-bot

CLI-first MVP for researching Solana low-cap meme coin launches.

The current focus is manual operation: import a token candidate, score its narrative text, reject obvious scam phrases, optionally store observed metrics, refresh trend keywords, and inspect stored data. This repo is not yet an always-on bot or automatic ingestion system.

## What It Can Do Now

- Manually import a token candidate with `pnpm import`
- Create a mint-only token record with `pnpm import:mint`
- Create multiple mint-only token records from one JSON file with `pnpm import:mint:file`
- Create one mint-only token record from one source-specific raw event file with `pnpm import:mint:source-file`
- Enrich a mint-only token record with `pnpm token:enrich`
- Rescore one token from current fields with `pnpm token:rescore`
- Append one metric row with `pnpm metric:add`
- Manually intake a token candidate with the thin `pnpm import:min` wrapper
- Manually intake one JSON object from a file with `pnpm import:file`
- Normalize text and run hard reject checks
- Score text with dictionary-based scoring
- Save `Token` and optional `Dev` records in SQLite via Prisma
- Optionally save one `Metric` row during import
- Notify Telegram only when a token is `S` rank and not hard rejected
- Manually refresh `data/trend.json` with `pnpm trend:update`
- Inspect one saved token with `pnpm token:show`
- Compare one token's entry snapshot, current fields, and metrics with `pnpm token:compare`
- Inspect saved tokens with `pnpm tokens:report`
- Compare saved tokens side by side with `pnpm tokens:compare-report`
- Inspect one saved metric with `pnpm metric:show`
- Inspect saved metrics with `pnpm metrics:report`
- Run a lightweight operational check with `pnpm smoke`

## What It Cannot Do Yet

- Always-on bot runtime
- Scheduler / worker / queue
- Automatic launch detection or automatic ingestion
- Full test framework
- Review UI or broader operational UI

## Setup

Requirements:

- WSL2 Ubuntu
- Node.js 22+
- pnpm

Install dependencies:

```bash
pnpm install
```

Create `.env` from the example:

```bash
cp .env.example .env
```

Prepare the local SQLite database:

```bash
pnpm db:push
```

Optional: inspect the database in Prisma Studio:

```bash
pnpm db:studio
```

## Environment Variables

Example values from `.env.example`:

```bash
DATABASE_URL="file:./dev.db"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""
```

Notes:

- `DATABASE_URL` is required
- Telegram variables are optional for local use
- if Telegram variables are missing, notification is skipped

## Main Commands

Show the CLI help hub:

```bash
pnpm dev
```

Import one token candidate:

```bash
pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM>
```

Create one mint-only token record:

```bash
pnpm import:mint -- --mint <MINT> --source manual
```

Create multiple mint-only token records from one JSON file:

```bash
pnpm import:mint:file -- --file ./examples/import-mint-file.sample.json
```

Sample payload: `examples/import-mint-file.sample.json`

Create one mint-only token record from one source-specific raw event file:

```bash
pnpm import:mint:source-file -- --file ./examples/import-mint-source-file.sample.json
```

Sample payload: `examples/import-mint-source-file.sample.json`

Enrich one existing token record:

```bash
pnpm token:enrich -- --mint <MINT> --name <NAME> --symbol <SYMBOL> --desc "manual enrich"
```

Rescore one existing token from current fields:

```bash
pnpm token:rescore -- --mint <MINT>
```

Append one metric row for an existing token:

```bash
pnpm metric:add -- --mint <MINT> --peakFdv24h 180000 --volume24h 42000
```

Import one token candidate with the minimal wrapper:

```bash
pnpm import:min -- --mint <MINT> --name <NAME> --symbol <SYM> --source manual
```

Import one token candidate from a JSON file:

```bash
pnpm import:file -- --file ./examples/import-file.sample.json
```

Sample payload: `examples/import-file.sample.json`

Metric sample payload: `examples/import-file-with-metric.sample.json`

`import:file` expects exactly one JSON object. Required fields are `mint`, `name`, and `symbol`. Supported optional fields are `desc`, `dev`, `groupKey`, `groupNote`, `source`, `maxMultiple15m`, `peakFdv24h`, `volume24h`, `peakFdv7d`, `volume7d`, `metricSource`, and `observedAt`.

`import:mint:file` expects exactly one JSON object with an `items` array. Each item must contain `mint` and may contain `source`.

On success, `import:mint:file` returns JSON with `file`, `count`, `createdCount`, `existingCount`, and `items`. It processes items sequentially, so duplicate mints in the same file typically return `created: true` for the first item and `created: false` for later duplicates. Re-running the same file returns `existingCount` for already imported mints. There is no `failedCount` summary today; validation errors or child import failures exit non-zero before a final summary is printed.

`import:mint:source-file` expects one source-specific raw event object, normalizes it to the same minimal handoff payload used by `import:mint`, and returns `{ file, sourceEvent, handoffPayload, result }`. It is not a replacement for `import:mint:file`, which still accepts only the file-backed `{ items: [...] }` handoff wrapper.

Import with one metric observation:

```bash
pnpm import -- --mint TESTMINT --name "metric token" --symbol MTK --maxMultiple15m 2.4 --peakFdv24h 180000 --volume24h 42000 --metricSource manual
```

Refresh trend keywords:

```bash
pnpm trend:update -- --keywords "ai,anime,base" --ttlHours 24
```

Inspect one token in detail, including `latestMetric` when present:

```bash
pnpm token:show -- --mint <MINT>
```

Compare one token's entry snapshot, current fields, and recent metrics:

```bash
pnpm token:compare -- --mint <MINT>
```

Inspect recent tokens with filters:

```bash
pnpm tokens:report -- --rank S --source manual --hardRejected false --limit 10
```

Inspect recent tokens as entry-vs-outcome comparison rows:

```bash
pnpm tokens:compare-report -- --metadataStatus enriched --limit 10
```

Inspect one metric in detail:

```bash
pnpm metric:show -- --id <ID>
```

Inspect recent metrics with filters:

```bash
pnpm metrics:report -- --tokenId 1 --source manual --rank B --limit 10
```

Run the smoke test:

```bash
pnpm smoke
```

Run the pure-function tests:

```bash
pnpm test
```

Import notes:

- `pnpm import` is the full import path and owns scoring, persistence, optional metric persistence, and conditional notify.
- `pnpm import:min` is a thin wrapper that parses the minimum manual fields and delegates them to `src/cli/import.ts`.
- `pnpm import:file` is a thin wrapper that reads a file, parses and validates one JSON object, then delegates supported fields to `src/cli/import.ts`.
- `pnpm import:mint` is a separate mint-only entrypoint that creates the initial token base without running the full import flow.
- `pnpm import:mint:file` is a thin wrapper that reads a file, validates `{ items: [{ mint, source? }] }`, and delegates each item sequentially to `src/cli/importMint.ts`.
- `pnpm import:mint:file` success output is `{ file, count, createdCount, existingCount, items }`; duplicate mints and file re-runs are reflected through per-item `created` plus `createdCount` / `existingCount`.
- `pnpm import:mint:source-file` is a source-specific adapter wrapper that reads one raw event, normalizes it to `{ mint, source? }`, and delegates the result into `src/cli/importMint.ts`.

Report notes:

- `token:show` returns one token as JSON and includes `latestMetric` plus `metricsCount`
- `token:compare` returns `entrySnapshot`, current token fields, `metricsCount`, `hasMetrics`, `entryVsCurrentChanged`, `changedFields`, `latestMetric`, and up to 3 `recentMetrics`
- `tokens:report` returns filtered rows as JSON and includes `latestMetricObservedAt` plus `metricsCount`
- `tokens:compare-report` returns comparison rows with `entryScoreRank`, `entryScoreTotal`, current score fields, `metricsCount`, and latest metric summary fields
- `tokens:compare-report` supports `--hardRejected` for filtering by current reject state
- `tokens:compare-report` supports `--hasMetrics` and `--minMetricsCount` for filtering by observation count
- `tokens:compare-report` supports `--minEntryScoreTotal` and `--minCurrentScoreTotal` for score-threshold filtering
- `tokens:compare-report` supports `--entryScoreRank` and `--currentScoreRank` for exact rank filtering
- `tokens:compare-report` supports `--sortBy` and `--sortOrder`; `null` sort targets are placed last
- `metrics:report` supports `--mint`, `--tokenId`, `--source`, `--rank`, `--hasPeakFdv24h`, `--hasMaxMultiple15m`, `--hasTimeToPeakMinutes`, `--hasVolume24h`, `--hasPeakPrice15m`, `--sortBy`, `--sortOrder`, and `--limit`; items include `peakPrice15m`; `null` sort targets are placed last
- In `metrics:report`, `mint` and `rank` filter on the related token, while `tokenId` and `source` filter on the metric rows themselves

## Typical Workflow

1. Refresh trend keywords if needed.
2. Use `pnpm import:min` for the common manual intake path, or `pnpm import` when you also want group or metric args.
3. Use `pnpm import:file` when the intake data already exists as one local JSON object.
4. Use `pnpm import:mint:file` when mint-only intake data already exists as one local JSON object with an `items` array.
5. Add optional metric observations during import when you have them.
6. Inspect one saved token with `pnpm token:show` or `pnpm token:compare`, or inspect recent tokens with `pnpm tokens:report` / `pnpm tokens:compare-report`.
7. Inspect stored metric rows with `pnpm metric:show` or `pnpm metrics:report`.
8. Run `pnpm smoke` after changes to confirm the core CLI flows still work.

## What `pnpm smoke` Checks

`pnpm smoke` is not a full test suite. It is a lightweight operational check for the current MVP.

It currently checks:

- TypeScript typecheck
- Basic manual import
- Mint-only import rerun returning `created: false` on sequential re-run
- Mint-only batch file import
- Mint-only source-event file import
- Minimal wrapper import
- File wrapper import
- Manual import with metric persistence
- `metric:add` append-only behavior for repeated submissions
- `token:show`
- `token:compare`
- `tokens:compare-report`
- `metric:show`
- Trend update
- Metrics report

Operational behavior:

- uses smoke-prefixed temporary data
- restores `data/trend.json` after the run
- cleans up smoke test data from the local database

## Notes

- `src/index.ts` is a CLI guide hub, not a router
- `pnpm import:min` is a thin wrapper over `pnpm import` for the common manual intake case
- `pnpm import:file` is a thin wrapper over `pnpm import` for one local JSON object
- `pnpm import:mint:file` is a thin wrapper over `pnpm import:mint` for one local JSON object with an `items` array
- the main operational entrypoint is still `pnpm import`
- trend scoring depends on a fresh `data/trend.json`
- this repo is still optimized for manual operation, not automation
