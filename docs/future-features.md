# Future Features

Backlog notes for features that look valuable later, but are not the current implementation target.

## Summary

- Current top priority is mint-driven automatic data accumulation.
- The first goal is to build an observation base that stores metrics and lets us compare later outcomes against the original entry view.
- Alert sophistication, early prediction, and trading automation are intentionally deferred.
- This repo should keep "what we do now" and "what we want later" clearly separated.

## Now vs Later

### Now

- Keep `lowcap-bot` as a CLI-first manual-operation MVP.
- Prioritize mint as the entrypoint for automatic intake and later enrichment.
- Store observation data and metrics in a way that supports later comparison and review.
- Favor noise reduction, persistent records, and inspectable outputs over aggressive prediction.
- Keep observation logic and prediction logic separate.

### Later

- Use stored observations to improve watch and alert timing.
- Add richer read-only review flows for comparing entry assumptions with actual outcomes.
- Explore context-aware narrative and risk evaluation using surrounding links and social data.
- Consider semi-automation and, only much later, trading automation.

## Not now

- Advanced notification logic as the main focus.
- Earliest-possible prediction before enough observation data exists.
- Complex real-time automation, worker orchestration, or auto-trading.
- Heavy social analysis before basic collection and storage are stable.
- Mixing collection, scoring, and final action into one opaque step.

## Wanted later

### Mint-driven expansion

- `mint-only import`
  - Let the system accept a token from mint alone as the first intake step.
  - Why: mint is often the earliest reliable identifier.
  - Not now because: current MVP still assumes manual descriptive fields at import time.
- `enrich flow`
  - After mint intake, fill in `name`, `symbol`, `description`, `dev`, links, and metadata later.
  - Why: initial intake should not block on complete metadata.
  - Not now because: the current priority is defining the observation path before adding fetch layers.
- `re-score`
  - Re-evaluate narrative, risk, and total score after enrichment.
  - Why: entry-time information can be incomplete.
  - Not now because: the system first needs stable enrichment inputs and stored entry snapshots.
- `observe`
  - Accumulate observation metrics after import as separate metric rows.
  - Why: this is the core base for later comparison, reporting, and alert improvements.
  - Start first among future items: this is the highest-value expansion path.

### Surrounding links and context capture

- Collect website, X, Telegram, and metadata text such as bio, title, description, and hero text.
- Use surrounding context later for narrative and risk judgement.
- First phase should stop at collect-and-store, without immediate score impact.
- Why: context can be valuable, but collection quality should be validated before it changes ranking.
- Not now because: collection and scoring should stay decoupled until the stored data proves useful.

### Early-launch observation metrics

- Add metrics such as `launchPrice`, `peakPrice15m`, `peakPrice1h`, `peakFdv24h`, `peakFdv7d`, `maxMultiple15m`, `maxMultiple1h`, `timeToPeakMinutes`, `peakMultipleFromAlert`, and `alertedAt`.
- Prefer FDV and multiple over MC for early-coin evaluation.
- Keep launch-time evaluation separate from later outcome evaluation.
- Why: early coins need a better "what happened after alert" record than current MVP metrics provide.
- Not now because: the data capture path should be stabilized incrementally, starting from mint-based intake.

### Entry vs outcome comparison

- Preserve entry snapshots such as `scoreRank`, `scoreTotal`, `scoreBreakdown`, `hardRejected`, `importedAt` or `createdAt`, and entry-time FDV, price, and links.
- Compare them later with outcome metrics such as `peakFdv24h`, `peakFdv7d`, `maxMultiple15m`, `volume24h`, and `timeToPeakMinutes`.
- Plan for read-only report, review, or comparison views that answer: "what did this look like at launch, and what actually happened?"
- Why: the main value is not perfect prediction, but later inspection and feedback from real outcomes.
- Not now because: the base storage model and observation cadence need to exist first.

### Momentum-oriented alerts

