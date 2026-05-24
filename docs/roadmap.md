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

The small bounded dry-run watch has now run successfully once with
`status=ok`, `stopReason=completed`, `completedIterations=5`, `failedCount=0`,
`rateLimitRetryCount=0`, `importedCount=0`, `existingCount=0`,
`dryRun=true`, `writeEnabled=false`, and `checkpointEnabled=false`. Counts
stayed Token / Metric / Notification / HolderSnapshot `1536 / 449 / 10 / 1`,
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`, and no
checkpoint or repo-local data diff was observed.

Next useful step should be a Green decision point, not immediate scheduler /
systemd: either choose a very small `/tmp` checkpoint write rehearsal, or
return to metric accumulation / report work if avoiding new Token writes is
preferred.

That Green decision point is now complete. The next bounded watch lane step is
a small `/tmp` checkpoint write rehearsal:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 5 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal-20260523-5.json
```

This requires human approval because it can write production Token rows and a
`/tmp` checkpoint file. Expected non-effects remain Metric write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
repo-local data diff `0`, scheduler / systemd `0`, and rawJson full dump `0`.
Do not use `timeout`.

The small bounded write rehearsal has now run successfully once. It completed
5 cycles with `status=ok`, `stopReason=completed`, `failedCount=0`,
`rateLimitRetryCount=0`, `importedCount=5`, `existingCount=0`,
`dryRun=false`, `writeEnabled=true`, and `checkpointEnabled=true`. Counts moved
only in Token: `1536 / 449 / 10 / 1 -> 1541 / 449 / 10 / 1`. The checkpoint
was written only under `/tmp`, and repo-local data stayed clean.

Next useful step should be another Green decision point: inspect the five new
mint-only rows with read-only reports, or return to metric accumulation /
report work. Scheduler / systemd remain out of scope.

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

## 2026-05-23 Detect Write Rehearsal Follow-up

The five Tokens created by the small bounded GeckoTerminal write rehearsal were
inspected read-only. All five are GeckoTerminal-origin pump `mint_only` rows
with `entrySnapshot.firstSeenSourceSnapshot`, `metricsCount=0`,
`notificationCount=0`, and `holderSnapshotCount=0`.

Queue state now supports returning to metric accumulation / report:

- 24h pump queue: `geckoOriginTokenCount=5`, `metricPendingCount=5`
- 168h pump queue: `geckoOriginTokenCount=425`, `metricPendingCount=265`,
  `staleReviewCount=420`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

Next selected lane: metric accumulation / report. The next task should be a
Green preflight that narrows one bounded Metric snapshot Red command. Do not
extend detect write rehearsal, scheduler, systemd, or always-on live send from
this result.

## 2026-05-23 Metric Accumulation Preflight

The Green preflight selected a small Metric accumulation Red for the five new
GeckoTerminal mint-only Tokens rather than returning immediately to the broader
limit-75 run.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Token Metric distribution: `0=1227`, `1=232`, `2+=82`
- 24h pump queue: `geckoOriginTokenCount=5`, `metricPendingCount=5`
- 168h pump queue: `geckoOriginTokenCount=425`, `metricPendingCount=265`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

Next Red exact command, requiring human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected effect is up to five new Metric rows only. Token, Notification,
HolderSnapshot, Telegram, scheduler, systemd, and repo-local data should remain
unchanged. Do not run the stable limit-75 command until this smaller
post-rehearsal Metric write is reviewed.

## 2026-05-23 Small Metric Snapshot Result

The approved small Metric snapshot for the five new GeckoTerminal mint-only
Tokens completed successfully:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selected=5`, `written=5`, `skipped=0`, `error=0`,
`interItemDelayMs=15000`, `interItemDelayCount=4`, no provider error, and no
429.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 449 / 10 / 1 -> 1541 / 454 / 10 / 1`
- Metric 0 / 1 / 2+ Token distribution:
  `1227 / 232 / 82 -> 1222 / 237 / 82`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

The five new Tokens now each have one Metric. The next selected step should be
a Green report/decision pass before any further Metric write expansion.

## 2026-05-23 New Metric Report Review

