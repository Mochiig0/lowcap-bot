# Roadmap

Formal phased implementation order now lives in `docs/implementation-roadmap.md`.
This document remains the narrower near-term operating roadmap.

## Goal

Keep the current CLI-first, mint-driven accumulation MVP aligned with the live repo: narrow source-specific semi-automation, observable outcomes, and maintainable operating procedures without drifting into a generic bot runtime too early.

## Current Next Slice

Date: 2026-06-03

Personal MVP runtime validation is complete enough for personal bounded-run
use. The acceptance record is now `docs/runbooks/mvp-completion-checklist.md`.
The near-term roadmap moves from MVP completion to Phase 2 operational cleanup
and quality improvement. This does not unlock Telegram auto-send,
scheduler/systemd, trading automation, or scoring dictionary changes.

The first Phase 2 targeted Metric pending cleanup Red is now complete. It ran
one separately approved network-enabled / out-of-sandbox safe Metric snapshot
command with `--limit 50`, `--sinceMinutes 10080`, and
`--noNotificationCapture`. This was post-MVP backlog hygiene, not an MVP
completion requirement.

Result evidence: selected ids `7477..7428`, Metric ids `2417..2466`,
`selected=50`, `ok=50`, `written=50`, `error=0`, `providerErrorCount=0`, and
all provider error categories `0`. Counts moved only in Metric:
`3383 / 1307 / 22 / 1 -> 3383 / 1357 / 22 / 1`; Metric buckets moved to
`0=2166`, `1=1130`, `2+=87`. Notification / Telegram, Token,
HolderSnapshot, retry, auto-send, scheduler/systemd, and rawJson dumps stayed
unchanged. Queue after is default `metricPending=210`,
`enrichPending=260`, `notifyCandidate=0`; rolling 168h
`metricPending=210`, `enrichPending=453`, `notifyCandidate=0`.

Recommended next slice: **Green post-run Metric/report review and targeted
enrich preflight** for the newly Metric-covered rows. Do not continue with a
second Metric cleanup Red until that review confirms the new rows and decides
whether enrich cleanup should now take priority.

That Green review is now complete. The newly Metric-covered ids `7477..7428`
remain clean: Metric ids `2417..2466` exist, representative rawJson-free
reports show source `geckoterminal.token_snapshot` and price / FDV / reserve /
top-pool presence, and selected Notification / HolderSnapshot totals are `0`.
The strict 420 minute enrich window has drifted to `selectedCount=0`, but
`sinceMinutes=10080` selects exactly ids `7477..7428`, all `mint_only`,
`metricsCount=1`, `C/0`, non-hard-rejected, and without existing reviewFlags.

Recommended next slice: **Phase 2 targeted enrich cleanup Red** with human
approval in network-enabled / out-of-sandbox context, using the safe alias and
`--limit 50 --sinceMinutes 10080`. Do not run more Metric cleanup first unless
this enrich Red is blocked by a fresh preflight.

That targeted enrich cleanup Red is now complete. It ran exactly once in the
approved network-enabled / out-of-sandbox context, selected ids `7477..7428`,
and returned `selected=50`, `ok=50`, `error=0`, `enrichWriteCount=50`,
`rescoreWriteCount=50`, `contextWriteCount=50`,
`metaplexAttemptedCount=50`, `metaplexAvailableCount=1`,
`notifyWouldSendCount=0`, `notifySentCount=0`, `rateLimited=false`, and
`interItemDelayCount=49`. Counts stayed `3383 / 1357 / 22 / 1`; metadata
status moved to `mint_only=2551`, `partial=819`, `enriched=13`; Metric
buckets stayed `0=2166`, `1=1130`, `2+=87`.

All selected rows moved `mint_only -> partial`, retained `metricsCount=1`,
and have reviewFlags / scoreBreakdown / GeckoTerminal context present. Score
distribution is `C / 0 = 48`, `B / 2 = 2`; `hardRejected=0`; Metaplex context
is present for `1 / 50`. Notification / Telegram, Metric writes,
HolderSnapshot writes, retry, auto-send, scheduler/systemd, and rawJson dumps
stayed `0`. Watchlist 168h now shows `14` ready `B / 2` report-only rows.

Recommended next slice: **Green post-run enrich/report review and Phase 2 lane
decision**. Do not automatically run another Red; first verify the 50 enriched
rows and decide between more Metric cleanup, more enrich cleanup, or watchlist
manual review.

That Green review is now complete. Target ids `7477..7428` are all `partial`
with reviewFlags, scoreBreakdown, GeckoTerminal context, one latest Metric,
and no Notification or HolderSnapshot rows. Existing Metric ids `2417..2466`
remain latest and rawJson-free safe checks show price / FDV / reserve /
top-pool presence for all 50. Score distribution stayed `C / 0 = 48`,
`B / 2 = 2`, and `hardRejected=0`.

The watchlist did change, but only as report-only evidence: the two target
`B / 2` rows are below notification threshold, and rolling 168h currently
shows `13` ready `B / 2` watchlist rows due time-window drift. Notification
candidate count remains `0`, as expected, because the notify rule is still
S-only and blockers are `rank_not_s`.

Recommended next slice: **Green watchlist manual review / scoring evidence
gathering**. Do not tune scoring yet and do not run a notification rehearsal
without a real S candidate. If the operator prefers additional cleanup Red
instead of no-write review, the next safer cleanup is targeted enrich of the
next clean `metricsCount=1` rows, not another automatic bounded run.

That watchlist / scoring evidence review is now complete. Rolling 168h has
`13` ready watchlist rows, all `B / 2`, `partial`, `metricsCount=1`,
non-hard-rejected, report-only, and below notification eligibility. Safe
scoreBreakdown aggregates are still weak: mostly single core hits, small
learned contribution, and no trend/combo evidence. ReviewFlags are sparse, and
only one watchlist row has community/metadata presence.

Decision: **do not tune the scoring dictionary and do not change notification
policy yet**. The B/2 watchlist remains useful as a manual report lane, but it
does not justify capture-only B Notifications, Telegram rehearsal, or lowering
the S-only notification boundary.

Recommended next slice: **Yellow/docs-only bounded runner cadence docs**.
This is now more valuable than another immediate write Red because the MVP
runtime path is proven and the current scoring evidence is not strong enough
for rule changes. If the operator chooses more data instead, do a fresh Green
cleanup preflight before selecting targeted enrich or Metric cleanup.

That cadence documentation is now defined in
`docs/runbooks/phase-two-operating-cadence.md`. Phase 2 operation should use
Green preflight before Red, safe aliases, one exact command per Red,
network-enabled / out-of-sandbox context for provider fetches, checkpoints
outside the repo, and explicit stop conditions for dirty worktree, failed
Notifications, retry candidates, auto-send candidates, unsafe checkpoints,
unclear selected rows, and raw dump requirements.

Recommended next slice: **Green targeted cleanup preflight** if more data is
wanted. Use it to decide whether the next cleanup should be targeted enrich
for already Metric-covered rows or targeted Metric for Metric-zero rows. Do
not use cadence docs as approval to run Red directly.

That targeted cleanup preflight is now complete. The 420 minute cleanup window
has drifted clear. The 10080 minute Metric preview selects clean Metric-zero
ids `7427..7378`, and DB-only enrich simulation selects the same ids with
`metricsCount=0`, so the next cleanup lane should be **targeted Metric
cleanup** before enrich. If approved as Red, use the safe Metric snapshot
shape with `--limit 50`, `--sinceMinutes 10080`, `--onlyMetricPending`,
`--noNotificationCapture`, and network-enabled / out-of-sandbox context.

That targeted Metric cleanup Red is now complete. It ran exactly once in the
approved network-enabled / out-of-sandbox context, selected ids `7427..7378`,
and returned `selected=50`, `ok=50`, `written=50`, `skipped=0`, `error=0`,
`providerErrorCount=0`, all provider error categories `0`, and
`interItemDelayCount=49`. Metric ids `2467..2516` were created, and all
selected rows moved to `metricsCount=1`.

Counts moved only in Metric: `3383 / 1357 / 22 / 1 -> 3383 / 1407 / 22 / 1`.
Metric buckets moved to `0=2116`, `1=1180`, `2+=87`. Metadata status stayed
`mint_only=2551`, `partial=819`, `enriched=13`. Notification / Telegram,
Token writes, HolderSnapshot writes, retry, auto-send, scheduler/systemd, and
rawJson dumps stayed unchanged. Queue after is default `metricPending=160`,
`enrichPending=210`, `notifyCandidate=0`; rolling 168h
`metricPending=160`, `enrichPending=370`, `notifyCandidate=0`.

Recommended next slice: **Green post-run Metric/report review and targeted
enrich preflight** for ids `7427..7378`. If that preflight is clean, the next
write lane should be targeted enrich cleanup, not another automatic Metric Red.

That Green review is now complete. Representative rawJson-free checks confirm
Metric ids `2467`, `2491`, and `2516` for token ids `7427`, `7403`, and
`7378`, with source `geckoterminal.token_snapshot` and price / FDV / reserve /
top-pool presence. The full target range `7427..7378` is `mint_only`,
`metricsCount=1`, `C / 0`, non-hard-rejected, with no Notification or
HolderSnapshot rows.

The strict `sinceMinutes=420` enrich window has drifted to `selectedCount=0`,
but `sinceMinutes=10080` selects exactly ids `7427..7378`, all clean for
targeted enrich cleanup and without existing reviewFlags. Recommended next
slice: **Phase 2 targeted enrich cleanup Red** with human approval in
network-enabled / out-of-sandbox context, using the safe alias and
`--limit 50 --sinceMinutes 10080`. Do not run more Metric cleanup first unless
this enrich Red is blocked by a fresh preflight.

The network-enabled 6H bounded runner MVP validation is complete. The approved
out-of-sandbox Red ran the exact `ops:run:bounded --execute` command once with
checkpoint `/tmp/lowcap-bot-mvp-6h-20260602.json`, two Metric cycles, two
enrich cycles, and `interItemDelayMs=15000`. It completed preflight, detect
write, Metric pending snapshot, enrich/rescore, report review, and
notification planner review with `blockedBy=[]` and `stopConditionCodes=[]`.

Runtime evidence now covers the personal MVP's main path: 360 new pump tokens
created, 100 Metric rows written (`2317..2416`), 100 tokens enriched/rescored
to `partial`, report/planner phases completed, checkpoint written outside the
repo, and progress/final summary logging observed. Notification / Telegram
remained unchanged: Notification count stayed `22`, failed count `0`,
enabled/disabled auto-send allowed `0 / 0`, retry candidate `0`, and Telegram
send `0`.

Recommended next slice: **Green post-run bounded runner review and targeted
Metric pending preflight**. The MVP runtime validation itself is no longer the
main blocker. Post-run planner now shows fresh 6h/default Metric and enrich
pending work (`6h metricPending=204`, `default metricPending=260`,
`168h metricPending=428`), so the next Red candidate should be a separately
approved Metric pending snapshot only after Green review, not another
long-running bounded runner and not Telegram/scheduler work.

That Green review is complete. Time drift has cleared the strict 6h planner
window, but the bounded runner's intended 420 minute buffered follow-up window
still has clean Metric backlog. Safe Metric preview selected ids `7477..7428`
with `dryRun=true`, `writeEnabled=false`, `metricsCount=0`,
`notificationCount=0`, `holderSnapshotCount=0`, `providerErrorCount=0`, no
fetch, and no rawJson dump. Enrich simulation found no 420 minute mint-only
rows with Metric coverage, so targeted enrich is not the shortest cleanup.

Recommended next slice: **either declare/checklist the personal MVP complete,
or run one short targeted network-enabled Metric pending Red**. If runtime
cleanup is preferred, use the safe alias `--limit 50 --sinceMinutes 420`
command with human approval. Avoid another long bounded runner and keep
Telegram auto-send, scheduler/systemd, and scoring dictionary work out of MVP.

The Yellow provider diagnostic visibility slice is complete.
`metric:snapshot:geckoterminal` now classifies failed provider items into safe
categories: `network_fetch_error`, `timeout`, `http_429`, `http_error`,
`parse_error`, `shape_error`, `provider_empty`, and `unknown`. Summaries now
include aggregate counts and first category/status, while per-item failures
include safe category/status/retryable fields. Retry behavior, write behavior,
selection, Notification capture, Telegram, DB schema, and default success path
are unchanged.

Recommended next slice: **Green classified-provider preflight**. Use the safe
Metric snapshot preview and planners first, then decide whether a very small
human-approved diagnostic Red is justified. Do not retry the broad 50-row
Metric backlog Red until the new classified output is observed under current
HEAD and safety planners remain clear.

That Green preflight is now complete on HEAD `66fb80a`. Safe preview confirms
the classified summary shape is present (`providerErrorCount=0`,
zeroed `errorCategoryCounts`, no first category/status) and the same 168h
Metric pending rows are still cleanly selectable without fetch/write. Because
preview mode intentionally does not hit the provider, it cannot classify the
previous `fetch failed` condition.

Recommended next slice: **small diagnostic Red, limit 1**, not a same-50 retry.
Use the safe alias with `--limit 1` and human approval to observe the new
provider category with Metric write capped at one row. If that returns
`network_fetch_error` or `timeout`, pause for provider/network review before
larger backlog writes. If it succeeds, run a fresh Green preflight before any
larger Metric continuation.

The limit `1` diagnostic Red has now run once. It selected token id `7017`,
wrote no Metric, and classified the failure as `network_fetch_error` with no
HTTP status. This confirms the provider problem is still occurring before an
HTTP response is available and is not currently an observed `429`, other HTTP
status, parse, shape, or provider-empty failure.

Recommended next slice: **Green provider/network environment review**. Do not
retry the same Metric backlog batch yet. The useful question is whether Codex
sandbox/network reachability, DNS/TLS/connectivity, or provider outage is
blocking Node fetch. If external network diagnostics are desired, they should
be a separately approved Green/Yellow diagnostic task with no DB write.

That provider/network review is complete. In the normal Codex sandbox,
GeckoTerminal host lookup and Node `fetch` fail before HTTP response with DNS
`EAI_AGAIN`, matching the CLI's `network_fetch_error`. Approved non-sandbox
read-only diagnostics resolve the same host and receive safe HTTP `404` HEAD
responses from GeckoTerminal/Cloudflare. The provider URL config is using the
default host and appears sane.

Recommended next slice: **operator-approved out-of-sandbox Red or network
approval decision**, not an in-sandbox retry. If the next Red is run in the
same restricted sandbox, it is expected to repeat `network_fetch_error`. No app
code or provider URL config fix is currently indicated.

The network-enabled Metric Red policy is now defined. Normal Codex sandbox
Metric provider-fetch Red is allowed only after current DNS/provider
reachability succeeds or a recent in-sandbox Metric fetch succeeded. With the
current sandbox DNS restriction, Metric Red requires explicit network-enabled
or out-of-sandbox approval, safe alias command shape, clean selection preview,
DB/queue/planner capture, failed Notification `0`, retry candidate `0`, and
enabled auto-send allowed `0`.

Recommended next slice: **network-enabled limit 1 Metric diagnostic Red** if
the operator wants to resume Metric backlog. Do this before any broad limit 50
retry. If the diagnostic succeeds, run a fresh Green preflight before a
separate limit 50 Red. If not, keep Metric backlog paused and switch to
preflighted enrich/report or network-enabled bounded runner planning.

The Codex CLI post-update Green preflight is complete on `codex-cli 0.136.0`.
The safe Metric snapshot alias still avoids the `tsx` IPC `EPERM` path and its
dry-run preview selects clean Metric-zero candidates without fetch/write.
Normal sandbox DNS still cannot resolve `api.geckoterminal.com`, while
approved out-of-sandbox read-only diagnostics resolve and reach the host with
HTTP HEAD. Therefore the next Metric provider-fetch Red should remain
network-enabled / out-of-sandbox and should start as limit `1` diagnostic
only. Current 168h backlog preview is `metricPendingCount=728` and
`enrichPendingCount=779`; default queue and notify candidates remain `0`.

That network-enabled limit `1` diagnostic Red is now complete. It selected id
`7017`, reached GeckoTerminal outside the normal sandbox, and wrote Metric id
`2066` at `observedAt=2026-06-02T10:47:11.851Z`. Provider diagnostics were
clean (`providerErrorCount=0`, all error categories `0`), and rawJson-free
reports confirmed price / FDV / reserve / top-pool presence. Counts moved only
in Metric: `3023 / 956 / 22 / 1 -> 3023 / 957 / 22 / 1`; rolling 168h
`metricPendingCount` moved `728 -> 727`; Notification / Telegram stayed `0`.

Recommended next slice: **fresh Green preflight for a separate limit 50
network-enabled Metric backlog Red** if the operator wants broader Metric data
collection. Do not continue directly from the diagnostic without a new
preflight and human-approved exact command.

That limit `50` Green preflight is now complete. HEAD `3432959` matched, the
working tree was clean, DB counts stayed `3023 / 957 / 22 / 1`, and Metric
buckets stayed `0=2206`, `1=730`, `2+=87`. Default queue is clear; rolling
168h has `metricPendingCount=727`, `enrichPendingCount=779`, and
`notifyCandidateCount=0`. Notification blockers are clear: failed
Notification `0`, retry candidate `0`, and enabled auto-send allowed `0`.

Safe preview for the proposed backlog command selected ids `7016..6967` with
`dryRun=true`, `writeEnabled=false`, `selectedCount=50`,
`providerErrorCount=0`, no external fetch, and no rawJson dump. All selected
rows have `metricsCount=0`, `notificationCount=0`, and
`holderSnapshotCount=0`; Notification capture is disabled.

Recommended next slice: **network-enabled limit 50 Metric backlog Red** with
human approval, exact safe alias command, and no second command/retry. Required
context remains network-enabled / out-of-sandbox.

That network-enabled limit `50` Metric backlog Red is now complete. It ran the
safe alias exact command once in the approved out-of-sandbox context, selected
ids `7016..6967`, wrote Metric ids `2067..2116`, and returned `selected=50`,
`ok=50`, `written=50`, `error=0`, `providerErrorCount=0`, and all error
categories `0`. Counts moved only in Metric:
`3023 / 957 / 22 / 1 -> 3023 / 1007 / 22 / 1`; Metric buckets moved
`0=2206, 1=730, 2+=87 -> 0=2156, 1=780, 2+=87`; rolling 168h
`metricPendingCount` moved `727 -> 677`. Notification / Telegram, Token,
HolderSnapshot, retry, auto-send, scheduler/systemd, rawJson dump, and
`pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run Metric/report review**, not an
immediate second Red. Confirm the new 50 Metric rows in reports and decide
whether another network-enabled backlog slice or an enrich/report lane is the
right next operating step.

That Green review passed and the next network-enabled limit `50` continuation
Red is now complete. It selected ids `6966..6917`, wrote Metric ids
`2117..2166`, and returned `selected=50`, `ok=50`, `written=50`, `error=0`,
`providerErrorCount=0`, and all error categories `0`. Counts again moved only
in Metric: `3023 / 1007 / 22 / 1 -> 3023 / 1057 / 22 / 1`; Metric buckets
moved `0=2156, 1=780, 2+=87 -> 0=2106, 1=830, 2+=87`; rolling 168h
`metricPendingCount` moved `677 -> 627`. Notification / Telegram, Token,
HolderSnapshot, retry, auto-send, scheduler/systemd, rawJson dump, and
`pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run Metric/report review** before any
third network-enabled backlog Red. The backlog is still sizable, but the
operating discipline remains one Red followed by one review.