- Add `early momentum alert` separate from narrative-oriented alerts.
- Allow a future `risky momentum alert` path for tokens that move before they look clean.
- Treat "people are starting to gather here" as a more realistic future alert target than instant mint-time prediction.
- Why: for some coins, realistic timing may come after initial movement begins.
- Not now because: notification sophistication should follow observation coverage, not lead it.

### X-related expansion

- Minimum future fields:
  - X URL
  - username or handle
  - display name
  - bio
  - account created date
  - follower and following counts
  - pinned post
  - recent posts
- Later light quantitative signals:
  - mention count
  - increase speed
  - unique posters
  - early reaction growth
- Heavy analysis is intentionally later.
- Why: collection-first social data can help later review and trend detection.
- Not now because: the first milestone is collect, store, and inspect, not deep inference.

### Grok + X API usage

- Do not treat Grok as the single source of fact.
- Intended role split:
  - X API for quantitative collection
  - Grok for candidate term discovery, clustering, and narrative summarization
  - human approval before trend dictionary changes
- Possible future commands:
  - `trend:discover` to generate candidate trend terms
  - `trend:update` to apply approved terms
- Prefer a candidate JSON handoff rather than direct auto-apply.
- Why: discovery support is useful, but trend dictionaries should remain reviewable and explicit.
- Not now because: this should follow stable collection and review workflows.

### Review-path reinforcement

- Add read-only CLI paths that show what to review next, not only raw reports.
- Candidate examples:
  - tokens with strong early performance
  - winners by narrative bucket
  - entry-vs-outcome comparison reports
- Why: the system should reduce missed review opportunities, not only store rows.
- Not now because: it depends on richer stored observations and enough history to inspect.

### Evaluation sophistication

- Use accumulated data to make watch and alert decisions earlier over time.
- Keep the sequence as:
  - observe first
  - alert second
  - early prediction last
- Avoid starting with a complex prediction engine.
- Why: the repo should earn prediction complexity from stored evidence.
- Not now because: current MVP still lacks the observation depth needed to justify it.

### Auto-trading

- Auto-trading is not a near-term target.
- Natural evolution order:
  - observation
  - notification
  - semi-automatic judgement
  - auto-trading
- Why: execution automation without observation discipline would hide errors instead of teaching from them.
- Not now because: the repo is still building the observation OS layer.

### Information asset and publishing context

- The more natural long-term leverage may be using the resulting observations to build public signal and distribution, rather than selling the system itself.
- There is future room for X, note, Shorts, or TikTok style output based on useful observations.
- Useful observation publishing can be primary, monetization secondary.
- Why: the project value may compound through information assets, not only internal tooling.
- Not now because: this is strategy context, not a direct implementation task.

## Start conditions

- Start mint-driven automatic accumulation first when:
  - mint-only intake can create a token row without full metadata
  - enrichment can append metadata without destroying the original entry view
  - metric rows can accumulate repeated observations for one token
- Start link and social collection after:
  - the repo can persist raw collected context cleanly
  - stored context is inspectable without forcing score changes
- Start momentum alert work after:
  - enough observation history exists to compare alert timing against outcomes
  - alert logic can be reviewed separately from collection logic
- Start faster prediction work after:
  - entry snapshots and outcome metrics are both queryable
  - review paths can show whether earlier alerts would have helped
- Start auto-trading only after:
  - observation and notification are reliable
  - manual or semi-automatic decision flows are already validated

## Notes on design principles

- Split work into small steps.
- Prefer a working MVP first.
- Keep the data model easy to improve later.
- Favor explicit rules, persistent records, and inspectability.
- Prefer noise reduction over the promise of perfect prediction.
- Put observation before prediction.
- Do not mix observation logic with prediction logic.
- Current priority stops at automatic data accumulation, centered on mint-driven intake and later enrichment.
- The value is not "guaranteed win rate". The value is widening visibility, reducing misses, compressing noise, and creating more chances to inspect candidates with expected value.
- The project should grow into an observation OS that covers hours a human cannot watch continuously and reduces missed launches plus unreliable memory.
