# Metric Report Readiness

Date: 2026-05-19

This runbook records the read-only confirmation that accumulated GeckoTerminal
Metric rows can be inspected through report / outcome CLI commands without
writing DB rows, fetching external APIs, sending Telegram, or dumping rawJson.

MVP completion note, 2026-06-03: report readiness is sufficient for personal
bounded-run MVP completion. The queue, blocker, watchlist, Metric, and
notification planner views are available and rawJson-free enough for manual
operation. Further report/dashboard polish belongs to Phase 2.

Phase 2 triage note, 2026-06-03: the first cleanup step should improve Metric
coverage before additional enrich/report work. Watchlist remains useful as
report-only evidence (`12` ready `B / 2` rows), but the next enrich candidates
are still Metric-zero. A targeted Metric pending snapshot for ids
`7477..7428` is the recommended first Red candidate if the operator wants data
progress before manual watchlist review.

Phase 2 enrich cleanup result, 2026-06-04: the targeted enrich cleanup for
ids `7477..7428` is now complete. All 50 rows moved to `partial` with
enrichment / rescore timestamps, reviewFlags, scoreBreakdown, and
GeckoTerminal context present. Existing Metric ids `2417..2466` remain the
latest rows and rawJson-free safe aggregation confirms price / FDV / reserve /
top-pool presence for `50 / 50`. Metaplex context is present for `1 / 50`.
Score distribution is `C / 0 = 48` and `B / 2 = 2`; `hardRejected=0`.
Selected Notification total and HolderSnapshot total stayed `0`, and no
Telegram send occurred. Rolling 168h watchlist increased to `14` ready `B / 2`
report-only rows. The next report-readiness step is Green post-run review and
lane decision, not automatic continuation.

Phase 2 enrich cleanup review, 2026-06-04: the post-run report review confirms
the 50 targeted rows are safe to inspect without rawJson. Representative ids
`7477`, `7453`, and `7428` are `partial`, have reviewFlags and scoreBreakdown
present, keep one latest GeckoTerminal Metric, and have no Notification or
HolderSnapshot rows. Target aggregate remains `C / 0 = 48`, `B / 2 = 2`,
`hardRejected=0`, with the two B rows treated as watchlist-only evidence.

Current rolling 168h watchlist is `13` ready `B / 2` rows after time-window
drift. `notifyCandidateCount=0` is expected because the notification rule is
still S-only and the reviewed rows are below that threshold. Safe blocker
review shows `rank_not_s` as the active reason for the reviewed target rows.
Read-only lane checks found more cleanup is possible, but the next
report-readiness task should be watchlist manual review / scoring evidence
gathering before more writes. If cleanup is preferred instead, use a separate
human-approved targeted enrich Red for the next clean `metricsCount=1` rows.

Phase 2 watchlist / scoring evidence review, 2026-06-04: rolling 168h
watchlist review is rawJson-free and safe for manual use, but the evidence is
not strong enough for scoring dictionary changes. The current watchlist is
`13` rows, all `B / 2`, `partial`, `metricsCount=1`, non-hard-rejected,
scoreBreakdown available, and ready for report-only review.

The score evidence is repetitive and low-strength: aggregate components are
mostly `core`, with a small learned contribution and no `trend` or `combo`
points. Safe tags are concentrated in low-strength buckets (`animal=27`,
`meme=3`, `social=3`, `ai_phrase=1`, `tech=1`). ReviewFlags are sparse:
only one watchlist row has Telegram / Metaplex / description / link presence,
and none has website or X presence. No row is close to A/S.

Keep B watchlist report-only. Do not change thresholds, add combo/trend
weights, create capture-only B Notifications, or loosen the S-only
notification rule from this sample. The next report-readiness improvement
should be operational cadence documentation or more data collection after a
fresh Green cleanup preflight.

Phase 2 cadence documentation, 2026-06-04: the operational cadence now lives in
`docs/runbooks/phase-two-operating-cadence.md`. Report readiness should feed
that cadence: review queues and blockers before Red, review watchlist after
enrich or bounded runs, and keep notification planner review separate from
send approval.

Targeted cleanup preflight, 2026-06-04: the next report-readiness data task is
Metric coverage, not enrich. The 10080 minute Metric preview selected clean
Metric-zero ids `7427..7378`; DB-only enrich simulation selected the same ids
and showed `metricsCount=0`, so enrich would not improve report readiness
until a Metric cleanup pass runs. Notification / Telegram planners remain
closed.

Targeted Metric cleanup continuation, 2026-06-04: report readiness gained
another 50 GeckoTerminal Metric rows. The approved out-of-sandbox Red wrote
Metric ids `2467..2516` for token ids `7427..7378`, with observedAt range
`2026-06-03T22:55:11.893Z..2026-06-03T23:07:58.536Z`. Safe summary
aggregation confirms `priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` for all 50 rows.

Selected rows moved to `metricsCount=1`; selected Notification and
HolderSnapshot totals stayed `0`. Metric count moved `1357 -> 1407`, while
Token, Notification, and HolderSnapshot counts stayed unchanged. Queue after
is default `metricPending=160`, `enrichPending=210`, `notifyCandidate=0`; 168h
`metricPending=160`, `enrichPending=370`, `notifyCandidate=0`. The next
report-readiness task should be Green post-run Metric/report review and
targeted enrich preflight for ids `7427..7378`.

That Green review is complete. Representative token ids `7427`, `7403`, and
`7378` map to Metric ids `2467`, `2491`, and `2516`; each has source
`geckoterminal.token_snapshot`, one Metric, no Notification rows, no
HolderSnapshot rows, and safe price / FDV / reserve / top-pool presence.
Target aggregate remains `mint_only=50`, `metricsCount=1=50`, `C / 0 = 50`,
`hardRejected=false=50`, and `reviewFlagsPresent=false=50`.

DB-only enrich simulation selects no rows in the 420 minute window after time
drift, but selects exactly ids `7427..7378` with `sinceMinutes=10080`. This is
a clean targeted enrich candidate for improving reportability; it should be a
separate network-enabled / out-of-sandbox Red with no `--notify`.

Targeted enrich cleanup continuation, 2026-06-04: the approved
network-enabled / out-of-sandbox safe enrich Red processed ids `7427..7378`.
It selected `50`, completed `ok=50` with `error=0`, and wrote Token
enrich/rescore/context updates for all selected rows. Token / Metric /
Notification / HolderSnapshot counts stayed `3383 / 1407 / 22 / 1`, while
metadata status moved to `mint_only=2501`, `partial=869`, `enriched=13`.

All selected rows are now `partial` with enrichment / rescore timestamps,
reviewFlags, scoreBreakdown, and GeckoTerminal context present. Existing
Metric ids `2467..2516` remain the latest rows and rawJson-free safe
aggregation confirms price / FDV / reserve / top-pool presence for `50 / 50`.
Metaplex context is present for `2 / 50`. Score distribution is
`C / 0 = 48`, `C / 1 = 2`; `hardRejected=0`.

Selected Notification total and HolderSnapshot total stayed `0`, no
Notification or Telegram execution occurred, and `notifyCandidateCount`
remains `0`. Rolling 168h is now `metricPending=160`, `enrichPending=320`,
`notifyCandidate=0`; watchlist remains `13` ready `B / 2` report-only rows.
The next report-readiness task should be Green post-run enrich/report review
and lane decision before another write.

That post-run review is complete. Representative ids `7427`, `7403`, and
`7378` are `partial`, have reviewFlags / scoreBreakdown / GeckoTerminal
context present, have one latest Metric, and retain Notification /
HolderSnapshot counts `0`. Latest Metric ids `2467`, `2491`, and `2516`
remain rawJson-free reportable with price / FDV / reserve / top-pool presence.

The target score distribution remains `C / 0 = 48`, `C / 1 = 2`, with
`hardRejected=0`. The two `C / 1` rows are ids `7427` and `7413`; safe
scoreBreakdown aggregate shows only low-strength `core` / `meme` evidence.
No target row entered watchlist, and all target rows remain below notification
eligibility with `rank_not_s`.

Current watchlist remains `13` ready `B / 2` rows, report-only. This review
does not justify scoring dictionary changes, capture-only B Notifications, or
notification policy changes. If more reportability is desired, the next clean
cleanup lane is targeted enrich: DB-only simulation selects ids `7018..6969`,
all `mint_only`, `metricsCount=1`, `C / 0`, non-hard-rejected, with no
Notification or HolderSnapshot rows.

Watchlist sample review, 2026-06-01: `--watchlistOnly` is suitable for
raw-text-free human review, but the current sample does not justify scoring
dictionary changes. The default 24h window has drifted to
`watchlistCandidateCount=0`; rolling 168h still has `14` watchlist rows,
`13` ready and `1` `missing_metric`. All rows are `B / 2`, partial, and not
close to the A or S thresholds.

Safe samples show repeated low-strength scoreBreakdown tags rather than a
clear missed narrative. The rolling 168h aggregate has tags `animal=31`,
`ai_phrase=2`, `tech=1`, `meme=2`, and `social=3`; visible watchlist rows are
mostly `core` source with `animal` tags, plus one `tech` sample. ReviewFlags
remain absent across watchlist rows. This is useful for manual triage, but not
enough evidence to raise weights or change thresholds.

Keep the B watchlist report-only. More useful next steps are data collection
or backlog preflight to grow the sample, followed by another Green review.
Do not add capture-only B Notifications or change Telegram / notifyCandidate
rules from this evidence.

Backlog preflight follow-up, 2026-06-01: report/watchlist review is not the
next Red because the default window has drifted clear and the watchlist sample
is still small. Rolling 168h remains the useful operating window:
`metricPendingCount=1017`, `enrichPendingCount=1013`, and
`notifyCandidateCount=0`. A rawJson-free Metric selection preview with
`sinceMinutes=10080` selected `50` Metric-zero rows, ids `7017..6968`, with
no Notification or HolderSnapshot rows. Enrich simulation selected `50` rows,
ids `7068..7019`, all with one Metric row and no Notification or
HolderSnapshot rows. Choose Metric backlog continuation first to improve data
coverage before more report/scoring review; keep B watchlist report-only and
Telegram / notifyCandidate S-only.

Network-enabled enrich continuation update, 2026-06-03: the latest approved
small enrich/rescore Red selected ids `7028..7019` and moved all 10 from
`mint_only` to `partial` without `--notify`. Each row now has enrichment /
rescore timestamps, reviewFlags, GeckoTerminal context, one existing
GeckoTerminal Metric (`2055..2064`), and rawJson-free safe Metric booleans
present for price / FDV / reserve / top pool. All 10 stayed score `C / 0`,
non-hard-rejected, with `notificationCount=0` and `holderSnapshotCount=0`.
Metaplex lookup was attempted for all 10 and returned
`metadata_account_missing=10`, so no Metaplex context was saved. Token update
was the only write class; Metric, Notification, HolderSnapshot, Telegram,
retry, auto-send, scheduler/systemd, and rawJson full dump stayed `0`.

The Green post-run report review for `7028..7019` confirmed the rows are
reportable but intentionally low priority: scoreBreakdown is present for all
10, yet core / learned / trend / combo hits are all `0`, reviewFlags have no
website, X, Telegram, Metaplex, description, or link signals, and all 10 stay
`C / 0`. This explains why no notify candidate appears. Rolling 168h still has
`11` B-watchlist rows, all ready for manual review and all below notification
eligibility. Report/readiness work is sufficient for MVP visibility; the next
runtime gap is the network-enabled 6H bounded runner validation rather than
more report fields.

The 6H bounded runner preflight did not add report evidence because it stayed
plan-only. It did confirm the future Red will include a report-review phase
after detect, Metric, and enrich phases, and the notification phase remains
planner-only. Keep report commands rawJson-free in the post-run Green review
after that future bounded runner execution.

Network-enabled 6H bounded runner result, 2026-06-03: report readiness gained
100 fresh GeckoTerminal Metric rows and 100 freshly enriched/rescored Token
rows from the approved bounded runner validation. Metric ids `2317..2416`
correspond to token ids `7478..7577`, with observedAt range
`2026-06-03T09:36:14.454Z` to `2026-06-03T10:01:40.359Z`. RawJson-free safe
aggregation confirmed `priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` for all 100 new Metrics.

The same 100 tokens moved to `metadataStatus=partial` with GeckoTerminal
context and reviewFlags present for all 100. Metaplex context was present for
2 rows. Score distribution was `C / 0 = 94`, `C / 1 = 2`, and `B / 2 = 4`;
hardRejected count was `0`. No selected token had Notification or
HolderSnapshot rows. The runner's report-review and notification-plan-review
phases completed, and post-run `--watchlistOnly` now shows 12 ready B/2 rows
for report-only human review. `notifyCandidateCount` remains `0`, which is
expected because the notify path remains S-only and no S rows were observed.

Post-run Green review confirmed the same evidence without adding new rows.
Representative Metric ids `2317`, `2367`, and `2416` all report source
`geckoterminal.token_snapshot` and safe price / FDV / reserve / top-pool
presence. Representative Token ids `7478`, `7528`, and `7577` remain partial,
with reviewFlags and GeckoTerminal context, one Metric, no Notification rows,
and no HolderSnapshot rows. The next report-readiness data collection slice,
if any, should be a targeted Metric pending snapshot for ids `7477..7428`;
targeted enrich is not useful in the 420 minute buffered window because no
mint-only rows there currently have Metric coverage.

The subsequent Metric backlog Red did not produce new Metric evidence. The
exact command was attempted once, but package-script `tsx` failed before app
logic with an IPC pipe `EPERM`, so no external fetch, Metric write, observedAt,
new Metric id, Token update, Notification update, HolderSnapshot write,
Telegram send, retry, or rawJson dump occurred. Report readiness is therefore
unchanged; current report/watchlist conclusions still depend on the existing
`956` Metric rows. Run a fresh Green preflight before another data-collection
Red.

Safe CLI execution follow-up: future Codex Red data-collection prompts should
use the safe `node --import tsx` path, for example
`metric:snapshot:geckoterminal:safe`, before expecting new Metric evidence.
This changes only the process launch path; report readiness, rawJson
boundaries, Notification / Telegram policy, and scoring/watchlist behavior are
unchanged.

Safe Metric preflight on 2026-06-01 confirms the next report-readiness data
collection step can be issued as a Red candidate. The safe alias preview is
write-free, fetch-free, and selected `50` Metric-zero rows with no
Notification or HolderSnapshot rows. Until that Red actually succeeds, report
readiness still depends on the existing `956` Metric rows.

The safe Red did not add report evidence. It reached app logic but all `50`
provider fetches failed, so Metric count stayed `956`, selected rows stayed
`metricsCount=0`, and there are no new Metric ids or observedAt values to
inspect. Report readiness and B-watchlist conclusions are unchanged; the next
step should be provider/error review or a fresh Green data-collection
preflight, not scoring or notification policy changes.

Provider/error review confirms report readiness remains unchanged because the
failure happened before Metric candidate construction. No safe market-data
booleans or observedAt values exist for ids `7017..6968`. Since the CLI does
not yet classify fetch-layer causes beyond `fetch failed`, the next useful
Yellow is provider error visibility rather than scoring, notification, or
watchlist changes.

That provider error visibility is now implemented. Future Metric snapshot
reviews can use `errorCategoryCounts` and per-item safe `errorCategory` values
to tell network/fetch failures, timeouts, HTTP 429, other HTTP errors,
parse/shape failures, provider-empty results, and unknown errors apart. This
does not create report evidence by itself and does not change retry, write,
Notification, Telegram, scoring, or watchlist behavior. The next report
readiness step is to observe classified output in a Green preflight or a
narrowly approved diagnostic Red, then decide whether new Metric rows can be
collected safely.

The classified-output Green preflight observed only selection-preview rows, so
report readiness remains unchanged. Limit `5` and limit `50` previews showed
the new provider aggregate fields with zero errors and no rawJson, but no
provider request was made and no Metric candidate was constructed. A limit `1`
diagnostic Red is the narrowest next step if provider classification is needed;
otherwise continue report/watchlist decisions from the existing Metric set.

The limit `1` diagnostic Red also produced no new report evidence. It selected
id `7017`, but provider fetch failed before HTTP response and no Metric row was
created. Classification is now available (`network_fetch_error`), but report
readiness still depends on the existing `956` Metric rows. Do not interpret
the failure as a scoring/watchlist issue; it is a provider/network diagnostic
issue until reachability is resolved or bypassed by a different data path.

The provider/network review confirmed no additional Metric evidence should be
expected from in-sandbox retries. The sandbox cannot resolve the GeckoTerminal
host, while non-sandbox diagnostics can reach it. Report readiness remains
unchanged until a network-enabled Metric path succeeds or another data path is
chosen. This does not change scoring, watchlist, Notification, or Telegram
policy.

