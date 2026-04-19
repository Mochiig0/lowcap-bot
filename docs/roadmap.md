# Roadmap

Formal phased implementation order now lives in `docs/implementation-roadmap.md`.
This document remains the narrower near-term operating roadmap.

## Goal

Keep the current CLI-first, mint-driven accumulation MVP aligned with the live repo: narrow source-specific semi-automation, observable outcomes, and maintainable operating procedures without drifting into a generic bot runtime too early.

## Next Minimal Task

Keep the current DexScreener and GeckoTerminal source-specific runtime narrow, reliable, and documented before adding another adapter or broader runtime concept.

Why this is now the most natural next step:

- `pnpm import:mint:file` now exists as a thin batch mint-only ingest wrapper over `pnpm import:mint`
- `pnpm import:mint:source-file` now exists as a thin source-specific adapter runtime that normalizes one raw source event into `{ mint, source? }` before delegating to `pnpm import:mint`
- `pnpm detect:dexscreener:token-profiles` and `pnpm detect:geckoterminal:new-pools` now cover the current narrow source-specific detect/watch surface
- `pnpm token:enrich-rescore:geckoterminal`, `pnpm metric:snapshot:geckoterminal`, and `pnpm ops:summary:geckoterminal` now cover the current Gecko follow-up and read-only ops surface
- these entrypoints still keep scoring, notify, metric, enrich, and rescore responsibilities separated from mint-only ingest
- the next safe step is to preserve those boundaries, sync stale docs, and wait for a real new source need before adding broader runtime concepts

## Short-Term

- Keep `import:mint:file` narrow as the first Phase 5 semi-automation entrypoint:
  - file-backed only
  - sequential only
  - delegates to `import:mint`
  - does not add scoring, notify, metric, enrich, or rescore behavior
- Keep `import:mint:source-file` narrow as the first source-specific adapter runtime:
  - one source-specific raw event shape only
  - one file at a time
  - normalizes into `{ mint, source? }`
  - delegates to `import:mint`
  - does not add scoring, notify, metric, enrich, or rescore behavior
- Pause generic runtime expansion here for now:
  - the current narrow runtime already includes the existing DexScreener / GeckoTerminal detect/watch helpers plus the bounded GeckoTerminal enrich-rescore / metric / ops-summary helpers
  - do not add a second source adapter until the documented admission criteria are actually met
  - do not move into a generic or multi-source adapter runtime yet
  - keep detector, queue, worker, and scheduler runtime work in a later phase
  - expand runtime entrypoints again only when a real new source need appears
- Pause read-only lightweight-view expansion here for now:
  - `tokens:report`, `token:show`, `metrics:report`, and `metric:show` are enough as the current lightweight inspection set
  - `tokens:compare-report` and `token:compare` are enough as the current compare-view set
  - `compare:geckoterminal:dexscreener` and `ops:summary:geckoterminal` are enough as the current Gecko-specific read-only helpers
  - do not turn `token:show` into `token:compare`, or `tokens:report` into `tokens:compare-report`
  - do not keep adding token-deep context to `metric:show`
  - expand read-only fields, filters, or summaries again only when a real operating bottleneck appears
- Keep docs and hand-off material synced with the live repo before adding another detector-shaped entrypoint or external-source adapter
- Stabilize the current Gecko runner operating picture:
  - detect first
  - enrich-rescore-notify second
  - metric snapshot third
  - keep those runners source-specific and bounded
- Add the next read-only comparison slice only if it helps manual review and does not change the write path:
  - richer comparison report fields
  - comparison filters or sort controls
  - focused report variants for outcomes
- Refresh or generate `data/trend.json` on a real cadence
- Keep README and docs synced with CLI usage and JSON output fields
- Add only small pure-function tests or smoke-check refinements when they improve manual operation

## Mid-Term

- Define how a future detect-to-mint-only path should hand off into the existing `import:mint` / `import:mint:file` boundary without bypassing source-adapter normalization
- Decide whether the next source need really warrants a second source adapter or belongs in the current Gecko/Dex read-only and operator tooling
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
- Detector runtime, scheduler, queue, or worker orchestration
- Multi-source or generic adapter runtime
- Real-time trading logic
- Complex UI
- ML-based scoring

The codebase is not at that stage yet; the current roadmap should stay aligned with the existing mint-driven accumulation MVP.

For deferred ideas with high later value, see `docs/future-features.md`.
