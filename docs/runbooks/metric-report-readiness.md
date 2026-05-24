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

## No-Data Reason Output

Date: 2026-05-19

`metrics:window-report` now includes additive window-level fields for operator
review:

- `noDataReasons`
- `hasAlertFdvAnchor`
- `hasWindowFdvSamples`

This is a display/readability improvement only:

- `outcomeLabel` thresholds were not changed
- alert FDV lookup remains the same 5-minute lookaround behavior
- no values are persisted
- report output remains rawJson-free

Reason labels:

- `no_alert_anchor_near_entry`: `alertFdv` is null
- `no_fdv_samples_in_window`: no FDV sample falls inside the window
- `no_peak_fdv`: no peak FDV can be computed for the window
- `no_peak_multiple`: `peakMultipleFromAlert` is null

Runtime checks:

- Notification id `8` token:
  `noDataReasons=[no_alert_anchor_near_entry,no_fdv_samples_in_window,no_peak_fdv,no_peak_multiple]`
  for its post-sent windows, showing that no post-send FDV samples exist.
- no-Notification mint-only fallback with Metrics:
  `hasWindowFdvSamples=true` while `hasAlertFdvAnchor=false`, with reasons
  `no_alert_anchor_near_entry` and `no_peak_multiple`.
- Metric 0 mint-only token:
  `hasWindowFdvSamples=false` and no-sample reasons are present.
- Notification id `7` flat windows:
  `noDataReasons=[]`, `hasAlertFdvAnchor=true`, and
  `hasWindowFdvSamples=true`, confirming non-`no_data` outcomes are not marked
  with no-data reasons.

Validated read-only command shape:

```bash
pnpm -s metrics:window-report -- --mint <MINT> --windows 30,60,120,180,360,720,1440
```

The checked cohort stayed side-effect free: no DB write, external fetch,
Telegram send, Token update, Notification update, HolderSnapshot write, or
rawJson full dump.

## Operator Review of No-Data Reasons

Date: 2026-05-20

This Green follow-up rechecked the no-data explanation fields against a bounded
cohort. The task stayed read-only and docs-only: no Metric snapshot, detect
watch, external fetch, production DB write, Telegram send, Notification
send/retry, schema change, migration, application code change, or rawJson full
dump was executed.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Read-only commands:

```bash
pnpm -s mvp:status
pnpm -s metrics:window-report -- --help
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint DAMRNx1oheBNpy7WRtp6ptPGGzxZkiTjxq4ptHmdpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump --windows 30,60,120,180,360,720,1440
```

Cohort:

- Notification id `8`: sent/live-send alert anchor case
- Notification id `7`: captured alert anchor and `flat` control case
- no-Notification mint-only fallback with Metrics
- Metric 0 mint-only row
- Metric 1 mint-only row
- Metric 1 -> 2+ mint-only row

Review findings:

- `no_alert_anchor_near_entry` is visible when Metrics exist but `alertFdv` is
  unavailable. The no-Notification fallback samples have
  `hasWindowFdvSamples=true`, `hasAlertFdvAnchor=false`, and reasons limited to
  alert-anchor / peak-multiple gaps in windows where FDV samples exist.
- `no_fdv_samples_in_window` is visible for true empty windows. The Metric 0
  sample and Notification id `8` post-send windows both show
  `hasWindowFdvSamples=false`.
- `hasAlertFdvAnchor=false` plus `hasWindowFdvSamples=true` is readable in
  fallback rows with Metrics, which tells the operator that more samples exist
  but the alert anchor is the missing piece.
- `hasAlertFdvAnchor=false` plus `hasWindowFdvSamples=false` is readable for
  Metric 0 rows and Notification id `8` post-send windows, which tells the
  operator there is no usable window sample.
- Notification id `7` flat windows show `noDataReasons=[]`,
  `hasAlertFdvAnchor=true`, and `hasWindowFdvSamples=true`, so no-data reasons
  are not falsely attached to non-`no_data` windows.
- Metric 1 and Metric 1 -> 2+ rows show the expected `thin` / `partial`
  coverage changes while preserving no-alert-anchor explanations.

Operator judgment:

- The report is sufficient to distinguish no samples from no alert anchor.
- It is also sufficient to explain why Notification id `8` remains `no_data`
  after live send: the available Metrics are before the sent alert anchor.
- Additional Metric accumulation can thicken `thin` / `partial` coverage, but
  it will not produce alert-based outcome labels for no-Notification mint-only
  rows while `alertFdv=null`.
- The next high-leverage task is an alert-FDV anchor policy / preflight for
  mint-only fallback rows, not another report-display tweak.

See `docs/runbooks/alert-fdv-anchor-policy.md` for the read-only policy
preflight. Its current recommendation is to keep `alertFdv` and
`outcomeLabel` strict, then add report-only `entryAnchor*` baseline fields for
mint-only fallback rows before considering any outcome-label change.

## Entry Anchor Fields

Date: 2026-05-20

`metrics:window-report` now includes report-only entry anchor fields:

- `entryAnchorFdv`
- `entryAnchorObservedAt`
- `entryAnchorLagMinutes`
- `entryAnchorSource`
- `entryAnchorQuality`

Definition:

- the entry anchor is the first FDV Metric at or after resolved `alertedAt`
- `entryAnchorSource` is `first_fdv_metric_after_alerted_at` when present, else
  `none`
- `entryAnchorQuality` classifies the lag as `none`, `near_5m`, `near_30m`,
  `acceptable_60m`, `delayed_120m`, `delayed_180m`, `late_360m`, or
  `very_late_gt_360m`

Boundary:

- `alertFdv` remains strict ±5m and unchanged
- `outcomeLabel` remains unchanged
- `peakMultipleFromAlert` remains based on `alertFdv`, not entry anchor
- existing `noDataReasons`, `hasAlertFdvAnchor`, and `hasWindowFdvSamples`
  behavior is unchanged
- fields are computed at report time only and are not persisted

Read-only runtime cohort:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`: no-Notification fallback
  with short lag; printed `entryAnchorQuality=near_30m`,
  `entryAnchorLagMinutes=20.218433333333333`, `alertFdv=null`, and
  `outcomeLabel=no_data`
- `BCiYyqsMthUWhhSUA2ZBVGVXgLx99XnsroVrCn6Wpump`: no-Notification fallback
  with long lag; printed `entryAnchorQuality=late_360m` and
  `entryAnchorLagMinutes=358.35365`
- `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`: Notification id `8`; no
  post-sent FDV sample, so `entryAnchorFdv=null`, `entryAnchorSource=none`,
  and `entryAnchorQuality=none`
- `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`: Notification id `7`; kept
  `alertFdv=223702.038226584` and wider-window `outcomeLabel=flat` while
  entry anchor appeared only as additional context

Validation:

```bash
pnpm exec tsc --noEmit
node --import tsx --test tests/metricsWindowReport.test.ts
pnpm -s metrics:window-report -- --help
```

The runtime commands remained side-effect free: no DB write, external fetch,
Telegram send, Token update, Notification update, HolderSnapshot write, or
rawJson full dump.

## Entry Anchor Quality Review

Date: 2026-05-20

A docs-only follow-up reviewed whether the report-only `entryAnchor*` fields
are strong enough to become outcome baselines for no-Notification mint-only
fallback rows.

Target cohort:

- GeckoTerminal-origin pump `mint_only`
- no Notification row
- has Metric
- has readable FDV Metric

Read-only aggregation result:

- target token count: `158`
- target Metric distribution: `1=99`, `2+=59`
- strict ±5m `alertFdv` anchor found: `0`
- strict anchor missing: `158`
- `hasWindowFdvSamples=true`: `158`
- `hasAlertFdvAnchor=false`: `158`

Entry anchor quality:

- `near_30m`: `5`
- `delayed_120m`: `12`
- `delayed_180m`: `22`
- `late_360m`: `119`
- no `near_5m`, `acceptable_60m`, `none`, or `very_late_gt_360m` rows in this
  target cohort

Lag statistics:

- min `20.2184m`
- median `238.8762m`
- p75 `308.4780m`
- p90 `339.0626m`
- max `358.3537m`

Hypothetical derived-baseline impact:

- D30 and D60 would make only `5 / 158` rows calculable, all hypothetical
  `flat`
- D180 would make `39 / 158` rows calculable, but includes anchors up to about
  `179m` after first seen
- D360 would make `158 / 158` rows calculable, but most labels would rely on
  late first-observation baselines around 3-6 hours after first seen

Operator conclusion:

- `entryAnchor*` is useful as report context and should stay report-only for
  now.
- Policy C remains the safe default: strict `alertFdv`, unchanged
  `outcomeLabel`, and visible `entryAnchorQuality`.
- A future Policy D should be a separate limited fallback outcome mode, if
  implemented at all, and should start with only `near_5m` / `near_30m`
  anchors. D180 / D360 should not be used for outcome labels without a separate
  product decision because they would overstate late first-observation
  baselines.

This closes the current report slice. The next operating step should return to
manual-approved Telegram work rather than continue Policy D design immediately.
Auto live send, scheduler, worker, queue, and systemd remain disabled.

## Post Additional Limit 75 Report Readiness

Date: 2026-05-20

This read-only follow-up checked the report surface after the additional
limit-75 Metric accumulation run added 59 more GeckoTerminal Metric rows. The
prompt's earlier `Metric=388` baseline is now stale; the current production DB
state is:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- GeckoTerminal-origin pump `mint_only` coverage: Metric `0=260`, `1=99`,
  `2+=61`
- recent written Metric id range from the last 75-row window: `1455..1529`
  (`75` rows inspected)
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20`
  reported `metricPendingCount=260`; the default 24h queue reported
  `metricPendingCount=0` because the recent window has aged

