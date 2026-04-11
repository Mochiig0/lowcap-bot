# Roadmap

## Goal

Move from a manual MVP import tool to a usable scoring pipeline with observable outcomes and maintainable operating procedures.

## Next Minimal Task

Keep docs and small tests synced with the current CLI-first MVP before expanding into larger automation work.

Why this is now the most natural next step:

- the manual import and inspection loop is now complete enough to use day-to-day
- the first pure-function tests are in place, but status and roadmap docs should reflect the current baseline
- the next safe step is to add small coverage or docs accuracy without jumping into scheduler or worker design

## Short-Term

- Refresh or generate `data/trend.json` on a real cadence
- Keep README and docs synced with CLI usage and JSON output fields
- Add only small pure-function tests or smoke-check refinements when they improve manual operation
- Document setup and execution steps in a top-level README or docs index

## Mid-Term

- Add tests for:
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
