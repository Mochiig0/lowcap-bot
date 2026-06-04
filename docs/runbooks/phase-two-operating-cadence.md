# Phase 2 Operating Cadence

## Status

- Personal MVP is complete enough for manual bounded-run use.
- Phase 2 focus is operational cleanup and quality improvement.
- This is not production-ready, not fully automated, and not a scheduler or
  systemd operating model.
- Telegram auto-send, retry execution, scheduler/systemd, and capture-only B
  Notifications remain locked.

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
pnpm -s token:enrich-rescore:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --interItemDelayMs 15000 --write
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

Snapshot after the 2026-06-04 targeted enrich cleanup continuation:

- HEAD before Red: `9467a6b docs: preflight phase two enrich cleanup`
- working tree before Red: clean
- Token / Metric / Notification / HolderSnapshot:
  `3383 / 1407 / 22 / 1`
- metadata status: `mint_only=2501`, `partial=869`, `enriched=13`
- Metric buckets: `0=2116`, `1=1180`, `2+=87`
- default 24h queue: `metricPending=0`, `enrichPending=0`,
  `notifyCandidate=0` after time-window drift
- rolling 168h queue: `metricPending=160`, `enrichPending=320`,
  `notifyCandidate=0`
- rolling 168h watchlist: `13` rows, all `B / 2`, all ready, report-only
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
- next cadence step: targeted enrich cleanup is the preferred Red lane if more
  data progress is wanted, because clean Metric-covered `mint_only` candidates
  remain available; status/docs review is acceptable if no immediate cleanup
  is needed

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