That Green review passed and the third network-enabled limit `50`
continuation Red is now complete. It selected ids `6916..6867`, wrote Metric
ids `2167..2216`, and returned `selected=50`, `ok=50`, `written=50`,
`error=0`, `providerErrorCount=0`, and all error categories `0`. Counts again
moved only in Metric: `3023 / 1057 / 22 / 1 -> 3023 / 1107 / 22 / 1`;
Metric buckets moved `0=2106, 1=830, 2+=87 -> 0=2056, 1=880, 2+=87`;
rolling 168h `metricPendingCount` moved `627 -> 577`. Notification /
Telegram, Token, HolderSnapshot, retry, auto-send, scheduler/systemd, rawJson
dump, and `pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run Metric/report review** before any
fourth network-enabled backlog Red or lane switch decision.

That Green review passed and the fourth network-enabled limit `50`
continuation Red is now complete. Preflight showed the next Metric-zero
selection was `6866..6859` plus `6758..6717`; the skipped gap `6858..6759`
already had Metrics, so the non-contiguous selection was expected under
`--onlyMetricPending`. The Red wrote Metric ids `2217..2266` and returned
`selected=50`, `ok=50`, `written=50`, `error=0`, `providerErrorCount=0`,
and all error categories `0`. Counts again moved only in Metric:
`3023 / 1107 / 22 / 1 -> 3023 / 1157 / 22 / 1`; Metric buckets moved
`0=2056, 1=880, 2+=87 -> 0=2006, 1=930, 2+=87`; rolling 168h
`metricPendingCount` moved `577 -> 527`. Notification / Telegram, Token,
HolderSnapshot, retry, auto-send, scheduler/systemd, rawJson dump, and
`pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run Metric/report review** before any
fifth network-enabled backlog Red or lane switch decision.

That Green review passed and the fifth network-enabled limit `50`
continuation Red is now complete. It selected ids `6716..6667`, wrote Metric
ids `2267..2316`, and returned `selected=50`, `ok=50`, `written=50`,
`error=0`, `providerErrorCount=0`, and all error categories `0`. Counts again
moved only in Metric: `3023 / 1157 / 22 / 1 -> 3023 / 1207 / 22 / 1`;
Metric buckets moved `0=2006, 1=930, 2+=87 -> 0=1956, 1=980, 2+=87`.
Rolling 168h now shows `metricPendingCount=475` and
`enrichPendingCount=777`; this reflects the 50-row write plus two rows
drifting out of the 168h window. Notification / Telegram, Token,
HolderSnapshot, retry, auto-send, scheduler/systemd, rawJson dump, and
`pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run Metric/report review with lane
decision**. Confirm Metric ids `2267..2316`, then explicitly choose whether
to continue another network-enabled Metric backlog batch or switch to the
enrich/report lane because the enrich backlog remains high.

That Green review chose the enrich/report lane, and the first small
network-enabled enrich/rescore Red is now complete. It selected ids
`7068..7059` and ran the safe alias exact command once without `--notify`.
Result: `selected=10`, `ok=10`, `error=0`, `enrichWriteCount=10`,
`rescoreWriteCount=10`, `contextWriteCount=10`,
`metaplexAttemptedCount=10`, `metaplexAvailableCount=0`,
`notifyWouldSendCount=0`, `notifySentCount=0`, and `rateLimited=false`.
Counts stayed `3023 / 1207 / 22 / 1`; metadata moved
`mint_only=2391, partial=619, enriched=13 -> mint_only=2381, partial=629,
enriched=13`. Notification / Telegram, Metric, HolderSnapshot, retry,
auto-send, scheduler/systemd, rawJson dump, and `pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run enrich/report review** for ids
`7068..7059`. Confirm the updated context/reviewFlags/report visibility, then
decide whether the next step is another small enrich Red, Metric backlog, or
report-only review.

That Green review passed and the next small network-enabled enrich/rescore
continuation is now complete. It selected ids `7058..7049` and ran the safe
alias exact command once without `--notify`. Result: `selected=10`, `ok=10`,
`error=0`, `enrichWriteCount=10`, `rescoreWriteCount=10`,
`contextWriteCount=10`, `metaplexAttemptedCount=10`,
`metaplexAvailableCount=0`, `notifyWouldSendCount=0`, `notifySentCount=0`,
and `rateLimited=false`. Counts stayed `3023 / 1207 / 22 / 1`; metadata moved
`mint_only=2381, partial=629, enriched=13 -> mint_only=2371, partial=639,
enriched=13`. Notification / Telegram, Metric, HolderSnapshot, retry,
auto-send, scheduler/systemd, rawJson dump, and `pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run enrich/report review** for ids
`7058..7049`. Confirm context/reviewFlags/report visibility and lane choice
before any further Red.

That Green review passed and another small network-enabled enrich/rescore
continuation is now complete. It selected ids `7048..7039` and ran the safe
alias exact command once without `--notify`. Result: `selected=10`, `ok=10`,
`error=0`, `enrichWriteCount=10`, `rescoreWriteCount=10`,
`contextWriteCount=10`, `metaplexAttemptedCount=10`,
`metaplexAvailableCount=0`, `notifyWouldSendCount=0`, `notifySentCount=0`,
and `rateLimited=false`. Counts stayed `3023 / 1207 / 22 / 1`; metadata moved
`mint_only=2371, partial=639, enriched=13 -> mint_only=2361, partial=649,
enriched=13`. One selected row became hard-rejected with safe reason
`Matched HARD_NG: scam`; no row became a Notification candidate.
Notification / Telegram, Metric, HolderSnapshot, retry, auto-send,
scheduler/systemd, rawJson dump, and `pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run enrich/report review** for ids
`7048..7039`. Confirm context/reviewFlags/report visibility, hard-reject
classification, and lane choice before any further Red.

That Green review passed and another small network-enabled enrich/rescore
continuation is now complete. It selected ids `7038..7029` and ran the safe
alias exact command once without `--notify`. Result: `selected=10`, `ok=10`,
`error=0`, `enrichWriteCount=10`, `rescoreWriteCount=10`,
`contextWriteCount=10`, `metaplexAttemptedCount=10`,
`metaplexAvailableCount=1`, `notifyWouldSendCount=0`, `notifySentCount=0`,
and `rateLimited=false`. Counts stayed `3023 / 1207 / 22 / 1`; metadata moved
`mint_only=2361, partial=649, enriched=13 -> mint_only=2351, partial=659,
enriched=13`. No selected row became hard-rejected; one row gained Metaplex
context and one row is score `C / 1`. Notification / Telegram, Metric,
HolderSnapshot, retry, auto-send, scheduler/systemd, rawJson dump, and
`pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run enrich/report review** for ids
`7038..7029`. Confirm context/reviewFlags/report visibility, Metaplex context
presence, and lane choice before any further Red.

That Green review passed and another small network-enabled enrich/rescore
continuation is now complete. It selected ids `7028..7019` and ran the safe
alias exact command once without `--notify`. Result: `selected=10`, `ok=10`,
`error=0`, `enrichWriteCount=10`, `rescoreWriteCount=10`,
`contextWriteCount=10`, `metaplexAttemptedCount=10`,
`metaplexAvailableCount=0`, `notifyWouldSendCount=0`, `notifySentCount=0`,
and `rateLimited=false`. Counts stayed `3023 / 1207 / 22 / 1`; no selected
row became hard-rejected, all remained score `C / 0`, and Metaplex context
was absent for all 10. Notification / Telegram, Metric, HolderSnapshot, retry,
auto-send, scheduler/systemd, rawJson dump, and `pnpm smoke` stayed `0`.

Recommended next slice: **Green post-run enrich/report review** for ids
`7028..7019`. Confirm context/reviewFlags/report visibility and lane choice
before any further Red.

That Green review is now complete. The reviewed rows are all partial with
GeckoTerminal context, reviewFlags, one existing Metric, and no Notification /
HolderSnapshot rows. They all stayed `C / 0` because scoreBreakdown is present
but has zero core / learned / trend / combo hits, and their reviewFlags have no
website, X, Telegram, Metaplex, description, or link signals. The current
notify boundary is behaving as designed: 168h has `notifyCandidateCount=0`,
with blockers explained by `rank_not_s` and a small hard-rejected set.

MVP direction update: stop treating endless backlog reduction as the main
blocker. Network-enabled Metric capture and enrich/rescore have both been
proven repeatedly, `review:queue --includeBlockers` and `--watchlistOnly`
explain candidates safely, and notification planners remain closed. The main
personal-MVP runtime gap is now the network-enabled 6H bounded runner path:
`mvp:status` still reports bounded watch and checkpoint readiness as not
complete, while `ops:plan:bounded -- --hours 6 --pumpOnly --postRunPlan`
currently sees the 6H queues clear and emits a separately approved bounded
detect write rehearsal candidate.

Recommended next slice: **Green preflight for network-enabled 6H bounded
runner MVP validation**. Second choice is a Yellow/docs-only MVP completion
checklist/runbook. Another Metric or enrich backlog Red is useful data
collection, but it is no longer the primary MVP blocker.

That Green preflight is now complete. HEAD `f659dfb` matched, the working tree
was clean, default queue was clear, rolling 168h still had
`metricPendingCount=190` and `enrichPendingCount=442`, watchlist remained
report-only, failed Notification was `0`, disabled/enabled auto-send allowed
was `0 / 0`, and retry candidate was `0`. The checkpoint path
`/tmp/lowcap-bot-mvp-6h-20260602.json` is outside the repo, `/tmp` exists,
and the file does not exist.

The plan-only bounded runner command returned `readOnly=true`,
`executeRequested=false`, `computedSinceMinutes=420`, `maxIterations=360`,
`postRunMetricCycles=2`, `postRunEnrichCycles=2`, `blockedBy=[]`, and
`stopConditionCodes=[]`. It planned detect write, two Metric cycles, two
enrich cycles, report review, and notification planner review without running
any phase.

Recommended next slice: **human-approved network-enabled 6H bounded runner
Red** with the fixed command:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-mvp-6h-20260602.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

This Red must run network-enabled / out-of-sandbox. Expected effects are
GeckoTerminal fetch, bounded detect watch, Token create/reuse, checkpoint
write, up to `100` Metric writes, and up to `100` Token enrich/rescore
updates. Expected non-effects are Notification create/update, Telegram send,
HolderSnapshot write, retry execution, auto-send execution, scheduler/systemd,
rawJson full dump, offensive raw text dump, and `pnpm smoke`.

The Green provider-error review is complete. The safe alias launch path is
working, but the latest Metric backlog Red failed at the provider fetch layer:
`fetch failed` was reported for all `50` selected rows and no HTTP status was
available. Source inspection shows non-OK HTTP responses would include
status/statusText, so this result is more consistent with network/fetch-layer
reachability, timeout, or provider outage than with a visible 404/429 response.

Recommended next slice: **Yellow provider diagnostic visibility** for
`metric:snapshot:geckoterminal`. Add safe error classification/aggregation for
network fetch failures, timeouts, HTTP statuses, 429, parse/shape failures, and
unknown errors. Do not retry the same 50-row Red or run exact-mint write
diagnostics until the error reason is visible enough to decide.

The safe Metric backlog Red was attempted once. The safe alias fixed the prior
process-launch issue: no `tsx` IPC `EPERM` occurred, and app logic selected
the expected `50` rows (`7017..6968`). The batch did not write Metrics because
all selected provider requests returned `fetch failed`; result was selected
`50`, error `50`, written `0`. DB counts, Metric buckets, Notification state,
and 168h queue counts remained unchanged.

Next operating decision should be another Green review rather than an immediate
retry. The launch path is fixed, but provider/network availability prevented
Metric capture in this run. Do not compensate with a second write command
without a fresh preflight and human-approved exact command.

The safe Metric backlog preflight is complete on HEAD `aa33756`. The safe
alias help path no longer hits the `tsx` IPC `EPERM`, and the read-only
preview for `sinceMinutes=10080` selects `50` Metric-zero rows
(`7017..6968`) with no Notification or HolderSnapshot rows. Default queue is
clear, rolling 168h still has `metricPendingCount=1017`, enabled auto-send
allowed candidate is `0`, and retry candidate is `0`.

Recommended next slice: **human-approved Red Metric backlog continuation via
safe alias**:

```bash
pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected effects are external GeckoTerminal fetch and up to `50` Metric rows;
Token write, Notification create/update, HolderSnapshot write, Telegram send,
retry/auto-send execution, scheduler/systemd, and rawJson full dump should
remain `0`.

The safe CLI execution Yellow is complete. The root cause of the latest Red
failure is not Metric logic; it is the direct `tsx` package-script execution
path failing before app logic with IPC `listen EPERM`. The runner already uses
`node --import tsx` internally, and direct-node help / Metric selection preview
work in this environment.

Recommended next Red prompt pattern: use the new safe aliases or explicit
direct-node command forms for Red-prone GeckoTerminal CLIs:
`metric:snapshot:geckoterminal:safe`,
`token:enrich-rescore:geckoterminal:safe`, and
`detect:geckoterminal:new-pools:safe`. Existing scripts are retained for local
compatibility; Codex Red prompts should avoid the older direct `tsx` scripts
unless explicitly approved.

The human-approved Metric backlog continuation Red was attempted once with the
exact `sinceMinutes=10080` command, but it did not reach application logic.
The child `tsx` process failed to create its IPC pipe (`listen EPERM` under
`/tmp/tsx-1000`). Per the Red Skill boundary, no retry, fallback direct-node
write, second Red command, or manual backfill was run. DB counts and queues
remained unchanged: Token / Metric / Notification / HolderSnapshot
`3023 / 956 / 22 / 1`, rolling 168h `metricPendingCount=1017`, and enabled
auto-send allowed candidate `0`.

Next operating decision should be a fresh Green preflight. Do not reuse stale
selection blindly; either address the `tsx` IPC execution boundary for package
scripts or choose a newly approved exact command after current HEAD / queue /
planner review.

The backlog/data collection preflight is complete. The current 24h/420m and
1440m windows are empty, but the rolling 168h backlog remains large:
`metricPendingCount=1017` and `enrichPendingCount=1013`. Metric dry-run
selection with `sinceMinutes=10080` cleanly selects `50` Metric-zero rows
with no Notification or HolderSnapshot rows. Enrich simulation with the same
window also selects `50` rows, all already at `metricsCount=1`.

Recommended next slice: **human-approved Red Metric backlog continuation** with
the wider `10080` minute window. This is narrower than a fresh 6H bounded
runner execute and directly improves Metric coverage before more enrich or
scoring review. Enrich continuation is second choice. Fresh bounded runner is
not first because the short operating window is currently clear.

The Green `--watchlistOnly` sample review is complete. The default 24h window
has drifted clear, so current watchlist review should use rolling 168h. That
window still has `14` B-watchlist rows, `13` ready and `1` not ready due to
`missing_metric`; all are `B / 2`, partial, and far from `A>=5` or
non-trend-only `S>=8`. Safe tags are concentrated in low-strength categories
such as `animal`, with small `ai_phrase`, `tech`, `meme`, and `social`
presence.

Recommended next slice: **data collection / backlog preflight**, not scoring
dictionary tuning. Keep the B watchlist report-only, keep notifyCandidate and
Telegram S-only, and do not introduce capture-only B Notifications yet. A
future scoring dictionary Yellow should wait until manual review sees repeated
safe patterns that are clearly under-scored.

The Yellow `--watchlistOnly` review mode is implemented. It keeps the B
watchlist report-only and returns a focused read-only payload with watchlist
summary, readiness, rank gap, scoreBreakdown availability, and safe
watchlist rows. Default queue output and `--includeBlockers` output remain
compatible, and `--watchlistOnly --includeBlockers` is accepted.

Recommended next slice: **Green watchlist-only review**. Use the focused
output to manually inspect ready B samples without changing scoring,
hardReject, notifyCandidate, Telegram, auto-send, or Notification semantics.
If the ready B samples still look weak, continue data collection/backlog work
before scoring dictionary tuning. If samples reveal obvious missed narratives,
plan a separate scoring dictionary review.

The Green review of watchlist readiness output is complete. Current
`--includeBlockers` output is useful enough for manual B-watchlist review and
does not require notification policy changes. Default 24h has `7` watchlist
rows and all `7` are `ready_for_review`; rolling 168h has `14` watchlist rows,
`13` ready and `1` not ready due to `missing_metric`. Every watchlist row is
still `B / 2`, so it remains far from `A>=5` and non-trend-only `S>=8`.

Recommended next slice: keep the B watchlist **report-only**. If the current
`--includeBlockers` output feels too broad for operators, add a small Yellow
`--watchlistOnly` option that filters output to watchlist summary and rows.
Do not tune scoring dictionaries, loosen hardReject, create capture-only B
Notifications, or change Telegram / auto-send behavior until manual review of
the ready B samples shows a clear need.

The Yellow watchlist / scoreBreakdown report refinement is implemented.
`review:queue:geckoterminal --includeBlockers` now shows watchlist readiness
and scoreBreakdown availability reasons without changing notifyCandidate,
Telegram, Notification, DB schema, or default output. The default 24h
watchlist has `7` B/2 rows and all are `ready_for_review`; rolling 168h has
`14` B/2 rows, `13` ready and `1` not ready due to `missing_metric`.
ScoreBreakdown unavailable rows are now explained as `unavailable_mint_only`
in both default and 168h windows; unknown unavailable reasons are `0`.

Recommended next slice: **Green review of watchlist readiness output**. Do not
change scoring dictionaries, hardReject, notifyCandidate, or Telegram policy
yet. Use the new readiness / availability reason fields to decide whether the
B watchlist is useful enough for human review or whether more data collection
is needed first. Keep B watchlist report-only, keep Telegram S-only, keep
auto-send planner unchanged, and avoid capture-only B Notifications until a
separate Green review explicitly recommends that lane.

The Green review of the B-watchlist / scoreBreakdown aggregate is complete.
Current watchlist rows are useful as a review surface but not strong enough to
drive scoring or notification policy changes. Default 24h has `7` watchlist
rows and rolling 168h has `14`; every watchlist row is `B / 2`, none is near
`A>=5` or non-trend-only `S>=8`, and watchlist reviewFlags/social/Metaplex/
description/link presence is `0`.

ScoreBreakdown availability is primarily a pipeline maturity signal. Default
24h has `available=149`, `unavailable=210`; rolling 168h has `available=424`,
`unavailable=1013`. The unavailable side aligns with `mint_only` backlog.
Stored score reasons are sparse: default source counts are `core=20`,
`learned_pattern=1`, with tags `animal=17`, `ai_phrase=1`, `tech=1`,
`meme=2`; rolling 168h adds only small learned/social counts. This is not
enough evidence for dictionary tuning yet.

Recommended next slice: **Yellow watchlist / scoreBreakdown report refinement
without policy changes**. Add clearer readiness splits for B-watchlist rows
(`metadataStatus`, Metric coverage, scoreBreakdown availability) and explicit
unavailable reasons. Keep B watchlist report-only, keep Telegram S-only, keep
auto-send planner unchanged, and avoid capture-only B Notifications until a
later Green review finds stronger candidates.

