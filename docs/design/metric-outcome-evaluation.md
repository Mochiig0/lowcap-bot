# Metric Outcome Evaluation Design

## Purpose

This document fixes the read-only design boundary for future
`metrics:window-report` outcome evaluation.

Metric outcome evaluation is for notification and score/risk validation after
Metric history has accumulated. It is not automatic trading, not a buy signal,
not position sizing, and not profit guidance.

## Non-goals

- No DB schema change.
- No migration change.
- No automatic DB column persistence.
- No production DB write.
- No Telegram send.
- No external fetch.
- No `--write` or `--watch` execution.
- No `metrics:window-report` implementation change in this docs-only task.
- No `metric:snapshot:geckoterminal` implementation change in this docs-only
  task.

## Implementation Status

`metrics:window-report` now implements this MVP read-only outcome shape. It
adds `reportGeneratedAt`, `evaluationAt`, `alertedAt`, `alertFdv`,
`latestFdv`, `firstObservedFdv`, per-window completion / coverage fields,
`peakMultipleFromAlert`, `timeToPeakMinutes`, `drawdownFromPeak`, and
`outcomeLabel`.

This implementation is still read-only: it does not write Metric result
fields, create Notification rows, change schema, run migrations, fetch
external APIs, send Telegram, execute detector / watch / write commands, or
persist outcome labels.

## Metric Result Field Boundary

The Metric result-field storage boundary is fixed in
`docs/design/metric-result-field-policy.md`.

The `tokens:compare-report` legacy outcome-bucket boundary is fixed in
`docs/design/compare-report-legacy-outcome-policy.md`.

In the MVP, Metric rows are treated as time-series observation snapshots, not
as aggregate rows that are continuously updated with final outcomes. Result
fields such as `peakFdv24h`, `maxMultiple15m`, `timeToPeakMinutes`,
`alertedAt`, and `peakMultipleFromAlert` remain read-only computed outcome
values for `metrics:window-report`, not live snapshot write targets for
`metric:snapshot:geckoterminal`.

`tokens:compare-report outcomeBucket` is legacy / provisional compatibility
output based on older Metric result fields. It is not the canonical outcome
evaluation path. Use this document's window-level `outcomeLabel` policy for
current outcome review.

## Peak FDV Window Policy

Peak FDV is the maximum valid FDV observed in `Metric` history inside each
evaluation window:

```text
peakFdv = max(metric.fdv) within the window
```

The 24h outcome is not a single sample taken exactly 24 hours later. It is the
observed maximum across the 24h window. If a short-term pump is captured in
Metric history, it should be reflected in the window peak.

`metrics:window-report` should continue to be treated as a read-only report
based on this window-max policy.

## Default Windows

The default outcome windows are fixed as minutes:

```text
30,60,90,120,180,240,300,360,480,600,720,1440
```

Meaning:

| Minutes | Label |
| ---: | --- |
| 30 | 30m |
| 60 | 60m |
| 90 | 90m |
| 120 | 2h |
| 180 | 3h |
| 240 | 4h |
| 300 | 5h |
| 360 | 6h |
| 480 | 8h |
| 600 | 10h |
| 720 | 12h |
| 1440 | 24h |

Intent:

- 30m through 6h windows give fine-grained short-term pump validation.
- 8h, 10h, 12h, and 24h windows keep medium-longer extension visible.
- The 24h window is still a window maximum over observed valid Metric FDV, not
  one sample taken exactly 24 hours later.

## Evaluation At

`evaluationAt` is the evaluation reference time for a
`metrics:window-report` run.

For the MVP:

```text
evaluationAt = reportGeneratedAt
reportGeneratedAt = the time metrics:window-report runs
```

Uses:

- selecting `latestFdv`.
- computing `latestFdvAgeSeconds`.
- computing `drawdownFromPeak`.
- deciding whether each window is complete or still provisional.

`evaluationAt` is different from `alertedAt`. `alertedAt` is when the token was
confirmed as notification-worthy. `evaluationAt` is when the operator evaluates
the outcome later.

`Metric.rawJson` inspection policy is fixed in
`docs/design/metric-rawjson-inspect-policy.md`. `metrics:window-report` uses
valid FDV extracted from `rawJson`; it does not print raw provider payloads.

The MVP uses the report execution time. A future CLI may add
`--evaluationAt <ISO>` so historical evaluation can be reproduced for a past
point in time.

