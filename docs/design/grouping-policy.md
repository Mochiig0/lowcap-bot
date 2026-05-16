# Manual Grouping Policy

## Purpose

This document fixes the MVP policy for `Token.groupKey` and
`Token.groupNote`.

`Token.groupKey` and `Token.groupNote` are manual grouping helpers. They exist
so humans can label Tokens for later comparison by narrative, research theme,
watchlist, campaign, batch, or other operator-chosen grouping.

## Non-goals

- No DB schema change.
- No migration change.
- No production DB write.
- No code change.
- No `groupKey` / `groupNote` implementation change.
- No import execution.
- No rescore execution.
- No detect command execution.
- No `metric:snapshot:geckoterminal` execution.
- No `metrics:window-report` implementation change.
- No `tokens:compare-report` implementation change.
- No validation addition.
- No enumization.
- No existing row migration.
- No automatic grouping.
- No dedupe logic implementation.
- No scoring logic change.
- No report / planner implementation change.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, or `pnpm smoke`.

## Responsibility

`Token.groupKey` represents:

- an optional operator-provided analysis group key.
- tokens that a human wants to compare together.
- a same-narrative candidate set.
- a same research theme.
- a same watchlist.
- a same campaign or batch.

`Token.groupNote` represents:

- a short human-readable note for the group assignment.
- why the token was placed in the group.
- what the operator wants to compare.
- a short manual observation or operating note.

Important:

- `groupKey` / `groupNote` are manual analysis helpers.
- they are not the primary source for automatic decisions.
- they are not automatic dedupe keys.
- they are not score adjustment evidence.
- they are not dev identity proof.
- they are not source provenance.
- they are not `outcomeLabel`.
- they are not buy signals.

## Current Implementation Boundary

Current confirmed behavior:

- `pnpm import` accepts `--groupKey` and `--groupNote`.
- `pnpm import` stores those values on `Token.groupKey` and
  `Token.groupNote` during create / update.
- `pnpm import:file` accepts optional `groupKey` and `groupNote` in the file
  payload and passes them to `pnpm import`.
- `token:show` reads and displays `groupKey` and `groupNote`.
- Telegram score notification copy may display `groupKey` as `group: ...`.
- GeckoTerminal enrich / rescore preview carries `groupKey` through selected
  token output / notification context.

No current implementation was confirmed that uses `groupKey` / `groupNote` as
automatic dedupe, score, risk, Notification trigger, source, dev identity, or
Metric outcome logic.

## Manual Grouping Only

MVP policy:

- `groupKey` is assigned manually by an operator or by import payload.
- `groupNote` is a manual human note.
- do not infer, normalize, merge, or auto-create groups in the MVP.
- do not use `groupKey` for automatic dedupe.
- do not use `groupKey` for automatic score changes.
- do not use `groupKey` for hard reject or risk judgement.
- do not use `groupKey` as Notification trigger.
- do not use `groupKey` in Metric outcome calculation.
- do not treat `groupKey` as immutable identity.

## Recommended `groupKey` Format

`groupKey` remains `String?`. This policy does not add a schema enum or
validation.

Recommended format:

- short stable string.
- lowercase.
- kebab-case or slash-separated.

Examples:

- `viral-animal-2026-05`
- `narrative/ai-agent`
- `watchlist/gecko-may`
- `manual/batch-001`
- `same-theme/zoo-animal`

Existing free-form values remain valid legacy / manual values. Do not
automatically normalize existing rows.

## Recommended `groupNote` Content

`groupNote` is human-readable note text.

Allowed examples:

- why this token was assigned to the group.
- what should be compared.
- narrative context.
- manual observation memo.
- short operating note.

Do not store:

- secrets.
- `.env` values.
- Telegram token or chat id.
- provider complete raw body.
- huge payloads.
- Metric outcome result.
- `scoreBreakdown` body.
- HolderSnapshot body.
- Notification lifecycle state.
- retry, queue, worker, scheduler, or systemd state.

## Boundaries With Other Concepts

`Token.source`:

- token-level current / latest source label.
- separate from `groupKey`.

Origin source:

- usually `Token.entrySnapshot.firstSeenSourceSnapshot.source`, then manual /
  legacy fallbacks.
- separate from `groupKey`.

`Dev.wallet`:

- dev / creator / deployer-like wallet label.
- separate from `groupKey`.
- a `groupKey` such as `same-dev/foo` is only manual grouping, not dev identity
  proof.

Metric outcome:

- read-only computed output from `metrics:window-report`.
- separate from `groupKey`.
- a `groupKey` that includes an outcome-like word is not `outcomeLabel`.

Notification:

- notification event history.
- separate from `groupKey`.
- `groupKey` may appear in notification text, but it is not Notification
  trigger, status, or mode.

Scoring:

- `scoreBreakdown` explains current scoring.
- separate from `groupKey`.
- a narrative-like `groupKey` is not narrative score.

## Reports And Planners

Reports and planners may read `groupKey` and `groupNote` as manual context.

Allowed report / planner uses:

- display the group key.
- display the group note.
- filter by exact group key.
- compare tokens within the same manual group.
- summarize outcomes by manual group in future read-only reports.
- track a manual research batch.

Do not use `groupKey` / `groupNote` to:

- automatically accept or reject a token.
- adjust score.
- hard reject.
- dedupe.
- prove dev identity.
- replace source provenance.
- replace outcome labels.

Future candidates:

- groupKey filter.
- groupKey-focused compare report.
- groupKey outcome summary.
- manual research batch tracking.

This task does not implement any of those candidates.

## Null And Legacy Values

`groupKey = null` means no manual grouping recorded. Treat it as ungrouped /
no group.

`groupNote = null` means no group note recorded. This is not an error.

Unknown or inconsistent `groupKey` values are legacy / manual values:

- do not error immediately.
- do not auto-normalize.
- do not auto-merge groups.
- do not infer semantics beyond manual label text.
- if a formal group naming convention becomes necessary, define it in a
  separate docs + implementation task.

## Current Task Boundary

This policy records manual grouping responsibility only. It does not change
code, schema, migrations, validation, enumization, existing rows, import
behavior, dedupe logic, score logic, reports, planners, or automatic grouping.

## Next Docs-Only Candidates

- `Dev.wallet` identity confidence policy.
- `metric:show` rawJson inspect policy.
- HolderSnapshot real source capture policy.
- `ScoreSnapshot` / `scoreHistory` future policy.