The Green read-only report pass confirmed Metric ids `1532..1536` are readable
through `metrics:report` and `metrics:window-report` without rawJson dumps or
side effects.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric 0 / 1 / 2+ Token distribution: `1222 / 237 / 82`
- 24h pump queue: `metricPendingCount=0`, `enrichPendingCount=5`
- 168h pump queue: `metricPendingCount=260`, `enrichPendingCount=425`,
  `staleReviewCount=420`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

The new rows are `thin` Metric-1 samples with visible `near_30m` entry anchors,
but no alert-FDV anchor, so outcome remains `no_data`. Next selected lane:
enrich/rescore preflight for the five new `mint_only` Metric-1 rows. Broader
Metric accumulation remains a second choice; detect write continuation and
scheduler/systemd remain locked.

## 2026-05-23 Enrich/Rescore Preflight

The Green read-only preflight confirmed that
`token:enrich-rescore:geckoterminal` can target the five new
GeckoTerminal-origin pump `mint_only` Metric-1 Tokens as a single bounded batch.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric 0 / 1 / 2+ Token distribution: `1222 / 237 / 82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- 24h pump queue: `geckoOriginTokenCount=5`, `enrichPendingCount=5`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h pump queue: `geckoOriginTokenCount=425`, `enrichPendingCount=425`,
  `metricPendingCount=260`, `staleReviewCount=420`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

Read-only simulation for `--pumpOnly --limit 5 --sinceMinutes 1440` selected
exactly ids `5624`, `5623`, `5622`, `5621`, and `5620`.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Expected effect is Token enrich/rescore/context/review-flag updates for up to
five rows after external GeckoTerminal and best-effort Metaplex fetches.
Expected non-effects are Metric write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler / systemd `0`,
repo-local data diff `0`, and rawJson full dump `0`. Do not add `--notify`.

## 2026-05-23 Enrich/Rescore Batch Result

The approved five-token enrich/rescore batch completed successfully:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`metaplexErrorKindCounts=metadata_account_missing=5`, `notifyWouldSend=0`,
`notifySent=0`, no provider error, and no 429.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`, Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`, and retry / auto-send candidates stayed `0`.

The five new rows moved from `mint_only` to `partial` with name/symbol,
normalized text, Gecko context capture, and review flags. They remain score
`C` / `0`, `hardRejected=false`, `metricsCount=1`,
`notificationCount=0`, and `holderSnapshotCount=0`.

The 24h pump queue now has `enrichPendingCount=0`, `metricPendingCount=0`,
and `notifyCandidateCount=0`; the 168h queue still has
`enrichPendingCount=420`, `metricPendingCount=260`, and
`staleReviewCount=420`.

Next selected step should be Green: review the enriched partial cohort through
read-only reports and decide whether to append a second Metric for these five,
return to broader Metric accumulation, or preflight the older 168h
enrich-pending backlog. Scheduler/systemd and auto live send remain locked.

## 2026-05-23 Enriched Partial Report Review

The five-token enriched partial cohort was reviewed through read-only report
commands. Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`; Metric distribution stayed `1222 / 237 / 82`;
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`; auto-send
allowed candidates and retry candidates stayed `0`.

The five target rows are now `partial`, named, scored `C / 0`,
`hardRejected=false`, and still have `metricsCount=1`,
`notificationCount=0`, and `holderSnapshotCount=0`. Review flags are present
but all link/context booleans are false.

`metrics:report` and `tokens:compare-report` read all five rows without rawJson
dump. Window reports stayed `metricCount=1`, `fdvMetricCount=1`, coverage
`thin`, `hasAlertFdvAnchor=false`, `hasWindowFdvSamples=true`, and
`outcomeLabel=no_data`. The 30m / 60m / 120m windows are complete; 180m and
longer windows remain provisional.

Next selected lane: second Metric snapshot small Red preflight for these five
partial tokens. This is preferred over immediately expanding into the 168h
`enrichPendingCount=420` backlog or the 168h `metricPendingCount=260` backlog
because it completes the narrow five-token loop first. Scheduler/systemd and
auto live send remain locked.

## 2026-05-24 Second Metric Snapshot Preflight

The Green preflight for the enriched partial five-token cohort confirmed that
the next bounded Metric Red can remain narrow:

- Current counts: Token / Metric / Notification / HolderSnapshot
  `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidates and auto-send allowed candidates: `0`
- target ids: `5624`, `5623`, `5622`, `5621`, `5620`
- all target rows are `partial`, score `C / 0`, and `metricsCount=1`
- latest Metrics `1532..1536` are about `346` minutes old, so
  `--minGapMinutes 60` is satisfied
