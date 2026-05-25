# Metric Snapshot Rate Limit Policy

Date: 2026-05-19

This is a read-only / docs-only preflight for GeckoTerminal Metric snapshot
rate-limit handling. It does not run `metric:snapshot:geckoterminal`, does not
fetch external APIs, and does not write production DB state.

## Starting Point

The bounded Metric accumulation limit 10 Red run completed with partial
success:

- `selectedCount=10`
- `writtenCount=5`
- `skippedCount=0`
- `errorCount=5`
- five item errors were `429 Too Many Requests`
- Metric count moved `198 -> 203`
- Token / Notification / HolderSnapshot stayed `1536 / 8 / 1`
- Telegram was not sent

Current read-only DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 203 / 8 / 1`
- Token rows with zero Metrics: `1372`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 10` reports
  `metricPendingCount=235`

The five previous `429` item mints still have `metricsCount=0` and remain
eligible for later Metric accumulation. No failure marker is stored in DB for
these item-level provider errors.

## Current Implementation Behavior

`metric:snapshot:geckoterminal` currently behaves as follows:

- batch mode is selected when `--mint` is omitted;
- batch mode now supports opt-in `--onlyMetricPending`, which narrows
  candidate selection to Metric-zero tokens before `--limit`;
- default batch selection is unchanged when `--onlyMetricPending` is omitted;
- exact `--mint` mode rejects `--onlyMetricPending` because exact mint
  selection is already explicit;
- `--onlyMetricPending` dry-run is a selection preview and does not fetch
  GeckoTerminal snapshots; `--write` uses the existing Metric append path;
- selected tokens are processed sequentially in a `for` loop;
- there is no item-to-item delay in one-shot batch mode;
- each item calls GeckoTerminal once through `fetch(.../tokens/{mint}?include=top_pools)`;
- provider response bodies and headers are not dumped on non-OK responses;
- non-OK responses throw a safe error string with HTTP status and status text;
- item errors are captured as `status=error` in output and do not create Metric
  rows;
- successful items write Metric rows only when `--write` is set;
- `--minGapMinutes` skips only tokens that already have a recent Metric for the
  same token + source;
- failed `429` items have no Metric, so they remain in the future
  `metricPending` queue;
- exact `--mint` mode can capture `metric_appended` Notification rows, but batch
  mode does not capture Notification rows;
- Telegram send is not part of this command.

## Pending-first Selector Yellow

Date: 2026-05-25

The Metric 0 backlog selector gap is now addressed by an opt-in CLI option:
`--onlyMetricPending`.

Implementation notes:

- option name: `--onlyMetricPending`;
- scope: batch mode only;
- exact `--mint` with `--onlyMetricPending` exits with a usage error;
- default selection is not changed;
- `--pumpOnly`, `--sinceMinutes`, `--limit`, and `--minGapMinutes` remain
  compatible;
- MVP definition of pending is `metricsCount=0`;
- dry-run with `--onlyMetricPending` returns selection preview rows without
  provider fetch;
- preview rows include `metadataStatus`, `metricsCount`, `notificationCount`,
  `holderSnapshotCount`, and `latestMetricObservedAt`;
- rawJson, raw provider payloads, offensive raw text, env values, and secrets
  are not printed.

Production read-only preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --onlyMetricPending --noNotificationCapture
```

Result: selected ids `5462`, `5461`, and `5460` in the current rolling window.
All were GeckoTerminal `new_pools` pump mints with
`metadataStatus=mint_only`, `metricsCount=0`, `notificationCount=0`,
`holderSnapshotCount=0`, and `latestMetricObservedAt=null`. The command was
read-only: no external fetch, DB write, Notification create/update, Telegram
send, Token write, Metric write, HolderSnapshot write, scheduler/systemd,
rawJson full dump, or offensive raw text dump.

Next Red candidate after a Green preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required before that command. Expected side effects are
external GeckoTerminal fetches and Metric writes up to the selected count.
Expected non-effects are Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`, repo-local
data diff `0`, rawJson full dump `0`, and offensive raw text dump `0`.

In one-shot batch mode, `429` does not throw out of the whole command. The CLI
can exit `0` while reporting `errorCount>0`. Treat this as partial success, not
as a fully Green batch.

Watch mode has a rate-limit early-stop guard for a cycle, but the previous Red
run was one-shot batch mode, so that guard did not stop after the first `429`.

## Partial Success Policy

Partial success is acceptable only when all of these hold:

- at least one Metric was written;
- Token / Notification / HolderSnapshot counts do not change;
- Telegram is not sent;
- raw provider response bodies, secrets, and env values are not printed;
- item errors are safely summarized;
- no immediate rerun is performed in the same task;
- batch size is not expanded until rate-limit handling is improved.

If `errorCount>0`, record the safe summary and stop. Do not run a compensating
second command.

## Recommendation

The chosen follow-up is **B: inter-item delay Yellow implementation** before
the next Red Metric accumulation.

Reason:

- A smaller `limit 5` Red could avoid the currently observed threshold, but it
  does not address the missing pacing and may still fail depending on upstream
  rate-limit state.
