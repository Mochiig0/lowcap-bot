# Phase 2 Operating Cadence

## Status

- Personal MVP is complete enough for manual bounded-run use.
- Phase 2 focus is operational cleanup and quality improvement.
- This is not production-ready, not fully automated, and not a scheduler or
  systemd operating model.
- Telegram auto-send, retry execution, scheduler/systemd, and capture-only B
  Notifications remain locked.

Phase 2 12H trial note, 2026-06-05: the first 12H bounded runner trial did not
complete end-to-end. It imported `682` new mint-only Tokens during
`detect_write`, then was manually interrupted at
`2026-06-05T13:53:40+09:00`, about 11h32m after start and before the planned
12H plus post-run window. It never reached post-run Metric, guarded enrich,
report, or notification planner phases. Treat this as a partial detect-write
result and an invalid/incomplete 12H trial, not as proof of runner timeout
behavior. Do not run another long bounded Red until a Green/Yellow review
decides whether to retry, shorten the trial, or improve progress/elapsed-time
visibility.

Interruption review result, 2026-06-05: classify that trial as
`interrupted_detect_only_partial_success`, `not_completed`,
`not_failed_provider`, and `not_timeout_proven`. No stale bounded runner or
follow-up process remained. The next operating lane is not another long runner
and not direct Red execution; use a fresh Green targeted Metric cleanup
preflight for the imported Metric-zero cohort. Consider a later Yellow
graceful interrupt / final summary improvement if 12H interactive operation is
still desired.

Metric cleanup preflight result, 2026-06-05: the fresh Green preflight selected
ids `8259..8210` with both the 12h `sinceMinutes=720` window and the wider
168h `sinceMinutes=10080` window. The selected rows are all
`geckoterminal.new_pools`, pump-only, `mint_only`, and `metricsCount=0`; the
preview stayed dry-run/no-write/no-fetch with provider errors `0`. The next
Red, if approved, should use the 12h window safe alias:
`pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 720 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write`.

Metric cleanup Red result, 2026-06-05: the approved network-enabled /
out-of-sandbox safe Metric cleanup ran once and selected the preflighted ids
`8259..8210`. It wrote Metric ids `2517..2566`, returned `selected=50`,
`ok=50`, `written=50`, `error=0`, and `providerErrorCount=0`, and moved the
selected cohort from `metricsCount=0` to `metricsCount=1`. Counts moved only
in Metric (`1407 -> 1457`); Notification / Telegram, Token writes,
HolderSnapshot writes, retry, auto-send, scheduler/systemd, and rawJson dumps
stayed closed. Treat the next lane as Green post-run review plus guarded
enrich preflight, not direct continuation.

Guarded enrich preflight result, 2026-06-06: the post-Metric review confirmed
ids `8259..8210` are still `mint_only=50`, `metricsCount=1=50`, `C/0=50`,
non-hard-rejected, and have no reviewFlags, Notification rows, or
HolderSnapshot rows. Representative Metric ids `2517`, `2541`, and `2566`
all have source `geckoterminal.token_snapshot` and rawJson-free price / FDV /
reserve / top-pool presence. A Prisma simulation matching the
`--onlyMetricCovered` batch selector selected exactly ids `8259..8210` in the
720 minute window, with `skippedMetricUncoveredCount=40`; the wider 10080
minute window selected the same ids. If approved, the next Red should be:
`pnpm -s token:enrich-rescore:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 720 --interItemDelayMs 15000 --onlyMetricCovered --write`.

Guarded enrich Red result, 2026-06-06: that command ran exactly once and
completed without provider failure, 429, Notification, or Telegram side
effects, but it selected only ids `8259..8231` (`29` rows). The 720 minute
rolling cutoff had advanced by execution time, so ids `8230..8210` fell
outside the window and remained mint-only. The selected rows wrote
enrich/rescore/context updates for `29`, kept `metricsCount=1`, and moved to
`partial`; Metric, Notification, and HolderSnapshot counts stayed unchanged.
Cadence rule update: when an intended cohort is near the edge of a rolling
window, run the Red promptly after preflight or choose a wider window during a
fresh Green preflight. Do not run a second Red directly to compensate.