- read-only selection simulation returned `eligibleCount=5`,
  `selectedCount=5`, and selected exactly the target ids

Next Red exact command, requiring human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effect is Metric write up to `+5` after external GeckoTerminal
fetch. Expected non-effects are Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Keep broader 168h Metric / enrich backlogs as later
lanes; complete this five-token loop first.

## 2026-05-24 Second Metric Snapshot Result

The approved second Metric snapshot small Red completed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selected=5`, `written=5`, `skipped=0`, `error=0`,
`interItemDelayMs=15000`, `interItemDelayCount=4`, no provider error, no 429,
and no retry. Metric ids `1537..1541` were written.

Counts moved Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`; Metric distribution moved
`1222 / 237 / 82 -> 1222 / 232 / 87`. Notification statuses stayed
`captured=5`, `sent=5`, `failed=0`; retry and auto-send candidates stayed
`0`.

All five target rows moved from `metricsCount=1` to `metricsCount=2` while
remaining `partial`, score `C / 0`, `hardRejected=false`, with no
Notification or HolderSnapshot rows. `metrics:window-report` shows 12h / 24h
coverage improved to `partial`; shorter windows remain `thin`, and outcome
stays `no_data` because there is no alert FDV anchor.

Next selected lane: Green preflight for the 168h GeckoTerminal enrichPending
backlog. The narrow five-token loop has now completed through second Metric
and report verification, so broader backlog work should be audited read-only
before any wider Red.

## 2026-05-24 Enrich Backlog Preflight

The Green preflight for the 168h GeckoTerminal enrichPending backlog confirmed
that the next wider Red can remain a small batch:

- Current counts: Token / Metric / Notification / HolderSnapshot
  `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidates and auto-send allowed candidates: `0`
- `token:enrich-rescore:geckoterminal` supports `--sinceMinutes`, not
  `--sinceHours`; use `10080` minutes for 168h
- 168h pump enrichPending count: `240`
- backlog shape: all `mint_only`, all `source=geckoterminal.new_pools`, all
  score `C / 0`, all `hardRejected=false`
- metricsCount distribution inside the backlog: `0=85`, `1=96`, `2+=59`
- selection simulation for limit 5 selects ids `5619..5615`
- selection simulation for limit 10 selects ids `5619..5610`
- selection simulation for limit 20 selects ids `5619..5600`
- the completed narrow-loop ids `5624..5620` are not selected

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effect is Token enrich/rescore/context/reviewFlags update for up
to five rows after GeckoTerminal and best-effort Metaplex fetches. Expected
non-effects are Metric write, Notification create/update, HolderSnapshot
write, Telegram send, scheduler/systemd, repo-local data diff, and rawJson full
dump. Do not add `--notify`.

## 2026-05-24 Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5619..5615` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, score still `C / 0`,
`hardRejected=false`, and reviewFlags present. Metrics stayed `5,4,4,4,4`;
Notification count stayed `1,0,0,0,0`; HolderSnapshot count stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=235`, `metricPendingCount=85`, `staleReviewCount=235`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step should
be Green: review this enriched backlog batch and choose between another small
backlog enrich batch, Metric follow-up, or docs/handoff.

## 2026-05-24 Enriched Backlog Batch Review

The Green review of ids `5619..5615` stayed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, have names/symbols and normalized text, have no
description or social/link flags, and have `enrichedAt` / `rescoredAt` set.
Metrics are readable: `5619` has 5 Metrics and one sent Notification; `5618`
through `5615` have 4 Metrics and no Notifications.

Window/report read-only check:

- `5619` uses sent Notification `id=10` as entry, but has no FDV samples after
  that sent anchor, so all checked windows remain `no_data`.
- `5618` uses firstSeen as entry and has 30m / 60m `thin`, 2h-12h `partial`,
  and 24h `usable`; outcome remains `no_data` because there is no alert FDV
  anchor / peak multiple.

Queue remains healthy: 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue has
`enrichPendingCount=235`, `metricPendingCount=85`, `staleReviewCount=235`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Next selection for the same bounded enrich command is clear: ids
`5614..5610`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, with no overlap against the reviewed
batch.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5619..5615` is second, but additional Metric writes are not
needed now because this cohort already has 4-5 Metrics and the main remaining
backlog is enrichPending.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Metric Backlog Lane Decision

