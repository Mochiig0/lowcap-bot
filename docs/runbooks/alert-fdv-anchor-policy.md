# Alert FDV Anchor Policy Preflight

Date: 2026-05-20

This Green preflight evaluates why no-Notification `mint_only` fallback tokens
often have `alertFdv=null` in `metrics:window-report`, and compares policy
options before any implementation. No Metric snapshot, detect watch, external
fetch, production DB write, Telegram send, Notification send/retry, schema
change, migration, application code change, or rawJson full dump was executed.

## Current State

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`
- `metrics:window-report` strict alert-FDV lookup remains the current
  5-minute lookaround around resolved `alertedAt`.

## Target Cohort

Read-only Prisma aggregation used this target definition:

- `Token.source=geckoterminal.new_pools`
- mint ends with `pump`
- `metadataStatus=mint_only`
- no `Notification` row for the token
- at least one `Metric`
- at least one Metric with readable FDV

Result:

- target token count: `158`
- Metric row distribution inside target: `1=99`, `2+=59`
- FDV Metric row distribution inside target: `1=99`, `2+=59`
- strict `alertFdv` anchor within ±5m: `0`
- strict anchor missing: `158`
- before-side FDV Metric count: `0`
- after-side FDV Metric count: `158`

## Lag Distribution

The first FDV Metric after resolved `alertedAt` is available for every target
token, but it is usually far from `first_seen_detected_at`:

| First FDV Metric lag | Token count |
| --- | ---: |
| `<=5m` | `0` |
| `>5m <=15m` | `0` |
| `>15m <=30m` | `5` |
| `>30m <=60m` | `0` |
| `>60m <=120m` | `12` |
| `>120m <=180m` | `22` |
| `>180m <=360m` | `119` |
| `>360m` | `0` |
| no after Metric | `0` |

Cumulative after-side recovery if Notification tokens remain on the strict
policy and only mint-only fallback after-window is expanded:

- strict ±5m: `0 / 158`
- after `<=15m`: `0 / 158`
- after `<=30m`: `5 / 158`
- after `<=60m`: `5 / 158`
- after `<=120m`: `17 / 158`
- after `<=180m`: `39 / 158`
- after `<=360m`: `158 / 158`
- first after Metric regardless of lag: `158 / 158`

Representative strict no-anchor rows:

- `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump`: first FDV lag `230.61m`
- `G4qJ2GcVBkSEGa9D4Z7FhbHcZFSPaKxFyKiaw7K2pump`: first FDV lag `229.59m`
- `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump`: first FDV lag `207.83m`

Shortest lag examples:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`: first FDV lag `20.22m`
- `2k5wuRCdhL331w5mALdP34eejkQ3qQswykyipr3bpump`: first FDV lag `21.24m`
- `7PX9QAupWVnDQEREbufTwtTNwqRUfaxMs6ZJou4Tpump`: first FDV lag `22.26m`

Longest lag examples:

- `BCiYyqsMthUWhhSUA2ZBVGVXgLx99XnsroVrCn6Wpump`: first FDV lag `358.35m`
- `AcAt23nksfLZP2W6eQXx9BpRo4X3wtHNViifynUhpump`: first FDV lag `357.04m`
- `H9nDSPYvrbp5WDZT2xhsH3EV2SCexeBGFFTNf72ypump`: first FDV lag `355.74m`

## Policy Comparison

### Policy A: Keep Current Strict Alert FDV

Behavior:

- keep `alertFdv` as the closest FDV Metric within ±5m of resolved `alertedAt`
- if no near-entry Metric exists, outcome remains `no_data`

Pros:

- preserves strict meaning of alert-time FDV
- no risk of treating a delayed sample as an alert-time price
- Notification-backed outcomes remain clean and comparable

Cons:

- for the current no-Notification mint-only fallback target, `158 / 158`
  remain without `alertFdv`
- additional Metric accumulation improves coverage but does not by itself
  produce `flat` / `small_win` / `hit` / `big_hit`

### Policy B: Expand Mint-Only Fallback Search Window

Behavior:

- keep Notification-backed tokens on strict ±5m
- for `first_seen_detected_at` / imported / created fallback anchors, expand
  after-side lookup to a larger window such as 60m

