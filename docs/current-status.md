# Current Status

## Summary

This repository is an MVP for mint-driven token accumulation, single-source DexScreener and GeckoTerminal candidate detection with one-shot or simple polling execution plus lightweight checkpointing, enrichment, rescoring, metric capture, and read-only comparison views backed by SQLite via Prisma. Telegram notification exists on the full `pnpm import` path when a token reaches `S` rank without hitting hard reject rules, and the Gecko ops production sender has now been confirmed for one bounded `metric_appended` ops notification. Auto live send, scheduler, and systemd remain locked; the latest capture-only Notification preflight, smoke / rehearsal send guard, and marker-capable command check are recorded in `docs/runbooks/capture-only-notification-rehearsal.md`.

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
pnpm detect:dexscreener:token-profiles [--file <PATH>] [--limit <N>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>] [--checkpointFile <PATH>]
```

```bash
pnpm detect:geckoterminal:new-pools [--file <PATH>] [--pumpOnly] [--limit <N>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>] [--checkpointFile <PATH>]
```

```bash
pnpm compare:geckoterminal:dexscreener [--timeoutSeconds <N>] [--intervalSeconds <N>]
```

```bash
pnpm compare:coverage:geckoterminal:dexscreener [--geckoFile <PATH>] [--dexFile <PATH>] [--timeoutSeconds <N>] [--intervalSeconds <N>] [--recheckAfterSeconds <N>] [--recheckSampleLimit <N>]
```

```bash
pnpm token:enrich -- --mint <MINT> [--name <NAME>] [--symbol <SYMBOL>] [--desc <TEXT>] [--source <SOURCE>]
```

```bash
pnpm token:rescore -- --mint <MINT>
```

```bash
pnpm token:enrich-rescore:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--pumpOnly] [--write] [--notify]
```

```bash
pnpm context:capture:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceHours <N>] [--write]
```

```bash
pnpm ops:summary:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly]
```

```bash
pnpm ops:catchup:gecko -- [--pumpOnly] [--limit <N>] [--maxCycles <N>] [--sinceMinutes <N>] [--metricAppend] [--opsNotifyCaptureFile <PATH>] [--opsNotify] [--opsNotifyTrigger token_completed|metric_appended|loop_complete] [--write]
```

```bash
pnpm ops:gecko:bounded-flow:plan -- --mint <MINT> --intent <enrich_rescore|first_metric_snapshot|second_metric_snapshot> [--expectedMetricsCount <N>] [--expectedMetadataStatus <STATUS>] [--expectedStage <STAGE>]
```

```bash
pnpm review:queue:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly]
```

```bash
pnpm metric:add -- --mint <MINT> [--source <SOURCE>] [--launchPrice <NUM>] [--peakPrice15m <NUM>] [--peakPrice1h <NUM>] [--maxMultiple15m <NUM>] [--maxMultiple1h <NUM>] [--peakFdv24h <NUM>] [--volume24h <NUM>] [--timeToPeakMinutes <NUM>]
```

```bash
pnpm metric:snapshot:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--pumpOnly] [--prioritizeRichPending] [--minGapMinutes <N>] [--interItemDelayMs <N>] [--source <SOURCE>] [--noNotificationCapture] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>]
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
pnpm token:observation -- --mint <MINT>
```

```bash
pnpm token:observe -- --mint <MINT> [--narrativeCategory <VALUE>] [--whyWatch <TEXT>] [--whySkip <TEXT>] [--outcomeLabel <VALUE>] [--operatorNote <TEXT>]
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

```bash
pnpm notification:auto-send:plan
```

```bash
pnpm notification:auto-send:execute -- [--execute]
```

```bash
pnpm notification:send -- --notificationKey <KEY> --trigger metric_appended [--live] [--retryFailed]
```

```bash
pnpm notification:retry:plan
```

A minimal smoke-test path is also available:

```bash
pnpm smoke
```

`pnpm smoke` is not read-only verification. It can write temporary Token /
Metric / Dev rows to the configured database and restore `data/trend.json`; do
not use it for routine Green / Yellow verification without an explicit task that
includes backup, residue checks, and cleanup confirmation.

There is no always-on bot, scheduler, queue worker, or background automatic ingestion runtime yet.

## Current Operational Flow

### Mint-Driven Accumulation MVP

1. Start with `pnpm import:mint` to create the minimum token base and initial `entrySnapshot`.
2. Use `pnpm detect:dexscreener:token-profiles` when one DexScreener token-profiles pass should be evaluated as a dry-run or handed off into `import:mint` with `--write`.
3. Use `pnpm detect:geckoterminal:new-pools` when one live or file-backed GeckoTerminal `new_pools` sample should be normalized into candidates as a one-shot dry-run, handed off into `import:mint` with `--write`, or watched with a simple GeckoTerminal-specific checkpoint in `--watch --write`.
4. Use `pnpm compare:geckoterminal:dexscreener` when one GeckoTerminal mint candidate should be compared against bounded DexScreener `token-profiles/latest/v1` polling as read-only observation.
5. Use `pnpm compare:coverage:geckoterminal:dexscreener` when one short read-only batch spot check should compare the current GeckoTerminal candidate set against DexScreener candidates by overlap and source-only mint sets.
6. Use `pnpm import:mint:file` when mint-only intake already exists as one local JSON object with an `items` array.
7. Use `pnpm import:mint:source-file` when one source-specific raw event file needs to be normalized into the same mint-only boundary.
8. Use `pnpm token:enrich` to fill current token fields after mint-only intake.
9. Use `pnpm token:rescore` to recompute current hard reject and score fields from the current text.
10. Use `pnpm token:enrich-rescore:geckoterminal` when recent GeckoTerminal-origin tokens should be fetched once, previewed as enrich plus rescore in dry-run, or updated in one batch with `--write`.
11. Use `pnpm metric:snapshot:geckoterminal` to fetch one-shot current GeckoTerminal token snapshots for recent GeckoTerminal-origin tokens and append `Metric` rows only with `--write`.
12. Use `pnpm ops:catchup:gecko` for the bounded operator-visible Gecko Token to Metric catch-up loop: dry-run planning by default, one token-only write with `--write`, or one Metric append through the production runner only with `--write --metricAppend`.
13. Use `pnpm metric:add` to append later outcome observations without mutating token score fields.

### Full Import Path

- `pnpm import` remains the full manual import path and owns scoring, persistence, optional metric persistence, and conditional Telegram notify.
- `pnpm import:min` is a thin wrapper for the common minimum manual intake case and delegates into `pnpm import`.
- `pnpm import:file` is a thin wrapper for one local JSON object and delegates supported fields into `pnpm import`.

### Read-Only CLI Positioning

- `pnpm token:compare` is the single-token read-only comparison view.
- `pnpm token:observation` is the single-token read-only observation OS report:
  it combines Token identity, narrative placeholders, risk state, latest Metric
  / outcome fields, Notification state, existing `Token.reviewFlagsJson`
  community / metadata flags, observation gaps, and review hints from existing
  DB data only.
- `pnpm tokens:observation-gaps` is the multi-token read-only observation gap
  queue/report for choosing the next human-gated `token:observe` target. It
  scans existing Token / Metric / Notification state, summarizes missing
  narrative / thesis / outcome / community / holder / market-condition context,
  and prints a suggested manual observe command as a string only when
  `token:observe` can actually reduce narrative / thesis / outcome gaps. Holder
  distribution, market condition, community-link, metric, and notification gaps
  stay separate from `token:observe` suggestions until separately designed. The
  report now includes `unsupportedGapPlan` entries: holder distribution and
  market condition require separate capability design, community links belong
  to reviewFlagsJson / enrichment, metric missing belongs to the Metric flow,
  and notification missing must not be filled by sending Telegram solely for
  coverage. It performs no DB writes, does not run `token:observe`, is not a buy
  signal, and does not enable automatic retry, queue, scheduler, systemd,
  checkpoint, `--write`, or `--watch` operation.
- Holder distribution remains a separate risk-observation capability. The
  docs-first design for the future snapshot is
  `docs/design/holder-distribution-snapshot.md`; it lists candidate fields such
  as `topHolderPct`, `top10HolderPct`, `holderCount`, `freshWalletCount`,
  `bundlerSignal`, `sameFundingOriginSignal`, `devWalletPct`, `devBuyImpact`,
  `mcapVolumeRatio`, and `bottedChartPattern`, plus source / observedAt /
  confidence / raw-free / secret-free boundaries. The source contract now
  recommends a Rugcheck-style safe summary as the first external-source
  candidate if raw wallet lists and response bodies can be excluded, with
  manual holder review or external report only as fallback. Unbounded on-chain
  holder crawls and funding graph traversal remain deferred. This task did not
  fetch holder data, write DB state, add schema, or enable automation.
- `src/observation/holderDistributionSafeSummary.ts` now provides the
  `HolderDistributionSafeSummary` parser / validator foundation with static
  fixture tests only. It accepts the fixed safe summary shape and rejects
  unknown extra fields, invalid percentages / counts / timestamps, `rawFree` or
  `secretFree` values other than literal `true`, raw wallet-list keys, raw
  response-body / raw JSON keys, and secret-like keys such as API token or chat
  id fields. It does not fetch, write production DB state, choose final storage,
  add schema, or create a buy signal.
- `pnpm holder:safe-summary:report -- --file <PATH>` is the read-only file
  report for static / manual / external holder safe-summary fixtures. It reads
  either one `{ mint, summary }` object or an `items` array, reports valid /
  invalid counts, emits only safe summary fields plus sanitized issue text, and
  rejects raw payload or secret-like keys without printing their values. It
  does not fetch, write production DB state, choose schema/storage, or create a
  buy signal.
- Holder distribution production storage schema is migrated, and the first
  one-token HolderSnapshot row write rehearsal has completed. The rehearsal
  used a static manual safe-summary fixture only; no holder values were fetched
  or inferred.
  `Token.entrySnapshot` is deferred for holder distribution because it is poor
  for repeated source-labeled snapshots, and `Metric.rawJson` is deferred
  because holder distribution is not a market metric payload.
- `HolderSnapshot` has been added to `prisma/schema.prisma` and production
  `prisma/dev.db` has applied
  `prisma/migrations/20260515000100_add_holder_snapshot/migration.sql` after
  backup
  `/home/mochi/lowcap-bot-backups/dev.db.before-holder-snapshot-migration-20260515012828.db`.
  The model relates to `Token`, stores only validated safe summary scalar
  fields plus `source`, `observedAt`, `confidence`, `rawFree`, and
  `secretFree`, and indexes `[tokenId, observedAt]` plus
  `[source, observedAt]`. It intentionally has no raw payload / rawJson /
  wallet-list columns and no first unique constraint.
- `pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>` and
  `pnpm holder:snapshot:show -- --mint <MINT> [--limit <N>]` are implemented.
  `holder:snapshot:add` is a one-row write CLI requiring exact `--mint` plus
  one safe summary file, with no batch default, no fetch, no Token / Metric /
  Notification update, and an inserted `holderSnapshotId` for rollback.
  `holder:snapshot:show` is the read-only verifier that returns latest safe
  holder snapshots only. The add command has been verified with temp SQLite
  tests and one production Red one-token rehearsal.
- The HolderSnapshot production migration apply has passed. `prisma migrate
  deploy` applied `20260515000100_add_holder_snapshot`; migration status is up
  to date; PRAGMA checks confirmed the `HolderSnapshot` table, the two expected
  indexes, and `HolderSnapshot` count `0`. Token / Metric / Notification counts
  stayed unchanged at `1116 / 191 / 6`.
- The production one-token HolderSnapshot row write rehearsal was run for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` after backup
  `/home/mochi/lowcap-bot-backups/dev.db.before-holder-snapshot-row-rehearsal-20260515015522.db`.
  The fixture had `source=manual_holder_review`, `confidence=low`, all holder
  percentage / count fields `null`, both funding / bundler signals `unknown`,
  `rawFree=true`, and `secretFree=true`. `holder:safe-summary:report` returned
  `validCount=1`, `invalidCount=0`; the exact one-row add command returned
  `holderSnapshotId=1`; `holder:snapshot:show` confirmed `count=1` and the safe
  fields. Token / Metric / Notification counts stayed unchanged at
  `1116 / 191 / 6`; HolderSnapshot count moved `0 -> 1`. The row is review
  context only, not a buy signal. `holder:gaps:plan` still reports the holder
  gap because persisted HolderSnapshot integration is future Yellow work.
- `token:observation` and `holder:gaps:plan` now read persisted
  `HolderSnapshot` rows. For
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, `token:observation` shows
  `holderDistributionSnapshot` with `holderSnapshotId=1`, removes
  `holder_distribution_not_recorded`, and keeps
  `holder_distribution_values_unknown` / `holder_distribution_manual_review_only`
  because the rehearsal fixture intentionally stored `null` / `unknown` holder
  values. `holder:gaps:plan` no longer re-proposes that token and reports
  `holderSnapshotPresentCount=1`; production `HolderSnapshot` count remains
  `1`. This read-only integration did not write production DB state, fetch
  holder data, send Telegram, or introduce trading guidance.
- Holder distribution MVP loop is complete for storage / parser / write-path /
  read-path validation: schema exists, production migration is applied, one
  manual safe-summary row was written, `holder:snapshot:add` / show exist,
  `token:observation` reads the latest snapshot, and `holder:gaps:plan` excludes
  tokens with persisted snapshots. This does not complete real holder analysis:
  the only production row is `holderSnapshotId=1` for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, with
  `source=manual_holder_review`, holder values `null` / `unknown`, no external
  fetch, no on-chain fetch, and no inferred holder data. Next-phase work must
  stay source-specific and raw-free; do not jump to scheduler / queue / systemd,
  unbounded on-chain crawl, raw provider JSON storage, or holder-derived buy
  scoring.
- `src/observation/holderSourceMappers.ts` now includes a Rugcheck-style
  synthetic/static mapper rehearsal. It maps explicit synthetic holder
  concentration and wallet-signal summary fields into
  `HolderDistributionSafeSummary`, validates the mapped output with the safe
  summary contract, keeps missing or ambiguous fields as `null` / `unknown`,
  and rejects raw provider JSON, wallet-list fields, request URLs, and
  secret-like keys without printing raw values. This is not a real Rugcheck API
  integration, performs no external or on-chain fetch, writes no production DB
  state, and is not a buy signal.
- Real Rugcheck-style source contract review is docs-only and remains
  unresolved for capture: public docs identify `GET /v1/tokens/{mint}/report`
  and `GET /v1/tokens/{mint}/report/summary` style endpoints, but auth / rate
  limits and exact holder-field semantics still need a separate approved
  preflight. The summary endpoint is the only plausible first candidate because
  full reports can include raw `topHolders[]` wallet payload. The implemented
  mapper stays synthetic; `mapRugcheckRealResponseToSafeSummary` and real
  response fixtures are not implemented, no raw provider JSON is stored, no
  fetch was run, and Red external capture is not approved yet.
- The Rugcheck summary endpoint preflight plan is now docs-only: a future Red
  task may consider exactly one mint and one `GET /v1/tokens/{mint}/report/summary`
  request only after endpoint / auth / rate-limit approval. Allowed output is
  limited to HTTP status, top-level keys, dangerous-key presence, sanitized
  field-shape summary, and mapping feasibility. It forbids raw response bodies,
  raw JSON fixtures, wallet / owner addresses, secret-bearing URLs or headers,
  API keys / JWTs, `.env`, screenshots with wallet lists / secrets, DB writes,
  `holder:snapshot:add`, queue / scheduler / systemd, checkpoint updates,
  `--write`, `--watch`, and `pnpm smoke`.
- Red Rugcheck summary endpoint preflight was run once for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`: HTTP status was `200`, JSON
  shape parsing succeeded, and only sanitized shape output was printed. Top
  level keys were limited to `tokenProgram`, `tokenType`, `risks`, `score`,
  `score_normalised`, and `lpLockedPct`; the dangerous key scan found no
  dangerous key categories. Candidate holder fields present were `lpLockedPct`,
  `risks`, and `score`; `topHoldersPct`, `holderCount`, `lpLocked`, `rugged`,
  `tokenMeta`, and `markets` were absent. Mapping decision is
  `needs_more_source_review`: no raw response body was printed or saved, no raw
  provider JSON fixture was created, no DB write or `holder:snapshot:add` was
  run, and no real mapper or persistence path is approved.
- Rugcheck summary preflight closeout keeps the source unresolved for
  `HolderDistributionSafeSummary`: no holder concentration fields were
  confirmed, so `mapRugcheckRealResponseToSafeSummary` remains unimplemented.
  Do not map `score`, `score_normalised`, `risks`, or `lpLockedPct` into holder
  concentration fields. `lpLockedPct` / provider score / risk fields may become
  future risk-context inputs only after a separate risk-context contract; full
  report preflight remains avoided by default because wallet payload risk is
  high.
- Alternative holder source review is docs-only and still does not approve a
  real source. Birdeye holder distribution and CoinGecko / GeckoTerminal
  Onchain Token Info are the only plausible aggregate-first preflight
  candidates found: Birdeye must prove `include_list=false` avoids wallet-list
  output, while CoinGecko / GeckoTerminal requires Pro API auth and beta holder
  data acceptance before use. Solscan and Bubblemaps remain unsuitable for the
  current MVP because the reviewed docs point toward holder-list or graph-style
  payloads. DEX Screener / current GeckoTerminal public API docs did not expose
  holder concentration aggregates. Continue `manual_holder_review` /
  external-report-only paths until an aggregate source is separately approved.
- CoinGecko / GeckoTerminal Onchain Token Info boundary review is docs-only and
  leaves the source unapproved, but it is the best next preflight candidate:
  docs show `holders.count` and `holders.distribution_percentage.top_10`, with
  holder data marked beta and distribution calculated from total supply.
  Mapping would be limited to `holderCount` and `top10HolderPct`; `topHolderPct`
  stays `null`, wallet-signal fields stay `unknown` / `null`, and
  `lpWalletExcluded` stays `null` because docs say all wallet types are
  included. Pro API key / paid-plan / rate-limit / terms approval is required,
  and the separate Top Token Holders endpoint must be avoided because it returns
  wallet-address payload.
- CoinGecko Token Info preflight plan is docs-only. A future Red task is
  limited to one re-approved mint, one Token Info request, header auth with
  `x-cg-pro-api-key`, no query-string API key, no Top Token Holders endpoint,
  no retry, no batch, no raw response persistence, no DB write, no
  `holder:snapshot:add`, no mapper implementation, and no `pnpm smoke`. Allowed
  output is only HTTP / parse status, top-level and shallow holder keys,
  presence of `holders.count` and
  `holders.distribution_percentage.top_10`, primitive type summary, dangerous
  key categories, and mapping feasibility. Stop if key / paid plan / credit /
  rate-limit / terms approval is missing.
- CoinGecko preflight operator approval checklist is docs-only and must be
  completed before any Red request: approve target mint, `solana` network id,
  Token Info endpoint, exactly one request, Pro API key use, header auth only,
  no query-string auth, paid-plan / credit / minute-rate-limit / terms
  acceptance, beta holder data acceptance, output sanitation, no raw response
  persistence, no Top Token Holders endpoint, no DB write, no
  `holder:snapshot:add`, no mapper implementation, and no `pnpm smoke`. The
  command sketch requires `COINGECKO_PRO_API_KEY` in env and forbids echoing the
  key, headers, `.env`, secret-bearing URLs, or raw response body.
- CoinGecko Pro API / paid holder-source work is parked for MVP completion.
  The Red preflight stopped before request execution because
  `COINGECKO_PRO_API_KEY` was not available; no CoinGecko fetch, external
  fetch, DB write, `holder:snapshot:add`, mapper implementation, raw response
  persistence, Top Token Holders request, or `pnpm smoke` occurred. Paid holder
  source capture is not an MVP blocker. The HolderSnapshot MVP loop is closed
  only for storage / parser / one-row write-path / read-path validation, while
  real holder analysis and paid-source capture remain future enhancements.
  Continue `manual_holder_review` and external-report-only review until budget,
  API key, terms, rate-limit, and secret-boundary approval make paid source
  work worth resuming.
- MVP completion is now defined around the existing free / repo-local
  CLI-first research OS: mint candidate intake, scoring / hard-reject and
  narrative context persistence, Metric / observation accumulation, bounded
  Telegram notification operation, read-only `token:observation` and gap
  planners, and minimal manual/community/holder review visibility. It does not
  require paid holder analysis, generic scheduler / queue / systemd operation,
  always-on execution, automatic trading, or buy-signal output.
- Next implementation candidate should be a Yellow read-only MVP status slice:
  add `pnpm mvp:status` to report DB / migration / key command availability,
  core row counts, observation-loop coverage, and remaining blockers without
  fetches, writes, Telegram sends, or schema changes; pair it with runbook
  consolidation for the current manual operation command order.
- `pnpm mvp:status` is now the read-only readiness report for the
  `3_to_6_hour_bounded_monitoring_mvp` goal. It reports Token / Metric /
  Notification / HolderSnapshot counts, migration summary, key command
  availability, readiness flags, blockers, and `nextRecommendedSlice` without
  DB writes, external fetches, Telegram sends, queue / scheduler / systemd,
  checkpoint updates, `--write`, `--watch`, or `pnpm smoke`. Pro API and paid
  holder source work remain parked. The next implementation slice is
  `bounded_watch_readiness_check`, not scheduler / systemd promotion.
- `pnpm bounded:watch:readiness` is now the read-only readiness report for
  moving toward a 3-to-6-hour bounded monitoring MVP. It checks current
  detect/checkpoint/dedupe/metric/notification/observation command support,
  keeps `readOnly=true`, `willWrite=false`, `willFetch=false`,
  `willSendTelegram=false`, and `willUpdateCheckpoint=false`, and prints
  next command suggestions as strings only. The immediate next operating step
  is a separately approved 3h dry-run. The purpose is core data accumulation
  and later outcome review, not automatic trading or buy-signal output.
  Scheduler / systemd remain post-3h/6h monitored-run work, and Pro API /
  paid holder source work remains parked.
- `pnpm metrics:window-report -- --mint <MINT>` is now the read-only Metric
  history peak report for notification / scoring verification after bounded
  monitoring data accumulates. The Metric outcome evaluation design is
  fixed in `docs/design/metric-outcome-evaluation.md`: default windows are
  30m, 60m, 90m, 2h, 3h, 4h, 5h, 6h, 8h, 10h, 12h, and 24h; each window's peak
  FDV is `max(fdv)` over observed Metric rows, not a single 24h-later sample;
  `evaluationAt` is the report execution time for MVP evaluation; and the
  read-only output now computes `alertedAt`, `alertFdv`, `latestFdv`,
  `firstObservedFdv`, window completion, provisional status,
  `timeToPeakMinutes`, `peakMultipleFromAlert`, `drawdownFromPeak`, coverage
  labels, and `outcomeLabel` without saving them to DB. The report performs no
  DB write, schema change, Notification write, fetch, Telegram send,
  checkpoint update, `--write`, `--watch`, or `pnpm smoke`, and it is
  verification context rather than automatic trading or buy-signal output.
- The first 3h GeckoTerminal detect watch dry-run completed on 2026-05-16 with
  `pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1
  --maxIterations 180 --intervalSeconds 60`. It ran 180 cycles with
  `dryRun=true`, `writeEnabled=false`, `checkpointEnabled=false`,
  `failedCount=0`, `rateLimitRetryCount=0`, `failureCooldownCount=0`,
  `inputCount=3600`, `processedCount=180`, `selectedCount=180`,
  `acceptedCount=180`, `rejectedCount=0`, `importedCount=0`, and
  `existingCount=0`. Token / Metric / Notification / HolderSnapshot counts
  stayed `1116 / 191 / 6 / 1` before and after, `data/trend.json` stayed
  unchanged, and no checkpoint file was updated. The existing CLI printed
  detector candidate summaries but not raw provider response bodies or secrets,
  and no Telegram send, DB write, queue, scheduler, systemd, `--write`, or
  checkpoint update occurred. The next step is not scheduler / systemd; it is a
  separately approved 3h write rehearsal or narrower bounded write rehearsal.
- 3h write rehearsal preflight is now documented, but the rehearsal has not
  been run. Code inspection shows `detect:geckoterminal:new-pools --write`
  delegates accepted candidates to `importMint`, which only creates a new
  `mint_only` Token or returns the existing Token by unique mint. It does not
  append Metrics, create Notification rows, touch HolderSnapshot, enrich,
  rescore, or call Telegram live send. In watch mode, checkpointing is enabled
  only when both `--watch` and `--write` are present; `--checkpointFile` is
  supported only in that mode and should use an isolated fresh `/tmp` file for
  the Red rehearsal so `data/checkpoints` remains untouched. DB writes still go
  to the active `DATABASE_URL`; a `/tmp` checkpoint does not isolate the DB.
  Current-DB rehearsal is the better MVP validation if the operator accepts
  durable mint-only observations, while an isolated `/tmp` DB rehearsal would
  require `DATABASE_URL=file:/tmp/...` plus schema preparation and would not
  validate current production-style accumulation. Candidate Red command:
  `pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit
  1 --maxIterations 180 --intervalSeconds 60 --checkpointFile
  /tmp/lowcap-bot-gecko-write-rehearsal.json`. Confirm the checkpoint path is
  fresh or intentionally reused before running.
- The 3h current-DB GeckoTerminal write rehearsal has now completed. Command:
  `pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly
  --limit 1 --maxIterations 180 --intervalSeconds 60 --checkpointFile
  /tmp/lowcap-bot-gecko-write-rehearsal.json`. It ran 180 cycles over roughly
  three hours with `dryRun=false`, `writeEnabled=true`,
  `checkpointEnabled=true`, `failedCount=0`, `rateLimitRetryCount=0`,
  `rateLimitRetrySuccessCount=0`, `failureCooldownCount=0`, `inputCount=3600`,
  `processedCount=180`, `selectedCount=180`, `acceptedCount=180`,
  `rejectedCount=0`, `importedCount=180`, and `existingCount=0`. Counts moved
  from Token / Metric / Notification / HolderSnapshot `1116 / 191 / 6 / 1` to
  `1296 / 191 / 6 / 1`: this confirms mint-only Token accumulation only.
  Metric, Notification, and HolderSnapshot counts did not change, and no
  Telegram live send was observed. The checkpoint side effect was limited to
  `/tmp/lowcap-bot-gecko-write-rehearsal.json`, ending at
  `poolCreatedAt=2026-05-16T17:10:57.000Z`; `data/checkpoints` stayed limited
  to the existing DexScreener checkpoint and `data/trend.json` stayed
  unchanged. Next accumulation work must treat Metric accumulation and
  Notification accumulation as separate slices, not as part of detect write.
- Bounded Metric accumulation preflight is now documented, but
  `metric:snapshot:geckoterminal` has not been run after the 3h write
  rehearsal. Git history is consistent: `2b5521e`, `205962e`, `a20b826`,
  `a54db45`, `9899c4f`, `d380162`, and `cf07465` are all ancestors of HEAD.
  Current DB counts are Token / Metric / Notification / HolderSnapshot
  `1296 / 191 / 6 / 1`. The 3h write rehearsal cohort can be identified as
  GeckoTerminal-origin pump tokens with `metadataStatus=mint_only`, first-seen
  anchors inside the 2026-05-16 14:10-17:12Z rehearsal window, and no Metrics;
  `review:queue:geckoterminal --pumpOnly` reports 180 Gecko-origin tokens and
  180 `metricPending` rows. Code inspection shows
  `metric:snapshot:geckoterminal` fetches one GeckoTerminal token snapshot per
  selected token, writes `Metric` rows only with `--write`, has no checkpoint
  file behavior, does not update Token or HolderSnapshot, and does not send
  Telegram. Batch mode does not create Notification rows; exact `--mint` mode
  creates one capture-only `metric_appended` Notification after a successful
  Metric write. Recommended first Red command is the batch path with no
  Notification side effect:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes
  1440 --minGapMinutes 60 --write`. Metric and Notification accumulation must
  remain separate Red slices.
- The first bounded Metric accumulation Red execution has now completed in
  recent batch mode. Command:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes
  1440 --minGapMinutes 60 --write`. It selected
  `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump`, fetched one GeckoTerminal
  token snapshot, and appended Metric `id=1274` at
  `observedAt=2026-05-16T20:39:48.499Z` with source
  `geckoterminal.token_snapshot`. Counts moved from Token / Metric /
  Notification / HolderSnapshot `1296 / 191 / 6 / 1` to
  `1296 / 192 / 6 / 1`; `review:queue:geckoterminal -- --pumpOnly` moved
  `metricPendingCount` from 180 to 179. The run had `okCount=1`,
  `writtenCount=1`, `skippedCount=0`, and `errorCount=0`; no rate-limit /
  retry condition was observed. Because it used batch mode and not exact
  `--mint` mode, it did not create a Notification row, did not send Telegram,
  did not update Token or HolderSnapshot, did not enrich / rescore, and did
  not touch checkpoints. `metrics:window-report` for the selected mint
  remained read-only and confirmed one valid FDV sample in the 24h window;
  30m / 60m windows remained `no_data` because the first Metric was observed
  outside those windows.
- The second bounded Metric accumulation Red execution expanded the same batch
  path to `--limit 3`. Command:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 3 --sinceMinutes
  1440 --minGapMinutes 60 --write`. It selected three tokens: the prior
  `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump` row was skipped as
  `skipped_recent_metric` under `minGapMinutes=60`, while
  `G4qJ2GcVBkSEGa9D4Z7FhbHcZFSPaKxFyKiaw7K2pump` appended Metric `id=1275`
  at `observedAt=2026-05-16T21:00:33.409Z` and
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump` appended Metric `id=1276` at
  `observedAt=2026-05-16T21:00:33.842Z`. Counts moved from Token / Metric /
  Notification / HolderSnapshot `1296 / 192 / 6 / 1` to
  `1296 / 194 / 6 / 1`; `review:queue:geckoterminal -- --pumpOnly` moved
  `metricPendingCount` from 179 to 177. The run had `selectedCount=3`,
  `okCount=2`, `skippedCount=1`, `errorCount=0`, and `writtenCount=2`; no
  rate-limit / retry condition was observed. Batch mode again created no
  Notification rows, sent no Telegram message, wrote no HolderSnapshot, did
  not update Token fields, did not enrich / rescore, and did not touch
  checkpoints. `metrics:window-report` for both newly written mints stayed
  read-only and confirmed one valid FDV sample in the 24h window.
- Exact `--mint` mode Notification capture preflight is now documented, but the
  capture has not been run. Code inspection shows
  `metric:snapshot:geckoterminal -- --mint <MINT> --write` selects exactly one
  existing Token, applies `--minGapMinutes` before fetch when provided, fetches
  one GeckoTerminal token snapshot, writes one Metric on success, and only
  then creates a capture-only Notification through
  `maybeCreateByNotificationKey`. The Notification uses
  `eventType=metric_appended`, `trigger=metric_appended`, `status=captured`,
  `mode=capture_only`, `source=metric:snapshot:geckoterminal`, and includes the
  target `tokenId` plus created `metricId`. The CLI imports no Telegram sender
  and does not call live send; Token, HolderSnapshot, enrich / rescore,
  checkpoint, queue, scheduler, and systemd are outside this path. A
  `skipped_recent_metric` result creates neither Metric nor Notification.
  Recommended Red target is
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump` because it is a
  GeckoTerminal-origin pump `mint_only` Token from the 3h write rehearsal with
  `metricsCount=0` and `notificationCount=0`; the already-written AW7 / G4 /
  P3 mints are avoided for this preflight because existing Metrics can trigger
  the min-gap skip path. Candidate command:
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --minGapMinutes 60 --write`.
  Expected Red result is Metric `+1`, Notification `+1`, Token / HolderSnapshot
  unchanged, Telegram send `0`, and no raw provider body or secret output.
- The exact `--mint` Notification capture Red execution has now completed for
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`. Command:
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --minGapMinutes 60 --write`.
  The command ran in `mode=single`, selected Token `id=5376`, wrote Metric
  `id=1277` at `observedAt=2026-05-16T23:58:13.695Z` with source
  `geckoterminal.token_snapshot` and `volume24h=1015875.57780311`, then
  created Notification `id=7` with
  `notificationKey=ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277`,
  `eventType=metric_appended`, `trigger=metric_appended`, `status=captured`,
  `mode=capture_only`, `tokenId=5376`, `metricId=1277`,
  `rawJsonFree=true`, `secretFree=true`, and
  `source=metric:snapshot:geckoterminal`. Counts moved from Token / Metric /
  Notification / HolderSnapshot `1296 / 194 / 6 / 1` to
  `1296 / 195 / 7 / 1`, and `metricPendingCount` moved from 177 to 176.
  `skippedCount=0`, `errorCount=0`, and no rate-limit / retry condition was
  observed. Telegram live send did not occur; Token, HolderSnapshot, enrich /
  rescore, checkpoint, queue, scheduler, systemd, and `pnpm smoke` were not
  invoked.
- Post-alert Metric outcome preflight is now documented, but no post-alert
  Metric had been added at that point. Current counts before the Red check were
  Token / Metric / Notification / HolderSnapshot `1296 / 195 / 7 / 1`. The target mint
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump` has Token `id=5376`, Metric
  `id=1277` at `observedAt=2026-05-16T23:58:13.695Z`, and Notification `id=7`
  at `capturedAt=2026-05-16T23:58:13.709Z`. `metrics:window-report` uses
  Notification `id=7` as the alert anchor and uses Metric `id=1277` as
  `alertFdv`, but the current 30m / 60m / 24h post-alert windows have
  `fdvSampleCount=0` and `outcomeLabel=no_data` because the only Metric is 14ms
  before `capturedAt`. Code inspection shows exact `--mint --write`
  re-execution will create another Metric and then another capture-only
  `metric_appended` Notification because the notification key includes the new
  `metricId`; it is not deduped against the prior Notification. There is no
  targeted batch-mode option, and `--minGapMinutes 0` is invalid because the
  parser requires a positive integer. The exact `--mint --write
  --noNotificationCapture` option is now available for the post-alert Metric
  check when Notification `+0` is required. Recommended next Red path is:
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --noNotificationCapture
  --write`. Expected result: Metric `+1`, Notification `+0`, Telegram `0`,
  Token / HolderSnapshot `0`.
