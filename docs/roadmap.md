# Roadmap

## Goal

Move from a manual MVP import tool to a usable scoring pipeline with observable outcomes and maintainable operating procedures.

## Next Minimal Task

Keep the docs aligned with the current CLI surface and avoid reintroducing outdated examples.

Why this is now the most natural next step:

- metric import can now write `Metric` rows without changing existing token import behavior
- manual trend refresh can now keep `data/trend.json` fresh enough for trend scoring to work
- token and metric show/report commands now cover the basic manual inspection flow
- `src/index.ts` already works as the CLI help hub, so the smaller gap is keeping docs in sync

## Short-Term

- Refresh or generate `data/trend.json` on a real cadence
- Keep README and docs synced with CLI usage and JSON output fields
- Add only small filter or smoke-check refinements when they improve manual operation
- Document setup and execution steps in a top-level README or docs index

## Mid-Term

- Add tests for:
  - normalization
  - hard reject rules
  - scoring breakdown and rank thresholds
  - import CLI behavior
- Clarify ranking policy and dictionary maintenance workflow
- Define how `groupKey` and `groupNote` should affect duplicate handling or review grouping

## Longer-Term

- Add automatic ingestion from external sources
- Introduce scheduled jobs or worker execution
- Add richer alert rules beyond `S` rank only
- Use stored metrics to evaluate whether scoring correlates with outcomes
- Create a feedback loop for updating learned dictionaries from observed winners/losers

## Explicit Non-Goals Today

- Full bot automation
- Real-time trading logic
- Complex UI
- ML-based scoring

The codebase is not at that stage yet; the current roadmap should stay aligned with the existing MVP architecture.
