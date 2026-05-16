# Metric Result Field Policy

## Purpose

This document fixes how Metric result-evaluation fields are treated in the
MVP. It complements `docs/design/metric-outcome-evaluation.md`.

Metric result fields such as `peakFdv24h`, `maxMultiple15m`,
`timeToPeakMinutes`, `alertedAt`, and `peakMultipleFromAlert` are treated as
computed outcome fields, not live snapshot write targets in the MVP.

Metric の結果系フィールドは、MVPでは live snapshot 時に自動更新する対象ではなく、
Metric履歴から metrics:window-report が後から算出する computed outcome field として扱う。

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No Telegram send.
- No external fetch.
- No `metrics:window-report` implementation change.
- No `metric:snapshot:geckoterminal` implementation change.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, detect command, or `pnpm smoke`.

## Metric Row Responsibility

In the MVP, a `Metric` row is one observed snapshot in a time series.

Its basic responsibilities are:

- record that a token was observed at a specific time.
- preserve the provider snapshot at `observedAt`.
- keep source-specific observation history.
- provide input material for later read-only outcome recalculation.

A `Metric` row is not a continuously updated aggregate table for peak or
outcome results. The MVP first stores observation history, then
`metrics:window-report` computes outcomes later as read-only report values.

Primary live snapshot fields:

- `observedAt`
- `source`
- `volume24h`
- `rawJson`

FDV, market cap, price, reserve, and pool values are not forced into mismatched
dedicated Metric columns. They are currently read by reports from the sanitized
provider snapshot in `rawJson`.

Treat `Metric` rows as append-only-ish observation snapshots. Do not use them
as a table that is repeatedly rewritten with final outcomes.

## Result Field Policy

The following Metric schema fields are result-evaluation fields or legacy /
secondary candidates. They are not automatic live snapshot write targets in the
MVP:

- `launchPrice`
- `peakPrice15m`
- `peakPrice1h`
- `maxMultiple15m`
- `maxMultiple1h`
- `peakFdv24h`
- `peakFdv7d`
- `volume7d`
- `timeToPeakMinutes`
- `alertedAt`
- `peakMultipleFromAlert`

Policy:

- Treat these as computed outcome fields unless a separate source contract says
  otherwise.
- Compute MVP outcomes in `metrics:window-report` as read-only values.
- Do not make `metric:snapshot:geckoterminal` fill these fields just because
  the columns exist.
- Persist outcome results only after an `OutcomeSnapshot`, `AlertOutcome`, or
  equivalent storage design is approved.
- Do not mix aggregate outcome results back into individual live snapshot rows.

## Peak FDV Fields

### `peakFdv24h`

`peakFdv24h` is not a one-point observation exactly 24 hours later. It is the
maximum valid FDV observed in Metric history inside the 24h window.

MVP policy:

- compute it as a `metrics:window-report` read-only result.
- do not write it directly to `Metric.peakFdv24h` during live snapshot capture.
- treat it as derived from bot-accumulated Metric history, not as a provider
  field.

### `peakFdv7d`

The 7d observation and calculation loop is not fixed yet.

MVP policy:

- treat it as unused or future computed outcome.
- if a 7d window is introduced, prefer the same window-max policy:
  `max(fdv)` inside the 7d window, not one single later sample.
- do not write it directly to `Metric.peakFdv7d` during live snapshot capture.

Persisting 24h or 7d peak FDV as final outcome can be reconsidered only when
outcome persistence is designed separately.

## Price Peak Fields

`peakPrice15m` and `peakPrice1h` are not primary MVP outcomes.

Reasons:

- FDV / market cap is easier to compare across lowcap memecoins.
- Price can be distorted by token supply, decimals, and display units.
- Current `metrics:window-report` design centers on FDV window maxima.
- `outcomeLabel` is based on FDV-derived `peakMultipleFromAlert`.

MVP policy:

- keep FDV as the primary outcome basis.
- treat price peak fields as legacy / secondary candidates.
- define price source and denominator before using them.
- do not update `peakPrice15m` or `peakPrice1h` during live snapshot capture.

## Max Multiple Fields

