# Notification Send Failure Preflight

Date: 2026-05-17

This is a read-only / docs-only audit before any failed-send Red rehearsal. It
does not run `notification:send`, send Telegram, retry, resend, start a worker,
write DB state, fetch external APIs, or change application code / schema.

## Repo And Scope

- Audit commit: `292327f72182b221bedf2f800a652bc9505b85c1`
  (`docs: record metric notification live send result`).
- Working tree at audit start: clean.
- `package.json` exposes `notification:send` as
  `node --import tsx src/cli/notificationLiveSend.ts`.
- Telegram environment variables were checked for presence only; values were
  not printed.
- Inspected files:
  - `src/cli/notificationLiveSend.ts`
  - `src/notifications/notificationLiveSend.ts`
  - `src/notifications/notificationRepository.ts`
  - `src/cli/notificationRetryPlan.ts`
  - `src/notify/opsNotificationSendGate.ts`
  - `src/notify/opsTelegramSender.ts`
  - `tests/notificationLiveSend.test.ts`
  - `tests/notificationRetryPlan.test.ts`
  - `prisma/schema.prisma`

## Current DB State

Read-only counts:

- Token: `1296`
- Metric: `198`
- Notification: `8`
- HolderSnapshot: `1`

Notification status summary:

- `captured` / `capture_only`: `5`
- `sent` / `live_send`: `3`
- `failed`: `0`
- retry candidates matching the implemented policy: `0`

Important rows:

- Notification `id=7`:
  - `status=captured`
  - `mode=capture_only`
  - `eventType=metric_appended`
  - `trigger=metric_appended`
  - `mint=ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`
  - `metricId=1277`
  - `sentAt=null`
  - `failedAt=null`
  - `retryCount=0`
  - `nextRetryAt=null`
  - `leaseUntil=null`
  - `workerId=null`
  - `rawJsonFree=true`
  - `secretFree=true`
