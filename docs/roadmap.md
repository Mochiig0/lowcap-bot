# Roadmap

Formal phased implementation order now lives in `docs/implementation-roadmap.md`.
This document remains the narrower near-term operating roadmap.

## Goal

Keep the current CLI-first, mint-driven accumulation MVP aligned with the live repo: narrow source-specific semi-automation, observable outcomes, and maintainable operating procedures without drifting into a generic bot runtime too early.

## Current Next Slice

Date: 2026-05-23

The auto-send single-shot slice is now consolidated. The completed Telegram /
Notification path includes manual live sends for id `7` and id `8`, smoke /
rehearsal exclusion, marker-tagged capture-only rehearsal id `9`,
production-shaped candidate id `10`, read-only `notification:auto-send:plan`,
disabled-by-default `notification:auto-send:execute`, and one human-approved
production auto-send execution for id `10`.

Current state: Token / Metric / Notification / HolderSnapshot
`1536 / 449 / 10 / 1`; Notification statuses `captured=5`, `sent=5`,
`failed=0`; manual live-send candidate count `0`; retry candidate count `0`;
enabled auto-send `allowedCandidateCount=0`.

Still locked: scheduler, systemd, always-on auto live send, restart
duplicate-send behavior, continuous worker, background queue, automatic retry
execution, and production `--execute` without human approval. Auto-send is
verified as a single-shot path only.

Recommended next lane: **detect / new-pool watch lane**. The Green readiness
review is now complete and confirmed that the next Red can be a small bounded
dry-run watch, not a write rehearsal:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 5 --intervalSeconds 60
```

This command requires human approval because it runs watch mode and external
GeckoTerminal fetches. It intentionally omits `--write`, so expected DB writes,
Telegram sends, Notification create/update, Metric writes, HolderSnapshot
writes, and checkpoint writes are all `0`. Do not use `timeout`; keep the run
bounded by `--maxIterations` and `--intervalSeconds`.

Second choice: metric accumulation / report lane, if the operator prefers
safer data accumulation and report quality over moving the monitoring loop
forward. Do not continue to scheduler / systemd now.

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
- the bounded Metric accumulation Red run has also passed at `--limit 3` in
  batch mode. The prior AW7 mint was skipped by `minGapMinutes=60`; two new
  Metrics were appended for
  `G4qJ2GcVBkSEGa9D4Z7FhbHcZFSPaKxFyKiaw7K2pump` (`id=1275`) and
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump` (`id=1276`). Counts moved
  `1296 / 192 / 6 / 1` to `1296 / 194 / 6 / 1`, and
  `metricPendingCount` moved 179 to 177. Notification / Telegram /
  HolderSnapshot / Token enrich-rescore remained untouched;
- exact `--mint` mode Notification capture remains unexecuted but is now ready
  for a separate Red task. The preflight target is
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`, a GeckoTerminal-origin
  `mint_only` pump token with no Metric and no Notification. Candidate
  command:
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --minGapMinutes 60 --write`.
  Expected side effects are one Metric row and one `status=captured`,
  `mode=capture_only`, `trigger=metric_appended` Notification row only; no
  Telegram live send, Token update, HolderSnapshot write, checkpoint,
  scheduler, or systemd action is expected;
