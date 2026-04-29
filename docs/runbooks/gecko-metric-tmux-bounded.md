# Gecko Metric Tmux Bounded Runbook

## Purpose

Use this runbook when user `systemd` is unavailable but the metric snapshot lane
still needs a bounded short operation path. This is not always-on operation and
not an unbounded watch. It is a tmux-based bounded confirmation / short run for
`metric:snapshot:geckoterminal`.

## Preconditions

- `git status --short --branch` is clean.
- `git log --oneline -8` shows the expected HEAD.
- User systemd is blocked or intentionally skipped.
- The metric snapshot bounded watch path has already been confirmed.
- Telegram notification is not part of this lane; do not add `--opsNotify` or
  `--notify`.

## Start Command

Confirmed bounded tmux command:

```bash
tmux new-session -d -s lowcap-gecko-metric-bounded "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60 > /tmp/lowcap-gecko-metric-bounded.log 2>&1'"
```

This uses:

- session: `lowcap-gecko-metric-bounded`
- log file: `/tmp/lowcap-gecko-metric-bounded.log`
- `--pumpOnly`
- `--limit 2`
- `--write`
- `--watch`
- `--maxIterations 2`
- `--minGapMinutes 10`
- `--intervalSeconds 60`

## Check Commands

Session check:

```bash
tmux has-session -t lowcap-gecko-metric-bounded
```

Bounded log check:

```bash
tail -n 120 /tmp/lowcap-gecko-metric-bounded.log
```

Use the log internally for numeric summaries only. Do not paste rawJson,
secrets, or huge log output into operator reports.

## Stop Command

Use only when a stop condition is hit or the bounded process does not exit:

```bash
tmux kill-session -t lowcap-gecko-metric-bounded
```

The normal expected result is natural exit after `--maxIterations 2`.

## Log Fields

Summarize these fields:

- `status`
- `mode` / `watchEnabled`
- `maxIterations`
- `cycleCount`
- `selectedCount`
- `okCount`
- `writtenCount`
- `skippedCount`
- `failedCount`
- `rateLimited`
- `abortedDueToRateLimit`
- `skippedAfterRateLimit`
- `skipped_recent_metric`
- appended Metric id / `observedAt` / source

## Stop Conditions

Stop before continuing if any of these happen:

- `selectedCount` is higher than expected.
- `writtenCount` exceeds the bounded maximum.
- `failedCount > 0`.
- `rateLimited` or `abortedDueToRateLimit` is true.
- There is any risk of showing rawJson, `.env`, tokens, chat ids, or other
  secrets.
- The run needs `--maxIterations` to be removed.
- The run needs systemd.
- The command differs from the approved exact command.

## Side-Effect Bound

The command is bounded by `--limit 2 * --maxIterations 2`, so it can append at
most four Metric rows. `--minGapMinutes 10` skips tokens with a recent Metric for
the same source before fetch. It should not update Token fields and should not
send Telegram notifications.

The confirmed tmux run started successfully, naturally exited, ran
`maxIterations=2`, appended Metric `id=1121` in cycle 1, skipped cycle 2 as
`skipped_recent_metric`, did not update Token fields, did not send Telegram, and
did not touch systemd.

## Systemd Relationship

Systemd first-run is blocked in the current Codex environment because the user
systemd bus is unavailable. Phase A installed the bounded first-run unit and the
installed file matched the repo sample, but `systemctl --user daemon-reload`
failed before start. Continue systemd only in a session where PID 1 is systemd,
`XDG_RUNTIME_DIR/bus` exists, and `systemctl --user` is not offline.

Tmux bounded operation is the current practical alternative. It is not a
replacement for `Restart=always` always-on operation.

## Still Unconfirmed

- tmux long-running operation
- `--maxIterations`-less watch
- systemd first-run start
- systemd enable
- detect watch write
- `token_completed` production live send
- `loop_complete` production live send