Pros:

- keeps Notification semantics separate from mint-only fallback semantics
- simple to explain if the window is small

Cons:

- the observed data does not support 60m as sufficient: only `5 / 158` tokens
  would gain an anchor by 60m
- reaching the full cohort requires up to 360m, which weakens the meaning of
  "alert FDV"
- using an expanded value as `alertFdv` would blur strict alert-time and
  delayed first-observation semantics

### Policy C: Keep Alert FDV Strict, Add Derived Anchor Fields

Behavior:

- keep `alertFdv` and `outcomeLabel` unchanged
- add report-only computed fields for mint-only fallback, such as
  `entryAnchorFdv`, `entryAnchorObservedAt`, `entryAnchorLagMinutes`,
  `entryAnchorSource`, and `entryAnchorQuality`
- use the first FDV Metric after entry as a displayed baseline, not as
  `alertFdv`

Pros:

- avoids changing outcome semantics before policy is proven
- gives operators a concrete baseline and lag quality for all `158 / 158`
  target tokens
- makes the large-lag risk explicit instead of hiding it inside
  `outcomeLabel`
- can be implemented in `metrics:window-report` without schema changes

Cons:

- `outcomeLabel` stays `no_data` for no-Notification fallback rows
- operators must read separate baseline fields rather than relying only on
  `outcomeLabel`

### Policy D: Use Derived Anchor For Mint-Only Outcome

Behavior:

- keep Notification-backed tokens strict
- for no-Notification mint-only fallback only, use the first FDV Metric after
  entry as a baseline for `peakMultipleFromAlert` / `outcomeLabel`
- show `anchorLagMinutes` and `anchorQuality` prominently

Pros:

- would convert many no-Notification fallback rows from `no_data` into
  `flat` / `small_win` / `hit` / `big_hit`
- practical if operators accept "first observed FDV" rather than alert-time FDV

Cons:

- most anchors are delayed by 180m to 360m, so outcomes can be materially
  different from entry-time outcomes
- users may over-trust a label that is no longer based on alert-time FDV
- needs strong naming, quality labels, and possibly separate outcome labels
  before it is safe enough for operating decisions

## Recommendation

Next Yellow implementation should be Policy C.

Implement report-only derived anchor fields for no-Notification mint-only
fallback tokens while leaving these unchanged:

- `alertFdv`
- strict ±5m alert-FDV lookup
- `outcomeLabel`
- Notification-backed token behavior
- DB schema and persisted data

Suggested additive field names:

- `entryAnchorFdv`
- `entryAnchorObservedAt`
- `entryAnchorLagMinutes`
- `entryAnchorSource`, for example `first_fdv_after_entry`
- `entryAnchorQuality`, with simple buckets such as `near`, `delayed`, and
  `stale`

This gives operators enough context to judge whether a fallback token has a
usable baseline without reclassifying delayed first observations as alert-time
outcomes. Policy D can be reconsidered only after operators review derived
anchor quality and decide that delayed baselines are acceptable for a separate
fallback outcome mode.

## Implementation Result

Date: 2026-05-20

Policy C has been implemented in `metrics:window-report`.

Added report-only fields:

- `entryAnchorFdv`
- `entryAnchorObservedAt`
- `entryAnchorLagMinutes`
- `entryAnchorSource`
- `entryAnchorQuality`

The implementation keeps the following unchanged:

- strict ±5m `alertFdv` lookup
- `outcomeLabel` thresholds and calculation
- `peakMultipleFromAlert` calculation
- Notification-backed token semantics
- `noDataReasons`, `hasAlertFdvAnchor`, and `hasWindowFdvSamples`
- DB schema and persisted data

Runtime checks confirmed:

- short-lag no-Notification fallback row reports `entryAnchorQuality=near_30m`
  while `alertFdv=null` and `outcomeLabel=no_data` remain unchanged
- long-lag no-Notification fallback row reports `entryAnchorQuality=late_360m`
- Notification id `8` reports `entryAnchorQuality=none` because no FDV sample
  exists at or after `sentAt`
- Notification id `7` keeps `outcomeLabel=flat`; the entry anchor does not
  alter the alert-backed outcome