`maxMultiple15m` and `maxMultiple1h` are ambiguous without a denominator.

Possible denominators include:

- `launchPrice`
- alert-time price
- entry-time FDV
- `firstObservedFdv`
- first Metric snapshot `fdvUsd`
- imported-at FDV
- first-seen FDV

The field name alone does not say whether the multiple is launch-based,
alert-based, first-observed-based, or import-based. Saving ambiguous multiples
would make later analysis difficult to trust.

MVP policy:

- do not use generic `maxMultiple15m` or `maxMultiple1h` as primary outcomes.
- separate multiples by baseline.
- start with explicit `alertFdv` and `firstObservedFdv` definitions.
- compute needed multiples in read-only reports.
- do not update `maxMultiple15m` or `maxMultiple1h` during live snapshot
  capture.

Future explicit candidates:

- `peakMultipleFromFirstObserved`
- `peakMultipleFromAlert`
- `peakMultipleFromImport`
- `peakMultipleFromFirstSeen`
- `peakMultipleFromLaunch`

Priority:

- `peakMultipleFromAlert` is primary for notification quality validation.
- `peakMultipleFromFirstObserved` is a secondary signal for detection speed.

## Time To Peak

`timeToPeakMinutes` must state which peak it refers to.

MVP policy:

- base it on FDV peak, not price peak.
- compute it per window.
- define it as minutes from `alertedAt` to the `observedAt` where the window's
  `peakFdv` was observed.
- return `null` when `peakFdv`, `peakObservedAt`, or `alertedAt` is missing.
- do not save it to `Metric.timeToPeakMinutes` during live snapshot capture.

If the same `peakFdv` appears more than once in the same window, use the
earliest `observedAt` as `peakObservedAt`.

## Alert-Based Fields

`alertedAt` and `peakMultipleFromAlert` become meaningful only when connected
to Telegram notification and the `Notification` model.

MVP policy:

- do not write `Metric.alertedAt` during live snapshot capture.
- compute `alertedAt` from Notification / Token state in read-only reports.
- do not write `Metric.peakMultipleFromAlert` during live snapshot capture.
- compute `peakMultipleFromAlert` per window as `peakFdv / alertFdv`.

`alertedAt` priority:

1. `Notification.sentAt`
2. `Notification.capturedAt`
3. `Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`
4. `Token.importedAt`
5. `Token.createdAt`

Live Telegram sends should prefer `Notification.sentAt`. Capture-only or
dry-run notification records should prefer `Notification.capturedAt`.

## Volume Fields

### `volume24h`

`volume24h` may be saved when a provider exposes it. Its meaning is the
provider's h24 volume at the snapshot time, such as GeckoTerminal h24 volume.

It is not bot-aggregated volume inside the outcome window. For example,
provider `volume24h` observed at 10:00 is not "volume after notification for
the next 24 hours."

### `volume7d`

`volume7d` has no fixed MVP source or meaning.

Before using it, define whether it is:

- provider 7d volume, or
- bot-observed volume inside an outcome window.

Do not confuse provider volume fields with outcome-window volume. If needed
later, prefer clearer names such as `observedWindowVolume` or
`volumeDeltaFromAlert`.

## Raw JSON

`Metric.rawJson` is a sanitized provider snapshot used by read-only reports. It
is not a provider-complete raw response body.

Policy:

- reports may read FDV, market cap, volume, and price candidates from `rawJson`.
- do not store secrets, `.env` values, Telegram values, request URLs with
  secrets, or unnecessary huge payloads.
- keep raw provider bodies out of Metric output and docs.
- update report extraction logic and docs when provider shape changes.

FDV extraction fallback order:

1. `rawJson.token.fdvUsd`
2. `rawJson.token.fdv_usd`
3. `rawJson.topPool.fdvUsd`
4. `rawJson.topPool.fdv_usd`
5. `rawJson.fdvUsd`
6. `rawJson.fdv_usd`

`rawJson` exists to keep enough sanitized snapshot context for reports. It
must not become an unbounded provider payload bucket.

## Outcome Persistence Is Deferred

The MVP does not automatically persist outcome results to DB columns.