Fresh remaining-cohort preflight, 2026-06-06: the old `sinceMinutes=720`
guarded selector now selects `0` rows. A wider `sinceMinutes=10080` selector
with `limit=21` selects exactly the remaining Metric-covered mint-only ids
`8230..8210`; the same wider window with `limit=50` would include older rows
outside the intended remainder. When correcting rolling-window drift, set the
limit to the remaining intended cohort size and record the widened window in
the Green preflight before any Red.

Remaining-cohort Red result, 2026-06-06: the widened-window command with
`limit=21` and `--onlyMetricCovered` selected exactly ids `8230..8210` and
completed `ok=21`, `error=0`. It moved those rows to partial while keeping
Metric, Notification, HolderSnapshot, and Telegram unchanged. This confirms
the drift correction pattern: do not compensate with an immediate second Red;
use a fresh Green preflight, widen the window if needed, and narrow the limit
to the remaining cohort.

Remaining-cohort review result, 2026-06-06: the post-run Green review
confirmed the remaining fragment is closed. Target ids `8230..8210` are all
partial and Metric-covered; the notable scores are two `C/1` rows and one
`B/2` row, with only low-strength `meme` / `animal` scoreBreakdown tags.
Watchlist is `16` B/2 rows, `15` ready and `1` missing Metric, and
`notifyCandidate=0` remains expected. Cadence decision: keep B rows
report-only, keep scoring / notification policy unchanged, and use either a
fresh targeted cleanup preflight or a status/watchlist review as the next
Green step. Do not issue direct Red from the review.

Metric observation-depth preflight, 2026-06-06: growth analysis still has no
`2x+` FDV candidates, but the usable sample is only `87` Metric>=2 tokens.
The larger opportunity for growth detection is the Metric-one cohort: `1230`
tokens have exactly one Metric, all older than 60 minutes, while Metric-zero
first coverage remains `2748` rows. Use Metric-zero cleanup when the goal is
pipeline coverage. Use a Metric-one follow-up lane when the goal is growth
detection.

Current CLI safety note: `metric:snapshot:geckoterminal:safe
-- --onlyMetricPending` is a fetch-free dry-run selection preview for
Metric-zero rows. Omitting `--onlyMetricPending` uses the normal batch
processing path and can fetch provider snapshots even without `--write`, so it
is not a safe fetch-free preview for Metric-one resnapshot candidates. Before
running any Metric-one resnapshot Red, add a Yellow explicit selector / preview
mode such as `--onlyMetricOnce`, `--metricCountEq 1`, or equivalent stale
Metric-covered selector with tests and docs.

Metric-one preview mode result, 2026-06-06: `--onlyMetricOnce` is now the
explicit selector for Metric-one follow-up preflight. Use it when the operator
goal is growth detection and the desired action is moving rows from
`metricsCount=1` to `metricsCount>=2`. In dry-run without `--write`, it is
fetch-free and returns `selection_preview` rows only. It is batch-only,
mutually exclusive with `--onlyMetricPending`, and still respects
`--pumpOnly`, `--limit`, `--sinceMinutes`, and `--minGapMinutes`. The write
path remains a separate human-approved Red and should not be run without a
fresh Green `--onlyMetricOnce` preflight.

Metric-one resnapshot preflight refresh, 2026-06-08: the fresh Green preview is
clean for ids `8259..8210`. The `sinceMinutes=10080` window selected `50`
rows, all `metricsCount=1`, with latest Metric ids present,
`latestMetricAgeMinutes=4231..4243`, Notification count `0`, HolderSnapshot
count `0`, `providerErrorCount=0`, and no provider fetch or DB write. The
`sinceMinutes=1440` window is now empty, so use `sinceMinutes=10080` if the
operator approves a Red for growth sample depth:
`pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricOnce --noNotificationCapture --write`.
Expected effects are GeckoTerminal fetches and Metric writes up to `50` only.

