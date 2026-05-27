# Gecko Token To Metric Minimum Loop Runbook

This runbook documents the smallest manual GeckoTerminal loop that has been proven useful for one pump mint:

1. select one GeckoTerminal `new_pools` pump mint
2. create one mint-only `Token`
3. complete the token with the gated token-only catch-up path
4. append one GeckoTerminal metric snapshot
5. confirm `ops:catchup:gecko` returns no pending work

It is intentionally not a scheduler, worker, queue, retry system, or generic source runtime.

For day-to-day bounded Gecko operation across detect, enrich/rescore, Metric
append, and rawJson-free report confirmation, use
`docs/runbooks/gecko-bounded-operation-mvp.md` as the temporary MVP entrypoint.
This minimum-loop document remains the evidence log for individual mint
progression and Metric time-series confirmation.

Before choosing a new bounded operation command, run the read-only planner:

```bash
pnpm -s ops:plan:bounded -- --hours 6 --pumpOnly
```

It only reports the next recommended step and command candidates as strings. It
does not run detect watch, metric snapshot writes, enrich/rescore writes,
Notification send, retry execution, external fetch, scheduler, or systemd.

For a full bounded 6H flow, use the default-safe pipeline runner in plan mode
first:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline.json
```

Without `--execute`, this is read-only and only emits the one-pass phase plan:
detect write, Metric pending snapshot, enrich/rescore, report review, and
notification planner review. The post-run Metric/enrich commands use
`computedSinceMinutes = hours * 60 + postRunBufferMinutes`, which defaults to
`420` for a 6h run with a 60m buffer. This keeps the minimum loop closer to
actual operations and avoids relying on a stale 6h rolling window after manual
handoff delays.

When a 6H detect run creates more backlog than a single post-run batch can
cover, the same runner can now plan bounded follow-up cycles:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline.json --postRunMetricCycles 3 --postRunEnrichCycles 3
```

The defaults remain `--postRunMetricCycles 1` and `--postRunEnrichCycles 1`.
Cycle counts are bounded, explicit, and plan-only unless a separate
human-approved `--execute` run is used.

The first execute preflight for this mode selected conservative cycles `2 / 2`
with limits `50 / 50`:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-cycles-20260527.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

This command is a Red candidate only. It was not executed during preflight.
The checkpoint path is repo-outside and absent; planner state is unblocked.

The follow-up Red attempted that exact multi-cycle command once. It stopped
before detect app logic because the child `tsx` process failed to create its
IPC pipe (`listen EPERM` under `/tmp/tsx-1000`). No retry and no second
command were run. Runner counters stayed `metricCyclesExecuted=0` and
`enrichCyclesExecuted=0`; `detect_write` failed, and Metric, enrich, report,
and notification planner phases were skipped.

The execution boundary has since been fixed in the runner: detect / Metric /
enrich write phases no longer execute through `pnpm -s <script>` package
scripts. Execute mode now uses the current Node binary with `--import tsx` and
the direct CLI file path, while plan output still shows the same `pnpm -s ...`
operator commands. The minimum-loop semantics are unchanged and production
`--execute` was not rerun during the fix.

Fixed-runner preflight selected the next bounded minimum-loop Red with cycles
`2 / 2` and checkpoint
`/tmp/lowcap-bot-6h-pipeline-cycles-fixed-20260527.json`. The checkpoint is
repo-outside and absent, and plan-only output is unblocked. The exact Red
candidate is:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-cycles-fixed-20260527.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

This remains a human-approved Red only. The current Green pass did not execute
detect, Metric snapshot, enrich/rescore, notification send, retry execution,
scheduler/systemd, or `pnpm smoke`.

That fixed-runner Red later ran once and completed. The minimum loop advanced
as a bounded pipeline rather than manual split commands:

- detect write completed and created/reused Tokens with net Token `+360`.
- Metric pending snapshot ran two cycles and wrote Metric `+100`
  (representative Metric ids `1766..1865`).
- enrich/rescore ran two cycles and updated Token context/rescore for `100`
  rows; representative updated Token ids include `6759..6858`.
- report review and notification planner review stayed read-only.

DB moved from Token / Metric / Notification / HolderSnapshot
`2304 / 656 / 22 / 1` to `2664 / 756 / 22 / 1`. Metric buckets moved from
`0=1788`, `1=429`, `2+=87` to `0=2048`, `1=529`, `2+=87`; metadata moved to
`mint_only=2181`, `partial=470`, `enriched=13`. Notification create/update,
HolderSnapshot write, Telegram send, retry execution, auto live send,
scheduler/systemd, rawJson full dump, offensive raw text dump, and `pnpm
smoke` remained `0`.

The follow-up Green review treats the loop as successful. Remaining
`metricPendingCount` / `enrichPendingCount` is not a failure of the loop; it
reflects Token `+360` intake with only two post-run cycles covering at most
100 Metric writes and 100 Token context updates. The next improvement should
make runner progress visible during long watches before increasing operational
frequency.

Runner progress visibility has now been improved. Execute mode emits compact
`[ops:run]` lines to stderr for phase start/end, Metric/enrich cycle
start/end, and a final summary while leaving JSON output on stdout. The final
summary is emitted for both successful runs and failures, including child
process failure, Metric cycle failure, enrich cycle failure, and
provider/rate-limit stops. It reports duration, completed/failed/skipped
phases, cycle counts, stopped reasons, safe write/update counters, checkpoint
path, blockers, and stop codes.

The minimum-loop safety boundary is unchanged. Progress logs are whitelisted:
no rawJson, `stdoutTail`, `stderrTail`, offensive raw text, large mint/name
payload dumps, notification send, Telegram send, retry execution, auto live
send, scheduler/systemd, or `pnpm smoke`. The logging change was verified with
TypeScript, runner tests, planner/help tests, CLI help, plan-only runner
output, notification planners, retry planner, and read-only queue. Production
`ops:run:bounded --execute` was not run for this implementation.

No minimum-loop state advanced during that failed attempt: Token / Metric /
Notification / HolderSnapshot stayed `2304 / 656 / 22 / 1`, metadata stayed
`mint_only=1921`, `partial=370`, `enriched=13`, Metric buckets stayed
`0=1788`, `1=429`, `2+=87`, and Notification statuses stayed
`captured=17`, `sent=5`, `failed=0`. The checkpoint file was not created,
and no external fetch, Token write, Metric write, Notification create/update,
HolderSnapshot write, Telegram send, rawJson full dump, or offensive raw text
dump occurred.

Production execution still requires a separate human-approved `--execute`
turn with a `/tmp` checkpoint path. The runner does not implement Telegram
send, Notification send, retry execution, auto live send, scheduler, systemd,
or `pnpm smoke`.

The 2026-05-27 execute preflight selected
`/tmp/lowcap-bot-6h-pipeline-20260527.json` as the checkpoint path. The path
is repo-outside, `/tmp` exists, and the file is absent, so no overwrite
question is pending. The next Red may use:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-20260527.json --metricLimit 50 --enrichLimit 50 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

This executes the minimum loop as a bounded pipeline: detect write, Metric
pending snapshot, enrich/rescore, report review, then notification planner
review. It still does not include Telegram send, Notification send, retry
execution, auto live send, scheduler, systemd, or `pnpm smoke`.

The 2026-05-27 Red used that exact command and completed the loop once.
Detect wrote Token ids `6140..6498` (`Token +359`), Metric pending snapshot
wrote Metric ids `1716..1765` (`Metric +50`), and enrich/rescore updated 50
Tokens to `partial`. Notification count stayed `22`, HolderSnapshot stayed
`1`, Telegram send stayed `0`, and the checkpoint file was written at
`/tmp/lowcap-bot-6h-pipeline-20260527.json` (`176` bytes).

After the run, default 24h queue still has `metricPendingCount=309` and
`enrichPendingCount=309`; rolling 168h has `metricPendingCount=598` and
`enrichPendingCount=543`. Continue with Green review before another bounded
Red, because post-run backlog remains and the runner's first execute result
should be reviewed before increasing coverage.

To see the full post-run sequence after a bounded 6H detect write, include
`--postRunPlan`:

```bash
pnpm -s ops:plan:bounded -- --hours 6 --pumpOnly --postRunPlan
```

The post-run plan is still read-only. It orders Metric pending snapshot,
enrich/rescore, report review, notification planner review, and optional
auto-send planner review. It emits command candidates only, with Metric and
enrich post-run limits defaulting to `50`; it does not execute any command.

Latest post-6H Metric pending update, 2026-05-26: bounded
`metric:snapshot:geckoterminal` ran with `--onlyMetricPending`,
`--limit 50`, `--sinceMinutes 360`, `--minGapMinutes 60`,
`--interItemDelayMs 15000`, `--noNotificationCapture`, and `--write`. It
selected ids `6067..6018`, wrote Metric ids `1666..1715`, and moved all 50
rows from `metricsCount=0` to `metricsCount=1`. Result:
`selected=50`, `written=50`, `skipped=0`, `error=0`,
`interItemDelayCount=49`, provider error `0`, 429 `0`, retry `0`, and
Notification capture `0`. Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, and rawJson full dump
remained `0`.

Post-6H enrich/rescore preflight later confirmed the next loop step should move
from Metric acquisition to Token context creation. The 24h Gecko pump
enrich-pending cohort is `359` rows, all `geckoterminal.new_pools`,
`metadataStatus=mint_only`, score `C`, `hardRejected=false`,
`notificationCount=0`, and `holderSnapshotCount=0`; Metric distribution is
`0=289`, `1=70`. Because `token:enrich-rescore:geckoterminal` fetches live
snapshots even without `--write`, production selection was simulated read-only
with Prisma. `--pumpOnly --limit 50 --sinceMinutes 360` selects ids
`6087..6038`, all currently `metricsCount=1`. The next human-approved Red can
run this exact command, with no `--notify`:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --write
```

Expected writes are Token enrich/rescore/context updates up to 50. Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, rawJson full dump, and offensive raw text dump should stay
at `0`.

The approved post-6H enrich/rescore Red later ran once with that exact command.
It selected ids `6087..6038`, but this was a partial result because HTTP 429
stopped the batch after five Token updates. Result summary:
`selected=50`, `enriched=5`, `rescored=5`, `contextWritten=5`, `error=1`,
`rateLimited=true`, `abortedDueToRateLimit=true`, and
`skippedAfterRateLimit=44`. Ids `6087..6083` moved `mint_only -> partial`;
ids `6082..6038` remain `mint_only`.

The command preserved the non-effects expected for this loop stage:
Metric write `0`, Notification create/update `0`, HolderSnapshot write `0`,
Telegram send `0`, retry execution `0`, scheduler/systemd `0`, rawJson full
dump `0`, and offensive raw text dump `0`. Notification statuses stayed
`captured=17`, `sent=5`, `failed=0`; retry and enabled auto-send candidates
stayed `0`. Do not immediately repeat the same enrich command; run a Green
rate-limit review before deciding whether to use a smaller enrich batch or add
guard/backoff behavior.

The follow-up Green rate-limit review found no existing pacing flag on
`token:enrich-rescore:geckoterminal`. Batch processing is sequential and stops
on HTTP 429, but it currently has no delay between selected items. For the
manual minimum loop, the next enrich/rescore improvement should be an opt-in
`--interItemDelayMs <ms>` style option before continuing larger post-6H enrich
batches. Until that exists, any small restart Red should require a fresh
cooldown/preflight and must remain `--notify`-free.

That Yellow implementation is now complete. `token:enrich-rescore:geckoterminal`
accepts `--interItemDelayMs <ms>` in batch mode, defaults to `0`, delays only
between selected items, reports `interItemDelayMs` and `interItemDelayCount`,
and preserves the existing HTTP 429 stop / `skippedAfterRateLimit` behavior.
Production enrich writes and external fetches were not run during
implementation. The next paced Red candidate is:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --interItemDelayMs 15000 --write
```

It still must omit `--notify`; expected non-effects remain Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, and rawJson full dump.

Read-only preflight after that implementation confirmed the next slice. The
production CLI preview was not run because enrich/rescore dry-run fetches
externally. Prisma selection simulation for `--pumpOnly --sinceMinutes 360`
selects ids `6082..6063` for limit 20, starting at the prior 429 row. All 20
are `mint_only`, `metricsCount=1`, `notificationCount=0`,
`holderSnapshotCount=0`, score `C / 0`, and `hardRejected=false`. Limit 50
would select ids `6082..6033`, but the safer first paced restart is limit 20:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --interItemDelayMs 15000 --write
```

Before that Red was executed, a final read-only check found the 360-minute
rolling window had aged out. The Red was not run. ids `6082..6063` are still
the correct restart slice and remain `mint_only`, `metricsCount=1`,
`notificationCount=0`, `holderSnapshotCount=0`, score `C / 0`, and
`hardRejected=false`, but they were about `463..482` minutes old at the
re-window check. Prisma simulation showed `--sinceMinutes 720` is the smallest
tested expanded window that selects those same first 20 rows. Use this
re-windowed candidate instead:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 720 --interItemDelayMs 15000 --write
```

Do not add `--notify`. Expected writes remain Token updates only; Metric
write, Notification create/update, HolderSnapshot write, Telegram send, and
rawJson full dump should stay at `0`.

That re-windowed paced Red later succeeded. It selected ids `6082..6063`,
updated all 20 from `mint_only` to `partial`, and returned `selected=20`,
`enriched=20`, `rescored=20`, `contextWritten=20`, `error=0`,
`metaplexAttempted=20`, `metaplexAvailable=0`, `notifyWouldSend=0`,
`notifySent=0`, `interItemDelayMs=15000`, `interItemDelayCount=19`, provider
error `0`, 429 `0`, and retry `0`. Counts stayed
`1945 / 606 / 22 / 1`, while metadata statuses moved `mint_only=1732`,
`partial=200`, `enriched=13` to `mint_only=1712`, `partial=220`,
`enriched=13`.

The paced enrich lane then ran two limit 50 batches with the same
`--sinceMinutes 720 --interItemDelayMs 15000` boundary. The first moved ids
`6062..6013` to `partial`; the second moved ids `6012..5963` to `partial`.
Both completed with `selected=50`, `enriched=50`, `rescored=50`,
`skipped=0`, `error=0`, `notifyWouldSend=0`, `notifySent=0`,
`interItemDelayCount=49`, provider error `0`, 429 `0`, and retry `0`.
Counts stayed `1945 / 606 / 22 / 1`; metadata now stands at
`mint_only=1612`, `partial=320`, `enriched=13`.

These were Token-context updates only. Metric write, Notification
create/update, HolderSnapshot write, Telegram send, scheduler/systemd,
repo-local runtime data diff, rawJson full dump, and offensive raw text dump
remained `0`. The broader queues still have older backlog:
`metricPendingCount=289`, `enrichPendingCount=234`, `staleReviewCount=289`,
and `notifyCandidateCount=0`.

The selected rows now have name / symbol / normalized text and
enriched/rescored timestamps. They remain `metricsCount=1`,
`notificationCount=0`, `holderSnapshotCount=0`, and `hardRejected=false`.
Metric write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, rawJson full dump, and offensive raw text dump stayed `0`.

The follow-up Green preflight confirmed the next Token-context slice can move
to limit 50 with the same pacing. ids `6082..6063` are all `partial` with
safe reviewFlags and normalized text present, `metricsCount=1`,
`notificationCount=0`, and `holderSnapshotCount=0`; the slice score
distribution is `C/0=19` and `B/2=1`.

