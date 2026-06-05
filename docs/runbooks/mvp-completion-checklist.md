# Lowcap Bot Personal MVP Completion Checklist

## Status

- Personal MVP runtime validation: passed
- MVP status: complete enough for personal bounded-run use
- Date: 2026-06-03
- Declaration HEAD: `02f0219 docs: review mvp bounded runner result`
- Key run record: `5dd4cbd docs: record network enabled mvp bounded runner`

This is a personal bounded-run research MVP. It is not production-ready, not a
fully automated bot platform, and not a profitable prediction system.

## MVP Definition

The MVP is a personal bounded-run research OS that can:

- detect new GeckoTerminal pump tokens
- store or reuse Token rows
- snapshot Metrics in a network-enabled context
- enrich and rescore tokens
- classify risk and hard-reject signals
- show review queues
- show blocker reasons for non-notification candidates
- show B watchlist rows as report-only review targets
- run notification planners safely
- avoid unintended Telegram sends
- produce final runner summary and queue-after visibility

## Evidence

The primary runtime evidence is the approved network-enabled / out-of-sandbox
6H bounded runner validation:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-mvp-6h-20260602.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

Observed result:

- exact Red command executed once
- context was network-enabled / out-of-sandbox
- runner completed in about 6h55m
- `blockedBy=[]`
- `stopConditionCodes=[]`
- detect imported `360` new pump tokens
- Metric wrote ids `2317..2416`, count `100`
- provider errors observed: `0`
- enrich/rescore updated token ids `7478..7577`, count `100`
- all updated tokens moved to `partial`
- report review completed
- notification planner review completed
- checkpoint was created outside the repo
- progress and final summary were observed
- Notification count stayed `22`
- Telegram send stayed `0`
- HolderSnapshot count stayed `1`

DB movement:

- Token: `3023 -> 3383`
- Metric: `1207 -> 1307`
- Notification: `22 -> 22`
- HolderSnapshot: `1 -> 1`

Current post-review state:

- Token / Metric / Notification / HolderSnapshot: `3383 / 1307 / 22 / 1`
- metadataStatus: `mint_only=2601`, `partial=769`, `enriched=13`
- Metric buckets: `0=2216`, `1=1080`, `2+=87`
- default 24h queue: `metricPending=260`, `enrichPending=260`, `notifyCandidate=0`
- rolling 168h queue: `metricPending=260`, `enrichPending=501`, `notifyCandidate=0`
- watchlist 168h: `12` rows, all `B / 2`, all ready, report-only
- disabled/enabled auto-send allowed: `0 / 0`
- retry candidate: `0`
- failed Notification: `0`

Prior evidence:

- network-enabled Metric limit `1` diagnostic succeeded
- network-enabled Metric limit `50` batches succeeded repeatedly
- network-enabled enrich/rescore limit `10` batches succeeded repeatedly
- safe aliases avoid the direct `tsx` IPC issue for targeted Red CLIs
- provider error classification works without dumping raw provider bodies
- `review:queue --includeBlockers` exposes blocker reasons
- `review:queue --watchlistOnly` exposes B watchlist rows safely
- notification planners remain read-only and closed when no candidate exists

## MVP Included

- manual bounded operation
- network-enabled / out-of-sandbox execution for provider-fetch Red tasks
- safe aliases for targeted GeckoTerminal Red commands
- repo-local Red Safety Skill for human-approved Red execution
- checkpoint files outside the repo
- detect, Metric, enrich, report, and notification planner phases
- Metric and enrich post-run cycles
- review queue and blocker visibility
- B watchlist report-only view
- notification planner safety checks
- Telegram non-send boundary

## MVP Not Included

- Telegram auto-send
- scheduler/systemd always-on operation
- trading or sniping automation
- scoring dictionary optimization
- capture-only B Notifications
- Pro API integration
- advanced holder or risk analytics
- profitability prediction

## Operational Rules

- Use network-enabled / out-of-sandbox context for provider-fetch Red tasks.
- Use safe aliases for targeted GeckoTerminal Red commands when available.
- Use the repo-local Red Safety Skill for human-approved Red execution.
- Run one exact command per Red.
- Do not retry or run a second Red without separate approval.
- Keep checkpoint files outside the repo.
- Keep Notification / Telegram execution locked unless separately approved.
- Do not use `pnpm smoke` as a no-write validation command on the active DB.
- Do not dump rawJson, offensive raw text, secrets, provider bodies, or env
  values.

## Current Known Gaps

These are not MVP blockers:

- metricPending and enrichPending backlog remains
- `notifyCandidate=0`
- B watchlist rows are only `B / 2`
- default 24h and strict 6h queues can drift with time
- normal sandbox DNS cannot reach the GeckoTerminal provider
- Metaplex hit rate is low
- Phase 2 targeted cleanup selectors can drift if DB-only simulation does not
  match the write CLI selector semantics. This is an operating-cadence issue,
  not an MVP completion blocker. The targeted enrich cleanup path now has a
  batch-only `--onlyMetricCovered` guard for Metric-first cleanup; run Green
  guarded preflight before the next Red.
- The first Phase 2 12H bounded runner trial did not complete end-to-end. It
  imported `682` new mint-only Tokens during detect write, but was manually
  interrupted about 11h32m after start and before the planned 12H plus
  post-run window. It did not reach post-run Metric, guarded enrich, report,
  or notification planner phases. This is a Phase 2 operating finding, not a
  retroactive MVP blocker, because the original 6H network-enabled MVP
  validation remains the acceptance evidence.
- The follow-up interruption review classifies that 12H trial as
  `interrupted_detect_only_partial_success`, `not_completed`,
  `not_failed_provider`, and `not_timeout_proven`. The next operating task
  should be a fresh Green targeted Metric cleanup preflight, not direct Red
  execution and not an immediate 12H rerun.

## Next Phase

Phase 2 is operational cleanup and quality improvement.

First Phase 2 triage decision, 2026-06-03:

- Choose targeted Metric pending cleanup first.
- Reason: Metric preview has clean Metric-zero rows, but read-only enrich
  simulation shows the next enrich candidates are also Metric-zero. Metric
  coverage should be added before more enrich/report quality work.
- Safe preview evidence:
  - `sinceMinutes=420`: selected ids `7477..7466`, count `12`
  - `sinceMinutes=10080`: selected ids `7477..7428`, count `50`
  - selected rows are `mint_only`, `metricsCount=0`,
    `notificationCount=0`, `holderSnapshotCount=0`
  - preview stayed `dryRun=true`, `writeEnabled=false`,
    `providerErrorCount=0`, fetch-free, write-free, and rawJson-free
- Recommended Red requires human approval and network-enabled /
  out-of-sandbox context. It remains post-MVP cleanup, not an MVP completion
  requirement.

First Phase 2 cleanup execution, 2026-06-03:

- The targeted Metric cleanup Red completed in network-enabled /
  out-of-sandbox context.
- Exact command ran once with the safe Metric alias, `--limit 50`,
  `--sinceMinutes 10080`, `--onlyMetricPending`, `--noNotificationCapture`,
  and `--write`.
- Selected ids `7477..7428` moved from `metricsCount=0` to `metricsCount=1`.
- Metric ids `2417..2466` were created; rawJson-free safe checks show
  price / FDV / reserve / top-pool presence for `50 / 50`.
- Counts moved only in Metric: `3383 / 1307 / 22 / 1 ->
  3383 / 1357 / 22 / 1`.
- Notification / Telegram, HolderSnapshot, retry, auto-send,
  scheduler/systemd, and rawJson dumps remained unchanged.
- This confirms the first Phase 2 cleanup path, but it is still post-MVP
  improvement. The next task should be Green review / targeted enrich
  preflight, not automatic continuation.

Phase 2 cleanup continuation, 2026-06-04:

- A later targeted Metric cleanup for ids `7427..7378` created Metric ids
  `2467..2516` and moved the selected rows to `metricsCount=1`.
- The follow-up targeted enrich cleanup then moved the same ids
  `7427..7378` from `mint_only` to `partial`.
- The enrich run wrote Token enrich/rescore/context/reviewFlags updates for
  `50 / 50`, attempted Metaplex for `50`, saved Metaplex context for `2`,
  and kept Metric / Notification / HolderSnapshot counts unchanged.
- Resulting score distribution was `C / 0 = 48`, `C / 1 = 2`, with
  `hardRejected=0`.
- Notification / Telegram, retry, auto-send, scheduler/systemd, and rawJson
  full dumps stayed locked. This remains Phase 2 quality cleanup, not a new
  MVP requirement.

First Phase 2 enrich preflight, 2026-06-04:

- Post-run Metric review confirmed the Metric cleanup rows are report-readable
  and rawJson-free.
- `sinceMinutes=420` no longer selects the cleanup batch because the
  created/first-seen window drifted.
- `sinceMinutes=10080` selects ids `7477..7428`, count `50`, all
  `mint_only`, `metricsCount=1`, `score=C/0`, `hardRejected=false`,
  `reviewFlagsPresent=false`, `notificationCount=0`, and
  `holderSnapshotCount=0`.
