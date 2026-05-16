# Score Breakdown Policy

## Purpose

This document fixes the MVP versioning and shape policy for
`Token.scoreBreakdown`.

`Token.scoreBreakdown` is the latest score explanation JSON for a Token. It
helps a human understand why the current `Token.scoreTotal` and
`Token.scoreRank` have their current values.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No scoring logic change.
- No `scoreBreakdown` implementation change.
- No rescore execution.
- No import execution.
- No detect command execution.
- No `metric:snapshot:geckoterminal` execution.
- No `metrics:window-report` implementation change.
- No `tokens:compare-report` implementation change.
- No existing row migration.
- No `ScoreSnapshot` / `scoreHistory` model.
- No rank-threshold change.
- No dictionary change.
- No trend data change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, or `pnpm smoke`.

## Token Score Field Responsibilities

`Token.scoreTotal`:

- current latest score total.
- may change after import / enrich / rescore flows recompute scoring.

`Token.scoreRank`:

- current latest rank.
- current implementation confirms `S`, `A`, `B`, and `C`.
- unknown values should be treated conservatively by reports / planners.

`Token.scoreBreakdown`:

- current latest score explanation JSON.
- explains why the current `scoreTotal` / `scoreRank` were produced.
- is human review context, not a durable score history.

Important:

- `scoreBreakdown` is not `outcomeLabel`.
- `scoreBreakdown` is not `reviewFlagsJson`.
- `scoreBreakdown` is not Notification lifecycle state.
- `scoreBreakdown` is not a Metric result.
- `scoreBreakdown` is not a buy signal.
- `scoreBreakdown` does not guarantee profit.

## Latest Score Versus Initial Score

In the MVP, `Token.scoreTotal`, `Token.scoreRank`, and
`Token.scoreBreakdown` are the latest score state on the Token row.

Policy:

- import / rescore paths may overwrite the latest score fields.
- these fields are not immutable initial-import score history.
- dictionary, learned term, trend, combo boost, hard reject, or rescore logic
  changes may make future rescore output different.
- do not infer from `Token.scoreBreakdown` alone that it was the score at
  notification time.
- strict notification-time score reconstruction requires Notification payload
  capture or a future `ScoreSnapshot` / `scoreHistory` design.

`Token.entrySnapshot.scoreTotal`, `scoreRank`, `scoreBreakdown`, and
`hardRejected` may appear in entry-vs-current reports, but those entry snapshot
values are entry context / comparison fields. They are not the canonical latest
score state.

## Current Compatibility Shape

The current scoring implementation writes an unversioned JSON shape like this:

```json
{
  "totals": {
    "core": 20,
    "learned": 8,
    "trend": 3,
    "combo": 2
  },
  "hits": [
    {
      "source": "core",
      "key": "ai",
      "score": 2,
      "tag": "optional-tag"
    }
  ],
  "trendFresh": true,
  "trendCapped": false,
  "trendOnly": false
}
```

Current confirmed hit source values are:

- `core`
- `learned_keyword`
- `learned_pattern`
- `trend`
- `combo`

Current confirmed top-level keys are:

- `totals`
- `hits`
- `trendFresh`
- `trendCapped`
- `trendOnly`

Current confirmed `totals` keys are:

- `core`
- `learned`
- `trend`
- `combo`

This compatibility shape has no `schemaVersion`, `scoringVersion`, or
`computedAt` field today.

## Recommended Versioned Shape

Future writes should move toward a small versioned explanation shape:

```json
{
  "schemaVersion": 1,
  "scoringVersion": "dictionary-v1",
  "computedAt": "2026-05-16T10:00:00.000Z",
  "total": 33,
  "rank": "A",
  "components": {
    "core": 20,
    "learned": 8,
    "trend": 3,
    "combo": 2
  },
  "hits": [
    {
      "source": "core",
      "key": "ai",
      "score": 2,
      "tag": "optional-tag"
    }
  ],
  "hardReject": {
    "matched": false,
    "reason": null
  },
  "metadata": {
    "trendFresh": true,
    "trendCapped": false,
    "trendOnly": false,
    "trendGeneratedAt": "2026-05-16T00:00:00.000Z",
    "trendTtlHours": 24
  }
}
```

This recommended shape intentionally uses the currently confirmed component
names `core`, `learned`, `trend`, and `combo`. Future splits such as
`coreKeywords`, `learnedKeywords`, `learnedRegex`, `comboBoost`, or `penalties`
should be introduced only with a docs + implementation task that updates the
scoring code and report readers together.

During transition, reports should remain able to read legacy unversioned rows.
This policy does not change current implementation and does not backfill
existing rows.

## `schemaVersion`

`schemaVersion` is the JSON shape version for `scoreBreakdown`.

Policy:

- use `schemaVersion: 1` as the current recommended shape version.
- rows without `schemaVersion` are legacy / unknown shape.
- unknown versions should be handled conservatively.
- future new writes should include `schemaVersion`, but this task does not
  change code or backfill existing rows.

## `scoringVersion`

`scoringVersion` is a label for the scoring logic / dictionary composition.

Policy:

- treat it as an operational label, not a schema enum.
- use it to distinguish score output before and after dictionary, learned
  keyword, learned regex, trend, combo boost, or penalty changes.
