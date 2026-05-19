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