- The post-alert Metric outcome Red check is complete for the ENRA mint. The
  prior attempt stopped before fetch/write because `--minGapMinutes 0` is
  invalid. The successful command omitted `--minGapMinutes` and ran
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --noNotificationCapture
  --write`. It selected Token `id=5376`, fetched one GeckoTerminal token
  snapshot, and wrote Metric `id=1278` at
  `observedAt=2026-05-17T01:15:43.366Z` with
  `volume24h=1059163.39836359`. The write summary reported
  `notificationCaptureEnabled=false`, `notificationCreated=false`, and
  `notificationSkippedReason=disabled_by_option`. Counts moved from
  `1296 / 195 / 7 / 1` to `1296 / 196 / 7 / 1`, so Notification stayed at 7
  and HolderSnapshot stayed at 1. Telegram send, Token enrich / rescore, queue,
  scheduler, systemd, checkpoint update, and `pnpm smoke` were not run. The
  follow-up `metrics:window-report -- --mint ... --windows 30,60,1440` still
  uses Notification `id=7` as the alert anchor. Metric count is 2 and FDV
  Metric count is 2. The 30m and 60m windows remain `outcomeLabel=no_data`
  because the new Metric arrived after those completed windows. The 24h window
  now includes one post-alert valid FDV sample with
  `peakFdv=243145.21885292`,
  `peakMultipleFromAlert=1.0869155273705746`,
  `timeToPeakMinutes=77.49428333333333`,
  `fdvSampleCoverageLabel=thin`, `isWindowComplete=false`,
  `outcomeIsProvisional=true`, and `outcomeLabel=flat`.
- Short-window post-alert Metric outcome Red check is complete for a second
  mint. Target mint `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump` was selected
  from the GeckoTerminal-origin pump `metricPending` queue because it was
  `mint_only`, had `metricsCount=0`, and was not one of ENRA / AW7 / G4 / P3.
  The first exact command,
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --write`, selected Token
  `id=5375`, wrote Metric `id=1279` at
  `observedAt=2026-05-17T01:55:13.760Z`, and created capture-only
  Notification `id=8` with `notificationCaptureEnabled=true` and
  `notificationCreated=true`. The second exact command,
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --noNotificationCapture
  --write`, wrote Metric `id=1280` at
  `observedAt=2026-05-17T01:57:39.489Z` with
  `notificationCaptureEnabled=false`, `notificationCreated=false`, and
  `notificationSkippedReason=disabled_by_option`. Counts moved from
  `1296 / 196 / 7 / 1` to `1296 / 198 / 8 / 1`; Token and HolderSnapshot counts
  stayed unchanged. Telegram send, HolderSnapshot write, Token enrich / rescore,
  detect, import, queue, scheduler, systemd, checkpoint update, and `pnpm
  smoke` did not run. `metrics:window-report -- --mint ... --windows
  30,60,1440` uses Notification `id=8` as the alert anchor, has
  `metricCount=2`, `fdvMetricCount=2`, `alertFdv=99417.806703657`, and
  `latestFdv=99417.806703657`. The 30m / 60m / 24h windows each have
  `fdvSampleCount=1`, `fdvSampleCoverageLabel=thin`,
  `peakMultipleFromAlert=1`, `timeToPeakMinutes=2.4285666666666668`,
  `outcomeIsProvisional=true`, and `outcomeLabel=flat`, confirming that
  immediate post-alert Metric append can populate short-window outcome values.
- Telegram live-send preflight for captured `metric_appended` Notifications is
  docs-only complete; no `notification:send`, retry, resend, Telegram, or DB
  write command was executed. Current counts are Token / Metric / Notification
  / HolderSnapshot `1296 / 198 / 8 / 1`. Notification `id=7` and `id=8` are
  both `eventType=metric_appended`, `trigger=metric_appended`,
  `status=captured`, `mode=capture_only`, `sentAt=null`, `failedAt=null`,
  `retryCount=0`, `nextRetryAt=null`, `lastAttemptAt=null`,
  `leaseUntil=null`, `workerId=null`, `rawJsonFree=true`, and
  `secretFree=true`. The recommended first Telegram live-send Red target is
  Notification `id=8` because it is the latest captured row tied to the
  short-window outcome check:
  `notificationKey=EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279`,
  `tokenId=5375`, `metricId=1279`. The candidate command is `pnpm -s
  notification:send -- --notificationKey
  EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279
  --trigger metric_appended --live`. `notification:send` is dry-run by
  default, calls the Telegram sender only with explicit `--live`, supports
  only `metric_appended`, blocks already-sent rows, and requires
  `--retryFailed` only for `failed` / `live_send` retry rows. On success it
  updates the existing row to `status=sent`, `mode=live_send`, sets `sentAt`
  and `lastAttemptAt`, and clears `failedAt`, `errorCode`, `reason`,
  `nextRetryAt`, `leaseUntil`, and `workerId`. On failure it updates the
  existing row to `status=failed`, `mode=live_send`, sets `failedAt`,
  `lastAttemptAt`, safe `errorCode`, and `reason=ops_notify_send_failed`, and
  clears `leaseUntil` / `workerId`. It does not create Notification, Token,
  Metric, or HolderSnapshot rows. `retryCount` is not incremented by
  `notification:send`; retry claim / lease helpers are separate and are not
  part of this Red command. The message sent is the stored safe
  `messagePreview` only: event type, mint, metric id, source, status, and
  trigger. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are present in the
  environment, but values were not displayed and must not be printed in the Red
  task.
- Metric result-field policy is fixed in
  `docs/design/metric-result-field-policy.md`. In the MVP, `Metric` rows are
  append-only-ish observation snapshots (`observedAt`, `source`, provider
  `volume24h`, sanitized `rawJson`) and are not aggregate rows for continuously
  updated outcomes. Result fields such as `peakFdv24h`, `peakFdv7d`,
  `peakPrice15m`, `peakPrice1h`, `maxMultiple15m`, `maxMultiple1h`,
  `volume7d`, `timeToPeakMinutes`, `alertedAt`, and
  `peakMultipleFromAlert` are treated as computed outcome fields for
  `metrics:window-report`, not live snapshot write targets for
  `metric:snapshot:geckoterminal`. Outcome persistence remains deferred until
  an `OutcomeSnapshot`, `AlertOutcome`, or equivalent design is approved.
- `Token.entrySnapshot` namespace policy is fixed in
  `docs/design/token-entry-snapshot-policy.md`. Allowed namespaces are
  `firstSeenSourceSnapshot`, `manualObservation`, and `contextCapture`.
  `contextCapture` explicitly covers the already-implemented lightweight
  `geckoterminalTokenSnapshot` and `metaplexMetadataUri` records. It is
  sanitized context only, not a provider full raw-body bucket, not Metric /
  HolderSnapshot / Notification storage, and not an outcome-result store.
- `Token.source` policy is fixed in
  `docs/design/token-source-policy.md`. `Token.source` is the token-level
  current / latest source label and may differ from immutable origin. Origin
  source should read `entrySnapshot.firstSeenSourceSnapshot.source`, then
  `entrySnapshot.manualObservation.source`, then `Token.source` as legacy
  fallback. `Metric.source`, Notification `trigger` / `mode` / `status`,
  `entrySnapshot.contextCapture.*.source`, and `HolderSnapshot.source` are
  separate provenance concepts and must not be treated as interchangeable.
- `Token.metadataStatus` lifecycle policy is fixed in
  `docs/design/metadata-status-policy.md`. Operational values are `mint_only`,
  `partial`, `enriched`, and `unknown` fallback. The basic lifecycle is
  `mint_only -> partial -> enriched`, with forward movement only when metadata
  completeness increases. Source-only updates do not make a token `enriched`
  and should not update `enrichedAt`; `rescoredAt` remains scoring state, not
  metadata lifecycle state. Reports / planners / guards should read
  `metadataStatus` as metadata completeness, not safety, risk, source,
  Notification status, HolderSnapshot status, or outcome label.
- `tokens:compare-report outcomeBucket` legacy policy is fixed in
  `docs/design/compare-report-legacy-outcome-policy.md`. `outcomeBucket` is a
  legacy / provisional / backward-compatible bucket based on older Metric
  result fields, currently latest Metric `maxMultiple15m`, and is not the
  canonical outcome evaluation path. Current outcome review should prefer
  `metrics:window-report` window-level `outcomeLabel` based on FDV window
  maxima, `alertFdv`, and `peakMultipleFromAlert`.
- `Notification` event policy is fixed in
  `docs/design/notification-event-policy.md`. `Notification` is notification
  event history, not Token / Metric / Holder source, not Metric outcome, and
  not a queue system. Known persisted values are `status=captured|sent|failed`,
  `mode=capture_only|live_send`, and `trigger=metric_appended`; ops preview /
  capture flows also use `token_completed` and `loop_complete` as non-DB
  triggers today. `tokenId` and `metricId` remain nullable without Prisma
  relations; `metric_appended` expects a token and requires `metricId` for live
  send / retry. Retry fields are manual retry foundation only, not scheduler /
  systemd / always-on worker completion.
- `Token.reviewFlagsJson` shape policy is fixed in
  `docs/design/review-flags-policy.md`. It is lightweight Token review helper
  JSON, not Metric outcome, `scoreBreakdown`, HolderSnapshot body,
  Notification lifecycle state, provider raw body, or a buy signal. Current
  compatibility keys are `hasWebsite`, `hasX`, `hasTelegram`, `metaplexHit`,
  `descriptionPresent`, and `linkCount`; `community:review` may also record
  `source=manual_community_review`, `reviewedAt`, and `operatorNote`. Future
  writes should move toward a small versioned shape with `schemaVersion`,
  `source`, optional `reviewerType`, `flags`, `note`, and `reviewedAt`, while
  unknown / legacy keys are read conservatively.
- `Token.scoreBreakdown` versioning policy is fixed in
  `docs/design/score-breakdown-policy.md`. `Token.scoreTotal`,
  `Token.scoreRank`, and `Token.scoreBreakdown` are the latest score state and
  latest score explanation, not immutable initial-import score history and not
  notification-time score proof. Current persisted breakdown rows are
  unversioned compatibility JSON with `totals.{core,learned,trend,combo}`,
  `hits[]`, `trendFresh`, `trendCapped`, and `trendOnly`; future writes should
  move toward `schemaVersion`, `scoringVersion`, `computedAt`, `components`,
  optional `hardReject` summary, and lightweight trend metadata. Metric outcome,
  review flags, metadata lifecycle, holder analysis, Notification lifecycle,
  provider raw bodies, dictionaries, and full `data/trend.json` stay out.
- `Token.groupKey` / `groupNote` manual grouping policy is fixed in
  `docs/design/grouping-policy.md`. They are manual analysis helpers for
  operator-chosen narratives, themes, watchlists, campaigns, or batches.
  `groupKey` is not Token source, origin source, dev identity, automatic
  dedupe, score evidence, Notification trigger, Metric outcome, or a buy
  signal. `groupNote` is a short human note and must not store secrets,
  provider raw bodies, Metric outcomes, `scoreBreakdown` bodies,
  HolderSnapshot bodies, Notification lifecycle state, or queue / scheduler /
  worker state.
- Token time anchor policy is fixed in
  `docs/design/time-anchor-policy.md`. DB lifecycle timestamps
  (`createdAt`, `updatedAt`), Token intake (`importedAt`), metadata lifecycle
  (`enrichedAt`), score lifecycle (`rescoredAt`), source detection
  (`entrySnapshot.firstSeenSourceSnapshot.detectedAt`), Metric observation
  (`Metric.observedAt`), Notification lifecycle (`sentAt`, `capturedAt`), and
  report evaluation (`reportGeneratedAt`, `evaluationAt`) are separate.
  `metrics:window-report` resolves `alertedAt` as `--entryAt`, then
  Notification sent/captured time, then firstSeen / imported / created Token
  fallbacks; `evaluationAt` remains report execution time in the MVP.
- `Dev.wallet` identity confidence policy is fixed in
  `docs/design/dev-wallet-policy.md`. `Dev.wallet` is a dev / creator /
  deployer-like wallet label from source or manual input and is treated as an
  exact stored string grouping key, not confirmed person or team identity.
  `Token.devId` links a Token to that wallet label for display, filtering, and
  future comparison, but it is not score evidence, scam confirmation,
  HolderSnapshot evidence, funding-origin proof, bundle proof, Metric outcome,
  Notification lifecycle, or a buy signal. `Dev.note` remains optional manual
  memo text and must not store secrets, provider raw bodies, outcomes, holder
  bodies, notification state, or queue / scheduler / worker state.
- `Metric.rawJson` inspect policy is fixed in
  `docs/design/metric-rawjson-inspect-policy.md`. `Metric.rawJson` remains a
  sanitized provider snapshot, not a provider-complete raw response body.
  `metric:show` is the low-level operator / developer inspect surface that may
  print `rawJson`; normal review surfaces such as `metrics:report`,
  `token:compare`, `tokens:compare-report`, and `metrics:window-report` should
  prefer rawJson-free summaries or internally extracted valid FDV values.
  Secrets, env-derived values, request headers, Telegram credentials,
  `DATABASE_URL`, huge payloads, Notification lifecycle, HolderSnapshot bodies,
  `scoreBreakdown`, and outcome labels must stay out of `rawJson`.
- HolderSnapshot source policy is fixed in
  `docs/design/holder-snapshot-policy.md`. HolderSnapshot is a safe summarized
  holder distribution / holder-risk snapshot, not raw holder capture, not a
  full wallet graph, not scam proof, and not a buy signal. Current
  implementation covers safe-summary shape validation, one-row
  `holder:snapshot:add`, read-only `holder:snapshot:show`,
  `holder:safe-summary:report`, and `holder:gaps:plan`; approved real holder
  source capture remains future enhancement work and is not a 3h / 6h bounded
  monitoring blocker. Concentration fields must be read with `source`,
  `confidence`, and `lpWalletExcluded`; fresh / bundler / same-funding signals
  remain source-dependent review context; `rawFree` and `secretFree` are the
  safety boundary.
- `pnpm holder:gaps:plan` is the read-only planner for
  `holder_distribution_not_recorded`: it lists existing Token rows as future
  `holder_distribution_snapshot` candidates, carries through existing Metric,
  manual observation, and reviewFlagsJson context, and keeps
  `suggestedCommand=null`. It does not fetch external or on-chain holder data,
  does not infer holder fields, does not write DB state, does not add schema,
  and does not enable Telegram, queue, scheduler, systemd, checkpoint,
  `--write`, or `--watch`. The output is planning context, not a buy signal.
- `pnpm community:gaps:plan` is the read-only planner for
  `community_links_not_recorded`: it classifies existing `Token.reviewFlagsJson`
  as missing / invalid / present-without-links / reviewed-without-links /
  present-with-links and suggests the next human-gated enrichment or manual
  community review step as a string only. `source=manual_community_review` with
  `linkCount=0` is treated as `reviewed_no_links`: the community gap remains,
  but the planner no longer repeats a `community:review` command for the same
  reviewed no-link state. Future enrichment can revisit it if links appear.
  Community links are handled through enrichment / reviewFlagsJson, not
  `token:observe`; the planner performs no DB write, external fetch, Telegram
  send, queue, scheduler, systemd, checkpoint, `--write`, or `--watch`, and it
  is not a buy signal. Holder distribution and market condition remain separate
  unsupported capabilities.
- `pnpm community:review` is the manual community review capture foundation for
  `Token.reviewFlagsJson`: it stores the existing community / metadata flags
  (`hasWebsite`, `hasX`, `hasTelegram`, `metaplexHit`, `descriptionPresent`,
  `linkCount`) plus small manual review metadata without schema changes.
  Temp SQLite coverage exists, and the first production one-token Red rehearsal
  was run for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` after backup. That rehearsal
  recorded `source=manual_community_review` with no community links
  (`hasWebsite=false`, `hasX=false`, `hasTelegram=false`, `linkCount=0`), so
  `token:observation` reflects the reviewed no-link state and
  `community:gaps:plan` now reports it as `reviewed_no_links` with no repeated
  manual review command. The saved flags are review context rather than a buy
  signal, and do not enable external fetch, Telegram, automatic retry, queue,
  scheduler, systemd, checkpoint, `--write`, or `--watch` operation.
- `pnpm token:observe` is the manual observation capture foundation for
  `Token.entrySnapshot.manualObservation`; it is a write CLI covered by temp
  SQLite tests and one separately approved production one-token Red rehearsal.
  Future production use still requires an explicit Red approval.
- `pnpm tokens:compare-report` is the multi-token read-only comparison view.
- `pnpm tokens:compare-report` now reports `preFilterCount` and `filteredCount`, and applies `limit` after item-level review-flag filters so sparse review-flag holders are still visible in small result windows.
- `pnpm metrics:report` is the read-only metric inspection view.
- For single-mint Metric time-series inspection, use `pnpm metrics:report -- --mint <MINT> --limit <N>` or `pnpm token:compare -- --mint <MINT>`; `token:show` is best for latestMetric confirmation, while `tokens:compare-report` is best for cohort/latestMetric summaries.
- For multi-token Metric row inspection, use `pnpm metrics:report -- --limit <N>`; it returns multiple Metric rows with rawJson-free market-data presence columns, while `tokens:compare-report` remains the better view for token-level cohort filters, `metricsCount`, and latestMetric summaries.
- The primary Metric inspection views are now aligned on rawJson-free safe summaries: `metrics:report` exposes Metric-row presence fields, `tokens:compare-report` exposes latestMetric presence fields for cohorts, and `token:compare` exposes `safeSummary` for latestMetric / `recentMetrics`.
- `pnpm ops:summary:geckoterminal` is the read-only recent Gecko-origin operations overview.
- `pnpm review:queue:geckoterminal` is the read-only recent Gecko-origin review queue for next-look extraction.
- `pnpm compare:coverage:geckoterminal:dexscreener` is the read-only short-window batch coverage spot check for overlap, Gecko-only, and Dex-only mint sets, with optional bounded Dex recheck for a small Gecko-only sample.

### Current Operational Constraints

- `import:mint` is safe for normal sequential re-runs and returns `created: false` for an existing mint, but concurrent re-runs can still race on the unique `mint` constraint.
- `metric:add` is append-only, so repeated submissions with the same values still create new `Metric` rows.
- Comparison and report CLIs are read-only and do not send Telegram notifications.

### Bounded Gecko Automation Progress

- The GeckoTerminal lane is now usable as a CLI-first, semi-automated bounded
  operation MVP: operators can detect one pump.fun candidate at a time, enrich /
  rescore it, append time-series Metrics, and confirm the result with
  rawJson-free reports.
- The daily bounded-operation entrypoint is now documented in
  `docs/runbooks/gecko-bounded-operation-mvp.md`. It defines the Red / Green
  boundary, exact-command examples, report commands, stop conditions, and the
  rule that Red commands are run only with explicit one-step approval.
- Milestone: the human-triggered bounded operation MVP is complete within its
  intended scope. The confirmed scope is deliberately narrow: `/tmp`-checkpoint
  bounded detect, default checkpoint unused, `--pumpOnly --limit 1` with an
  explicit `--maxIterations`, one operator-approved mint at a time,
  single-mint enrich/rescore, two single-mint Metric appends, and
  rawJson-free confirmation through `metrics:report` and `token:compare`.
  This milestone is not an always-on bot, not systemd readiness, not unbounded
  watch readiness, and not scheduler / queue worker completion.
- The metric snapshot lane now uses the strict single-mint tmux single-run as
  the formal interim operator procedure before systemd or unbounded watch:
  session
  `lowcap-gecko-metric-single` ran one `metric:snapshot:geckoterminal
  -- --mint ... --write` command, wrote
  `/tmp/lowcap-gecko-metric-single.log`, used no `--watch`, naturally exited,
  and appended exactly one Metric for
  `MMeYRRhuFtpJUvHYb7UDsQGDrmB6uKCcMEWsLtopump`. That moved `metricsCount`
  from 1 to 2 with latestMetric `id=1136` at
  `observedAt=2026-05-01T10:51:23.716Z`, source
  `geckoterminal.token_snapshot`, previous Metric `id=1116` at
  `observedAt=2026-04-29T09:31:32.689Z`, `volume24h=0`, and price / fdv /
  reserve / topPool presence all true. `metrics:report -- --mint ... --limit 2`
  showed `1136 -> 1116` rawJson-free, `token:compare` showed
  `metricsCount=2` and `recentMetrics` `1136 -> 1116`, Token fields were not
  updated, and Telegram / detect / watch / enrich / ops / systemd were not
  invoked. The same formal interim operator procedure has now been reproduced
  for `3Gy57Za9VFEMhQsxPZniSjTgNffiXafFAL8juachpump`: the
  `lowcap-gecko-metric-single` tmux single-run naturally exited, created /
  updated `/tmp/lowcap-gecko-metric-single.log`, reported
  `selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
  `writtenCount=1`, and appended exactly one `geckoterminal.token_snapshot`
  Metric. That moved `metricsCount` from 1 to 2 with latestMetric `id=1137`
  at `observedAt=2026-05-01T15:31:56.893Z`, previous Metric `id=1115` at
  `observedAt=2026-04-29T06:45:25.143Z`, `volume24h=0`, and price / fdv /
  reserve / topPool presence all true. `metrics:report -- --mint ... --limit 2`
  showed `1137 -> 1115` rawJson-free, `token:compare` showed
  `metricsCount=2` and `recentMetrics` `1137 -> 1115`, Token fields remained
  `partial / Court Room Memes / Court Room / C / 1 / hardRejected=false`, and
  Telegram / detect / watch / enrich / ops / systemd were not invoked.
- The next GeckoTerminal operating step is not another broad Red rehearsal by
  default. It is bounded human-triggered orchestration design: define how the
  existing detect -> enrich/rescore -> metric snapshot CLIs may be wrapped for
  one operator-approved mint at a time, with dry-run -> write gates, rawJson-free
  confirmation after each Metric write, and stage-specific stop conditions. This
  design must keep Telegram live send, scheduler / queue worker, systemd,
  unbounded watch, default checkpoint operation, ops catchup, and simultaneous
  multi-mint writes out of scope unless a later preflight explicitly promotes
  them. The first contract in that design is now implemented as
  `pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT>`. It is a
  read-only planner, not an executor: it inspects one mint and prints one next
  exact Red command plus side-effect bounds and stop conditions without running
  the command. The real-DB read-only smoke matrix has passed for three stages:
  `3Gy57Za9VFEMhQsxPZniSjTgNffiXafFAL8juachpump` returned
  `currentStage=two_or_more_metrics`, `nextStage=report_confirmation_or_stop`,
  and `nextRedCommand=null`; `7nuUe3Y4pC6PbwbUWe6NKkjaCcZxXa9UoNLYXSC1pump`
  returned `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`, and a
  `lowcap-gecko-metric-single` tmux single-mint command string without running
  it; smoke-only mint `SMOKE_1777155335104_GECKO_COMPARE_NOISE_11` returned
  `currentStage=mint_only_without_metrics`, `nextStage=enrich_write`, and a
  `token:enrich-rescore:geckoterminal --write` command string without running
  it. `partial_without_metrics` remains unconfirmed because the read-only
  `tokens:compare-report` candidate check returned zero matching tokens. The
  planner output did not expose a Metric `rawJson` field, raw payload body, or
  secrets; `rawJsonFreeRequired` and stop-condition wording are specification
  text only. The smoke did not write DB / Token / Metric rows, did not send
  Telegram, did not start tmux, and did not touch watch / systemd.
- The planner is ready only for read-only operator selection before a separate
  human approval gate. The operator procedure is: choose exactly one mint from
  read-only reports, confirm its `token:compare` / `metrics:report` baseline,
  run the planner with the appropriate `--expectedMetricsCount`,
  `--expectedMetadataStatus`, and `--expectedStage` guards, inspect
  `currentStage`, `nextStage`, `guards`, and `nextRedCommand`, verify the
  output is rawJson-free, then paste the proposed command into a separate Red
  approval task without executing it in the selection task. If
  `nextRedCommand=null`, stop at report confirmation. Red execution and docs
  commit / push must remain separate tasks.
- The planner-gated flow has now been exercised once after the human approval
  gate. `7nuUe3Y4pC6PbwbUWe6NKkjaCcZxXa9UoNLYXSC1pump` was selected as a
  `partial_with_one_metric` candidate (`INDIA KASHMIR RAID` / `Inkraid`,
  score `C` / `1`, `hardRejected=false`, previous latestMetric `id=1114` at
  `observedAt=2026-04-29T05:29:14.486Z`). The planner only printed the
  `lowcap-gecko-metric-single` `nextRedCommand` string with side-effect upper
  bound `tmux single-run; target mint one geckoterminal.token_snapshot Metric
  append; writtenCount<=1`. After separate Red approval, that exact command
  ran once and appended Metric `id=1138` at
  `observedAt=2026-05-01T16:56:49.272Z` with source
  `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv / reserve /
  topPool presence all true. The mint moved `metricsCount` from 1 to 2, with
  `recentMetrics` `1138 -> 1114`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields remained
  `partial / INDIA KASHMIR RAID / Inkraid / C / 1 / hardRejected=false`, and
  Telegram / detect / watch / enrich / ops / systemd / checkpoint operations
  were not invoked.
- The same planner-gated single-mint Metric flow has now been reproduced for
  `GaUK8sUuGfLUD15sZmKhwtBk6Y9PHybdzUzYaSaLpump`. The planner selection
  baseline was `partial / CheatGPT / CheatGPT / C / 0 / hardRejected=false`
  with `metricsCount=1`, latestMetric `id=1113` at
  `observedAt=2026-04-29T04:18:39.953Z`, source
  `geckoterminal.token_snapshot`, and `volume24h=58.4719055192`. The planner
  only printed `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`, and the
  `lowcap-gecko-metric-single` `nextRedCommand` string with side-effect upper
  bound `tmux single-run; target mint one geckoterminal.token_snapshot Metric
  append; writtenCount<=1`. After a separate human gate, that exact command
  ran once and appended Metric `id=1139` at
  `observedAt=2026-05-01T17:24:03.489Z` with source
  `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv / reserve /
  topPool presence all true. The mint moved `metricsCount` from 1 to 2, with
  `recentMetrics` `1139 -> 1113`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields remained
  `partial / CheatGPT / CheatGPT / C / 0 / hardRejected=false`, and Telegram /
  detect / watch / enrich / ops / systemd / checkpoint operations were not
  invoked.
- The read-only planner now supports `--expectedMetricsCount <number>` as a Red
  preflight guard against metricsCount drift. When the expected count does not
  match the actual count, the planner returns `status=stop`,
  `currentStage=guard_mismatch`, `nextStage=null`, `nextRedCommand=null`, and
  actual `guards.metricsCount`; invalid values such as non-numeric, empty,
  negative, or fractional counts return `currentStage=invalid_args` and do not
  print a Red command. Missing Token still takes priority as `missing_token`.
  The guard keeps the existing read-only / non-executor contract and does not
  expose Metric `rawJson`.
- The new guard passed a real-DB read-only smoke on
  `GaUK8sUuGfLUD15sZmKhwtBk6Y9PHybdzUzYaSaLpump` with
  `pnpm -s ops:gecko:single-candidate:plan -- --mint ... --expectedMetricsCount 2`:
  actual `metricsCount=2` matched, `currentStage=two_or_more_metrics`,
  `nextRedCommand=null`, and the output remained rawJson-free. That smoke did
  not write DB / Token / Metric rows, did not send Telegram, and did not start
  tmux / watch / systemd.
- The read-only planner now also supports `--expectedMetadataStatus <status>`
  as a Red preflight guard against metadataStatus drift. Allowed values are
  `mint_only`, `partial`, and `enriched`. When the expected status does not
  match the actual token status, the planner returns `status=stop`,
  `currentStage=guard_mismatch`, `nextStage=null`, `nextRedCommand=null`,
  `sideEffectUpperBound=null`, and actual `guards.metadataStatus`; unknown or
  empty status values return `currentStage=invalid_args` and do not print a Red
  command. Token missing still takes priority as `missing_token`, and the
  planner remains read-only / non-executing.
- The metadataStatus guard passed a real-DB read-only smoke on
  `7G1KRX4PvHWgJStBrsp8CVKEoZEVF336HTz6kjncpump` with
  `pnpm -s ops:gecko:single-candidate:plan -- --mint ... --expectedMetricsCount 2 --expectedMetadataStatus partial`:
  actual `metricsCount=2` and `metadataStatus=partial` matched,
  `currentStage=two_or_more_metrics`, `nextRedCommand=null`, and the output
  remained rawJson-free. That smoke did not write DB / Token / Metric rows, did
  not send Telegram, and did not start tmux / watch / systemd.
- The read-only planner now also supports `--expectedStage <stage>` as a Red
  preflight guard against currentStage drift. Allowed values are
  `mint_only_without_metrics`, `partial_without_metrics`,
  `partial_with_one_metric`, `two_or_more_metrics`, and
  `manual_review_required`; `missing_mint_arg`, `invalid_args`,
  `guard_mismatch`, and `missing_token` are not valid expected stages because
  they are parse / error / missing states. When the expected stage does not
  match the actual planner stage, the planner returns `status=stop`,
  `currentStage=guard_mismatch`, `nextStage=null`, `nextRedCommand=null`,
  `sideEffectUpperBound=null`, and actual `guards`. Unknown stage values return
  `currentStage=invalid_args` and do not print a Red command. Token missing
  still takes priority as `missing_token`; `--expectedMetadataStatus` and
  `--expectedMetricsCount` mismatches are evaluated before
  `--expectedStage`. For `hardRejected=true` or latestMetric source mismatch,
  actual stage is `manual_review_required`; matching
  `--expectedStage manual_review_required` preserves that stop, while any other
  expected stage returns `guard_mismatch`.
- The stage guard passed a real-DB read-only smoke on
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump` with
  `pnpm -s ops:gecko:single-candidate:plan -- --mint ... --expectedMetricsCount 2 --expectedMetadataStatus partial --expectedStage two_or_more_metrics`:
  actual `guards.metricsCount=2`, `guards.metadataStatus=partial`, and
  `currentStage=two_or_more_metrics` matched, `nextRedCommand=null`, and the
  output remained rawJson-free. That smoke did not write DB / Token / Metric
  rows, did not send Telegram, and did not start tmux / watch / systemd.
- The read-only planner output now includes machine-readable safety metadata
  fields while preserving the existing `nextRedCommand` string / null field:
  `nextRedCommandKind`, `requiresHumanApproval`, `executor`, and
  `willExecute`. The runbook now lists the three non-null
  `nextRedCommandKind` literals for strict implementation / test / docs
  consistency checks: `gecko_enrich_rescore_single_mint`,
  `gecko_metric_snapshot_single_mint`, and `tmux_metric_single_mint`. When a
  Red command is present, the planner marks it as
  `requiresHumanApproval=true`, `executor="human"`, and
  `willExecute=false`; when no Red command is present, it returns
  `nextRedCommandKind=null`, `requiresHumanApproval=false`,
  `executor="none"`, and `willExecute=false`. The fields are metadata only:
  the planner remains read-only / non-executing and never runs the printed Red
  command. A real-DB read-only smoke on
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump` confirmed
  `currentStage=two_or_more_metrics`, `nextRedCommand=null`,
  `nextRedCommandKind=null`, `requiresHumanApproval=false`,
  `executor="none"`, `willExecute=false`, and rawJson-free output. That smoke
  did not write DB / Token / Metric rows, did not send Telegram, and did not
  start watch / tmux / systemd.
- The read-only planner output now also includes `sideEffectUpperBoundSpec`
  while preserving the existing `sideEffectUpperBound` string,
  `stopConditions`, and `nextRedCommand` fields. The spec makes the side-effect
  upper bound machine-readable with `metricWriteMax`, `tokenWrite`,
  `tokenWriteMax`, `telegramSend`, `tmux`, `tmuxSession`, `checkpointWrite`,
  `systemd`, and `multiMint`. A real-DB read-only smoke on
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump` confirmed the no-Red-command
  shape: `currentStage=two_or_more_metrics`, `nextRedCommand=null`,
  `nextRedCommandKind=null`, `executor="none"`, `willExecute=false`,
  `sideEffectUpperBoundSpec.metricWriteMax=0`, `tokenWrite=false`,
  `telegramSend=false`, `tmux=false`, and rawJson-free output. That smoke did
  not write DB / Token / Metric rows, did not send Telegram, and did not start
  watch / tmux / systemd.