Read-only implementation boundaries were rechecked:

- `metrics:window-report` is read-only and prints `readOnly=true`,
  `willWrite=false`, `willFetch=false`, and `willSendTelegram=false`
- `metrics:window-report` uses Metric `rawJson` internally only to derive safe
  FDV/window fields and does not print rawJson
- `metrics:report`, `tokens:compare-report`, and
  `review:queue:geckoterminal` were inspected as read-only report paths with no
  DB write, external fetch, or Telegram sender call
- package-script execution for `metrics:report` and `tokens:compare-report`
  hit sandbox IPC limits in this environment, so the same CLI files were run
  directly with `node --import tsx`

Read-only commands executed:

```bash
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,1440
pnpm -s metrics:window-report -- --mint GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump --windows 30,60,120,1440
pnpm -s metrics:window-report -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --windows 30,60,120,1440
pnpm -s metrics:window-report -- --mint P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump --windows 30,60,120,1440
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20
node --import tsx src/cli/metricsReport.ts --source geckoterminal.token_snapshot --sortBy observedAt --sortOrder desc --limit 5
node --import tsx src/cli/tokensCompareReport.ts --hasMetrics true --minMetricsCount 2 --limit 5
```

Report findings:

- Notification id `8` was read as the sent/live-send token with mint
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`,
  `alertedAtSource=notification_sent_at`, `alertNotificationId=8`,
  `metricCount=2`, and `fdvMetricCount=2`; windows stayed `no_data` because
  the Metrics predate the live-send `sentAt` anchor
- Metric 2+ sample
  `GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump` was read with
  `metricCount=2`, `fdvMetricCount=2`, `alertedAtSource=token_imported_at`,
  and `entryAnchorQuality=very_late_gt_360m`
- latest accumulation sample
  `2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump` was read with
  `metricCount=2`, `fdvMetricCount=2`, and a 24h thin FDV sample window
- mint-only Metric 1 sample
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump` was read with
  `metricCount=1`, `fdvMetricCount=1`, and a 24h thin FDV sample window
- the 168h review queue keeps Metric 0 tokens in `metricPending`, while recent
  Metric-written tokens with `metricsCount>0` appear under stale/enrich review
  and no longer match `metricPending`
- `metrics:report` displayed recent Metric ids `1525..1529` as safe summaries
  with price/FDV/reserve/top-pool presence booleans, not rawJson
- `tokens:compare-report` displayed Metric 2+ `mint_only` rows with latest
  Metric source `geckoterminal.token_snapshot`, `metricsCount=4`, and
  rawJson-free completeness booleans

