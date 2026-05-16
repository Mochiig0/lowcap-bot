# Time Anchor Policy

## Purpose

This document fixes the MVP policy for timestamp meaning across Token, Metric,
Notification, and outcome reports.

The goal is to keep DB row lifecycle time, source detection time, market
observation time, notification event time, score / metadata lifecycle time, and
report evaluation time separate.

This policy exists to:

- keep `alertedAt` fallback stable.
- keep `metrics:window-report` window calculations anchored consistently.
- prevent Token lifecycle, Metric observation, Notification lifecycle, and
  report evaluation timestamps from being mixed.
- give reports and planners a shared reading of timestamp fields.

Important:

- timestamps do not all mean the same thing.
- DB row lifecycle time is not market observation time.
- market observation time is not notification event time.
- report evaluation time is not alert time.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No timestamp implementation change.
- No `importedAt`, `createdAt`, `updatedAt`, `enrichedAt`, or `rescoredAt`
  implementation change.
- No `metrics:window-report` implementation change.
- No Notification implementation change.
- No import, rescore, detect, or `metric:snapshot:geckoterminal` execution.
- No existing row migration.
- No timestamp normalization.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, or `pnpm smoke`.

## `Token.createdAt`

Definition:

- the time the Token DB row was created.
- Prisma / DB lifecycle timestamp.

Use for:

- inspecting Token row creation time.
- the last `alertedAt` fallback candidate.
- conservative legacy fallback when no better entry / notification timestamp
  exists.

Do not use as:

- market launch time.
- source first-seen time.
- Telegram notification time.
- Metric observation time.

Policy:

- do not treat `createdAt` as token launch time.
- do not use `createdAt` as the first outcome window baseline.
- in `alertedAt` fallback, use it below Notification, source first-seen, and
  `importedAt`.

## `Token.updatedAt`

Definition:

- the time the Token DB row was last updated.
- Prisma / DB lifecycle timestamp.

Use for:

- debugging and inspection.
- seeing whether a row changed recently.

Do not use as:

- import time.
- metadata enrich completion time.
- rescore time.
- alert time.
- outcome evaluation baseline.

Policy:

- `updatedAt` can change for many unrelated reasons.
- do not use it as a `metrics:window-report` baseline.
- only use it as score / metadata / alert fallback when a separate policy
  explicitly says so; currently no such fallback is approved.

## `Token.importedAt`

Definition:

- the time lowcap-bot imported or mint-only imported the Token candidate.
- the time the Token entered the research OS.

Use for:

- mint-driven Token accumulation history.
- operational checks of import / mint-only import paths.
- `alertedAt` fallback when no suitable Notification or first-seen timestamp
  exists.

Do not use as:

- market launch time.
- guaranteed source first-seen time.
- Metric observation time.
- Notification send time.

Policy:

- `importedAt` is lowcap-bot internal intake time.
- `importedAt` and `createdAt` may be close, but they are separate concepts.
- in `alertedAt` fallback, use `importedAt` before `createdAt`.

## `Token.enrichedAt`

Definition:

- the time token identity metadata moved forward through enrichment.
- metadata lifecycle timestamp tied to `metadataStatus` policy.

Use for:

- checking whether metadata enrichment has happened.
- planner / report context for metadata completion.

Do not use as:

- source-only update time.
- rescore time.
- alert time.
- Metric observation time.
- outcome evaluation time.

Policy:

- prefer updating `enrichedAt` only when metadata completeness progresses.
- source label / provenance-only changes should not refresh `enrichedAt`.
- keep this aligned with `docs/design/metadata-status-policy.md`.

## `Token.rescoredAt`

Definition:

- the time scoring / rescore was executed.
- the time `Token.scoreTotal`, `Token.scoreRank`, and `Token.scoreBreakdown`
  were recomputed as latest score state.

Use for:

- checking when latest score was computed.
- verifying rescore after dictionary, trend, or scoring-policy updates.

Do not use as:

- initial score time.
- notification time.
- metadata enrichment time.
- outcome evaluation time.

Policy:

- `scoreBreakdown` is latest score explanation.
- `rescoredAt` is latest score update time.
- strict notification-time score history requires a future `ScoreSnapshot` /
  `scoreHistory` or Notification payload policy.

## `Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`

Definition:

- the time a source first reported / detected the Token candidate.
- origin-source detection timestamp candidate.

Use for:

- `alertedAt` fallback.
- origin analysis.
- measuring how early the bot candidate entered relative to source detection.
- source-first analysis when `firstSeenSourceSnapshot` exists.

Do not use as:

- DB row creation time.
- Notification send time.
- Metric observation time.
- guaranteed market launch time.

Policy:

- prefer this over `importedAt` / `createdAt` for source-origin fallback when
  it exists and parses.
- legacy / manual rows may not have it.
- if absent or invalid, continue to `importedAt` / `createdAt` fallback.

## `Metric.observedAt`

Definition:

- the time lowcap-bot observed and saved a Metric snapshot.
- Bot-side observation timestamp for Metric history.

Use for:

- `metrics:window-report` Metric extraction.
- `peakFdv`, `latestFdv`, `firstObservedFdv`, and sample coverage
  calculations.
- Metric time-series ordering.

Do not use as:

- Token import time.
- Notification time.
- market launch time.
- provider pool-created / provider-updated time unless explicitly stored
  separately.

Policy:

- window calculations use `Metric.observedAt`.
- provider timestamps, if needed, belong in sanitized `Metric.rawJson` or
  source-specific context with clear names.

## `Notification.sentAt`

Definition:

- the time a live Telegram send was marked successful.

Use for:

- top-priority `alertedAt` candidate.
- live alert outcome baseline.
- measuring what happened after a real notification was sent.

Do not use as:

- capture-only timestamp.
- Metric observation time.
- Token import time.

Policy:

- prefer `sentAt` when `Notification.status=sent` and `sentAt` exists.
- if multiple sent Notification rows exist, use the earliest valid `sentAt`.
- failed / unknown Notification rows should be treated conservatively.

## `Notification.capturedAt`

Definition:

- the time a notification candidate was recorded in capture-only /
  dry-run-equivalent mode.

Use for:

- `alertedAt` when no valid `sentAt` exists.
- capture-only outcome baseline.
- evaluating notification candidates before or without live Telegram send.

Do not use as:

- live Telegram send success time.
- Metric observation time.
- Token import time.

Policy:

- use `capturedAt` for capture-only / dry-run-equivalent alert outcome.
- live send success prefers `sentAt`.

## `alertedAt`

Definition:

- the timestamp when score/risk evaluation completed and the token was treated
  as notification-worthy.
- the outcome baseline for `metrics:window-report`.

Current `metrics:window-report` resolution order:

1. `--entryAt <ISO>` CLI override, recorded as `cli_entryAt`.
2. `Notification.sentAt`.
3. `Notification.capturedAt`.
4. `Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`.
5. `Token.importedAt`.
6. `Token.createdAt`.

Use for:

- `windowStartAt`.
- `alertFdv` lookup.
- denominator context for `peakMultipleFromAlert`.
- start time for `timeToPeakMinutes`.

Policy:

- `alertedAt` is computed read-only for outcome reports in the MVP.
- do not write `alertedAt` directly to Metric rows as part of live snapshot.
- `Metric.alertedAt` remains a computed outcome field under current result
  field policy.
- use Token fallbacks only when suitable Notification timestamps are absent.

## `reportGeneratedAt` And `evaluationAt`

`reportGeneratedAt`:

- the time `metrics:window-report` runs.

`evaluationAt`:

- in the MVP, equal to `reportGeneratedAt`.

Use for:

- selecting `latestFdv`.
- computing `latestFdvAgeSeconds`.
- deciding `isWindowComplete`.
- deciding `outcomeIsProvisional`.
- computing `drawdownFromPeak`.

Do not use as:

- Token import time.
- Notification time.
- Metric observation time.
- `alertedAt`.

Policy:

- current MVP uses `evaluationAt = reportGeneratedAt`.
- future CLI may add `--evaluationAt <ISO>` for historical evaluation.
- do not confuse `evaluationAt` with `alertedAt`.

## Purpose-To-Anchor Summary

| Purpose | Preferred anchor | Fallback |
| --- | --- | --- |
| Token DB lifecycle | `createdAt` / `updatedAt` | none |
| Token import lifecycle | `importedAt` | `createdAt` |
| Metadata enrichment | `enrichedAt` | `metadataStatus` for state, not timestamp |
| Score update | `rescoredAt` | `updatedAt` only for debug |
| Metric observation | `Metric.observedAt` | none |
| Live alert baseline | `Notification.sentAt` | `Notification.capturedAt` |
| Capture alert baseline | `Notification.capturedAt` | first-seen / `importedAt` / `createdAt` |
| Outcome report evaluation | `evaluationAt` | `reportGeneratedAt` |
| Origin source detection | `firstSeenSourceSnapshot.detectedAt` | `importedAt` / `createdAt` |

## Unknown Or Missing Timestamps

If a timestamp is missing:

- keep it `null`.
- fallback only when this policy defines a fallback.
- do not fill it with the current time by inference.
- reports may display `null` / unavailable.
- planners and guards should be conservative.

If a timestamp is invalid:

- treat parse failures as unavailable for computed logic.
- surface raw / unavailable state when useful.
- do not immediately mutate DB state.
- consider normalization / migration only in a separate approved task.

Suspicious future dates should be surfaced conservatively and not silently used
as strong evidence.

## Common Confusions To Avoid

- Do not use `createdAt` as market launch time.
- Do not use `updatedAt` as outcome baseline.
- Do not treat `importedAt` as guaranteed source first-seen time.
- Do not use `enrichedAt` as rescore time.
- Do not use `rescoredAt` as notification time.
- Do not treat `Metric.observedAt` as provider timestamp.
- Do not treat `Notification.capturedAt` as live send time.
- Do not confuse `evaluationAt` with `alertedAt`.

## Current Task Boundary

This policy records timestamp meaning only. It does not change code, schema,
migrations, timestamp calculation logic, `metrics:window-report`,
Notification implementation, import / rescore / detect behavior, existing
rows, or timestamp normalization.

## Next Docs-Only Candidates

- `metric:show` rawJson inspect policy.
- HolderSnapshot real source capture policy.
- `ScoreSnapshot` / `scoreHistory` future policy.
- `OutcomeSnapshot` / `AlertOutcome` future persistence policy.
