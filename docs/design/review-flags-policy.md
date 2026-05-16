# Review Flags Policy

## Purpose

This document fixes the MVP shape policy for `Token.reviewFlagsJson`.

`Token.reviewFlagsJson` is lightweight review-helper JSON for a Token. It
records small human-readable review flags and provenance that help reports,
observation commands, and planners explain what is known or still unconfirmed.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No `reviewFlagsJson` implementation change.
- No existing row migration.
- No automatic normalization.
- No review workflow implementation.
- No `metrics:window-report` implementation change.
- No `metric:snapshot:geckoterminal` implementation change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, detect command, or `pnpm smoke`.

## Responsibility

`Token.reviewFlagsJson` represents:

- lightweight flags from a human review or review-like process.
- cautions, missing context, or unconfirmed points.
- review provenance such as source, reviewer type, and reviewed timestamp.
- auxiliary context for humans reading reports or observation output.

`Token.reviewFlagsJson` does not represent:

- Metric outcome.
- `outcomeLabel`.
- `scoreBreakdown`.
- the primary source of hard reject decisions.
- HolderSnapshot body.
- Notification lifecycle state.
- Telegram send result.
- provider raw body.
- automatic trading signal.
- buy signal.

Important:

- `reviewFlagsJson` is lightweight review support.
- It is separate from `Token.metadataStatus`.
- It is separate from `Token.scoreRank`.
- It is separate from Metric outcome.
- It is separate from HolderSnapshot and Notification state.

## Current Compatibility Shape

Current implementation and docs show `reviewFlagsJson` being read through these
community / metadata compatibility keys:

```json
{
  "hasWebsite": true,
  "hasX": false,
  "hasTelegram": false,
  "metaplexHit": true,
  "descriptionPresent": true,
  "linkCount": 1
}
```

The manual `community:review` path may also store small provenance fields:

```json
{
  "hasWebsite": false,
  "hasX": false,
  "hasTelegram": false,
  "metaplexHit": true,
  "descriptionPresent": true,
  "linkCount": 0,
  "source": "manual_community_review",
  "reviewedAt": "2026-05-16T10:00:00.000Z",
  "operatorNote": "optional short note"
}
```

These compatibility keys are descriptive review context. They are not score
weights, outcome labels, notification status, or holder analysis.

## Recommended Shape

Future writes should move toward a small versioned shape:

```json
{
  "schemaVersion": 1,
  "source": "manual_community_review",
  "reviewerType": "manual",
  "flags": ["missing_links"],
  "note": "X link not confirmed",
  "reviewedAt": "2026-05-16T10:00:00.000Z"
}
```

During transition, current compatibility keys may coexist with the recommended
shape so existing reports can continue to read them:

```json
{
  "schemaVersion": 1,
  "source": "manual_community_review",
  "reviewerType": "manual",
  "flags": ["missing_links"],
  "note": "X link not confirmed",
  "reviewedAt": "2026-05-16T10:00:00.000Z",
  "hasWebsite": false,
  "hasX": false,
  "hasTelegram": false,
  "metaplexHit": true,
  "descriptionPresent": true,
  "linkCount": 0
}
```

This policy does not change current implementation and does not backfill
existing rows.

## `schemaVersion`

`schemaVersion` is the JSON shape version.

Policy:

- use `schemaVersion: 1` as the current recommended shape version.
- rows without `schemaVersion` are legacy / unknown shape.
- unknown `schemaVersion` values should be handled conservatively.
- new future writes should include `schemaVersion`, but this task does not
  change code or backfill existing rows.

## `source`

`source` is the provenance label for the review flag. It is not
`Token.source`, `Metric.source`, or Notification `trigger`.

Known persisted values observed in current code / docs:

- `manual_community_review`

Observed write paths:

- `community:review` can write manual community review flags with
  `source=manual_community_review`, `reviewedAt`, and `operatorNote`.
- GeckoTerminal enrich / rescore context paths can write the compatibility
  booleans and `linkCount` without a dedicated persisted `source` today.

Future source candidates such as `enrich_rescore`, `community_review`,
`manual_review`, or `system_review` should not be treated as known persisted
values until implementation and docs add them together.

## `reviewerType`

`reviewerType` is an optional lightweight classification of where the review
came from.

No persisted `reviewerType` values were confirmed in current implementation.
Recommended future values are:

- `manual`
- `system`
- `community`
- `unknown`

Rows without `reviewerType` should be treated as unknown-equivalent for that
dimension. `reviewerType` is optional and does not replace `source`.

## `flags`

`flags` is a list of lightweight review identifiers.

Policy:

- use `string[]`.
- prefer lowercase snake_case.
- keep flags human-readable and small.
- do not store large payloads, provider raw responses, outcome labels, or score
  ranks in `flags`.

