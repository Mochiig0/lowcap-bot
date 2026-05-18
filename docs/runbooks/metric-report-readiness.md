# Metric Report Readiness

Date: 2026-05-19

This runbook records the read-only confirmation that accumulated GeckoTerminal
Metric rows can be inspected through report / outcome CLI commands without
writing DB rows, fetching external APIs, sending Telegram, or dumping rawJson.

## Current DB State

After improved Metric accumulation through limit 75:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution:
  - Metric 0: `1222`
  - Metric 1: `261`
  - Metric 2+: `53`
- GeckoTerminal-origin Token count: `1414`
- GeckoTerminal-origin pump `mint_only` Token count: `420`
- GeckoTerminal-origin pump `mint_only` coverage:
  - Metric 0: `260`
  - Metric 1: `128`
  - Metric 2+: `32`
- Notification status counts: `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` reported
  `metricPendingCount=85`, so Metric 0 rows remain available for future
  bounded Metric accumulation.

## Read-Only Commands Confirmed

The following commands were inspected or executed as read-only reports:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump --windows 30,60,1440
pnpm -s metrics:report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --limit 3
pnpm -s tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus mint_only --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 5
```

`metrics:window-report` prints explicit safety fields:

- `readOnly=true`
- `willWrite=false`
- `willFetch=false`
- `willSendTelegram=false`

The report implementation reads Metric `rawJson` internally only to compute FDV
presence and window values. It did not print rawJson payloads.

## Report Results

Notification id `8`:

- Token mint: `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
- Notification state: `sent` / `live_send`
- `metrics:window-report` selected `notification_sent_at` as `alertedAtSource`
  and `alertNotificationId=8`
- Token has `metricCount=2` and `fdvMetricCount=2`
- 30m / 60m / 24h windows were `no_data` because the two Metric samples were
  before the live-send `sentAt` anchor

Metric 2+ sample:

- Token mint: `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`
- Metrics: `1281`, `1301`, `1396`
- `metrics:window-report` read `metricCount=3` and `fdvMetricCount=3`
- 30m / 60m windows had `fdvSampleCount=1`, `fdvSampleCoverageLabel=thin`,
  and `outcomeLabel=no_data` because there is no alert FDV anchor
- 24h window had `fdvSampleCount=3`, `fdvSampleCoverageLabel=partial`, and
  `outcomeIsProvisional=true`
- `metrics:report -- --mint ... --limit 3` showed the same three rows with
  rawJson-free safe-summary booleans all true

Metric 1 sample:

- Token mint: `CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump`
- `metrics:window-report` read `metricCount=1` and `fdvMetricCount=1`
- 24h window had `fdvSampleCount=1`, `fdvSampleCoverageLabel=thin`, and
  `outcomeIsProvisional=true`
- 30m / 60m windows were `no_data` because the only Metric was outside those
  short windows

Cohort report:

- `tokens:compare-report` with GeckoTerminal `mint_only` / `hasMetrics` /
  `minMetricsCount=1` returned five rows
- The sample rows had `metricsCount=3`, latest Metric source
  `geckoterminal.token_snapshot`, and rawJson-free latest Metric presence
  booleans all true
- Legacy `outcomeBucket` remained `unresolved` / `multiple_missing`, which is
  expected because canonical outcome review is `metrics:window-report`

## Side Effects

Confirmed after report execution:

- Token / Metric / Notification / HolderSnapshot stayed `1536 / 388 / 8 / 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`
- DB write: none
- external fetch: none
- Telegram send: none
- Notification create/update: none
- repo-local data changes: none
- rawJson full dump: none

## Next Candidate

The next task should stay read-only and use the accumulated Metrics for a small
cohort outcome/readiness review, for example comparing `metrics:window-report`
results across a handful of Metric 2+ GeckoTerminal-origin pump `mint_only`
Tokens before any further batch expansion.
