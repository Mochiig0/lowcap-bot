# Review Output / Investigation Card Design

This note describes a future review-support output shape for `lowcap-bot`.

It is a design memo, not a fixed schema, not a committed runtime contract, and not an immediate implementation spec.

## Purpose

The goal of this bot is not only to detect early tokens.

The more durable goal is to reduce the cost of early human review by collecting, preserving, and presenting enough evidence that a person can spend time on the right candidates instead of redoing the same initial research from scratch.

That means the future output should optimize for review support:

- show what was found
- show what looks risky
- show what looks credible
- show what may attract attention
- show what is still unknown
- show why the token surfaced at all

This is review support, not a buy or avoid verdict.

## Design Principles

- Observe first, alert second, prediction last.
- Prefer flags over opaque scoring.
- Prefer explainability over premature prediction.
- Treat unknown or missing as different from negative.
- Prefer context collection first and weighting later.
- Keep the output useful for human investigation, not full automation.

The system should help answer:

- What evidence exists?
- What is missing?
- Why is this worth another minute of attention?

It should not pretend to answer:

- Is this definitely good?
- Is this definitely bad?
- Should this be bought automatically?

## Investigation Card Shape

A future investigation card can stay compact while still being reviewable.

Example sections:

- `header`
  - token identity, source family, first-seen time, current review stage
- `short summary`
  - one short explanation of why the token is being shown now
- `risk flags`
  - quick signals that something important is missing or suspicious
- `quality flags`
  - quick signals that the token has unusually complete or internally consistent context
- `hype / narrative flags`
  - quick signals that the token may attract attention even if certainty is still low
- `context evidence`
  - links, descriptions, metadata text, source consistency, and supporting excerpts or counts
- `timing / arrival data`
  - when detect happened, when enrich arrived, when secondary context arrived, and how quickly those signals showed up
- `outcome / observation status`
  - whether trailing observations exist yet, and whether the token is still too early to judge
- `why surfaced`
  - the specific evidence or combination that made the card worth surfacing
- `unknown / missing`
  - what data is absent, delayed, or still not validated

The card should be able to say "interesting but incomplete" without forcing that into a negative bucket.

## Illustrative Flag Families

The flag names below are illustrative examples only.

They are not a fixed schema, not a locked taxonomy, and not a promise that current scoring or persistence already uses these names.

Possible families:

- `risk`
  - `noWebsite`
  - `noX`
  - `noTelegram`
  - `noExternalContext`
  - `suspiciousHolderPattern`
- `quality`
  - `descriptionPresent`
  - `metadataConsistency`
  - `linkCount`
  - `sourceConsistency`
- `hype`
  - `narrativeMatch`
  - `earlyContextArrival`
  - `linkPlusNarrativeCombo`
  - `metaplexHit`

These examples are useful because they are easier to inspect than one opaque score delta.

They also allow future review output to separate:

- evidence that looks positive
- evidence that looks risky
- evidence that might attract attention
- evidence that is still absent

Unknown or missing context should remain visible as its own state instead of being silently collapsed into negative quality.

## Relationship To Scoring Evolution

Future scoring changes should follow this order:

1. Start from human heuristics.
2. Decompose them into observable flags.
3. Collect and store those observations first.
4. Compare those observations against later outcomes.
5. Only then revise weights, ranking policy, or alert logic.

In other words:

- heuristics -> observable flags -> collect/store -> compare against outcomes -> then revise weights

This keeps the project from turning early hunches into rigid score behavior before there is enough stored evidence to justify it.

It also keeps current scoring implementation separate from future design ideas.

## Non-Goals

This design memo does not imply any near-term goal of:

- a final trading engine
- a fully autonomous buy or avoid classifier
- replacing validation and observation with a single automatic decision

The intended direction is a more explainable review layer, not a premature end-to-end prediction machine.
