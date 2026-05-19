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
