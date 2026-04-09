# lowcap-bot

CLI-first MVP for researching Solana low-cap meme coin launches.

The current focus is manual operation: import a token candidate, score its narrative text, reject obvious scam phrases, optionally store observed metrics, refresh trend keywords, and inspect stored data. This repo is not yet an always-on bot or automatic ingestion system.

## What It Can Do Now

- Manually import a token candidate with `pnpm import`
- Normalize text and run hard reject checks
- Score text with dictionary-based scoring
- Save `Token` and optional `Dev` records in SQLite via Prisma
- Optionally save one `Metric` row during import
- Notify Telegram only when a token is `S` rank and not hard rejected
- Manually refresh `data/trend.json` with `pnpm trend:update`
- Inspect one saved token with `pnpm token:show`
- Inspect saved tokens with `pnpm tokens:report`
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

Import with one metric observation:

```bash
pnpm import -- --mint TESTMINT --name "metric token" --symbol MTK --maxMultiple15m 2.4 --peakFdv24h 180000 --volume24h 42000 --metricSource manual
```

Refresh trend keywords:

```bash
pnpm trend:update -- --keywords "ai,anime,base" --ttlHours 24
```

Inspect one token in detail:

```bash
pnpm token:show -- --mint TESTMINT
```

Inspect recent tokens:

```bash
pnpm tokens:report -- --source manual --hardRejected false --limit 10
```

Inspect one metric in detail:

```bash
pnpm metric:show -- --id 1
```

Inspect recent metrics:

```bash
pnpm metrics:report -- --limit 20
```

Run the smoke test:

```bash
pnpm smoke
```

## Typical Workflow

1. Refresh trend keywords if needed.
2. Import a token candidate with `pnpm import`.
3. Add optional metric observations during import when you have them.
4. Inspect stored metric rows with `pnpm metrics:report`.
5. Run `pnpm smoke` after changes to confirm the core CLI flows still work.

## What `pnpm smoke` Checks

`pnpm smoke` is not a full test suite. It is a lightweight operational check for the current MVP.

It currently checks:

- TypeScript typecheck
- Basic manual import
- Manual import with metric persistence
- Trend update
- Metrics report

Operational behavior:

- uses smoke-prefixed temporary data
- restores `data/trend.json` after the run
- cleans up smoke test data from the local database

## Notes

- `src/index.ts` is a CLI guide hub, not a router
- the main operational entrypoint is `pnpm import`
- trend scoring depends on a fresh `data/trend.json`
- this repo is still optimized for manual operation, not automation