- the first exact `--mint` Notification capture Red run is complete for
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`. It appended Metric
  `id=1277` and created Notification `id=7` with
  `status=captured`, `mode=capture_only`, `trigger=metric_appended`,
  `tokenId=5376`, and `metricId=1277`. Counts moved
  `1296 / 194 / 6 / 1` to `1296 / 195 / 7 / 1`, and
  `metricPendingCount` moved 177 to 176. Telegram live send, Token update,
  HolderSnapshot write, enrich / rescore, checkpoint, queue, scheduler, and
  systemd remained untouched;
- post-alert Metric outcome check is complete. The preflight confirmed the
  alert anchor is Notification `id=7`, while Metric `id=1277` is 14ms before
  `capturedAt`, so it can provide `alertFdv` but not a post-alert window
  sample. `metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --noNotificationCapture
  --write` then appended Metric `id=1278` without adding Notification. Counts
  moved `1296 / 195 / 7 / 1` to `1296 / 196 / 7 / 1`, with Telegram,
  HolderSnapshot, enrich / rescore, queue, scheduler, systemd, and checkpoint
  untouched. `metrics:window-report` now shows Metric count 2 and FDV Metric
  count 2; 30m / 60m remain `no_data` because the new Metric arrived after
  those windows, while 24h has one post-alert valid FDV sample,
  `peakMultipleFromAlert=1.0869155273705746`,
  `timeToPeakMinutes=77.49428333333333`, provisional `outcomeLabel=flat`, and
  `fdvSampleCoverageLabel=thin`;
- short-window outcome check is complete on a second mint:
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`. Exact `--mint --write`
  created Metric `1279` and capture-only Notification `8`; immediate exact
  `--mint --noNotificationCapture --write` created Metric `1280` without a
  second Notification. Counts moved `1296 / 196 / 7 / 1` to
  `1296 / 198 / 8 / 1`. `metrics:window-report` now confirms 30m / 60m / 24h
  windows each have `fdvSampleCount=1`, `peakMultipleFromAlert=1`,
  `timeToPeakMinutes=2.4285666666666668`, provisional `outcomeLabel=flat`, and
  `fdvSampleCoverageLabel=thin`;