The Green metric backlog preflight is complete. It confirmed that the current
168h queue still has `metricPendingCount=85`, but the existing
`metric:snapshot:geckoterminal` batch selector does not target those rows.
Batch mode orders eligible GeckoTerminal-origin pump rows newest-first by
`selectionAnchorAt`; with `--sinceMinutes 10080 --minGapMinutes 60`, all 245
recent Gecko pump rows are eligible.

Read-only simulation showed:

- limit 5 selects ids `5624..5620`, all already measured with
  `metricsCount=2`;
- limit 20 selects ids `5624..5605`, all partial and already measured;
- limit 30 selects ids `5624..5595`, all partial and already measured;
- limit 75 selects ids `5624..5550`, with `partial=45`, `mint_only=30`, and no
  Metric 0 rows;
- the Metric 0 backlog rows are ids `5380..5464`.

Therefore, do not run a batch Metric backlog Red yet. A batch limit 20 or limit
75 command would write additional Metrics to already measured rows and leave
`metricPendingCount=85` unchanged.

Next selected task: **Green exact-mint Metric 0 backlog preflight**. It should
choose one known Metric 0 row, confirm exact `--mint` behavior, include
`--noNotificationCapture` if writing is later approved, and only then decide
whether a single-row Red is acceptable. A later Yellow / design option is a
pending-first batch selector for true Metric backlog accumulation.

Scheduler, systemd, always-on auto live send, notification retry execution, and
production auto-send remain locked.

## 2026-05-24 Seventh Enrich Backlog Review Decision

The seventh bounded 168h enrich backlog review inspected ids `5589..5585`
read-only after they were moved to `partial`. Current state remains Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`.

The batch is healthy: all five reviewed rows are `partial`, score `C / 0`,
`hardRejected=false`, have normalized text / reviewFlags / enrichment and
rescore timestamps, and have `metricsCount=2`, `notificationCount=0`,
`holderSnapshotCount=0`. Read-only report/window checks show two GeckoTerminal
token snapshot Metrics per row, 3h-12h `thin`, 24h `partial`, and unresolved
`no_data` outcomes because no alert FDV anchor / peak multiple exists.

Queue context remains stable: default queue has no pending/candidate rows; 168h
queue has `enrichPendingCount=205`, `metricPendingCount=85`,
`staleReviewCount=205`, and `notifyCandidateCount=0`. Auto-send allowed
candidates and retry candidates remain `0`.

Next selected step: Green progress consolidation / handoff. Repeat limit 5
enrich backlog Red is second, but after seven consecutive successful Red
batches with no provider error, no 429, no retry, and no notify/Metric side
effects, a short consolidation is the safer next operating step. Scheduler,
systemd, always-on auto live send, and retry execution remain locked.

## 2026-05-24 Enrich Backlog Progress Consolidation

The consolidation reviewed seven consecutive bounded enrich backlog batches,
ids `5619..5585`, all run as limit 5 batches without `--notify`. They processed
35 Token rows and moved the 168h `enrichPendingCount` from the original 240
baseline to the current 205. Current 168h queue also shows
`metricPendingCount=85`, `staleReviewCount=205`, and `notifyCandidateCount=0`;
default queue has no pending/candidate rows.

Quality summary for the 35-row partial cohort: `scoreRank` distribution is
`C=34`, `B=1`; `scoreTotal` distribution is `0=32`, `1=2`, `2=1`;
`hardRejected=0`. Notable rows are `5607` `B / 2`, plus `5596` and `5590`
`C / 1`. Website, X, Telegram, Metaplex hit, description, and link presence
are all zero across the cohort, which explains why `notifyCandidateCount`
remains `0`.

Safety summary: repeated Reds have shown no provider error, no 429, no retry,
no Metric write, no Notification create/update, no HolderSnapshot write, no
Telegram send, no scheduler/systemd, no repo-local data diff, and no rawJson
full dump.

Next selected step: repeat limit 5 enrich backlog Red. Broader metric backlog
preflight is second, and recent cohort analysis is now mostly covered by this
consolidation. The next selection is ids `5584..5580`, all `mint_only`, score
`C / 0`, non-hard-rejected, GeckoTerminal-origin pump rows with
`metricsCount=2`.

Human-approved Red exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token update for up to five rows. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump.

## 2026-05-24 Eighth Enrich Backlog Batch Result

The human-approved eighth bounded enrich backlog Red ran once with the same
command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

It completed successfully: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

The selected ids `5584..5580` moved from `mint_only` to `partial`. Two token
names/symbols were redacted in docs as offensive terms; the other rows are
`Jester` / `Jester`, `stop using ai` / `ai`, and `Mintendo` / `MINTENDO`.
Scores are four `C / 0` rows and one `C / 1` row; all are
`hardRejected=false`, have no description or social/link flags, and retain
`metricsCount=2`, `notificationCount=0`, `holderSnapshotCount=0`.

The 168h queue moved from `enrichPendingCount=205` to `200`, with
`metricPendingCount=85`, `staleReviewCount=200`, and
`notifyCandidateCount=0`. The default queue remains empty. Next step should be
Green: review ids `5584..5580` in report/window/queue and decide whether to
continue another limit 5 enrich backlog Red or switch lanes.

## 2026-05-24 Eighth Enriched Backlog Batch Review

The read-only review of ids `5584..5580` is complete. Current counts stayed
Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`. Retry candidates and auto-send allowed
candidates remain `0`.