Prisma read-only selection simulation for `--pumpOnly --sinceMinutes 720`
selects ids `6062..6013` at limit 50. All selected rows are `mint_only`,
score rank `C`, `hardRejected=false`, `notificationCount=0`, and
`holderSnapshotCount=0`; 45 rows have `metricsCount=1` and the final 5 have
`metricsCount=0`. The next human-approved Red candidate is:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 720 --interItemDelayMs 15000 --write
```

Do not add `--notify`. Expected writes remain Token updates only; Metric
write, Notification create/update, HolderSnapshot write, Telegram send, and
rawJson full dump should stay at `0`.

That limit 50 Token-context Red succeeded. It selected ids `6062..6013`,
updated all 50 from `mint_only` to `partial`, and returned `selected=50`,
`enriched=50`, `rescored=50`, `contextWritten=50`, `error=0`,
`metaplexAttempted=50`, `metaplexAvailable=3`, `notifyWouldSend=0`,
`notifySent=0`, `interItemDelayMs=15000`, `interItemDelayCount=49`, provider
error `0`, 429 `0`, and retry `0`. Counts stayed
`1945 / 606 / 22 / 1`, while metadata statuses moved `mint_only=1712`,
`partial=220`, `enriched=13` to `mint_only=1662`, `partial=270`,
`enriched=13`.

The selected rows now have name / symbol / normalized text and
enriched/rescored timestamps. They remain `notificationCount=0`,
`holderSnapshotCount=0`, and `hardRejected=false`; 45 have `metricsCount=1`
and 5 have `metricsCount=0`. Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, rawJson full dump, and
offensive raw text dump stayed `0`.

Latest bounded detect write rehearsal, 2026-05-26: a human-approved 6H
`detect:geckoterminal:new-pools --watch --write` command completed
`360` iterations with `failedCount=0`, `rateLimitRetryCount=0`,
`importedCount=359`, and `existingCount=1`. It moved Token count
`1571 -> 1930` and left Metric / Notification / HolderSnapshot counts at
`536 / 18 / 1`. Telegram send, Notification create/update, Metric write,
HolderSnapshot write, scheduler/systemd, repo-local checkpoint writes, and
docs rawJson full dumps remained `0`. The next loop step is not another detect
write; run a Green preflight for the planner-proposed Metric pending snapshot.

That Green preflight is now complete. The 6H write cohort is ids `5729..6087`
with count `359`, all GeckoTerminal `new_pools` pump mint-only rows. Current
Metric buckets are `0=1534`, `1=309`, `2+=87`; Notification statuses are
`captured=13`, `sent=5`, `failed=0`; retry and enabled auto-send allowed
candidates are both `0`. Fetch-free `--onlyMetricPending` preview with
`--sinceMinutes 360 --limit 20` selected ids `6087..6068`, all
`metricsCount=0`, `notificationCount=0`, `holderSnapshotCount=0`, and
`latestMetricObservedAt=null`. The next human-approved Red candidate is:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected writes are limited to Metric rows up to 20. Token write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, rawJson full dump, and offensive raw text dump should stay
at `0`.

That Red candidate later ran once and succeeded. It selected ids `6087..6068`,
appended Metric ids `1637..1656`, and moved all 20 rows from `metricsCount=0`
to `metricsCount=1`. Counts moved only in Metric:
`1930 / 536 / 18 / 1 -> 1930 / 556 / 18 / 1`; Metric buckets moved
`0=1534, 1=309, 2+=87 -> 0=1514, 1=329, 2+=87`. Result summary:
`selected=20`, `written=20`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, Notification capture `0`,
`interItemDelayMs=15000`, and `interItemDelayCount=19`. Representative
`metrics:report` / `metrics:window-report` checks for ids `6087`, `6079`, and
`6068` were rawJson-free and showed Metric rows readable through the report
layer. Token write, Notification create/update, HolderSnapshot write,
Telegram send, scheduler/systemd, repo-local data diff, rawJson full dump, and
offensive raw text dump stayed at `0`.

The follow-up Green review confirmed the full 20-row result by read-only
summary: ids `6087..6068` are all `metricsCount=1`; Metric ids `1637..1656`
exist; selected-row Notification and HolderSnapshot totals are both `0`; safe
market-data boolean distribution is price `20`, FDV `20`, reserve `20`, and
top-pool `20`. A fetch-free preview of the next bounded step with
`--limit 50 --sinceMinutes 360 --onlyMetricPending` selected ids `6067..6018`,
all still Metric-zero. The next human-approved Red can therefore use limit 50
with the same `--noNotificationCapture` boundary:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

For records copied from this minimum loop, keep only safe summaries: statuses,
counts, mint / Metric ids, sources, `observedAt`, `metricsCount`, latest Metric
and `recentMetrics` summaries, and rawJson-free safe summary booleans. Do not
paste raw logs, raw payloads, raw stdout / stderr, exact `"rawJson":` fields,
`.env`, Telegram credentials, database URLs, raw env, or secret-bearing command
args.

## Confirmed Status

As of the successful ops-path checks, the full operator-visible Token to Metric
loop has been manually confirmed, including capture-only ops notification records
and one production Telegram ops live send for `metric_appended`:

- an exact-mint Metric 0 backlog snapshot was later confirmed for token id
  `5464`, mint `By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`, using:
  `metric:snapshot:geckoterminal -- --mint ... --minGapMinutes 60 --noNotificationCapture --write`.
  This bypassed the batch selector, appended exactly one
  `geckoterminal.token_snapshot` Metric (`id=1542`,
  `observedAt=2026-05-24T13:52:10.586Z`), and moved the token from
  `metricsCount=0` to `metricsCount=1`. Notification capture stayed disabled
  by option, Notification / Token / HolderSnapshot counts did not change,
  Telegram was not sent, and `review:queue --sinceHours 168` moved
  `metricPendingCount 85 -> 84`. `metrics:report` and
  `metrics:window-report` confirmed the result rawJson-free.
- the follow-up read-only review selected token id `5463`, mint
  `CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump`, as the next exact-mint
  Metric 0 backlog candidate. It is a GeckoTerminal `new_pools` pump mint,
  `metadataStatus=mint_only`, `metricsCount=0`, `notificationCount=0`,
  `holderSnapshotCount=0`, score `C / 0`, and `hardRejected=false`. The next
  human-approved Red can use the same exact-mint boundary with
  `--minGapMinutes 60 --noNotificationCapture --write` to prove the pattern a
  second time before pending-first batch selector work.
- that second exact-mint Red was then confirmed: token id `5463` received
  Metric `1543`, source `geckoterminal.token_snapshot`, observed at
  `2026-05-25T10:57:38.651Z`, and moved `metricsCount=0 -> 1`. Counts moved
  only in Metric (`460 -> 461`), Notification capture stayed disabled by
  option, Telegram was not sent, and the 168h queue moved
  `metricPendingCount 84 -> 83`. `metrics:report` and
  `metrics:window-report` confirmed the result rawJson-free.
- the next Green review confirmed that both exact-mint Metric 0 snapshots
  behaved the same way and selected the durable next lane as Yellow
  pending-first Metric batch selector design. If a third exact-mint proof is
  ever needed, token id `5462` /
  `63HTSDqidfB3ruuUAmjg9KbaSzWw7gkxAF2TKY6epump` is the next safe candidate,
  but no Red command is recommended by default.
- the Yellow selector implementation is now complete. `metric:snapshot:geckoterminal`
  supports batch-only `--onlyMetricPending`, leaves default selection unchanged,
  rejects the option with exact `--mint`, and uses dry-run as a selection
  preview without GeckoTerminal fetch. Production read-only preview selected
  ids `5462`, `5461`, and `5460`, all `metricsCount=0`,
  `notificationCount=0`, `holderSnapshotCount=0`, and
  `latestMetricObservedAt=null`. No production write, provider fetch,
  Notification update, Telegram send, rawJson full dump, or offensive raw text
  dump was performed. The next step should be a Green preflight before any
  `--onlyMetricPending --write` Red.
- that Green preflight later found `selectedCount=0` for the proposed
  `--sinceMinutes 10080` batch Red because the rolling cutoff moved past the
  remaining Metric-zero candidates. Ids `5462..5460` are still safe
  Metric-zero candidates, but not inside that rolling window. No batch Red
  command should be issued until a re-window Green preflight chooses a stable
  selection policy.
- the re-window Green preflight then confirmed ids `5462..5460` were about
  `10157..10159` minutes old, so `10080` missed them narrowly. A fetch-free
  `--onlyMetricPending` preview with `--sinceMinutes 20160 --limit 5`
  selected ids `5462`, `5461`, `5460`, `5459`, and `5458`, all
  `metricsCount=0`, `latestMetricObservedAt=null`, `notificationCount=0`,
  `holderSnapshotCount=0`, `mint_only`, and score `C / 0`. The next Red
  candidate is:

  ```bash
  pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
  ```

  Human approval is required.
- the first human-approved batch Red using that command succeeded:
  `selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
  429 `0`, retry `0`, `interItemDelayMs=15000`, and
  `interItemDelayCount=4`. Ids `5462`, `5461`, `5460`, `5459`, and `5458`
  moved from `metricsCount=0` to `metricsCount=1` with Metric ids
  `1553..1557`. Counts moved only in Metric
  `1556 / 461 / 14 / 1 -> 1556 / 466 / 14 / 1`; Metric buckets moved
  `0=1235, 1=234, 2+=87 -> 0=1230, 1=239, 2+=87`. Notification capture,
  Token write, HolderSnapshot write, Telegram send, scheduler/systemd, rawJson
  full dump, and offensive raw text dump remained `0`. Next step should be a
  Green review before another batch Red.
- that Green review confirmed ids `5462..5458` are readable in
  `metrics:report` / `metrics:window-report`, remain `metricsCount=1`, and
  still have `notificationCount=0` and `holderSnapshotCount=0`. A subsequent
  fetch-free `--onlyMetricPending` preview selected the next Metric-zero rows,
  ids `5457`, `5456`, `5455`, `5454`, and `5453`, so the next candidate is
  another bounded Red with the same command shape and human approval.
- the second human-approved `--onlyMetricPending` batch Red then succeeded
  with the same bounded command shape: `selected=5`, `written=5`, `skipped=0`,
  `error=0`, provider error `0`, 429 `0`, retry `0`,
  `interItemDelayMs=15000`, and `interItemDelayCount=4`. Ids `5457`, `5456`,
  `5455`, `5454`, and `5453` moved from `metricsCount=0` to
  `metricsCount=1` with Metric ids `1558..1562`. Counts moved only in Metric
  `1556 / 466 / 14 / 1 -> 1556 / 471 / 14 / 1`; Metric buckets moved
  `0=1230, 1=239, 2+=87 -> 0=1225, 1=244, 2+=87`. Notification capture,
  Token write, HolderSnapshot write, Telegram send, scheduler/systemd, rawJson
  full dump, offensive raw text dump, and app/schema changes remained `0`.
  Next step should be a Green review before another batch Red.
- that Green review confirmed ids `5457..5453` are readable in
  `metrics:report` / `metrics:window-report`, remain `metricsCount=1`, and
  still have `notificationCount=0` and `holderSnapshotCount=0`. Representative
  windows for ids `5457` and `5453` have `metricCount=1`, `fdvMetricCount=0`,
  `entryAnchorQuality=none`, and `outcomeLabel=no_data`. A subsequent
  fetch-free `--onlyMetricPending` preview selected the next Metric-zero rows,
  ids `5452`, `5451`, `5450`, `5449`, and `5448`, so the next candidate is
  another bounded Red with the same command shape and human approval. This is
  older rolling-window backlog cleanup; the default and 168h review queues now
  show `metricPendingCount=0`.
- the third human-approved `--onlyMetricPending` batch Red then succeeded
  with the same bounded command shape: `selected=5`, `written=5`, `skipped=0`,
  `error=0`, provider error `0`, 429 `0`, retry `0`,
  `interItemDelayMs=15000`, and `interItemDelayCount=4`. Ids `5452`, `5451`,
  `5450`, `5449`, and `5448` moved from `metricsCount=0` to
  `metricsCount=1` with Metric ids `1563..1567`. Counts moved only in Metric
  `1556 / 471 / 14 / 1 -> 1556 / 476 / 14 / 1`; Metric buckets moved
  `0=1225, 1=244, 2+=87 -> 0=1220, 1=249, 2+=87`. Notification capture,
  Token write, HolderSnapshot write, Telegram send, scheduler/systemd, rawJson
  full dump, offensive raw text dump, and app/schema changes remained `0`.
  Next step should be a Green review before another batch Red.
- that Green review confirmed ids `5452..5448` in read-only report/window
  context. All five are `metricsCount=1`, `notificationCount=0`, and
  `holderSnapshotCount=0`; token id `5451` has price / FDV / reserve /
  top-pool present, while ids `5452`, `5450`, `5449`, and `5448` have reserve
  present with price / FDV / top-pool absent. Representative windows stayed
  `outcomeLabel=no_data`: id `5451` has `fdvMetricCount=1` with a very late
  FDV anchor, and id `5452` has `fdvMetricCount=0`. Queue default and 168h
  views remain `metricPendingCount=0`, `enrichPendingCount=0`, and
  `notifyCandidateCount=0`, but the expanded fetch-free `--onlyMetricPending`
  preview selected the next older Metric-zero rows, ids `5447..5443`.
  Recommended next step is one more bounded pending-first Metric snapshot Red
  with human approval; if a future preview returns `selectedCount=0`, switch to
  rolling-window / older Metric-zero backlog policy instead.
- that repeated human-approved `--onlyMetricPending` batch Red succeeded with
  `selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
  429 `0`, retry `0`, `interItemDelayMs=15000`, and
  `interItemDelayCount=4`. Ids `5447`, `5446`, `5445`, `5444`, and `5443`
  moved from `metricsCount=0` to `metricsCount=1` with Metric ids
  `1568..1572`. Counts moved only in Metric
  `1556 / 476 / 14 / 1 -> 1556 / 481 / 14 / 1`; Metric buckets moved
  `0=1220, 1=249, 2+=87 -> 0=1215, 1=254, 2+=87`. Notification capture,
  Token write, HolderSnapshot write, Telegram send, scheduler/systemd, rawJson
  full dump, offensive raw text dump, and app/schema changes remained `0`.
  Next step should be a Green review before another batch Red.
- that Green review confirmed ids `5447..5443` in read-only report/window
  context. All five are `metricsCount=1`, `notificationCount=0`, and
  `holderSnapshotCount=0`; token id `5446` has price / FDV / reserve /
  top-pool present, while ids `5447`, `5445`, `5444`, and `5443` have reserve
  present with price / FDV / top-pool absent. Representative windows stayed
  `outcomeLabel=no_data`: id `5446` has `fdvMetricCount=1` with a very late
  FDV anchor, and id `5447` has `fdvMetricCount=0`. Queue default and 168h
  views remain `metricPendingCount=0`, `enrichPendingCount=0`, and
  `notifyCandidateCount=0`, but the expanded fetch-free `--onlyMetricPending`
  preview selected the next older Metric-zero rows, ids `5442..5438`.
  Recommended next step is one more bounded pending-first Metric snapshot Red
  with human approval; if a future preview returns `selectedCount=0`, switch to
  rolling-window / older Metric-zero backlog policy instead.
- a later human-approved pending-first batch raised the limit to 50 and
  succeeded cleanly: `selected=50`, `written=50`, `skipped=0`, `error=0`,
  provider error `0`, 429 `0`, retry `0`, Notification capture `0`,
  `interItemDelayMs=15000`, and `interItemDelayCount=49`. It moved ids
  `5442..5393` from `metricsCount=0` to `metricsCount=1` with Metric ids
  `1573..1622`. Counts moved only in Metric
  `1556 / 481 / 14 / 1 -> 1556 / 531 / 14 / 1`; Metric buckets moved
  `0=1215, 1=254, 2+=87 -> 0=1165, 1=304, 2+=87`. Notification create/update,
  Token write, HolderSnapshot write, Telegram send, rawJson full dump, and
  offensive raw text dump remained `0`.
- the read-only follow-up review of that limit 50 batch confirmed ids
  `5442..5393` are all `metricsCount=1`, have total `notificationCount=0` and
  `holderSnapshotCount=0`, and are readable through representative
  `metrics:report` / `metrics:window-report` checks. Safe market-data
  distribution across Metric ids `1573..1622` is `reserveUsdPresent=50`,
  `priceUsdPresent=12`, `fdvUsdPresent=12`, and `topPoolPresent=12`.
  Queue default and 168h views remain `metricPendingCount=0` and
  `notifyCandidateCount=0`, while the expanded fetch-free preview still
  selects the next older Metric-zero rows. If continuing, prefer a smaller
  limit 5 Red before any further large batch.
- that post-large-batch limit 5 Red then succeeded: `selected=5`,
  `written=5`, `skipped=0`, `error=0`, provider error `0`, 429 `0`, retry
  `0`, Notification capture `0`, `interItemDelayMs=15000`, and
  `interItemDelayCount=4`. Ids `5392`, `5391`, `5390`, `5389`, and `5388`
  moved from `metricsCount=0` to `metricsCount=1` with Metric ids
  `1623..1627`. Counts moved only in Metric
  `1556 / 531 / 14 / 1 -> 1556 / 536 / 14 / 1`; Metric buckets moved
  `0=1165, 1=304, 2+=87 -> 0=1160, 1=309, 2+=87`. Notification create/update,
  Token write, HolderSnapshot write, Telegram send, rawJson full dump, and
  offensive raw text dump remained `0`. Next step should be a Green review of
  ids `5392..5388` before another batch Red.

- Gecko detector selected one pump mint candidate.
- `detect:geckoterminal:new-pools --write` created one mint-only `Token`.
- `ops:catchup:gecko --write` completed that token through the token-only runner.
- `ops:catchup:gecko --write --metricAppend` appended one `Metric` through the
  production Metric append runner.
- the Metric append execution result was `status=ok`, `writtenCount=1`, and
  `tokenWriteExecutionResults=[]`.
- the post-check matched `latestMetric.id` to the returned metric id.
- the final ops dry-run reported `plannedTokenWrites=0`,
  `plannedMetricAppends=0`, `metricPendingCount=0`,
  `latestMetricMissingCount=0`, and `nextRecommendedAction=no_action`.
- a later capture-enabled run also confirmed `--opsNotifyCaptureFile` writes
  JSONL records for `token_completed`, `metric_appended`, and `loop_complete`
  after a successful Metric append with `metricId=1115`; delivery stayed
  `capture_only`, without Telegram live send and without secret/env/raw
  stdout/raw stderr/full-args style fields in the capture output.
- after the IPv4 `https.request` transport fix, a bounded
  `ops:catchup:gecko --write --metricAppend` run with
  `--opsNotify --opsNotifyTrigger metric_appended --opsNotifyCaptureFile`
  appended exactly one Metric with `metricId=1116`, reported `writtenCount=1`
  and `tokenWriteExecutionResults=[]`, sent one production Telegram ops
  notification with `sentCount=1` and `status=sent`, and wrote capture-only
  `metric_appended` plus `loop_complete` records without secret/env/raw
  stdout/raw stderr/full-args style fields.
- `token_completed` and `loop_complete` have injected-sender selected-trigger
  success tests without production Telegram delivery.
- Telegram live loop policy now keeps `metric_appended` as the only initial
  live-send candidate after DB read confirmation, capture-only rehearsal,
  safe marker checks, and human gate. `token_completed` and `loop_complete`
  stay capture-only, and the loop / retry / dedupe / cooldown runtime remains
  unimplemented.
- the latest Red live-send preflight for `token_completed` / `loop_complete`
  stopped at `no_candidate`: token-only dry-run reported `status=no_pending`,
  `plannedTokenWrites=0`, `pendingCount=0`, and `selectedCandidates=[]`;
  Metric append dry-run reported `status=no_pending`, `plannedMetricAppends=0`,
  `metricPendingCount=0`, `pendingCount=0`, and `selectedCandidates=[]`.
- the later bounded detect origin mint
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` has confirmed the
  single-mint enrich/rescore step: `token:enrich-rescore:geckoterminal
  -- --mint ... --write` moved it from `mint_only` to `partial` with
  `name/symbol=Papu/PAPU`, `description=null`, `normalizedText=papu papu`,
  score `C` / `0`, and `hardRejected=false`. It reported
  `enrichWritten=1`, `rescoreWritten=1`, `contextWritten=1`, and
  `notifySent=0`, with `enrichedAt=2026-05-08T22:38:21.819Z` and
  `rescoredAt=2026-05-08T22:38:21.830Z`. No Metric was written:
  `metricsCount=0`, `latestMetric=null`, and `metrics:report` returned
  `count=0` / `items=[]`. Telegram, detect, watch, tmux, systemd, and
  checkpoint updates were not invoked during that enrich/rescore step.
