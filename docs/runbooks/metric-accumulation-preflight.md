# Bounded Metric Accumulation Preflight

Date: 2026-05-19

This is a read-only / docs-only preflight for the next GeckoTerminal Metric
accumulation slice. It does not execute `metric:snapshot:geckoterminal`, does
not fetch external APIs, and does not write production DB state.

## Starting Point

The 240-cycle GeckoTerminal new-pools write rehearsal completed with:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 240 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal-20260518-240.json
```

Observed DB counts after that run:

- Token: `1536`
- Metric: `198`
- Notification: `8`
- HolderSnapshot: `1`

Notification status counts:

- `captured=5`
- `sent=3`
- `failed=0`

Metadata status counts:

- `mint_only=1373`
- `partial=150`
- `enriched=13`

## Candidate Cohort

Read-only DB inspection found 240 likely tokens from the 240-cycle write
rehearsal:

- imported at / after `2026-05-18T11:00:00.000Z`
- GeckoTerminal origin (`geckoterminal.new_pools`)
- pump mint
- `metadataStatus=mint_only`
- `metricsCount=0`

The observed importedAt range for that cohort is:

- first: `2026-05-18T11:07:00.853Z`
- last: `2026-05-18T15:36:09.128Z`

`review:queue:geckoterminal -- --pumpOnly --limit 10` reported:

- `geckoOriginTokenCount=240`
- `enrichPendingCount=240`
- `metricPendingCount=240`
- `notifyCandidateCount=0`
- `staleReviewCount=0`
- `highPriorityRecentCount=0`

This means the next Metric slice can target the fresh mint-only GeckoTerminal
pump cohort without touching Notification or Telegram paths.

## Current CLI Boundary

`pnpm metric:snapshot:geckoterminal` behavior from code inspection:

- default mode is dry-run;
- `--write` creates `Metric` rows;
- batch mode is used when `--mint` is omitted;
- exact `--mint --write` captures a `metric_appended` Notification by default;
- batch mode does not capture Notification rows because notification capture is
  enabled only when `args.mint` is present;
- `--noNotificationCapture` is therefore unnecessary for batch mode;
- `--minGapMinutes` skips a token before fetch only when the same token+source
  already has a recent Metric;
- for the current 240-token cohort, `metricsCount=0`, so
  `--minGapMinutes 60` is a defensive duplicate guard rather than an expected
  skip condition;
- successful writes create Metric rows with `observedAt`, `source`,
  `volume24h`, and a sanitized `rawJson` snapshot;
- the command does not update Token metadata fields, create HolderSnapshot
  rows, or send Telegram;
- fetch / parse errors are returned as item-level `status=error` and do not
  create a Metric for that item.

The stored Metric `rawJson` is produced by `parseSanitizedSnapshot`; it is not a
raw provider response dump. Reports should still avoid pasting full rawJson and
should rely on safe summaries / counts / ids.

## Recommended Red Candidate

Start with a small batch instead of all 240 pending tokens:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Rationale:

- `--pumpOnly` keeps the target aligned with the 240-token pump cohort;
- `--limit 10` is a bounded first expansion after prior limit 1 / limit 3
  checks;
- `--sinceMinutes 1440` targets the recent 24h GeckoTerminal-origin cohort;
- `--minGapMinutes 60` prevents accidental duplicate Metric writes if a token
  was already sampled recently;
- batch mode avoids capture-only Notification creation;
- no Telegram path is involved.

Expected side-effect upper bound:

- Token: `+0`
- Metric: up to `+10`
- Notification: `+0`
- HolderSnapshot: `+0`
- Telegram: no send
- checkpoint: none
- repo-local data: no diff

Because `sinceMinutes 1440` is time-relative, Red execution must re-check the
queue immediately before running. If the 240-token cohort has aged out or the
candidate set no longer matches GeckoTerminal origin / pump / mint_only /
Metric 0, stop and refresh this preflight.

## Rate Limit / Error Boundary

The prior 240-cycle write rehearsal observed `rateLimitRetryCount=1` and
`rateLimitRetrySuccessCount=1`. For Metric accumulation:

- the proposed command is one-shot batch mode, not watch mode;
- there is no approved retry / rerun in this preflight;
- if the Red run reports `errorCount>0` or any item error contains `429`, record
  the safe summary and stop;
- do not immediately rerun with a larger limit;
- do not switch to watch mode;
- do not execute a second command to compensate for skipped / errored items.

## Stop Conditions

Stop before Red execution if any of these are true:

- working tree is not clean;
- candidate selection no longer identifies the recent GeckoTerminal pump
  mint-only cohort;
- `metricPendingCount` is unexpectedly low or the selected rows already have
  Metrics;
- batch mode appears able to create Notification rows;
- Telegram send could occur;
- Token / HolderSnapshot / Notification writes appear in the path;
- the command cannot be expressed as one exact command;
- the command would include `--mint`, `--watch`, Telegram flags, retry, or
  scheduler / systemd behavior;
- raw provider response, `.env`, API key, Telegram token / chat id, or database
  URL could be printed;
- rate limit handling would require immediate retry or batch expansion.

## Not Executed In This Preflight

- `metric:snapshot:geckoterminal`;
- detect watch;
- external fetch;
- production DB write;
- Telegram live send;
- Notification create/update;
- notification send / retry;
- scheduler / systemd;
- import / enrich / rescore;
- schema / migration / app code change.

## Limit 10 Red Result

Date: 2026-05-19

The approved Red command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Queue precheck:

- command: `pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 10`
- `geckoOriginTokenCount=240`
- `metricPendingCount=240`
- `notifyCandidateCount=0`
- preview rows were GeckoTerminal-origin pump `mint_only` Tokens with
  `metricsCount=0`

Run result:

- exit code: `0`
- `selectedCount=10`
- `okCount=5`
- `writtenCount=5`
- `skippedCount=0`
- `errorCount=5`
- no `skipped_recent_metric`
- five selected items returned `GeckoTerminal token snapshot request failed:
  429 Too Many Requests`
- written Metric ids: `1281`, `1282`, `1283`, `1284`, `1285`

Counts before / after:

- Token: `1536 -> 1536`
- Metric: `198 -> 203`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`