The Skill-guarded enrich/rescore continuation after Metric coverage ran once
with expected HEAD `79424cd` and the exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --interItemDelayMs 15000 --write
```

It selected and updated `49` rows (`7117..7069`), not the preflight's full
`50`, because one row aged outside the 420 minute command window before
selection. Results: `ok=49`, `error=0`, `enrichWritten=49`,
`rescoreWritten=49`, `contextWritten=49`, `notifyWouldSend=0`,
`notifySent=0`, `rateLimited=false`, and `interItemDelayCount=48`. Metadata
moved `mint_only=2440`, `partial=570`, `enriched=13` ->
`mint_only=2391`, `partial=619`, `enriched=13`; Token / Metric /
Notification / HolderSnapshot counts stayed `3023 / 956 / 22 / 1`.

Notification/Telegram boundaries stayed intact: Metric write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
retry execution `0`, auto live send `0`, scheduler/systemd `0`, rawJson full
dump `0`, and `pnpm smoke` `0`. Default queue after the run has
`metricPendingCount=159`, `enrichPendingCount=210`, `notifyCandidateCount=0`;
rolling 168h has `metricPendingCount=1017`, `enrichPendingCount=1013`,
`notifyCandidateCount=0`; auto-send allowed candidate and retry candidate
remain `0`.

Next operating task should be a Green preflight against the new docs HEAD to
decide whether to continue enrich/rescore with the same 420 minute window,
adjust the Metric pending window intentionally, or pause for report review.

The latest Skill-guarded post-run Metric pending continuation ran once with
expected HEAD `d975bb0` and the exact command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

It selected `50`, wrote `50`, skipped `0`, errored `0`, used
`interItemDelayMs=15000` with `49` delays, and observed no provider error or
429. Metric ids `2016..2065` were written for token ids `7067..7018`, moving
the selected rows from `metricsCount=0` to `metricsCount=1`. DB counts moved
Token / Metric / Notification / HolderSnapshot `3023 / 906 / 22 / 1` ->
`3023 / 956 / 22 / 1`; Metric buckets moved `0=2257`, `1=679`, `2+=87` ->
`0=2207`, `1=729`, `2+=87`. Notification statuses stayed `captured=17`,
`sent=5`, `failed=0`; Notification create/update, Telegram send,
HolderSnapshot write, Token write, retry execution, auto live send,
scheduler/systemd, rawJson full dump, offensive raw text dump, and
`pnpm smoke` stayed `0`.

Backlog remains by design. Queue after the run: default 24h
`metricPendingCount=159`, `enrichPendingCount=259`, `notifyCandidateCount=0`;
rolling 168h `metricPendingCount=1017`, `enrichPendingCount=1062`,
`notifyCandidateCount=0`; auto-send allowed candidate `0`; retry candidate
`0`. The next task should be a Green preflight against the new docs HEAD
before deciding whether to run one more bounded Metric continuation or switch
to enrich/rescore review. Any next Red prompt must use the new current HEAD,
not the pre-run `d975bb0`.

The Skill-shortened post-run Metric pending Red ran successfully once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

It wrote `50` Metrics (`1966..2015`) for selected token ids `7117..7068`,
moving them from `metricsCount=0` to `metricsCount=1`. DB counts moved Token /
Metric / Notification / HolderSnapshot `3023 / 856 / 22 / 1` ->
`3023 / 906 / 22 / 1`; Metric buckets moved `0=2307`, `1=629`, `2+=87` ->
`0=2257`, `1=679`, `2+=87`; Notification statuses stayed `captured=17`,
`sent=5`, `failed=0`. No Token write, Notification create/update,
HolderSnapshot write, Telegram send, retry execution, auto live send,
scheduler/systemd, rawJson full dump, offensive raw text dump, or
`pnpm smoke` occurred.

Backlog remains by design: default queue now has `metricPendingCount=209` and
`enrichPendingCount=259`; rolling 168h has `metricPendingCount=1067` and
`enrichPendingCount=1062`; notify candidates remain `0`. Auto-send allowed
candidate and retry candidate remain `0`. The next operating decision should
stay bounded: either repeat one more human-approved Metric pending continuation
Red, or pause for Green review of whether to switch to enrich/rescore after
more Metric coverage. Scheduler/systemd and always-on auto-send remain locked.

The first shortened Red prompt trial using the repo-local
`lowcap-red-execution-safety` Skill stopped safely before execution because it
detected stale state: the prompt expected `HEAD=48bb4e3`, while the actual
HEAD was `1c27c35 docs: review red prompt shortening with skill`. That trial
had no DB write, external fetch, Metric write, Notification/Telegram action, or
rawJson full dump.

Current HEAD preflight now supports reissuing the same post-run Metric pending
continuation as a separate human-approved Red. State is clean at HEAD
`1c27c35`; Token / Metric / Notification / HolderSnapshot is
`3023 / 856 / 22 / 1`; Notification statuses are `captured=17`, `sent=5`,
`failed=0`; retry candidate and enabled auto-send allowed candidate are `0`.
Default queue still has `metricPendingCount=259`, rolling 168h has
`metricPendingCount=1117`, and the bounded post-run planner recommends
`metric_pending_snapshot`.

Next human-approved Red candidate:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects are external GeckoTerminal fetch and Metric write up to
`50`. Expected non-effects are Token write `0`, Notification create/update
`0`, HolderSnapshot write `0`, Telegram send `0`, retry execution `0`, auto
live send execution `0`, scheduler/systemd `0`, rawJson full dump `0`,
offensive raw text dump `0`, and `pnpm smoke` `0`.

The first progress-logged `ops:run:bounded --execute` Red ran once with the
approved command and no retry. It verified the new progress stream: phase logs
appeared for preflight, detect, Metric cycles `1/2` and `2/2`, enrich cycles
`1/2` and `2/2`, report review, notification planner review, and
`final_summary`. The final summary reported `status=completed`,
`durationMs=24918055`, `metricCyclesExecuted=2`, `enrichCyclesExecuted=2`, no
cycle stopped reasons, Token create/reuse `360`, Notification create/update
expected `0`, and Telegram send expected `0`.

The run also moved the data plane: detect completed `360 / 360` iterations
with `importedCount=359`, `existingCount=1`, Metric cycles wrote `50 + 50`
rows, and enrich cycles updated/rescored `50 + 50` Tokens. DB counts moved
Token / Metric / Notification / HolderSnapshot `2664 / 756 / 22 / 1` ->
`3023 / 856 / 22 / 1`; Notification statuses stayed `captured=17`, `sent=5`,
`failed=0`; Telegram send, Notification create/update, HolderSnapshot write,
retry execution, auto live send, scheduler/systemd, rawJson full dump, and
offensive raw text dump stayed `0`. The checkpoint was written at
`/tmp/lowcap-bot-6h-pipeline-logging-20260528.json`.

The immediate next operating task should be another human-approved Red for the
post-run backlog only, starting with the planner-recommended
`metric_pending_snapshot` slice. Keep it manual and bounded; scheduler/systemd,
always-on auto-send, retry execution, and Telegram live send remain locked.

Green preflight is complete for the first progress-logged bounded runner Red.
Current safety state is clear: Token / Metric / Notification / HolderSnapshot
is `2664 / 756 / 22 / 1`, Notification statuses are `captured=17`,
`sent=5`, `failed=0`, retry candidate is `0`, and enabled auto-send allowed
candidate is `0`. Plan-only `ops:run:bounded` with cycles `2 / 2` is
unblocked, keeps Metric commands on `--onlyMetricPending
--noNotificationCapture --interItemDelayMs 15000`, keeps enrich commands on
`--interItemDelayMs 15000` with no `--notify`, and generates no Telegram send
command. Checkpoint `/tmp/lowcap-bot-6h-pipeline-logging-20260528.json` is
outside the repo and absent.

Next human-approved Red candidate:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-logging-20260528.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

Expected side effects are bounded external fetch, detect watch up to 6h,
Token create/reuse, checkpoint write, Metric write up to 100, Token
enrich/rescore updates up to 100, best-effort Metaplex fetch, and read-only
report/notification planner checks. Expected non-effects remain Notification
create/update `0`, Telegram send `0`, HolderSnapshot write `0`, retry
execution `0`, auto live send execution `0`, scheduler/systemd `0`, repo-local
runtime diff `0`, rawJson full dump `0`, offensive raw text dump `0`, and
`pnpm smoke` `0`.

`ops:run:bounded` now has execute-time progress logging and a compact final
summary. Execute mode emits `[ops:run]` lines to stderr for phase start/end,
Metric/enrich cycle start/end, and final summary. The machine-readable JSON
report remains on stdout. The summary is emitted on success and on failures
such as detect child process failure, Metric cycle failure, enrich cycle
failure, or provider/rate-limit stops.

The log payload is intentionally narrow: it includes whitelisted counters such
as selected/written/enriched/rescored/error, cycle indices, elapsed duration,
stopped reasons, checkpoint path, blockers, and stop codes. It does not log
rawJson, `stdoutTail`, `stderrTail`, large payloads, mint/name/symbol dumps, or
offensive raw text. Notification send, retry execution, auto live send,
scheduler/systemd, and `pnpm smoke` remain outside the runner.

Verification was non-production only: `pnpm exec tsc --noEmit`,
`tests/opsRunBounded.test.ts`, `tests/opsPlanBounded.test.ts`,
`tests/indexHelpHub.test.ts`, help, plan-only runner output, notification
planners, retry planner, and read-only queue. Production `--execute`, detect
watch/write, Metric write, Token enrich/rescore write, notification send, and
external fetch were not run in this slice.

Recommended next step: **Green preflight for bounded runner execute with
progress logging**, then a separate Red execute only if DB/queue/planner safety
state remains clear.

Fixed-executor multi-cycle `ops:run:bounded --execute` completed once and has
now been reviewed read-only. It should be treated as a successful bounded
pipeline run. It used cycles `2 / 2`:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-cycles-fixed-20260527.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

The run lasted ~6h56m and reached all phases: detect write, two Metric pending
snapshot cycles, two enrich/rescore cycles, report review, and notification
planner review. Net DB change was Token `+360`, Metric `+100`, Notification
`+0`, HolderSnapshot `+0`; Token context/rescore updated `100` rows.
Notification statuses stayed `captured=17`, `sent=5`, `failed=0`, retry
candidate stayed `0`, enabled auto-send allowed candidate stayed `0`, and
Telegram send stayed `0`. Checkpoint
`/tmp/lowcap-bot-6h-pipeline-cycles-fixed-20260527.json` exists outside the
repo (`176` bytes) with a safe cursor summary ending at
`2026-05-27T17:28:09.000Z`.

The reviewed queue is not clear, but this is not a pipeline failure. Token
ingest was `+360`, while post-run cycles were bounded to Metric `+100` and
Token context updates `+100`, so remaining pending is expected. Current
default 24h has `metricPendingCount=560`, `enrichPendingCount=560`,
`notifyCandidateCount=0`; rolling 168h has `metricPendingCount=858`,
`enrichPendingCount=803`, `notifyCandidateCount=0`.

Recommended next step: **Yellow: improve bounded runner progress logging and
final summary**. The successful run exposed an operating gap: it can run for
nearly seven hours with little visible progress, making sleep/interruption
difficult to distinguish from normal detect watch. Add phase start/end logs,
heartbeat/progress during detect watch, Metric/enrich cycle start/end logs,
elapsed time, checkpoint path, compact per-cycle summaries, and tests. Second
priority is a post-run coverage policy that recommends Metric/enrich cycles
from imported count and configured limits. Do not jump to notification send,
scheduler, systemd, or `pnpm smoke`.

Yellow fix completed for the failed multi-cycle `ops:run:bounded --execute`
environment boundary. The runner previously executed write phases by spawning
`pnpm -s <script>`, which invoked package scripts using direct `tsx`; the child
`tsx` IPC pipe failed with `listen EPERM` under `/tmp/tsx-1000` before any
app-level fetch/write. The runner now keeps the same operator-facing
`pnpm -s ...` command candidates, but executes detect / Metric / enrich write
phases through `node --import tsx <cli file>`.

Production execute was not rerun during the fix. Verification stayed
non-production: `pnpm exec tsc --noEmit`, runner tests, planner/help tests,
CLI help, plan-only runner output, notification planners, retry planner, and
read-only review queue. Next recommended step is **Green preflight for the
fixed bounded runner execute**, then a separate human-approved Red if safety
state remains clear.

The first multi-cycle `ops:run:bounded --execute` Red was attempted once with
the approved command:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-cycles-20260527.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 2 --postRunEnrichCycles 2 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

It stopped immediately in `detect_write` before application fetch/write due to
`listen EPERM` on the tsx IPC pipe under `/tmp/tsx-1000`. No retry and no
second command were run. Runner summary: `executeRequested=true`,
`readOnly=false`, `computedSinceMinutes=420`, `maxIterations=360`,
`postRunMetricCycles=2`, `postRunEnrichCycles=2`,
`metricCyclesExecuted=0`, `enrichCyclesExecuted=0`,
`blockedBy=["detect_write_failed"]`, and
`stopConditionCodes=["detect_write_failed"]`.

DB counts stayed Token / Metric / Notification / HolderSnapshot
`2304 / 656 / 22 / 1`; metadata statuses stayed `mint_only=1921`,
`partial=370`, `enriched=13`; Metric buckets stayed `0=1788`, `1=429`,
`2+=87`; Notification statuses stayed `captured=17`, `sent=5`, `failed=0`.
The checkpoint `/tmp/lowcap-bot-6h-pipeline-cycles-20260527.json` was not
created. External fetch, Token write, Metric write, Notification
create/update, HolderSnapshot write, Telegram send, retry execution, auto live
send, scheduler/systemd, rawJson full dump, offensive raw text dump, and
`pnpm smoke` all remained `0`.

Recommended next step: **Green/Yellow review of the runner execute environment
boundary**. Decide whether a future Red should use an approved execution mode
that avoids the tsx IPC sandbox failure, or whether the runner should be
adapted before another execute attempt. Do not retry the exact command without
that review.

`ops:run:bounded` now supports bounded post-run cycle counts. New options:
`--postRunMetricCycles <N>` and `--postRunEnrichCycles <N>`, defaulting to
`1 / 1` to preserve the original one-pass behavior. Plan-only output repeats
the Metric/enrich command candidates for each requested cycle and reports the
cycle counts. `0` skips the corresponding post-run phase.

Future execute candidate shape, subject to a separate Green preflight and
human approval:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-cycle.json --metricLimit 50 --enrichLimit 50 --postRunMetricCycles 3 --postRunEnrichCycles 3 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

This would keep the same bounded detect write phase, then run up to three
Metric pending cycles and up to three enrich cycles. Production execute was
not run during this Yellow implementation.

The first human-approved `ops:run:bounded --execute` completed. Exact command:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline-20260527.json --metricLimit 50 --enrichLimit 50 --intervalSeconds 60 --postRunBufferMinutes 60 --interItemDelayMs 15000 --execute
```

Runner summary: `executeRequested=true`, `readOnly=false`,
`computedSinceMinutes=420`, `maxIterations=360`, `blockedBy=[]`, and
`stopConditionCodes=[]`. All phases executed: preflight, detect write, Metric
pending snapshot, enrich/rescore, report review, and notification planner
review.

DB moved Token / Metric / Notification / HolderSnapshot
`1945 / 606 / 22 / 1` to `2304 / 656 / 22 / 1`. The run created/reused the
bounded Token lane with Token `+359`, wrote Metric `+50`, and enriched/rescored
50 Tokens to `partial`. Notification create/update, Telegram send,
HolderSnapshot write, retry execution, auto live send, scheduler/systemd,
rawJson full dump, offensive raw text dump, and `pnpm smoke` remained `0`.

Queue after: default 24h `metricPendingCount=309`,
`enrichPendingCount=309`, `staleReviewCount=212`,
`notifyCandidateCount=0`; rolling 168h `metricPendingCount=598`,
`enrichPendingCount=543`, `staleReviewCount=501`,
`notifyCandidateCount=0`. Notification safety remains clear:
`captured=17`, `sent=5`, `failed=0`, retry candidate `0`, enabled auto-send
allowed candidate `0`.

Recommended next step: **Red execute of bounded runner post-run cycles 2/2**,
using the exact command above after human approval.

## Recent Operating Log

Yellow implementation added a default-safe bounded pipeline runner:
`pnpm -s ops:run:bounded`. The CLI treats the full 6H flow as one bounded
pipeline:

1. preflight
2. detect write
3. Metric pending snapshot
4. enrich/rescore
5. report review
6. notification planner review

Default behavior is plan-only: without `--execute`, it only reads DB/queue/
notification state and emits command candidates. It does not fetch, write,
send Telegram, update Notifications, run retry execution, use scheduler/systemd,
or run `pnpm smoke`.

The runner computes post-run windows as:

```text
computedSinceMinutes = hours * 60 + postRunBufferMinutes
```

With defaults, a 6h run uses `420` minutes for post-run Metric/enrich phases,
so the pipeline is less exposed to rolling-window drift than manual split
execution.

Post-run Metric/enrich coverage can now be widened without creating an
unbounded worker: `--postRunMetricCycles` and `--postRunEnrichCycles` control
how many bounded cycles are planned or executed. Defaults remain `1 / 1`;
cycle counts must be non-negative integers. The runner still stops
conservatively on write-phase failure and never generates notification send,
retry execution, auto live send, scheduler/systemd, or Telegram live send
commands.

Plan-only runtime check:

```bash
pnpm -s ops:run:bounded -- --hours 6 --pumpOnly --checkpointFile /tmp/lowcap-bot-6h-pipeline.json
```

returned `readOnly=true`, `dryRun=true`, `executeRequested=false`,
`computedSinceMinutes=420`, `maxIterations=360`, all phases `planned`,
`blockedBy=[]`, and `stopConditionCodes=[]`. The command candidates are:

- detect write with `--watch --write --checkpointFile /tmp/...`
- Metric pending snapshot with `--onlyMetricPending --noNotificationCapture`
  and `--interItemDelayMs 15000`
- enrich/rescore with `--interItemDelayMs 15000` and no `--notify`
- read-only review queue and notification planner commands

Date: 2026-05-26

Latest Red continued the paced enrich/rescore lane with the same limit 50
boundary. Exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 720 --interItemDelayMs 15000 --write
```

Result: `selected=50`, `enriched=50`, `rescored=50`, `contextWritten=50`,
`error=0`, `metaplexAttempted=50`, `metaplexAvailable=4`,
`notifyWouldSend=0`, `notifySent=0`, `interItemDelayMs=15000`,
`interItemDelayCount=49`, provider error `0`, 429 `0`, and retry `0`.
Ids `6012..5963` moved `mint_only -> partial`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1945 / 606 / 22 / 1`; metadata statuses moved `mint_only=1662`,
`partial=270`, `enriched=13` to `mint_only=1612`, `partial=320`,
`enriched=13`. Metric write, Notification create/update, HolderSnapshot write,
Telegram send, scheduler/systemd, rawJson full dump, and offensive raw text
dump stayed `0`.

Queue after still shows older backlog outside the 6h planner window:
default / 168h `metricPendingCount=289`, `enrichPendingCount=234`,
`staleReviewCount=289`, `notifyCandidateCount=0`. `ops:plan:bounded
--postRunPlan` remains unblocked but reports the requested 6h window as clear.

The re-windowed paced enrich/rescore Red completed successfully. Exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 720 --interItemDelayMs 15000 --write
```

Result: `selected=20`, `enriched=20`, `rescored=20`, `contextWritten=20`,
`error=0`, `metaplexAttempted=20`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, `interItemDelayMs=15000`,
`interItemDelayCount=19`, provider error `0`, 429 `0`, and retry `0`.
Ids `6082..6063` moved `mint_only -> partial`; all have
`metricsCount=1`, `notificationCount=0`, and `holderSnapshotCount=0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1945 / 606 / 22 / 1`; metadata statuses moved `mint_only=1732`,
`partial=200`, `enriched=13` to `mint_only=1712`, `partial=220`,
`enriched=13`. Metric write, Notification create/update, HolderSnapshot write,
Telegram send, scheduler/systemd, rawJson full dump, and offensive raw text
dump stayed `0`.

Next recommended Green: review whether the next enrich/rescore slice should
continue with `--sinceMinutes 720 --interItemDelayMs 15000` and a bounded
limit 20/50, or whether Metric pending backlog should be reduced first.
Because the requested 6h planner window is now clear while default / 168h
windows still have older backlog, do not rely on `--hours 6` alone for
post-run follow-up after time has passed.

Green re-window preflight found that the previous paced enrich Red candidate
with `--sinceMinutes 360` had aged out before execution. The intended restart
slice ids `6082..6063` remains unchanged and still has
`metadataStatus=mint_only`, `metricsCount=1`, `notificationCount=0`,
`holderSnapshotCount=0`, score `C / 0`, and `hardRejected=false`, but those
rows are now about `463..482` minutes old.

Read-only Prisma selection simulation:

- `--sinceMinutes 360`: `selectedCount=0`
- `--sinceMinutes 720`: `selectedCount=253`, first 20 ids `6082..6063`
- `--sinceMinutes 1440`: `selectedCount=354`, first 20 ids `6082..6063`
- `--sinceMinutes 2880`: `selectedCount=354`, first 20 ids `6082..6063`
- `--sinceMinutes 10080`: `selectedCount=354`, first 20 ids `6082..6063`

Recommended next step: **Red paced post-6H enrich/rescore, re-windowed to
720 minutes, limit 20**. Exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 720 --interItemDelayMs 15000 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex fetch, and Token update up to 20. Expected
non-effects are Metric write, Notification create/update, HolderSnapshot
write, Telegram send, scheduler / systemd, rawJson full dump, and offensive
raw text dump. Do not attach `--notify`.

Operational note: post-run workflow commands that use a 6h rolling window can
age out if there is a long delay between preflight and Red execution. Re-check
or widen `sinceMinutes` before executing a delayed post-run command.

Green preflight after the pacing implementation is complete. Help output
includes `--interItemDelayMs <MS>`, and read-only Prisma simulation confirms
the next paced enrich/rescore slice is unambiguous. For
`--pumpOnly --sinceMinutes 360`, the enrich-pending set is `112` rows, all
`geckoterminal.new_pools`, `metadataStatus=mint_only`, score rank `C`,
`hardRejected=false`, and with Notification / HolderSnapshot totals `0`.
Limit 20 selects ids `6082..6063`, starting at the previous HTTP 429 row; all
20 have `metricsCount=1`, `notificationCount=0`, and
`holderSnapshotCount=0`. Limit 50 would select ids `6082..6033`, but the first
paced production use should stay smaller.

Recommended next step: **Red paced post-6H enrich/rescore, limit 20**. Exact
command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --interItemDelayMs 15000 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex fetch, and Token update up to 20. Expected
non-effects are Metric write, Notification create/update, HolderSnapshot
write, Telegram send, scheduler / systemd, rawJson full dump, and offensive
raw text dump. Do not attach `--notify`.

Yellow implementation of the enrich/rescore pacing boundary is complete.
`token:enrich-rescore:geckoterminal` now accepts
`--interItemDelayMs <ms>` as an opt-in batch pacing flag. The default remains
`0`, so existing behavior is unchanged when the option is omitted. The command
validates the value as a non-negative integer, delays only between selected
batch items, reports `interItemDelayMs` and `interItemDelayCount`, and keeps
the existing HTTP 429 stop behavior with `skippedAfterRateLimit`.

`ops:plan:bounded --postRunPlan` now includes `--interItemDelayMs 15000` in
enrich command candidates. Production write/fetch/send was not executed during
implementation; verification used typecheck, targeted tests, CLI help, and
read-only planners only.

Next recommended operating step: **Green preflight or human-approved Red for a
small paced post-6H enrich/rescore batch**. Candidate Red:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --interItemDelayMs 15000 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
fetch, and Token updates up to 20. Expected non-effects are Metric write,
Notification create/update, HolderSnapshot write, Telegram send, scheduler /
systemd, rawJson full dump, and offensive raw text dump. Do not attach
`--notify` unless a separate notification preflight approves it.

Green review of the partial enrich/rescore Red is complete. Read-only checks
confirmed ids `6087..6083` are now `partial`, while ids `6082..6038` remain
`mint_only`; all selected rows still have `metricsCount=1`,
`notificationCount=0`, `holderSnapshotCount=0`, score `C / 0`, and
`hardRejected=false`. No retry or second command has been run.

At the time of that Green review, `token:enrich-rescore:geckoterminal --help`
and source inspection showed no current `--interItemDelayMs` or equivalent
pacing option. The batch loop is
sequential and stops on HTTP 429 with `rateLimited=true`,
`abortedDueToRateLimit=true`, and `skippedAfterRateLimit` set. Because the
previous limit 50 Red succeeded for five fast items and then hit 429 on the
sixth, the next slice should be implementation, not another immediate Red.

Recommended next step: **Yellow: add pacing option to token enrich/rescore
geckoterminal**. Scope should be an opt-in batch-mode option such as
`--interItemDelayMs <ms>`, default behavior unchanged, delay between selected
items, existing 429 stop behavior preserved, targeted tests, and docs update.
The Yellow turn must not run production enrich writes or external fetches.

The human-approved post-6H enrich/rescore limit 50 Red ran once and partially
completed before a provider 429 stopped the batch. Exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --write
```