- The read-only planner output now also includes `stopConditionCodes` while
  preserving the existing human-readable `stopConditions` string array. The
  codes are a standard machine-readable checklist for Red approval preflight,
  not an active error list; `currentStage` and `reason` remain the fields that
  describe the actual stop state. The code set is
  `mint_missing_or_ambiguous`, `guard_mismatch`, `invalid_args`,
  `selected_count_gt_1`, `written_count_gt_1`, `error_count_gt_0`,
  `rawjson_output_risk`, `secret_output_risk`,
  `telegram_expansion_risk`, `ops_expansion_risk`,
  `systemd_expansion_risk`, `scheduler_queue_expansion_risk`,
  `unbounded_watch_expansion_risk`, `default_checkpoint_expansion_risk`, and
  `git_dirty`. A real-DB read-only smoke on
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump` confirmed
  `currentStage=two_or_more_metrics`, `nextRedCommand=null`,
  `sideEffectUpperBoundSpec.metricWriteMax=0`, `stopConditionCodes` present
  with common codes including `git_dirty`, `guard_mismatch`, and
  `rawjson_output_risk`, and rawJson-free output. That smoke did not write DB /
  Token / Metric rows, did not send Telegram, did not execute a Red command,
  and did not start watch / tmux / systemd.
- `ops:gecko:single-candidate:validate` is now implemented as a read-only
  planner output validator. It accepts `--plannerJson <FILE>` or stdin JSON,
  checks only the planner output JSON, and returns `approvalReady` plus
  `canProceedToHumanGate` with per-field `checks`. It does not run the planner,
  execute `nextRedCommand`, start tmux, attach `--write`, connect to DB /
  Prisma / network, use child-process execution, send Telegram, or touch
  systemd / scheduler / queue / unbounded watch behavior. It returns
  `approvalReady=true` only when planner `status=ok`, a known
  `nextRedCommandKind` and non-empty `nextRedCommand` are present,
  `requiresHumanApproval=true`, `executor="human"`, `willExecute=false`,
  `sideEffectUpperBoundSpec` is within bounds, required `stopConditionCodes`
  are present, and the JSON is rawJson-free with no secret/env marker. It stops
  on no input, invalid JSON, both stdin and file input, `nextRedCommand=null`,
  planner stop / guard / missing / manual-review stages, approval metadata
  mismatch, side-effect upper-bound expansion, required code gaps, or rawJson /
  secret marker detection. If rawJson or a secret/env marker is detected, it
  stops and does not reprint `nextRedCommand`. Fixture-based validator smoke
  confirmed `approvalReady=true` / `canProceedToHumanGate=true` without
  executing the Red command. Validator safety coverage now pins ok paths for
  `gecko_enrich_rescore_single_mint`, `gecko_metric_snapshot_single_mint`, and
  `tmux_metric_single_mint`; stop paths for unknown `nextRedCommandKind`,
  `missing_token`, `missing_mint_arg`, `tokenWriteMax > 1`, raw payload marker,
  rawJson key, secret marker, required-code gaps, and side-effect expansion;
  and the rule that unsafe marker detection does not reprint `nextRedCommand`.
  That smoke and coverage work did not write DB / Token / Metric rows, did not
  send Telegram, and did not start watch / tmux / systemd.
- Milestone: the approval boundary for one GeckoTerminal single-candidate
  follow-up is now planner -> validator -> human gate -> Red exact command. In
  that boundary, the planner performs read-only stage selection for exactly one
  mint, supports the three guards `--expectedMetricsCount`,
  `--expectedMetadataStatus`, and `--expectedStage`, and only prints
  `nextRedCommand` text plus safety metadata. The validator checks the saved or
  piped planner JSON, returns `approvalReady` /
  `canProceedToHumanGate`, and stops on rawJson / secret-marker risk. Neither
  planner nor validator executes the Red command, starts tmux, attaches
  `--write`, connects to DB / network, sends Telegram, or touches systemd /
  scheduler / queue / unbounded watch behavior. The boundary is an approval
  aid, not an executor, orchestrator, scheduler, queue worker, or live-send
  path. Systemd, default checkpoint operation, unbounded watch, and Telegram
  live send remain unapproved. Next useful work is either docs-only operator
  procedure polish, using planner -> validator smoke before human approval in
  real operations, or a separate bounded detect -> enrich/rescore -> metric
  orchestration design; more same-shape Red reproductions are lower priority.
- `ops:gecko:bounded-flow:guide` is now implemented as a non-executor guide
  for the bounded operator flow. It accepts `--mint <MINT>` plus optional
  planner guards, returns JSON with `status`, `reason`, `mint`,
  `mode="non_executor_guide"`, `willExecute=false`, `executor="human"`,
  `rawJsonFreeRequired=true`, `steps`, `forbidden`, and `notes`, and prints
  command strings / stage order only. The stage order is
  `baseline -> planner -> validator -> human_gate -> red_execution ->
  report_confirmation -> docs_record`; every step has
  `willExecute=false`, and `red_execution` is only a placeholder for a
  separate human-approved Red task. The guide does not run existing CLI
  commands, planner, validator, `nextRedCommand`, `--write`, `--watch`, tmux,
  DB / Prisma / network, Telegram, systemd, scheduler / queue, unbounded watch,
  default checkpoint, multi-mint work, or silent retry. The guide smoke passed
  as a read-only CLI check after sandbox IPC required an escalated read-only
  run, with planner / validator command strings visible and no Red command
  execution. That work did not write DB / Token / Metric rows, did not send
  Telegram, and did not start watch / tmux / systemd.
- Milestone: `ops:gecko:bounded-flow:guide` now has implementation / tests /
  docs consistency through the input shape, output shape, stage order,
  non-executor boundary, and full forbidden list. The guide remains a one-mint
  operator aid layered above planner -> validator -> human gate; it does not
  execute existing CLI commands, planner, validator, or `nextRedCommand`. The
  forbidden list is fixed in tests by full equality for all 13 entries:
  existing CLI execution by guide, `nextRedCommand` execution, `--write`
  execution, `--watch` execution, tmux start, Telegram send, systemd,
  scheduler, queue, unbounded watch, default checkpoint, multi-mint, and silent
  retry. `red_execution` remains a placeholder with no commands, and systemd /
  scheduler / queue / unbounded watch / default checkpoint remain deferred.
- `ops:gecko:bounded-flow:plan` is now implemented as the non-executor wrapper
  / dry-run planner CLI for the already documented plan shape. It accepts one
  mint plus one intent (`enrich_rescore`, `first_metric_snapshot`, or
  `second_metric_snapshot`) and optional expected guards, then renders the
  operator-facing checklist JSON with `mode=non_executor_wrapper`,
  `willExecute=false`, `executor=human`, `operatorMode=human_gated`,
  `currentStage=null`, `nextStage=null`, `redExecution.placeholder=true`,
  `redExecution.exactCommand=null`, `sideEffectUpperBoundSpec`,
  `stopConditionCodes`, `forbidden`, and `rawJsonFreeRequired=true`. The
  default guards are `0 / mint_only / mint_only_without_metrics` for
  `enrich_rescore`, `0 / partial / partial_without_metrics` for
  `first_metric_snapshot`, and `1 / partial / partial_with_one_metric` for
  `second_metric_snapshot`; explicit guard conflicts stop with an intent
  conflict. This CLI only assembles command strings and the approval request
  skeleton. It does not run existing CLIs, guide, planner, validator,
  `nextRedCommand`, or any Red command; it has no DB / Prisma / network /
  child-process / fs dependency, does not attach `--write` or `--watch`, does
  not start tmux, does not send Telegram, and does not touch checkpoints,
  systemd, scheduler / queue, unbounded watch, or default checkpoint operation.
  When `status=stop`, the implementation returns `commands=null`; therefore
  `redExecution` and `exactCommand` are not present at all. That stop output is
  the safer behavior because it prints no concrete tmux or `--write` command;
  `status` / `reason` carry the stop cause, while `stopConditionCodes` remains
  the human-gate checklist.
- `1ae2fd4` fixed the `bounded-flow:plan` stop output safety in tests via
  `assertStopOutputSafety`. Missing `--mint`, missing `--intent`, invalid /
  duplicate `--intent`, invalid expected guard args, and intent-conflict stops
  now explicitly assert `commands=null`, common non-executor fields,
  `stopConditionCodes` / `forbidden`, rawJson-free output, and no
  `exactCommand` or concrete tmux / Metric snapshot / enrich-rescore / detect
  command. The `status=ok` path still keeps
  `redExecution.placeholder=true` and `redExecution.exactCommand=null`.
- The follow-up consistency check for `ba8792b` passed across docs,
  implementation, and tests: `status=stop` uses `commands=null` and emits no
  `redExecution`, `exactCommand`, or concrete command, while `status=ok` still
  emits commands with `redExecution.placeholder=true` and
  `exactCommand=null`. The non-executor boundary remains intact: no existing
  CLI, guide, planner, validator, `nextRedCommand`, Red command, DB / Token /
  Metric write, Telegram, tmux, checkpoint, or systemd work is performed.
- The read-only consistency check for `fa3ccac` also passed across the docs:
  the `status=ok` / `status=stop` output semantics remain aligned, stop output
  still uses `commands=null` with no `redExecution`, `exactCommand`, or concrete
  command, and `bounded-flow:plan` remains a non-executor planning aid. Automatic
  Red execution, executor wrapper, always-on operation, systemd, scheduler /
  queue, unbounded watch, and default checkpoint operation remain unimplemented
  or deferred.
- The follow-up read-only consistency check for `7a1e410` also passed across
  the docs. The records still agree that ok output has commands plus
  `redExecution.placeholder=true` and `exactCommand=null`, stop output has
  `commands=null` with no `redExecution`, no `exactCommand`, and no concrete
  command, and `bounded-flow:plan` remains a non-executor planning aid. Automatic
  Red execution, executor wrapper, always-on operation, systemd, scheduler /
  queue, unbounded watch, and default checkpoint operation remain deferred.
- The operator flow for `ops:gecko:bounded-flow:plan` is now fixed as
  docs-only guidance: run `bounded-flow:plan` first to assemble the operator
  packet / approval skeleton / checklist, then run `bounded-flow:guide` to
  review the intent-specific stage order, then run
  `single-candidate:plan` for the actual DB-backed `currentStage`,
  `nextStage`, `nextRedCommand`, and `sideEffectUpperBoundSpec`, then run
  `single-candidate:validate` to check `approvalReady` and
  `canProceedToHumanGate`, then stop at the human gate. A Red exact command is
  executed only later in a separate Red task after approval, and only as one
  exact command. `bounded-flow:plan` does not execute the guide, planner,
  validator, `nextRedCommand`, or any Red command, and it remains
  `mode=non_executor_wrapper` rather than an executor wrapper.
- The read-only consistency check for `3388751` passed across the docs. The
  recorded operator flow remains aligned as `bounded-flow:plan` ->
  `bounded-flow:guide` -> `single-candidate:plan` ->
  `single-candidate:validate` -> human gate -> Red exact command. The role
  split remains unchanged: `plan` is the skeleton / checklist / command-string
  packet, `guide` is the intent-specific stage-order guide, planner performs
  the DB-backed stage / `nextRedCommand` selection, validator checks
  `approvalReady` / `canProceedToHumanGate`, the human gate is not automatic
  execution, and Red execution stays a separate exact-command task. Automatic
  Red execution, executor wrapper, always-on operation, systemd, scheduler /
  queue, unbounded watch, and default checkpoint operation remain deferred.
- The read-only consistency check for `6296e05` also passed across the docs.
  The operator flow remains aligned with the same recommended order:
  `bounded-flow:plan` -> `bounded-flow:guide` ->
  `single-candidate:plan` -> `single-candidate:validate` -> human gate -> Red
  exact command. `bounded-flow:plan` remains the non-executor planning aid and
  does not run guide, planner, validator, `nextRedCommand`, or any Red command.
  `approvalReady=true` / `canProceedToHumanGate=true` remains a human-gate
  condition, not automatic execution. Automatic Red execution, executor
  wrapper, always-on operation, systemd, scheduler / queue, unbounded watch,
  and default checkpoint operation remain deferred.
- The read-only consistency check for `b9abee6` also passed across the docs.
  The operator flow remains aligned as `bounded-flow:plan` ->
  `bounded-flow:guide` -> `single-candidate:plan` ->
  `single-candidate:validate` -> human gate -> Red exact command. The role
  split remains unchanged: `plan` is the operator packet / approval skeleton /
  checklist entrypoint, `guide` reviews the intent-specific stage order,
  planner performs the DB-backed stage / `nextRedCommand` selection, validator
  checks `approvalReady` / `canProceedToHumanGate`, the human gate is the
  non-automatic execution boundary, and Red is a separate exact-command task.
  `bounded-flow:plan` remains a `non_executor_wrapper` planning aid and does
  not run guide, planner, validator, `nextRedCommand`, or Red.
- The always-on readiness gap is now narrowed to checkpoint / restart /
  duplicate-prevention / retry policy before any further automation. The
  current policy keeps `/tmp` checkpoints for bounded Red runs only and keeps
  the default Gecko checkpoint (`data/checkpoints/geckoterminal-new-pools.json`)
  unpromoted. DB state is the first confirmation target, checkpoint cursors are
  detect cursors rather than proof of Token / Metric success, docs records are
  operator logs rather than runtime state, and latest Metric is Metric-stage
  evidence rather than a detect checkpoint substitute. The safe operating unit
  remains one mint, one stage, one human gate, and one exact command.
- Authoritative state / checkpoint-DB ordering / restart-resume policy is now
  fixed for the bounded human-gated scope. DB state is the first restart
  confirmation target; checkpoint remains only a detect cursor; CLI output is
  the immediate execution result; docs record is an operator audit log; latest
  Metric is Metric-stage evidence. If checkpoint and DB disagree, if a write
  was interrupted before report confirmation, or if Red finished before docs
  record, do not rerun Red automatically: inspect read-only DB reports and
  return to human gate on any mismatch.
- Duplicate prevention policy is now fixed as docs-only policy. Token duplicate
  handling uses mint as the first key and the existing `Token.mint` unique /
  existing-token path. Metric duplicate policy keeps time-series append as the
  expected behavior and defines a strict duplicate candidate as same
  `tokenId` / source / `observedAt`; strict Metric duplicate enforcement is
  still not implemented by DB constraint or pre-insert check.
- Retry / failure handling policy is now fixed as docs-only operator policy:
  retry decisions use DB read confirmation, not checkpoint state; ambiguous
  write results do not allow automatic retry; `errorCount > 0`,
  `selectedCount > 1`, `writtenCount > 1`, and `importedCount > 1` stop the
  current bounded flow and return to human gate. Retry automation, runtime
  retry max count implementation, cooldown automation, queue idempotency,
  systemd recovery, and Telegram failed-send retry remain unimplemented or
  unfixed.
- Cooldown / retry max count policy is now fixed as docs-only operator policy.
  Operator-level Red retry max is automatic `0`: Red exact commands are never
  retried automatically, and any rerun requires a new human-approved Red gate.
  Cooldown is only a re-check / human-gate timing hint, not automatic retry.
  Existing watch / wrapper cooldown sleeps remain implementation-local and do
  not promote retry automation. Telegram failed-send retry, queue idempotency,
  systemd recovery, unbounded watch, and default checkpoint operation remain
  unresolved or deferred.
- Default checkpoint promotion gate is now fixed as docs-only policy. The
  default Gecko detect checkpoint path remains
  `data/checkpoints/geckoterminal-new-pools.json`, but it is still unpromoted
  and has not been created, updated, or placed into operation by this record.
  `/tmp` checkpoints remain the bounded Red run / rehearsal lane. Promotion
  requires the fixed authoritative-state, duplicate-prevention,
  retry/failure, operator cooldown/retry, log/secret-free, Telegram separation,
  multi-candidate / queue, and mismatch stop-condition gates. Even after a
  future promotion, the checkpoint stays a detect cursor rather than write
  success proof, and it does not make systemd, scheduler / queue, unbounded
  watch, always-on operation, automatic Red execution, or bounded executor
  work ready. The future first create/update of the default checkpoint requires
  a separate bounded Red approval with an explicit side-effect upper bound.
- Log / secret-free policy is now fixed as docs-only policy for the bounded
  human-gated scope. Operator records may include safe summaries such as
  `status`, `reason`, count fields, mint / Metric ids, sources, observed
  timestamps, checkpoint path / source / cursor summaries, and rawJson-free
  safe-summary booleans. Operator records, Telegram output, pasted reports,
  tmux summaries, and future journal excerpts must not include `.env`
  contents, `DATABASE_URL`, Telegram bot tokens or chat ids, raw env, raw
  stdout / stderr blobs, full command args that may contain secrets, exact
  `"rawJson":` payloads, raw API response bodies, raw payloads, metadata raw
  objects, or any line / blob with a secret marker. `/tmp` logs remain
  auxiliary evidence and should be summarized rather than pasted raw. This
  policy is a readiness gate for systemd, default checkpoint promotion, and
  Telegram live-loop work, but log redaction implementation, systemd journal
  readiness, default checkpoint operation, Telegram live-loop integration, and
  retention / rotation implementation remain unimplemented or deferred.
- Telegram live loop policy is now fixed as docs-only policy. The initial live
  send candidate is only `metric_appended`, after DB read confirmation,
  capture-only rehearsal, safe marker checks, and a human gate. The initial
  duplicate notification key is `mint + eventType + metricId`; events without
  `metricId` stay capture-only. The `metric_appended` sent / failed marking
  path is implemented with mocked sender and temp-SQLite tests, but real
  Telegram live send and Red live-send rehearsal remain unexecuted.
  `token_completed` and `loop_complete` remain capture-only, and Telegram
  failed-send retry, cooldown automation, queue idempotency, live-loop
  execution, and systemd recovery remain unimplemented.
- Multi-candidate / queue pre-gate policy is now fixed as docs-only policy.
  The current safe unit remains one mint, one stage, one human gate, one exact
  Red command, rawJson-free / secret-free confirmation, and a docs record.
  Durable notification dedupe policy is fixed for the initial Telegram key
  `mint + eventType + metricId`; schema, DB table, minimal repository, and the
  `metric_appended` capture-only Notification record write integration now
  exist. Commit `442cf8e` also adds the
  `metric:snapshot:geckoterminal -- --mint <MINT> --write` single-mint
  Notification capture hook for `metric_appended`. Batch / limit
  `metric:snapshot` Notification writes and broader runtime Notification
  record write integration remain incomplete. The first production Red
  rehearsal for this hook succeeded on
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`: backup
  `/tmp/lowcap-dev.db.before-metric-snapshot-notification-20260509T135724Z.bak`
  was created, Token count stayed `1107 -> 1107`, Metric count moved
  `191 -> 192`, Notification count moved `0 -> 1`, Metric `1264` was created
  for token `5043`, and Notification `1` used
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264` with
  `eventType=metric_appended`, `trigger=metric_appended`, `status=captured`,
  `mode=capture_only`, `source=metric:snapshot:geckoterminal`,
  `rawJsonFree=true`, and `secretFree=true`. Rollback was not needed and
  restore was not executed.
  Commit `2d83b05` adds the `metric_appended` live-send marking path behind a
  mocked sender test boundary: it looks up the existing
  `${mint}:metric_appended:${metricId}` Notification row, only calls the sender
  when the row is `captured` / `capture_only`, blocks missing rows, already
  `sent` rows, and non-captured rows, and marks success as `status=sent`,
  `mode=live_send`, with `sentAt` set. Mocked sender failure marks
  `status=failed`, `mode=live_send`, `failedAt`, and safe `errorCode` /
  `reason`. It does not create Notification rows, does not add Metric / Token
  writes, and does not store Telegram response bodies, request paths, bot
  tokens, chat ids, or env values.
  Docs records remain audit logs, and capture records / DB state remain
  confirmation inputs rather than the queue runtime's dedupe store.
  Capture-only rehearsal consistency is now fixed as docs-only policy: capture
  is a rehearsal before live send, not a live send; pass requires the expected
  trigger / event type / mint, a `metricId` for `metric_appended`, computable
  duplicate key, safe message preview, marker check pass, and DB read
  confirmation alignment. Capture-only pass alone still does not complete
  durable dedupe.
- Durable notification dedupe storage policy is now fixed as docs-only policy.
  The initial durable identity is the `metric_appended` notification key
  `mint + eventType + metricId`; `token_completed` and `loop_complete` remain
  capture-only because they do not have the initial `metricId` key. Future
  storage must distinguish `capture_only` from `live_send`, and `captured`,
  `sent`, `failed`, `skipped`, and `blocked` states; only a human-gated
  live-send result with `sentAt` is treated as sent. The Notification DB table
  now exists in `prisma/dev.db`, the minimal Notification repository is
  implemented, and `ops:catchup:gecko` now records the selected
  `metric_appended` capture-only Notification row. The `metric_appended`
  sent / failed marking path is implemented with mocked sender and temp-SQLite
  coverage; the notificationKey-specified real Telegram live-send rehearsal for
  one `metric_appended` row is complete. `token_completed` / `loop_complete`
  Notification writes, automatic failed-send retry, Telegram live-loop
  integration, queue idempotency, and systemd recovery remain unimplemented.
- Failed-send / resend policy is now fixed as docs-only policy, and commit
  `a5d1575` implements the manual retry path for `notification:send`. `failed`
  is not `sent`, previous `sent` on the same notification key blocks resend,
  and `--retryFailed` is required before a `failed` / `live_send` row can be
  retried. Sent row resend remains prohibited even with `--retryFailed`.
  Automatic failed-send retry remains unimplemented.
- Notification model boundary / lifecycle policy is now fixed as docs-only
  policy, and the first schema cut is now present in `prisma/schema.prisma`.
  The model responsibility remains durable notification dedupe, capture-only /
  live-send lifecycle state, failed-send / resend evidence, and Telegram
  live-loop readiness input; it remains separate from queue idempotency.
  `Notification` uses `notificationKey` as the durable identity,
  `mint + eventType + metricId` as the initial `metric_appended` key,
  nullable scalar `tokenId` / `metricId` fields without Prisma relations, String
  `status` / `mode`, and `sentAt` as the future sent proof. Migration apply /
  DB table creation for `Notification` is complete, and the
  `metric_appended` capture-only write integration is implemented. Durable
  storage runtime beyond the narrow `metric_appended` capture hooks,
  `token_completed` / `loop_complete` writes, Telegram live-loop integration,
  queue idempotency, and systemd recovery remain unimplemented.
- Notification model / migration baseline policy is now fixed as docs-only
  policy. The repo currently has `prisma/schema.prisma`, `prisma/dev.db`, and
  formal migration files under `prisma/migrations`; the first Yellow schema cut
  added `Notification`, schema-level inspection test coverage, and a
  `/tmp/add_notification.sql` SQL preview. `prisma validate`, `prisma generate`,
  `tsc`, and the schema-level test passed during that Yellow. The Red DB apply
  created `/tmp/lowcap-dev.db.before-notification-20260509T111516Z.bak`,
  resolved `20260509000100_baseline_existing_schema` as applied, deployed
  `20260509000200_add_notification`, created the `Notification` table,
  created `Notification_notificationKey_key`, and left `Notification` count at
  0 with `Dev=0`, `Token=1107`, and `Metric=191`.
- Notification repository is now minimally implemented in
  `src/notifications/notificationRepository.ts`, with
  `tests/notificationRepository.test.ts` covering temp-SQLite behavior. The
  API is `findNotificationByKey`, `createCapturedNotification`,
  `maybeCreateByNotificationKey`, `markNotificationSent`, and
  `markNotificationFailed`. It injects PrismaClient / the notification delegate
  instead of binding to the `src/cli/db.ts` singleton, uses explicit
  create/update field mapping, and throws when forbidden never-store input keys
  are present. The repository test wrote only to temp SQLite, not
  `prisma/dev.db`. Commit `905d3ac` connects this repository to the
  `ops:catchup:gecko` capture-only path for `metric_appended` only, using
  notification key `${mint}:metric_appended:${metricId}`, `status=captured`,
  `mode=capture_only`, and safe `messagePreview`. Missing `mint` / `metricId`
  and multiple captured `metric_appended` records skip without fallback keys;
  each run can create at most one Notification row, and duplicate
  `notificationKey` values do not increase count. Commit `2d83b05` adds the
  `metric_appended` sent / failed marking path for an existing captured row:
  sender success calls `markNotificationSent` and sets `status=sent`,
  `mode=live_send`, and `sentAt`; sender failure calls
  `markNotificationFailed` and sets `status=failed`, `mode=live_send`,
  `failedAt`, and safe `errorCode` / `reason`. It is covered by temp-SQLite
  mocked-sender tests, does not create Notification rows, and keeps sender
  calls and Notification updates to at most one. Commit `983b7e3` adds the
  notificationKey-specified live-send rehearsal path and `pnpm
  notification:send`: the CLI is default dry-run / no-send, requires explicit
  `--live` for a sender call, supports `metric_appended` only, looks up exactly
  one existing Notification row by `notificationKey`, blocks missing rows,
  already `sent` rows, non-`captured` / non-`capture_only` rows, and missing
  `mint` / `metricId`, then uses `markNotificationSent` or
  `markNotificationFailed` with safe `errorCode` / fixed safe `reason`. The
  path creates no Notification rows, adds no Metric / Token writes, stores no
  Telegram response bodies, request paths, bot tokens, chat ids, or env values,
  and is covered by temp-SQLite mocked-sender tests that do not use production
  `prisma/dev.db`, real Telegram, or `.env`. The notificationKey-specified real
  Telegram Red rehearsal is now complete for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264` through
  `pnpm -s notification:send -- --notificationKey <KEY> --trigger metric_appended --live`:
  backup `/tmp/lowcap-dev.db.before-notification-live-send-20260509T151757Z.bak`
  was created, dry-run returned `status=ready`, `senderCalled=false`,
  `sentCount=0`, and `updatedCount=0`, live send returned `status=sent`,
  `senderCalled=true`, `sentCount=1`, and `updatedCount=1`, and only the
  existing Notification row was updated. Counts stayed `Token=1107`,
  `Metric=192`, and `Notification=1`; the row now has
  `eventType=metric_appended`, `trigger=metric_appended`, `status=sent`,
  `mode=live_send`, `sentAt=1778339880613`, `failedAt=null`,
  `errorCode=null`, `reason=null`, `rawJsonFree=1`, and `secretFree=1`.
  Telegram response body, bot token, chat id, and env markers were not stored;
  rollback was unnecessary and restore was not executed. `token_completed` /
  `loop_complete` Notification writes and live-send marking remain later work.
  Commit `a5d1575` adds the manual retry path to `notification:send`:
  `--retryFailed` is required, only a `failed` / `live_send`
  `metric_appended` row selected by `notificationKey` is eligible, and a
  `sent` row is still blocked from resend. Retry success calls
  `markNotificationSent`, sets `status=sent`, `mode=live_send`, and `sentAt`,
  and clears `failedAt`, `errorCode`, and `reason`; retry failure calls
  `markNotificationFailed`, keeps `status=failed`, `mode=live_send`, sets
  `failedAt`, safe `errorCode`, and fixed safe
  `reason=ops_notify_send_failed`. It creates no Notification rows, adds no
  Metric / Token writes, keeps Telegram sender calls and Notification updates
  to at most one, stores no Telegram response body, bot token, chat id, or env,
  and is covered by temp-SQLite mocked-sender tests without production
  `prisma/dev.db`. The real Telegram retry Red rehearsal, automatic retry,
  retry queue, `retryCount` / `nextRetryAt` / cooldown automation, sent row
  resend, queue, scheduler, systemd, durable queue runtime, default checkpoint
  operation, automatic Red execution, unbounded watch, and always-on bot
  operation remain unimplemented / unexecuted.
- Commit `02728ae` adds `notification:retry:plan` as a read-only /
  non-executor retry planner. The CLI script is
  `pnpm -s notification:retry:plan`, output uses
  `mode=read_only_retry_planner`, `willExecute=false`, and
  `executor=human` when a candidate exists or `executor=none` when it stops.
  The planner performs DB write 0, Telegram send 0, and Notification update 0;
  it does not execute `notification:send` and only prints the Red command as a
  `nextRedCommand` string. Selection is limited to `failed` / `live_send`
  `metric_appended` rows with `trigger=metric_appended`, `rawJsonFree=true`,
  `secretFree=true`, non-empty `notificationKey` / `mint`, and present
  `metricId`; `token_completed`, `loop_complete`, `sent`, and `captured` rows
  are excluded. Candidates sort by `failedAt ASC`, `updatedAt ASC`, `id ASC`,
  `selectedCount` is at most 1, and candidate 0 returns `status=stop` with
  `nextRedCommand=null`. When a candidate exists, the printed command is
  `pnpm -s notification:send -- --notificationKey <KEY> --trigger metric_appended --live --retryFailed`;
  its documented side-effect upper bound is Telegram send max 1, Notification
  update max 1, Notification create 0, Token / Metric write 0, and no
  checkpoint / queue / systemd. The focused test uses temp SQLite and does not
  use production `prisma/dev.db`. This is not automatic retry: retry queue,
  scheduler / systemd, `retryCount` / `nextRetryAt` / cooldown automation,
  claim / lease, sent row resend, `token_completed` / `loop_complete` retry,
  default checkpoint operation, unbounded watch, always-on bot, and automatic
  Red command execution remain unimplemented / unenabled.
- The planner-selected manual retry Red rehearsal has now also run through the
  `notification:retry:plan` selected `nextRedCommand`:
  `pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`.
  The target remained
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`.
  Backup
  `/tmp/lowcap-dev.db.before-planner-retry-send-20260510T060558Z.bak` was
  created. Planner confirmation returned `status=ok`, `candidateCount=1`,
  `selectedCount=1`, and a matching `nextRedCommand`; live retry attempted one
  sender call and returned `status=failed`, `senderCalled=true`,
  `sentCount=0`, `updatedCount=1`, and
  `errorCode=telegram_network_error`. Counts stayed `Token=1107`,
  `Metric=192`, and `Notification=2`. The retry target row remains
  `status=failed`, `mode=live_send`, `sentAt=null`,
  `failedAt=1778393159818`, `errorCode=telegram_network_error`,
  `reason=ops_notify_send_failed`, `rawJsonFree=1`, and `secretFree=1`; the
  existing sent row
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264`
  remains `status=sent`, `mode=live_send`, `sentAt=1778339880613`,
  `failedAt=null`, `errorCode=null`, `reason=null`, `rawJsonFree=1`, and
  `secretFree=1`. Telegram response body, bot token, chat id, and env markers
  were not stored; rollback was unnecessary and restore was not executed. This
  is planner-selected failed retry evidence, not retry success. Automatic
  retry, retry queue, `retryCount` / `nextRetryAt` / cooldown automation,
  claim / lease, sent row resend, `token_completed` / `loop_complete` retry,
  queue, scheduler, systemd, durable queue runtime, default checkpoint
  operation, automatic Red execution, unbounded watch, and always-on bot
  operation remain unimplemented / unenabled.
- Commit `300c5fb` adds `docs/philosophy/memecoin-market-model.md` as the
  LowcapBot-specific memecoin market model. It frames LowcapBot as a
  CLI-first, human-gated research OS for attention / narrative / risk /
  community / market condition / outcome observation, not as financial advice,
  a buy signal bot, an auto-trading engine, or always-on readiness.
- The notification retry queue foundation is now present as a
  production-side-effect-free slice. The schema adds retry metadata
  (`retryCount`, `nextRetryAt`, `lastAttemptAt`, `leaseUntil`, and `workerId`)
  plus retry/lease indexes; repository helpers select and claim at most one
  eligible `failed` / `live_send` `metric_appended` row using retry-count,
  schedule, and lease gates. The migration file may exist before production
  apply, but production `prisma/dev.db` must not be migrated in this task.
  Until that migration is applied in a separate Red task, production DB runs of
  retry-field-aware CLIs can fail on missing columns and must remain blocked.
  Automatic retry execution, retry queue workers, scheduler / systemd,
  Telegram live send, sent row resend, default checkpoint operation, unbounded
  watch, and always-on bot operation remain unimplemented / unenabled.
- Notification migration split policy is now fixed as docs-only policy.
  Read-only /tmp SQL preview confirmed
  `/tmp/lowcap-baseline-existing-schema.sql` contains only existing `Dev` /
  `Token` / `Metric` table, index, and FK creation, without `Notification`.
  `/tmp/lowcap-add-notification-only.sql` contains only `CREATE TABLE
  "Notification"` and `CREATE UNIQUE INDEX "Notification_notificationKey_key"`,
  without `Dev` / `Token` / `Metric` drop / alter / create and without
  destructive migration. The formal migration split has now been created as a
  baseline existing schema migration plus an add-notification-only migration.
  The Red apply to existing `prisma/dev.db` is complete: `_prisma_migrations`
  exists with records for `20260509000100_baseline_existing_schema` and
  `20260509000200_add_notification`; `prisma/dev.db` is not dirty in git
  status. `migrate dev` and `db push` remain unrun, and reset / destructive
  migration remain disallowed.
- Multi-candidate ordering / per-item failure handling, log retention /
  rotation implementation, systemd journal readiness, and Telegram runtime
  implementation gaps remain unresolved gates. Default checkpoint operation is
  still unpromoted. Systemd, scheduler / queue, unbounded watch, always-on
  operation, bounded executor prototype, and automatic Red execution remain
  deferred until the remaining gates are fixed.
- The read-only consistency check for `c6ee95e` passed across the docs. The
  checkpoint policy, authoritative state policy, restart / resume gaps, Token
  and Metric duplicate-prevention gaps, retry / failure gaps, multi-candidate
  handling, log / secret-free gaps, and Telegram live-loop gaps are aligned.
  The default checkpoint remains unpromoted, and systemd, scheduler / queue,
  unbounded watch, always-on operation, automatic Red execution, and bounded
  executor prototype remain on hold.
- Read-only smoke for `ops:gecko:bounded-flow:plan` has passed on
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` for all three supported
  intents. `enrich_rescore`, `first_metric_snapshot`, and
  `second_metric_snapshot` all returned `status=ok`,
  `mode=non_executor_wrapper`, `willExecute=false`, `executor=human`,
  `operatorMode=human_gated`, `currentStage=null`, `nextStage=null`,
  `redExecution.placeholder=true`, `redExecution.exactCommand=null`,
  `stopConditionCodes`, `forbidden`, and `rawJsonFreeRequired=true`; no exact
  `"rawJson":` field was printed. The smoke confirmed the default guards and
  side-effect bounds for each intent, including `tokenWrite=true /
  tokenWriteMax=1 / metricWriteMax=0 / tmux=false` for `enrich_rescore`,
  `metricWriteMax=1 / tokenWrite=false / tmux=false` for
  `first_metric_snapshot`, and `metricWriteMax=1 / tokenWrite=false /
  tmux=true / tmuxSession=lowcap-gecko-metric-single` for
  `second_metric_snapshot`. It did not run existing CLIs, guide, planner,
  validator, `nextRedCommand`, or any Red command, did not print a concrete
  tmux new-session command or `--write` Red command in `redExecution`, and did
  not write DB / Token / Metric rows, send Telegram, start tmux, touch
  checkpoints, or touch systemd / scheduler / queue / unbounded watch /
  default checkpoint operation.
- The Gecko bounded operation runbook now includes a Red approval request
  template for the planner -> validator -> human gate flow. It collects repo
  state, target mint, baseline, planner metadata, validator result, rawJson-free
  / secret-marker checks, non-execution confirmations, exact command,
  side-effect upper bound, and stop conditions. `approvalReady=true` /
  `canProceedToHumanGate=true` only moves the flow to human approval; it is not
  automatic execution. Red execution stays a separate exact-command task, and
  docs commit / push stays a later Green docs-only follow-up. Systemd,
  scheduler, queue, unbounded watch, and default checkpoint remain deferred.
- The bounded operation runbook now also fixes the next-phase bounded
  orchestration design boundary for detect -> enrich/rescore -> metric
  snapshot. This is docs-only specification work, not an implemented executor
  wrapper or automatic runner. The boundary keeps the flow to one mint and one
  stage at a time: bounded detect is Red and limited to `/tmp` checkpoint,
  `--pumpOnly`, `--limit 1`, explicit `--maxIterations`, and at most one
  mint-only Token; baseline and report confirmation remain Green read-only;
  enrich/rescore and metric snapshot dry-runs remain Green; their `--write`
  forms remain separate Red exact-command tasks; strict
  `lowcap-gecko-metric-single` remains Red, no-`--watch`, and one Metric max.
  Guide, planner, and validator remain non-executors that can display stage
  order, command strings, `approvalReady`, and `canProceedToHumanGate`, but
  they do not run existing CLIs, `nextRedCommand`, tmux, `--write`, `--watch`,
  DB / Token / Metric writes, network mutation, Telegram, systemd, scheduler,
  queue, unbounded watch, default checkpoint, multi-mint work, or silent retry.
  Red execution and docs commit / push remain separate tasks.
- `ops:gecko:bounded-flow:guide --intent` is now implemented and covered by
  `pnpm exec tsc --noEmit`, `pnpm smoke`, and `pnpm test` in
  `856d0c8 feat: add bounded flow guide intents`. The allowed initial values
  are `second_metric_snapshot`, `first_metric_snapshot`, and
  `enrich_rescore`; they only specialize guard defaults, notes, and the
  `red_execution` placeholder description. The guide remains a non-executor:
  it must not execute existing CLIs, planner, validator, `nextRedCommand`,
  `--write`, `--watch`, tmux, DB / Token / Metric writes, Telegram, systemd,
  scheduler / queue, unbounded watch, default checkpoint, multi-mint work, or
  silent retry. Explicit guard values that conflict with an intent default now
  return `status=stop` with an `intent conflict` reason and
  `willExecute=false`. The existing stage order remains
  `baseline -> planner -> validator -> human_gate -> red_execution ->
  report_confirmation -> docs_record`, the output shape now includes `intent`,
  `expectedMetricsCount`, `expectedMetadataStatus`, and `expectedStage`, and
  the 13-item forbidden list stays unchanged. Read-only guide smoke now passes
  for all three intents on `9eSNHMiLdKtud379HEk73ug7DhVdqRXR5MgFZanzpump`:
  `second_metric_snapshot` applied `expectedMetricsCount=1`,
  `expectedMetadataStatus=partial`, and
  `expectedStage=partial_with_one_metric`; `first_metric_snapshot` applied
  `0`, `partial`, and `partial_without_metrics`; `enrich_rescore` applied
  `0`, `mint_only`, and `mint_only_without_metrics`. Each smoke returned
  `status=ok`, `mode="non_executor_guide"`, top-level `willExecute=false`,
  `executor="human"`, `rawJsonFreeRequired=true`, all steps
  `willExecute=false`, the same stage order, the fixed 13-item forbidden list,
  and `red_execution` as a placeholder with no commands and no concrete tmux
  command; the exact `"rawJson":` field was absent. The implementation and
  guide smoke did not run Red commands, planner, validator, DB / Token /
  Metric writes, Telegram, watch, tmux, systemd, or checkpoint updates. This
  is not an executor wrapper and does not promote systemd, scheduler / queue,
  unbounded watch, default checkpoint use, Telegram live send, or automatic Red
  execution. This marks the bounded-flow guide intent milestone as complete for
  guide-stage intent support: implementation, tests, docs, and read-only smoke
  now agree on the three intents, default guards, output shape, placeholder
  `red_execution`, forbidden list, and rawJson-free output boundary.
- The guarded planner-gated single-mint Metric flow has now been exercised with
  `--expectedMetricsCount 1` before Red approval. Target
  `7G1KRX4PvHWgJStBrsp8CVKEoZEVF336HTz6kjncpump` had baseline
  `partial / Choice / 1# C / C / 0 / hardRejected=false`, `metricsCount=1`,
  latestMetric `id=1112` at `observedAt=2026-04-28T14:35:42.952Z`, source
  `geckoterminal.token_snapshot`, and `volume24h=0`. The planner command
  `pnpm -s ops:gecko:single-candidate:plan -- --mint ... --expectedMetricsCount 1`
  passed with `status=ok`, `guards.metricsCount=1`,
  `currentStage=partial_with_one_metric`, and
  `nextStage=second_metric_write_or_tmux_single`; it only printed the
  `lowcap-gecko-metric-single` `nextRedCommand` string. After a separate human
  gate, that exact command ran once, naturally exited as a no-`--watch`
  single-run, and appended Metric `id=1140` at
  `observedAt=2026-05-01T17:46:40.309Z` with source
  `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv / reserve /
  topPool presence all true. The mint moved `metricsCount` from 1 to 2, with
  `recentMetrics` `1140 -> 1112`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields remained
  unchanged, and Telegram / detect / watch / enrich / ops / systemd /
  checkpoint operations were not invoked.
- The same guarded planner-gated single-mint Metric flow has now also passed
  with both `--expectedMetricsCount 1` and `--expectedMetadataStatus partial`
  before Red approval. Target
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump` had baseline
  `partial / Palantir Manifesto / Manifesto / C / 0 / hardRejected=false`,
  `metricsCount=1`, latestMetric `id=993` at
  `observedAt=2026-04-24T15:44:41.073Z`, and source
  `geckoterminal.token_snapshot`. The guarded planner command passed with
  `status=ok`, actual `guards.metricsCount=1`,
  `guards.metadataStatus=partial`, `currentStage=partial_with_one_metric`, and
  `nextStage=second_metric_write_or_tmux_single`; it only printed the
  `lowcap-gecko-metric-single` `nextRedCommand` string. After a separate human
  gate, that exact command ran once, naturally exited as a no-`--watch`
  single-run, and appended Metric `id=1141` at
  `observedAt=2026-05-02T06:08:23.396Z` with source
  `geckoterminal.token_snapshot` and `volume24h=0`. The latest rawJson-free
  safe presence was `priceUsdPresent=false`, `fdvUsdPresent=false`,
  `reserveUsdPresent=true`, and `topPoolPresent=false`; those false values are
  recorded as observed availability, not a failed write. The mint moved
  `metricsCount` from 1 to 2, with `recentMetrics` `1141 -> 993`;
  `metrics:report -- --mint ... --limit 2` and `token:compare` confirmed the
  result rawJson-free. Token fields remained unchanged, and Telegram / detect /
  watch / enrich / ops / systemd / checkpoint operations were not invoked.