Next policy decision should be based on operator review of `entryAnchorQuality`
distribution. Do not promote entry anchor into outcome calculation until the
team accepts a separate fallback outcome mode for delayed first-observation
baselines.

## Entry Anchor Quality Cohort Review

Date: 2026-05-20

This Green review used the report-only `entryAnchor*` fields to decide whether
mint-only fallback outcomes should move from Policy C to Policy D. No
implementation, schema change, migration, Metric snapshot, detect watch,
external fetch, production DB write, Telegram send, Notification send/retry, or
rawJson full dump was executed.

Current DB state stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Target cohort:

- `Token.source=geckoterminal.new_pools`
- mint ends with `pump`
- `metadataStatus=mint_only`
- no Notification row
- at least one Metric
- at least one Metric with readable FDV

Read-only aggregation:

- target token count: `158`
- Metric distribution inside target: `1=99`, `2+=59`
- strict ±5m `alertFdv` anchor found: `0`
- strict anchor missing: `158`
- `hasWindowFdvSamples=true`: `158`
- `hasWindowFdvSamples=false`: `0`
- `hasAlertFdvAnchor=true`: `0`
- `hasAlertFdvAnchor=false`: `158`

`entryAnchorQuality` distribution:

| Quality | Token count |
| --- | ---: |
| `none` | `0` |
| `near_5m` | `0` |
| `near_30m` | `5` |
| `acceptable_60m` | `0` |
| `delayed_120m` | `12` |
| `delayed_180m` | `22` |
| `late_360m` | `119` |
| `very_late_gt_360m` | `0` |

`entryAnchorLagMinutes` distribution:

- min: `20.2184`
- median: `238.8762`
- p75: `308.4780`
- p90: `339.0626`
- max: `358.3537`

Hypothetical Policy D comparison, using the entry anchor as a derived baseline
only for no-Notification mint-only fallback rows:

| Hypothesis | Quality allowed | Usable tokens | Hypothetical labels | Risk |
| --- | --- | ---: | --- | --- |
| D30 | `near_5m`, `near_30m` | `5 / 158` | `flat=5` | low semantic risk, low impact |
| D60 | D30 plus `acceptable_60m` | `5 / 158` | `flat=5` | same as D30 in current data |
| D180 | through `delayed_180m` | `39 / 158` | `flat=39` | medium/high, anchors up to `179.35m` late |
| D360 | through `late_360m` | `158 / 158` | `flat=158` | high, median lag is about `239m` |

Representative runtime checks:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`: `near_30m`,
  `entryAnchorLagMinutes=20.218433333333333`, `alertFdv=null`,
  `outcomeLabel=no_data`
- no `acceptable_60m` sample existed in the current cohort
- `FnNvePHJSYw1ec6nDSbXBQxo8couvRWButKN8Zwepump`: `delayed_180m`,
  `entryAnchorLagMinutes=120.01455`, `alertFdv=null`,
  `outcomeLabel=no_data`
- `BCiYyqsMthUWhhSUA2ZBVGVXgLx99XnsroVrCn6Wpump`: `late_360m`,
  `entryAnchorLagMinutes=358.35365`, `alertFdv=null`,
  `outcomeLabel=no_data`
- Notification id `8`
  (`EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`) stayed
  `entryAnchorQuality=none` because no post-`sentAt` FDV sample exists
- Notification id `7`
  (`ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`) kept strict `alertFdv`
  and wider-window `outcomeLabel=flat`; the entry anchor was context only

Recommendation:

- Keep Policy C as the current operating policy.
- Do not promote `entryAnchor` into general outcome calculation.
- Do not implement D180 or D360; most current anchors are too delayed and would
  turn many rows into apparently useful `flat` labels based on late first
  observations.
- If a fallback outcome mode is implemented later, restrict it to a separate
  mint-only fallback path with an explicit D30 threshold
  (`near_5m` / `near_30m` only), a distinct field name, and visible
  `entryAnchorLagMinutes` / `entryAnchorQuality`.
- Keep strict `alertFdv`, strict ±5m lookup, and Notification-backed outcome
  behavior unchanged.

Next candidate: design a limited D30 fallback outcome mode before coding it, or
return to the Telegram operating slice. A broad Policy D implementation is not
recommended from the current cohort.
