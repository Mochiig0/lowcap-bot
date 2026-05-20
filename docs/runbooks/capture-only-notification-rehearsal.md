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

## Marker-Capable Command Preflight

Date: 2026-05-20

This was a read-only / docs-only follow-up after the smoke / rehearsal guard.
No production DB write, Notification create/update, Metric write, Token write,
HolderSnapshot write, external fetch, Telegram send, Metric snapshot execution,
ops catch-up execution, detector execution, `notification:send` execution,
retry execution, `--write`, `--watch`, `--live`, schema change, migration,
application code change, rawJson full dump, or secret output was performed.

Current read-only state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- failed count: `0`
- captured ids `3` through `6` remain `SMOKE_...` rows and are guard-excluded
- `notification:retry:plan` returned `status=stop`, `candidateCount=0`

Command audit:

- `metric:snapshot:geckoterminal` exposes `--mint`, `--source`,
  `--noNotificationCapture`, `--write`, and watch / selection options, but no
  option to override, prefix, tag, or otherwise mark the generated
  Notification key.
- its key builder is fixed to `${mint}:metric_appended:${metricId}`.
- single `--mint --write` mode can create one capture-only Notification by
  default, but only with that production-shaped key.
- `ops:catchup:gecko` exposes `--opsNotifyCaptureFile`, `--opsNotify`, and
  `--opsNotifyTrigger`, but no Notification key marker option.
- `--opsNotifyCaptureFile` writes local ops-notify preview JSONL capture
  records; it is not a DB Notification key marker.
- the catch-up DB Notification record path also uses the fixed
  `${mint}:metric_appended:${metricId}` key.
- Telegram sender is not called by `metric:snapshot:geckoterminal`; in
  `ops:catchup:gecko`, sender execution requires explicit `--opsNotify`.

Decision:

- no marker-capable capture-only Red exact command exists today.
- do not run a Red rehearsal yet, because existing write paths can only create
  production-shaped keys and a new row could still mix with manual live-send
  review by shape even though the guard works for explicit markers.

Next Yellow implementation candidate:

- add a marker option to `metric:snapshot:geckoterminal` first, because it is
  the direct DB Notification creation path and can keep the blast radius small.
- candidate option names:
  - `--rehearsalNotification`
  - `--notificationRehearsalTag <TAG>`
  - `--notificationKeyPrefix REHEARSAL:<TAG>:`
- production default key must remain unchanged.
- when the option is present, the DB Notification key should include a
  `REHEARSAL:` or `REHEARSAL_` marker that is already excluded by
  `notification:send` and `notification:retry:plan`.
- the option should stay single-mint and capture-only; it must not imply
  Telegram send, retry execution, scheduler, systemd, or auto live send.

## Metric Snapshot Rehearsal Tag Option

Date: 2026-05-20

Yellow implementation added a narrow `metric:snapshot:geckoterminal` option:

```bash
--notificationRehearsalTag <TAG>
```

Behavior:

- production default notification keys are unchanged:
  `<mint>:metric_appended:<metricId>`
- when the option is explicitly supplied for a single-mint capture write, the
  capture-only Notification key becomes:
  `REHEARSAL:<TAG>:<mint>:metric_appended:<metricId>`
- `TAG` must be non-empty, 40 characters or fewer, and contain only letters,
  numbers, underscore, or hyphen
- colon, whitespace, slash, and longer values are rejected before Metric /
  Notification writes
- the option is allowed only with exact `--mint --write` one-shot mode
- batch mode is rejected
- dry-run / no-`--write` usage is rejected
- `--noNotificationCapture` is rejected with the rehearsal tag because there
  would be no capture-only Notification to mark
- `--watch` is rejected with the rehearsal tag to keep rehearsal capture to one
  explicit one-shot command

The generated `REHEARSAL:` key is already covered by the existing
`notification:send` and `notification:retry:plan` smoke / rehearsal guard, so
future rehearsal rows remain excluded from manual live send and retry
candidates. This Yellow did not execute a capture-only Red rehearsal, did not
run `metric:snapshot:geckoterminal --write` against production, did not create
or update production Notifications, did not fetch GeckoTerminal, did not send
Telegram, and did not unlock auto live send, scheduler, or systemd.

## Rehearsal Red Command Selection

Date: 2026-05-20

This Green check selected one exact human-approved Red command for a future
marker-tagged capture-only Notification rehearsal. It did not execute the Red
command and did not run `metric:snapshot:geckoterminal --write`.

Current read-only state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- captured ids `3` through `6` remain marker-guarded capture-only rows

Selected mint:

- `2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump`
- existing Token id `5561`
- pump mint from `geckoterminal.new_pools`
- `metadataStatus=mint_only`
- existing Metric ids `1529` and `1344`
- latest Metric source `geckoterminal.token_snapshot`
- existing Notification count for the token: `0`

Selected tag:

- `capture_rehearsal_20260520`

