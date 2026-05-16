# Metric RawJson Inspect Policy

## Purpose

This document fixes the MVP policy for inspecting `Metric.rawJson`, especially
through `pnpm metric:show`.

`Metric.rawJson` is already defined as a sanitized provider snapshot. This
policy clarifies that a CLI which displays it is a low-level operator /
developer inspection tool, not the normal report surface and not canonical
outcome review.

## Non-goals

- No code change.
- No DB schema change.
- No migration change.
- No production DB write.
- No `metric:show` implementation change.
- No `rawJson` output implementation change.
- No `rawJson` normalization or regeneration.
- No import, rescore, detect, or `metric:snapshot:geckoterminal` execution.
- No `metrics:window-report`, `metrics:report`, or `tokens:compare-report`
  implementation change.
- No existing row migration.
- No provider fetch.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, or `pnpm smoke`.

## Current Observed Implementation

Schema:

- `Metric.rawJson` is nullable `Json?`.

Observed write path:

- `metric:snapshot:geckoterminal` builds a sanitized snapshot, then stores it
  as `Metric.rawJson` when `--write` is used.
- The same path stores `volume24h` only when the provider exposes token-level
  24h volume, while FDV / market-cap / price / reserve-style values stay in
  `rawJson`.

Observed read / display path:

- `metric:show` reads one Metric by `id` and prints `rawJson`.
- `metrics:report` reads `rawJson` only to build rawJson-free presence columns:
  `priceUsdPresent`, `fdvUsdPresent`, `reserveUsdPresent`, and
  `topPoolPresent`.
- `tokens:compare-report` reads only the latest Metric `rawJson` for the same
  rawJson-free presence columns.
- `token:compare` reads recent Metric `rawJson` and exposes only `safeSummary`
  booleans.
- `metrics:window-report` reads `rawJson` internally for valid FDV extraction
  and explicitly notes that provider payload fields are not printed.

## `Metric.rawJson` Responsibility

`Metric.rawJson` is a sanitized provider snapshot for the Metric observation.

It represents:

- provider / adapter-derived lightweight context at `Metric.observedAt`.
- candidate values for FDV, market cap, volume, price, reserve / liquidity, and
  top-pool context.
- fallback material for reports when provider shapes change.
- low-level inspection material for operators and developers.

It does not represent:

- provider-complete raw response body.
- secrets.
- env-derived values.
- Telegram token or chat id.
- DB connection information.
- queue, worker, scheduler, or systemd state.
- Notification lifecycle.
- `outcomeLabel`.
- `scoreBreakdown`.
- HolderSnapshot body.

Important:

- `rawJson` is not a complete raw response.
- `rawJson` must remain a sanitized provider snapshot.
- do not store secrets or huge payloads in `rawJson`.
- reports should use explicit extraction / fallback rules instead of treating
  arbitrary `rawJson` shape as stable.

## `metric:show` Positioning

`metric:show` is a low-level inspect command.

It may show:

- one Metric row in detail.
- the stored `rawJson` snapshot for that Metric.
- enough context to debug provider snapshot shape and report extraction.

It is not:

- the normal user-facing report.
- canonical outcome review.
- a buy signal.
- a production monitoring dashboard.
- the primary UI for notification decisions.

Policy:

- use `metric:show` only when the operator needs low-level Metric inspection.
- use rawJson-free reports for normal summaries and shareable output.
- do not paste `metric:show` rawJson dumps into public reports or issues
  unless the content has been reviewed as secrets-free and minimally scoped.

## Separation From Normal Reports

`metrics:window-report`:

- canonical outcome review.
- computes window-level `peakFdv`, `peakMultipleFromAlert`, and
  `outcomeLabel` from Metric history.
- uses valid FDV extracted from `rawJson`.
- does not print raw provider payload fields.

`metrics:report`:

- Metric row summary.
- may include legacy Metric result fields.
- exposes rawJson-free safe summary booleans, not full `rawJson`.

`tokens:compare-report`:

- cross-token comparison.
- `outcomeBucket` is legacy / provisional.
- exposes latest Metric rawJson-free safe summary booleans, not full
  `rawJson`.

`token:compare`:

- single-token comparison.
- exposes recent Metric `safeSummary` booleans, not full `rawJson`.

`metric:show`:

- low-level inspect.
- may print `rawJson`.
- assumes `rawJson` is sanitized.
- should not become the default report surface.

## RawJson Display Safety

If `rawJson` is displayed:

- do not display secrets.
- do not display env-derived information.
- do not display Telegram credentials.
- do not display `DATABASE_URL`.
- do not display provider request headers or auth material.
- do not display unbounded huge payloads.
- treat output as operator / developer inspection material.

The design assumes secrets are not stored in `rawJson`. Even with that
assumption, `metric:show` output should be handled more carefully than normal
summary reports.

## FDV Extraction Relationship

`metrics:window-report` extracts FDV candidates from `Metric.rawJson` using the
canonical fallback order:

1. `rawJson.token.fdvUsd`
2. `rawJson.token.fdv_usd`
3. `rawJson.topPool.fdvUsd`
4. `rawJson.topPool.fdv_usd`
5. `rawJson.fdvUsd`
6. `rawJson.fdv_usd`

Policy:

- `rawJson` itself is not the outcome.
- valid FDV extracted from `rawJson` is used for outcome calculations.
- invalid FDV values are excluded from calculations.
- provider shape changes require updating extraction fallback logic and docs
  together.

## Provider Complete Raw Body Versus `Metric.rawJson`

Provider-complete raw body:

- full provider API response.
- may include auth context, headers, URLs, unnecessary fields, huge payloads,
  or broad nested response bodies.
- is not an MVP storage target.

`Metric.rawJson`:

- lowcap-bot's sanitized provider snapshot.
- contains only lightweight context needed by reports and inspection.
- should be secrets-free.
- is not equivalent to the provider-complete raw body.

## Allowed And Forbidden Content

Allowed lightweight candidates:

- `fdvUsd` / `fdv_usd`.
- market cap candidates.
- price candidates.
- volume candidates.
- reserve / liquidity-style candidates.
- pool / token lightweight identifiers.
- provider name or source label.
- provider timestamp when it is a lightweight value.
- top-pool lightweight summary.

Forbidden content:

- secrets.
- env-derived information.
- request headers.
- auth tokens.
- Telegram token or chat id.
- `DATABASE_URL`.
- provider-complete raw response.
- huge payloads.
- HTML body.
- unrelated nested response bodies.
- Notification lifecycle.
- HolderSnapshot body.
- `scoreBreakdown`.
- `outcomeLabel`.
- retry, queue, worker, scheduler, or systemd state.

## Missing, Malformed, And Unknown Values

If `rawJson` is null:

- rawJson was not recorded.
- the Metric row can still exist.
- FDV extraction should behave as no data / invalid.

If `rawJson` is malformed or not an object:

- reports should treat extracted fields as unavailable / null.
- CLIs should avoid crashing when practical.
- this docs-only task does not change implementation.

Unknown keys:

- do not cause immediate failure.
- may be visible in `metric:show` inspect output.
- should not be used by reports or planners unless a documented extraction
  path exists.
- become official only when docs and implementation are updated together.

## Sharing Guidance

For external sharing, issues, or long-lived operator notes:

- prefer rawJson-free summaries from `metrics:report`, `token:compare`,
  `tokens:compare-report`, or `metrics:window-report`.
- avoid pasting full `rawJson` dumps.
- if rawJson content must be shared, first verify that it is secrets-free and
  minimally scoped.
- do not share raw provider response bodies, screenshots with secrets, request
  URLs with secrets, headers, or auth material.

## Current Task Boundary

This policy records the inspection boundary only. It does not change code,
schema, migrations, `metric:show`, `metrics:report`, `metrics:window-report`,
`tokens:compare-report`, existing rows, rawJson sanitization, rawJson storage,
or provider fetch behavior.

## Next Docs-Only Candidates

- HolderSnapshot real source capture policy.
- `ScoreSnapshot` / `scoreHistory` future policy.
- `OutcomeSnapshot` / `AlertOutcome` future persistence policy.
- Dev wallet confidence implementation plan.
- rawJson sanitization implementation audit.