- Telegram live-send preflight is docs-only complete. The recommended Red
  target is captured Notification `id=8` with notification key
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279`.
  Candidate command: `pnpm -s notification:send -- --notificationKey
  EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279 --trigger
  metric_appended --live`. Expected upper bound is Telegram send max 1 and
  Notification update max 1; Token / Metric / HolderSnapshot writes stay 0.
  Secrets are env-only and must not be printed;
- Telegram live-send Red rehearsal is complete for Notification `id=8`.
  The exact command above ran once and returned `status=sent`, `sentCount=1`,
  `updatedCount=1`, `senderCalled=true`, `notificationId=8`, and
  `errorCode=null`. Counts stayed `1296 / 198 / 8 / 1`; the existing row moved
  from `status=captured`, `mode=capture_only`, `sentAt=null` to
  `status=sent`, `mode=live_send`, `sentAt=2026-05-17T02:20:23.560Z`, and
  `lastAttemptAt=2026-05-17T02:20:23.560Z`. Notification `id=7` remained
  unsent as `captured` / `capture_only`. Retry, batch send, scheduler,
  systemd, watch, metric snapshot, detect, import, enrich, and rescore were not
  executed, and no secret / Telegram response body was printed;
- `notification:send` failure-path preflight is complete as read-only /
  docs-only. Current DB has no failed Notifications and no retry candidates.
  Code and tests show failed sender results update one existing row to
  `failed/live_send` with safe `errorCode`, `reason=ops_notify_send_failed`,
  `failedAt`, and `lastAttemptAt`; sent rows are blocked from resend and
  captured rows are not retry candidates. Do not run a production Red failure
  rehearsal yet; add a simulated-failure or isolated-temp-DB harness first if
  execution evidence is needed;
- sent-row resend prevention is now explicit for both normal and inconsistent
  sent state: `notification:send` blocks before sender call when
  `status=sent` or `sentAt` is present, returns `notification_already_sent`
  with safe `notificationStatus` / `sentAtPresent` markers, and performs no DB
  update. This was implemented with a focused temp-SQLite test; no production
  notification send, retry, scheduler, systemd, watch, metric snapshot, detect,
  import, enrich, or rescore command was run. The interrupted 6h dry-run was
  not a completed stability result;
- failure marking is now covered by temp-SQLite / mocked-sender tests without
  production DB or Telegram: a throwing sender updates one existing captured
  `metric_appended` row to `failed/live_send`, sets `failedAt`,
  `lastAttemptAt`, safe `errorCode`, and `reason`, keeps `sentAt=null`, creates
  no Notification rows, and leaves Token / Metric / HolderSnapshot counts
  unchanged;
- `notification:retry:plan` now has a current production DB read-only
  no-candidate confirmation. With failed rows at `0`, captured `id=7` and sent
  `id=8` were both excluded, and `pnpm -s notification:retry:plan` returned
  `status=stop`, `candidateCount=0`, `selected=null`, `nextRedCommand=null`,
  and `stopConditionCodes=[no_failed_retry_candidate]` without DB writes or
  Telegram sender calls;
- retry candidate selection is now covered in temp SQLite: with failed,
  captured, and sent fixtures present together, `notification:retry:plan`
  selects only one failed `metric_appended` row, leaves all rows unchanged, and
  emits a safe human-gated `notification:send --live --retryFailed` command
  string without secret / env / raw payload markers;
- manual approved live send is the only currently allowed Telegram live-send
  mode. Auto live send remains locked: no batch send, worker, scheduler,
  systemd, or automatic captured-to-sent advancement. `id=7` stays held as
  `captured` / `capture_only`, `id=8` is already `sent` / `live_send`, failed
  rows are `0`. The 6h dry-run has since completed, but always-on
  notification delivery is still not ready because write rehearsal,
  restart/dedupe behavior, scheduler / systemd stop policy, and automatic
  captured-to-sent rules remain unpromoted. `detect:geckoterminal:new-pools --watch`
  now emits `status=interrupted` / `stopReason=user_interrupted` summaries for
  SIGINT / SIGTERM. See
  `docs/runbooks/notification-live-send-policy.md`;
- short live SIGINT confirmation for GeckoTerminal new-pools watch is now
  recorded. The 2026-05-17 Red dry-run summary reported
  `status=interrupted`, `stopReason=user_interrupted`,
  `interruptedBySignal=SIGINT`, `completedIterations=5`, `failedCount=0`, and
  `rateLimitRetryCount=0`, with DB counts unchanged at
  `1296 / 198 / 8 / 1` and no Telegram, Notification, Metric, checkpoint, or
  repo-local data side effects. The timeout wrapper did not stop the
  `pnpm` / `tsx` child tree at the expected 90s boundary, so another long live
  run should first account for process-tree timeout behavior;
- process-tree signal policy is now fixed for GeckoTerminal watch: do not use
  `timeout + pnpm + tsx` as the long-run stop mechanism. Use bounded
  `--maxIterations` / `--intervalSeconds` for natural completion and direct
  Ctrl+C or process-group SIGINT / SIGTERM for manual stop. A file-backed
  interrupt test confirms SIGINT during watch sleep records one completed
  cycle, does not start the next cycle, and keeps `failedCount=0`;
- the timeout-free 6h GeckoTerminal new-pools dry-run completed on
  2026-05-18 with `--maxIterations 360 --intervalSeconds 60`. It reported
  `status=ok`, `stopReason=completed`, `completedIterations=360`,
  `cycleCount=360`, `failedCount=0`, `rateLimitRetryCount=0`,
  `importedCount=0`, `existingCount=0`, `dryRun=true`,
  `writeEnabled=false`, and `checkpointEnabled=false`. Token / Metric /
  Notification / HolderSnapshot counts stayed `1296 / 198 / 8 / 1`, and no
  DB write, Telegram send, Notification create/update, Metric create,
  checkpoint update, or repo-local data diff was observed;
- 6h write rehearsal preflight is now fixed as docs-only policy. Because the
  completed 360-cycle dry-run elapsed `32632518ms` (about `9.06h`, about
  `90.65s` per cycle), the next Red write candidate should prioritize
  wall-clock 6h and use the observed average to reduce the run to
  `--maxIterations 240`. This is still a bounded estimate. It writes only
  mint-only Token rows through `importMint`, uses `/tmp` checkpoint isolation,
  and keeps Metric / Notification / HolderSnapshot writes plus Telegram sends
  out of scope;
- the 240-cycle GeckoTerminal new-pools write rehearsal completed on
  2026-05-18 with `--maxIterations 240 --intervalSeconds 60` and checkpoint
  isolation under `/tmp`. It reported `status=ok`, `stopReason=completed`,
  `completedIterations=240`, `cycleCount=240`, `failedCount=0`,
  `rateLimitRetryCount=1`, `rateLimitRetrySuccessCount=1`,
  `importedCount=240`, `existingCount=0`, `dryRun=false`,
  `writeEnabled=true`, `checkpointEnabled=true`, and `elapsedMs=16148551`
  (about `4.49h`). Token count increased `1296 -> 1536`; Metric /
  Notification / HolderSnapshot stayed `198 / 8 / 1`; Notification status
  counts stayed `captured=5`, `sent=3`, `failed=0`; Telegram send and
  repo-local data diffs were not observed;
- bounded Metric accumulation preflight for the new 240-token cohort completed
  on 2026-05-19. The current DB state is Token / Metric / Notification /
  HolderSnapshot `1536 / 198 / 8 / 1`; `mint_only=1373`; zero-Metric Token
  count `1377`; Notification statuses `captured=5`, `sent=3`, `failed=0`.
  `review:queue:geckoterminal -- --pumpOnly --limit 10` reports the new
  GeckoTerminal pump cohort as `geckoOriginTokenCount=240`,
  `enrichPendingCount=240`, and `metricPendingCount=240`. Batch
  `metric:snapshot:geckoterminal` does not capture Notification rows; exact
  `--mint` mode is the Notification-capture path. The next Red candidate is
  a small batch Metric write:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --write`;
