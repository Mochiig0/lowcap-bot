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

`pnpm -s ops:plan:bounded -- --hours 6 --pumpOnly` now includes enabled
auto-send and retry planner state in the broader bounded-operation decision. It
is read-only and does not send Telegram or update Notification rows. If it
reports an allowed auto-send candidate or retry candidate, stop and run the
dedicated Green review before any live send or retry execution.

`pnpm -s ops:plan:bounded -- --hours 6 --pumpOnly --postRunPlan` now adds the
post-run notification planning step after Metric, enrich, and report review.
The notification steps only emit `notification:auto-send:plan` candidates.
They do not send Telegram, do not update Notification rows, and do not unlock
auto live send. Any live send or auto-send execution still requires a separate
human-approved Red.

`pnpm -s ops:run:bounded` now plans the same bounded pipeline as a default-safe
runner. Without `--execute`, it is read-only and only emits candidates for
detect write, Metric pending snapshot, enrich/rescore, report review, and
notification planner review. Its notification phase contains only
`notification:auto-send:plan`, the enabled auto-send planner, and
`notification:retry:plan`; it does not execute notification send, retry
execution, auto live send, Telegram live send, scheduler, or systemd. The
enrich phase omits `--notify`.

The 2026-05-31 post-enrich report / notifyCandidate review confirmed that the
Telegram boundary should remain locked. Recently enriched token ids
`7117..7069` contain no notify candidates: score ranks are `C=44`, `B=5`,
`S=0`, `A=0`, and hardRejected count is `3`. Current queue logic treats a
notify candidate as `scoreRank === "S"` and `hardRejected=false`, so
`notifyCandidateCount=0` is expected. Auto-send planner, enabled auto-send
planner, and retry planner all remain closed with candidate count `0`;
Notification statuses stay `captured=17`, `sent=5`, `failed=0`. Do not move to
Telegram send, notification send/update, retry execution, or auto live send
from this state; the next useful task is report/scoring visibility.

The follow-up visibility slice added read-only
`review:queue:geckoterminal --includeBlockers`. It exposes why rows are not
notify candidates without sending or updating Notifications. Current runtime
still shows `notifyCandidateEligibleCount=0`, with blockers explained by
`rank_not_s` and `hard_rejected` under the existing queue predicate. This
keeps Telegram send, notification send/update, retry execution, auto live
send, scheduler, and systemd locked until a separate Green review shows an
eligible candidate and a separate human-approved Red explicitly targets send
execution.

The subsequent blocker review keeps that boundary unchanged. Default and 168h
queues have no A/S rows and no eligible notify candidates; B rows are only
`scoreTotal=2`, below the current S threshold. If a lower-confidence path is
added next, make it a read-only or capture-only B watchlist/report lane first.
Do not send Telegram for B-rank rows and do not change auto-send eligibility
until a separate design review explicitly changes the notification policy.

That B-watchlist now exists as report visibility only. It counts B/A,
non-hard-rejected rows under `review:queue:geckoterminal --includeBlockers`
and labels the criteria as read-only and not notification candidates. Current
runtime has default watchlist `7` and rolling 168h watchlist `14`, all B-rank
with `scoreTotal=2`; Telegram, auto-send, retry execution, and Notification
creation/update remain locked.

The follow-up Green review keeps this boundary unchanged. Watchlist rows are
not near A/S thresholds and have no watchlist social/Metaplex/description/link
presence. Do not create capture-only B Notifications yet; first improve the
read-only watchlist readiness and scoreBreakdown availability explanations.
Telegram send and auto-send eligibility remain S-only.

That readiness improvement is now in place and still does not open the
Telegram boundary. `review:queue:geckoterminal --includeBlockers` reports
`watchlistReadyCount`, `watchlistNotReadyCount`, readiness reasons, and
scoreBreakdown availability reasons for human review only. Default 24h shows
`7` ready B-watchlist rows; rolling 168h shows `13` ready and `1` not ready
because of missing Metric coverage. `notifyCandidate` remains S-only,
Telegram remains S-only, auto-send planner remains unchanged, and no
Notification create/update or Telegram send path was added.

The follow-up readiness review keeps the same decision. The ready B-watchlist
rows are useful for human review, but they are all `B / 2` and not close to
S-rank notification eligibility. Social, website, Metaplex, and description
signals should stay as visibility only; do not require them for readiness and
do not use them to unlock Telegram. If more operator ergonomics are needed,
add `--watchlistOnly` as a read-only report filter. Do not create capture-only
B Notifications or change auto-send behavior from this state.

The 2026-05-27 execute preflight preserved the Telegram boundary. Auto-send
planner remains allowed `0`, selected Notification `null`; retry planner
candidate count remains `0`; Notification statuses remain `captured=17`,
`sent=5`, `failed=0`. The next pipeline Red candidate uses
`ops:run:bounded --execute`, but its notification phase is planner-only.
Expected Telegram send, Notification create/update, retry execution, and auto
live send execution remain `0`.

The 2026-05-27 `ops:run:bounded --execute` Red also preserved that boundary.
It executed detect write, Metric pending snapshot, enrich/rescore, report
review, and notification planner review, but notification planner remained
read-only. Notification count stayed `22`, statuses stayed `captured=17`,
`sent=5`, `failed=0`, retry candidate stayed `0`, enabled auto-send allowed
candidate stayed `0`, selected auto-send Notification stayed `null`, and
Telegram send stayed `0`.