- The next Phase 2 Red candidate is targeted enrich cleanup for those rows,
  not another Metric cleanup batch.

First Phase 2 enrich cleanup execution, 2026-06-04:

- The targeted enrich cleanup Red completed in network-enabled /
  out-of-sandbox context.
- Exact command ran once with the safe enrich/rescore alias, `--limit 50`,
  `--sinceMinutes 10080`, `--interItemDelayMs 15000`, and `--write`; no
  `--notify` flag was used.
- Selected ids `7477..7428` moved from `mint_only` to `partial`.
- Token enrich/rescore/context/reviewFlags writes completed for `50 / 50`;
  Metaplex was attempted for `50`, available/saved for `1`, and missing for
  `48`.
- Counts stayed Token / Metric / Notification / HolderSnapshot
  `3383 / 1357 / 22 / 1`; Metric buckets stayed `0=2166`, `1=1130`,
  `2+=87`.
- Score distribution is `C / 0 = 48` and `B / 2 = 2`; `hardRejected=0`.
- Notification / Telegram, Metric write, HolderSnapshot write, retry,
  auto-send, scheduler/systemd, and rawJson dumps remained unchanged.
- This is Phase 2 cleanup evidence, not a change to the MVP completion
  decision. Run Green post-run enrich/report review before any further Red.

First Phase 2 enrich cleanup review, 2026-06-04:

- The targeted rows `7477..7428` are confirmed reportable and rawJson-free:
  `partial=50`, reviewFlags / scoreBreakdown / GeckoTerminal context
  `50 / 50`, Metaplex context `1 / 50`, `metricsCount=1` for `50 / 50`, and
  selected Notification / HolderSnapshot totals `0`.
- Score distribution is still weak: `C / 0 = 48`, `B / 2 = 2`,
  `hardRejected=0`. The B rows are useful as manual watchlist evidence, not as
  notification candidates.
- `notifyCandidate=0` is expected because current notification eligibility
  remains S-only and the reviewed rows are below S. Notification / Telegram
  remain locked.
- The next Phase 2 task should be no-write watchlist manual review / scoring
  evidence gathering. Additional targeted enrich or Metric cleanup remains
  optional post-MVP work and should continue to use separate human-approved
  Red prompts.

First Phase 2 watchlist evidence review, 2026-06-04:

- Rolling 168h watchlist has `13` rows, all `B / 2`, `partial`,
  `metricsCount=1`, non-hard-rejected, ready, and report-only.
- Evidence is useful for manual review but not strong enough for dictionary
  tuning: scoreBreakdown is mostly single core hits, learned contribution is
  small, and trend/combo evidence is absent.
- Notification remains S-only. `notifyCandidate=0`, auto-send allowed `0 / 0`,
  retry candidate `0`, and failed Notification `0` are expected.
- Next Phase 2 task should be bounded runner cadence documentation. More
  targeted cleanup is optional and should be selected only after a fresh Green
  preflight.

Phase 2 cadence documentation, 2026-06-04:

- `docs/runbooks/phase-two-operating-cadence.md` now defines the post-MVP
  manual cadence for bounded runner use, targeted Metric cleanup, targeted
  enrich cleanup, watchlist manual review, notification safety review, stop
  conditions, and locked scope.
- This does not change the MVP completion decision. It records how to operate
  the complete-enough MVP without turning it into scheduler/systemd,
  Telegram auto-send, retry execution, or a generic worker.
- Next data task should be a Green targeted cleanup preflight, not an
  immediate Red.

Second Phase 2 Metric cleanup execution, 2026-06-04:

- The targeted Metric cleanup Red completed in network-enabled /
  out-of-sandbox context after the cadence preflight selected Metric-zero ids
  `7427..7378`.
- Exact command ran once with the safe Metric alias, `--limit 50`,
  `--sinceMinutes 10080`, `--onlyMetricPending`, `--noNotificationCapture`,
  and `--write`.
- Metric ids `2467..2516` were created; selected ids `7427..7378` moved from
  `metricsCount=0` to `metricsCount=1`; rawJson-free safe checks show price /
  FDV / reserve / top-pool presence for `50 / 50`.
- Counts moved only in Metric: `3383 / 1357 / 22 / 1 ->
  3383 / 1407 / 22 / 1`; Metric buckets moved to `0=2116`, `1=1180`,
  `2+=87`.
- Notification / Telegram, Token writes, HolderSnapshot, retry, auto-send,
  scheduler/systemd, and rawJson dumps remained unchanged.
- This remains post-MVP cleanup evidence. The next task should be Green
  post-run Metric/report review and targeted enrich preflight for these rows.