All five rows are `partial`, non-hard-rejected, have normalized text,
reviewFlags, and `metricsCount=2`; none has Notification or HolderSnapshot
rows. Two rows have offensive name/symbol values and must be documented only
as `[offensive term]`, without raw text in reports or handoff. `5581` is the
only score mover at `C / 1`, from a learned AI-phrase hit, and is not a notify
candidate.

Representative `metrics:window-report` checks for non-offensive rows `5581`
and `5580` remained read-only and showed `metricCount=2`, `fdvMetricCount=2`,
`hasAlertFdvAnchor=false`, and wider-window FDV samples. Outcome remains
`no_data`; wider windows are `thin` or `partial`, not usable alert-anchored
outcomes. RawJson was not dumped.

Queue context is healthy but now calls for consolidation: default queue remains
empty, 168h queue has `enrichPendingCount=200`, `metricPendingCount=85`,
`staleReviewCount=200`, and `notifyCandidateCount=0`. After eight consecutive
bounded enrich batches without 429, provider error, retry, Metric write,
Notification update, HolderSnapshot write, or Telegram send, the next selected
step is **Green progress consolidation / handoff**, not an immediate ninth
Red. Repeat limit 5 enrich backlog remains the second candidate after a fresh
preflight.

## 2026-05-24 Offensive-Safe Enrich Backlog Consolidation

The docs/handoff consolidation after eight bounded enrich backlog Reds is now
complete. Processed scope is ids `5619..5580`: 8 batches, 40 tokens, all moved
to `partial`. The 168h enrichPending queue moved `240 -> 200`; remaining
context is `geckoOriginTokenCount=245`, `enrichPendingCount=200`,
`metricPendingCount=85`, `staleReviewCount=200`, and
`notifyCandidateCount=0`.

Quality summary for the processed 40-row cohort:

- scoreRank distribution: `C=39`, `B=1`
- scoreTotal distribution: `0=36`, `1=3`, `2=1`
- hardRejected: `0`
- description / website / X / Telegram / Metaplex / links present: `0`
- notifyCandidate: `0`
- notable examples: `5607` is `B / 2`; `5596`, `5590`, and `5581` are
  `C / 1`

Offensive-safe rule is fixed for this lane: when a token name/symbol is
offensive, docs and final reports must use `[offensive term]` or count-based
summary only. Do not run broad target-set reports when they would print
offensive raw text; use redacted Prisma safe summaries or representative
non-offensive report samples. Continue avoiding Metric rawJson, provider raw
bodies, secrets, and env values.

Safety summary: the eight Reds only used the Token update path. Metric writes,
Notification create/update, HolderSnapshot writes, Telegram sends, auto-send
execution, retry execution, scheduler/systemd, repo-local data diffs, provider
errors, 429s, and rawJson/offensive raw dumps stayed at `0`.

Next selected lane: **recent enriched cohort score/report analysis** as a Green
task. A ninth limit 5 enrich backlog Red is still possible after fresh
preflight, but it is second choice. Broader Metric backlog preflight is the
third choice and should be selected when the operator wants to address
`metricPendingCount=85` instead of adding more Token updates.