- bounded Metric accumulation `limit 10` was executed once on 2026-05-19.
  Queue precheck reported `geckoOriginTokenCount=240` and
  `metricPendingCount=240`; selected preview rows matched GeckoTerminal-origin
  pump `mint_only` Tokens with `metricsCount=0`. The command exited 0 with
  `selectedCount=10`, `writtenCount=5`, `skippedCount=0`, and `errorCount=5`.
  Metric count moved `198 -> 203`; Token / Notification / HolderSnapshot
  stayed `1536 / 8 / 1`; Notification statuses stayed `captured=5`,
  `sent=3`, `failed=0`. The five errors were `429 Too Many Requests`, so the
  next step should address Metric snapshot rate-limit pacing before any larger
  batch expansion;
- Metric snapshot rate-limit preflight is now docs-only complete. Current DB
  state is Token / Metric / Notification / HolderSnapshot `1536 / 203 / 8 / 1`,
  zero-Metric Token count `1372`, `metricPendingCount=235`, and Notification
  statuses `captured=5`, `sent=3`, `failed=0`. The current batch
  `metric:snapshot:geckoterminal` path processes selected tokens sequentially
  but has no item-to-item delay; `429` responses become item-level errors, do
  not write Metric rows, do not mutate Token / Notification / HolderSnapshot,
  and leave the failed mints in the future pending queue. Treat exit code 0
  with `errorCount>0` as partial success only. The next recommended slice is
  Yellow implementation of `--interItemDelayMs` before another larger Red
  Metric batch;
- `metric:snapshot:geckoterminal` now has `--interItemDelayMs <N>` for
  batch-item pacing. The default is `0`; the value must be a non-negative
  integer; delay is applied only between selected batch items and is reported
  in summary output. Exact `--mint` mode is not delayed. Metric write,
  Notification capture, Telegram live send, Token / HolderSnapshot behavior,
  and 429 item-error handling are unchanged. The next Red candidate is:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write`;
- delayed Metric accumulation `limit 10` with `--interItemDelayMs 15000` was
  executed once on 2026-05-19. It selected 10, skipped 5 via
  `minGapMinutes=60`, wrote 5 Metrics (`1286` through `1290`), and reported
  `errorCount=0`, `interItemDelayCount=9`, and no `429`. Counts moved
  `1536 / 203 / 8 / 1` to `1536 / 208 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. This improves the prior no-delay
  `limit 10` run (`written=5`, `error=5`, five 429s), but because five
  selected rows were recent-Metric skips, treat it as a successful delayed
  small-batch confirmation rather than approval for a large jump;