Result: `selected=50`, `enriched=5`, `rescored=5`, `contextWritten=5`,
`error=1`, `rateLimited=true`, `abortedDueToRateLimit=true`, and
`skippedAfterRateLimit=44`. Ids `6087..6083` moved from `mint_only` to
`partial`; id `6082` hit HTTP 429; ids `6081..6038` were not updated. Counts
stayed Token / Metric / Notification / HolderSnapshot `1945 / 606 / 22 / 1`;
metadata statuses moved `mint_only=1737`, `partial=195`, `enriched=13` to
`mint_only=1732`, `partial=200`, `enriched=13`.

Notification and Telegram boundaries held: `notifyWouldSend=0`,
`notifySent=0`, Notification create/update `0`, Telegram send `0`, Metric
write `0`, and HolderSnapshot write `0`. Notification statuses remain
`captured=17`, `sent=5`, `failed=0`; retry candidate count and enabled
auto-send allowed candidate count remain `0`.

Recommended next step: **Green review of the partial enrich/rescore result and
rate-limit boundary**. Do not immediately repeat the same limit 50 enrich Red.
The next Green should decide whether to use a smaller enrich batch, add or
document a rate-limit/backoff guard for this lane, or return to Metric pending
first. Scheduler, systemd, always-on auto-send, Notification send, and retry
execution remain locked.

The post-6H Metric acquisition lane has enough proof to move to Token context
creation. Exact-mint Metric snapshots, `--onlyMetricPending`, post-6H limit 20,
and post-6H limit 50 have all succeeded without 429/provider error,
Notification capture, Token write, HolderSnapshot write, or Telegram send.

Current state is Token / Metric / Notification / HolderSnapshot
`1945 / 606 / 22 / 1`; Metric buckets `0=1479`, `1=379`, `2+=87`;
metadata statuses `mint_only=1737`, `partial=195`, `enriched=13`;
Notification statuses `captured=17`, `sent=5`, `failed=0`; retry candidate
count and enabled auto-send allowed candidate count are both `0`.

Green preflight for post-6H enrich/rescore confirmed the 24h Gecko pump
enrich-pending cohort is `359` rows, all `geckoterminal.new_pools`,
`metadataStatus=mint_only`, score rank `C`, `hardRejected=false`,
`notificationCount=0`, and `holderSnapshotCount=0`. Metric distribution inside
that enrich backlog is `0=289`, `1=70`.

Source inspection shows `token:enrich-rescore:geckoterminal` fetches live
GeckoTerminal token snapshots even without `--write`, so no production dry-run
preview was executed. Prisma read-only selection simulation for
`--pumpOnly --limit 50 --sinceMinutes 360` selected ids `6087..6038`; all are
`mint_only`, score `C / 0`, `hardRejected=false`, `notificationCount=0`,
`holderSnapshotCount=0`, and currently `metricsCount=1`.

Recommended next step: **Red bounded post-6H enrich/rescore, limit 50**. Do
not attach `--notify`:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex metadata fetch, and Token update up to 50.
Expected non-effects are Metric write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`, rawJson
full dump `0`, and offensive raw text dump `0`.

Operational safety note: `pnpm smoke` is not a Green / Yellow no-write
verification command for this active DB. During the `ops:plan:bounded
--postRunPlan` Yellow verification it created smoke/rehearsal DB rows, moving
Token `1930 -> 1945` and Notification `18 -> 22`; Metric and HolderSnapshot
did not change and Telegram was not sent. Future no-write validation should use
typecheck, targeted tests, CLI `--help`, `mvp:status`, `ops:plan:bounded`,
`notification:auto-send:plan`, `notification:retry:plan`, and
`review:queue:geckoterminal`. Run `pnpm smoke` only with an explicit isolated
temp DB or as a separately approved side-effecting check.

The bounded operation planner has been extended for 6H post-run workflow
planning. `pnpm -s ops:plan:bounded -- --hours 6 --pumpOnly --postRunPlan`
keeps the existing one-step `nextRecommendedStep` output and adds an ordered
read-only workflow plan:

1. `metric_pending_snapshot`
2. `enrich_pending_rescore`
3. `report_review`
4. `notification_plan_review`
5. `optional_auto_send_plan_review`

The workflow emits command candidates as strings only. It does not run a
runner, scheduler, systemd unit, watch loop, Metric write, enrich write,
Notification send, retry execution, external fetch, Telegram send, or DB write.
The current runtime workflow recommends Metric pending first, with the limit 50
candidate:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is still required before running that Red. The next engineering
slice should keep this as a planner-only workflow aid; do not implement a
runner, scheduler, systemd unit, or always-on auto-send yet.

Green review after the post-6H Metric pending limit 20 Red is complete.
Target ids `6087..6068` are count `20`, all now `metricsCount=1` with Metric
ids `1637..1656`; selected-row Notification and HolderSnapshot totals remain
`0`. Safe market-data booleans for those 20 Metric rows are all present:
price `20`, FDV `20`, reserve `20`, and top-pool `20`.

Current state is Token / Metric / Notification / HolderSnapshot
`1930 / 556 / 18 / 1`; Metric buckets `0=1514`, `1=329`, `2+=87`;
Notification statuses `captured=13`, `sent=5`, `failed=0`; retry candidate
count and enabled auto-send allowed candidate count are both `0`.

Queue still points to the Metric lane. Default 24h and rolling 168h views both
show `metricPendingCount=339`, `enrichPendingCount=359`,
`staleReviewCount=57`, and `notifyCandidateCount=0`. A fetch-free
`--onlyMetricPending` preview with `--limit 50 --sinceMinutes 360` selected
ids `6067..6018`, all Metric-zero rows with `notificationCount=0`,
`holderSnapshotCount=0`, `metadataStatus=mint_only`, and no latest Metric.

Recommended next step: **Red bounded metric pending snapshot, limit 50**. The
limit 20 fresh-cohort proof succeeded without 429/provider error or side-effect
spillover, and the next preview has at least 50 clear candidates:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetches and Metric writes up to 50. Expected non-effects are Token write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

The human-approved post-6H Metric pending snapshot Red has completed. Exact
command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Result: `selected=20`, `written=20`, `skipped=0`, `error=0`,
`interItemDelayMs=15000`, `interItemDelayCount=19`, provider error `0`,
429 `0`, retry `0`, and Notification capture `0`. Selected ids `6087..6068`
now have `metricsCount=1`; new Metric ids are `1637..1656`. Counts moved only
in Metric: Token / Metric / Notification / HolderSnapshot
`1930 / 536 / 18 / 1 -> 1930 / 556 / 18 / 1`; Metric buckets moved
`0=1534, 1=309, 2+=87 -> 0=1514, 1=329, 2+=87`. Notification statuses stayed
`captured=13`, `sent=5`, `failed=0`; retry candidate count and enabled
auto-send allowed candidate count stayed `0`.

Queue after still recommends the same lane: default and rolling 168h views have
`metricPendingCount=339`, `enrichPendingCount=359`,
`staleReviewCount=38`, and `notifyCandidateCount=0`.
`ops:plan:bounded -- --hours 6 --pumpOnly` still returns
`nextRecommendedStep=metric_pending_snapshot` with no blockers or stop
conditions. The next step should be a Green review/preflight before another
Metric write Red; do not jump directly to a larger batch.

Green preflight for the post-6H metric pending lane is complete. It confirmed
the 6H write cohort as ids `5729..6087` with count `359`, all
`geckoterminal.new_pools`, `mint_only`, score `C / 0`, `hardRejected=false`.
Current DB state is Token / Metric / Notification / HolderSnapshot
`1930 / 536 / 18 / 1`, Metric buckets `0=1534`, `1=309`, `2+=87`, and
Notification statuses `captured=13`, `sent=5`, `failed=0`. Retry candidate
count and enabled auto-send allowed candidate count are both `0`.

The planner and queue agree that the next lane is **metric pending snapshot**.
Default 24h and rolling 168h queues both show `metricPendingCount=359`,
`enrichPendingCount=359`, and `notifyCandidateCount=0`. Fetch-free
`--onlyMetricPending` preview with `--sinceMinutes 360 --limit 20` selected ids
`6087..6068`; `--limit 50` selected ids `6087..6038`. All previewed rows are
6H watch tokens with `metricsCount=0`, `latestMetricObservedAt=null`,
`notificationCount=0`, `holderSnapshotCount=0`, and `metadataStatus=mint_only`.

Recommended next step: **Red bounded metric pending snapshot, limit 20**. Limit
50 also previews cleanly, but limit 20 is the conservative first Metric write
against the fresh 6H detect cohort:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetches and Metric writes up to 20. Expected non-effects are Token write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

The human-approved 6H bounded detect write rehearsal has completed. Exact
command:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 360 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-6h-write-rehearsal-20260526.json
```

Result: `status=ok`, `stopReason=completed`, `completedIterations=360`,
`cycleCount=360`, `failedCount=0`, `rateLimitRetryCount=0`,
`importedCount=359`, `existingCount=1`, `dryRun=false`,
`writeEnabled=true`, and `checkpointEnabled=true`. Counts moved only in Token:
`1571 / 536 / 18 / 1 -> 1930 / 536 / 18 / 1`. Notification statuses stayed
`captured=13`, `sent=5`, `failed=0`; retry candidate count and enabled
auto-send allowed candidate count stayed `0`. Metric write, Notification
create/update, HolderSnapshot write, Telegram send, scheduler/systemd,
repo-local data diff, docs rawJson full dump, and offensive raw text dump
remained `0`.

The 6H bounded planner now recommends the next lane as **metric pending
snapshot**, because the write rehearsal created new mint-only pump Tokens.
Current queue context: default 24h has `metricPendingCount=359`,
`enrichPendingCount=359`, `staleReviewCount=5`, and `notifyCandidateCount=0`;
requested 6h has `metricPendingCount=354`, `enrichPendingCount=354`,
`staleReviewCount=0`, and `notifyCandidateCount=0`; rolling 168h has
`metricPendingCount=359`, `enrichPendingCount=359`, `staleReviewCount=5`, and
`notifyCandidateCount=0`.

Recommended next step: **Green preflight for the planner-proposed metric
pending snapshot**, not immediate write execution. Validate selected candidates,
window choice, and side-effect boundary before approving this candidate:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetches and Metric writes up to 20. Expected non-effects are Token write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

The 6H bounded operation planner Yellow is complete. `pnpm -s
ops:plan:bounded -- --hours 6 --pumpOnly` is read-only / dry-run and now reads
DB counts, Gecko review queue state, enabled auto-send planner state, and retry
planner state before choosing exactly one next operator step. It does not
fetch, write, send Telegram, update Notification rows, execute retries, create
scheduler/systemd units, or run any watch loop.

Current planner runtime result recommends `detect_watch_dry_run` because the
6h/default queue is clear and rolling 168h has no metric, enrich, stale-review,
or notify backlog. Candidate command string:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 360 --intervalSeconds 60
```

This is a dry-run candidate only. It does not include `--write`; production
detect write rehearsal, metric snapshot Red, enrich/rescore Red, auto live send,
scheduler, and systemd remain human-gated and locked until explicitly approved.

The post-large-batch bounded pending-first Metric Red with limit 5 has now
succeeded. It selected ids `5392..5388`, wrote Metric ids `1623..1627`, and
moved all five rows from `metricsCount=0` to `metricsCount=1`. Result:
`selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, Notification capture `0`, `interItemDelayMs=15000`, and
`interItemDelayCount=4`. Counts moved only in Metric
`1556 / 531 / 14 / 1 -> 1556 / 536 / 14 / 1`; Metric buckets moved
`0=1165, 1=304, 2+=87 -> 0=1160, 1=309, 2+=87`.

Recommendation: **Green review of this bounded limit 5 result**. Confirm the
five rows through report/window context, queue/planner state, and side-effect
boundaries before approving another batch Red. Do not jump straight back to
limit 50.

The large pending-first Metric backlog batch has now been reviewed. The
human-approved limit 50 Red succeeded with `selected=50`, `written=50`,
`skipped=0`, `error=0`, provider error `0`, 429 `0`, retry `0`, and
Notification capture `0`. It moved ids `5442..5393` from `metricsCount=0` to
`metricsCount=1` with Metric ids `1573..1622`; counts moved only in Metric
`1556 / 481 / 14 / 1 -> 1556 / 531 / 14 / 1`, and Metric buckets moved
`0=1215, 1=254, 2+=87 -> 0=1165, 1=304, 2+=87`.

The Green review confirmed no Token write, Notification create/update,
HolderSnapshot write, Telegram send, rawJson full dump, or offensive raw text
dump. Queue default and 168h views still report `metricPendingCount=0`,
`enrichPendingCount=0`, and `notifyCandidateCount=0`; enabled auto-send
allowed candidate count and retry candidate count are both `0`.

The post-review `--onlyMetricPending` preview stayed fetch-free and
write-free. With `--limit 50 --sinceMinutes 20160`, it selected the next 50
older Metric-zero candidates; the first five are ids `5392..5388`.

Recommended next lane: **one smaller bounded pending-first Metric snapshot Red
with limit 5**, not another limit 50 immediately. This confirms post-large-batch
stability while keeping the write boundary small:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetches and Metric writes up to 5 rows. Expected non-effects are Token write
`0`, Notification create/update `0`, HolderSnapshot write `0`, Telegram send
`0`, scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`,
and offensive raw text dump `0`.

Second choice: Green rolling-window / older Metric-zero backlog policy. Use
that if the next preview shrinks materially or if operators want to stop older
backlog cleanup after the large batch.

The exact-mint Metric 0 backlog Red has now succeeded for token id `5464`.
It used `--mint` to bypass the current batch selector, kept
`--noNotificationCapture`, and wrote exactly one Metric row:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Result: `selectedCount=1`, `writtenCount=1`, `skippedCount=0`,
`errorCount=0`, provider error `0`, 429 `0`, retry `0`, Notification capture
`0`, Telegram send `0`. Counts moved only in Metric:
`1541 / 459 / 10 / 1 -> 1541 / 460 / 10 / 1`, and Metric bucket counts moved
`0=1222, 1=232, 2+=87 -> 0=1221, 1=233, 2+=87`. The 168h Gecko queue now
reports `metricPendingCount=84`, `enrichPendingCount=200`,
`staleReviewCount=200`, and `notifyCandidateCount=0`.

The follow-up Green review is now complete. Token id `5464` remains readable in
`metrics:report` / `metrics:window-report`, `notificationCount=0`,
`holderSnapshotCount=0`, and the 168h queue still reports
`metricPendingCount=84` with `notifyCandidateCount=0`. The remaining Metric 0
backlog in ids `5380..5463` contains 84 eligible rows, all
`geckoterminal.new_pools`, pump mints, `mint_only`, `metricsCount=0`,
score `C`, `hardRejected=false`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Recommended next lane: **one more exact-mint Metric 0 Red for reproducibility**.
This keeps the write boundary at one Metric row while confirming the successful
exact-mint pattern on a second backlog item before investing in selector
implementation:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump --minGapMinutes 60 --noNotificationCapture --write
```

Human approval is required. Expected side effects are one external
GeckoTerminal token snapshot fetch and at most one Metric write. Expected
non-effects are Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

Second choice: Yellow design for a pending-first Metric batch selector. That is
the longer-term fix for the 84-row Metric 0 backlog, because the current batch
selector still prioritizes already measured rows before the true Metric 0
backlog. Do not jump to broad batch Red until selection quality is fixed.

The second exact-mint Metric 0 Red has now succeeded for token id `5463`:
`selected=1`, `written=1`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, and Notification capture `0`. Counts moved only in
Metric, `1541 / 460 / 10 / 1 -> 1541 / 461 / 10 / 1`, with Metric buckets
`0=1221, 1=233, 2+=87 -> 0=1220, 1=234, 2+=87`. The 168h queue now reports
`metricPendingCount=83` and `notifyCandidateCount=0`.

Recommended next lane: **Green review of the second exact-mint result and
decision point**. Confirm id `5463` in report/window context, then choose one:
either run a third exact-mint Metric 0 Red for one more reproducibility sample,
or start Yellow design for a pending-first Metric batch selector. The selector
work is the durable solution; another exact mint is useful only if the operator
wants one more production proof before implementation.

That Green review is now complete. The result stayed stable: id `5463` is
readable in `metrics:report` and `metrics:window-report`, Notification capture
did not occur, auto-send / retry planners remain at zero allowed candidates,
and the fixed id range `5380..5462` still contains 83 Metric 0 rows. The
rolling `--sinceHours 168` queue now shows only `metricPendingCount=19`
because the current date is 2026-05-25 and older backlog rows are aging out of
that rolling window.

Recommended next lane: **Yellow pending-first Metric batch selector design**.
Do not produce a Red exact command by default. The exact-mint path has already
proved the write boundary twice; the next useful step is to design and test a
batch selector that can target Metric 0 / metric-pending rows before `--limit`
is applied, without changing default selection behavior.

Preferred option shape to design: `--onlyMetricPending`. It should be opt-in,
should preserve current default ordering when omitted, should work in dry-run
and write mode, should keep exact `--mint` behavior unchanged, and should emit
rawJson-free selected-candidate summaries before any Red batch is approved.

