# Gecko Watch Readiness Runbook

## Conclusion

Do not start always-on Gecko monitoring from `systemd`. The safe progression is:

1. docs gate
2. dry-run-only
3. capture-only
4. isolated one-shot write
5. foreground or tmux
6. systemd

The existing watch runners and sample systemd units are useful entrypoints, but
they can run write-enabled flows. Treat them as Red until the lane-specific
preflight has passed and the exact command is explicitly approved.

## Current Readiness Summary

GeckoTerminal automation is currently proven as a bounded, operator-triggered
CLI workflow, not as always-on monitoring.

Use `docs/runbooks/gecko-bounded-operation-mvp.md` as the current daily
operation entrypoint. It defines the temporary bounded MVP, the recommended
detect -> enrich/rescore -> Metric -> rawJson-free report order, Red / Green
boundaries, exact-command examples, and stop conditions.

Confirmed:

- `detect:geckoterminal:new-pools` one-shot pump-only write.
- two bounded detect watch writes with `/tmp` checkpoint,
  `--pumpOnly`, `--limit 1`, `--maxIterations 1`, and `--write`.
- both watch-detected mints completed downstream enrich/rescore, two
  single-mint Metric appends, and rawJson-free report confirmation through
  `metrics:report`, `token:compare`, and `tokens:compare-report`.
- metric snapshot watch gates: single-mint bounded, batch bounded, foreground
  bounded, tmux bounded, and tmux no-candidate natural exit.

Still unconfirmed:

- detect foreground or tmux watch operation.
- default-checkpoint detect watch operation.
- detect long-running or unbounded watch.
- systemd start / enable and restart-oriented operation.
- scheduler / queue worker / background automatic ingestion runtime.

Next phase choices:

- treat the bounded operation MVP runbook as the operator entrypoint before
  adding more Red gates.
- keep tmux bounded operation as the interim MVP entrypoint while user systemd
  remains blocked in this environment.
- continue detect watch checks with `/tmp` checkpoint plus `--maxIterations 1`
  for any third or later Red gate.
- run a separate read-only preflight before detect foreground / tmux.
- keep systemd on hold until a user-systemd-capable session is available.
- keep `token_completed` and `loop_complete` production live-send checks on
  hold until eligible candidates naturally exist.

Operational boundary:

- Green includes docs updates, read-only CLI, dry-runs without `--write` /
  `--watch`, rawJson-free reports, typecheck, and targeted tests.
- Red includes any detect write, detect watch write, enrich/rescore write,
  Metric snapshot write, tmux start, systemd operation, or Telegram live send.
- Stop if counts exceed the approved bound, the default checkpoint could be
  touched, rawJson / secret display risk appears, the command differs from the
  exact approval, or the next step requires unbounded watch.

## Lanes

### `detect:geckoterminal:new-pools`

- Existing watch support: yes.
- Existing checkpoint support: yes.
- Existing bounded test shape: `--maxIterations`.
- Default checkpoint path: repo-local `data/checkpoints/geckoterminal-new-pools.json`.
- First always-on candidate: yes, but do not start always-on yet.
- Write behavior: `--write` hands accepted mints into the mint-first boundary.
- Confirmed Red one-shot gate: `pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write`.
- Confirmed one-shot side effects: at most one mint ingest write, no checkpoint update, and no Telegram send.
- Confirmed initial pump-only watch write gate:
  `pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`.
  It ran one cycle with `inputCount=20`, `selectedCount=1`, `acceptedCount=1`,
  `importedCount=1`, `failedCount=0`, and created mint-only Token
  `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump`. It updated only the `/tmp`
  checkpoint to `2026-04-29T14:36:09.000Z |
  ANPbYLCgNLGtfC5Qt4iSUERnwUREa8Qpsm7iGkY3uVvx`; the default checkpoint stayed
  unused. Telegram, Metric append, enrich, and rescore were not invoked.