Metric-one resnapshot Red, 2026-06-08: the exact command above ran once in a
network-enabled / out-of-sandbox context. It selected ids `8259..8210` and
wrote Metric ids `2567..2616` with `selected=50`, `ok=50`, `written=50`, and
`providerErrorCount=0`. DB counts moved `4065 / 1457 / 22 / 1` ->
`4065 / 1507 / 22 / 1`; Metric buckets moved `0=2748`, `1=1230`, `2+=87` ->
`0=2748`, `1=1180`, `2+=137`. Notification, Telegram, Token, and
HolderSnapshot side effects stayed `0`. Next step is a read-only post-run
Metric/growth review, not a second Red.

Metric-one resnapshot growth review, 2026-06-08: the follow-up Green review
found no meaningful growth in ids `8259..8210`. All 50 rows are
`metricsCount=2`, but target FDV and reserve buckets had `>=1.1x=0` and
`>=2x=0`; latest FDV was down for `11` rows and near flat for `39`. Global
Metric>=2 is now `137` total and `135` pumpOnly, with top FDV multiple
`1.3527x` and `2x/3x/5x/10x=0`. Keep scoring and notification policy
unchanged. Prefer another Green Metric-one preflight for more growth sample
depth, or a Yellow growth report CLI if repeatability is the bottleneck.

Next Metric-one resnapshot preflight, 2026-06-08: the next
`--onlyMetricOnce` preview is also clean. With `sinceMinutes=10080`, it
selected ids `7577..7528` (`50` rows), all `metricsCount=1`, with latest
Metric ids present and `latestMetricAgeMinutes=7372..7384`. The cohort does
not overlap the already-resnapshotted ids `8259..8210`; Notification and
HolderSnapshot totals are `0 / 0`; `providerErrorCount=0`; and the Green turn
did not fetch, write, send, or dump rawJson. The 1440 and 720 minute windows
are empty, so the next Red candidate, if separately approved, should use the
10080 minute window:
`pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricOnce --noNotificationCapture --write`.
Run it only in network-enabled / out-of-sandbox context and only once.

Metric-one resnapshot Red, 2026-06-08: that approved command ran exactly once
for ids `7577..7528` and completed cleanly with `selected=50`, `ok=50`,
`written=50`, `skipped=0`, `error=0`, and `providerErrorCount=0`. It wrote
Metric ids `2617..2666` and moved all selected rows from `metricsCount=1` to
`metricsCount=2`, increasing Metric>=2 from `137` to `187`. Notification
capture stayed disabled, Notification / Telegram / Token / HolderSnapshot
side effects stayed `0`, and no rawJson full dump occurred. The lightweight
selected-only growth check found one 2x+ row, so the cadence now returns to a
Green post-run Metric/growth review before any further Red.

Metric-one growth review, 2026-06-08: the Green review confirmed one
meaningful growth row in ids `7577..7528`. Token id `7577` moved
`3.8445x` by FDV and `3.7064x` by reserve over `7416` minutes, while the
rest of the cohort was mostly flat/down. The row is `C/1`, partial,
non-hard-rejected, with reviewFlags and scoreBreakdown present and no
Notification or HolderSnapshot rows. Treat it as a manual-review signal and
evidence that growth detection needs more reporting, not as a policy unlock:
do not change scoring or Notification / Telegram behavior from one isolated
C/1 winner.

## Operating Principles

- Use network-enabled / out-of-sandbox context for provider-fetch Red tasks.
- Use safe aliases for targeted GeckoTerminal Red commands.
- Use the repo-local Red execution safety Skill for human-approved Red work.
- Run one exact command per Red.
- Do not retry or run a second Red without separate approval.
- Keep Notification / Telegram execution locked unless a dedicated Green review
  and a separate human-approved Red target that path.
- Keep checkpoint files outside the repo, normally under `/tmp`.
- Do not dump rawJson, offensive raw text, normalizedText, secrets, provider
  bodies, or env values.