- the same bounded detect origin mint then confirmed the first single-mint
  Metric append as a separate Red task through `first_metric_snapshot`:
  `metric:snapshot:geckoterminal -- --mint ... --write` appended exactly one
  `geckoterminal.token_snapshot` Metric, `id=1244`, at
  `observedAt=2026-05-08T23:11:09.976Z` with `volume24h=0` and
  `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. This moved `metricsCount` from 0 to 1 and set
  latestMetric / `recentMetrics` to `1244`. Token fields stayed
  `partial / Papu / PAPU / C / 0 / hardRejected=false`, the enrich/rescore
  timestamps stayed unchanged, and Telegram, detect, watch, enrich/rescore,
  tmux, systemd, and checkpoint updates were not invoked during the Metric
  step. `metrics:report` and `token:compare` confirmed the result rawJson-free.
- the same bounded detect origin mint then confirmed a second single-mint
  Metric append as a separate Red task through `second_metric_snapshot` and
  the strict `lowcap-gecko-metric-single` tmux single-run:
  `metric:snapshot:geckoterminal -- --mint ... --write` appended exactly one
  additional `geckoterminal.token_snapshot` Metric, `id=1245`, at
  `observedAt=2026-05-08T23:53:30.002Z` with `volume24h=0` and
  `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. This moved `metricsCount` from 1 to 2 and set
  latestMetric / `recentMetrics` to `1245 -> 1244`. Token fields stayed
  `partial / Papu / PAPU / C / 0 / hardRejected=false`, the enrich/rescore
  timestamps stayed unchanged, and Telegram, detect, watch, enrich/rescore,
  ops, systemd, and checkpoint updates were not invoked during the Metric
  step. `metrics:report -- --mint ... --limit 2` and `token:compare`
  confirmed `1245 -> 1244` rawJson-free.
- a later same-mint manual one-shot loop for
  `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump` confirmed the direct
  detector / enrich-rescore / metric snapshot path without ops notification:
  `detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write` created the
  mint-only Token, `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it to `partial` with name/symbol/context/reviewFlags saved and score
  `C` / `0`, and `metric:snapshot:geckoterminal -- --mint ... --write`
  appended one `geckoterminal.token_snapshot` Metric with `metricId=1117`.
- a later watch-detected pump mint loop for
  `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump` confirmed the same downstream
  path from the pump-only detect watch gate:
  `detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`
  created one `mint_only` Token with the default checkpoint unused and only the
  `/tmp` checkpoint updated; `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it to `partial` with `name/symbol=Jennie/Jennie`, score `C` / `0`, and
  `hardRejected=false`; and
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric with `metricId=1122`,
  `observedAt=2026-04-29T14:54:49.239Z`, and saved volume24h / price / fdv /
  reserve / topPool presence. This moved `metricsCount` from 0 to 1 without
  token field updates or Telegram send. It confirms the watch-detected
  first-observation loop only.
- the watch-detected mint's first Metric was then confirmed through existing
  rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 1` showed
  Metric `id=1122`, `observedAt=2026-04-29T14:54:49.239Z`, `volume24h`, and
  true `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent`; `token:compare -- --mint ...` showed latestMetric
  `id=1122`, one `recentMetrics` item, and true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=1`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms report visibility for
  the watch-detected first observation without exposing Metric rawJson.
- the watch-detected mint then confirmed a second single-mint Metric append
  through the same `metric:snapshot:geckoterminal -- --mint ... --write`
  command: `metricsCount` moved from 1 to 2, latestMetric became
  `metricId=1123` with `observedAt=2026-04-29T15:09:40.608Z`, and the previous
  Metric remained `metricId=1122` with
  `observedAt=2026-04-29T14:54:49.239Z`. This check was about time-series
  append behavior for the watch-detected mint, not price evaluation. Token
  fields stayed `partial`, `Jennie` / `Jennie`, score `C` / `0`, and
  `hardRejected=false`; Telegram was not sent.
- the watch-detected mint's two-Metric history was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 2`
  showed Metric ids `1123 -> 1122`, both `observedAt` values, and true
  `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent` for both rows; `token:compare -- --mint ...` showed
  latestMetric `id=1123` plus `recentMetrics` containing `1123` and `1122`,
  each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=2`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms the watch-detected path
  through detection, enrichment, observation, time-series append, and
  rawJson-free report visibility.
- a second pump-only detect watch write with the same bounded `/tmp` checkpoint
  later created mint-only Token
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` and advanced the checkpoint to
  `2026-04-29T15:23:33.000Z |
  3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8`. That mint then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` from `mint_only`
  to `partial` with `name/symbol=wtf/WTF`, score `C` / `0`,
  `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended its first
  `geckoterminal.token_snapshot` Metric with `metricId=1124`,
  `observedAt=2026-04-29T15:41:56.989Z`, and saved volume24h / price / fdv /
  reserve / topPool presence. This moved `metricsCount` from 0 to 1 without
  token field updates or Telegram send. It confirms the second watch-detected
  mint's first-observation loop only.
- the second watch-detected mint's first Metric was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 1`
  showed Metric `id=1124`, `observedAt=2026-04-29T15:41:56.989Z`,
  `volume24h`, and true `priceUsdPresent` / `fdvUsdPresent` /
  `reserveUsdPresent` / `topPoolPresent`; `token:compare -- --mint ...` showed
  latestMetric `id=1124`, one `recentMetrics` item, and true `safeSummary`
  booleans; and `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=1`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms first-observation report
  visibility for the second watch-detected mint without exposing Metric rawJson.
- the second watch-detected mint then confirmed a second single-mint Metric
  append through the same
  `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1125` with
  `observedAt=2026-04-29T15:55:14.973Z`, and the previous Metric remained
  `metricId=1124` with `observedAt=2026-04-29T15:41:56.989Z`. Token fields
  stayed `partial`, `wtf` / `WTF`, score `C` / `0`, and `hardRejected=false`;
  Telegram was not sent. This check was about time-series append behavior for
  the second watch-detected mint, not price evaluation.
- the second watch-detected mint's two-Metric history was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 2`
  showed Metric ids `1125 -> 1124`, both `observedAt` values, and true
  `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent` for both rows; `token:compare -- --mint ...` showed
  latestMetric `id=1125` plus `recentMetrics` containing `1125` and `1124`,
  each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=2`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms that the second
  watch-detected mint also reached detection, enrichment, observation,
  time-series append, and rawJson-free report visibility.
- a third pump-only detect watch write, run as a bounded operation MVP
  rehearsal with the same `/tmp` checkpoint and `--maxIterations 1`, created
  mint-only Token `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump`, advanced the
  checkpoint to `2026-04-29T16:11:48.000Z |
  H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK`, and kept the default
  checkpoint unused. That mint then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` from `mint_only`
  to `partial` with `name/symbol=The People's House/PH`, score `C` / `0`,
  `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended its first
  `geckoterminal.token_snapshot` Metric with `metricId=1126`,
  `observedAt=2026-04-29T16:27:01.275Z`, and saved volume24h / price / fdv /
  reserve / topPool presence. This moved `metricsCount` from 0 to 1 without
  token field updates or Telegram send. It confirms the third watch-detected
  mint's first-observation loop.
- the third watch-detected mint's first Metric was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 1`
  showed Metric `id=1126`, `observedAt=2026-04-29T16:27:01.275Z`,
  `volume24h`, and true `priceUsdPresent` / `fdvUsdPresent` /
  `reserveUsdPresent` / `topPoolPresent`; `token:compare -- --mint ...` showed
  latestMetric `id=1126`, one `recentMetrics` item, and true `safeSummary`
  booleans; and `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=1`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms first-observation report
  visibility for the third watch-detected mint without exposing Metric rawJson.
  Time-series append was not part of this report check.
- the third watch-detected mint then confirmed a second single-mint Metric
  append through the same
  `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1127` with
  `observedAt=2026-04-29T16:42:56.330Z`, and the previous Metric remained
  `metricId=1126` with `observedAt=2026-04-29T16:27:01.275Z`. Token fields
  stayed `partial`, `The People's House` / `PH`, score `C` / `0`, and
  `hardRejected=false`; Telegram was not sent. This check was about
  time-series append behavior for the third watch-detected mint, not price
  evaluation.
- the third watch-detected mint's two-Metric history was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 2`
  showed Metric ids `1127 -> 1126`, both `observedAt` values, and true
  `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent` for both rows; `token:compare -- --mint ...` showed
  latestMetric `id=1127` plus `recentMetrics` containing `1127` and `1126`,
  each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=2`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms that the third
  watch-detected mint also reached detection, enrichment, observation,
  time-series append, and rawJson-free report visibility.
- the earlier one-shot mint `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump`
  then confirmed a second single-mint Metric append through the same
  `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1118` with
  `observedAt=2026-04-29T10:50:02.424Z`, and the previous Metric remained at
  `observedAt=2026-04-29T10:35:31.337Z`. This check was about append/time-series
  behavior, not price evaluation.
- the same mint then confirmed a bounded single-mint watch write through
  `metric:snapshot:geckoterminal -- --mint ... --write --watch --maxIterations 1 --minGapMinutes 10`:
  watch mode ran exactly one cycle, selected one token, appended one Metric,
  moved `metricsCount` from 2 to 3, and updated latestMetric to `metricId=1119`
  with `observedAt=2026-04-29T11:45:26.494Z`. This was not long-running
  operation; it only confirmed that one-cycle watch write can terminate safely.
- the metric snapshot lane then confirmed bounded batch watch write through
  `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 1 --minGapMinutes 10`:
  `recent_batch` mode ran exactly one cycle, selected one eligible pump token,
  appended one Metric, moved the same mint's `metricsCount` from 3 to 4, and
  updated latestMetric to `metricId=1120` with
  `observedAt=2026-04-29T12:05:54.348Z`. This was not a two-token simultaneous
  write confirmation; it only confirmed that bounded batch watch can terminate
  safely when the current eligible set contains one token.
- a later foreground bounded watch check used
  `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60`:
  the process naturally exited after two cycles, both cycles selected the same
  eligible pump token, and both cycles skipped before fetch as
  `skipped_recent_metric`. This confirmed the `minGapMinutes` repeat-append gate
  and natural foreground exit, not a foreground append; `writtenCount` stayed 0,
  `metricsCount` stayed 4, and latestMetric stayed `metricId=1120`.
- a later tmux bounded watch check used the same bounded command shape inside
  session `lowcap-gecko-metric-bounded`, redirecting output to
  `/tmp/lowcap-gecko-metric-bounded.log`: the tmux session started, naturally
  exited after `maxIterations=2`, appended Metric `metricId=1121` at
  `observedAt=2026-04-29T12:26:25.717Z` in cycle 1, then skipped cycle 2 as
  `skipped_recent_metric`. This confirmed that tmux can run the bounded gate and
  that `minGapMinutes` still suppresses immediate repeat appends; `metricsCount`
  moved from 4 to 5. This was not always-on operation and did not touch systemd.
- a later rerun of that same tmux bounded command confirmed the no-candidate /
  no-write case: it naturally exited after two cycles with `selectedCount=0`,
  `writtenCount=0`, `failedCount=0`, and `rateLimited=false`, leaving
  `metricsCount=5` and latestMetric `metricId=1121` unchanged. This was an
  operation-boundary check, not an additional observation.
- the post-tmux read-only report check confirmed the same mint at
  `metricsCount=5` with latestMetric `metricId=1121`; `metrics:report -- --mint ... --limit 5`
  showed the Metric id order `1121 -> 1120 -> 1119 -> 1118 -> 1117`, and both
  `metrics:report` plus `tokens:compare-report` showed rawJson-free safe
  summary booleans for saved price / fdv / reserve / topPool presence.
- the resulting Metric time series was then confirmed through existing
  read-only CLI: `metrics:report -- --mint ... --limit 2` and
  `token:compare -- --mint ...` show both `observedAt` values, `token:show`
  shows the latestMetric, and `tokens:compare-report` shows cohort-level
  latestMetric summaries for filtered Gecko-origin rows.
- a later foreground bounded detect watch wrapper run created two additional
  Gecko-origin pump mints,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` and
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, with the wrapper pinned by
  env to `/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json` and
  `--pumpOnly --limit 1 --maxIterations 2`.
- the first foreground-created mint,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump`, then confirmed the minimum
  observation path through first Metric append: `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it from `mint_only` to `partial` with
  `name/symbol=Something Dumb/DUMB`, score `C` / `0`, `hardRejected=false`,
  and reviewFlags present; `metric:snapshot:geckoterminal -- --mint ... --write`
  appended Metric `id=1128` at `observedAt=2026-04-30T13:50:42.230Z`,
  moving `metricsCount` from 0 to 1 and setting latestMetric source to
  `geckoterminal.token_snapshot`. The Metric append preserved Token fields and
  did not send Telegram. Volume24h, price, fdv, reserve, and topPool were
  present in the saved Metric snapshot, though token-level `volume24h` was 0.
  That first Metric has now also passed rawJson-free report confirmation:
  `metrics:report -- --mint ... --limit 1` shows Metric `id=1128`,
  `observedAt=2026-04-30T13:50:42.230Z`, `volume24h=0`, and all four
  market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1128`, one `recentMetrics` item, and all four
  `safeSummary` booleans true; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=1`, latestMetric
  observedAt, and latestMetric safe summary columns. Metric rawJson was not
  exposed by the report / compare views. A second single-mint Metric snapshot
  write then confirmed time-series append behavior: Metric `id=1129` was
  appended at `observedAt=2026-04-30T14:23:38.900Z`, moving `metricsCount`
  from 1 to 2 while previousMetric remained `id=1128` at
  `observedAt=2026-04-30T13:50:42.230Z`. The two observations have distinct
  timestamps. Token fields were preserved, Telegram was not sent,
  `volume24h=0` persisted, and price / fdv / reserve / topPool were present.
  The two-Metric history has now also passed rawJson-free report confirmation:
  `metrics:report -- --mint ... --limit 2` shows Metric ids `1129 -> 1128`,
  both `observedAt` values, `volume24h=0` on both rows, and all four
  market-data presence columns true on both rows; `token:compare -- --mint ...`
  shows latestMetric `id=1129` and `recentMetrics` containing `1129` plus
  `1128`, each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  includes the mint in the cohort with `metricsCount=2`, latestMetric
  observedAt, and latestMetric safe summary columns. Metric rawJson was not
  exposed by the report / compare views. This confirms the foreground-created
  mint through detection, enrichment, first observation, time-series append, and
  rawJson-free report visibility.