Exact Red command candidate, not executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --write --notificationRehearsalTag capture_rehearsal_20260520
```

Expected side effects if explicitly approved and run later:

- external GeckoTerminal fetch: max `1`
- Metric write: max `1`
- Notification create: max `1`
- created Notification should be `status=captured` and `mode=capture_only`
- expected key pattern:
  `REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:<metricId>`

Expected non-effects:

- Telegram send: `0`
- Notification sent/failed update: `0`
- Token create/update: `0`
- HolderSnapshot write: `0`
- retry execution: `0`
- scheduler / systemd / auto live send: `0`
- repo-local data diff: none
- rawJson full dump: none

Safety notes:

- the command is exact `--mint` one-shot mode
- it includes `--write` because this is the future Red capture rehearsal
- it does not include `--watch`, `--live`, or `--noNotificationCapture`
- no `--minGapMinutes` is included, so exact mode is not expected to skip due
  to a recent Metric gap; provider failure could still result in zero writes
- generated `REHEARSAL:` keys are already excluded by live-send and retry
  guards
- human approval is required before execution
- auto live send, scheduler, and systemd remain locked

## Rehearsal Red Execution Result

Date: 2026-05-20

After human approval, the selected Red command was executed exactly once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --write --notificationRehearsalTag capture_rehearsal_20260520
```

Command result:

- `mode=single`
- `selectedCount=1`
- `okCount=1`
- `writtenCount=1`
- `skippedCount=0`
- `errorCount=0`
- provider error: none
- `429`: none
- retry / second command: none

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `447 -> 448`
- Notification: `8 -> 9`
- HolderSnapshot: `1 -> 1`
- Notification statuses: `captured=4, sent=4 -> captured=5, sent=4`
- failed count stayed `0`

Created rehearsal Notification:

- id: `9`
- key:
  `REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:1530`
- metric id: `1530`
- event type / trigger: `metric_appended`
- status: `captured`
- mode: `capture_only`
- `sentAt=null`
- `failedAt=null`
- `errorCode=null`
- `retryCount=0`
- `rawJsonFree=true`
- `secretFree=true`
- source: `metric:snapshot:geckoterminal`

Safety result:

- new REHEARSAL row is marker-guarded
- manual live-send candidate count remained `0`
- `notification:retry:plan` remained read-only with `candidateCount=0`
- Telegram send did not run
- Notification sent / failed update did not occur
- Token and HolderSnapshot counts did not change
- repo-local data stayed clean
- rawJson full dump and secret output did not occur
- auto live send, scheduler, and systemd remain locked

## Rehearsal Exclusion Follow-Up

Date: 2026-05-20

This Green check re-verified that the Red-created REHEARSAL Notification remains
excluded from manual live-send review and retry planning. No production DB
write, external fetch, Telegram send, Notification create/update, Metric write,
Token write, HolderSnapshot write, metric snapshot execution, notification send
execution, retry execution, detector / ops catch-up execution, `--write`,
`--watch`, `--live`, scheduler, systemd, schema / migration change, app code
change, rawJson full dump, or secret output occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- `notification:retry:plan` candidate count: `0`

Notification id `9`:

- key:
  `REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:1530`
- event type / trigger: `metric_appended`
- status / mode: `captured` / `capture_only`
- `sentAt=null`
- `failedAt=null`
- `errorCode=null`
- `retryCount=0`
- `rawJsonFree=true`
- `secretFree=true`
- marker guarded: yes
- manual live-send candidate: no

Captured row breakdown:

- ids `3` through `6`: `SMOKE_...` capture-only rehearsal rows; excluded by
  smoke / rehearsal marker guard
- id `9`: `REHEARSAL:...` capture-only rehearsal row; excluded by smoke /
  rehearsal marker guard

Sent row breakdown:

- ids `1`, `2`, `7`, and `8` are `sent` / `live_send` rows with `sentAt`
  present and are not resend candidates
- ids `7` and `8` remain excluded by the existing sent-row resend guard

Decision: the capture-only rehearsal slice can be treated as complete. Future
work should stay manual-approved; auto live send, scheduler, and systemd remain
locked.

## Completion And Next Slice Decision

Date: 2026-05-21

The capture-only rehearsal slice is complete. Current read-only state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- id `3` through `6`: `SMOKE_...` rehearsal rows, excluded
- id `9`: `REHEARSAL:...` capture rehearsal row, excluded
- ids `7` and `8`: sent rows, excluded by resend prevention

Decision comparison:

- Auto live send gate preflight is the recommended next slice. It can improve
  the Telegram safety layer without sending Telegram.
- A second capture-only rehearsal is not recommended now because the marker
  path is already proven and another run would add another rehearsal row.
- Metric accumulation / report remains useful later, but belongs to the
  outcome lane rather than this completed rehearsal lane.
- Detect / new-pool watch remains a separate bounded-operation lane.
- Docs handoff is safe but less useful than the gate preflight at this point.

Next task: **Yellow: preflight auto live send gate implementation**. It should
design the gate and stop conditions only; auto live send execution, scheduler,
systemd, Telegram send, retry execution, and write-side rehearsals remain out
of scope.

## Follow-Up: Auto Live Send Gate Preflight

Date: 2026-05-21

The follow-up preflight selected the next Telegram operating task after this
capture-only rehearsal slice. The next step is a Yellow read-only planner
implementation, not auto live-send execution:

- add a planner CLI such as `notification:auto-send:plan`
- keep future auto-send disabled unless
  `NOTIFICATION_AUTO_SEND_ENABLED=true`
- keep one-run max fixed at `1`
- allow only production-shaped `metric_appended` captured / capture-only rows
- continue excluding `SMOKE` / `REHEARSAL` rows from send and retry planning
- keep scheduler / systemd locked

Detailed design is recorded in `docs/runbooks/auto-live-send-gate.md`. This
follow-up did not write DB state, send Telegram, fetch externally, update
Notifications, run retry execution, execute Metric snapshot, or unlock auto
live send.