The later bounded-runner cycle update keeps the same Telegram boundary.
`--postRunMetricCycles` and `--postRunEnrichCycles` only repeat bounded
Metric/enrich post-run command candidates; they do not add notification send,
retry execution, auto live send, Telegram live send, scheduler, or systemd.
Defaults stay `1 / 1`, and production execute was not run during the cycle
implementation.

The first multi-cycle execute preflight chose cycles `2 / 2` and confirmed
the same boundary in plan-only output. The notification phase remains planner
only (`notification:auto-send:plan`, enabled auto-send planner,
`notification:retry:plan`); enabled auto-send allowed candidate is `0`, retry
candidate is `0`, and selected auto-send Notification is `null`. The Red
candidate must not be modified to include notification send or `--live`.

That Red was attempted once and failed before any notification boundary could
be reached: `detect_write` failed immediately with a child `tsx` IPC
`listen EPERM` error, and Metric cycles, enrich cycles, report review, and
notification planner review were skipped. Notification count stayed `22`,
statuses stayed `captured=17`, `sent=5`, `failed=0`, enabled auto-send
allowed candidate stayed `0`, retry candidate stayed `0`, and Telegram send
stayed `0`. No retry or second command was run.

The runner fix changes only write-phase process launch mechanics. It avoids
direct child `tsx` package-script execution by using `node --import tsx` with
the concrete CLI file path for detect / Metric / enrich phases. It does not
add Telegram send, Notification send/update, retry execution, auto live send,
scheduler, or systemd behavior, and production execute was not rerun during
the fix.

Fixed-runner execute preflight kept the Telegram boundary closed. Plan-only
output was unblocked, notification planner remained read-only, enabled
auto-send allowed candidate was `0`, retry candidate was `0`, selected
auto-send Notification was `null`, and the Red candidate did not include
`--notify` or `--live`.

The fixed-runner multi-cycle execute then completed without opening the
Telegram boundary. Notification count stayed `22`, statuses stayed
`captured=17`, `sent=5`, `failed=0`, enabled auto-send allowed candidate
stayed `0`, retry candidate stayed `0`, selected auto-send Notification stayed
`null`, and Telegram send stayed `0`. The notification phase was planner-only;
no notification create/update, retry execution, auto live send, scheduler, or
systemd was executed.

The 2026-05-28 Green review reconfirmed that state. Auto-send planner still
has allowed candidate `0`, retry planner has candidate `0`, and
`notifyCandidateCount=0` in both default and 168h Gecko queues. The next
recommended task is runner observability, not notification execution.

Runner observability has now been improved without opening the Telegram
boundary. `ops:run:bounded --execute` emits progress lines for phase start/end,
Metric/enrich cycle start/end, and final summary, but the notification phase
remains planner-only. The progress summary explicitly reports notification
create/update expected `0` and Telegram send expected `0`; it does not generate
notification send, retry execution, auto live send, `--live`, scheduler,
systemd, or `pnpm smoke` commands.

Progress logs are rawJson-free and do not expose `stdoutTail`, `stderrTail`,
offensive raw text, or large token payloads. The change was verified with
non-production tests and read-only planners only. No production
`ops:run:bounded --execute`, notification send, retry execution, auto live
send, Telegram send, DB write, or external fetch was run for this logging
change.

Progress-logged execute preflight kept the Telegram boundary closed. The next
Red candidate remains a manual bounded runner execute, but its notification
phase is still planner-only (`notification:auto-send:plan`, enabled
auto-send planner, and `notification:retry:plan`). Current planners show
allowed auto-send candidate `0`, selected Notification `null`, retry candidate
`0`, and Notification statuses `captured=17`, `sent=5`, `failed=0`. The Red
candidate does not include `--notify`, notification send, retry execution,
auto live send, `--live`, scheduler, or systemd.

The progress-logged Red preserved the Telegram boundary as well. The runner
reported completed status and emitted final summary with
`notificationCreateUpdateExpected=0` and `telegramSendExpected=0`; post-checks
showed Notification count still `22`, statuses `captured=17`, `sent=5`,
`failed=0`, enabled auto-send allowed candidate `0`, retry candidate `0`, and
selected auto-send Notification `null`. The data plane still moved Token /
Metric counts `2664 / 756 -> 3023 / 856`, but Notification create/update
remained `0`. No notification send, retry execution, auto live send, Telegram
send, scheduler, or systemd was run.

The 2026-05-26 6H bounded GeckoTerminal detect write rehearsal did not send
Telegram and did not create or update Notification rows. Notification statuses
stayed `captured=13`, `sent=5`, `failed=0`; retry candidate count stayed `0`;
enabled auto-send allowed candidate count stayed `0`. The next planner
recommendation is Metric pending snapshot preflight, not Telegram execution.

During the later `ops:plan:bounded --postRunPlan` Yellow verification,
`pnpm smoke` was run against the active DB and created four additional
captured smoke/rehearsal Notification rows, moving Notification count
`18 -> 22` and Token count `1930 -> 1945`. It did not send Telegram and did
not change Metric or HolderSnapshot counts. Current read-only planners keep the
notification boundary closed: failed count `0`, retry candidate count `0`,
enabled auto-send allowed candidate count `0`, `selectedNotificationId=null`,
and `18` Notifications blocked as smoke/rehearsal rows. Do not use
`pnpm smoke` as a Green / Yellow no-write verification command on the active
DB.

