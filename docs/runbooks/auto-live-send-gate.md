# Auto Live Send Gate Preflight

Date: 2026-05-21

This was a read-only / docs-only implementation preflight for the future auto
live send gate. It did not implement auto live send, send Telegram, write DB
state, update Notifications, fetch externally, run retry execution, run Metric
snapshot, run detector / ops catch-up, use `--write`, `--watch`, or `--live`,
enable scheduler / systemd, change schema, change application code, print
rawJson, or print secrets.

## Current State

- HEAD at start: `61d4e00 docs: choose next operating slice`
- working tree at start: clean
- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- `notification:retry:plan` candidate count: `0`

The current captured rows are rehearsal rows only:

- ids `3` through `6`: `SMOKE_...` rows
- id `9`: `REHEARSAL:capture_rehearsal_20260520:...` row

Sent rows id `7` and id `8` remain excluded by resend prevention. Auto live
send, scheduler, worker, queue, and systemd remain locked.

## Recommended Gate

Use a positive opt-in switch:

```text
NOTIFICATION_AUTO_SEND_ENABLED=true
```

Policy:

- unset, `false`, or any value other than exact `true` means auto live send is
  disabled
- default disabled
- this switch is for future auto send only
- manual `notification:send --live` remains a separate, human-approved command
  path and should not be gated by this auto-send switch at first
- scheduler / systemd must not call any sender until this switch exists,
  defaults disabled, and is covered by tests / dry-run planner output

This name is preferred over `TELEGRAM_LIVE_SEND_ENABLED` because it scopes the
switch to Notification auto-send behavior rather than all Telegram use. It is
preferred over `AUTO_LIVE_SEND_DISABLED=true` because a positive opt-in avoids
unsafe behavior from missing or misspelled environment values.

## Initial Allowlist

The first auto-send gate should allow only one narrow production-shaped
Notification candidate:

- `eventType=metric_appended`
- `trigger=metric_appended`
- `status=captured`
- `mode=capture_only`
- `sentAt=null`
- `failedAt=null`
- `errorCode=null`
- `status!=sent`
- `mint` is present
- `metricId` is present
- `notificationKey` matches production shape
  `<mint>:metric_appended:<metricId>`
- key / mint are not smoke or rehearsal artifacts according to
  `isSmokeOrRehearsalNotification()`
- row is not a retry candidate
- global failed Notification count is `0`
- safe preview can be generated without message full body, rawJson, Telegram
  response bodies, chat id, bot token, or environment values
- duplicate / ambiguous Notification identity is absent
- one-run max is not exceeded

Initial one-run max should be fixed at `1`. A later option can expose the
limit, but the default and first implementation should stay at one selected
row per run.

## Stop Conditions

The planner should stop, not select a live-send candidate, if any of these are
true:

- `NOTIFICATION_AUTO_SEND_ENABLED` is not exactly `true` for any future live
  auto-send command
- failed Notification count is greater than `0`
- candidate count exceeds the one-run max
- candidate selection is ambiguous or duplicate `notificationKey` values are
  detected
- any candidate has non-empty `blockedBy`
- smoke / rehearsal row appears in candidate selection
- sent row, `sentAt`-present row, or `status=sent` appears in candidate
  selection
- event / trigger is not `metric_appended`
- status / mode is not `captured` / `capture_only`
- key is not production-shaped
- safe preview cannot be generated
- rawJson, Telegram response body, bot token, chat id, `.env`, or
  `DATABASE_URL` output would be needed
- future live path sees Telegram API error, network error, timeout, or 429 /
  rate limit
- DB write scope would exceed the selected Notification sent / failed update
- Token, Metric, or HolderSnapshot writes would occur
- invocation is coming from scheduler / systemd before those are explicitly
  unlocked

Retry execution remains separate. Failed `live_send` rows belong to the retry
plan / retry execution lane, not the first auto live-send candidate lane.

## Dry-Run Preview

The next implementation should start with a read-only planner. Its preview
should include safe structured fields only:

- `readOnly`
- `dryRun`
- `autoSendEnabled`
- `candidateCount`
- `allowedCandidateCount`
- `blockedCandidateCount`
- `blockedReasons`
- per-candidate `blockedBy`
- `selectedNotificationId`
- `selectedTrigger`
- safe `notificationKey` summary
- `wouldSend`
- `wouldUpdateNotification`
- `expectedSideEffects`
- `expectedNonEffects`
- `stopConditionCodes`

The preview must not print Telegram token, chat id, environment values, raw
provider payloads, Telegram response bodies, or full message body text.

## Implementation Options

Option A: add a read-only planner CLI.

- Example script: `notification:auto-send:plan`
- Example implementation target:
  `src/cli/notificationAutoSendPlan.ts`
- Optional shared helper target:
  `src/notifications/notificationAutoSendGate.ts`
- Fully read-only
- no sender connection
- no Notification updates
- reports candidates, allowlist decisions, blockers, and stop conditions

Option B: extend existing `notification:send`.

- Example option: `--autoGate`
- Not recommended now because it mixes manual-send semantics with auto-send
  selection and increases accidental live-send risk.

Option C: add an auto-send CLI that defaults dry-run / disabled.

- Useful later, after planner behavior is stable
- Still too close to the sender path for the next Yellow slice

Recommendation: implement Option A first. The next Yellow task should add the
read-only planner only, tests for the gate decisions, and docs. It should not
connect the sender, add scheduler/systemd, execute Telegram live send, or
write Notification state.

## Scheduler / Systemd Boundary

Scheduler and systemd remain locked because:

- no dedicated auto-send planner exists yet
- no `NOTIFICATION_AUTO_SEND_ENABLED` implementation exists yet
- one-run max and duplicate / ambiguity handling are not implemented
- restart duplicate-send behavior has not been tested
- current live-send candidate count is `0`, so live execution cannot validate
  the path now

The next implementation should keep scheduler / systemd out of scope.