That Yellow implementation is complete. `metric:snapshot:geckoterminal` now
supports opt-in `--onlyMetricPending` for batch mode only. The default selector
is unchanged when the option is omitted, and exact `--mint` mode rejects the
option so existing single-mint behavior remains explicit. With `--write`
omitted, `--onlyMetricPending` is a selection preview and does not fetch
GeckoTerminal. The production preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --onlyMetricPending --noNotificationCapture
```

selected ids `5462`, `5461`, and `5460` in the current rolling window, all
`metadataStatus=mint_only`, `metricsCount=0`, `notificationCount=0`,
`holderSnapshotCount=0`, and `latestMetricObservedAt=null`. No production
write, provider fetch, Telegram send, Notification update, rawJson full dump,
or offensive raw text dump was performed.

Recommended next lane: **Green preflight for the new pending-first selector**.
Confirm the selected candidates and side-effect boundary one more time, then
prepare this human-approved Red candidate if clean:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

That Green preflight is complete, but it did **not** produce a Red command.
At 2026-05-25 22:21 JST, the rolling `--sinceMinutes 10080` cutoff had moved
past ids `5462..5460`, so the production preview returned
`selectedCount=0`. The selector still behaved safely (`dryRun=true`,
`writeEnabled=false`, `selection_preview`, no provider fetch, no DB write), and
ids `5462..5460` remain Metric-zero safe candidates outside that rolling
window. Do not run a no-op batch Red.

Recommended next lane: **Green re-window preflight for pending-first Metric
selection**. Decide one narrow selection policy before Red: widen
`sinceMinutes`, add an explicit fixed backlog range/planner, or fall back to a
single exact mint. Keep scheduler/systemd and broad automation locked.

That re-window preflight is complete. The Metric-zero backlog rows ids
`5462..5460` were about `10157..10159` minutes old, so the `10080` minute
window missed them by roughly `77..79` minutes. A read-only
`--onlyMetricPending` preview with `--sinceMinutes 20160` selected ids
`5462`, `5461`, `5460`, `5459`, and `5458`; `--sinceMinutes 43200` selected
the same first five rows. No provider fetch, DB write, Notification update,
Telegram send, rawJson full dump, or offensive raw text dump was performed.

Recommended next lane: **Red bounded pending-first Metric snapshot batch**,
human approval required:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects are external GeckoTerminal fetches and Metric writes up
to 5 rows. Expected non-effects are Token write `0`, Notification
create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

That first bounded pending-first Metric snapshot batch Red is complete:
`selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, `interItemDelayMs=15000`, and
`interItemDelayCount=4`. It selected ids `5462`, `5461`, `5460`, `5459`, and
`5458`, moving all five from `metricsCount=0` to `metricsCount=1`. Counts
moved only in Metric: `1556 / 461 / 14 / 1 -> 1556 / 466 / 14 / 1`; Metric
buckets moved `0=1235, 1=234, 2+=87 -> 0=1230, 1=239, 2+=87`.
Notification capture stayed off and Notification statuses remained
`captured=9`, `sent=5`, `failed=0`.

Recommended next lane: **Green review of the onlyMetricPending batch result**.
Confirm the five new Metric rows through report/window context, queue/planner
state, and side-effect boundaries before approving another batch Red.

That Green review is complete. The five rows `5462..5458` are readable in
safe report/window context, all have `metricsCount=1`, and Notification /
HolderSnapshot counts stayed zero for those tokens. The post-Red
`--onlyMetricPending` preview remains fetch-free and selects the next five
Metric-zero rows, ids `5457`, `5456`, `5455`, `5454`, and `5453`.

Recommended next lane: **repeat the bounded pending-first Metric snapshot
batch Red**, human approval required:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects are external GeckoTerminal fetches and Metric writes up
to 5 rows. Expected non-effects remain Token write `0`, Notification
create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

That second bounded pending-first Metric snapshot batch Red is complete:
`selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, `interItemDelayMs=15000`, and
`interItemDelayCount=4`. It selected ids `5457`, `5456`, `5455`, `5454`, and
`5453`, moving all five from `metricsCount=0` to `metricsCount=1`. Counts
moved only in Metric: `1556 / 466 / 14 / 1 -> 1556 / 471 / 14 / 1`; Metric
buckets moved `0=1230, 1=239, 2+=87 -> 0=1225, 1=244, 2+=87`. Notification
capture stayed off and Notification statuses remained `captured=9`, `sent=5`,
`failed=0`. Queue context now reports no Metric pending rows in the default
24h or 168h views.

Recommended next lane: **Green review of the second onlyMetricPending batch
result**. Confirm ids `5457..5453` in report/window context and re-run the
fetch-free pending-first preview before approving any further batch Red.

That Green review is complete. Ids `5457..5453` are readable in
`metrics:report` and representative `metrics:window-report` output, all remain
`metricsCount=1`, and Notification / HolderSnapshot counts stayed zero for
those tokens. Their representative window reports have `metricCount=1`,
`fdvMetricCount=0`, `entryAnchorQuality=none`, no alert FDV anchor, no window
FDV samples, and `outcomeLabel=no_data`. The rolling 24h and 168h queues now
show `metricPendingCount=0`, `enrichPendingCount=0`, and
`notifyCandidateCount=0`, but the expanded `20160` minute
`--onlyMetricPending` preview remains fetch-free and selects the next five
older Metric-zero rows, ids `5452`, `5451`, `5450`, `5449`, and `5448`.

Recommended next lane: **one more bounded pending-first Metric snapshot
batch Red**, human approval required:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

This should be treated as older rolling-window backlog cleanup, not current
168h queue pressure. Expected side effects are external GeckoTerminal fetches
and Metric writes up to 5 rows. Expected non-effects remain Token write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

That next bounded pending-first Metric snapshot batch Red is complete:
`selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, `interItemDelayMs=15000`, and
`interItemDelayCount=4`. It selected ids `5452`, `5451`, `5450`, `5449`, and
`5448`, moving all five from `metricsCount=0` to `metricsCount=1`. Counts
moved only in Metric: `1556 / 471 / 14 / 1 -> 1556 / 476 / 14 / 1`; Metric
buckets moved `0=1225, 1=244, 2+=87 -> 0=1220, 1=249, 2+=87`. Notification
capture stayed off and Notification statuses remained `captured=9`, `sent=5`,
`failed=0`.

Recommended next lane: **Green review of this third onlyMetricPending batch
result**. Confirm ids `5452..5448` in report/window context and re-run the
fetch-free pending-first preview before approving any further batch Red.

That Green review is complete. Ids `5452..5448` are readable through
`metrics:report` and representative `metrics:window-report` checks. Token id
`5451` / Metric id `1564` has price / FDV / reserve / top-pool present and
`entryAnchorQuality=very_late_gt_360m`; token id `5452` / Metric id `1563`
has reserve present with price / FDV / top-pool absent and
`entryAnchorQuality=none`. Both representative windows remain
`outcomeLabel=no_data`, with no alert FDV anchor and no in-window FDV samples.
Queue context remains clear in both default and 168h views:
`metricPendingCount=0`, `enrichPendingCount=0`, and `notifyCandidateCount=0`.
The post-review `--onlyMetricPending` preview remained fetch-free /
write-free and selected the next five older Metric-zero rows, ids `5447`,
`5446`, `5445`, `5444`, and `5443`.

Recommended next lane: **repeat the bounded pending-first Metric snapshot
batch Red**, human approval required:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

This is still older rolling-window Metric-zero cleanup. If a future preview
returns `selectedCount=0`, switch to a Green rolling-window / older-backlog
policy task instead of issuing another Red command.

That repeated bounded pending-first Metric snapshot batch Red is complete:
`selected=5`, `written=5`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, `interItemDelayMs=15000`, and
`interItemDelayCount=4`. It selected ids `5447`, `5446`, `5445`, `5444`, and
`5443`, moving all five from `metricsCount=0` to `metricsCount=1`. Counts
moved only in Metric: `1556 / 476 / 14 / 1 -> 1556 / 481 / 14 / 1`; Metric
buckets moved `0=1220, 1=249, 2+=87 -> 0=1215, 1=254, 2+=87`. Notification
capture stayed off and Notification statuses remained `captured=9`, `sent=5`,
`failed=0`.

Recommended next lane: **Green review of this repeated onlyMetricPending batch
result**. Confirm ids `5447..5443` in report/window context and re-run the
fetch-free pending-first preview before approving any further batch Red.

That Green review is complete. Ids `5447..5443` are readable through
`metrics:report` and representative `metrics:window-report` checks. Token id
`5446` / Metric id `1569` has price / FDV / reserve / top-pool present and
`entryAnchorQuality=very_late_gt_360m`; token id `5447` / Metric id `1568`
has reserve present with price / FDV / top-pool absent and
`entryAnchorQuality=none`. Both representative windows remain
`outcomeLabel=no_data`, with no alert FDV anchor and no in-window FDV samples.
Queue context remains clear in both default and 168h views:
`metricPendingCount=0`, `enrichPendingCount=0`, and `notifyCandidateCount=0`.
The post-review `--onlyMetricPending` preview remained fetch-free /
write-free and selected the next five older Metric-zero rows, ids `5442`,
`5441`, `5440`, `5439`, and `5438`.

Recommended next lane: **repeat the bounded pending-first Metric snapshot
batch Red**, human approval required:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

This remains older rolling-window Metric-zero cleanup. If a future preview
returns `selectedCount=0`, switch to a Green rolling-window / older-backlog
policy task instead of issuing another Red command.

Still locked: token enrich/rescore writes without approval, scheduler, systemd,
always-on auto live send, notification send/retry execution, detect watch write,
ops catchup write, schema/migration/app code changes, rawJson full dump, and
offensive raw text dump.

## Previous Next Slice

Date: 2026-05-23

The auto-send single-shot slice is now consolidated. The completed Telegram /
Notification path includes manual live sends for id `7` and id `8`, smoke /
rehearsal exclusion, marker-tagged capture-only rehearsal id `9`,
production-shaped candidate id `10`, read-only `notification:auto-send:plan`,
disabled-by-default `notification:auto-send:execute`, and one human-approved
production auto-send execution for id `10`.

Current state: Token / Metric / Notification / HolderSnapshot
`1536 / 449 / 10 / 1`; Notification statuses `captured=5`, `sent=5`,
`failed=0`; manual live-send candidate count `0`; retry candidate count `0`;
enabled auto-send `allowedCandidateCount=0`.

Still locked: scheduler, systemd, always-on auto live send, restart
duplicate-send behavior, continuous worker, background queue, automatic retry
execution, and production `--execute` without human approval. Auto-send is
verified as a single-shot path only.

Recommended next lane: **detect / new-pool watch lane**. The Green readiness
review is now complete and confirmed that the next Red can be a small bounded
dry-run watch, not a write rehearsal:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 5 --intervalSeconds 60
```

This command requires human approval because it runs watch mode and external
GeckoTerminal fetches. It intentionally omits `--write`, so expected DB writes,
Telegram sends, Notification create/update, Metric writes, HolderSnapshot
writes, and checkpoint writes are all `0`. Do not use `timeout`; keep the run
bounded by `--maxIterations` and `--intervalSeconds`.

The small bounded dry-run watch has now run successfully once with
`status=ok`, `stopReason=completed`, `completedIterations=5`, `failedCount=0`,
`rateLimitRetryCount=0`, `importedCount=0`, `existingCount=0`,
`dryRun=true`, `writeEnabled=false`, and `checkpointEnabled=false`. Counts
stayed Token / Metric / Notification / HolderSnapshot `1536 / 449 / 10 / 1`,
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`, and no
checkpoint or repo-local data diff was observed.

Next useful step should be a Green decision point, not immediate scheduler /
systemd: either choose a very small `/tmp` checkpoint write rehearsal, or
return to metric accumulation / report work if avoiding new Token writes is
preferred.

That Green decision point is now complete. The next bounded watch lane step is
a small `/tmp` checkpoint write rehearsal:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 5 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal-20260523-5.json
```

This requires human approval because it can write production Token rows and a
`/tmp` checkpoint file. Expected non-effects remain Metric write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
repo-local data diff `0`, scheduler / systemd `0`, and rawJson full dump `0`.
Do not use `timeout`.

The small bounded write rehearsal has now run successfully once. It completed
5 cycles with `status=ok`, `stopReason=completed`, `failedCount=0`,
`rateLimitRetryCount=0`, `importedCount=5`, `existingCount=0`,
`dryRun=false`, `writeEnabled=true`, and `checkpointEnabled=true`. Counts moved
only in Token: `1536 / 449 / 10 / 1 -> 1541 / 449 / 10 / 1`. The checkpoint
was written only under `/tmp`, and repo-local data stayed clean.

Next useful step should be another Green decision point: inspect the five new
mint-only rows with read-only reports, or return to metric accumulation /
report work. Scheduler / systemd remain out of scope.

Second choice: metric accumulation / report lane, if the operator prefers
safer data accumulation and report quality over moving the monitoring loop
forward. Do not continue to scheduler / systemd now.

## Next Minimal Task

Complete the CLI-first MVP operating picture before adding paid holder sources,
another adapter, or broader runtime concepts.

Why this is now the most natural next step:

- `pnpm import:mint:file` and `pnpm import:mint:source-file` already cover thin mint-first intake boundaries.
- `pnpm detect:dexscreener:token-profiles` and `pnpm detect:geckoterminal:new-pools` already cover the current narrow source-specific detect surface.
- `pnpm token:enrich-rescore:geckoterminal`, `pnpm metric:snapshot:geckoterminal`, and `pnpm ops:summary:geckoterminal` already cover the current Gecko follow-up and read-only ops surface.
- `token:observation`, gap planners, manual observation, community review, and HolderSnapshot storage/read paths now provide the minimum research OS review context.
- CoinGecko Pro / paid holder-source work is parked: it is useful later, but not an MVP blocker.
- `pnpm mvp:status` is available as the broad read-only MVP readiness report.
- The next safe step is now `pnpm bounded:watch:readiness`, a read-only check
  focused on detect/checkpoint/dedupe/metric/notification/observation readiness
  before a separately approved 3h dry-run.

Recommended next Yellow implementation slice:

- `pnpm mvp:status` is now available as a read-only CLI;
- use it to report DB / migration / key command availability, core row counts, observation-loop coverage, and known blockers;
- `pnpm bounded:watch:readiness` is now the next read-only core-loop check for
  the 3-to-6-hour bounded monitoring MVP;
- use it to keep Pro API / paid holder source work parked while moving toward
  candidate detection, mint persistence, score/risk review, Metric
  accumulation, Telegram notification boundaries, and later outcome review;
- `pnpm metrics:window-report` is now the read-only outcome verification helper
  for accumulated Metric history. The outcome evaluation design is fixed in
  `docs/design/metric-outcome-evaluation.md`: default windows are
  30,60,90,120,180,240,300,360,480,600,720,1440 minutes; peak FDV is the
  observed max inside each window, not one 24h-later point; and
  `alertedAt`, `alertFdv`, `latestFdv`, `firstObservedFdv`, window completion,
  provisional outcome labels, coverage labels, `peakMultipleFromAlert`, and
  drawdown are implemented as read-only computed review context rather than
  saved DB fields or buy signals;
- `docs/design/metric-result-field-policy.md` fixes the Metric schema boundary:
  Metric rows remain observation snapshots, and result fields such as
  `peakFdv24h`, `maxMultiple15m`, `timeToPeakMinutes`, `alertedAt`, and
  `peakMultipleFromAlert` are computed outcome fields, not
  `metric:snapshot:geckoterminal` live snapshot write targets;
- `docs/design/token-entry-snapshot-policy.md` fixes the
  `Token.entrySnapshot` namespace boundary: `firstSeenSourceSnapshot`,
  `manualObservation`, and sanitized `contextCapture` are allowed, while Metric
  outcomes, HolderSnapshot bodies, Notification lifecycle state, raw provider
  bodies, secrets, and retry / queue state stay out;
- `docs/design/token-source-policy.md` fixes the source-term boundary:
  `Token.source` is the token-level current / latest source label, origin
  source comes from `entrySnapshot.firstSeenSourceSnapshot.source` with
  `manualObservation.source` and `Token.source` as legacy fallbacks, and
  `Metric.source`, Notification `trigger` / `mode` / `status`,
  `contextCapture.*.source`, and `HolderSnapshot.source` stay separate;
- `docs/design/metadata-status-policy.md` fixes the token metadata lifecycle:
  operational values are `mint_only`, `partial`, `enriched`, and `unknown`
  fallback; the normal lifecycle is `mint_only -> partial -> enriched`;
  source-only updates do not imply `enriched` or an `enrichedAt` refresh; and
  planners / reports / guards should treat `metadataStatus` as metadata
  completeness rather than safety, score, source, notification, holder, or
  outcome state;
- `docs/design/compare-report-legacy-outcome-policy.md` fixes
  `tokens:compare-report outcomeBucket` as legacy / provisional compatibility
  output based on older Metric result fields such as latest Metric
  `maxMultiple15m`; canonical outcome review remains
  `metrics:window-report` window-level `outcomeLabel` based on FDV window
  maxima, `alertFdv`, and `peakMultipleFromAlert`;
- `docs/design/notification-event-policy.md` fixes Notification lifecycle
  fields: persisted `Notification` rows are event history with known
  `status=captured|sent|failed`, `mode=capture_only|live_send`, and
  `trigger=metric_appended`; ops preview triggers `token_completed` and
  `loop_complete` remain separate from persisted DB rows unless a later task
  adds those write paths; retry fields are manual retry foundation, not queue /
  scheduler / systemd completion;
- `docs/design/review-flags-policy.md` fixes `Token.reviewFlagsJson` as
  lightweight Token review helper JSON. Current compatibility keys are
  `hasWebsite`, `hasX`, `hasTelegram`, `metaplexHit`, `descriptionPresent`,
  and `linkCount`, with `community:review` provenance such as
  `source=manual_community_review`, `reviewedAt`, and `operatorNote` when
  present. Future writes should move toward `schemaVersion`, `source`,
  optional `reviewerType`, `flags`, `note`, and `reviewedAt`, while
  `reviewFlagsJson` stays separate from Metric outcome, `scoreBreakdown`,
  HolderSnapshot, Notification lifecycle, provider raw bodies, and buy signals;
- `docs/design/score-breakdown-policy.md` fixes `Token.scoreBreakdown` as the
  latest Token score explanation JSON. Current compatibility shape is
  unversioned and uses `totals.{core,learned,trend,combo}`, `hits[]`,
  `trendFresh`, `trendCapped`, and `trendOnly`; future writes should move
  toward `schemaVersion`, `scoringVersion`, `computedAt`, `components`,
  optional hard-reject summary, and lightweight trend metadata. Score fields
  remain latest state, not immutable initial score history; strict score
  history is deferred to a future `ScoreSnapshot` / `scoreHistory` design;
- `docs/design/grouping-policy.md` fixes `Token.groupKey` / `groupNote` as
  manual grouping helpers only. They may label operator-chosen narratives,
  themes, watchlists, campaigns, or batches for later comparison, but they are
  not source provenance, dev identity proof, dedupe keys, score evidence,
  Notification triggers, Metric outcomes, or buy signals;
- `docs/design/time-anchor-policy.md` fixes timestamp meanings across Token,
  Metric, Notification, and reports: DB lifecycle timestamps, Token import,
  metadata enrichment, score rescore, source first-seen, Metric observation,
  Notification sent / captured time, and report evaluation are separate.
  `metrics:window-report` anchors outcome windows at computed `alertedAt`
  (`--entryAt`, Notification, firstSeen, imported, created fallback order) and
  uses `evaluationAt=reportGeneratedAt` for MVP completion / latest-FDV
  evaluation;
- `docs/design/dev-wallet-policy.md` fixes `Dev.wallet` as a dev / creator /
  deployer-like wallet label from source or manual input. It is an exact stored
  string grouping key for display, filtering, and future Dev-level comparison,
  not confirmed person / team identity, scam proof, score evidence,
  HolderSnapshot evidence, funding-origin proof, bundle proof, Metric outcome,
  Notification lifecycle, or a buy signal. Wallet normalization, validation,
  confidence fields, and Dev-based scoring remain future design work;
- `docs/design/metric-rawjson-inspect-policy.md` fixes `Metric.rawJson` as a
  sanitized provider snapshot and `metric:show` as the low-level inspect
  surface that may print it. Normal report / compare / outcome views remain
  rawJson-free or use extracted valid FDV values; full rawJson dumps are
  operator / developer debugging material, not canonical outcome review,
  public report output, or a buy signal;
- `docs/design/holder-snapshot-policy.md` fixes HolderSnapshot as safe
  summarized holder distribution / holder-risk context. Storage, safe-summary
  validation, one-row manual add, read-only show, safe-summary report, and gap
  planning exist, but approved real holder source capture remains future
  enhancement work and is not a 3h / 6h bounded monitoring blocker.
  Concentration fields must be read with `source`, `confidence`, and
  `lpWalletExcluded`; fresh / bundler / same-funding signals are
  source-dependent review context, not automatic score evidence or buy signals;
- the first 3h GeckoTerminal detect watch dry-run completed 180 cycles with
  `failedCount=0`, `rateLimitRetryCount=0`, `importedCount=0`, and
  `checkpointEnabled=false`; Token / Metric / Notification / HolderSnapshot
  counts stayed unchanged at `1116 / 191 / 6 / 1`;
- the 3h write rehearsal preflight is docs-only complete: `--write` for
  `detect:geckoterminal:new-pools` creates or reuses mint-only Token rows
  through `importMint`; it does not append Metrics, create Notification rows,
  touch HolderSnapshot, enrich / rescore, or send Telegram. Checkpoint updates
  occur only under `--watch --write`, and the Red rehearsal should use a fresh
  `/tmp` checkpoint. DB writes still target `DATABASE_URL`;
- the current-DB 3h write rehearsal is complete: 180 cycles, `failedCount=0`,
  `rateLimitRetryCount=0`, `importedCount=180`, `existingCount=0`, Token count
  `1116 -> 1296`, and Metric / Notification / HolderSnapshot counts unchanged
  at `191 / 6 / 1`. The only checkpoint side effect was
  `/tmp/lowcap-bot-gecko-write-rehearsal.json`; repo-local `data/checkpoints`
  and `data/trend.json` stayed unchanged;
- next operating step is a separate Metric accumulation / Notification
  accumulation slice. The completed 3h write rehearsal confirms mint-only Token
  accumulation, not metric snapshot writes, notification capture, Telegram live
  send, scoring completion, or outcome evaluation;
- the Metric accumulation preflight is docs-only complete: use the recent
  Gecko-origin mint-only cohort from the 3h write rehearsal, keep the first Red
  command to a very small batch, and avoid `--mint` mode unless Notification
  capture is also explicitly approved. Candidate command:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes
  1440 --minGapMinutes 60 --write`. This is expected to fetch one token
  snapshot and append one Metric row, with no Token update, HolderSnapshot
  write, Telegram send, checkpoint, or Notification row in batch mode;