Boundary confirmed:

- Metric rows were appended for successful items only.
- Batch mode did not create Notification rows.
- Telegram live send did not run.
- Token and HolderSnapshot rows were not created or updated.
- Repo-local `data/trend.json` and `data/checkpoints` had no diff.
- Full rawJson, environment values, and secrets were not displayed.

Follow-up: because half the batch hit `429`, stop expansion. Do not immediately
rerun. Before another Metric accumulation Red task, define a rate-limit-aware
plan for this CLI path, for example a smaller batch, explicit inter-item delay,
or a bounded watch-style Metric accumulation design.

## Rate Limit Aware Follow-Up Preflight

Date: 2026-05-19

Read-only / docs-only follow-up was completed after the `limit 10` partial
success. Current DB state is:

- Token / Metric / Notification / HolderSnapshot: `1536 / 203 / 8 / 1`
- Token rows with zero Metrics: `1372`
- `review:queue:geckoterminal -- --pumpOnly --limit 10`:
  `metricPendingCount=235`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Implementation audit:

- one-shot batch mode is sequential, not parallel;
- there is no item-to-item delay;
- each item fetches one GeckoTerminal token snapshot;
- non-OK responses log only safe status / statusText text, not provider bodies
  or headers;
- `429 Too Many Requests` is returned as an item-level `status=error`;
- the command can exit `0` while reporting `errorCount>0`;
- failed `429` items do not create Metric rows and remain pending because they
  still have `metricsCount=0`;
- successful items append Metric rows only;
- batch mode does not create Notifications and does not send Telegram.

Policy:

- treat `errorCount>0` as partial success, not a fully Green batch expansion;
- do not immediately rerun to compensate for errored items;
- do not increase batch size until rate-limit pacing is addressed;
- keep Token / Notification / HolderSnapshot and Telegram out of the Metric
  batch path.

Recommendation: choose Yellow implementation of an item pacing option before
the next Red Metric accumulation. Implemented shape:
`--interItemDelayMs <N>`, non-negative integer, default `0`, applied between
selected items in batch / watch cycles, with no change to Metric write,
Notification capture, or Telegram semantics. Detailed policy:
`docs/runbooks/metric-snapshot-rate-limit-policy.md`.

## Inter-Item Delay Implementation

Date: 2026-05-19

`metric:snapshot:geckoterminal` now supports:

```bash
--interItemDelayMs <N>
```

Behavior:

- default is `0`, so existing commands keep their prior pacing;
- `N` must be a non-negative integer;
- delay applies only between selected batch items;
- there is no delay before the first item or after the last item;
- exact `--mint` mode does not delay;
- dry-run and `--write` batch mode use the same pacing;
- summary output includes `interItemDelayMs` and `interItemDelayCount`;
- Metric write, Notification capture, Telegram, Token, HolderSnapshot, and 429
  handling are unchanged.

Next Red candidate, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```