Post-6H enrich/rescore preflight, 2026-05-26: notification safety remains
closed before moving from Metric proof to Token context creation. Notification
statuses are `captured=17`, `sent=5`, `failed=0`; retry candidate count is
`0`; enabled auto-send allowed candidate count is `0`; selected auto-send
Notification is `null`. The next enrich/rescore Red candidate must not include
`--notify`, must not send Telegram, and is expected to leave Notification
create/update at `0`.

That enrich/rescore Red later ran once without `--notify` and without
`--live`. It partially updated five Token rows before HTTP 429 stopped the
batch: `selected=50`, `enriched=5`, `rescored=5`, `error=1`,
`rateLimited=true`, and `skippedAfterRateLimit=44`. Notification and Telegram
boundaries held: `notifyWouldSend=0`, `notifySent=0`, Notification
create/update `0`, Telegram send `0`, retry execution `0`, and enabled
auto-send allowed candidate count `0`. Do not proceed to Notification send or
auto-send from this result; the next step is a Green rate-limit review of the
Token enrich lane.

The Green rate-limit review kept the Telegram boundary closed. Failed
Notification count, retry candidate count, and enabled auto-send allowed
candidate count are all `0`; selected auto-send Notification remains `null`.
The next task is not Notification send or auto-send. It is a Yellow
enrich/rescore pacing implementation so Token context fetches can proceed
without immediately re-triggering 429. Any future enrich Red must still omit
`--notify` unless a separate notification preflight explicitly approves it.

That Yellow implementation is complete. `token:enrich-rescore:geckoterminal`
now has opt-in `--interItemDelayMs <ms>` batch pacing with unchanged default
behavior and unchanged Notification / Telegram boundaries. The next paced
enrich Red candidate remains `--notify`-free:
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --interItemDelayMs 15000 --write`.
Expected Telegram send and Notification create/update remain `0`; any live
send still requires a separate notification preflight and human-approved Red.

Read-only preflight confirmed that candidate should target ids `6082..6063`
with `metadataStatus=mint_only`, `metricsCount=1`, `notificationCount=0`, and
`holderSnapshotCount=0`. Auto-send planners remain closed: failed count `0`,
retry candidate `0`, enabled auto-send allowed candidate `0`, and
`selectedNotificationId=null`. Do not add `--notify` to the paced enrich Red.

Follow-up re-window check confirmed the same Telegram boundary after the 360m
selection aged out. The paced enrich Red was not executed. Expanded
`--sinceMinutes 720` selects ids `6082..6063` again; all remain
`mint_only`, `metricsCount=1`, `notificationCount=0`, and
`holderSnapshotCount=0`. The updated Red candidate remains `--notify`-free:
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 720 --interItemDelayMs 15000 --write`.
Expected Telegram send and Notification create/update remain `0`.

That Red later ran without `--notify` and without `--live`. It enriched and
rescored all 20 selected rows, with `notifyWouldSend=0` and `notifySent=0`.
Notification count stayed `22`, statuses stayed `captured=17`, `sent=5`,
`failed=0`, retry candidate stayed `0`, enabled auto-send allowed candidate
stayed `0`, and selected auto-send Notification stayed `null`. Telegram send
and Notification create/update remained `0`.

Follow-up Green preflight for the next paced enrich batch keeps the same
Telegram boundary. The next selected limit 50 slice is ids `6062..6013`; all
selected rows have `notificationCount=0` and `holderSnapshotCount=0`, and
auto-send / retry planners remain closed (`allowed=0`, retry candidate `0`,
selected Notification `null`). The next Red candidate remains `--notify`-free:
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 720 --interItemDelayMs 15000 --write`.
Expected Telegram send and Notification create/update remain `0`; any live
send still requires a separate notification preflight and human-approved Red.

That Red later ran without `--notify` and without `--live`. It enriched and
rescored all 50 selected rows, with `notifyWouldSend=0` and `notifySent=0`.
Notification count stayed `22`, statuses stayed `captured=17`, `sent=5`,
`failed=0`, retry candidate stayed `0`, enabled auto-send allowed candidate
stayed `0`, and selected auto-send Notification stayed `null`. Telegram send
and Notification create/update remained `0`.

The following paced limit 50 enrich Red used the same `--notify`-free boundary
and also kept Telegram closed. It enriched and rescored ids `6012..5963` with
`notifyWouldSend=0`, `notifySent=0`, provider error `0`, 429 `0`, and retry
`0`. Notification count stayed `22`, statuses stayed `captured=17`,
`sent=5`, `failed=0`, retry candidate stayed `0`, enabled auto-send allowed
candidate stayed `0`, and selected auto-send Notification stayed `null`.
Telegram send and Notification create/update remained `0`.

## Current DB State

Read-only state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

## Notification Scripts And Boundaries

Scripts confirmed in `package.json`:

- `notification:auto-send:plan`:
  `node --import tsx src/cli/notificationAutoSendPlan.ts`
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

## Auto Live Send Gate Preflight

Date: 2026-05-21

The next auto live-send step was narrowed to a read-only planner
implementation, not a sender implementation. This preflight did not execute
Telegram send, DB write, Notification update, external fetch, retry execution,
Metric snapshot, detector / ops catch-up, `--write`, `--watch`, `--live`,
scheduler, systemd, schema / migration change, application code change,
rawJson full dump, or secret output.

Current state remains:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`

Gate decision:

- future auto live send should use positive opt-in
  `NOTIFICATION_AUTO_SEND_ENABLED=true`
- unset, `false`, or any other value means disabled
- manual approved `notification:send --live` remains separate from this auto
  switch at first
- initial one-run max is fixed at `1`
- first implementation should be a read-only planner CLI, tentatively
  `notification:auto-send:plan`

Initial allowlist:

- `eventType=metric_appended` and `trigger=metric_appended`
- `status=captured` and `mode=capture_only`
- `sentAt=null`, `failedAt=null`, `errorCode=null`, and `status!=sent`
- production-shaped key `<mint>:metric_appended:<metricId>`
- no `SMOKE` / `REHEARSAL` marker by the current rehearsal guard
- not failed and not a retry candidate
- safe preview available without rawJson, full message body, Telegram token,
  chat id, or env output
- global failed count is `0`
- no duplicate or ambiguous candidate identity

Dry-run preview should report read-only state, auto switch state, candidate
counts, allowed / blocked counts, blocked reasons, selected Notification id,
selected trigger, safe key summary, `wouldSend`, `wouldUpdateNotification`,
expected side effects, expected non-effects, and stop condition codes.

Stop conditions include failed count greater than `0`, disabled switch,
candidate count above one-run max, duplicate / ambiguous key, non-empty
`blockedBy`, smoke / rehearsal or sent-row candidate leakage, non-allowlisted
trigger / mode / status, unsafe preview, Telegram API / network / 429 in any
future live path, write scope beyond Notification sent / failed update,
Token / Metric / HolderSnapshot side effects, rawJson / secret output needs,
or scheduler / systemd invocation before explicit unlock.

Detailed design is recorded in `docs/runbooks/auto-live-send-gate.md`. Auto
live send, scheduler, and systemd remain locked.

## Auto Send Planner CLI

Date: 2026-05-21

The first gate implementation is now `notification:auto-send:plan`, a
read-only planner only. It does not connect `sendOpsTelegramNotification()`,
does not call `markNotificationSent()` / `markNotificationFailed()`, does not
execute retry, and does not write DB state.

Runtime production DB checks:

```bash
pnpm -s notification:auto-send:plan
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:plan
pnpm -s notification:retry:plan
```

Results:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- `NOTIFICATION_AUTO_SEND_ENABLED` unset:
  `autoSendEnabled=false`, `allowedCandidateCount=0`,
  `selectedNotificationId=null`, `wouldSend=false`,
  `wouldUpdateNotification=false`
- `NOTIFICATION_AUTO_SEND_ENABLED=true`:
  `autoSendEnabled=true`, `allowedCandidateCount=0`,
  `selectedNotificationId=null`, `wouldSend=false`,
  `wouldUpdateNotification=false`

The planner currently blocks all rows. Captured ids `3` through `6` are
`SMOKE_...` rehearsal rows, id `9` is a `REHEARSAL:...` capture rehearsal row,
and sent ids `7` and `8` are blocked by sent-row / live-send state. Auto live
send execution, scheduler, and systemd remain locked.

## Auto Send Planner Output Review

Date: 2026-05-21

The read-only planner was checked again as an operations preflight against the
current production DB. It stayed read-only / dry-run:

- DB write: none
- Notification create/update: none
- Telegram send: none
- external fetch: none
- retry execution: none
- scheduler / systemd: none

Planner output summary:

- unset switch: `autoSendEnabled=false`,
  `stopConditionCodes=[auto_send_disabled,no_allowed_candidate,only_sent_or_blocked_candidates]`
- `NOTIFICATION_AUTO_SEND_ENABLED=false`: same disabled result
- `NOTIFICATION_AUTO_SEND_ENABLED=true`: `autoSendEnabled=true`,
  `stopConditionCodes=[no_allowed_candidate,only_sent_or_blocked_candidates]`
- both disabled and enabled modes reported `totalCapturedCount=5`,
  `candidateCount=9`, `allowedCandidateCount=0`,
  `blockedCandidateCount=9`, `selectedNotificationId=null`,
  `wouldSend=false`, and `wouldUpdateNotification=false`

Candidate summary:

- ids `3` through `6`: captured / capture-only `SMOKE_...` rehearsal rows,
  blocked by `smoke_or_rehearsal_notification`
- id `9`: captured / capture-only `REHEARSAL:...` row, blocked by rehearsal
  guard and non-production key shape
- ids `7` and `8`: sent / live-send rows, blocked by sent-row state
- failed count: `0`
- retry candidate count: `0`

Judgment: planner output is sufficient for operator review. It explains why no
auto-send candidate exists and does not expose rawJson, secrets, Telegram
credentials, or message full body. The next step should be **Green: auto
live-send execution implementation preflight**, not implementation or
execution. Auto live send, scheduler, and systemd remain locked.

## Auto Live-Send Execution Preflight

Date: 2026-05-21

The future execution boundary was checked and documented without implementing
or running it. No Telegram send, Notification update, DB write, external
fetch, retry execution, Metric snapshot, detector / ops catch-up, `--write`,
`--watch`, `--live`, scheduler, systemd, schema / migration change, app code
change, rawJson full dump, or secret output occurred.

Recommended execution CLI:

- `notification:auto-send:execute`
- separate from manual `notification:send`
- default dry-run / stopped summary unless explicit `--execute` is supplied
- future execution requires `NOTIFICATION_AUTO_SEND_ENABLED=true`
- auto path must not use `--live`

