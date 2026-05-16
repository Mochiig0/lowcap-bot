# Token Entry Snapshot Policy

## Purpose

This document fixes the allowed `Token.entrySnapshot` namespaces and boundary.

`Token.entrySnapshot` is a lightweight snapshot of the information available
when a token is registered, manually observed, or lightly complemented as a
candidate. It exists so later reports can inspect what made the token enter the
system without mixing in Metric, HolderSnapshot, or Notification bodies.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No existing `entrySnapshot` migration.
- No `contextCapture` structure change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.

## Responsibility

`Token.entrySnapshot` may record:

- first detection context.
- manual observation context.
- lightweight context captured during token completion.

It must not become a universal raw dump bucket. It must not store provider
complete raw responses, secrets, huge payloads, retry state, queue / worker
state, or outcome evaluation results.

## Allowed Namespaces

### `firstSeenSourceSnapshot`

Purpose: lightweight source snapshot from the first detection or mint-first
handoff.

Allowed examples:

- `detectedAt`
- `source`
- lightweight source identifiers such as `sourceTokenId`, `poolId`, `poolAddress`,
  `mint`, `baseTokenAddress`, or `quoteTokenAddress`
- `name` / `symbol` as seen by the source
- first-seen helper timestamps or labels

Do not store:

- provider complete raw responses.
- Metric results.
- Telegram send results.
- HolderSnapshot bodies.

### `manualObservation`

Purpose: human-entered observation context captured by manual review.

Allowed examples:

- manual note.
- manual source label.
- observation reason.
- narrative category, watch / skip thesis, and lightweight context.

Do not store:

- computed outcome results from Metric history.
- holder analysis bodies.
- notification lifecycle results.
- secrets or environment-derived values.

Manual `outcomeLabel` values in this namespace are operator review labels, not
the computed `metrics:window-report` `outcomeLabel`.

### `contextCapture`

Purpose: lightweight context gathered during token completion / context capture.

This namespace is already used by implementation and is allowed.

Allowed examples:

- `geckoterminalTokenSnapshot`
- `metaplexMetadataUri`
- lightweight token metadata summary.
- context source label.
- `capturedAt`.

`contextCapture` is not a provider complete raw body store. Treat
`geckoterminalTokenSnapshot` as a sanitized minimum context snapshot. A
Metaplex URI may be stored, but this namespace must not become an unlimited
metadata-body store.

## Forbidden Content

Do not store these in `Token.entrySnapshot`:

- Metric results.
- `peakFdv`, `outcomeLabel`, `peakMultiple`, or other computed outcome values.
- HolderSnapshot bodies.
- provider complete raw response bodies.
- Telegram send results.
- Notification `status`, `sentAt`, or `capturedAt`.
- secrets, `.env` values, API keys, Telegram tokens, or chat IDs.
- huge payloads.
- retry, queue, worker, scheduler, or systemd state.

Storage destinations:

- Metric results: `Metric`, `metrics:window-report`, or a future
  `OutcomeSnapshot` / `AlertOutcome`.
- Holder information: `HolderSnapshot`.
- Telegram and notification lifecycle: `Notification`.
- Provider market snapshots: `Metric.rawJson` or sanitized lightweight
  `entrySnapshot.contextCapture`.
- Retry state: Notification retry fields.

## Metric Outcome Boundary

Metric result fields do not belong in `Token.entrySnapshot`.

Outcome evaluation is computed read-only by `metrics:window-report` from Metric
history. `Token.entrySnapshot` is not an outcome storage location and must stay
limited to entry-time / manual / lightweight context namespaces.

## Source Boundary

The full source-term policy is fixed in
`docs/design/token-source-policy.md`.

Inside `Token.entrySnapshot`, `firstSeenSourceSnapshot.source` is the preferred
origin-source field, `manualObservation.source` is the manual / legacy
observation source, and `contextCapture.*.source` is context-capture
provenance. None of those are the same thing as the token-level current
`Token.source`, `Metric.source`, `Notification.trigger`, or
`HolderSnapshot.source`.

## Metadata Status Boundary

The full `Token.metadataStatus` lifecycle policy is fixed in
`docs/design/metadata-status-policy.md`.

`Token.entrySnapshot` may provide lightweight evidence for metadata
completeness, especially through `firstSeenSourceSnapshot`,
`manualObservation`, or sanitized `contextCapture`. It is not itself the
metadata status and must not store lifecycle state as a substitute for
`Token.metadataStatus`.

## Review Flags Boundary

The full `Token.reviewFlagsJson` shape policy is fixed in
`docs/design/review-flags-policy.md`.

Review flags are Token-level lightweight review helper JSON. They do not belong
inside `Token.entrySnapshot`, and `entrySnapshot` must not store review flag
state as a substitute for `Token.reviewFlagsJson`.

## Score Breakdown Boundary

The full `Token.scoreBreakdown` shape policy is fixed in
`docs/design/score-breakdown-policy.md`.

`Token.scoreBreakdown` is the latest score explanation JSON on the Token row.
`entrySnapshot.scoreBreakdown`, when present, is entry context for comparison,
not the canonical latest score explanation and not score history.

## Current Task Boundary

This policy records the allowed namespaces and forbidden content only. It does
not migrate existing rows, change code, change schema, or change the current
`contextCapture` structure.

## Next Docs-Only Candidates

- Token time anchor policy.