- The first triple-guard planner-gated single-mint Metric flow has now passed
  with `--expectedMetricsCount 1 --expectedMetadataStatus partial --expectedStage partial_with_one_metric`
  before Red approval. Target
  `H2RJiUGeB9LUeAHhKp2JZc836oGonhAYYgB5QPxCpump` had baseline
  `partial / REKT / REKT / C / 0 / hardRejected=false`, `metricsCount=1`,
  latestMetric `id=1102` at `observedAt=2026-04-25T03:28:20.484Z`, source
  `geckoterminal.token_snapshot`, `volume24h=0`, and rawJson-free safe
  presence true for price / fdv / reserve / topPool. The triple-guard planner
  command passed with `status=ok`, actual `guards.metricsCount=1`,
  `guards.metadataStatus=partial`, `currentStage=partial_with_one_metric`, and
  `nextStage=second_metric_write_or_tmux_single`; it only printed the
  `lowcap-gecko-metric-single` `nextRedCommand` string. After a separate human
  gate, that exact command ran once, naturally exited as a no-`--watch`
  single-run with no tmux server remaining, reported `selectedCount=1`,
  `okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
  appended Metric `id=1151` at `observedAt=2026-05-05T14:34:02.700Z` with
  source `geckoterminal.token_snapshot` and `volume24h=0`. The latest
  rawJson-free safe presence was `priceUsdPresent=false`,
  `fdvUsdPresent=false`, `reserveUsdPresent=true`, and
  `topPoolPresent=false`; those false values are recorded as observed
  availability, not a failed write. The mint moved `metricsCount` from 1 to 2,
  with `recentMetrics` `1151 -> 1102`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields remained
  unchanged, and Telegram / detect / watch / enrich / ops / systemd /
  checkpoint operations were not invoked.
- The bounded orchestration Red path has now passed once after
  `ops:gecko:bounded-flow:guide` plus triple-guard planner / validator
  preflight. Target `9eSNHMiLdKtud379HEk73ug7DhVdqRXR5MgFZanzpump` had
  baseline `partial / Magic Internet Money / MIM / C / 0 /
  hardRejected=false`, source `geckoterminal.new_pools`, `metricsCount=1`, and
  latestMetric `id=1005` at `observedAt=2026-04-24T16:51:33.585Z` with source
  `geckoterminal.token_snapshot`. The guide returned
  `mode=non_executor_guide`, all steps `willExecute=false`, and
  `red_execution` as a placeholder. The planner returned
  `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`,
  `nextRedCommandKind=tmux_metric_single_mint`,
  `requiresHumanApproval=true`, `executor=human`, and `willExecute=false`.
  The validator returned `approvalReady=true` and
  `canProceedToHumanGate=true` with checks passing. After the separate human
  gate, exactly one copied `lowcap-gecko-metric-single` command ran as a
  separate Red task, naturally exited as a no-`--watch` single-run, reported
  `selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
  `writtenCount=1`, and appended Metric `id=1233` at
  `observedAt=2026-05-07T14:18:35.735Z` with source
  `geckoterminal.token_snapshot` and `volume24h=0`. The latest rawJson-free
  safe presence was `priceUsdPresent=false`, `fdvUsdPresent=false`,
  `reserveUsdPresent=true`, and `topPoolPresent=false`; these false values are
  snapshot availability observations, not failed Red gates. The mint moved
  `metricsCount` from 1 to 2 with `recentMetrics` `1233 -> 1005`;
  `metrics:report -- --mint ... --limit 2` and `token:compare` confirmed the
  result rawJson-free. Token fields stayed `partial / Magic Internet Money /
  MIM / geckoterminal.new_pools / C / 0 / hardRejected=false`, and Telegram /
  detect / watch / enrich / ops / systemd / checkpoint operations were not
  invoked.
- The bounded-flow guide `--intent second_metric_snapshot` approval path has
  now also passed for
  `GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump`. Baseline was
  `partial / highest in the room / HIGHEST / C / 0 / hardRejected=false`,
  source `geckoterminal.new_pools`, `metricsCount=1`, and latestMetric
  `id=688` at `observedAt=2026-04-21T14:00:50.063Z` with source
  `geckoterminal.token_snapshot`; baseline safe presence was true for price /
  fdv / reserve / topPool. The guide returned `status=ok`,
  `intent=second_metric_snapshot`, `expectedMetricsCount=1`,
  `expectedMetadataStatus=partial`, `expectedStage=partial_with_one_metric`,
  all steps `willExecute=false`, and `red_execution` as a placeholder with no
  concrete tmux command. The planner returned
  `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`,
  `nextRedCommandKind=tmux_metric_single_mint`,
  `requiresHumanApproval=true`, `executor=human`, and `willExecute=false`;
  the validator returned `approvalReady=true` and
  `canProceedToHumanGate=true` with all checks passing. After the separate
  human gate, exactly one copied `lowcap-gecko-metric-single` Red command ran
  as a separate task, naturally exited as a no-`--watch` single-run, reported
  `selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
  `writtenCount=1`, and appended Metric `id=1243` at
  `observedAt=2026-05-08T13:46:44.319Z` with source
  `geckoterminal.token_snapshot` and `volume24h=0`. The latest rawJson-free
  safe presence was `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, and `topPoolPresent=true`. The mint moved
  `metricsCount` from 1 to 2 with `recentMetrics` `1243 -> 688`;
  `metrics:report -- --mint ... --limit 2` and `token:compare` confirmed the
  result rawJson-free. Token fields stayed `partial / highest in the room /
  HIGHEST / geckoterminal.new_pools / C / 0 / hardRejected=false`, and
  Telegram / detect / watch / enrich / ops / systemd / checkpoint operations
  were not invoked.
- The `second_metric_snapshot` intent is now complete as an operating
  milestone: GvQ confirmed the `bounded-flow --intent second_metric_snapshot`
  path through guide, planner, validator, human gate, exactly one Red command,
  one Metric append, rawJson-free confirmation, and docs consistency. Adding
  another same-shape `second_metric_snapshot` Red reproduction is low priority
  unless a new observation has a specific reason. The next intent gates remain
  narrower: the latest read-only `partial + hasMetrics=false` report for
  `first_metric_snapshot` returned `count=143`, `filteredCount=0`, and
  `items=[]`, so no approval preflight target is selected. `enrich_rescore`
  should wait for a natural `mint_only + metricsCount=0` pump candidate:
  `mint_only` rows are present (`filteredCount=200` in the limit-200 check),
  but the checked set was dominated by SMOKE / synthetic-looking rows and no
  natural pump mint was found within the read-only limit-2000 check. SMOKE and
  synthetic-looking rows are not live market candidates. Systemd, scheduler /
  queue,
  unbounded watch, default checkpoint use, executor wrappers, and automatic Red
  execution remain deferred.
- The candidate waiting state has now produced one bounded detect write origin:
  after a read-only `detect:geckoterminal:new-pools -- --pumpOnly --limit 1`
  guard saw a natural Pump.fun pump candidate, exactly one Red command ran:
  `pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --watch
  --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-bounded.json
  --write`. It ran one bounded cycle with `dryRun=false`,
  `writeEnabled=true`, `watchEnabled=true`, `checkpointEnabled=true`,
  `cycleCount=1`, `maxIterations=1`, `selectedCount=1`,
  `acceptedCount=1`, `importedCount=1`, `existingCount=0`, `failedCount=0`,
  and `skippedNonPumpCount=5`, creating mint-only Token
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` from
  `geckoterminal.new_pools` / `Pump.fun`. The token is still
  `metadataStatus=mint_only` with `metricsCount=0`, `latestMetric=null`,
  `name/symbol/description=null`, `hardRejected=false`, `scoreRank=C`,
  `scoreTotal=0`, `enrichedAt=null`, and `rescoredAt=null`. The run created
  only `/tmp/lowcap-gecko-detect-bounded.json` and advanced it to
  `2026-05-08T22:04:05.000Z |
  DWHNrAbt6bL3HuygDiBGBQY51ADxtyMreERS9JuBH3tT`; the default checkpoint stayed
  uncreated / unused. Metric write, enrich/rescore, Telegram, watch
  continuation, tmux, systemd, scheduler / queue, and additional Red commands
  were not invoked. Execution and post-check reports stayed rawJson-free and
  did not expose secret markers.
- The same Ffn2 candidate has now passed the `enrich_rescore` intent Red gate:
  `ops:gecko:bounded-flow:guide -- --intent enrich_rescore`, the guarded
  planner, and the validator all passed read-only with
  `currentStage=mint_only_without_metrics`, `nextStage=enrich_write`,
  `nextRedCommandKind=gecko_enrich_rescore_single_mint`,
  `approvalReady=true`, and `canProceedToHumanGate=true`. After the separate
  human gate, exactly one Red command ran:
  `pnpm -s token:enrich-rescore:geckoterminal -- --mint
  Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump --write`. It selected one mint
  only, reported `ok=1`, `error=0`, `enrichWritten=1`,
  `rescoreWritten=1`, `contextWritten=1`, and `notifySent=0`, and did not use
  `--notify`. The Token moved from `metadataStatus=mint_only` to `partial`
  with `name=Papu`, `symbol=PAPU`, `description=null`,
  `normalizedText=papu papu`, `scoreRank=C`, `scoreTotal=0`,
  `hardRejected=false`, `enrichedAt=2026-05-08T22:38:21.819Z`, and
  `rescoredAt=2026-05-08T22:38:21.830Z`; review flags stayed false for
  website, X, Telegram, Metaplex, and description, with `linkCount=0`.
  `metricsCount` stayed `0`, `latestMetric` stayed `null`, and
  `metrics:report` stayed `count=0` / `items=[]`. Metric write, Telegram,
  detect, watch, tmux, systemd, and checkpoint updates were not invoked. The
  planner / validator / post-check output stayed rawJson-free and did not
  expose secret markers.
- The same Ffn2 candidate has now passed the `first_metric_snapshot` intent Red
  gate. The read-only guide used `--intent first_metric_snapshot` and confirmed
  `expectedMetricsCount=0`, `expectedMetadataStatus=partial`, and
  `expectedStage=partial_without_metrics`; the planner returned
  `currentStage=partial_without_metrics`, `nextStage=metric_write`, and
  `nextRedCommandKind=gecko_metric_snapshot_single_mint`; and the validator
  returned `approvalReady=true` plus `canProceedToHumanGate=true`. These were
  human-gate conditions only. After the separate human gate, exactly one Red
  command ran:
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump --write`. It ran
  `mode=single`, `dryRun=false`, `writeEnabled=true`, selected one mint,
  reported `okCount=1`, `errorCount=0`, and `writtenCount=1`, and appended one
  Metric only: `id=1244`, `source=geckoterminal.token_snapshot`,
  `observedAt=2026-05-08T23:11:09.976Z`, and `volume24h=0`. The latest
  safe summary is `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, and `topPoolPresent=true`. `metricsCount` moved
  from `0` to `1`, latestMetric became `id=1244`, and `recentMetrics` is
  `1244`. Token metadata / scoring fields stayed unchanged as `Papu` / `PAPU`,
  `description=null`, `metadataStatus=partial`, `scoreRank=C`,
  `scoreTotal=0`, `hardRejected=false`, and the same enrich/rescore
  timestamps. Telegram, detect, watch, enrich/rescore, tmux, systemd, and
  checkpoint updates were not invoked during the Metric step. The planner /
  validator output, Red result, and post reports stayed rawJson-free and did
  not expose secret markers.
- The same Ffn2 candidate has now passed the `second_metric_snapshot` intent
  Red gate through the strict tmux single-run operator flow. The read-only
  guide used `--intent second_metric_snapshot` and confirmed
  `expectedMetricsCount=1`, `expectedMetadataStatus=partial`, and
  `expectedStage=partial_with_one_metric`; the planner returned
  `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`, and
  `nextRedCommandKind=tmux_metric_single_mint`; and the validator returned
  `approvalReady=true` plus `canProceedToHumanGate=true`. These were
  human-gate conditions only. After the separate human gate, exactly one Red
  command ran through `lowcap-gecko-metric-single`; the exact command is
  recorded in the bounded operation runbook. It naturally exited as a
  no-`--watch` single-run, created / updated
  `/tmp/lowcap-gecko-metric-single.log`, reported `writeEnabled=true`,
  `selectedCount=1`, `okCount=1`, `errorCount=0`, and `writtenCount=1`, and
  appended one Metric only: `id=1245`,
  `source=geckoterminal.token_snapshot`,
  `observedAt=2026-05-08T23:53:30.002Z`, and `volume24h=0`. The latest safe
  summary is `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, and `topPoolPresent=true`. `metricsCount` moved
  from `1` to `2`, latestMetric became `id=1245`, and `recentMetrics` is
  `1245 -> 1244`; previous Metric `id=1244` remains. Token metadata /
  scoring fields stayed unchanged as `Papu` / `PAPU`,
  `description=null`, `metadataStatus=partial`, `scoreRank=C`,
  `scoreTotal=0`, `hardRejected=false`, and the same enrich/rescore
  timestamps. Telegram, detect, watch, enrich/rescore, ops, systemd, and
  checkpoint updates were not invoked during the Metric step. The planner /
  validator output, tmux log, Red result, and post reports stayed rawJson-free
  and did not expose secret markers.
- Ffn2 is now the first documented end-to-end human-gated bounded path
  milestone for the GeckoTerminal lane: bounded detect write created the
  mint-only Token with only the `/tmp` checkpoint, `enrich_rescore` moved it
  to `partial`, `first_metric_snapshot` appended Metric `1244`, and
  `second_metric_snapshot` appended Metric `1245` through the strict
  `lowcap-gecko-metric-single` tmux single-run. This milestone confirms the
  stage contract and rawJson-free reporting across the path, not an executor
  wrapper, automatic Red execution, always-on bot, systemd service, scheduler,
  queue worker, unbounded watch, or default-checkpoint operation. Next options
  are: reproduce the same path on the next natural pump candidate, summarize
  remaining readiness gaps before always-on work, or keep systemd / scheduler /
  queue work deferred.
- The bounded operation MVP is now complete only for the single-candidate,
  operator-approved shape: one mint, one stage, one human gate, one exact Red
  command, rawJson-free confirmation, and a docs record. It still requires a
  human gate for every write stage. Before any always-on work, the remaining
  readiness gaps are runtime implementation and operations gaps: default
  checkpoint operation, multiple-candidate handling, log retention / rotation
  implementation, Telegram durable dedupe / failed-send / cooldown runtime,
  and clear systemd / scheduler / queue boundaries. The next phase is to keep
  fixing those readiness decisions in docs and read-only design preflights, not
  to start systemd, queue workers, unbounded watch, automatic Red execution, or
  a Telegram live loop.
- Executor-wrapper boundary is now the next design checkpoint, not an
  implementation milestone. A non-executor wrapper / dry-run planner may only
  assemble stage order, guards, side-effect bounds, stop conditions, approval
  request text, and command strings. It must not execute existing CLIs, run Red
  commands, write DB / Token / Metric rows, send Telegram, start tmux, update
  checkpoints, or touch systemd / scheduler / queue / unbounded watch. A
  bounded executor prototype remains deferred until default checkpoint
  operation, restart / resume implementation, retry / failure implementation,
  duplicate enforcement, log retention / rotation, secret-free logging
  implementation, Telegram runtime dedupe / failed-send / cooldown handling,
  and multi-candidate handling are fixed for the target runtime.
- The non-executor wrapper / dry-run planner plan shape is now fixed as
  docs-only design, not implemented behavior. Its initial candidate input is
  one mint, one supported intent (`enrich_rescore`, `first_metric_snapshot`, or
  `second_metric_snapshot`), expected guards, expected stage, and
  `operatorMode=human_gated`; its output remains `mode=non_executor_wrapper`,
  `willExecute=false`, `executor=human`, command strings only,
  `redExecution.placeholder=true`, `rawJsonFreeRequired=true`, a
  human-gate approval request skeleton, side-effect upper bounds, checklist
  `stopConditionCodes`, and a forbidden list. Automatic Red execution,
  bounded executor prototype, always-on operation, systemd, scheduler / queue,
  unbounded watch, default-checkpoint operation, and Telegram live loop remain
  unimplemented / deferred.
- This is the current triple-guard planner gated operation milestone. The
  confirmed scope is intentionally narrow: the planner remains a read-only /
  non-executor selector, the three guards are available for Red preflight, a
  `partial_with_one_metric` candidate can be guarded through
  `nextStage=second_metric_write_or_tmux_single`, and the printed
  `nextRedCommand` can be carried into a separate human-approved Red task that
  runs exactly one strict `lowcap-gecko-metric-single` no-`--watch` command.
  That Red path is bounded to one target mint, `writtenCount=1`, at most one
  `geckoterminal.token_snapshot` Metric append, `metricsCount` moving from 1
  to 2, rawJson-free report confirmation, and no Token field update. The
  latest safe-presence false values observed on `9zqk...pump`,
  `H2RJi...pump`, and `9eSNH...pump` are availability observations in the saved
  snapshot, not failed writes. This milestone still does not promote systemd,
  scheduler / queue, unbounded watch, default checkpoint use, Telegram live
  send, or automatic Red execution.
- Remaining planner / bounded-operation gaps are still explicit: a real-DB
  `partial_without_metrics` planner smoke is unconfirmed; default-checkpoint
  detect watch, long-running / unbounded watch, restart-oriented operation,
  systemd operation, scheduler / queue worker behavior, and a bounded detect
  -> enrich/rescore -> metric orchestration wrapper are not promoted by this
  milestone.
- Confirmed detect gates include the one-shot pump-only write, three bounded
  pump-only watch writes using `--pumpOnly --limit 1 --watch --write
  --maxIterations 1 --checkpointFile /tmp/...`, and one foreground bounded
  wrapper watch using env-pinned `/tmp` checkpoint plus
  `--pumpOnly --limit 1 --maxIterations 2`, plus two tmux bounded detect watch
  runs using the same isolated `/tmp` checkpoint shape. All detect watch writes used
  the isolated `/tmp` checkpoint; the default checkpoint remains unused.
- Both watch-detected mints,
  `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump` and
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump`, have completed the same
  downstream loop: detect -> enrich/rescore -> Metric 1 -> Metric 2 ->
  rawJson-free report confirmation.
- A third bounded detect watch write, run as a bounded operation MVP rehearsal,
  created new mint-only Token
  `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump` with `selectedCount=1` and
  `importedCount=1`. The `/tmp` checkpoint advanced from
  `2026-04-29T15:23:33.000Z |
  3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8` to
  `2026-04-29T16:11:48.000Z |
  H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK`. The default checkpoint stayed
  unused, and Telegram, Metric append, enrich, and rescore were not invoked.
  That mint then moved through enrich/rescore to `partial` with
  `name/symbol=The People's House/PH`, score `C` / `0`, and
  `hardRejected=false`, then appended its first `geckoterminal.token_snapshot`
  Metric `id=1126` at `observedAt=2026-04-29T16:27:01.275Z`, moving
  `metricsCount` from 0 to 1. The Metric append did not update Token fields or
  send Telegram. The same mint has now also passed rawJson-free report
  confirmation through `metrics:report`, `token:compare`, and
  `tokens:compare-report`. It has now also appended a second
  `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 1 to 2 and
  setting latestMetric to `id=1127` at
  `observedAt=2026-04-29T16:42:56.330Z`; previousMetric remains `id=1126` at
  `observedAt=2026-04-29T16:27:01.275Z`, so time-series append is confirmed for
  the third watch-detected mint. The second append preserved Token fields and
  did not send Telegram. The same mint has also passed rawJson-free two-Metric
  report confirmation through `metrics:report`, `token:compare`, and
  `tokens:compare-report`, confirming detect -> enrich/rescore -> Metric 1 ->
  Metric 2 -> report for the third watch-detected mint.
- The detect foreground bounded watch wrapper has now passed its first bounded
  two-cycle live run:
  `LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`
  and `LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS=60` pinned
  `scripts/run-geckoterminal-detect-watch.sh` to the isolated `/tmp`
  checkpoint, then `--pumpOnly --limit 1 --maxIterations 2` naturally exited
  after two cycles. It processed 40 inputs total, selected 2 pump.fun
  candidates total, reported `acceptedCount=2`, `importedCount=2`,
  `existingCount=0`, `rejectedCount=0`, and `failedCount=0`, and created two
  new `mint_only` Tokens:
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` and
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`. The `/tmp` checkpoint
  advanced from `2026-04-29T16:11:48.000Z |
  H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK` to
  `2026-04-29T17:55:30.000Z |
  BWruAw7CYweENaRJ7WFrqSX6VEWd6qwteL3faiB5UgRi`; the default checkpoint stayed
  uncreated / unused. Telegram, Metric append, enrich, rescore, ops catchup,
  tmux, systemd, and journal operations were not invoked. Both
  foreground-created mints have since moved into the downstream follow-up lane:
  `5vLb...pump` through two-Metric rawJson-free report confirmation, and
  `6MD8...pump` through two-Metric rawJson-free report confirmation.
- The first foreground-created mint,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump`, has now reached the first
  downstream observation step. `token:enrich-rescore:geckoterminal -- --mint
  ... --write` moved it from `mint_only` to `partial` with
  `name/symbol=Something Dumb/DUMB`, score `C` / `0`, `hardRejected=false`,
  and reviewFlags present. A following single-mint
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1128`, moving `metricsCount` from 0 to 1 and setting latestMetric to
  `observedAt=2026-04-30T13:50:42.230Z` with source
  `geckoterminal.token_snapshot`; volume24h, price, fdv, reserve, and topPool
  were present in the saved snapshot. The Metric append preserved Token fields
  (`metadataStatus=partial`, `name/symbol=Something Dumb/DUMB`, score
  `C` / `0`) and did not send Telegram. Detect, enrich, ops, watch, tmux, and
  systemd were not invoked during the Metric step. The same mint has now also
  passed rawJson-free report confirmation: `metrics:report -- --mint ...
  --limit 1` shows Metric `id=1128`,
  `observedAt=2026-04-30T13:50:42.230Z`, `volume24h=0`, and all four
  market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1128`, one `recentMetrics` item, and all four
  `safeSummary` booleans true; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=1`, latestMetric source /
  observedAt, and latestMetric safe summary columns. The report / compare
  output did not expose Metric rawJson and did not write to DB. The same mint
  has now also confirmed time-series Metric append: a second
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1129`, moved `metricsCount` from 1 to 2, and updated latestMetric to
  `observedAt=2026-04-30T14:23:38.900Z` with source
  `geckoterminal.token_snapshot`; previousMetric remains `id=1128` at
  `observedAt=2026-04-30T13:50:42.230Z`, so the two observations have distinct
  timestamps. The second append preserved Token fields
  (`metadataStatus=partial`, `name/symbol=Something Dumb/DUMB`, score
  `C` / `0`, `hardRejected=false`, reviewFlags present), did not send
  Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd.
  `volume24h=0` persisted, while price / fdv / reserve / topPool remained
  present. The same mint has now also passed two-Metric rawJson-free report
  confirmation: `metrics:report -- --mint ... --limit 2` shows Metric ids
  `1129 -> 1128`, both `observedAt` values, `volume24h=0` on both rows, and
  all four market-data presence columns true on both rows; `token:compare -- --mint ...`
  shows latestMetric `id=1129` and `recentMetrics` containing `1129` plus
  `1128`, each with true `safeSummary` booleans; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=2`, latestMetric observedAt,
  and latestMetric safe summary columns. The report / compare output did not
  expose Metric rawJson and did not write to DB. This confirms the foreground
  detect origin path through detection, enrichment, observation, time-series
  append, and rawJson-free confirmation. The second foreground-created mint,
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, has now reached its first
  downstream observation step. `token:enrich-rescore:geckoterminal -- --mint
  ... --write` moved it from `mint_only` to `partial` with
  `name/symbol=Ghostpool/GHOST`, score `C` / `0`, `hardRejected=false`, and
  reviewFlags present. A following single-mint
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1130`, moving `metricsCount` from 0 to 1 and setting latestMetric to
  `observedAt=2026-04-30T16:51:54.070Z` with source
  `geckoterminal.token_snapshot`. The saved snapshot had `volume24h=null`,
  while price / fdv / reserve / topPool presence were true. The Metric append
  preserved Token fields (`metadataStatus=partial`,
  `name/symbol=Ghostpool/GHOST`, score `C` / `0`, `hardRejected=false`), did
  not send Telegram, and did not invoke detect / enrich / ops / watch / tmux /
  systemd. The same mint has now also passed rawJson-free report confirmation:
  `metrics:report -- --mint ... --limit 1` shows Metric `id=1130`,
  `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all four
  market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1130`, one `recentMetrics` item, and all four
  `safeSummary` booleans true; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=1`, latestMetric observedAt,
  and latestMetric safe summary columns. The report / compare output did not
  expose Metric rawJson and did not write to DB. The first foreground-created
  mint remains unchanged at `metricsCount=2` with latestMetric `id=1129`. The
  same `6MD8...pump` mint has now also confirmed time-series Metric append: a
  second single-mint `metric:snapshot:geckoterminal -- --mint ... --write`
  appended Metric `id=1131`, moved `metricsCount` from 1 to 2, and updated
  latestMetric to `observedAt=2026-04-30T23:55:54.844Z` with source
  `geckoterminal.token_snapshot`; previousMetric remains `id=1130` at
  `observedAt=2026-04-30T16:51:54.070Z`, so the two observations have distinct
  timestamps. The second append preserved Token fields
  (`metadataStatus=partial`, `name/symbol=Ghostpool/GHOST`, score `C` / `0`,
  `hardRejected=false`), did not send Telegram, and did not invoke detect /
  enrich / ops / watch / tmux / systemd. `volume24h=null` persisted, while
  price / fdv / reserve / topPool presence were true. The same mint has now
  also passed two-Metric rawJson-free report confirmation: `metrics:report -- --mint
  ... --limit 2` shows Metric ids `1131 -> 1130`, latest
  `observedAt=2026-04-30T23:55:54.844Z`, previous
  `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null` on both rows, and
  all four market-data presence columns true on both rows; `token:compare -- --mint ...`
  shows latestMetric `id=1131` and `recentMetrics` containing `1131` plus
  `1130`, each with true `safeSummary` booleans; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=2`, latestMetric observedAt,
  and latestMetric safe summary columns. The report / compare output did not
  expose Metric rawJson and did not write to DB.
- A detect tmux bounded watch run has now passed with session
  `lowcap-gecko-detect-bounded`, `/tmp` log output, the isolated
  `/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`, `--pumpOnly`,
  `--limit 1`, and `--maxIterations 1`. It naturally exited after one cycle
  with `selectedCount=1`, `importedCount=1`, and `failedCount=0`, creating
  mint-only Token `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`. The default
  checkpoint stayed unused and Telegram, Metric append, enrich/rescore, ops,
  systemd, and unbounded watch were not invoked during detect. The same mint
  then moved through `token:enrich-rescore:geckoterminal -- --mint ... --write`
  from `mint_only` to `partial` with `name/symbol=WHO GRANTS WISHES/WHO??`,
  score `C` / `0`, and `hardRejected=false`. That write reported
  `contextWriteCount=1`; this was the safe context capture update
  `Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot`, not a Metric
  write or Telegram send. A following single-mint
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1132` at `observedAt=2026-05-01T07:53:31.204Z` with source
  `geckoterminal.token_snapshot`, moving `metricsCount` from 0 to 1. The Metric
  row has `volume24h=20333.5730222922` and rawJson-free safe summary columns
  `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. `metrics:report -- --mint ... --limit 1` and
  `token:compare -- --mint ...` confirmed latestMetric `id=1132` and one
  `recentMetrics` item without exposing Metric rawJson. A second single-mint
  Metric snapshot write then appended Metric `id=1133` at
  `observedAt=2026-05-01T08:08:12.847Z`, moving `metricsCount` from 1 to 2 and
  leaving previousMetric as `id=1132` at
  `observedAt=2026-05-01T07:53:31.204Z`, about 14 minutes 41 seconds earlier.
  The second row has source `geckoterminal.token_snapshot`,
  `volume24h=20335.4710939884`, and price / fdv / reserve / topPool presence
  all true. `metrics:report -- --mint ... --limit 2` now shows Metric ids
  `1133 -> 1132`, and `token:compare -- --mint ...` shows `metricsCount=2`,
  latestMetric `id=1133`, and `recentMetrics` containing `1133` plus `1132`,
  all without exposing Metric rawJson. Token fields were not changed by either
  Metric write, and Telegram / detect / watch / tmux / systemd were not invoked
  during the Metric steps.
- A second detect tmux bounded watch run has now passed with the same session
  name, `/tmp` log output, isolated `/tmp` checkpoint,
  `--pumpOnly --limit 1 --maxIterations 1`, `selectedCount=1`,
  `importedCount=1`, `failedCount=0`, and `skippedNonPumpCount=2`, creating
  mint-only Token `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`. The default
  checkpoint stayed unused and Telegram, Metric append, enrich/rescore, ops,
  systemd, and unbounded watch were not invoked during detect. The same mint
  then moved through `token:enrich-rescore:geckoterminal -- --mint ... --write`
  from `mint_only` to `partial` with `name/symbol=WarlockCoin/Warlock`, score
  `C` / `0`, `hardRejected=false`, all reviewFlags false, and `linkCount=0`.
  That write reported `contextWriteCount=1`; this was the safe context capture
  update `Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot`, not a
  Metric write or Telegram send. A following single-mint
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1134` at `observedAt=2026-05-01T09:30:04.949Z` with source
  `geckoterminal.token_snapshot`, moving `metricsCount` from 0 to 1. The Metric
  row has `volume24h=395.7346968031` and rawJson-free safe summary columns
  `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. `metrics:report -- --mint ... --limit 1` and
  `token:compare -- --mint ...` confirmed latestMetric `id=1134` and one
  `recentMetrics` item without exposing Metric rawJson. A second single-mint
  Metric snapshot write then appended Metric `id=1135` at
  `observedAt=2026-05-01T09:46:34.724Z`, moving `metricsCount` from 1 to 2 and
  leaving previousMetric as `id=1134` at
  `observedAt=2026-05-01T09:30:04.949Z`, about 16 minutes 29.775 seconds
  earlier. The latest row has source `geckoterminal.token_snapshot`,
  `volume24h=395.7346968031`, and price / fdv / reserve / topPool presence all
  true. `metrics:report -- --mint ... --limit 2` now shows Metric ids
  `1135 -> 1134`, and `token:compare -- --mint ...` shows `metricsCount=2`,
  latestMetric `id=1135`, and `recentMetrics` containing `1135` plus `1134`,
  all without exposing Metric rawJson. Token fields were not changed by either
  Metric write, and Telegram / detect / watch / tmux / systemd were not invoked
  during the Metric steps.
- The metric snapshot lane has also passed single-mint bounded watch, batch
  bounded watch, foreground bounded watch, tmux bounded watch with one append,
  and tmux bounded no-candidate natural exit. In this Codex environment, tmux
  bounded operation is the practical interim entrypoint because user systemd is
  blocked.
- Always-on monitoring is still not implemented: there is no scheduler, queue
  worker, installed service, restart-oriented runner, or unbounded watch
  operation. This remains a human-triggered operation model, not continuous
  automation. The bounded Gecko operation MVP should now be treated as the
  completed interim operator entrypoint for this narrow scope:
  keep detect on the isolated `/tmp` checkpoint with `--pumpOnly --limit 1`
  and an explicit `--maxIterations`, keep enrich/rescore and Metric appends as
  single-mint writes, confirm with rawJson-free reports, and require
  exact-command approval
  for every Red step. The next candidates are milestone docs / runbook cleanup,
  another bounded detect candidate only if another sample is needed, or
  formalizing metric snapshot tmux bounded operation as a separate interim
  entrypoint.
  Systemd stays on hold until a user-systemd-capable environment exists, and
  unbounded watch remains prohibited.

## Implemented

