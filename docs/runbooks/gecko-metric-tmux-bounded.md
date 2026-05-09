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

If a tmux single-run is interrupted after the write path may have run, do not
rerun the Red command first. Confirm DB state with read-only Metric / Token
reports, treat the tmux log as auxiliary evidence, and return to human gate on
any mismatch. This keeps DB state as the authoritative Metric-stage source and
does not make tmux logs, systemd, or unbounded watch authoritative.
Before any rerun, also check for strict Metric duplicate risk: same `tokenId`,
same source, and same `observedAt`. If that cannot be ruled out from read-only
DB reports, stop and return to human gate; tmux does not make retry automatic.
An unknown tmux exit, missing log, or unclear network/write outcome is an
ambiguous write result: run DB read confirmation first and do not start another
tmux Red command until a new human gate approves it.

There are two bounded tmux shapes:

- strict single-mint single-run: one target mint, no `--watch`, one tmux
  session, one `/tmp` log, and at most one Metric append. Use this when the
  operator wants the narrowest interim entrypoint.
- bounded batch/watch: `--watch` plus explicit `--maxIterations`, with bounded
  `--limit`. Use this only when the operator accepts the wider write bound.

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

Confirmed strict single-mint tmux command shape:

```bash
tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"
```

This uses:

- session: `lowcap-gecko-metric-single`
- log file: `/tmp/lowcap-gecko-metric-single.log`
- `--mint <MINT>`
- `--write`
- no `--watch`

Confirmed result: with target mint
`MMeYRRhuFtpJUvHYb7UDsQGDrmB6uKCcMEWsLtopump`, the tmux command naturally
exited as a single-run, created / updated `/tmp/lowcap-gecko-metric-single.log`,
reported `selectedCount=1`, `okCount=1`, `errorCount=0`,
`writeEnabled=true`, and `writtenCount=1`, and appended Metric `id=1136` at
`observedAt=2026-05-01T10:51:23.716Z` with source
`geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv / reserve /
topPool presence all true. The target moved `metricsCount` from 1 to 2 with
previous Metric `id=1116`; `metrics:report -- --mint ... --limit 2` and
`token:compare -- --mint ...` confirmed `1136 -> 1116` rawJson-free. Token
fields were not updated, and Telegram / detect / watch / enrich / ops / systemd
were not invoked.

Reproduced result: with target mint
`3Gy57Za9VFEMhQsxPZniSjTgNffiXafFAL8juachpump`, the same formal interim
operator command naturally exited as a single-run, created / updated
`/tmp/lowcap-gecko-metric-single.log`, reported `selectedCount=1`,
`okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
appended Metric `id=1137` at `observedAt=2026-05-01T15:31:56.893Z` with
source `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv /
reserve / topPool presence all true. The target moved `metricsCount` from 1
to 2 with previous Metric `id=1115`; `metrics:report -- --mint ... --limit 2`
and `token:compare -- --mint ...` confirmed `1137 -> 1115` rawJson-free.
Token fields stayed `partial / Court Room Memes / Court Room / C / 1 /
hardRejected=false`, and Telegram / detect / watch / enrich / ops / systemd
were not invoked. This remains a strict single-mint no-`--watch` flow and does
not change the separate batch/watch bounded procedure.

Planner-gated reproduced result: with target mint
`7nuUe3Y4pC6PbwbUWe6NKkjaCcZxXa9UoNLYXSC1pump`, the planner first returned
`currentStage=partial_with_one_metric`,
`nextStage=second_metric_write_or_tmux_single`, and only printed the
`lowcap-gecko-metric-single` command string. After a separate human-approved
Red task, that exact command naturally exited as a single-run, created /
updated `/tmp/lowcap-gecko-metric-single.log`, reported `selectedCount=1`,
`okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
appended Metric `id=1138` at `observedAt=2026-05-01T16:56:49.272Z` with
source `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv /
reserve / topPool presence all true. The target moved `metricsCount` from 1
to 2 with previous Metric `id=1114`; `metrics:report -- --mint ... --limit 2`
and `token:compare -- --mint ...` confirmed `1138 -> 1114` rawJson-free.
Token fields stayed `partial / INDIA KASHMIR RAID / Inkraid / C / 1 /
hardRejected=false`, and Telegram / detect / watch / enrich / ops / systemd /
checkpoint operations were not invoked. This remains a strict single-mint
no-`--watch` flow and does not change the separate batch/watch bounded
procedure.

Second planner-gated reproduced result: with target mint
`GaUK8sUuGfLUD15sZmKhwtBk6Y9PHybdzUzYaSaLpump`, the planner returned
`currentStage=partial_with_one_metric`,
`nextStage=second_metric_write_or_tmux_single`, and only printed the
`lowcap-gecko-metric-single` command string. After a separate human-approved
Red task, that exact command naturally exited as a single-run, created /
updated `/tmp/lowcap-gecko-metric-single.log`, reported `selectedCount=1`,
`okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
appended Metric `id=1139` at `observedAt=2026-05-01T17:24:03.489Z` with
source `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv /
reserve / topPool presence all true. The target moved `metricsCount` from 1
to 2 with previous Metric `id=1113`; `metrics:report -- --mint ... --limit 2`
and `token:compare -- --mint ...` confirmed `1139 -> 1113` rawJson-free.
Token fields stayed `partial / CheatGPT / CheatGPT / C / 0 /
hardRejected=false`, and Telegram / detect / watch / enrich / ops / systemd /
checkpoint operations were not invoked. This remains a strict single-mint
no-`--watch` flow and does not change the separate batch/watch bounded
procedure.

Guarded planner-gated reproduced result: with target mint
`7G1KRX4PvHWgJStBrsp8CVKEoZEVF336HTz6kjncpump`, the planner command included
`--expectedMetricsCount 1` and passed with actual `guards.metricsCount=1`,
`currentStage=partial_with_one_metric`, and
`nextStage=second_metric_write_or_tmux_single`. It only printed the
`lowcap-gecko-metric-single` command string. After a separate human-approved
Red task, that exact command naturally exited as a single-run, created /
updated `/tmp/lowcap-gecko-metric-single.log`, reported `selectedCount=1`,
`okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
appended Metric `id=1140` at `observedAt=2026-05-01T17:46:40.309Z` with
source `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv /
reserve / topPool presence all true. The target moved `metricsCount` from 1
to 2 with previous Metric `id=1112`; `metrics:report -- --mint ... --limit 2`
and `token:compare -- --mint ...` confirmed `1140 -> 1112` rawJson-free.
Token fields stayed `partial / Choice / 1# C / C / 0 / hardRejected=false`,
and Telegram / detect / watch / enrich / ops / systemd / checkpoint operations
were not invoked. This remains a strict single-mint no-`--watch` flow and does
not change the separate batch/watch bounded procedure.