## Alerted At

`alertedAt` is the time when score/risk evaluation has completed and the token
has been confirmed as notification-worthy.

The Notification event lifecycle policy is fixed in
`docs/design/notification-event-policy.md`.

Resolve `alertedAt` in this priority order:

1. `--entryAt <ISO>` CLI override (`cli_entryAt`)
2. `Notification.sentAt`
3. `Notification.capturedAt`
4. `Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`
5. `Token.importedAt`
6. `Token.createdAt`

The first available timestamp is the evaluation anchor.

Use `--entryAt` only as an explicit operator override. Use
`Notification.sentAt` for successful live sends. Use
`Notification.capturedAt` for capture-only / dry-run-equivalent notification
records. If a Notification row is `failed` or has an unknown status, reports
should surface that lifecycle state and use timestamps conservatively. When no
suitable Notification timestamp exists, continue to the Token fallbacks.

The broader timestamp meaning policy is fixed in
`docs/design/time-anchor-policy.md`.

## Valid FDV

A valid FDV is:

- a number.
- finite.
- greater than `0`.

Invalid FDV values include:

- `null`
- `undefined`
- `NaN`
- `Infinity`
- values less than or equal to `0`
- values that cannot be parsed as numbers

Invalid FDV values are excluded from:

- `peakFdv`
- `alertFdv`
- `latestFdv`
- `firstObservedFdv`
- `peakMultipleFromAlert`
- `drawdownFromPeak`

## Alert FDV

`alertFdv` is the FDV closest to `alertedAt`.

Resolve it in this priority order:

1. Latest `Metric` FDV observed at or before `alertedAt` within 5 minutes.
2. First `Metric` FDV observed after `alertedAt` within 5 minutes.
3. Otherwise `null`.

Candidate output fields:

- `alertFdv`
- `alertFdvSource`
- `alertFdvObservedAt`
- `alertFdvFreshnessSeconds`

Alert-before Metrics may be used for `alertFdv` only. They must not be included
in window `peakFdv`.

## Latest FDV

`latestFdv` is the newest valid FDV available at `evaluationAt`.

Select it from Metrics where:

```text
observedAt <= evaluationAt
```

Candidate output fields:

- `latestFdv`
- `latestFdvSource`
- `latestFdvObservedAt`
- `latestFdvAgeSeconds`

`latestFdvAgeSeconds` is:

```text
evaluationAt - latestFdvObservedAt
```

Return `null` when `latestFdv` is unavailable.

## Window Boundary

Each window is anchored at `alertedAt`:

```text
windowStartAt = alertedAt
windowEndAt = alertedAt + windowMinutes
included metrics: alertedAt <= observedAt <= windowEndAt
```

The `peakFdv` window must not include pre-alert Metrics. Pre-alert Metrics may
only help establish `alertFdv`. `peakFdv` exists to measure how far the token
extended after detection or notification.

## Window Output Fields

Each outcome window should expose these read-only computed values:

- `windowMinutes`
- `windowStartAt`
- `windowEndAt`
- `isWindowComplete`
- `outcomeIsProvisional`
- `peakFdv`
- `peakObservedAt`
- `fdvSampleCount`
- `fdvFirstObservedAt`
- `fdvLastObservedAt`
- `fdvObservedSpanMinutes`
- `fdvSampleCoverageLabel`
- `timeToPeakMinutes`
- `peakMultipleFromAlert`
- `drawdownFromPeak`
- `outcomeLabel`

## Window Completion

`isWindowComplete` is a read-only computed value per window:

```text
isWindowComplete = evaluationAt >= windowEndAt
```

When `evaluationAt < windowEndAt`, `isWindowComplete=false`.

Example:

```text
alertedAt = 10:00
evaluationAt = 13:00
```

Then:

| Window | Completion |
| --- | --- |
| 30m | complete |
| 60m | complete |
| 120m | complete |
| 180m | complete |
| 360m | incomplete |
| 24h | incomplete |

## Provisional Outcome

`outcomeIsProvisional` is:

```text
outcomeIsProvisional = !isWindowComplete
```

When `isWindowComplete=false`, the window's `peakFdv`,
`peakMultipleFromAlert`, and `outcomeLabel` are provisional. They describe only
the Metrics observed up to the current `evaluationAt`; they are not final
window outcomes.