Recommended future flag examples:

- `missing_links`
- `suspicious_metadata`
- `needs_manual_review`
- `source_unconfirmed`

Unknown flags should not cause immediate failure. Reports may display unknown
flags as raw flag strings. Planners and guards should prefer known keys and
treat unknown flags conservatively. A new flag becomes formally supported only
when docs are updated.

Current reports may still read the compatibility booleans instead of the
`flags` array until a separate implementation task migrates report behavior.

## `note`

`note` is an optional short human-facing explanation.

Policy:

- keep it short.
- do not store provider raw bodies.
- do not store secrets, `.env` values, Telegram tokens, chat IDs, private URLs,
  or large text dumps.
- do not use `note` as the primary source for automated decisions.

The current manual review path uses `operatorNote`. Future normalization may
map that concept to `note`, but this task does not change implementation.

## `reviewedAt`

`reviewedAt` is the time the review flag JSON was created or updated.

Policy:

- prefer an ISO timestamp.
- rows without `reviewedAt` are legacy / not recorded for review time.
- `reviewedAt` is separate from `Token.updatedAt`.
- `reviewedAt` is separate from Notification `sentAt` / `capturedAt`.
- `reviewedAt` is separate from `Metric.observedAt`.
- `reviewedAt` is separate from outcome `evaluationAt`.

## Unknown Keys

`reviewFlagsJson` is `Json?`, so unknown keys may exist.

Policy:

- unknown keys should not cause immediate failure.
- reports may show a raw summary when useful.
- planners and guards should depend on known keys first.
- do not make unknown keys part of official behavior without a docs update.
- do not store keys that look like secrets, raw provider bodies, huge payloads,
  retry state, queue state, or worker state.

## Forbidden Content

Do not store these in `Token.reviewFlagsJson`:

- Metric outcome result.
- `peakFdv`.
- `peakMultipleFromAlert`.
- `outcomeLabel`.
- `timeToPeakMinutes`.
- `scoreBreakdown` body.
- HolderSnapshot body.
- Notification lifecycle state.
- Telegram send result.
- provider complete raw body.
- secrets or environment-derived values.
- retry, queue, worker, scheduler, or systemd state.
- huge payloads.

Storage destinations:

- Metric results: `metrics:window-report` or a future `OutcomeSnapshot` /
  `AlertOutcome`.
- scoring breakdown: `scoreBreakdown`.
- Holder information: `HolderSnapshot`.
- Notification state: `Notification`.
- provider market snapshot: `Metric.rawJson`.
- lightweight token context: `Token.entrySnapshot.contextCapture`.

## Relationship To Metadata And Scoring

`Token.metadataStatus` is metadata completeness state. It is not
`reviewFlagsJson`.

`scoreBreakdown` is scoring explanation. It is not `reviewFlagsJson`.

`reviewFlagsJson` records review cautions and helper flags. It does not replace
`scoreRank`, `scoreBreakdown`, or `metadataStatus`.

Examples:

- `metadataStatus=partial` and `reviewFlagsJson.flags` contains
  `missing_links` can coexist.
- `scoreRank=S` and `reviewFlagsJson.flags` contains `needs_manual_review` can
  coexist.

This policy does not make `reviewFlagsJson` automatically change score,
metadata status, hard reject state, or notification behavior.

## Write Path Relationship

`community:review`:

- can write human / community review-derived lightweight flags.
- should carry source, reviewer type, flags, note, and reviewed timestamp in the
  recommended future shape.
- currently writes compatibility community / metadata flags and may include
  `source=manual_community_review`, `reviewedAt`, and `operatorNote`.

GeckoTerminal enrich / rescore context paths:

- can write lightweight context-derived review flags.
- keep them separate from `scoreBreakdown`.
- keep them separate from `metadataStatus`.
- currently write compatibility community / metadata fields, not the full
  recommended versioned shape.

This policy records responsibility only. It does not change either write path.

## Legacy And Missing Values

`reviewFlagsJson = null` means no review flags are recorded. It does not prove
the token was never reviewed.

Missing `schemaVersion` means legacy / unknown shape.

An empty `flags` array means no known flags in the recommended shape. If
`source` or `reviewedAt` is present, it may still indicate review was recorded.

Current compatibility booleans and `linkCount` without `schemaVersion` should
remain readable as legacy compatibility shape until a separate migration or
report update is approved.

## Current Task Boundary

This policy records `reviewFlagsJson` shape and boundaries only. It does not
change code, schema, migrations, existing rows, community review behavior,
enrich-rescore behavior, reports, planners, enumization, or review workflow.

## Next Docs-Only Candidates

- Token time anchor policy.
- `Dev.wallet` identity confidence policy.
- `metric:show` rawJson inspect policy.
- HolderSnapshot real source capture policy.
