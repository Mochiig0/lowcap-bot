# Metadata Status Policy

## Purpose

This document fixes the MVP lifecycle policy for `Token.metadataStatus`.

`Token.metadataStatus` is an operational status for token metadata
completeness. It tells reports, planners, and guards how far token identity
metadata has progressed from mint-only intake toward useful review context.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No `metadataStatus` implementation change.
- No enumization.
- No existing row migration.
- No write-path change.
- No planner / report implementation change.
- No `enrichedAt` / `rescoredAt` implementation change.
- No source-only enrich implementation change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, detect command, or `pnpm smoke`.

## Responsibility

`Token.metadataStatus` represents:

- how complete token identity metadata is.
- whether a mint-only token has been complemented by metadata or lightweight
  context.
- the status reports, planners, and guards use to reason about metadata
  completeness.

`Token.metadataStatus` does not represent:

- token safety.
- scam / risk judgement.
- `scoreRank`.
- narrative score.
- source provenance.
- notification state.
- holder analysis status.
- Metric outcome label.

Important:

- `metadataStatus` is metadata-completeness state.
- It is separate from `Token.source`.
- It is separate from `scoreRank`.
- It is separate from `reviewFlagsJson`.
- It is separate from Notification, HolderSnapshot, and Metric outcome state.

## Allowed Operational Values

The MVP operational values are:

- `mint_only`
- `partial`
- `enriched`
- `unknown`

This is a docs-level operational allowlist, not a schema enum. This policy does
not change code and does not migrate existing rows.

`unknown` is a report / planner fallback for legacy, invalid, or unrecognized
values. New writes should not intentionally use `unknown` unless a separate
implementation policy approves it.

## Status Definitions

### `mint_only`

Definition:

- the mint is registered.
- name, symbol, description, source context, or other identity metadata is
  missing or insufficient.
- there is little token identity context beyond the mint itself.

Use cases:

- immediately after mint-only import.
- after automatic detection registered only the mint.
- candidate for enrich or context capture.

Notes:

- `mint_only` does not mean unsafe.
- `mint_only` does not mean low score.
- It only means metadata is still insufficient.

### `partial`

Definition:

- some metadata or lightweight context exists.
- the token has more than a bare mint, but is not complete enough to call
  fully enriched.

Examples that may justify moving to `partial`:

- name / symbol was captured.
- `entrySnapshot.firstSeenSourceSnapshot` exists.
- `entrySnapshot.contextCapture` contains sanitized lightweight context.
- `entrySnapshot.manualObservation` contains human-entered lightweight
  metadata.

Notes:

- `partial` does not mean fully researched.
- `partial` does not always mean notification-eligible.
- score, risk, and notification guards remain separate checks.

### `enriched`

Definition:

- the enrich process has complemented the MVP-required token identity metadata.
- reports and planners may treat the token as metadata-complete for the MVP.

Examples that may justify `enriched`:

- name / symbol are present.
- description or other source / context-derived supporting information is
  present.
- `entrySnapshot` / `contextCapture` contains evidence for the completion.
- the enrich pipeline improved metadata completeness enough for the current
  MVP.

Notes:

- `enriched` does not mean safe.
- `enriched` does not mean promising.
- `enriched` does not guarantee complete socials.
- `enriched` does not mean holder analysis is complete.
- `enriched` is unrelated to Metric outcome evaluation.

### `unknown`

Definition:

- legacy row.
- invalid or undefined `metadataStatus`.
- status could not be classified.

Policy:

- new writes should generally not use `unknown`.
- reports / planners may map unrecognized values to `unknown` behavior.
- unknown values should not immediately force schema migration or enumization.
- reports may show the raw value alongside `unknown` behavior.
- planners should treat unknown status conservatively.

Example:

- `metadataStatus = "metadata_partial"` is unknown-equivalent under this docs
  policy until a separate normalization / migration task is approved.

## Lifecycle

Basic MVP lifecycle:

```text
mint_only -> partial -> enriched
```

Policy:

- move forward only when metadata completeness increases.
- do not automatically downgrade in normal operation.
- do not automatically move `enriched` back to `partial` or `mint_only`.
- treat unrecognized values as `unknown` behavior.

Examples:

- mint only registered: `mint_only`.
- name / symbol or lightweight source snapshot exists: `partial`.
- enrich process complements the required metadata: `enriched`.

Important:

- lifecycle progression is metadata completeness progression.
- source updates are separate.
- score / rescore updates are separate.
- `metadataStatus` is not an outcome evaluation result.