## 2026-05-24 Recent Enriched Cohort Analysis

The Green score/report analysis of ids `5619..5580` is complete. It stayed
read-only and used redacted safe summaries for offensive-sensitive rows.

Findings:

- cohort size: `40`, all `metadataStatus=partial`
- scoreRank distribution: `C=39`, `B=1`
- scoreTotal distribution: `0=36`, `1=3`, `2=1`
- hardRejected: `0`
- notifyCandidate: `0`
- website / X / Telegram / Metaplex / description / links: all `0`
- metricsCount distribution: `2=10`, `3=25`, `4=4`, `5=1`
- `5607` is the only `B / 2`, from a core `dog` keyword hit
- `5596`, `5590`, and `5581` are `C / 1`

Representative `metrics:window-report` checks for `5607`, `5581`, and `5582`
showed readable FDV samples in wider windows but no alert FDV anchor. Outcome
therefore remains `no_data`; coverage is `thin` or `partial` depending on the
window and metric count. This supports the decision that `notifyCandidate=0`
is expected, not a planner anomaly.

Next selected lane: **broader metric backlog preflight**. The enrich backlog
Red can resume later, but the current cohort is thin in metadata/context and
does not produce notification candidates. The remaining `metricPendingCount=85`
is the better next Green target for selection, pacing, and rate-limit
preflight. Do not run Metric write yet.

## 2026-05-24 Sixth Enrich Backlog Batch Result

The sixth bounded 168h enrich backlog Red ran once with the approved command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

It completed successfully: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

Selected ids `5594..5590` moved from `mint_only` to `partial` with
name/symbol and normalized text present. Four stayed score `C / 0`; `5590`
became `C / 1` from a single core narrative keyword hit. All five stayed
`hardRejected=false`, `metricsCount=3`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. The 168h queue moved to `enrichPendingCount=210`,
`metricPendingCount=85`, `staleReviewCount=210`, `notifyCandidateCount=0`.
Auto-send allowed candidates and retry candidates remain `0`.

Expected non-effects held: no Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
or rawJson full dump.

Next selected step is Green: review ids `5594..5590` with read-only
report/window/queue/planner checks. Do not proceed directly to another Red
until that review confirms the batch boundary again.

## 2026-05-24 Sixth Enriched Backlog Batch Review

The Green review of ids `5594..5590` completed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

All five reviewed rows are `partial`, non-hard-rejected, have normalized text,
`enrichedAt`, `rescoredAt`, reviewFlags, and `metricsCount=3`. Four remain
score `C / 0`; `5590` is `C / 1` from a single safe core `cat` keyword hit.
No row has website, X, Telegram, Metaplex hit, description, links,
Notification rows, or HolderSnapshot rows.

Report/window checks stayed safe:

- `metrics:report` reads three safe Metric summaries per row without raw
  provider payloads.
- representative `metrics:window-report` checks for `5594` and `5590` show
  `metricCount=3`, `fdvMetricCount=3`, `entryAnchorQuality=delayed_180m`,
  3h `thin`, 6h-24h `partial`, `outcomeLabel=no_data`, and no alert FDV
  anchor.
- target compare summary keeps the cohort unresolved because latest multiple /
  peak fields are missing.

Queue remains compatible with one more small enrich backlog batch: default
queue is empty for enrich/metric/notify, and 168h queue has
`enrichPendingCount=210`, `metricPendingCount=85`, `staleReviewCount=210`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Recommended next step: repeat the bounded limit 5 enrich backlog Red once more.
The next selection is ids `5589..5585`, all `mint_only`, GeckoTerminal-origin
pump rows, score `C / 0`, `hardRejected=false`, and `metricsCount=2`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex lookup, and Token update for up to five rows.
Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Seventh Enrich Backlog Batch Result

The seventh bounded 168h enrich backlog Red ran once with the approved command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

It completed successfully: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Selection skipped `35` already-complete rows.

