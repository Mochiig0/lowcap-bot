# HolderSnapshot Source Policy

## Purpose

This document fixes the MVP policy for `HolderSnapshot` and holder-risk fields.

`HolderSnapshot` is a safe summarized snapshot for holder distribution and
holder-risk review. It is not raw holder capture, not a full wallet graph, not
confirmed scam proof, and not a buy signal.

The current MVP has HolderSnapshot storage and safe-summary tooling, but real
holder source capture remains future enhancement work and is not a 3h / 6h
bounded monitoring blocker.

## Non-goals

- No code change.
- No DB schema change.
- No migration change.
- No production DB write.
- No HolderSnapshot implementation change.
- No real holder source capture implementation.
- No holder fetch.
- No `holder:snapshot:add` execution.
- No import, rescore, detect, or `metric:snapshot:geckoterminal` execution.
- No `metrics:window-report` or `tokens:compare-report` implementation change.
- No existing row migration.
- No external fetch.
- No Telegram send.
- No `--write` or `--watch` execution.
- No queue, scheduler, systemd, or `pnpm smoke`.

## Current Observed Implementation

Schema:

- `HolderSnapshot` belongs to a Token through `tokenId`.
- fields include `source`, `observedAt`, holder concentration values,
  wallet-signal values, `confidence`, `rawFree`, and `secretFree`.

Observed write path:

- `pnpm holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>` can
  create exactly one HolderSnapshot row from a safe summary file.
- the add path validates a strict safe-summary shape.
- the add path rejects batch input, unknown wrapper fields, dangerous raw
  payload keys, and secret-like fields.
- the add output reports `writeScope=one_holder_snapshot_row` and confirms it
  does not update Token, Metric, Notification, queue, systemd, Telegram, or
  external fetch state.

Observed read / review paths:

- `pnpm holder:snapshot:show -- --mint <MINT>` reads existing snapshots and
  returns holder fields plus risk-review hints.
- `pnpm holder:safe-summary:report -- --file <PATH>` validates safe summary
  input without writing or fetching.
- `pnpm holder:gaps:plan` is read-only planning output for missing holder
  distribution context.

Current source-capture status:

- storage, parser, one-row write path, read path, and safe-summary report exist.
- approved real holder source capture does not exist yet.
- paid / external holder source work is parked and not an MVP blocker.

## HolderSnapshot Responsibility

`HolderSnapshot` represents:

- holder concentration summary.
- holder count summary.
- fresh-wallet, bundler, and same-funding-origin signal summary.
- manual holder review or future holder source capture result.
- holder analysis provenance through `source`, `observedAt`, and `confidence`.

`HolderSnapshot` does not represent:

- raw wallet graph full dump.
- full holder list.
- funding graph full dump.
- Metric outcome.
- `scoreBreakdown`.
- `reviewFlagsJson`.
- Notification lifecycle.
- `Dev.wallet` identity proof.
- confirmed scam judgement.
- a buy signal.

Important:

- HolderSnapshot is a safe summary.
- real holder source capture remains future enhancement work.
- do not use HolderSnapshot alone to decide that a token is safe or scam.
- holder signals are supporting context for risk review.

## Current MVP Status

HolderSnapshot rows can exist without real source capture being complete.

MVP policy:

- a HolderSnapshot row proves only that a safe summary row was recorded.
- it does not prove that real holder analytics are finished.
- `manual_holder_review`, external-report-only review, synthetic fixtures, and
  unknown / null values can exist.
- fresh-wallet, bundler, and funding-origin signals should be treated as future
  / source-dependent signals unless an approved source contract says otherwise.
- Metric time-series accumulation, Notification boundaries, and
  `metrics:window-report` outcome review remain higher-priority MVP work.

## `HolderSnapshot.source`

`HolderSnapshot.source` is the provenance label for the holder snapshot or
holder review.

Examples:

- `manual_holder_review`.
- future provider / tool label.
- `unknown`.

Policy:

- `HolderSnapshot.source` is separate from `Token.source`.
- it is separate from `Metric.source`.
- it is separate from Notification `trigger`.
- it is separate from `Dev.wallet`.
- a source label alone does not guarantee real source-capture quality.
- source-specific semantics must be redefined when real source capture is
  implemented.

## `HolderSnapshot.observedAt`

`HolderSnapshot.observedAt` is the time the holder summary was observed or
recorded.

Policy:

- treat it as Bot-side or operator-side observation time.
- it is not token launch time.
- it is not `Metric.observedAt`.
- it is not Notification `sentAt` or `capturedAt`.
- it is not outcome `evaluationAt`.

## Holder Concentration Fields

`topHolderPct`:

- percentage held by the largest holder according to the source / review.

`top10HolderPct`:

- combined percentage held by the top 10 holders according to the source /
  review.

`holderCount`:

- holder count according to the source / review.

Policy:

- meanings can change materially depending on whether LP, pool, burn, program,
  CEX, treasury, or issuer wallets are included.
- read concentration fields together with `source`, `confidence`, and
  `lpWalletExcluded`.
- do not treat these fields as scam proof.
- source-specific contracts must define whether holder percentages are supply
  percentages, circulating-supply percentages, or another source-defined
  aggregate.
- `holderCount` can differ by source, chain coverage, index freshness, and
  filtering rules.

## `lpWalletExcluded`

`lpWalletExcluded` indicates whether LP / pool wallets were excluded from
concentration calculations.

Policy:

- `true`: can be read as LP / pool wallet excluded for that source summary.
- `false`: read as not excluded or not excluded by the source / review.
- `null`: unknown or not recorded.

Important:

- concentration values with unknown `lpWalletExcluded` are reference values.
- `lpWalletExcluded` is central to interpreting `topHolderPct` and
  `top10HolderPct`.
- real source capture must document LP / pool wallet exclusion per source.

## `freshWalletCount`

`freshWalletCount` is a summary count of holders labeled as fresh wallets.

Ambiguity:

- the definition of fresh depends on source / tool.
- wallet age threshold is not fixed.
- first transaction age, wallet creation age, and funding age are different
  concepts.

MVP policy:

- treat it as a future holder-risk signal.
- do not trust it without source and confidence context.
- use it only when the source explicitly returns a fresh-wallet label or a
  manual review records a safe summary.
- lowcap-bot does not define independent wallet-age logic in this policy.

Future work must define:

- fresh-wallet threshold.
- whether age means first transaction, funding, account creation, or another
  source-specific anchor.
- source-specific confidence.

## `bundlerSignal`

`bundlerSignal` summarizes bundle suspicion from holder distribution, wallet
clustering, or source-provided signal.

Operational values currently accepted by safe-summary tooling:

- `none`
- `low`
- `medium`
- `high`
- `unknown`

MVP policy:

- this is a future holder-risk signal.
- it is not bundle proof.
- use it as source-defined or manually reviewed summary only.
- do not use it for automatic score adjustment in the MVP.
- do not use it alone for scam confirmation.

## `sameFundingOriginSignal`

`sameFundingOriginSignal` summarizes whether multiple holders may share a
funding origin.

Operational values currently accepted by safe-summary tooling:

- `none`
- `low`
- `medium`
- `high`
- `unknown`

MVP policy:

- this is a future holder-risk signal.
- it is not funding graph proof.
- full funding graph traversal is not defined or implemented by this policy.
- read it together with `source` and `confidence`.
- do not store raw funding graph data in HolderSnapshot.

## `confidence`

`confidence` is a lightweight information-quality label for the HolderSnapshot.

Operational values currently accepted by safe-summary tooling:

- `high`
- `medium`
- `low`
- `unknown`

MVP policy:

- confidence may reflect source quality, manual-review confidence, missingness,
  null rate, or signal quality.
- the calculation formula is not fixed.
- missing or unknown confidence should be treated conservatively.
- do not use confidence directly for automatic score or risk decisions.
- do not schema-enum confidence in this task.