- the second foreground-created mint,
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, then confirmed its minimum
  observation path through first Metric append:
  `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from
  `mint_only` to `partial` with `name/symbol=Ghostpool/GHOST`, score
  `C` / `0`, `hardRejected=false`, and reviewFlags present; and
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1130` at `observedAt=2026-04-30T16:51:54.070Z`, moving `metricsCount`
  from 0 to 1 and setting latestMetric source to
  `geckoterminal.token_snapshot`. The Metric append preserved Token fields and
  did not send Telegram. `volume24h=null`, while price / fdv / reserve / topPool
  presence were true. That first Metric has now also passed rawJson-free report
  confirmation: `metrics:report -- --mint ... --limit 1` shows Metric
  `id=1130`, `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all
  four market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1130`, one `recentMetrics` item, and all four `safeSummary`
  booleans true; and `tokens:compare-report` includes the mint with
  `metricsCount=1`, latestMetric observedAt, and latestMetric safe summary
  columns. Metric rawJson was not exposed by the report / compare views. A
  second single-mint Metric snapshot write later appended Metric
  `id=1131` at `observedAt=2026-04-30T23:55:54.844Z`, moved `metricsCount`
  from 1 to 2, and left previousMetric as `id=1130` at
  `observedAt=2026-04-30T16:51:54.070Z`, confirming time-series append shape
  for this foreground-created mint. This is a loop-shape confirmation rather
  than a price-quality judgment. Token fields were preserved, Telegram was not
  sent, `volume24h=null`, and price / fdv / reserve / topPool presence were
  true. Two-Metric rawJson-free report confirmation has now also passed:
  `metrics:report -- --mint ... --limit 2` shows Metric ids `1131 -> 1130`,
  latest `observedAt=2026-04-30T23:55:54.844Z`, previous
  `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all four
  market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1131` and `recentMetrics` containing `1131` plus `1130`;
  and `tokens:compare-report` includes the mint with `metricsCount=2` and
  latestMetric safe summary columns. Metric rawJson was not exposed by the
  report / compare views.
- the first tmux bounded detect-created mint,
  `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, has now completed the
  two-Metric observation step. The detect wrapper ran in tmux with `/tmp` checkpoint
  isolation, `--pumpOnly`, `--limit 1`, and `--maxIterations 1`, selected one
  candidate, imported one mint-only Token, and did not use the default
  checkpoint. Enrich/rescore then moved the mint to `partial` as
  `WHO GRANTS WISHES` / `WHO??` with score `C` / `0` and
  `hardRejected=false`. Its `contextWriteCount=1` was the Token
  `entrySnapshot.contextCapture.geckoterminalTokenSnapshot` update, not a
  Metric write or Telegram send. A single-mint Metric snapshot then appended
  Metric `id=1132` at `observedAt=2026-05-01T07:53:31.204Z`, moved
  `metricsCount` from 0 to 1, and set latestMetric source to
  `geckoterminal.token_snapshot`; `volume24h=20333.5730222922`, and price /
  fdv / reserve / topPool presence were true. `metrics:report` and
  `token:compare` confirmed that one saved Metric rawJson-free. A second
  single-mint Metric snapshot then appended Metric `id=1133` at
  `observedAt=2026-05-01T08:08:12.847Z`, moved `metricsCount` from 1 to 2, and
  left previousMetric as `id=1132` at
  `observedAt=2026-05-01T07:53:31.204Z`, confirming a time-series append about
  14 minutes 41 seconds later. The latest row has
  `volume24h=20335.4710939884`, and price / fdv / reserve / topPool presence
  were true. `metrics:report -- --mint ... --limit 2` and `token:compare`
  confirmed Metric ids `1133 -> 1132`, latestMetric `id=1133`, and
  `recentMetrics` containing `1133` plus `1132` rawJson-free.
- the second tmux bounded detect-created mint,
  `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, has now completed the
  two-Metric observation step. The detect wrapper ran in tmux with `/tmp` checkpoint isolation,
  `--pumpOnly`, `--limit 1`, and `--maxIterations 1`, selected one candidate,
  imported one mint-only Token, reported `failedCount=0` and
  `skippedNonPumpCount=2`, and did not use the default checkpoint. Enrich/rescore
  then moved the mint to `partial` as `WarlockCoin` / `Warlock` with score
  `C` / `0`, `hardRejected=false`, all reviewFlags false, and `linkCount=0`.
  Its `contextWriteCount=1` was the Token
  `entrySnapshot.contextCapture.geckoterminalTokenSnapshot` update, not a
  Metric write or Telegram send. A single-mint Metric snapshot then appended
  Metric `id=1134` at `observedAt=2026-05-01T09:30:04.949Z`, moved
  `metricsCount` from 0 to 1, and set latestMetric source to
  `geckoterminal.token_snapshot`; `volume24h=395.7346968031`, and price / fdv /
  reserve / topPool presence were true. `metrics:report -- --mint ... --limit
  1` and `token:compare` confirmed latestMetric `id=1134` plus one
  `recentMetrics` item rawJson-free. A second single-mint Metric snapshot then
  appended Metric `id=1135` at `observedAt=2026-05-01T09:46:34.724Z`, moved
  `metricsCount` from 1 to 2, and left previousMetric as `id=1134` at
  `observedAt=2026-05-01T09:30:04.949Z`, confirming a time-series append about
  16 minutes 29.775 seconds later. The latest row has
  `volume24h=395.7346968031`, and price / fdv / reserve / topPool presence
  were true. `metrics:report -- --mint ... --limit 2` and `token:compare`
  confirmed Metric ids `1135 -> 1134`, latestMetric `id=1135`, and
  `recentMetrics` containing `1135` plus `1134` rawJson-free.
- `token:compare` Metric views were later made rawJson-free and now include
  `safeSummary` booleans, so latestMetric and `recentMetrics` can be used in
  operator reports without exposing Metric rawJson.
- after adding rawJson-free safe summary columns, a later read-only cohort check
  confirmed that `metrics:report -- --limit 10` can show multiple token /
  multiple Metric rows with `priceUsdPresent`, `fdvUsdPresent`,
  `reserveUsdPresent`, and `topPoolPresent`, and that `tokens:compare-report`
  can show the target mint in a filtered Gecko-origin cohort with `metricsCount`
  and latestMetric source / observedAt.

Earlier ops-path Metric append failures are accounted for: the child-process
`cli_error` / `parse_error` path was traced to `tsx` startup and stdout capture
behavior and fixed in the production runner, while a later `fetch failed` result
was isolated to environment-level DNS / network reachability rather than the
target mint or runner output parsing.

This confirms the minimum Token to Metric loop, capture-only ops notification
records, one `metric_appended` production Telegram ops live send, all three
watch-detected mints' downstream enrich/rescore, two Metric appends, and
rawJson-free report confirmation, bounded single-mint and batch Metric snapshot
watch writes, foreground bounded watch natural exit with `minGapMinutes` skip,
tmux bounded watch with one Metric append plus one `skipped_recent_metric`, and
read-only report/compare visibility for a same-mint Metric time series plus
multi-token Metric-row cohort reporting.
For the three watch-detected mints, the important proof is loop shape rather
than price quality: detect, enrich/rescore, first observation, second
observation, and rawJson-free confirmation all work as separate
operator-visible steps.
The first foreground-created mint is now part of the confirmed Token to Metric
loop through first observation, first-Metric rawJson-free report confirmation,
second Metric append, and two-Metric rawJson-free report confirmation. The
second foreground-created mint has now entered the Metric path through
enrich/rescore plus first Metric append, and its first Metric `id=1130` is now
visible rawJson-free through `metrics:report`, `token:compare`, and
`tokens:compare-report`. It has also confirmed time-series append with Metric
`id=1130 -> 1131` and `metricsCount` `1 -> 2`, then confirmed the two-Metric
history rawJson-free through `metrics:report`, `token:compare`, and
`tokens:compare-report`.
The first tmux-created mint has now entered the loop through bounded tmux
detect, enrich/rescore, two Metric appends, and rawJson-free two-Metric report
confirmation for Metric ids `1133 -> 1132`.
The second tmux-created mint has also completed the same loop through bounded
tmux detect, enrich/rescore, two Metric appends, and rawJson-free two-Metric
report confirmation for Metric ids `1135 -> 1134`. Together these two
tmux-created mints make the human-triggered bounded operation MVP complete for
the single-candidate operator-approved Token-to-Metric scope.
It does not confirm scheduler, systemd, `token_completed` live send,
`loop_complete` live send, foreground append, two-or-more-token simultaneous
Metric write, long-running or restart-oriented watch operation, or numeric value
formatting for latestMetric safe summary fields.

## Purpose

Use this flow when a single GeckoTerminal-origin pump mint should move from mint-only intake to one current `Metric` observation with explicit operator checkpoints.

For restart or interruption recovery in the Metric stage, DB state is the first
confirmation target. Use `metrics:report`, `token:compare`, and `token:show`
before considering any rerun. Latest Metric and `metricsCount` confirm the
Metric stage only; they are not detect-checkpoint substitutes.

Metric duplicate policy is docs-fixed but not enforcement-fixed: repeated
same-mint snapshots with different `observedAt` values are time-series
observations, while a strict duplicate candidate is same `tokenId`, same source,
and same `observedAt`. The current schema does not enforce that strict
candidate as unique, so use `metricsCount`, latest Metric, `recentMetrics`,
`--minGapMinutes` where supported, and post-confirmation before any rerun.

For Metric retry / failure handling, ambiguous write results do not permit an
immediate rerun. If CLI output, tmux output, or network/write outcome is
unclear, confirm DB state with `metrics:report`, `token:compare`, and
`token:show` first. `errorCount > 0`, `writtenCount > 1`, latest Metric
mismatch, or `metricsCount` mismatch returns to human gate; retry automation is
not part of this loop.

For cooldown / retry max count, Metric Red retry max is automatic `0`.
Cooldown is only a timing hint for re-check / human gate, not permission to
rerun `metric:snapshot:geckoterminal --write`. Same-observedAt strict duplicate
risk stops until DB read confirmation and a new human-approved Red gate.

## Preconditions

- The repo is clean and on the expected branch.
- The operator has explicit permission for each write step.
- Network/DNS access works before live GeckoTerminal fetches.
- No write step is run as part of a broad batch unless the current prompt explicitly allows it.
- Telegram send is not part of the base loop unless a current Red execution
  prompt explicitly requests `--opsNotify`.

Start every session with:

```bash
pwd
git status --short --branch
git log --oneline -5
```

## Environment Checks

Before any GeckoTerminal live fetch, confirm DNS and HTTPS from the same shell environment:

```bash
getent hosts example.com
getent hosts api.geckoterminal.com
curl -I -L --max-time 10 https://example.com
curl -I -L --max-time 10 https://api.geckoterminal.com
```

The GeckoTerminal top path may return HTTP 404. That is acceptable for reachability; DNS resolution and a real HTTP status are the important checks.

Do not run the metric snapshot dry-run when DNS fails with `EAI_AGAIN`, `ECONNREFUSED`, or host resolve errors.

## Full Flow

### Step 1: Detector Dry-Run

```bash
pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1
```

Pass conditions:

- output is dry-run
- selected count is 1
- selected mint ends with `pump`
- source is `geckoterminal.new_pools`
- no DB write has been requested

Stop when:

- no pump candidate is selected
- the candidate is not GeckoTerminal-origin
- the output shape is unexpected
- network is failing

### Step 2: Detector Write

Red step. Run only with explicit permission for one detector write.

```bash
pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write
```

Pass conditions:

- exactly one accepted mint is handed to the mint-first boundary
- the created or existing token has source `geckoterminal.new_pools`
- `entrySnapshot.firstSeenSourceSnapshot` is preserved when source data exposes it

Stop when:

- more than one write is planned
- `--pumpOnly --limit 1` is not in effect
- the mint does not end with `pump`
- the command reports rate limiting or an unexpected source shape

### Step 3: Token Read-Only Check

```bash
pnpm -s token:show -- --mint <MINT>
```

Expected initial shape:

- `metadataStatus` is usually `mint_only`
- `metricsCount` is 0
- `latestMetric` is null

### Step 4: Token Catch-Up Dry-Run

```bash
pnpm -s ops:catchup:gecko -- --pumpOnly --limit 1 --maxCycles 1
```

Pass conditions before token write:

- `readOnly` is true
- `writeEnabled` is false
- `plannedTokenWrites` is 1
- `plannedMetricAppends` is 1 for a metric-missing incomplete token
- blocking safety checks are empty
- warning safety checks are empty
- write command plan is for `token:enrich-rescore:geckoterminal`
- write command plan has `notify=false`, `metricAppend=false`, and `postCheck=true`

Stop when:

- any blocking safety check appears
- any warning safety check appears
- selected count is not 1
- selected candidate is hard rejected
- selected candidate already has metrics when the goal is the initial token write
- a notify candidate appears and stop-on-notify is enabled

### Step 5: Token-Only Ops Write

Red step. Run only with explicit permission for one gated token-only ops write.

```bash
pnpm -s ops:catchup:gecko -- --write --pumpOnly --limit 1 --maxCycles 1
```

This path runs the token write runner only. It must not append metrics and must not notify.
When capture-only ops notification preview records are explicitly being checked,
add the capture file option:

```bash
pnpm -s ops:catchup:gecko -- --write --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080 --opsNotifyCaptureFile /tmp/lowcap-ops-notify-capture.jsonl
```

Pass conditions:

- one token write execution result is reported
- `postCheckResult.checked` is true
- token is found
- token is no longer pending
- name and symbol are present
- `metadataStatus` moved beyond `mint_only`, usually to `partial`, `enriched`, or another non-pending status
- if `metricsCount` is still 0, `metric_missing_after_token_only_write` may appear as the expected warning
- `metricOnlyAppendCandidates` contains the mint when token completion succeeded but metrics are still missing

Stop when:

- runner status is `cli_error` or `parse_error` and DB state did not complete the token
- `tokenWriteRetryCandidates` contains the mint
- `runnerDbMismatchCandidates` contains the mint
- token remains pending
- capture-only was requested but no `token_completed` record appears after an otherwise successful token completion

### Step 6: Post Token Write Read-Only Check

```bash
pnpm -s token:show -- --mint <MINT>
```

Pass conditions:

- name is present
- symbol is present
- `metadataStatus` is not `mint_only`
- `metricsCount` is 0 before metric append
- `latestMetric` is null before metric append

### Step 7: Metric Snapshot Dry-Run

Run this only after the environment checks pass.

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT>
```

Pass conditions:

- `mode` is `single`
- `dryRun` is true
- `writeEnabled` is false
- `selectedCount` is 1
- item status is `ok`
- `wouldCreateMetric` is true
- `metricId` is null
- `writtenCount` is 0
- `metricCandidate.source` is `geckoterminal.token_snapshot`
- `metricCandidate.safeSummary.priceUsdPresent` is visible
- `metricCandidate.safeSummary.fdvUsdPresent` is visible
- `metricCandidate.safeSummary.reserveUsdPresent` is visible
- `metricCandidate.safeSummary.topPoolPresent` is visible
- `metricCandidate.volume24h` is visible as a number or null
- no `metricCandidate.rawJson` field, raw payload body, or rawJson byte count is
  printed in user-facing output; DB storage of Metric rawJson remains unchanged

Stop when:

- item status is `error`
- error is DNS or network related
- `wouldCreateMetric` is false
- selected count is not 1
- safe summary fields are missing from the dry-run output
- a rawJson field or raw payload body appears in user-facing output

### Step 8: Metric Append Write

There are two confirmed one-metric append paths.

Manual path:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write
```

Ops path:

```bash
pnpm -s ops:catchup:gecko -- --write --metricAppend --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080
```

Use the manual path when directly confirming the metric snapshot CLI for one known mint.
Use the ops path when confirming the production catch-up supervisor can delegate exactly one
Metric append through the injected runner.
When capture-only ops notification preview records are explicitly being checked,
the ops path may include:

```bash
--opsNotifyCaptureFile /tmp/lowcap-ops-notify-capture.jsonl
```

#### Manual Path

