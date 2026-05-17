# Notification Live Send Operation Boundary

Date: 2026-05-17

This document fixes the current operator boundary between manual approved live
send, retry planning, and future automated live send. It is docs-only. No
Telegram send, production DB write, retry execution, scheduler, systemd,
watch, metric snapshot, detect, import, enrich, or rescore command was run for
this policy update.

## Current Notification Safety State

- Notification `id=8` has completed one manual approved Telegram live send for
  `metric_appended`.
- Sent-row resend prevention is implemented: `notification:send` blocks before
  sender call when `status=sent` or `sentAt` is present.
- Sender failure marking is covered by temp-SQLite / mocked-sender tests.
- `notification:retry:plan` is read-only and returns no candidate when failed
  rows are absent in production.
- Retry candidate selection with failed / captured / sent fixtures is covered
  by temp-SQLite tests.
- Current production counts verified read-only: Token / Metric / Notification
  / HolderSnapshot = `1296 / 198 / 8 / 1`.
- Production failed Notification rows: `0`.
- Notification `id=7` remains `captured` / `capture_only` and unsent.
- Notification `id=8` is `sent` / `live_send`.
- The 6h Gecko dry-run is not a completed stability proof; it stopped at the
  authentication boundary and remains unresolved.

## Existing Notification Paths

- Creation path: `metric:snapshot:geckoterminal -- --mint <MINT> --write`
  creates a capture-only `metric_appended` Notification after a successful
  exact-mint Metric write unless `--noNotificationCapture` is supplied.
- Live-send path: `notification:send -- --notificationKey <KEY> --trigger
  metric_appended --live` sends exactly the selected captured row when all
  guards pass.
- Retry-plan path: `notification:retry:plan` reads failed `metric_appended`
  rows and emits a human-gated next Red command. It does not send Telegram and
  does not update DB state.
- Retry execution path: `notification:send -- --notificationKey <KEY>
  --trigger metric_appended --live --retryFailed` is allowed only after a
  separate Red approval for one failed row.

## Manual Approved Live Send Policy

Manual approved live send is the only live-send mode allowed today.

Required boundary:

- A human confirms one `notificationKey`.
- A human confirms `trigger=metric_appended`.
- The target Notification is `captured` / `capture_only`.
- `sentAt=null` and `status!=sent`.
- Safe message preview has been reviewed.
- The exact command is one `notification:send --live` command.
- The execution result is recorded in docs afterward.

Notification `id=7` should stay on hold for now. It is eligible as a captured
row, but there is no current operational need to send it before the next
approved live-send slice.

## Retry Policy

- `notification:retry:plan` remains read-only.
- Retry execution is not automatic.
- If a failed row appears, first run the planner and inspect its
  `nextRedCommand`.
- `--retryFailed` execution requires a separate Red approval and must process
  one failed row only.
- Do not create artificial failed production rows for rehearsal.

## Auto Live Send Policy

Auto live send is not enabled.

Current prohibitions:

- Do not send Telegram from scheduler, worker, queue, or systemd.
- Do not batch-send Notifications.
- Do not automatically advance captured Notifications to sent.
- Do not treat capture-only rows as standing permission to send.
- Do not enable always-on notification delivery while the 6h dry-run remains
  unresolved.

## Future Auto Live Send Unlock Conditions

Future auto live send can be reconsidered only after all of the following are
true:

- 6h dry-run completes.
- 6h DB write rehearsal completes.
- Notification capture boundary is confirmed for the relevant runner.
- Sent-row resend prevention test remains passing.
- Sender failure marking test remains passing.
- Retry planner candidate selection test remains passing.
- Safe message format is fixed.
- Rate limit, duplicate, restart, and retry behavior are reviewed.
- Automation starts from a small explicit allowlist.
- A rollback / disable-switch procedure exists.

## Stop Conditions Before Scheduler Or Systemd

Do not proceed to auto live send, scheduler, or systemd if any of these are
true:

- Failed-row handling is unclear.
- Multiple captured rows exist and selection logic is unclear.
- Scheduler restart duplicate-send risk is unclear.
- DB update and Telegram send ordering / failure behavior is unclear.
- Secrets could appear in logs.
- 6h run has not been confirmed.
- Working tree is not clean.
- The next action cannot be reduced to one exact approved command.
