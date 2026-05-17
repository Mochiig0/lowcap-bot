# Gecko Watch Interrupt Handling

Date: 2026-05-17

This is the operator policy for manually stopped GeckoTerminal new-pools watch
runs. It replaces prior wording that incorrectly described the 6h dry-run stop
reason. The 6h dry-run was manually stopped by the user and did not complete.

## Current Implementation

`detect:geckoterminal:new-pools --watch` now installs SIGINT / SIGTERM handlers
for the watch loop. On interrupt, it exits gracefully after the current cycle or
interrupt-aware sleep and prints the normal JSON summary with additive stop
fields:

- `status=interrupted`
- `stopReason=user_interrupted`
- `interrupted=true`
- `interruptedBySignal=SIGINT|SIGTERM`
- `interruptedAt`
- `startedAt`
- `finishedAt`
- `elapsedMs`
- `completedIterations`
- existing `cycleCount`
- existing `maxIterations`
- existing `failedCount`
- existing `rateLimitRetryCount`
- existing `importedCount` / `existingCount`
- existing `dryRun`, `writeEnabled`, and `checkpointEnabled`

Normal completion remains `status=ok` and `stopReason=completed`.

## Safety Boundary

- Manual interrupt is not counted as a failed cycle.
- Dry-run still has `writeEnabled=false`, so it does not write DB state.
- Telegram send is not part of this command.
- Checkpoint updates remain governed by the existing rule: checkpointing is
  active only with `--watch --write`.
- No raw provider response body, secrets, `.env`, Telegram token, chat id, or
  database URL should be printed by the interrupt summary.

## Short Live Confirmation

On 2026-05-17, a short Red live dry-run confirmation was attempted with:

```bash
timeout --foreground -s INT --preserve-status 90s pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 10 --intervalSeconds 300
```

The watch command stayed in dry-run mode (`writeEnabled=false`) and did not use
`--write`, `--live`, notification send, retry, scheduler, systemd, metric
snapshot, import, enrich, or rescore commands. The operator sent SIGINT to the
watch process group after the timeout wrapper did not stop the `pnpm` / `tsx`
process tree at the expected 90s boundary.

The final summary confirmed graceful interrupt handling:

- `status=interrupted`
- `stopReason=user_interrupted`
- `interruptedBySignal=SIGINT`
- `interruptedAt=2026-05-17T10:50:15.417Z`
- `completedIterations=5`
- `cycleCount=5`
- `failedCount=0`
- `rateLimitRetryCount=0`
- `importedCount=0`
- `existingCount=0`
- `dryRun=true`
- `writeEnabled=false`
- `checkpointEnabled=false`

Before / after counts stayed `Token=1296`, `Metric=198`,
`Notification=8`, and `HolderSnapshot=1`. No DB write, Telegram send,
Notification create/update, Metric create, checkpoint update, or repo-local
data diff was observed. The 6h dry-run remains incomplete and should not be
treated as a stability proof.

Follow-up: before another live long-run attempt, prefer a Yellow check or small
wrapper adjustment for process-tree timeout behavior so operator SIGINT does
not depend on manual process-group cleanup.

## Next Short Confirmation Candidate

Do not rerun the 6h dry-run yet. The interrupt summary is confirmed, but the
timeout wrapper did not stop the child process tree at the expected boundary in
the 2026-05-17 live check.

Candidate shape for a future explicitly approved follow-up, not approved by
this document:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 3 --intervalSeconds 60
```

For file-backed local verification, use `--file <fixture>` and omit `--write`.

## Not Executed

- 6h dry-run
- detect watch
- external fetch
- production DB write
- Telegram live send
- notification send / retry
- scheduler / systemd
- metric snapshot
- import / enrich / rescore
- schema / migration
