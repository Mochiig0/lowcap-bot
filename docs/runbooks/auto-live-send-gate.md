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

## Read-Only Planner Implementation

Date: 2026-05-21

`notification:auto-send:plan` is now implemented as the first Yellow gate
slice. It is a read-only / dry-run planner only:

- package script:
  `pnpm -s notification:auto-send:plan`
- implementation:
  `src/cli/notificationAutoSendPlan.ts`
- planner helper:
  `src/notifications/notificationAutoSendPlanner.ts`
- sender connection: none
- Notification create/update: none
- Telegram send: none
- external fetch: none
- scheduler/systemd: none

The planner uses `NOTIFICATION_AUTO_SEND_ENABLED=true` as the future auto-send
enable switch. Unset, `false`, or any other value reports
`autoSendEnabled=false`. Even when the switch is `true`, this planner keeps
`wouldSend=false` and `wouldUpdateNotification=false`.

Preview fields include:

- `readOnly=true`
- `dryRun=true`
- `autoSendEnabled`
- `autoSendEnabledSource=NOTIFICATION_AUTO_SEND_ENABLED`
- `oneRunMax=1`
- `totalCapturedCount`
- `failedCount`
- `candidateCount`
- `allowedCandidateCount`
- `blockedCandidateCount`
- `selectedNotificationId`
- `selectedTrigger`
- `selectedNotificationKeySummary`
- `wouldSend=false`
- `wouldUpdateNotification=false`
- `stopConditionCodes`
- `blockedReasons`
- safe candidate summaries
- zero side-effect bounds

Runtime check against production DB:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- `NOTIFICATION_AUTO_SEND_ENABLED` unset:
  - `autoSendEnabled=false`
  - `totalCapturedCount=5`
  - `candidateCount=9`
  - `allowedCandidateCount=0`
  - `blockedCandidateCount=9`
  - `selectedNotificationId=null`
  - `wouldSend=false`
  - `wouldUpdateNotification=false`
  - stop conditions:
    `auto_send_disabled`, `no_allowed_candidate`,
    `only_sent_or_blocked_candidates`
- `NOTIFICATION_AUTO_SEND_ENABLED=true`:
  - `autoSendEnabled=true`
  - `totalCapturedCount=5`
  - `candidateCount=9`
  - `allowedCandidateCount=0`
  - `blockedCandidateCount=9`
  - `selectedNotificationId=null`
  - `wouldSend=false`
  - `wouldUpdateNotification=false`
  - stop conditions:
    `no_allowed_candidate`, `only_sent_or_blocked_candidates`

Current captured rows id `3` through `6` are blocked by
`smoke_or_rehearsal_notification`, and id `9` is blocked by the same rehearsal
guard plus non-production key shape. Sent rows id `7` and id `8` are blocked by
sent-row / live-send state and remain out of resend scope.

Auto live send execution remains unimplemented. Scheduler and systemd remain
locked.

## Planner Output Operations Preflight

Date: 2026-05-21

This Green preflight ran the implemented planner against production DB in
read-only mode. It did not send Telegram, update Notification state, execute
auto live send, run retry execution, fetch externally, write Token / Metric /
HolderSnapshot state, run Metric snapshot, run detector / ops catch-up, use
`--write`, `--watch`, or `--live`, enable scheduler / systemd, change schema,
change application code, print rawJson, or print secrets.

Commands:

```bash
pnpm -s notification:auto-send:plan
NOTIFICATION_AUTO_SEND_ENABLED=false pnpm -s notification:auto-send:plan
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:plan
pnpm -s notification:retry:plan
```

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- allowed auto-send candidate count: `0`

Disabled output, with the switch unset or explicitly `false`:

- `readOnly=true`
- `dryRun=true`
- `autoSendEnabled=false`
- `totalCapturedCount=5`
- `candidateCount=9`
- `allowedCandidateCount=0`
- `blockedCandidateCount=9`
- `selectedNotificationId=null`
- `wouldSend=false`
- `wouldUpdateNotification=false`
- `stopConditionCodes=[auto_send_disabled,no_allowed_candidate,only_sent_or_blocked_candidates]`
- blocked reasons included `auto_send_disabled=9`,
  `smoke_or_rehearsal_notification=6`, `already_sent=4`,
  `sent_at_present=4`, and `non_production_notification_key=2`