Network-enabled Metric diagnostic, 2026-06-02: report readiness gained one new
GeckoTerminal Metric row. The approved out-of-sandbox limit `1` Red wrote
Metric id `2066` for token id `7017` at
`observedAt=2026-06-02T10:47:11.851Z`. `metrics:report -- --tokenId 7017
--limit 1` confirms the row rawJson-free with `volume24h=0` and
`priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
`topPoolPresent=true`. `token:show` confirms the selected mint remains
`mint_only`, score `C / 0`, with `metricsCount=1`. Notification / Telegram,
Token, HolderSnapshot, retry, auto-send, scheduler/systemd, and rawJson dump
side effects stayed `0`.

Network-enabled backlog preflight, 2026-06-02: no additional report evidence
was created in the Green limit `50` preflight. The safe preview selected ids
`7016..6967` for potential data collection, all with `metricsCount=0`,
`notificationCount=0`, and `holderSnapshotCount=0`, but remained
`dryRun=true`, `writeEnabled=false`, fetch-free, write-free, and rawJson-free.
If the next human-approved network-enabled Red succeeds, report readiness
should be revisited against the newly created Metric rows.

Network-enabled backlog result, 2026-06-02: report readiness gained 50 new
GeckoTerminal Metric rows. The approved out-of-sandbox limit `50` Red wrote
Metric ids `2067..2116` for token ids `7016..6967`, with observedAt range
`2026-06-02T11:19:27.532Z` to `2026-06-02T11:32:15.615Z`. `metrics:report`
and a rawJson-free aggregate check confirmed the latest rows expose
`priceUsdPresent`, `fdvUsdPresent`, `reserveUsdPresent`, and `topPoolPresent`
for all 50. The selected tokens all moved to `metricsCount=1`; Notification
and HolderSnapshot counts stayed `0`. Metric count moved `957 -> 1007`, while
Token / Notification / HolderSnapshot counts, Telegram, retry, auto-send,
scheduler/systemd, and rawJson dump stayed unchanged. Next readiness work
should inspect these 50 rows in reports before another backlog Red.

Network-enabled continuation result, 2026-06-02: report readiness gained
another 50 GeckoTerminal Metric rows. The approved out-of-sandbox continuation
Red wrote Metric ids `2117..2166` for token ids `6966..6917`, with observedAt
range `2026-06-02T14:20:28.829Z` to
`2026-06-02T14:33:24.017Z`. RawJson-free aggregate checks and representative
`metrics:report` output confirmed `priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` for all 50 new rows. Metric count
moved `1007 -> 1057`; selected tokens all moved to `metricsCount=1`;
Notification and HolderSnapshot counts stayed `0`. Next readiness work should
again be Green report/queue review before another Metric backlog Red.

Network-enabled continuation result, 2026-06-03: report readiness gained
another 50 GeckoTerminal Metric rows. The approved out-of-sandbox continuation
Red wrote Metric ids `2167..2216` for token ids `6916..6867`, with observedAt
range `2026-06-02T19:39:47.533Z` to
`2026-06-02T19:52:35.436Z`. RawJson-free aggregate checks and representative
`metrics:report` output confirmed `priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` for all 50 new rows. Metric count
moved `1057 -> 1107`; selected tokens all moved to `metricsCount=1`;
Notification and HolderSnapshot counts stayed `0`. Next readiness work should
again be Green report/queue review before another Metric backlog Red.

Network-enabled continuation result, 2026-06-03: report readiness gained
another 50 GeckoTerminal Metric rows. The approved out-of-sandbox continuation
Red wrote Metric ids `2217..2266` for token ids `6866..6859` plus
`6758..6717`, with observedAt range `2026-06-02T20:20:43.280Z` to
`2026-06-02T20:33:32.344Z`. RawJson-free aggregate checks and representative
`metrics:report` output confirmed `priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` for all 50 new rows. Metric count
moved `1107 -> 1157`; selected tokens all moved to `metricsCount=1`;
Notification and HolderSnapshot counts stayed `0`. Next readiness work should
again be Green report/queue review before another Metric backlog Red.

Network-enabled continuation result, 2026-06-03: report readiness gained
another 50 GeckoTerminal Metric rows. The approved out-of-sandbox continuation
Red wrote Metric ids `2267..2316` for token ids `6716..6667`, with observedAt
range `2026-06-02T21:06:59.052Z` to
`2026-06-02T21:19:47.722Z`. RawJson-free aggregate checks and representative
`metrics:report` output confirmed `priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` for all 50 new rows. Metric count
moved `1157 -> 1207`; selected tokens all moved to `metricsCount=1`;
Notification and HolderSnapshot counts stayed `0`. Next readiness work should
be Green report/queue review with an explicit choice between another Metric
backlog batch and the enrich/report lane.

Network-enabled enrich/rescore result, 2026-06-03: report readiness gained
Token context for 10 GeckoTerminal-origin rows. The approved out-of-sandbox
enrich/rescore Red selected ids `7068..7059`, all with one existing
GeckoTerminal Metric and no Notification or HolderSnapshot rows. The command
updated all 10 from `mint_only` to `partial`, wrote GeckoTerminal context and
reviewFlags, and set enriched/rescored timestamps. No Metric rows were
created; latest Metric ids remained `2015..2024`.

The run returned `selected=10`, `ok=10`, `error=0`,
`enrichWriteCount=10`, `rescoreWriteCount=10`, `contextWriteCount=10`,
`metaplexAttemptedCount=10`, `metaplexAvailableCount=0`,
`notifyWouldSendCount=0`, and `notifySentCount=0`. One selected row became
hard-rejected after rescore; no row became a Notification candidate.
Notification / Telegram, Metric, HolderSnapshot, retry, auto-send,
scheduler/systemd, rawJson full dump, and `pnpm smoke` stayed `0`. Next
readiness work should inspect these 10 updated rows before another enrich Red
or lane change.

Network-enabled enrich/rescore continuation, 2026-06-03: report readiness
gained Token context for another 10 GeckoTerminal-origin rows. The approved
out-of-sandbox enrich/rescore Red selected ids `7058..7049`, all with one
existing GeckoTerminal Metric and no Notification or HolderSnapshot rows. The
command updated all 10 from `mint_only` to `partial`, wrote GeckoTerminal
context and reviewFlags, and set enriched/rescored timestamps. No Metric rows
were created; latest Metric ids remained `2025..2034`.

The run returned `selected=10`, `ok=10`, `error=0`,
`enrichWriteCount=10`, `rescoreWriteCount=10`, `contextWriteCount=10`,
`metaplexAttemptedCount=10`, `metaplexAvailableCount=0`,
`notifyWouldSendCount=0`, and `notifySentCount=0`. No selected row became
hard-rejected and no row became a Notification candidate. Notification /
Telegram, Metric, HolderSnapshot, retry, auto-send, scheduler/systemd,
rawJson full dump, and `pnpm smoke` stayed `0`. Next readiness work should
inspect these 10 updated rows before another enrich Red or lane change.

Network-enabled enrich/rescore continuation, 2026-06-03: report readiness
gained Token context for another 10 GeckoTerminal-origin rows. The approved
out-of-sandbox enrich/rescore Red selected ids `7048..7039`, all with one
existing GeckoTerminal Metric and no Notification or HolderSnapshot rows. The
command updated all 10 from `mint_only` to `partial`, wrote GeckoTerminal
context and reviewFlags, and set enriched/rescored timestamps. No Metric rows
were created; latest Metric ids remained `2035..2044`.

The run returned `selected=10`, `ok=10`, `error=0`,
`enrichWriteCount=10`, `rescoreWriteCount=10`, `contextWriteCount=10`,
`metaplexAttemptedCount=10`, `metaplexAvailableCount=0`,
`notifyWouldSendCount=0`, and `notifySentCount=0`. One selected row became
hard-rejected with safe reason `Matched HARD_NG: scam`; no row became a
Notification candidate. Notification / Telegram, Metric, HolderSnapshot,
retry, auto-send, scheduler/systemd, rawJson full dump, and `pnpm smoke`
stayed `0`. Next readiness work should inspect these 10 updated rows before
another enrich Red or lane change.

Network-enabled enrich/rescore continuation, 2026-06-03: report readiness
gained Token context for another 10 GeckoTerminal-origin rows. The approved
out-of-sandbox enrich/rescore Red selected ids `7038..7029`, all with one
existing GeckoTerminal Metric and no Notification or HolderSnapshot rows. The
command updated all 10 from `mint_only` to `partial`, wrote GeckoTerminal
context and reviewFlags, and set enriched/rescored timestamps. No Metric rows
were created; latest Metric ids remained `2045..2054`.

The run returned `selected=10`, `ok=10`, `error=0`,
`enrichWriteCount=10`, `rescoreWriteCount=10`, `contextWriteCount=10`,
`metaplexAttemptedCount=10`, `metaplexAvailableCount=1`,
`notifyWouldSendCount=0`, and `notifySentCount=0`. No selected row became
hard-rejected and no row became a Notification candidate; one selected row
gained Metaplex context. Notification / Telegram, Metric, HolderSnapshot,
retry, auto-send, scheduler/systemd, rawJson full dump, and `pnpm smoke`
stayed `0`. Next readiness work should inspect these 10 updated rows before
another enrich Red or lane change.

Watchlist-only review mode, 2026-06-01: use
`review:queue:geckoterminal -- --pumpOnly --limit <N> --watchlistOnly` when
the operating question is limited to B/A watchlist review. The option implies
the same safe blocker/watchlist visibility as `--includeBlockers`, but omits
the unrelated queue groups and returns safe `watchlistRows` plus focused
summary fields.

The focused output includes watchlist counts, readiness reasons, rank/score
distributions, Metric and metadata coverage, scoreBreakdown availability,
rank gap to S, and safe per-row scoreBreakdown component/source/tag counts.
It still does not expose raw names, raw symbols, normalizedText, raw keywords,
rawJson, entrySnapshot, reviewFlagsJson, or offensive raw text.

Runtime checks returned the same state as the readiness review: default 24h
has `watchlistCandidateCount=7` and `watchlistReadyCount=7`; rolling 168h has
`watchlistCandidateCount=14`, `watchlistReadyCount=13`, and one
`missing_metric` row. The option is report-only; it does not change
notifyCandidate, Telegram, Notification, DB, or scoring behavior.

Watchlist readiness review, 2026-05-31: the new readiness output is usable as
a human review lane. Default 24h has `7` B-watchlist rows and all are
`ready_for_review`; rolling 168h has `14` B-watchlist rows, with `13` ready
and one `missing_metric`. The readiness definition is sufficient for report
triage: partial/enriched context, Metric coverage, scoreBreakdown availability,
no existing Notification/HolderSnapshot, and no hard reject. Social, website,
Metaplex, and description signals should remain visibility fields, not
readiness requirements, because the current watchlist would otherwise collapse
to zero before human review.

The scoreBreakdown availability reason output is also sufficient for now.
Default 24h has `available=149` and `unavailable_mint_only=210`; rolling 168h
has `available=424` and `unavailable_mint_only=1013`. Both windows have
`unavailable_legacy_or_unknown=0`, so there is no evidence of legacy/report
loss in the current queue. More unavailable rows should be handled by future
data collection or enrich/rescore backlog work, not by report code changes.

Keep the B watchlist report-only. It is useful for manual sample review, but
all watchlist rows are still `B / 2`, far below notify thresholds. If operator
review becomes cumbersome, add a narrow `--watchlistOnly` report option rather
than changing scoring or notification behavior.

Watchlist readiness update, 2026-05-31: `review:queue:geckoterminal
--includeBlockers` now reports whether B/A watchlist rows are ready for human
review and why scoreBreakdown is unavailable. Readiness is a report-only
signal, not a notification rule. It uses safe fields: rank, hard reject state,
metadataStatus, Metric coverage, Notification/HolderSnapshot counts, and
scoreBreakdown availability.

The default 24h runtime report has `watchlistCandidateCount=7`,
`watchlistReadyCount=7`, `watchlistNotReadyCount=0`, all B/2, all partial,
all `metricsCount=1`, and scoreBreakdown availability `available=7`.
Rolling 168h has `watchlistCandidateCount=14`, `watchlistReadyCount=13`,
`watchlistNotReadyCount=1`, with `missing_metric=1`. ScoreBreakdown
availability reasons show default `available=149`,
`unavailable_mint_only=210`, and rolling 168h `available=424`,
`unavailable_mint_only=1013`, with `unavailable_legacy_or_unknown=0` in both
windows. The gap is still backlog/enrichment maturity, not raw report loss.

The output remains raw-text-free: no rawJson, entrySnapshot, reviewFlagsJson,
normalizedText, raw keywords, names/symbols in samples, offensive raw text, or
Notification/Telegram side effects. `notifyCandidate` remains S-only and
Telegram remains S-only.

Report / notifyCandidate review, 2026-05-31: after the enrich/rescore
continuation, representative recently enriched rows `7117`, `7110`, and
`7069` were checked with rawJson-free `metrics:report` and
`metrics:window-report`. Each has one `geckoterminal.token_snapshot` Metric
with price / FDV / reserve / topPool presence true, and each window report is
readable with `metricCount=1`, `fdvMetricCount=1`, and
`entryAnchorQuality=late_360m`. The current 49-row enriched cohort
`7117..7069` is `C=44`, `B=5`, `S=0`, `A=0`; hardRejected `3`; reviewFlags
count `0=48`, `4=1`; all have `metricsCount=1`, `notificationCount=0`, and
`holderSnapshotCount=0`.

This explains the current notification silence. `notifyCandidate` is not
blocked by report readability; it is blocked by rank. The current queue logic
requires `scoreRank === "S"` and `hardRejected=false`, while this cohort has no
S-rank rows and no global non-hard-rejected S/A rows are present. Missing
descriptions, social links, and mostly missing Metaplex metadata are useful
diagnostic signals, but the immediate blocker is that scores remain B/C. The
next useful step is a Yellow report/scoring visibility improvement rather than
another Metric or enrich Red.

That visibility improvement is now available through the read-only
`review:queue:geckoterminal --includeBlockers` option. It does not change the
current notify rule; it explains it. The report mirrors
`scoreRank === "S" && hardRejected=false` and emits per-row
`notifyCandidateEligible`, `notifyCandidateBlockers`, and `rankGapToNotify`,
plus score totals, hard reject reason, safe reviewFlags summary, Metric count,
Notification count, and HolderSnapshot count. Summary output includes
scoreRank, scoreTotal, metadataStatus, metricsCount, hardRejected,
notifyCandidate eligibility/blocker, and reviewFlags presence distributions.

Current read-only runtime with `--pumpOnly --limit 20 --includeBlockers`
showed the default 24h Gecko queue has `notifyCandidateEligibleCount=0`,
`rank_not_s=359`, and `hard_rejected=7`; ranks are `C=352`, `B=7`. The sparse
reviewFlags/social/Metaplex/description presence is now visible, but those
signals are not invented as blockers unless the queue rule uses them. This
slice ran no production write/fetch/send, no Notification create/update, no
Telegram send, no schema/migration change, no rawJson full dump, and no
`pnpm smoke`.

The follow-up Green review used the same option for default 24h and rolling
168h queues. The broader 168h view has `C=1423`, `B=14`, no A/S, and
`notifyCandidateEligibleCount=0`. Source inspection confirmed the current
rank thresholds are `B>=2`, `A>=5`, and non-trend-only `S>=8`; the current B
rows sit at `scoreTotal=2`, so they are not near S. The next report
improvement should therefore expose safe score-breakdown source/tag summaries
and a B-rank watchlist rather than changing scoring dictionaries or notify
conditions immediately. HardReject should also remain unchanged until a safe
review shows overly broad matches; this pass did not print raw hardReject
terms or raw token text.

The next Yellow visibility pass extended that same option with a read-only
B/A watchlist, rank-gap summary, and safe scoreBreakdown aggregate. Default
24h watchlist count is `7`, all `B / 2`, all with `metricsCount=1`; rolling
168h watchlist count is `14`, all `B / 2`, with Metric coverage `1=13` and
`0=1`. Watchlist rows are not notification candidates and do not create or
update Notifications.

ScoreBreakdown is now summarized by safe components and source/tag categories
only. Default 24h has scoreBreakdown available for `149` rows and unavailable
for `210`; component totals are `core=27`, `learned=1`, `trend=0`, `combo=0`.
Rolling 168h has `availableCount=424`, `unavailableCount=1013`, component
totals `core=48`, `learned=5`, `trend=0`, `combo=0`. No raw keywords,
normalized text, rawJson, entrySnapshot, or reviewFlagsJson are emitted by the
new summary.

The first Green review of that output recommends more report refinement before
scoring changes. Watchlist rows are all `B / 2`, not close to the current
`A>=5` or non-trend-only `S>=8` thresholds; default watchlist rows all have one
Metric but no reviewFlags/social/Metaplex/description/link signals. The
scoreBreakdown unavailable count aligns with `mint_only` rows, so the next
useful report improvement is to show watchlist readiness and scoreBreakdown
availability by metadata status and Metric coverage. Keep the watchlist
report-only until stronger evidence exists.

Latest report check, 2026-05-31: after the second Skill-guarded post-run
Metric pending continuation, selected ids `7067..7018` all have
`metricsCount=1` and new Metric ids `2016..2065`. Representative rawJson-free
`metrics:report` checks for ids `7067`, `7042`, and `7018` each returned one
Metric from `geckoterminal.token_snapshot` with price / FDV / reserve /
top-pool present. The write command selected `50`, wrote `50`, skipped `0`,
errored `0`, used `interItemDelayMs=15000` with `49` delays, and observed no
provider error or 429. Notification capture was disabled; Notification
create/update, Telegram send, HolderSnapshot write, Token write, retry
execution, auto live send, scheduler/systemd, rawJson full dump, offensive raw
text dump, and `pnpm smoke` remained `0`.

Follow-up Green preflight on HEAD `c4a8c48` confirmed no further report proof
is needed before moving to Token context. The exact Metric continuation command
with `--sinceMinutes 420` selected `0` rows, while Prisma read-only
enrich/rescore simulation selected ids `7117..7068`; all `50` selected rows
already have one Metric row and no Notification / HolderSnapshot rows. The
next report-safe Red candidate is the Token-context command
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --interItemDelayMs 15000 --write`
with no `--notify`; expected Metric write, Notification create/update,
HolderSnapshot write, Telegram send, retry execution, auto live send,
scheduler/systemd, rawJson full dump, offensive raw text dump, and
`pnpm smoke` remain `0`.