- Prisma + SQLite persistence
- `Dev`, `Token`, and `Metric` models in the schema
- CLI import flow in `src/cli/import.ts`
- Mint-only accumulation CLI in `src/cli/importMint.ts`
- Mint-only batch file wrapper CLI in `src/cli/importMintFile.ts`
- Source-specific mint-only adapter CLI in `src/cli/importMintSourceFile.ts`
- DexScreener single-source detect runner CLI in `src/cli/detectDexscreenerTokenProfiles.ts`
- GeckoTerminal single-source detect runner CLI in `src/cli/detectGeckoterminalNewPools.ts`
- GeckoTerminal-vs-DexScreener comparison CLI in `src/cli/compareGeckoterminalDexscreener.ts`
- Token enrichment CLI in `src/cli/tokenEnrich.ts`
- Token rescore CLI in `src/cli/tokenRescore.ts`
- GeckoTerminal enrich-plus-rescore batch CLI in `src/cli/tokenEnrichRescoreGeckoterminal.ts`
- GeckoTerminal bounded catch-up supervisor CLI in `src/cli/geckoterminalCatchupSupervisor.ts`
- Manual metric append CLI in `src/cli/metricAdd.ts`
- GeckoTerminal current metric snapshot CLI in `src/cli/metricSnapshotGeckoterminal.ts`
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
- `detect:dexscreener:token-profiles` fetches DexScreener token profiles latest v1 by default, or reads one local file with `--file`
- `detect:dexscreener:token-profiles` filters to `chainId=solana`, normalizes the current source-event shape, and evaluates `source_event_hint` candidates
- `detect:dexscreener:token-profiles` stays dry-run by default
- `detect:dexscreener:token-profiles --write` hands accepted `{ mint, source? }` payloads into the same mint-first boundary used by `import:mint`
- `detect:dexscreener:token-profiles --watch --write` may persist one source-specific checkpoint cursor, defaulting to `data/checkpoints/dexscreener-token-profiles-latest-v1.json`
- `detect:geckoterminal:new-pools` fetches one live GeckoTerminal Solana `new_pools` page by default, or reads one local raw file with `--file`
- `detect:geckoterminal:new-pools` normalizes GeckoTerminal `new_pools` items with the current pure helper and evaluates `source_event_hint` candidates
- `detect:geckoterminal:new-pools` stays dry-run by default
- `detect:geckoterminal:new-pools --write` hands one accepted `{ mint, source? }` payload into the same mint-first boundary used by `import:mint`
- `detect:geckoterminal:new-pools --write` also preserves a first-seen source snapshot in `Token.entrySnapshot`, including `source`, `detectedAt`, `poolCreatedAt`, `poolAddress`, `dexName`, `baseTokenAddress`, and `quoteTokenAddress` when those values exist in the source payload
- `detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write` has been manually confirmed as the Gecko detect lane Red one-shot gate: it selected one pump.fun candidate from 20 live inputs, accepted one, created one `mint_only` Token for `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump`, did not update a checkpoint, and did not send Telegram
- `detect:geckoterminal:new-pools --watch --write --pumpOnly --limit 1 --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json` has been manually confirmed as the initial pump-only detect watch write gate: it ran one cycle, selected and accepted one pump.fun candidate from 20 live inputs, created one `mint_only` Token for `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump`, updated only the `/tmp` checkpoint to `2026-04-29T14:36:09.000Z | ANPbYLCgNLGtfC5Qt4iSUERnwUREa8Qpsm7iGkY3uVvx`, left the default checkpoint unused, and did not send Telegram, append Metrics, enrich, or rescore
- the same pump-only detect watch write gate has now also passed a second bounded live run with the same `/tmp` checkpoint: it ran one cycle with `selectedCount=1`, `acceptedCount=1`, `importedCount=1`, `failedCount=0`, created one new `mint_only` Token for `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump`, and advanced the `/tmp` checkpoint from `2026-04-29T14:36:09.000Z | ANPbYLCgNLGtfC5Qt4iSUERnwUREa8Qpsm7iGkY3uVvx` to `2026-04-29T15:23:33.000Z | 3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8`. The default checkpoint stayed uncreated / unused, and Telegram, Metric append, enrich, rescore, and ops catchup were not invoked
- the same bounded pump-only detect watch write gate has now passed a third live run as the bounded operation MVP rehearsal: it ran one cycle with `selectedCount=1`, `acceptedCount=1`, `importedCount=1`, `failedCount=0`, created one new `mint_only` Token for `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump`, and advanced the `/tmp` checkpoint from `2026-04-29T15:23:33.000Z | 3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8` to `2026-04-29T16:11:48.000Z | H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK`. The default checkpoint stayed uncreated / unused, and Telegram, Metric append, enrich, rescore, and ops catchup were not invoked during the detect step
- a later bounded detect write, run from the candidate waiting state with the
  isolated `/tmp/lowcap-gecko-detect-bounded.json` checkpoint, confirmed the
  same single-candidate shape with a fresh Pump.fun mint: the exact command
  `detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --watch
  --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-bounded.json
  --write` ran one cycle, reported `selectedCount=1`, `acceptedCount=1`,
  `importedCount=1`, `existingCount=0`, `failedCount=0`, and
  `skippedNonPumpCount=5`, and created mint-only Token
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`. The token remains
  `metadataStatus=mint_only` with `metricsCount=0`, `latestMetric=null`,
  null name / symbol / description, `hardRejected=false`, score `C` / `0`,
  and no enrich/rescore timestamps. The `/tmp` checkpoint advanced to
  `2026-05-08T22:04:05.000Z |
  DWHNrAbt6bL3HuygDiBGBQY51ADxtyMreERS9JuBH3tT`; the default checkpoint stayed
  uncreated / unused, and Metric append, enrich/rescore, Telegram, tmux,
  systemd, scheduler / queue, and additional Red commands were not invoked.
- that same bounded detect origin mint then passed the
  `enrich_rescore` intent path as a separate human-gated Red task:
  guide, planner, and validator were read-only and non-executing, then exactly
  one `token:enrich-rescore:geckoterminal -- --mint ... --write` command ran
  for `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`. The write selected one
  mint, reported `ok=1`, `error=0`, `enrichWritten=1`, `rescoreWritten=1`,
  `contextWritten=1`, and `notifySent=0`, and moved the Token from
  `mint_only` to `partial` as `Papu` / `PAPU` with `description=null`,
  `normalizedText=papu papu`, score `C` / `0`, and `hardRejected=false`.
  `enrichedAt=2026-05-08T22:38:21.819Z` and
  `rescoredAt=2026-05-08T22:38:21.830Z`. The run did not create Metrics:
  `metricsCount=0`, `latestMetric=null`, and `metrics:report` returned
  `count=0` / `items=[]`. Telegram, detect, watch, tmux, systemd, checkpoint
  updates, and additional Red commands were not invoked, and the output stayed
  rawJson-free / secret-marker-free.
- the detect foreground bounded watch wrapper has now passed its first live Red gate with the wrapper pinned by env to the isolated `/tmp` checkpoint: `LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS=60 bash scripts/run-geckoterminal-detect-watch.sh --pumpOnly --limit 1 --maxIterations 2` ran with `watchEnabled=true`, `writeEnabled=true`, and `checkpointEnabled=true`, naturally exited after `cycleCount=2`, processed 40 inputs total, selected 2 pump.fun candidates total, skipped 10 non-pump items, reported `acceptedCount=2`, `rejectedCount=0`, `importedCount=2`, `existingCount=0`, and `failedCount=0`, and created new `mint_only` Tokens for `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` and `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`. The `/tmp` checkpoint advanced from `2026-04-29T16:11:48.000Z | H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK` to `2026-04-29T17:55:30.000Z | BWruAw7CYweENaRJ7WFrqSX6VEWd6qwteL3faiB5UgRi`. The default checkpoint stayed uncreated / unused, and Telegram, Metric append, enrich, rescore, ops catchup, tmux, systemd, and journal operations were not invoked
- the detect tmux bounded watch gate has now passed with session `lowcap-gecko-detect-bounded`: the wrapper used `LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`, `LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS=60`, `--pumpOnly`, `--limit 1`, and `--maxIterations 1`, naturally exited after one cycle, reported `selectedCount=1`, `importedCount=1`, `failedCount=0`, and created mint-only Token `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`. It wrote only the `/tmp` log / checkpoint side effects allowed for that Red step; the default checkpoint stayed unused, and Telegram, Metric append, enrich/rescore, ops, systemd, and unbounded watch were not invoked during detect
- the first foreground detect watch origin mint `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` has now completed downstream enrichment, first-Metric report confirmation, time-series append, and two-Metric rawJson-free report confirmation: `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from `mint_only` to `partial` with `name/symbol=Something Dumb/DUMB`, score `C` / `0`, `hardRejected=false`, and reviewFlags present; then `metric:snapshot:geckoterminal -- --mint ... --write` appended one `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and setting latestMetric to `id=1128` at `observedAt=2026-04-30T13:50:42.230Z` with volume24h / price / fdv / reserve / topPool present. Token fields were not changed by the Metric write, Telegram was not sent, and detect / enrich / ops / watch / tmux / systemd were not invoked during the Metric step. The token-level `volume24h` value was 0, but price / fdv / reserve / topPool were present. `metrics:report -- --mint ... --limit 1` shows Metric `id=1128`, `observedAt=2026-04-30T13:50:42.230Z`, `volume24h=0`, and all four rawJson-free market-data presence columns true; `token:compare -- --mint ...` shows latestMetric `id=1128`, one `recentMetrics` item, and all four `safeSummary` booleans true; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=1`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare output did not expose Metric rawJson and did not write to DB. A second single-mint Metric snapshot write then appended Metric `id=1129`, moved `metricsCount` from 1 to 2, and updated latestMetric to `observedAt=2026-04-30T14:23:38.900Z`; previousMetric remains `id=1128` at `observedAt=2026-04-30T13:50:42.230Z`, so the two Metric rows have distinct timestamps. The second append preserved `metadataStatus=partial`, `name/symbol=Something Dumb/DUMB`, score `C` / `0`, `hardRejected=false`, and reviewFlags, did not update token fields, did not send Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd. `volume24h=0` persisted, while price / fdv / reserve / topPool were present. `metrics:report -- --mint ... --limit 2` now shows Metric ids `1129 -> 1128`, both `observedAt` values, `volume24h=0` on both rows, and all four market-data presence columns true on both rows; `token:compare -- --mint ...` shows latestMetric `id=1129` and `recentMetrics` containing `1129` plus `1128`, each with true `safeSummary` booleans; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=2`, latestMetric source / observedAt, and latestMetric safe summary columns. The two-Metric report / compare output did not expose Metric rawJson and did not write to DB. This confirms the foreground detect origin path through detection, enrichment, observation, time-series append, and rawJson-free confirmation. The second foreground-created mint `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump` has now reached first Metric append, first-Metric rawJson-free report confirmation, second Metric append, and two-Metric rawJson-free report confirmation: enrich/rescore moved it from `mint_only` to `partial` as `Ghostpool/GHOST`, and the first single-mint Metric snapshot write appended Metric `id=1130` at `observedAt=2026-04-30T16:51:54.070Z`, moving `metricsCount` from 0 to 1. The first Metric append preserved Token fields, did not send Telegram, kept `volume24h=null`, and saved price / fdv / reserve / topPool presence. `metrics:report -- --mint ... --limit 1` then showed Metric `id=1130`, `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all four market-data presence columns true; `token:compare -- --mint ...` showed latestMetric `id=1130`, one `recentMetrics` item, and all four `safeSummary` booleans true; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10` included the mint with `metricsCount=1`, latestMetric observedAt, and latestMetric safe summary columns. The first-Metric report / compare output did not expose Metric rawJson and did not write to DB. A second single-mint Metric snapshot write then appended Metric `id=1131`, moved `metricsCount` from 1 to 2, and updated latestMetric to `observedAt=2026-04-30T23:55:54.844Z`; previousMetric remains `id=1130` at `observedAt=2026-04-30T16:51:54.070Z`, so the two Metric rows have distinct timestamps. The second append preserved `metadataStatus=partial`, `name/symbol=Ghostpool/GHOST`, score `C` / `0`, and `hardRejected=false`, did not update token fields, did not send Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd. `volume24h=null` persisted, while price / fdv / reserve / topPool presence were true. `metrics:report -- --mint ... --limit 2` now shows Metric ids `1131 -> 1130`, both `observedAt` values, `volume24h=null` on both rows, and all four market-data presence columns true on both rows; `token:compare -- --mint ...` shows latestMetric `id=1131` and `recentMetrics` containing `1131` plus `1130`, each with true `safeSummary` booleans; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=2`, latestMetric observedAt, and latestMetric safe summary columns. The two-Metric report / compare output did not expose Metric rawJson and did not write to DB.
- the detect tmux bounded origin mint `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump` has now completed the two-Metric downstream observation loop: `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from `mint_only` to `partial` with `name/symbol=WHO GRANTS WISHES/WHO??`, score `C` / `0`, and `hardRejected=false`. That write reported `contextWriteCount=1`, which saved `Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot`; it was not a Metric write or Telegram send. The first single-mint `metric:snapshot:geckoterminal -- --mint ... --write` appended one `geckoterminal.token_snapshot` Metric `id=1132` at `observedAt=2026-05-01T07:53:31.204Z`, moving `metricsCount` from 0 to 1. A second single-mint write appended Metric `id=1133` at `observedAt=2026-05-01T08:08:12.847Z`, moving `metricsCount` from 1 to 2 with previousMetric `id=1132`; the elapsed time from `1132` to `1133` was about 14 minutes 41 seconds. The latest Metric has `volume24h=20335.4710939884`, `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and `topPoolPresent=true`. `metrics:report -- --mint ... --limit 2` shows Metric ids `1133 -> 1132`; `token:compare -- --mint ...` shows `metricsCount=2`, latestMetric `id=1133`, and `recentMetrics` containing `1133` plus `1132` with true `safeSummary` booleans. The report / compare output did not expose Metric rawJson, Token fields were not changed by the Metric writes, and Telegram / detect / watch / tmux / systemd were not invoked during the Metric steps
- the third detect watch write origin mint `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump` has now completed the first downstream observation step: `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from `mint_only` to `partial` with `name/symbol=The People's House/PH`, score `C` / `0`, `hardRejected=false`, and reviewFlags present; then `metric:snapshot:geckoterminal -- --mint ... --write` appended one `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and setting latestMetric to `id=1126` at `observedAt=2026-04-29T16:27:01.275Z` with volume24h / price / fdv / reserve / topPool present. Token fields were not changed by the Metric write, Telegram was not sent, and detect / enrich / ops / watch / tmux / systemd were not invoked during the Metric step
- the same third detect watch write origin mint has also reached rawJson-free read-only report confirmation: `metrics:report -- --mint ... --limit 1` shows Metric `id=1126`, `observedAt=2026-04-29T16:27:01.275Z`, `volume24h`, and all four market-data presence columns as true; `token:compare -- --mint ...` shows latestMetric `id=1126`, one `recentMetrics` item, and all four `safeSummary` booleans as true; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=1`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare output did not expose Metric rawJson and did not write to DB
- the same third detect watch write origin mint has now confirmed time-series Metric append: a second `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric `id=1127`, moved `metricsCount` from 1 to 2, and updated latestMetric to `observedAt=2026-04-29T16:42:56.330Z` with source `geckoterminal.token_snapshot`; previousMetric remains `id=1126` at `observedAt=2026-04-29T16:27:01.275Z`, so the two observations have distinct timestamps. The second append preserved `metadataStatus=partial`, `name/symbol=The People's House/PH`, score `C` / `0`, and `hardRejected=false`, did not update token fields, did not send Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd. The next gate is rawJson-free read-only report confirmation for the two Metric rows
- the same third detect watch write origin mint has also reached two-Metric rawJson-free report confirmation: `metrics:report -- --mint ... --limit 2` shows Metric ids `1127 -> 1126` with both `observedAt` values and all four market-data presence columns true; `token:compare -- --mint ...` shows latestMetric `id=1127` and `recentMetrics` containing `1127` plus `1126`, each with true `safeSummary` booleans; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=2`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare output did not expose Metric rawJson and did not write to DB. This confirms the third watch-detected mint through detection, enrichment, observation, time-series append, and rawJson-free confirmation
- the second detect watch write origin mint `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` has now completed the first downstream observation step: `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from `mint_only` to `partial` with `name/symbol=wtf/WTF`, score `C` / `0`, `hardRejected=false`, and reviewFlags present; then `metric:snapshot:geckoterminal -- --mint ... --write` appended one `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and setting latestMetric to `id=1124` at `observedAt=2026-04-29T15:41:56.989Z` with volume24h / price / fdv / reserve / topPool present. Token fields were not changed by the Metric write, Telegram was not sent, and detect / enrich / ops / watch / tmux / systemd were not invoked during the Metric step
- the same second detect watch write origin mint has also reached rawJson-free read-only report confirmation: `metrics:report -- --mint ... --limit 1` shows Metric `id=1124`, `observedAt=2026-04-29T15:41:56.989Z`, `volume24h`, and all four market-data presence columns as true; `token:compare -- --mint ...` shows latestMetric `id=1124`, one `recentMetrics` item, and all four `safeSummary` booleans as true; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=1`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare output did not expose Metric rawJson and did not write to DB
- the same second detect watch write origin mint has now confirmed time-series Metric append: a second `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric `id=1125`, moved `metricsCount` from 1 to 2, and updated latestMetric to `observedAt=2026-04-29T15:55:14.973Z` with source `geckoterminal.token_snapshot`; previousMetric remains `id=1124` at `observedAt=2026-04-29T15:41:56.989Z`, so the two observations have distinct timestamps. The second append preserved `metadataStatus=partial`, `name/symbol=wtf/WTF`, score `C` / `0`, and `hardRejected=false`, did not update token fields, did not send Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd. The next gate is rawJson-free read-only report confirmation for the two Metric rows
- the same second detect watch write origin mint has also reached two-Metric rawJson-free report confirmation: `metrics:report -- --mint ... --limit 2` shows Metric ids `1125 -> 1124` with both `observedAt` values and all four market-data presence columns true; `token:compare -- --mint ...` shows latestMetric `id=1125` and `recentMetrics` containing `1125` plus `1124`, each with true `safeSummary` booleans; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=2`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare output did not expose Metric rawJson and did not write to DB. This confirms the second watch-detected mint through detection, enrichment, observation, time-series append, and rawJson-free confirmation
- the detect watch write origin mint `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump` has now completed the first downstream observation step: `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from `mint_only` to `partial` with `name/symbol=Jennie/Jennie`, score `C` / `0`, and `hardRejected=false`; then `metric:snapshot:geckoterminal -- --mint ... --write` appended one `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and setting latestMetric to `id=1122` at `observedAt=2026-04-29T14:54:49.239Z` with volume24h / price / fdv / reserve / topPool present. Token fields were not changed by the Metric write, Telegram was not sent, and detect / enrich / ops / watch / tmux / systemd were not invoked during the Metric step
- the same detect watch write origin mint has also reached read-only report confirmation: `metrics:report -- --mint ... --limit 1` shows Metric `id=1122`, `observedAt=2026-04-29T14:54:49.239Z`, `volume24h`, and all four rawJson-free market-data presence columns as true; `token:compare -- --mint ...` shows latestMetric `id=1122`, one `recentMetrics` item, and all four `safeSummary` booleans as true; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=1`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare checks did not expose Metric rawJson and did not write to DB
- the same detect watch write origin mint has now confirmed time-series Metric append: a second `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric `id=1123`, moved `metricsCount` from 1 to 2, and updated latestMetric to `observedAt=2026-04-29T15:09:40.608Z` with source `geckoterminal.token_snapshot`; previousMetric remains `id=1122` at `observedAt=2026-04-29T14:54:49.239Z`, so the two observations have distinct timestamps. The second append preserved `metadataStatus=partial`, `name/symbol=Jennie/Jennie`, score `C` / `0`, and `hardRejected=false`, did not update token fields, did not send Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd
- the same detect watch write origin mint has also reached two-Metric rawJson-free report confirmation: `metrics:report -- --mint ... --limit 2` shows Metric ids `1123 -> 1122` with both `observedAt` values and all four market-data presence columns true; `token:compare -- --mint ...` shows latestMetric `id=1123` and `recentMetrics` containing `1123` plus `1122`, each with true `safeSummary` booleans; `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the mint with `metricsCount=2`, latestMetric source / observedAt, and latestMetric safe summary columns. The report / compare output did not expose Metric rawJson and did not write to DB
- the same mint `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump` has now completed the single-mint minimum observation loop through manual one-shot commands: detect one-shot write created the mint-only Token, `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it to `partial` with name/symbol/context/reviewFlags saved and score `C` / `0`, and `metric:snapshot:geckoterminal -- --mint ... --write` appended `geckoterminal.token_snapshot` Metrics with volume24h / price / fdv / reserve / topPool present in the sanitized snapshots
- the same mint has also confirmed Metric time-series append behavior: the second single-mint Metric snapshot write increased `metricsCount` from 1 to 2, updated latestMetric to `id=1118` with `observedAt=2026-04-29T10:50:02.424Z`, and preserved the previous Metric at `observedAt=2026-04-29T10:35:31.337Z`
- the same mint has also confirmed a bounded single-mint Metric snapshot watch write: `metric:snapshot:geckoterminal -- --mint ... --write --watch --maxIterations 1 --minGapMinutes 10` ran one cycle, selected one token, appended one Metric, moved `metricsCount` from 2 to 3, and updated latestMetric to `id=1119` with `observedAt=2026-04-29T11:45:26.494Z` without token field updates or Telegram send
- the metric snapshot lane has also confirmed bounded batch watch write: `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 1 --minGapMinutes 10` ran in `recent_batch` mode for one cycle, selected one eligible pump token, appended one Metric, moved the target mint's `metricsCount` from 3 to 4, and updated latestMetric to `id=1120` with `observedAt=2026-04-29T12:05:54.348Z` without token field updates or Telegram send
- the metric snapshot lane has also confirmed a foreground bounded watch gate: `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60` naturally exited after two cycles; both cycles selected the same eligible pump token and skipped it before fetch as `skipped_recent_metric`, so `writtenCount=0`, `metricsCount` stayed 4, latestMetric stayed `id=1120`, and no token field update or Telegram send occurred
- the metric snapshot lane has also confirmed a tmux bounded watch gate: `tmux new-session -d -s lowcap-gecko-metric-bounded "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60 > /tmp/lowcap-gecko-metric-bounded.log 2>&1'"` started successfully, naturally exited after `maxIterations=2`, appended Metric `id=1121` at `observedAt=2026-04-29T12:26:25.717Z` in cycle 1, skipped cycle 2 as `skipped_recent_metric`, moved `metricsCount` from 4 to 5, and still did not update token fields, send Telegram, or touch systemd
- the metric snapshot lane has also confirmed a tmux bounded no-candidate rerun: the same `lowcap-gecko-metric-bounded` command started with no prior session, naturally exited after `maxIterations=2`, reported `selectedCount=0`, `writtenCount=0`, `failedCount=0`, `rateLimited=false`, left `metricsCount=5` and latestMetric `id=1121` unchanged, required no stop command, and still did not update token fields, send Telegram, or touch systemd
- the same mint has now reached post-tmux read-only report/compare confirmation: `metrics:report -- --mint ... --limit 5` shows Metric ids `1121 -> 1120 -> 1119 -> 1118 -> 1117`, `token:show -- --mint ...` shows `metricsCount=5` plus latestMetric `id=1121`, and `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 5 --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the target mint with latestMetric source / observedAt
- read-only cohort reporting has also been checked after the safe-summary-column updates: `metrics:report -- --limit 10` shows multiple token / multiple Metric rows with `priceUsdPresent`, `fdvUsdPresent`, `reserveUsdPresent`, and `topPoolPresent`, while `tokens:compare-report` exposes latestMetric-level `latestMetricPriceUsdPresent`, `latestMetricFdvUsdPresent`, `latestMetricReserveUsdPresent`, and `latestMetricTopPoolPresent`; these views confirm market-data presence without rawJson output
- `token:compare -- --mint ...` now shows latestMetric and `recentMetrics` with rawJson-free `safeSummary` booleans; on the target mint it confirmed `metricsCount=5`, latestMetric `id=1121`, and recentMetrics `1121`, `1120`, `1119` with all four safeSummary fields true
- this single-mint loop and cohort reporting did not send Telegram and did not touch systemd; they confirm the one-shot real-data path, three pump-only one-cycle detect watch write gates with an isolated `/tmp` checkpoint, one foreground bounded detect watch wrapper gate with two mint-only Token writes and a `/tmp` checkpoint advance, two detect tmux bounded watch gates with one mint-only Token write each plus downstream two-Metric confirmation for both tmux-created mints, both foreground-detected mints' enrich/rescore plus two Metric appends and two-Metric rawJson-free report confirmation, the first watch-detected mint's downstream enrich/rescore plus two Metric appends and rawJson-free report confirmation, the second watch-detected mint's downstream enrich/rescore plus two Metric appends and rawJson-free report confirmation, the third watch-detected mint's downstream enrich/rescore plus two Metric appends and rawJson-free report confirmation, bounded single-mint watch write, bounded batch watch write with one eligible token, metric foreground bounded watch natural exit with minGap skip, tmux bounded watch natural exit with one append plus one minGap skip, tmux bounded no-candidate natural exit with zero writes, read-only history visibility, and cohort report visibility before automation, while default-checkpoint detect watch operation, foreground Metric append, two-or-more-token simultaneous Metric write, unbounded watch, restart-oriented operation, and systemd operation remain unconfirmed
- `detect:geckoterminal:new-pools --watch --write` may persist one GeckoTerminal-specific checkpoint cursor, defaulting to `data/checkpoints/geckoterminal-new-pools.json`
- `detect:geckoterminal:new-pools --watch` retries one GeckoTerminal fetch-only `429 Too Many Requests` or timeout-like failure once after a short backoff before marking the cycle failed
- `detect:geckoterminal:new-pools --watch` keeps the base polling interval unchanged after successful cycles, but adds extra cooldown only after failed `429 Too Many Requests` or timeout-like cycles; `LOWCAP_GECKOTERMINAL_DETECT_FAILURE_COOLDOWN_SECONDS` may override the default 30-second cooldown
- `detect:geckoterminal:new-pools` keeps one-shot mode fail-fast, but in watch mode records cycle-level failures and continues the next cycle
- `compare:geckoterminal:dexscreener` fetches one live GeckoTerminal candidate, then bounded-polls DexScreener `token-profiles/latest/v1` and reports whether that mint appears during the polling window
- `compare:geckoterminal:dexscreener` is read-only and does not write, watch, checkpoint, or hand off into `import:mint`
- `compare:coverage:geckoterminal:dexscreener` is the read-only batch coverage spot check that fetches one current GeckoTerminal `new_pools` page, collects accepted Gecko mints, gathers accepted DexScreener Solana token-profile mints over a short bounded window, and reports overlap plus source-only mint sets together with a small source-native time summary (`pool_created_at` / `updatedAt`) without writing anything
- current operating stance is that GeckoTerminal `new_pools` and DexScreener `token-profiles/latest/v1` are likely different source surfaces rather than one shared discovery surface; short-window live spot checks have repeatedly shown low overlap, very recent Gecko-only `pool_created_at` values, and Dex-only `updatedAt` values that often come from an older retained profile set
- `compare:coverage:geckoterminal:dexscreener` should therefore be used as a read-only source-surface comparison helper, not as ground-truth detect miss-rate proof; Gecko remains the primary discovery surface, Dex latest profiles remain useful as a separate observational surface, and longer recheck windows beyond the currently observed short-to-medium range are still unconfirmed
- current lowcap-bot operating stance remains detect-first: broad GeckoTerminal detect continues to act as the primary discovery surface, while enrich / rescore / metric stay bounded follow-up lanes and remain sensitive to live rate limits
- this keeps the operating split intentionally conservative: source-surface compare stays read-only, and review flags remain observation-first descriptive context rather than score-weight inputs
- taken together, current follow-up and review outputs are still for accumulation, comparison, and operating judgment rather than ground-truth proof or immediate weighting changes
- repeated bounded live runs have continued to reproduce that same shape: broad detect behavior remains stable, while follow-up lanes stay rate-limit constrained and only promote a small recent slice from `mint_only` to `partial`
- under that operating shape, recent Gecko-origin cohorts still accumulate `mint_only` tokens faster than bounded follow-up clears them, so read-only review queue pending counts naturally build without changing the detect-first stance
- current review-queue age summaries and oldest-pending previews also suggest that this backlog is often long-lived rather than only slightly delayed: many-hour pending rows can accumulate naturally under the present rate-limit-constrained follow-up shape
- recent pending-shape checks also suggest that this backlog is not only dominated by `mint_only` / no-review-flags rows, but that minority pending shapes such as `partial` rows with `reviewFlags` are currently sparse as well
- taken together, the present queue backlog still reads mainly as a thin-token follow-up backlog rather than a backlog concentrated in richer or more review-significant rows
- that should be read as a description of the current detect-first / bounded-follow-up operating split, not as evidence that the detect-first discovery stance itself is failing
- checkpointing is intentionally conservative: one-shot runs and dry-runs do not update the cursor
- in watch mode, cycle-level failures are recorded and the next cycle still runs; one-shot mode remains fail-fast
- for safe local confirmation, start with one file-backed detect dry-run such as `pnpm detect:dexscreener:token-profiles -- --file <fixture>` or `pnpm detect:geckoterminal:new-pools -- --file <fixture>` so checkpoint files stay untouched
- for the Gecko pump.fun lowcap path, the confirmed Red detector write is the bounded one-shot `pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write`; this does not update checkpoints or send Telegram
- for the Gecko pump.fun detect watch path, keep using an isolated `/tmp` checkpoint, `--pumpOnly`, `--limit 1`, and an explicit `--maxIterations`; the first three one-cycle live Red gates passed with one mint ingest write and one `/tmp` checkpoint update each, and the first foreground wrapper Red gate passed with `--maxIterations 2`, two mint ingest writes, natural exit, and one `/tmp` checkpoint advance, while targeted tests confirm the checkpoint advances only to the selected / processed candidate cursor and does not skip limit-out candidates
- `metric:snapshot:geckoterminal` may also be checked locally with `--watch --maxIterations 1`, but it does not use checkpoint files and only appends `Metric` rows when `--write` is set
- `scripts/run-detect-dexscreener-watch.sh` is the fixed repo-local entrypoint for manual runs or a future `systemd --user` service, and delegates into `pnpm detect:dexscreener:token-profiles -- --watch --write`
- `scripts/run-geckoterminal-detect-watch.sh` is the fixed repo-local entrypoint for manual runs or a sample `systemd --user` service, and delegates into `pnpm detect:geckoterminal:new-pools -- --watch --write`
- `scripts/run-geckoterminal-enrich-rescore-notify-fast.sh` is the repo-local fast follow runner for very recent incomplete Gecko-origin pump mints, and loops the one-shot `pnpm token:enrich-rescore:geckoterminal -- --write --notify --pumpOnly` batch with a default cadence of 60 seconds, 3 tokens, a 15-minute lookback, an optional start delay, and an extra cooldown only after rate-limited batches
- `scripts/run-geckoterminal-enrich-rescore-notify-fast.sh` keeps the same summary-first runner logging shape and suppresses per-cycle full JSON unless `LOWCAP_GECKOTERMINAL_ENRICH_FAST_VERBOSE_JSON=1` is set
- `scripts/run-geckoterminal-enrich-rescore-notify.sh` remains the slower catch-up runner for the broader Gecko-origin batch, and loops the one-shot `pnpm token:enrich-rescore:geckoterminal -- --write --notify` batch with an enrich-first live default cadence of 5 minutes, 5 tokens, a 60-minute lookback, an optional start delay, and an extra cooldown only after rate-limited batches
- `scripts/run-geckoterminal-enrich-rescore-notify.sh` keeps the normal runner log summary-first by default and suppresses per-cycle full JSON unless `LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON=1` is set
- `scripts/run-geckoterminal-metric-watch.sh` is the fixed repo-local entrypoint for manual runs or a sample `systemd --user` service, and delegates into `pnpm metric:snapshot:geckoterminal -- --watch --write` with a trailing-observation default cadence of 30 minutes, 5 tokens, a 120-minute lookback, and an optional start delay
- `docs/runbooks/gecko-watch-readiness.md` is the current pre-watch gate for Gecko always-on work: always-on monitoring has not started, existing watch runners and sample systemd units exist, `ops:catchup:gecko` remains a bounded one-shot, and systemd enablement should not happen before that runbook's gate is satisfied
- metric snapshot systemd preflight has been checked read-only after the tmux bounded gate, and the current sample unit should not be started as-is: the wrapper now supports `LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true|1|yes` and `LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=<N>` for bounded first-run setup, but defaults still remain `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=5`, no `--pumpOnly`, no `--maxIterations`, `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=1800`, `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=900`, and the sample unit uses `Restart=always`, so first-run env and journald output policy must still be finalized before systemd start
- `ops/systemd/lowcap-bot-geckoterminal-metric-watch-first-run.service` is now available as a bounded first-run sample with `Restart=no`, `LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true`, `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=2`, `LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=2`, `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`, `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=60`, and `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=0`; Phase A installed it to `/home/mochi/.config/systemd/user/lowcap-bot-geckoterminal-metric-watch-first-run.service` and confirmed it matches the repo sample, but `systemctl --user daemon-reload` failed with no user bus, and start / enable / status / journal checks remain unrun
- this Codex execution environment cannot currently run the user systemd first-run path: PID 1 is `codex-linux-san` rather than systemd, `XDG_RUNTIME_DIR` is set but its user bus socket is missing, `systemctl --user is-system-running --no-pager` reports `offline`, and `loginctl show-user` cannot connect to a systemd bus; Phase B start should not be attempted here, so continue with tmux bounded operation or retry Phase A in a user-systemd-enabled session
- `docs/runbooks/gecko-metric-tmux-bounded.md` is the current practical runbook for metric snapshot bounded operation in this environment: it documents both the confirmed strict single-mint tmux single-run candidate (`lowcap-gecko-metric-single`, `/tmp/lowcap-gecko-metric-single.log`, one target mint, no `--watch`, Metric append maximum 1) and the confirmed bounded batch/watch tmux command (`lowcap-gecko-metric-bounded`, `/tmp/lowcap-gecko-metric-bounded.log`), plus stop conditions, numeric log checks, and the systemd user-bus blocker context
- Gecko detect always-on work has not started: the pump.fun one-shot write gate, three pump-only one-cycle detect watch write gates with the same `/tmp` checkpoint, the first foreground bounded detect watch wrapper gate with `--maxIterations 2`, two detect tmux bounded gates, both foreground-detected mints' follow-up through enrich/rescore, two Metric appends, and two-Metric rawJson-free report confirmation, both tmux-detected mints' follow-up through enrich/rescore, two Metric appends, and two-Metric rawJson-free report confirmation, first watch-detected mint follow-up through enrich/rescore, two Metric appends, and rawJson-free report confirmation, second watch-detected mint follow-up through enrich/rescore, two Metric appends, and rawJson-free report confirmation, third watch-detected mint follow-up through enrich/rescore, two Metric appends, and rawJson-free report confirmation, same-mint one-shot observation loop with two Metrics, bounded single-mint and batch Metric snapshot watch writes, bounded foreground/tmux Metric snapshot gates, and read-only multi-token Metric cohort reporting are confirmed, but default-checkpoint detect watch operation, detect systemd operation, two-or-more-token simultaneous metric snapshot write, long-running metric snapshot watch, restart-oriented metric snapshot operation, and metric snapshot systemd operation remain unconfirmed
- all GeckoTerminal runners perform a lightweight Prisma `Token`-table preflight before starting; if the target SQLite DB has not been initialized yet, they fail fast with `db_preflight_failed` instead of entering watch/batch loops with repeated `main.Token` errors
- `pnpm ops:summary:geckoterminal -- --sinceHours 24 --limit 10` is the new read-only DB summary for recent Gecko-origin tokens, covering first-seen snapshot presence, enrich coverage, metric coverage, score-rank counts, notify-candidate counts, current/origin source counts, and a recent preview
- `pnpm ops:summary:geckoterminal` now also includes minimal cohort-level review flag counts such as `reviewFlagsTokenCount`, `hasWebsiteCount`, `hasXCount`, `hasTelegramCount`, `metaplexHitCount`, and `descriptionPresentCount`, purely as read-only observational summary fields
- `pnpm ops:summary:geckoterminal` also includes small flag × metric intersection counts such as `hasWebsiteAndMetricCount`, `hasXAndMetricCount`, `hasTelegramAndMetricCount`, and `metaplexHitAndMetricCount` for lightweight cohort comparison
- `pnpm ops:summary:geckoterminal` now also includes lightweight flag × metric rates such as `hasWebsiteMetricRate`, `hasXMetricRate`, `hasTelegramMetricRate`, and `metaplexHitMetricRate`; these are descriptive read-only ratios, not prediction weights
- `pnpm ops:summary:geckoterminal` also keeps `descriptionPresentAndMetricCount` and `descriptionPresentMetricRate` aligned with the same lightweight read-only summary pattern
- `pnpm ops:summary:geckoterminal` now also includes a small `interestingFlagComparison` block for `hasWebsite`, `descriptionPresent`, and `metaplexHit`, so those three observational flags can be compared side by side without removing the existing flat summary fields
- `pnpm ops:summary:geckoterminal` now also includes a small `metricCompletenessSummary` block so cohort-level latest-metric presence and missing-field counts can be read quickly without changing the current working outcome bucket
- current review-flag stance is still observation-first: `hasX` and `hasTelegram` are no longer singleton in the current small Gecko cohort, but they remain sparse and should not yet be treated as strong weighting inputs
- `metaplexHit`, `descriptionPresent`, and `hasWebsite` remain the more consistently interesting observational flags in the current broader small-cohort checks, while current flag × metric rates remain descriptive only and do not justify score-weight changes yet
- additional unbiased recent live-window checks still left `hasX` and `hasTelegram` sparse, and recent Gecko-only cohort growth often advanced `mint_only -> partial` with `name` / `symbol` only rather than adding richer review flags
- this keeps the current stance unchanged: `metaplexHit`, `descriptionPresent`, and `hasWebsite` remain the more consistently interesting observational flags, while current flag × metric rates remain descriptive only and do not justify weighting changes
- recent live-window checks with the small `interestingFlagComparison` block have not materially changed that ordering: `metaplexHit` remains the slightly stronger interesting observational flag in the current small cohort, with `descriptionPresent` and `hasWebsite` still close followers
- `hasX` and `hasTelegram` remain sparse in those same recent live windows, and current metric rates still remain descriptive only rather than evidence strong enough for weighting changes
- recent `pnpm tokens:compare-report -- --interestingFlagsOnly` rows also fit that same small-cohort reading: `metaplexHit` appeared as the common anchor in the representative set, while `descriptionPresent` and `hasWebsite` often overlapped with it across both all-three and partial-overlap examples
- that small recent sample did not surface a pure `metaplexHit`-only example, so the current reading remains descriptive only and still does not justify weighting changes
- the next step for review flags remains additional observation and comparison, not immediate prediction or ranking changes
- `pnpm review:queue:geckoterminal -- --sinceHours 24 --limit 10` is the read-only next-look queue for recent Gecko-origin tokens, grouped into enrich-pending, rescore-pending, metric-pending, notify-candidate, stale-review, and high-priority-recent categories
- `pnpm review:queue:geckoterminal` now also exposes stored `reviewFlags` and `reviewFlagsCount` when observational review flags have already been captured on a token; these remain read-only review hints and are not used directly for score weighting
- `pnpm review:queue:geckoterminal` now also exposes small pending-age fields derived from `firstSeenSourceSnapshot.detectedAt` when present, otherwise `Token.createdAt`, plus lightweight enrich/metric pending age buckets (`<=5m`, `<=15m`, `<=60m`, `>60m`) and pending-age minute summaries (`min`, `median`, `max`) for read-only lag reading under bounded follow-up runs
- `pnpm review:queue:geckoterminal` now also includes a tiny `oldestPendingPreview` block with the oldest enrich/metric pending rows (up to 3 each) so the most lagged mints can be inspected without changing the existing queue groupings
- `pnpm review:pending-shape:geckoterminal -- --sinceHours 24 --limit 10` is the smaller read-only helper for SMOKE-excluded recent Gecko-origin pending rows, with lightweight `metadataStatus`, `selectionAnchorKind`, `reviewFlagsCount`, and `queuesMatched` pattern summaries plus a short representative-row preview; `--metadataStatus` and `--minReviewFlagsCount` can be used to inspect minority pending shapes such as `partial` or flagged rows
- `pnpm review:manual-targets:geckoterminal -- --sinceHours 168 --limit 10` is the small read-only helper for surfacing the current `partial + staleReview + metricPending` follow-up subset without `SMOKE_*` rows
- `pnpm metric:priority-window-check:geckoterminal` is the small read-only helper for deciding whether rerunning `--prioritizeRichPending` comparison is worth it, with per-window SMOKE density plus first richer-row ranks
- `pnpm ops:summary:geckoterminal --pumpOnly` and `pnpm review:queue:geckoterminal --pumpOnly` keep the same read-only outputs but narrow the cohort to Gecko-origin mint strings ending with `pump`, which is useful for monitoring the fast follow lane without changing detect breadth
- future review output is expected to become more flag/evidence-centered and explainable, rather than a single opaque score-only surface
- `pnpm context:capture:geckoterminal` is the separate one-shot Phase 2 collect-and-store helper for recent Gecko-origin pump mints, stays dry-run by default, and fetches metadata text plus website/X/Telegram-style links from the live GeckoTerminal token snapshot
- `pnpm context:capture:geckoterminal --write` saves only into `Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot`, keeps the existing entry snapshot meaning intact, and does not mutate score, notify, metric, or current token fields
- `pnpm context:compare:geckoterminal` is a read-only recent Gecko-origin pump cohort comparison helper that checks the repo-local GeckoTerminal token snapshot endpoints side by side and reports name/symbol/description/link availability, fetch errors, and rate-limited counts without saving anything
- `pnpm context:compare:source-families` is a read-only recent Gecko-origin pump cohort comparison helper that keeps the existing Gecko endpoint compare intact but also adds the repo-local DexScreener token-profiles latest v1 family plus a read-only `metaplex.metadata_uri` family so description / website / X / Telegram density can be compared across source families without saving anything; the Metaplex branch now also returns read-only `fetchErrorBreakdown`, `notFoundReasonSummary`, and metaplex-focused sample details for deeper triage
- GeckoTerminal live runner defaults now intentionally prioritize `detect > enrich-rescore-notify > metric`, with start delays spaced so detect starts first, enrich follows, and metric trails later
- `scripts/check-systemd-user.sh` is the repo-local preflight for deciding whether to use the sample `systemd --user` unit or fall back to `tmux` / foreground execution
- `ops/systemd/lowcap-bot-dexscreener-watch.service` is a repo-local sample `systemd --user` unit that points at the run script; install and enablement are still manual
- `ops/systemd/lowcap-bot-geckoterminal-detect-watch.service` is a repo-local sample `systemd --user` unit for the GeckoTerminal detect watch run script; install and enablement are still manual
- `ops/systemd/lowcap-bot-geckoterminal-metric-watch.service` is a repo-local sample `systemd --user` unit for the GeckoTerminal metric snapshot watch run script; install and enablement are still manual
- `ops/systemd/lowcap-bot-geckoterminal-enrich-rescore-notify-fast.service` is a repo-local sample `systemd --user` unit for the GeckoTerminal fast follow enrich-rescore-notify runner; install and enablement are still manual
- `ops/systemd/lowcap-bot-geckoterminal-enrich-rescore-notify.service` is a repo-local sample `systemd --user` unit for the slower GeckoTerminal catch-up enrich-rescore-notify runner; install and enablement are still manual
- `token:enrich` updates current token fields without rescoring and keeps unspecified fields unchanged
- `token:enrich --source ...` may update a `mint_only` token without rebuilding `normalizedText` or changing `metadataStatus`
- `token:rescore` recomputes current hard reject and score fields
- `token:enrich-rescore:geckoterminal` fetches one live GeckoTerminal token snapshot per selected token, previews enrich plus rescore by default, and writes both stages only with `--write`
- `token:enrich-rescore:geckoterminal` selects recent GeckoTerminal-origin tokens by `firstSeenSourceSnapshot.detectedAt` when present, otherwise by `Token.createdAt`
- `token:enrich-rescore:geckoterminal` recent batch mode defaults to tokens still missing `name` or `symbol`, while `--mint` still forces single-token execution even when both fields are already present
- `token:enrich-rescore:geckoterminal --pumpOnly` is batch-only narrowing for mint strings ending with `pump`, intended for a fast follow lane while leaving detect broad and leaving `--mint` single-token execution unchanged
- `token:enrich-rescore:geckoterminal` fills name and symbol from GeckoTerminal when available, keeps description unchanged, rescoring from the post-enrich text snapshot, reports notify preview fields in dry-run, previews useful website/X/Telegram-style context capture from the same GeckoTerminal token snapshot without adding an extra API call, and now also performs a best-effort secondary `metaplex.metadata_uri` lookup after the Gecko primary snapshot succeeds
- `token:enrich-rescore:geckoterminal --write` still saves Gecko snapshot context into `Token.entrySnapshot.contextCapture.geckoterminalTokenSnapshot`, and when useful Metaplex description / website / X / Telegram context exists it also saves `Token.entrySnapshot.contextCapture.metaplexMetadataUri`; Metaplex miss or fetch error does not fail the whole fast-follow item, and score, notify thresholds, and metric behavior remain unchanged
- `token:enrich-rescore:geckoterminal --write` now also stores a small observational `Token.reviewFlagsJson` snapshot with fields such as `hasWebsite`, `hasX`, `hasTelegram`, `metaplexHit`, `descriptionPresent`, and `linkCount`; these flags are collect/store-first review data and are not yet used directly for score weighting, rank, or notify rules
- `token:enrich-rescore:geckoterminal` summary-first stderr logging now also reports Metaplex secondary attempt / available / saved counts plus `metaplexErrorKindCounts`, so fast-follow runner cycle summaries can distinguish secondary miss patterns without changing selection, scoring, notify, or write behavior
- `pnpm logs:summary:geckoterminal:metaplex -- <log-path>` is a read-only helper that totals `metaplexAttemptedCount`, `metaplexAvailableCount`, `metaplexSavedCount`, and `metaplexErrorKindCounts` from fast-follow runner logs, and fails with line-numbered parse errors if a summary line contains malformed Metaplex JSON
- `token:enrich-rescore:geckoterminal --write --notify` reuses the existing Telegram notify boundary only when the token was not already `S` and non-hard-rejected before the batch, but becomes `S` and non-hard-rejected after rescore
- `token:enrich-rescore:geckoterminal` stops the current recent-token batch early after the first token snapshot `429 Too Many Requests`, reports the batch as rate-limited, and lets the next runner cycle retry the remaining tokens
- `metric:add` appends one metric row without mutating token fields
- `metric:add` is append-only; repeated submissions with the same values still create new `Metric` rows
- `metric:snapshot:geckoterminal` fetches one live GeckoTerminal token snapshot per selected token and stays dry-run by default
- `metric:snapshot:geckoterminal` selects recent GeckoTerminal-origin tokens by `firstSeenSourceSnapshot.detectedAt` when present, otherwise by `Token.createdAt`
- `metric:snapshot:geckoterminal --prioritizeRichPending` is an experimental default-off batch-only selection preference that keeps the existing recency order inside ties but pulls non-`mint_only` rows, then rows with stored `reviewFlagsJson`, then rows with positive `reviewFlagsCount` slightly earlier
- `metric:snapshot:geckoterminal --pumpOnly` is batch-only narrowing for mint strings ending with `pump`, intended for trailing observation of the same fast-follow cohort while leaving `--mint` single-token execution unchanged
- `metric:snapshot:geckoterminal --write` appends one `Metric` row per successful snapshot without mutating token fields
- `metric:snapshot:geckoterminal -- --mint <MINT> --write` now records one
  `metric_appended` Notification capture record after a successful single-mint
  Metric create, using notification key `${mint}:metric_appended:${metricId}`,
  `trigger=metric_appended`, `status=captured`, `mode=capture_only`,
  `source=metric:snapshot:geckoterminal`, and safe `messagePreview`. This hook
  is limited to single-mint mode with Metric create maximum 1, Notification
  create maximum 1, Token write 0, Telegram send 0, and checkpoint write 0 per
  run. It is covered by a temp-SQLite test and did not write to production
  `prisma/dev.db`. First production Red rehearsal succeeded for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` with backup
  `/tmp/lowcap-dev.db.before-metric-snapshot-notification-20260509T135724Z.bak`,
  Token count unchanged (`1107 -> 1107`), Metric count `191 -> 192`,
  Notification count `0 -> 1`, Metric `1264`, and Notification key
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264`;
  `Notification_notificationKey_key` remained present, rollback was not
  needed, and restore was not executed. Exact `--mint --write
  --noNotificationCapture` now keeps the Metric write path but suppresses the
  capture-only `metric_appended` Notification row. Default exact `--mint
  --write` behavior is unchanged. The option is for post-alert Metric outcome
  checks where a second Metric is needed for `metrics:window-report` but another
  capture-only Notification is not. It is not a Telegram live-send control, and
  the Metric snapshot CLI still does not call the Telegram sender. Batch /
  limit mode Notification writes,
  real Telegram live-loop execution, failed-send retry, queue / systemd,
  default checkpoint operation, automatic Red execution, and always-on bot
  operation remain unimplemented. Commit `2d83b05` adds the
  `metric_appended` sent / failed marking path for an existing captured
  Notification row with mocked sender and temp-SQLite tests only; it does not
  execute real Telegram live send or Red live-send rehearsal. Commit `983b7e3`
  adds the notificationKey-specified `pnpm notification:send` rehearsal path:
  dry-run is the default, `--live` is required for a sender call, only
  `metric_appended` is supported, missing / already sent / non-captured rows
  are blocked, and success / failure update at most one existing Notification
  row through the safe sent / failed marking APIs. Its tests use temp SQLite and
  mocked sender only. The notificationKey-specified real Telegram Red rehearsal
  then succeeded for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264`:
  dry-run stayed no-send (`status=ready`, `senderCalled=false`, `sentCount=0`,
  `updatedCount=0`), live send reported `status=sent`, `senderCalled=true`,
  `sentCount=1`, and `updatedCount=1`, counts stayed `Token=1107`,
  `Metric=192`, and `Notification=1`, the existing row now has
  `status=sent`, `mode=live_send`, and `sentAt=1778339880613`, and rollback
  was not needed.