Enabled output, with `NOTIFICATION_AUTO_SEND_ENABLED=true`:

- `readOnly=true`
- `dryRun=true`
- `autoSendEnabled=true`
- `totalCapturedCount=5`
- `candidateCount=9`
- `allowedCandidateCount=0`
- `blockedCandidateCount=9`
- `selectedNotificationId=null`
- `wouldSend=false`
- `wouldUpdateNotification=false`
- `stopConditionCodes=[no_allowed_candidate,only_sent_or_blocked_candidates]`
- blocked reasons included `smoke_or_rehearsal_notification=6`,
  `already_sent=4`, `sent_at_present=4`, and
  `non_production_notification_key=2`

Candidate interpretation:

- captured ids `3` through `6` are `SMOKE_...` rehearsal rows and are blocked
  by `smoke_or_rehearsal_notification`
- captured id `9` is the `REHEARSAL:...` capture rehearsal row and is blocked
  by `smoke_or_rehearsal_notification` plus non-production key shape
- sent ids `7` and `8` are blocked by sent-row / live-send state
- failed row count is `0`
- retry candidate count is `0`

Judgment: planner output is sufficient for the next design decision. It makes
the no-send reason visible through `stopConditionCodes`, `blockedReasons`, and
per-candidate safe summaries without exposing full message bodies, rawJson, or
secrets. No immediate planner guard or field change is required.

Next recommended task: **Green: auto live-send execution implementation
preflight**. That task should design the future execution responsibility,
sender connection boundary, Notification sent / failed update scope, failure
handling, kill switch behavior, and stop conditions only. It should not
implement or run auto live send yet, and scheduler / systemd must remain
locked.

## Auto Live-Send Execution Implementation Preflight

Date: 2026-05-21

This was a read-only / docs-only preflight for the future auto live-send
execution path. It did not implement execution, send Telegram, update
Notifications, run `notification:send`, run retry execution, write DB state,
fetch externally, run Metric snapshot, run detector / ops catch-up, use
`--write`, `--watch`, or `--live`, enable scheduler / systemd, change schema,
change application code, print rawJson, or print secrets.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- allowed auto-send candidate count: `0`
- retry candidate count: `0`
- `NOTIFICATION_AUTO_SEND_ENABLED=true` planner output:
  `allowedCandidateCount=0`, `selectedNotificationId=null`,
  `wouldSend=false`, `wouldUpdateNotification=false`,
  `stopConditionCodes=[no_allowed_candidate,only_sent_or_blocked_candidates]`

Recommended execution CLI:

```bash
pnpm -s notification:auto-send:execute -- --execute
```

Design policy:

- add package script `notification:auto-send:execute`
- keep it separate from manual `notification:send`
- default mode without `--execute` should be dry-run / stopped summary only
- future real sender attempt requires both:
  - `NOTIFICATION_AUTO_SEND_ENABLED=true`
  - explicit `--execute`
- never use `--live` for this auto path; reserve `--live` for manual
  `notification:send`
- scheduler / systemd must not call this CLI until a later unlock task

Planner connection:

- execution must call the auto-send planner first
- continue only when `autoSendEnabled=true`
- continue only when `allowedCandidateCount=1`
- continue only when `selectedNotificationId` is present
- continue only when `stopConditionCodes=[]`
- continue only when selected candidate has no `blockedBy`
- stop when candidate count exceeds one-run max
- stop when failed count is greater than `0`
- stop for smoke / rehearsal, sent / `sentAt`-present, failed, retry, unsafe
  preview, duplicate, ambiguous, or non-production-shaped candidates
- because planner output intentionally avoids full keys, the execution helper
  may need an internal planner selection shape or a second read-only lookup by
  selected id before sender connection; that internal value must not be printed
  in full

Sender connection boundary:

- connect `sendOpsTelegramNotification()` only after every planner gate passes
- sender input should use only selected Notification `mint`, `metricId`,
  `trigger=metric_appended`, and existing safe `messagePreview`
- do not print Telegram token, chat id, request path, response body, or message
  full body
- no external fetch other than the Telegram send itself in a future approved
  execution run

Notification update scope:

Success:

- update exactly one selected Notification row
- set `status=sent`
- set `mode=live_send`
- set `sentAt`
- set `lastAttemptAt`
- clear failed / retry lease fields per existing `markNotificationSent()`
- do not store Telegram response body
- do not write Token, Metric, HolderSnapshot, or create Notification rows

Failure after sender connection:

- update exactly one selected Notification row
- set `status=failed`
- set `mode=live_send`
- set `failedAt`
- set `lastAttemptAt`
- store only sanitized `errorCode` / `reason`
- do not store Telegram raw response, token, chat id, request path, or secret
- do not auto-run retry
- next auto execution must stop because failed count becomes greater than `0`

Blocked / stopped before sender connection:

- do not update DB
- do not connect sender
- return safe summary with `blockedBy` / `stopConditionCodes`

Failure handling:

- sender `sent` result marks selected row sent
- Telegram API non-OK result marks selected row failed with sanitized error
- network error marks selected row failed with sanitized error
- timeout marks selected row failed with sanitized error
- sender throw marks selected row failed with sanitized error
- if failed marking itself fails, do not retry in the same run; return a safe
  execution error summary and require manual inspection
- one run performs no retry and no second candidate attempt

Execution summary should include safe fields only:

- `readOnly=false`
- `dryRun=false` only when `--execute` was supplied and all gates passed
- `autoSendEnabled`
- `selectedNotificationId`
- `selectedTrigger`
- `selectedNotificationKeySummary`
- `sendAttempted`
- `senderCalled`
- `sentCount`
- `updatedCount`
- `status=sent|failed|blocked|stopped`
- `blockedBy`
- `stopConditionCodes`
- `errorCode`
- `retryAttempted=false`
- `expectedSideEffects`
- `actualSideEffects`
- `expectedNonEffects`

The summary must not include full message body, rawJson, Telegram response
body, bot token, chat id, request path, `.env`, or `DATABASE_URL`.

Implementation decision:

- Candidate A, `notification:auto-send:execute`, is the recommended next
  Yellow task. It is the cleanest boundary and keeps auto send separate from
  manual `notification:send`.
- Candidate B, more planner fixture / allowed-candidate tests, is useful only
  as part of A. Existing planner output is sufficient, so a separate guard-only
  slice is not required.
- Candidate C, creating a real production-shaped captured candidate, is not
  recommended before the execution CLI exists. It would require external fetch
  and Metric / Notification writes.
- Candidate D, docs / handoff only, is safe but lower value.

Next recommended task: **Yellow: implement disabled-by-default
`notification:auto-send:execute` CLI with tests only**. Production runtime
should be limited to `--help` and planner checks; no production `--execute`,
Telegram send, Notification update, scheduler, or systemd.

## Auto Send Execute Implementation

Date: 2026-05-21

The disabled-by-default execution CLI is now implemented, but production
execution remains unrun.

Added:

- package script:
  `notification:auto-send:execute`
- CLI:
  `src/cli/notificationAutoSendExecute.ts`
- helper:
  `src/notifications/notificationAutoSendExecutor.ts`
- tests:
  `tests/notificationAutoSendExecute.test.ts`

Execution contract:

- default mode is a stopped dry-run summary
- explicit `--execute` is required before any send attempt
- `NOTIFICATION_AUTO_SEND_ENABLED=true` is required before any send attempt
- helper calls `buildNotificationAutoSendPlan()` first
- sender connection is allowed only after planner gate pass
- stopped / blocked runs do not connect the sender and do not update DB
- success uses the existing selected-row sent marking boundary
- sender failure / throw uses the existing selected-row failed marking
  boundary with sanitized error code / reason
- retry execution is never attempted in the auto-send execution run
- no scheduler / systemd integration was added

Mocked-sender tests covered:

- default no-`--execute` stops without sender call or DB update
- disabled kill switch stops before sender
- one allowed production-shaped candidate can be marked sent with a mocked
  sender
- mocked sender failure marks only the selected Notification failed
- mocked sender throw marks only the selected Notification failed with
  `ops_notify_sender_threw`
- smoke / rehearsal rows stop before sender
- more than one allowed candidate stops before sender
- summary omits full notification key, full message body, raw payload, and
  secret-looking strings

Production runtime checks:

```bash
node --import tsx src/cli/notificationAutoSendExecute.ts
NOTIFICATION_AUTO_SEND_ENABLED=true node --import tsx src/cli/notificationAutoSendExecute.ts
```