- the first bounded Metric accumulation Red run is complete in batch mode:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes
  1440 --minGapMinutes 60 --write` selected
  `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump` and appended Metric
  `id=1274`. Counts moved `1296 / 191 / 6 / 1` to `1296 / 192 / 6 / 1`, and
  `metricPendingCount` moved 180 to 179. Token / Notification /
  HolderSnapshot counts stayed unchanged, no Telegram send occurred, no
  checkpoint was touched, and exact `--mint` Notification capture remains a
  separate slice;
- the bounded Metric accumulation Red run has also passed at `--limit 3` in
  batch mode. The prior AW7 mint was skipped by `minGapMinutes=60`; two new
  Metrics were appended for
  `G4qJ2GcVBkSEGa9D4Z7FhbHcZFSPaKxFyKiaw7K2pump` (`id=1275`) and
  `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump` (`id=1276`). Counts moved
  `1296 / 192 / 6 / 1` to `1296 / 194 / 6 / 1`, and
  `metricPendingCount` moved 179 to 177. Notification / Telegram /
  HolderSnapshot / Token enrich-rescore remained untouched;
- exact `--mint` mode Notification capture remains unexecuted but is now ready
  for a separate Red task. The preflight target is
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`, a GeckoTerminal-origin
  `mint_only` pump token with no Metric and no Notification. Candidate
  command:
  `pnpm -s metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --minGapMinutes 60 --write`.
  Expected side effects are one Metric row and one `status=captured`,
  `mode=capture_only`, `trigger=metric_appended` Notification row only; no
  Telegram live send, Token update, HolderSnapshot write, checkpoint,
  scheduler, or systemd action is expected;
- the first exact `--mint` Notification capture Red run is complete for
  `ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump`. It appended Metric
  `id=1277` and created Notification `id=7` with
  `status=captured`, `mode=capture_only`, `trigger=metric_appended`,
  `tokenId=5376`, and `metricId=1277`. Counts moved
  `1296 / 194 / 6 / 1` to `1296 / 195 / 7 / 1`, and
  `metricPendingCount` moved 177 to 176. Telegram live send, Token update,
  HolderSnapshot write, enrich / rescore, checkpoint, queue, scheduler, and
  systemd remained untouched;
- post-alert Metric outcome check is complete. The preflight confirmed the
  alert anchor is Notification `id=7`, while Metric `id=1277` is 14ms before
  `capturedAt`, so it can provide `alertFdv` but not a post-alert window
  sample. `metric:snapshot:geckoterminal -- --mint
  ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --noNotificationCapture
  --write` then appended Metric `id=1278` without adding Notification. Counts
  moved `1296 / 195 / 7 / 1` to `1296 / 196 / 7 / 1`, with Telegram,
  HolderSnapshot, enrich / rescore, queue, scheduler, systemd, and checkpoint
  untouched. `metrics:window-report` now shows Metric count 2 and FDV Metric
  count 2; 30m / 60m remain `no_data` because the new Metric arrived after
  those windows, while 24h has one post-alert valid FDV sample,
  `peakMultipleFromAlert=1.0869155273705746`,
  `timeToPeakMinutes=77.49428333333333`, provisional `outcomeLabel=flat`, and
  `fdvSampleCoverageLabel=thin`;
- short-window outcome check is complete on a second mint:
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump`. Exact `--mint --write`
  created Metric `1279` and capture-only Notification `8`; immediate exact
  `--mint --noNotificationCapture --write` created Metric `1280` without a
  second Notification. Counts moved `1296 / 196 / 7 / 1` to
  `1296 / 198 / 8 / 1`. `metrics:window-report` now confirms 30m / 60m / 24h
  windows each have `fdvSampleCount=1`, `peakMultipleFromAlert=1`,
  `timeToPeakMinutes=2.4285666666666668`, provisional `outcomeLabel=flat`, and
  `fdvSampleCoverageLabel=thin`;
- Telegram live-send preflight is docs-only complete. The recommended Red
  target is captured Notification `id=8` with notification key
  `EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279`.
  Candidate command: `pnpm -s notification:send -- --notificationKey
  EUxGk5jzGo5VMyBo84a683RJHmB1etqR6FwuKBEwpump:metric_appended:1279 --trigger
  metric_appended --live`. Expected upper bound is Telegram send max 1 and
  Notification update max 1; Token / Metric / HolderSnapshot writes stay 0.
  Secrets are env-only and must not be printed;
- Telegram live-send Red rehearsal is complete for Notification `id=8`.
  The exact command above ran once and returned `status=sent`, `sentCount=1`,
  `updatedCount=1`, `senderCalled=true`, `notificationId=8`, and
  `errorCode=null`. Counts stayed `1296 / 198 / 8 / 1`; the existing row moved
  from `status=captured`, `mode=capture_only`, `sentAt=null` to
  `status=sent`, `mode=live_send`, `sentAt=2026-05-17T02:20:23.560Z`, and
  `lastAttemptAt=2026-05-17T02:20:23.560Z`. Notification `id=7` remained
  unsent as `captured` / `capture_only`. Retry, batch send, scheduler,
  systemd, watch, metric snapshot, detect, import, enrich, and rescore were not
  executed, and no secret / Telegram response body was printed;
- `notification:send` failure-path preflight is complete as read-only /
  docs-only. Current DB has no failed Notifications and no retry candidates.
  Code and tests show failed sender results update one existing row to
  `failed/live_send` with safe `errorCode`, `reason=ops_notify_send_failed`,
  `failedAt`, and `lastAttemptAt`; sent rows are blocked from resend and
  captured rows are not retry candidates. Do not run a production Red failure
  rehearsal yet; add a simulated-failure or isolated-temp-DB harness first if
  execution evidence is needed;
- sent-row resend prevention is now explicit for both normal and inconsistent
  sent state: `notification:send` blocks before sender call when
  `status=sent` or `sentAt` is present, returns `notification_already_sent`
  with safe `notificationStatus` / `sentAtPresent` markers, and performs no DB
  update. This was implemented with a focused temp-SQLite test; no production
  notification send, retry, scheduler, systemd, watch, metric snapshot, detect,
  import, enrich, or rescore command was run. The interrupted 6h dry-run was
  not a completed stability result;
- failure marking is now covered by temp-SQLite / mocked-sender tests without
  production DB or Telegram: a throwing sender updates one existing captured
  `metric_appended` row to `failed/live_send`, sets `failedAt`,
  `lastAttemptAt`, safe `errorCode`, and `reason`, keeps `sentAt=null`, creates
  no Notification rows, and leaves Token / Metric / HolderSnapshot counts
  unchanged;
- `notification:retry:plan` now has a current production DB read-only
  no-candidate confirmation. With failed rows at `0`, captured `id=7` and sent
  `id=8` were both excluded, and `pnpm -s notification:retry:plan` returned
  `status=stop`, `candidateCount=0`, `selected=null`, `nextRedCommand=null`,
  and `stopConditionCodes=[no_failed_retry_candidate]` without DB writes or
  Telegram sender calls;
- retry candidate selection is now covered in temp SQLite: with failed,
  captured, and sent fixtures present together, `notification:retry:plan`
  selects only one failed `metric_appended` row, leaves all rows unchanged, and
  emits a safe human-gated `notification:send --live --retryFailed` command
  string without secret / env / raw payload markers;
- manual approved live send is the only currently allowed Telegram live-send
  mode. Auto live send remains locked: no batch send, worker, scheduler,
  systemd, or automatic captured-to-sent advancement. `id=7` stays held as
  `captured` / `capture_only`, `id=8` is already `sent` / `live_send`, failed
  rows are `0`. The 6h dry-run has since completed, but always-on
  notification delivery is still not ready because write rehearsal,
  restart/dedupe behavior, scheduler / systemd stop policy, and automatic
  captured-to-sent rules remain unpromoted. `detect:geckoterminal:new-pools --watch`
  now emits `status=interrupted` / `stopReason=user_interrupted` summaries for
  SIGINT / SIGTERM. See
  `docs/runbooks/notification-live-send-policy.md`;
- short live SIGINT confirmation for GeckoTerminal new-pools watch is now
  recorded. The 2026-05-17 Red dry-run summary reported
  `status=interrupted`, `stopReason=user_interrupted`,
  `interruptedBySignal=SIGINT`, `completedIterations=5`, `failedCount=0`, and
  `rateLimitRetryCount=0`, with DB counts unchanged at
  `1296 / 198 / 8 / 1` and no Telegram, Notification, Metric, checkpoint, or
  repo-local data side effects. The timeout wrapper did not stop the
  `pnpm` / `tsx` child tree at the expected 90s boundary, so another long live
  run should first account for process-tree timeout behavior;
- process-tree signal policy is now fixed for GeckoTerminal watch: do not use
  `timeout + pnpm + tsx` as the long-run stop mechanism. Use bounded
  `--maxIterations` / `--intervalSeconds` for natural completion and direct
  Ctrl+C or process-group SIGINT / SIGTERM for manual stop. A file-backed
  interrupt test confirms SIGINT during watch sleep records one completed
  cycle, does not start the next cycle, and keeps `failedCount=0`;
- the timeout-free 6h GeckoTerminal new-pools dry-run completed on
  2026-05-18 with `--maxIterations 360 --intervalSeconds 60`. It reported
  `status=ok`, `stopReason=completed`, `completedIterations=360`,
  `cycleCount=360`, `failedCount=0`, `rateLimitRetryCount=0`,
  `importedCount=0`, `existingCount=0`, `dryRun=true`,
  `writeEnabled=false`, and `checkpointEnabled=false`. Token / Metric /
  Notification / HolderSnapshot counts stayed `1296 / 198 / 8 / 1`, and no
  DB write, Telegram send, Notification create/update, Metric create,
  checkpoint update, or repo-local data diff was observed;
- 6h write rehearsal preflight is now fixed as docs-only policy. Because the
  completed 360-cycle dry-run elapsed `32632518ms` (about `9.06h`, about
  `90.65s` per cycle), the next Red write candidate should prioritize
  wall-clock 6h and use the observed average to reduce the run to
  `--maxIterations 240`. This is still a bounded estimate. It writes only
  mint-only Token rows through `importMint`, uses `/tmp` checkpoint isolation,
  and keeps Metric / Notification / HolderSnapshot writes plus Telegram sends
  out of scope;
- the 240-cycle GeckoTerminal new-pools write rehearsal completed on
  2026-05-18 with `--maxIterations 240 --intervalSeconds 60` and checkpoint
  isolation under `/tmp`. It reported `status=ok`, `stopReason=completed`,
  `completedIterations=240`, `cycleCount=240`, `failedCount=0`,
  `rateLimitRetryCount=1`, `rateLimitRetrySuccessCount=1`,
  `importedCount=240`, `existingCount=0`, `dryRun=false`,
  `writeEnabled=true`, `checkpointEnabled=true`, and `elapsedMs=16148551`
  (about `4.49h`). Token count increased `1296 -> 1536`; Metric /
  Notification / HolderSnapshot stayed `198 / 8 / 1`; Notification status
  counts stayed `captured=5`, `sent=3`, `failed=0`; Telegram send and
  repo-local data diffs were not observed;
- bounded Metric accumulation preflight for the new 240-token cohort completed
  on 2026-05-19. The current DB state is Token / Metric / Notification /
  HolderSnapshot `1536 / 198 / 8 / 1`; `mint_only=1373`; zero-Metric Token
  count `1377`; Notification statuses `captured=5`, `sent=3`, `failed=0`.
  `review:queue:geckoterminal -- --pumpOnly --limit 10` reports the new
  GeckoTerminal pump cohort as `geckoOriginTokenCount=240`,
  `enrichPendingCount=240`, and `metricPendingCount=240`. Batch
  `metric:snapshot:geckoterminal` does not capture Notification rows; exact
  `--mint` mode is the Notification-capture path. The next Red candidate is
  a small batch Metric write:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --write`;
- bounded Metric accumulation `limit 10` was executed once on 2026-05-19.
  Queue precheck reported `geckoOriginTokenCount=240` and
  `metricPendingCount=240`; selected preview rows matched GeckoTerminal-origin
  pump `mint_only` Tokens with `metricsCount=0`. The command exited 0 with
  `selectedCount=10`, `writtenCount=5`, `skippedCount=0`, and `errorCount=5`.
  Metric count moved `198 -> 203`; Token / Notification / HolderSnapshot
  stayed `1536 / 8 / 1`; Notification statuses stayed `captured=5`,
  `sent=3`, `failed=0`. The five errors were `429 Too Many Requests`, so the
  next step should address Metric snapshot rate-limit pacing before any larger
  batch expansion;
- Metric snapshot rate-limit preflight is now docs-only complete. Current DB
  state is Token / Metric / Notification / HolderSnapshot `1536 / 203 / 8 / 1`,
  zero-Metric Token count `1372`, `metricPendingCount=235`, and Notification
  statuses `captured=5`, `sent=3`, `failed=0`. The current batch
  `metric:snapshot:geckoterminal` path processes selected tokens sequentially
  but has no item-to-item delay; `429` responses become item-level errors, do
  not write Metric rows, do not mutate Token / Notification / HolderSnapshot,
  and leave the failed mints in the future pending queue. Treat exit code 0
  with `errorCount>0` as partial success only. The next recommended slice is
  Yellow implementation of `--interItemDelayMs` before another larger Red
  Metric batch;
- `metric:snapshot:geckoterminal` now has `--interItemDelayMs <N>` for
  batch-item pacing. The default is `0`; the value must be a non-negative
  integer; delay is applied only between selected batch items and is reported
  in summary output. Exact `--mint` mode is not delayed. Metric write,
  Notification capture, Telegram live send, Token / HolderSnapshot behavior,
  and 429 item-error handling are unchanged. The next Red candidate is:
  `pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write`;
- delayed Metric accumulation `limit 10` with `--interItemDelayMs 15000` was
  executed once on 2026-05-19. It selected 10, skipped 5 via
  `minGapMinutes=60`, wrote 5 Metrics (`1286` through `1290`), and reported
  `errorCount=0`, `interItemDelayCount=9`, and no `429`. Counts moved
  `1536 / 203 / 8 / 1` to `1536 / 208 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. This improves the prior no-delay
  `limit 10` run (`written=5`, `error=5`, five 429s), but because five
  selected rows were recent-Metric skips, treat it as a successful delayed
  small-batch confirmation rather than approval for a large jump;
- delayed Metric accumulation `limit 20` with the same `--interItemDelayMs
  15000` was executed once on 2026-05-19. It selected 20, skipped 10 via
  `minGapMinutes=60`, wrote 10 Metrics (`1291` through `1300`), and reported
  `errorCount=0`, `interItemDelayCount=19`, and no `429`. Counts moved
  `1536 / 208 / 8 / 1` to `1536 / 218 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. This keeps the delayed path Green at a
  modestly wider scope; next expansion should still be incremental, such as
  delayed limit 30, before larger batches;
- delayed Metric accumulation `limit 30` with the same `--interItemDelayMs
  15000` was executed once on 2026-05-19. It selected 30, skipped 15 via
  `minGapMinutes=60`, wrote 15 Metrics (`1301` through `1315`), and reported
  `errorCount=0`, `interItemDelayCount=29`, and no `429`. Counts moved
  `1536 / 218 / 8 / 1` to `1536 / 233 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. The delayed path remains rate-limit
  clean, but the 50% skip ratio means the next step should be candidate
  selection that excludes recent Metrics before applying `--limit`, not another
  batch-size increase;
- `metric:snapshot:geckoterminal` batch selection now excludes recent Metric
  rows before applying `--limit` when `--minGapMinutes` is provided. Exact
  `--mint` mode keeps its existing min-gap skip behavior. `--interItemDelayMs`,
  429 handling, Notification / Telegram behavior, Token writes, and
  HolderSnapshot behavior are unchanged. The next Red candidate is the same
  delayed limit 30 command, now expected to spend the limit on eligible
  candidates rather than recent-Metric skips;
- improved delayed Metric accumulation `limit 30` was executed once on
  2026-05-19 after the selection change. It selected 30, skipped 0, wrote 30
  Metrics (`1316` through `1345`), and reported `errorCount=0`,
  `interItemDelayCount=29`, and no `429`. Counts moved
  `1536 / 233 / 8 / 1` to `1536 / 263 / 8 / 1`; Notification statuses stayed
  `captured=5`, `sent=3`, `failed=0`. This confirms the recent-Metric
  exclusion is effective; next expansion should still be incremental, for
  example improved delayed limit 50;
- scheduler / systemd remain after 3h/6h monitored-run validation;
- do not fetch external APIs, write production DB state, send Telegram, change schema, or introduce scheduler / queue / systemd behavior.

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
- Park paid holder source work until budget, API key, terms, rate-limit, and
  secret-boundary approval are available:
  - CoinGecko Token Info preflight is deferred
  - manual holder review and external-report-only review continue as fallback
  - HolderSnapshot is complete only for storage / parser / one-row write / read validation
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
- Keep `groupKey` and `groupNote` as manual grouping labels only until a
  separate report / planner need justifies implementation work

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

## Operating Update: Improved Metric Accumulation Limit 50

Date: 2026-05-19

The improved GeckoTerminal Metric snapshot batch selector was validated at
`limit 50` with 15-second item pacing:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selectedCount=50`, `writtenCount=50`, `skippedCount=0`,
`errorCount=0`, `interItemDelayMs=15000`, `interItemDelayCount=49`, and no 429.
Counts moved only in `Metric`: Token / Metric / Notification / HolderSnapshot
`1536 / 263 / 8 / 1 -> 1536 / 313 / 8 / 1`.

This confirms the recent-Metric exclusion remains effective at limit 50 and the
Metric write boundary still avoids Telegram, Notification, Token, and
HolderSnapshot side effects. Continue incremental expansion; the next candidate
is a limit 75 preflight or Red task rather than a large jump.

## Operating Update: Improved Metric Accumulation Limit 75