- the current 3h / 6h monitoring MVP path has also confirmed one
  notificationKey-specified real Telegram live send for the short-window
  `metric_appended` capture record. On 2026-05-17, with HEAD
  `faa0eaafef50098c7a2c5c65c37950e57942cdfd` and a clean working tree,
  `pnpm -s notification:send -- --notificationKey
  EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279 --trigger
  metric_appended --live` ran once for Notification `id=8`. Before the send,
  counts were Token / Metric / Notification / HolderSnapshot =
  `1296 / 198 / 8 / 1`; the target row was `status=captured`,
  `mode=capture_only`, `trigger=metric_appended`, `metricId=1279`,
  `sentAt=null`, `rawJsonFree=true`, and `secretFree=true`. The command
  returned `status=sent`, `sentCount=1`, `updatedCount=1`,
  `senderCalled=true`, `notificationId=8`, and `errorCode=null`; after the
  send, counts were still `1296 / 198 / 8 / 1`, the target row was
  `status=sent`, `mode=live_send`,
  `sentAt=2026-05-17T02:20:23.560Z`, and
  `lastAttemptAt=2026-05-17T02:20:23.560Z` with `failedAt=null`.
  Notification `id=7` remained unsent as `captured` / `capture_only`.
  Retry, batch send, scheduler, systemd, watch, metric snapshot, detect,
  import, enrich, and rescore were not executed. The safe message summary was
  limited to event type, mint, metric id, source, status, and trigger; Telegram
  token, chat id, `DATABASE_URL`, rawJson, and Telegram response body were not
  displayed or stored.
- `notification:send` failure-path preflight is complete as a read-only /
  docs-only audit. The audit inspected `notification:send`, the live-send
  service, Notification repository, retry planner, Telegram sender, schema,
  and tests without running `notification:send`, sending Telegram, writing DB
  state, or fetching externally. Current Notification rows are
  `captured/capture_only=5`, `sent/live_send=3`, `failed=0`, with retry
  candidates `0`. Failure marking would update one existing eligible row to
  `status=failed`, `mode=live_send`, set `failedAt` and `lastAttemptAt`, store
  only a safe normalized `errorCode`, and set `reason=ops_notify_send_failed`;
  direct `notification:send` does not increment `retryCount`, and retry
  planning only considers failed `metric_appended` live-send rows with safe
  flags, due retry time, and no active lease. Sent Notification `id=8` is
  blocked from resend; captured Notification `id=7` is a possible first
  live-send target but not a retry candidate. A production Red failure
  rehearsal is not recommended yet because it would require a real live sender
  failure or intentionally invalid Telegram environment and would mutate a
  production captured row; prefer a later Yellow simulated-failure or isolated
  temp-DB harness if failure-path execution evidence is needed.
- `notification:send` sent-row dedupe guard audit found that `status=sent`
  rows were already blocked before sender call, but the inconsistent case where
  `sentAt` is present while status is not `sent` was not explicitly guarded.
  The live-send service now treats either `status=sent` or `sentAt != null` as
  `notification_already_sent`, returns safe blocked output with
  `notificationStatus` and `sentAtPresent`, does not call the Telegram sender,
  and does not update DB state. A temp-SQLite test covers the inconsistent
  `sentAt` case. No production `notification:send`, Telegram send, retry,
  watch, metric snapshot, detect, import, enrich, rescore, schema, or migration
  action was run. The interrupted 6h Gecko dry-run did not complete; the
  leftover watch process was terminated before this audit.
- `notification:send` failure marking is now fixed by temp-SQLite / mocked
  sender tests without touching production DB or Telegram. The added test
  covers a captured `metric_appended` row whose injected sender throws: the
  existing row is updated to `status=failed`, `mode=live_send`, with
  `failedAt` and `lastAttemptAt` set to the same timestamp,
  `errorCode=ops_notify_sender_threw`, `reason=ops_notify_send_failed`,
  `sentAt=null`, `retryCount=0`, `nextRetryAt=null`, `leaseUntil=null`, and
  `workerId=null`. Token / Metric / Notification / HolderSnapshot counts stay
  unchanged, no new Notification is created, and unsafe sender error details,
  Telegram response body, rawJson, or secret markers are not stored.
- `notification:retry:plan` was confirmed against the current production DB as
  a read-only retry planner. At HEAD
  `fac9a8d6588b3f7ff4b1e1aa35d31997b1d6cf4e`, with a clean working tree, the
  DB state was Token / Metric / Notification / HolderSnapshot =
  `1296 / 198 / 8 / 1`, Notification status counts were
  `captured/capture_only=5`, `sent/live_send=3`, and `failed=0`.
  Notification `id=7` remained `captured/capture_only` with `metricId=1277`
  and `sentAt=null`; Notification `id=8` remained `sent/live_send` with
  `metricId=1279` and `sentAt=2026-05-17T02:20:23.560Z`. Running
  `pnpm -s notification:retry:plan` returned `status=stop`,
  `mode=read_only_retry_planner`, `willExecute=false`, `executor=none`,
  `candidateCount=0`, `selectedCount=0`, `selected=null`,
  `nextRedCommand=null`, and `stopConditionCodes=[no_failed_retry_candidate]`.
  It did not call a Telegram sender, update Notifications, write DB state,
  start retry / worker / scheduler paths, or expose secrets.
- `notification:retry:plan` candidate selection is now fixed by temp-SQLite
  tests without production DB or Telegram. The added mixed-fixture test creates
  one `failed/live_send` `metric_appended` row, one `captured/capture_only`
  row, and one `sent/live_send` row; the planner returns `candidateCount=1`,
  `selectedCount=1`, selects only the failed row, keeps `willExecute=false`,
  `executor=human`, and builds a safe `nextRedCommand` with
  `--trigger metric_appended --live --retryFailed`. The command string is
  checked to exclude env / secret / raw payload markers, and all Notification
  rows remain unchanged after planning.
- Manual approved live send versus auto live send is now fixed in
  `docs/runbooks/notification-live-send-policy.md`. The only live-send mode
  allowed today is one human-approved `notification:send --live` command for a
  confirmed `captured` / `capture_only` Notification with `sentAt=null` and a
  reviewed safe message preview. `notification:retry:plan` remains read-only;
  retry execution requires a separate one-row Red approval. Auto live send,
  batch send, scheduler / worker / systemd Telegram delivery, and automatic
  captured-to-sent advancement are not enabled. Read-only DB confirmation at
  this boundary remains Token / Metric / Notification / HolderSnapshot =
  `1296 / 198 / 8 / 1`; Notification `id=7` remains on hold as
  `captured` / `capture_only`, `id=8` is `sent` / `live_send`, and failed rows
  are `0`. The 6h dry-run was manually stopped by the user and is not a
  completed stability proof.
- GeckoTerminal new-pools watch interrupt handling is now explicit:
  `detect:geckoterminal:new-pools --watch` handles SIGINT / SIGTERM by printing
  a final JSON summary with `status=interrupted`,
  `stopReason=user_interrupted`, signal metadata, elapsed time, and
  `completedIterations` while preserving existing `cycleCount`,
  `failedCount`, `rateLimitRetryCount`, imported / existing counts, dry-run /
  write mode, and checkpoint fields. Manual interrupt is not counted as a
  failed cycle. The implementation is covered by a file-backed SIGINT test and
  did not run live watch, external fetch, production DB write, Telegram,
  notification retry, scheduler / systemd, metric snapshot, import, enrich, or
  rescore.
- A short Red live dry-run confirmation on 2026-05-17 ran:
  `timeout --foreground -s INT --preserve-status 90s pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 10 --intervalSeconds 300`.
  The timeout wrapper did not stop the `pnpm` / `tsx` process tree at the
  expected 90s boundary, so the operator sent SIGINT to the watch process group
  to stop further fetches. The final summary confirmed
  `status=interrupted`, `stopReason=user_interrupted`,
  `interruptedBySignal=SIGINT`, `completedIterations=5`, `cycleCount=5`,
  `failedCount=0`, `rateLimitRetryCount=0`, `importedCount=0`,
  `existingCount=0`, `dryRun=true`, `writeEnabled=false`, and
  `checkpointEnabled=false`. Counts stayed
  `Token=1296`, `Metric=198`, `Notification=8`, `HolderSnapshot=1`; no DB
  write, Telegram send, Notification update, Metric create, checkpoint update,
  or repo-local data diff was observed. At that point the 6h dry-run was still
  incomplete, and the next live long-run needed to address or explicitly
  account for process-tree timeout behavior.
- A follow-up Yellow audit fixed the operating boundary: do not rely on
  `timeout --foreground ... pnpm -s ...` as the stop mechanism for long
  GeckoTerminal watch runs. `--intervalSeconds` is a positive integer number of
  seconds and is used between recorded cycles; the `completedIterations=5`
  Red result is consistent with the process continuing for roughly four
  300-second intervals after the timeout wrapper failed to signal the child
  tree. `completedIterations` means recorded completed cycles and should match
  `cycleCount`. The runner already checks the interrupted flag before starting
  another cycle and its sleep path is interrupt-aware. A new file-backed CLI
  test covers SIGINT during watch sleep: it records one completed cycle,
  emits `status=interrupted`, leaves `failedCount=0`, and does not start
  cycle 2. Future long bounded dry-run approval should use the runner's own
  bounded `--maxIterations` / `--intervalSeconds` command without `timeout`.
- The timeout-free 6h GeckoTerminal new-pools dry-run completed on 2026-05-18:
  `pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1
  --maxIterations 360 --intervalSeconds 60`. The run exited with
  `status=ok`, `stopReason=completed`, `completedIterations=360`,
  `cycleCount=360`, `failedCount=0`, `rateLimitRetryCount=0`,
  `importedCount=0`, `existingCount=0`, `dryRun=true`,
  `writeEnabled=false`, and `checkpointEnabled=false`. Before / after counts
  stayed `Token=1296`, `Metric=198`, `Notification=8`, and
  `HolderSnapshot=1`; no DB write, Telegram send, Notification create/update,
  Metric create, checkpoint update, or repo-local data diff was observed.
- The 6h write rehearsal preflight is docs-only complete. The completed dry-run
  elapsed `32632518ms`, about `9.06h`, or about `90.65s` per cycle. The watch
  loop sleeps after each cycle completes, so `--intervalSeconds 60` is not a
  strict cycle-start cadence and 360 cycles is a 360-fetch stability run rather
  than a wall-clock 6h guarantee. The recommended next Red candidate is the
  wall-clock 6h approximation with `--maxIterations 240`, `/tmp` checkpoint
  isolation, and Token-only write upper bound of 240:
  `pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit
  1 --maxIterations 240 --intervalSeconds 60 --checkpointFile
  /tmp/lowcap-bot-gecko-write-rehearsal-6h.json`. Metric / Notification /
  HolderSnapshot writes and Telegram sends remain out of scope. See
  `docs/runbooks/gecko-write-rehearsal-preflight.md`.
- the manual retry Red rehearsal is now complete for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`
  through
  `pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`:
  backup `/tmp/lowcap-dev.db.before-notification-retry-send-20260509T235410Z.bak`
  was created, dry-run returned `status=ready`, `senderCalled=false`,
  `sentCount=0`, and `updatedCount=0`, and live retry attempted one sender call
  but returned `status=failed`, `senderCalled=true`, `sentCount=0`,
  `updatedCount=1`, and `errorCode=telegram_network_error`. Counts stayed
  `Token=1107`, `Metric=192`, and `Notification=2`; the retry target row
  remains `status=failed`, `mode=live_send`, `sentAt=null`,
  `failedAt=1778370852010`, `errorCode=telegram_network_error`,
  `reason=ops_notify_send_failed`, `rawJsonFree=1`, and `secretFree=1`; the
  existing sent row
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264`
  remains `status=sent`, `mode=live_send`, and `sentAt=1778339880613`.
  Telegram response body, bot token, chat id, and env markers were not stored;
  rollback was unnecessary and restore was not executed. This is failed retry
  evidence, not retry success: automatic retry, retry queue, `retryCount` /
  `nextRetryAt` / cooldown automation, sent row resend, `token_completed` /
  `loop_complete` retry, queue, scheduler, systemd, default checkpoint,
  automatic Red execution, unbounded watch, and always-on bot operation remain
  unimplemented / unexecuted.
- the Notification retry foundation production schema alignment is now
  confirmed after the separate migration apply gate: production `prisma/dev.db`
  records `20260510000100_add_notification_retry_foundation` with
  `finished_at` present and `rolled_back_at=null`, and `Notification` has
  `retryCount`, `nextRetryAt`, `lastAttemptAt`, `leaseUntil`, `workerId`, plus
  the retry candidate and lease indexes. This Green confirmation did not run
  `migrate deploy` or write the DB. `pnpm -s notification:retry:plan` also
  passed against the production DB as a read-only planner with
  `mode=read_only_retry_planner`, `willExecute=false`, `candidateCount=1`,
  `selectedCount=1`, and a human-gated `nextRedCommand`; it did not execute
  `notification:send`, send Telegram, update Notifications, or start queue /
  scheduler / systemd. Automatic retry, retry queue worker, scheduler, systemd,
  checkpoint operation, retry execution, and sent row resend remain unenabled.
- the planner-selected manual retry rehearsal has now been re-run after
  production retry schema alignment. Before the Red command,
  `notification:retry:plan` returned `status=ok`, `candidateCount=1`, and
  `selectedCount=1` for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`.
  Backup
  `/home/mochi/lowcap-bot-backups/dev.db.before-notification-manual-retry-20260511065201.db`
  was created, then the human-gated exact command
  `pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`
  ran once. It returned `status=sent`, `senderCalled=true`, `sentCount=1`,
  and `updatedCount=1`; after the run, `notification:retry:plan` returned
  `status=stop`, `candidateCount=0`, `selectedCount=0`, and
  `nextRedCommand=null`. The target row is now `status=sent`,
  `mode=live_send`, `sentAt=1778450118596`, `failedAt=null`, `retryCount=0`,
  `lastAttemptAt=1778450118596`, `nextRetryAt=null`, `leaseUntil=null`,
  `workerId=null`, `errorCode=null`, and `reason=null`, with
  `rawJsonFree=1` and `secretFree=1`. Raw Telegram response body, bot token,
  chat id, and env markers were not stored. This was a one-row human-gated
  manual retry rehearsal, not automatic retry; retry queue worker, scheduler,
  systemd, checkpoint operation, unbounded watch, and sent row resend remain
  unenabled.
- Notification retry manual validation is now closed for the current slice:
  foundation schema, production schema alignment, read-only planner selection,
  and one planner-selected manual retry rehearsal are confirmed. Do not proceed
  to automatic retry until retry policy, cooldown, claim recovery, worker
  responsibility, attempt limits, and scheduler / systemd boundaries are
  separately designed. The immediate next development focus returns to the core
  LowcapBot observation OS: translate the memecoin market model into a bounded
  plan for narrative / attention / risk / community / market condition /
  outcome logging, token observation accumulation, and read-only review /
  report commands. Start docs-first or read-only/report-first; do not jump to a
  large observation-profile schema, and include skip / failed / dead / rug /
  missed-opportunity outcomes as first-class future learning records.
- This feature slice adds `token:observation` as the first read-only
  observation report MVP for that next phase. It does not add schema fields or
  migrations, fetch external APIs, write production DB state, send Telegram, or
  classify trades;
  unrecorded narrative / community / holder / market-condition / outcome fields
  are reported as `not_observed`, and the output is review support rather than
  a buy signal.
- `token:observation` now reads existing `Token.reviewFlagsJson` without schema
  changes or writes, and exposes website / X / Telegram / link count /
  description-present / Metaplex-hit state as a community snapshot. This fills
  part of the community / metadata gap from existing DB state; holder
  distribution, market condition, and outcome labels remain `not_observed`.
- `token:observe` adds the manual observation capture foundation without schema
  changes: it stores operator-provided narrative category, watch / skip thesis,
  outcome label, and operator note under `Token.entrySnapshot.manualObservation`.
  It was first verified with temp SQLite, and the first production one-token
  Red rehearsal has now been run for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` with
  `narrativeCategory=crypto_meta` and `outcomeLabel=watched`. The command
  updated only `Token.entrySnapshot.manualObservation`; `token:observation`
  then showed `manualObservation.source=manual`, `schemaVersion=1`, the
  narrative / thesis / outcome context, and the narrative / thesis / outcome
  gaps removed while holder distribution and market condition stayed
  `not_observed`. This is not a buy signal, trading recommendation, automatic
  retry, queue, scheduler, systemd, checkpoint, `--write`, or `--watch` feature.
  RawJson, env, Telegram token / chat id, and Telegram response body were not
  displayed or saved by this rehearsal.