Side effects confirmed:

- DB write: none
- external fetch: none
- Telegram send: none
- Notification create/update: none
- Token / Metric / HolderSnapshot write: none
- rawJson full dump: none
- repo-local data diff before docs update: none

Conclusion: the report/readiness surface is usable after Metric count `447`.
`metrics:window-report` can be used for bounded operator review of Notification
id `8`, Metric 2+ rows, Metric 1 rows, and Metric 0 pending context without
opening any write, fetch, Telegram, scheduler, or systemd path.

## Post Detect Write Rehearsal Metric Lane Re-entry

Date: 2026-05-23 19:44 JST

After the small bounded GeckoTerminal new-pools write rehearsal, five new
GeckoTerminal-origin pump mint-only Tokens exist and all five have
`metricsCount=0`.

Current read-only state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- 24h pump review queue: `geckoOriginTokenCount=5`,
  `enrichPendingCount=5`, `metricPendingCount=5`, `staleReviewCount=0`
- 168h pump review queue: `geckoOriginTokenCount=425`,
  `enrichPendingCount=425`, `metricPendingCount=265`,
  `staleReviewCount=420`

The five newest rows are valid Metric accumulation candidates in shape:

- `source=geckoterminal.new_pools`
- `metadataStatus=mint_only`
- pump mints
- `entrySnapshot.firstSeenSourceSnapshot.source=geckoterminal.new_pools`
- `Metric`, `Notification`, and `HolderSnapshot` related counts are all `0`

Next step should be Green, not an immediate Metric write: preflight the Metric
snapshot command for these new rows and the wider 168h metric-pending context,
then record one human-approval Red candidate if the read-only boundaries still
match expectations.

## New Token Metric Accumulation Preflight

Date: 2026-05-23 19:52 JST

The Metric lane preflight is complete and recommends a small limit-5 Red over a
return to the broader stable limit-75 run.

Read-only facts:

- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Token Metric distribution: `0=1227`, `1=232`, `2+=82`
- 24h pump queue: `geckoOriginTokenCount=5`, `metricPendingCount=5`
- 168h pump queue: `geckoOriginTokenCount=425`, `metricPendingCount=265`
- auto-send enabled planner: `allowedCandidateCount=0`,
  `wouldSend=false`, `wouldUpdateNotification=false`
- retry planner: `candidateCount=0`

Selection expectation:

- With `--pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60`, the
  candidate set is exactly the five new write-rehearsal Tokens.
- They are selected recent-first by first-seen detectedAt: ids `5624`, `5623`,
  `5622`, `5621`, `5620`.
- Since each has no existing Metric, `--minGapMinutes 60` does not exclude
  them.

Recommended next Red exact command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effects: external GeckoTerminal fetch and up to five new Metric
rows. Expected non-effects: Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler / systemd, repo-local data diff,
and rawJson full dump.

## New Token Limit-5 Metric Report Check

Date: 2026-05-23 19:58 JST

The approved small Metric snapshot wrote five Metric rows for the five new
GeckoTerminal mint-only Tokens. Report readiness was checked read-only after
the write.