Red step. Run only with explicit permission for one Metric append write.

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write
```

Pass conditions:

- `mode` is `single`
- `writeEnabled` is true
- item status is `ok`
- `writtenCount` is 1
- `writeSummary.metricId` is not null
- exactly one `Metric` row is created
- token fields are not mutated by the metric append

Stop when:

- more than one item is selected
- more than one metric is written
- token address in snapshot does not match the mint
- GeckoTerminal returns a rate limit or network failure

#### Ops Path

Red step. Run only with explicit permission for one ops Metric append write.

```bash
pnpm -s ops:catchup:gecko -- --write --metricAppend --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080
```

Preconditions:

- target token is already complete
- `metricsCount` is 0
- `latestMetric` is null
- ops `--metricAppend` dry-run reports `plannedTokenWrites=0`
- ops `--metricAppend` dry-run reports `plannedMetricAppends=1`
- `metricAppendCommandPlan` length is 1
- safety checks have no fail or warn entries

Pass conditions:

- `metricAppendExecutionResults` length is 1
- metric append runner status is `ok`
- selected count is 1
- `writtenCount` is 1
- `writeSummary.metricId` is not null
- `tokenWriteExecutionResults` length is 0
- `token:show` reports `metricsCount=1` or greater
- `token:show` reports latest metric source `geckoterminal.token_snapshot`
- if capture-only was requested, JSONL includes `metric_appended` and
  `loop_complete` records with `delivery=capture_only`
- final ops dry-run reports `no_pending`
- final ops dry-run reports `nextRecommendedAction=no_action`

Stop when:

- the token write plan is not empty
- `metricAppendCommandPlan` length is not 1
- any safety check is fail or warn
- more than one metric append execution result is reported
- `writtenCount` is not exactly 1
- `writeSummary.metricId` is missing
- `tokenWriteExecutionResults` is not empty
- post-check warnings, retry candidates, or runner DB mismatch candidates appear
- capture-only was requested but the capture records include secret/env/raw
  stdout/raw stderr/full-args style fields

Do not:

- run token write and Metric append in the same execution
- run ops Metric append without `--metricAppend`
- increase `--limit` above 1
- increase `--maxCycles` above 1
- move from this confirmation into Telegram, scheduler, watch, or systemd setup
- treat capture-only as Telegram live send readiness by itself

### Step 9: Final Read-Only Checks

```bash
pnpm -s token:show -- --mint <MINT>
pnpm -s ops:catchup:gecko -- --pumpOnly --limit 1 --maxCycles 1
```

If a metric id was returned:

```bash
pnpm -s metric:show -- --id <METRIC_ID>
```

Final pass conditions:

- `metricsCount` is 1 or greater for the mint
- `latestMetric` is present
- capture-only records, when requested, contain only safe preview fields and
  include the expected trigger names for the completed step
- `summary.status` is `no_pending`
- `plannedTokenWrites` is 0
- `plannedMetricAppends` is 0
- `blockingSafetyChecks` is empty
- `warningSafetyChecks` is empty
- `nextRecommendedAction` is `no_action`
- `metricOnlyAppendCandidates` is empty
- `tokenWriteRetryCandidates` is empty
- `runnerDbMismatchCandidates` is empty

### Step 10: Read-Only Metric History Checks

After a second same-mint Metric append, use read-only views to confirm the
history and cohort visibility before moving toward watch or systemd:

```bash
pnpm -s metrics:report -- --mint <MINT> --limit 2
pnpm -s metrics:report -- --mint <MINT> --limit 5
pnpm -s metrics:report -- --limit 10
pnpm -s token:compare -- --mint <MINT>
pnpm -s token:show -- --mint <MINT>
pnpm -s tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 5
```

Pass conditions:

- `metrics:report -- --mint <MINT> --limit 2` returns the two latest rows for
  that mint, shows two distinct `observedAt` values, and exposes rawJson-free
  safe summary columns for market-data presence.
- After the bounded tmux confirmation, `metrics:report -- --mint <MINT> --limit 5`
  confirmed the five-row Metric history with ids
  `1121 -> 1120 -> 1119 -> 1118 -> 1117`.
- `metrics:report -- --limit <N>` can show multiple token / multiple Metric
  rows with the same safe summary columns.
- `token:compare -- --mint <MINT>` shows single-token details plus
  `metricsCount`, latestMetric, and `recentMetrics`; Metric views omit rawJson
  and include `safeSummary` booleans for price / fdv / reserve / topPool
  presence.
- `token:show -- --mint <MINT>` is useful for confirming the latestMetric only;
  it is not the best view for the full two-row history.
- `tokens:compare-report` is useful for cohort and latestMetric summaries; it is
  not the best direct view for two-row same-mint history, but it does expose
  latestMetric safe summary columns. The post-tmux check used `minMetricsCount=5`
  to confirm the target mint in the Gecko-origin cohort with `metricsCount=5`
  and latestMetric `id=1121`.
- Together, `metrics:report`, `token:compare`, and `tokens:compare-report`
  cover Metric row history, single-token history/details, and cohort/latestMetric
  summaries without printing Metric rawJson.

Known gap:

- To inspect Metric row history after filtering by Token source or
  `metadataStatus`, operators currently need to combine `tokens:compare-report`
  for cohort selection with `metrics:report` for Metric rows.
- Safe summary fields are presence booleans only; numeric formatting remains a
  separate future improvement.

## Dry-Run Versus Write

Dry-run commands may perform live fetches, but they must not create or update database rows.

Write commands mutate data and require explicit current-turn permission:

- `detect:geckoterminal:new-pools --write` creates or reuses one mint-only token through the mint-first boundary
- `ops:catchup:gecko --write` performs one gated token-only write through `token:enrich-rescore:geckoterminal`
- `metric:snapshot:geckoterminal --write` appends one `Metric` row for a successful snapshot
- `metric:snapshot:geckoterminal -- --mint <MINT> --write` now records one
  `metric_appended` Notification capture record after the successful
  single-mint Metric create, using key `${mint}:metric_appended:${metricId}`,
  `trigger=metric_appended`, `status=captured`, `mode=capture_only`,
  `source=metric:snapshot:geckoterminal`, and safe `messagePreview`. The hook
  is not enabled for batch / limit mode; its side-effect boundary is Metric
  create maximum 1, Notification create maximum 1, Token write 0, Telegram send
  0, and checkpoint write 0 per single-mint run. The first production Red
  rehearsal succeeded for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`: backup
  `/tmp/lowcap-dev.db.before-metric-snapshot-notification-20260509T135724Z.bak`
  was created, Token count stayed `1107 -> 1107`, Metric count moved
  `191 -> 192`, Notification count moved `0 -> 1`, Metric `1264` was created
  for token `5043`, and Notification `1` used key
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264` with
  `eventType=metric_appended`, `trigger=metric_appended`, `status=captured`,
  `mode=capture_only`, `source=metric:snapshot:geckoterminal`,
  `rawJsonFree=true`, and `secretFree=true`; rollback was not needed and
  restore was not executed.
- `ops:catchup:gecko --write --metricAppend` delegates exactly one Metric append through the production runner only when the gated one-token, one-cycle Metric-only plan is eligible
- `ops:catchup:gecko --opsNotifyCaptureFile <PATH>` appends ops notification preview records to a local JSONL file only; live Telegram send happens only when `--opsNotify` is also explicitly requested and the selected trigger passes the send gate

Do not combine these write steps into one hidden automation path.

Do not run a Red Telegram live-send execution when the read-only preflight has
no eligible candidate. Do not create a write target only to confirm a live send.
When a future eligible candidate appears, first run the read-only preflight,
then choose exactly one command, get explicit Red permission, and only then run
that command once. The current policy keeps production live send limited to
`--opsNotifyTrigger metric_appended`; `token_completed` and `loop_complete`
remain capture-only.

## Phase Update Criteria

Update the phase progress only when the relevant write and read-only confirmation both completed.

Use these markers:

- Detector write complete: one pump mint was accepted and a mint-only token exists.
- Token-only ops write complete: post-check confirms token found, not pending, name and symbol present.
- Metric append complete: exactly one Metric row was appended and `token:show` reports a latest metric.
- Loop complete: final `ops:catchup:gecko` dry-run reports `no_pending` and `no_action`.
- Capture-only ops notification complete: JSONL contains the expected
  `token_completed`, `metric_appended`, and `loop_complete` records with
  `delivery=capture_only` and no secret/env/raw-output/full-args leakage.
- Metric-appended Telegram ops live send complete: a bounded
  `ops:catchup:gecko --write --metricAppend` execution reports `sentCount=1`,
  `status=sent`, the selected trigger is `metric_appended`, exactly one Metric
  row was appended, and capture-only JSONL records were written without
  secret/env/raw-output/full-args leakage.
- Telegram live loop policy fixed: `metric_appended` is the only initial live
  candidate, duplicate key is `mint + eventType + metricId`, and live send
  still requires DB read confirmation, capture-only rehearsal, marker checks,
  and human gate.
- Queue pre-gate policy fixed: the `metric_appended` notification key remains
  `mint + eventType + metricId`, only events with `metricId` are initial live
  candidates, and `token_completed` / `loop_complete` remain capture-only.
  Durable dedupe storage and queue idempotency are still not implemented.
- Capture-only rehearsal consistency policy fixed: `metric_appended` is still
  the only initial live candidate, but live send still requires capture-only
  pass, DB read confirmation, marker checks, and human gate. Capture-only pass
  requires the expected trigger / event type / mint, a `metricId`, computable
  duplicate key, safe message preview, and no rawJson / raw payload / secret
  marker. Capture-only pass alone does not complete durable dedupe, and
  `token_completed` / `loop_complete` remain capture-only.
- Durable notification dedupe storage policy fixed: the initial
  `metric_appended` notification key is `mint + eventType + metricId`, and
  only events with `metricId` are initial live candidates. `token_completed` /
  `loop_complete` remain capture-only. Notification DB table creation is now
  complete with `Notification` count 0, and the minimal Notification
  repository is implemented. `ops:catchup:gecko` now records the selected
  `metric_appended` capture-only Notification row, while `token_completed` /
  `loop_complete` Notification writes, queue idempotency, failed-send retry,
  and Telegram live-loop integration are still not implemented.
- Failed-send / resend policy fixed: `failed` is not `sent`, previous `sent`
  on the same notification key blocks resend, and any `metric_appended` resend
  still requires DB confirmation, capture-only pass, marker checks, human gate,
  and separate Red approval. Commit `a5d1575` adds the manual
  `notification:send --retryFailed` path for a notificationKey-specified
  `failed` / `live_send` `metric_appended` row only; `--retryFailed` is
  required, and `sent` rows remain blocked from resend. Automatic failed-send
  retry remains unimplemented.
- Notification model boundary / lifecycle policy fixed: `Notification` is now
  present in `prisma/schema.prisma`, uses `mint + eventType + metricId` for the
  initial `metric_appended` key, keeps `metricId`-bearing `metric_appended` as
  the only initial live candidate, and keeps `token_completed` /
  `loop_complete` capture-only. Formal migration files now exist, while DB
  table creation / apply is now complete for `prisma/dev.db`; the minimal
  Notification repository is implemented, and the `metric_appended`
  capture-only Notification write integration is implemented. Broader runtime
  Notification writes, including `token_completed` / `loop_complete`, remain
  unimplemented.
- Notification schema / migration baseline policy fixed: the first Yellow
  schema cut added the model, schema-level inspection test, and
  `/tmp/add_notification.sql` SQL preview, with Prisma validate / generate,
  TypeScript check, and schema-level verification completed. It does not include
  DB write integration beyond the later `metric_appended` capture-only
  Notification record path, Telegram live send, queue, or systemd.
- Notification migration split policy fixed: `/tmp/lowcap-baseline-existing-schema.sql`
  contains only existing `Dev` / `Token` / `Metric` creation, while
  `/tmp/lowcap-add-notification-only.sql` contains only the `Notification`
  table and `Notification_notificationKey_key` unique index. Formal migration
  files are now created under `prisma/migrations`, and the Red DB apply to
  `prisma/dev.db` completed with backup
  `/tmp/lowcap-dev.db.before-notification-20260509T111516Z.bak`, both
  `_prisma_migrations` records, `Notification` table / unique index present,
  `Notification=0`, and existing counts unchanged (`Dev=0`, `Token=1107`,
  `Metric=191`).
- Notification repository status recorded: `src/notifications/notificationRepository.ts`
  implements `findNotificationByKey`, `createCapturedNotification`,
  `maybeCreateByNotificationKey`, `markNotificationSent`, and
  `markNotificationFailed` with PrismaClient / notification delegate injection,
  explicit field mapping, and forbidden never-store key rejection.
  `tests/notificationRepository.test.ts` uses temp SQLite; it did not write to
  production `prisma/dev.db`. Commit `905d3ac` connects the repository to
  `ops:catchup:gecko` capture-only output for `metric_appended` only, with key
  `${mint}:metric_appended:${metricId}`, `status=captured`,
  `mode=capture_only`, safe `messagePreview`, one Notification create maximum
  per run, duplicate-key count stability, and skip behavior for missing
  `mint` / `metricId` or multiple captured `metric_appended` records.
  Commit `442cf8e` also connects the single-mint
  `metric:snapshot:geckoterminal -- --mint <MINT> --write` path to the same
  capture-only Notification boundary after Metric create, with
  `${mint}:metric_appended:${metricId}`, `trigger=metric_appended`,
  `status=captured`, `mode=capture_only`, and
  `source=metric:snapshot:geckoterminal`. Batch / limit mode Notification
  writes remain out of scope. Its focused test uses temp SQLite and does not
  write production `prisma/dev.db`. The first production Red rehearsal for this
  hook created Metric `1264` and Notification `1` for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, with Token count unchanged
  (`1107 -> 1107`), Metric count `191 -> 192`, Notification count `0 -> 1`,
  notification key
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264`, and
  `Notification_notificationKey_key` present.
  Commit `2d83b05` adds the `metric_appended` sent / failed marking path for an
  existing captured Notification row with mocked sender and temp-SQLite tests:
  it calls the sender only for `captured` / `capture_only`, marks success as
  `status=sent`, `mode=live_send`, and `sentAt`, marks failure as
  `status=failed`, `mode=live_send`, `failedAt`, and safe `errorCode` /
  `reason`, creates no Notification rows, and adds no Metric / Token writes.
  Commit `983b7e3` adds the notificationKey-specified live-send rehearsal path
  and `pnpm notification:send`: dry-run is the default, `--live` is required
  before any sender call, only `metric_appended` is supported, one existing row
  is looked up by `notificationKey`, missing / already sent / non-captured rows
  and missing `mint` / `metricId` are blocked, and success / failure updates at
  most one row through the safe sent / failed marking APIs. It creates no
  Notification rows, adds no Metric / Token writes, stores no Telegram response
  body, request path, bot token, chat id, or env value, and is covered by
  temp-SQLite mocked-sender tests. The notificationKey-specified real Telegram
  live-send Red rehearsal is now complete for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264`: backup
  `/tmp/lowcap-dev.db.before-notification-live-send-20260509T151757Z.bak` was
  created, dry-run returned `status=ready`, `senderCalled=false`,
  `sentCount=0`, and `updatedCount=0`, live send returned `status=sent`,
  `senderCalled=true`, `sentCount=1`, and `updatedCount=1`, counts stayed
  `Token=1107`, `Metric=192`, and `Notification=1`, and the existing
  Notification row now has `status=sent`, `mode=live_send`,
  `sentAt=1778339880613`, `failedAt=null`, `errorCode=null`, `reason=null`,
  `rawJsonFree=1`, and `secretFree=1`. Telegram response body, bot token, chat
  id, and env markers were not stored; rollback was unnecessary and restore was
  not executed. Commit `a5d1575` adds manual retry to `notification:send` via
  explicit `--retryFailed`: without that flag, `failed` / `live_send` rows are
  blocked; with it, only one notificationKey-specified `metric_appended`
  `failed` / `live_send` row can be retried. Retry success sets
  `status=sent`, `mode=live_send`, and `sentAt`, and clears `failedAt`,
  `errorCode`, and `reason`; retry failure sets `status=failed`,
  `mode=live_send`, `failedAt`, safe `errorCode`, and fixed safe
  `reason=ops_notify_send_failed`. It creates no Notification rows, adds no
  Metric / Token writes, stores no response body / bot token / chat id / env,
  and is covered by temp-SQLite mocked-sender tests. The manual retry Red
  rehearsal is now complete for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`
  through
  `pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`:
  backup `/tmp/lowcap-dev.db.before-notification-retry-send-20260509T235410Z.bak`
  was created, dry-run returned `status=ready`, `senderCalled=false`,
  `sentCount=0`, and `updatedCount=0`, and live retry called the sender once
  but returned `status=failed`, `senderCalled=true`, `sentCount=0`,
  `updatedCount=1`, and `errorCode=telegram_network_error`. Counts stayed
  `Token=1107`, `Metric=192`, and `Notification=2`; the retry target row
  remains `status=failed`, `mode=live_send`, `sentAt=null`,
  `failedAt=1778370852010`, `errorCode=telegram_network_error`,
  `reason=ops_notify_send_failed`, `rawJsonFree=1`, and `secretFree=1`; the
  existing sent row remains `status=sent`, `mode=live_send`, and
  `sentAt=1778339880613`. Telegram response body, bot token, chat id, and env
  markers were not stored; rollback was unnecessary and restore was not
  executed. This is failed retry evidence, not retry success. Automatic retry,
  retry queue, `retryCount` / `nextRetryAt` / cooldown automation, sent row
  resend, `token_completed` / `loop_complete` retry, queue, scheduler, systemd,
  default checkpoint, automatic Red execution, unbounded watch, and always-on
  bot operation remain unimplemented / unexecuted.
- `notification:retry:plan` is now implemented by commit `02728ae` as a
  read-only / non-executor planner. The CLI is
  `pnpm -s notification:retry:plan`, output uses
  `mode=read_only_retry_planner`, `willExecute=false`, and `executor=human` or
  `none`, and it performs DB write 0, Telegram send 0, and Notification update
  0. It does not execute `notification:send`; it only prints
  `nextRedCommand` as a string. The candidate set is only `failed` /
  `live_send` `metric_appended` rows with `trigger=metric_appended`,
  `rawJsonFree=true`, `secretFree=true`, `notificationKey`, `mint`, and
  `metricId`; `token_completed`, `loop_complete`, `sent`, and `captured` rows
  are out of scope. Sorting is `failedAt ASC`, `updatedAt ASC`, `id ASC`,
  `selectedCount` is max 1, candidate 0 gives `status=stop` and
  `nextRedCommand=null`, and a selected candidate prints
  `pnpm -s notification:send -- --notificationKey <KEY> --trigger metric_appended --live --retryFailed`.
  The Red command side-effect bound stays Telegram send max 1, Notification
  update max 1, Notification create 0, Token / Metric write 0, and no
  checkpoint / queue / systemd. Temp-SQLite tests are complete and production
  `prisma/dev.db` is not used. Automatic retry, retry queue, scheduler /
  systemd, `retryCount` / `nextRetryAt` / cooldown automation, claim / lease,
  sent row resend, `token_completed` / `loop_complete` retry, default
  checkpoint operation, unbounded watch, always-on bot, and automatic Red
  command execution remain unimplemented / unenabled.