Dual-guard planner-gated reproduced result: with target mint
`9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump`, the planner command included
`--expectedMetricsCount 1 --expectedMetadataStatus partial` and passed with
actual `guards.metricsCount=1`, actual `guards.metadataStatus=partial`,
`currentStage=partial_with_one_metric`, and
`nextStage=second_metric_write_or_tmux_single`. It only printed the
`lowcap-gecko-metric-single` command string. After a separate human-approved
Red task, that exact command naturally exited as a single-run, created /
updated `/tmp/lowcap-gecko-metric-single.log`, reported `selectedCount=1`,
`okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
appended Metric `id=1141` at `observedAt=2026-05-02T06:08:23.396Z` with
source `geckoterminal.token_snapshot` and `volume24h=0`. The latest
rawJson-free safe presence was `priceUsdPresent=false`,
`fdvUsdPresent=false`, `reserveUsdPresent=true`, and `topPoolPresent=false`.
The target moved `metricsCount` from 1 to 2 with previous Metric `id=993`;
`metrics:report -- --mint ... --limit 2` and
`token:compare -- --mint ...` confirmed `1141 -> 993` rawJson-free. Token
fields stayed `partial / Palantir Manifesto / Manifesto / C / 0 /
hardRejected=false`, and Telegram / detect / watch / enrich / ops / systemd /
checkpoint operations were not invoked. This remains a strict single-mint
no-`--watch` flow and does not change the separate batch/watch bounded
procedure.

Triple-guard planner-gated reproduced result: with target mint
`H2RJiUGeB9LUeAHhKp2JZc836oGonhAYYgB5QPxCpump`, the planner command included
`--expectedMetricsCount 1 --expectedMetadataStatus partial --expectedStage partial_with_one_metric`
and passed with actual `guards.metricsCount=1`, actual
`guards.metadataStatus=partial`, `currentStage=partial_with_one_metric`, and
`nextStage=second_metric_write_or_tmux_single`. It only printed the
`lowcap-gecko-metric-single` command string. After a separate human-approved
Red task, that exact command naturally exited as a single-run, left no tmux
server running, created / updated `/tmp/lowcap-gecko-metric-single.log`,
reported `selectedCount=1`, `okCount=1`, `errorCount=0`,
`writeEnabled=true`, and `writtenCount=1`, and appended Metric `id=1151` at
`observedAt=2026-05-05T14:34:02.700Z` with source
`geckoterminal.token_snapshot` and `volume24h=0`. The latest rawJson-free safe
presence was `priceUsdPresent=false`, `fdvUsdPresent=false`,
`reserveUsdPresent=true`, and `topPoolPresent=false`; these values are
recorded as observed availability, not a failed append. The target moved
`metricsCount` from 1 to 2 with previous Metric `id=1102`;
`metrics:report -- --mint ... --limit 2` and
`token:compare -- --mint ...` confirmed `1151 -> 1102` rawJson-free. Token
fields stayed `partial / REKT / REKT / C / 0 / hardRejected=false`, and
Telegram / detect / watch / enrich / ops / systemd / checkpoint operations were
not invoked. This remains a strict single-mint no-`--watch` flow and does not
change the separate batch/watch bounded procedure.

Bounded-orchestration reproduced result: with target mint
`9eSNHMiLdKtud379HEk73ug7DhVdqRXR5MgFZanzpump`, the bounded-flow guide first
returned `mode=non_executor_guide`, all steps `willExecute=false`, and
`red_execution` as a placeholder. The triple-guard planner returned
`currentStage=partial_with_one_metric`,
`nextStage=second_metric_write_or_tmux_single`, and
`nextRedCommandKind=tmux_metric_single_mint`; the validator returned
`approvalReady=true` and `canProceedToHumanGate=true`. After the separate
human-approved Red task, exactly one copied `lowcap-gecko-metric-single`
command naturally exited as a no-`--watch` single-run, left no tmux server
running, created / updated `/tmp/lowcap-gecko-metric-single.log`, reported
`selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
`writtenCount=1`, and appended Metric `id=1233` at
`observedAt=2026-05-07T14:18:35.735Z` with source
`geckoterminal.token_snapshot` and `volume24h=0`. The latest rawJson-free safe
presence was `priceUsdPresent=false`, `fdvUsdPresent=false`,
`reserveUsdPresent=true`, and `topPoolPresent=false`; these values are
observed availability, not a failed append. The target moved `metricsCount`
from 1 to 2 with previous Metric `id=1005`; `metrics:report -- --mint ...
--limit 2` and `token:compare -- --mint ...` confirmed `1233 -> 1005`
rawJson-free. Token fields stayed `partial / Magic Internet Money / MIM / C /
0 / hardRejected=false`, and Telegram / detect / watch / enrich / ops /
systemd / checkpoint operations were not invoked. This remains a strict
single-mint no-`--watch` flow and does not change the separate batch/watch
bounded procedure.

