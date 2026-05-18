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

## Interval And Stop Semantics

- `--intervalSeconds` is parsed as a positive integer number of seconds.
- `--intervalSeconds` and `--maxIterations` are valid only with `--watch`.
- Watch mode sleeps between recorded cycles for
  `intervalSeconds * 1000`, plus the existing failure cooldown when a
  cooldown-worthy failed cycle occurs.
- `completedIterations` is the number of cycle results recorded in the final
  summary. It should match `cycleCount` for the current runner.
- A cycle that receives SIGINT / SIGTERM during an in-flight fetch may finish
  the fetch before the loop observes the interrupted flag. The runner then
  stops before starting another cycle.
- A SIGINT / SIGTERM received during interval sleep interrupts the sleep and
  stops the loop without starting the next cycle.
- Manual interrupt is separate from cycle failure; it must not increment
  `failedCount`.

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
data diff was observed. At that point the 6h dry-run was still incomplete and
should not have been treated as a stability proof.

Follow-up: before another live long-run attempt, prefer a Yellow check or small
wrapper adjustment for process-tree timeout behavior so operator SIGINT does
not depend on manual process-group cleanup.

The `completedIterations=5` result is consistent with `--intervalSeconds 300`
because the timeout wrapper did not stop the `pnpm` / `tsx` process tree at
90s. The process continued for roughly four interval sleeps before manual
SIGINT was delivered.

## Process Signal Policy

- Do not rely on `timeout --foreground ... pnpm -s ...` as the operating stop
  mechanism for long GeckoTerminal watch runs.
- Bounded dry-runs should rely on `--maxIterations` and `--intervalSeconds` for
  natural completion.
- Manual stop should be by an attached-terminal Ctrl+C or by sending SIGINT /
  SIGTERM to the actual watch process group.
- A future systemd unit must have its own stop policy before approval. At
  minimum, review `KillMode`, `TimeoutStopSec`, and whether the unit starts the
  actual node / tsx process directly enough for SIGINT / SIGTERM to reach it.
- Do not promote scheduler / systemd / always-on operation until process-tree
  stop behavior has been explicitly checked in that runtime.

## Historical Short Confirmation Candidate

Before the 2026-05-18 timeout-free 6h confirmation, the interrupt summary was
confirmed but the timeout wrapper did not stop the child process tree at the
expected boundary in the 2026-05-17 live check.

Candidate shape for a future explicitly approved follow-up, not approved by
this document:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 3 --intervalSeconds 60
```

For file-backed local verification, use `--file <fixture>` and omit `--write`.

## 6h Dry-Run Command Policy

If approved later, the 6h dry-run should not use the `timeout + pnpm + tsx`
wrapper pattern. Prefer the bounded runner itself:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 360 --intervalSeconds 60
```

This remains a Red command because it performs live external fetches for the
run duration. It must omit `--write`, `--live`, notification send / retry,
metric snapshot, import, enrich, rescore, scheduler, and systemd.

## 6h Dry-Run Confirmation

On 2026-05-18, the timeout-free 6h dry-run was rerun and completed using the
runner's own bounded loop:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 360 --intervalSeconds 60
```

The command exited with code `0` and reported:

- `status=ok`
- `stopReason=completed`
- `interrupted=false`
- `completedIterations=360`
- `cycleCount=360`
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
data diff was observed.

The prior manually stopped 6h attempt remains correctly classified as
interrupted history, but the 2026-05-18 timeout-free run is now the completed
6h dry-run stability confirmation for the dry-run command shape. This does not
promote write rehearsal, default checkpoint operation, scheduler / systemd, or
automatic live notification delivery.

## Still Not Executed Or Not Promoted

- production DB write
- Telegram live send
- notification send / retry
- scheduler / systemd
- metric snapshot
- import / enrich / rescore
- schema / migration
- write rehearsal
- default checkpoint operation
- automatic live notification delivery