- The planner-selected manual retry Red rehearsal has also run through the
  `notification:retry:plan` selected `nextRedCommand`:
  `pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`.
  The target was
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`,
  and backup
  `/tmp/lowcap-dev.db.before-planner-retry-send-20260510T060558Z.bak` was
  created. Planner confirmation returned `status=ok`, `candidateCount=1`,
  `selectedCount=1`, and matching `nextRedCommand`; live retry returned
  `status=failed`, `senderCalled=true`, `sentCount=0`, `updatedCount=1`, and
  `errorCode=telegram_network_error`. Counts stayed `Token=1107`,
  `Metric=192`, and `Notification=2`. The retry target row remains
  `status=failed`, `mode=live_send`, `sentAt=null`,
  `failedAt=1778393159818`, `errorCode=telegram_network_error`,
  `reason=ops_notify_send_failed`, `rawJsonFree=1`, and `secretFree=1`; the
  existing sent row remains `status=sent`, `mode=live_send`,
  `sentAt=1778339880613`, `failedAt=null`, `errorCode=null`, `reason=null`,
  `rawJsonFree=1`, and `secretFree=1`. Telegram response body, bot token, chat
  id, and env markers were not stored; rollback was unnecessary and restore
  was not executed. This is planner-selected failed retry evidence, not retry
  success. Automatic retry, retry queue, `retryCount` / `nextRetryAt` /
  cooldown automation, claim / lease, sent row resend, `token_completed` /
  `loop_complete` retry, queue, scheduler, systemd, durable queue runtime,
  default checkpoint operation, automatic Red execution, unbounded watch, and
  always-on bot operation remain unimplemented / unenabled.

Keep the phase unchanged when:

- work was read-only only
- DNS or HTTPS failed before snapshot
- dry-run did not produce `wouldCreateMetric=true`
- Red live-send preflight returns no eligible candidate
- write was not explicitly permitted
- post-check exposes retry or mismatch candidates

## Not Automated Yet

This loop does not yet include:

- queue or worker orchestration
- scheduler or systemd setup
- always-on watch operation
- multi-token write
- multi-cycle write
- automatic Metric append after token write
- automatic retry or resume
- `token_completed` Telegram ops live-send execution
- `loop_complete` Telegram ops live-send execution
- Telegram live loop integration, runtime Notification record write
  integration beyond the narrow implemented capture and mocked marking paths,
  real Telegram live send, failed-send retry, or cooldown automation
- queue idempotency, per-item failure handling, or durable notification dedupe
  runtime integration
- generic multi-source adapter runtime

## Next Candidate Steps

After this confirmed minimum loop, the next small operating steps are either:

- run one more explicit Token to Metric loop to confirm repeatability
- define the next docs-only runtime gate before any additional Telegram live
  send category is approved

## Notes

- Keep token completion and Metric append as separate operator-visible steps.
- Prefer single-mint commands for write confirmation.
- Do not expose raw stdout, raw stderr, env, cwd, full args, or full API responses in reports.
- Save large JSON to `/tmp` when local inspection is needed, then report only the fields required for the decision.
- If DNS fails in Codex but works in a normal WSL shell, treat the Codex sandbox network configuration as the blocker and do not rerun the metric snapshot CLI until the same shell can resolve the host.

## 2026-05-23 Five-Token Enrich/Rescore Preflight

The latest five-token minimum-loop cohort has reached the point after
Token creation and first Metric append:

- Tokens `5624..5620` are GeckoTerminal-origin pump `mint_only` rows.
- Each has one Metric (`1532..1536`) and no Notification or HolderSnapshot.
- Each remains metadata-empty with `scoreRank=C`, `scoreTotal=0`,
  `hardRejected=false`, `enrichedAt=null`, and `rescoredAt=null`.
- The 24h pump queue reports `enrichPendingCount=5` and
  `metricPendingCount=0`.

Read-only preflight confirmed the batch enrich/rescore selector can target
exactly those five rows with `--pumpOnly --limit 5 --sinceMinutes 1440`.
The next Red, if human-approved, should keep token completion and Metric append
separate by running only:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Expected writes are limited to Token enrichment, rescore, context capture, and
review flags. Metric, Notification, HolderSnapshot, Telegram, scheduler,
systemd, and repo-local data changes are not expected. Do not add `--notify`.

## 2026-05-23 Five-Token Enrich/Rescore Batch Result

The human-approved five-token batch ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

It selected the intended five rows and completed `enrichWritten=5`,
`rescoreWritten=5`, and `contextWritten=5` with `error=0`, `notifySent=0`,
`rateLimited=false`, and no 429. Metaplex lookup was attempted for all five,
but each returned `metadata_account_missing`.

The cohort moved from `mint_only` to `partial`:

- `5624`: `the saviour` / `BALTO`
- `5623`: `X COMM ADDED` / `Bunker`
- `5622`: `bank of banks` / `BANKS`
- `5621`: `Nietzschean Camel` / `Camel`
- `5620`: `VAULT COIN` / `VAULT`

All five remain score `C` / `0` and `hardRejected=false`. Each still has
`metricsCount=1`, `notificationCount=0`, and `holderSnapshotCount=0`.
Metric count, Notification count, HolderSnapshot count, Telegram delivery,
scheduler/systemd, and repo-local data stayed unchanged.

The minimum loop for this cohort has now confirmed: bounded Token creation,
first Metric append, rawJson-free report/window visibility, and bounded
Token-only enrich/rescore/context capture. The next step should be a Green
read-only report/readiness check before any second Metric write or broader
backlog work.

## 2026-05-23 Enriched Partial Five-Token Report Review

The read-only report/readiness check after enrich/rescore confirmed the cohort
is ready for a second-Metric preflight:

- all five rows are `partial`
- names / symbols are present
- descriptions are absent
- normalized text, enrich timestamp, rescore timestamp, Gecko context capture,
  and review flags are present
- score remains `C / 0`
- no hard reject
- each still has one Metric, no Notification, and no HolderSnapshot

`metrics:report` shows Metric ids `1532..1536` with enriched names / symbols
and rawJson-free safe summary booleans. `tokens:compare-report` includes all
five as partial GeckoTerminal rows with `metricsCount=1` and unresolved /
multiple-missing outcome state. `metrics:window-report` still reads the cohort
as one-FDV-sample windows: coverage `thin`, no alert FDV anchor, window FDV
samples present, `outcomeLabel=no_data`, and `entryAnchorQuality=near_30m`.

The 24h pump queue now has no pending enrich or Metric work for this cohort,
while the 168h queue still has `enrichPendingCount=420` and
`metricPendingCount=260`. Complete the narrow loop first by preflighting a
second Metric snapshot for these five partial rows; only then decide whether to
return to broader 168h enrich or Metric accumulation.

## 2026-05-24 Second Metric Snapshot Preflight

The second-Metric Green preflight kept the same five-token cohort narrow and
read-only. It did not run Metric snapshot, did not use `--write`, did not fetch
externally, and did not write Token, Metric, Notification, or HolderSnapshot
rows.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`, with Metric distribution `0=1222`, `1=237`, `2+=82`.
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`; retry and
auto-send candidates stayed `0`.

Read-only simulation for the next candidate command selected exactly the five
partial rows:

- `5624` / `BALTO` / latest Metric `1532`
- `5623` / `Bunker` / latest Metric `1533`
- `5622` / `BANKS` / latest Metric `1534`
- `5621` / `Camel` / latest Metric `1535`
- `5620` / `VAULT` / latest Metric `1536`

All five latest Metric observations are about `346` minutes old at preflight
time, so `--minGapMinutes 60` should not skip them. The selector returned
`eligibleCount=5` and `selectedCount=5` for `--pumpOnly --limit 5
--sinceMinutes 1440 --minGapMinutes 60`.

Next human-approved Red exact command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effects are external GeckoTerminal fetch and Metric write up to
`+5`. Token update, Notification create/update, HolderSnapshot write, Telegram
send, repo-local data diff, rawJson full dump, scheduler, and systemd are not
expected. Do not retry or widen the command if a 429 or provider error appears.

## 2026-05-24 Second Metric Snapshot Result

The human-approved second Metric snapshot command ran once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

It selected the intended five partial rows and completed with
`selected=5`, `written=5`, `skipped=0`, `error=0`,
`interItemDelayMs=15000`, and `interItemDelayCount=4`. There was no provider
error, no 429, and no retry.

The cohort now has two Metrics each:

- `5624` / `BALTO`: Metric `1532` then `1537`
- `5623` / `Bunker`: Metric `1533` then `1538`
- `5622` / `BANKS`: Metric `1534` then `1539`
- `5621` / `Camel`: Metric `1535` then `1540`
- `5620` / `VAULT`: Metric `1536` then `1541`

Counts moved Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`. Metric distribution moved
`0=1222`, `1=237`, `2+=82 -> 0=1222`, `1=232`, `2+=87`.
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.

The run wrote only Metric rows and fetched GeckoTerminal. It did not update
Tokens, create/update Notifications, write HolderSnapshots, send Telegram,
touch scheduler/systemd, create repo-local data diffs, or dump rawJson.

Read-only `metrics:window-report` confirmed the second sample moves 12h / 24h
FDV coverage to `partial` for all five rows. Shorter windows remain `thin`,
and `outcomeLabel` remains `no_data` because the no-Notification rows still
have no alert FDV anchor near entry.

This completes the narrow five-token minimum loop through Token creation,
first Metric, enrich/rescore, second Metric, and report verification. Next,
preflight the 168h GeckoTerminal enrichPending backlog before any wider Token
update Red.

## 2026-05-24 168h Enrich Backlog Preflight

The narrow five-token loop is complete, so the next Green pass inspected the
broader 168h GeckoTerminal pump enrichPending backlog without writes or
external fetches.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`.
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`; retry and
auto-send candidates stayed `0`.

Backlog shape for `--pumpOnly --sinceMinutes 10080`:

- enrichPending count: `240`
- all pending rows are `metadataStatus=mint_only`
- all pending rows are GeckoTerminal-origin pump rows
- Metric count distribution: `0=85`, `1=96`, `2+=59`
- score distribution: `C=240`
- hardRejected distribution: `false=240`
- narrow loop overlap: `0`

The enrich/rescore CLI accepts `--sinceMinutes`, not `--sinceHours`, so 168h
must be represented as `10080` minutes. Batch selection is deterministic by
`firstSeenSourceSnapshot.detectedAt` when present, otherwise `Token.createdAt`.

Selection simulation:

- limit 5: ids `5619`, `5618`, `5617`, `5616`, `5615`
- limit 10: ids `5619..5610`
- limit 20: ids `5619..5600`

Next human-approved Red exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
metadata-uri fetch, and Token enrich/rescore/context/reviewFlags update for up
to five rows. Metric write, Notification create/update, HolderSnapshot write,
Telegram send, repo-local data diff, rawJson full dump, scheduler, and systemd
are not expected. Do not add `--notify`.

## 2026-05-24 168h Enrich Backlog Batch Result

The approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Metaplex lookup returned
`metadata_account_missing=5`.