- delayed Metric accumulation `limit 20` with the same `--interItemDelayMs
  15000` was executed once on 2026-05-19. It selected 20, skipped 10 via
  `minGapMinutes=60`, wrote 10 Metrics (`1291` through `1300`), and reported
  `errorCount=0`, `interItemDelayCount=19`, and no `429`. Counts moved
  `1536 / 208 / 8 / 1` to `1536 / 218 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. This keeps the delayed path Green at a
  modestly wider scope; next expansion should still be incremental, such as
  delayed limit 30, before larger batches;
- delayed Metric accumulation `limit 30` with the same `--interItemDelayMs
  15000` was executed once on 2026-05-19. It selected 30, skipped 15 via
  `minGapMinutes=60`, wrote 15 Metrics (`1301` through `1315`), and reported
  `errorCount=0`, `interItemDelayCount=29`, and no `429`. Counts moved
  `1536 / 218 / 8 / 1` to `1536 / 233 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. The delayed path remains rate-limit
  clean, but the 50% skip ratio means the next step should be candidate
  selection that excludes recent Metrics before applying `--limit`, not another
  batch-size increase;
- `metric:snapshot:geckoterminal` batch selection now excludes recent Metric
  rows before applying `--limit` when `--minGapMinutes` is provided. Exact
  `--mint` mode keeps its existing min-gap skip behavior. `--interItemDelayMs`,
  429 handling, Notification / Telegram behavior, Token writes, and
  HolderSnapshot behavior are unchanged. The next Red candidate is the same
  delayed limit 30 command, now expected to spend the limit on eligible
  candidates rather than recent-Metric skips;
- improved delayed Metric accumulation `limit 30` was executed once on
  2026-05-19 after the selection change. It selected 30, skipped 0, wrote 30
  Metrics (`1316` through `1345`), and reported `errorCount=0`,
  `interItemDelayCount=29`, and no `429`. Counts moved
  `1536 / 233 / 8 / 1` to `1536 / 263 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. This confirms the recent-Metric
  exclusion is effective; next expansion should still be incremental, for
  example improved delayed limit 50;
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

## Operating Update: Improved Metric Accumulation Limit 50

Date: 2026-05-19

The improved GeckoTerminal Metric snapshot batch selector was validated at
`limit 50` with 15-second item pacing:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selectedCount=50`, `writtenCount=50`, `skippedCount=0`,
`errorCount=0`, `interItemDelayMs=15000`, `interItemDelayCount=49`, and no 429.
Counts moved only in `Metric`: Token / Metric / Notification / HolderSnapshot
`1536 / 263 / 8 / 1 -> 1536 / 313 / 8 / 1`.

This confirms the recent-Metric exclusion remains effective at limit 50 and the
Metric write boundary still avoids Telegram, Notification, Token, and
HolderSnapshot side effects. Continue incremental expansion; the next candidate
is a limit 75 preflight or Red task rather than a large jump.

## Operating Update: Improved Metric Accumulation Limit 75

Date: 2026-05-19