That Token-context Red subsequently ran and did not change Metric report
coverage. It selected token ids `7117..7069`, all of which already had
`metricsCount=1`, and updated them from `mint_only` to `partial`; id `7068`
aged out of the 420 minute window and remained unselected. Metric count stayed
`956`, Metric buckets stayed `0=2207`, `1=729`, `2+=87`, and selected rows
kept `notificationCount=0` / `holderSnapshotCount=0`. Report CLIs remain
read-only and rawJson-free; any next report decision should happen in a fresh
Green pass after the docs commit.

Latest report check, 2026-05-26: after the post-6H Metric pending snapshot
limit 50 Red, selected ids `6067..6018` all have `metricsCount=1` and Metric
ids `1666..1715`. Representative rawJson-free `metrics:report` checks for ids
`6067`, `6042`, and `6018` each returned one Metric with price / FDV /
reserve / top-pool present. Representative `metrics:window-report` checks for
id `6067` and id `6018` are readable and rawJson-free: both have
`metricCount=1`, `fdvMetricCount=1`, `outcomeLabel=no_data`, and thin FDV
samples in later windows. id `6067` has `entryAnchorQuality=delayed_180m`;
id `6018` has `entryAnchorQuality=late_360m`.

Metric acquisition confirmation is now sufficient for the post-6H cohort. The
next bounded workflow step is Token enrich/rescore preflight and then a
human-approved enrich Red, not more Metric proof. The proposed enrich command
is `pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --write`
with no `--notify`; it should update Token context only and should not write
Metric rows, create/update Notifications, write HolderSnapshot rows, or send
Telegram.

As of 2026-05-27, `ops:run:bounded` can plan the full bounded post-detect
pipeline in one place. Its plan-only output includes a Metric pending snapshot
phase and then an enrich/rescore phase, both using
`computedSinceMinutes = hours * 60 + postRunBufferMinutes`. With the defaults,
6h operation emits `--sinceMinutes 420` for those post-run phases. The runner
still does not append Metrics or enrich Tokens unless a separate
human-approved `--execute` run is used; production execute was not run during
implementation.

The runner now also supports explicit post-run cycles:
`--postRunMetricCycles <N>` and `--postRunEnrichCycles <N>`. Defaults are
`1 / 1`, preserving the original report/readiness boundary. Plan-only mode
shows repeated Metric/enrich command candidates and max future write/update
coverage; it still performs no external fetch and writes no DB rows.

The first multi-cycle execute preflight chose `--postRunMetricCycles 2` and
`--postRunEnrichCycles 2`. In a future approved Red this can write up to 100
Metric rows before enrich/rescore and then update up to 100 Tokens. The report
phase remains read-only queue review after the write phases; it must stay
rawJson-free and must not create/update Notifications or send Telegram.

The follow-up multi-cycle Red attempted the approved runner command once, but
report review was not reached. `detect_write` failed immediately before
app-level fetch/write because the child `tsx` process hit `listen EPERM` on
its IPC pipe under `/tmp/tsx-1000`. Metric cycles executed `0`, enrich cycles
executed `0`, and report/notification phases were skipped. DB counts,
Metric buckets, Notification statuses, queue counts, and checkpoint state were
unchanged; no rawJson full dump or offensive raw text dump was used.

The bounded runner now avoids that child `tsx` IPC path for write phases.
Execute mode invokes detect / Metric / enrich CLI files with
`node --import tsx` while leaving the plan-only command candidates unchanged.
Report review remains read-only and rawJson-free. Production execute, Metric
write, Token enrich/rescore write, notification send, and `pnpm smoke` were
not run during this fix.

Fixed-runner execute preflight is complete. The next approved Red will run
two Metric cycles before two enrich cycles. Report review remains a read-only
phase after those write phases, and notification planner review remains
read-only. The Metric candidates still include `--onlyMetricPending`,
`--noNotificationCapture`, and `--interItemDelayMs 15000`; enrich candidates
still omit `--notify`. This Green pass did not execute, fetch, write, send,
or dump rawJson.

The 2026-05-27 execute preflight kept report/review bounded and read-only.
The candidate runner command will execute Metric pending snapshot before
enrich/rescore, then run review queue and notification planner checks as
read-only phases. Report phases must remain rawJson-free. Expected Metric
write is at most 50 from the Metric phase; expected Notification create/update,
Telegram send, HolderSnapshot write, retry execution, auto live send,
scheduler/systemd, rawJson full dump, and offensive raw text dump are all `0`.

The 2026-05-27 execute run confirmed that boundary. Metric pending snapshot
wrote Metric ids `1716..1765` (`Metric +50`) before enrich/rescore, and the
report phase ran as read-only queue review. Post-run queues show default 24h
`metricPendingCount=309`, `enrichPendingCount=309`,
`staleReviewCount=212`, `notifyCandidateCount=0`, and rolling 168h
`metricPendingCount=598`, `enrichPendingCount=543`,
`staleReviewCount=501`, `notifyCandidateCount=0`. No rawJson full dump or
offensive raw text dump was used in docs/final summaries.

The fixed multi-cycle runner execute later confirmed the same report boundary
at a larger bounded size. Metric pending snapshot ran two cycles and wrote
Metric ids `1766..1865` (`Metric +100`) before enrich/rescore; report review
ran only queue/planner reads. Post-run queues show default 24h
`metricPendingCount=569`, `enrichPendingCount=569`,
`staleReviewCount=365`, `notifyCandidateCount=0`, and rolling 168h
`metricPendingCount=858`, `enrichPendingCount=803`,
`staleReviewCount=654`, `notifyCandidateCount=0`. No rawJson full dump or
offensive raw text dump was used.

The 2026-05-28 Green review updated the live queue view after time advanced:
default 24h now shows `metricPendingCount=560`, `enrichPendingCount=560`,
`staleReviewCount=541`, `notifyCandidateCount=0`; rolling 168h shows
`metricPendingCount=858`, `enrichPendingCount=803`, `staleReviewCount=839`,
`notifyCandidateCount=0`. This confirms report/notification candidates remain
quiet; the next improvement should be runner progress logging, not a report or
notification Red.

The runner progress logging improvement is now implemented. It does not change
report semantics: report review is still read-only, rawJson-free queue/planner
inspection after write phases. Execute mode now emits compact phase/cycle
progress and final summary lines to stderr while leaving the structured JSON
report on stdout. Metric cycle logs include selected/written/skipped/error and
delay counters when available; enrich cycle logs include
selected/enriched/rescored/error and notification-send counters when
available. Final summary includes safe totals and stopped reasons.

The logging path intentionally excludes rawJson, `stdoutTail`, `stderrTail`,
offensive raw text, and large token payloads. Verification used TypeScript,
runner tests, planner/help tests, CLI help, plan-only runner output,
notification planners, retry planner, and read-only queue only; no production
execute, Metric write, Token enrich/rescore write, notification send, external
fetch, or `pnpm smoke` was run.

The progress-logged execute preflight is also report-safe. Plan-only output
for checkpoint `/tmp/lowcap-bot-6h-pipeline-logging-20260528.json` is
unblocked with two Metric cycles and two enrich cycles. Metric command
candidates keep `--onlyMetricPending --noNotificationCapture
--interItemDelayMs 15000`; enrich candidates keep `--interItemDelayMs 15000`
and omit `--notify`. Report review remains read-only queue inspection after
the write phases. The next Red can write up to 100 Metrics and update up to
100 Tokens, but expected Notification create/update, Telegram send,
HolderSnapshot write, retry execution, auto live send, scheduler/systemd,
rawJson full dump, offensive raw text dump, and `pnpm smoke` remain `0`.

The progress-logged execute Red reached report review and notification planner
review after writing reportable Metric rows. Metric count moved `756 -> 856`;
DB time-window checks confirmed Metric cycle writes of `50 + 50`. Report
queues after the run showed default 24h `metricPendingCount=259`,
`enrichPendingCount=259`, `staleReviewCount=56`, `notifyCandidateCount=0`;
rolling 168h showed `metricPendingCount=1117`, `enrichPendingCount=1062`,
`staleReviewCount=914`, `notifyCandidateCount=0`. Post-run planner now
recommends the next bounded `metric_pending_snapshot` slice. Notification
create/update, Telegram send, HolderSnapshot write, retry execution, auto live
send, scheduler/systemd, rawJson full dump, and offensive raw text dump remain
out of scope.

That enrich Red later ran once and produced a partial result. It selected ids
`6087..6038`, updated ids `6087..6083` from `mint_only` to `partial`, then hit
HTTP 429 at id `6082` and aborted the remaining 44 rows. Summary:
`selected=50`, `enriched=5`, `rescored=5`, `contextWritten=5`, `error=1`,
`rateLimited=true`, `abortedDueToRateLimit=true`, and
`skippedAfterRateLimit=44`. Because this was a Token context update lane, no
new report/window Metric rows were expected or written. Metric count,
Notification count, HolderSnapshot count, and Telegram send all stayed
unchanged. The next report-related task should be a Green review of this
partial enrich result and its 429 boundary before another enrich Red.

The Green 429 boundary review confirmed this is not a report/window data
problem. The selected rows all remain reportable through their existing Metric
rows, and the failed enrich batch did not write Metrics. The issue is the
Token-context fetch cadence: `token:enrich-rescore:geckoterminal` has no
inter-item delay option today. Next work should add opt-in pacing to the
enrich/rescore CLI before another large enrich Red, while keeping report CLIs
read-only and rawJson-free.

That pacing implementation is now complete. `token:enrich-rescore:geckoterminal`
supports `--interItemDelayMs <ms>` for opt-in batch pacing, keeps default
behavior unchanged, preserves HTTP 429 stop behavior, and reports
`interItemDelayMs` / `interItemDelayCount`. No production enrich write,
external fetch, Metric write, Notification update, or Telegram send was run
during implementation. A future paced enrich Red can use:
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --interItemDelayMs 15000 --write`
with separate human approval and no `--notify`.

The paced enrich Red preflight is also complete. It stayed read-only and used
Prisma selection simulation because the enrich CLI fetches externally even in
dry-run. Limit 20 selects ids `6082..6063`; all selected rows have existing
Metric coverage (`metricsCount=1`) and no Notification / HolderSnapshot rows.
No report/window changes are expected from the next enrich Red because it is a
Token-context update lane, not a Metric append lane.

Follow-up re-window check: that paced enrich Red was not executed with
`--sinceMinutes 360` because the intended ids `6082..6063` aged out of the 6h
rolling window. The rows remain Metric-covered (`metricsCount=1`), mint-only,
and Notification / HolderSnapshot-free. A Prisma read-only window comparison
showed `--sinceMinutes 720` is the smallest tested window that restores the
desired first 20 selection. The updated enrich Red candidate is:
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 720 --interItemDelayMs 15000 --write`.
This remains a Token-context lane; report/window Metric rows are not expected
to change.

That re-windowed Token-context Red completed successfully. It did not append
Metrics, so report/window Metric rows are unchanged. Selected ids `6082..6063`
all moved to `partial`, still with `metricsCount=1`, `notificationCount=0`,
and `holderSnapshotCount=0`. No rawJson dump was needed; representative report
review for this step used Prisma safe summary rather than printing raw token
text.

Follow-up limit 50 preflight also remains outside the Metric report lane.
Prisma read-only selection simulation for the next paced enrich command
selects ids `6062..6013`; 45 selected rows already have `metricsCount=1` and
5 have `metricsCount=0`. Since the proposed command is
`token:enrich-rescore:geckoterminal`, no Metric rows are expected to be
created and report/window outputs are expected to remain unchanged until a
separate Metric snapshot lane runs.

Next Token-context Red candidate:
`pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 720 --interItemDelayMs 15000 --write`.
It must omit `--notify`; expected non-effects include Metric write,
Notification create/update, HolderSnapshot write, Telegram send, rawJson full
dump, and offensive raw text dump.

That Token-context Red later succeeded and still did not append Metrics.
Selected ids `6062..6013` all moved to `partial`. The selected set now has
45 rows with `metricsCount=1` and 5 rows with `metricsCount=0`; no Metric
rows were created by the enrich command. Report/window Metric outputs should
therefore remain unchanged until a separate Metric snapshot lane runs. The
post-check used Prisma safe summary rather than printing raw token text.

A second paced limit 50 Token-context Red also succeeded without appending
Metrics. Selected ids `6012..5963` all moved to `partial`; all 50 selected
rows currently have `metricsCount=0`, so no report/window Metric rows exist
for that specific slice yet. This confirms again that
`token:enrich-rescore:geckoterminal` with `--interItemDelayMs 15000` updates
Token context only. Metric count stayed `606`, Notification count stayed `22`,
HolderSnapshot count stayed `1`, Telegram send stayed `0`, and no rawJson full
dump or offensive raw text dump was needed.

## Current DB State

After improved Metric accumulation through limit 75:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution:
  - Metric 0: `1222`
  - Metric 1: `261`
  - Metric 2+: `53`
- GeckoTerminal-origin Token count: `1414`
- GeckoTerminal-origin pump `mint_only` Token count: `420`
- GeckoTerminal-origin pump `mint_only` coverage:
  - Metric 0: `260`
  - Metric 1: `128`
  - Metric 2+: `32`
- Notification status counts: `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` reported
  `metricPendingCount=85`, so Metric 0 rows remain available for future
  bounded Metric accumulation.

## Pending-first Selection Preview

As of 2026-05-25, `metric:snapshot:geckoterminal` has an opt-in
`--onlyMetricPending` batch selector for Metric-zero backlog previews.

- Default batch selection is unchanged when `--onlyMetricPending` is omitted.
- Exact `--mint` mode rejects `--onlyMetricPending`.
- `--onlyMetricPending` dry-run does not fetch GeckoTerminal snapshots and does
  not write DB rows.
- Preview rows include safe selection fields:
  `metadataStatus`, `metricsCount`, `notificationCount`,
  `holderSnapshotCount`, and `latestMetricObservedAt`.

Read-only production preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --onlyMetricPending --noNotificationCapture
```

The preview selected ids `5462`, `5461`, and `5460` in the current rolling
window. All were `mint_only`, `metricsCount=0`, `notificationCount=0`,
`holderSnapshotCount=0`, and `latestMetricObservedAt=null`. No provider fetch,
DB write, Telegram send, Notification update, rawJson full dump, or offensive
raw text dump was performed.

After the 2026-05-26 6H bounded detect write rehearsal, the Metric pending
lane was rechecked read-only. The new 6H cohort is ids `5729..6087` with count
`359`; all are GeckoTerminal `new_pools`, `mint_only`, score `C / 0`,
`hardRejected=false`, and still `metricsCount=0`. Current DB state is
Token / Metric / Notification / HolderSnapshot `1930 / 536 / 18 / 1`, Metric
buckets `0=1534`, `1=309`, `2+=87`, and Notification statuses `captured=13`,
`sent=5`, `failed=0`. Retry and enabled auto-send allowed candidates remain
`0`.

The planner-proposed fetch-free preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

selected ids `6087..6068`. All selected rows are `metricsCount=0`,
`latestMetricObservedAt=null`, `notificationCount=0`, `holderSnapshotCount=0`,
and `metadataStatus=mint_only`. A comparison preview with `--limit 50`
selected ids `6087..6038`, also fetch-free. The next recommended Red is the
conservative limit 20 Metric snapshot batch with `--write`, pending human
approval; it should write Metric rows only and should not create/update
Notification rows or send Telegram.

That Red later succeeded. Ids `6087..6068` now have `metricsCount=1` with
Metric ids `1637..1656`. `metrics:report` confirmed representative ids
`6087`, `6079`, and `6068` rawJson-free: all three have price / FDV / reserve
/ top-pool present. `metrics:window-report` confirmed the fresh observation
shape: id `6087` has `metricCount=1`, `fdvMetricCount=1`,
`entryAnchorQuality=near_30m`, and `outcomeLabel=no_data`; id `6079` has
`metricCount=1`, `fdvMetricCount=1`, `entryAnchorQuality=acceptable_60m`,
30m `no_data`, and 60m+ thin FDV samples. Notification capture remained `0`
and no Telegram send occurred.

The follow-up Green review confirmed the result across the full 20-row target
set without rawJson output. Ids `6087..6068` are all `metricsCount=1`; Metric
ids `1637..1656` are present; selected-row Notification and HolderSnapshot
totals are `0`. Safe market-data boolean distribution for those Metric rows is
price `20`, FDV `20`, reserve `20`, and top-pool `20`.

The next fetch-free `--onlyMetricPending` preview with `--limit 50` selected
ids `6067..6018`, all Metric-zero and still `mint_only`. This is enough to
recommend the next human-approved Red as a limit 50 Metric pending snapshot.
Expected report shape remains single-sample / thin until follow-up Metric
history accumulates; the immediate goal is backlog reduction, not outcome
classification completeness.

Follow-up preflight at 2026-05-25 22:21 JST used the same selector shape with
`--sinceMinutes 10080`, `--limit 5`, `--minGapMinutes 60`, and
`--interItemDelayMs 15000`. It returned `selectedCount=0` because the rolling
cutoff had advanced past ids `5462..5460`. The command remained read-only and
fetch-free. No Red command is recommended until a Green re-window preflight
chooses a stable selection policy.

The re-window preflight at 2026-05-25 22:49 JST confirmed the cause and a safe
next window. Ids `5462..5460` were about `10157..10159` minutes old, so they
were just outside `10080` minutes. `--sinceMinutes 20160 --limit 5` selected
ids `5462`, `5461`, `5460`, `5459`, and `5458` as fetch-free
`selection_preview` rows. All selected rows are `mint_only`, score `C / 0`,
`metricsCount=0`, `latestMetricObservedAt=null`, `notificationCount=0`, and
`holderSnapshotCount=0`. The next Red candidate is the same bounded batch shape
with `--sinceMinutes 20160`, `--limit 5`, `--onlyMetricPending`,
`--noNotificationCapture`, and `--write`, pending human approval.

That Red batch later succeeded. The five selected rows now have
`metricsCount=1` with Metric ids `1553..1557`. `metrics:report` confirms
rawJson-free safe market-data booleans for representative rows: id `5460` has
price / FDV / reserve / top-pool present, while id `5462` has reserve present
with price / FDV / top-pool absent. `metrics:window-report` for id `5460`
shows `metricCount=1`, `fdvMetricCount=1`,
`entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no window FDV
samples, and `outcomeLabel=no_data`.

