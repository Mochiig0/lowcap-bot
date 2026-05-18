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