- A `429` stop guard would avoid repeated errors after the first `429`, but it
  does not improve the probability of successful Metric capture.
- An item-to-item delay directly addresses the rapid sequential burst observed
  in the limit 10 run while preserving the existing batch mode and write
  boundary.

Implemented Yellow shape:

- added batch-compatible CLI option `--interItemDelayMs <N>`;
- `N` is a non-negative integer;
- default `0` preserves existing behavior;
- delay is applied between selected batch items in one-shot and watch cycles;
- there is no delay before the first item or after the last item;
- exact `--mint` mode is not delayed;
- dry-run and write behavior are identical except for pacing;
- Notification / Telegram / Token / HolderSnapshot behavior is unchanged;
- 429 handling is unchanged;
- summary output includes `interItemDelayMs` and `interItemDelayCount`;
- focused tests cover parsing, invalid values, batch delay count, last-item
  behavior, and exact `--mint` no-delay behavior without production DB or live
  Telegram.

Proposed next Red command, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Do not proceed to a larger Metric batch until the delayed `limit 10` Red result
is recorded.

## Delayed Limit 10 Result

Date: 2026-05-19

The delayed command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=10`
- `okCount=5`
- `writtenCount=5`
- `skippedCount=5`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=9`
- no `429 Too Many Requests`
- written Metric ids: `1286`, `1287`, `1288`, `1289`, `1290`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `203 -> 208`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

The prior no-delay `limit 10` run had `writtenCount=5`, `errorCount=5`, and
five `429` item errors. The delayed run had `errorCount=0`, but five selected
rows were skipped by `minGapMinutes=60` because they already had recent Metrics
from the previous run. Therefore, this confirms the delay shape is safe and
improved the fetched pending subset; it does not prove that a 10-fetch delayed
batch is always clean.

Next expansion should stay modest. Prefer one more Red at `limit 20` with
`--interItemDelayMs 15000`, or add a pending-only selection mode before larger
batch accounting.

## Delayed Limit 20 Result

Date: 2026-05-19

The delayed `limit 20` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=20`
- `okCount=10`
- `writtenCount=10`
- `skippedCount=10`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=19`
- no `429 Too Many Requests`
- written Metric ids: `1291` through `1300`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `208 -> 218`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with the delayed `limit 10` result:

- delayed `limit 10`: `writtenCount=5`, `skippedCount=5`, `errorCount=0`;
- delayed `limit 20`: `writtenCount=10`, `skippedCount=10`, `errorCount=0`.

The 15-second inter-item delay remained rate-limit clean for the fetched
pending subset. Because selected rows still include recent-Metric skips, expand
only modestly next, such as delayed `limit 30`, or design a pending-only batch
selection option before using much larger limits.

## Delayed Limit 30 Result

Date: 2026-05-19

The delayed `limit 30` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=30`
- `okCount=15`
- `writtenCount=15`
- `skippedCount=15`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=29`
- no `429 Too Many Requests`
- written Metric ids: `1301` through `1315`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `218 -> 233`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with the delayed `limit 20` result:

- delayed `limit 20`: `writtenCount=10`, `skippedCount=10`, `errorCount=0`;
- delayed `limit 30`: `writtenCount=15`, `skippedCount=15`, `errorCount=0`.

The 15-second inter-item delay continued to avoid 429s. The limiting issue is
now selection quality rather than pacing: half of the selected rows were
`skipped_recent_metric`. Before expanding beyond limit 30, add or preflight a
candidate-selection improvement so recent Metrics are excluded before `--limit`
is applied.

## Exact Mint Metric 0 Backlog Result

Date: 2026-05-24

The current batch selector could not reach the 168h Metric 0 backlog
(`ids 5380..5464`) because even `limit 75` selected already measured newer
rows first. A human-approved exact-mint Red was run once to test the Metric 0
backlog boundary:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Result:

- mode: `single`
- `selectedCount=1`
- `okCount=1`
- `writtenCount=1`
- `skippedCount=0`
- `errorCount=0`
- provider error: none
- 429: none
- retry: none
- `interItemDelayMs=0`, as expected for exact `--mint` mode
- `notificationCaptureEnabled=false`
- `notificationCreated=false`
- `notificationSkippedReason=disabled_by_option`

Counts moved:

- Token: `1541 -> 1541`
- Metric: `459 -> 460`
- Notification: `10 -> 10`
- HolderSnapshot: `1 -> 1`
- Metric buckets: `0=1222, 1=232, 2+=87 -> 0=1221, 1=233, 2+=87`

Target token id `5464` moved `metricsCount 0 -> 1` and received Metric
`1542` with source `geckoterminal.token_snapshot` at
`2026-05-24T13:52:10.586Z`. RawJson was not dumped; `metrics:report` showed
only safe market-data booleans (`priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` all true).

The 168h queue moved `metricPendingCount 85 -> 84` while
`notifyCandidateCount` stayed `0`. This confirms that exact `--mint` plus
`--noNotificationCapture` can safely touch one true Metric 0 backlog item
without Notification, Token, HolderSnapshot, Telegram, scheduler/systemd, or
repo-local side effects.