The same improved GeckoTerminal Metric snapshot path was validated at
`limit 75` with 15-second item pacing:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selectedCount=75`, `writtenCount=75`, `skippedCount=0`,
`errorCount=0`, `interItemDelayMs=15000`, `interItemDelayCount=74`, and no 429.
Counts moved only in `Metric`: Token / Metric / Notification / HolderSnapshot
`1536 / 313 / 8 / 1 -> 1536 / 388 / 8 / 1`.

The recent-Metric exclusion and Metric-only write boundary held at limit 75.
Rather than continuing to enlarge batches immediately, the next near-term slice
should move back to read-only reporting, such as validating
`metrics:window-report` or cohort reports against the accumulated Metrics.

## Operating Update: Metric Report Readiness

Date: 2026-05-19

The accumulated GeckoTerminal Metrics were validated through read-only report
commands after limit 75:

- `metrics:window-report`
- `metrics:report`
- `tokens:compare-report`
- `review:queue:geckoterminal`

The latest counts remained Token / Metric / Notification / HolderSnapshot
`1536 / 388 / 8 / 1` after report execution, with Notification statuses
`captured=5`, `sent=3`, `failed=0`. `metrics:window-report` correctly read the
sent Notification id `8`, Metric 3 sample rows, and Metric 1 sample rows without
DB writes, external fetches, Telegram sends, or rawJson full dumps.

Next work should stay on read-only outcome / cohort review before any further
Metric batch expansion.

## Operating Update: Cohort Window Outcome Check

Date: 2026-05-19

A bounded seven-token cohort was checked with
`metrics:window-report -- --windows 30,60,120,180,360,720,1440` after the
Metric report-readiness pass. The cohort included Notification id `8`,
Notification id `7`, three GeckoTerminal-origin pump `mint_only` Metric 2+
tokens, one Metric 1 token, and one Metric 0 pending token.

The check stayed read-only and left counts unchanged at Token / Metric /
Notification / HolderSnapshot `1536 / 388 / 8 / 1`. It confirmed that
`metrics:window-report` is usable for human outcome review: alert-anchored
windows can produce `flat`, no-alert mint-only windows remain `no_data` while
still showing `thin` / `partial` sample coverage, Metric 1 tokens show `thin`,
Metric 0 tokens remain pending / `no_data`, and complete / provisional flags
are visible without rawJson dumps.

Next work can either run one more small read-only cohort review on a different
sample or move to a docs-only decision point for the next bounded Metric /
notification operating slice.

## Operating Update: Metric Accumulation Decision Preflight

Date: 2026-05-19

A docs-only decision point checked whether to return to Telegram operations or
run one more controlled Metric accumulation slice. The current 24h
`review:queue:geckoterminal -- --pumpOnly --limit 75` result is read-only and
shows `metricPendingCount=0`, so the proposed next Red is not a Metric-0
pending cleanup. It is instead a repeat of the already stable limit-75 path to
add additional Metric observations to recent GeckoTerminal-origin pump
`mint_only` rows that already have Metrics and satisfy `minGapMinutes=60`.

Candidate Red command, requiring human approval and not executed in the
preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected effect is Metric rows only; Token, Notification, HolderSnapshot,
Telegram, checkpoint, and repo-local data should remain unchanged.

## Operating Update: Additional Metric Accumulation Limit 75

Date: 2026-05-19

The approved Red command was executed once as an additional observation-point
run, not as Metric-0 pending cleanup:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

The execution selected 59 eligible rows because the 24h selection window had
aged by runtime. It wrote 59 Metrics (`1471` through `1529`), with
`skippedCount=0`, `errorCount=0`, `interItemDelayMs=15000`,
`interItemDelayCount=58`, and no 429. Counts moved only in Metric:
`1536 / 388 / 8 / 1 -> 1536 / 447 / 8 / 1`.

Follow-up `metrics:window-report` checks on three written mints confirmed the
new Metrics are readable without DB writes, external fetches, Telegram sends,
or rawJson dumps. The next step should return to read-only outcome / operating
decision work before another accumulation batch.

## Operating Update: Metric Report Readiness After Additional Limit 75

Date: 2026-05-20

The post-run read-only report pass confirmed that the current
Token / Metric / Notification / HolderSnapshot state is `1536 / 447 / 8 / 1`,
with Notification statuses `captured=4`, `sent=4`, `failed=0`. Token Metric
distribution is now `0=1222`, `1=232`, `2+=82`; GeckoTerminal-origin pump
`mint_only` coverage is Metric `0=260`, `1=99`, `2+=61`.

`metrics:window-report` read Notification id `8`, Metric 2+ rows, the latest
accumulation sample, and a mint-only Metric 1 sample with explicit read-only
flags. `metrics:report` and `tokens:compare-report` showed rawJson-free Metric
safe summaries, and `review:queue:geckoterminal -- --pumpOnly --sinceHours 168
--limit 20` showed Metric 0 rows remain pending while recent Metric-written
rows are out of `metricPending`.

No Metric snapshot, detect watch, DB write, external fetch, Telegram send,
Notification update, rawJson full dump, schema / migration change, or
application code change occurred. The next step should stay read-only: use
`metrics:window-report` on one bounded cohort to make the next operating
decision before any further Metric write expansion.