- Default mode is Green preflight before Red.
- Treat queue windows as rolling. A strict 6h window can drift clear while the
  default 24h and rolling 168h windows still have useful cleanup work.

## Suggested Cadence

### On Demand / Before Each Run

Run read-only checks before choosing a write task:

- repo status and recent HEAD
- MVP status
- default review queue
- rolling 168h review queue
- rolling 168h watchlist
- rolling 168h blockers
- disabled and enabled auto-send planners
- retry planner
- bounded operation planner

Do not continue to Red if any planner shows failed Notification, retry
candidate, allowed auto-send candidate, unclear selected rows, or unexpected
Notification / Telegram execution.

### 6H Bounded Runner

Use a 6H bounded runner only when fresh data collection is desired. It is not a
continuous daemon.

Recommended operating shape:

- run Green plan-only first
- use network-enabled / out-of-sandbox execution for Red
- use a checkpoint file under `/tmp`
- use explicit human approval
- run exactly one bounded runner command
- review post-run queue and planners before any more writes

The bounded runner is the broadest runtime validation path, so avoid running it
repeatedly when targeted cleanup or report review would answer the operating
question.

### Targeted Metric Cleanup

Use targeted Metric cleanup when:

- `metricPendingCount` is meaningful
- safe preview selects clean rows
- selected rows are `metricsCount=0`
- enrich candidates lack Metric coverage
- provider reachability is available in the intended Red context

Recommended shape:

- safe alias
- `--limit 50`
- network-enabled / out-of-sandbox
- `--onlyMetricPending`
- `--noNotificationCapture`
- `--interItemDelayMs 15000`

Metric cleanup improves Metric coverage. It does not by itself improve
watchlist quality until a follow-up enrich/rescore pass runs.

### Targeted Enrich Cleanup

Use targeted enrich cleanup when:

- `enrichPendingCount` is meaningful
- selected rows are `metadataStatus=mint_only`
- selected rows have `metricsCount>=1`
- selected Notification and HolderSnapshot counts are `0`
- existing reviewFlags are absent or the preflight explains why updating them
  is safe

Recommended shape:

- safe alias
- `--limit 50`
- `--sinceMinutes 10080` when shorter windows drift past the intended batch
- `--interItemDelayMs 15000`
- `--onlyMetricCovered`
- no `--notify`

Enrich cleanup improves reportability and watchlist evidence. It should not be
used to create Notification candidates unless a separate notification design
review changes policy.

### Watchlist Manual Review

Run watchlist manual review:

- after enrich cleanup
- after a bounded runner
- before scoring dictionary changes
- before notification policy changes
- when B/A report-only rows appear or change

Use `--watchlistOnly` and `--includeBlockers`. Keep output rawJson-free and do
not expose raw token name, raw symbol, normalizedText, or matched raw text if
there is offensive-text risk.

B/2 rows are useful manual evidence, but not notification-worthy by default.
Do not tune scoring or add capture-only B Notifications unless repeated,
high-confidence evidence appears across multiple Green reviews.

Status/watchlist point, 2026-06-06: the rolling 168h watchlist remains
`16` rows, all `B / 2`, `15` ready and `1` missing Metric. The watchlist score
evidence is still core-only and low-strength; 168h aggregate support is
`core=42`, `learned_pattern=1`, `trend=0`, `combo=0`, with no A/S row and
`notifyCandidateEligibleCount=0`. Treat this as a stable report-only status
point: keep scoring dictionaries unchanged, keep Telegram / Notification
policy S-only, and do not issue a Red from the watchlist review itself.

Lane decision, 2026-06-06: choose Yellow graceful interrupt / final summary
improvement before more data cleanup. The current queues and watchlist do not
force a Red, while the interrupted 12H runner showed a real operating gap:
`completed=false`, no useful final summary, post-run phases not reached, and
manual classification required. The next task should improve
`ops:run:bounded` interruption reporting and stop behavior; it should not
change scoring, Notification / Telegram policy, scheduler, or systemd.