Next step should be a Green review / preflight before another exact-mint Red or
a Yellow pending-first selector design. Do not use broad batch commands as a
Metric 0 cleanup path until selection quality is fixed.

## Exact Mint Metric 0 Review And Next Candidate

Date: 2026-05-24 23:44 JST

This follow-up stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal --write`, did not fetch GeckoTerminal, did not
write DB rows, did not create / update Notifications, did not send Telegram,
and did not dump rawJson or offensive raw text.

Result review for token id `5464`:

- current `metricsCount=1`
- Metric id `1542`
- source `geckoterminal.token_snapshot`
- `observedAt=2026-05-24T13:52:10.586Z`
- `notificationCount=0`
- `holderSnapshotCount=0`
- Notification capture remained absent
- `metrics:report` showed safe booleans `priceUsdPresent=true`,
  `fdvUsdPresent=true`, `reserveUsdPresent=true`, `topPoolPresent=true`
- `metrics:window-report` showed `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no checked
  window FDV samples, and `outcomeLabel=no_data`

Remaining Metric 0 backlog:

- ids range: `5380..5463`
- remaining count: `84`
- source distribution: `geckoterminal.new_pools=84`
- metadataStatus distribution: `mint_only=84`
- metricsCount distribution: `0=84`
- scoreRank distribution: `C=84`
- hardRejected distribution: `false=84`
- notificationCount distribution: `0=84`
- holderSnapshotCount distribution: `0=84`

Next exact-mint candidate:

- token id: `5463`
- mint: `CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump`
- source / origin: `geckoterminal.new_pools`
- metadataStatus: `mint_only`
- metricsCount: `0`
- notificationCount: `0`
- holderSnapshotCount: `0`
- scoreRank / scoreTotal: `C / 0`
- hardRejected: `false`

Recommended next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump --minGapMinutes 60 --noNotificationCapture --write
```

Reason: one more exact-mint Red gives a second proof that the Metric 0 backlog
can be reduced safely with one selected mint, one Metric write, and
Notification capture disabled. The longer-term fix remains a Yellow
pending-first selector design; broad batch Metric Red should wait until the
selector can target Metric 0 rows before `--limit` is applied.

## Second Exact Mint Metric 0 Backlog Result

Date: 2026-05-25 19:58 JST

The second exact-mint Red was run once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump --minGapMinutes 60 --noNotificationCapture --write
```

Result:

- mode: `single`
- `selectedCount=1`
- `okCount=1`
- `writtenCount=1`
- `skippedCount=0`
- `errorCount=0`
- provider error: none
- 429: none
- retry: none
- `interItemDelayMs=0`, as expected for exact `--mint` mode
- `notificationCaptureEnabled=false`
- `notificationCreated=false`
- `notificationSkippedReason=disabled_by_option`

Counts moved:

- Token: `1541 -> 1541`
- Metric: `460 -> 461`
- Notification: `10 -> 10`
- HolderSnapshot: `1 -> 1`
- Metric buckets: `0=1221, 1=233, 2+=87 -> 0=1220, 1=234, 2+=87`

Target token id `5463` moved `metricsCount 0 -> 1` and received Metric
`1543` with source `geckoterminal.token_snapshot` at
`2026-05-25T10:57:38.651Z`. `metrics:report` showed rawJson-free safe
market-data booleans (`priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` all true).

The 168h queue moved `metricPendingCount 84 -> 83` while
`notifyCandidateCount` stayed `0`. This is the second successful proof that
exact `--mint` plus `--noNotificationCapture` can reduce the true Metric 0
backlog by one row without Token, Notification, HolderSnapshot, Telegram,
scheduler/systemd, repo-local, rawJson dump, or offensive raw text side
effects.

Next step should be Green: review this second exact-mint result and decide
between a third one-item Red and Yellow pending-first batch selector design.

## Second Exact Mint Review And Selector Decision

Date: 2026-05-25 21:12 JST

This Green review stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal --write`, did not fetch GeckoTerminal, did not
write DB rows, did not create / update Notifications, did not send Telegram,
and did not dump rawJson or offensive raw text.

Result review for token id `5463`:

- current `metricsCount=1`
- Metric id `1543`
- source `geckoterminal.token_snapshot`
- `observedAt=2026-05-25T10:57:38.651Z`
- `notificationCount=0`
- `holderSnapshotCount=0`
- Notification capture remained absent
- `metrics:report` showed safe booleans `priceUsdPresent=true`,
  `fdvUsdPresent=true`, `reserveUsdPresent=true`, `topPoolPresent=true`
- `metrics:window-report` showed `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no checked
  window FDV samples, and `outcomeLabel=no_data`

Exact-mint reproducibility:

- token ids `5464` and `5463` both had `selected=1`, `written=1`,
  `skipped=0`, `error=0`
- both runs used exact `--mint --minGapMinutes 60 --noNotificationCapture --write`
- both runs created exactly one Metric and no Notification
- Token, HolderSnapshot, Telegram, scheduler/systemd, repo-local data,
  rawJson dump, and offensive raw text side effects stayed absent
- provider error, 429, and retry were all absent in both runs

Remaining Metric 0 backlog:

- fixed id range `5380..5462`: `83` rows
- source distribution: `geckoterminal.new_pools=83`
- metadataStatus distribution: `mint_only=83`
- metricsCount distribution: `0=83`
- scoreRank distribution: `C=83`
- hardRejected distribution: `false=83`
- notificationCount distribution: `0=83`
- holderSnapshotCount distribution: `0=83`
- next exact-mint candidate, if needed later: token id `5462`, mint
  `63HTSDqidfB3ruuUAmjg9KbaSzWw7gkxAF2TKY6epump`

Rolling queue note:

- `review:queue:geckoterminal -- --pumpOnly --sinceHours 168` now reports
  `metricPendingCount=19`, not `83`, because the current date is
  2026-05-25 and the 168h cutoff advanced to `2026-05-18T12:12:18.233Z`.
- The fixed backlog range remains useful for explicit Metric 0 cleanup, but a
  pending-first batch selector should define whether it is bounded by
  `sinceMinutes`, explicit id/mint inputs, or a broader backlog mode.

Decision:

- Prefer **Yellow pending-first Metric batch selector design** next.
- Do not issue a third exact-mint Red command by default. The exact-mint
  boundary has enough proof for implementation planning.
- A third exact-mint Red remains available later only if the operator wants one
  more one-row production proof before selector work.

Pending-first selector design notes:

- option name candidates: `--onlyMetricPending`, `--metricPendingFirst`,
  `--metricsCount 0`
- preferred first implementation: `--onlyMetricPending`
- default selection must not change when the option is omitted
- exact `--mint` mode must stay unchanged
- opt-in batch mode should filter / order Metric 0 or metric-pending rows
  before `--limit` is applied
- dry-run without `--write` must show selected ids / mints / metricsCount /
  metadataStatus / latestMetric / notificationCount / holderSnapshotCount
  without rawJson
- tests must cover default selection unchanged, opt-in pending-first selection,
  `--minGapMinutes` interaction, `--pumpOnly` interaction, exact `--mint`
  unaffected, and Notification capture boundaries
- Red batch execution should wait for a Green preflight after Yellow
  implementation, with expected Metric writes only and Notification / Telegram
  / Token / HolderSnapshot writes still blocked

## Candidate Selection Improvement

Date: 2026-05-19

The Metric snapshot batch selector now excludes recent Metric rows before
applying `--limit` whenever `--minGapMinutes` is provided. This addresses the
50% `skipped_recent_metric` ratio seen in delayed limit 10/20/30 runs without
changing pacing or rate-limit behavior.

Boundary:

- `--interItemDelayMs` remains the pacing tool;
- 429 item-error behavior is unchanged;
- exact `--mint` mode still performs its existing min-gap check at processing
  time;
- batch mode remains Notification-free and Telegram-free;
- Token and HolderSnapshot writes are unchanged.

Next Red candidate, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Success should show `selectedCount=30`, a much lower `skipped_recent_metric`
count, no 429, and Metric-only DB writes.

## Improved Limit 30 Result

Date: 2026-05-19

The improved delayed `limit 30` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=30`
- `okCount=30`
- `writtenCount=30`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=29`
- no `429 Too Many Requests`
- written Metric ids: `1316` through `1345`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `233 -> 263`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with the previous delayed `limit 30` result:

- previous delayed `limit 30`: `writtenCount=15`, `skippedCount=15`,
  `errorCount=0`;
- improved delayed `limit 30`: `writtenCount=30`, `skippedCount=0`,
  `errorCount=0`.

The pacing stayed rate-limit clean and the selection fix removed the
`skipped_recent_metric` waste for this batch. Continue incremental expansion;
do not jump directly to a very large limit.

## Improved Limit 50 Result

Date: 2026-05-19

The improved delayed `limit 50` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=50`
- `okCount=50`
- `writtenCount=50`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=49`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1346` through `1395`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `263 -> 313`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with improved `limit 30`:

- improved `limit 30`: `writtenCount=30`, `skippedCount=0`, `errorCount=0`;
- improved `limit 50`: `writtenCount=50`, `skippedCount=0`, `errorCount=0`.

The 15-second pacing stayed rate-limit clean at limit 50, and the min-gap
selection fix kept `skipped_recent_metric` at zero. Continue incremental
expansion; use a limit 75 preflight or Red task before considering larger
batches.

## Improved Limit 75 Result

Date: 2026-05-19

The improved delayed `limit 75` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=75`
- `okCount=75`
- `writtenCount=75`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=74`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1396` through `1470`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `313 -> 388`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with improved `limit 50`:

- improved `limit 50`: `writtenCount=50`, `skippedCount=0`, `errorCount=0`;
- improved `limit 75`: `writtenCount=75`, `skippedCount=0`, `errorCount=0`.

The 15-second pacing stayed rate-limit clean at limit 75, and the min-gap
selection fix kept `skipped_recent_metric` at zero. Since the pacing and
selection behavior are now proven through limit 75, the next step should be
read-only report validation rather than immediate further batch expansion.

## Report Readiness After Limit 75

Date: 2026-05-19

The next step after limit 75 was read-only report validation, not another batch
increase. Report checks confirmed:

- DB counts stayed `1536 / 388 / 8 / 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` still reported
  `metricPendingCount=85`
- `metrics:window-report` reads accumulated Metric history and Notification
  anchors without writes or external fetches
- `metrics:report` and `tokens:compare-report` provide rawJson-free Metric
  summaries for single-token and cohort review

This confirms the rate-limit-safe accumulation path feeds the read-only report
lane. Continue with outcome / cohort report review before considering more
Metric batch expansion.

## Stop Conditions Before Next Red

Stop before the next Metric accumulation Red task if:

- working tree is not clean;
- `metricPendingCount` is unexpectedly low or no longer matches the cohort;
- selected rows are not GeckoTerminal-origin pump Tokens;
- selected rows already have recent Metrics and would be mostly skipped;
- `--interItemDelayMs` is omitted for a planned limit greater than 5;
- Telegram / Notification paths appear in batch mode;
- Token or HolderSnapshot writes appear in the path;
- raw provider response bodies, `.env`, API keys, Telegram token / chat id, or
  database URL could be printed;
- `errorCount>0` from a previous Red run is being ignored rather than addressed;
- the next step cannot be expressed as one exact command or one small Yellow
  implementation task.

## Limit 75 Re-Run Decision Preflight

Date: 2026-05-19

A read-only decision preflight was completed for a possible re-run of the
already-stable limit-75 Metric accumulation command.

Read-only command:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 75
```

Result:

- `readOnly=true`
- `geckoOriginTokenCount=94`
- `metricPendingCount=0`
- queue rows were GeckoTerminal-origin pump `mint_only`
- visible queue rows had existing Metrics and matched stale / enrich review,
  not Metric-0 pending

The current 24h queue has aged since the previous report-readiness check. A
separate read-only candidate-shape check against the proposed
`metric:snapshot:geckoterminal` filters showed about 93 eligible rows after
`minGapMinutes=60`, with a limit-75 selection shaped as approximately
`metric0=0`, `metric1=45`, and `metric2Plus=30`.

Decision:

- The next Red command can be considered as a controlled stable limit-75
  re-run for additional observation points on already measured tokens.
- It is not a Metric-0 pending cleanup run while `--sinceMinutes 1440` remains
  in place and the current queue reports `metricPendingCount=0`.
- Keep the proven pacing:
  `--interItemDelayMs 15000`.
- Human Red approval remains required because the command fetches
  GeckoTerminal and writes production Metric rows.

Candidate Red command, not executed in this preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effects: up to 75 new `Metric` rows. Expected non-effects:
Token, Notification, HolderSnapshot, Telegram, checkpoint, and repo-local data
remain unchanged.

## Additional Limit 75 Observation Run

Date: 2026-05-19

The controlled Red limit-75 command was executed once after human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=59`
- `okCount=59`
- `writtenCount=59`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=58`
- no 429 / rate-limit error
- no provider error
- written Metric ids: `1471` through `1529`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `388 -> 447`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

This was intentionally not a Metric-0 pending cleanup run. By execution time,
the `--sinceMinutes 1440` window had aged enough that only 59 eligible rows
remained after `minGapMinutes=60`; the selected rows were already measured
GeckoTerminal-origin pump `mint_only` tokens. The run added observation points
and moved 29 tokens from Metric 1 to Metric 2+, while leaving Metric 0 unchanged
at `1222`.

The 15-second pacing again stayed rate-limit clean. Batch mode still did not
create Notification rows, send Telegram, update Tokens, write HolderSnapshot,
touch checkpoints, or change repo-local data.

## Post-Run Report Readiness Decision

Date: 2026-05-19

Follow-up `metrics:window-report` checks on eight tokens confirmed that the
additional `+59` Metrics improved sampling density without changing the
rate-limit or write boundary:

- `metricCount=4` samples reached 24h `fdvSampleCoverageLabel=usable`
- Metric 1 -> 2+ samples reached 24h `fdvSampleCoverageLabel=partial`
- no new 429 / provider-error investigation is needed from the report pass
- no DB write, external fetch, Telegram send, Notification update, or rawJson
  dump occurred during report review

The remaining `no_data` outcomes are not a rate-limit or accumulation failure.
They are mostly caused by no-Notification mint-only fallback rows having no
`alertFdv` near `first_seen_detected_at`. Additional broad accumulation can add
history, but it will not by itself create an alert anchor for those rows.

Next operating preference: pause broad Metric accumulation and improve the
read-only report/operator decision surface for fallback `alertFdv=null` cases,
or separately design an alert-anchor/Notification slice.

## Post Additional Limit 75 Report Check

Date: 2026-05-20

A later read-only report pass confirmed the accumulated state after the
additional `+59` Metrics:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`

`metrics:window-report`, `metrics:report`, `tokens:compare-report`, and
`review:queue:geckoterminal` were used only as reports. They did not fetch
GeckoTerminal, write DB state, send Telegram, update Notification rows, or dump
rawJson. This confirms the rate-limit clean Metric rows remain inspectable via
the report lane; it does not authorize another Metric snapshot run.

## Not Executed In This Preflight