Selected ids `5589..5585` moved from `mint_only` to `partial` with
name/symbol and normalized text present: `zynnner` / `zyn`, `New Moon` /
`Moon`, `Turtle Carl` / `Carl`, `SmilingFace` / `SmilingFace`, and `Pelican` /
`PELICAN`. All five stayed score `C / 0`, `hardRejected=false`,
`metricsCount=2`, `notificationCount=0`, and `holderSnapshotCount=0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. The 168h queue moved to `enrichPendingCount=205`,
`metricPendingCount=85`, `staleReviewCount=205`, `notifyCandidateCount=0`.
Auto-send allowed candidates and retry candidates remain `0`.

Expected non-effects held: no Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
or rawJson full dump.

Next selected step is Green: review ids `5589..5585` with read-only
report/window/queue/planner checks. Do not proceed directly to another Red
until that review confirms the batch boundary again.

## 2026-05-24 Fifth Enriched Backlog Batch Review

The Green review of ids `5599..5595` stayed read-only/docs-only. Counts stayed
Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, non-hard-rejected, and
have names/symbols, normalized text, reviewFlags, `enrichedAt`, and
`rescoredAt`. Descriptions, website/X/Telegram/link flags, Metaplex hits,
Notifications, and HolderSnapshots remain absent. Each has `metricsCount=3`.
`5596` is score `C / 1`; the safe score breakdown shows one core keyword hit,
key `cat` for `+1`, and it is still not a notify candidate.

Read-only report checks:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row
  without dumping raw provider payloads.
- `metrics:window-report` for representative ids `5596` and `5599` shows
  firstSeen entry anchors, 3h `thin`, 6h-24h `partial`, and
  `outcomeLabel=no_data` because there is no alert FDV anchor.
- `tokens:compare-report` includes ids `5599..5595` as partial rows with
  latest GeckoTerminal Metrics and unresolved outcome.

Queue/planner context remains healthy: default queue has
`enrichPendingCount=0`, `metricPendingCount=0`, `notifyCandidateCount=0`; 168h
queue has `enrichPendingCount=215`, `metricPendingCount=85`,
`staleReviewCount=215`, `notifyCandidateCount=0`; auto-send allowed and retry
candidates are both `0`.

Next selection for the same bounded enrich command is clear as ids
`5594..5590`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
non-hard-rejected, `metricsCount=3`, with no Notification or HolderSnapshot
rows.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5599..5595` is second; broader Metric backlog is deferred.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Fifth Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Selection skipped complete rows
`skippedComplete=25`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.

Selected ids `5599..5595` moved from `mint_only` to `partial` with
name/symbol present and normalized text present:

- `5599`: `TROLL OF THE UNITED STATES` / `TOTUS`, score `C / 0`
- `5598`: `Delusional Optimist` / `OPTIMIST`, score `C / 0`
- `5597`: `Boner Phone` / `Thumas`, score `C / 0`
- `5596`: `Self-Replicating Tweet` / `.....`, score `C / 1`
- `5595`: `KUROGANE` / `KGANE`, score `C / 0`

All five remained `hardRejected=false`, description absent, no website/X/
Telegram/link/Metaplex flags, `metricsCount=3`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Queue moved as expected: default queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=215`, `metricPendingCount=85`, `staleReviewCount=215`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

This confirms the fifth repeat limit-5 backlog Token update boundary. It did
not write Metrics, create/update Notifications, write HolderSnapshots, send
Telegram, execute auto-send/retry, touch scheduler/systemd, create repo-local
data diffs, or dump rawJson.

Next selected step: Green review of ids `5599..5595` via read-only
report/window/queue/planner before deciding whether to repeat another limit 5
enrich backlog Red.

## 2026-05-24 Fourth Enriched Backlog Batch Review

The Green review of ids `5604..5600` stayed read-only/docs-only. Counts stayed
Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, and have names/symbols, normalized text, reviewFlags,
`enrichedAt`, and `rescoredAt`. Descriptions, website/X/Telegram/link flags,
Metaplex hits, Notifications, and HolderSnapshots remain absent. Each has
`metricsCount=3`.

Read-only report checks:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row
  without dumping raw provider payloads.
- `metrics:window-report` for representative ids `5604` and `5600` shows
  firstSeen entry anchors, `thin` to `partial` wider-window FDV coverage, and
  `outcomeLabel=no_data` because there is no alert FDV anchor.
- `tokens:compare-report` includes ids `5604..5600` as partial rows with
  latest GeckoTerminal Metrics and unresolved outcome.

Queue/planner context remains healthy: default queue has
`enrichPendingCount=0`, `metricPendingCount=0`, `notifyCandidateCount=0`; 168h
queue has `enrichPendingCount=220`, `metricPendingCount=85`,
`staleReviewCount=220`, `notifyCandidateCount=0`; auto-send allowed and retry
candidates are both `0`.

Next selection for the same bounded enrich command is clear as ids
`5599..5595`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
non-hard-rejected, `metricsCount=3`, with no Notification or HolderSnapshot
rows.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5604..5600` is second; broader Metric backlog is deferred.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Third Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5609..5605` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, `hardRejected=false`, and
reviewFlags present. Scores stayed `C / 0` except `5607`, which moved to
`B / 2`. Metrics stayed `3,3,3,3,3`; Notification and HolderSnapshot counts
stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=225`, `metricPendingCount=85`, `staleReviewCount=225`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step
should be Green: review this third enriched backlog batch and decide whether
to run another small backlog enrich batch or shift to Metric/report follow-up.

