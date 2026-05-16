# Token Source Policy

## Purpose

This document fixes the MVP meaning of `Token.source` and separates it from
other source-like fields.

The word `source` is overloaded in the current schema and reports. In the MVP,
readers and future implementations must distinguish:

1. Token current source
2. Token origin source
3. Metric source
4. Notification trigger / mode / status
5. `Token.entrySnapshot.contextCapture` source
6. HolderSnapshot source

These are related provenance concepts, but they are not interchangeable.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No `Token.source` write-path change.
- No existing row migration.
- No source enum.
- No `sourceHistory` model.
- No `Metric.source`, `Notification.trigger`, or `HolderSnapshot.source`
  implementation change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, detect command, or `pnpm smoke`.

## Source Terms

### Token current source

`Token.source` is the token-level current / latest source label.

In the existing MVP it may be written by import, mint, or enrichment paths. It
represents the source label most recently reflected onto the Token record, not
an immutable origin guarantee.

Use it for reports and planners that need the current token-level source label.

Do not treat it as:

- the guaranteed first discovery source.
- the Metric observation provider.
- the Notification trigger or execution mode.
- the HolderSnapshot source.
- an outcome-evaluation source of truth.

Important:

- `Token.source` is not always synonymous with "the source that first found
  this token."
- It may change when enrich or patch flows update the Token record.
- If immutable origin is needed, prefer
  `Token.entrySnapshot.firstSeenSourceSnapshot.source`.

### Token origin source

Origin source is the source that first candidate-listed the token.

Preferred read order:

1. `Token.entrySnapshot.firstSeenSourceSnapshot.source`
2. `Token.entrySnapshot.manualObservation.source`
3. `Token.source`
4. `null` / `unknown`

Recommended expression:

```ts
originSource =
  entrySnapshot.firstSeenSourceSnapshot.source ??
  entrySnapshot.manualObservation.source ??
  Token.source ??
  null;
```

`Token.source` is allowed as a legacy fallback for rows that do not have
`firstSeenSourceSnapshot.source` or `manualObservation.source`. That fallback
must be described as legacy / best-effort provenance, not as immutable origin.

Origin source is conceptually stable. Do not casually overwrite it. If a future
immutable `originSource` field becomes necessary, first design an
`entrySnapshot` policy and migration plan instead of adding schema early.

### Metric source

`Metric.source` is the source of one Metric observation snapshot.

It records where that market snapshot came from, such as a provider, adapter,
or manual input path. It is per Metric row and separate from `Token.source`.

Operational examples observed in code / docs:

- `geckoterminal.token_snapshot`
- manual Metric entry labels supplied through Metric CLI input, including the
  current `manual` default.

These are examples, not a schema enum.

Metric outcome evaluation must use Metric history: `Metric.source`,
`Metric.observedAt`, and sanitized `Metric.rawJson`. Do not use `Token.source`
as a basis for window outcome calculations.

### Notification trigger / mode / status

Notification fields describe the alert lifecycle, not token source.

The full Notification event policy is fixed in
`docs/design/notification-event-policy.md`.

`Notification.trigger` is the reason or event type that produced a
notification record. Current operational example:

- `metric_appended`

`Notification.mode` is the execution mode for that notification event. Current
operational examples:

- `capture_only`
- `live_send`

`Notification.status` is the notification event state. Current operational
examples:

- `captured`
- `sent`
- `failed`

Important:

- Do not mix `Notification.trigger`, `Notification.mode`, or
  `Notification.status` into `Token.source`.
- The `alertedAt` basis for outcome evaluation still comes from
  `Notification.sentAt` / `Notification.capturedAt` first.
- Notification reason belongs in `Notification.trigger`, not `Token.source`.

`Notification.source`, where present, is notification provenance for the
producer path, such as `metric:snapshot:geckoterminal`. It is not
`Token.source`.

### Context capture source

`Token.entrySnapshot.contextCapture` records lightweight context captured
during token completion / context capture.

It may contain a source label and `capturedAt`, but it is not the same thing as
`Token.source`.

Allowed examples:

- `geckoterminalTokenSnapshot`
- `metaplexMetadataUri`
- context source label.
- `capturedAt`.
- lightweight metadata summary.

Operational examples observed in code / docs:

- `geckoterminal.token_snapshot`
- `metaplex.metadata_uri`

`contextCapture` is sanitized lightweight context. It is not a provider
complete raw body store, not an origin-source replacement, not a Metric source
replacement, and not a place for Metric results or Notification lifecycle
fields.