Execution must call the planner first and stop before sender connection unless
all of these are true:

- `autoSendEnabled=true`
- `allowedCandidateCount=1`
- `selectedNotificationId` exists
- `stopConditionCodes=[]`
- selected candidate has no `blockedBy`
- failed count is `0`
- one-run max `1` is satisfied
- selected candidate remains `metric_appended`, `captured`,
  `capture_only`, `sentAt=null`, non-rehearsal, production-shaped, and safe
  previewable

Sender connection boundary:

- connect `sendOpsTelegramNotification()` only after planner gate pass
- pass only the selected Notification safe preview fields needed for the
  Telegram message
- never print or store Telegram token, chat id, request path, raw response
  body, full message body, rawJson, or env values

Notification update scope:

- success: selected row only, `status=sent`, `mode=live_send`, `sentAt`,
  `lastAttemptAt`, no Token / Metric / HolderSnapshot writes
- failure after sender connection: selected row only, `status=failed`,
  `mode=live_send`, `failedAt`, `lastAttemptAt`, sanitized `errorCode` /
  `reason`, no automatic retry
- blocked / stopped before sender connection: no DB update

Retry boundary:

- one auto execution run never retries
- failed rows are handed to `notification:retry:plan`
- failed count greater than `0` stops future auto execution

Summary format for future execution should include `autoSendEnabled`,
selected id / trigger / safe key summary, `sendAttempted`, `senderCalled`,
`sentCount`, `updatedCount`, `status=sent|failed|blocked|stopped`,
`blockedBy`, `stopConditionCodes`, sanitized `errorCode`,
`retryAttempted=false`, expected side effects, actual side effects, and
expected non-effects.

Next recommended task: **Yellow: implement disabled-by-default
`notification:auto-send:execute` CLI with tests only**. Production runtime
should stay limited to `--help` and planner checks. Auto live send execution,
scheduler, and systemd remain locked.

## Auto Send Execute CLI

Date: 2026-05-21

`notification:auto-send:execute` is now present as a disabled-by-default
execution boundary. It remains separate from manual `notification:send`.

Implemented behavior:

- default without `--execute`: stopped dry-run summary
- `--execute` required for any future sender attempt
- `NOTIFICATION_AUTO_SEND_ENABLED=true` required for any future sender attempt
- planner runs first and must return exactly one allowed selected candidate
- stopped / blocked paths do not connect sender and do not update DB
- future success / failure update scope is one selected Notification row only
- retry execution, scheduler, and systemd are still not connected

Production runtime was limited to no-`--execute` checks. Equivalent
`node --import tsx src/cli/notificationAutoSendExecute.ts` checks were used in
the default sandbox because the `tsx` package-script form hit a sandbox IPC
`EPERM`; the package script was then confirmed outside that sandbox for
`--help` and default no-`--execute` dry-run only. Results stayed safe:

- default: `executeRequested=false`, `readOnly=true`, `dryRun=true`,
  `autoSendEnabled=false`, `status=stopped`,
  `blockedBy=[execute_flag_required]`
- with `NOTIFICATION_AUTO_SEND_ENABLED=true`: still
  `executeRequested=false`, `status=stopped`, `sendAttempted=false`,
  `senderCalled=false`, `updatedCount=0`, and planner
  `allowedCandidateCount=0`
- counts remained Token / Metric / Notification / HolderSnapshot
  `1536 / 448 / 9 / 1`
- Notification statuses remained `captured=5`, `sent=4`, `failed=0`

Mocked-sender tests covered successful selected-row sent marking, selected-row
failed marking, sender throw handling, disabled switch stop, no-`--execute`
stop, smoke / rehearsal stop, and multiple-candidate stop. No production
`--execute`, Telegram send, Notification update, scheduler, or systemd action
was run.

Next task should be **Green: review `notification:auto-send:execute`
no-execute runtime output** before any real candidate creation or production
execution is considered.

## Auto Send Execute No-Execute Review

Date: 2026-05-21

The disabled-by-default execution CLI was reviewed against production DB with
no `--execute`. No Telegram send, Notification update, DB write, external
fetch, retry execution, Metric snapshot, detector / ops catch-up, `--write`,
`--watch`, `--live`, scheduler, systemd, schema / migration change, app code
change, rawJson full dump, or secret output occurred.

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

Env-enabled no-execute result:

- `NOTIFICATION_AUTO_SEND_ENABLED=true`
- `executeRequested=false`
- `autoSendEnabled=true`
- `status=stopped`
- `blockedBy=[execute_flag_required]`
- `sendAttempted=false`
- `senderCalled=false`
- `sentCount=0`
- `updatedCount=0`
- planner `allowedCandidateCount=0`

Planner comparison:

- total captured count: `5`
- candidate count: `9`
- allowed candidate count: `0`
- blocked candidate count: `9`
- default stop conditions:
  `auto_send_disabled`, `no_allowed_candidate`,
  `only_sent_or_blocked_candidates`
- env-enabled stop conditions:
  `no_allowed_candidate`, `only_sent_or_blocked_candidates`
- ids `3` through `6`: `SMOKE_...` rehearsal rows, blocked
- id `9`: `REHEARSAL:...` row, blocked
- ids `7` and `8`: sent rows, blocked
- failed count: `0`
- retry candidate count: `0`

Judgment: the no-execute runtime output is sufficient for operator review.
The output makes the `execute_flag_required` boundary clear and shows that the
env switch alone cannot send or update. No immediate output field or guard
change is required. Production `--execute` remains forbidden.

