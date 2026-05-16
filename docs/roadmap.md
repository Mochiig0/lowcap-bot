# Roadmap

Formal phased implementation order now lives in `docs/implementation-roadmap.md`.
This document remains the narrower near-term operating roadmap.

## Goal

Keep the current CLI-first, mint-driven accumulation MVP aligned with the live repo: narrow source-specific semi-automation, observable outcomes, and maintainable operating procedures without drifting into a generic bot runtime too early.

## Next Minimal Task

Complete the CLI-first MVP operating picture before adding paid holder sources,
another adapter, or broader runtime concepts.

Why this is now the most natural next step:

- `pnpm import:mint:file` and `pnpm import:mint:source-file` already cover thin mint-first intake boundaries.
- `pnpm detect:dexscreener:token-profiles` and `pnpm detect:geckoterminal:new-pools` already cover the current narrow source-specific detect surface.
- `pnpm token:enrich-rescore:geckoterminal`, `pnpm metric:snapshot:geckoterminal`, and `pnpm ops:summary:geckoterminal` already cover the current Gecko follow-up and read-only ops surface.
- `token:observation`, gap planners, manual observation, community review, and HolderSnapshot storage/read paths now provide the minimum research OS review context.
- CoinGecko Pro / paid holder-source work is parked: it is useful later, but not an MVP blocker.
- `pnpm mvp:status` is available as the broad read-only MVP readiness report.
- The next safe step is now `pnpm bounded:watch:readiness`, a read-only check
  focused on detect/checkpoint/dedupe/metric/notification/observation readiness
  before a separately approved 3h dry-run.

Recommended next Yellow implementation slice:

- `pnpm mvp:status` is now available as a read-only CLI;
- use it to report DB / migration / key command availability, core row counts, observation-loop coverage, and known blockers;
- `pnpm bounded:watch:readiness` is now the next read-only core-loop check for
  the 3-to-6-hour bounded monitoring MVP;
- use it to keep Pro API / paid holder source work parked while moving toward
  candidate detection, mint persistence, score/risk review, Metric
  accumulation, Telegram notification boundaries, and later outcome review;
- `pnpm metrics:window-report` is now the read-only outcome verification helper
  for accumulated Metric history. The outcome evaluation design is fixed in
  `docs/design/metric-outcome-evaluation.md`: default windows are
  30,60,90,120,180,240,300,360,480,600,720,1440 minutes; peak FDV is the
  observed max inside each window, not one 24h-later point; and
  `alertedAt`, `alertFdv`, `latestFdv`, `firstObservedFdv`, window completion,
  provisional outcome labels, coverage labels, `peakMultipleFromAlert`, and
  drawdown are implemented as read-only computed review context rather than
  saved DB fields or buy signals;
- `docs/design/metric-result-field-policy.md` fixes the Metric schema boundary:
  Metric rows remain observation snapshots, and result fields such as
  `peakFdv24h`, `maxMultiple15m`, `timeToPeakMinutes`, `alertedAt`, and
  `peakMultipleFromAlert` are computed outcome fields, not
  `metric:snapshot:geckoterminal` live snapshot write targets;
- `docs/design/token-entry-snapshot-policy.md` fixes the
  `Token.entrySnapshot` namespace boundary: `firstSeenSourceSnapshot`,
  `manualObservation`, and sanitized `contextCapture` are allowed, while Metric
  outcomes, HolderSnapshot bodies, Notification lifecycle state, raw provider
  bodies, secrets, and retry / queue state stay out;
- `docs/design/token-source-policy.md` fixes the source-term boundary:
  `Token.source` is the token-level current / latest source label, origin
  source comes from `entrySnapshot.firstSeenSourceSnapshot.source` with
  `manualObservation.source` and `Token.source` as legacy fallbacks, and
  `Metric.source`, Notification `trigger` / `mode` / `status`,
  `contextCapture.*.source`, and `HolderSnapshot.source` stay separate;
- `docs/design/metadata-status-policy.md` fixes the token metadata lifecycle:
  operational values are `mint_only`, `partial`, `enriched`, and `unknown`
  fallback; the normal lifecycle is `mint_only -> partial -> enriched`;
  source-only updates do not imply `enriched` or an `enrichedAt` refresh; and
  planners / reports / guards should treat `metadataStatus` as metadata
  completeness rather than safety, score, source, notification, holder, or
  outcome state;
- `docs/design/compare-report-legacy-outcome-policy.md` fixes
  `tokens:compare-report outcomeBucket` as legacy / provisional compatibility
  output based on older Metric result fields such as latest Metric
  `maxMultiple15m`; canonical outcome review remains
  `metrics:window-report` window-level `outcomeLabel` based on FDV window
  maxima, `alertFdv`, and `peakMultipleFromAlert`;
- `docs/design/notification-event-policy.md` fixes Notification lifecycle
  fields: persisted `Notification` rows are event history with known
  `status=captured|sent|failed`, `mode=capture_only|live_send`, and
  `trigger=metric_appended`; ops preview triggers `token_completed` and
  `loop_complete` remain separate from persisted DB rows unless a later task
  adds those write paths; retry fields are manual retry foundation, not queue /
  scheduler / systemd completion;