Use `metrics:window-report` read-only computed values first. Revisit
persistence only after enough data exists and thresholds / operating practice
are stable.

Deferred:

- saving to `Metric.peakFdv24h`.
- saving to `Metric.maxMultiple15m` or `Metric.maxMultiple1h`.
- saving to `Metric.alertedAt` or `Metric.peakMultipleFromAlert`.
- introducing `OutcomeSnapshot` or `AlertOutcome` persistence.

Reasons:

- outcome definitions may still change.
- read-only reports can re-evaluate old Metric history under updated policy.
- outcome is an aggregate across multiple Metrics, so a dedicated model is more
  natural than mixing results into one Metric snapshot row.

## HolderSnapshot Boundary

HolderSnapshot values are separate from Metric outcome policy and are not MVP
blockers for Metric outcome review.

Holder fields that remain future enhancement until real holder source capture
is approved:

- `topHolderPct`
- `top10HolderPct`
- `holderCount`
- `freshWalletCount`
- `bundlerSignal`
- `sameFundingOriginSignal`
- `lpWalletExcluded`
- `confidence`

MVP focus stays on Metric time-series accumulation and `metrics:window-report`.
Holder fresh-wallet, bundler, and funding-origin judgement remains a separate
capability.

## Token Entry Snapshot Boundary

The full `Token.entrySnapshot` namespace policy is fixed in
`docs/design/token-entry-snapshot-policy.md`.

Do not put too much into `Token.entrySnapshot`.

Acceptable `entrySnapshot` content:

- `firstSeenSourceSnapshot`
- `manualObservation`
- `contextCapture`

Avoid putting these in `entrySnapshot`:

- Metric results.
- Holder snapshot bodies.
- raw provider responses.
- Telegram send results.
- Notification lifecycle fields.
- retry, queue, worker, scheduler, or systemd state.

Responsibility split:

- Metric results belong to Metric history and outcome reports.
- Holder information belongs to `HolderSnapshot`.
- Telegram send results belong to `Notification`.
- lightweight provider context may live under `entrySnapshot.contextCapture`
  only when it is sanitized and bounded.
- `entrySnapshot` should remain a lightweight entry-time / manual /
  context-capture snapshot.

## Current Source Of Truth

Observation:

- `Metric` rows
- `observedAt`
- `source`
- sanitized `rawJson`
- provider `volume24h`

Notification:

- `Notification` rows
- `sentAt`
- `capturedAt`
- `status`
- `mode`
- `metricId`

Outcome evaluation:

- `metrics:window-report` read-only computed values
- window `max(fdv)`
- `alertFdv`
- `firstObservedFdv`
- `peakMultipleFromAlert`
- `timeToPeakMinutes`
- `outcomeLabel`

Persistence:

- outcome result DB persistence is deferred.
- redesign storage when `OutcomeSnapshot`, `AlertOutcome`, or another
  dedicated model is considered.

## Post Dry-Run Implementation Direction

After a 3H dry-run, implementation should start by extending
`metrics:window-report` read-only output, not by writing outcome values into
Metric columns.

Recommended implementation order:

1. `reportGeneratedAt`, `evaluationAt`, `isWindowComplete`,
   `outcomeIsProvisional`
2. `alertFdv`, `alertFdvObservedAt`, `alertFdvSource`,
   `alertFdvFreshnessSeconds`
3. `fdvSampleCoverage`
4. `firstObservedFdv`
5. `peakMultipleFromAlert`, `timeToPeakMinutes`, `outcomeLabel`

Keep deferred:

- saving to `Metric.peakFdv24h`.
- saving to `Metric.maxMultiple15m` or `Metric.maxMultiple1h`.
- saving to `Metric.alertedAt` or `Metric.peakMultipleFromAlert`.
- `OutcomeSnapshot` / `AlertOutcome` persistence.
- real-source HolderSnapshot judgement.
- extra labels such as `missed_pump` or `failed`.

## Safety Notes

- This is not automatic trading.
- This is not a buy signal.
- This does not guarantee profit.
- Metric result columns are not live snapshot write targets in the MVP.
- Store Metric rows as time-series observations, then classify outcomes later
  with read-only reports.