- Notification `id=8`:
  - `status=sent`
  - `mode=live_send`
  - `eventType=metric_appended`
  - `trigger=metric_appended`
  - `mint=EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
  - `metricId=1279`
  - `sentAt=2026-05-17T02:20:23.560Z`
  - `failedAt=null`
  - `lastAttemptAt=2026-05-17T02:20:23.560Z`
  - `retryCount=0`
  - `nextRetryAt=null`
  - `leaseUntil=null`
  - `workerId=null`
  - `rawJsonFree=true`
  - `secretFree=true`

## notification:send Boundary

The CLI parses only:

```bash
pnpm notification:send -- --notificationKey <KEY> --trigger metric_appended [--live] [--retryFailed]
```

Observed code boundary:

- Dry-run is the default. Without `--live`, the command reports
  `status=ready`, `senderCalled=false`, `sentCount=0`, and `updatedCount=0`
  for an eligible captured row.
- Only `metric_appended` is accepted by the CLI parser.
- The service looks up exactly one row by `notificationKey`.
- `notificationKey` is unique in Prisma schema, so a key cannot fan out to
  multiple rows.
- If the DB row has an event / trigger mismatch, it blocks before sender call.
- If the row is already `sent`, it blocks with `notification_already_sent`
  before sender call.
- Without `--retryFailed`, a row must be `status=captured` and
  `mode=capture_only`.
- With `--retryFailed`, a row must be `status=failed` and `mode=live_send`.
- Missing mint or missing `metricId` blocks before sender call.
- `sender` is connected only when `--live` is set.

## Failure Marking

If `--live` is set, the row is eligible, and the sender returns failure or
throws, `sendNotificationByKey` updates the existing Notification row only:

- `status=failed`
- `mode=live_send`
- `failedAt=<current time>`
- `lastAttemptAt=<same failedAt time>`
- `errorCode=<safe normalized code>`
- `reason=ops_notify_send_failed`
- `leaseUntil=null`
- `workerId=null`

`markNotificationFailed` leaves `nextRetryAt` unchanged unless an explicit
`nextRetryAt` is passed. The direct `notification:send` path does not pass one.
It also does not increment `retryCount`; retry count increment happens only in
the separate claim helper.

Safe error code behavior:

- Allowed error codes include `ops_notify_sender_failed`,
  `ops_notify_sender_threw`, `telegram_credentials_missing`,
  `telegram_response_not_ok`, `telegram_timeout`, and
  `telegram_network_error`.
- Unknown / unsafe sender error codes are normalized to
  `ops_notify_sender_failed`.
- Tests confirm unsafe sender output is not copied into stored fields.
- Temp-SQLite / mocked-sender tests now also cover a sender throw. The expected
  result is one existing Notification row updated to `failed/live_send`,
  `failedAt` and `lastAttemptAt` set, `errorCode=ops_notify_sender_threw`,
  `reason=ops_notify_send_failed`, `sentAt=null`, no new Notification rows, and
  unchanged Token / Metric / HolderSnapshot counts. The thrown error text is
  not stored.

## Retry Eligibility

The retry planner is read-only and selects only rows matching all of:

- `eventType=metric_appended`
- `trigger=metric_appended`
- `status=failed`
- `mode=live_send`
- `rawJsonFree=true`
- `secretFree=true`
- non-empty `notificationKey`
- non-empty `mint`
- non-null `metricId`
- `retryCount < 3`
- `nextRetryAt` is null or due
- `leaseUntil` is null or expired

Current DB has no failed rows and no retry candidates.

Current DB confirmation on 2026-05-17:

- Counts: Token / Metric / Notification / HolderSnapshot =
  `1296 / 198 / 8 / 1`.
- Notification status counts: `captured/capture_only=5`,
  `sent/live_send=3`, `failed=0`.
- Notification `id=7` is `captured/capture_only` with `metricId=1277`,
  `sentAt=null`, and is not a retry candidate.
- Notification `id=8` is `sent/live_send` with `metricId=1279`,
  `sentAt=2026-05-17T02:20:23.560Z`, and is not a retry candidate.
- `pnpm -s notification:retry:plan` returned `status=stop`,
  `mode=read_only_retry_planner`, `willExecute=false`, `executor=none`,
  `candidateCount=0`, `selectedCount=0`, `selected=null`,
  `nextRedCommand=null`, and
  `stopConditionCodes=[no_failed_retry_candidate]`.
- The plan command did not call Telegram, update DB state, execute retry,
  create Notifications, start worker / scheduler paths, or expose secrets.

Manual retry command shape, if a failed row exists and a separate Red approval
is granted:

```bash
pnpm -s notification:send -- --notificationKey <FAILED_KEY> --trigger metric_appended --live --retryFailed
```

This command is not approved by this preflight.

## Dedupe And Resend Safety

- Sent rows are blocked before sender call, so Notification `id=8` is not a
  resend candidate through normal `notification:send`.
- The resend guard has been tightened after this audit: any row with non-null
  `sentAt` is also blocked before sender call, even if the status is
  inconsistent and not `sent`.
- Blocked resend output is a safe summary only and can include
  `notificationStatus` plus `sentAtPresent`; it does not include Telegram
  response bodies, rawJson, env values, or secrets.
- Captured rows such as Notification `id=7` can be a first live-send target,
  but are not retry candidates until a live-send failure marks them
  `failed/live_send`.
- `notificationKey` uniqueness prevents one key from updating multiple rows.
- `notification:send` updates an existing row; it does not create
  Notification rows.
- Retry claim / lease helpers are separate from direct `notification:send`.

## Red Failure Rehearsal Decision

Do not run a production DB failure rehearsal yet.

Reason:

- The only current way to exercise failure marking through the CLI is to make a
  real `--live` sender fail for an otherwise eligible captured row.
- That would consume / mutate a captured production Notification such as
  `id=7` into `failed/live_send`, or require intentionally invalid Telegram
  environment input.
- It would still be a Telegram live-send attempt and a DB write, not a safe
  Green / Yellow audit.
- Unit tests already cover failed sender return, thrown sender, unsafe error
  normalization, already-sent blocking, non-captured blocking, and manual retry
  behavior with temp SQLite and mocked senders.

Recommended next step if failure rehearsal is still needed:

- Add a Yellow-only simulated-failure or isolated-temp-DB operator harness that
  can exercise `markNotificationFailed` without using real Telegram and
  without mutating production captured rows.

No production Red failure exact command is approved by this preflight.

## Not Executed

- `notification:send`
- Telegram live send
- retry / resend / worker claim
- batch send
- scheduler
- systemd
- watch
- metric snapshot
- detect
- import / enrich / rescore
- DB write
- external fetch
- schema / migration / application code changes
- secret / env value display