Bounded-flow `--intent second_metric_snapshot` reproduced result: with target
mint `GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump`, the guide returned
`status=ok`, `intent=second_metric_snapshot`, `expectedMetricsCount=1`,
`expectedMetadataStatus=partial`, `expectedStage=partial_with_one_metric`, all
steps `willExecute=false`, and `red_execution` as a placeholder with no
concrete tmux command. The planner returned
`currentStage=partial_with_one_metric`,
`nextStage=second_metric_write_or_tmux_single`, and
`nextRedCommandKind=tmux_metric_single_mint`; the validator returned
`approvalReady=true` and `canProceedToHumanGate=true`. After the separate
human-approved Red task, exactly one copied `lowcap-gecko-metric-single`
command naturally exited as a no-`--watch` single-run, left no tmux server
running, created / updated `/tmp/lowcap-gecko-metric-single.log`, reported
`selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
`writtenCount=1`, and appended Metric `id=1243` at
`observedAt=2026-05-08T13:46:44.319Z` with source
`geckoterminal.token_snapshot` and `volume24h=0`. The target moved
`metricsCount` from 1 to 2 with previous Metric `id=688`; `metrics:report --
--mint ... --limit 2` and `token:compare` confirmed `1243 -> 688`
rawJson-free. The latest safe presence was `priceUsdPresent=true`,
`fdvUsdPresent=true`, `reserveUsdPresent=true`, and `topPoolPresent=true`.
Token fields stayed `partial / highest in the room / HIGHEST / C / 0 /
hardRejected=false`, and Telegram / detect / watch / enrich / ops / systemd /
checkpoint operations were not invoked. This remains a strict single-mint
no-`--watch` flow and does not change the separate batch/watch bounded
procedure.

Bounded-flow `--intent second_metric_snapshot` strict single-mint reproduced
result: with target mint
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, the guide returned
`status=ok`, `intent=second_metric_snapshot`, `expectedMetricsCount=1`,
`expectedMetadataStatus=partial`, `expectedStage=partial_with_one_metric`, all
steps `willExecute=false`, and `red_execution` as a placeholder with no
concrete tmux command. The planner returned
`currentStage=partial_with_one_metric`,
`nextStage=second_metric_write_or_tmux_single`, and
`nextRedCommandKind=tmux_metric_single_mint`; the validator returned
`approvalReady=true` and `canProceedToHumanGate=true`. After the separate
human-approved Red task, exactly one copied `lowcap-gecko-metric-single`
command naturally exited as a no-`--watch` single-run, left no tmux server
running, created / updated `/tmp/lowcap-gecko-metric-single.log`, reported
`selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
`writtenCount=1`, and appended Metric `id=1245` at
`observedAt=2026-05-08T23:53:30.002Z` with source
`geckoterminal.token_snapshot` and `volume24h=0`. The target moved
`metricsCount` from 1 to 2 with previous Metric `id=1244`; `metrics:report
-- --mint ... --limit 2` and `token:compare` confirmed `1245 -> 1244`
rawJson-free. The latest safe presence was `priceUsdPresent=true`,
`fdvUsdPresent=true`, `reserveUsdPresent=true`, and `topPoolPresent=true`.
Token fields stayed `partial / Papu / PAPU / C / 0 / hardRejected=false`, and
Telegram / detect / watch / enrich / ops / systemd / checkpoint operations were
not invoked. This remains a strict single-mint no-`--watch` flow and does not
change the separate batch/watch bounded procedure.