The follow-up Green review reconfirmed the same report shape. Ids `5462..5458`
are all readable with `metricsCount=1`, `notificationCount=0`, and
`holderSnapshotCount=0`. Token id `5462` has `metricCount=1` but
`fdvMetricCount=0`, so its window report remains `no_data` with
`entryAnchorQuality=none`. The post-Red pending-first preview selected the next
five Metric-zero rows ids `5457..5453`, so another bounded batch Red is
available after human approval.

The next human-approved `--onlyMetricPending` batch Red also succeeded. Ids
`5457`, `5456`, `5455`, `5454`, and `5453` now have `metricsCount=1` with
Metric ids `1558..1562`. Counts moved only in Metric
`1556 / 466 / 14 / 1 -> 1556 / 471 / 14 / 1`; Metric buckets moved
`0=1230, 1=239, 2+=87 -> 0=1225, 1=244, 2+=87`. Notification capture did not
occur and statuses stayed `captured=9`, `sent=5`, `failed=0`.
Representative report/window checks stayed rawJson-free: token id `5457` /
Metric id `1558` has reserve present with price / FDV absent, and its window
report has `metricCount=1`, `fdvMetricCount=0`,
`entryAnchorQuality=none`, no alert FDV anchor, no window FDV samples, and
`outcomeLabel=no_data`.

The follow-up Green review reconfirmed the same report shape for the second
batch. Ids `5457..5453` all remain `metricsCount=1`,
`notificationCount=0`, and `holderSnapshotCount=0`; Metric ids `1558..1562`
remain source `geckoterminal.token_snapshot`. Representative
`metrics:report` output for ids `5457` and `5453` shows reserve present with
price / FDV / top-pool absent. Representative `metrics:window-report` output
for ids `5457` and `5453` has `metricCount=1`, `fdvMetricCount=0`,
`entryAnchorQuality=none`, no alert FDV anchor, no window FDV samples, and
`outcomeLabel=no_data`. The next fetch-free `--onlyMetricPending` preview
selected ids `5452..5448`, so another bounded batch Red is available after
human approval if the operator wants to continue older Metric-zero backlog
cleanup.

That bounded batch Red later succeeded. Ids `5452`, `5451`, `5450`, `5449`,
and `5448` now have `metricsCount=1` with Metric ids `1563..1567`. Counts
moved only in Metric `1556 / 471 / 14 / 1 -> 1556 / 476 / 14 / 1`; Metric
buckets moved `0=1225, 1=244, 2+=87 -> 0=1220, 1=249, 2+=87`. Notification
capture did not occur and statuses stayed `captured=9`, `sent=5`, `failed=0`.
Representative report/window checks stayed rawJson-free: token id `5451` /
Metric id `1564` has price / FDV / reserve / top-pool present and
`entryAnchorQuality=very_late_gt_360m`; token id `5452` / Metric id `1563`
has reserve present with price / FDV / top-pool absent and
`entryAnchorQuality=none`. Both representative windows remain
`outcomeLabel=no_data` because there are no FDV samples in the original entry
windows.

The follow-up Green review of ids `5452..5448` also stayed read-only /
docs-only. All five rows remained readable in `metrics:report`, with Metric ids
`1563..1567`, `metricsCount=1`, `notificationCount=0`, and
`holderSnapshotCount=0`. Safe market-data booleans were:

- token id `5451`: price / FDV / reserve / top-pool present;
- token ids `5452`, `5450`, `5449`, and `5448`: reserve present, price / FDV /
  top-pool absent.

Representative `metrics:window-report` output stayed `outcomeLabel=no_data`.
Token id `5451` has `metricCount=1`, `fdvMetricCount=1`, and
`entryAnchorQuality=very_late_gt_360m`; token id `5452` has
`metricCount=1`, `fdvMetricCount=0`, and `entryAnchorQuality=none`. Neither
representative row has an alert FDV anchor or in-window FDV samples.

The post-review `--onlyMetricPending` preview stayed fetch-free and
write-free, selecting ids `5447..5443` as the next five Metric-zero rows.
Therefore another bounded pending-first Metric snapshot Red is available after
human approval. If that preview later returns `selectedCount=0`, switch to a
Green rolling-window / older Metric-zero backlog policy task instead of issuing
another Red command.

That repeated bounded pending-first Red later succeeded. Ids `5447`, `5446`,
`5445`, `5444`, and `5443` now have `metricsCount=1` with Metric ids
`1568..1572`. Counts moved only in Metric
`1556 / 476 / 14 / 1 -> 1556 / 481 / 14 / 1`; Metric buckets moved
`0=1220, 1=249, 2+=87 -> 0=1215, 1=254, 2+=87`. Notification capture did not
occur and statuses stayed `captured=9`, `sent=5`, `failed=0`.

Representative report/window checks stayed rawJson-free: token id `5446` /
Metric id `1569` has price / FDV / reserve / top-pool present and
`entryAnchorQuality=very_late_gt_360m`; token id `5447` / Metric id `1568`
has reserve present with price / FDV / top-pool absent and
`entryAnchorQuality=none`. Both representative windows remain
`outcomeLabel=no_data` because there are no FDV samples in the original entry
windows.

The follow-up Green review of ids `5447..5443` also stayed read-only /
docs-only. All five rows remained readable, with Metric ids `1568..1572`,
`metricsCount=1`, `notificationCount=0`, and `holderSnapshotCount=0`.
Safe market-data booleans were:

- token id `5446`: price / FDV / reserve / top-pool present;
- token ids `5447`, `5445`, `5444`, and `5443`: reserve present, price / FDV /
  top-pool absent.

Representative `metrics:window-report` output stayed `outcomeLabel=no_data`.
Token id `5446` has `metricCount=1`, `fdvMetricCount=1`, and
`entryAnchorQuality=very_late_gt_360m`; token id `5447` has
`metricCount=1`, `fdvMetricCount=0`, and `entryAnchorQuality=none`. Neither
representative row has an alert FDV anchor or in-window FDV samples.

The post-review `--onlyMetricPending` preview stayed fetch-free and
write-free, selecting ids `5442..5438` as the next five Metric-zero rows.
Therefore another bounded pending-first Metric snapshot Red is available after
human approval. If that preview later returns `selectedCount=0`, switch to a
Green rolling-window / older Metric-zero backlog policy task instead of issuing
another Red command.

The later human-approved limit 50 pending-first Metric batch succeeded and the
follow-up review stayed read-only. Ids `5442..5393` now have
`metricsCount=1` with Metric ids `1573..1622`; counts moved only in Metric
`1556 / 481 / 14 / 1 -> 1556 / 531 / 14 / 1`, and Metric buckets moved
`0=1215, 1=254, 2+=87 -> 0=1165, 1=304, 2+=87`. Notification statuses stayed
`captured=9`, `sent=5`, `failed=0`, and target tokens still have total
`notificationCount=0` and `holderSnapshotCount=0`.

Safe market-data distribution across the 50 new Metric rows is
`reserveUsdPresent=50`, `priceUsdPresent=12`, `fdvUsdPresent=12`, and
`topPoolPresent=12`. Representative `metrics:report` checks stayed
rawJson-free: id `5442` / Metric `1573` has price / FDV / reserve / top-pool
present; ids `5440` / Metric `1575` and `5393` / Metric `1622` have reserve
present with price / FDV / top-pool absent. Representative window reports
remain `outcomeLabel=no_data`: id `5442` has `fdvMetricCount=1` with
`entryAnchorQuality=very_late_gt_360m`, while id `5440` has
`fdvMetricCount=0` with `entryAnchorQuality=none`.

The post-review `--onlyMetricPending` preview with `--limit 50` stayed
fetch-free and write-free, selecting another 50 Metric-zero rows; the first
five are ids `5392..5388`. Because a large batch just succeeded, the
recommended next Red, if any, is a smaller limit 5 continuation rather than
another limit 50. If a future preview drops to zero, switch to rolling-window /
older Metric-zero backlog policy.

That smaller limit 5 Red later succeeded. Ids `5392`, `5391`, `5390`, `5389`,
and `5388` now have `metricsCount=1` with Metric ids `1623..1627`. Counts
moved only in Metric `1556 / 531 / 14 / 1 -> 1556 / 536 / 14 / 1`; Metric
buckets moved `0=1165, 1=304, 2+=87 -> 0=1160, 1=309, 2+=87`. Notification
capture did not occur and statuses stayed `captured=9`, `sent=5`, `failed=0`.

Representative `metrics:report` checks stayed rawJson-free: token id `5391` /
Metric id `1624` has price / FDV / reserve / top-pool present, while token id
`5392` / Metric id `1623` has reserve present with price / FDV / top-pool
absent. Representative window reports remain `outcomeLabel=no_data`: token id
`5391` has `metricCount=1`, `fdvMetricCount=1`, and
`entryAnchorQuality=very_late_gt_360m`; token id `5392` has `metricCount=1`,
`fdvMetricCount=0`, and `entryAnchorQuality=none`.

Next step should be a Green review of ids `5392..5388` before another batch
Red.

## Read-Only Commands Confirmed

The following commands were inspected or executed as read-only reports:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump --windows 30,60,1440
pnpm -s metrics:report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --limit 3
pnpm -s tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus mint_only --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 5
```

`metrics:window-report` prints explicit safety fields:

- `readOnly=true`
- `willWrite=false`
- `willFetch=false`
- `willSendTelegram=false`

The report implementation reads Metric `rawJson` internally only to compute FDV
presence and window values. It did not print rawJson payloads.

## Report Results

Notification id `8`:

- Token mint: `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
- Notification state: `sent` / `live_send`
- `metrics:window-report` selected `notification_sent_at` as `alertedAtSource`
  and `alertNotificationId=8`
- Token has `metricCount=2` and `fdvMetricCount=2`
- 30m / 60m / 24h windows were `no_data` because the two Metric samples were
  before the live-send `sentAt` anchor

Metric 2+ sample:

- Token mint: `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`
- Metrics: `1281`, `1301`, `1396`
- `metrics:window-report` read `metricCount=3` and `fdvMetricCount=3`
- 30m / 60m windows had `fdvSampleCount=1`, `fdvSampleCoverageLabel=thin`,
  and `outcomeLabel=no_data` because there is no alert FDV anchor
- 24h window had `fdvSampleCount=3`, `fdvSampleCoverageLabel=partial`, and
  `outcomeIsProvisional=true`
- `metrics:report -- --mint ... --limit 3` showed the same three rows with
  rawJson-free safe-summary booleans all true

Metric 1 sample:

- Token mint: `CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump`
- `metrics:window-report` read `metricCount=1` and `fdvMetricCount=1`
- 24h window had `fdvSampleCount=1`, `fdvSampleCoverageLabel=thin`, and
  `outcomeIsProvisional=true`
- 30m / 60m windows were `no_data` because the only Metric was outside those
  short windows

Cohort report:

- `tokens:compare-report` with GeckoTerminal `mint_only` / `hasMetrics` /
  `minMetricsCount=1` returned five rows
- The sample rows had `metricsCount=3`, latest Metric source
  `geckoterminal.token_snapshot`, and rawJson-free latest Metric presence
  booleans all true
- Legacy `outcomeBucket` remained `unresolved` / `multiple_missing`, which is
  expected because canonical outcome review is `metrics:window-report`

## Cohort Window Outcome Check

Date: 2026-05-19

After the first report-readiness pass, a smaller outcome cohort was checked
side by side with `metrics:window-report` using windows
`30,60,120,180,360,720,1440`. The cohort was intentionally bounded to seven
tokens:

- Notification id `8` token:
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`
- Notification id `7` token:
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`
- Metric 2+ GeckoTerminal-origin pump `mint_only` samples without Notification:
  `AvE4T5wvJsjr6Ro7q3gdPgEpDDPMYnh6dmqTafZPpump`,
  `Dt1M9Cj7pEBuPf3dAbzLSFk1ft9YHmhCXs8vdyySpump`, and
  `8b1rapy6vNuaoUHBSPhJoXNrU3CL1ZpRKpXLvX9apump`
- Metric 1 sample:
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump`
- Metric 0 pending sample:
  `27GS5VLagjZdtdwPeBkyqkJDWn2ZoqjqBCN4LUB6pump`

Read-only commands executed:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint AvE4T5wvJsjr6Ro7q3gdPgEpDDPMYnh6dmqTafZPpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint Dt1M9Cj7pEBuPf3dAbzLSFk1ft9YHmhCXs8vdyySpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 8b1rapy6vNuaoUHBSPhJoXNrU3CL1ZpRKpXLvX9apump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 27GS5VLagjZdtdwPeBkyqkJDWn2ZoqjqBCN4LUB6pump --windows 30,60,120,180,360,720,1440
```

Current DB state during the cohort check stayed:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=261`, `2+=53`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` still reported
  `metricPendingCount=85`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Outcome findings:

- Notification id `8` was recognized as `alertNotificationId=8` with
  `alertedAtSource=notification_sent_at`, but all checked windows stayed
  `outcomeLabel=no_data` because both Metrics predated `sentAt`, leaving no
  post-alert FDV sample inside those windows.
- Notification id `7` was recognized as `alertNotificationId=7` with
  `alertedAtSource=notification_captured_at`. It had `alertFdv` from the
  pre-alert Metric and a post-alert Metric in the 120m+ windows, producing
  `peakMultipleFromAlert=1.0869155273705746`, `outcomeLabel=flat`,
  `fdvSampleCoverageLabel=thin`, and non-negative `timeToPeakMinutes`.
- The three no-Notification Metric 2+ samples fell back to
  `alertedAtSource=first_seen_detected_at` with `alertNotificationId=null`.
  They showed Metric/FDV samples in wider windows (`thin` at one-sample
  windows and `partial` when two samples were inside the window), but
  `outcomeLabel` stayed `no_data` because there was no alert FDV anchor.
- The Metric 1 sample also fell back to `first_seen_detected_at`; it showed
  `fdvSampleCoverageLabel=thin` in the wider window and `outcomeLabel=no_data`.
- The Metric 0 sample stayed pending / `no_data` across every checked window
  with `fdvSampleCoverageLabel=no_data`.
- The cohort showed the completion flags in a useful way: older alert-anchored
  samples were complete / non-provisional, while newer first-seen fallback
  samples could show complete short windows and provisional 12h / 24h windows.
- No `small_win`, `hit`, or `big_hit` labels appeared in this cohort. The only
  non-`no_data` label observed was `flat`, and it matched the documented
  `peakMultipleFromAlert < 1.5` rule.

This confirmed that `metrics:window-report` is usable for human review at the
current accumulation stage: it distinguishes pending / no-data tokens, thin
single-sample tokens, partial multi-sample windows, alert-anchored outcomes,
and provisional incomplete windows without printing Metric rawJson.

## Side Effects

Confirmed after report execution:

- Token / Metric / Notification / HolderSnapshot stayed `1536 / 388 / 8 / 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`
- DB write: none
- external fetch: none
- Telegram send: none
- Notification create/update: none
- repo-local data changes: none
- rawJson full dump: none

## Next Candidate

The next task should be a separately approved Red run only if the operator wants
to add another bounded set of observation points. Because the latest 24h queue
now has no Metric-0 pending candidates, that Red run should be treated as a
stable limit-75 re-run for additional Metric samples on already measured
GeckoTerminal-origin pump `mint_only` tokens, not as Metric-0 cleanup.

Candidate command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

It still requires explicit human Red approval because it fetches GeckoTerminal
and writes production Metric rows.

## Exact Mint Metric 0 Report Check

Date: 2026-05-24

After the exact-mint Metric 0 backlog snapshot for token id `5464`, read-only
report checks confirmed the new observation without dumping rawJson.

`metrics:report` for token id `5464` returned one Metric:

- Metric id `1542`
- source `geckoterminal.token_snapshot`
- `observedAt=2026-05-24T13:52:10.586Z`
- `volume24h=0`
- safe market-data booleans:
  `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, `topPoolPresent=true`

`metrics:window-report` for the same mint returned:

- `readOnly=true`
- `willWrite=false`
- `willFetch=false`
- `willSendTelegram=false`
- `metricCount=1`
- `fdvMetricCount=1`
- `entryAnchorSource=first_fdv_metric_after_alerted_at`
- `entryAnchorQuality=very_late_gt_360m`
- 30m / 60m / 2h / 3h / 6h / 12h / 24h windows all stayed
  `outcomeLabel=no_data`
- no-data reasons included `no_alert_anchor_near_entry`,
  `no_fdv_samples_in_window`, `no_peak_fdv`, and `no_peak_multiple`

The result is expected for a very late first Metric on an older first-seen
token: the row makes the Metric 0 backlog smaller and confirms report
visibility, but it does not create a usable near-entry outcome window.

## Exact Mint Metric 0 Review Recheck

Date: 2026-05-24 23:44 JST

The follow-up Green review re-ran the read-only report checks for token id
`5464`. Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 460 / 10 / 1`, with Metric buckets `0=1221`, `1=233`, `2+=87`.

`metrics:report` continued to return one row, Metric id `1542`, with source
`geckoterminal.token_snapshot`, `observedAt=2026-05-24T13:52:10.586Z`,
`volume24h=0`, and rawJson-free safe market-data booleans all true for
price, FDV, reserve, and top pool.