Next recommended task: **Green: real production-shaped capture-only candidate
creation preflight**. It should select whether and how to create one bounded,
Telegram-free production-shaped captured Notification candidate for future
auto-send planning. Scheduler / systemd and auto live-send execution remain
locked.

## Production-Shaped Capture Candidate Preflight

Date: 2026-05-22

The next Red exact command candidate was selected, but not executed. This was
read-only / docs-only. No DB write, external fetch, Metric write, Notification
create/update, Telegram send, auto-send execution, retry execution,
`--write`, `--watch`, `--live`, scheduler, systemd, schema / migration change,
app code change, rawJson full dump, or secret output occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- enabled auto-send planner `allowedCandidateCount=0`
- retry candidate count: `0`

Selected mint:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`
- Token id `5619`
- source `geckoterminal.new_pools`
- metadata status `mint_only`
- existing Metric count `4`
- existing Notification count `0`
- latest Metric id `1471`, source `geckoterminal.token_snapshot`

Next Red exact command candidate, not executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --write
```

Expected if later approved:

- external GeckoTerminal fetch max `1`
- Metric write max `1`
- Notification create max `1`
- Notification `status=captured`, `mode=capture_only`,
  `trigger=metric_appended`
- notificationKey
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:<metricId>`
- Telegram send `0`
- Notification sent / failed update `0`
- Token / HolderSnapshot write `0`
- retry execution `0`
- auto live-send execution `0`

Because the selected mint has no existing Notification and exact `--mint` mode
does not skip for recent metrics unless `--minGapMinutes` is supplied, this is
the clearest one-command candidate for creating exactly one production-shaped
future auto-send planner candidate. Production `--execute`, scheduler, and
systemd remain locked.

## Production-Shaped Capture Candidate Result

Date: 2026-05-22

The human-approved Red command ran once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --write
```

Result:

- selected `1`
- written `1`
- skipped `0`
- error `0`
- provider error: none
- 429: none
- retry: none

State before / after:

- Token / Metric / Notification / HolderSnapshot:
  `1536 / 448 / 9 / 1 -> 1536 / 449 / 10 / 1`
- Notification statuses:
  `captured=5,sent=4 -> captured=6,sent=4`
- failed count: `0`

Created candidate:

- Notification id `10`
- metric id `1531`
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

Planner after the run:

- disabled planner `allowedCandidateCount=0`
- enabled planner `allowedCandidateCount=1`
- `selectedNotificationId=10`
- `wouldSend=false`
- `wouldUpdateNotification=false`
- enabled planner `stopConditionCodes=[]`
- retry candidate count `0`
- env-enabled no-`--execute` executor stopped with
  `blockedBy=[execute_flag_required]`, `senderCalled=false`, `updatedCount=0`

Telegram send, Notification sent/failed update, Token write, HolderSnapshot
write, retry execution, auto-send execution, scheduler, and systemd did not
run. Production `--execute` remains forbidden until id `10` is reviewed as the
sole enabled auto-send candidate.

## Sole Auto-Send Candidate Review

Date: 2026-05-22

Notification id `10` was reviewed without execution. No production
`--execute`, Telegram send, Notification update, Metric write, external fetch,
retry execution, metric snapshot, detect / ops, `--write`, `--watch`,
`--live`, scheduler, systemd, schema / migration change, app code change,
rawJson full dump, or secret output occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 449 / 10 / 1`
- Notification statuses: `captured=6`, `sent=4`, `failed=0`
- retry candidate count: `0`
- manual live-send candidate count: `1`, id `10`
- enabled auto-send candidate count: `1`, id `10`

id `10` remains:

- status `captured`
- mode `capture_only`
- trigger `metric_appended`
- notificationKey
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:1531`
- production-shaped key: yes
- SMOKE / REHEARSAL marker: no
- sentAt `null`
- failedAt `null`
- errorCode `null`

Planner / executor:

- disabled planner: `allowedCandidateCount=0`; stop conditions include
  `auto_send_disabled`
- enabled planner: `allowedCandidateCount=1`,
  `selectedNotificationId=10`, `stopConditionCodes=[]`,
  `wouldSend=false`, `wouldUpdateNotification=false`
- default no-`--execute` executor: `blockedBy=[execute_flag_required]`,
  `senderCalled=false`, `sentCount=0`, `updatedCount=0`
- env-enabled no-`--execute` executor: `selectedNotificationId=10`,
  `blockedBy=[execute_flag_required]`, `senderCalled=false`,
  `sentCount=0`, `updatedCount=0`

Candidate boundary:

- ids `3` through `6`: SMOKE rows, blocked
- id `9`: REHEARSAL row, blocked
- ids `7` / `8`: sent rows, blocked
- id `10`: only enabled auto-send candidate and also the only manual
  live-send candidate by captured production-shaped state

Manual live send is not approved here. Production `--execute` is still
forbidden. Next recommended task is **Green: production `--execute` preflight
for id 10**.

## Production Execute Preflight

Date: 2026-05-23