DB movement:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 449 / 10 / 1 -> 1541 / 454 / 10 / 1`
- Token Metric distribution:
  `0=1227`, `1=232`, `2+=82 -> 0=1222`, `1=237`, `2+=82`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

New Metrics:

- `1532`: `8YyGDMbZoAnjDrfVsu2oDpjRGab1BqgJHywUUovKpump`
- `1533`: `3fpUxogyLS2bVFbKSebNWz7jaepcNcUyB7tq6Xnrpump`
- `1534`: `XEDfJEWg649WmuLqDvtZjAxFebxKgPJ1b3kqmZVpump`
- `1535`: `5qwAMejmrzemp7tBW6y4wFyiWjcrfqXtnExRnFvepump`
- `1536`: `ACNm5y6jtbHXaFewMrUzkz1uJJPTYPCVCJzpXx8zpump`

`metrics:report` showed all five new Metrics as the latest
`geckoterminal.token_snapshot` rows with price / FDV / reserve / top-pool safe
summary booleans present. The report did not print rawJson.

The post-run 24h review queue reports `metricPendingCount=0`; the five rows
remain `enrichPending` with `metricsCount=1`. This confirms the first Metric
observation point is attached and readable. Next work should be a Green
decision point before any further Metric write expansion.

## New Metric Window Report Review

Date: 2026-05-23 20:22 JST

The five new Metric rows `1532..1536` were reviewed with `metrics:report` and
`metrics:window-report` using windows `30,60,120,180,360,720,1440`. The pass
was read-only (`willWrite=false`, `willFetch=false`,
`willSendTelegram=false`) and did not dump rawJson.

`metrics:report` confirmed all five rows are readable as
`geckoterminal.token_snapshot` Metrics with price / FDV / reserve / top-pool
safe summary booleans present.

Window report behavior was consistent across the cohort:

- `metricCount=1`
- `fdvMetricCount=1`
- `fdvSampleCoverageLabel=thin`
- `alertFdv=null`
- `hasAlertFdvAnchor=false`
- `hasWindowFdvSamples=true`
- `outcomeLabel=no_data`
- `noDataReasons=["no_alert_anchor_near_entry","no_peak_multiple"]`
- 30m window complete; 60m through 24h provisional
- `entryAnchorQuality=near_30m`

Entry anchor lag minutes:

- Metric `1532`: `18.7311`
- Metric `1533`: `19.9982`
- Metric `1534`: `21.2627`
- Metric `1535`: `22.5281`
- Metric `1536`: `23.7956`

Interpretation: the first Metric samples are visible and explainable as
`near_30m` entry anchors, but they do not provide alert-FDV anchors. Therefore
the rows remain useful for report context while outcome labels stay `no_data`.

Next lane recommendation: move to enrich/rescore Green preflight for these
five `mint_only` Metric-1 rows. Additional Metric accumulation can be useful
later, but the immediate gap is metadata / context, not another sample point.

## New Token Enrich/Rescore Preflight

Date: 2026-05-23 20:41 JST

The follow-up Green preflight stayed read-only and confirmed the five Metric-1
rows are still the active 24h GeckoTerminal pump `enrichPending` set. Current
state remained Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`, Metric distribution `0=1222`, `1=237`, `2+=82`, and
Notification statuses `captured=5`, `sent=5`, `failed=0`.

Target state before enrich/rescore:

- ids `5624..5620`
- `metadataStatus=mint_only`
- `name`, `symbol`, `description`, `normalizedText`, `enrichedAt`, and
  `rescoredAt` are still empty
- `scoreRank=C`, `scoreTotal=0`, `hardRejected=false`
- `metricsCount=1`, `notificationCount=0`, `holderSnapshotCount=0`
- latest Metric ids `1532..1536`

The `token:enrich-rescore:geckoterminal` CLI supports `--mint`, `--limit`,
`--sinceMinutes`, `--pumpOnly`, `--write`, and `--notify`. It does not support
`--interItemDelayMs`. Batch mode selects recent GeckoTerminal-origin tokens
missing `name` or `symbol`, sorted by `firstSeenSourceSnapshot.detectedAt` when
available. A read-only simulation for `--pumpOnly --limit 5 --sinceMinutes
1440` selected exactly ids `5624`, `5623`, `5622`, `5621`, and `5620`.

Write boundary for the next Red is Token-only: enrich fields, rescore fields,
context capture under `Token.entrySnapshot.contextCapture`, and
`reviewFlagsJson`. Metric rows, HolderSnapshot rows, and Notification rows are
not written by this CLI. Telegram send is only possible with `--notify`; the
recommended command omits it.

Recommended next Red exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Human approval is required because this will externally fetch GeckoTerminal and
best-effort Metaplex context, then update production Token rows. Expected
non-effects are Metric write, Notification create/update, HolderSnapshot write,
Telegram send, scheduler / systemd, repo-local data diff, and rawJson full
dump.

## New Token Enrich/Rescore Batch Result

Date: 2026-05-23 21:34 JST

The approved Red enrich/rescore batch ran once and completed with
`selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, and `error=0`.
Gecko context was written for all five rows. Metaplex lookup was attempted for
all five, but all returned `metadata_account_missing`; no Metaplex context was
saved. There was no provider error, no 429, and no retry.

DB counts stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`