Yellow result, 2026-06-06: `ops:run:bounded` now emits safe interrupted
summary state. Treat `status=interrupted` as neither a completed trial nor a
provider failure. Review the active phase, partial phase, completed/skipped
phases, elapsed time, checkpoint path, and safe checkpoint cursor summary. Do
not assume post-run Metric/enrich/report/planner phases ran after an
interrupt; the runner intentionally skips them. For interrupted detect-only
runs, use a fresh Green targeted Metric cleanup preflight before any cleanup
Red.

Interrupt behavior status review, 2026-06-06: the fixed 12H bounded runner
command remains plan-only clean without `--execute`: `status=planned`,
`readOnly=true`, `executeRequested=false`, `progressSummary=null`,
`blockedBy=[]`, `stopConditionCodes=[]`, and `checkpointExists=false`.
Plan-only review is not an interrupted run. The recommended lane after this
review is status point / pause unless the operator intentionally chooses a
fresh Green bounded runner preflight or targeted cleanup preflight. Long
bounded trials still require stable PC, WSL, terminal, and network conditions;
Notification / Telegram execution remains locked.

Status point / intent selection, 2026-06-06: choose pause/status when there
is no explicit operator intent. Current requested 12h queue is clear,
`notifyCandidate=0`, auto-send allowed is `0 / 0`, retry candidate is `0`,
failed Notification is `0`, and watchlist remains B/2 only. If the operator
chooses fresh data, start with a Green bounded runner preflight. If the
operator chooses backlog cleanup, start with a Green targeted cleanup
preflight. If the operator chooses watchlist or notification review, keep it
read-only first. Do not issue a direct Red from a status point.

### Notification Safety Review

Run notification safety review when:

- `notifyCandidateCount` changes
- disabled or enabled auto-send planner reports an allowed candidate
- retry planner reports a candidate
- a future task proposes send, retry, capture-only B Notifications, or
  Telegram policy changes

Notification review is not the same as send approval. Telegram remains locked
by default.

## Decision Tree

1. Need fresh tokens?
   - Run bounded runner Green preflight.
2. Have `metricPendingCount > 0` and enrich candidates lack Metrics?
   - Run targeted Metric cleanup preflight.
3. Have `enrichPendingCount > 0` with `metricsCount>=1` candidates?
   - Run targeted enrich cleanup preflight.
4. Have B/A watchlist rows?
   - Run watchlist manual review.
5. Have `notifyCandidateCount > 0`, failed Notification, retry candidate, or
   allowed auto-send candidate?
   - Run notification safety review, not auto-send.
6. No clear runtime action?
   - Update docs/status, review cadence, or pause.

## Stop Conditions

Global stops for Red selection:

- working tree dirty
- HEAD unexpected
- failed Notification > `0`
- retry candidate > `0`
- auto-send allowed > `0`, unless the task is specifically notification review
- provider DNS/reachability unavailable for provider-fetch Red
- checkpoint path unsafe or already exists
- selected rows unclear or not matching the intended preflight
- Notification / Telegram execution appears unexpectedly
- Token / Metric / HolderSnapshot side effect is likely outside the task scope
- rawJson, provider body, offensive raw text, normalizedText, secrets, or env
  values would need to be dumped
- exact command cannot be fixed

## Recommended Command Shapes

These are command shapes, not live execution instructions. Red commands still
require human approval and a fresh preflight.

### Queue Checks

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20
pnpm -s review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20 --watchlistOnly
pnpm -s review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20 --includeBlockers
pnpm -s notification:auto-send:plan
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:plan
pnpm -s notification:retry:plan
pnpm -s ops:plan:bounded -- --hours 6 --pumpOnly --postRunPlan
```

### Bounded Runner Preflight

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-phase2-6h.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000
```

### Bounded Runner Red

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-phase2-6h.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

Before using this shape, choose a unique checkpoint path, confirm it is outside
the repo, and confirm it does not exist.

