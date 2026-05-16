# Compare Report Legacy Outcome Policy

## Purpose

This document fixes how `tokens:compare-report` `outcomeBucket` should be read
in the MVP.

`tokens:compare-report outcomeBucket` is a legacy / provisional /
backward-compatible bucket based on older Metric result fields. It is not the
canonical outcome evaluation path. Use `metrics:window-report` window-level
`outcomeLabel` for current outcome review.

tokens:compare-report の outcomeBucket は旧Metric結果系カラムに基づく
legacy / provisional bucket であり、現在の正式な outcome 評価ではありません。
現在の outcome 評価では metrics:window-report の window別 outcomeLabel を優先します。

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No `tokens:compare-report` implementation change.
- No `metrics:window-report` implementation change.
- No `metric:snapshot:geckoterminal` implementation change.
- No `outcomeBucket` implementation change.
- No `outcomeBucket` rename.
- No `maxMultiple15m` calculation change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, detect command, or `pnpm smoke`.

## Canonical Outcome Path

The current canonical outcome review path is:

- `metrics:window-report`
- Metric history
- valid FDV maximum inside each window
- `alertFdv`
- `peakMultipleFromAlert`
- `timeToPeakMinutes`
- window-level `outcomeLabel`
- read-only computed output

Canonical outcome review is FDV-window based. The 24h outcome is not one point
observed exactly 24 hours later; it is the maximum valid FDV observed inside
the 24h window.

`outcomeLabel` is computed per window. Outcome values are not automatically
saved to DB in the MVP.

This is notification / scoring validation context only. It is not automatic
trading, not a buy signal, and not profit guidance.

## Legacy Compare Outcome Bucket

`tokens:compare-report outcomeBucket` is a legacy / provisional /
backward-compatible bucket.

Reasons:

- it is based on the latest Metric row's `maxMultiple15m`.
- `maxMultiple15m` is an older Metric result field.
- the denominator for `maxMultiple15m` is ambiguous.
- it does not follow the current FDV window / `alertFdv` / `outcomeLabel`
  design.
- using it as the official outcome would mix old and new evaluation axes.

Read it as a compatibility display for old/manual result fields, not as a
formal hit / big-hit judgement.

## `maxMultiple15m`

`maxMultiple15m` is not a primary source for MVP canonical outcome review.

Reasons:

- the denominator is not explicit.
- possible baselines include `launchPrice`, `alertFdv`, `firstObservedFdv`,
  imported-at FDV, first Metric snapshot FDV, or another anchor.
- `docs/design/metric-result-field-policy.md` treats generic max multiple
  fields as ambiguous legacy / secondary candidates.
- Metric result fields are not live snapshot write targets in the MVP.
- legacy manual inputs or older paths may still have values.

Policy:

- reports may read `maxMultiple15m` as a legacy / manual result field.
- do not treat it as a replacement for window-level `outcomeLabel`.
- new outcome design should use explicit-baseline names such as
  `peakMultipleFromAlert` or `peakMultipleFromFirstObserved`.
- as long as `tokens:compare-report outcomeBucket` is based on
  `maxMultiple15m`, it remains legacy / provisional.

## How To Read `tokens:compare-report`

`tokens:compare-report` remains useful for cross-token comparison and inventory
review.

Use it for:

- `scoreRank`
- `source`
- `metadataStatus`
- latest Metric presence
- review flags
- broad list / filter workflows

Read `outcomeBucket` only as a legacy reference value.

Do not use `outcomeBucket` as:

- a formal hit / big-hit judgement.
- the canonical outcome source of truth.
- the primary basis for score tuning.
- automatic trading guidance.
- a buy signal.

When `outcomeBucket` and `metrics:window-report` window-level `outcomeLabel`
disagree, prefer `outcomeLabel`.

## Relationship To `metrics:report`

`metrics:report` may expose old Metric result fields such as `peakFdv24h`,
`maxMultiple15m`, and `timeToPeakMinutes`.

Policy:

- old outcome-like fields in `metrics:report` and `tokens:compare-report` are
  legacy / reporting compatibility.
- canonical outcome review belongs to `metrics:window-report`.
- reports that read old result columns are future candidates to align with the
  new outcome design.

This policy does not change `metrics:report` or `tokens:compare-report`.

## Current Source Of Truth

Canonical:

- `metrics:window-report`
- Metric history
- window `max(fdv)`
- `alertFdv`
- `peakMultipleFromAlert`
- window-level `outcomeLabel`

Legacy / provisional:

- `tokens:compare-report outcomeBucket`
- `metrics:report` display of old Metric result fields.
- classifications based on latest Metric `maxMultiple15m`.

Do not use:

- `outcomeBucket` as the official hit judgement.
- `maxMultiple15m` as the primary metric for the new outcome design.
- `tokens:compare-report outcomeBucket` as the main basis for score
  improvement.

## Relationship To Metric Result Field Policy

`docs/design/metric-result-field-policy.md` remains the storage and field
boundary.

This policy follows it:

- Metric result fields are not live snapshot write targets in the MVP.
- `maxMultiple15m` and `maxMultiple1h` are ambiguous because their denominator
  is unclear.
- `peakFdv24h` and related values should be computed by
  `metrics:window-report` from Metric history, not treated as provider fields.
- `tokens:compare-report outcomeBucket` is isolated as a legacy display that
  reads old result fields.
- new outcome review should move toward window-level `outcomeLabel`.

## Future Migration Path

Future work may align `tokens:compare-report` with the current outcome design.

Options:

- add window-level `outcomeLabel` to `tokens:compare-report`.
- split output into `currentOutcome` and `legacyOutcomeBucket`.
- display `outcomeBucket` as deprecated.
- add a window selector for 30m / 60m / 24h `outcomeLabel`.
- create a shared outcome computation utility for `metrics:window-report` and
  compare reports.

This task does not implement any of those options. It does not rename
`outcomeBucket` and does not add a deprecation warning.

## Safety Notes

- This is docs-only.
- This is not automatic trading.
- This is not a buy signal.
- This does not guarantee profit.
- `outcomeBucket` is legacy / provisional.
- canonical outcome is `metrics:window-report` window-level `outcomeLabel`.

## Next Docs-Only Candidates

- `metric:show` rawJson inspect policy.
