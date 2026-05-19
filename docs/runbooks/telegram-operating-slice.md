# Telegram Operating Slice Preflight

Date: 2026-05-20

This Green preflight closes the current outcome/report slice with Policy C and
prepares the next manual-approved Telegram operating step. It is docs-only. No
Telegram send, production DB write, Notification create/update, external fetch,
Metric snapshot, detect watch, retry execution, scheduler, systemd, schema
change, migration, application code change, or rawJson full dump was executed.

## Report Slice Decision

Outcome/report work is paused at Policy C:

- strict `alertFdv` remains the only baseline for `outcomeLabel`
- strict ±5m alert-FDV lookup is unchanged
- `entryAnchor*` fields remain report-only context
- Policy D is a future candidate only, and only as a separate limited
  mint-only fallback mode
- D180 / D360 are not recommended because most current entry anchors are
  materially delayed

The next operating slice can return to manual Telegram work. Auto live send,
scheduler, worker, queue, and systemd delivery remain locked.

## Current DB State

Read-only state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

## Notification Scripts And Boundaries

Scripts confirmed in `package.json`:

- `notification:send`: `node --import tsx src/cli/notificationLiveSend.ts`
- `notification:retry:plan`: `node --import tsx src/cli/notificationRetryPlan.ts`

`notification:send -- --help` prints the expected usage only. The send path:

- requires one `--notificationKey`
- requires `--trigger metric_appended`
- calls the sender only with explicit `--live`
- blocks sent rows by `status=sent` or `sentAt != null`
- blocks failed-row retry unless `--retryFailed` is provided
- updates only the existing selected Notification row on live success/failure
- creates no Notification, Token, Metric, or HolderSnapshot rows

`notification:retry:plan` is read-only. In the current DB it returned:

- `status=stop`
- `mode=read_only_retry_planner`
- `willExecute=false`
- `candidateCount=0`
- `selectedCount=0`
- `stopConditionCodes=[no_failed_retry_candidate]`

Because failed rows are absent, retry execution is unnecessary.

## Captured Notification Rows

Captured / capture-only rows:

| id | notificationKey | tokenId | metricId | status | mode | sentAt | reason |
| ---: | --- | ---: | ---: | --- | --- | --- | --- |
| `3` | `SMOKE_1778516915832_METRIC_SNAPSHOT:metric_appended:1265` | `5164` | `1265` | `captured` | `capture_only` | `null` | smoke/rehearsal row, not preferred |
| `4` | `SMOKE_1778516915832_METRIC_SNAPSHOT:metric_appended:1266` | `5164` | `1266` | `captured` | `capture_only` | `null` | smoke/rehearsal row, not preferred |
| `5` | `SMOKE_1778516915832_METRIC_SNAPSHOT:metric_appended:1267` | `5164` | `1267` | `captured` | `capture_only` | `null` | smoke/rehearsal row, not preferred |
| `6` | `SMOKE_1778516915832_METRIC_SNAPSHOT_GAP:metric_appended:1268` | `5172` | `1268` | `captured` | `capture_only` | `null` | smoke/rehearsal row, not preferred |
| `7` | `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277` | `5376` | `1277` | `captured` | `capture_only` | `null` | preferred manual live-send candidate |

All captured rows have `eventType=metric_appended`, `trigger=metric_appended`,
`retryCount=0`, `nextRetryAt=null`, `leaseUntil=null`, `workerId=null`,
`lastAttemptAt=null`, `rawJsonFree=true`, and `secretFree=true`.

Sent rows:

- id `1`: sent/live_send
- id `2`: sent/live_send retry rehearsal row
- id `8`: sent/live_send for
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279`

Failed rows: `0`.

## Manual Approved Red Candidate

Candidate command, not executed in this preflight:

```bash
pnpm -s notification:send -- --notificationKey ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277 --trigger metric_appended --live
```

Human approval is required before running it.

Expected side effects if approved:

- Telegram send max: `1`
- existing Notification id `7` update max: `1`
- expected target state after success: `status=sent`, `mode=live_send`,
  `sentAt != null`, `lastAttemptAt != null`

Expected non-effects:

- no new Notification row
- no Token create/update
- no Metric create/update
- no HolderSnapshot write
- no retry execution
- no scheduler, worker, queue, or systemd
- no raw provider response or secret output

Stop before execution if Notification id `7` is no longer
`captured/capture_only`, if `sentAt` is present, if the trigger or metric id
does not match, if the command cannot remain exactly one live-send command, or
if message preview safety cannot be checked without printing secrets.

## Current Policy

- Manual approved live send: allowed only as one human-approved
  `notification:send --live` command for one captured row.
- Retry: planner is read-only; retry execution requires a separate one-row Red
  approval and is unnecessary while failed count is `0`.
- Auto live send: not enabled.
- Scheduler/systemd: not enabled.
- Captured rows are not standing permission to send.

## Manual Live Send Result For Notification 7

Date: 2026-05-20

Human-approved Red execution ran exactly one live-send command:

```bash
pnpm -s notification:send -- --notificationKey ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277 --trigger metric_appended --live
```

Command result:

- `status=sent`
- `sentCount=1`
- `updatedCount=1`
- `senderCalled=true`
- `notificationId=7`
- `metricId=1277`
- `blockedBy=[]`
- `errorCode=null`

Before:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`
- Notification id `7`: `status=captured`, `mode=capture_only`,
  `sentAt=null`, `trigger=metric_appended`, `metricId=1277`,
  `tokenId=5376`

After:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- Notification id `7`: `status=sent`, `mode=live_send`,
  `sentAt=2026-05-19T20:36:12.458Z`,
  `lastAttemptAt=2026-05-19T20:36:12.458Z`, `failedAt=null`,
  `errorCode=null`, `reason=null`, `retryCount=0`, `nextRetryAt=null`,
  `leaseUntil=null`, `workerId=null`, `rawJsonFree=true`, and
  `secretFree=true`

Confirmed non-effects:

- no Notification row was created
- no Token write
- no Metric write
- no HolderSnapshot write
- no retry execution
- no scheduler / systemd / auto live send
- no repo-local data diff before docs update
- no rawJson full dump or secret value was printed

Auto live send remains locked. This was a single manual-approved live send, not
permission to batch-send or automatically advance captured rows.

## Post Manual Send Boundary Review

Date: 2026-05-20