- `docs/design/review-flags-policy.md` fixes `Token.reviewFlagsJson` as
  lightweight Token review helper JSON. Current compatibility keys are
  `hasWebsite`, `hasX`, `hasTelegram`, `metaplexHit`, `descriptionPresent`,
  and `linkCount`, with `community:review` provenance such as
  `source=manual_community_review`, `reviewedAt`, and `operatorNote` when
  present. Future writes should move toward `schemaVersion`, `source`,
  optional `reviewerType`, `flags`, `note`, and `reviewedAt`, while
  `reviewFlagsJson` stays separate from Metric outcome, `scoreBreakdown`,
  HolderSnapshot, Notification lifecycle, provider raw bodies, and buy signals;
- `docs/design/score-breakdown-policy.md` fixes `Token.scoreBreakdown` as the
  latest Token score explanation JSON. Current compatibility shape is
  unversioned and uses `totals.{core,learned,trend,combo}`, `hits[]`,
  `trendFresh`, `trendCapped`, and `trendOnly`; future writes should move
  toward `schemaVersion`, `scoringVersion`, `computedAt`, `components`,
  optional hard-reject summary, and lightweight trend metadata. Score fields
  remain latest state, not immutable initial score history; strict score
  history is deferred to a future `ScoreSnapshot` / `scoreHistory` design;
- `docs/design/grouping-policy.md` fixes `Token.groupKey` / `groupNote` as
  manual grouping helpers only. They may label operator-chosen narratives,
  themes, watchlists, campaigns, or batches for later comparison, but they are
  not source provenance, dev identity proof, dedupe keys, score evidence,
  Notification triggers, Metric outcomes, or buy signals;
- `docs/design/time-anchor-policy.md` fixes timestamp meanings across Token,
  Metric, Notification, and reports: DB lifecycle timestamps, Token import,
  metadata enrichment, score rescore, source first-seen, Metric observation,
  Notification sent / captured time, and report evaluation are separate.
  `metrics:window-report` anchors outcome windows at computed `alertedAt`
  (`--entryAt`, Notification, firstSeen, imported, created fallback order) and
  uses `evaluationAt=reportGeneratedAt` for MVP completion / latest-FDV
  evaluation;
- `docs/design/dev-wallet-policy.md` fixes `Dev.wallet` as a dev / creator /
  deployer-like wallet label from source or manual input. It is an exact stored
  string grouping key for display, filtering, and future Dev-level comparison,
  not confirmed person / team identity, scam proof, score evidence,
  HolderSnapshot evidence, funding-origin proof, bundle proof, Metric outcome,
  Notification lifecycle, or a buy signal. Wallet normalization, validation,
  confidence fields, and Dev-based scoring remain future design work;
- `docs/design/metric-rawjson-inspect-policy.md` fixes `Metric.rawJson` as a
  sanitized provider snapshot and `metric:show` as the low-level inspect
  surface that may print it. Normal report / compare / outcome views remain
  rawJson-free or use extracted valid FDV values; full rawJson dumps are
  operator / developer debugging material, not canonical outcome review,
  public report output, or a buy signal;
- `docs/design/holder-snapshot-policy.md` fixes HolderSnapshot as safe
  summarized holder distribution / holder-risk context. Storage, safe-summary
  validation, one-row manual add, read-only show, safe-summary report, and gap
  planning exist, but approved real holder source capture remains future
  enhancement work and is not a 3h / 6h bounded monitoring blocker.
  Concentration fields must be read with `source`, `confidence`, and
  `lpWalletExcluded`; fresh / bundler / same-funding signals are
  source-dependent review context, not automatic score evidence or buy signals;
- the first 3h GeckoTerminal detect watch dry-run completed 180 cycles with
  `failedCount=0`, `rateLimitRetryCount=0`, `importedCount=0`, and
  `checkpointEnabled=false`; Token / Metric / Notification / HolderSnapshot
  counts stayed unchanged at `1116 / 191 / 6 / 1`;
- the 3h write rehearsal preflight is docs-only complete: `--write` for
  `detect:geckoterminal:new-pools` creates or reuses mint-only Token rows
  through `importMint`; it does not append Metrics, create Notification rows,
  touch HolderSnapshot, enrich / rescore, or send Telegram. Checkpoint updates
  occur only under `--watch --write`, and the Red rehearsal should use a fresh
  `/tmp` checkpoint. DB writes still target `DATABASE_URL`;
- the current-DB 3h write rehearsal is complete: 180 cycles, `failedCount=0`,
  `rateLimitRetryCount=0`, `importedCount=180`, `existingCount=0`, Token count
  `1116 -> 1296`, and Metric / Notification / HolderSnapshot counts unchanged
  at `191 / 6 / 1`. The only checkpoint side effect was
  `/tmp/lowcap-bot-gecko-write-rehearsal.json`; repo-local `data/checkpoints`
  and `data/trend.json` stayed unchanged;
