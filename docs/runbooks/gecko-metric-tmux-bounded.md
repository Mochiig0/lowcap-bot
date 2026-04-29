# Gecko Metric Tmux Bounded Runbook

## Purpose

Use this runbook when user `systemd` is unavailable but the metric snapshot lane
still needs a bounded short operation path. This is not always-on operation and
not an unbounded watch. It is a tmux-based bounded confirmation / short run for
`metric:snapshot:geckoterminal`.

At the current checkpoint, this is the practical interim operation entrypoint
for the metric snapshot lane in this environment. It is suitable for bounded
confirmation and short operation, while `systemd`, unbounded watch, and
restart-oriented operation remain separate later gates.

For the full cross-lane bounded operation MVP, including detect watch write,
enrich/rescore, Metric append, rawJson-free reporting, Red / Green boundaries,
and stop conditions, see `docs/runbooks/gecko-bounded-operation-mvp.md`.

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

A later rerun of the same bounded tmux command also started with no existing
session and naturally exited after `maxIterations=2` when there were no selected
candidates. It reported `cycleCount=2`, `selectedCount=0`, `writtenCount=0`,
`failedCount=0`, `rateLimited=false`, and `abortedDueToRateLimit=false`. No
Metric was appended, `metricsCount` stayed 5, latestMetric stayed `id=1121`, and
the stop command was not needed. This was a bounded-operation reproducibility
check, not a Metric append confirmation.

## Post-Run Read-Only Checks

After the bounded tmux run finishes, use read-only CLIs to confirm the latest
Metric and history. For the confirmed mint
`4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump`, the post-run state was
`metricsCount=5` with latestMetric `id=1121`,
`observedAt=2026-04-29T12:26:25.717Z`, and source
`geckoterminal.token_snapshot`.

Preferred rawJson-free checks:

```bash
pnpm -s metrics:report -- --mint <MINT> --limit 5
pnpm -s token:show -- --mint <MINT>
pnpm -s tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 5 --latestMetricSource geckoterminal.token_snapshot --limit 10
```

Expected confirmations:

- `metrics:report -- --mint <MINT> --limit 5` shows the Metric id order
  `1121 -> 1120 -> 1119 -> 1118 -> 1117`.
- `metrics:report` shows rawJson-free market-data presence columns:
  `priceUsdPresent`, `fdvUsdPresent`, `reserveUsdPresent`, and
  `topPoolPresent`; all five confirmed rows were `true`.
- `token:show` shows `metricsCount=5` and latestMetric `id=1121`.
- `tokens:compare-report` includes the target mint in the Gecko-origin cohort
  and shows `metricsCount=5`, latestMetric source / observedAt, and
  latestMetric safe summary booleans:
  `latestMetricPriceUsdPresent`, `latestMetricFdvUsdPresent`,
  `latestMetricReserveUsdPresent`, and `latestMetricTopPoolPresent`.

`token:compare -- --mint <MINT>` can also show latestMetric and
`recentMetrics`. Its Metric views are rawJson-free and include `safeSummary`
booleans for price / fdv / reserve / topPool presence, so it can be used for
single-token history summaries without pasting rawJson. Keep operator reports
to ids, timestamps, counts, and safeSummary booleans rather than raw stdout
blocks.

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