Second Phase 2 enrich preflight, 2026-06-04:

- Post-run Metric review confirmed ids `7427..7378` are report-readable with
  Metric ids `2467..2516`, safe price / FDV / reserve / top-pool presence,
  `metricsCount=1`, and selected Notification / HolderSnapshot totals `0`.
- The 420 minute enrich window has drifted clear, but `sinceMinutes=10080`
  selects exactly ids `7427..7378`, all `mint_only`, `metricsCount=1`,
  `score=C/0`, `hardRejected=false`, and without reviewFlags.
- The next Phase 2 Red candidate should use the guarded targeted enrich shape
  with `--onlyMetricCovered` after a fresh Green preflight in
  network-enabled / out-of-sandbox context. This remains post-MVP cleanup, not
  an MVP blocker.
- The first guarded targeted enrich cleanup using `--onlyMetricCovered` is now
  complete. It selected the intended ids `7018..6969`,
  `selection.onlyMetricCovered=true`, `skippedMetricUncoveredCount=110`,
  `selected=50`, `ok=50`, `error=0`, and moved the rows
  `mint_only -> partial` while keeping Metric / Notification /
  HolderSnapshot counts `3383 / 1407 / 22 / 1` unchanged.
- Notification / Telegram, Metric writes, HolderSnapshot writes, retry,
  auto-send, scheduler/systemd, and rawJson dumps stayed locked during the
  guarded cleanup. The next task is Green post-run guarded enrich/report
  review, not automatic continuation.
- The Green post-run guarded enrich/report review is now complete. The guard
  selected exactly the intended Metric-covered ids `7018..6969` and reported
  `skippedMetricUncoveredCount=110`, so the selector drift is considered
  resolved for this cleanup lane. The batch added one weak B/2 watchlist row
  and three C/1 rows, but no A/S or notify candidates. This is Phase 2
  evidence only; personal MVP status remains complete-enough and no scoring,
  notification, Telegram, scheduler, or systemd policy changes are included in
  the MVP declaration.
- The follow-up watchlist/scoring evidence review keeps the same MVP decision.
  Rolling 168h has `15` B/2 rows, `14` ready and `1` missing Metric, but the
  evidence remains report-only and below A/S or notification thresholds. The
  next work is Phase 2 status/cadence review or an explicit cleanup preflight,
  not an MVP blocker.
- The Phase 2 status/cadence review confirms there is no new MVP blocker and
  no immediate Red requirement. Default/recent windows are clear, rolling 168h
  backlog is optional cleanup inventory, and Notification / Telegram /
  scheduler / systemd stay locked. Personal MVP status remains
  complete-enough for manual bounded-run use.
- The 2026-06-05 periodic Phase 2 review keeps the same MVP decision. Current
  default 24h queue is clear, rolling 168h backlog is optional cleanup
  inventory, watchlist remains B/2 report-only, and Notification / Telegram /
  retry / auto-send remain locked. This is a status point, not a new MVP
  blocker and not Red approval.
- The 2026-06-05 operating-start review also keeps the same MVP decision.
  Nothing in the current queue, watchlist, or notification planners reopens MVP
  scope. Today's action is no Red / status point; future cleanup or new data
  collection should begin with a fresh Green preflight.
- The 2026-06-05 12H bounded runner trial preflight is Phase 2 endurance work,
  not a new MVP completion requirement. The fixed plan-only command passed and
  the Red candidate is available for separate human approval, but MVP status
  remains complete-enough regardless of whether the 12H trial is run.

Possible next tasks:

1. targeted Metric pending cleanup
2. targeted enrich cleanup
3. watchlist manual review
4. scoring dictionary evidence gathering
5. notification test / safety rehearsal
6. bounded runner operating cadence
7. optional MVP dashboard or report summary

## Completion Decision

Personal MVP: pass / complete enough.

Conditions:

- complete for manual bounded network-enabled operation
- Telegram auto-send remains locked
- scheduler/systemd remains disabled
- further backlog cleanup is useful but not an MVP blocker

Next work is post-MVP improvement, not MVP completion.

## Acceptance Checklist

- [x] detect works
- [x] Token create/reuse works
- [x] Metric write works in network-enabled context
- [x] enrich/rescore works
- [x] report queue works
- [x] blocker visibility works
- [x] watchlistOnly works
- [x] notification planner is safe
- [x] Telegram is not sent unexpectedly
- [x] checkpoint works
- [x] final summary works
- [x] network-enabled 6H bounded runner passed
- [ ] Telegram auto-send, out of MVP
- [ ] scheduler/systemd, out of MVP