## `rawFree` And `secretFree`

`rawFree` indicates that the snapshot does not contain raw provider body, full
holder list, full wallet graph, or raw holder payload.

`secretFree` indicates that the snapshot does not contain secrets, env values,
credentials, request auth, or similar sensitive material.

Policy:

- HolderSnapshot should be a `rawFree=true` and `secretFree=true` safe summary.
- safe-summary write tooling currently requires both values to be literal
  `true`.
- `secretFree=false` is a serious operational risk.
- raw holder dumps must not be stored in HolderSnapshot.
- raw holder dumps must not be pasted into issues, docs, or external reports.

## Allowed And Forbidden Content

Allowed safe-summary content:

- holder concentration summary.
- holder count summary.
- fresh-wallet count summary.
- bundler signal summary.
- same-funding-origin signal summary.
- LP exclusion flag.
- confidence label.
- source label.
- observedAt.
- short safe operator note only if a future field explicitly supports it.

Forbidden content:

- full holder list.
- raw wallet graph.
- funding graph full dump.
- private wallet labels.
- secrets.
- env-derived information.
- provider-complete raw body.
- Telegram credentials.
- `DATABASE_URL`.
- Metric outcome.
- `scoreBreakdown`.
- Notification lifecycle.
- `Dev.wallet` identity proof.
- buy signal.

## Boundaries With Other Models

`Token.source`:

- token-level current / latest source label.
- separate from `HolderSnapshot.source`.

`Dev.wallet`:

- dev / creator / deployer-like wallet label.
- not funding-origin proof.
- not bundler proof.

Metric:

- FDV / volume / price observation history.
- separate from HolderSnapshot.

Notification:

- notification event history.
- separate from HolderSnapshot.

`reviewFlagsJson`:

- lightweight Token review flags.
- separate from HolderSnapshot body.
- a future task may copy holder-derived lightweight warnings into
  `reviewFlagsJson`, but the HolderSnapshot body remains separate.

Metric outcome:

- read-only computed by `metrics:window-report`.
- separate from holder-risk review.

## Reports And Planners

Reports and planners may display HolderSnapshot as holder-risk review context.

Policy:

- read `topHolderPct`, `top10HolderPct`, and `holderCount` with `source`,
  `lpWalletExcluded`, and `confidence`.
- treat `freshWalletCount`, `bundlerSignal`, and
  `sameFundingOriginSignal` as future / source-dependent signals.
- do not use HolderSnapshot alone for automatic pass / fail decisions.
- do not use HolderSnapshot alone for score adjustment.
- do not use HolderSnapshot alone for scam confirmation.
- do not present HolderSnapshot as a buy signal.

Current planner behavior:

- `holder:gaps:plan` is read-only and suggests capability planning only.
- it does not fetch, write, send Telegram, or produce a command to run.

Future candidates:

- holder source capture.
- holder confidence computation.
- holder risk summary.
- holder-derived `reviewFlagsJson`.
- holder-aware risk score.

All future candidates require separate design before implementation.

## Unknown And Null Values

`null` means not observed, unavailable, not captured, or unknown.

Policy:

- do not treat null as zero.
- do not interpret unknown as safe.
- do not interpret unknown as dangerous proof.
- reports and planners should be conservative.
- values without clear source or confidence should be treated as low-trust
  review context.

## Current Task Boundary

This policy records HolderSnapshot source and field boundaries only. It does
not change code, schema, migrations, write paths, source capture, fetch
behavior, confidence calculation, LP exclusion logic, bundler detection,
funding graph analysis, existing rows, reports, planners, or scoring.

## Next Docs-Only Candidates

- `ScoreSnapshot` / `scoreHistory` future policy.
- `OutcomeSnapshot` / `AlertOutcome` future persistence policy.
- HolderSnapshot real source implementation plan.
- holder confidence computation policy.
- holder-derived risk summary policy.
- Dev wallet confidence implementation plan.
