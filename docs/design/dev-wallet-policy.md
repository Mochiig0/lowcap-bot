# Dev Wallet Identity Policy

## Purpose

This document fixes the MVP policy for `Dev.wallet` and the Token-to-Dev
relation.

`Dev.wallet` is an important analysis axis, but it is not identity proof. In
the MVP, it is a wallet label that a source payload or manual operator input
treated as dev / creator / deployer-like context.

This policy exists to prevent `Dev.wallet` from being confused with confirmed
person identity, HolderSnapshot evidence, Token source, manual grouping, Metric
outcome, or scoring evidence.

## Non-goals

- No code change.
- No DB schema change.
- No migration change.
- No production DB write.
- No `Dev.wallet` normalization.
- No `Dev.wallet` validation.
- No Dev identity scoring.
- No import, rescore, detect, or `metric:snapshot:geckoterminal` execution.
- No `metrics:window-report` or `tokens:compare-report` implementation change.
- No existing row migration.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, or `pnpm smoke`.

## Current Observed Implementation

Schema:

- `Dev.wallet` is a unique `String`.
- `Dev.note` is optional `String?`.
- `Token.devId` is optional and relates a Token to a Dev row.

Observed write path:

- `pnpm import` accepts `--dev`.
- `pnpm import` upserts `Dev` by exact `wallet` string.
- `pnpm import` stores the resulting `Dev.id` on `Token.devId`.
- `pnpm import:min` forwards optional `--dev` to `pnpm import`.
- `pnpm import:file` accepts optional `dev` and forwards it to `pnpm import`.

Observed read path:

- `pnpm token:show` includes `dev.wallet` and outputs `devWallet`.
- `pnpm tokens:report` includes `dev.wallet` and outputs `devWallet`.
- smoke coverage checks that import paths persist the dev wallet, but this
  policy does not run or change smoke behavior.

No current implementation evidence was found for:

- `Dev.note` writes.
- wallet normalization.
- wallet role or source fields.
- explicit confidence fields.
- Dev-based scoring.
- Dev-based risk decisions.

## `Dev` Model Responsibility

`Dev` groups dev / creator / deployer-like wallet labels associated with Token
rows.

`Dev` represents:

- a wallet label that a source or manual input treated as dev / creator /
  deployer-like context.
- a comparison axis for Tokens linked to the same exact wallet label.
- future input to dev-level outcome or behavior analysis.

`Dev` does not represent:

- confirmed person identity.
- confirmed team identity.
- confirmed scammer identity.
- confirmed bundle cluster.
- funding graph evidence.
- HolderSnapshot evidence.
- Notification lifecycle.
- Metric outcome.
- a buy signal.

Important:

- `Dev.wallet` is not identity proof.
- `Dev.wallet` is a dev candidate label.
- do not use `Dev.wallet` alone to conclude that a Token is safe or dangerous.

## `Dev.wallet` Definition

`Dev.wallet` is the wallet address label that a source payload or manual input
treated as dev / creator / deployer-like context.

MVP policy:

- treat `Dev.wallet` as an exact stored string grouping key.
- do not assume it identifies a person or team.
- Tokens linked to the same `Dev.wallet` may be compared as sharing the same
  wallet label.
- do not conclude that those Tokens came from the same human, same team, or
  same operating entity.

The source-side role may be creator, deployer, manual label, or unknown. The
current schema does not distinguish these roles.

## Identity Confidence

The MVP schema has no explicit confidence field for `Dev.wallet`.

Operational confidence categories for future design:

- `manual`: an operator entered the wallet label.
- `source`: a provider, launchpad, API, or source event returned the wallet
  label as creator / deployer-like context.
- `unknown`: the role or source of the wallet label is not clear.

Current policy:

- do not persist confidence in the MVP.
- do not treat `Dev.wallet` as high-confidence identity.
- do not infer team identity, scammer identity, or funding relation from
  `Dev.wallet`.

Future fields may be considered only in a separate design:

- `devWalletSource`.
- `devWalletRole`, such as `creator`, `deployer`, `manual_label`, or
  `unknown`.
- `devWalletConfidence`, such as `high`, `medium`, `low`, or `unknown`.
- `normalizedWallet`.

This task does not add any of those fields.

## Wallet Normalization

MVP policy:

- treat `Dev.wallet` as the stored string.
- do not assume it is normalized.
- do not assume it has been validated as a Solana address.
- do not change case, trim historical values, or merge strings in this task.
- if normalization becomes necessary, handle it in a separate task with a
  migration / compatibility plan.

