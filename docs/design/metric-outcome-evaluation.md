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

## Peak FDV Window Policy

Peak FDV is the maximum FDV observed in `Metric` history inside each evaluation
window:

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

## Alerted At

`alertedAt` is the time when score/risk evaluation has completed and the token
has been confirmed as notification-worthy.

Resolve `alertedAt` in this priority order:

1. `Notification.sentAt`
2. `Notification.capturedAt`
3. `Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`
4. `Token.importedAt`
5. `Token.createdAt`

The first available timestamp is the evaluation anchor.

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

## Window Output Fields

Each outcome window should expose these read-only computed values:

- `peakFdv`
- `peakObservedAt`
- `fdvSampleCount`
- `timeToPeakMinutes`
- `peakMultipleFromAlert`
- `outcomeLabel`

## Time To Peak

`timeToPeakMinutes` is the number of minutes from `alertedAt` to the
`observedAt` timestamp where the window's `peakFdv` was reached.

Rules:

- Compute it separately per window.
- Return `null` when `alertedAt`, `peakFdv`, or `peakObservedAt` is missing.

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

## Storage Policy

Do not automatically persist these outcome fields into DB columns yet. Treat
them first as read-only computed values in `metrics:window-report`.

After enough Metric history exists, revisit whether to introduce one of these
storage paths:

- `OutcomeSnapshot`
- `AlertOutcome`
- finalized `Metric` outcome values

Any storage decision requires a separate design and implementation task.

## Safety Notes

- This is not automatic trading.
- This is not a buy signal.
- This does not guarantee profit.
- These labels exist to validate notification and scoring behavior.
- A window with sparse Metric samples can miss pumps or dips between samples.