Date: 2026-05-19

The same improved GeckoTerminal Metric snapshot path was validated at
`limit 75` with 15-second item pacing:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selectedCount=75`, `writtenCount=75`, `skippedCount=0`,
`errorCount=0`, `interItemDelayMs=15000`, `interItemDelayCount=74`, and no 429.
Counts moved only in `Metric`: Token / Metric / Notification / HolderSnapshot
`1536 / 313 / 8 / 1 -> 1536 / 388 / 8 / 1`.

The recent-Metric exclusion and Metric-only write boundary held at limit 75.
Rather than continuing to enlarge batches immediately, the next near-term slice
should move back to read-only reporting, such as validating
`metrics:window-report` or cohort reports against the accumulated Metrics.

## Operating Update: Metric Report Readiness

Date: 2026-05-19

The accumulated GeckoTerminal Metrics were validated through read-only report
commands after limit 75:

- `metrics:window-report`
- `metrics:report`
- `tokens:compare-report`
- `review:queue:geckoterminal`

The latest counts remained Token / Metric / Notification / HolderSnapshot
`1536 / 388 / 8 / 1` after report execution, with Notification statuses
`captured=5`, `sent=3`, `failed=0`. `metrics:window-report` correctly read the
sent Notification id `8`, Metric 3 sample rows, and Metric 1 sample rows without
DB writes, external fetches, Telegram sends, or rawJson full dumps.

Next work should stay on read-only outcome / cohort review before any further
Metric batch expansion.

## Operating Update: Cohort Window Outcome Check

Date: 2026-05-19

A bounded seven-token cohort was checked with
`metrics:window-report -- --windows 30,60,120,180,360,720,1440` after the
Metric report-readiness pass. The cohort included Notification id `8`,
Notification id `7`, three GeckoTerminal-origin pump `mint_only` Metric 2+
tokens, one Metric 1 token, and one Metric 0 pending token.

The check stayed read-only and left counts unchanged at Token / Metric /
Notification / HolderSnapshot `1536 / 388 / 8 / 1`. It confirmed that
`metrics:window-report` is usable for human outcome review: alert-anchored
windows can produce `flat`, no-alert mint-only windows remain `no_data` while
still showing `thin` / `partial` sample coverage, Metric 1 tokens show `thin`,
Metric 0 tokens remain pending / `no_data`, and complete / provisional flags
are visible without rawJson dumps.

Next work can either run one more small read-only cohort review on a different
sample or move to a docs-only decision point for the next bounded Metric /
notification operating slice.

## Operating Update: Metric Accumulation Decision Preflight

Date: 2026-05-19

A docs-only decision point checked whether to return to Telegram operations or
run one more controlled Metric accumulation slice. The current 24h
`review:queue:geckoterminal -- --pumpOnly --limit 75` result is read-only and
shows `metricPendingCount=0`, so the proposed next Red is not a Metric-0
pending cleanup. It is instead a repeat of the already stable limit-75 path to
add additional Metric observations to recent GeckoTerminal-origin pump
`mint_only` rows that already have Metrics and satisfy `minGapMinutes=60`.

Candidate Red command, requiring human approval and not executed in the
preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected effect is Metric rows only; Token, Notification, HolderSnapshot,
Telegram, checkpoint, and repo-local data should remain unchanged.

## Operating Update: Additional Metric Accumulation Limit 75

Date: 2026-05-19

The approved Red command was executed once as an additional observation-point
run, not as Metric-0 pending cleanup:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

The execution selected 59 eligible rows because the 24h selection window had
aged by runtime. It wrote 59 Metrics (`1471` through `1529`), with
`skippedCount=0`, `errorCount=0`, `interItemDelayMs=15000`,
`interItemDelayCount=58`, and no 429. Counts moved only in Metric:
`1536 / 388 / 8 / 1 -> 1536 / 447 / 8 / 1`.

Follow-up `metrics:window-report` checks on three written mints confirmed the
new Metrics are readable without DB writes, external fetches, Telegram sends,
or rawJson dumps. The next step should return to read-only outcome / operating
decision work before another accumulation batch.

## Operating Update: Metric Report Readiness After Additional Limit 75

Date: 2026-05-20

The post-run read-only report pass confirmed that the current
Token / Metric / Notification / HolderSnapshot state is `1536 / 447 / 8 / 1`,
with Notification statuses `captured=4`, `sent=4`, `failed=0`. Token Metric
distribution is now `0=1222`, `1=232`, `2+=82`; GeckoTerminal-origin pump
`mint_only` coverage is Metric `0=260`, `1=99`, `2+=61`.

`metrics:window-report` read Notification id `8`, Metric 2+ rows, the latest
accumulation sample, and a mint-only Metric 1 sample with explicit read-only
flags. `metrics:report` and `tokens:compare-report` showed rawJson-free Metric
safe summaries, and `review:queue:geckoterminal -- --pumpOnly --sinceHours 168
--limit 20` showed Metric 0 rows remain pending while recent Metric-written
rows are out of `metricPending`.

No Metric snapshot, detect watch, DB write, external fetch, Telegram send,
Notification update, rawJson full dump, schema / migration change, or
application code change occurred. The next step should stay read-only: use
`metrics:window-report` on one bounded cohort to make the next operating
decision before any further Metric write expansion.

## 2026-05-23 Detect Write Rehearsal Follow-up

The five Tokens created by the small bounded GeckoTerminal write rehearsal were
inspected read-only. All five are GeckoTerminal-origin pump `mint_only` rows
with `entrySnapshot.firstSeenSourceSnapshot`, `metricsCount=0`,
`notificationCount=0`, and `holderSnapshotCount=0`.

Queue state now supports returning to metric accumulation / report:

- 24h pump queue: `geckoOriginTokenCount=5`, `metricPendingCount=5`
- 168h pump queue: `geckoOriginTokenCount=425`, `metricPendingCount=265`,
  `staleReviewCount=420`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

Next selected lane: metric accumulation / report. The next task should be a
Green preflight that narrows one bounded Metric snapshot Red command. Do not
extend detect write rehearsal, scheduler, systemd, or always-on live send from
this result.

## 2026-05-23 Metric Accumulation Preflight

The Green preflight selected a small Metric accumulation Red for the five new
GeckoTerminal mint-only Tokens rather than returning immediately to the broader
limit-75 run.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Token Metric distribution: `0=1227`, `1=232`, `2+=82`
- 24h pump queue: `geckoOriginTokenCount=5`, `metricPendingCount=5`
- 168h pump queue: `geckoOriginTokenCount=425`, `metricPendingCount=265`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

Next Red exact command, requiring human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected effect is up to five new Metric rows only. Token, Notification,
HolderSnapshot, Telegram, scheduler, systemd, and repo-local data should remain
unchanged. Do not run the stable limit-75 command until this smaller
post-rehearsal Metric write is reviewed.

## 2026-05-23 Small Metric Snapshot Result

The approved small Metric snapshot for the five new GeckoTerminal mint-only
Tokens completed successfully:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selected=5`, `written=5`, `skipped=0`, `error=0`,
`interItemDelayMs=15000`, `interItemDelayCount=4`, no provider error, and no
429.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 449 / 10 / 1 -> 1541 / 454 / 10 / 1`
- Metric 0 / 1 / 2+ Token distribution:
  `1227 / 232 / 82 -> 1222 / 237 / 82`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

The five new Tokens now each have one Metric. The next selected step should be
a Green report/decision pass before any further Metric write expansion.

## 2026-05-23 New Metric Report Review

The Green read-only report pass confirmed Metric ids `1532..1536` are readable
through `metrics:report` and `metrics:window-report` without rawJson dumps or
side effects.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric 0 / 1 / 2+ Token distribution: `1222 / 237 / 82`
- 24h pump queue: `metricPendingCount=0`, `enrichPendingCount=5`
- 168h pump queue: `metricPendingCount=260`, `enrichPendingCount=425`,
  `staleReviewCount=420`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

The new rows are `thin` Metric-1 samples with visible `near_30m` entry anchors,
but no alert-FDV anchor, so outcome remains `no_data`. Next selected lane:
enrich/rescore preflight for the five new `mint_only` Metric-1 rows. Broader
Metric accumulation remains a second choice; detect write continuation and
scheduler/systemd remain locked.

## 2026-05-23 Enrich/Rescore Preflight

The Green read-only preflight confirmed that
`token:enrich-rescore:geckoterminal` can target the five new
GeckoTerminal-origin pump `mint_only` Metric-1 Tokens as a single bounded batch.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Metric 0 / 1 / 2+ Token distribution: `1222 / 237 / 82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- 24h pump queue: `geckoOriginTokenCount=5`, `enrichPendingCount=5`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h pump queue: `geckoOriginTokenCount=425`, `enrichPendingCount=425`,
  `metricPendingCount=260`, `staleReviewCount=420`
- auto-send allowed candidate count: `0`
- retry candidate count: `0`

Read-only simulation for `--pumpOnly --limit 5 --sinceMinutes 1440` selected
exactly ids `5624`, `5623`, `5622`, `5621`, and `5620`.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Expected effect is Token enrich/rescore/context/review-flag updates for up to
five rows after external GeckoTerminal and best-effort Metaplex fetches.
Expected non-effects are Metric write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler / systemd `0`,
repo-local data diff `0`, and rawJson full dump `0`. Do not add `--notify`.

## 2026-05-23 Enrich/Rescore Batch Result

The approved five-token enrich/rescore batch completed successfully:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`metaplexErrorKindCounts=metadata_account_missing=5`, `notifyWouldSend=0`,
`notifySent=0`, no provider error, and no 429.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`, Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`, and retry / auto-send candidates stayed `0`.

The five new rows moved from `mint_only` to `partial` with name/symbol,
normalized text, Gecko context capture, and review flags. They remain score
`C` / `0`, `hardRejected=false`, `metricsCount=1`,
`notificationCount=0`, and `holderSnapshotCount=0`.

The 24h pump queue now has `enrichPendingCount=0`, `metricPendingCount=0`,
and `notifyCandidateCount=0`; the 168h queue still has
`enrichPendingCount=420`, `metricPendingCount=260`, and
`staleReviewCount=420`.

Next selected step should be Green: review the enriched partial cohort through
read-only reports and decide whether to append a second Metric for these five,
return to broader Metric accumulation, or preflight the older 168h
enrich-pending backlog. Scheduler/systemd and auto live send remain locked.

## 2026-05-23 Enriched Partial Report Review

The five-token enriched partial cohort was reviewed through read-only report
commands. Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1`; Metric distribution stayed `1222 / 237 / 82`;
Notification statuses stayed `captured=5`, `sent=5`, `failed=0`; auto-send
allowed candidates and retry candidates stayed `0`.

The five target rows are now `partial`, named, scored `C / 0`,
`hardRejected=false`, and still have `metricsCount=1`,
`notificationCount=0`, and `holderSnapshotCount=0`. Review flags are present
but all link/context booleans are false.

`metrics:report` and `tokens:compare-report` read all five rows without rawJson
dump. Window reports stayed `metricCount=1`, `fdvMetricCount=1`, coverage
`thin`, `hasAlertFdvAnchor=false`, `hasWindowFdvSamples=true`, and
`outcomeLabel=no_data`. The 30m / 60m / 120m windows are complete; 180m and
longer windows remain provisional.

Next selected lane: second Metric snapshot small Red preflight for these five
partial tokens. This is preferred over immediately expanding into the 168h
`enrichPendingCount=420` backlog or the 168h `metricPendingCount=260` backlog
because it completes the narrow five-token loop first. Scheduler/systemd and
auto live send remain locked.

## 2026-05-24 Second Metric Snapshot Preflight

The Green preflight for the enriched partial five-token cohort confirmed that
the next bounded Metric Red can remain narrow:

- Current counts: Token / Metric / Notification / HolderSnapshot
  `1541 / 454 / 10 / 1`
- Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidates and auto-send allowed candidates: `0`
- target ids: `5624`, `5623`, `5622`, `5621`, `5620`
- all target rows are `partial`, score `C / 0`, and `metricsCount=1`
- latest Metrics `1532..1536` are about `346` minutes old, so
  `--minGapMinutes 60` is satisfied
- read-only selection simulation returned `eligibleCount=5`,
  `selectedCount=5`, and selected exactly the target ids

Next Red exact command, requiring human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effect is Metric write up to `+5` after external GeckoTerminal
fetch. Expected non-effects are Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Keep broader 168h Metric / enrich backlogs as later
lanes; complete this five-token loop first.

## 2026-05-24 Second Metric Snapshot Result

The approved second Metric snapshot small Red completed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result: `selected=5`, `written=5`, `skipped=0`, `error=0`,
`interItemDelayMs=15000`, `interItemDelayCount=4`, no provider error, no 429,
and no retry. Metric ids `1537..1541` were written.

Counts moved Token / Metric / Notification / HolderSnapshot
`1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`; Metric distribution moved
`1222 / 237 / 82 -> 1222 / 232 / 87`. Notification statuses stayed
`captured=5`, `sent=5`, `failed=0`; retry and auto-send candidates stayed
`0`.

All five target rows moved from `metricsCount=1` to `metricsCount=2` while
remaining `partial`, score `C / 0`, `hardRejected=false`, with no
Notification or HolderSnapshot rows. `metrics:window-report` shows 12h / 24h
coverage improved to `partial`; shorter windows remain `thin`, and outcome
stays `no_data` because there is no alert FDV anchor.

Next selected lane: Green preflight for the 168h GeckoTerminal enrichPending
backlog. The narrow five-token loop has now completed through second Metric
and report verification, so broader backlog work should be audited read-only
before any wider Red.

## 2026-05-24 Enrich Backlog Preflight

The Green preflight for the 168h GeckoTerminal enrichPending backlog confirmed
that the next wider Red can remain a small batch:

- Current counts: Token / Metric / Notification / HolderSnapshot
  `1541 / 459 / 10 / 1`
- Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidates and auto-send allowed candidates: `0`
- `token:enrich-rescore:geckoterminal` supports `--sinceMinutes`, not
  `--sinceHours`; use `10080` minutes for 168h
- 168h pump enrichPending count: `240`
- backlog shape: all `mint_only`, all `source=geckoterminal.new_pools`, all
  score `C / 0`, all `hardRejected=false`
- metricsCount distribution inside the backlog: `0=85`, `1=96`, `2+=59`
- selection simulation for limit 5 selects ids `5619..5615`
- selection simulation for limit 10 selects ids `5619..5610`
- selection simulation for limit 20 selects ids `5619..5600`
- the completed narrow-loop ids `5624..5620` are not selected

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effect is Token enrich/rescore/context/reviewFlags update for up
to five rows after GeckoTerminal and best-effort Metaplex fetches. Expected
non-effects are Metric write, Notification create/update, HolderSnapshot
write, Telegram send, scheduler/systemd, repo-local data diff, and rawJson full
dump. Do not add `--notify`.

## 2026-05-24 Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5619..5615` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, score still `C / 0`,
`hardRejected=false`, and reviewFlags present. Metrics stayed `5,4,4,4,4`;
Notification count stayed `1,0,0,0,0`; HolderSnapshot count stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=235`, `metricPendingCount=85`, `staleReviewCount=235`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step should
be Green: review this enriched backlog batch and choose between another small
backlog enrich batch, Metric follow-up, or docs/handoff.

## 2026-05-24 Enriched Backlog Batch Review

The Green review of ids `5619..5615` stayed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, have names/symbols and normalized text, have no
description or social/link flags, and have `enrichedAt` / `rescoredAt` set.
Metrics are readable: `5619` has 5 Metrics and one sent Notification; `5618`
through `5615` have 4 Metrics and no Notifications.

Window/report read-only check:

- `5619` uses sent Notification `id=10` as entry, but has no FDV samples after
  that sent anchor, so all checked windows remain `no_data`.
- `5618` uses firstSeen as entry and has 30m / 60m `thin`, 2h-12h `partial`,
  and 24h `usable`; outcome remains `no_data` because there is no alert FDV
  anchor / peak multiple.

Queue remains healthy: 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue has
`enrichPendingCount=235`, `metricPendingCount=85`, `staleReviewCount=235`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Next selection for the same bounded enrich command is clear: ids
`5614..5610`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, with no overlap against the reviewed
batch.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5619..5615` is second, but additional Metric writes are not
needed now because this cohort already has 4-5 Metrics and the main remaining
backlog is enrichPending.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Metric Backlog Lane Decision

The Green metric backlog preflight is complete. It confirmed that the current
168h queue still has `metricPendingCount=85`, but the existing
`metric:snapshot:geckoterminal` batch selector does not target those rows.
Batch mode orders eligible GeckoTerminal-origin pump rows newest-first by
`selectionAnchorAt`; with `--sinceMinutes 10080 --minGapMinutes 60`, all 245
recent Gecko pump rows are eligible.

Read-only simulation showed:

- limit 5 selects ids `5624..5620`, all already measured with
  `metricsCount=2`;
- limit 20 selects ids `5624..5605`, all partial and already measured;
- limit 30 selects ids `5624..5595`, all partial and already measured;
- limit 75 selects ids `5624..5550`, with `partial=45`, `mint_only=30`, and no
  Metric 0 rows;
- the Metric 0 backlog rows are ids `5380..5464`.

Therefore, do not run a batch Metric backlog Red yet. A batch limit 20 or limit
75 command would write additional Metrics to already measured rows and leave
`metricPendingCount=85` unchanged.

Next selected task: **Green exact-mint Metric 0 backlog preflight**. It should
choose one known Metric 0 row, confirm exact `--mint` behavior, include
`--noNotificationCapture` if writing is later approved, and only then decide
whether a single-row Red is acceptable. A later Yellow / design option is a
pending-first batch selector for true Metric backlog accumulation.

Scheduler, systemd, always-on auto live send, notification retry execution, and
production auto-send remain locked.

## 2026-05-24 Exact-Mint Metric 0 Red Candidate

The exact-mint Metric 0 backlog preflight is complete. The selected row is
token id `5464`, mint
`By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`. It is a
GeckoTerminal-origin pump row with `metadataStatus=mint_only`,
`metricsCount=0`, `notificationCount=0`, `holderSnapshotCount=0`,
score `C / 0`, `hardRejected=false`, and no latest Metric.

Next selected task: **Red exact-mint Metric 0 snapshot**.

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Human approval is required. Expected side effects are one external
GeckoTerminal token snapshot fetch and at most one production Metric row.
Expected non-effects are Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
rawJson full dump, and offensive raw text dump.

Do not use batch `--limit` for this target yet. Batch selection still does not
reach the Metric 0 backlog. A pending-first batch selector remains a later
Yellow/design option.

## 2026-05-24 Seventh Enrich Backlog Review Decision