## Source-Only Enrich

Source-only enrich means only provenance labels changed, such as
`Token.source` or `contextCapture.*.source`, and metadata completeness did not
improve. No name, symbol, description, context summary, or equivalent metadata
was added.

Policy:

- source-only update alone must not move `metadataStatus` to `enriched`.
- source-only update alone should not update `enrichedAt`.
- if source-only work also adds first lightweight context, such as
  `firstSeenSourceSnapshot` or `contextCapture`, and that improves metadata
  completeness, `mint_only -> partial` is allowed.

Examples:

| Scenario | Status policy |
| --- | --- |
| `mint_only` token receives first `firstSeenSourceSnapshot` | `mint_only -> partial` is allowed |
| `partial` token only changes `Token.source` | remain `partial` |
| `partial` token receives name / symbol / description or useful context summary | consider `partial -> enriched` |
| `enriched` token only changes `Token.source` | remain `enriched`; do not update `enrichedAt` for that reason alone |

This policy records the preferred lifecycle semantics. It does not change the
current implementation.

## Timestamp Relationship

### `enrichedAt`

`enrichedAt` is the time the token reached enriched-equivalent metadata
completeness.

Policy:

- treat it as the first time the row reached enriched-level metadata
  completeness.
- do not update it for source-only updates.
- do not treat any row update as metadata enrichment just because `updatedAt`
  changed.

### `rescoredAt`

`rescoredAt` is the time scoring / rescore was executed.

Policy:

- keep it separate from `metadataStatus`.
- rescore alone does not change metadata completeness.
- rescore alone should not imply `partial` or `enriched`.

### `updatedAt`

`updatedAt` is the Prisma / DB row update timestamp.

Policy:

- do not read it as metadata lifecycle meaning.
- do not confuse it with `enrichedAt` or `rescoredAt`.

Important:

- do not confuse `enrichedAt` and `updatedAt`.
- do not confuse `rescoredAt` and `enrichedAt`.
- do not confuse source-only updates with metadata enrichment.

## Reports, Planners, And Guards

When reports, planners, or guards read `metadataStatus`, they should read it as
metadata-completeness state.

`mint_only`:

- metadata is insufficient.
- candidate for enrich / context capture.
- scoring or notification decisions may need to treat it as information-poor.

`partial`:

- some metadata exists.
- report display and candidate comparison are possible.
- not fully metadata-complete.

`enriched`:

- metadata is complete enough for MVP review.
- planners may treat it as more ready for next-stage operations.

`unknown`:

- legacy, invalid, or unrecognized fallback.
- planners should be conservative.
- reports should display unknown behavior and may include the raw value.

Important:

- `metadataStatus` is not hard reject state.
- `metadataStatus` is not risk judgement.
- `metadataStatus` is not `scoreRank`.
- `metadataStatus` is not Notification status.

## Legacy And Unknown Values

Existing rows or future bugs may produce values outside this policy.

Policy:

- treat undefined values as `unknown` behavior.
- do not immediately stop operation with schema migration or enumization.
- reports may include both normalized `unknown` and the raw value.
- planners should use conservative behavior for unknown status.
- normalization / migration, if needed, should be a separate approved task.

## Relationship To Token Source And Entry Snapshot

`Token.source` is the token-level current / latest source label. It is not
`metadataStatus`.

`Token.entrySnapshot` records first detection, manual observation, and
sanitized lightweight context. It may provide evidence for `metadataStatus`,
but it is not itself the status.

`entrySnapshot.contextCapture` may justify moving from `mint_only` to
`partial`, or help support `enriched`, when it contains useful sanitized
metadata context. It must not become a provider complete raw body store.

Source labels and metadata status can change independently. Keep source
provenance policy in `docs/design/token-source-policy.md`.

## Relationship To Review Flags

`Token.reviewFlagsJson` shape and boundaries are fixed in
`docs/design/review-flags-policy.md`.

Review flags are lightweight human / review-process helper context. They may
coexist with any `metadataStatus` value, but they do not replace metadata
completeness state and do not automatically update `metadataStatus`,
`enrichedAt`, `scoreRank`, or `scoreBreakdown`.

## Current Task Boundary

This policy records the lifecycle only. It does not change code, schema,
migrations, existing rows, write paths, planner / report behavior,
`enrichedAt`, `rescoredAt`, or source-only enrich behavior.

## Next Docs-Only Candidates

- `scoreBreakdown` versioning.
- `groupKey` / `groupNote` manual grouping policy.
- Token time anchor policy.
