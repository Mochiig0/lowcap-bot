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
- First always-on candidate: yes, after isolated `/tmp` checkpoint confirmation.
- Write behavior: `--write` hands accepted mints into the mint-first boundary.

Start with file-backed dry-run inspection. For Red confirmation, use
`--watch --write --maxIterations 1 --checkpointFile /tmp/<name>.json` before
touching the default checkpoint path.

### `metric:snapshot:geckoterminal`

- Existing watch support: yes.
- Existing bounded test shape: `--maxIterations`.
- Existing spacing guard: `--minGapMinutes`.
- Existing rate-limit behavior: watch mode stops the current cycle after the
  first token snapshot rate limit and continues later.
- First always-on candidate: yes, after dry-run and one isolated write check.
- Write behavior: `--write` appends `Metric` rows.

Start with dry-run-only watch using `--maxIterations 1` or `2`. Move to Red only
when selected count and expected write count are bounded.

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