- next operating step is a separate Metric accumulation / Notification
  accumulation slice. The completed 3h write rehearsal confirms mint-only Token
  accumulation, not metric snapshot writes, notification capture, Telegram live
  send, scoring completion, or outcome evaluation;
- the Metric accumulation preflight is docs-only complete: use the recent
  Gecko-origin mint-only cohort from the 3h write rehearsal, keep the first Red
  command to a very small batch, and avoid `--mint` mode unless Notification
  capture is also explicitly approved. Candidate command:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes
  1440 --minGapMinutes 60 --write`. This is expected to fetch one token
  snapshot and append one Metric row, with no Token update, HolderSnapshot
  write, Telegram send, checkpoint, or Notification row in batch mode;
- the first bounded Metric accumulation Red run is complete in batch mode:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes
  1440 --minGapMinutes 60 --write` selected
  `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump` and appended Metric
  `id=1274`. Counts moved `1296 / 191 / 6 / 1` to `1296 / 192 / 6 / 1`, and
  `metricPendingCount` moved 180 to 179. Token / Notification /
  HolderSnapshot counts stayed unchanged, no Telegram send occurred, no
  checkpoint was touched, and exact `--mint` Notification capture remains a
  separate slice;
- scheduler / systemd remain after 3h/6h monitored-run validation;
- do not fetch external APIs, write production DB state, send Telegram, change schema, or introduce scheduler / queue / systemd behavior.

## Short-Term

- Keep `import:mint:file` narrow as the first Phase 5 semi-automation entrypoint:
  - file-backed only
  - sequential only
  - delegates to `import:mint`
  - does not add scoring, notify, metric, enrich, or rescore behavior
- Keep `import:mint:source-file` narrow as the first source-specific adapter runtime:
  - one source-specific raw event shape only
  - one file at a time
  - normalizes into `{ mint, source? }`
  - delegates to `import:mint`
  - does not add scoring, notify, metric, enrich, or rescore behavior
- Pause generic runtime expansion here for now:
  - the current narrow runtime already includes the existing DexScreener / GeckoTerminal detect/watch helpers plus the bounded GeckoTerminal enrich-rescore / metric / ops-summary helpers
  - do not add a second source adapter until the documented admission criteria are actually met
  - do not move into a generic or multi-source adapter runtime yet
  - keep detector, queue, worker, and scheduler runtime work in a later phase
  - expand runtime entrypoints again only when a real new source need appears
- Pause read-only lightweight-view expansion here for now:
  - `tokens:report`, `token:show`, `metrics:report`, and `metric:show` are enough as the current lightweight inspection set
  - `tokens:compare-report` and `token:compare` are enough as the current compare-view set
  - `compare:geckoterminal:dexscreener` and `ops:summary:geckoterminal` are enough as the current Gecko-specific read-only helpers
  - do not turn `token:show` into `token:compare`, or `tokens:report` into `tokens:compare-report`
  - do not keep adding token-deep context to `metric:show`
  - expand read-only fields, filters, or summaries again only when a real operating bottleneck appears
- Keep docs and hand-off material synced with the live repo before adding another detector-shaped entrypoint or external-source adapter
- Park paid holder source work until budget, API key, terms, rate-limit, and
  secret-boundary approval are available:
  - CoinGecko Token Info preflight is deferred
  - manual holder review and external-report-only review continue as fallback
  - HolderSnapshot is complete only for storage / parser / one-row write / read validation
- Stabilize the current Gecko runner operating picture:
  - detect first
  - enrich-rescore-notify second
  - metric snapshot third
  - keep those runners source-specific and bounded
- Add the next read-only comparison slice only if it helps manual review and does not change the write path:
  - richer comparison report fields
  - comparison filters or sort controls
  - focused report variants for outcomes
- Refresh or generate `data/trend.json` on a real cadence
- Keep README and docs synced with CLI usage and JSON output fields
- Add only small pure-function tests or smoke-check refinements when they improve manual operation

## Mid-Term

- Define how a future detect-to-mint-only path should hand off into the existing `import:mint` / `import:mint:file` boundary without bypassing source-adapter normalization
- Decide whether the next source need really warrants a second source adapter or belongs in the current Gecko/Dex read-only and operator tooling
- Add tests for:
  - scoring breakdown and rank thresholds
  - import CLI behavior
- Clarify how comparison reports should evolve before adding interpretation or alerts
- Clarify ranking policy and dictionary maintenance workflow
- Keep `groupKey` and `groupNote` as manual grouping labels only until a
  separate report / planner need justifies implementation work

## Longer-Term

- Add automatic ingestion from external sources
- Introduce scheduled jobs or worker execution
- Add richer alert rules beyond `S` rank only
- Use stored metrics to evaluate whether scoring correlates with outcomes
- Create a feedback loop for updating learned dictionaries from observed winners/losers

## Explicit Non-Goals Today

- Full bot automation
- Detector runtime, scheduler, queue, or worker orchestration
- Multi-source or generic adapter runtime
- Real-time trading logic
- Complex UI
- ML-based scoring

The codebase is not at that stage yet; the current roadmap should stay aligned with the existing mint-driven accumulation MVP.

For deferred ideas with high later value, see `docs/future-features.md`.