### Metric Cleanup Red

```bash
pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

### Enrich Cleanup Red

```bash
pnpm -s token:enrich-rescore:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --interItemDelayMs 15000 --onlyMetricCovered --write
```

## Phase 2 Priorities

1. Keep manual bounded runs stable.
2. Clean up Metric and enrich backlog in small batches.
3. Review B watchlist rows manually.
4. Collect evidence before scoring changes.
5. Keep Telegram/send locked.
6. Consider cadence automation only after repeated manual runs are boring and
   planner-safe.

## Out Of Scope For Now

- scheduler/systemd
- Telegram auto-send
- retry execution
- capture-only B Notifications
- broad scoring dictionary changes without evidence
- Pro API integration
- auto trading/sniping
- generic queue/worker orchestration

## Current Known State Snapshot

Snapshot after the 2026-06-05 interrupted 12H bounded runner trial:

- HEAD before Red: `03f2da8 docs: preflight twelve hour bounded runner trial`
- working tree before Red: clean
- Token / Metric / Notification / HolderSnapshot:
  `4065 / 1407 / 22 / 1`
- metadata status: `mint_only=3083`, `partial=969`, `enriched=13`
- Metric buckets: `0=2798`, `1=1180`, `2+=87`
- default/requested 12h queue: `metricPending=682`, `enrichPending=682`,
  `staleReview=329`, `notifyCandidate=0`
- rolling 168h queue: `metricPending=842`, `enrichPending=902`,
  `staleReview=599`, `notifyCandidate=0`
- rolling 168h watchlist: `15` rows, all `B / 2`, `14` ready and `1`
  missing Metric, report-only
- disabled/enabled auto-send allowed: `0 / 0`
- retry candidate: `0`
- failed Notification: `0`
- latest targeted Metric cleanup: selected ids `7427..7378`, Metric ids
  `2467..2516`, `selected=50`, `ok=50`, `written=50`, `error=0`,
  `providerErrorCount=0`, and all selected rows moved to `metricsCount=1`
- latest targeted enrich cleanup: selected ids `7427..7378`,
  `selected=50`, `ok=50`, `error=0`, `enrichWriteCount=50`,
  `rescoreWriteCount=50`, `contextWriteCount=50`,
  `metaplexAttemptedCount=50`, `metaplexAvailableCount=2`,
  `notifyWouldSendCount=0`, `notifySentCount=0`, and
  `interItemDelayCount=49`
- selected rows moved `mint_only -> partial`; all have reviewFlags,
  scoreBreakdown, GeckoTerminal context, and one latest Metric; score
  distribution is `C / 0 = 48`, `C / 1 = 2`, with `hardRejected=0`
- latest post-run review: ids `7427..7378` are reportable and safe, but the
  two `C / 1` rows only add low-strength `core` / `meme` evidence; no target
  row entered the B watchlist and `notifyCandidate=0` remains expected
- latest selector-drift event: a later approved targeted enrich cleanup was
  intended for ids `7018..6969`, but the exact safe alias command selected
  ids `7377..7328` at execution time. Those actual rows moved to `partial=50`
  but still have `metricsCount=0=50`; the intended ids `7018..6969` remain
  `mint_only=50`, `metricsCount=1=50`, and without reviewFlags.
- current queue after that drift event: default 24h `metricPending=0`,
  `enrichPending=0`, `notifyCandidate=0`; rolling 168h
  `metricPending=160`, `enrichPending=270`, `notifyCandidate=0`; watchlist
  `14` B/2 rows, `13` ready and `1` missing Metric.
- selector-drift review result: the unguarded enrich CLI does not require
  Metric coverage in batch mode. It selects rows missing `name` or `symbol`,
  sorts by `firstSeenSourceSnapshot.detectedAt` or `Token.createdAt` newest
  first, and only then applies `--pumpOnly` / `--limit`.
- selector guard result: `token:enrich-rescore:geckoterminal` now supports a
  batch-only `--onlyMetricCovered` flag. Use it for Phase 2 targeted enrich
  cleanup and bounded post-run enrich command shapes. It preserves default
  unguarded selection when omitted, rejects exact `--mint` mode, and requires
  at least one Metric row when present.
- next cadence step: do a Green guarded targeted enrich preflight before any
  further enrich Red. Do not treat DB-only simulation as sufficient unless it
  mirrors the exact guarded selector semantics.
- guarded preflight result: the implemented selector selected ids
  `7018..6969`, all `mint_only`, all `metricsCount=1`, score `C / 0`, no
  hard rejects, no reviewFlags, selected Notification / HolderSnapshot totals
  `0`, and `skippedMetricUncoveredCount=110`. The next cleanup Red can be the
  guarded enrich command shape above, with network-enabled / out-of-sandbox
  execution and human approval.
- guarded cleanup result: the approved Red used the guarded command shape and
  selected the intended ids `7018..6969`; `selection.onlyMetricCovered=true`
  and `skippedMetricUncoveredCount=110` confirmed the Metric-covered guard was
  active. It completed `selected=50`, `ok=50`, `error=0`,
  `enrichWriteCount=50`, `rescoreWriteCount=50`, `contextWriteCount=50`,
  `metaplexAttemptedCount=50`, `metaplexAvailableCount=0`,
  `notifyWouldSendCount=0`, and `notifySentCount=0`. Counts stayed
  `3383 / 1407 / 22 / 1`; metadata moved to `mint_only=2401`,
  `partial=969`, `enriched=13`; Metric buckets stayed `0=2116`, `1=1180`,
  `2+=87`.
- selected rows moved `mint_only -> partial`, retained `metricsCount=1`, and
  now have reviewFlags, scoreBreakdown, GeckoTerminal context, and one latest
  Metric. Score distribution is `C / 0 = 46`, `C / 1 = 3`, `B / 2 = 1`,
  `hardRejected=0`. Notification / Telegram, Metric writes, HolderSnapshot
  writes, retry, auto-send, scheduler/systemd, and rawJson dumps stayed `0`.
- next cadence step: Green post-run guarded enrich/report review and lane
  decision before another Red.
- post-run guarded review result: the guarded batch matched preflight exactly,
  with selected ids `7018..6969`, `selection.onlyMetricCovered=true`,
  `metricsCount=1=50`, and `skippedMetricUncoveredCount=110`. This confirms
  the selector-drift fix is usable for Metric-first targeted enrich cleanup.
  The target score distribution is `C / 0 = 46`, `C / 1 = 3`, `B / 2 = 1`,
  `hardRejected=0`; rolling 168h watchlist is `15` B/2 rows, `14` ready and
  `1` missing Metric. Keep B rows report-only and keep notification/Telegram
  S-only. If cleanup continues, use another fresh Green guarded preflight;
  current guarded simulation selects ids `6968..6919` as the next
  Metric-covered cleanup batch.
- watchlist/status review result: rolling 168h now has `15` B/2 watchlist
  rows, `14` ready and `1` missing Metric. This is useful as a report-only
  manual review surface, but not enough for scoring or notification changes:
  no row is A/S, scoreTotal remains `2`, evidence is mostly single core hits,
  and notify eligibility remains `0`. Keep B rows report-only and use a
  status/cadence review as the next non-Red step unless the operator
  explicitly wants another cleanup preflight.
- status/cadence review result: the cadence is working. Default 24h and
  requested 6h windows are clear, rolling 168h backlog remains as optional
  cleanup inventory (`metricPending=160`, `enrichPending=220`,
  `staleReview=270`), and notification planners remain locked
  (`failed=0`, `retry=0`, auto-send allowed `0 / 0`). No immediate Red is
  needed. Continue with fresh Green preflight before any targeted cleanup Red,
  and otherwise use this as a safe pause/status point.
- periodic status review result: the same pause decision remains valid.
  Current DB counts are `3383 / 1407 / 22 / 1`; metadata is
  `mint_only=2401`, `partial=969`, `enriched=13`; Metric buckets are
  `0=2116`, `1=1180`, `2+=87`. Default 24h queue is clear
  (`metricPending=0`, `enrichPending=0`, `staleReview=0`,
  `notifyCandidate=0`), rolling 168h remains optional cleanup inventory
  (`metricPending=160`, `enrichPending=220`, `staleReview=270`,
  `notifyCandidate=0`), and watchlist remains `15` B/2 rows, `14` ready and
  `1` missing Metric. Failed Notification, retry candidate, and auto-send
  allowed candidates remain `0`, so no immediate Red is needed.
- operating-start review result: no new action is required today. The default
  24h and requested 6h queues are clear, rolling 168h remains optional cleanup
  inventory, watchlist is unchanged at `15` B/2 rows, and notification
  planners are closed (`failed=0`, `retry=0`, auto-send allowed `0 / 0`).
  If the operator wants cleanup or fresh data, start with a fresh Green
  targeted cleanup preflight or bounded runner preflight. Do not jump directly
  to Red from this status point.
- 12H bounded runner trial preflight result: the fixed plan-only command is
  valid for an endurance trial. It plans `maxIterations=720`,
  `computedSinceMinutes=780`, two Metric cycles, two guarded enrich cycles,
  report review, and notification planner review, with `blockedBy=[]` and
  `stopConditionCodes=[]`. The checkpoint path is
  `/tmp/lowcap-bot-12h-trial-20260605.json`; it is outside the repo and does
  not exist. Run the Red only from network-enabled / out-of-sandbox context,
  after confirming the machine, WSL, terminal, and network can stay up for
  about 12.5-13h.

## Latest Targeted Cleanup Preflight

Snapshot from the 2026-06-04 targeted cleanup Green preflight:

- HEAD: `0303a5e docs: add phase two operating cadence`
- working tree: clean
- Token / Metric / Notification / HolderSnapshot:
  `3383 / 1357 / 22 / 1`
- metadataStatus: `mint_only=2551`, `partial=819`, `enriched=13`
- Metric buckets: `0=2166`, `1=1130`, `2+=87`
- default 24h queue: `metricPending=210`, `enrichPending=210`,
  `notifyCandidate=0`
- rolling 168h queue: `metricPending=210`, `enrichPending=370`,
  `notifyCandidate=0`
- rolling 168h watchlist: `13` rows, all `B / 2`, all ready, report-only
- disabled/enabled auto-send allowed: `0 / 0`
- retry candidate: `0`
- failed Notification: `0`
- Metric preview, `sinceMinutes=420`: `selectedCount=0`
- Metric preview, `sinceMinutes=10080`: `selectedCount=50`, ids
  `7427..7378`, all `metadataStatus=mint_only`, `metricsCount=0`,
  `notificationCount=0`, `holderSnapshotCount=0`, `dryRun=true`,
  `writeEnabled=false`, `providerErrorCount=0`
- DB-only enrich simulation, `sinceMinutes=420`: `selectedCount=0`
- DB-only enrich simulation, `sinceMinutes=10080`: `selectedCount=50`, same
  ids `7427..7378`, all `mint_only`, `metricsCount=0`, score `C / 0`,
  `hardRejected=false`, reviewFlags absent

Decision: targeted Metric cleanup is the next lane. Enrich cleanup should wait
because the current enrich selection would hit Metric-zero rows first.

## Next Recommended Task

The next task should be Green post-run enrich/report review for ids
`7427..7378`.

That review is now complete. The selected rows are reportable, the two
`C / 1` rows do not add enough evidence for scoring or notification changes,
and watchlist remains B/2 report-only.

If more cleanup is desired, run a fresh human-approved targeted enrich cleanup
Red for the next clean Metric-covered rows. Do not run notification rehearsal,
scoring dictionary edits, another Red, or scheduler/systemd work from the
current B/2/C evidence without a fresh Green review and separate approval.
