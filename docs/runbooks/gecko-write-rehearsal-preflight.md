# Gecko Write Rehearsal Preflight

Date: 2026-05-18

This is a read-only / docs-only preflight for the next GeckoTerminal
new-pools write rehearsal. It does not approve or execute the Red write run.

## Starting Point

The timeout-free dry-run completed with:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 360 --intervalSeconds 60
```

Observed result:

- `status=ok`
- `stopReason=completed`
- `cycleCount=360`
- `completedIterations=360`
- `failedCount=0`
- `rateLimitRetryCount=0`
- `importedCount=0`
- `existingCount=0`
- `dryRun=true`
- `writeEnabled=false`
- `checkpointEnabled=false`
- elapsed: `32632518ms`
- counts before / after: Token / Metric / Notification / HolderSnapshot =
  `1296 / 198 / 8 / 1`

No DB write, Telegram send, Notification create/update, Metric create,
checkpoint update, or repo-local data diff was observed.

## Timing Interpretation

The run summary's `elapsedMs` is computed from `Date.now()` at watch start and
finish. It is wall-clock elapsed time for the full watch process, including:

- per-cycle external fetch and parse time;
- candidate selection / dry-run evaluation;
- logging and summary collection;
- the sleep after each completed cycle except the final one;
- any retry / cooldown sleep if present.

The current watch loop sleeps after a cycle finishes:

```text
next cycle starts after current cycle work completes + intervalSeconds sleep
```

Therefore `--intervalSeconds 60` is not a strict cycle-start cadence. It means
"sleep at least 60 seconds after the previous cycle's work completes." A
360-cycle run is a 360-fetch stability run, not a guaranteed 6h wall-clock run.

For the completed dry-run:

- elapsed seconds: `32632.518`
- elapsed hours: about `9.06`
- average seconds per cycle: about `90.65`

Using that observed average, a wall-clock 6h run is approximately:

```text
21600 / 90.65 = 238.3 cycles
```

Use `--maxIterations 240` as the wall-clock 6h approximation for the next write
rehearsal. This is still an estimate; live fetch latency can change.

## Write Rehearsal Options

### A. Keep 360 cycles

This preserves the dry-run stability shape but likely runs about 9h and has a
Token write upper bound of 360. It is not the preferred next Red step.

### B. Wall-clock 6h approximation

Use approximately 240 cycles based on the observed average seconds per cycle.
This keeps the next Red task aligned with the intended 6h wall-clock target
while still exercising a long bounded write run.

This is the recommended next Red candidate.

### C. Shorter write rehearsal

Use 60 to 120 cycles if the operator wants another smaller DB-write expansion
before a 6h-equivalent run. This is safer but does not validate the 6h write
rehearsal goal.

## DB Write Boundary

For `detect:geckoterminal:new-pools --watch --write --pumpOnly --limit 1`:

- accepted candidates are passed to `importMint`;
- new mints can create mint-only `Token` rows;
- existing mints return existing Token results;
- Metric rows are not created by this command;
- Notification rows are not created or updated by this command;
- HolderSnapshot rows are not created or updated by this command;
- Telegram live send is not part of this command;
- enrich / rescore is not part of this command.

For the recommended `--maxIterations 240` candidate, the Token write upper bound
is 240 new Token rows. Metric / Notification / HolderSnapshot write upper bound
is 0.

## Checkpoint Boundary

Write rehearsal should use a `/tmp` checkpoint file only:

```text
/tmp/lowcap-bot-gecko-write-rehearsal-6h.json
```

Do not use or update repo-local `data/checkpoints`. Do not promote the default
checkpoint. If the `/tmp` checkpoint already exists before the Red run, the
operator must decide whether to keep it as resume state or remove / replace it
before starting; do not silently reuse stale checkpoint state.

DB writes still target the active `DATABASE_URL`; the checkpoint file controls
only checkpoint state.

## Proposed Red Command

Candidate command for a separately approved Red execution:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 240 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal-6h.json
```

Expected side-effect upper bound:

- Token: up to +240
- Metric: +0
- Notification: +0
- HolderSnapshot: +0
- Telegram: no send
- repo-local checkpoints: no diff
- `data/trend.json`: no diff

## Stop Conditions

Stop before Red execution if any of these are true:

- working tree is not clean;
- HEAD / origin state is unexpected;
- `data/trend.json` or repo-local `data/checkpoints` has a diff;
- the command would include `--live`;
- `--write` is missing from a write rehearsal command or appears in an
  unapproved command;
- checkpoint file is not under `/tmp`;
- existing `/tmp` checkpoint state is not understood;
- command could create Metric / Notification / HolderSnapshot rows;
- Telegram send could occur;
- external fetch or DB write scope would exceed the approved one command;
- secrets, `.env`, Telegram token / chat id, or database URL could be printed;
- the command cannot be expressed as one exact command.

## Not Executed In This Preflight

- write rehearsal;
- detect watch;
- external fetch;
- production DB write;
- Telegram live send;
- notification send / retry;
- scheduler / systemd;
- metric snapshot;
- import / enrich / rescore;
- schema / migration / app code change.