`metrics:window-report` continued to show `metricCount=1`,
`fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
anchor, no FDV samples in 30m through 24h windows, and `outcomeLabel=no_data`.
This confirms the report remains readable and safe, while also confirming that
a very late first Metric should be treated as backlog coverage rather than
near-entry outcome evidence.

## Second Exact Mint Metric 0 Report Check

Date: 2026-05-25 19:58 JST

After the second exact-mint Metric 0 backlog snapshot for token id `5463`,
read-only report checks confirmed the new observation without dumping rawJson.

`metrics:report` for token id `5463` returned one Metric:

- Metric id `1543`
- source `geckoterminal.token_snapshot`
- `observedAt=2026-05-25T10:57:38.651Z`
- `volume24h=0`
- safe market-data booleans:
  `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, `topPoolPresent=true`

`metrics:window-report` for the same mint returned:

- `readOnly=true`
- `willWrite=false`
- `willFetch=false`
- `willSendTelegram=false`
- `metricCount=1`
- `fdvMetricCount=1`
- `entryAnchorSource=first_fdv_metric_after_alerted_at`
- `entryAnchorQuality=very_late_gt_360m`
- 30m / 60m / 2h / 3h / 6h / 12h / 24h windows all stayed
  `outcomeLabel=no_data`
- no-data reasons included `no_alert_anchor_near_entry`,
  `no_fdv_samples_in_window`, `no_peak_fdv`, and `no_peak_multiple`

As with token id `5464`, this result confirms Metric 0 backlog coverage and
rawJson-free report visibility, not near-entry outcome evidence.

## Second Exact Mint Review Recheck

Date: 2026-05-25 21:12 JST

The follow-up Green review re-ran the read-only report checks for token id
`5463`. Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 461 / 10 / 1`, with Metric buckets `0=1220`, `1=234`, `2+=87`.

`metrics:report` continued to return one row, Metric id `1543`, with source
`geckoterminal.token_snapshot`, `observedAt=2026-05-25T10:57:38.651Z`,
`volume24h=0`, and rawJson-free safe market-data booleans all true for
price, FDV, reserve, and top pool.

`metrics:window-report` continued to show `metricCount=1`,
`fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
anchor, no FDV samples in 30m through 24h windows, and `outcomeLabel=no_data`.
This matches token id `5464`: exact-mint snapshots reduce Metric 0 backlog and
confirm report visibility, but very late first Metrics are not near-entry
outcome evidence.

## Metric Accumulation Decision Preflight

Date: 2026-05-19

This read-only decision point checked whether the already-stable limit-75 Metric
accumulation command can be re-run before returning to Telegram operations.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 388 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=261`, `2+=53`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Read-only queue command:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 75
```

Queue result:

- `readOnly=true`
- `geckoOriginTokenCount=94` inside the 24h queue window
- `metricPendingCount=0`
- queue rows were GeckoTerminal-origin pump `mint_only` rows
- visible queue rows had existing Metrics and matched `staleReview` /
  `enrichPending`, not `metricPending`

Additional read-only candidate-shape check for the proposed Red command showed:

- `geckoPumpOriginWithin24h=93`
- `eligibleAfterMinGap60=93`
- `selectedCountIfLimit75=75`
- selected distribution would be approximately `metric0=0`, `metric1=45`,
  `metric2Plus=30`
- selected rows were `metadataStatus=mint_only`

Decision:

- Proceeding to a Red command is reasonable only as a controlled repeat of the
  stable limit-75 Metric accumulation path.
- It should not be described as processing the earlier `metricPendingCount=85`
  cohort because the current 24h queue reports `metricPendingCount=0`.
- The expected write target is up to 75 new `Metric` rows on already measured
  GeckoTerminal-origin pump `mint_only` tokens.
- `--interItemDelayMs 15000` should stay in place because it was the pacing
  used for the rate-limit-clean limit 30 / 50 / 75 runs.
- Expected non-effects remain: no Token update/create, no Notification
  create/update in batch mode, no HolderSnapshot write, no Telegram send, no
  checkpoint, and no repo-local data changes.

Stop before Red execution if the queue no longer has enough eligible
GeckoTerminal-origin pump `mint_only` rows, if Notification / Telegram /
HolderSnapshot paths appear in batch mode, if raw provider bodies or secrets
would be printed, or if the operator intent is specifically to fill Metric-0
pending rows rather than add additional observations.

## Report Check After Additional Limit 75 Run

Date: 2026-05-19

After the additional observation-point run, DB counts were:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

The Red command wrote 59 new Metric rows (`1471` through `1529`) and did not
change Token, Notification, or HolderSnapshot counts.

Read-only report checks:

```bash
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint 2k5wuRCdhL331w5mALdP34eejkQ3qQswykyipr3bpump --windows 30,60,1440
pnpm -s metrics:window-report -- --mint D4kjSBMpLe8fPvjH3D3WCscvNui6QjeK2BhzFa51pump --windows 30,60,1440
```

Findings:

- all three reports stayed read-only with `willWrite=false`, `willFetch=false`,
  and `willSendTelegram=false`
- newly written Metrics were visible through `metricCount`,
  `latestFdvObservedAt`, and `latestFdv`
- two sample tokens now had `metricCount=4`, `fdvMetricCount=4`, and 24h
  `fdvSampleCoverageLabel=usable`
- one sample token had `metricCount=2`, `fdvMetricCount=2`, and 24h
  `fdvSampleCoverageLabel=thin`
- `outcomeLabel` stayed `no_data` for these samples because they use
  `first_seen_detected_at` fallback with no alert FDV anchor
- no rawJson full dump was printed

## Post-Accumulation Window Outcome Review

Date: 2026-05-19

This read-only pass reviewed whether the additional Metric `+59` improved
operator judgment in `metrics:window-report`.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Cohort selection:

- `2qyZZ...pump` and `2k5w...pump`: newly written additional observations,
  now `metricCount=4`
- `CyU...pump` and `3V7...pump`: newly written additional observations that
  moved from Metric 1 to Metric 2+
- `EUx...pump`: Notification id `8`, sent/live-send anchor
- `ENRA...pump`: Notification id `7`, captured alert anchor
- `DAM...pump`: current Metric 1 mint-only sample
- `By3...pump`: current Metric 0 mint-only sample

Read-only command shape used for each selected mint:

```bash
pnpm -s metrics:window-report -- --mint <MINT> --windows 30,60,120,180,360,720,1440
```

All outputs declared `readOnly=true`, `willWrite=false`, `willFetch=false`,
and `willSendTelegram=false`. No rawJson full dump was printed.

Outcome observations:

- Additional Metrics improved coverage, not alert classification. The two
  `metricCount=4` samples showed 24h `fdvSampleCoverageLabel=usable`; shorter
  windows progressed from `thin` to `partial` where multiple samples fell in
  window.
- The two Metric 1 -> 2+ samples showed 24h `fdvSampleCoverageLabel=partial`.
  Their short windows remained `no_data` or `thin` because the first sample was
  hours after `first_seen_detected_at`.
- No-Notification mint-only fallback rows still have `alertFdv=null`, so
  `peakMultipleFromAlert` remains null and `outcomeLabel=no_data` even when
  Metric history is present.
- Notification id `7` remains the useful alert-anchored control:
  `alertedAtSource=notification_captured_at`, `alertNotificationId=7`,
  `alertFdv=223702.038226584`, `peakMultipleFromAlert=1.0869155273705746`,
  and `outcomeLabel=flat` from 2h through 24h.
- Notification id `8` is correctly recognized as
  `alertedAtSource=notification_sent_at` / `alertNotificationId=8`, but remains
  `no_data` because the available Metrics predate `sentAt`; there is no
  post-send window sample.
- The Metric 1 sample stayed `thin`; the Metric 0 sample stayed `no_data`.
- Complete/provisional flags were usable: short windows were complete, while
  24h windows for recent first-seen fallback tokens were still provisional.

Judgment:

- `metrics:window-report` is usable for human review of sampling density,
  freshness, window completeness, and alert-anchored outcomes.
- For no-Notification mint-only rows, more Metric accumulation alone does not
  produce `flat` / `small_win` / `hit` / `big_hit` because there is no alert FDV
  anchor near `first_seen_detected_at`.
- The next high-leverage work is report display improvement around the
  "fallback no alertFdv" case, or a separate alert-anchor/Notification strategy,
  rather than simply adding another broad accumulation batch.

## No-Data Reason Output

Date: 2026-05-19

`metrics:window-report` now includes additive window-level fields for operator
review:

- `noDataReasons`
- `hasAlertFdvAnchor`
- `hasWindowFdvSamples`

This is a display/readability improvement only:

- `outcomeLabel` thresholds were not changed
- alert FDV lookup remains the same 5-minute lookaround behavior
- no values are persisted
- report output remains rawJson-free

Reason labels:

- `no_alert_anchor_near_entry`: `alertFdv` is null
- `no_fdv_samples_in_window`: no FDV sample falls inside the window
- `no_peak_fdv`: no peak FDV can be computed for the window
- `no_peak_multiple`: `peakMultipleFromAlert` is null

Runtime checks:

- Notification id `8` token:
  `noDataReasons=[no_alert_anchor_near_entry,no_fdv_samples_in_window,no_peak_fdv,no_peak_multiple]`
  for its post-sent windows, showing that no post-send FDV samples exist.
- no-Notification mint-only fallback with Metrics:
  `hasWindowFdvSamples=true` while `hasAlertFdvAnchor=false`, with reasons
  `no_alert_anchor_near_entry` and `no_peak_multiple`.
- Metric 0 mint-only token:
  `hasWindowFdvSamples=false` and no-sample reasons are present.
- Notification id `7` flat windows:
  `noDataReasons=[]`, `hasAlertFdvAnchor=true`, and
  `hasWindowFdvSamples=true`, confirming non-`no_data` outcomes are not marked
  with no-data reasons.

Validated read-only command shape:

```bash
pnpm -s metrics:window-report -- --mint <MINT> --windows 30,60,120,180,360,720,1440
```

The checked cohort stayed side-effect free: no DB write, external fetch,
Telegram send, Token update, Notification update, HolderSnapshot write, or
rawJson full dump.

## Operator Review of No-Data Reasons

Date: 2026-05-20

This Green follow-up rechecked the no-data explanation fields against a bounded
cohort. The task stayed read-only and docs-only: no Metric snapshot, detect
watch, external fetch, production DB write, Telegram send, Notification
send/retry, schema change, migration, application code change, or rawJson full
dump was executed.

Current DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`

Read-only commands:

```bash
pnpm -s mvp:status
pnpm -s metrics:window-report -- --help
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint 2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint DAMRNx1oheBNpy7WRtp6ptPGGzxZkiTjxq4ptHmdpump --windows 30,60,120,180,360,720,1440
pnpm -s metrics:window-report -- --mint CyUWWFVU892Zj7AXhedRUrgprhFknwH4idhda741pump --windows 30,60,120,180,360,720,1440
```

Cohort:

- Notification id `8`: sent/live-send alert anchor case
- Notification id `7`: captured alert anchor and `flat` control case
- no-Notification mint-only fallback with Metrics
- Metric 0 mint-only row
- Metric 1 mint-only row
- Metric 1 -> 2+ mint-only row

Review findings:

- `no_alert_anchor_near_entry` is visible when Metrics exist but `alertFdv` is
  unavailable. The no-Notification fallback samples have
  `hasWindowFdvSamples=true`, `hasAlertFdvAnchor=false`, and reasons limited to
  alert-anchor / peak-multiple gaps in windows where FDV samples exist.
- `no_fdv_samples_in_window` is visible for true empty windows. The Metric 0
  sample and Notification id `8` post-send windows both show
  `hasWindowFdvSamples=false`.
- `hasAlertFdvAnchor=false` plus `hasWindowFdvSamples=true` is readable in
  fallback rows with Metrics, which tells the operator that more samples exist
  but the alert anchor is the missing piece.
- `hasAlertFdvAnchor=false` plus `hasWindowFdvSamples=false` is readable for
  Metric 0 rows and Notification id `8` post-send windows, which tells the
  operator there is no usable window sample.
- Notification id `7` flat windows show `noDataReasons=[]`,
  `hasAlertFdvAnchor=true`, and `hasWindowFdvSamples=true`, so no-data reasons
  are not falsely attached to non-`no_data` windows.
- Metric 1 and Metric 1 -> 2+ rows show the expected `thin` / `partial`
  coverage changes while preserving no-alert-anchor explanations.

Operator judgment:

- The report is sufficient to distinguish no samples from no alert anchor.
- It is also sufficient to explain why Notification id `8` remains `no_data`
  after live send: the available Metrics are before the sent alert anchor.
- Additional Metric accumulation can thicken `thin` / `partial` coverage, but
  it will not produce alert-based outcome labels for no-Notification mint-only
  rows while `alertFdv=null`.
- The next high-leverage task is an alert-FDV anchor policy / preflight for
  mint-only fallback rows, not another report-display tweak.

See `docs/runbooks/alert-fdv-anchor-policy.md` for the read-only policy
preflight. Its current recommendation is to keep `alertFdv` and
`outcomeLabel` strict, then add report-only `entryAnchor*` baseline fields for
mint-only fallback rows before considering any outcome-label change.

## Entry Anchor Fields

Date: 2026-05-20

`metrics:window-report` now includes report-only entry anchor fields:

- `entryAnchorFdv`
- `entryAnchorObservedAt`
- `entryAnchorLagMinutes`
- `entryAnchorSource`
- `entryAnchorQuality`

Definition:

- the entry anchor is the first FDV Metric at or after resolved `alertedAt`
- `entryAnchorSource` is `first_fdv_metric_after_alerted_at` when present, else
  `none`
- `entryAnchorQuality` classifies the lag as `none`, `near_5m`, `near_30m`,
  `acceptable_60m`, `delayed_120m`, `delayed_180m`, `late_360m`, or
  `very_late_gt_360m`

Boundary:

- `alertFdv` remains strict ±5m and unchanged
- `outcomeLabel` remains unchanged
- `peakMultipleFromAlert` remains based on `alertFdv`, not entry anchor
- existing `noDataReasons`, `hasAlertFdvAnchor`, and `hasWindowFdvSamples`
  behavior is unchanged
- fields are computed at report time only and are not persisted

Read-only runtime cohort:

- `2qyZZqME7wy5vMBqBoFA7SB5EzoCr2ydeFZZkF2spump`: no-Notification fallback
  with short lag; printed `entryAnchorQuality=near_30m`,
  `entryAnchorLagMinutes=20.218433333333333`, `alertFdv=null`, and
  `outcomeLabel=no_data`
- `BCiYyqsMthUWhhSUA2ZBVGVXgLx99XnsroVrCn6Wpump`: no-Notification fallback
  with long lag; printed `entryAnchorQuality=late_360m` and
  `entryAnchorLagMinutes=358.35365`
- `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`: Notification id `8`; no
  post-sent FDV sample, so `entryAnchorFdv=null`, `entryAnchorSource=none`,
  and `entryAnchorQuality=none`
- `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`: Notification id `7`; kept
  `alertFdv=223702.038226584` and wider-window `outcomeLabel=flat` while
  entry anchor appeared only as additional context

Validation:

```bash
pnpm exec tsc --noEmit
node --import tsx --test tests/metricsWindowReport.test.ts
pnpm -s metrics:window-report -- --help
```

The runtime commands remained side-effect free: no DB write, external fetch,
Telegram send, Token update, Notification update, HolderSnapshot write, or
rawJson full dump.

## Entry Anchor Quality Review

Date: 2026-05-20

A docs-only follow-up reviewed whether the report-only `entryAnchor*` fields
are strong enough to become outcome baselines for no-Notification mint-only
fallback rows.

Target cohort:

- GeckoTerminal-origin pump `mint_only`
- no Notification row
- has Metric
- has readable FDV Metric

Read-only aggregation result:

- target token count: `158`
- target Metric distribution: `1=99`, `2+=59`
- strict ±5m `alertFdv` anchor found: `0`
- strict anchor missing: `158`
- `hasWindowFdvSamples=true`: `158`
- `hasAlertFdvAnchor=false`: `158`

Entry anchor quality:

- `near_30m`: `5`
- `delayed_120m`: `12`
- `delayed_180m`: `22`
- `late_360m`: `119`
- no `near_5m`, `acceptable_60m`, `none`, or `very_late_gt_360m` rows in this
  target cohort

Lag statistics:

- min `20.2184m`
- median `238.8762m`
- p75 `308.4780m`
- p90 `339.0626m`
- max `358.3537m`

Hypothetical derived-baseline impact:

- D30 and D60 would make only `5 / 158` rows calculable, all hypothetical
  `flat`
- D180 would make `39 / 158` rows calculable, but includes anchors up to about
  `179m` after first seen
- D360 would make `158 / 158` rows calculable, but most labels would rely on
  late first-observation baselines around 3-6 hours after first seen

Operator conclusion:

- `entryAnchor*` is useful as report context and should stay report-only for
  now.
- Policy C remains the safe default: strict `alertFdv`, unchanged
  `outcomeLabel`, and visible `entryAnchorQuality`.
- A future Policy D should be a separate limited fallback outcome mode, if
  implemented at all, and should start with only `near_5m` / `near_30m`
  anchors. D180 / D360 should not be used for outcome labels without a separate
  product decision because they would overstate late first-observation
  baselines.

This closes the current report slice. The next operating step should return to
manual-approved Telegram work rather than continue Policy D design immediately.
Auto live send, scheduler, worker, queue, and systemd remain disabled.

## Post Additional Limit 75 Report Readiness

Date: 2026-05-20

This read-only follow-up checked the report surface after the additional
limit-75 Metric accumulation run added 59 more GeckoTerminal Metric rows. The
prompt's earlier `Metric=388` baseline is now stale; the current production DB
state is:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- GeckoTerminal-origin pump `mint_only` coverage: Metric `0=260`, `1=99`,
  `2+=61`
- recent written Metric id range from the last 75-row window: `1455..1529`
  (`75` rows inspected)
- Notification statuses: `captured=4`, `sent=4`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20`
  reported `metricPendingCount=260`; the default 24h queue reported
  `metricPendingCount=0` because the recent window has aged