Notification id `10` was preflighted for the next Red auto-send execution
candidate. This was read-only / docs-only. Production `--execute`, Telegram
send, Notification create/update, Metric write, external fetch, retry
execution, metric snapshot, detect / ops, `--write`, `--watch`, `--live`,
scheduler, systemd, schema / migration change, app code change, rawJson full
dump, and secret output did not occur.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 449 / 10 / 1`
- Notification statuses: `captured=6`, `sent=4`, `failed=0`
- retry candidate count: `0`
- manual live-send candidate count: `1`, id `10`
- enabled auto-send candidate count: `1`, id `10`

Planner / executor:

- id `10` remains captured / capture_only / metric_appended with production
  key
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:1531`
- disabled planner: `allowedCandidateCount=0`; `auto_send_disabled` present
- enabled planner: `allowedCandidateCount=1`,
  `selectedNotificationId=10`, `stopConditionCodes=[]`
- no-`--execute` default: `blockedBy=[execute_flag_required]`,
  `senderCalled=false`, `sentCount=0`, `updatedCount=0`
- no-`--execute` with env enabled: `selectedNotificationId=10`,
  `blockedBy=[execute_flag_required]`, `senderCalled=false`, `sentCount=0`,
  `updatedCount=0`

Source inspection confirmed sender connection only occurs after planner gate
and explicit `--execute`. Success / failure updates are scoped to the selected
Notification key. Stopped / blocked paths do not update DB. Retry execution,
Token write, Metric write, and HolderSnapshot write are not part of this path.

Next Red exact command candidate, not executed:

```bash
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:execute -- --execute
```

Expected if later approved:

- Telegram send max `1`
- existing Notification id `10` update max `1`
- success: `status=sent`, `mode=live_send`, sentAt set, lastAttemptAt set
- failure after sender connection: id `10` only marked failed with sanitized
  errorCode / reason
- no Notification create, Token write, Metric write, HolderSnapshot write,
  retry execution, second send, scheduler, systemd, rawJson full dump, or
  secret storage

Human approval is required before execution. Manual live send remains outside
this path.

## Production Auto-Send Execute Result

Date: 2026-05-23

The human-approved Red command ran exactly once:

```bash
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:execute -- --execute
```

Result:

- status `sent`
- sendAttempted `true`
- senderCalled `true`
- sentCount `1`
- updatedCount `1`
- blockedBy `[]`
- errorCode `null`
- retryAttempted `false`

State before / after:

- Token / Metric / Notification / HolderSnapshot:
  `1536 / 449 / 10 / 1 -> 1536 / 449 / 10 / 1`
- Notification statuses:
  `captured=6,sent=4,failed=0 -> captured=5,sent=5,failed=0`
- id `10`: `captured/capture_only -> sent/live_send`
- id `10` sentAt: set
- id `10` failedAt: `null`
- id `10` lastAttemptAt: set
- retry candidate count: `0`

Enabled planner after the run has `allowedCandidateCount=0` and
`selectedNotificationId=null`; id `10` is blocked by sent state. Telegram send
and selected Notification id `10` update occurred. Notification create, Token
write, Metric write, HolderSnapshot write, retry execution, scheduler, systemd,
manual `notification:send`, Metric snapshot, detector / ops, import, enrich,
and rescore did not run. Auto live-send one-shot execution path is verified;
constant operation remains locked.

## Auto-Send Post-Execution Stability Review

Date: 2026-05-23

Notification id `10` was reviewed after the one-shot production auto-send
execution. This review was read-only / docs-only. No production `--execute`,
Telegram send, Notification update, DB write, external fetch, retry execution,
Metric snapshot, detect / ops, `--write`, `--watch`, `--live`, scheduler,
systemd, schema / migration change, app code change, rawJson full dump, or
secret output occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 449 / 10 / 1`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- retry candidate count: `0`
- manual live-send candidate count: `0`
- enabled auto-send candidate count: `0`

id `10` remains:

- status `sent`
- mode `live_send`
- trigger `metric_appended`
- notificationKey
  `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump:metric_appended:1531`
- sentAt present
- lastAttemptAt present
- failedAt `null`
- errorCode `null`
- reason `null`

Enabled planner has `allowedCandidateCount=0`, `selectedNotificationId=null`,
and stop conditions `no_allowed_candidate` plus
`only_sent_or_blocked_candidates`. id `10` is blocked by sent-state guards.
Default and env-enabled no-`--execute` executor runs stop before sender/update
with `senderCalled=false`, `sentCount=0`, and `updatedCount=0`.

Candidate boundary:

- ids `3` through `6`: SMOKE rows, blocked
- id `9`: REHEARSAL row, blocked
- ids `7`, `8`, and `10`: sent rows, blocked
- retry candidate count: `0`

The auto-send single-shot execution slice can be closed. Scheduler / systemd
and constant auto live-send operation remain locked. Next recommended task is
Green docs/handoff consolidation for this slice, or a return to detect /
metric accumulation before any scheduler work.

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

## Capture-Only Rehearsal Command Candidate

Date: 2026-05-20

A docs-only Green pass selected one exact Red candidate for the first
marker-tagged capture-only rehearsal. It was not executed.

Selected mint:

- `2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump`
- existing GeckoTerminal-origin pump Token with Metrics `1529` and `1344`
- existing Notification count for that token: `0`

Selected tag:

- `capture_rehearsal_20260520`

Exact command requiring human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --write --notificationRehearsalTag capture_rehearsal_20260520
```

Expected Red boundary:

- max one GeckoTerminal fetch
- max one Metric row
- max one capture-only Notification row with key
  `REHEARSAL:capture_rehearsal_20260520:<mint>:metric_appended:<metricId>`