Incomplete windows may still compute `peakFdv` from observed Metrics so far.
Their `outcomeLabel` must be treated as provisional, and thinly sampled windows
should not be overtrusted.

## Time To Peak

`timeToPeakMinutes` is the number of minutes from `alertedAt` to the
`observedAt` timestamp where the window's `peakFdv` was reached.

Rules:

- Compute it separately per window.
- Return `null` when `alertedAt`, `peakFdv`, or `peakObservedAt` is missing.
- If the same `peakFdv` appears more than once in a window, use the earliest
  `observedAt` as `peakObservedAt`.

## Peak Multiple From Alert

`peakMultipleFromAlert` is:

```text
peakFdv / alertFdv
```

Return a number only when:

- `alertFdv` exists.
- `alertFdv > 0`.
- `peakFdv` exists.

Otherwise return `null`.

## Drawdown From Peak

`drawdownFromPeak` describes how far FDV has fallen from each window's peak to
the token's latest valid FDV at `evaluationAt`.

Compute it per window:

```text
drawdownFromPeak = max(0, (peakFdv - latestFdv) / peakFdv)
```

Use the token-level `latestFdv` selected at `evaluationAt`, not a
window-specific latest value.

Return a number only when:

- `peakFdv` exists.
- `peakFdv > 0`.
- `latestFdv` exists.

Otherwise return `null`.

## Outcome Label

`outcomeLabel` is a read-only computed label per window. Do not store it in the
DB yet.

Initial labels:

- `no_data`
- `flat`
- `small_win`
- `hit`
- `big_hit`

Classification:

| Label | Condition |
| --- | --- |
| `no_data` | `alertFdv` is `null`, or `fdvSampleCount` is `0`, or `peakFdv` is `null` |
| `flat` | `peakMultipleFromAlert < 1.5` |
| `small_win` | `1.5 <= peakMultipleFromAlert < 3` |
| `hit` | `3 <= peakMultipleFromAlert < 10` |
| `big_hit` | `peakMultipleFromAlert >= 10` |

Thinly sampled windows should not be overtrusted. The label describes observed
Metric history, not the true market high.

When `isWindowComplete=false`, `outcomeLabel` is provisional.

## Future Output Shape

This is a future `metrics:window-report` computed-output sketch only. This task
does not implement it.

```json
{
  "reportGeneratedAt": "...",
  "evaluationAt": "...",
  "alertedAt": "...",
  "alertFdv": 10000,
  "latestFdv": 40000,
  "latestFdvAgeSeconds": 120,
  "windows": {
    "30m": {
      "windowStartAt": "...",
      "windowEndAt": "...",
      "isWindowComplete": true,
      "outcomeIsProvisional": false,
      "peakFdv": 15000,
      "peakObservedAt": "...",
      "fdvSampleCount": 3,
      "peakMultipleFromAlert": 1.5,
      "timeToPeakMinutes": 18,
      "drawdownFromPeak": 0,
      "outcomeLabel": "small_win"
    },
    "24h": {
      "windowStartAt": "...",
      "windowEndAt": "...",
      "isWindowComplete": false,
      "outcomeIsProvisional": true,
      "peakFdv": 40000,
      "peakObservedAt": "...",
      "fdvSampleCount": 8,
      "peakMultipleFromAlert": 4,
      "timeToPeakMinutes": 160,
      "drawdownFromPeak": 0,
      "outcomeLabel": "hit"
    }
  }
}
```

## Storage Policy

Do not automatically persist these outcome fields into DB columns yet. Treat
them first as read-only computed values in `metrics:window-report`.

After enough Metric history exists, revisit whether to introduce one of these
storage paths:

- `OutcomeSnapshot`
- `AlertOutcome`
- finalized `Metric` outcome values

Any storage decision requires a separate design and implementation task.
Until then, do not save computed outcomes into existing Metric result columns
such as `peakFdv24h`, `maxMultiple15m`, `timeToPeakMinutes`, `alertedAt`, or
`peakMultipleFromAlert`.

## Safety Notes

- This is not automatic trading.
- This is not a buy signal.
- This does not guarantee profit.
- Outcome values exist to validate notification and scoring behavior.
- `isWindowComplete=false` means `outcomeLabel` is provisional.
- A window with sparse Metric samples can miss pumps or dips between samples.
