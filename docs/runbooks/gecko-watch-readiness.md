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
- Confirmed single-mint observation loop: the same pump.fun mint moved through
  detect one-shot write, `token:enrich-rescore:geckoterminal -- --mint ... --write`,
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
- Confirmed read-only visibility: `metrics:report -- --mint ... --limit 2` and
  `token:compare -- --mint ...` can show the two-row Metric history before any
  watch or systemd work.
- Confirmed cohort report visibility: `metrics:report -- --limit 10` can show
  multiple token / multiple Metric rows with rawJson-free safe summary columns,
  and `tokens:compare-report` can show filtered Gecko-origin latestMetric /
  `metricsCount` cohort summaries.
- Invalid for the pump-only write path: `--watch --write --pumpOnly`.
- Reason: `--write --pumpOnly` is one-shot-only and requires `--limit 1`, so it cannot be combined with `--watch`.

Start with file-backed or live one-shot dry-run inspection, then use the
confirmed one-shot write gate above when the goal is to validate the pump.fun
lowcap ingest path. The single-mint loop confirms the real-data one-shot path
before automation, and the read-only reports now confirm both single-mint
history and cohort-level visibility. These are still not detect watch or systemd
proofs. If detect watch write is needed later, `--pumpOnly` must be removed,
which broadens the target set beyond the pump-only lane. Treat that as a
separate design decision before touching the default checkpoint path.

Still unconfirmed for this lane:

- detect watch write
- detect foreground or tmux operation
- detect systemd operation
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

- Add or document a first-run sample unit/env that matches the bounded gate.
- Decide whether metric watch output should be summary-only for journald, rather
  than full CLI JSON.

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
