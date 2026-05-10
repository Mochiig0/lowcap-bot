# Memecoin Market Model for LowcapBot

## 1. Why this document exists

This document keeps LowcapBot design decisions aligned around a market
observation model.

LowcapBot is not intended to package an external guide, reproduce its wording,
or turn a market thesis into trading advice. The guide is treated only as
background input for a LowcapBot-specific research model: observe what a human
operator would otherwise track informally, persist it in a structured way, and
compare later outcomes against the original context.

The goal is a research operating system for low-cap token observation, not a
buy-signal product.

## 2. LowcapBot is not a buy-signal bot

Notifications are not buy signals. They are prompts for review.

LowcapBot does not provide financial advice, does not choose position size, does
not decide exits, and does not execute trades. The system should stay
human-gated: a notification or planner output can narrow attention, but a human
operator remains responsible for interpretation and action.

The product boundary is observation, classification, follow-up, and evidence.

## 3. Core model: attention, narrative, risk, outcome

Memecoin movement is not explained by attention alone. Attention may start the
process, but outcome depends on a combination of narrative fit, community
behavior, liquidity, distribution, timing, broader market condition, and scam
surface.

LowcapBot should connect the state at detection time with later outcome. It
should not optimize for speed alone. A fast alert on the wrong token, wrong
identity, or hostile distribution is not useful evidence.

The core observation loop is:

1. detect attention or market activity;
2. identify what the token claims to be;
3. record risk and context at that moment;
4. follow the token after detection;
5. compare outcome with the original thesis.

## 4. Attention and narrative

Attention should be recorded with enough context to explain why the token was
worth review.

Candidate fields:

- `narrativeCategory`
- `attentionSource`
- `viralSourceUrl` or a source label
- `firstSeenAt`
- `narrativeFreshness`
- `oneLineExplainability`
- `canonicalIdentityConfirmed`
- `wrongCoinRisk`
- `vampRisk`
- `relatedKeyword`
- `memeOrigin`

The important distinction is not whether a phrase is popular. It is whether the
token is the right on-chain object for the attention source, whether the identity
is canonical enough to survive confusion, and whether competing tokens can drain
the same attention.

## 5. Market inefficiency and timing gap

There can be a gap between a narrative becoming visible and token data showing
clear traction. LowcapBot should make that gap measurable.

Early detection is useful only if the system also records whether the target was
correct, when it was first seen, and how the market behaved afterward.

Candidate fields:

- `firstSeenSource`
- `firstMetricAt`
- `initialMcap`
- `initialVolume`
- `ageAtDetection`
- `detectionLag`
- `followUp15m`
- `followUp1h`
- `followUp24h`
- `followUp7d`

## 6. Community and persistence

Short-lived virality and durable community are different signals.

LowcapBot should eventually separate one-time attention spikes from tokens that
keep organic participation after the first move. Community observation should
stay evidence-based and source-labeled.

Candidate fields:

- `xCommunityExists`
- `telegramExists`
- `websiteExists`
- `organicHumanPosts`
- `botLikePosts`
- `communityActivityLevel`
- `raidingSignal`
- `communityPersistenceSignal`

## 7. Risk and scam surface

Hard keyword filters are not enough. Risk can appear through holder structure,
volume quality, liquidity, authority settings, funding patterns, and chart
behavior.

LowcapBot should add risk observations gradually from available sources instead
of forcing a large schema too early.

Candidate fields:

- `topHolderPct`
- `holderConcentration`
- `freshWalletCount`
- `bundlerSignal`
- `sameFundingOriginSignal`
- `mcapVolumeRatio`
- `bottedChartPattern`
- `devBuyImpact`
- `lpLocked`
- `mintAuthorityDisabled`
- `freezeAuthorityDisabled`
- `honeypotRisk`
- `rugcheckSummary`

## 8. Market condition matters

The same token profile can behave differently in different market regimes.

LowcapBot should record market context separately from token-level quality. This
prevents later review from treating a bear-market failure and a euphoric-market
failure as the same kind of evidence.

Candidate fields:

- `marketRegime`
- `trenchActivity`
- `solanaMemeVolume`
- `freshLaunchMaxMcapRange`
- `runnerFrequency`
- `groupActivity`
- `btcTrend`
- `solTrend`
- `riskMode`

## 9. Thesis and information edge

Human judgment should be captured rather than discarded.

Operators should be able to record why a token was watched, why it was skipped,
what would invalidate the thesis, and what new information changed the review.
LowcapBot should not replace judgment. It should preserve the context needed to
test judgment later.

Candidate fields:

- `whyWatch`
- `whySkip`
- `thesisSummary`
- `invalidationReason`
- `newInfoEvent`
- `thesisExpired`
- `reviewedAt`
- `operatorNote`

## 10. Outcome logging

Without outcome logging, scoring cannot improve.

Successful tokens, failed tokens, dead tokens, rugs, skipped tokens, and missed
opportunities should all become evidence. The system should connect `Token`,
`Metric`, `Notification`, and review state so later analysis can compare
detection context with observed outcome.

Candidate fields:

- `maxMcap15m`
- `maxMcap1h`
- `maxMcap24h`
- `maxMcap7d`
- `maxMultipleFromDetection`
- `drawdownAfterDetection`
- `volumeAfterDetection`
- `graduated`
- `dead`
- `rugged`
- `stillActive`
- `notificationSent`
- `notificationFailed`
- `reviewOutcome`

## 11. Future scoring implications

Scoring should remain adjustable as observations accumulate.

Questions to test:

- Do social links correlate with better outcomes?
- Does persistent community activity improve follow-through?
- Does poor holder distribution cap upside?
- Does narrative freshness matter after controlling for market regime?
- Should score weights change across market conditions?
- Which skip reasons correctly avoided bad outcomes?

The current project should avoid premature complexity. Add small observation
fields only when they support a concrete review or validation loop.

## 12. Explicit non-goals

LowcapBot is not:

- a buy-signal bot;
- financial advice;
- a profit prediction engine;
- an auto-trading engine;
- an always-on bot-ready runtime;
- a human execution, sizing, or exit-decision system;
- a repackaging, translation, or substitute for any external PDF guide.

## 13. Current development alignment

LowcapBot should continue to develop as a CLI-first, bounded, human-gated
research OS.

Current alignment rules:

- Red commands stay exact and operator-approved.
- DB state is the authoritative record for observed outcomes.
- `rawJsonFree` and `secretFree` boundaries must remain explicit.
- Telegram response bodies, bot tokens, chat IDs, env values, and raw payloads
  must not be persisted.
- Queue, scheduler, systemd, automatic retry, default checkpoint operation, and
  unbounded watch remain unenabled until readiness conditions are met.
- Observation fields should grow incrementally, then be tested against outcomes
  before they become scoring weight.
