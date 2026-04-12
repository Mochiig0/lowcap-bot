# Roadmap

## Goal

Move from a manual MVP import tool to a usable scoring pipeline with observable outcomes and maintainable operating procedures.

## Next Minimal Task

Extend comparison-oriented read-only inspection without changing the mint-driven accumulation write path.

Why this is now the most natural next step:

- mint-only import, enrich, rescore, metric append, and comparison views are now in place
- the repo can already capture "entry vs current vs outcome" for one token and as a compact multi-token report
- the next safe step is to add more read-only comparison depth before moving into automation or notify logic

## Short-Term

- Add the next read-only comparison slice only if it helps manual review:
  - richer comparison report fields
  - comparison filters or sort controls
  - focused report variants for outcomes
- Refresh or generate `data/trend.json` on a real cadence
- Keep README and docs synced with CLI usage and JSON output fields
- Add only small pure-function tests or smoke-check refinements when they improve manual operation

## Mid-Term

- Add tests for:
  - scoring breakdown and rank thresholds
  - import CLI behavior
- Clarify how comparison reports should evolve before adding interpretation or alerts
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

The codebase is not at that stage yet; the current roadmap should stay aligned with the existing mint-driven accumulation MVP.

For deferred ideas with high later value, see `docs/future-features.md`.