- `ops:catchup:gecko --write` has been manually confirmed for one gated Gecko token-only write, and `ops:catchup:gecko --write --metricAppend --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080` has been manually confirmed to append exactly one `Metric` through the production Metric append runner after token completion
- the confirmed ops Token to Metric loop keeps token write and Metric append as separate operator-visible executions; the successful Metric append checks produced `metricAppendExecutionResults.status=ok`, `writtenCount=1`, `tokenWriteExecutionResults=[]`, and final ops dry-runs with `plannedTokenWrites=0`, `plannedMetricAppends=0`, `metricPendingCount=0`, `latestMetricMissingCount=0`, and `nextRecommendedAction=no_action`
- `ops:catchup:gecko --opsNotifyCaptureFile <PATH>` has been manually confirmed in the same Token to Metric loop as capture-only output: token completion captured `token_completed`, the capture-enabled Metric append returned `metricId=1115`, Metric append captured `metric_appended` and `loop_complete`, delivery stayed `capture_only`, and the capture records did not include secret/env/raw stdout/raw stderr/full-args style fields
- after the IPv4 `https.request` transport fix, `ops:catchup:gecko --write --metricAppend --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080 --opsNotify --opsNotifyTrigger metric_appended --opsNotifyCaptureFile /tmp/lowcap-ops-notify-metric-send-capture.jsonl` has been manually confirmed for one production Telegram ops live send: the run appended exactly one Metric with `metricId=1116`, reported `writtenCount=1`, kept `tokenWriteExecutionResults=[]`, sent one `metric_appended` Telegram notification with `sentCount=1` and `status=sent`, and wrote capture-only `metric_appended` plus `loop_complete` records without secret/env/raw stdout/raw stderr/full-args style fields
- `ops:catchup:gecko --opsNotify --opsNotifyTrigger <TRIGGER>` has the pre-send gate and safe result shape for exactly one selected ops notification trigger, and the production ops Telegram sender is connected behind that gate; `metric_appended` live send is confirmed once, while `token_completed` and `loop_complete` live sends are still unconfirmed
- Telegram live loop policy keeps `metric_appended` as the only initial live-send candidate, using duplicate key `mint + eventType + metricId` after DB read confirmation, capture-only rehearsal, safe marker checks, and a human gate. `token_completed` and `loop_complete` remain capture-only until a later policy / Red approval changes their boundary.
- `token_completed` and `loop_complete` now have injected-sender success tests for the selected-trigger send gate without production Telegram delivery, but the latest Red live-send preflight stopped at `no_candidate`: token-only dry-run returned `status=no_pending`, `plannedTokenWrites=0`, `pendingCount=0`, and `selectedCandidates=[]`; Metric append dry-run returned `status=no_pending`, `plannedMetricAppends=0`, `metricPendingCount=0`, `pendingCount=0`, and `selectedCandidates=[]`
- previous ops Metric append runner failures are no longer current blockers: child-process `cli_error` / `parse_error` and stdout-empty behavior were fixed by the production runner startup and file-capture changes, and the later `fetch failed` case was isolated to environment-level DNS / network reachability rather than target-mint or runner parsing behavior
- `ops:catchup:gecko` has not been promoted to scheduler, watch, systemd, multi-token write, multi-cycle write, or always-on operation
- `metric:snapshot:geckoterminal --watch` repeats the same selection and snapshot cycle at a fixed interval and keeps going after cycle-level failures
- `metric:snapshot:geckoterminal --watch` stops the current cycle early after the first token snapshot `429 Too Many Requests`, reports the cycle as rate-limited, and still continues with the next cycle
- `metric:snapshot:geckoterminal --minGapMinutes <N>` skips a token before fetch when the newest `Metric` for the same token and metric source is newer than `N` minutes
- `metric:snapshot:geckoterminal` always saves `observedAt`, `source`, and a sanitized `rawJson` snapshot, and saves `volume24h` only when GeckoTerminal exposes token-level `volume_usd.h24`
- `metric:snapshot:geckoterminal` keeps FDV, market cap, and reserve/liquidity-style values in `rawJson` only instead of forcing them into mismatched metric schema fields
- as of 2026-04-22, repo-local current truth still does not confirm a direct existing source for `maxMultiple15m`, `peakFdv24h`, and `timeToPeakMinutes`; the current next-best external candidate is SolanaTracker `GET /chart/{token}` with `type=1m`, `time_from`, `time_to`, and `marketCap=true`
- docs shape suggests that SolanaTracker chart data may support peak market-cap proxy and time-to-peak derivation, while `maxMultiple15m` would still need a separate price anchor; this remains docs-verified and live-unconfirmed because the current live endpoint requires an API key and the authenticated payload shape has not yet been confirmed
- `import:min` forwards the minimum manual intake fields into `import`
- `import:min` parses `mint`, `name`, `symbol`, and optional `source`, `desc`, `dev`, then delegates to `src/cli/import.ts`
- `import:file` reads one JSON object and forwards supported fields into `import`
- `import:file` parses `--file`, reads and validates one JSON object, then delegates the supported fields to `src/cli/import.ts`
- `import:file` expects exactly one JSON object with required `mint`, `name`, and `symbol`
- `import:file` also accepts optional `desc`, `dev`, `groupKey`, `groupNote`, `source`, `maxMultiple15m`, `peakFdv24h`, `volume24h`, `peakFdv7d`, `volume7d`, `metricSource`, and `observedAt`
- `token:show` returns `metadataStatus`, `hasCurrentText`, `latestMetric`, `metricsCount`, `enrichedAt`, and `rescoredAt`
- `token:compare` returns `entrySnapshot`, current token fields, `metricsCount`, `hasMetrics`, `entryVsCurrentChanged`, `changedFields`, `latestMetric`, and `recentMetrics`; Metric views omit rawJson and include rawJson-free `safeSummary` booleans for price / fdv / reserve / topPool presence
- `tokens:report` supports `rank`, `source`, `metadataStatus`, `hasMetrics`, `hardRejected`, and `createdAfter` filters
- `tokens:report` returns `metadataStatus`, `latestMetricObservedAt`, `metricsCount`, `updatedAt`, `enrichedAt`, and `rescoredAt`
- `tokens:report --source ...` filters on the current token `source`, so a later `token:enrich --source ...` correction moves the token into the new source cohort; use `createdAfter` or the mint itself when you need to follow the original batch
- `tokens:compare-report` supports `rank`, `source`, `metadataStatus`, and `limit`
- `tokens:compare-report` supports `hardRejected` for current-token reject-state filtering
- `tokens:compare-report` supports `hasMetrics` and `minMetricsCount` for observation-count filtering
- `tokens:compare-report` supports `entryVsCurrentChanged` for entry-vs-current change filtering
- `tokens:compare-report` supports `changedField` for single-field change filtering
- `tokens:compare-report` supports `minChangedFieldsCount` for minimum entry-vs-current change-count filtering
- `tokens:compare-report` supports `minEntryScoreTotal` and `minCurrentScoreTotal` for score-threshold filtering
- `tokens:compare-report` supports `entryScoreRank` and `currentScoreRank` for exact rank filtering
- `tokens:compare-report` supports `hasWebsite`, `hasX`, `hasTelegram`, and `metaplexHit` as minimal read-only filters over stored observational `reviewFlags`, and `--interestingFlagsOnly` as a small side-by-side focus over `hasWebsite`, `descriptionPresent`, and `metaplexHit`
- `tokens:compare-report` also supports read-only `--outcomeBucket` and `--outcomeBucketReason` filters so the current working `winner` / `non_winner` / `unresolved` buckets can be combined with review-flag filters without changing score or alert behavior
- `tokens:compare-report` now also shows a small latest-metric completeness view; current Gecko snapshot metrics can still be incomplete for outcome buckets even when a recent metric row exists
- `tokens:compare-report` also supports small read-only completeness filters such as `--hasLatestMetric`, `--hasLatestMultiple`, `--hasLatestPeakFdv24h`, `--hasLatestTimeToPeak`, and `--latestMetricSource` so unresolved rows can be traced by latest-metric completeness without changing the current bucket
- current Gecko snapshot metrics can therefore be present while still incomplete for the working outcome bucket, and `unresolved` / `multiple_missing` may reflect latest-metric completeness limits rather than absence of follow-up itself
- recent `tokens:compare-report` checks also kept the current small interesting-row set clustered in `unresolved` / `multiple_missing` when filtered through Gecko-origin outcome buckets, even when those rows already had a latest metric and a shared latest metric source
- in that same small compare view, the clustering still points to latest-metric completeness limits in the current Gecko snapshot cohort rather than to absence of follow-up itself, so the current working outcome bucket remains descriptive only
- the current working outcome bucket remains descriptive only under that completeness constraint and still should not be treated as a weighting input or ground-truth label
- `tokens:compare-report` supports `sortBy` and `sortOrder` for `entryScoreTotal`, `currentScoreTotal`, `changedFieldsCount`, `metricsCount`, `latestPeakFdv24h`, `latestMaxMultiple15m`, and `latestTimeToPeakMinutes`
- `tokens:compare-report` returns entry-vs-outcome summary rows across multiple tokens, including `entryScoreTotal`, `entryVsCurrentChanged`, `changedFields`, `changedFieldsCount`, and `metricsCount`
- `tokens:compare-report` now also includes stored `reviewFlags` and `reviewFlagsCount` when present, as read-only observational compare fields rather than score inputs
- `tokens:compare-report` now also includes a small read-only `outcomeBucket` field with `winner` / `non_winner` / `unresolved`, where the current working bucket uses the latest `maxMultiple15m >= 2` check when present and treats missing latest multiple values as `unresolved`; this is descriptive only and is not used for weighting or alert changes
- `tokens:compare-report` now includes latestMetric-level rawJson-free market-data presence fields: `latestMetricPriceUsdPresent`, `latestMetricFdvUsdPresent`, `latestMetricReserveUsdPresent`, and `latestMetricTopPoolPresent`
- `metrics:report` supports `mint`, `tokenId`, `source`, `rank`, `hasPeakFdv24h`, `hasPeakFdv7d`, `hasMaxMultiple15m`, `hasTimeToPeakMinutes`, `hasVolume24h`, `hasVolume7d`, `hasPeakPrice15m`, `sortBy`, and `sortOrder`; sortable fields include `observedAt`, `peakFdv24h`, `peakFdv7d`, `maxMultiple15m`, `volume7d`, and `timeToPeakMinutes`; items include `peakPrice15m`; `null` sort targets are placed last
- `metrics:report` is sufficient for confirming same-mint Metric history by `observedAt`, and now includes rawJson-free safe summary columns for saved market-data presence: `priceUsdPresent`, `fdvUsdPresent`, `reserveUsdPresent`, and `topPoolPresent`
- `metrics:report -- --limit <N>` can also inspect multi-token Metric row cohorts, but Token source / metadataStatus filtered Metric row history still requires combining `tokens:compare-report` for cohort selection with `metrics:report` for Metric-row history
- Telegram notification for `S` rank tokens that are not hard rejected

## Partially Implemented

- `groupKey` and `groupNote` are stored on `Token`, but no grouping logic uses them yet
- Trend scoring exists, but depends on fresh `data/trend.json`
- Trend data refresh is manual, not automatic

## Not Implemented

- Always-on import from external sources
- Background processing or scheduled jobs
- Full test framework
- Migrations directory and versioned DB history
- Operational docs and runbooks
- Telegram command handling or inbound bot features

## Current Constraints

- Input is still CLI-driven; the DexScreener detect runner plus the GeckoTerminal detect and metric watch runners can each poll one source in a single process, and the repo now includes only sample `systemd --user` units, not bundled installed services, queues, or schedulers
- Environment-dependent service startup still exists; use `scripts/check-systemd-user.sh` before picking the `systemd --user` sample versus the `tmux` / foreground fallback
- Scoring is entirely rule-based and file-backed
- Trend scoring is currently ineffective unless `data/trend.json` is refreshed
- Metrics are only stored when optional metric args are supplied manually
- In `pnpm import`, optional metric number/date args still treat empty strings as `undefined` instead of usage errors
- Trend updates must be triggered manually through the CLI
- CLI output is JSON-first and intended for manual inspection, not a long-running app runtime
- The DexScreener detect runner is still single-process and sequential; watch mode is a simple polling loop, not a queue, worker, scheduler, or retry runtime
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

GeckoTerminal detect watch runner:

```bash
bash ./scripts/run-geckoterminal-detect-watch.sh
```

GeckoTerminal metric watch runner:

```bash
bash ./scripts/run-geckoterminal-metric-watch.sh
```

Defaults:

```bash
LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=1800
LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10
LOWCAP_GECKOTERMINAL_METRIC_LIMIT=5
LOWCAP_GECKOTERMINAL_METRIC_SINCE_MINUTES=120
LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=900
```

GeckoTerminal enrich-rescore-notify runner:

```bash
bash ./scripts/run-geckoterminal-enrich-rescore-notify.sh
```

Defaults:

```bash
LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS=300
LOWCAP_GECKOTERMINAL_ENRICH_LIMIT=5
LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES=60
LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS=180
LOWCAP_GECKOTERMINAL_ENRICH_FAILURE_COOLDOWN_SECONDS=300
LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON=0
```

GeckoTerminal enrich-rescore-notify fast follow runner:

```bash
bash ./scripts/run-geckoterminal-enrich-rescore-notify-fast.sh
```

Defaults:

```bash
LOWCAP_GECKOTERMINAL_ENRICH_FAST_INTERVAL_SECONDS=60
LOWCAP_GECKOTERMINAL_ENRICH_FAST_LIMIT=3
LOWCAP_GECKOTERMINAL_ENRICH_FAST_SINCE_MINUTES=15
LOWCAP_GECKOTERMINAL_ENRICH_FAST_START_DELAY_SECONDS=60
LOWCAP_GECKOTERMINAL_ENRICH_FAST_FAILURE_COOLDOWN_SECONDS=120
LOWCAP_GECKOTERMINAL_ENRICH_FAST_VERBOSE_JSON=0
```

GeckoTerminal detect watch sample user service:

```bash
install -D -m 644 ./ops/systemd/lowcap-bot-geckoterminal-detect-watch.service ~/.config/systemd/user/lowcap-bot-geckoterminal-detect-watch.service
systemctl --user daemon-reload
systemctl --user enable --now lowcap-bot-geckoterminal-detect-watch.service
```

GeckoTerminal metric watch sample user service:

```bash
install -D -m 644 ./ops/systemd/lowcap-bot-geckoterminal-metric-watch.service ~/.config/systemd/user/lowcap-bot-geckoterminal-metric-watch.service
systemctl --user daemon-reload
systemctl --user enable --now lowcap-bot-geckoterminal-metric-watch.service
```

GeckoTerminal enrich-rescore-notify sample user service:

```bash
install -D -m 644 ./ops/systemd/lowcap-bot-geckoterminal-enrich-rescore-notify.service ~/.config/systemd/user/lowcap-bot-geckoterminal-enrich-rescore-notify.service
systemctl --user daemon-reload
systemctl --user enable --now lowcap-bot-geckoterminal-enrich-rescore-notify.service
```

GeckoTerminal enrich-rescore-notify fast follow sample user service:

```bash
install -D -m 644 ./ops/systemd/lowcap-bot-geckoterminal-enrich-rescore-notify-fast.service ~/.config/systemd/user/lowcap-bot-geckoterminal-enrich-rescore-notify-fast.service
systemctl --user daemon-reload
systemctl --user enable --now lowcap-bot-geckoterminal-enrich-rescore-notify-fast.service
```

GeckoTerminal detect watch tmux fallback:

```bash
tmux new -s lowcap-bot-gecko-detect 'cd /home/mochi/projects/lowcap-bot && bash ./scripts/run-geckoterminal-detect-watch.sh'
```

GeckoTerminal metric watch tmux fallback:

```bash
tmux new -s lowcap-bot-gecko-metric 'cd /home/mochi/projects/lowcap-bot && bash ./scripts/run-geckoterminal-metric-watch.sh'
```

GeckoTerminal enrich-rescore-notify tmux fallback:

```bash
tmux new -s lowcap-bot-gecko-enrich 'cd /home/mochi/projects/lowcap-bot && bash ./scripts/run-geckoterminal-enrich-rescore-notify.sh'
```

GeckoTerminal enrich-rescore-notify fast follow tmux fallback:

```bash
tmux new -s lowcap-bot-gecko-enrich-fast 'cd /home/mochi/projects/lowcap-bot && bash ./scripts/run-geckoterminal-enrich-rescore-notify-fast.sh'
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
- `detect:dexscreener:token-profiles` is a single-source runner; default output is dry-run JSON, and `--write` only hands accepted `{ mint, source? }` payloads into `import:mint`
- `token:show` includes `metadataStatus` plus the latest metric summary when one exists
- `token:show` now also includes `reviewFlags` when observational review flags have been stored on the token
- `tokens:report` includes `latestMetricObservedAt` and `metricsCount`
- report and show commands are read-only and return JSON
- smoke runs an operational check for typecheck, `import`, sequential `import:mint` re-run behavior, `import:mint:file`, `import:mint:source-file`, `detect:dexscreener:token-profiles` dry-run/write behavior, `import:min`, `import:file`, metric save, `metric:add` append-only behavior, `token:show`, `token:compare`, `tokens:compare-report`, `metric:show`, trend update, and metric report; it is side-effecting and not read-only verification
- `pnpm test` runs the current pure-function tests for normalization, hard reject matching, score calculation, and trend keyword parsing
- smoke restores `data/trend.json` after the run and cleans up its temporary smoke data
- A production DB smoke residue cleanup was run only for the safe
  `source GLOB 'smoke-test*'` subset: 6 Token rows and 1 Metric row were
  deleted after backup. Broad `mint GLOB '*SMOKE*'` cleanup was not run because
  non-smoke sources such as `geckoterminal.new_pools` can contain SMOKE-like
  mints. After cleanup, the `source GLOB 'smoke-test*'` Token / Metric /
  Notification / Dev subset was 0. `community:review` production DB write is
  still not executed and still requires a separate Red approval.

## Repository State

- Branch: `master`
- Untracked at the time of inspection: `.codex`
- Recent commits show the repo is still at MVP scaffold stage

## GeckoTerminal 240-Cycle Write Rehearsal

Date: 2026-05-18

The wall-clock 6h approximation write rehearsal was executed with the approved
single command:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 240 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal-20260518-240.json
```

Result:

- `status=ok`, `stopReason=completed`
- `cycleCount=240`, `completedIterations=240`
- `failedCount=0`
- `rateLimitRetryCount=1`, `rateLimitRetrySuccessCount=1`
- `importedCount=240`, `existingCount=0`
- `dryRun=false`, `writeEnabled=true`, `checkpointEnabled=true`
- `elapsedMs=16148551` (about 4h 29m 8.551s)
- checkpoint was written only to
  `/tmp/lowcap-bot-gecko-write-rehearsal-20260518-240.json`

Counts before / after:

- Token: `1296 -> 1536` (`+240`)
- Metric: `198 -> 198` (`+0`)
- Notification: `8 -> 8` (`+0`)
- HolderSnapshot: `1 -> 1` (`+0`)
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

This confirms the write boundary for this command: mint-only Token rows were
created, while Metric / Notification / HolderSnapshot rows were not created or
updated. No Telegram send was performed. Repo-local `data/trend.json` and
`data/checkpoints` stayed unchanged.

## Bounded Metric Accumulation Preflight

Date: 2026-05-19

Read-only preflight was completed for the next Metric accumulation slice after
the 240-cycle write rehearsal.

Current DB state:

- Token: `1536`
- Metric: `198`
- Notification: `8`
- HolderSnapshot: `1`
- `mint_only` Token count: `1373`
- Token rows with zero Metrics: `1377`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

The likely 240-token write-rehearsal cohort is still identifiable as
GeckoTerminal-origin pump mints with `metadataStatus=mint_only` and
`metricsCount=0`. `review:queue:geckoterminal -- --pumpOnly --limit 10`
reported `geckoOriginTokenCount=240`, `enrichPendingCount=240`, and
`metricPendingCount=240`.

Code inspection confirmed that `metric:snapshot:geckoterminal` batch mode
(`--mint` omitted) does not capture `metric_appended` Notifications; exact
`--mint --write` mode is the path that captures a Notification by default.
The next Red candidate is a bounded batch Metric write:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Expected upper bound: Token `+0`, Metric up to `+10`, Notification `+0`,
HolderSnapshot `+0`, Telegram send `0`. Because `sinceMinutes 1440` is
time-relative, rerun the read-only queue check immediately before Red execution
and stop if the candidate set no longer matches the 240-token cohort.

## Bounded Metric Accumulation Limit 10

Date: 2026-05-19

The bounded Metric accumulation Red command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Queue precheck immediately before execution:

- `review:queue:geckoterminal -- --pumpOnly --limit 10`
- `geckoOriginTokenCount=240`
- `metricPendingCount=240`
- selected preview rows were GeckoTerminal-origin pump `mint_only` Tokens with
  `metricsCount=0`

Result:

- exit code: `0`
- `selectedCount=10`
- `writtenCount=5`
- `skippedCount=0`
- `errorCount=5`
- no `skipped_recent_metric`
- five item errors were `429 Too Many Requests`
- written Metric ids: `1281`, `1282`, `1283`, `1284`, `1285`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `198 -> 203`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

This confirms the batch Metric write boundary for successful items: Metric rows
were appended and Notification capture stayed disabled in batch mode
(`notificationSkippedReason=not_single_mint_mode`). No Telegram send, Token
create/update, HolderSnapshot create/update, repo-local data diff, rawJson dump,
or secret display was observed.

Because the run hit `429` for half of the selected items, do not expand the
batch size yet. The next step should be a rate-limit-aware Metric accumulation
preflight or a smaller / delayed Red rerun plan, not a larger batch.

## Metric Snapshot Rate Limit Preflight

Date: 2026-05-19

Read-only / docs-only preflight was completed for the partial `limit 10`
Metric accumulation result. Current DB state is:

- Token: `1536`
- Metric: `203`
- Notification: `8`
- HolderSnapshot: `1`
- Token rows with zero Metrics: `1372`
- `review:queue:geckoterminal -- --pumpOnly --limit 10` reports
  `metricPendingCount=235`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Code inspection confirmed the current one-shot batch path is sequential, but
has no item-to-item delay. Each selected token performs one GeckoTerminal token
snapshot request. A `429 Too Many Requests` response is handled as an item-level
error: no Metric row is created for that item, Token / Notification /
HolderSnapshot rows are not changed, and the failed mint remains a future
Metric candidate because it still has `metricsCount=0`. The CLI can exit `0`
while reporting `errorCount>0`; this is partial success, not a fully Green
batch expansion signal.

Do not expand Metric batch size while this pacing gap exists. The recommended
next task is a Yellow implementation of a batch pacing option, preferably
`--interItemDelayMs <N>`, with default behavior unchanged and Notification /
Telegram semantics untouched. Full policy:
`docs/runbooks/metric-snapshot-rate-limit-policy.md`.

## Metric Snapshot Inter-Item Delay

Date: 2026-05-19

`metric:snapshot:geckoterminal` now supports `--interItemDelayMs <N>` for
batch pacing. The default is `0`, preserving existing behavior. The option
accepts a non-negative integer, is reported in the JSON summary, and delays
only between selected batch items. There is no delay before the first item, no
delay after the final item, and exact `--mint` mode is not delayed even if the
option is present.

This change does not alter Metric write semantics, Notification capture,
Telegram live send behavior, Token / HolderSnapshot behavior, or 429 handling.
`429 Too Many Requests` remains an item-level error with no Metric row for that
item and unchanged CLI exit-code policy.

Next Red candidate, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

## Delayed Metric Accumulation Limit 10

Date: 2026-05-19

The delayed Metric accumulation Red command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Queue precheck immediately before execution reported:

- `geckoOriginTokenCount=240`
- `metricPendingCount=235`
- candidate rows were GeckoTerminal-origin pump `mint_only` Tokens
- the first five preview rows already had recent Metrics and were expected to
  be skipped by `minGapMinutes=60`

Result:

- exit code: `0`
- `selectedCount=10`
- `writtenCount=5`
- `skippedCount=5`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=9`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1286`, `1287`, `1288`, `1289`, `1290`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `203 -> 208`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Compared with the prior no-delay limit 10 run (`writtenCount=5`,
`errorCount=5`, five `429` errors), the delayed run produced
`writtenCount=5`, `skippedCount=5`, and `errorCount=0`. Because five selected
rows were skipped by `minGapMinutes=60`, this confirms delayed pacing removed
429s for the fetched pending items, but it was not a full 10-fetch comparison.
No Telegram send, Notification create/update, Token update/create,
HolderSnapshot write, repo-local data diff, rawJson dump, or secret display was
observed.

## Delayed Metric Accumulation Limit 20

Date: 2026-05-19

The delayed Metric accumulation Red command was expanded modestly to limit 20
and executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Queue precheck immediately before execution reported:

- `geckoOriginTokenCount=240`
- `metricPendingCount=230`
- candidate rows were GeckoTerminal-origin pump `mint_only` Tokens
- recent Metric rows were mixed into the selected window and expected to be
  skipped by `minGapMinutes=60`

Result:

- exit code: `0`
- `selectedCount=20`
- `writtenCount=10`
- `skippedCount=10`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=19`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1291` through `1300`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `208 -> 218`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Compared with delayed limit 10 (`writtenCount=5`, `skippedCount=5`,
`errorCount=0`), delayed limit 20 maintained zero errors and zero 429s while
writing 10 Metrics. Token / Notification / HolderSnapshot stayed unchanged, no
Telegram send occurred, repo-local data stayed clean, and no rawJson or secrets
were displayed. Next expansion should still be modest, for example delayed
limit 30, rather than a large batch jump.

## Delayed Metric Accumulation Limit 30

Date: 2026-05-19

The delayed Metric accumulation Red command was expanded to limit 30 and
executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Queue precheck immediately before execution reported:

- `geckoOriginTokenCount=240`
- `metricPendingCount=220`
- candidate rows were GeckoTerminal-origin pump `mint_only` Tokens
- recent Metric rows were mixed into the selected window and expected to be
  skipped by `minGapMinutes=60`

Result:

- exit code: `0`
- `selectedCount=30`
- `writtenCount=15`
- `skippedCount=15`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=29`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1301` through `1315`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `218 -> 233`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Compared with delayed limit 20 (`writtenCount=10`, `skippedCount=10`,
`errorCount=0`), delayed limit 30 maintained zero errors and zero 429s while
writing 15 Metrics. Token / Notification / HolderSnapshot stayed unchanged, no
Telegram send occurred, repo-local data stayed clean, and no rawJson or secrets
were displayed. The skip ratio remained 50%, so the next step should be a
Yellow candidate-selection improvement that excludes recent Metrics before
applying `--limit`, rather than another batch-size expansion.

## Metric Snapshot Candidate Selection Improvement

Date: 2026-05-19

`metric:snapshot:geckoterminal` batch mode now excludes recent Metric rows
before applying `--limit` when `--minGapMinutes <N>` is provided. The selection
order is now:

1. select recent GeckoTerminal-origin tokens inside `--sinceMinutes`;
2. apply `--pumpOnly` when requested;
3. exclude tokens whose latest Metric for the target metric source is newer
   than `now - minGapMinutes`;
4. apply `--prioritizeRichPending` when requested;
5. apply `--limit`.

This keeps `--limit` focused on tokens that can actually be processed, reducing
the repeated `skipped_recent_metric` waste observed in delayed limit 10/20/30
runs. Exact `--mint` mode keeps the existing behavior: it can still return
`skipped_recent_metric` when the target mint is inside the min-gap window.
`--interItemDelayMs`, 429 item-error behavior, Notification capture, Telegram,
Token writes, and HolderSnapshot behavior are unchanged.

The next Red candidate, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected result: `selectedCount=30`, `skipped_recent_metric` greatly reduced
and ideally zero, `errorCount=0`, no 429, Metric up to +30, and Token /
Notification / HolderSnapshot unchanged.

## Improved Metric Accumulation Limit 30

Date: 2026-05-19

After the candidate-selection improvement, the delayed limit 30 Red command was
executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Queue precheck immediately before execution reported:

- `geckoOriginTokenCount=240`
- `metricPendingCount=210`
- `queues.metricPending` contained GeckoTerminal-origin pump `mint_only` Tokens
  with `metricsCount=0`
- the generic queue preview still included some enrich-pending rows with recent
  Metrics, but those are not the improved Metric snapshot execution selection

Result:

- exit code: `0`
- `selectedCount=30`
- `writtenCount=30`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=29`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1316` through `1345`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `233 -> 263`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Compared with the prior delayed limit 30 run (`writtenCount=15`,
`skippedCount=15`, `errorCount=0`), the improved limit 30 run produced
`writtenCount=30`, `skippedCount=0`, and `errorCount=0`. The recent-Metric
exclusion before `--limit` is confirmed effective. Token / Notification /
HolderSnapshot stayed unchanged, Telegram was not sent, repo-local data stayed
clean, and no rawJson or secrets were displayed. The next expansion should
remain incremental, such as improved delayed limit 50, rather than jumping to a
large batch.

## Improved Metric Accumulation Limit 50

Date: 2026-05-19

The improved delayed limit 50 Red command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Queue precheck immediately before execution reported `geckoOriginTokenCount=240`
and `metricPendingCount=180`. `queues.metricPending` contained GeckoTerminal
origin pump `mint_only` Tokens with `metricsCount=0`. The generic queue preview
still included some enrich-pending rows with recent Metrics, but the Metric
snapshot execution path applies min-gap before `--limit`.

Result:

- exit code: `0`
- `selectedCount=50`
- `writtenCount=50`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=49`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1346` through `1395`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `263 -> 313`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Compared with improved limit 30 (`writtenCount=30`, `skippedCount=0`,
`errorCount=0`), improved limit 50 kept `skipped_recent_metric` at zero, stayed
429-free, and increased Metric rows by 50. Token / Notification /
HolderSnapshot stayed unchanged, Telegram was not sent, repo-local data stayed
clean, and no rawJson or secrets were displayed. The next expansion should
still be incremental, such as a limit 75 preflight or Red task, before any
larger batch.

## Improved Metric Accumulation Limit 75

Date: 2026-05-19

The improved delayed limit 75 Red command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Queue precheck immediately before execution reported `geckoOriginTokenCount=240`
and `metricPendingCount=135`. `queues.metricPending` contained GeckoTerminal
origin pump `mint_only` Tokens with `metricsCount=0`; enough pending candidates
remained for a limit 75 run.

Result:

- exit code: `0`
- `selectedCount=75`
- `writtenCount=75`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=74`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1396` through `1470`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `313 -> 388`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Compared with improved limit 50 (`writtenCount=50`, `skippedCount=0`,
`errorCount=0`), improved limit 75 kept `skipped_recent_metric` at zero, stayed
429-free, and increased Metric rows by 75. Token / Notification /
HolderSnapshot stayed unchanged, Telegram was not sent, repo-local data stayed
clean, and no rawJson or secrets were displayed. After this successful
expansion, the next task should shift toward read-only report validation, such
as `metrics:window-report` or cohort reporting, instead of continuing batch-size
expansion.

## Metric Report Readiness Confirmation

Date: 2026-05-19

After improved Metric accumulation through limit 75, read-only report readiness
was confirmed without additional Metric snapshot, detect watch, DB write,
external fetch, Telegram send, or rawJson dump.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=261`, `2+=53`
- GeckoTerminal-origin pump `mint_only` coverage: Metric `0=260`, `1=128`,
  `2+=32`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` reported
  `metricPendingCount=85`

Read-only commands executed:

- `metrics:window-report` for Notification id `8` token
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
- `metrics:window-report` for Metric 3 token
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`
- `metrics:window-report` for Metric 1 token
  `CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump`
- `metrics:report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --limit 3`
- `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus mint_only --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 5`

Findings:

- `metrics:window-report` is explicitly read-only:
  `readOnly=true`, `willWrite=false`, `willFetch=false`,
  `willSendTelegram=false`
- Notification id `8` is read as `alertNotificationId=8` with
  `alertedAtSource=notification_sent_at`; its windows are `no_data` because the
  two Metrics predate the live-send `sentAt` anchor
- the Metric 3 token reports `metricCount=3`, `fdvMetricCount=3`, short-window
  FDV samples, and 24h `fdvSampleCoverageLabel=partial`
- the Metric 1 token reports `metricCount=1`, `fdvMetricCount=1`, and 24h
  `fdvSampleCoverageLabel=thin`
- `metrics:report` and `tokens:compare-report` show rawJson-free market-data
  presence booleans and latest Metric summaries
- no rawJson full dump, secrets, DB write, external fetch, Telegram send, or
  repo-local data changes occurred

Detailed notes live in `docs/runbooks/metric-report-readiness.md`.

## Next Operating Slice Decision

Date: 2026-05-21

This Green decision preflight reviewed the next operating step after the
capture-only rehearsal slice. It performed read-only checks only: no DB write,
external fetch, Telegram send, Notification update, Metric write, Token write,
HolderSnapshot write, metric snapshot execution, notification send, retry
execution, detector / ops catch-up execution, `--write`, `--watch`, `--live`,
schema / migration change, app code change, rawJson full dump, or secret output.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- `notification:retry:plan` candidate count: `0`
- default 24h GeckoTerminal review queue: `metricPendingCount=0`
- 168h GeckoTerminal review queue: `geckoOriginTokenCount=420`,
  `metricPendingCount=260`, `enrichPendingCount=420`, `notifyCandidateCount=0`

Completed slices now include report / outcome Policy C context, manual
Telegram live send, smoke / rehearsal live-send and retry guard, marker-tagged
capture-only rehearsal, and id `9` continuing to be excluded from manual
live-send and retry candidates. Auto live send, scheduler, worker, queue, and
systemd remain locked.

Candidate comparison:

- A, auto live send gate preflight: best next step. It moves Telegram
  operation forward without sending Telegram, and focuses on a disable switch,
  explicit allowlist, one-run maximum, dry-run preview, and stop conditions
  before any scheduler or systemd work. The main caveat is that current manual
  live-send candidate count is `0`, so validation will be design / guard first.
- B, another capture-only rehearsal Red: lower value. Marker-tagged capture has
  already succeeded once and another run would add another rehearsal row plus
  external fetch and Metric write.
- C, Metric accumulation / report: useful later, but it moves away from the
  Telegram operating slice. The 168h queue has Metric 0 rows, but additional
  Metric samples alone do not solve the alert-FDV anchor issue.
- D, detect / new-pool watch: useful later for the broader research OS, but it
  needs a bounded watch / checkpoint decision and any write rehearsal would be
  Red.
- E, docs / handoff only: safe, but less forward progress now that the current
  state is already documented.

Decision: choose candidate A as the next single operating slice. The next
Codex task should be **Yellow: preflight auto live send gate implementation**.
It should design, but not execute, an auto live-send gate separated from
scheduler / systemd, with safe defaults and no Telegram send.

## Auto Live Send Gate Preflight

Date: 2026-05-21

The auto live-send gate implementation preflight is complete as a docs-only
decision. No application code, schema, migration, DB write, Notification
update, external fetch, Telegram send, retry execution, Metric snapshot,
detector / ops catch-up run, `--write`, `--watch`, `--live`, scheduler,
systemd, rawJson full dump, or secret output occurred.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- `notification:retry:plan` candidate count: `0`

The recommended future auto-send kill switch is
`NOTIFICATION_AUTO_SEND_ENABLED=true`, with default disabled behavior for
unset, `false`, or any other value. The switch is scoped to future auto send;
manual approved `notification:send --live` stays separate.

The next Yellow implementation should add only a read-only planner CLI,
tentatively `notification:auto-send:plan`. It should report the future gate's
allowlist, blocked reasons, one-run max, dry-run preview, and stop conditions
without connecting a Telegram sender or updating Notifications. Initial
one-run max is fixed at `1`; allowed rows must be production-shaped
`metric_appended` captured / capture-only Notifications with no sent / failed
state, no smoke / rehearsal marker, no retry status, safe preview available,
and global failed count `0`.

Detailed design is recorded in `docs/runbooks/auto-live-send-gate.md`. Auto
live send, scheduler, and systemd remain unapproved.

## Auto Send Planner CLI

Date: 2026-05-21

`notification:auto-send:plan` has been added as a read-only / dry-run planner
for the future auto live-send gate. It reads Notification state only and does
not connect a Telegram sender, update Notifications, execute retry, fetch
externally, write Token / Metric / HolderSnapshot state, or unlock scheduler /
systemd.

Planner policy:

- `NOTIFICATION_AUTO_SEND_ENABLED=true` is the future enable switch
- unset / `false` / any other value reports `autoSendEnabled=false`
- even with `autoSendEnabled=true`, the planner reports `wouldSend=false` and
  `wouldUpdateNotification=false`
- one-run max is fixed at `1`
- allowed candidates must be production-shaped `metric_appended`,
  `captured` / `capture_only`, `sentAt=null`, `failedAt=null`,
  `errorCode=null`, safe-preview rows with no smoke / rehearsal marker and no
  failed Notification count

Production DB runtime check:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- with `NOTIFICATION_AUTO_SEND_ENABLED` unset:
  `allowedCandidateCount=0`, `selectedNotificationId=null`,
  `wouldSend=false`, `wouldUpdateNotification=false`
- with `NOTIFICATION_AUTO_SEND_ENABLED=true`:
  `allowedCandidateCount=0`, `selectedNotificationId=null`,
  `wouldSend=false`, `wouldUpdateNotification=false`

Captured ids `3` through `6` and id `9` remain excluded by the
smoke/rehearsal guard. Sent ids `7` and `8` remain excluded by sent-row
guards. Auto live send execution, scheduler, and systemd remain unapproved.

## Auto Send Planner Output Review

Date: 2026-05-21

The implemented `notification:auto-send:plan` was run against production DB as
a read-only operations preflight. No Telegram send, Notification update, auto
live-send execution, retry execution, DB write, external fetch, Metric
snapshot, detector / ops catch-up, `--write`, `--watch`, `--live`, scheduler,
systemd, schema / migration change, application code change, rawJson full
dump, or secret output occurred.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- allowed auto-send candidate count: `0`

Planner checks:

- default / unset switch:
  `autoSendEnabled=false`, `allowedCandidateCount=0`,
  `selectedNotificationId=null`, `wouldSend=false`,
  `wouldUpdateNotification=false`, stop conditions
  `auto_send_disabled`, `no_allowed_candidate`,
  `only_sent_or_blocked_candidates`
- `NOTIFICATION_AUTO_SEND_ENABLED=false`:
  same disabled result
- `NOTIFICATION_AUTO_SEND_ENABLED=true`:
  `autoSendEnabled=true`, `allowedCandidateCount=0`,
  `selectedNotificationId=null`, `wouldSend=false`,
  `wouldUpdateNotification=false`, stop conditions
  `no_allowed_candidate`, `only_sent_or_blocked_candidates`

The no-send reason is readable: captured ids `3` through `6` are `SMOKE_...`
rehearsal rows, captured id `9` is a `REHEARSAL:...` row, and sent ids `7` /
`8` remain blocked by sent-row state. `blockedReasons` separates disabled,
sent-row, smoke/rehearsal, and non-production-key causes without printing full
message bodies, rawJson, Telegram token, chat id, or environment values.

Judgment: no immediate planner guard or output field change is required. The
next useful task is **Green: auto live-send execution implementation
preflight**, limited to design of sender boundary, Notification update scope,
failure handling, kill switch behavior, and stop conditions. Auto live-send
execution, scheduler, and systemd remain unapproved.

## Auto Live-Send Execution Preflight

Date: 2026-05-21

The execution implementation preflight is complete as a read-only / docs-only
decision. No app code, schema, migration, DB write, Notification update,
external fetch, Telegram send, retry execution, Metric snapshot, detector /
ops catch-up, `--write`, `--watch`, `--live`, scheduler, systemd, rawJson full
dump, or secret output occurred.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- allowed auto-send candidate count: `0`
- retry candidate count: `0`

Design decision:

- recommended CLI: `notification:auto-send:execute`
- keep it separate from manual `notification:send`
- default without explicit `--execute` should be dry-run / stopped summary
- future real execution requires both
  `NOTIFICATION_AUTO_SEND_ENABLED=true` and explicit `--execute`
- never use `--live` for the auto-send path
- execution must call the planner first and continue only when
  `allowedCandidateCount=1`, `selectedNotificationId` is present,
  `stopConditionCodes=[]`, failed count is `0`, one-run max is satisfied, and
  selected candidate has no blockers

Sender connection boundary: connect `sendOpsTelegramNotification()` only after
the planner gate passes. Blocked / stopped results must not connect the sender
or update DB state.

Notification update scope: success may update exactly one selected
Notification to `status=sent`, `mode=live_send`, `sentAt`, and
`lastAttemptAt`; failure after sender connection may update exactly one
selected Notification to `status=failed`, `mode=live_send`, `failedAt`,
`lastAttemptAt`, and sanitized `errorCode` / `reason`. Token, Metric,
HolderSnapshot, Notification create, raw Telegram response storage, and retry
execution remain out of scope.

Next task: **Yellow: implement disabled-by-default
`notification:auto-send:execute` CLI with tests only**. Production runtime for
that task should be limited to `--help` and planner checks. No production
`--execute`, Telegram send, Notification update, scheduler, or systemd.

## Auto Send Execute CLI

Date: 2026-05-21

`notification:auto-send:execute` has been added as a disabled-by-default auto
send execution boundary. The implementation includes a CLI, helper, mocked
sender tests, and docs. Production `--execute` was not run.

Behavior:

- package script: `notification:auto-send:execute`
- CLI default: dry-run / stopped summary
- explicit `--execute` is required before any sender attempt
- `NOTIFICATION_AUTO_SEND_ENABLED=true` is also required before any sender
  attempt
- execution calls the read-only planner first
- sender is connected only after planner gate pass:
  `allowedCandidateCount=1`, selected id present, `stopConditionCodes=[]`,
  one-run max `1`, no failed rows, no smoke / rehearsal marker, no sent row,
  and safe preview available
- success / failure update scope is limited to the selected Notification row
- retry execution, scheduler, and systemd remain separate and unapproved

Production runtime checks did not use `--execute`. Equivalent
`node --import tsx src/cli/notificationAutoSendExecute.ts` checks returned:

- default: `executeRequested=false`, `readOnly=true`, `dryRun=true`,
  `autoSendEnabled=false`, `status=stopped`,
  `blockedBy=[execute_flag_required]`, `sendAttempted=false`,
  `senderCalled=false`, `sentCount=0`, `updatedCount=0`
- with `NOTIFICATION_AUTO_SEND_ENABLED=true`: still `executeRequested=false`,
  `status=stopped`, `sendAttempted=false`, `senderCalled=false`,
  `updatedCount=0`, and planner `allowedCandidateCount=0`

Counts stayed unchanged:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- allowed auto-send candidate count: `0`
- retry candidate count: `0`

The package script uses `tsx` as requested. In the default sandbox it hit the
known local `tsx` IPC `EPERM` limitation, so equivalent `node --import tsx ...`
commands were used first; the package script was then confirmed outside that
sandbox for `--help` and default no-`--execute` dry-run only. No production
`--execute` was run.

Next useful step: **Green: review `notification:auto-send:execute` no-execute
runtime output** against production DB, then decide whether the next Red/Green
slice should create one real production-shaped capture-only candidate or stay
in mock-only execution hardening. Auto live-send execution remains unrun.

## Auto Send Execute No-Execute Review

Date: 2026-05-21

`notification:auto-send:execute` was reviewed against production DB without
`--execute`. This was read-only / docs-only. No Telegram send, Notification
create/update, DB write, external fetch, retry execution, Metric snapshot,
detector / ops catch-up, `--write`, `--watch`, `--live`, scheduler, systemd,
schema / migration change, app code change, rawJson full dump, or secret
output occurred.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- allowed auto-send candidate count: `0`
- retry candidate count: `0`

Runtime review:

- default no-execute:
  `executeRequested=false`, `readOnly=true`, `dryRun=true`,
  `autoSendEnabled=false`, `status=stopped`,
  `blockedBy=[execute_flag_required]`, `sendAttempted=false`,
  `senderCalled=false`, `sentCount=0`, `updatedCount=0`
- `NOTIFICATION_AUTO_SEND_ENABLED=true` with no `--execute`:
  `executeRequested=false`, `readOnly=true`, `dryRun=true`,
  `autoSendEnabled=true`, `status=stopped`,
  `blockedBy=[execute_flag_required]`, `sendAttempted=false`,
  `senderCalled=false`, `sentCount=0`, `updatedCount=0`,
  planner `allowedCandidateCount=0`
- planner comparison stayed unchanged:
  captured ids `3` through `6` are `SMOKE_...`, id `9` is `REHEARSAL:...`,
  sent ids `7` / `8` are sent-row blocked, failed count is `0`, and retry
  candidate count is `0`

Judgment: output is sufficient. `execute_flag_required` is explicit, the env
switch alone is not enough to send, planner and executor summaries line up,
and no additional guard / field is needed now. Production `--execute` remains
forbidden.

Next task: **Green: real production-shaped capture-only candidate creation
preflight**. It should decide whether one bounded Telegram-free Metric /
Notification capture can create exactly one normal production-shaped captured
candidate for future auto-send planning. The later candidate creation command,
if approved, would be Red/Green because it may include external fetch, Metric
write, and Notification create. Auto live-send execution remains unrun.

## Metric Snapshot Rehearsal Tag Option

Date: 2026-05-20

`metric:snapshot:geckoterminal` now has a minimal
`--notificationRehearsalTag <TAG>` option for future capture-only rehearsal
rows. The production default key remains unchanged as
`<mint>:metric_appended:<metricId>`. When explicitly used in exact
`--mint --write` one-shot mode, the capture-only Notification key becomes
`REHEARSAL:<TAG>:<mint>:metric_appended:<metricId>`.

The tag must be non-empty, no longer than 40 characters, and limited to
letters, numbers, underscore, and hyphen. Batch mode, no-`--write` dry-run
usage, `--noNotificationCapture`, and `--watch` are rejected. Generated
`REHEARSAL:` keys are covered by the existing live-send / retry smoke
rehearsal guard, so they are excluded from manual live send and retry
candidates.

This was implementation and test work only: no capture-only Red rehearsal,
production DB write, external fetch, Telegram send, Notification create/update,
schema / migration change, scheduler, systemd, or auto live send unlock
occurred.

## Capture-Only Rehearsal Red Candidate

Date: 2026-05-20

A read-only Green pass selected one exact command for the next human-approved
capture-only Notification rehearsal. Current DB state is Token / Metric /
Notification / HolderSnapshot `1536 / 447 / 8 / 1`, with Notification statuses
`captured=4`, `sent=4`, `failed=0`, manual live-send candidate count `0`, and
retry candidate count `0`.

Selected mint: `2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump`. It is an
existing GeckoTerminal-origin pump Token with existing Metrics `1529` and
`1344`, and no existing Notification rows for that token.

Selected tag: `capture_rehearsal_20260520`.

Exact Red command candidate, not executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --write --notificationRehearsalTag capture_rehearsal_20260520
```