- no Telegram send
- no Token / HolderSnapshot write
- no retry execution
- no scheduler / systemd / auto live send

Current Green execution had no DB write, external fetch, Telegram send,
Notification update, rawJson full dump, or Red command execution.

## Capture-Only Rehearsal Red Result

Date: 2026-05-20

The marker-tagged capture-only rehearsal command was executed exactly once
after human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --write --notificationRehearsalTag capture_rehearsal_20260520
```

Result:

- `selectedCount=1`
- `writtenCount=1`
- `skippedCount=0`
- `errorCount=0`
- no provider error
- no `429`
- no retry or second command

Counts moved only in Metric and Notification:

- Token / Metric / Notification / HolderSnapshot:
  `1536 / 447 / 8 / 1 -> 1536 / 448 / 9 / 1`
- Notification statuses:
  `captured=4, sent=4 -> captured=5, sent=4`
- failed count stayed `0`

Created Notification id `9` with key
`REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:1530`.
It is `status=captured`, `mode=capture_only`, trigger `metric_appended`, with
`sentAt=null`, `failedAt=null`, and `errorCode=null`.

The new row is excluded by the smoke / rehearsal live-send guard, manual
live-send candidate count remained `0`, and the retry planner remained
`candidateCount=0`. Telegram live send, `notification:send`, retry execution,
detect watch, ops catch-up, scheduler, systemd, auto live send, schema /
migration, app code changes, rawJson full dump, and secret output were not
performed.

## Rehearsal Notification Exclusion Check

Date: 2026-05-20

A read-only follow-up confirmed that Notification id `9` remains excluded from
manual live-send and retry planning:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- `notification:retry:plan` candidate count: `0`

Notification id `9` still has key
`REHEARSAL:capture_rehearsal_20260520:2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump:metric_appended:1530`,
status `captured`, mode `capture_only`, trigger `metric_appended`,
`sentAt=null`, `failedAt=null`, and `errorCode=null`. It is excluded by the
existing smoke / rehearsal guard. Captured ids `3` through `6` remain
`SMOKE_...` rehearsal rows and are also excluded. Sent ids `7` and `8` remain
sent-row resend-guarded.

No DB write, external fetch, Telegram send, Notification update, Metric write,
Token write, HolderSnapshot write, rawJson full dump, or secret output occurred
in this follow-up. Auto live send, scheduler, and systemd remain locked; only
manual-approved live send remains allowed.

## Next Operating Slice Decision

Date: 2026-05-21

Read-only decision preflight after the capture-only rehearsal slice:

- Token / Metric / Notification / HolderSnapshot: `1536 / 448 / 9 / 1`
- Notification statuses: `captured=5`, `sent=4`, `failed=0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- capture-only rehearsal row id `9` remains excluded
- auto live send, scheduler, and systemd remain locked

Candidate ranking:

1. **Auto live send gate preflight**. This is the recommended next slice. It
   advances Telegram operations without sending Telegram and keeps the work on
   safety design: disable switch, allowlist, one-run max, dry-run preview, and
   stop conditions before scheduler / systemd.
2. **Docs / handoff consolidation**. Useful if the next chat needs a shorter
   operating handoff, but lower value than the gate preflight.

Not selected now:

- another capture-only rehearsal Red, because marker capture has already
  succeeded and would add another rehearsal row plus external fetch / writes;
- Metric accumulation / report, because it is useful later but shifts away from
  the Telegram slice and does not solve the alert-FDV anchor problem alone;
- detect / new-pool watch, because bounded watch / checkpoint design remains a
  separate lane and write rehearsal would be Red.

Next task to hand to Codex: **Yellow: preflight auto live send gate
implementation**. It must not send Telegram, must not enable auto live send,
and must keep scheduler / systemd out of scope.

## Auto-Send Single-Shot Consolidation

Date: 2026-05-23

This consolidation closes the current Telegram operating slice at the
single-shot boundary. CodexCLI recovery was confirmed with
`codex-cli 0.133.0`, HEAD `7090996 docs: review auto send post execution
state`, and a clean working tree before docs updates.

Current read-only state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 449 / 10 / 1`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- manual live-send candidate count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

The completed Telegram / Notification slice is:

- id `7` manual-approved live send succeeded
- id `8` manual-approved live send succeeded
- SMOKE / REHEARSAL guard prevents rehearsal rows from manual live send and
  retry planning
- id `9` marker-tagged capture-only rehearsal succeeded and remains excluded
- id `10` production-shaped capture-only candidate was created
- `notification:auto-send:plan` provides read-only allowlist, blocked reason,
  and stop-condition visibility
- `notification:auto-send:execute` is disabled by default and requires
  `--execute`, the auto-send kill switch, and a passing planner selection
- id `10` production auto-send one-shot succeeded and updated only that
  Notification to `sent/live_send`
- post-send review confirms id `10` is excluded from resend, retry candidates
  are `0`, failed rows are `0`, and enabled auto-send candidates are `0`

Locked boundaries remain unchanged:

- no scheduler
- no systemd
- no always-on auto live send
- no background queue / continuous worker
- no automated notification retry execution
- no production `--execute` without human approval
- failed rows require planner review and human approval before retry

Recommended next lane: **detect / new-pool watch readiness**. Next task:
**Green: review bounded new-pool watch readiness before Red rehearsal**. Metric
accumulation / report is the second choice if the next chat should prioritize
safe data quality instead of watch-loop readiness. Do not move to scheduler /
systemd from here.
