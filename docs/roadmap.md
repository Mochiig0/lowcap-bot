# Roadmap

## Goal

Move from a manual MVP import tool to a usable scoring pipeline with observable outcomes and maintainable operating procedures.

## Next Minimal Task

Refresh or generate `data/trend.json` on a real cadence.

Why this is now the most natural next step:

- metric import can now write `Metric` rows without changing existing token import behavior
- trend scoring already exists in code, but stale trend data makes that branch effectively inactive
- this can be improved without introducing workers or large architecture changes

## Short-Term

- Refresh or generate `data/trend.json` on a real cadence
- Add a simple query or report path to inspect stored `Metric` rows
- Decide whether `src/index.ts` should become a real app entrypoint or remain a placeholder
- Add a smoke-test path for scoring and import behavior
- Document setup and execution steps in a top-level README or docs index

## Mid-Term

- Add tests for:
  - normalization
  - hard reject rules
  - scoring breakdown and rank thresholds
  - import CLI behavior
- Clarify ranking policy and dictionary maintenance workflow
- Define how `groupKey` and `groupNote` should affect duplicate handling or review grouping
- Add simple review/reporting commands for stored tokens

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
