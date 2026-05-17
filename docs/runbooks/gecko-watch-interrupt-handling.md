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

## Next Short Confirmation Candidate

Do not rerun the 6h dry-run yet. If operator confirmation is needed, use a
separate short Red task with a file-backed or explicitly approved short live
watch command, send SIGINT after one cycle, and confirm the interrupted summary
without DB write, Telegram send, or checkpoint update.

Candidate shape, not approved by this document:

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
