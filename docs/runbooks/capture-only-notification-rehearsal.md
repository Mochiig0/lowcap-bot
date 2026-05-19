# Capture-Only Notification Rehearsal Preflight

Date: 2026-05-20

This was a read-only / docs-only preflight for capture-only Notification
generation. No production DB write, Notification create/update, Telegram send,
external fetch, Metric snapshot execution, detector execution, retry execution,
`--write`, `--watch`, `--live`, scheduler, systemd, schema change, migration,
application code change, rawJson full dump, or secret output was performed.

## State Checked

Repo state at start:

- HEAD: `11866bd docs: define auto live send guardrails`
- working tree: clean
- branch: `master...origin/master`

Read-only DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- retry candidate count: `0`

The remaining captured rows are ids `3` through `6`. They are smoke /
rehearsal rows with `mint` / `notificationKey` values beginning with
`SMOKE_`, `status=captured`, `mode=capture_only`, `eventType=metric_appended`,
`trigger=metric_appended`, `sentAt=null`, `failedAt=null`, `rawJsonFree=true`,
and `secretFree=true`. They remain manual live-send excluded.

## Capture-Only Notification Write Paths

`src/notifications/notificationRepository.ts` is the central DB write boundary:

- `createCapturedNotification()` creates `status=captured`,
  `mode=capture_only`, `rawJsonFree=true`, and `secretFree=true`.
- `maybeCreateByNotificationKey()` reuses an existing unique
  `notificationKey` row or creates one captured row.
- `markNotificationSent()` and `markNotificationFailed()` are the only normal
  live-send status update helpers.
- `claimNextNotificationRetryCandidate()` can update retry lease fields only
  for failed `live_send` retry candidates.

Production CLI paths that can create capture-only Notification rows:

1. `pnpm metric:snapshot:geckoterminal -- --mint <MINT> --write`
   - creates a Metric row after fetching GeckoTerminal
   - in single `--mint` write mode, creates one `metric_appended`
     Notification by default
   - `--noNotificationCapture` suppresses only the Notification row
   - batch write mode without `--mint` does not enable Notification capture
   - Telegram sender is not connected on this path
2. `pnpm ops:catchup:gecko -- --write --metricAppend ... --opsNotifyCaptureFile <PATH>`
   - delegates the Metric append to the GeckoTerminal Metric snapshot runner
   - can create one DB Notification only when an ops notify capture file was
     requested, send was not requested, and exactly one eligible
     `metric_appended` capture result exists
   - creates a local JSONL capture file as part of the same path
   - sender is not called unless `--opsNotify` is explicitly requested

Other checked paths:

- `pnpm metric:add` writes Metric only; it does not import the Notification
  repository or create Notification rows.
- `pnpm import:mint`, `pnpm import:mint:file`, and
  `pnpm import:mint:source-file` write mint-only Token state only.
- `pnpm detect:geckoterminal:new-pools` can hand accepted items into
  `import:mint` only with `--write`; it does not create Notification rows.
- `pnpm ops:summary:geckoterminal` is read-only and does not create
  Notification rows.
- `pnpm import` and
  `pnpm token:enrich-rescore:geckoterminal --write --notify` can call the
  legacy Telegram sender, but they do not create Notification rows.

## Sender Paths And Boundary

Telegram sender paths are separate from capture-only Notification creation:

- `pnpm notification:send -- --notificationKey <KEY> --trigger metric_appended`
  is a dry-run lookup by default. It returns `status=ready`,
  `senderCalled=false`, `sentCount=0`, and `updatedCount=0` when a captured
  row is eligible.
- `notification:send` connects `sendOpsTelegramNotification()` only with
  explicit `--live`.
- `notification:send --retryFailed` is only for failed `live_send` rows and
  still requires explicit `--live` to call the sender.
- `ops:catchup:gecko` calls the ops sender only when `--opsNotify` is set.
- The legacy `notifyTelegram()` sender is called by the full import path for
  eligible S-rank imports and by the bounded Gecko enrich/rescore path only
  with `--write --notify`.

Sent-row resend prevention is active in both live-send paths:

- `sendNotificationByKey()` blocks if `status=sent` or `sentAt` is present.
- `sendAndMarkMetricAppendedNotification()` in the catch-up supervisor blocks
  if the row is already sent, not found, or not
  `status=captured` / `mode=capture_only`.

## Red Rehearsal Candidate

No safe exact small Red command is approved from this preflight.

