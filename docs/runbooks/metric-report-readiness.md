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