- if current rows lack `scoringVersion`, treat that as legacy / not recorded.
- a value such as `dictionary-v1` is a future recommended label, not a
  confirmed persisted value today.

## Components

Components explain how `scoreTotal` was built.

Current confirmed components:

- `core`
- `learned`
- `trend`
- `combo`

Current behavior:

- learned keyword and learned pattern scores are combined into `totals.learned`.
- trend score is capped before it is stored in `totals.trend`.
- combo rules contribute to `totals.combo`.
- there is no confirmed `penalties` component in the current
  `scoreBreakdown` shape.

Future candidate components:

- `coreKeywords`
- `learnedKeywords`
- `learnedRegex`
- `comboBoost`
- `penalties`

Rules:

- component scores should be numbers.
- do not store the entire dictionary in `scoreBreakdown`.
- if hit details are stored, keep them as a lightweight summary.
- do not store large payloads or raw external responses.

## Hard Reject Relationship

Hard reject primary state lives on Token fields:

- `Token.hardRejected`
- `Token.hardRejectReason`

`scoreBreakdown.hardReject` may be added later as an explanatory summary:

```json
{
  "matched": false,
  "reason": null
}
```

Policy:

- Token fields remain the primary source of hard reject state.
- `scoreBreakdown.hardReject` is optional explanation, not the primary source.
- hard reject is not `outcomeLabel`.
- hard reject is not `reviewFlagsJson`.

## Trend Relationship

Trend scoring depends on `data/trend.json` freshness.

Current confirmed trend-related breakdown fields:

- `trendFresh`
- `trendCapped`
- `trendOnly`

Current confirmed behavior:

- stale trend data disables trend keyword scoring for that run.
- trend score is capped before it contributes to total score.
- trend-only scoring cannot produce `S` rank in current implementation.

Policy:

- keep trend contribution lightweight in `scoreBreakdown`.
- do not embed the entire `data/trend.json`.
- future versioned shape may include `trendGeneratedAt` and `trendTtlHours`
  under `metadata`.
- trend data freshness and score results should be read as run-specific score
  context, not as a permanent market truth.

## Rescore Relationship

The broader timestamp meaning policy is fixed in
`docs/design/time-anchor-policy.md`.

Rescore may update:

- `Token.normalizedText`
- `Token.hardRejected`
- `Token.hardRejectReason`
- `Token.scoreTotal`
- `Token.scoreRank`
- `Token.scoreBreakdown`
- `Token.rescoredAt`

Policy:

- after rescore, `scoreBreakdown` is the latest score explanation.
- `scoreBreakdown` is allowed to change.
- `rescoredAt` is the rescore execution timestamp.
- `rescoredAt` is separate from `enrichedAt`.
- rescore does not preserve initial score history by itself.
- score history requires a future `ScoreSnapshot` / `scoreHistory` design.

## Relationship To Review Flags And Metadata Status

`reviewFlagsJson` is lightweight review helper JSON. It is not
`scoreBreakdown`.

`metadataStatus` is metadata completeness state. It is not `scoreBreakdown`.

`groupKey` / `groupNote` are manual grouping helpers. They are not
`scoreBreakdown` and must not adjust score automatically.

`scoreBreakdown` is scoring explanation JSON.

These values may coexist:

```text
metadataStatus = partial
scoreBreakdown rank = S
reviewFlagsJson flags include needs_manual_review
```

They do not automatically update each other in the MVP.

## Forbidden Content

Do not store these in `Token.scoreBreakdown`:

- Metric outcome result.
- `peakFdv`.
- `peakMultipleFromAlert`.
- `outcomeLabel`.
- `timeToPeakMinutes`.
- HolderSnapshot body.
- Notification lifecycle state.
- Telegram send result.
- provider complete raw body.
- secrets or environment-derived values.
- retry, queue, worker, scheduler, or systemd state.
- huge payloads.
- full `data/trend.json`.
- full dictionary contents.

Storage destinations:

- Metric outcome: `metrics:window-report` or a future `OutcomeSnapshot`.
- review flags: `reviewFlagsJson`.
- metadata completeness: `metadataStatus`.
- holder analysis: `HolderSnapshot`.
- notification state: `Notification`.
- provider snapshot: `Metric.rawJson` or `Token.entrySnapshot.contextCapture`.

## Legacy And Unknown Shape

`scoreBreakdown = null` means score breakdown is not recorded. It does not prove
scoring was never executed.

Missing `schemaVersion` means legacy / unknown shape.

Unknown keys should not cause immediate failure.

Reports may display a raw summary when useful. Planners and guards should rely
on known keys first and treat unknown shapes conservatively.

A new key becomes official only when docs and implementation are updated
together.

## Current Task Boundary

This policy records score breakdown versioning and boundaries only. It does
not change code, schema, migrations, scoring logic, rescore behavior, existing
rows, rank thresholds, dictionaries, trend data, reports, planners,
`ScoreSnapshot`, or `scoreHistory`.

## Next Docs-Only Candidates

- `ScoreSnapshot` / `scoreHistory` future policy.
- HolderSnapshot real source implementation plan.