- `metric:snapshot:geckoterminal`;
- external fetch;
- production DB write;
- detect watch;
- Telegram live send;
- notification send / retry;
- scheduler / systemd;
- import / enrich / rescore;
- schema / migration / app code change.

## New Token Limit-5 Preflight

Date: 2026-05-23 19:52 JST

This read-only / docs-only preflight narrowed the next Metric accumulation Red
candidate after the small bounded GeckoTerminal write rehearsal created five
new mint-only pump Tokens.

Current state:

- CodexCLI: `codex-cli 0.133.0`
- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Token Metric distribution: `0=1227`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Queue state:

- 24h pump queue: `geckoOriginTokenCount=5`,
  `metricPendingCount=5`, `staleReviewCount=0`
- 168h pump queue: `geckoOriginTokenCount=425`,
  `metricPendingCount=265`, `staleReviewCount=420`

CLI / implementation boundary:

- `metric:snapshot:geckoterminal` supports `--pumpOnly`, `--limit`,
  `--sinceMinutes`, `--minGapMinutes`, and `--interItemDelayMs`.
- Batch mode sorts recent GeckoTerminal-origin candidates by
  `firstSeenSourceSnapshot.detectedAt` when present, otherwise `Token.createdAt`;
  ties use descending id.
- `--minGapMinutes` is applied before `--limit`, excluding recently measured
  rows from selection.
- Batch `--write` creates Metric rows. Notification capture is gated to exact
  `--mint --write` mode, so the batch candidate should not create
  Notifications.
- The Metric snapshot CLI writes no Tokens or HolderSnapshots and does not call
  Telegram send.

Read-only DB simulation for the candidate command found:

- `eligibleCount=5`
- `selectedCount=5`
- selected ids: `5624`, `5623`, `5622`, `5621`, `5620`
- all selected rows are `source=geckoterminal.new_pools`,
  `metadataStatus=mint_only`, pump mints, and `metricsCount=0`

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Policy:

- Keep `--interItemDelayMs 15000` even for limit 5 to preserve the previously
  rate-limit-clean pacing.
- Do not use the broader limit-75 command for this specific post-rehearsal
  check.
- If a 429 or provider error appears during the later Red run, do not retry in
  the same task and do not widen the command.
- Human approval is required before running the command because it will fetch
  GeckoTerminal and write production Metric rows.

## New Token Limit-5 Metric Snapshot Run

Date: 2026-05-23 19:58 JST

The approved Red limit-5 command ran once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- selectedCount: `5`
- okCount: `5`
- writtenCount: `5`
- skippedCount: `0`
- errorCount: `0`
- interItemDelayMs: `15000`
- interItemDelayCount: `4`
- provider error: no
- 429 / rate-limit error: no
- retry: no
- written Metric ids: `1532..1536`

Counts:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 449 / 10 / 1 -> 1541 / 454 / 10 / 1`
- Token Metric distribution:
  `0=1227`, `1=232`, `2+=82 -> 0=1222`, `1=237`, `2+=82`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

The 15-second pacing stayed rate-limit clean. Batch mode did not create
Notification rows, send Telegram, update Tokens, write HolderSnapshot, touch
scheduler / systemd, or create repo-local data diffs. Raw provider payloads and
Metric rawJson were not dumped.

## Post Limit-5 Read-Only Report Review

Date: 2026-05-23 20:22 JST

The post-run report review did not execute `metric:snapshot:geckoterminal`,
external fetch, or DB writes. It confirmed the limit-5 run achieved its narrow
goal:

- Metric rows `1532..1536` are readable through `metrics:report`.
- All five target Tokens now have `metricsCount=1`.
- The 24h pump queue moved to `metricPendingCount=0`.
- The 168h pump queue still has `metricPendingCount=260`, but this is older
  backlog and should not automatically trigger another broad Metric Red.

Window report state for the five rows is uniformly `thin` and `no_data`:

- `hasWindowFdvSamples=true`
- `hasAlertFdvAnchor=false`
- `entryAnchorQuality=near_30m`
- `noDataReasons` include `no_alert_anchor_near_entry` and
  `no_peak_multiple`

Rate-limit policy conclusion: do not immediately escalate back to limit 75
from this result. The next step should be a Green enrich/rescore preflight for
the five new Metric-1 mint-only rows, while keeping broader Metric
accumulation as a later option.

## Second Metric Snapshot Limit-5 Preflight

Date: 2026-05-24 01:43 JST

This Green pass did not run `metric:snapshot:geckoterminal`, did not use
`--write`, did not fetch GeckoTerminal, and did not write DB rows. It checked
whether the enriched partial five-token cohort can safely run another bounded
Metric snapshot.

Current state:

- CodexCLI: `codex-cli 0.133.0`
- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Token Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Target state:

- target ids: `5624`, `5623`, `5622`, `5621`, `5620`
- all are GeckoTerminal-origin pump rows with `metadataStatus=partial`
- all have `metricsCount=1`
- latest Metric ids are `1532..1536`
- latest Metric `observedAt` values are
  `2026-05-23T10:56:45.052Z` through `2026-05-23T10:57:47.424Z`
- minutes since latest Metric at preflight time: about `346` minutes for all
  five

Read-only simulation for the candidate command found:

- `geckoOriginEligibleCount=5`
- `pumpEligibleCount=5`
- `eligibleCount=5`
- `selectedCount=5`
- selected ids: `5624`, `5623`, `5622`, `5621`, `5620`
- selected mints match the intended five rows exactly
- `--minGapMinutes 60` should not skip any of them

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Policy:

- Keep `--interItemDelayMs 15000` because the prior limit-5 run with that
  pacing completed with no 429.
- Do not add `--watch`, `--live`, notification send, retry execution, auto
  live send, scheduler, or systemd.
- Expected Red side effect is Metric write up to `+5` after external
  GeckoTerminal fetch.
- Expected Red non-effects are Token write `0`, Notification create/update
  `0`, HolderSnapshot write `0`, Telegram send `0`, repo-local data diff `0`,
  and rawJson full dump `0`.
- If a 429 or provider error appears during the later Red, do not retry in the
  same task and do not widen the command.

## Second Metric Snapshot Limit-5 Run

Date: 2026-05-24 02:10 JST

The approved Red command ran once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- selectedCount: `5`
- okCount: `5`
- writtenCount: `5`
- skippedCount: `0`
- errorCount: `0`
- interItemDelayMs: `15000`
- interItemDelayCount: `4`
- provider error: no
- 429 / rate-limit error: no
- retry: no
- written Metric ids: `1537..1541`

Counts:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`
- Metric distribution:
  `0=1222`, `1=237`, `2+=82 -> 0=1222`, `1=232`, `2+=87`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

