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

## Cohort Window Outcome Check

Date: 2026-05-19

After the first report-readiness pass, a smaller outcome cohort was checked
side by side with `metrics:window-report` using windows
`30,60,120,180,360,720,1440`. The cohort was intentionally bounded to seven
tokens:

- Notification id `8` token:
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
- Notification id `7` token:
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`
- Metric 2+ GeckoTerminal-origin pump `mint_only` samples without Notification:
  `AvE4T5wvJsjr6Ro7q3gdPgEpDDPMYnh6dmqTafZPpump`,
  `Dt1M9Cj7pEBuPf3dAbzLSFk1ft9YHmhCXs8vdyySpump`, and
  `8b1rapy6vNuaoUHBSPhJoXNrU3CL1ZpRKpXLvX9apump`
- Metric 1 sample:
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump`
- Metric 0 pending sample:
  `27GS5VLagjZdtdwPeBkyqkJDWn2ZoqjqBCN4LUB6pump`

Read-only commands executed:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint AvE4T5wvJsjr6Ro7q3gdPgEpDDPMYnh6dmqTafZPpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint Dt1M9Cj7pEBuPf3dAbzLSFk1ft9YHmhCXs8vdyySpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 8b1rapy6vNuaoUHBSPhJoXNrU3CL1ZpRKpXLvX9apump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 27GS5VLagjZdtdwPeBkyqkJDWn2ZoqjqBCN4LUB6pump --windows 30,60,120,180,360,720,1440
```

Current DB state during the cohort check stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=261`, `2+=53`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` still reported
  `metricPendingCount=85`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Outcome findings:

- Notification id `8` was recognized as `alertNotificationId=8` with
  `alertedAtSource=notification_sent_at`, but all checked windows stayed
  `outcomeLabel=no_data` because both Metrics predated `sentAt`, leaving no
  post-alert FDV sample inside those windows.
- Notification id `7` was recognized as `alertNotificationId=7` with
  `alertedAtSource=notification_captured_at`. It had `alertFdv` from the
  pre-alert Metric and a post-alert Metric in the 120m+ windows, producing
  `peakMultipleFromAlert=1.0869155273705746`, `outcomeLabel=flat`,
  `fdvSampleCoverageLabel=thin`, and non-negative `timeToPeakMinutes`.
- The three no-Notification Metric 2+ samples fell back to
  `alertedAtSource=first_seen_detected_at` with `alertNotificationId=null`.
  They showed Metric/FDV samples in wider windows (`thin` at one-sample
  windows and `partial` when two samples were inside the window), but
  `outcomeLabel` stayed `no_data` because there was no alert FDV anchor.
- The Metric 1 sample also fell back to `first_seen_detected_at`; it showed
  `fdvSampleCoverageLabel=thin` in the wider window and `outcomeLabel=no_data`.
- The Metric 0 sample stayed pending / `no_data` across every checked window
  with `fdvSampleCoverageLabel=no_data`.
- The cohort showed the completion flags in a useful way: older alert-anchored
  samples were complete / non-provisional, while newer first-seen fallback
  samples could show complete short windows and provisional 12h / 24h windows.
- No `small_win`, `hit`, or `big_hit` labels appeared in this cohort. The only
  non-`no_data` label observed was `flat`, and it matched the documented
  `peakMultipleFromAlert < 1.5` rule.

This confirmed that `metrics:window-report` is usable for human review at the
current accumulation stage: it distinguishes pending / no-data tokens, thin
single-sample tokens, partial multi-sample windows, alert-anchored outcomes,
and provisional incomplete windows without printing Metric rawJson.

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

The next task should be a separately approved Red run only if the operator wants
to add another bounded set of observation points. Because the latest 24h queue
now has no Metric-0 pending candidates, that Red run should be treated as a
stable limit-75 re-run for additional Metric samples on already measured
GeckoTerminal-origin pump `mint_only` tokens, not as Metric-0 cleanup.

Candidate command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

It still requires explicit human Red approval because it fetches GeckoTerminal
and writes production Metric rows.

## Metric Accumulation Decision Preflight

Date: 2026-05-19

This read-only decision point checked whether the already-stable limit-75 Metric
accumulation command can be re-run before returning to Telegram operations.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=261`, `2+=53`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Read-only queue command:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 75
```

Queue result:

- `readOnly=true`
- `geckoOriginTokenCount=94` inside the 24h queue window
- `metricPendingCount=0`
- queue rows were GeckoTerminal-origin pump `mint_only` rows
- visible queue rows had existing Metrics and matched `staleReview` /
  `enrichPending`, not `metricPending`

Additional read-only candidate-shape check for the proposed Red command showed:

- `geckoPumpOriginWithin24h=93`
- `eligibleAfterMinGap60=93`
- `selectedCountIfLimit75=75`
- selected distribution would be approximately `metric0=0`, `metric1=45`,
  `metric2Plus=30`
- selected rows were `metadataStatus=mint_only`

Decision:

- Proceeding to a Red command is reasonable only as a controlled repeat of the
  stable limit-75 Metric accumulation path.
- It should not be described as processing the earlier `metricPendingCount=85`
  cohort because the current 24h queue reports `metricPendingCount=0`.
- The expected write target is up to 75 new `Metric` rows on already measured
  GeckoTerminal-origin pump `mint_only` tokens.
- `--interItemDelayMs 15000` should stay in place because it was the pacing
  used for the rate-limit-clean limit 30 / 50 / 75 runs.
- Expected non-effects remain: no Token update/create, no Notification
  create/update in batch mode, no HolderSnapshot write, no Telegram send, no
  checkpoint, and no repo-local data changes.

Stop before Red execution if the queue no longer has enough eligible
GeckoTerminal-origin pump `mint_only` rows, if Notification / Telegram /
HolderSnapshot paths appear in batch mode, if raw provider bodies or secrets
would be printed, or if the operator intent is specifically to fill Metric-0
pending rows rather than add additional observations.

## Report Check After Additional Limit 75 Run

Date: 2026-05-19

After the additional observation-point run, DB counts were:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

The Red command wrote 59 new Metric rows (`1471` through `1529`) and did not
change Token, Notification, or HolderSnapshot counts.

Read-only report checks:

```bash
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint 2k5wuRCdhL331w5mALdP34eejkQ3qQswykyipr3bpump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint D4kjSBMpLe8fPvjH3D3WCscvNui6QjeK2BhzFa51pump --windows 30,60,1440
```

Findings:

- all three reports stayed read-only with `willWrite=false`, `willFetch=false`,
  and `willSendTelegram=false`
- newly written Metrics were visible through `metricCount`,
  `latestFdvObservedAt`, and `latestFdv`
- two sample tokens now had `metricCount=4`, `fdvMetricCount=4`, and 24h
  `fdvSampleCoverageLabel=usable`
- one sample token had `metricCount=2`, `fdvMetricCount=2`, and 24h
  `fdvSampleCoverageLabel=thin`
- `outcomeLabel` stayed `no_data` for these samples because they use
  `first_seen_detected_at` fallback with no alert FDV anchor
- no rawJson full dump was printed

## Post-Accumulation Window Outcome Review

Date: 2026-05-19

This read-only pass reviewed whether the additional Metric `+59` improved
operator judgment in `metrics:window-report`.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Cohort selection:

- `2qyZZ...pump` and `2k5w...pump`: newly written additional observations,
  now `metricCount=4`
- `CyU...pump` and `3V7...pump`: newly written additional observations that
  moved from Metric 1 to Metric 2+
- `EUx...pump`: Notification id `8`, sent/live-send anchor
- `ENRA...pump`: Notification id `7`, captured alert anchor
- `DAM...pump`: current Metric 1 mint-only sample
- `By3...pump`: current Metric 0 mint-only sample

Read-only command shape used for each selected mint:

```bash
pnpm -s metrics:window-report -- --mint <MINT> --windows 30,60,120,180,360,720,1440
```

All outputs declared `readOnly=true`, `willWrite=false`, `willFetch=false`,
and `willSendTelegram=false`. No rawJson full dump was printed.

Outcome observations:

- Additional Metrics improved coverage, not alert classification. The two
  `metricCount=4` samples showed 24h `fdvSampleCoverageLabel=usable`; shorter
  windows progressed from `thin` to `partial` where multiple samples fell in
  window.
- The two Metric 1 -> 2+ samples showed 24h `fdvSampleCoverageLabel=partial`.
  Their short windows remained `no_data` or `thin` because the first sample was
  hours after `first_seen_detected_at`.
- No-Notification mint-only fallback rows still have `alertFdv=null`, so
  `peakMultipleFromAlert` remains null and `outcomeLabel=no_data` even when
  Metric history is present.
- Notification id `7` remains the useful alert-anchored control:
  `alertedAtSource=notification_captured_at`, `alertNotificationId=7`,
  `alertFdv=223702.038226584`, `peakMultipleFromAlert=1.0869155273705746`,
  and `outcomeLabel=flat` from 2h through 24h.
- Notification id `8` is correctly recognized as
  `alertedAtSource=notification_sent_at` / `alertNotificationId=8`, but remains
  `no_data` because the available Metrics predate `sentAt`; there is no
  post-send window sample.
- The Metric 1 sample stayed `thin`; the Metric 0 sample stayed `no_data`.
- Complete/provisional flags were usable: short windows were complete, while
  24h windows for recent first-seen fallback tokens were still provisional.

Judgment:

- `metrics:window-report` is usable for human review of sampling density,
  freshness, window completeness, and alert-anchored outcomes.
- For no-Notification mint-only rows, more Metric accumulation alone does not
  produce `flat` / `small_win` / `hit` / `big_hit` because there is no alert FDV
  anchor near `first_seen_detected_at`.
- The next high-leverage work is report display improvement around the
  "fallback no alertFdv" case, or a separate alert-anchor/Notification strategy,
  rather than simply adding another broad accumulation batch.