## 2026-05-24 Fourth Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5604..5600` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, score still `C / 0`,
`hardRejected=false`, and reviewFlags present. Metrics stayed `3,3,3,3,3`;
Notification and HolderSnapshot counts stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=220`, `metricPendingCount=85`, `staleReviewCount=220`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step
should be Green: review this fourth enriched backlog batch and decide whether
to run another small backlog enrich batch or shift to Metric/report follow-up.

## 2026-05-24 Third Enriched Backlog Batch Review

The Green review of ids `5609..5605` stayed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, non-hard-rejected, have
names/symbols and normalized text, have no description or social/link flags,
and have `enrichedAt` / `rescoredAt` set. Each has `metricsCount=3` and no
Notification / HolderSnapshot rows. `5607` is the only score mover: `Doge
Coffee` / `DOGECOFFEE` is `B / 2` because normalized text
`doge coffee dogecoffee` hit the core `dog` keyword for `+2`.

Window/report read-only check:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row and
  shows safe market-data presence booleans without raw provider payloads.
- `5607` and `5609` both use firstSeen as entry, have
  `entryAnchorQuality=delayed_120m`, 30m / 60m `no_data`, 2h `thin`, and
  3h-24h `partial`.
- Outcome remains `no_data` because there is no alert FDV anchor / peak
  multiple.
- `tokens:compare-report` includes ids `5609..5605` with
  `metadataStatus=partial`, `minMetricsCount=3`, latest GeckoTerminal Metrics,
  and unresolved outcome.

Queue remains healthy: 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue has
`enrichPendingCount=225`, `metricPendingCount=85`, `staleReviewCount=225`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Next selection for the same bounded enrich command is clear: ids
`5604..5600`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, with no overlap against the reviewed
batch.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5609..5605` is second, but the rows already have three Metrics
and are readable; the main remaining backlog is still enrichPending.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Next Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5614..5610` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, score still `C / 0`,
`hardRejected=false`, and reviewFlags present. Metrics stayed `3,3,3,3,3`;
Notification and HolderSnapshot counts stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=230`, `metricPendingCount=85`, `staleReviewCount=230`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step should
be Green: review this second enriched backlog batch and decide whether to run
another small backlog enrich batch or shift to Metric/report follow-up.

## 2026-05-24 Next Enriched Backlog Batch Review

The Green review of ids `5614..5610` stayed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, have names/symbols and normalized text, have no
description or social/link flags, and have `enrichedAt` / `rescoredAt` set.
Each has `metricsCount=3` and no Notification / HolderSnapshot rows.

Window/report read-only check:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row and
  shows safe market-data presence booleans without raw provider payloads.
- `5614` and `5613` both use firstSeen as entry, have
  `entryAnchorQuality=delayed_120m`, 30m / 60m `no_data`, 2h `thin`, and
  3h-24h `partial`.
- Outcome remains `no_data` because there is no alert FDV anchor / peak
  multiple.
- `tokens:compare-report` includes ids `5614..5610` with
  `metadataStatus=partial`, `minMetricsCount=3`, latest GeckoTerminal Metrics,
  and unresolved outcome.

Queue remains healthy: 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue has
`enrichPendingCount=230`, `metricPendingCount=85`, `staleReviewCount=230`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Next selection for the same bounded enrich command is clear: ids
`5609..5605`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, with no overlap against the reviewed
batch.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5614..5610` is second, but the rows already have three Metrics
and are readable; the main remaining backlog is still enrichPending.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.