Both checks omitted `--execute`. Results:

- `executeRequested=false`
- `status=stopped`
- `blockedBy=[execute_flag_required]`
- `sendAttempted=false`
- `senderCalled=false`
- `sentCount=0`
- `updatedCount=0`
- default mode reported `autoSendEnabled=false`
- env-enabled mode reported `autoSendEnabled=true` but planner
  `allowedCandidateCount=0`

Current production DB state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- retry candidate count: `0`

`pnpm -s notification:auto-send:execute ...` uses `tsx` as requested. In the
default sandbox that package-script form hit the known local `tsx` IPC
`EPERM` limitation, so equivalent `node --import tsx ...` commands were used
first. The package script was then confirmed outside that sandbox for `--help`
and default no-`--execute` dry-run only. No production `--execute` was run.

Not executed:

- production `--execute`
- Telegram live send
- production Notification update
- retry execution
- scheduler / systemd
- Metric snapshot, detector, ops catch-up, import, enrich, or rescore

Next recommended task: **Green: review `notification:auto-send:execute`
no-execute runtime output**. After that, choose between one real
production-shaped capture-only candidate Red/Green slice and further mock-only
execution hardening.

## Execute No-Execute Runtime Review

Date: 2026-05-21

This Green operations review ran the implemented
`notification:auto-send:execute` CLI against production DB without `--execute`.
It did not send Telegram, update Notifications, create Notifications, write
Token / Metric / HolderSnapshot state, fetch externally, run retry execution,
run Metric snapshot, run detector / ops catch-up, use `--write`, `--watch`, or
`--live`, enable scheduler / systemd, change schema, change application code,
print rawJson, or print secrets.

Commands:

```bash
pnpm -s notification:auto-send:execute
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:execute
pnpm -s notification:auto-send:plan
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:plan
pnpm -s notification:retry:plan
```

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- allowed auto-send candidate count: `0`
- retry candidate count: `0`

Default no-execute result:

- `executeRequested=false`
- `readOnly=true`
- `dryRun=true`
- `autoSendEnabled=false`
- `status=stopped`
- `blockedBy=[execute_flag_required]`
- `sendAttempted=false`
- `senderCalled=false`
- `sentCount=0`
- `updatedCount=0`
- planner stop conditions:
  `auto_send_disabled`, `no_allowed_candidate`,
  `only_sent_or_blocked_candidates`

Env-enabled no-execute result:

- `executeRequested=false`
- `readOnly=true`
- `dryRun=true`
- `autoSendEnabled=true`
- `status=stopped`
- `blockedBy=[execute_flag_required]`
- `sendAttempted=false`
- `senderCalled=false`
- `sentCount=0`
- `updatedCount=0`
- planner `allowedCandidateCount=0`
- planner stop conditions:
  `no_allowed_candidate`, `only_sent_or_blocked_candidates`

Planner comparison:

- default planner: `allowedCandidateCount=0`, `blockedCandidateCount=9`,
  `stopConditionCodes=[auto_send_disabled,no_allowed_candidate,only_sent_or_blocked_candidates]`
- env-enabled planner: `allowedCandidateCount=0`, `blockedCandidateCount=9`,
  `stopConditionCodes=[no_allowed_candidate,only_sent_or_blocked_candidates]`
- captured ids `3` through `6`: `SMOKE_...` rehearsal rows, blocked by
  `smoke_or_rehearsal_notification`
- captured id `9`: `REHEARSAL:...` row, blocked by rehearsal guard and
  non-production key shape
- sent ids `7` and `8`: blocked by sent-row / live-send state
- failed count: `0`
- retry candidate count: `0`

Source inspection confirmed the no-execute CLI passes no sender when
`--execute` is absent, and the executor calls the existing live-send helper
only after the planner gate passes.

Judgment: no-execute runtime output is sufficient for operator review. It
clearly shows the explicit `execute_flag_required` blocker and shows that even
with the env switch enabled, no sender call or Notification update happens
without `--execute`. No immediate output field or guard change is required.

Next recommendation: **Green: real production-shaped capture-only candidate
creation preflight**. The goal is to determine whether one bounded
Telegram-free Metric / Notification capture can create exactly one normal
production-shaped captured candidate for future auto-send planning. This is
not production `--execute`; Telegram send, auto live-send execution,
scheduler, and systemd remain forbidden. Candidate creation itself would be a
later Red/Green exact command because it may involve an external
GeckoTerminal fetch plus Metric write and Notification create.

