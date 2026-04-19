# Implementation Roadmap

## Purpose

This document is the formal phased implementation roadmap for `lowcap-bot`.

It should be read together with:

- `docs/current-status.md` for current truth about what already exists
- `docs/architecture.md` and `AGENTS.md` for fixed boundaries and lane ownership
- `docs/roadmap.md` for the narrower near-term operating roadmap

This roadmap is intentionally conservative. It fixes implementation order without turning the current repo into a generic bot platform too early.

## Current Position

`lowcap-bot` is currently a CLI-first, mint-driven accumulation MVP with:

- full manual import
- mint-only ingest
- narrow source-specific DexScreener and GeckoTerminal detect/watch helpers
- bounded GeckoTerminal enrich-rescore and metric follow-up helpers
- read-only ops summary, compare, report, and review-queue helpers

The repo is currently at:

- Phase 0 as the active operating baseline
- early Phase 1 as the next natural expansion area, because read-only review helpers now exist but are still narrow

## Fixed Constraints

These constraints apply to every phase:

- keep the three lanes separate: full import, mint-driven accumulation, read-only
- keep current truth anchored to `package.json`, `src/cli/*`, and `docs/current-status.md`
- keep architectural boundaries anchored to `docs/architecture.md` and `AGENTS.md`
- do not move scoring, notify, enrich, rescore, or metric creation into mint-only ingest
- do not add queue / worker / scheduler orchestration early
- do not generalize the current source-specific helpers into a generic multi-source runtime early
- prefer observation first, alert second, prediction last

## Phase 0: Limited Live Operation

### Intent

Run a bounded live operating loop that proves the current source-specific workflow is usable end to end without broadening the runtime model.

### Focus

- keep detect as the first lane in live operation
- run enrich as the second lane
- run metric collection after detect and enrich
- use read-only ops summary to confirm state and coverage
- keep the runner picture source-specific and narrow

### What This Means In Practice

- `detect:geckoterminal:new-pools` and `detect:dexscreener:token-profiles` remain source-specific entrypoints
- Gecko live runner priority remains `detect > enrich-rescore-notify > metric`
- `ops:summary:geckoterminal` remains the main read-only coverage check
- the goal is bounded operator-usable live accumulation, not generic automation

### Exit Signal

- limited live runs are stable enough to observe detect, enrich, and metric coverage
- operators can confirm what happened without touching the write path

## Phase 1: Read-Only Review Strengthening

### Intent

Improve operator usefulness by making it clearer what should be reviewed next, while keeping all review logic in read-only tooling.

### Focus

- extract enrich-pending tokens
- extract rescore-pending tokens
- extract metric-pending tokens
- extract notify-candidate tokens
- extract tokens whose first-seen window has aged but still needs cleanup

### Rules

- keep review logic out of write paths and ingest paths
- keep this as read-only selection and prioritization
- prefer lightweight JSON-first operator tooling over a UI

### Natural Outputs

- review queue reports
- focused compare/report slices
- better review ordering and filtering

## Phase 2: Context Capture

### Intent

Collect external context that may later improve review quality, but do not force that context into scoring too early.

### Focus

- website links
- X links or handles
- Telegram links or handles
- metadata text
- other stable links already exposed by source payloads or follow-up fetches

### Rules

- start with collect-and-store
- do not strongly weight the new context in scoring immediately
- preserve inspectability and later reviewability

### Natural Outputs

- stored context snapshots
- read-only inspection of captured context
- better operator review context before any scoring-policy change

## Phase 3: Internal Feedback Loop

### Intent

Use observed outcomes inside the repo to improve learned terms and boost candidates, but keep the update path reviewable.

### Focus

- separate winners from non-winners using stored observations
- aggregate recurring terms from internal data
- produce boost-candidate reports
- keep learned-term updates reviewable instead of auto-applied

### Rules

- do not auto-promote terms directly into scoring
- keep the workflow inspectable
- prefer reports and candidate lists before scoring-policy changes

### Natural Outputs

- winner / non-winner comparison reports
- term frequency summaries
- reviewable boost candidate proposals

## Phase 4: External Trend Loop

### Intent

Bring in external trend candidates only after the internal feedback loop exists, then compare external signals against internal observations before any temporary boost is applied.

### Focus

- external trend candidate collection from systems such as X or Grok
- compare external candidate terms against internal token and outcome data
- allow only reviewable, temporary boost proposals after that comparison

### Rules

- external signals should not bypass internal review
- temporary boosts should be bounded and reversible
- external trend flow comes after internal evidence flow, not before it

### Natural Outputs

- external trend candidate lists
- internal-vs-external overlap views
- temporary boost review reports

## Phase 5: Alert Sophistication

### Intent

Expand alerting only after observation coverage and review workflows are strong enough to justify more alert shapes.

### Focus

- narrative-oriented alerts
- momentum-oriented alerts
- follow-up alerts after initial detection
- post-entry monitoring alerts

### Rules

- alert expansion comes after observation coverage, not before it
- keep alerts explainable from stored state
- do not collapse review logic into ingest logic

### Natural Outputs

- additional read-only candidate reports for possible alerting
- bounded alert rules layered on top of existing observation data

## Phase 6: Prediction Sophistication

### Intent

Use the accumulated observation base to improve timing and weighting decisions without jumping straight to a complex prediction engine.

### Focus

- watch timing
- alert timing
- boost weights
- ranking policy

### Rules

- do not build a complex prediction engine first
- use stored observations to refine timing and policy gradually
- keep changes reviewable and attributable to observed outcomes

### Natural Outputs

- better timing heuristics
- better weighting heuristics
- more defensible ranking policy changes

## Non-Goals For Now

The following are explicitly out of scope for the current roadmap stage:

- generic bot runtime
- queue / worker / scheduler orchestration
- generic multi-source runtime
- complex UI
- ML scoring
- auto-trading

## Reading This Roadmap Correctly

- Phase order is intentional; later phases should not be pulled forward casually
- current live repo truth still comes from the implemented CLI surface, not from aspirational docs
- when priorities conflict, preserve lane boundaries and operator usefulness before adding automation depth
