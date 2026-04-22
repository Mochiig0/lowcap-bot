# Current Status

## Summary

This repository is an MVP for mint-driven token accumulation, single-source DexScreener and GeckoTerminal candidate detection with one-shot or simple polling execution plus lightweight checkpointing, enrichment, rescoring, metric capture, and read-only comparison views backed by SQLite via Prisma. Telegram notification still exists only on the full `pnpm import` path when a token reaches `S` rank without hitting hard reject rules.

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
pnpm detect:geckoterminal:new-pools [--file <PATH>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>] [--checkpointFile <PATH>]
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
pnpm review:queue:geckoterminal -- [--sinceHours <N>] [--limit <N>] [--pumpOnly]
```

```bash
pnpm metric:add -- --mint <MINT> [--source <SOURCE>] [--launchPrice <NUM>] [--peakPrice15m <NUM>] [--peakPrice1h <NUM>] [--maxMultiple15m <NUM>] [--maxMultiple1h <NUM>] [--peakFdv24h <NUM>] [--volume24h <NUM>] [--timeToPeakMinutes <NUM>]
```

```bash
pnpm metric:snapshot:geckoterminal -- [--mint <MINT>] [--limit <N>] [--sinceMinutes <N>] [--pumpOnly] [--prioritizeRichPending] [--minGapMinutes <N>] [--source <SOURCE>] [--write] [--watch] [--intervalSeconds <N>] [--maxIterations <N>]
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
12. Use `pnpm metric:add` to append later outcome observations without mutating token score fields.

### Full Import Path

- `pnpm import` remains the full manual import path and owns scoring, persistence, optional metric persistence, and conditional Telegram notify.
- `pnpm import:min` is a thin wrapper for the common minimum manual intake case and delegates into `pnpm import`.
- `pnpm import:file` is a thin wrapper for one local JSON object and delegates supported fields into `pnpm import`.

### Read-Only CLI Positioning

- `pnpm token:compare` is the single-token read-only comparison view.
- `pnpm tokens:compare-report` is the multi-token read-only comparison view.
- `pnpm tokens:compare-report` now reports `preFilterCount` and `filteredCount`, and applies `limit` after item-level review-flag filters so sparse review-flag holders are still visible in small result windows.
- `pnpm metrics:report` is the read-only metric inspection view.
- `pnpm ops:summary:geckoterminal` is the read-only recent Gecko-origin operations overview.
- `pnpm review:queue:geckoterminal` is the read-only recent Gecko-origin review queue for next-look extraction.
- `pnpm compare:coverage:geckoterminal:dexscreener` is the read-only short-window batch coverage spot check for overlap, Gecko-only, and Dex-only mint sets, with optional bounded Dex recheck for a small Gecko-only sample.

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
- DexScreener single-source detect runner CLI in `src/cli/detectDexscreenerTokenProfiles.ts`
- GeckoTerminal single-source detect runner CLI in `src/cli/detectGeckoterminalNewPools.ts`
- GeckoTerminal-vs-DexScreener comparison CLI in `src/cli/compareGeckoterminalDexscreener.ts`
- Token enrichment CLI in `src/cli/tokenEnrich.ts`
- Token rescore CLI in `src/cli/tokenRescore.ts`
- GeckoTerminal enrich-plus-rescore batch CLI in `src/cli/tokenEnrichRescoreGeckoterminal.ts`
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
- `scripts/run-detect-dexscreener-watch.sh` is the fixed repo-local entrypoint for manual runs or a future `systemd --user` service, and delegates into `pnpm detect:dexscreener:token-profiles -- --watch --write`
- `scripts/run-geckoterminal-detect-watch.sh` is the fixed repo-local entrypoint for manual runs or a sample `systemd --user` service, and delegates into `pnpm detect:geckoterminal:new-pools -- --watch --write`
- `scripts/run-geckoterminal-enrich-rescore-notify-fast.sh` is the repo-local fast follow runner for very recent incomplete Gecko-origin pump mints, and loops the one-shot `pnpm token:enrich-rescore:geckoterminal -- --write --notify --pumpOnly` batch with a default cadence of 60 seconds, 3 tokens, a 15-minute lookback, an optional start delay, and an extra cooldown only after rate-limited batches
- `scripts/run-geckoterminal-enrich-rescore-notify-fast.sh` keeps the same summary-first runner logging shape and suppresses per-cycle full JSON unless `LOWCAP_GECKOTERMINAL_ENRICH_FAST_VERBOSE_JSON=1` is set
- `scripts/run-geckoterminal-enrich-rescore-notify.sh` remains the slower catch-up runner for the broader Gecko-origin batch, and loops the one-shot `pnpm token:enrich-rescore:geckoterminal -- --write --notify` batch with an enrich-first live default cadence of 5 minutes, 5 tokens, a 60-minute lookback, an optional start delay, and an extra cooldown only after rate-limited batches
- `scripts/run-geckoterminal-enrich-rescore-notify.sh` keeps the normal runner log summary-first by default and suppresses per-cycle full JSON unless `LOWCAP_GECKOTERMINAL_ENRICH_VERBOSE_JSON=1` is set
- `scripts/run-geckoterminal-metric-watch.sh` is the fixed repo-local entrypoint for manual runs or a sample `systemd --user` service, and delegates into `pnpm metric:snapshot:geckoterminal -- --watch --write` with a trailing-observation default cadence of 30 minutes, 5 tokens, a 120-minute lookback, and an optional start delay
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
- `token:compare` returns `entrySnapshot`, current token fields, `metricsCount`, `hasMetrics`, `entryVsCurrentChanged`, `changedFields`, `latestMetric`, and `recentMetrics`
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
- `metrics:report` supports `mint`, `tokenId`, `source`, `rank`, `hasPeakFdv24h`, `hasPeakFdv7d`, `hasMaxMultiple15m`, `hasTimeToPeakMinutes`, `hasVolume24h`, `hasVolume7d`, `hasPeakPrice15m`, `sortBy`, and `sortOrder`; sortable fields include `observedAt`, `peakFdv24h`, `peakFdv7d`, `maxMultiple15m`, `volume7d`, and `timeToPeakMinutes`; items include `peakPrice15m`; `null` sort targets are placed last
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
- smoke runs a lightweight operational check for typecheck, `import`, sequential `import:mint` re-run behavior, `import:mint:file`, `import:mint:source-file`, `detect:dexscreener:token-profiles` dry-run/write behavior, `import:min`, `import:file`, metric save, `metric:add` append-only behavior, `token:show`, `token:compare`, `tokens:compare-report`, `metric:show`, trend update, and metric report
- `pnpm test` runs the current pure-function tests for normalization, hard reject matching, score calculation, and trend keyword parsing
- smoke restores `data/trend.json` after the run and cleans up its temporary smoke data

## Repository State

- Branch: `master`
- Untracked at the time of inspection: `.codex`
- Recent commits show the repo is still at MVP scaffold stage