This Green follow-up rechecked Notification state after the manual live send
for Notification id `7`. It was read-only / docs-only. No `notification:send`,
retry execution, Telegram send, Notification update, production DB write,
external fetch, Metric snapshot, detect watch, scheduler, systemd, schema
change, migration, application code change, or rawJson full dump was executed.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`

Sent rows:

- id `1`: `sent/live_send`
- id `2`: `sent/live_send` retry rehearsal row
- id `7`: `sent/live_send`,
  `notificationKey=ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump:metric_appended:1277`,
  `sentAt=2026-05-19T20:36:12.458Z`,
  `lastAttemptAt=2026-05-19T20:36:12.458Z`, `failedAt=null`,
  `errorCode=null`, `reason=null`
- id `8`: `sent/live_send`,
  `notificationKey=EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279`

Captured rows remaining:

| id | notificationKey | tokenId | metricId | status | mode | decision |
| ---: | --- | ---: | ---: | --- | --- | --- |
| `3` | `SMOKE_1778516915832_METRIC_SNAPSHOT:metric_appended:1265` | `5164` | `1265` | `captured` | `capture_only` | smoke/rehearsal row; do not send |
| `4` | `SMOKE_1778516915832_METRIC_SNAPSHOT:metric_appended:1266` | `5164` | `1266` | `captured` | `capture_only` | smoke/rehearsal row; do not send |
| `5` | `SMOKE_1778516915832_METRIC_SNAPSHOT:metric_appended:1267` | `5164` | `1267` | `captured` | `capture_only` | smoke/rehearsal row; do not send |
| `6` | `SMOKE_1778516915832_METRIC_SNAPSHOT_GAP:metric_appended:1268` | `5172` | `1268` | `captured` | `capture_only` | smoke/rehearsal row; do not send |

All four remaining captured rows are `metric_appended` / `capture_only`,
`sentAt=null`, `retryCount=0`, `rawJsonFree=true`, and `secretFree=true`, but
they are not manual live-send candidates because their keys and mints are
smoke/rehearsal artifacts.

`notification:retry:plan` remains read-only and returned:

- `status=stop`
- `candidateCount=0`
- `selectedCount=0`
- `nextRedCommand=null`
- `stopConditionCodes=[no_failed_retry_candidate]`

Operational boundary:

- current manual live-send candidate: none
- current retry candidate: none
- sent rows id `7` and id `8` must not be resent; sent-row guard remains the
  operational boundary
- captured smoke/rehearsal rows id `3` through `6` are explicitly out of
  scope for manual live send
- auto live send, scheduler, worker, queue, and systemd remain disabled

## Auto Live Send Guardrails

Date: 2026-05-20

This docs-only policy closes the current manual live-send slice and defines the
minimum guardrails before any future auto live send work. No Telegram send,
production DB write, Notification update, external fetch, retry execution,
Metric snapshot, detect watch, scheduler, systemd, schema change, migration,
application code change, or rawJson full dump was executed.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- current manual live-send candidate: none
- current retry candidate: none
- remaining captured rows id `3` through `6` are smoke/rehearsal rows and are
  send-excluded

Auto live send remains locked until at least all of these are true:

- capture-only creation path is stable for the intended production source
- sent-row resend prevention remains tested and active
- failed marking remains tested and active
- `notification:retry:plan` remains read-only and stable
- smoke/rehearsal rows are excluded by explicit policy and implementation
- multiple manual live sends have succeeded without side effects
- a disable switch / kill switch is implemented and documented
- an operator can stop delivery with one command or config change
- scheduler/systemd remain separated from the first auto-send validation

Initial allowlist, if future auto live send is implemented:

- `trigger=metric_appended`
- `eventType=metric_appended`
- `status=captured`
- `mode=capture_only`
- `sentAt=null`
- `status!=sent`
- `notificationKey` matches the expected
  `<mint>:metric_appended:<metricId>` pattern
- key and mint are not smoke/rehearsal artifacts
- row is not `failed`
- row is not a retry candidate
- `metricId` and mint are present
- safe preview is available without raw payloads or secrets
- one run processes at most one row, or another small explicit upper bound
- the same candidate can be observed in dry-run / plan output first

Stop auto live send immediately if any of these are true:

- failed Notification count is greater than `0`
- Telegram API error, timeout, network error, or rate limit occurs
- result contains any `blockedBy` reason
- a sent row or `sentAt`-present row appears in candidates
- smoke/rehearsal row appears in candidates
- trigger or event type is not the allowlisted value
- duplicate `notificationKey` or identity ambiguity appears
- safe preview cannot be generated
- disable switch is off
- DB write scope expands beyond the selected Notification row
- Token, Metric, or HolderSnapshot writes would occur
- rawJson, Telegram response body, token, chat id, `.env`, or `DATABASE_URL`
  output would be needed

Disable switch / kill switch policy:

- existing implementation has no dedicated auto-send env switch today
- current live-send guard is CLI-level: sender is connected only with explicit
  `--live`
- future auto send must add an explicit switch before scheduler/systemd work
- candidate names to evaluate later:
  - `NOTIFICATION_AUTO_SEND_ENABLED=false`
  - `TELEGRAM_LIVE_SEND_ENABLED=false`
  - `AUTO_LIVE_SEND_DISABLED=true`
- scheduler/systemd must not call `notification:send --live` until that switch
  exists, defaults safe, and is verified in tests / dry-run

Scheduler/systemd remain locked because auto candidate selection, disable
switch behavior, restart duplicate-send behavior, and failure handling have not
yet been validated in an always-on process.

## Capture-Only Notification Preflight

Date: 2026-05-20

The read-only preflight in
`docs/runbooks/capture-only-notification-rehearsal.md` confirmed the current
capture-only Notification write paths and kept auto live send locked.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- captured ids `3` through `6` remain `SMOKE_...` rehearsal rows and are
  manual-live-send excluded

Capture-only DB Notification creation exists in two places:

- single-mint `metric:snapshot:geckoterminal --write`, which also writes one
  Metric and fetches GeckoTerminal
- capture-only `ops:catchup:gecko --write --metricAppend
  --opsNotifyCaptureFile <PATH>` when exactly one eligible metric-appended
  capture result exists and `--opsNotify` is omitted

No exact small Red rehearsal command is approved yet. Both current write paths
can create production-shaped keys `<mint>:metric_appended:<metricId>` without a
dedicated rehearsal marker, so a new captured row could mix with manual
live-send review. The next useful step is a small Yellow guard/design slice for
an explicit rehearsal discriminator or planner guard before any production DB
capture-only Red rehearsal.

## Smoke / Rehearsal Send Guard

Date: 2026-05-20

`notification:send` and `notification:retry:plan` now exclude explicit smoke /
rehearsal rows without schema changes. The guard blocks keys or mints beginning
with `SMOKE_`, `SMOKE:`, `REHEARSAL_`, or `REHEARSAL:`, plus explicit marker
segments such as `_rehearsal_`.

Effects:

- captured smoke / rehearsal rows are not live-sendable
- `notification:send --live` blocks them with
  `blockedBy=["smoke_or_rehearsal_notification"]`
- failed smoke / rehearsal rows are not retry candidates
- sent-row resend prevention remains unchanged
- normal production-shaped keys keep their existing behavior

This Yellow guard did not execute `notification:send`, retry execution,
Telegram live send, Metric snapshot, detect watch, `--write`, `--watch`,
`--live`, import, enrich, rescore, scheduler, systemd, schema change, or
migration. Auto live send remains locked.

## Marker-Capable Capture Rehearsal Check

Date: 2026-05-20

A read-only follow-up checked whether an exact marker-capable capture-only Red
command already exists. It does not.

Findings:

- `metric:snapshot:geckoterminal` can create a capture-only
  `metric_appended` DB Notification in single `--mint --write` mode, but the
  key is fixed to `<mint>:metric_appended:<metricId>`.
- `ops:catchup:gecko --opsNotifyCaptureFile <PATH>` can create local
  capture-only preview JSONL records and, in the metric-append write path, can
  create one DB Notification, but the DB Notification key is also fixed to
  `<mint>:metric_appended:<metricId>`.
- no existing option adds `SMOKE` / `REHEARSAL` to the DB Notification key or
  another existing identifying field.
- because marker generation is unavailable, no next Red command is approved.

The next useful Yellow is a small `metric:snapshot:geckoterminal` option for
rehearsal capture, keeping the production default key unchanged and producing a
`REHEARSAL:`-marked Notification key that the existing send / retry guard will
exclude.

## Metric Snapshot Rehearsal Tag

Date: 2026-05-20

`metric:snapshot:geckoterminal` now supports a narrow rehearsal marker option:

```bash
--notificationRehearsalTag <TAG>
```

It does not change the production default key
`<mint>:metric_appended:<metricId>`. When explicitly used in exact
`--mint --write` one-shot mode, the capture-only Notification key is
`REHEARSAL:<TAG>:<mint>:metric_appended:<metricId>`.

Constraints:

- `TAG` is non-empty, max 40 characters, and limited to letters, numbers,
  underscore, and hyphen
- batch mode is rejected
- no-`--write` dry-run usage is rejected
- `--noNotificationCapture` is rejected
- `--watch` is rejected

The generated `REHEARSAL:` key is blocked by the existing live-send and retry
guard. This implementation did not run a capture-only Red rehearsal, did not
write production DB rows, did not fetch externally, did not send Telegram, and
does not enable auto live send, scheduler, or systemd.