The seventh bounded 168h enrich backlog review inspected ids `5589..5585`
read-only after they were moved to `partial`. Current state remains Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`.

The batch is healthy: all five reviewed rows are `partial`, score `C / 0`,
`hardRejected=false`, have normalized text / reviewFlags / enrichment and
rescore timestamps, and have `metricsCount=2`, `notificationCount=0`,
`holderSnapshotCount=0`. Read-only report/window checks show two GeckoTerminal
token snapshot Metrics per row, 3h-12h `thin`, 24h `partial`, and unresolved
`no_data` outcomes because no alert FDV anchor / peak multiple exists.

Queue context remains stable: default queue has no pending/candidate rows; 168h
queue has `enrichPendingCount=205`, `metricPendingCount=85`,
`staleReviewCount=205`, and `notifyCandidateCount=0`. Auto-send allowed
candidates and retry candidates remain `0`.

Next selected step: Green progress consolidation / handoff. Repeat limit 5
enrich backlog Red is second, but after seven consecutive successful Red
batches with no provider error, no 429, no retry, and no notify/Metric side
effects, a short consolidation is the safer next operating step. Scheduler,
systemd, always-on auto live send, and retry execution remain locked.

## 2026-05-24 Enrich Backlog Progress Consolidation

The consolidation reviewed seven consecutive bounded enrich backlog batches,
ids `5619..5585`, all run as limit 5 batches without `--notify`. They processed
35 Token rows and moved the 168h `enrichPendingCount` from the original 240
baseline to the current 205. Current 168h queue also shows
`metricPendingCount=85`, `staleReviewCount=205`, and `notifyCandidateCount=0`;
default queue has no pending/candidate rows.

Quality summary for the 35-row partial cohort: `scoreRank` distribution is
`C=34`, `B=1`; `scoreTotal` distribution is `0=32`, `1=2`, `2=1`;
`hardRejected=0`. Notable rows are `5607` `B / 2`, plus `5596` and `5590`
`C / 1`. Website, X, Telegram, Metaplex hit, description, and link presence
are all zero across the cohort, which explains why `notifyCandidateCount`
remains `0`.

Safety summary: repeated Reds have shown no provider error, no 429, no retry,
no Metric write, no Notification create/update, no HolderSnapshot write, no
Telegram send, no scheduler/systemd, no repo-local data diff, and no rawJson
full dump.

Next selected step: repeat limit 5 enrich backlog Red. Broader metric backlog
preflight is second, and recent cohort analysis is now mostly covered by this
consolidation. The next selection is ids `5584..5580`, all `mint_only`, score
`C / 0`, non-hard-rejected, GeckoTerminal-origin pump rows with
`metricsCount=2`.

Human-approved Red exact command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token update for up to five rows. Expected non-effects are Metric
write, Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, and rawJson full dump.

## 2026-05-24 Eighth Enrich Backlog Batch Result

The human-approved eighth bounded enrich backlog Red ran once with the same
command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

It completed successfully: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

The selected ids `5584..5580` moved from `mint_only` to `partial`. Two token
names/symbols were redacted in docs as offensive terms; the other rows are
`Jester` / `Jester`, `stop using ai` / `ai`, and `Mintendo` / `MINTENDO`.
Scores are four `C / 0` rows and one `C / 1` row; all are
`hardRejected=false`, have no description or social/link flags, and retain
`metricsCount=2`, `notificationCount=0`, `holderSnapshotCount=0`.

The 168h queue moved from `enrichPendingCount=205` to `200`, with
`metricPendingCount=85`, `staleReviewCount=200`, and
`notifyCandidateCount=0`. The default queue remains empty. Next step should be
Green: review ids `5584..5580` in report/window/queue and decide whether to
continue another limit 5 enrich backlog Red or switch lanes.

## 2026-05-24 Eighth Enriched Backlog Batch Review

The read-only review of ids `5584..5580` is complete. Current counts stayed
Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`. Retry candidates and auto-send allowed
candidates remain `0`.

All five rows are `partial`, non-hard-rejected, have normalized text,
reviewFlags, and `metricsCount=2`; none has Notification or HolderSnapshot
rows. Two rows have offensive name/symbol values and must be documented only
as `[offensive term]`, without raw text in reports or handoff. `5581` is the
only score mover at `C / 1`, from a learned AI-phrase hit, and is not a notify
candidate.

Representative `metrics:window-report` checks for non-offensive rows `5581`
and `5580` remained read-only and showed `metricCount=2`, `fdvMetricCount=2`,
`hasAlertFdvAnchor=false`, and wider-window FDV samples. Outcome remains
`no_data`; wider windows are `thin` or `partial`, not usable alert-anchored
outcomes. RawJson was not dumped.

Queue context is healthy but now calls for consolidation: default queue remains
empty, 168h queue has `enrichPendingCount=200`, `metricPendingCount=85`,
`staleReviewCount=200`, and `notifyCandidateCount=0`. After eight consecutive
bounded enrich batches without 429, provider error, retry, Metric write,
Notification update, HolderSnapshot write, or Telegram send, the next selected
step is **Green progress consolidation / handoff**, not an immediate ninth
Red. Repeat limit 5 enrich backlog remains the second candidate after a fresh
preflight.

## 2026-05-24 Offensive-Safe Enrich Backlog Consolidation

The docs/handoff consolidation after eight bounded enrich backlog Reds is now
complete. Processed scope is ids `5619..5580`: 8 batches, 40 tokens, all moved
to `partial`. The 168h enrichPending queue moved `240 -> 200`; remaining
context is `geckoOriginTokenCount=245`, `enrichPendingCount=200`,
`metricPendingCount=85`, `staleReviewCount=200`, and
`notifyCandidateCount=0`.

Quality summary for the processed 40-row cohort:

- scoreRank distribution: `C=39`, `B=1`
- scoreTotal distribution: `0=36`, `1=3`, `2=1`
- hardRejected: `0`
- description / website / X / Telegram / Metaplex / links present: `0`
- notifyCandidate: `0`
- notable examples: `5607` is `B / 2`; `5596`, `5590`, and `5581` are
  `C / 1`

Offensive-safe rule is fixed for this lane: when a token name/symbol is
offensive, docs and final reports must use `[offensive term]` or count-based
summary only. Do not run broad target-set reports when they would print
offensive raw text; use redacted Prisma safe summaries or representative
non-offensive report samples. Continue avoiding Metric rawJson, provider raw
bodies, secrets, and env values.

Safety summary: the eight Reds only used the Token update path. Metric writes,
Notification create/update, HolderSnapshot writes, Telegram sends, auto-send
execution, retry execution, scheduler/systemd, repo-local data diffs, provider
errors, 429s, and rawJson/offensive raw dumps stayed at `0`.

Next selected lane: **recent enriched cohort score/report analysis** as a Green
task. A ninth limit 5 enrich backlog Red is still possible after fresh
preflight, but it is second choice. Broader Metric backlog preflight is the
third choice and should be selected when the operator wants to address
`metricPendingCount=85` instead of adding more Token updates.

## 2026-05-24 Recent Enriched Cohort Analysis

The Green score/report analysis of ids `5619..5580` is complete. It stayed
read-only and used redacted safe summaries for offensive-sensitive rows.

Findings:

- cohort size: `40`, all `metadataStatus=partial`
- scoreRank distribution: `C=39`, `B=1`
- scoreTotal distribution: `0=36`, `1=3`, `2=1`
- hardRejected: `0`
- notifyCandidate: `0`
- website / X / Telegram / Metaplex / description / links: all `0`
- metricsCount distribution: `2=10`, `3=25`, `4=4`, `5=1`
- `5607` is the only `B / 2`, from a core `dog` keyword hit
- `5596`, `5590`, and `5581` are `C / 1`

Representative `metrics:window-report` checks for `5607`, `5581`, and `5582`
showed readable FDV samples in wider windows but no alert FDV anchor. Outcome
therefore remains `no_data`; coverage is `thin` or `partial` depending on the
window and metric count. This supports the decision that `notifyCandidate=0`
is expected, not a planner anomaly.

Next selected lane: **broader metric backlog preflight**. The enrich backlog
Red can resume later, but the current cohort is thin in metadata/context and
does not produce notification candidates. The remaining `metricPendingCount=85`
is the better next Green target for selection, pacing, and rate-limit
preflight. Do not run Metric write yet.

## 2026-05-24 Sixth Enrich Backlog Batch Result

The sixth bounded 168h enrich backlog Red ran once with the approved command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

It completed successfully: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry.

Selected ids `5594..5590` moved from `mint_only` to `partial` with
name/symbol and normalized text present. Four stayed score `C / 0`; `5590`
became `C / 1` from a single core narrative keyword hit. All five stayed
`hardRejected=false`, `metricsCount=3`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. The 168h queue moved to `enrichPendingCount=210`,
`metricPendingCount=85`, `staleReviewCount=210`, `notifyCandidateCount=0`.
Auto-send allowed candidates and retry candidates remain `0`.

Expected non-effects held: no Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
or rawJson full dump.

Next selected step is Green: review ids `5594..5590` with read-only
report/window/queue/planner checks. Do not proceed directly to another Red
until that review confirms the batch boundary again.

## 2026-05-24 Sixth Enriched Backlog Batch Review

The Green review of ids `5594..5590` completed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

All five reviewed rows are `partial`, non-hard-rejected, have normalized text,
`enrichedAt`, `rescoredAt`, reviewFlags, and `metricsCount=3`. Four remain
score `C / 0`; `5590` is `C / 1` from a single safe core `cat` keyword hit.
No row has website, X, Telegram, Metaplex hit, description, links,
Notification rows, or HolderSnapshot rows.

Report/window checks stayed safe:

- `metrics:report` reads three safe Metric summaries per row without raw
  provider payloads.
- representative `metrics:window-report` checks for `5594` and `5590` show
  `metricCount=3`, `fdvMetricCount=3`, `entryAnchorQuality=delayed_180m`,
  3h `thin`, 6h-24h `partial`, `outcomeLabel=no_data`, and no alert FDV
  anchor.
- target compare summary keeps the cohort unresolved because latest multiple /
  peak fields are missing.

Queue remains compatible with one more small enrich backlog batch: default
queue is empty for enrich/metric/notify, and 168h queue has
`enrichPendingCount=210`, `metricPendingCount=85`, `staleReviewCount=210`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Recommended next step: repeat the bounded limit 5 enrich backlog Red once more.
The next selection is ids `5589..5585`, all `mint_only`, GeckoTerminal-origin
pump rows, score `C / 0`, `hardRejected=false`, and `metricsCount=2`.

Next Red exact command, not executed here:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetch, best-effort Metaplex lookup, and Token update for up to five rows.
Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Seventh Enrich Backlog Batch Result

The seventh bounded 168h enrich backlog Red ran once with the approved command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

It completed successfully: `selected=5`, `enriched=5`, `rescored=5`,
`skipped=0`, `error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Selection skipped `35` already-complete rows.

Selected ids `5589..5585` moved from `mint_only` to `partial` with
name/symbol and normalized text present: `zynnner` / `zyn`, `New Moon` /
`Moon`, `Turtle Carl` / `Carl`, `SmilingFace` / `SmilingFace`, and `Pelican` /
`PELICAN`. All five stayed score `C / 0`, `hardRejected=false`,
`metricsCount=2`, `notificationCount=0`, and `holderSnapshotCount=0`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Notification statuses stayed `captured=5`, `sent=5`,
`failed=0`. The 168h queue moved to `enrichPendingCount=205`,
`metricPendingCount=85`, `staleReviewCount=205`, `notifyCandidateCount=0`.
Auto-send allowed candidates and retry candidates remain `0`.

Expected non-effects held: no Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
or rawJson full dump.

Next selected step is Green: review ids `5589..5585` with read-only
report/window/queue/planner checks. Do not proceed directly to another Red
until that review confirms the batch boundary again.

## 2026-05-24 Fifth Enriched Backlog Batch Review

The Green review of ids `5599..5595` stayed read-only/docs-only. Counts stayed
Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, non-hard-rejected, and
have names/symbols, normalized text, reviewFlags, `enrichedAt`, and
`rescoredAt`. Descriptions, website/X/Telegram/link flags, Metaplex hits,
Notifications, and HolderSnapshots remain absent. Each has `metricsCount=3`.
`5596` is score `C / 1`; the safe score breakdown shows one core keyword hit,
key `cat` for `+1`, and it is still not a notify candidate.

Read-only report checks:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row
  without dumping raw provider payloads.
- `metrics:window-report` for representative ids `5596` and `5599` shows
  firstSeen entry anchors, 3h `thin`, 6h-24h `partial`, and
  `outcomeLabel=no_data` because there is no alert FDV anchor.
- `tokens:compare-report` includes ids `5599..5595` as partial rows with
  latest GeckoTerminal Metrics and unresolved outcome.

Queue/planner context remains healthy: default queue has
`enrichPendingCount=0`, `metricPendingCount=0`, `notifyCandidateCount=0`; 168h
queue has `enrichPendingCount=215`, `metricPendingCount=85`,
`staleReviewCount=215`, `notifyCandidateCount=0`; auto-send allowed and retry
candidates are both `0`.

Next selection for the same bounded enrich command is clear as ids
`5594..5590`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
non-hard-rejected, `metricsCount=3`, with no Notification or HolderSnapshot
rows.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5599..5595` is second; broader Metric backlog is deferred.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Fifth Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`,
`error=0`, `contextWritten=5`, `metaplexAttempted=5`,
`metaplexAvailable=0`, `notifyWouldSend=0`, `notifySent=0`, no provider
error, no 429, and no retry. Selection skipped complete rows
`skippedComplete=25`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.

Selected ids `5599..5595` moved from `mint_only` to `partial` with
name/symbol present and normalized text present:

- `5599`: `TROLL OF THE UNITED STATES` / `TOTUS`, score `C / 0`
- `5598`: `Delusional Optimist` / `OPTIMIST`, score `C / 0`
- `5597`: `Boner Phone` / `Thumas`, score `C / 0`
- `5596`: `Self-Replicating Tweet` / `.....`, score `C / 1`
- `5595`: `KUROGANE` / `KGANE`, score `C / 0`

All five remained `hardRejected=false`, description absent, no website/X/
Telegram/link/Metaplex flags, `metricsCount=3`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Queue moved as expected: default queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=215`, `metricPendingCount=85`, `staleReviewCount=215`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

This confirms the fifth repeat limit-5 backlog Token update boundary. It did
not write Metrics, create/update Notifications, write HolderSnapshots, send
Telegram, execute auto-send/retry, touch scheduler/systemd, create repo-local
data diffs, or dump rawJson.

Next selected step: Green review of ids `5599..5595` via read-only
report/window/queue/planner before deciding whether to repeat another limit 5
enrich backlog Red.

## 2026-05-24 Fourth Enriched Backlog Batch Review

The Green review of ids `5604..5600` stayed read-only/docs-only. Counts stayed
Token / Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution `0=1222`, `1=232`, `2+=87`, and Notification statuses
`captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, and have names/symbols, normalized text, reviewFlags,
`enrichedAt`, and `rescoredAt`. Descriptions, website/X/Telegram/link flags,
Metaplex hits, Notifications, and HolderSnapshots remain absent. Each has
`metricsCount=3`.

Read-only report checks:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row
  without dumping raw provider payloads.
- `metrics:window-report` for representative ids `5604` and `5600` shows
  firstSeen entry anchors, `thin` to `partial` wider-window FDV coverage, and
  `outcomeLabel=no_data` because there is no alert FDV anchor.
- `tokens:compare-report` includes ids `5604..5600` as partial rows with
  latest GeckoTerminal Metrics and unresolved outcome.

Queue/planner context remains healthy: default queue has
`enrichPendingCount=0`, `metricPendingCount=0`, `notifyCandidateCount=0`; 168h
queue has `enrichPendingCount=220`, `metricPendingCount=85`,
`staleReviewCount=220`, `notifyCandidateCount=0`; auto-send allowed and retry
candidates are both `0`.

Next selection for the same bounded enrich command is clear as ids
`5599..5595`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
non-hard-rejected, `metricsCount=3`, with no Notification or HolderSnapshot
rows.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5604..5600` is second; broader Metric backlog is deferred.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Third Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5609..5605` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, `hardRejected=false`, and
reviewFlags present. Scores stayed `C / 0` except `5607`, which moved to
`B / 2`. Metrics stayed `3,3,3,3,3`; Notification and HolderSnapshot counts
stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=225`, `metricPendingCount=85`, `staleReviewCount=225`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step
should be Green: review this third enriched backlog batch and decide whether
to run another small backlog enrich batch or shift to Metric/report follow-up.

## 2026-05-24 Fourth Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5604..5600` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, score still `C / 0`,
`hardRejected=false`, and reviewFlags present. Metrics stayed `3,3,3,3,3`;
Notification and HolderSnapshot counts stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=220`, `metricPendingCount=85`, `staleReviewCount=220`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step
should be Green: review this fourth enriched backlog batch and decide whether
to run another small backlog enrich batch or shift to Metric/report follow-up.

## 2026-05-24 Third Enriched Backlog Batch Review

The Green review of ids `5609..5605` stayed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, non-hard-rejected, have
names/symbols and normalized text, have no description or social/link flags,
and have `enrichedAt` / `rescoredAt` set. Each has `metricsCount=3` and no
Notification / HolderSnapshot rows. `5607` is the only score mover: `Doge
Coffee` / `DOGECOFFEE` is `B / 2` because normalized text
`doge coffee dogecoffee` hit the core `dog` keyword for `+2`.

Window/report read-only check:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row and
  shows safe market-data presence booleans without raw provider payloads.
- `5607` and `5609` both use firstSeen as entry, have
  `entryAnchorQuality=delayed_120m`, 30m / 60m `no_data`, 2h `thin`, and
  3h-24h `partial`.
- Outcome remains `no_data` because there is no alert FDV anchor / peak
  multiple.
- `tokens:compare-report` includes ids `5609..5605` with
  `metadataStatus=partial`, `minMetricsCount=3`, latest GeckoTerminal Metrics,
  and unresolved outcome.

Queue remains healthy: 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue has
`enrichPendingCount=225`, `metricPendingCount=85`, `staleReviewCount=225`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Next selection for the same bounded enrich command is clear: ids
`5604..5600`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, with no overlap against the reviewed
batch.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5609..5605` is second, but the rows already have three Metrics
and are readable; the main remaining backlog is still enrichPending.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.

## 2026-05-24 Next Enrich Backlog Batch Result

The approved bounded 168h enrich backlog Red ran once:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Result: `selected=5`, `enriched=5`, `rescored=5`, `skipped=0`, `error=0`,
`contextWritten=5`, `metaplexAttempted=5`, `metaplexAvailable=0`,
`notifyWouldSend=0`, `notifySent=0`, no provider error, no 429, and no retry.
Metaplex lookup returned `metadata_account_missing=5`.

Counts stayed Token / Metric / Notification / HolderSnapshot
`1541 / 459 / 10 / 1`; Metric distribution stayed `0=1222`, `1=232`,
`2+=87`; Notification statuses stayed `captured=5`, `sent=5`, `failed=0`.
The selected ids `5614..5610` moved from `mint_only` to `partial` with
name/symbol present, normalized text present, score still `C / 0`,
`hardRejected=false`, and reviewFlags present. Metrics stayed `3,3,3,3,3`;
Notification and HolderSnapshot counts stayed `0`.

Queue moved as expected: default 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue now has
`enrichPendingCount=230`, `metricPendingCount=85`, `staleReviewCount=230`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Only the expected Token update path was used. There was no Metric write,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, or rawJson full dump. Next step should
be Green: review this second enriched backlog batch and decide whether to run
another small backlog enrich batch or shift to Metric/report follow-up.

## 2026-05-24 Next Enriched Backlog Batch Review

The Green review of ids `5614..5610` stayed read-only. Counts stayed Token /
Metric / Notification / HolderSnapshot `1541 / 459 / 10 / 1`, Metric
distribution stayed `0=1222`, `1=232`, `2+=87`, and Notification statuses
stayed `captured=5`, `sent=5`, `failed=0`.

The reviewed rows are all `metadataStatus=partial`, score `C / 0`,
`hardRejected=false`, have names/symbols and normalized text, have no
description or social/link flags, and have `enrichedAt` / `rescoredAt` set.
Each has `metricsCount=3` and no Notification / HolderSnapshot rows.

Window/report read-only check:

- `metrics:report` reads three GeckoTerminal Metrics for each selected row and
  shows safe market-data presence booleans without raw provider payloads.
- `5614` and `5613` both use firstSeen as entry, have
  `entryAnchorQuality=delayed_120m`, 30m / 60m `no_data`, 2h `thin`, and
  3h-24h `partial`.
- Outcome remains `no_data` because there is no alert FDV anchor / peak
  multiple.
- `tokens:compare-report` includes ids `5614..5610` with
  `metadataStatus=partial`, `minMetricsCount=3`, latest GeckoTerminal Metrics,
  and unresolved outcome.

Queue remains healthy: 24h queue has `enrichPendingCount=0`,
`metricPendingCount=0`, `notifyCandidateCount=0`; 168h queue has
`enrichPendingCount=230`, `metricPendingCount=85`, `staleReviewCount=230`,
`notifyCandidateCount=0`. Auto-send allowed candidates and retry candidates
remain `0`.

Next selection for the same bounded enrich command is clear: ids
`5609..5605`, all `mint_only`, GeckoTerminal-origin pump rows, score `C / 0`,
`hardRejected=false`, `metricsCount=3`, with no overlap against the reviewed
batch.

Next selected step: repeat the limit 5 enrich backlog Red. Metric/report
follow-up for `5614..5610` is second, but the rows already have three Metrics
and are readable; the main remaining backlog is still enrichPending.

Next Red exact command, requiring human approval:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --write
```

Expected side effects are external GeckoTerminal fetch, best-effort Metaplex
lookup, and Token enrich/rescore/context/reviewFlags update for up to five
rows. Expected non-effects are Metric write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
and rawJson full dump. Do not add `--notify`.