The five-token cohort is now:

- `metadataStatus=partial`
- names / symbols present
- descriptions absent
- `normalizedText` present
- score remains `C / 0`
- `hardRejected=false`
- `metricsCount=1`
- `notificationCount=0`
- `holderSnapshotCount=0`
- review flags present with `hasWebsite=false`, `hasX=false`,
  `hasTelegram=false`, `metaplexHit=false`, `descriptionPresent=false`,
  `linkCount=0`

Per-token names:

- `5624`: `the saviour` / `BALTO`
- `5623`: `X COMM ADDED` / `Bunker`
- `5622`: `bank of banks` / `BANKS`
- `5621`: `Nietzschean Camel` / `Camel`
- `5620`: `VAULT COIN` / `VAULT`

Queue after the write:

- 24h pump queue: `enrichPendingCount=0`, `metricPendingCount=0`,
  `notifyCandidateCount=0`
- 168h pump queue: `enrichPendingCount=420`, `metricPendingCount=260`,
  `staleReviewCount=420`, `notifyCandidateCount=0`

This confirms the first Metric samples and metadata/context completion can be
reviewed separately. No Metric, Notification, HolderSnapshot, Telegram,
scheduler/systemd, or repo-local data side effect occurred.

## Enriched Partial Five-Token Report Review

Date: 2026-05-23 21:40 JST

The five rows enriched from `mint_only` to `partial` were checked again through
read-only report commands. No DB write, external fetch, Telegram send,
Notification update, Metric write, Token write, HolderSnapshot write,
scheduler/systemd, or rawJson full dump occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Target readiness:

- all five are `metadataStatus=partial`
- name / symbol are present
- description is absent
- `normalizedText`, `enrichedAt`, and `rescoredAt` are present
- score remains `C / 0`
- `hardRejected=false`
- review flags are present with no website / X / Telegram / Metaplex /
  description signal
- each has `metricsCount=1`, `notificationCount=0`, and
  `holderSnapshotCount=0`

`metrics:report` showed Metric ids `1536..1532` as the latest
`geckoterminal.token_snapshot` rows with enriched token names / symbols and
rawJson-free safe summary booleans present.

`tokens:compare-report` with GeckoTerminal `partial` / hasMetrics /
`minMetricsCount=1` / latest GeckoTerminal Metric filters included the five
target rows at the top. They remain `outcomeBucket=unresolved` with
`outcomeBucketReason=multiple_missing`, which is expected for one-Metric
rows.

`metrics:window-report` for all five rows stayed:

- `metricCount=1`
- `fdvMetricCount=1`
- `fdvSampleCoverageLabel=thin`
- `hasAlertFdvAnchor=false`
- `hasWindowFdvSamples=true`
- `outcomeLabel=no_data`
- `noDataReasons=["no_alert_anchor_near_entry","no_peak_multiple"]`
- `entryAnchorQuality=near_30m`
- 30m / 60m / 120m complete
- 180m / 360m / 720m / 1440m provisional

Entry anchor lag minutes stayed approximately:

- `18.7311`
- `19.9982`
- `21.2627`
- `22.5281`
- `23.7956`

Queue after report review:

- 24h pump queue: `enrichPendingCount=0`, `metricPendingCount=0`,
  `notifyCandidateCount=0`
- 168h pump queue: `enrichPendingCount=420`, `metricPendingCount=260`,
  `staleReviewCount=420`, `notifyCandidateCount=0`

Recommendation: next run a Green preflight for a second Metric snapshot small
Red targeting these five partial rows. This keeps the narrow cohort moving
before returning to the broader 168h enrich or Metric backlogs.

## Second Metric Snapshot Preflight for Partial Five

Date: 2026-05-24 01:43 JST

This Green preflight did not run Metric snapshot, did not fetch externally,
did not write DB rows, and did not dump rawJson. It checked whether the same
five enriched partial rows can be selected for a second bounded Metric append.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Target cohort:

| token id | symbol | metadataStatus | metrics | latest Metric | latest observedAt | minutes since latest |
|---:|---|---|---:|---:|---|---:|
| 5624 | `BALTO` | `partial` | 1 | 1532 | `2026-05-23T10:56:45.052Z` | 346.7 |
| 5623 | `Bunker` | `partial` | 1 | 1533 | `2026-05-23T10:57:00.717Z` | 346.5 |
| 5622 | `BANKS` | `partial` | 1 | 1534 | `2026-05-23T10:57:16.220Z` | 346.2 |
| 5621 | `Camel` | `partial` | 1 | 1535 | `2026-05-23T10:57:31.739Z` | 345.9 |
| 5620 | `VAULT` | `partial` | 1 | 1536 | `2026-05-23T10:57:47.424Z` | 345.7 |

Selection simulation for `--pumpOnly --limit 5 --sinceMinutes 1440
--minGapMinutes 60` returned `eligibleCount=5`, `selectedCount=5`, and
selected ids `5624`, `5623`, `5622`, `5621`, `5620`. There is no selection
drift at the current 24h cutoff.

Current report baseline was rechecked on two mints:

- `BALTO`: `metricCount=1`, `fdvMetricCount=1`, `thin`,
  `hasWindowFdvSamples=true`, `hasAlertFdvAnchor=false`,
  `entryAnchorQuality=near_30m`, `outcomeLabel=no_data`
- `VAULT`: same baseline fields; 30m / 60m / 120m / 180m / 360m are complete,
  while 12h / 24h remain provisional at this check time

Queue context:

- 24h pump queue: `geckoOriginTokenCount=5`, `enrichPendingCount=0`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h pump queue at the 2026-05-24 cutoff:
  `geckoOriginTokenCount=275`, `enrichPendingCount=270`,
  `metricPendingCount=110`, `staleReviewCount=270`,
  `notifyCandidateCount=0`

Recommended Red command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected result if all five snapshots succeed: each target moves from
`metricsCount=1` to `metricsCount=2`, improving the window/report sampling
surface from a single FDV point toward partial coverage. Expected non-effects
remain Token write `0`, Notification create/update `0`, HolderSnapshot write
`0`, Telegram send `0`, scheduler/systemd `0`, repo-local data diff `0`, and
rawJson full dump `0`.

## Second Metric Snapshot Report Check

Date: 2026-05-24 02:10 JST

The second bounded Metric snapshot Red completed and was followed by
rawJson-free read-only report checks. No second Red command was run.

Execution:

- command:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write`
- selected / written / skipped / error: `5 / 5 / 0 / 0`
- interItemDelayMs / interItemDelayCount: `15000 / 4`
- provider error: no
- 429: no
- retry: no

DB state:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`
- Metric distribution:
  `0=1222`, `1=237`, `2+=82 -> 0=1222`, `1=232`, `2+=87`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`
- retry and enabled auto-send candidates stayed `0`

Target result:

- `5624` / `BALTO`: Metric `1537`, `metricsCount=2`
- `5623` / `Bunker`: Metric `1538`, `metricsCount=2`
- `5622` / `BANKS`: Metric `1539`, `metricsCount=2`
- `5621` / `Camel`: Metric `1540`, `metricsCount=2`
- `5620` / `VAULT`: Metric `1541`, `metricsCount=2`

All five stayed `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, `notificationCount=0`, and `holderSnapshotCount=0`.

`metrics:report` confirmed the five new rows are the latest
`geckoterminal.token_snapshot` Metrics and printed only safe summary fields;
no rawJson full dump occurred.

`metrics:window-report` for all five rows confirmed:

- `metricCount=2`
- `fdvMetricCount=2`
- 30m / 60m / 120m / 180m / 360m windows remain `thin`
- 12h / 24h windows are now `partial`
- `hasWindowFdvSamples=true`
- `hasAlertFdvAnchor=false`
- `entryAnchorQuality=near_30m`
- `outcomeLabel=no_data`
- `noDataReasons` include `no_alert_anchor_near_entry` and
  `no_peak_multiple`
- 12h / 24h are still provisional

