# Roadmap

## Goal

Move from a manual MVP import tool to a usable scoring pipeline with observable outcomes and maintainable operating procedures.

## Next Minimal Task

Add a smoke-test path for scoring and import behavior.

Why this is now the most natural next step:

- metric import can now write `Metric` rows without changing existing token import behavior
- manual trend refresh can now keep `data/trend.json` fresh enough for trend scoring to work
- metric reporting now covers the basic manual read path for stored observations
- a small smoke-test path would help verify the MVP without introducing a full test framework

## Short-Term

- Refresh or generate `data/trend.json` on a real cadence
- Add a smoke-test path for scoring and import behavior
- Add simple review/reporting commands for stored tokens
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
