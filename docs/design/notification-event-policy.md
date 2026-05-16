# Notification Event Policy

## Purpose

This document fixes the MVP policy for `Notification` event fields and retry
state.

`Notification` is a history model for Telegram notification lifecycle events or
notification candidates. It records what became notification-worthy, how the
notification was captured or sent, and enough durable state for dedupe and
manual retry foundations.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No Notification implementation change.
- No Prisma relation addition for `Notification.tokenId` or
  `Notification.metricId`.
- No enumization.
- No retry worker, queue, scheduler, or systemd implementation.
- No existing row migration.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No `metrics:window-report` implementation change.
- No `metric:snapshot:geckoterminal` implementation change.
- No `pnpm smoke`.

## Responsibility

`Notification` represents:

- an event confirmed as notification-worthy.
- capture-only / live-send / dry-run-equivalent notification processing
  results.
- a durable `notificationKey` for dedupe.
- an `alertedAt` timestamp source for Metric outcome evaluation.
- minimal retry / resend state.

`Notification` does not represent:

- `Token.source`.
- `Metric.source`.
- `HolderSnapshot.source`.
- `outcomeLabel`.
- Metric results.
- `scoreBreakdown`.
- a full queue / worker system.
- an automatic trading signal.

Important:

- `Notification` is notification event history.
- `alertedAt` should prefer `Notification.sentAt` / `capturedAt`.
- `Notification.trigger`, `mode`, and `status` are separate from
  `Token.source`.
- `Notification` is not a buy signal.

## Field Split

### `status`

`Notification.status` is the lifecycle result of a notification attempt or
candidate.

Known DB `Notification.status` values observed in code / docs:

- `captured`
- `sent`
- `failed`

Known non-DB preview / capture / send result statuses observed in code / docs:

- `skipped`
- `blocked`
- `ready`

Those non-DB values describe local preview / gate results today. Do not assume
they are persisted `Notification.status` values unless a future implementation
explicitly adds them.

`status` is not source, trigger, or mode.

### `mode`

`Notification.mode` is the notification execution mode.

Known DB `Notification.mode` values observed in code / docs:

- `capture_only`
- `live_send`

Known non-DB planner / CLI mode labels observed in code / docs include values
such as `read_only_retry_planner`, but those are command-result modes, not
`Notification.mode`.

`mode` describes how notification handling ran. It is not the notification
reason and not `Token.source`.

### `trigger`

`Notification.trigger` is the reason or event type that caused the notification
candidate.

Known DB `Notification.trigger` values observed in code / docs:

- `metric_appended`

Known ops preview / capture triggers observed in code / docs:

- `token_completed`
- `metric_appended`
- `loop_complete`

Today, `token_completed` and `loop_complete` are preview / capture-flow trigger
values and remain capture-only in existing runbook policy. Do not assume they
are persisted DB Notification rows unless a future implementation adds that
write path.

`trigger` is notification reason. It is not source and not `outcomeLabel`.

### `eventType`

`Notification.eventType` is the stored event category. In the current DB write
path it matches `metric_appended`.

Keep `eventType` and `trigger` aligned for known persisted events unless a
future event model explicitly separates them.

## Operational Values

This docs policy centralizes currently confirmed operational values. It does
not add new values to code.

Rules:

- schema remains string-based for now.
- known values are the values confirmed in current implementation / docs.
- legacy / unknown values may exist in old rows or future bugs.
- unknown values should be handled conservatively.
- new values require a separate docs + implementation task.

## Required Fields By Event

`Notification.tokenId` and `Notification.metricId` are nullable integers and do
not have Prisma relations in the current schema.

Policy:

- `tokenId` identifies the target Token when available.
- `metricId` identifies the representative Metric used for the notification
  decision when available.
- nullable fields are allowed for operational notifications, but reports should
  surface missing identity fields when they matter.

Known event / trigger policy:

| eventType / trigger | Persistence today | tokenId | metricId | Rationale |
| --- | --- | --- | --- | --- |
| `metric_appended` | DB `Notification` row | expected when a Token row is known | required for live send / retry; expected for captured DB rows | Metric append is the notification basis and the metric id is part of durable dedupe |
| `token_completed` | ops preview / capture flow only today | expected when available if later persisted | optional | Token completion is token-state based, not Metric based |
| `loop_complete` | ops preview / capture flow only today | optional | optional | Loop summary / operational notification may not have one target Metric |

Do not document unobserved triggers such as `manual` as known values. If a
manual trigger is added later, define its required fields in the same table.

## Alerted At Relationship

Metric outcome evaluation resolves `alertedAt` in this priority order:

1. `--entryAt <ISO>` CLI override in `metrics:window-report`
2. `Notification.sentAt`
3. `Notification.capturedAt`
4. `Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`
5. `Token.importedAt`
6. `Token.createdAt`