The 15-second pacing stayed rate-limit clean again. Batch mode did not create
Notification rows, send Telegram, update Tokens, write HolderSnapshot, touch
scheduler / systemd, or create repo-local data diffs. Raw provider payloads and
Metric rawJson were not dumped.

Post-run report check:

- `metrics:report` read the new Metric ids `1541..1537`
- all five target rows moved from `metricsCount=1` to `metricsCount=2`
- `metrics:window-report` shows 12h / 24h coverage improved from `thin` to
  `partial` because each row now has two FDV samples in those windows
- shorter windows remain `thin`
- outcome remains `no_data` because there is still no alert FDV anchor near
  entry

Do not immediately widen to a large Metric run from this result. The next
safer step is a Green preflight for the 168h GeckoTerminal enrichPending
backlog, because the five-token loop has now completed its narrow Metric /
enrich / second Metric confirmation.

## Metric Backlog Return Point After Enriched Cohort Analysis

Date: 2026-05-24 21:35 JST

After eight bounded enrich backlog batches and the follow-up score/report
analysis of processed ids `5619..5580`, the next recommended lane is Green
metric backlog preflight. Current 168h queue still reports
`metricPendingCount=85`; the enriched cohort analysis found
`notifyCandidateCount=0`, no social/link/description/Metaplex evidence, and no
alert FDV anchors in representative window reports.

Preflight scope for the next task:

- stay read-only
- inspect `metricPendingCount=85` selection order and candidate safety
- confirm whether candidates are Metric 0 or stale measured rows
- keep `--pumpOnly`, small limit, explicit `--minGapMinutes`, and
  `--interItemDelayMs 15000` under consideration
- do not produce or run a Metric write Red until the preflight fixes one exact
  command and expected side effects

Expected future Metric Red boundary, if approved later: external GeckoTerminal
fetch and Metric writes only. Expected non-effects remain Token update,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, rawJson full dump, and offensive raw
text dump.

## 168h Metric Backlog Selection Preflight

Date: 2026-05-24 21:41 JST