### HolderSnapshot source

`HolderSnapshot.source` records the source or input path for holder snapshot /
holder review provenance.

It is per HolderSnapshot row and separate from `Token.source`.

Operational examples in docs:

- `manual_holder_review`
- `external_holder_report`
- `rugcheck.safe_summary`

Holder real-source capture remains a future enhancement. Fresh-wallet,
bundler, funding-origin, and holder concentration judgements must not be mixed
into `Token.source`.

## Field Boundary Table

| Field | Meaning | Mutable? | Primary use |
| --- | --- | --- | --- |
| `Token.source` | token-level current / latest source label | may change | reports / planners current token state |
| `Token.entrySnapshot.firstSeenSourceSnapshot.source` | origin source | should not change conceptually | first detection / origin analysis |
| `Token.entrySnapshot.manualObservation.source` | manual origin / observation source | should not change conceptually after capture | manual legacy / observation provenance |
| `Token.entrySnapshot.contextCapture.*.source` | context capture source | per context capture | lightweight enrichment context provenance |
| `Metric.source` | metric observation source | per Metric row | window report / metric provenance |
| `Notification.trigger` | notification reason / event | per Notification row | alert lifecycle |
| `Notification.mode` | notification execution mode | per Notification row | capture / live behavior |
| `Notification.status` | notification state | per Notification row | notification lifecycle |
| `HolderSnapshot.source` | holder snapshot source | per HolderSnapshot row | holder review provenance |

This table is not an enum. Do not add source enumization in the MVP just to
document current labels.

## Reports And Planners

When reports / planners read `Token.source`, they should read it as the current
token-level source label.

Policy:

- use `Token.source` for current token state displays and current-source
  filtering.
- use `Token.entrySnapshot.firstSeenSourceSnapshot.source` when origin-source
  analysis matters.
- use `Metric.source` for Metric outcome and latest Metric provenance.
- use `Notification.trigger`, `Notification.mode`, and `Notification.status`
  for notification outcome / alert lifecycle analysis.
- use `HolderSnapshot.source` for holder review provenance.

If `tokens:compare-report` or a planner treats `Token.source` as origin source,
document that as legacy fallback behavior. Future report improvements should
display `currentSource` and `originSource` separately.

## Legacy Rows

Some existing rows may not have
`Token.entrySnapshot.firstSeenSourceSnapshot.source`.

For those rows, `Token.source` may be read as origin-like provenance only as a
fallback:

```ts
originSource =
  entrySnapshot.firstSeenSourceSnapshot.source ??
  entrySnapshot.manualObservation.source ??
  Token.source ??
  null;
```

This fallback is useful for older rows and manual rows, but `Token.source`
alone must not be asserted as immutable origin.

## Known Labels

Known source-like labels from current code and docs include:

- Token / origin examples: `geckoterminal.new_pools`, manual import labels, and
  source labels supplied by mint-first intake.
- Metric examples: `geckoterminal.token_snapshot`, `manual`, and explicit
  Metric CLI input labels.
- Context capture examples: `geckoterminal.token_snapshot`,
  `metaplex.metadata_uri`.
- Notification examples: `metric_appended`, `capture_only`, `live_send`,
  `captured`, `sent`, `failed`, and producer source
  `metric:snapshot:geckoterminal`.
- Holder examples: `manual_holder_review`, `external_holder_report`,
  `rugcheck.safe_summary`.

These labels are operational examples only. Do not infer unlisted labels as
invalid, and do not treat this list as a schema enum.

## Relationship To Other Policies

`docs/design/token-entry-snapshot-policy.md` controls what may live inside
`Token.entrySnapshot`.

`docs/design/metadata-status-policy.md` controls token metadata completeness
state. `Token.source` is source provenance, not metadata completeness.

`docs/design/metric-result-field-policy.md` controls Metric result and outcome
fields. Metric outcomes do not belong in `Token.source` or
`Token.entrySnapshot`.

Outcome evaluation uses Metric history and Notification timestamps. It must not
use Token current source as a substitute for Metric source, origin source, or
notification reason.

`docs/design/grouping-policy.md` controls `Token.groupKey` and
`Token.groupNote`. Manual grouping labels are not Token source, origin source,
Metric source, Notification trigger, or HolderSnapshot source.

## Current Task Boundary

This policy records source responsibilities only. It does not change code,
schema, migrations, existing rows, `Token.source` write behavior, source labels,
or any Metric / Notification / HolderSnapshot implementation.

## Next Docs-Only Candidates

- Token time anchor policy.