Policy:

- explicit `--entryAt` should be treated as an operator override.
- successful live send should prefer `Notification.sentAt`.
- capture-only / dry-run-equivalent records should prefer
  `Notification.capturedAt`.
- when there is no suitable Notification timestamp, fall back to Token fields.
- if `Notification.status` is `failed` or an unknown value, outcome reports
  should treat the row conservatively and surface the status; use `sentAt` /
  `capturedAt` only when those timestamps exist and the report can explain the
  lifecycle state.
- if both `sentAt` and `capturedAt` are missing, continue to Token fallback.

`alertedAt` is not written directly to Metric rows in the MVP. Read-only
outcome reports compute it from Notification / Token state.

The broader timestamp meaning policy is fixed in
`docs/design/time-anchor-policy.md`.

## Notification Key And Dedupe

`Notification.notificationKey` is a durable dedupe key.

Policy:

- use it to avoid duplicate notification records / sends for the same event.
- do not treat it as a user-facing message body.
- do not treat it as `outcomeLabel`.
- keep it stable for retry / resend lookup.

Known persisted `metric_appended` key shape:

```text
<mint>:metric_appended:<metricId>
```

This policy does not change key construction.

## Retry Fields

Retry fields are a manual retry foundation / retry claim foundation. They do
not mean a full production queue worker exists.

Fields:

- `retryCount`: retry attempt count.
- `nextRetryAt`: earliest time the row may be retried.
- `lastAttemptAt`: last retry / send attempt timestamp.
- `leaseUntil`: temporary claim expiry for retry processing.
- `workerId`: process / worker label that claimed the retry candidate.

Current retry candidate policy observed in code:

- `eventType=metric_appended`
- `trigger=metric_appended`
- `status=failed`
- `mode=live_send`
- `metricId` is present
- `retryCount` is below the retry limit
- `nextRetryAt` is due or null
- `leaseUntil` is expired or null
- `rawJsonFree=true`
- `secretFree=true`

Important:

- retry fields do not imply scheduler / systemd / always-on worker completion.
- lease wording does not mean queue semantics are fully implemented.
- retry fields are minimum state for human-gated retry planning, claim, and
  resend.
- this policy does not change retry implementation.

## Failure And Error Fields

Failure-related fields observed in schema / code:

- `failedAt`
- `errorCode`
- `reason`

Policy:

- keep failure data lightweight and safe.
- do not store Telegram bot tokens, chat IDs, `.env` values, request paths with
  secrets, raw API responses, stdout / stderr dumps, or full raw payloads.
- use failure fields for operator debugging and retry decisions.
- do not expose them as user-facing notification copy.
- avoid long raw error dumps.

Known safe error code examples observed in code:

- `ops_notify_sender_failed`
- `ops_notify_sender_threw`
- `telegram_credentials_missing`
- `telegram_response_not_ok`
- `telegram_timeout`
- `telegram_network_error`

## Boundaries With Other Models

`Token.source`:

- token-level current / latest source label.
- separate from Notification `trigger`, `mode`, and `status`.

`Metric.source`:

- Metric snapshot acquisition source.
- separate from Notification `trigger`.

`Token.entrySnapshot`:

- lightweight first detection / manual observation / context capture.
- do not store Notification lifecycle state there.

`Token.reviewFlagsJson`:

- lightweight Token review helper JSON.
- separate from Notification lifecycle, retry state, and send result.

`Token.scoreBreakdown`:

- latest Token score explanation JSON.
- separate from Notification lifecycle, retry state, and send result.

`Token.groupKey` / `groupNote`:

- manual grouping helper fields.
- separate from Notification trigger, mode, status, retry state, and send
  result.

Metric outcome:

- `metrics:window-report` uses `Notification.sentAt` / `capturedAt` to compute
  read-only outcomes.
- do not store `outcomeLabel` on Notification.

`HolderSnapshot`:

- holder-analysis provenance and values.
- separate from Notification lifecycle.

## Unknown / Legacy Values

Because `status`, `mode`, `trigger`, and `eventType` are strings, unknown values
may appear.

Policy:

- do not immediately error only because an unknown value exists.
- reports may display the raw value.
- planners and outcome evaluation should treat unknown values conservatively.
- new values require docs updates.
- schema enumization, if needed, is a separate future task.

## Current Task Boundary

This policy records Notification responsibilities only. It does not change
code, schema, migrations, existing rows, write paths, retry implementation, or
relations. It does not implement a queue, worker, scheduler, or systemd
runtime.

## Next Docs-Only Candidates

- `Dev.wallet` identity confidence policy.
- `metric:show` rawJson inspect policy.