The selected ids `5619`, `5618`, `5617`, `5616`, and `5615` moved from
`metadataStatus=mint_only` to `partial`. They now have names/symbols:
`BUYBACK WORKS NOW` / `COMPASS`, `zynnner` / `zyn`,
`Carnegie UK Trust` / `CUKT`, `LIBERTY ENLIGHTENING THE WORLD` / `LIBERTY`,
and `BUYBACKS ARE OFF ON COIN` / `COMPASS`. All remained score `C / 0`,
`hardRejected=false`, description absent, normalized text present, and
reviewFlags present with no website, X, Telegram, Metaplex hit, description,
or links.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`. The selected rows retained metrics counts
`5,4,4,4,4`, notification counts `1,0,0,0,0`, and holderSnapshot count `0`.
The 168h queue moved from `enrichPendingCount=240` to `235`, with
`metricPendingCount=85`, `staleReviewCount=235`, and
`notifyCandidateCount=0`.

Expected non-effects held: no Metric write, no Notification create/update, no
HolderSnapshot write, no Telegram send, no auto-send or retry execution, no
scheduler/systemd, no repo-local data diff, and no rawJson full dump.

## 2026-05-24 Metric Backlog Accumulation Preflight

The Green preflight for returning from enrich backlog work to Metric
accumulation stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal`, did not use `--write`, did not fetch
GeckoTerminal, and did not write DB state.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`;
retry and enabled auto-send allowed candidates stayed `0`.

The 168h queue still has `metricPendingCount=85`, but the current
`metric:snapshot:geckoterminal` batch selection does not target that queue. It
selects recent GeckoTerminal-origin pump rows by newest selection anchor first.
With `--sinceMinutes 10080 --minGapMinutes 60`, the checked limits select:

- limit 5: ids `5624..5620`, already `metricsCount=2`
- limit 20: ids `5624..5605`, already measured
- limit 30: ids `5624..5595`, already measured
- limit 75: ids `5624..5550`, `metricsCount=1..5`, no Metric 0 rows

The actual Metric 0 backlog rows are ids `5380..5464`, all `mint_only`,
score `C`, `hardRejected=false`, and not reached by those batch limits.

No next batch Red command is recommended from this preflight. The next safe
task is Green: preflight one exact Metric 0 row using exact `--mint` mode and
include `--noNotificationCapture` in any later human-approved write command,
or design a pending-first batch selector before trying to reduce the Metric
backlog in batch mode.

## 2026-05-24 Exact-Mint Metric 0 Backlog Preflight

The Green exact-mint preflight selected one Metric 0 row from ids
`5380..5464` without running `metric:snapshot`, fetching external APIs, or
writing DB state.

Metric 0 backlog state:

- ids `5380..5464`, count `85`
- all are `geckoterminal.new_pools` origin pump rows
- all are `metadataStatus=mint_only`
- all have `metricsCount=0`
- all are score `C / 0`
- all are `hardRejected=false`
- all have `notificationCount=0` and `holderSnapshotCount=0`
- all have no latest Metric and no reviewFlags

Selected candidate:

- id `5464`
- mint `By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`
- `metricsCount=0`, `notificationCount=0`, `holderSnapshotCount=0`
- `metadataStatus=mint_only`, score `C / 0`, `hardRejected=false`

Exact `--mint` mode avoids the batch selector issue. `--minGapMinutes 60`
should not skip this row because no latest Metric exists. `--noNotificationCapture`
is required because exact `--mint --write` captures `metric_appended`
Notifications by default.

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Expected side effects are one GeckoTerminal token snapshot fetch and at most
one Metric write. Expected non-effects are Token write, Notification
create/update, HolderSnapshot write, Telegram send, scheduler/systemd,
repo-local data diff, rawJson full dump, and offensive raw text dump.

## Seventh Bounded Enrich Backlog Batch Review

Date: 2026-05-24 20:43 JST

This Green review stayed read-only and inspected ids `5589..5585` after the
seventh bounded 168h enrich backlog Red. No `--write`, external fetch, detect
watch, Metric snapshot, Telegram send, Notification update, scheduler/systemd,
schema, migration, app code change, or rawJson full dump was performed.

Current state stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Batch readiness:

- `5589` `zynnner` / `zyn`
- `5588` `New Moon` / `Moon`
- `5587` `Turtle Carl` / `Carl`
- `5586` `SmilingFace` / `SmilingFace`
- `5585` `Pelican` / `PELICAN`

All five are `metadataStatus=partial`, score `C / 0`, non-hard-rejected, and
have names/symbols, normalized text, reviewFlags, `enrichedAt`, and
`rescoredAt`. Descriptions, website, X, Telegram, Metaplex hit, and links are
absent. Each has `metricsCount=2`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Report findings:

- `metrics:report` reads two GeckoTerminal token snapshot Metrics for each
  selected row; latest Metric ids are `1501..1505`, previous ids are
  `1316..1320`.
- `metrics:window-report` for `5589` and `5585` uses firstSeen as entry with
  `entryAnchorQuality=delayed_180m`; 30m / 60m / 2h windows are `no_data`,
  3h / 6h / 12h are `thin`, and 24h is `partial`.
- `hasWindowFdvSamples=true` begins at 3h, but `hasAlertFdvAnchor=false`, so
  outcome remains `no_data`.
- Target compare summary remains unresolved because latest multiple / peak
  fields are missing.

Queue context:

- default queue: `geckoOriginTokenCount=0`, `enrichPendingCount=0`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h queue: `geckoOriginTokenCount=245`, `enrichPendingCount=205`,
  `metricPendingCount=85`, `staleReviewCount=205`, `notifyCandidateCount=0`
- auto-send allowed candidates: `0`
- retry candidates: `0`

Candidate comparison:

- repeat limit 5 enrich backlog Red would move `enrichPendingCount` from
  `205` to `200` with the same Token-only write boundary.
- Metric/report follow-up for ids `5589..5585` is useful later, but these rows
  are already readable and have two Metrics.
- broader metric backlog preflight can address the remaining `metricPending=85`
  later, but it is a separate lane.
- progress consolidation / handoff is now the preferred next step because
  seven consecutive bounded enrich backlog Red batches have completed without
  provider error, 429, retry, notify side effects, Metric writes, or
  HolderSnapshot writes.

Next selected step: Green progress consolidation / handoff. Do not run the next
write batch until the accumulated progress, score distribution,
`notifyCandidate=0` context, and remaining backlog are summarized.

## Enrich Backlog Progress Consolidation

Date: 2026-05-24 20:52 JST

This consolidation stayed read-only / docs-only. No enrich/rescore write,
Metric snapshot write, detect watch, Telegram send, Notification update,
scheduler/systemd, external fetch, schema/migration/app code change, or rawJson
full dump was performed.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Progress:

- processed batch count: `7`
- processed token count: `35`
- processed ids: `5619..5585`
- first backlog preflight `enrichPendingCount`: `240`
- current 168h `enrichPendingCount`: `205`
- remaining 168h `metricPendingCount`: `85`
- current 168h `staleReviewCount`: `205`
- current 168h `notifyCandidateCount`: `0`
- selected item `skipped=0`, `error=0`, provider error `0`, 429 `0`, retry
  `0` across the repeated batches

Quality for ids `5619..5585`:

- `metadataStatus=partial`: `35`
- source `geckoterminal.new_pools`: `35`
- `scoreRank`: `C=34`, `B=1`
- `scoreTotal`: `0=32`, `1=2`, `2=1`
- `hardRejected`: `0`
- `descriptionPresent`: `0`
- `normalizedTextPresent`: `35`
- `enrichedAt` / `rescoredAt` present: `35`
- reviewFlags presence: no website, X, Telegram, Metaplex hit, description, or
  links across the cohort
- Metric distribution within the cohort: `2+=35`
- Notification rows linked inside the cohort: `1` (`5619`)

Notable score rows:

- `5607` `Doge Coffee` / `DOGECOFFEE`: `B / 2`, core keyword `dog`
- `5596` `Self-Replicating Tweet` / `.....`: `C / 1`, core keyword `cat`
- `5590` `Sketichification` / `Sketchify`: `C / 1`, core keyword `cat`

Boundary:

- writes observed in Reds: Token enrich/rescore/context/reviewFlags updates
  only
- non-effects: Metric write, Notification create/update, HolderSnapshot write,
  Telegram send, auto-send execution, retry execution, scheduler/systemd,
  repo-local data diff, rawJson full dump

Next selection simulation for the same command is ids `5584..5580`; each is
`mint_only`, `C / 0`, `hardRejected=false`, GeckoTerminal-origin pump, and has
`metricsCount=2`.

Next selected step: repeat the bounded limit 5 enrich backlog Red. Human
approval is required:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and production Token update for up to five rows. Expected non-effects
are Metric write, Notification create/update, HolderSnapshot write, Telegram
send, scheduler/systemd, repo-local data diff, and rawJson full dump. Do not
add `--notify`.

## Eighth Bounded Enrich Backlog Batch Result

Date: 2026-05-24 20:57 JST

The approved Red command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary:

- selected: `5`
- enriched: `5`
- rescored: `5`
- skipped selected items: `0`
- skipped complete rows: `40`
- error: `0`
- contextWritten: `5`
- metaplexAttempted: `5`
- metaplexAvailable: `0`
- metaplex error kind: `metadata_account_missing=5`
- notifyWouldSend: `0`
- notifySent: `0`
- provider error: none
- 429 / rate limited: none
- retry: none

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, and Notification statuses stayed `captured=5`,
`sent=5`, `failed=0`.

Selected ids `5584..5580` moved from `mint_only` to `partial`:

- `5584`: offensive name/symbol redacted in docs, score `C / 0`
- `5583`: offensive name/symbol redacted in docs, score `C / 0`
- `5582`: `Jester` / `Jester`, score `C / 0`
- `5581`: `stop using ai` / `ai`, score `C / 1`
- `5580`: `Mintendo` / `MINTENDO`, score `C / 0`

All five are `hardRejected=false`, description absent, normalized text present,
`enrichedAt` / `rescoredAt` present, and have reviewFlags with no website, X,
Telegram, Metaplex hit, description, or links. Each has `metricsCount=2`,
`notificationCount=0`, and `holderSnapshotCount=0`.

Queue after:

- default queue: `enrichPendingCount=0`, `metricPendingCount=0`,
  `notifyCandidateCount=0`
- 168h queue: `geckoOriginTokenCount=245`, `enrichPendingCount=200`,
  `metricPendingCount=85`, `staleReviewCount=200`, `notifyCandidateCount=0`
- auto-send allowed candidates: `0`
- retry candidates: `0`

Expected non-effects held: no Metric write, no Notification create/update, no
HolderSnapshot write, no Telegram send, no auto-send or retry execution, no
scheduler/systemd, no repo-local data diff, and no rawJson full dump.

Next selected step: Green review of ids `5584..5580` before approving any
additional write batch.

## Eighth Enriched Backlog Batch Report Review

Date: 2026-05-24 21:05 JST

The read-only review of ids `5584..5580` confirmed that the eighth newly
partial backlog batch is visible through safe summaries and representative
window reports. No `--write`, external fetch, Metric snapshot, detect watch,
Telegram send, Notification update, scheduler/systemd, schema, migration, app
code change, or rawJson full dump was performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidates: `0`
- auto-send allowed candidates: `0`

Batch summary:

- all five rows are `partial`, `hardRejected=false`, with normalized text,
  reviewFlags, `enrichedAt`, and `rescoredAt`
- `5584` and `5583` contain offensive name/symbol values; docs and final
  reports must use `[offensive term]` only and avoid raw text
- `5582` is `Jester` / `Jester`, score `C / 0`
- `5581` is `stop using ai` / `ai`, score `C / 1`, from a learned AI-phrase
  score hit; it is not a notify candidate
- `5580` is `Mintendo` / `MINTENDO`, score `C / 0`
- all five have `metricsCount=2`, `notificationCount=0`, and
  `holderSnapshotCount=0`

Report/window summary:

- target Metrics are readable through a redacted Prisma safe summary; broad
  package report output was intentionally avoided for the full target set to
  preserve offensive-name redaction
- representative `metrics:window-report` checks for `5581` and `5580` stayed
  read-only and rawJson-free
- both representative rows have `metricCount=2`, `fdvMetricCount=2`,
  `hasAlertFdvAnchor=false`, and wider-window FDV samples
- `5581` has `entryAnchorQuality=delayed_180m`; 3h / 6h / 12h are `thin`,
  24h is `partial`
- `5580` has `entryAnchorQuality=late_360m`; 6h / 12h are `thin`, 24h is
  `partial`
- outcome remains `no_data` because no alert FDV anchor / peak multiple exists

Queue context: default queue is empty; 168h queue has
`geckoOriginTokenCount=245`, `enrichPendingCount=200`,
`metricPendingCount=85`, `staleReviewCount=200`, and
`notifyCandidateCount=0`.

Recommendation: pause the repeat-Red rhythm for a Green progress consolidation
/ handoff. The same limit 5 enrich backlog Red remains technically viable, but
after eight consecutive clean batches the next higher-value step is to
consolidate progress, remaining backlog, notifyCandidate state, 429/provider
error history, and offensive-safe reporting rules.

## Offensive-Safe Enrich Backlog Handoff

Date: 2026-05-24 21:20 JST

Eight bounded 168h enrich backlog Red batches have completed with the same
command shape and side-effect boundary. Processed ids are `5619..5580`, 40
tokens total. The 168h enrichPending backlog moved from `240` to `200`.

Common execution result across the eight batches:

- selected `5`, enriched `5`, rescored `5`
- contextWritten `5`
- metaplexAttempted `5`, metaplexAvailable `0`
- notifyWouldSend `0`, notifySent `0`
- selected-item skipped `0`
- error, provider error, 429, and retry `0`

Processed cohort safe summary:

- metadataStatus: `partial=40`
- scoreRank: `C=39`, `B=1`
- scoreTotal: `0=36`, `1=3`, `2=1`
- hardRejected: `0`
- notifyCandidate: `0`
- website / X / Telegram / Metaplex / description / link presence: `0`
- metricsCount distribution: `2=10`, `3=25`, `4=4`, `5=1`

Notable scoring examples:

- `5607` `Doge Coffee` / `DOGECOFFEE`: `B / 2`
- `5596` `Self-Replicating Tweet` / `.....`: `C / 1`
- `5590` `Sketichification` / `Sketchify`: `C / 1`
- `5581` `stop using ai` / `ai`: `C / 1`

Offensive-safe reporting rule:

- ids `5584` and `5583` proved that this lane can encounter offensive
  name/symbol values
- write docs and final reports with `[offensive term]` or redacted/count-based
  summaries only
- avoid broad target-set package reports when they would print offensive raw
  text
- use redacted Prisma safe summaries and representative non-offensive samples
  for report evidence
- never paste raw provider payloads, Metric rawJson, env, secrets, Telegram
  ids, or offensive raw text into handoff material

Red resume conditions:

- fresh Green preflight confirms current counts and queue shape
- `notifyCandidateCount=0`, retry candidates `0`, failed count `0`
- next selection is clear and can be summarized without offensive raw text
- Token update remains the only write path
- no new evidence of Metric / Notification / HolderSnapshot / Telegram /
  scheduler / systemd side effects
- human approval is present

Known bounded Red command, if the operator chooses to resume the same lane:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Do not add `--notify`.

Metric backlog return conditions:

- choose this when `metricPendingCount=85` or report/outcome coverage is more
  valuable than further Token updates
- run a separate Green metric preflight first
- use a separate human-approved Metric snapshot Red; do not treat enrich
  backlog commands as Metric accumulation

Next selected task: Green recent enriched cohort score/report analysis.

## Recent Enriched Cohort Score / Report Analysis

Date: 2026-05-24 21:35 JST

This Green analysis reviewed the 40-token processed cohort `5619..5580` with
read-only Prisma summaries, representative window reports, queue checks, and
planner checks. It did not write DB rows, fetch external APIs, send Telegram,
update Notifications, run Metric snapshots, or dump rawJson / offensive raw
text.

Cohort scope:

- processed tokens: `40`
- metadataStatus: `partial=40`
- metricsCount: `2=10`, `3=25`, `4=4`, `5=1`
- notificationCount: `0=39`, `1=1`
- holderSnapshotCount: `0=40`

Score / notify:

- scoreRank: `C=39`, `B=1`
- scoreTotal: `0=36`, `1=3`, `2=1`
- hardRejected: `0`
- reviewFlags true counts: website `0`, X `0`, Telegram `0`, Metaplex hit
  `0`, description `0`, linkCount positive `0`
- notifyCandidate: `0`
- `5607` `Doge Coffee` / `DOGECOFFEE` is `B / 2` from the core `dog` keyword,
  but has no description, links, social flags, Metaplex hit, Notification row,
  or alert-anchor outcome
- `5596`, `5590`, and `5581` are `C / 1`
- ids `5584` and `5583` remain redacted as `[offensive term]`

Representative report/window behavior:

- `5607`: `metricCount=3`, `fdvMetricCount=3`, 2h `thin`, 3h-24h `partial`,
  no alert FDV anchor, outcome `no_data`
- `5581`: `metricCount=2`, `fdvMetricCount=2`, 3h-12h `thin`, 24h `partial`,
  no alert FDV anchor, outcome `no_data`
- `5582`: `metricCount=2`, `fdvMetricCount=2`, 3h-12h `thin`, 24h `partial`,
  no alert FDV anchor, outcome `no_data`

Conclusion: notification absence is coherent with the data. The cohort is
mostly score `C / 0`, has no social/link/description/Metaplex evidence, and
window reports lack alert FDV anchors. The next step should switch from enrich
backlog Red to Green metric backlog preflight for the remaining
`metricPendingCount=85`.

## 2026-05-24 Sixth 168h Enrich Backlog Batch Result

Approved Red command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Metaplex lookup returned
`metadata_account_missing=5`.

Selected ids `5594`, `5593`, `5592`, `5591`, and `5590` moved from
`metadataStatus=mint_only` to `partial`:

- `5594` `Test Coin` / `TEST`, score `C / 0`
- `5593` `KOWAKU` / `KOWAKU`, score `C / 0`
- `5592` `Gad Sad` / `GAD`, score `C / 0`
- `5591` `NEXT PWEASE TWEET EVERY SEC` / `BONERPHONE`, score `C / 0`
- `5590` `Sketichification` / `Sketchify`, score `C / 1`

All five have normalized text, `enrichedAt`, `rescoredAt`, and reviewFlags.
Descriptions, website, X, Telegram, Metaplex hit, and links are absent. All
remain `hardRejected=false`. `5590` has one safe scoring hit from the core
`cat` keyword; the others have no score hits. Metrics stayed `3` for each
row, Notification count stayed `0`, and HolderSnapshot count stayed `0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, and Notification statuses stayed `captured=5`,
`sent=5`, `failed=0`. Queue after execution: 24h default
`enrichPendingCount=0`, `metricPendingCount=0`, `notifyCandidateCount=0`;
168h `enrichPendingCount=210`, `metricPendingCount=85`,
`staleReviewCount=210`, `notifyCandidateCount=0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send, auto-send or
retry execution, scheduler/systemd, repo-local data diff, or rawJson full
dump.

Next step should be Green read-only review of ids `5594..5590` before deciding
whether to run another limit 5 backlog enrich batch.

## 2026-05-24 Sixth Enriched Backlog Batch Review

The follow-up Green review of ids `5594..5590` used only read-only commands and
safe Prisma summaries. It did not run enrich/rescore `--write`,
metric:snapshot `--write`, detect watch, external fetch, Telegram send,
Notification update, scheduler/systemd, schema/migration, app code changes, or
rawJson full dump.

State stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.

Batch review:

- `5594` `Test Coin` / `TEST`: `partial`, `C / 0`, `metricsCount=3`
- `5593` `KOWAKU` / `KOWAKU`: `partial`, `C / 0`, `metricsCount=3`
- `5592` `Gad Sad` / `GAD`: `partial`, `C / 0`, `metricsCount=3`
- `5591` `NEXT PWEASE TWEET EVERY SEC` / `BONERPHONE`: `partial`, `C / 0`,
  `metricsCount=3`
- `5590` `Sketichification` / `Sketchify`: `partial`, `C / 1`,
  `metricsCount=3`

All are `hardRejected=false`, have normalized text, reviewFlags,
`enrichedAt`, and `rescoredAt`, and have no Notification or HolderSnapshot
rows. Review flags show no website, X, Telegram, Metaplex hit, description, or
links. `5590` is `C / 1` because scoreBreakdown contains a single core
`cat` keyword hit tagged `animal`; `notifyCandidateCount` remains `0`.

Report and queue findings:

- `metrics:report` returns three GeckoTerminal Metrics per reviewed row.
- representative windows for `5594` and `5590` have `metricCount=3`,
  `fdvMetricCount=3`, delayed first FDV anchors around 146-151 minutes,
  3h `thin`, 6h-24h `partial`, and `outcomeLabel=no_data`.
- `hasAlertFdvAnchor=false`; `hasWindowFdvSamples=true` only once the windows
  include the delayed FDV samples.
- default queue is empty for enrich/metric/notify; 168h queue has
  `enrichPendingCount=210`, `metricPendingCount=85`,
  `staleReviewCount=210`, and `notifyCandidateCount=0`.

The repeated enrich backlog Red batches have remained clean so far: no
provider error, no 429, and no retry across the recorded batches. Next
selection for the same command is ids `5589..5585`, all `mint_only`, score
`C / 0`, `hardRejected=false`, `metricsCount=2`, and no Notification /
HolderSnapshot rows.

Recommended next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token update for up to five rows. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Do not add
`--notify`.

## 2026-05-24 Seventh 168h Enrich Backlog Batch Result

Approved Red command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Selection reported `skippedComplete=35`, and
Metaplex lookup returned `metadata_account_missing=5`.

Selected ids `5589`, `5588`, `5587`, `5586`, and `5585` moved from
`metadataStatus=mint_only` to `partial`:

- `5589` `zynnner` / `zyn`, score `C / 0`
- `5588` `New Moon` / `Moon`, score `C / 0`
- `5587` `Turtle Carl` / `Carl`, score `C / 0`
- `5586` `SmilingFace` / `SmilingFace`, score `C / 0`
- `5585` `Pelican` / `PELICAN`, score `C / 0`

All five have normalized text, `enrichedAt`, `rescoredAt`, and reviewFlags.
Descriptions, website, X, Telegram, Metaplex hit, and links are absent. All
remain `hardRejected=false`, with no score hits. Metrics stayed `2` for each
row, Notification count stayed `0`, and HolderSnapshot count stayed `0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, and Notification statuses stayed `captured=5`,
`sent=5`, `failed=0`. Queue after execution: 24h default
`geckoOriginTokenCount=0`, `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h `geckoOriginTokenCount=245`,
`enrichPendingCount=205`, `metricPendingCount=85`,
`staleReviewCount=205`, `notifyCandidateCount=0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send, auto-send or
retry execution, scheduler/systemd, repo-local data diff, or rawJson full
dump.