- Confirmed second pump-only watch write gate with the same bounded command and
  `/tmp` checkpoint: it ran one cycle with `inputCount=20`, `selectedCount=1`,
  `acceptedCount=1`, `importedCount=1`, `existingCount=0`, and `failedCount=0`,
  and created mint-only Token
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump`. The checkpoint advanced from
  `2026-04-29T14:36:09.000Z |
  ANPbYLCgNLGtfC5Qt4iSUERnwUREa8Qpsm7iGkY3uVvx` to
  `2026-04-29T15:23:33.000Z |
  3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8`. The default checkpoint stayed
  uncreated / unused, and Telegram, Metric append, enrich, rescore, and ops
  catchup were not invoked.
- Confirmed second watch-detected downstream first observation: the
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` Token then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` to
  `metadataStatus=partial` with `name/symbol=wtf/WTF`, score `C` / `0`,
  `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and
  setting latestMetric to `id=1124` with
  `observedAt=2026-04-29T15:41:56.989Z`; volume24h / price / fdv / reserve /
  topPool were present. The Metric step did not update token fields and did not
  send Telegram.
- Confirmed second watch-detected read-only report visibility:
  `metrics:report -- --mint ... --limit 1` showed Metric `id=1124`, its
  `observedAt`, `volume24h`, and all four rawJson-free Metric presence fields
  as true; `token:compare -- --mint ...` showed latestMetric `id=1124`, one
  `recentMetrics` item, and all four `safeSummary` booleans as true; and
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=1` filters included the mint with `metricsCount=1`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed second watch-detected time-series append: a second
  `metric:snapshot:geckoterminal -- --mint ... --write` on the same
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` mint appended Metric
  `id=1125`, moved `metricsCount` from 1 to 2, and updated latestMetric to
  `observedAt=2026-04-29T15:55:14.973Z`. The previous Metric remains
  `id=1124` at `observedAt=2026-04-29T15:41:56.989Z`, so the second
  watch-detected mint now also has two distinct Metric observations. This was a
  single-mint one-shot append, not watch mode, and it did not update token
  fields or send Telegram. Two-Metric rawJson-free report confirmation for this
  mint remains the next gate.
- Confirmed second watch-detected two-Metric report visibility:
  `metrics:report -- --mint ... --limit 2` showed Metric ids `1125 -> 1124`
  with both `observedAt` values and rawJson-free market-data presence fields;
  `token:compare -- --mint ...` showed latestMetric `id=1125` and
  `recentMetrics` containing `1125` plus `1124`, each with true `safeSummary`;
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=2` filters included the mint with `metricsCount=2`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed watch-detected downstream observation loop: the same watch-origin
  mint then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` to
  `metadataStatus=partial` with `name/symbol=Jennie/Jennie`, score `C` / `0`,
  and `hardRejected=false`, then through
  `metric:snapshot:geckoterminal -- --mint ... --write` to append the first
  `geckoterminal.token_snapshot` Metric. That moved `metricsCount` from 0 to 1
  and set latestMetric to `id=1122` with
  `observedAt=2026-04-29T14:54:49.239Z`; volume24h / price / fdv / reserve /
  topPool were present. The Metric step did not update token fields and did not
  send Telegram.
- Confirmed watch-detected read-only report visibility: `metrics:report -- --mint ... --limit 1`
  showed Metric `id=1122`, its `observedAt`, `volume24h`, and all four
  rawJson-free Metric presence fields as true; `token:compare -- --mint ...`
  showed latestMetric `id=1122`, one `recentMetrics` item, and all four
  `safeSummary` booleans as true; `tokens:compare-report` with Gecko-origin
  partial / hasMetrics filters included the same mint with `metricsCount=1`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These report checks did not expose Metric rawJson and did not write to DB.