Invalid or suspicious wallet strings:

- are not fixed by this docs-only policy.
- may be displayed as raw values in reports.
- should be treated conservatively by planners.

## `Dev.note`

`Dev.note` is optional manual note text for a Dev wallet label.

`Dev.note` may contain:

- a short human-readable memo.
- operator context about why the wallet label matters.
- manual research notes about the wallet label.

`Dev.note` must not contain:

- score state.
- risk confirmation.
- identity proof.
- Metric outcome.
- HolderSnapshot body.
- Notification lifecycle state.
- Telegram send result.
- provider full raw body.
- secrets or env-derived values.
- huge payloads.
- retry, queue, worker, scheduler, or systemd state.

Policy:

- treat `Dev.note` as unused / optional manual note in the MVP.
- do not use `Dev.note` for automatic scoring, risk, notification, or outcome
  logic.

## `Token.devId` Relation

`Token.devId` links a Token to a `Dev.wallet` label.

Policy:

- if `Token.devId` exists, the Token is associated with that exact
  `Dev.wallet` label.
- this relation does not prove the wallet belongs to the actual dev, creator,
  deployer, person, or team.
- Dev-level reports and comparisons are allowed as label-based analysis.
- Dev-level scam confirmation, score boost / penalty, or hard reject is not an
  MVP behavior.

## Boundaries With Other Concepts

`Token.source`:

- token-level current / latest source label.
- separate from `Dev.wallet`.

Origin source:

- usually `Token.entrySnapshot.firstSeenSourceSnapshot.source`, with manual /
  legacy fallback policy.
- separate from `Dev.wallet`.

`Token.groupKey`:

- manual grouping helper.
- separate from `Dev.wallet`.
- a `groupKey` such as `same-dev/foo` is manual grouping, not identity proof.

HolderSnapshot:

- holder distribution, fresh-wallet, bundler, and funding-origin review.
- separate from `Dev.wallet`.
- do not infer bundler, same-funding origin, or LP exclusion from `Dev.wallet`.

Metric outcome:

- read-only computed values from `metrics:window-report`.
- separate from `Dev.wallet`.

Notification:

- notification event history.
- separate from `Dev.wallet`.

Scoring:

- `scoreBreakdown` explains the current Token score.
- separate from `Dev.wallet`.
- do not use `Dev.wallet` as score evidence in the MVP.

## Reports And Planners

Reports and planners may read `Dev.wallet` as a dev candidate label.

Allowed uses:

- display `devWallet`.
- filter or group Tokens by exact `Dev.wallet`.
- compare Tokens linked to the same wallet label.
- prepare future Dev-level outcome summaries.

Disallowed MVP uses:

- automatic pass / fail decisions.
- score boosts or penalties.
- hard reject or risk confirmation.
- identity proof.
- HolderSnapshot substitution.
- funding-origin or bundle inference.
- buy-signal decisions.

Future candidates:

- Dev wallet token count.
- Dev wallet outcome summary.
- Dev wallet failure / hit rate.
- confidence-aware Dev scoring.
- known bad / known good wallet list.

All future candidates require separate design before implementation.

## Null And Legacy Values

If `Token.devId` is null:

- no Dev relation is recorded.
- dev is unknown.
- this is not an error.

If `Dev.note` is null:

- no note is recorded.
- this is not an error.

If `Dev.wallet` is invalid, suspicious, or inconsistently formatted:

- do not fix it in this docs-only task.
- reports may show the raw value.
- planners should treat it conservatively.
- normalization / validation belongs in a later task.

## Do Not Confuse

- Do not treat `Dev.wallet` as confirmed person identity.
- Do not treat `Dev.wallet` as confirmed team identity.
- Do not use `Dev.wallet` to confirm scam status.
- Do not use `Dev.wallet` as score evidence in the MVP.
- Do not use `Dev.wallet` as a HolderSnapshot replacement.
- Do not use `Dev.wallet` as funding-origin proof.
- Do not use `Dev.wallet` as bundle proof.
- Do not store secrets or huge payloads in `Dev.note`.

## Current Task Boundary

This policy records the current docs-only boundary. It does not change code,
schema, migrations, existing rows, import behavior, report behavior, planner
behavior, scoring logic, HolderSnapshot logic, Notification logic, wallet
normalization, or wallet validation.

## Next Docs-Only Candidates

- HolderSnapshot real source capture policy.
- `ScoreSnapshot` / `scoreHistory` future policy.
- `OutcomeSnapshot` / `AlertOutcome` future persistence policy.
- Dev wallet confidence implementation plan.
