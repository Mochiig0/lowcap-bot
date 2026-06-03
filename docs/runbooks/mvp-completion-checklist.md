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