This confirms the second Metric improved longer-window sample coverage, but it
does not change alert-anchored outcome classification for no-Notification rows.
The next useful Green lane is a read-only preflight for the 168h
GeckoTerminal enrichPending backlog.

## Enrich Backlog Preflight After Second Metric

Date: 2026-05-24 09:57 JST

After the five-token cohort reached second Metric and report verification, a
Green preflight inspected the 168h GeckoTerminal enrichPending backlog. It did
not run enrich/rescore, Metric snapshot, detect watch, `--write`, `--notify`,
external fetch, Telegram send, Notification update, or rawJson full dump.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Backlog state:

- 168h GeckoTerminal-origin count: `245`
- complete Gecko rows skipped by enrich selector: `5`
- enrichPending count: `240`
- pumpOnly enrichPending count: `240`
- metadataStatus distribution: `mint_only=240`
- source distribution: `geckoterminal.new_pools=240`
- metricsCount distribution: `0=85`, `1=96`, `2+=59`
- scoreRank distribution: `C=240`
- hardRejected distribution: `false=240`
- narrow-loop overlap count: `0`

Selection simulation:

- limit 5 selects ids `5619`, `5618`, `5617`, `5616`, `5615`
- limit 10 selects ids `5619..5610`
- limit 20 selects ids `5619..5600`
- selected rows are all `mint_only`, `C / 0`, non-hard-rejected,
  GeckoTerminal-origin pump rows
- selection does not include the completed narrow-loop ids `5624..5620`

Recommended Red command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

This Red would update Token enrichment/rescore/context/reviewFlags for at most
five rows after external GeckoTerminal and best-effort Metaplex fetches. It
should not write Metrics, create/update Notifications, write HolderSnapshots,
send Telegram, touch scheduler/systemd, create repo-local data diffs, or dump
rawJson. Human approval is required; do not add `--notify`.

## Enrich Backlog Batch Result

Date: 2026-05-24 11:01 JST

The human-approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.

Selected ids `5619..5615` moved from `mint_only` to `partial`; each now has
name/symbol and normalized text, remains score `C / 0`, remains
`hardRejected=false`, has `enrichedAt` / `rescoredAt`, and has reviewFlags.
Metaplex was attempted for all five and returned `metadata_account_missing=5`,
so description/link/social flags remain absent.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`
and Notification statuses `captured=5`, `sent=5`, `failed=0`. The 168h queue
now shows `enrichPendingCount=235`, `metricPendingCount=85`,
`staleReviewCount=235`, and `notifyCandidateCount=0`.

This confirms the limit-5 backlog Token update boundary. It did not write
Metrics, create/update Notifications, write HolderSnapshots, send Telegram,
execute auto-send/retry, touch scheduler/systemd, create repo-local data
diffs, or dump rawJson. Next work should stay Green: review this batch and
decide whether to continue with another bounded enrich backlog Red or switch
to Metric/report follow-up.

## Enriched Backlog Batch Report Review

Date: 2026-05-24 11:33 JST

The read-only review of ids `5619..5615` confirmed that the newly partial rows
are visible in Metric and compare reports without rawJson dumps. No
`--write`, external fetch, Telegram send, Notification update, Metric snapshot,
detect watch, scheduler/systemd, schema, migration, or app code change was
performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, score `C / 0`, `hardRejected=false`, with
  names/symbols, normalized text, reviewFlags, and enrichment/rescore
  timestamps
- `5619` has a sent Notification `id=10` attached to Metric `1531`; it remains
  non-retry and not an auto-send candidate
- `metrics:report` reads 5 Metrics for `5619` and 4 Metrics for `5618`; the
  rows expose safe market-data presence booleans, not raw provider payloads
- `metrics:window-report` for `5619` uses the sent Notification as entry but
  has no post-entry FDV samples, so windows are `no_data`
- `metrics:window-report` for `5618` has firstSeen entry, `near_30m` anchor,
  30m / 60m `thin`, 2h-12h `partial`, 24h `usable`, and still `no_data`
  because no alert FDV anchor / peak multiple exists
- `tokens:compare-report` includes all five rows with `minMetricsCount=4`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=235`,
`metricPendingCount=85`, `staleReviewCount=235`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5614..5610`, all
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