Expected side effects are bounded to max one GeckoTerminal fetch, max one
Metric write, and max one capture-only Notification create with key pattern
`REHEARSAL:capture_rehearsal_20260520:<mint>:metric_appended:<metricId>`.
Expected non-effects are Telegram send `0`, Notification sent/failed update
`0`, Token write `0`, HolderSnapshot write `0`, retry execution `0`, scheduler
/ systemd / auto live send `0`, repo-local data diff none, and rawJson full
dump none. Human approval is required before execution.

## Capture-Only Rehearsal Red Result

Date: 2026-05-20

The approved Red command was executed exactly once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --write --notificationRehearsalTag capture_rehearsal_20260520
```

Result: `selectedCount=1`, `okCount=1`, `writtenCount=1`, `skippedCount=0`,
`errorCount=0`, no provider error, and no `429`. Counts moved Token / Metric /
Notification / HolderSnapshot `1536 / 447 / 8 / 1 -> 1536 / 448 / 9 / 1`.
Notification statuses moved `captured=4, sent=4 -> captured=5, sent=4`; failed
count stayed `0`.

Created Notification id `9`:

- key:
  `REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:1530`
- status / mode: `captured` / `capture_only`
- trigger: `metric_appended`
- `sentAt=null`, `failedAt=null`, `errorCode=null`

The new REHEARSAL row is marker-guarded. Manual live-send candidate count
remained `0`, and `notification:retry:plan` remained read-only with
`candidateCount=0`. Telegram send, Notification sent / failed update, Token
write, HolderSnapshot write, retry execution, scheduler, systemd, auto live
send, rawJson full dump, and secret output did not occur.

## Rehearsal Notification Exclusion Follow-Up

Date: 2026-05-20

A read-only follow-up confirmed that the Red-created REHEARSAL Notification id
`9` remains safely excluded:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`

Notification id `9` is still `captured` / `capture_only` with trigger
`metric_appended`, `sentAt=null`, `failedAt=null`, and `errorCode=null`. Its
key remains
`REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:1530`,
so it is covered by the smoke / rehearsal live-send and retry guards. Captured
ids `3` through `6` remain `SMOKE_...` rehearsal rows, and sent ids `7` / `8`
remain excluded by sent-row resend prevention.

This closes the capture-only rehearsal slice. No DB write, external fetch,
Telegram send, Notification update, Metric write, Token write, HolderSnapshot
write, rawJson full dump, schema / migration change, or app code change
occurred in the follow-up. Auto live send, scheduler, and systemd remain
locked.

## Metric Report Readiness After Additional Limit 75

Date: 2026-05-20

A read-only report pass rechecked the accumulated Metric surface after the
additional limit-75 observation run wrote 59 more Metrics. The current DB state
is Token / Metric / Notification / HolderSnapshot `1536 / 447 / 8 / 1`, with
Token Metric distribution `0=1222`, `1=232`, `2+=82`, GeckoTerminal-origin pump
`mint_only` coverage Metric `0=260`, `1=99`, `2+=61`, and Notification
statuses `captured=4`, `sent=4`, `failed=0`.

`metrics:window-report` remained read-only with `willWrite=false`,
`willFetch=false`, and `willSendTelegram=false`. It read Notification id `8`,
Metric 2+ samples, a latest accumulation sample, and a mint-only Metric 1
sample without printing rawJson. `metrics:report`, `tokens:compare-report`, and
`review:queue:geckoterminal` also produced rawJson-free read-only summaries.
The 168h review queue keeps Metric 0 rows pending while recent Metric-written
tokens are no longer `metricPending`.

No DB write, external fetch, Telegram send, Notification update, schema /
migration change, application code change, scheduler, systemd, or rawJson full
dump occurred. Detailed notes live in
`docs/runbooks/metric-report-readiness.md`.

## No-Data Reason Operator Review

Date: 2026-05-20

A read-only follow-up checked whether the new `metrics:window-report`
explanation fields are enough for operator triage. No application code,
schema, migration, Metric snapshot, detect watch, external fetch, Telegram
send, or DB write was executed.

Current DB state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Cohort checked with `metrics:window-report -- --windows
30,60,120,180,360,720,1440`:

- Notification id `8` token:
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
- Notification id `7` token:
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`
- no-Notification mint-only fallback with Metrics:
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`
- Metric 0 mint-only sample:
  `By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`
- Metric 1 mint-only sample:
  `DAMRNx1oheBNpy7WRtp6ptPGGzxZkiTjxq4ptHmdpump`
- Metric 1 -> 2+ sample:
  `CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump`

Findings:

- Notification id `8` still resolves `alertedAtSource=notification_sent_at`
  and `alertNotificationId=8`; its post-send windows show
  `hasAlertFdvAnchor=false`, `hasWindowFdvSamples=false`, and
  `noDataReasons` including `no_fdv_samples_in_window`, making the missing
  post-send sample clear.
- Notification id `7` remains the flat positive control. Wider windows show
  `outcomeLabel=flat`, `hasAlertFdvAnchor=true`,
  `hasWindowFdvSamples=true`, and `noDataReasons=[]`, so non-`no_data`
  windows are not incorrectly annotated with no-data reasons.
- no-Notification mint-only fallback rows with Metrics show
  `hasWindowFdvSamples=true` but `hasAlertFdvAnchor=false`, with
  `noDataReasons` narrowed to `no_alert_anchor_near_entry` and
  `no_peak_multiple`. This separates "samples exist" from "no alert FDV
  anchor".
- Metric 0 rows show `hasWindowFdvSamples=false` and the full no-sample reason
  set, including `no_fdv_samples_in_window`.
- Metric 1 and Metric 1 -> 2+ rows show `thin` / `partial` coverage as sample
  density improves, while still reporting `no_alert_anchor_near_entry` when no
  alert FDV anchor exists.

Judgment: the fields are sufficient for current operator decisions. They make
the next bottleneck explicit: no-Notification mint-only fallback rows need an
alert-FDV anchor policy if operators want outcome labels beyond `no_data`.
Additional broad Metric accumulation can improve coverage, but it will not by
itself create `flat` / `small_win` / `hit` / `big_hit` outcomes for rows with
`alertFdv=null`. Telegram operating work can resume separately, but the
outcome-reporting path should next define alert-anchor behavior before more
report display work.

## Alert FDV Anchor Policy Preflight

Date: 2026-05-20

A read-only / docs-only preflight evaluated mint-only fallback tokens where
`metrics:window-report` resolves `alertedAt` from
`firstSeenSourceSnapshot.detectedAt` but cannot find a strict ±5m `alertFdv`.
No implementation, schema, migration, external fetch, DB write, Metric
snapshot, detect watch, Telegram send, or rawJson dump was executed.

Target definition:

- GeckoTerminal-origin pump `mint_only`
- no Notification row
- has Metric
- has at least one FDV Metric

Read-only aggregation result:

- target token count: `158`
- target Metric distribution: `Metric 1=99`, `Metric 2+=59`
- strict ±5m anchor found: `0`
- strict anchor missing: `158`
- before-side FDV Metric present: `0`
- after-side FDV Metric present: `158`

First FDV Metric after `alertedAt` lag:

- `<=5m`: `0`
- `<=15m`: `0`
- `<=30m`: `5`
- `<=60m`: `5`
- `<=120m`: `17`
- `<=180m`: `39`
- `<=360m`: `158`
- `>360m`: `0`
- no after Metric: `0`

Policy conclusion:

- Policy A, strict current behavior, is semantically clean but leaves all 158
  target rows without `alertFdv`.
- Policy B, widening mint-only fallback after-window, does not help enough at
  60m (`5 / 158`) and needs up to 360m to recover all rows, which weakens the
  meaning of alert-time FDV.
- Policy C, keeping `alertFdv` strict and adding report-only derived baseline
  fields, is the safest next implementation.
- Policy D, using the first post-entry FDV Metric for outcome calculation, is
  useful but too risky before operators review anchor lag / quality because
  many anchors are 180m to 360m after first seen.

Recommended next Yellow task: add report-only derived mint-only fallback anchor
fields such as `entryAnchorFdv`, `entryAnchorObservedAt`,
`entryAnchorLagMinutes`, `entryAnchorSource`, and `entryAnchorQuality` to
`metrics:window-report`. Do not change `alertFdv`, strict ±5m lookup,
`outcomeLabel`, Notification-backed token behavior, DB schema, or persisted
data in that first implementation.

## Window Report Entry Anchor Fields

Date: 2026-05-20

Policy C is implemented in `metrics:window-report` as report-only computed
fields:

- `entryAnchorFdv`
- `entryAnchorObservedAt`
- `entryAnchorLagMinutes`
- `entryAnchorSource`
- `entryAnchorQuality`

These fields identify the first FDV Metric at or after resolved `alertedAt`.
They do not replace `alertFdv`, are not persisted, and are not used for
`peakMultipleFromAlert` or `outcomeLabel`.

`entryAnchorQuality` buckets:

- `none`
- `near_5m`
- `near_30m`
- `acceptable_60m`
- `delayed_120m`
- `delayed_180m`
- `late_360m`
- `very_late_gt_360m`

Runtime read-only checks:

- no-Notification mint-only fallback, short lag:
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump` now prints
  `entryAnchorFdv=2348.1612253362`,
  `entryAnchorLagMinutes=20.218433333333333`, and
  `entryAnchorQuality=near_30m` while `alertFdv=null` and
  `outcomeLabel=no_data` remain unchanged.
- no-Notification mint-only fallback, long lag:
  `BCiYyqsMthUWhhSUA2ZBVGVXgLx99XnsroVrCn6Wpump` prints
  `entryAnchorLagMinutes=358.35365` and `entryAnchorQuality=late_360m`.
- Notification id `8` token has no post-`sentAt` FDV sample, so
  `entryAnchorFdv=null`, `entryAnchorSource=none`, and
  `entryAnchorQuality=none`.
- Notification id `7` token keeps `alertFdv=223702.038226584` and
  `outcomeLabel=flat` in wider windows; entry anchor is additional context
  only.

Validation passed:

- `pnpm exec tsc --noEmit`
- `node --import tsx --test tests/metricsWindowReport.test.ts`
- `pnpm -s metrics:window-report -- --help`

The runtime checks stayed read-only with `willWrite=false`, `willFetch=false`,
and `willSendTelegram=false`. No Metric snapshot, detect watch, external fetch,
DB write, Telegram send, schema/migration change, or rawJson full dump was
performed.

## Entry Anchor Quality Cohort Review

Date: 2026-05-20

A read-only / docs-only cohort review used the new report-only `entryAnchor*`
fields to decide whether mint-only fallback rows should move from Policy C
into Policy D outcome calculation. No implementation, schema, migration,
Metric snapshot, detect watch, external fetch, production DB write, Telegram
send, Notification send/retry, or rawJson full dump was executed.

Current state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Target cohort:

- GeckoTerminal-origin pump `mint_only`
- no Notification row
- has Metric
- has readable FDV Metric

Read-only aggregation:

- target token count: `158`
- target Metric distribution: `Metric 1=99`, `Metric 2+=59`
- strict ±5m `alertFdv` anchor found: `0`
- strict anchor missing: `158`
- `hasWindowFdvSamples=true`: `158`
- `hasAlertFdvAnchor=false`: `158`

`entryAnchorQuality` distribution:

- `near_30m`: `5`
- `delayed_120m`: `12`
- `delayed_180m`: `22`
- `late_360m`: `119`
- `near_5m`, `acceptable_60m`, `none`, and `very_late_gt_360m`: `0`

`entryAnchorLagMinutes` stats:

- min `20.2184`
- median `238.8762`
- p75 `308.4780`
- p90 `339.0626`
- max `358.3537`

Hypothetical Policy D comparison:

- D30 (`near_5m` / `near_30m`) would make `5 / 158` rows calculable, all
  hypothetical `flat`
- D60 is the same as D30 in this cohort because no `acceptable_60m` rows exist
- D180 would make `39 / 158` rows calculable but includes anchors up to about
  `179m` late
- D360 would make `158 / 158` rows calculable but mostly from delayed
  first-observation baselines; median lag is about `239m`

Representative runtime checks:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`: `near_30m`,
  `entryAnchorLagMinutes=20.218433333333333`, `alertFdv=null`,
  `outcomeLabel=no_data`
- no `acceptable_60m` row was present
- `FnNvePHJSYw1ec6nDSbXBQxo8couvRWButKN8Zwepump`: `delayed_180m`,
  `entryAnchorLagMinutes=120.01455`, `alertFdv=null`,
  `outcomeLabel=no_data`
- `BCiYyqsMthUWhhSUA2ZBVGVXgLx99XnsroVrCn6Wpump`: `late_360m`,
  `entryAnchorLagMinutes=358.35365`, `alertFdv=null`,
  `outcomeLabel=no_data`
- Notification id `8` remained `entryAnchorQuality=none` because no
  post-`sentAt` FDV sample exists
- Notification id `7` kept strict `alertFdv` and wider-window
  `outcomeLabel=flat`; entry anchor remained report context only

Decision: keep Policy C as the current policy. Do not promote `entryAnchor`
into general outcome calculation, and do not implement D180 / D360. If a
fallback outcome mode is implemented later, design it as a separate mint-only
D30-limited path using only `near_5m` / `near_30m` anchors with explicit
`entryAnchorLagMinutes` and `entryAnchorQuality`. Strict `alertFdv`,
Notification-backed outcomes, and existing `outcomeLabel` semantics remain
unchanged.

## Telegram Operating Slice Preflight

Date: 2026-05-20

Outcome/report work is paused at Policy C. Policy D remains a future candidate
only, and no limited D30 fallback outcome mode is being implemented now. The
next operating step can return to manual-approved Telegram work, while auto
live send, scheduler, worker, queue, and systemd delivery remain locked.

This preflight was read-only / docs-only. No `notification:send` execution,
Telegram send, Notification update, production DB write, external fetch, Metric
snapshot, detect watch, retry execution, schema/migration change, application
code change, or rawJson full dump was performed.

Current state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Notification scripts confirmed:

- `notification:send`
- `notification:retry:plan`

`notification:send -- --help` confirmed the CLI requires one
`--notificationKey`, `--trigger metric_appended`, and explicit `--live` before
the sender is connected. Sent rows are blocked by `status=sent` or
`sentAt != null`; failed rows require `--retryFailed`; success/failure updates
only the existing selected Notification row.

`notification:retry:plan` returned `status=stop`,
`mode=read_only_retry_planner`, `willExecute=false`, `candidateCount=0`,
`selectedCount=0`, and `stopConditionCodes=[no_failed_retry_candidate]`.
Because failed rows are absent, retry execution is unnecessary.

Captured rows:

- ids `3`, `4`, `5`, and `6` are smoke/rehearsal `metric_appended` capture-only
  rows and are not preferred live-send targets.
- id `7` is the preferred manual candidate:
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277`,
  `tokenId=5376`, `metricId=1277`, `status=captured`,
  `mode=capture_only`, `sentAt=null`, `retryCount=0`, `rawJsonFree=true`,
  and `secretFree=true`.
- sent rows are ids `1`, `2`, and `8`; failed rows are `0`.

Next Red candidate, not executed:

```bash
pnpm -s notification:send -- --notificationKey ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277 --trigger metric_appended --live
```

This requires explicit human approval. Expected side effects are at most one
Telegram send and one update to existing Notification id `7`. Expected
non-effects are no Notification create, no Token / Metric / HolderSnapshot
write, no retry execution, no scheduler/systemd, and no raw provider or secret
output.

## Manual Telegram Live Send For Notification 7

Date: 2026-05-20

The human-approved manual live-send Red command for Notification id `7` was
executed exactly once:

```bash
pnpm -s notification:send -- --notificationKey ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277 --trigger metric_appended --live
```

Result:

- `status=sent`
- `sentCount=1`
- `updatedCount=1`
- `senderCalled=true`
- `blockedBy=[]`
- `errorCode=null`

Before execution:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`
- Notification id `7`: `status=captured`, `mode=capture_only`,
  `sentAt=null`, `trigger=metric_appended`, `notificationKey` matched
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277`

After execution:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- Notification id `7`: `status=sent`, `mode=live_send`,
  `sentAt=2026-05-19T20:36:12.458Z`,
  `lastAttemptAt=2026-05-19T20:36:12.458Z`, `failedAt=null`,
  `errorCode=null`, and `reason=null`

Confirmed boundaries:

- Telegram send occurred once for the selected Notification.
- The existing Notification id `7` was updated once.
- No Notification row was created.
- Token / Metric / HolderSnapshot counts did not change.
- Retry execution, second command, scheduler, systemd, metric snapshot, detect
  watch, import, enrich, and rescore were not executed.
- Repo-local data had no diff before docs update.
- No rawJson full dump, Telegram credential, chat id, or `DATABASE_URL` value
  was printed.
- Auto live send remains unapproved.

## Telegram Boundary After Manual Send

Date: 2026-05-20

A read-only / docs-only follow-up rechecked Notification state after
Notification id `7` was manually sent. No `notification:send`, retry
execution, Telegram send, Notification update, production DB write, external
fetch, Metric snapshot, detect watch, scheduler/systemd, schema/migration
change, application code change, or rawJson full dump was executed.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`

Notification id `7` remains `sent/live_send` with
`sentAt=2026-05-19T20:36:12.458Z`, `lastAttemptAt` present,
`failedAt=null`, `errorCode=null`, and `reason=null`. It is not a retry or
resend candidate.

Notification id `8` remains `sent/live_send` and is also not a retry or resend
candidate.

Remaining captured rows are ids `3`, `4`, `5`, and `6`. They are all
`metric_appended` / `capture_only` with `sentAt=null`, but their
notification keys and mints are `SMOKE_...` rehearsal artifacts. They are now
explicitly treated as out-of-scope for manual live send and must not be used as
Red candidates.

`notification:retry:plan` stayed read-only and returned
`no_failed_retry_candidate` with `candidateCount=0`, `selectedCount=0`, and no
`nextRedCommand`. Because failed count is `0`, retry execution is unnecessary.

Current Telegram boundary:

- manual approved live send remains the only allowed live-send mode
- current manual live-send candidate: none
- current retry candidate: none
- sent-row resend prevention remains required for id `7` / id `8`
- smoke/rehearsal captured rows id `3` through `6` are send-excluded
- auto live send, scheduler, worker, queue, and systemd remain unapproved

## Auto Live Send Guardrails

Date: 2026-05-20

The manual Telegram live-send slice is now closed for current candidates.
This docs-only policy pass did not execute `notification:send`, retry
execution, Telegram send, Notification update, production DB write, external
fetch, Metric snapshot, detect watch, scheduler/systemd, schema/migration
change, application code change, or rawJson full dump.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- current manual live-send candidate: none
- current retry candidate: none
- remaining captured rows id `3` through `6` are smoke/rehearsal artifacts and
  are send-excluded

Auto live send remains unapproved. Before it can be considered, the project
needs stable capture-only behavior for the intended source, active sent-row
resend prevention, tested failure marking, read-only retry planning, explicit
smoke/rehearsal exclusion, more than one manual live-send success, and a
documented disable switch / kill switch.

Initial future allowlist should be limited to one small scope:

- `metric_appended` event / trigger
- `captured` / `capture_only`
- `sentAt=null` and `status!=sent`
- expected `<mint>:metric_appended:<metricId>` key shape
- not smoke/rehearsal
- not failed and not retry
- safe preview available
- max one row per run, or another small explicit upper bound

Stop conditions for any future auto live send include failed count greater
than `0`, Telegram API/network/rate-limit errors, any `blockedBy` result, sent
or `sentAt`-present candidates, smoke/rehearsal candidates, non-allowlisted
trigger, duplicate or ambiguous identity, unsafe preview, disabled kill switch,
write scope beyond the selected Notification row, Token / Metric /
HolderSnapshot side effects, or any need to print rawJson / secrets.

No dedicated auto-send env switch exists today. Current live-send protection is
the CLI `--live` gate. Future implementation should evaluate explicit switch
names such as `NOTIFICATION_AUTO_SEND_ENABLED=false`,
`TELEGRAM_LIVE_SEND_ENABLED=false`, or `AUTO_LIVE_SEND_DISABLED=true` before
any scheduler/systemd integration. Scheduler/systemd remain locked until
candidate selection, disable behavior, restart duplicate-send risk, and
failure handling are validated outside an always-on process.

## Metric Accumulation Decision Preflight

Date: 2026-05-19

A read-only preflight checked whether the next controlled Red step can be a
re-run of the stable limit-75 Metric accumulation command. No Metric snapshot,
detect watch, external fetch, DB write, Telegram send, Notification update,
rawJson dump, schema change, or application code change was executed.

Current state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=261`, `2+=53`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

`pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 75` returned
`readOnly=true`, `geckoOriginTokenCount=94`, and `metricPendingCount=0`.
Visible queue rows were GeckoTerminal-origin pump `mint_only` rows with
existing Metrics, so the earlier Metric-0 pending cohort is no longer the
active 24h queue target.

A separate read-only candidate-shape check for the proposed Red command showed
that `--sinceMinutes 1440 --minGapMinutes 60` would still have approximately
93 eligible GeckoTerminal-origin pump rows, with a limit-75 selection shaped as
`metric0=0`, `metric1=45`, `metric2Plus=30`. Therefore the next Red can be
treated as a stable limit-75 re-run for additional observation points on
already measured tokens, not as a Metric-0 pending cleanup.

Candidate command requiring explicit human Red approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effect is up to 75 new Metric rows only. Expected non-effects are
no Token update/create, no Notification create/update in batch mode, no
HolderSnapshot write, no Telegram send, no checkpoint, and no repo-local data
changes.

## Additional Metric Accumulation Limit 75 Result

Date: 2026-05-19

The approved controlled Red command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

This was not a Metric-0 cleanup run. It was an additional observation-point run
for already measured GeckoTerminal-origin pump `mint_only` tokens.

Result:

- exit code: `0`
- `selectedCount=59`
- `okCount=59`
- `writtenCount=59`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=58`
- no 429 / rate-limit error
- no provider error
- written Metric ids: `1471` through `1529`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `388 -> 447`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Token Metric distribution: `0=1222 -> 1222`, `1=261 -> 232`,
  `2+=53 -> 82`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

`selectedCount` was `59`, not `75`, because by execution time the
`--sinceMinutes 1440` selection window had aged and only 59 eligible
GeckoTerminal-origin pump rows remained after `minGapMinutes=60`.

Post-run read-only checks:

- `review:queue:geckoterminal -- --pumpOnly --limit 75` still reported
  `readOnly=true` and `metricPendingCount=0`
- `metrics:window-report` was checked for three written mints:
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`,
  `2k5wuRCdhL331w5mALdP34eejkQ3qQswykyipr3bpump`, and
  `D4kjSBMpLe8fPvjH3D3WCscvNui6QjeK2BhzFa51pump`
- each report stayed read-only and printed `willWrite=false`,
  `willFetch=false`, and `willSendTelegram=false`
- the newly written Metrics were readable in `latestFdv` /
  `latestFdvObservedAt`; no rawJson full dump was printed

Side effects stayed inside the expected boundary: production DB Metric writes
only. There was no Token update/create, Notification create/update,
HolderSnapshot write, Telegram send, checkpoint update, or repo-local data
change.

## Post-Accumulation Window Outcome Review

Date: 2026-05-19

A read-only review checked whether the additional Metric `+59` improved
`metrics:window-report` operator usefulness. Current DB state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Cohort:

- 4 tokens from the just-written Metric range, including 2 tokens that now have
  `metricCount=4` and 2 tokens that moved from Metric 1 to Metric 2+
- Notification id `8` token
- Notification id `7` token
- 1 current Metric 1 GeckoTerminal-origin pump `mint_only` token
- 1 current Metric 0 GeckoTerminal-origin pump `mint_only` token

Read-only commands used:

```bash
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 2k5wuRCdhL331w5mALdP34eejkQ3qQswykyipr3bpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 3V7pFBTG27dvnrvJX91o75y6sCaZRbbE8mFVNfyHpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint DAMRNx1oheBNpy7WRtp6ptPGGzxZkiTjxq4ptHmdpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --windows 30,60,120,180,360,720,1440
```

Findings:

- each report stayed read-only with `willWrite=false`, `willFetch=false`, and
  `willSendTelegram=false`
- the additional Metrics improved sampling density: representative existing
  Metric tokens now show `metricCount=4` with 24h coverage `usable`, and
  Metric 1 -> 2+ tokens now show 24h coverage `partial`
- `outcomeLabel` remains mostly `no_data` because no-Notification mint-only
  fallback tokens have `alertFdv=null`; their first FDV sample is outside the
  5-minute alert-FDV lookaround from `first_seen_detected_at`
- Notification id `7` remains the positive control: it resolves
  `alertFdv=223702.038226584` from the captured alert Metric and reports
  `flat` for 2h through 24h with `peakMultipleFromAlert=1.0869155273705746`
- Notification id `8` still reports `alertedAtSource=notification_sent_at` and
  `alertNotificationId=8`, but stays `no_data` because its Metrics predate the
  sent alert anchor and no post-send FDV samples exist
- the Metric 1 token remains `thin`; the Metric 0 token remains `no_data`
- complete / provisional flags are readable: shorter windows are complete, and
  24h windows for recent first-seen fallback tokens are still provisional

Conclusion: the additional Metric run improved raw window sampling and coverage
labels, but not alert-anchored outcome classification for mint-only rows without
Notification anchors. For the next operating decision, report display is
usable; further useful progress likely needs either more targeted alert-anchor
coverage or a report improvement that separates "fallback no alertFdv" from
true "no samples".

## Window Report No-Data Reason Fields

Date: 2026-05-19

`metrics:window-report` now adds window-level read-only explanation fields:

- `noDataReasons: string[]`
- `hasAlertFdvAnchor: boolean`
- `hasWindowFdvSamples: boolean`

The outcome thresholds and alert-FDV lookup are unchanged. These fields only
explain why an existing `outcomeLabel=no_data` result happened.

Reason labels:

- `no_alert_anchor_near_entry`: no alert FDV was found near the resolved entry /
  alert time
- `no_fdv_samples_in_window`: the evaluated window has zero FDV samples
- `no_peak_fdv`: no peak FDV exists for the window
- `no_peak_multiple`: no `peakMultipleFromAlert` can be computed

Read-only runtime checks:

- Notification id `8` token: `alertedAtSource=notification_sent_at` still
  reports `no_data`, now with `hasAlertFdvAnchor=false`,
  `hasWindowFdvSamples=false`, and reasons including
  `no_fdv_samples_in_window`
- no-Notification mint-only fallback token with Metrics:
  `hasWindowFdvSamples=true` and `noDataReasons` includes
  `no_alert_anchor_near_entry`, separating "samples exist" from "no alert
  anchor"
- Metric 0 token: `hasWindowFdvSamples=false`, with no-sample reasons
- Notification id `7` flat windows: `noDataReasons=[]`,
  `hasAlertFdvAnchor=true`, and `hasWindowFdvSamples=true`

The report remains read-only (`willWrite=false`, `willFetch=false`,
`willSendTelegram=false`) and still does not print raw provider payloads.

## Cohort Window Outcome Check

Date: 2026-05-19

A second read-only report pass compared a bounded cohort of seven tokens with
`metrics:window-report -- --windows 30,60,120,180,360,720,1440`: Notification
id `8`, Notification id `7`, three GeckoTerminal-origin pump `mint_only`
tokens with Metric 2+, one Metric 1 token, and one Metric 0 pending token.

The DB state stayed unchanged at Token / Metric / Notification /
HolderSnapshot `1536 / 388 / 8 / 1`, with Token Metric distribution
`0=1222`, `1=261`, `2+=53`, `metricPendingCount=85`, and Notification statuses
`captured=5`, `sent=3`, `failed=0`.

Findings:

- Notification id `8` was recognized as `alertNotificationId=8` and
  `alertedAtSource=notification_sent_at`, but stayed `no_data` because its
  Metrics predated the sent alert anchor.
- Notification id `7` was recognized as `notification_captured_at` and produced
  the expected `flat` outcome in wider windows with
  `peakMultipleFromAlert=1.0869155273705746` and `fdvSampleCoverageLabel=thin`.
- no-Notification Metric 2+ mint-only tokens fell back to
  `first_seen_detected_at`, showed `thin` / `partial` FDV coverage, and stayed
  `no_data` without an alert FDV anchor.
- the Metric 1 token showed `thin`; the Metric 0 token stayed pending /
  `no_data`.
- complete / provisional flags were readable enough for operator review, and
  no rawJson full dump, DB write, external fetch, Telegram send, Notification
  update, or repo-local data change occurred.

Detailed notes live in `docs/runbooks/metric-report-readiness.md`.