- Confirmed watch-detected time-series append: a second
  `metric:snapshot:geckoterminal -- --mint ... --write` on the same watch-origin
  mint appended Metric `id=1123`, moved `metricsCount` from 1 to 2, and updated
  latestMetric to `observedAt=2026-04-29T15:09:40.608Z`. The previous Metric
  remains `id=1122` at `observedAt=2026-04-29T14:54:49.239Z`, so the
  watch-detected path now has two distinct Metric observations. This was a
  single-mint one-shot append, not watch mode, and it did not update token
  fields or send Telegram.
- Confirmed watch-detected two-Metric report visibility:
  `metrics:report -- --mint ... --limit 2` showed Metric ids `1123 -> 1122`
  with both `observedAt` values and rawJson-free market-data presence fields;
  `token:compare -- --mint ...` showed latestMetric `id=1123` and
  `recentMetrics` containing `1123` plus `1122`, each with `safeSummary`;
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=2` filters included the mint with `metricsCount=2`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed separate single-mint observation loop: a one-shot-origin pump.fun
  mint moved through detect one-shot write,
  `token:enrich-rescore:geckoterminal -- --mint ... --write`,
  and `metric:snapshot:geckoterminal -- --mint ... --write` to reach
  `partial` plus two `geckoterminal.token_snapshot` Metrics with distinct
  `observedAt` values.
- Confirmed bounded single-mint metric watch write: `metric:snapshot:geckoterminal -- --mint ... --write --watch --maxIterations 1 --minGapMinutes 10`
  ran one cycle, selected one token, appended one Metric, moved `metricsCount`
  from 2 to 3, and finished without token field updates or Telegram send.
- Confirmed bounded batch metric watch write: `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 1 --minGapMinutes 10`
  ran in `recent_batch` mode for one cycle, selected one eligible pump token,
  appended one Metric, moved the target mint's `metricsCount` from 3 to 4, and
  finished without token field updates or Telegram send.
- Confirmed foreground bounded watch gate: `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60`
  naturally exited after two cycles. Both cycles selected the same eligible pump
  token and skipped before fetch as `skipped_recent_metric`, so `writtenCount`
  stayed 0, `metricsCount` stayed 4, and latestMetric stayed `id=1120`.
- Confirmed tmux bounded watch gate: `tmux new-session -d -s lowcap-gecko-metric-bounded "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60 > /tmp/lowcap-gecko-metric-bounded.log 2>&1'"`
  started the same bounded command in tmux, naturally exited after
  `maxIterations=2`, appended Metric `id=1121` in cycle 1, skipped cycle 2 as
  `skipped_recent_metric`, and moved the target mint's `metricsCount` from 4 to
  5 without token field updates, Telegram send, or systemd operations.
- Confirmed tmux bounded no-candidate rerun: the same command started with no
  existing session, naturally exited after `maxIterations=2`, selected 0 tokens,
  wrote 0 Metrics, had `failedCount=0` and `rateLimited=false`, and left
  `metricsCount=5` plus latestMetric `id=1121` unchanged. This confirms both an
  append case and a candidate-0 / no-write case can terminate safely.
- Confirmed read-only visibility: `metrics:report -- --mint ... --limit 2` and
  `token:compare -- --mint ...` can show the two-row Metric history before any
  watch or systemd work.
- Confirmed cohort report visibility: `metrics:report -- --limit 10` can show
  multiple token / multiple Metric rows with rawJson-free safe summary columns,
  and `tokens:compare-report` can show filtered Gecko-origin latestMetric /
  `metricsCount` cohort summaries.
- Confirmed post-tmux read-only visibility: after the tmux bounded gate,
  `metrics:report -- --mint ... --limit 5` showed Metric ids
  `1121 -> 1120 -> 1119 -> 1118 -> 1117`, `token:show` showed
  `metricsCount=5` plus latestMetric `id=1121`, and `tokens:compare-report`
  showed the same mint in the Gecko-origin cohort with latestMetric safe summary
  booleans.
- Confirmed rawJson-free token compare output: `token:compare` now omits Metric
  rawJson from latestMetric / `recentMetrics` and includes `safeSummary`
  booleans for price / fdv / reserve / topPool presence.
- At this point, `metrics:report`, `tokens:compare-report`, and `token:compare`
  are all suitable for rawJson-free read-only Metric confirmation before any
  longer watch or systemd step.
- Pump-only watch write gate is implemented and the first isolated Red run has
  passed. Continue to treat it as Red for any further live execution.
- `--write --pumpOnly` still requires `--limit 1` in both one-shot and watch
  modes.
- Checkpoint safety for the bounded pump-only watch path is covered by targeted
  test: with two eligible pump candidates and `--limit 1`, `checkpointAfter`
  advances only to the selected / processed candidate cursor and does not skip
  the limit-out candidate.

Start with file-backed or live one-shot dry-run inspection, then use the
confirmed one-shot write gate above when the goal is to validate the pump.fun
lowcap ingest path. The single-mint loop confirms the real-data one-shot path
before automation, and the read-only reports now confirm both single-mint
history and cohort-level visibility. The detect watch proof is still limited to
bounded pump-only live cycles with an isolated `/tmp` checkpoint, but it has now
passed twice. The first watch-detected mint has also passed enrich/rescore, two
Metric appends with distinct `observedAt` values, and rawJson-free report
confirmation for the two-row Metric history. The second watch-detected mint has
now also passed enrich/rescore, two Metric appends with distinct `observedAt`
values, and rawJson-free report confirmation for the two-row Metric history.
For any next
detect watch write, do not touch the default checkpoint; keep a bounded command
shape with `--pumpOnly --limit 1 --write --watch --maxIterations 1 --checkpointFile /tmp/<name>.json`.
The first attempts in the Codex sandbox for some live `tsx` commands failed
before application startup due to `tsx` IPC `EPERM`; rerunning the same exact
commands outside the sandbox succeeded and stayed within the allowed
side-effect bounds. Treat any long-running detect watch, tmux detect watch, or
systemd detect watch as a later Red task.

Still unconfirmed for this lane:

- detect watch write third and later runs
- detect foreground or tmux operation
- detect systemd operation
- default-checkpoint detect watch operation
- long-running or unbounded detect watch
- two-or-more-token simultaneous metric snapshot write
- foreground metric append during bounded watch
- long-running metric snapshot watch
- restart-oriented metric snapshot operation
- metric snapshot systemd operation
- multi-token or multi-metric cycles
- `token_completed` production live send
- `loop_complete` production live send

### `metric:snapshot:geckoterminal`

- Existing watch support: yes.
- Existing bounded test shape: `--maxIterations`.
- Existing spacing guard: `--minGapMinutes`.
- Existing rate-limit behavior: watch mode stops the current cycle after the
  first token snapshot rate limit and continues later.
- Existing checkpoint or state file: none in this lane.
- Confirmed bounded watch write gates: single mint plus `--maxIterations 1` plus
  `--minGapMinutes`, batch mode with `--pumpOnly`, small `--limit`,
  `--maxIterations`, and `--minGapMinutes`, plus foreground and tmux runs using
  the same bounded command shape.
- First always-on candidate: yes, after multi-token dry-run and foreground checks.
- Write behavior: `--write` appends `Metric` rows.

Start with dry-run-only watch using `--maxIterations 1` or `2`. Move to Red only
when selected count and expected write count are bounded. For single-mint checks,
prefer `--mint <MINT> --write --watch --maxIterations 1 --minGapMinutes <N>`.
For batch watch write, prefer `--pumpOnly --limit <N> --write --watch --maxIterations 1 --minGapMinutes <N>`.
Checkpoint/state protection is not available, so small `--limit`,
`--maxIterations`, and `--minGapMinutes` are mandatory gates before any
foreground, tmux, or systemd step. Do not run unbounded watch, watch without
`--limit`, or systemd start from this lane.
The two-cycle foreground and tmux checks confirmed that `--minGapMinutes`
suppresses repeat appends before fetch; keep the same bounded command shape for
any next tmux check, and do not move to systemd yet. Before systemd, compare the
wrapper and sample unit defaults against this gate explicitly: `--limit`,
`--maxIterations` or another bounded stop condition, `--minGapMinutes`,
`--intervalSeconds`, log location, restart policy, and stop command must all be
documented before install / enable / start is requested.

Systemd preflight for this lane has been checked read-only. The current wrapper
and sample unit do not yet match the confirmed bounded gate:

- Confirmed bounded gate: `--pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60`.
- `scripts/run-geckoterminal-metric-watch.sh` defaults to
  `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=5`,
  `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`,
  `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=1800`,
  `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=900`,
  `LOWCAP_GECKOTERMINAL_METRIC_SINCE_MINUTES=120`, and
  `LOWCAP_GECKOTERMINAL_METRIC_SOURCE=geckoterminal.token_snapshot`.
- The wrapper always passes `--watch --write`. It now supports
  `LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true|1|yes` to add `--pumpOnly`, and
  `LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=<N>` to add
  `--maxIterations <N>`. Both are off by default, so existing unbounded wrapper
  behavior is unchanged unless the first-run environment sets them.
- The wrapper does not echo `.env` or secret values, but the delegated CLI emits
  JSON output; a systemd run may leave sanitized snapshot JSON in journald unless
  a summary-only logging plan is added.
- `ops/systemd/lowcap-bot-geckoterminal-metric-watch.service` points
  `ExecStart` at the wrapper, sets `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=5`,
  `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=1800`,
  `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`,
  `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=900`, and
  `LOWCAP_GECKOTERMINAL_METRIC_SOURCE=geckoterminal.token_snapshot`, but has no
  `EnvironmentFile`, no `--pumpOnly`, no `--maxIterations`, and
  `Restart=always`.
- `ops/systemd/lowcap-bot-geckoterminal-metric-watch-first-run.service` is the
  bounded first-run sample. It uses the same wrapper, sets
  `LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true`,
  `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=2`,
  `LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=2`,
  `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`,
  `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=60`,
  `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=0`, and `Restart=no`.
  This unit is for manual first-run confirmation only and is not the always-on
  metric watch unit.

Do not install, enable, or start this unit yet. The first systemd run must be
bounded close to the confirmed gate by explicitly setting
`LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true`,
`LOWCAP_GECKOTERMINAL_METRIC_LIMIT=2`,
`LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=2`,
`LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`, and
`LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=60`, plus exact stop and log-check
commands and a clear policy that journald must not expose secrets or full raw
payloads.

Yellow follow-up candidates before any Red systemd run:

- Decide whether metric watch output should be summary-only for journald, rather
  than full CLI JSON.

Red systemd first-run must still be split into exact commands and explicitly
approved before execution:

1. Copy/install the first-run unit into the user systemd directory.
2. Run `systemctl --user daemon-reload`.
3. Start only `lowcap-bot-geckoterminal-metric-watch-first-run.service`.
4. Stop the first-run unit if any stop condition is hit.
5. Check bounded logs for cycle count, selected count, written count, skipped
   count, failure/rate-limit fields, and natural exit. Do not paste rawJson,
   secrets, or large journal output into reports.

Do not run `enable` for the first-run unit. Do not start the always-on metric
watch unit until the first-run unit has been installed, started, observed,
stopped or naturally exited, and documented under separate Red approval.

Current Codex environment blocker:

- Phase A installed
  `/home/mochi/.config/systemd/user/lowcap-bot-geckoterminal-metric-watch-first-run.service`
  and confirmed it matches the repo sample.
- `systemctl --user daemon-reload` failed with no user bus.
- Read-only follow-up found PID 1 is `codex-linux-san`, not systemd.
- `XDG_RUNTIME_DIR` is set, but the user bus socket is missing.
- `systemctl --user is-system-running --no-pager` reports `offline`.
- `loginctl show-user` cannot connect because the environment was not booted
  with systemd as init.

Do not proceed to Phase B start in this environment. To continue the systemd
path, use a session where PID 1 is systemd, `XDG_RUNTIME_DIR/bus` exists, and
`systemctl --user` is not offline, then rerun Phase A from the install /
daemon-reload step. If that environment is not available, the practical
fallback remains tmux bounded operation. `sudo`, `loginctl enable-linger`, and
system unit conversion are separate Red tasks and are not part of this gate.

For the tmux bounded fallback, use
[`gecko-metric-tmux-bounded.md`](./gecko-metric-tmux-bounded.md). It keeps the
confirmed `lowcap-gecko-metric-bounded` command shape, log path, stop conditions,
numeric summary checks, and post-run read-only report checks separate from
systemd work.

### Enrich / Rescore Notify Wrappers

- Existing shell loop wrappers: yes.
- Fast runner: `scripts/run-geckoterminal-enrich-rescore-notify-fast.sh`.
- Slower runner: `scripts/run-geckoterminal-enrich-rescore-notify.sh`.
- Write behavior: both delegate to `token:enrich-rescore:geckoterminal --write`.
- Notify behavior: both include `--notify`.

These wrappers need an explicit notify gate before operational use. Keep them
behind manual foreground or tmux checks until notification behavior, log volume,
and rate-limit cooldowns are acceptable.

### `ops:catchup:gecko`

- Current role: bounded operator-visible one-shot.
- Existing loop bound: `--maxCycles`.
- Confirmed production Telegram ops send: one `metric_appended`.
- Unconfirmed production Telegram ops sends: `token_completed` and
  `loop_complete`.
- Not current role: scheduler, worker, queue, or always-on loop.

Do not promote `ops:catchup:gecko` into scheduler, worker, queue, or systemd
operation yet. Keep token write and Metric append as explicit Red executions.

## Risk Boundaries

### Green

- Docs and runbook updates.
- Read-only inspection.
- Targeted tests.
- `pnpm exec tsc --noEmit`.
- Dry-run-only command planning.

### Yellow

- Dry-run-only wrapper additions.
- Log summary or stop-condition test-only reinforcement.
- Small production gate additions that do not write, send Telegram messages, or
  start watch mode.

### Red

- `--watch --write`.
- `detect:geckoterminal:new-pools --write`.
- Any detector, metric snapshot, or ops catch-up command with `--write`.
- Production Telegram send.
- `systemd` install, enable, or start.
- Scheduler or watch process startup.

## Preflight Checklist

Before any watch or scheduler step:

1. Confirm `git status --short --branch` is clean.
2. Confirm `git log --oneline -8` shows the expected HEAD.
3. Pick exactly one lane.
4. Start with `--maxIterations 1` or a bounded one-shot.
5. Put the first checkpoint file under `/tmp`.
6. Put capture files under `/tmp`.
7. Do not print Telegram token, chat id, `.env`, or other secrets.
8. Confirm candidate count from dry-run output.
9. Advance to Red permission only when the write count is limited to one expected action.

## Stop Conditions

Stop before write, send, watch, or systemd if any of these happen:

- Candidate count is higher than expected.
- Planned or actual write count is higher than expected.
- A checkpoint would update outside the intended path.
- Rate-limit, network, or retry errors repeat.
- Expected capture records are not created.
- Any trigger other than the selected `--opsNotifyTrigger` is eligible to send.
- `token_completed` or `loop_complete` live-send candidate count is zero.
- There is any risk of showing `.env`, Telegram token, Telegram chat id, raw env,
  raw stdout, raw stderr, or full command args containing secrets.

## Systemd Checklist

Before using a sample systemd unit:

1. Confirm the same lane has already run briefly in foreground or tmux.
2. Explain why it is time to move from an isolated `/tmp` checkpoint to the
   intended persistent checkpoint.
3. Document log location, restart policy, and stop command.
4. Confirm the sample unit command matches the current runbook command.
5. Require an exact install / enable / start command and explicit Red approval.

Sample units are not activation instructions by themselves. They are templates
to review after the lane has passed the earlier gates.
