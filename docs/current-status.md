# Current Status

## Summary

This repository is an MVP for importing low-cap token candidates, scoring them from text, storing them in SQLite via Prisma, and notifying Telegram only when a token reaches `S` rank without hitting hard reject rules.

The current entrypoint is the import CLI:

```bash
pnpm import -- --mint <MINT> --name <NAME> --symbol <SYM> [--desc ...] [--dev ...] [--groupKey ...] [--groupNote ...] [--source ...]
```

Trend data can also be refreshed manually:

```bash
pnpm trend:update -- --keywords "ai,anime,base,solchat" [--ttlHours 24]
```

Stored metrics can be inspected from the CLI:

```bash
pnpm metrics:report -- [--mint <MINT>] [--limit 20]
```

A minimal smoke-test path is also available:

```bash
pnpm smoke
```

There is no always-on bot, scheduler, queue worker, or automatic ingestion yet.

## Implemented

- Prisma + SQLite persistence
- `Dev`, `Token`, and `Metric` models in the schema
- CLI import flow in `src/cli/import.ts`
- Manual trend update CLI in `src/cli/updateTrend.ts`
- Manual metric report CLI in `src/cli/metricsReport.ts`
- Manual smoke-test CLI in `src/cli/smokeTest.ts`
- Optional metric persistence from the import CLI
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
- Telegram notification for `S` rank tokens that are not hard rejected

## Partially Implemented

- `groupKey` and `groupNote` are stored on `Token`, but no grouping logic uses them yet
- Trend scoring exists, but depends on fresh `data/trend.json`
- Trend data refresh is manual, not automatic

## Not Implemented

- Automatic import from external sources
- Background processing or scheduled jobs
- A real application entrypoint in `src/index.ts`
- Tests
- Migrations directory and versioned DB history
- Operational docs and runbooks
- Telegram command handling or inbound bot features

## Current Constraints

- Input is manual and one-token-at-a-time through CLI args
- Scoring is entirely rule-based and file-backed
- Trend scoring is currently ineffective unless `data/trend.json` is refreshed
- Metrics are only stored when optional metric args are supplied manually
- Trend updates must be triggered manually through the CLI

## Import Example

Basic import:

```bash
pnpm import -- --mint TESTMINT --name "basic token" --symbol BTK
```

Import with metrics:

```bash
pnpm import -- --mint TESTMINT --name "metric token" --symbol MTK --maxMultiple15m 2.4 --peakFdv24h 180000 --volume24h 42000 --metricSource manual
```

Trend update:

```bash
pnpm trend:update -- --keywords "ai, ai, anime, , base" --ttlHours 24
```

Metrics report:

```bash
pnpm metrics:report -- --mint TESTMINT --limit 5
```

Smoke test:

```bash
pnpm smoke
```

Notes:

- `generatedAt` is always set to the current time when the file is updated
- `ttlHours` keeps the current value unless explicitly provided
- this command is for manual refresh only and does not schedule updates
- metric reporting is read-only and returns recent rows as JSON
- smoke runs a lightweight operational check for typecheck, import, metric save, trend update, and metric report
- smoke restores `data/trend.json` after the run and cleans up its temporary smoke data

## Repository State

- Branch: `master`
- Untracked at the time of inspection: `.codex`
- Recent commits show the repo is still at MVP scaffold stage