This Green preflight stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal`, did not use `--write`, did not fetch
GeckoTerminal, did not write DB rows, did not create or update Notifications,
and did not print rawJson or offensive raw text.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Queue state:

- default 24h Gecko pump queue:
  `geckoOriginTokenCount=0`, `enrichPendingCount=0`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h Gecko pump queue:
  `geckoOriginTokenCount=245`, `enrichPendingCount=200`,
  `metricPendingCount=85`, `staleReviewCount=200`,
  `notifyCandidateCount=0`

The 168h Metric-pending backlog itself is cleanly shaped:

- count: `85`
- source distribution: `geckoterminal.new_pools=85`
- metadataStatus distribution: `mint_only=85`
- metricsCount distribution: `0=85`
- scoreRank distribution: `C=85`
- hardRejected distribution: `false=85`
- reviewFlags present: `0`
- website / X / Telegram / Metaplex / description / link presence: `0`

However, the current `metric:snapshot:geckoterminal` batch selector is not a
Metric-pending selector. In batch mode it:

1. loads recent Tokens by `Token.createdAt >= sinceCutoff`;
2. keeps GeckoTerminal-origin rows using `entrySnapshot.firstSeenSourceSnapshot`
   origin where present;
3. sorts by `selectionAnchorAt` descending, then id descending;
4. applies `--pumpOnly`;
5. excludes recent Metrics before `--limit` only when `--minGapMinutes` is set;
6. applies `--limit`.

With `--sinceMinutes 10080 --minGapMinutes 60`, all 245 recent Gecko pump rows
are gap-eligible, so the selector stays newest-first and does not prefer
Metric 0 rows.

Read-only simulation:

- limit 5 selects ids `5624..5620`; all are `partial`, `metricsCount=2`,
  score `C`, and pass min-gap.
- limit 20 selects ids `5624..5605`; all are `partial`, with
  `metricsCount` distribution `2=5`, `3=10`, `4=4`, `5=1`; no Metric 0 row.
- limit 30 selects ids `5624..5595`; all are `partial`, with
  `metricsCount` distribution `2=5`, `3=20`, `4=4`, `5=1`; no Metric 0 row.
- limit 75 selects ids `5624..5550`; distribution is
  `metadataStatus partial=45`, `mint_only=30`, and
  `metricsCount 1=11`, `2=33`, `3=26`, `4=4`, `5=1`; no Metric 0 row.
- the Metric 0 backlog rows are ids `5380..5464`, so they are not reached by
  any of the checked limits.

`--sinceMinutes 1440` is also not suitable for the current target because the
24h Gecko pump queue is empty. `--sinceMinutes 10080` is necessary to include
the backlog window, but not sufficient to target the Metric 0 backlog with the
current newest-first batch order.

Rate-limit and pacing:

- prior stable Metric accumulation used `--interItemDelayMs 15000`;
- keep that pacing for future Metric Red commands;
- past delayed limit 30 / 50 / 75 runs were rate-limit clean, and the latest
  stable limit 75 wrote 59 Metrics with no 429;
- this preflight did not identify a new 429 concern, but broad limit 75 is not
  recommended here because it would not reduce `metricPendingCount=85`.

Decision:

- do not issue a next Red batch command for the stated Metric backlog target;
- the current batch command candidates would write additional Metrics to
  already measured rows and leave the Metric 0 backlog untouched;
- a future safe path should either preflight exact `--mint` mode for one
  Metric 0 row with `--noNotificationCapture`, or add / preflight a
  pending-first selector before a batch Metric backlog Red.

Expected side-effect boundary for any later approved batch Metric Red remains
Metric writes only: no Token write, no Notification create/update in batch
mode, no HolderSnapshot write, no Telegram send, no scheduler/systemd, no
repo-local data diff, no rawJson full dump, and no offensive raw text dump.

## Exact-Mint Metric 0 Backlog Preflight

Date: 2026-05-24 22:33 JST

This Green preflight stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal`, did not use `--write`, did not fetch external
APIs, did not write DB rows, did not create / update Notifications, and did
not print rawJson or offensive raw text.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Metric 0 backlog ids `5380..5464` were confirmed with safe summaries only:

- count: `85`
- source distribution: `geckoterminal.new_pools=85`
- pump distribution: `true=85`
- metadataStatus distribution: `mint_only=85`
- metricsCount distribution: `0=85`
- scoreRank / scoreTotal distribution: `C=85`, `0=85`
- hardRejected distribution: `false=85`
- Notification count distribution: `0=85`
- HolderSnapshot count distribution: `0=85`
- latest Metric present count: `0`
- reviewFlags present count: `0`

Selected exact-mint candidate:

- token id: `5464`
- mint: `By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`
- source / origin: `geckoterminal.new_pools`
- metadataStatus: `mint_only`
- metricsCount: `0`
- notificationCount: `0`
- holderSnapshotCount: `0`
- scoreRank / scoreTotal: `C / 0`
- hardRejected: `false`
- latestMetric: `null`
- selectionAnchorAt: `2026-05-18T12:34:03.491Z`

Boundary audit:

- exact `--mint` mode selects the token directly and ignores batch ordering,
  `--limit`, `--sinceMinutes`, and `--pumpOnly` selection concerns.
- exact `--mint` mode still checks `--minGapMinutes`; because token `5464`
  has no latest Metric for `geckoterminal.token_snapshot`, it should not be
  skipped by `--minGapMinutes 60`.
- exact `--mint --write` captures a `metric_appended` Notification by default,
  so `--noNotificationCapture` is required for this Red candidate.
- `--noNotificationCapture` makes `isNotificationCaptureEnabled(args)` false,
  so the `maybeCreateByNotificationKey` path is not reached.
- the write path in `metric:snapshot:geckoterminal` is `db.metric.create` only;
  no Token update, HolderSnapshot write, or Telegram sender is imported or
  called by this CLI.
- exact `--mint` mode is not delayed by `--interItemDelayMs`; for one item,
  pacing is not needed. The rate-limit risk is one GeckoTerminal token
  snapshot fetch.

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Expected side effects if later approved: one external GeckoTerminal token
snapshot fetch and at most one production Metric row. Expected non-effects:
Token write `0`, Notification create/update `0`, HolderSnapshot write `0`,
Telegram send `0`, scheduler/systemd `0`, repo-local data diff `0`, rawJson
full dump `0`, and offensive raw text dump `0`. If successful,
`metricPendingCount` should move `85 -> 84`, Metric count `459 -> 460`, and
Token Metric buckets `0=1222 -> 1221`, `1=232 -> 233`, `2+=87`.