Confirmed bounded batch/watch tmux command:

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

Strict single-mint session check:

```bash
tmux has-session -t lowcap-gecko-metric-single
```

Strict single-mint log check:

```bash
tail -n 120 /tmp/lowcap-gecko-metric-single.log
```

Batch/watch session check:

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

- a strict single-mint command lacks `--mint <MINT>`.
- `--watch` appears in the strict single-mint command.
- a strict single-mint command can select more than one token.
- `selectedCount` is higher than expected.
- `writtenCount` exceeds the bounded maximum.
- `failedCount > 0`.
- `errorCount > 0`.
- Token fields are updated by the Metric step.
- Telegram, detect, enrich/rescore, ops, or systemd appear in the Metric step.
- `rateLimited` or `abortedDueToRateLimit` is true.
- There is any risk of showing rawJson, `.env`, tokens, chat ids, or other
  secrets.
- The run needs `--maxIterations` to be removed.
- The run needs systemd.
- The command differs from the approved exact command.

## Side-Effect Bound

The strict single-mint command is bounded by one explicit `--mint`, no
`--watch`, and one tmux session. It can append at most one Metric row for the
target mint, writes only the `/tmp/lowcap-gecko-metric-single.log` log file
besides the Metric row, and does not use or update checkpoints. It should not
update Token fields and should not send Telegram notifications.

The batch/watch command is bounded by `--limit 2 * --maxIterations 2`, so it can
append at most four Metric rows. `--minGapMinutes 10` skips tokens with a recent
Metric for the same source before fetch. It should not update Token fields and
should not send Telegram notifications.

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