## Production-Shaped Capture Candidate Command

Date: 2026-05-22

This Green preflight selected the next human-approval Red command candidate for
creating one normal production-shaped capture-only Notification. It was
read-only / docs-only. The command below was not run; no Metric write,
Notification create/update, external fetch, Telegram send, auto-send
execution, retry execution, scheduler, systemd, schema / migration change, app
code change, rawJson full dump, or secret output occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- enabled planner `allowedCandidateCount=0`
- retry candidate count: `0`

Selected mint:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`
- Token id `5619`
- source `geckoterminal.new_pools`
- metadata status `mint_only`
- existing Metric count `4`
- existing Notification count `0`
- latest Metric id `1471`, source `geckoterminal.token_snapshot`,
  observed at `2026-05-19T14:12:03.801Z`

The selected mint is a pump mint with existing GeckoTerminal snapshot history,
so it is a natural exact `--mint` target. It has no existing Notification,
which keeps the future candidate distinct from the current SMOKE / REHEARSAL
rows. The command intentionally omits `--minGapMinutes`; exact mint mode only
skips for recent metrics when that option is explicitly supplied.

Read-only implementation check:

- `metric:snapshot:geckoterminal -- --help` confirms single `--mint --write`
  mode captures a `metric_appended` Notification by default
- source inspection shows `buildMetricAppendedNotificationKey()` returns
  `<mint>:metric_appended:<metricId>` when no
  `--notificationRehearsalTag` is provided
- write path creates at most one Metric row and then calls
  `maybeCreateByNotificationKey()` once for exact `--mint` capture
- the command does not call Telegram sender or auto-send execute

Next Red exact command candidate, not executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --write
```

Expected side effects if later approved:

- external GeckoTerminal fetch max `1`
- Metric write max `1`
- Notification create max `1`
- captured Notification status `captured`, mode `capture_only`, trigger
  `metric_appended`
- production-shaped notificationKey
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:<metricId>`

Expected non-effects:

- Telegram send `0`
- Notification sent update `0`
- Notification failed update `0`
- Token create/update `0`
- HolderSnapshot write `0`
- retry execution `0`
- scheduler / systemd `0`
- auto live-send execution `0`
- repo-local data diff `0`
- rawJson full dump `0`

Expected planner result after one successful future run:

- current SMOKE / REHEARSAL captured rows remain blocked
- sent rows remain blocked
- failed count remains `0`
- enabled `notification:auto-send:plan` should move from
  `allowedCandidateCount=0` to `allowedCandidateCount=1`
- production `notification:auto-send:execute -- --execute` remains forbidden
  until that future candidate is reviewed separately

## Production-Shaped Capture Candidate Result

Date: 2026-05-22

The selected Red command was run once with human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --write
```

No retry, second command, replacement mint, `--notificationRehearsalTag`,
`--noNotificationCapture`, `--watch`, `--live`, notification send, retry
execution, auto-send execution, scheduler, systemd, import, enrich, rescore,
schema change, migration, app code change, rawJson full dump, or secret output
occurred.

Command result:

- selected `1`
- written `1`
- skipped `0`
- error `0`
- provider error: none
- 429: none
- Metric id `1531`
- Notification id `10`

DB before / after:

- Token `1536 -> 1536`
- Metric `448 -> 449`
- Notification `9 -> 10`
- HolderSnapshot `1 -> 1`
- Notification statuses `captured=5,sent=4 -> captured=6,sent=4`
- failed count `0`

New Notification:

- id `10`
- notificationKey
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:1531`
- production-shaped key: yes
- SMOKE / REHEARSAL marker: no
- status `captured`
- mode `capture_only`
- trigger `metric_appended`
- sentAt `null`
- failedAt `null`
- errorCode `null`
- source `metric:snapshot:geckoterminal`
- rawJsonFree `true`
- secretFree `true`

Planner result:

- disabled planner: `allowedCandidateCount=0`; id `10` is blocked only by
  `auto_send_disabled`
- enabled planner: `allowedCandidateCount=1`,
  `selectedNotificationId=10`,
  `selectedNotificationKeySummary=production_metric_appended:1531`,
  `wouldSend=false`, `wouldUpdateNotification=false`,
  `stopConditionCodes=[]`
- retry planner: `candidateCount=0`
- default `notification:auto-send:execute` no-`--execute`:
  `senderCalled=false`, `updatedCount=0`
- env-enabled `notification:auto-send:execute` no-`--execute`:
  `selectedNotificationId=10`, `blockedBy=[execute_flag_required]`,
  `senderCalled=false`, `sentCount=0`, `updatedCount=0`

Confirmed side effects:

- external GeckoTerminal fetch: yes, bounded one-shot token snapshot
- Metric write: yes, `+1`
- Notification create: yes, `+1`
- Telegram send: no
- Notification sent / failed update: no
- Token write: no
- HolderSnapshot write: no
- retry execution: no
- auto live-send execution: no
- scheduler / systemd: no
- repo-local file diff from command: no
- rawJson full dump: no

Next step should be a Green review of id `10` as the sole enabled
auto-send planner candidate. Production `--execute` remains locked until that
review explicitly approves a later execution slice.

## Sole Auto-Send Candidate Review

Date: 2026-05-22

This Green review confirmed Notification id `10` remains the sole enabled
auto-send planner candidate. It was read-only / docs-only. No production
`--execute`, Telegram send, Notification create/update, Metric write, external
fetch, retry execution, metric snapshot, detector / ops catch-up, `--write`,
`--watch`, `--live`, scheduler, systemd, schema / migration change, app code
change, rawJson full dump, or secret output occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 449 / 10 / 1`
- Notification statuses: `captured=6`, `sent=4`, `failed=0`
- retry candidate count: `0`
- manual live-send candidate count: `1`, id `10`
- enabled auto-send candidate count: `1`, id `10`

Notification id `10`:

- status `captured`
- mode `capture_only`
- eventType / trigger `metric_appended`
- notificationKey
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:1531`
- production-shaped key: yes
- SMOKE / REHEARSAL marker: no
- sentAt `null`
- failedAt `null`
- errorCode `null`
- rawJsonFree `true`
- secretFree `true`

Planner review:

- disabled planner:
  - `autoSendEnabled=false`
  - `allowedCandidateCount=0`
  - `selectedNotificationId=null`
  - `stopConditionCodes=[auto_send_disabled,no_allowed_candidate,only_sent_or_blocked_candidates]`
  - id `10` is blocked only by `auto_send_disabled`
  - `wouldSend=false`, `wouldUpdateNotification=false`
- enabled planner:
  - `autoSendEnabled=true`
  - `allowedCandidateCount=1`
  - `selectedNotificationId=10`
  - `selectedTrigger=metric_appended`
  - `selectedNotificationKeySummary=production_metric_appended:1531`
  - `stopConditionCodes=[]`
  - `wouldSend=false`, `wouldUpdateNotification=false`
  - `blockedCandidateCount=9`

Candidate boundary:

- ids `3` through `6`: captured SMOKE rows, blocked by
  `smoke_or_rehearsal_notification`
- id `9`: captured REHEARSAL row, blocked by rehearsal guard and
  non-production key shape
- ids `7` and `8`: sent rows, blocked by sent state / `sentAt`
- id `10`: the only allowed auto-send candidate
- id `10` is also the only manual live-send candidate by shape and captured
  state; this review does not approve manual live send
- retry planner candidate count remains `0`

Executor no-execute review:

- default no-`--execute`: `executeRequested=false`,
  `autoSendEnabled=false`, `status=stopped`,
  `blockedBy=[execute_flag_required]`, `senderCalled=false`,
  `sendAttempted=false`, `sentCount=0`, `updatedCount=0`
- env-enabled no-`--execute`: `executeRequested=false`,
  `autoSendEnabled=true`, `selectedNotificationId=10`,
  `blockedBy=[execute_flag_required]`, `senderCalled=false`,
  `sendAttempted=false`, `sentCount=0`, `updatedCount=0`

Judgment: planner and executor output are sufficient. No additional guard or
field is required before the next preflight. Production `--execute` remains
forbidden in this slice.

Next recommended task: **Green: production `--execute` preflight for id 10**.
It should pin id `10`, restate kill switch / expected side effects, and keep
Telegram execution unrun until a separate Red approval.