Next step should be Green read-only review of ids `5589..5585` before deciding
whether to run another limit 5 backlog enrich batch.

## Fifth Enriched Backlog Batch Review

Date: 2026-05-24 20:15 JST

This Green review inspected the fifth newly partial backlog batch ids
`5599..5595` with read-only report, window, queue, and planner commands. No
`--write`, external fetch, DB write, Telegram send, Notification update,
Metric snapshot, detect watch, scheduler/systemd, schema/migration, app code
change, or rawJson full dump was performed.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
Retry candidates and enabled auto-send allowed candidates stayed `0`.

Batch state:

- `5599` `TROLL OF THE UNITED STATES` / `TOTUS`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5598` `Delusional Optimist` / `OPTIMIST`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5597` `Boner Phone` / `Thumas`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5596` `Self-Replicating Tweet` / `.....`, `partial`, score `C / 1`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5595` `KUROGANE` / `KGANE`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`

All five have names/symbols, normalized text, reviewFlags, `enrichedAt`, and
`rescoredAt`. Descriptions, social/link flags, and Metaplex hits are absent.
`5596` has `normalizedText=self replicating tweet`; safe score breakdown shows
one core keyword hit, key `cat`, score `+1`, tag `animal`. It remains C-rank
and is not a notify candidate.

Report/window review:

- `metrics:report` reads three GeckoTerminal token snapshot Metrics for each
  selected token and prints safe market-data presence booleans without rawJson.
- `metrics:window-report` for `5596` has firstSeen entry,
  `entryAnchorQuality=delayed_180m`, 30m/60m/2h `no_data`, 3h `thin`, and
  6h-24h `partial`.
- `metrics:window-report` for `5599` has firstSeen entry,
  `entryAnchorQuality=delayed_180m`, 30m/60m/2h `no_data`, 3h `thin`, and
  6h-24h `partial`.
- Both sampled reports have `outcomeLabel=no_data`,
  `hasAlertFdvAnchor=false`, and wider-window FDV samples where available.
- `tokens:compare-report` includes all five rows with `metadataStatus=partial`
  and `minMetricsCount=3`; outcome remains unresolved.

Queue/planner context:

- default queue: `geckoOriginTokenCount=0`, `enrichPendingCount=0`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h queue: `enrichPendingCount=215`, `metricPendingCount=85`,
  `staleReviewCount=215`, `notifyCandidateCount=0`
- auto-send allowed candidates: `0`
- retry candidates: `0`

Next same-command selection is clear: eligible count `215`; selected ids
`5594..5590`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, and no Notification or HolderSnapshot
rows.

Recommendation: continue with one more limit 5 enrich backlog Red. The follow-
up report/metric path for ids `5599..5595` is second, but these rows already
have three Metrics and are readable. Broader Metric backlog stays deferred.

Next Red exact command, requiring human approval and not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects: external GeckoTerminal fetch, best-effort Metaplex
lookup, production Token update for up to five rows. Expected non-effects:
Metric write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Do not add
`--notify`.

## Fourth Enriched Backlog Batch Review

Date: 2026-05-24 15:30 JST

This Green review inspected the fourth newly partial backlog batch ids
`5604..5600` with read-only report, window, queue, and planner commands. No
`--write`, external fetch, DB write, Telegram send, Notification update,
Metric snapshot, detect watch, scheduler/systemd, schema/migration, app code
change, or rawJson full dump was performed.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
Retry candidates and enabled auto-send allowed candidates stayed `0`.

Batch state:

- `5604` `Percy &amp; Penny` / `HEROES`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5603` `Avian Influenza` / `Avian`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5602` `SixSeven` / `67`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5601` `TeleClaw` / `TeleClaw`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`
- `5600` `foot` / `footcoin`, `partial`, score `C / 0`,
  `hardRejected=false`, `metricsCount=3`, `notificationCount=0`,
  `holderSnapshotCount=0`

All five have names/symbols, normalized text, reviewFlags, `enrichedAt`, and
`rescoredAt`. Descriptions, social/link flags, and Metaplex hits are absent.

Report/window review:

- `metrics:report` reads three GeckoTerminal token snapshot Metrics for each
  selected token and prints safe market-data presence booleans without rawJson.
- `metrics:window-report` for `5604` has firstSeen entry,
  `entryAnchorQuality=delayed_120m`, 30m/60m `no_data`, 2h `thin`, and
  3h-24h `partial`.
- `metrics:window-report` for `5600` has firstSeen entry,
  `entryAnchorQuality=delayed_180m`, 30m/60m/2h `no_data`, 3h `thin`, and
  6h-24h `partial`.
- Both sampled reports have `outcomeLabel=no_data`,
  `hasAlertFdvAnchor=false`, and wider-window FDV samples where available.
- `tokens:compare-report` includes all five rows with `metadataStatus=partial`
  and `minMetricsCount=3`; outcome remains unresolved.

Queue/planner context:

- default queue: `enrichPendingCount=0`, `metricPendingCount=0`,
  `notifyCandidateCount=0`
- 168h queue: `enrichPendingCount=220`, `metricPendingCount=85`,
  `staleReviewCount=220`, `notifyCandidateCount=0`
- auto-send allowed candidates: `0`
- retry candidates: `0`

Next same-command selection is clear: eligible count `220`; selected ids
`5599..5595`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, and no Notification or HolderSnapshot
rows.

Recommendation: continue with one more limit 5 enrich backlog Red. The follow-
up report/metric path for ids `5604..5600` is second, but these rows already
have three Metrics and are readable. Broader Metric backlog stays deferred.

Next Red exact command, requiring human approval and not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects: external GeckoTerminal fetch, best-effort Metaplex
lookup, production Token update for up to five rows. Expected non-effects:
Metric write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Do not add
`--notify`.

## Fifth Enrich Backlog Batch Result

Date: 2026-05-24 16:30 JST

The approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Selection reported `skippedComplete=25`.
Metaplex lookup returned `metadata_account_missing=5`.

The selected ids `5599`, `5598`, `5597`, `5596`, and `5595` moved from
`metadataStatus=mint_only` to `partial`. They now have names/symbols:
`TROLL OF THE UNITED STATES` / `TOTUS`, `Delusional Optimist` / `OPTIMIST`,
`Boner Phone` / `Thumas`, `Self-Replicating Tweet` / `.....`, and `KUROGANE`
/ `KGANE`. All remained `hardRejected=false`, description absent, normalized
text present, and reviewFlags present with no website, X, Telegram, Metaplex
hit, description, or links.

Scores stayed low: `5599`, `5598`, `5597`, and `5595` are score `C / 0`;
`5596` became score `C / 1`. All selected rows retained `metricsCount=3`,
`notificationCount=0`, and `holderSnapshotCount=0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`. Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The 168h queue moved from `enrichPendingCount=220` to `215`, with
`metricPendingCount=85`, `staleReviewCount=215`, and
`notifyCandidateCount=0`.

Expected non-effects held: no Metric write, no Notification create/update, no
HolderSnapshot write, no Telegram send, no auto-send or retry execution, no
scheduler/systemd, no repo-local data diff, and no rawJson full dump.

Next work should be Green: review ids `5599..5595` with read-only
`metrics:report`, `metrics:window-report`, `tokens:compare-report`, queue, and
planner checks before another Red.

## Third Enrich Backlog Batch Result

Date: 2026-05-24 14:01 JST

The human-approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
The run skipped `15` already-complete rows before selecting incomplete rows.

Selected ids `5609..5605` moved from `mint_only` to `partial`. They now have
names/symbols: `PESY` / `PESY`, `UPCOIN`, `Doge Coffee` / `DOGECOFFEE`,
`The Predictor` / `KIM`, and `FUCKING FAT DILDO` / `FFD`. All remain
`hardRejected=false`, description absent, normalized text present, and have
reviewFlags present with no website, X, Telegram, Metaplex hit, description,
or links. Score stayed `C / 0` except `5607`, which moved to `B / 2`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`
and Notification statuses `captured=5`, `sent=5`, `failed=0`. The selected
rows retained `metricsCount=3`, `notificationCount=0`, and
`holderSnapshotCount=0`. The 168h queue moved from `enrichPendingCount=230`
to `225`, with `metricPendingCount=85`, `staleReviewCount=225`, and
`notifyCandidateCount=0`.

This confirms the third repeat limit-5 backlog Token update boundary. It did
not write Metrics, create/update Notifications, write HolderSnapshots, send
Telegram, execute auto-send/retry, touch scheduler/systemd, create repo-local
data diffs, or dump rawJson. Next work should stay Green: review this third
batch and decide whether to continue with another bounded enrich backlog Red
or switch to Metric/report follow-up.

## Fourth Enrich Backlog Batch Result

Date: 2026-05-24 15:15 JST

The human-approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
The run skipped `20` already-complete rows before selecting incomplete rows.

Selected ids `5604..5600` moved from `mint_only` to `partial`. They now have
names/symbols: `Percy &amp; Penny` / `HEROES`, `Avian Influenza` / `Avian`,
`SixSeven` / `67`, `TeleClaw` / `TeleClaw`, and `foot` / `footcoin`. All
remain score `C / 0`, `hardRejected=false`, description absent, normalized
text present, and have reviewFlags present with no website, X, Telegram,
Metaplex hit, description, or links.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`
and Notification statuses `captured=5`, `sent=5`, `failed=0`. The selected
rows retained `metricsCount=3`, `notificationCount=0`, and
`holderSnapshotCount=0`. The 168h queue moved from `enrichPendingCount=225`
to `220`, with `metricPendingCount=85`, `staleReviewCount=220`, and
`notifyCandidateCount=0`.

This confirms the fourth repeat limit-5 backlog Token update boundary. It did
not write Metrics, create/update Notifications, write HolderSnapshots, send
Telegram, execute auto-send/retry, touch scheduler/systemd, create repo-local
data diffs, or dump rawJson. Next work should stay Green: review this fourth
batch and decide whether to continue with another bounded enrich backlog Red
or switch to Metric/report follow-up.

## Third Enriched Backlog Batch Review

Date: 2026-05-24 14:11 JST

The read-only review of ids `5609..5605` confirmed that the newly partial rows
are visible in Metric and compare reports without rawJson dumps. No `--write`,
external fetch, Telegram send, Notification update, Metric snapshot, detect
watch, scheduler/systemd, schema, migration, or app code change was performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, `hardRejected=false`, with names/symbols,
  normalized text, reviewFlags, and enrichment/rescore timestamps
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`
- `5607` is `B / 2` because `doge coffee dogecoffee` hit core keyword `dog`
  for `+2`; it has no Notification row and is not a notify candidate
- `metrics:report` reads three Metrics for each selected token; the rows
  expose safe market-data presence booleans, not raw provider payloads
- `metrics:window-report` for `5607` and `5609` has firstSeen entry,
  `delayed_120m` anchor, 30m / 60m `no_data`, 2h `thin`, 3h-24h `partial`,
  and still `no_data` because no alert FDV anchor / peak multiple exists
- `tokens:compare-report` includes all five rows with `minMetricsCount=3`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=225`,
`metricPendingCount=85`, `staleReviewCount=225`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5604..5600`, all
`mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, and `metricsCount=3`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are Token updates for up to five rows after external
GeckoTerminal and best-effort Metaplex fetches. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Human approval
is required; do not add `--notify`.

## 2026-05-24 Next Enriched Backlog Batch Review

The follow-up review stayed read-only and inspected ids `5614..5610` after the
second bounded enrich backlog Red.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`.
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`; retry and
auto-send candidates stayed `0`.

Batch readiness:

- all five rows are `partial`, score `C / 0`, non-hard-rejected, and have
  `enrichedAt` / `rescoredAt`
- names/symbols are present; descriptions and social/link flags are absent
- normalized text is present
- reviewFlags are present with `hasWebsite=false`, `hasX=false`,
  `hasTelegram=false`, `metaplexHit=false`, `descriptionPresent=false`,
  `linkCount=0`
- all five have `metricsCount=3`
- all five have `notificationCount=0` and `holderSnapshotCount=0`

Report findings:

- `metrics:report` reads three Metric rows for each selected token without
  rawJson; latest Metric ids are `1476..1480`, and reported rows show price /
  FDV / reserve / top pool presence.
- `metrics:window-report` for `5614` and `5613` uses firstSeen as entry and
  shows `entryAnchorQuality=delayed_120m`, 30m / 60m `no_data`, 2h `thin`,
  and 3h through 24h `partial`.
- `hasWindowFdvSamples=true` from 2h onward, but `hasAlertFdvAnchor=false`,
  so outcome remains `no_data`.
- `tokens:compare-report` includes ids `5614..5610` as partial GeckoTerminal
  rows with `minMetricsCount=3`; they remain unresolved because latest
  multiple / peak fields are missing.

The next same-command selection is ids `5609..5605`; all are `mint_only`,
GeckoTerminal-origin pump rows, score `C / 0`, non-hard-rejected,
`metricsCount=3`, and do not overlap ids `5614..5610`.

Recommended next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex lookup, and Token enrich/rescore/context/reviewFlags
update for up to five rows. Expected non-effects are Metric write,
Notification create/update, HolderSnapshot write, Telegram send, repo-local
data diff, scheduler/systemd, and rawJson full dump.

## 2026-05-24 Enriched Backlog Batch Review

The follow-up review stayed read-only and inspected ids `5619..5615` after the
bounded enrich backlog Red.

Current state stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`.
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`; retry and
auto-send candidates stayed `0`.

Batch readiness:

- all five rows are `partial`, score `C / 0`, non-hard-rejected, and have
  `enrichedAt` / `rescoredAt`
- names/symbols are present; descriptions and social/link flags are absent
- normalized text is present
- reviewFlags are present with `hasWebsite=false`, `hasX=false`,
  `hasTelegram=false`, `metaplexHit=false`, `descriptionPresent=false`,
  `linkCount=0`
- `5619` has `metricsCount=5`, `notificationCount=1`
- `5618..5615` have `metricsCount=4`, `notificationCount=0`
- all have `holderSnapshotCount=0`

Report findings:

- `metrics:report` reads the Metric rows without rawJson: `5619` has Metric
  ids `1531`, `1471`, `1396`, `1301`, `1281`; `5618` has `1472`, `1397`,
  `1302`, `1282`; reported rows show price / FDV / reserve / top pool
  presence.
- `metrics:window-report` for `5619` uses sent Notification `id=10` as entry,
  but no FDV samples exist after that anchor, so checked windows remain
  `no_data`.
- `metrics:window-report` for `5618` uses firstSeen as entry and shows 30m /
  60m `thin`, 2h-12h `partial`, and 24h `usable`; outcome remains `no_data`.
- `tokens:compare-report` includes all five rows as partial GeckoTerminal rows
  with `minMetricsCount=4`; they remain unresolved because latest multiple /
  peak fields are missing.

The next same-command selection is ids `5614..5610`; all are `mint_only`,
GeckoTerminal-origin pump rows, score `C / 0`, non-hard-rejected,
`metricsCount=3`, and do not overlap ids `5619..5615`.

Recommended next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex lookup, and Token enrich/rescore/context/reviewFlags
update for up to five rows. Expected non-effects are Metric write,
Notification create/update, HolderSnapshot write, Telegram send, repo-local
data diff, scheduler/systemd, and rawJson full dump.

## 2026-05-24 Next 168h Enrich Backlog Batch Result

The approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Metaplex lookup returned
`metadata_account_missing=5`.

The selected ids `5614`, `5613`, `5612`, `5611`, and `5610` moved from
`metadataStatus=mint_only` to `partial`. They now have names/symbols:
`Buttcoin` / `Buttcoin`, `LITERALLY SAYS "USD1 ON THE BLOG` / `COMPASS`,
`SO GENNY 10 MIL` / `COMPASS`, `Justice for Wilkie &amp; Keijo` / `W&amp;K`,
and `ITS A USD1 MASCOT` / `COMPASS`. All remained score `C / 0`,
`hardRejected=false`, description absent, normalized text present, and
reviewFlags present with no website, X, Telegram, Metaplex hit, description,
or links.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`. The selected rows retained metrics counts
`3,3,3,3,3`, notification counts `0`, and holderSnapshot count `0`. The 168h
queue moved from `enrichPendingCount=235` to `230`, with
`metricPendingCount=85`, `staleReviewCount=230`, and
`notifyCandidateCount=0`.

Expected non-effects held: no Metric write, no Notification create/update, no
HolderSnapshot write, no Telegram send, no auto-send or retry execution, no
scheduler/systemd, no repo-local data diff, and no rawJson full dump.