Read-only implementation boundaries were rechecked:

- `metrics:window-report` is read-only and prints `readOnly=true`,
  `willWrite=false`, `willFetch=false`, and `willSendTelegram=false`
- `metrics:window-report` uses Metric `rawJson` internally only to derive safe
  FDV/window fields and does not print rawJson
- `metrics:report`, `tokens:compare-report`, and
  `review:queue:geckoterminal` were inspected as read-only report paths with no
  DB write, external fetch, or Telegram sender call
- package-script execution for `metrics:report` and `tokens:compare-report`
  hit sandbox IPC limits in this environment, so the same CLI files were run
  directly with `node --import tsx`

Read-only commands executed:

```bash
pnpm -s metrics:window-report -- --mint EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump --windows 30,60,120,1440
pnpm -s metrics:window-report -- --mint GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump --windows 30,60,120,1440
pnpm -s metrics:window-report -- --mint 2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump --windows 30,60,120,1440
pnpm -s metrics:window-report -- --mint P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump --windows 30,60,120,1440
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 20
pnpm -s review:queue:geckoterminal -- --pumpOnly --sinceHours 168 --limit 20
node --import tsx src/cli/metricsReport.ts --source geckoterminal.token_snapshot --sortBy observedAt --sortOrder desc --limit 5
node --import tsx src/cli/tokensCompareReport.ts --hasMetrics true --minMetricsCount 2 --limit 5
```

Report findings:

- Notification id `8` was read as the sent/live-send token with mint
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`,
  `alertedAtSource=notification_sent_at`, `alertNotificationId=8`,
  `metricCount=2`, and `fdvMetricCount=2`; windows stayed `no_data` because
  the Metrics predate the live-send `sentAt` anchor
- Metric 2+ sample
  `GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump` was read with
  `metricCount=2`, `fdvMetricCount=2`, `alertedAtSource=token_imported_at`,
  and `entryAnchorQuality=very_late_gt_360m`
- latest accumulation sample
  `2mCMGtiXqRboAqB1oZEFwvp7xbXMVeM6YNBt3fVPpump` was read with
  `metricCount=2`, `fdvMetricCount=2`, and a 24h thin FDV sample window
- mint-only Metric 1 sample
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump` was read with
  `metricCount=1`, `fdvMetricCount=1`, and a 24h thin FDV sample window
- the 168h review queue keeps Metric 0 tokens in `metricPending`, while recent
  Metric-written tokens with `metricsCount>0` appear under stale/enrich review
  and no longer match `metricPending`
- `metrics:report` displayed recent Metric ids `1525..1529` as safe summaries
  with price/FDV/reserve/top-pool presence booleans, not rawJson
- `tokens:compare-report` displayed Metric 2+ `mint_only` rows with latest
  Metric source `geckoterminal.token_snapshot`, `metricsCount=4`, and
  rawJson-free completeness booleans

Side effects confirmed:

- DB write: none
- external fetch: none
- Telegram send: none
- Notification create/update: none
- Token / Metric / HolderSnapshot write: none
- rawJson full dump: none
- repo-local data diff before docs update: none

Conclusion: the report/readiness surface is usable after Metric count `447`.
`metrics:window-report` can be used for bounded operator review of Notification
id `8`, Metric 2+ rows, Metric 1 rows, and Metric 0 pending context without
opening any write, fetch, Telegram, scheduler, or systemd path.

## Post Detect Write Rehearsal Metric Lane Re-entry

Date: 2026-05-23 19:44 JST

After the small bounded GeckoTerminal new-pools write rehearsal, five new
GeckoTerminal-origin pump mint-only Tokens exist and all five have
`metricsCount=0`.

Current read-only state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- 24h pump review queue: `geckoOriginTokenCount=5`,
  `enrichPendingCount=5`, `metricPendingCount=5`, `staleReviewCount=0`
- 168h pump review queue: `geckoOriginTokenCount=425`,
  `enrichPendingCount=425`, `metricPendingCount=265`,
  `staleReviewCount=420`

The five newest rows are valid Metric accumulation candidates in shape:

- `source=geckoterminal.new_pools`
- `metadataStatus=mint_only`
- pump mints
- `entrySnapshot.firstSeenSourceSnapshot.source=geckoterminal.new_pools`
- `Metric`, `Notification`, and `HolderSnapshot` related counts are all `0`

Next step should be Green, not an immediate Metric write: preflight the Metric
snapshot command for these new rows and the wider 168h metric-pending context,
then record one human-approval Red candidate if the read-only boundaries still
match expectations.

## New Token Metric Accumulation Preflight

Date: 2026-05-23 19:52 JST

The Metric lane preflight is complete and recommends a small limit-5 Red over a
return to the broader stable limit-75 run.

Read-only facts:

- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Token Metric distribution: `0=1227`, `1=232`, `2+=82`
- 24h pump queue: `geckoOriginTokenCount=5`, `metricPendingCount=5`
- 168h pump queue: `geckoOriginTokenCount=425`, `metricPendingCount=265`
- auto-send enabled planner: `allowedCandidateCount=0`,
  `wouldSend=false`, `wouldUpdateNotification=false`
- retry planner: `candidateCount=0`

Selection expectation:

- With `--pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60`, the
  candidate set is exactly the five new write-rehearsal Tokens.
- They are selected recent-first by first-seen detectedAt: ids `5624`, `5623`,
  `5622`, `5621`, `5620`.
- Since each has no existing Metric, `--minGapMinutes 60` does not exclude
  them.

Recommended next Red exact command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effects: external GeckoTerminal fetch and up to five new Metric
rows. Expected non-effects: Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler / systemd, repo-local data diff,
and rawJson full dump.

## New Token Limit-5 Metric Report Check

Date: 2026-05-23 19:58 JST

The approved small Metric snapshot wrote five Metric rows for the five new
GeckoTerminal mint-only Tokens. Report readiness was checked read-only after
the write.

DB movement:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 449 / 10 / 1 -> 1541 / 454 / 10 / 1`
- Token Metric distribution:
  `0=1227`, `1=232`, `2+=82 -> 0=1222`, `1=237`, `2+=82`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

New Metrics:

- `1532`: `8YyGDMbZoAnjDrfVsu2oDpjRGab1BqgJHywUUovKpump`
- `1533`: `3fpUxogyLS2bVFbKSebNWz7jaepcNcUyB7tq6Xnrpump`
- `1534`: `XEDfJEWg649WmuLqDvtZjAxFebxKgPJ1b3kqmZVpump`
- `1535`: `5qwAMejmrzemp7tBW6y4wFyiWjcrfqXtnExRnFvepump`
- `1536`: `ACNm5y6jtbHXaFewMrUzkz1uJJPTYPCVCJzpXx8zpump`

`metrics:report` showed all five new Metrics as the latest
`geckoterminal.token_snapshot` rows with price / FDV / reserve / top-pool safe
summary booleans present. The report did not print rawJson.

The post-run 24h review queue reports `metricPendingCount=0`; the five rows
remain `enrichPending` with `metricsCount=1`. This confirms the first Metric
observation point is attached and readable. Next work should be a Green
decision point before any further Metric write expansion.

## New Metric Window Report Review

Date: 2026-05-23 20:22 JST

The five new Metric rows `1532..1536` were reviewed with `metrics:report` and
`metrics:window-report` using windows `30,60,120,180,360,720,1440`. The pass
was read-only (`willWrite=false`, `willFetch=false`,
`willSendTelegram=false`) and did not dump rawJson.

`metrics:report` confirmed all five rows are readable as
`geckoterminal.token_snapshot` Metrics with price / FDV / reserve / top-pool
safe summary booleans present.

Window report behavior was consistent across the cohort:

- `metricCount=1`
- `fdvMetricCount=1`
- `fdvSampleCoverageLabel=thin`
- `alertFdv=null`
- `hasAlertFdvAnchor=false`
- `hasWindowFdvSamples=true`
- `outcomeLabel=no_data`
- `noDataReasons=["no_alert_anchor_near_entry","no_peak_multiple"]`
- 30m window complete; 60m through 24h provisional
- `entryAnchorQuality=near_30m`

Entry anchor lag minutes:

- Metric `1532`: `18.7311`
- Metric `1533`: `19.9982`
- Metric `1534`: `21.2627`
- Metric `1535`: `22.5281`
- Metric `1536`: `23.7956`

Interpretation: the first Metric samples are visible and explainable as
`near_30m` entry anchors, but they do not provide alert-FDV anchors. Therefore
the rows remain useful for report context while outcome labels stay `no_data`.

Next lane recommendation: move to enrich/rescore Green preflight for these
five `mint_only` Metric-1 rows. Additional Metric accumulation can be useful
later, but the immediate gap is metadata / context, not another sample point.

## New Token Enrich/Rescore Preflight

Date: 2026-05-23 20:41 JST

The follow-up Green preflight stayed read-only and confirmed the five Metric-1
rows are still the active 24h GeckoTerminal pump `enrichPending` set. Current
state remained Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`, Metric distribution `0=1222`, `1=237`, `2+=82`, and
Notification statuses `captured=5`, `sent=5`, `failed=0`.

Target state before enrich/rescore:

- ids `5624..5620`
- `metadataStatus=mint_only`
- `name`, `symbol`, `description`, `normalizedText`, `enrichedAt`, and
  `rescoredAt` are still empty
- `scoreRank=C`, `scoreTotal=0`, `hardRejected=false`
- `metricsCount=1`, `notificationCount=0`, `holderSnapshotCount=0`
- latest Metric ids `1532..1536`

The `token:enrich-rescore:geckoterminal` CLI supports `--mint`, `--limit`,
`--sinceMinutes`, `--pumpOnly`, `--write`, and `--notify`. It does not support
`--interItemDelayMs`. Batch mode selects recent GeckoTerminal-origin tokens
missing `name` or `symbol`, sorted by `firstSeenSourceSnapshot.detectedAt` when
available. A read-only simulation for `--pumpOnly --limit 5 --sinceMinutes
1440` selected exactly ids `5624`, `5623`, `5622`, `5621`, and `5620`.

Write boundary for the next Red is Token-only: enrich fields, rescore fields,
context capture under `Token.entrySnapshot.contextCapture`, and
`reviewFlagsJson`. Metric rows, HolderSnapshot rows, and Notification rows are
not written by this CLI. Telegram send is only possible with `--notify`; the
recommended command omits it.

Recommended next Red exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Human approval is required because this will externally fetch GeckoTerminal and
best-effort Metaplex context, then update production Token rows. Expected
non-effects are Metric write, Notification create/update, HolderSnapshot write,
Telegram send, scheduler / systemd, repo-local data diff, and rawJson full
dump.

## New Token Enrich/Rescore Batch Result

Date: 2026-05-23 21:34 JST

The approved Red enrich/rescore batch ran once and completed with
`selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, and `error=0`.
Gecko context was written for all five rows. Metaplex lookup was attempted for
all five, but all returned `metadata_account_missing`; no Metaplex context was
saved. There was no provider error, no 429, and no retry.

DB counts stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`

The five-token cohort is now:

- `metadataStatus=partial`
- names / symbols present
- descriptions absent
- `normalizedText` present
- score remains `C / 0`
- `hardRejected=false`
- `metricsCount=1`
- `notificationCount=0`
- `holderSnapshotCount=0`
- review flags present with `hasWebsite=false`, `hasX=false`,
  `hasTelegram=false`, `metaplexHit=false`, `descriptionPresent=false`,
  `linkCount=0`

Per-token names:

- `5624`: `the saviour` / `BALTO`
- `5623`: `X COMM ADDED` / `Bunker`
- `5622`: `bank of banks` / `BANKS`
- `5621`: `Nietzschean Camel` / `Camel`
- `5620`: `VAULT COIN` / `VAULT`

Queue after the write:

- 24h pump queue: `enrichPendingCount=0`, `metricPendingCount=0`,
  `notifyCandidateCount=0`
- 168h pump queue: `enrichPendingCount=420`, `metricPendingCount=260`,
  `staleReviewCount=420`, `notifyCandidateCount=0`

This confirms the first Metric samples and metadata/context completion can be
reviewed separately. No Metric, Notification, HolderSnapshot, Telegram,
scheduler/systemd, or repo-local data side effect occurred.

## Enriched Partial Five-Token Report Review

Date: 2026-05-23 21:40 JST

The five rows enriched from `mint_only` to `partial` were checked again through
read-only report commands. No DB write, external fetch, Telegram send,
Notification update, Metric write, Token write, HolderSnapshot write,
scheduler/systemd, or rawJson full dump occurred.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Target readiness:

- all five are `metadataStatus=partial`
- name / symbol are present
- description is absent
- `normalizedText`, `enrichedAt`, and `rescoredAt` are present
- score remains `C / 0`
- `hardRejected=false`
- review flags are present with no website / X / Telegram / Metaplex /
  description signal
- each has `metricsCount=1`, `notificationCount=0`, and
  `holderSnapshotCount=0`

`metrics:report` showed Metric ids `1536..1532` as the latest
`geckoterminal.token_snapshot` rows with enriched token names / symbols and
rawJson-free safe summary booleans present.

`tokens:compare-report` with GeckoTerminal `partial` / hasMetrics /
`minMetricsCount=1` / latest GeckoTerminal Metric filters included the five
target rows at the top. They remain `outcomeBucket=unresolved` with
`outcomeBucketReason=multiple_missing`, which is expected for one-Metric
rows.

`metrics:window-report` for all five rows stayed:

- `metricCount=1`
- `fdvMetricCount=1`
- `fdvSampleCoverageLabel=thin`
- `hasAlertFdvAnchor=false`
- `hasWindowFdvSamples=true`
- `outcomeLabel=no_data`
- `noDataReasons=["no_alert_anchor_near_entry","no_peak_multiple"]`
- `entryAnchorQuality=near_30m`
- 30m / 60m / 120m complete
- 180m / 360m / 720m / 1440m provisional

Entry anchor lag minutes stayed approximately:

- `18.7311`
- `19.9982`
- `21.2627`
- `22.5281`
- `23.7956`

Queue after report review:

- 24h pump queue: `enrichPendingCount=0`, `metricPendingCount=0`,
  `notifyCandidateCount=0`
- 168h pump queue: `enrichPendingCount=420`, `metricPendingCount=260`,
  `staleReviewCount=420`, `notifyCandidateCount=0`

Recommendation: next run a Green preflight for a second Metric snapshot small
Red targeting these five partial rows. This keeps the narrow cohort moving
before returning to the broader 168h enrich or Metric backlogs.

## Second Metric Snapshot Preflight for Partial Five

Date: 2026-05-24 01:43 JST

This Green preflight did not run Metric snapshot, did not fetch externally,
did not write DB rows, and did not dump rawJson. It checked whether the same
five enriched partial rows can be selected for a second bounded Metric append.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Target cohort:

| token id | symbol | metadataStatus | metrics | latest Metric | latest observedAt | minutes since latest |
|---:|---|---|---:|---:|---|---:|
| 5624 | `BALTO` | `partial` | 1 | 1532 | `2026-05-23T10:56:45.052Z` | 346.7 |
| 5623 | `Bunker` | `partial` | 1 | 1533 | `2026-05-23T10:57:00.717Z` | 346.5 |
| 5622 | `BANKS` | `partial` | 1 | 1534 | `2026-05-23T10:57:16.220Z` | 346.2 |
| 5621 | `Camel` | `partial` | 1 | 1535 | `2026-05-23T10:57:31.739Z` | 345.9 |
| 5620 | `VAULT` | `partial` | 1 | 1536 | `2026-05-23T10:57:47.424Z` | 345.7 |

Selection simulation for `--pumpOnly --limit 5 --sinceMinutes 1440
--minGapMinutes 60` returned `eligibleCount=5`, `selectedCount=5`, and
selected ids `5624`, `5623`, `5622`, `5621`, `5620`. There is no selection
drift at the current 24h cutoff.

Current report baseline was rechecked on two mints:

- `BALTO`: `metricCount=1`, `fdvMetricCount=1`, `thin`,
  `hasWindowFdvSamples=true`, `hasAlertFdvAnchor=false`,
  `entryAnchorQuality=near_30m`, `outcomeLabel=no_data`
- `VAULT`: same baseline fields; 30m / 60m / 120m / 180m / 360m are complete,
  while 12h / 24h remain provisional at this check time

Queue context:

- 24h pump queue: `geckoOriginTokenCount=5`, `enrichPendingCount=0`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h pump queue at the 2026-05-24 cutoff:
  `geckoOriginTokenCount=275`, `enrichPendingCount=270`,
  `metricPendingCount=110`, `staleReviewCount=270`,
  `notifyCandidateCount=0`

Recommended Red command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected result if all five snapshots succeed: each target moves from
`metricsCount=1` to `metricsCount=2`, improving the window/report sampling
surface from a single FDV point toward partial coverage. Expected non-effects
remain Token write `0`, Notification create/update `0`, HolderSnapshot write
`0`, Telegram send `0`, scheduler/systemd `0`, repo-local data diff `0`, and
rawJson full dump `0`.

## Second Metric Snapshot Report Check

Date: 2026-05-24 02:10 JST

The second bounded Metric snapshot Red completed and was followed by
rawJson-free read-only report checks. No second Red command was run.

Execution:

- command:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write`
- selected / written / skipped / error: `5 / 5 / 0 / 0`
- interItemDelayMs / interItemDelayCount: `15000 / 4`
- provider error: no
- 429: no
- retry: no

DB state:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`
- Metric distribution:
  `0=1222`, `1=237`, `2+=82 -> 0=1222`, `1=232`, `2+=87`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`
- retry and enabled auto-send candidates stayed `0`

Target result:

- `5624` / `BALTO`: Metric `1537`, `metricsCount=2`
- `5623` / `Bunker`: Metric `1538`, `metricsCount=2`
- `5622` / `BANKS`: Metric `1539`, `metricsCount=2`
- `5621` / `Camel`: Metric `1540`, `metricsCount=2`
- `5620` / `VAULT`: Metric `1541`, `metricsCount=2`

All five stayed `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, `notificationCount=0`, and `holderSnapshotCount=0`.

`metrics:report` confirmed the five new rows are the latest
`geckoterminal.token_snapshot` Metrics and printed only safe summary fields;
no rawJson full dump occurred.

`metrics:window-report` for all five rows confirmed:

- `metricCount=2`
- `fdvMetricCount=2`
- 30m / 60m / 120m / 180m / 360m windows remain `thin`
- 12h / 24h windows are now `partial`
- `hasWindowFdvSamples=true`
- `hasAlertFdvAnchor=false`
- `entryAnchorQuality=near_30m`
- `outcomeLabel=no_data`
- `noDataReasons` include `no_alert_anchor_near_entry` and
  `no_peak_multiple`
- 12h / 24h are still provisional

This confirms the second Metric improved longer-window sample coverage, but it
does not change alert-anchored outcome classification for no-Notification rows.
The next useful Green lane is a read-only preflight for the 168h
GeckoTerminal enrichPending backlog.

## Enrich Backlog Preflight After Second Metric

Date: 2026-05-24 09:57 JST

After the five-token cohort reached second Metric and report verification, a
Green preflight inspected the 168h GeckoTerminal enrichPending backlog. It did
not run enrich/rescore, Metric snapshot, detect watch, `--write`, `--notify`,
external fetch, Telegram send, Notification update, or rawJson full dump.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Backlog state:

- 168h GeckoTerminal-origin count: `245`
- complete Gecko rows skipped by enrich selector: `5`
- enrichPending count: `240`
- pumpOnly enrichPending count: `240`
- metadataStatus distribution: `mint_only=240`
- source distribution: `geckoterminal.new_pools=240`
- metricsCount distribution: `0=85`, `1=96`, `2+=59`
- scoreRank distribution: `C=240`
- hardRejected distribution: `false=240`
- narrow-loop overlap count: `0`

Selection simulation:

- limit 5 selects ids `5619`, `5618`, `5617`, `5616`, `5615`
- limit 10 selects ids `5619..5610`
- limit 20 selects ids `5619..5600`
- selected rows are all `mint_only`, `C / 0`, non-hard-rejected,
  GeckoTerminal-origin pump rows
- selection does not include the completed narrow-loop ids `5624..5620`

Recommended Red command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

This Red would update Token enrichment/rescore/context/reviewFlags for at most
five rows after external GeckoTerminal and best-effort Metaplex fetches. It
should not write Metrics, create/update Notifications, write HolderSnapshots,
send Telegram, touch scheduler/systemd, create repo-local data diffs, or dump
rawJson. Human approval is required; do not add `--notify`.

## Enrich Backlog Batch Result

Date: 2026-05-24 11:01 JST

The human-approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.

Selected ids `5619..5615` moved from `mint_only` to `partial`; each now has
name/symbol and normalized text, remains score `C / 0`, remains
`hardRejected=false`, has `enrichedAt` / `rescoredAt`, and has reviewFlags.
Metaplex was attempted for all five and returned `metadata_account_missing=5`,
so description/link/social flags remain absent.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`
and Notification statuses `captured=5`, `sent=5`, `failed=0`. The 168h queue
now shows `enrichPendingCount=235`, `metricPendingCount=85`,
`staleReviewCount=235`, and `notifyCandidateCount=0`.

This confirms the limit-5 backlog Token update boundary. It did not write
Metrics, create/update Notifications, write HolderSnapshots, send Telegram,
execute auto-send/retry, touch scheduler/systemd, create repo-local data
diffs, or dump rawJson. Next work should stay Green: review this batch and
decide whether to continue with another bounded enrich backlog Red or switch
to Metric/report follow-up.

## Enriched Backlog Batch Report Review

Date: 2026-05-24 11:33 JST

The read-only review of ids `5619..5615` confirmed that the newly partial rows
are visible in Metric and compare reports without rawJson dumps. No
`--write`, external fetch, Telegram send, Notification update, Metric snapshot,
detect watch, scheduler/systemd, schema, migration, or app code change was
performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, score `C / 0`, `hardRejected=false`, with
  names/symbols, normalized text, reviewFlags, and enrichment/rescore
  timestamps
- `5619` has a sent Notification `id=10` attached to Metric `1531`; it remains
  non-retry and not an auto-send candidate
- `metrics:report` reads 5 Metrics for `5619` and 4 Metrics for `5618`; the
  rows expose safe market-data presence booleans, not raw provider payloads
- `metrics:window-report` for `5619` uses the sent Notification as entry but
  has no post-entry FDV samples, so windows are `no_data`
- `metrics:window-report` for `5618` has firstSeen entry, `near_30m` anchor,
  30m / 60m `thin`, 2h-12h `partial`, 24h `usable`, and still `no_data`
  because no alert FDV anchor / peak multiple exists
- `tokens:compare-report` includes all five rows with `minMetricsCount=4`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=235`,
`metricPendingCount=85`, `staleReviewCount=235`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5614..5610`, all
`mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, and `metricsCount=3`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are Token updates for up to five rows after external
GeckoTerminal and best-effort Metaplex fetches. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Human approval
is required; do not add `--notify`.

## 2026-06-03 Phase 2 Targeted Metric Cleanup Report Readiness

The first post-MVP Phase 2 targeted Metric cleanup wrote Metric ids
`2417..2466` for token ids `7477..7428` with the safe GeckoTerminal Metric
alias in network-enabled / out-of-sandbox context. The Red ran exactly once
and returned `selected=50`, `ok=50`, `written=50`, `error=0`,
`providerErrorCount=0`, and all provider error categories `0`.

RawJson-free readiness checks:

- selected rows all moved to `metricsCount=1`
- selected rows remained `metadataStatus=mint_only`
- selected Notification total stayed `0`
- selected HolderSnapshot total stayed `0`
- safe market-data booleans are price / FDV / reserve / top-pool present for
  `50 / 50`
- representative `metrics:report` checks for token ids `7477`, `7453`, and
  `7428` each returned the expected new Metric row and did not dump rawJson

Counts moved only in Metric: Token / Metric / Notification / HolderSnapshot
`3383 / 1307 / 22 / 1 -> 3383 / 1357 / 22 / 1`. Metric buckets moved from
`0=2216`, `1=1080`, `2+=87` to `0=2166`, `1=1130`, `2+=87`.

Queue after is default `metricPendingCount=210`, `enrichPendingCount=260`,
`notifyCandidateCount=0`; rolling 168h `metricPendingCount=210`,
`enrichPendingCount=453`, `notifyCandidateCount=0`. The next useful Green is
post-run review plus targeted enrich preflight for these newly Metric-covered
rows.

## 2026-06-04 Phase 2 Enrich Cleanup Preflight

The post-run Metric cleanup review confirmed that token ids `7477..7428` are
ready for targeted enrich cleanup. Representative rawJson-free `metrics:report`
checks:

- token id `7477` -> Metric id `2417`, source
  `geckoterminal.token_snapshot`, price / FDV / reserve / top-pool present
- token id `7453` -> Metric id `2441`, source
  `geckoterminal.token_snapshot`, price / FDV / reserve / top-pool present
- token id `7428` -> Metric id `2466`, source
  `geckoterminal.token_snapshot`, price / FDV / reserve / top-pool present

Prisma read-only simulation for `token:enrich-rescore:geckoterminal:safe`
selection:

- `sinceMinutes=420`: selected `0` because the created/first-seen window has
  drifted past the cleanup batch
- `sinceMinutes=10080`: selected ids `7477..7428`, count `50`
- selected rows are all `mint_only`, `metricsCount=1`, `score=C/0`,
  `hardRejected=false`, and `reviewFlagsPresent=false`
- selected Notification total is `0`; selected HolderSnapshot total is `0`

Recommended next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --interItemDelayMs 15000 --write
```

Human approval is required. Required context is network-enabled /
out-of-sandbox. Expected side effects are external GeckoTerminal fetch,
best-effort Metaplex fetch, and Token enrich/rescore/context/reviewFlags
updates for up to `50` rows. Expected non-effects are Metric write,
Notification create/update/send, HolderSnapshot write, Telegram send, retry,
auto-send, scheduler/systemd, and rawJson full dump.

## 2026-05-31 Post-run Metric Continuation Report Check

After the Skill-shortened post-run Metric pending continuation wrote Metric ids
`1966..2015`, representative read-only `metrics:report` checks confirmed the
new rows are report-readable without rawJson dumps.

Checked token ids:

- `7117`: Metric id `1966`, observedAt `2026-05-31T10:21:54.029Z`
- `7092`: Metric id `1991`, observedAt `2026-05-31T10:28:21.645Z`
- `7068`: Metric id `2015`, observedAt `2026-05-31T10:34:35.328Z`

Each report returned one `geckoterminal.token_snapshot` Metric with safe
booleans `priceUsdPresent=true`, `fdvUsdPresent=true`,
`reserveUsdPresent=true`, and `topPoolPresent=true`. The selected rows moved
to `metricsCount=1`, while `notificationCount=0` and
`holderSnapshotCount=0` stayed unchanged.

The report check was read-only and did not write DB rows, fetch providers,
send Telegram, update Notifications, or dump rawJson.

## Metric Backlog Report/Selection Preflight

Date: 2026-05-24 21:41 JST

The post-enriched-cohort Metric backlog preflight stayed read-only. It did not
run `metric:snapshot:geckoterminal`, did not fetch external APIs, did not write
Metrics or Tokens, did not touch Notifications, and did not dump rawJson or
offensive raw text.

Read-only state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

The 168h queue still has `metricPendingCount=85`, but those rows are older
Metric 0 rows: ids `5380..5464`, all `mint_only`, score `C`,
`hardRejected=false`, and raw-text-free in this summary.

The current batch Metric snapshot selector does not reach those rows at the
checked limits. With `--sinceMinutes 10080 --minGapMinutes 60`, it selects
newer already measured rows first:

- limit 5: ids `5624..5620`, `metricsCount=2`
- limit 20: ids `5624..5605`, `metricsCount=2..5`
- limit 30: ids `5624..5595`, `metricsCount=2..5`
- limit 75: ids `5624..5550`, `metricsCount=1..5`, no Metric 0 rows

This means a batch Metric Red would improve sampling density for already
measured rows, but it would not improve the report state of the Metric 0
backlog and would not reduce `metricPendingCount=85`.

Recommendation for report readiness: before the next Metric write Red, run a
Green exact-mint Metric 0 preflight for one selected backlog row and confirm
that `--noNotificationCapture` is part of the later exact `--mint --write`
command. If broader Metric backlog processing is desired, design or preflight
a pending-first batch selection path first.

## Exact-Mint Metric 0 Report Follow-Up Preflight

Date: 2026-05-24 22:33 JST

The exact-mint preflight selected token id `5464` from the Metric 0 backlog:
`By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`. The row is
`geckoterminal.new_pools`, pump, `mint_only`, score `C / 0`,
`hardRejected=false`, with `metricsCount=0`, `notificationCount=0`,
`holderSnapshotCount=0`, and no latest Metric.

The future write command can reduce report backlog by adding the first Metric
to exactly this row. If it succeeds, expected report movement is:

- `metricPendingCount`: `85 -> 84`
- Metric count: `459 -> 460`
- Token Metric distribution: `0=1222 -> 1221`, `1=232 -> 233`, `2+=87`
- selected token `metricsCount`: `0 -> 1`

Because exact `--mint --write` creates a `metric_appended` Notification by
default, the command must include `--noNotificationCapture`. With that option,
the preflighted write boundary is Metric only: no Notification create/update,
no Token write, no HolderSnapshot write, and no Telegram send.

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Post-Red report checks, if approved and successful, should be read-only only:
`metrics:report` for the mint, `metrics:window-report` for baseline no-data /
thin state, and `review:queue:geckoterminal -- --pumpOnly --sinceHours 168`
to confirm Metric pending decreased by one.

## Seventh Enriched Backlog Batch Report Review

Date: 2026-05-24 20:43 JST

The read-only report check for ids `5589..5585` confirmed that the seventh
bounded enrich backlog batch is visible in the report layer without rawJson
payloads and without side effects.

Target rows:

- `5589` `zynnner` / `zyn`
- `5588` `New Moon` / `Moon`
- `5587` `Turtle Carl` / `Carl`
- `5586` `SmilingFace` / `SmilingFace`
- `5585` `Pelican` / `PELICAN`

All five are `partial`, score `C / 0`, `hardRejected=false`, have normalized
text and reviewFlags, and have `metricsCount=2`, `notificationCount=0`,
`holderSnapshotCount=0`.

Report findings:

- `metrics:report` reads two GeckoTerminal token snapshot Metrics per row.
  Latest Metric ids are `1501..1505`, previous ids are `1316..1320`.
- The report exposes safe market-data presence fields and does not dump raw
  provider payloads.
- Representative `metrics:window-report` checks for `5589` and `5585` use
  firstSeen as entry with `entryAnchorQuality=delayed_180m`.
- 30m / 60m / 2h windows are `no_data`; 3h / 6h / 12h windows are `thin`; 24h
  is `partial`.
- `hasWindowFdvSamples=true` begins at 3h, but `hasAlertFdvAnchor=false`; the
  outcome stays `no_data`.
- Target compare summary remains unresolved because latest multiple / peak
  fields are missing.

This confirms the report layer is adequate for the seventh batch. The next
recommended operating step is not another report command, but a Green progress
consolidation / handoff across the repeated enrich backlog batches before more
write batches are approved.

## Enrich Backlog Progress Consolidation

Date: 2026-05-24 20:52 JST

The repeated bounded enrich backlog Reds have produced a 35-row partial cohort
without needing immediate Metric/report follow-up. Every processed row in ids
`5619..5585` has at least two Metrics, is visible through read-only report
surfaces, and remains unresolved mainly because alert-anchor / peak-multiple
fields are absent rather than because report data is unreadable.

Consolidated cohort quality:

- `metadataStatus=partial`: `35`
- score distribution: `C=34`, `B=1`
- score totals: `0=32`, `1=2`, `2=1`
- hard rejected: `0`
- website / X / Telegram / Metaplex / description / link presence: `0`
- notify candidates in queue: `0`
- Metric bucket inside the cohort: all `2+`

This means the report lane can continue to read the cohort, but the next
highest-value write step is still bounded enrichment of the remaining backlog,
not more report-only follow-up for these same rows. Broader metric backlog
preflight remains a later lane for the remaining `metricPendingCount=85`.

## Eighth Enrich Backlog Batch Report Follow-up Needed

Date: 2026-05-24 20:57 JST

The eighth bounded enrich backlog Red moved ids `5584..5580` from `mint_only`
to `partial`. The command itself did not run report/window checks; only
post-write safe summaries and queue/planner checks were performed. Counts
stayed Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`,
and the 168h queue moved to `enrichPendingCount=200`,
`metricPendingCount=85`, `staleReviewCount=200`, `notifyCandidateCount=0`.

Next report task should inspect ids `5584..5580` read-only. Docs intentionally
redact offensive name/symbol values for two rows and avoid rawJson dumps.

## Eighth Enrich Backlog Batch Report Review

Date: 2026-05-24 21:05 JST

The follow-up review of ids `5584..5580` stayed read-only and rawJson-free.
Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
Retry and auto-send allowed candidates stayed `0`.

The five tokens are all `partial`, non-hard-rejected, have normalized text,
reviewFlags, and `metricsCount=2`. IDs `5584` and `5583` contain offensive
name/symbol values and should be summarized only as `[offensive term]` in docs
and final reports. `5581` is `C / 1` from a learned AI-phrase score hit; the
others are `C / 0`. None has Notification or HolderSnapshot rows.

Report handling:

- target Metric rows were confirmed through a redacted Prisma safe summary
  rather than broad package output for the full target set, preserving the
  offensive-name redaction boundary
- representative `metrics:window-report` checks for `5581` and `5580` printed
  read-only safety fields and no raw provider payload
- both representative rows have `metricCount=2`, `fdvMetricCount=2`,
  `hasAlertFdvAnchor=false`, and FDV samples in wider windows
- `5581`: firstSeen entry, `entryAnchorQuality=delayed_180m`; short windows
  are `no_data`, 3h / 6h / 12h are `thin`, 24h is `partial`
- `5580`: firstSeen entry, `entryAnchorQuality=late_360m`; short windows are
  `no_data`, 6h / 12h are `thin`, 24h is `partial`
- outcome stays `no_data` because no alert FDV anchor / peak multiple exists

Queue context stayed healthy: default queue empty; 168h queue
`enrichPendingCount=200`, `metricPendingCount=85`, `staleReviewCount=200`,
`notifyCandidateCount=0`.

Next report-oriented step should be Green progress consolidation / handoff.
Another limit 5 enrich backlog Red is still possible after fresh preflight, but
the current report finding does not require immediate Metric/report follow-up
for ids `5584..5580`.

## Offensive-Safe Enriched Cohort Report Handoff

Date: 2026-05-24 21:20 JST

The processed enrich backlog cohort now contains 40 partial tokens
(`5619..5580`) created by eight successful bounded Red batches. Report and
window checks are usable, but two rows introduced an offensive name/symbol
handling constraint that applies to future report tasks.

Report-safe cohort facts:

- all 40 rows are `partial`
- scoreRank distribution is `C=39`, `B=1`
- scoreTotal distribution is `0=36`, `1=3`, `2=1`
- no hard rejects
- no website, X, Telegram, Metaplex hit, description, or link flags
- notifyCandidate remains `0`
- `metricsCount` distribution is `2=10`, `3=25`, `4=4`, `5=1`

Report handling rule:

- for offensive name/symbol rows, print only `[offensive term]`, row counts, or
  other redacted labels
- do not use broad target-set `metrics:report` or `tokens:compare-report`
  output when it would print offensive raw text
- prefer redacted Prisma safe summaries plus representative non-offensive
  `metrics:window-report` samples
- keep `Metric.rawJson`, provider raw bodies, secrets, env, and offensive raw
  text out of docs and final reports

The next report lane task should analyze the recent enriched cohort rather than
write more data immediately: compare score signals, no-link / no-description
patterns, no-alert-anchor window behavior, and whether the remaining
`metricPendingCount=85` should become the next Green preflight target.

## Recent Enriched Cohort Window Analysis

Date: 2026-05-24 21:35 JST

The 40-token enriched cohort `5619..5580` was reviewed as a read-only report
sample. Broad target-set report commands were avoided for rows that could print
offensive raw text; representative non-offensive `metrics:window-report`
commands and redacted Prisma summaries were used instead.

Representative rows:

- `5607` `Doge Coffee` / `DOGECOFFEE`, score `B / 2`, `metricCount=3`
- `5581` `stop using ai` / `ai`, score `C / 1`, `metricCount=2`
- `5582` `Jester` / `Jester`, score `C / 0`, `metricCount=2`

Findings:

- all reports stayed `readOnly=true`, `willWrite=false`, `willFetch=false`,
  `willSendTelegram=false`
- `5607` has `fdvMetricCount=3`, 2h `thin`, 3h / 6h / 12h / 24h `partial`,
  and `entryAnchorQuality=delayed_120m`
- `5581` and `5582` have `fdvMetricCount=2`, 3h / 6h / 12h `thin`, 24h
  `partial`, and `entryAnchorQuality=delayed_180m`
- every representative row has `hasAlertFdvAnchor=false`,
  `hasWindowFdvSamples=true` in wider windows, and `outcomeLabel=no_data`
- common no-data reasons are `no_alert_anchor_near_entry` and
  `no_peak_multiple`

Report conclusion: the current enriched cohort is readable, but the lack of
alert FDV anchors means additional Token enrichment alone is unlikely to change
outcome classification. The better next Green task is metric backlog preflight:
inspect the remaining `metricPendingCount=85`, selection order, pacing, and
rate-limit boundary before any Metric write Red.

## Sixth Enrich Backlog Batch Follow-Up Point

Date: 2026-05-24 20:23 JST

The sixth bounded enrich backlog Red updated ids `5594..5590` from
`mint_only` to `partial` without adding Metrics. Counts remained Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`; Metric
distribution remained `0=1222`, `1=232`, `2+=87`; Notification statuses
remained `captured=5`, `sent=5`, `failed=0`.

The selected rows now have names/symbols and `metricsCount=3`:

- `5594` `Test Coin` / `TEST`, score `C / 0`
- `5593` `KOWAKU` / `KOWAKU`, score `C / 0`
- `5592` `Gad Sad` / `GAD`, score `C / 0`
- `5591` `NEXT PWEASE TWEET EVERY SEC` / `BONERPHONE`, score `C / 0`
- `5590` `Sketichification` / `Sketchify`, score `C / 1`

The batch should be reviewed next with read-only `metrics:report`,
`metrics:window-report`, `tokens:compare-report`, queue, auto-send planner, and
retry planner checks. Expected report boundary is unchanged: no raw provider
payload dump, no DB write, no external fetch, no Telegram send, and no
Notification update during the Green review.

## Sixth Enriched Backlog Batch Report Review

Date: 2026-05-24 20:32 JST

The read-only report review of ids `5594..5590` confirmed that the sixth
enrich backlog batch is readable without raw provider payload dumps or side
effects. No DB write, external fetch, Telegram send, Notification update,
Metric write, Token write, HolderSnapshot write, scheduler/systemd, schema,
migration, or app code change occurred during this review.

The reviewed rows are all `metadataStatus=partial`, have names/symbols,
normalized text, `enrichedAt`, `rescoredAt`, and reviewFlags. All have
`metricsCount=3`, `notificationCount=0`, and `holderSnapshotCount=0`.
`5590` is the only non-zero score in the cohort: `C / 1` from one core `cat`
keyword hit; it is still not a notify candidate.

`metrics:report` returns three safe GeckoTerminal Metric summaries for each
row:

- `5594`: Metric ids `1496`, `1416`, `1311`
- `5593`: Metric ids `1497`, `1417`, `1312`
- `5592`: Metric ids `1498`, `1418`, `1313`
- `5591`: Metric ids `1499`, `1419`, `1314`
- `5590`: Metric ids `1500`, `1420`, `1315`

Representative `metrics:window-report` checks:

- `5594`: firstSeen entry, `entryAnchorQuality=delayed_180m`,
  `metricCount=3`, `fdvMetricCount=3`, 30m / 60m / 2h `no_data`, 3h `thin`,
  6h / 12h / 24h `partial`, `outcomeLabel=no_data`
- `5590`: firstSeen entry, `entryAnchorQuality=delayed_180m`,
  `metricCount=3`, `fdvMetricCount=3`, 30m / 60m / 2h `no_data`, 3h `thin`,
  6h / 12h / 24h `partial`, `outcomeLabel=no_data`

Both have `hasAlertFdvAnchor=false`; the no-data reasons are alert-anchor /
peak-multiple related once FDV samples exist. Target compare summary keeps all
five rows unresolved with `outcomeBucketReason=multiple_missing`.

Queue and planner state after review remains unchanged: default queue has no
enrich, metric, or notify candidates; 168h queue has
`enrichPendingCount=210`, `metricPendingCount=85`, `staleReviewCount=210`,
`notifyCandidateCount=0`; enabled auto-send allowed candidates and retry
candidates are `0`.

Recommendation: continue with one more limit 5 enrich backlog Red. The next
selection is ids `5589..5585`; all are `mint_only`, GeckoTerminal-origin pump
rows, score `C / 0`, `hardRejected=false`, `metricsCount=2`, and have no
Notification or HolderSnapshot rows.

## Seventh Enrich Backlog Batch Follow-Up Point

Date: 2026-05-24 20:38 JST

The seventh bounded enrich backlog Red updated ids `5589..5585` from
`mint_only` to `partial` without adding Metrics. Counts remained Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`; Metric
distribution remained `0=1222`, `1=232`, `2+=87`; Notification statuses
remained `captured=5`, `sent=5`, `failed=0`.

The selected rows now have names/symbols and `metricsCount=2`:

- `5589` `zynnner` / `zyn`, score `C / 0`
- `5588` `New Moon` / `Moon`, score `C / 0`
- `5587` `Turtle Carl` / `Carl`, score `C / 0`
- `5586` `SmilingFace` / `SmilingFace`, score `C / 0`
- `5585` `Pelican` / `PELICAN`, score `C / 0`

No row has Notification or HolderSnapshot rows, and no row became a notify
candidate during the Red execution. The batch should be reviewed next with
read-only `metrics:report`, `metrics:window-report`,
`tokens:compare-report`, queue, auto-send planner, and retry planner checks.
Expected report boundary is unchanged: no raw provider payload dump, no DB
write, no external fetch, no Telegram send, and no Notification update during
the Green review.

## Fifth Enriched Backlog Batch Report Review

Date: 2026-05-24 20:15 JST

The read-only review of ids `5599..5595` confirmed that the fifth newly
partial backlog batch is visible in Metric and compare reports without rawJson
dumps. No `--write`, external fetch, DB write, Telegram send, Notification
update, Metric snapshot, detect watch, scheduler/systemd, schema/migration, or
app code change was performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, `hardRejected=false`, with names/symbols,
  normalized text, reviewFlags, and enrichment/rescore timestamps
- four rows are score `C / 0`; `5596` is score `C / 1` due one core keyword
  hit, key `cat`, score `+1`
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`
- descriptions, website/X/Telegram/link flags, and Metaplex hits remain absent
- `metrics:report` reads three Metrics for each token; latest Metric ids are
  `1491..1495`, and rows expose safe market-data presence booleans
- `metrics:window-report` for `5596` and `5599` shows firstSeen entry,
  `entryAnchorQuality=delayed_180m`, 30m/60m/2h `no_data`, 3h `thin`, and
  6h-24h `partial`
- outcome remains `no_data` because there is no alert FDV anchor / peak
  multiple, even though wider windows have FDV samples
- `tokens:compare-report` includes all five rows with `minMetricsCount=3`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=215`,
`metricPendingCount=85`, `staleReviewCount=215`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5594..5590`, all
`mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, and `metricsCount=3`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are Token updates for up to five rows after external
GeckoTerminal and best-effort Metaplex fetches. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Human approval
is required; do not add `--notify`.

## Fifth Enrich Backlog Batch Result

Date: 2026-05-24 16:30 JST

The fifth bounded 168h enrich backlog Red completed with the same command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

The selected ids `5599..5595` are now `metadataStatus=partial` and remain
report candidates for the next Green review:

- all five have names/symbols and normalized text
- descriptions and website / X / Telegram / link / Metaplex flags remain
  absent
- four rows stayed score `C / 0`; `5596` became score `C / 1`
- all five remain `hardRejected=false`
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, Metric distribution stayed `0=1222`, `1=232`,
`2+=87`, and Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. Queue context stayed compatible with continuing the enrich backlog
lane: default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=215`,
`metricPendingCount=85`, `staleReviewCount=215`, `notifyCandidateCount=0`.

The run only used the Token update path. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send, scheduler /
systemd, repo-local data diff, or rawJson full dump. The next read-only step
is to review ids `5599..5595` in `metrics:report`,
`metrics:window-report`, `tokens:compare-report`, queue, and planner state.

## Fourth Enriched Backlog Batch Report Review

Date: 2026-05-24 15:30 JST

The read-only review of ids `5604..5600` confirmed that the fourth newly
partial backlog batch is visible in Metric and compare reports without rawJson
dumps. No `--write`, external fetch, DB write, Telegram send, Notification
update, Metric snapshot, detect watch, scheduler/systemd, schema/migration, or
app code change was performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, score `C / 0`, `hardRejected=false`, with
  names/symbols, normalized text, reviewFlags, and enrichment/rescore
  timestamps
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`
- descriptions, website/X/Telegram/link flags, and Metaplex hits remain absent
- `metrics:report` reads three Metrics for each token; latest Metric ids are
  `1486..1490`, and rows expose safe market-data presence booleans
- `metrics:window-report` for `5604` shows firstSeen entry,
  `entryAnchorQuality=delayed_120m`, 30m/60m `no_data`, 2h `thin`, and
  3h-24h `partial`
- `metrics:window-report` for `5600` shows firstSeen entry,
  `entryAnchorQuality=delayed_180m`, 30m/60m/2h `no_data`, 3h `thin`, and
  6h-24h `partial`
- outcome remains `no_data` because there is no alert FDV anchor / peak
  multiple, even though wider windows have FDV samples
- `tokens:compare-report` includes all five rows with `minMetricsCount=3`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=220`,
`metricPendingCount=85`, `staleReviewCount=220`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5599..5595`, all
`mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, and `metricsCount=3`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are Token updates for up to five rows after external
GeckoTerminal and best-effort Metaplex fetches. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Human approval
is required; do not add `--notify`.

## Third Enrich Backlog Batch Result

Date: 2026-05-24 14:01 JST

The third bounded 168h enrich backlog Red completed with the same command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

The selected ids `5609..5605` are now `metadataStatus=partial` and remain
report candidates for the next Green review:

- all five have names/symbols and normalized text
- descriptions and website / X / Telegram / link / Metaplex flags remain
  absent
- `5607` moved to score `B / 2`; the other four stayed `C / 0`
- all remain `hardRejected=false`
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, Metric distribution stayed `0=1222`, `1=232`,
`2+=87`, and Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. Queue context stayed compatible with continuing the enrich backlog
lane: default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=225`,
`metricPendingCount=85`, `staleReviewCount=225`, `notifyCandidateCount=0`.

The run only used the Token update path. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send, scheduler /
systemd, repo-local data diff, or rawJson full dump. The next read-only step
is to review ids `5609..5605` in `metrics:report`,
`metrics:window-report`, `tokens:compare-report`, queue, and planner state.

## Fourth Enrich Backlog Batch Result

Date: 2026-05-24 15:15 JST

The fourth bounded 168h enrich backlog Red completed with the same command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Execution summary: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

The selected ids `5604..5600` are now `metadataStatus=partial` and remain
report candidates for the next Green review:

- all five have names/symbols and normalized text
- descriptions and website / X / Telegram / link / Metaplex flags remain
  absent
- all five stayed score `C / 0`
- all remain `hardRejected=false`
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, Metric distribution stayed `0=1222`, `1=232`,
`2+=87`, and Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. Queue context stayed compatible with continuing the enrich backlog
lane: default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=220`,
`metricPendingCount=85`, `staleReviewCount=220`, `notifyCandidateCount=0`.

The run only used the Token update path. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send, scheduler /
systemd, repo-local data diff, or rawJson full dump. The next read-only step
is to review ids `5604..5600` in `metrics:report`,
`metrics:window-report`, `tokens:compare-report`, queue, and planner state.

## Third Enriched Backlog Batch Report Review

Date: 2026-05-24 14:11 JST

The read-only review of ids `5609..5605` confirmed that the third newly
partial batch is visible in Metric and compare reports without rawJson dumps.
No `--write`, external fetch, Telegram send, Notification update, Metric
snapshot, detect watch, scheduler/systemd, schema, migration, or app code
change was performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, `hardRejected=false`, with names/symbols,
  normalized text, reviewFlags, and enrichment/rescore timestamps
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`
- `5607` `Doge Coffee` / `DOGECOFFEE` is `B / 2`; safe scoring summary shows
  normalized text `doge coffee dogecoffee` and core keyword `dog` for `+2`
- `metrics:report` reads three Metrics for each selected token; latest Metric
  ids are `1481..1485`, and rows expose safe market-data presence booleans
- `metrics:window-report` for `5607` and `5609` has firstSeen entry,
  `delayed_120m` anchor, 30m / 60m `no_data`, 2h `thin`, 3h-24h `partial`,
  and still `no_data` because no alert FDV anchor / peak multiple exists
- `tokens:compare-report` includes all five rows with `minMetricsCount=3`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=225`,
`metricPendingCount=85`, `staleReviewCount=225`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5604..5600`, all
`mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, and `metricsCount=3`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are Token updates for up to five rows after external
GeckoTerminal and best-effort Metaplex fetches. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Human approval
is required; do not add `--notify`.

## Next Enrich Backlog Batch Result

Date: 2026-05-24 12:28 JST

The human-approved bounded backlog command ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.

Selected ids `5614..5610` moved from `mint_only` to `partial`; each now has
name/symbol and normalized text, remains score `C / 0`, remains
`hardRejected=false`, has `enrichedAt` / `rescoredAt`, and has reviewFlags.
Metaplex was attempted for all five and returned `metadata_account_missing=5`,
so description/link/social flags remain absent.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`, with Metric distribution `0=1222`, `1=232`, `2+=87`
and Notification statuses `captured=5`, `sent=5`, `failed=0`. The 168h queue
now shows `enrichPendingCount=230`, `metricPendingCount=85`,
`staleReviewCount=230`, and `notifyCandidateCount=0`.

This confirms the repeat limit-5 backlog Token update boundary. It did not
write Metrics, create/update Notifications, write HolderSnapshots, send
Telegram, execute auto-send/retry, touch scheduler/systemd, create repo-local
data diffs, or dump rawJson. Next work should stay Green: review this second
batch and decide whether to continue with another bounded enrich backlog Red
or switch to Metric/report follow-up.

## Next Enriched Backlog Batch Report Review

Date: 2026-05-24 12:37 JST

The read-only review of ids `5614..5610` confirmed that the newly partial rows
are visible in Metric and compare reports without rawJson dumps. No
`--write`, external fetch, Telegram send, Notification update, Metric snapshot,
detect watch, scheduler/systemd, schema, migration, or app code change was
performed.

State stayed:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Report summary:

- all five rows are `partial`, score `C / 0`, `hardRejected=false`, with
  names/symbols, normalized text, reviewFlags, and enrichment/rescore
  timestamps
- all five have `metricsCount=3`, `notificationCount=0`, and
  `holderSnapshotCount=0`
- `metrics:report` reads three Metrics for each selected token; the rows
  expose safe market-data presence booleans, not raw provider payloads
- `metrics:window-report` for `5614` and `5613` has firstSeen entry,
  `delayed_120m` anchor, 30m / 60m `no_data`, 2h `thin`, 3h-24h `partial`,
  and still `no_data` because no alert FDV anchor / peak multiple exists
- `tokens:compare-report` includes all five rows with `minMetricsCount=3`,
  latest GeckoTerminal Metric presence, and unresolved outcome

Queue context stayed compatible with continuing the enrich backlog lane:
default queue has `enrichPendingCount=0`, `metricPendingCount=0`,
`notifyCandidateCount=0`; 168h queue has `enrichPendingCount=230`,
`metricPendingCount=85`, `staleReviewCount=230`, `notifyCandidateCount=0`.

Recommendation: continue with one more limit 5 enrich backlog Red before any
Metric/report follow-up. The next selection is clear as ids `5609..5605`, all
`mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, and `metricsCount=3`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are Token updates for up to five rows after external
GeckoTerminal and best-effort Metaplex fetches. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump. Human approval
is required; do not add `--notify`.