The nearest production-shaped command is:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <HUMAN_SELECTED_MINT> --write
```

That command is not accepted as the next Red rehearsal yet because it requires
an external GeckoTerminal fetch, writes a Metric row, and would create a
production-shaped Notification key
`<mint>:metric_appended:<metricId>` with no explicit smoke / rehearsal marker.
Such a row could mix with manual live-send review unless a separate exclusion
rule or rehearsal marker is added first.

The nearest catch-up command shape is also not accepted yet:

```bash
pnpm -s ops:catchup:gecko -- --pumpOnly --limit 1 --maxCycles 1 --write --metricAppend --opsNotifyCaptureFile <PATH>
```

That path can be capture-only and Telegram-free when `--opsNotify` is omitted,
but it still delegates to the Metric snapshot runner, can fetch externally,
writes a Metric row, writes a local capture JSONL file, and creates the same
production-shaped Notification key. An exact safe command also depends on
there being exactly one eligible metric-append candidate, which was not checked
by executing the planner in this read-only audit.

Expected side effects for either unsafe candidate would include:

- Metric write: up to `1`
- Notification create: up to `1`
- external GeckoTerminal fetch: yes
- local capture JSONL write: catch-up path only

Expected non-effects if run without `--live` / `--opsNotify`:

- Telegram send: `0`
- Notification sent/failed update: `0`
- Token write: `0` for the Metric snapshot path
- HolderSnapshot write: `0`
- scheduler/systemd: `0`

Because the current Red candidates do not satisfy the rehearsal-identification
and manual-live-send-exclusion requirements, the next step should be a small
Yellow guard/design slice before any production DB Red rehearsal. The smallest
useful follow-up is to add an explicit rehearsal discriminator or planner
guard for capture-only Notification rows, then re-run this preflight and choose
one exact command.

## Commands Run

Read-only commands used:

```bash
git status --short --branch
git log -5 --oneline
pnpm -s mvp:status
node --import tsx -e '<safe Prisma count/status query>'
pnpm -s notification:send -- --help
pnpm -s notification:retry:plan -- --help
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --help
node --import tsx src/cli/metricAdd.ts --help
node --import tsx src/cli/importMint.ts --help
node --import tsx src/cli/detectGeckoterminalNewPools.ts --help
pnpm -s ops:catchup:gecko -- --help
rg ...
sed ...
find src/notify -maxdepth 1 -type f -print
```

Notes:

- `pnpm -s notification:retry:plan -- --help` does not implement a help-only
  mode; it executed the read-only retry planner and returned candidate count
  `0`.
- Some `tsx` package-script help commands failed in the sandbox with local IPC
  `EPERM`; equivalent `node --import tsx ... --help` commands were used for
  inspection instead.

Commands intentionally not run:

- `notification:send` execution
- retry execution
- `metric:snapshot:geckoterminal` except help
- `detect:geckoterminal:new-pools` except help
- any `--write`, `--watch`, or `--live`
- `--opsNotify`
- scheduler/systemd
- import/enrich/rescore execution
- schema/migration/app-code changes

## Decision

Capture-only Notification generation should be stabilized before any auto live
send, scheduler, or systemd work. The value of this pause is high: the sender
boundary is clear, but the current capture-only write paths do not yet provide
a production-safe rehearsal marker that keeps new capture rows separate from
manual live-send candidates.

## Smoke / Rehearsal Guard

Date: 2026-05-20

A small Yellow guard now excludes smoke / rehearsal Notifications from live
send and retry planning without adding schema fields or migrations.

Guard policy:

- keys or mints beginning with `SMOKE_`, `SMOKE:`, `REHEARSAL_`, or
  `REHEARSAL:` are smoke / rehearsal rows
- keys or mints containing explicit marker segments such as `_rehearsal_` are
  smoke / rehearsal rows
- blocked live-send results use `blockedBy=["smoke_or_rehearsal_notification"]`
- failed smoke / rehearsal rows are excluded from
  `notification:retry:plan` candidate selection
- normal production-shaped keys `<mint>:metric_appended:<metricId>` keep their
  existing eligibility behavior when all other guards pass

This implementation did not create or update Notification rows, did not send
Telegram, did not fetch externally, did not execute a capture-only Red
rehearsal, and did not unlock auto live send, scheduler, or systemd.

Next Red status: capture-only rehearsal can be reconsidered after a human
selects one exact command and confirms the intended row marker / exclusion
policy for the resulting capture-only row.
