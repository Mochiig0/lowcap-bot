# Metric Snapshot Rate Limit Policy

Date: 2026-05-19

This is a read-only / docs-only preflight for GeckoTerminal Metric snapshot
rate-limit handling. It does not run `metric:snapshot:geckoterminal`, does not
fetch external APIs, and does not write production DB state.

Verification safety update, 2026-05-26: do not use `pnpm smoke` as Green /
Yellow no-write validation against the active DB. It was run during
`ops:plan:bounded --postRunPlan` implementation verification and wrote
smoke/rehearsal rows, moving Token `1930 -> 1945` and Notification `18 -> 22`.
Metric and HolderSnapshot did not change, and Telegram was not sent. For
Metric snapshot preflight and docs-only work, prefer `pnpm exec tsc --noEmit`,
targeted tests, CLI `--help`, fetch-free `--onlyMetricPending` previews,
`mvp:status`, `ops:plan:bounded`, `notification:auto-send:plan`,
`notification:retry:plan`, and `review:queue:geckoterminal`.

Provider error review, 2026-06-01: the safe Metric backlog Red selected
`50` rows but all items returned `fetch failed`, with no Metric writes. Source
inspection confirms that non-OK HTTP responses would include a safe
`GeckoTerminal token snapshot request failed: <status> <statusText>` message,
while Node fetch-layer failures currently collapse to `fetch failed`. The
current CLI therefore cannot distinguish DNS/connection/TLS, timeout, provider
outage, sandbox/network reachability, and other fetch-layer failures in
operator summaries. A future Yellow should add raw-response-free provider error
classification and aggregate counts before another broad Red retry.

Provider error classification update, 2026-06-01: that visibility gap is now
closed for `metric:snapshot:geckoterminal`. Failed item output includes safe
`errorCategory`, optional HTTP status/statusText, and retryable hint. Command
summaries include `providerErrorCount`, `errorCategoryCounts`, first
category/status, and category-specific counts for network fetch errors,
timeouts, HTTP 429, other HTTP errors, parse errors, shape errors, empty
provider results, and unknown errors. The implementation does not add retry,
does not change write or Notification behavior, and does not print raw
response bodies, rawJson, stacks, full provider URLs, provider dumps, secrets,
or env values. Broad Metric backlog retry still requires a fresh Green
preflight and separate human approval.

Classified-output preflight, 2026-06-01: safe preview with
`--onlyMetricPending` confirms the classification fields are present even when
no provider fetch is performed. Limit `5` selected ids `7017..7013`; limit
`50` selected ids `7017..6968`. Both previews were `dryRun=true`,
`writeEnabled=false`, `selection_preview`, and produced
`providerErrorCount=0` with zeroed `errorCategoryCounts`. All selected rows
were Metric-zero, Notification-zero, and HolderSnapshot-zero. Since preview
mode does not fetch by design, the next useful provider classification step is
a separately approved limit `1` diagnostic Red, not a same-50 retry.

That limit `1` diagnostic Red classified the provider failure as
`network_fetch_error`. The command selected id `7017`, wrote `0` Metric rows,
and returned `providerErrorCount=1`, `network_fetch_error=1`,
`firstErrorCategory=network_fetch_error`, `firstHttpStatus=null`, and
`retryable=true`. No HTTP 429, other HTTP status, parse error, shape error,
provider-empty result, or unknown error was observed. This points to a
fetch-layer failure before HTTP response handling. Do not retry a larger batch
until provider/network reachability is reviewed.

Provider/network reachability review, 2026-06-02: the failure is reproducible
inside the normal Codex sandbox as DNS/fetch-layer failure. `curl -I` cannot
resolve `api.geckoterminal.com`, and Node `fetch` HEAD reports `fetch failed`
with cause code `EAI_AGAIN`. With approved non-sandbox diagnostics, the same
host resolves and HTTPS HEAD requests reach GeckoTerminal/Cloudflare and return
safe HTTP status headers. The CLI is using the default provider host because
`GECKOTERMINAL_TOKEN_API_URL` is unset, and the timeout remains `10000ms`.
Conclusion: the previous `network_fetch_error` is most consistent with
sandbox DNS/network restriction, not HTTP 429, bad provider URL config, or a
confirmed provider outage. Avoid in-sandbox retry; use an explicitly approved
out-of-sandbox Red/network path if Metric backlog write is needed.

Network-enabled Metric Red policy, 2026-06-02: normal Codex sandbox Metric
provider-fetch Red is allowed only when provider DNS/reachability succeeds in
the same execution context or a recent in-sandbox Metric provider fetch
succeeded. If sandbox DNS still fails, do not run Metric provider-fetch Red
there. A network-enabled / out-of-sandbox Metric Red requires explicit
operator approval, safe alias command shape, clean selection preview, captured
DB/queue/planner state, failed Notification `0`, retry candidate `0`, enabled
auto-send allowed `0`, documented side effects / non-effects, no Telegram or
Notification execution, and no retry / second command unless separately
approved.

Use a diagnostic-first sequence. The first network-enabled Metric Red after
this DNS finding should be limit `1`:

```bash
pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 1 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Only after a successful limit `1` diagnostic and a fresh Green preflight should
the broader limit `50` backlog command be considered:

```bash
pnpm -s metric:snapshot:geckoterminal:safe -- --pumpOnly --limit 50 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

If the diagnostic returns `network_fetch_error` or `timeout`, pause Metric
backlog writes and review the network/provider path again. If network-enabled
execution is not desired, keep the old Metric backlog paused and choose a
separately preflighted non-Metric path.

Codex CLI post-update preflight, 2026-06-02: `codex-cli 0.136.0` was checked
after update. The safe alias still prints help without IPC `EPERM` and the
fetch-free preview remains `dryRun=true`, `writeEnabled=false`, and
`selection_preview` with `selectedCount=5`, `providerErrorCount=0`, and clean
selected rows (`metricsCount=0`, `notificationCount=0`,
`holderSnapshotCount=0`). Normal sandbox DNS still fails for
`api.geckoterminal.com` (`curl` host resolution failure and Node HEAD
`TypeError EAI_AGAIN`), while approved out-of-sandbox read-only diagnostics
resolve and reach the host with HTTP HEAD `404`. Keep Metric provider-fetch
Red out of the normal sandbox unless a future same-context preflight proves
provider reachability.

Network-enabled diagnostic result, 2026-06-02: the approved out-of-sandbox
limit `1` Red succeeded. It selected token id `7017`, wrote Metric id `2066`
at `observedAt=2026-06-02T10:47:11.851Z`, and returned `selected=1`,
`ok=1`, `error=0`, `written=1`, `providerErrorCount=0`, and all
`errorCategoryCounts=0`. RawJson-free `metrics:report` confirmed
`priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
`topPoolPresent=true`. Counts moved only in Metric:
`3023 / 956 / 22 / 1 -> 3023 / 957 / 22 / 1`; Metric buckets moved
`0=2207, 1=729, 2+=87 -> 0=2206, 1=730, 2+=87`; rolling 168h
`metricPendingCount` moved `728 -> 727`. Notification capture stayed disabled,
Notification / Telegram stayed unchanged, and no retry, auto-send, scheduler,
systemd, rawJson dump, or `pnpm smoke` occurred. Any broader limit `50`
continuation still requires a fresh Green preflight and separate human
approval.

Network-enabled backlog limit `50` preflight, 2026-06-02: the fresh Green
preflight after Metric id `2066` found the next backlog slice ready. DB counts
are `3023 / 957 / 22 / 1`, Metric buckets are `0=2206`, `1=730`, `2+=87`,
default queue is clear, and rolling 168h has `metricPendingCount=727`,
`enrichPendingCount=779`, `notifyCandidateCount=0`. Failed Notification,
retry candidate, and enabled auto-send allowed candidate counts are all `0`.
Safe preview selected ids `7016..6967` with `dryRun=true`,
`writeEnabled=false`, `selectedCount=50`, `providerErrorCount=0`, no external
fetch, and no rawJson dump. All selected rows have `metricsCount=0`,
`notificationCount=0`, `holderSnapshotCount=0`, and Notification capture
disabled. The next candidate may be issued only as a separate human-approved
network-enabled / out-of-sandbox Red; do not run it in the normal sandbox.

Network-enabled backlog limit `50` result, 2026-06-02: the approved
out-of-sandbox Red ran the exact safe alias command once and completed without
provider errors. It selected ids `7016..6967`, wrote Metric ids `2067..2116`,
and returned `selected=50`, `ok=50`, `skipped=0`, `error=0`,
`written=50`, `interItemDelayCount=49`, `providerErrorCount=0`, and all
`errorCategoryCounts=0`. ObservedAt range was
`2026-06-02T11:19:27.532Z` to `2026-06-02T11:32:15.615Z`; rawJson-free
summary confirmed price / FDV / reserve / top-pool presence for all 50 new
rows. Counts moved only in Metric:
`3023 / 957 / 22 / 1 -> 3023 / 1007 / 22 / 1`; Metric buckets moved
`0=2206, 1=730, 2+=87 -> 0=2156, 1=780, 2+=87`; rolling 168h
`metricPendingCount` moved `727 -> 677`. Notification capture stayed
disabled, Notification / Telegram stayed unchanged, and no Token write,
HolderSnapshot write, retry, auto-send, scheduler, systemd, rawJson dump, or
`pnpm smoke` occurred. Do a fresh Green report/queue review before another
Metric backlog Red.

Network-enabled backlog limit `50` continuation, 2026-06-02: after the Green
post-run review, the next approved out-of-sandbox Red again ran the exact safe
alias command once and completed without provider errors. It selected ids
`6966..6917`, wrote Metric ids `2117..2166`, and returned `selected=50`,
`ok=50`, `skipped=0`, `error=0`, `written=50`,
`interItemDelayCount=49`, `providerErrorCount=0`, and all
`errorCategoryCounts=0`. ObservedAt range was
`2026-06-02T14:20:28.829Z` to `2026-06-02T14:33:24.017Z`; rawJson-free
checks confirmed price / FDV / reserve / top-pool presence for all 50 new
rows. Counts moved only in Metric:
`3023 / 1007 / 22 / 1 -> 3023 / 1057 / 22 / 1`; Metric buckets moved
`0=2156, 1=780, 2+=87 -> 0=2106, 1=830, 2+=87`; rolling 168h
`metricPendingCount` moved `677 -> 627`. Notification capture stayed
disabled, Notification / Telegram stayed unchanged, and no Token write,
HolderSnapshot write, retry, auto-send, scheduler, systemd, rawJson dump, or
`pnpm smoke` occurred. Continue the one-Red-then-one-Green cadence before any
third batch.

Network-enabled backlog limit `50` continuation, 2026-06-03: after the next
Green post-run review, the third approved out-of-sandbox Red again ran the
exact safe alias command once and completed without provider errors. It
selected ids `6916..6867`, wrote Metric ids `2167..2216`, and returned
`selected=50`, `ok=50`, `skipped=0`, `error=0`, `written=50`,
`interItemDelayCount=49`, `providerErrorCount=0`, and all
`errorCategoryCounts=0`. ObservedAt range was
`2026-06-02T19:39:47.533Z` to `2026-06-02T19:52:35.436Z`; rawJson-free
checks confirmed price / FDV / reserve / top-pool presence for all 50 new
rows. Counts moved only in Metric:
`3023 / 1057 / 22 / 1 -> 3023 / 1107 / 22 / 1`; Metric buckets moved
`0=2106, 1=830, 2+=87 -> 0=2056, 1=880, 2+=87`; rolling 168h
`metricPendingCount` moved `627 -> 577`. Notification capture stayed
disabled, Notification / Telegram stayed unchanged, and no Token write,
HolderSnapshot write, retry, auto-send, scheduler, systemd, rawJson dump, or
`pnpm smoke` occurred. Continue the one-Red-then-one-Green cadence before any
fourth batch or lane switch.

Latest Red result, 2026-05-26: the post-6H Metric pending snapshot limit 50
ran with `--interItemDelayMs 15000`, selected ids `6067..6018`, and wrote
Metric ids `1666..1715`. Result: `selected=50`, `written=50`, `skipped=0`,
`error=0`, `interItemDelayCount=49`, provider error `0`, 429 `0`, retry `0`,
and Notification capture `0`. Counts moved only in Metric:
`1945 / 556 / 22 / 1 -> 1945 / 606 / 22 / 1`; Metric buckets moved
`0=1529, 1=329, 2+=87 -> 0=1479, 1=379, 2+=87`. Queue after still has
`metricPendingCount=289`, so a Green review should decide whether to continue
bounded limit 50 Metric writes or pause for enrich/report sequencing.

## Starting Point

The bounded Metric accumulation limit 10 Red run completed with partial
success:

- `selectedCount=10`
- `writtenCount=5`
- `skippedCount=0`
- `errorCount=5`
- five item errors were `429 Too Many Requests`
- Metric count moved `198 -> 203`
- Token / Notification / HolderSnapshot stayed `1536 / 8 / 1`
- Telegram was not sent

Current read-only DB state:

- Token / Metric / Notification / HolderSnapshot: `1536 / 203 / 8 / 1`
- Token rows with zero Metrics: `1372`
- Notification statuses: `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 10` reports
  `metricPendingCount=235`

The five previous `429` item mints still have `metricsCount=0` and remain
eligible for later Metric accumulation. No failure marker is stored in DB for
these item-level provider errors.

## Current Implementation Behavior

`metric:snapshot:geckoterminal` currently behaves as follows:

- batch mode is selected when `--mint` is omitted;
- batch mode now supports opt-in `--onlyMetricPending`, which narrows
  candidate selection to Metric-zero tokens before `--limit`;
- default batch selection is unchanged when `--onlyMetricPending` is omitted;
- exact `--mint` mode rejects `--onlyMetricPending` because exact mint
  selection is already explicit;
- `--onlyMetricPending` dry-run is a selection preview and does not fetch
  GeckoTerminal snapshots; `--write` uses the existing Metric append path;
- selected tokens are processed sequentially in a `for` loop;
- there is no item-to-item delay in one-shot batch mode;
- each item calls GeckoTerminal once through `fetch(.../tokens/{mint}?include=top_pools)`;
- provider response bodies and headers are not dumped on non-OK responses;
- non-OK responses throw a safe error string with HTTP status and status text;
- item errors are captured as `status=error` in output and do not create Metric
  rows;
- successful items write Metric rows only when `--write` is set;
- `--minGapMinutes` skips only tokens that already have a recent Metric for the
  same token + source;
- failed `429` items have no Metric, so they remain in the future
  `metricPending` queue;
- exact `--mint` mode can capture `metric_appended` Notification rows, but batch
  mode does not capture Notification rows;
- Telegram send is not part of this command.

## Post-6H Detect Metric Pending Preflight

Date: 2026-05-26 14:15 JST

After the 6H bounded detect write rehearsal created `359` new mint-only pump
Tokens, this Green preflight checked Metric pending selection without running
`metric:snapshot --write`, external fetch, DB write, Notification update,
Telegram send, scheduler/systemd, rawJson full dump, or offensive raw text
dump.

Current DB state is Token / Metric / Notification / HolderSnapshot
`1930 / 536 / 18 / 1`, with Metric buckets `0=1534`, `1=309`, `2+=87`.
Notification statuses are `captured=13`, `sent=5`, `failed=0`; retry
candidate count and enabled auto-send allowed candidate count are both `0`.

The new 6H cohort is ids `5729..6087`, detected between
`2026-05-25T23:05:09.477Z` and `2026-05-26T05:08:52.400Z`; all rows are
`source=geckoterminal.new_pools`, `metadataStatus=mint_only`, score `C / 0`,
and `hardRejected=false`.

The planner-proposed preview stayed fetch-free:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

Result: `selectedCount=20`, ids `6087..6068`, all `metricsCount=0`,
`latestMetricObservedAt=null`, `notificationCount=0`,
`holderSnapshotCount=0`, and `metadataStatus=mint_only`. A comparison preview
with `--limit 50` selected ids `6087..6038` with the same safe pending shape.

Decision: use the planner-proposed limit 20 for the first Metric write against
this fresh 6H cohort. Limit 50 remains a second-choice efficiency step after
one bounded success.

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required. Expected side effects are external GeckoTerminal
fetches and Metric writes up to 20. Expected non-effects are Token write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`.

That human-approved limit 20 Red later executed once and succeeded:
`selected=20`, `written=20`, `skipped=0`, `error=0`, provider error `0`,
429 `0`, retry `0`, `interItemDelayMs=15000`, `interItemDelayCount=19`, and
Notification capture `0` (`notificationSkippedReason=not_single_mint_mode`).
Selected ids `6087..6068` moved `metricsCount=0 -> 1`; new Metric ids are
`1637..1656`. Counts moved only in Metric:
`1930 / 536 / 18 / 1 -> 1930 / 556 / 18 / 1`, with Metric buckets
`0=1534, 1=309, 2+=87 -> 0=1514, 1=329, 2+=87`. Notification statuses stayed
`captured=13`, `sent=5`, `failed=0`; retry and enabled auto-send allowed
candidates stayed `0`. No Token write, Notification create/update,
HolderSnapshot write, Telegram send, scheduler/systemd, repo-local data diff,
rawJson full dump, or offensive raw text dump occurred.

Follow-up Green review confirmed the limit 20 result and cleared the next
larger batch. Ids `6087..6068` are count `20`, all `metricsCount=1`; Metric
ids `1637..1656` are count `20`; selected-row Notification and HolderSnapshot
totals are `0`. Safe market-data boolean distribution across those 20 Metric
rows is price `20`, FDV `20`, reserve `20`, and top-pool `20`.

The next preview remained fetch-free and write-free:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 50 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

Result: `selectedCount=50`, ids `6067..6018`, all `metricsCount=0`,
`notificationCount=0`, `holderSnapshotCount=0`, `metadataStatus=mint_only`,
and `latestMetricObservedAt=null`. Because the fresh-cohort limit 20 run
completed with no provider errors, 429s, retries, or side-effect spillover,
the next human-approved Red can use limit 50:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 360 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

## Pending-first Selector Yellow

Date: 2026-05-25

The Metric 0 backlog selector gap is now addressed by an opt-in CLI option:
`--onlyMetricPending`.

Implementation notes:

- option name: `--onlyMetricPending`;
- scope: batch mode only;
- exact `--mint` with `--onlyMetricPending` exits with a usage error;
- default selection is not changed;
- `--pumpOnly`, `--sinceMinutes`, `--limit`, and `--minGapMinutes` remain
  compatible;
- MVP definition of pending is `metricsCount=0`;
- dry-run with `--onlyMetricPending` returns selection preview rows without
  provider fetch;
- preview rows include `metadataStatus`, `metricsCount`, `notificationCount`,
  `holderSnapshotCount`, and `latestMetricObservedAt`;
- rawJson, raw provider payloads, offensive raw text, env values, and secrets
  are not printed.

Production read-only preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --onlyMetricPending --noNotificationCapture
```

Result: selected ids `5462`, `5461`, and `5460` in the current rolling window.
All were GeckoTerminal `new_pools` pump mints with
`metadataStatus=mint_only`, `metricsCount=0`, `notificationCount=0`,
`holderSnapshotCount=0`, and `latestMetricObservedAt=null`. The command was
read-only: no external fetch, DB write, Notification create/update, Telegram
send, Token write, Metric write, HolderSnapshot write, scheduler/systemd,
rawJson full dump, or offensive raw text dump.

Next Red candidate after a Green preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required before that command. Expected side effects are
external GeckoTerminal fetches and Metric writes up to the selected count.
Expected non-effects are Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`, repo-local
data diff `0`, rawJson full dump `0`, and offensive raw text dump `0`.

## Pending-first Selector Preflight

Date: 2026-05-25 22:21 JST

The first production preflight of `--onlyMetricPending` after implementation
confirmed the selector boundary but did not produce a Red command.

Command checked without `--write`:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 10080 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

Result:

- `dryRun=true`;
- `writeEnabled=false`;
- `onlyMetricPending=true`;
- `selectedCount=0`;
- `items=[]`;
- no provider fetch;
- no DB write;
- no Notification create/update;
- no Telegram send;
- no rawJson full dump;
- no offensive raw text dump.

Reason: the rolling 168h / `10080` minute cutoff moved past ids `5462..5460`
between Yellow implementation and this preflight. Those three rows remain
Metric-zero safe candidates, but they are no longer selected by the current
rolling window.

Current read-only state:

- Token / Metric / Notification / HolderSnapshot: `1556 / 461 / 14 / 1`;
- Metric buckets: `0=1235`, `1=234`, `2+=87`;
- Notification statuses: `captured=9`, `sent=5`, `failed=0`;
- 24h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `notifyCandidateCount=0`;
- 168h queue: `metricPendingCount=0`, `enrichPendingCount=71`,
  `staleReviewCount=71`, `notifyCandidateCount=0`;
- auto-send allowed candidate count `0`;
- retry candidate count `0`.

Decision: no batch Red command should be issued from this preflight. A limit 3
or limit 5 Red with `--sinceMinutes 10080` would currently be a no-op.

Next Green should decide the re-window policy for pending-first Metric backlog:
either widen `sinceMinutes`, add a fixed backlog-range planner, or use an
exact-mint fallback. Do not change the Red command ad hoc without a fresh
read-only preview.

## Pending-first Selector Re-window Preflight

Date: 2026-05-25 22:49 JST

The re-window preflight stayed read-only and docs-only. It did not run
`--write`, did not fetch GeckoTerminal, did not write DB state, did not create
or update Notification rows, did not send Telegram, and did not dump rawJson or
offensive raw text.

Why `10080` no longer selected rows:

- id `5462`: first-seen `detectedAt=2026-05-18T12:31:57.412Z`, about
  `10157` minutes old;
- id `5461`: first-seen `detectedAt=2026-05-18T12:30:54.667Z`, about
  `10158` minutes old;
- id `5460`: first-seen `detectedAt=2026-05-18T12:29:51.863Z`, about
  `10159` minutes old.

The `10080` minute rolling cutoff therefore missed the newest Metric-zero
backlog rows by about `77` to `79` minutes. The remaining Metric-zero backlog
matching GeckoTerminal `new_pools`, pump mints, `mint_only`, score `C / 0`,
and `hardRejected=false` contains `258` rows in ids `5200..5462`. All are
outside `10080` minutes but inside `20160` minutes at this preflight time.

Dry-run previews:

- `--sinceMinutes 10080 --limit 5`: `selectedCount=0`;
- `--sinceMinutes 20160 --limit 5`: `selectedCount=5`, ids `5462`, `5461`,
  `5460`, `5459`, `5458`;
- `--sinceMinutes 43200 --limit 5`: `selectedCount=5`, same first five ids;
- `--sinceMinutes 20160 --limit 3`: `selectedCount=3`, ids `5462`, `5461`,
  `5460`.

The selected ids are all `metricsCount=0`, `latestMetricObservedAt=null`,
`notificationCount=0`, `holderSnapshotCount=0`, `metadataStatus=mint_only`,
score `C / 0`, and `hardRejected=false`.

Decision: `--sinceMinutes 20160` is the smallest tested stable expanded window
and avoids adding selector code now. Choose limit 5 rather than limit 3 because
the preview exposes five safe Metric-zero rows while keeping the write
boundary small.

Next Red candidate, not executed in this preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects: external GeckoTerminal fetches and Metric writes up to
5 rows. Expected non-effects: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

## Pending-first Selector Batch Result

Date: 2026-05-25 23:03 JST

The first human-approved `--onlyMetricPending` batch Red was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Result:

- `selectedCount=5`;
- `okCount=5`;
- `writtenCount=5`;
- `skippedCount=0`;
- `errorCount=0`;
- provider error `0`;
- 429 `0`;
- retry `0`;
- `interItemDelayMs=15000`;
- `interItemDelayCount=4`.

Selected ids `5462`, `5461`, `5460`, `5459`, and `5458` all moved from
`metricsCount=0` to `metricsCount=1`. New Metric ids are `1553`, `1554`,
`1555`, `1556`, and `1557`, all source `geckoterminal.token_snapshot`.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1556 / 461 / 14 / 1 -> 1556 / 466 / 14 / 1`;
- Metric buckets:
  `0=1235, 1=234, 2+=87 -> 0=1230, 1=239, 2+=87`.

Notification capture remained disabled for the batch path:
`notificationCaptureEnabled=false`, `notificationCreated=false`, and
`notificationSkippedReason=not_single_mint_mode`. Notification statuses stayed
`captured=9`, `sent=5`, `failed=0`; auto-send allowed candidate count stayed
`0`; retry candidate count stayed `0`.

Representative reports stayed rawJson-free:

- token id `5460` / Metric id `1555`: price, FDV, reserve, and top-pool safe
  booleans present;
- token id `5462` / Metric id `1553`: reserve present, price / FDV /
  top-pool absent;
- `metrics:window-report` for token id `5460` reports `metricCount=1`,
  `fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
  anchor, no window FDV samples, and `outcomeLabel=no_data`.

Non-effects held: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

Next step should be a Green review of this batch result before another
`--onlyMetricPending --write` Red.

## Pending-first Selector Batch Review

Date: 2026-05-25 23:19 JST

The Green review after the first batch stayed read-only and docs-only. It did
not run `metric:snapshot:geckoterminal --write`, did not fetch GeckoTerminal,
did not write DB state, did not create or update Notifications, did not send
Telegram, and did not dump rawJson or offensive raw text.

Review results:

- Token / Metric / Notification / HolderSnapshot stayed
  `1556 / 466 / 14 / 1`;
- Metric buckets stayed `0=1230`, `1=239`, `2+=87`;
- Notification statuses stayed `captured=9`, `sent=5`, `failed=0`;
- retry candidate count stayed `0`;
- enabled auto-send allowed candidate count stayed `0`.

Ids `5462`, `5461`, `5460`, `5459`, and `5458` all remained
`metricsCount=1`, `notificationCount=0`, and `holderSnapshotCount=0`.
Representative reports were readable without rawJson:

- token id `5460` / Metric id `1555`: price / FDV / reserve / top-pool safe
  booleans present;
- token id `5462` / Metric id `1553`: reserve present, price / FDV /
  top-pool absent;
- `metrics:window-report` for token id `5460`: `metricCount=1`,
  `fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
  anchor, no window FDV samples, `outcomeLabel=no_data`;
- `metrics:window-report` for token id `5462`: `metricCount=1`,
  `fdvMetricCount=0`, `entryAnchorQuality=none`, `outcomeLabel=no_data`.

Post-Red selection preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

The preview stayed fetch-free and write-free. It selected ids `5457`, `5456`,
`5455`, `5454`, and `5453`, all `metricsCount=0`,
`latestMetricObservedAt=null`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Decision: another bounded pending-first Metric Red is valid. The 168h review
queue reports `metricPendingCount=0` because of its rolling cutoff, but the
expanded `20160` minute pending-first selector still has a clear safe
`selectedCount=5`.

Next Red candidate, not executed in this review:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

## Second Pending-first Selector Batch Result

Date: 2026-05-26 05:53 JST

The second human-approved `--onlyMetricPending` batch Red was executed once
with the same bounded command shape:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Result:

- `selectedCount=5`;
- `okCount=5`;
- `writtenCount=5`;
- `skippedCount=0`;
- `errorCount=0`;
- provider error `0`;
- 429 `0`;
- retry `0`;
- `interItemDelayMs=15000`;
- `interItemDelayCount=4`.

Selected ids `5457`, `5456`, `5455`, `5454`, and `5453` all moved from
`metricsCount=0` to `metricsCount=1`. New Metric ids are `1558`, `1559`,
`1560`, `1561`, and `1562`, all source `geckoterminal.token_snapshot`.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1556 / 466 / 14 / 1 -> 1556 / 471 / 14 / 1`;
- Metric buckets:
  `0=1230, 1=239, 2+=87 -> 0=1225, 1=244, 2+=87`.

Notification capture remained disabled for the batch path:
`notificationCaptureEnabled=false`, `notificationCreated=false`, and
`notificationSkippedReason=not_single_mint_mode`. Notification statuses stayed
`captured=9`, `sent=5`, `failed=0`; auto-send allowed candidate count stayed
`0`; retry candidate count stayed `0`.

Representative report checks stayed rawJson-free:

- token id `5457` / Metric id `1558`: reserve present, price / FDV absent;
- `metrics:window-report` for token id `5457` reports `metricCount=1`,
  `fdvMetricCount=0`, `entryAnchorQuality=none`, no alert FDV anchor, no
  window FDV samples, and `outcomeLabel=no_data`.

Non-effects held: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

Next step should be a Green review of this second batch result before another
`--onlyMetricPending --write` Red.

## Second Pending-first Selector Batch Review

Date: 2026-05-26 06:21 JST

The Green review after the second batch stayed read-only and docs-only. It did
not run `metric:snapshot:geckoterminal --write`, did not fetch GeckoTerminal,
did not write DB state, did not create or update Notifications, did not send
Telegram, and did not dump rawJson or offensive raw text.

Review results:

- Token / Metric / Notification / HolderSnapshot stayed
  `1556 / 471 / 14 / 1`;
- Metric buckets stayed `0=1225`, `1=244`, `2+=87`;
- Notification statuses stayed `captured=9`, `sent=5`, `failed=0`;
- retry candidate count stayed `0`;
- enabled auto-send allowed candidate count stayed `0`.

Ids `5457`, `5456`, `5455`, `5454`, and `5453` all remained
`metricsCount=1`, `notificationCount=0`, and `holderSnapshotCount=0`.
Representative reports were readable without rawJson:

- token id `5457` / Metric id `1558`: reserve present, price / FDV /
  top-pool absent;
- token id `5453` / Metric id `1562`: reserve present, price / FDV /
  top-pool absent;
- `metrics:window-report` for token ids `5457` and `5453`:
  `metricCount=1`, `fdvMetricCount=0`, `entryAnchorQuality=none`, no alert
  FDV anchor, no window FDV samples, `outcomeLabel=no_data`.

Post-Red selection preview:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

The preview stayed fetch-free and write-free. It selected ids `5452`, `5451`,
`5450`, `5449`, and `5448`, all `metricsCount=0`,
`latestMetricObservedAt=null`, `notificationCount=0`, and
`holderSnapshotCount=0`.

Decision: another bounded pending-first Metric Red is valid. The 24h and 168h
review queues report `metricPendingCount=0`, but the expanded `20160` minute
pending-first selector still exposes older Metric-zero rows. Treat continued
Red execution as older rolling-window backlog cleanup.

Next Red candidate, not executed in this review:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

## Third Pending-first Selector Batch Result

Date: 2026-05-26 06:30 JST

The third human-approved `--onlyMetricPending` batch Red was executed once
with the same bounded command shape:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Result:

- `selectedCount=5`;
- `okCount=5`;
- `writtenCount=5`;
- `skippedCount=0`;
- `errorCount=0`;
- provider error `0`;
- 429 `0`;
- retry `0`;
- `interItemDelayMs=15000`;
- `interItemDelayCount=4`.

Selected ids `5452`, `5451`, `5450`, `5449`, and `5448` all moved from
`metricsCount=0` to `metricsCount=1`. New Metric ids are `1563`, `1564`,
`1565`, `1566`, and `1567`, all source `geckoterminal.token_snapshot`.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1556 / 471 / 14 / 1 -> 1556 / 476 / 14 / 1`;
- Metric buckets:
  `0=1225, 1=244, 2+=87 -> 0=1220, 1=249, 2+=87`.

Notification capture remained disabled for the batch path:
`notificationCaptureEnabled=false`, `notificationCreated=false`, and
`notificationSkippedReason=not_single_mint_mode`. Notification statuses stayed
`captured=9`, `sent=5`, `failed=0`; auto-send allowed candidate count stayed
`0`; retry candidate count stayed `0`.

Representative reports stayed rawJson-free:

- token id `5451` / Metric id `1564`: price / FDV / reserve / top-pool safe
  booleans present;
- token id `5452` / Metric id `1563`: reserve present, price / FDV /
  top-pool absent;
- `metrics:window-report` for token id `5451`: `metricCount=1`,
  `fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
  anchor, no window FDV samples, `outcomeLabel=no_data`;
- `metrics:window-report` for token id `5452`: `metricCount=1`,
  `fdvMetricCount=0`, `entryAnchorQuality=none`, `outcomeLabel=no_data`.

Non-effects held: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

Next step should be a Green review of this third batch result before another
`--onlyMetricPending --write` Red.

## Third Pending-first Selector Batch Review

Reviewed 2026-05-26 06:36 JST as read-only / docs-only. No `--write`,
external fetch, DB write, Telegram send, Notification create/update,
rawJson full dump, or offensive raw text dump was executed.

Current state stayed:

- Token / Metric / Notification / HolderSnapshot: `1556 / 476 / 14 / 1`;
- Metric buckets: `0=1220`, `1=249`, `2+=87`;
- Notification statuses: `captured=9`, `sent=5`, `failed=0`;
- auto-send allowed candidate count `0`;
- retry candidate count `0`.

Batch result review:

- ids `5452`, `5451`, `5450`, `5449`, and `5448` are readable as
  `metricsCount=1`, `metadataStatus=mint_only`, score `C / 0`,
  `hardRejected=false`, `notificationCount=0`, and `holderSnapshotCount=0`;
- Metric ids are `1563`, `1564`, `1565`, `1566`, and `1567`, source
  `geckoterminal.token_snapshot`;
- `metrics:report` needed the `node --import tsx` fallback because the package
  script hit the known tsx IPC limitation;
- token id `5451` / Metric id `1564` has price / FDV / reserve / top-pool
  present;
- token ids `5452`, `5450`, `5449`, and `5448` have reserve present with
  price / FDV / top-pool absent.

Representative window review:

- token id `5451`: `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no window FDV
  samples, `outcomeLabel=no_data`;
- token id `5452`: `metricCount=1`, `fdvMetricCount=0`,
  `entryAnchorQuality=none`, no alert FDV anchor, no window FDV samples,
  `outcomeLabel=no_data`.

Queue and selector context:

- default 24h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `notifyCandidateCount=0`;
- 168h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `staleReviewCount=0`, `notifyCandidateCount=0`;
- post-review preview command stayed selection-only:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

- preview result: `dryRun=true`, `writeEnabled=false`,
  `onlyMetricPending=true`, `selectedCount=5`, status `selection_preview`;
- selected ids: `5447`, `5446`, `5445`, `5444`, `5443`;
- all selected rows are `metricsCount=0`, `latestMetricObservedAt=null`,
  `notificationCount=0`, `holderSnapshotCount=0`,
  `metadataStatus=mint_only`, source `geckoterminal.new_pools`.

Decision: because the preview still selects exactly five Metric-zero rows and
the prior three pending-first batches had no provider error, 429, retry,
Notification capture, Token write, HolderSnapshot write, or Telegram send, the
next step can be one more bounded pending-first Metric snapshot Red. Treat this
as older rolling-window backlog cleanup, not current 168h queue pressure.

Next Red candidate, not executed in this review:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects: external GeckoTerminal fetch and Metric writes up to 5
rows. Expected non-effects: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

## Repeated Pending-first Selector Batch Result

Executed 2026-05-26 06:43 JST with the same bounded command shape:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Result:

- `selectedCount=5`;
- `okCount=5`;
- `writtenCount=5`;
- `skippedCount=0`;
- `errorCount=0`;
- provider error `0`;
- 429 `0`;
- retry `0`;
- `interItemDelayMs=15000`;
- `interItemDelayCount=4`.

Selected ids `5447`, `5446`, `5445`, `5444`, and `5443` all moved from
`metricsCount=0` to `metricsCount=1`. New Metric ids are `1568`, `1569`,
`1570`, `1571`, and `1572`, all source `geckoterminal.token_snapshot`.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1556 / 476 / 14 / 1 -> 1556 / 481 / 14 / 1`;
- Metric buckets:
  `0=1220, 1=249, 2+=87 -> 0=1215, 1=254, 2+=87`.

Notification capture remained disabled for the batch path:
`notificationCaptureEnabled=false`, `notificationCreated=false`, and
`notificationSkippedReason=not_single_mint_mode`. Notification statuses stayed
`captured=9`, `sent=5`, `failed=0`; auto-send allowed candidate count stayed
`0`; retry candidate count stayed `0`.

Representative reports stayed rawJson-free:

- token id `5446` / Metric id `1569`: price / FDV / reserve / top-pool safe
  booleans present;
- token id `5447` / Metric id `1568`: reserve present, price / FDV /
  top-pool absent;
- `metrics:window-report` for token id `5446`: `metricCount=1`,
  `fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
  anchor, no window FDV samples, `outcomeLabel=no_data`;
- `metrics:window-report` for token id `5447`: `metricCount=1`,
  `fdvMetricCount=0`, `entryAnchorQuality=none`, `outcomeLabel=no_data`.

Non-effects held: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

Next step should be a Green review of this repeated batch result before another
`--onlyMetricPending --write` Red.

## Repeated Pending-first Selector Batch Review

Reviewed 2026-05-26 06:55 JST as read-only / docs-only. No `--write`,
external fetch, DB write, Telegram send, Notification create/update,
rawJson full dump, or offensive raw text dump was executed.

Current state stayed:

- Token / Metric / Notification / HolderSnapshot: `1556 / 481 / 14 / 1`;
- Metric buckets: `0=1215`, `1=254`, `2+=87`;
- Notification statuses: `captured=9`, `sent=5`, `failed=0`;
- auto-send allowed candidate count `0`;
- retry candidate count `0`.

Batch result review:

- ids `5447`, `5446`, `5445`, `5444`, and `5443` are readable as
  `metricsCount=1`, `metadataStatus=mint_only`, score `C / 0`,
  `hardRejected=false`, `notificationCount=0`, and `holderSnapshotCount=0`;
- Metric ids are `1568`, `1569`, `1570`, `1571`, and `1572`, source
  `geckoterminal.token_snapshot`;
- token id `5446` / Metric id `1569` has price / FDV / reserve / top-pool
  present;
- token id `5447` / Metric id `1568` has reserve present with price / FDV /
  top-pool absent; the remaining selected rows have the same reserve-only
  report shape.

Representative window review:

- token id `5446`: `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no window FDV
  samples, `outcomeLabel=no_data`;
- token id `5447`: `metricCount=1`, `fdvMetricCount=0`,
  `entryAnchorQuality=none`, no alert FDV anchor, no window FDV samples,
  `outcomeLabel=no_data`.

Queue and selector context:

- default 24h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `notifyCandidateCount=0`;
- 168h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `staleReviewCount=0`, `notifyCandidateCount=0`;
- post-review preview command stayed selection-only:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

- preview result: `dryRun=true`, `writeEnabled=false`,
  `onlyMetricPending=true`, `selectedCount=5`, status `selection_preview`;
- selected ids: `5442`, `5441`, `5440`, `5439`, `5438`;
- all selected rows are `metricsCount=0`, `latestMetricObservedAt=null`,
  `notificationCount=0`, `holderSnapshotCount=0`,
  `metadataStatus=mint_only`, source `geckoterminal.new_pools`.

Decision: because the preview still selects exactly five Metric-zero rows and
the prior pending-first batches had no provider error, 429, retry,
Notification capture, Token write, HolderSnapshot write, or Telegram send, the
next step can be one more bounded pending-first Metric snapshot Red. Treat this
as older rolling-window backlog cleanup, not current 168h queue pressure.

Next Red candidate, not executed in this review:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects: external GeckoTerminal fetch and Metric writes up to 5
rows. Expected non-effects: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

## Large Pending-first Selector Batch Review

Reviewed 2026-05-26 07:27 JST as read-only / docs-only. No `--write`,
external fetch, DB write, Telegram send, Notification create/update,
rawJson full dump, or offensive raw text dump was executed during the review.

The preceding human-approved limit 50 Red used:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Execution result stayed clean: `selected=50`, `written=50`, `skipped=0`,
`error=0`, provider error `0`, 429 `0`, retry `0`, and Notification capture
`0`. `interItemDelayMs=15000` and `interItemDelayCount=49`.

Batch result review:

- target ids: `5442..5393`;
- Metric ids: `1573..1622`;
- all 50 target rows are now `metricsCount=1`;
- target notification count total `0`;
- target holder snapshot count total `0`;
- Token / Metric / Notification / HolderSnapshot:
  `1556 / 531 / 14 / 1`;
- Metric buckets: `0=1165`, `1=304`, `2+=87`;
- Notification statuses: `captured=9`, `sent=5`, `failed=0`;
- auto-send allowed candidate count `0`;
- retry candidate count `0`.

Safe market-data distribution across Metric ids `1573..1622`:
`reserveUsdPresent=50`, `priceUsdPresent=12`, `fdvUsdPresent=12`, and
`topPoolPresent=12`.

Representative report/window review:

- token id `5442` / Metric id `1573`: price / FDV / reserve / top-pool
  present; `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no window FDV
  samples, `outcomeLabel=no_data`;
- token id `5440` / Metric id `1575`: reserve present with price / FDV /
  top-pool absent; `metricCount=1`, `fdvMetricCount=0`,
  `entryAnchorQuality=none`, no alert FDV anchor, no window FDV samples,
  `outcomeLabel=no_data`;
- token id `5393` / Metric id `1622`: reserve present with price / FDV /
  top-pool absent.

Queue and selector context:

- default 24h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `notifyCandidateCount=0`;
- 168h queue: `metricPendingCount=0`, `enrichPendingCount=0`,
  `staleReviewCount=0`, `notifyCandidateCount=0`;
- post-review preview command stayed selection-only and fetch/write-free:

```bash
node --import tsx src/cli/metricSnapshotGeckoterminal.ts --pumpOnly --limit 50 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture
```

- preview result: `dryRun=true`, `writeEnabled=false`,
  `onlyMetricPending=true`, `selectedCount=50`, status `selection_preview`;
- first five selected ids: `5392`, `5391`, `5390`, `5389`, `5388`;
- all preview rows shown are `metricsCount=0`, `latestMetricObservedAt=null`,
  `notificationCount=0`, `holderSnapshotCount=0`, and
  `metadataStatus=mint_only`.

Decision: do not automatically repeat limit 50. If continuing Metric-zero
cleanup, the next Red should step down to limit 5 to confirm stability after
the large batch:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Human approval is required. Expected side effects: external GeckoTerminal
fetch and Metric writes up to 5 rows. Expected non-effects: Token write `0`,
Notification create/update `0`, HolderSnapshot write `0`, Telegram send `0`,
scheduler/systemd `0`, repo-local data diff `0`, rawJson full dump `0`, and
offensive raw text dump `0`. Second choice is a Green rolling-window / older
Metric-zero backlog policy task.

## Post-large Limit 5 Pending-first Batch Result

Executed 2026-05-26 07:35 JST with the bounded command shape:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 20160 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Result:

- `selectedCount=5`;
- `okCount=5`;
- `writtenCount=5`;
- `skippedCount=0`;
- `errorCount=0`;
- provider error `0`;
- 429 `0`;
- retry `0`;
- `interItemDelayMs=15000`;
- `interItemDelayCount=4`.

Selected ids `5392`, `5391`, `5390`, `5389`, and `5388` all moved from
`metricsCount=0` to `metricsCount=1`. New Metric ids are `1623`, `1624`,
`1625`, `1626`, and `1627`, all source `geckoterminal.token_snapshot`.

Counts moved only in Metric:

- Token / Metric / Notification / HolderSnapshot:
  `1556 / 531 / 14 / 1 -> 1556 / 536 / 14 / 1`;
- Metric buckets:
  `0=1165, 1=304, 2+=87 -> 0=1160, 1=309, 2+=87`.

Notification capture remained disabled for the batch path:
`notificationCaptureEnabled=false`, `notificationCreated=false`, and
`notificationSkippedReason=not_single_mint_mode`. Notification statuses stayed
`captured=9`, `sent=5`, `failed=0`; auto-send allowed candidate count stayed
`0`; retry candidate count stayed `0`.

Representative reports stayed rawJson-free:

- token id `5391` / Metric id `1624`: price / FDV / reserve / top-pool safe
  booleans present;
- token ids `5392`, `5390`, `5389`, and `5388`: reserve present, price / FDV /
  top-pool absent;
- `metrics:window-report` for token id `5391`: `metricCount=1`,
  `fdvMetricCount=1`, `entryAnchorQuality=very_late_gt_360m`, no alert FDV
  anchor, no window FDV samples, `outcomeLabel=no_data`;
- `metrics:window-report` for token id `5392`: `metricCount=1`,
  `fdvMetricCount=0`, `entryAnchorQuality=none`, `outcomeLabel=no_data`.

Non-effects held: Token write `0`, Notification create/update `0`,
HolderSnapshot write `0`, Telegram send `0`, scheduler/systemd `0`,
repo-local data diff `0`, rawJson full dump `0`, and offensive raw text dump
`0`.

Next step should be a Green review of this bounded limit 5 result before
another `--onlyMetricPending --write` Red.

In one-shot batch mode, `429` does not throw out of the whole command. The CLI
can exit `0` while reporting `errorCount>0`. Treat this as partial success, not
as a fully Green batch.

Watch mode has a rate-limit early-stop guard for a cycle, but the previous Red
run was one-shot batch mode, so that guard did not stop after the first `429`.

## Partial Success Policy

Partial success is acceptable only when all of these hold:

- at least one Metric was written;
- Token / Notification / HolderSnapshot counts do not change;
- Telegram is not sent;
- raw provider response bodies, secrets, and env values are not printed;
- item errors are safely summarized;
- no immediate rerun is performed in the same task;
- batch size is not expanded until rate-limit handling is improved.

If `errorCount>0`, record the safe summary and stop. Do not run a compensating
second command.

## Recommendation

The chosen follow-up is **B: inter-item delay Yellow implementation** before
the next Red Metric accumulation.

Reason:

- A smaller `limit 5` Red could avoid the currently observed threshold, but it
  does not address the missing pacing and may still fail depending on upstream
  rate-limit state.
- A `429` stop guard would avoid repeated errors after the first `429`, but it
  does not improve the probability of successful Metric capture.
- An item-to-item delay directly addresses the rapid sequential burst observed
  in the limit 10 run while preserving the existing batch mode and write
  boundary.

Implemented Yellow shape:

- added batch-compatible CLI option `--interItemDelayMs <N>`;
- `N` is a non-negative integer;
- default `0` preserves existing behavior;
- delay is applied between selected batch items in one-shot and watch cycles;
- there is no delay before the first item or after the last item;
- exact `--mint` mode is not delayed;
- dry-run and write behavior are identical except for pacing;
- Notification / Telegram / Token / HolderSnapshot behavior is unchanged;
- 429 handling is unchanged;
- summary output includes `interItemDelayMs` and `interItemDelayCount`;
- focused tests cover parsing, invalid values, batch delay count, last-item
  behavior, and exact `--mint` no-delay behavior without production DB or live
  Telegram.

Proposed next Red command, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Do not proceed to a larger Metric batch until the delayed `limit 10` Red result
is recorded.

## Delayed Limit 10 Result

Date: 2026-05-19

The delayed command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 10 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=10`
- `okCount=5`
- `writtenCount=5`
- `skippedCount=5`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=9`
- no `429 Too Many Requests`
- written Metric ids: `1286`, `1287`, `1288`, `1289`, `1290`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `203 -> 208`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

The prior no-delay `limit 10` run had `writtenCount=5`, `errorCount=5`, and
five `429` item errors. The delayed run had `errorCount=0`, but five selected
rows were skipped by `minGapMinutes=60` because they already had recent Metrics
from the previous run. Therefore, this confirms the delay shape is safe and
improved the fetched pending subset; it does not prove that a 10-fetch delayed
batch is always clean.

Next expansion should stay modest. Prefer one more Red at `limit 20` with
`--interItemDelayMs 15000`, or add a pending-only selection mode before larger
batch accounting.

## Delayed Limit 20 Result

Date: 2026-05-19

The delayed `limit 20` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 20 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=20`
- `okCount=10`
- `writtenCount=10`
- `skippedCount=10`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=19`
- no `429 Too Many Requests`
- written Metric ids: `1291` through `1300`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `208 -> 218`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with the delayed `limit 10` result:

- delayed `limit 10`: `writtenCount=5`, `skippedCount=5`, `errorCount=0`;
- delayed `limit 20`: `writtenCount=10`, `skippedCount=10`, `errorCount=0`.

The 15-second inter-item delay remained rate-limit clean for the fetched
pending subset. Because selected rows still include recent-Metric skips, expand
only modestly next, such as delayed `limit 30`, or design a pending-only batch
selection option before using much larger limits.

## Delayed Limit 30 Result

Date: 2026-05-19

The delayed `limit 30` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=30`
- `okCount=15`
- `writtenCount=15`
- `skippedCount=15`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=29`
- no `429 Too Many Requests`
- written Metric ids: `1301` through `1315`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `218 -> 233`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with the delayed `limit 20` result:

- delayed `limit 20`: `writtenCount=10`, `skippedCount=10`, `errorCount=0`;
- delayed `limit 30`: `writtenCount=15`, `skippedCount=15`, `errorCount=0`.

The 15-second inter-item delay continued to avoid 429s. The limiting issue is
now selection quality rather than pacing: half of the selected rows were
`skipped_recent_metric`. Before expanding beyond limit 30, add or preflight a
candidate-selection improvement so recent Metrics are excluded before `--limit`
is applied.

## Exact Mint Metric 0 Backlog Result

Date: 2026-05-24

The current batch selector could not reach the 168h Metric 0 backlog
(`ids 5380..5464`) because even `limit 75` selected already measured newer
rows first. A human-approved exact-mint Red was run once to test the Metric 0
backlog boundary:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Result:

- mode: `single`
- `selectedCount=1`
- `okCount=1`
- `writtenCount=1`
- `skippedCount=0`
- `errorCount=0`
- provider error: none
- 429: none
- retry: none
- `interItemDelayMs=0`, as expected for exact `--mint` mode
- `notificationCaptureEnabled=false`
- `notificationCreated=false`
- `notificationSkippedReason=disabled_by_option`

Counts moved:

- Token: `1541 -> 1541`
- Metric: `459 -> 460`
- Notification: `10 -> 10`
- HolderSnapshot: `1 -> 1`
- Metric buckets: `0=1222, 1=232, 2+=87 -> 0=1221, 1=233, 2+=87`

Target token id `5464` moved `metricsCount 0 -> 1` and received Metric
`1542` with source `geckoterminal.token_snapshot` at
`2026-05-24T13:52:10.586Z`. RawJson was not dumped; `metrics:report` showed
only safe market-data booleans (`priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` all true).

The 168h queue moved `metricPendingCount 85 -> 84` while
`notifyCandidateCount` stayed `0`. This confirms that exact `--mint` plus
`--noNotificationCapture` can safely touch one true Metric 0 backlog item
without Notification, Token, HolderSnapshot, Telegram, scheduler/systemd, or
repo-local side effects.

Next step should be a Green review / preflight before another exact-mint Red or
a Yellow pending-first selector design. Do not use broad batch commands as a
Metric 0 cleanup path until selection quality is fixed.

## Exact Mint Metric 0 Review And Next Candidate

Date: 2026-05-24 23:44 JST

This follow-up stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal --write`, did not fetch GeckoTerminal, did not
write DB rows, did not create / update Notifications, did not send Telegram,
and did not dump rawJson or offensive raw text.

Result review for token id `5464`:

- current `metricsCount=1`
- Metric id `1542`
- source `geckoterminal.token_snapshot`
- `observedAt=2026-05-24T13:52:10.586Z`
- `notificationCount=0`
- `holderSnapshotCount=0`
- Notification capture remained absent
- `metrics:report` showed safe booleans `priceUsdPresent=true`,
  `fdvUsdPresent=true`, `reserveUsdPresent=true`, `topPoolPresent=true`
- `metrics:window-report` showed `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no checked
  window FDV samples, and `outcomeLabel=no_data`

Remaining Metric 0 backlog:

- ids range: `5380..5463`
- remaining count: `84`
- source distribution: `geckoterminal.new_pools=84`
- metadataStatus distribution: `mint_only=84`
- metricsCount distribution: `0=84`
- scoreRank distribution: `C=84`
- hardRejected distribution: `false=84`
- notificationCount distribution: `0=84`
- holderSnapshotCount distribution: `0=84`

Next exact-mint candidate:

- token id: `5463`
- mint: `CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump`
- source / origin: `geckoterminal.new_pools`
- metadataStatus: `mint_only`
- metricsCount: `0`
- notificationCount: `0`
- holderSnapshotCount: `0`
- scoreRank / scoreTotal: `C / 0`
- hardRejected: `false`

Recommended next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump --minGapMinutes 60 --noNotificationCapture --write
```

Reason: one more exact-mint Red gives a second proof that the Metric 0 backlog
can be reduced safely with one selected mint, one Metric write, and
Notification capture disabled. The longer-term fix remains a Yellow
pending-first selector design; broad batch Metric Red should wait until the
selector can target Metric 0 rows before `--limit` is applied.

## Second Exact Mint Metric 0 Backlog Result

Date: 2026-05-25 19:58 JST

The second exact-mint Red was run once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint CGdKYBWU1haEHKoy1nrgkBbDWqQMLYV7aJj2ye1Npump --minGapMinutes 60 --noNotificationCapture --write
```

Result:

- mode: `single`
- `selectedCount=1`
- `okCount=1`
- `writtenCount=1`
- `skippedCount=0`
- `errorCount=0`
- provider error: none
- 429: none
- retry: none
- `interItemDelayMs=0`, as expected for exact `--mint` mode
- `notificationCaptureEnabled=false`
- `notificationCreated=false`
- `notificationSkippedReason=disabled_by_option`

Counts moved:

- Token: `1541 -> 1541`
- Metric: `460 -> 461`
- Notification: `10 -> 10`
- HolderSnapshot: `1 -> 1`
- Metric buckets: `0=1221, 1=233, 2+=87 -> 0=1220, 1=234, 2+=87`

Target token id `5463` moved `metricsCount 0 -> 1` and received Metric
`1543` with source `geckoterminal.token_snapshot` at
`2026-05-25T10:57:38.651Z`. `metrics:report` showed rawJson-free safe
market-data booleans (`priceUsdPresent`, `fdvUsdPresent`,
`reserveUsdPresent`, and `topPoolPresent` all true).

The 168h queue moved `metricPendingCount 84 -> 83` while
`notifyCandidateCount` stayed `0`. This is the second successful proof that
exact `--mint` plus `--noNotificationCapture` can reduce the true Metric 0
backlog by one row without Token, Notification, HolderSnapshot, Telegram,
scheduler/systemd, repo-local, rawJson dump, or offensive raw text side
effects.

Next step should be Green: review this second exact-mint result and decide
between a third one-item Red and Yellow pending-first batch selector design.

## Second Exact Mint Review And Selector Decision

Date: 2026-05-25 21:12 JST

This Green review stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal --write`, did not fetch GeckoTerminal, did not
write DB rows, did not create / update Notifications, did not send Telegram,
and did not dump rawJson or offensive raw text.

Result review for token id `5463`:

- current `metricsCount=1`
- Metric id `1543`
- source `geckoterminal.token_snapshot`
- `observedAt=2026-05-25T10:57:38.651Z`
- `notificationCount=0`
- `holderSnapshotCount=0`
- Notification capture remained absent
- `metrics:report` showed safe booleans `priceUsdPresent=true`,
  `fdvUsdPresent=true`, `reserveUsdPresent=true`, `topPoolPresent=true`
- `metrics:window-report` showed `metricCount=1`, `fdvMetricCount=1`,
  `entryAnchorQuality=very_late_gt_360m`, no alert FDV anchor, no checked
  window FDV samples, and `outcomeLabel=no_data`

Exact-mint reproducibility:

- token ids `5464` and `5463` both had `selected=1`, `written=1`,
  `skipped=0`, `error=0`
- both runs used exact `--mint --minGapMinutes 60 --noNotificationCapture --write`
- both runs created exactly one Metric and no Notification
- Token, HolderSnapshot, Telegram, scheduler/systemd, repo-local data,
  rawJson dump, and offensive raw text side effects stayed absent
- provider error, 429, and retry were all absent in both runs

Remaining Metric 0 backlog:

- fixed id range `5380..5462`: `83` rows
- source distribution: `geckoterminal.new_pools=83`
- metadataStatus distribution: `mint_only=83`
- metricsCount distribution: `0=83`
- scoreRank distribution: `C=83`
- hardRejected distribution: `false=83`
- notificationCount distribution: `0=83`
- holderSnapshotCount distribution: `0=83`
- next exact-mint candidate, if needed later: token id `5462`, mint
  `63HTSDqidfB3ruuUAmjg9KbaSzWw7gkxAF2TKY6epump`

Rolling queue note:

- `review:queue:geckoterminal -- --pumpOnly --sinceHours 168` now reports
  `metricPendingCount=19`, not `83`, because the current date is
  2026-05-25 and the 168h cutoff advanced to `2026-05-18T12:12:18.233Z`.
- The fixed backlog range remains useful for explicit Metric 0 cleanup, but a
  pending-first batch selector should define whether it is bounded by
  `sinceMinutes`, explicit id/mint inputs, or a broader backlog mode.

Decision:

- Prefer **Yellow pending-first Metric batch selector design** next.
- Do not issue a third exact-mint Red command by default. The exact-mint
  boundary has enough proof for implementation planning.
- A third exact-mint Red remains available later only if the operator wants one
  more one-row production proof before selector work.

Pending-first selector design notes:

- option name candidates: `--onlyMetricPending`, `--metricPendingFirst`,
  `--metricsCount 0`
- preferred first implementation: `--onlyMetricPending`
- default selection must not change when the option is omitted
- exact `--mint` mode must stay unchanged
- opt-in batch mode should filter / order Metric 0 or metric-pending rows
  before `--limit` is applied
- dry-run without `--write` must show selected ids / mints / metricsCount /
  metadataStatus / latestMetric / notificationCount / holderSnapshotCount
  without rawJson
- tests must cover default selection unchanged, opt-in pending-first selection,
  `--minGapMinutes` interaction, `--pumpOnly` interaction, exact `--mint`
  unaffected, and Notification capture boundaries
- Red batch execution should wait for a Green preflight after Yellow
  implementation, with expected Metric writes only and Notification / Telegram
  / Token / HolderSnapshot writes still blocked

## Candidate Selection Improvement

Date: 2026-05-19

The Metric snapshot batch selector now excludes recent Metric rows before
applying `--limit` whenever `--minGapMinutes` is provided. This addresses the
50% `skipped_recent_metric` ratio seen in delayed limit 10/20/30 runs without
changing pacing or rate-limit behavior.

Boundary:

- `--interItemDelayMs` remains the pacing tool;
- 429 item-error behavior is unchanged;
- exact `--mint` mode still performs its existing min-gap check at processing
  time;
- batch mode remains Notification-free and Telegram-free;
- Token and HolderSnapshot writes are unchanged.

Next Red candidate, not yet executed:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Success should show `selectedCount=30`, a much lower `skipped_recent_metric`
count, no 429, and Metric-only DB writes.

## Improved Limit 30 Result

Date: 2026-05-19

The improved delayed `limit 30` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 30 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=30`
- `okCount=30`
- `writtenCount=30`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=29`
- no `429 Too Many Requests`
- written Metric ids: `1316` through `1345`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `233 -> 263`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with the previous delayed `limit 30` result:

- previous delayed `limit 30`: `writtenCount=15`, `skippedCount=15`,
  `errorCount=0`;
- improved delayed `limit 30`: `writtenCount=30`, `skippedCount=0`,
  `errorCount=0`.

The pacing stayed rate-limit clean and the selection fix removed the
`skipped_recent_metric` waste for this batch. Continue incremental expansion;
do not jump directly to a very large limit.

## Improved Limit 50 Result

Date: 2026-05-19

The improved delayed `limit 50` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=50`
- `okCount=50`
- `writtenCount=50`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=49`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1346` through `1395`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `263 -> 313`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with improved `limit 30`:

- improved `limit 30`: `writtenCount=30`, `skippedCount=0`, `errorCount=0`;
- improved `limit 50`: `writtenCount=50`, `skippedCount=0`, `errorCount=0`.

The 15-second pacing stayed rate-limit clean at limit 50, and the min-gap
selection fix kept `skipped_recent_metric` at zero. Continue incremental
expansion; use a limit 75 preflight or Red task before considering larger
batches.

## Improved Limit 75 Result

Date: 2026-05-19

The improved delayed `limit 75` command was executed once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=75`
- `okCount=75`
- `writtenCount=75`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=74`
- no `429 Too Many Requests`
- no provider errors
- written Metric ids: `1396` through `1470`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `313 -> 388`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

Comparison with improved `limit 50`:

- improved `limit 50`: `writtenCount=50`, `skippedCount=0`, `errorCount=0`;
- improved `limit 75`: `writtenCount=75`, `skippedCount=0`, `errorCount=0`.

The 15-second pacing stayed rate-limit clean at limit 75, and the min-gap
selection fix kept `skipped_recent_metric` at zero. Since the pacing and
selection behavior are now proven through limit 75, the next step should be
read-only report validation rather than immediate further batch expansion.

## Report Readiness After Limit 75

Date: 2026-05-19

The next step after limit 75 was read-only report validation, not another batch
increase. Report checks confirmed:

- DB counts stayed `1536 / 388 / 8 / 1`
- Notification statuses stayed `captured=5`, `sent=3`, `failed=0`
- `review:queue:geckoterminal -- --pumpOnly --limit 20` still reported
  `metricPendingCount=85`
- `metrics:window-report` reads accumulated Metric history and Notification
  anchors without writes or external fetches
- `metrics:report` and `tokens:compare-report` provide rawJson-free Metric
  summaries for single-token and cohort review

This confirms the rate-limit-safe accumulation path feeds the read-only report
lane. Continue with outcome / cohort report review before considering more
Metric batch expansion.

## Stop Conditions Before Next Red

Stop before the next Metric accumulation Red task if:

- working tree is not clean;
- `metricPendingCount` is unexpectedly low or no longer matches the cohort;
- selected rows are not GeckoTerminal-origin pump Tokens;
- selected rows already have recent Metrics and would be mostly skipped;
- `--interItemDelayMs` is omitted for a planned limit greater than 5;
- Telegram / Notification paths appear in batch mode;
- Token or HolderSnapshot writes appear in the path;
- raw provider response bodies, `.env`, API keys, Telegram token / chat id, or
  database URL could be printed;
- `errorCount>0` from a previous Red run is being ignored rather than addressed;
- the next step cannot be expressed as one exact command or one small Yellow
  implementation task.

## Limit 75 Re-Run Decision Preflight

Date: 2026-05-19

A read-only decision preflight was completed for a possible re-run of the
already-stable limit-75 Metric accumulation command.

Read-only command:

```bash
pnpm -s review:queue:geckoterminal -- --pumpOnly --limit 75
```

Result:

- `readOnly=true`
- `geckoOriginTokenCount=94`
- `metricPendingCount=0`
- queue rows were GeckoTerminal-origin pump `mint_only`
- visible queue rows had existing Metrics and matched stale / enrich review,
  not Metric-0 pending

The current 24h queue has aged since the previous report-readiness check. A
separate read-only candidate-shape check against the proposed
`metric:snapshot:geckoterminal` filters showed about 93 eligible rows after
`minGapMinutes=60`, with a limit-75 selection shaped as approximately
`metric0=0`, `metric1=45`, and `metric2Plus=30`.

Decision:

- The next Red command can be considered as a controlled stable limit-75
  re-run for additional observation points on already measured tokens.
- It is not a Metric-0 pending cleanup run while `--sinceMinutes 1440` remains
  in place and the current queue reports `metricPendingCount=0`.
- Keep the proven pacing:
  `--interItemDelayMs 15000`.
- Human Red approval remains required because the command fetches
  GeckoTerminal and writes production Metric rows.

Candidate Red command, not executed in this preflight:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Expected side effects: up to 75 new `Metric` rows. Expected non-effects:
Token, Notification, HolderSnapshot, Telegram, checkpoint, and repo-local data
remain unchanged.

## Additional Limit 75 Observation Run

Date: 2026-05-19

The controlled Red limit-75 command was executed once after human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 75 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- exit code: `0`
- `selectedCount=59`
- `okCount=59`
- `writtenCount=59`
- `skippedCount=0`
- `errorCount=0`
- `interItemDelayMs=15000`
- `interItemDelayCount=58`
- no 429 / rate-limit error
- no provider error
- written Metric ids: `1471` through `1529`

Counts moved:

- Token: `1536 -> 1536`
- Metric: `388 -> 447`
- Notification: `8 -> 8`
- HolderSnapshot: `1 -> 1`

This was intentionally not a Metric-0 pending cleanup run. By execution time,
the `--sinceMinutes 1440` window had aged enough that only 59 eligible rows
remained after `minGapMinutes=60`; the selected rows were already measured
GeckoTerminal-origin pump `mint_only` tokens. The run added observation points
and moved 29 tokens from Metric 1 to Metric 2+, while leaving Metric 0 unchanged
at `1222`.

The 15-second pacing again stayed rate-limit clean. Batch mode still did not
create Notification rows, send Telegram, update Tokens, write HolderSnapshot,
touch checkpoints, or change repo-local data.

## Post-Run Report Readiness Decision

Date: 2026-05-19

Follow-up `metrics:window-report` checks on eight tokens confirmed that the
additional `+59` Metrics improved sampling density without changing the
rate-limit or write boundary:

- `metricCount=4` samples reached 24h `fdvSampleCoverageLabel=usable`
- Metric 1 -> 2+ samples reached 24h `fdvSampleCoverageLabel=partial`
- no new 429 / provider-error investigation is needed from the report pass
- no DB write, external fetch, Telegram send, Notification update, or rawJson
  dump occurred during report review

The remaining `no_data` outcomes are not a rate-limit or accumulation failure.
They are mostly caused by no-Notification mint-only fallback rows having no
`alertFdv` near `first_seen_detected_at`. Additional broad accumulation can add
history, but it will not by itself create an alert anchor for those rows.

Next operating preference: pause broad Metric accumulation and improve the
read-only report/operator decision surface for fallback `alertFdv=null` cases,
or separately design an alert-anchor/Notification slice.

## Post Additional Limit 75 Report Check

Date: 2026-05-20

A later read-only report pass confirmed the accumulated state after the
additional `+59` Metrics:

- Token / Metric / Notification / HolderSnapshot: `1536 / 447 / 8 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=82`
- Notification statuses: `captured=4`, `sent=4`, `failed=0`

`metrics:window-report`, `metrics:report`, `tokens:compare-report`, and
`review:queue:geckoterminal` were used only as reports. They did not fetch
GeckoTerminal, write DB state, send Telegram, update Notification rows, or dump
rawJson. This confirms the rate-limit clean Metric rows remain inspectable via
the report lane; it does not authorize another Metric snapshot run.

## Not Executed In This Preflight

- `metric:snapshot:geckoterminal`;
- external fetch;
- production DB write;
- detect watch;
- Telegram live send;
- notification send / retry;
- scheduler / systemd;
- import / enrich / rescore;
- schema / migration / app code change.

## New Token Limit-5 Preflight

Date: 2026-05-23 19:52 JST

This read-only / docs-only preflight narrowed the next Metric accumulation Red
candidate after the small bounded GeckoTerminal write rehearsal created five
new mint-only pump Tokens.

Current state:

- CodexCLI: `codex-cli 0.133.0`
- Token / Metric / Notification / HolderSnapshot: `1541 / 449 / 10 / 1`
- Token Metric distribution: `0=1227`, `1=232`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Queue state:

- 24h pump queue: `geckoOriginTokenCount=5`,
  `metricPendingCount=5`, `staleReviewCount=0`
- 168h pump queue: `geckoOriginTokenCount=425`,
  `metricPendingCount=265`, `staleReviewCount=420`

CLI / implementation boundary:

- `metric:snapshot:geckoterminal` supports `--pumpOnly`, `--limit`,
  `--sinceMinutes`, `--minGapMinutes`, and `--interItemDelayMs`.
- Batch mode sorts recent GeckoTerminal-origin candidates by
  `firstSeenSourceSnapshot.detectedAt` when present, otherwise `Token.createdAt`;
  ties use descending id.
- `--minGapMinutes` is applied before `--limit`, excluding recently measured
  rows from selection.
- Batch `--write` creates Metric rows. Notification capture is gated to exact
  `--mint --write` mode, so the batch candidate should not create
  Notifications.
- The Metric snapshot CLI writes no Tokens or HolderSnapshots and does not call
  Telegram send.

Read-only DB simulation for the candidate command found:

- `eligibleCount=5`
- `selectedCount=5`
- selected ids: `5624`, `5623`, `5622`, `5621`, `5620`
- all selected rows are `source=geckoterminal.new_pools`,
  `metadataStatus=mint_only`, pump mints, and `metricsCount=0`

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Policy:

- Keep `--interItemDelayMs 15000` even for limit 5 to preserve the previously
  rate-limit-clean pacing.
- Do not use the broader limit-75 command for this specific post-rehearsal
  check.
- If a 429 or provider error appears during the later Red run, do not retry in
  the same task and do not widen the command.
- Human approval is required before running the command because it will fetch
  GeckoTerminal and write production Metric rows.

## New Token Limit-5 Metric Snapshot Run

Date: 2026-05-23 19:58 JST

The approved Red limit-5 command ran once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- selectedCount: `5`
- okCount: `5`
- writtenCount: `5`
- skippedCount: `0`
- errorCount: `0`
- interItemDelayMs: `15000`
- interItemDelayCount: `4`
- provider error: no
- 429 / rate-limit error: no
- retry: no
- written Metric ids: `1532..1536`

Counts:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 449 / 10 / 1 -> 1541 / 454 / 10 / 1`
- Token Metric distribution:
  `0=1227`, `1=232`, `2+=82 -> 0=1222`, `1=237`, `2+=82`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

The 15-second pacing stayed rate-limit clean. Batch mode did not create
Notification rows, send Telegram, update Tokens, write HolderSnapshot, touch
scheduler / systemd, or create repo-local data diffs. Raw provider payloads and
Metric rawJson were not dumped.

## Post Limit-5 Read-Only Report Review

Date: 2026-05-23 20:22 JST

The post-run report review did not execute `metric:snapshot:geckoterminal`,
external fetch, or DB writes. It confirmed the limit-5 run achieved its narrow
goal:

- Metric rows `1532..1536` are readable through `metrics:report`.
- All five target Tokens now have `metricsCount=1`.
- The 24h pump queue moved to `metricPendingCount=0`.
- The 168h pump queue still has `metricPendingCount=260`, but this is older
  backlog and should not automatically trigger another broad Metric Red.

Window report state for the five rows is uniformly `thin` and `no_data`:

- `hasWindowFdvSamples=true`
- `hasAlertFdvAnchor=false`
- `entryAnchorQuality=near_30m`
- `noDataReasons` include `no_alert_anchor_near_entry` and
  `no_peak_multiple`

Rate-limit policy conclusion: do not immediately escalate back to limit 75
from this result. The next step should be a Green enrich/rescore preflight for
the five new Metric-1 mint-only rows, while keeping broader Metric
accumulation as a later option.

## Second Metric Snapshot Limit-5 Preflight

Date: 2026-05-24 01:43 JST

This Green pass did not run `metric:snapshot:geckoterminal`, did not use
`--write`, did not fetch GeckoTerminal, and did not write DB rows. It checked
whether the enriched partial five-token cohort can safely run another bounded
Metric snapshot.

Current state:

- CodexCLI: `codex-cli 0.133.0`
- Token / Metric / Notification / HolderSnapshot: `1541 / 454 / 10 / 1`
- Token Metric distribution: `0=1222`, `1=237`, `2+=82`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Target state:

- target ids: `5624`, `5623`, `5622`, `5621`, `5620`
- all are GeckoTerminal-origin pump rows with `metadataStatus=partial`
- all have `metricsCount=1`
- latest Metric ids are `1532..1536`
- latest Metric `observedAt` values are
  `2026-05-23T10:56:45.052Z` through `2026-05-23T10:57:47.424Z`
- minutes since latest Metric at preflight time: about `346` minutes for all
  five

Read-only simulation for the candidate command found:

- `geckoOriginEligibleCount=5`
- `pumpEligibleCount=5`
- `eligibleCount=5`
- `selectedCount=5`
- selected ids: `5624`, `5623`, `5622`, `5621`, `5620`
- selected mints match the intended five rows exactly
- `--minGapMinutes 60` should not skip any of them

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Policy:

- Keep `--interItemDelayMs 15000` because the prior limit-5 run with that
  pacing completed with no 429.
- Do not add `--watch`, `--live`, notification send, retry execution, auto
  live send, scheduler, or systemd.
- Expected Red side effect is Metric write up to `+5` after external
  GeckoTerminal fetch.
- Expected Red non-effects are Token write `0`, Notification create/update
  `0`, HolderSnapshot write `0`, Telegram send `0`, repo-local data diff `0`,
  and rawJson full dump `0`.
- If a 429 or provider error appears during the later Red, do not retry in the
  same task and do not widen the command.

## Second Metric Snapshot Limit-5 Run

Date: 2026-05-24 02:10 JST

The approved Red command ran once:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 5 --sinceMinutes 1440 --minGapMinutes 60 --interItemDelayMs 15000 --write
```

Result:

- selectedCount: `5`
- okCount: `5`
- writtenCount: `5`
- skippedCount: `0`
- errorCount: `0`
- interItemDelayMs: `15000`
- interItemDelayCount: `4`
- provider error: no
- 429 / rate-limit error: no
- retry: no
- written Metric ids: `1537..1541`

Counts:

- Token / Metric / Notification / HolderSnapshot:
  `1541 / 454 / 10 / 1 -> 1541 / 459 / 10 / 1`
- Metric distribution:
  `0=1222`, `1=237`, `2+=82 -> 0=1222`, `1=232`, `2+=87`
- Notification statuses stayed `captured=5`, `sent=5`, `failed=0`

The 15-second pacing stayed rate-limit clean again. Batch mode did not create
Notification rows, send Telegram, update Tokens, write HolderSnapshot, touch
scheduler / systemd, or create repo-local data diffs. Raw provider payloads and
Metric rawJson were not dumped.

Post-run report check:

- `metrics:report` read the new Metric ids `1541..1537`
- all five target rows moved from `metricsCount=1` to `metricsCount=2`
- `metrics:window-report` shows 12h / 24h coverage improved from `thin` to
  `partial` because each row now has two FDV samples in those windows
- shorter windows remain `thin`
- outcome remains `no_data` because there is still no alert FDV anchor near
  entry

Do not immediately widen to a large Metric run from this result. The next
safer step is a Green preflight for the 168h GeckoTerminal enrichPending
backlog, because the five-token loop has now completed its narrow Metric /
enrich / second Metric confirmation.

## Metric Backlog Return Point After Enriched Cohort Analysis

Date: 2026-05-24 21:35 JST

After eight bounded enrich backlog batches and the follow-up score/report
analysis of processed ids `5619..5580`, the next recommended lane is Green
metric backlog preflight. Current 168h queue still reports
`metricPendingCount=85`; the enriched cohort analysis found
`notifyCandidateCount=0`, no social/link/description/Metaplex evidence, and no
alert FDV anchors in representative window reports.

Preflight scope for the next task:

- stay read-only
- inspect `metricPendingCount=85` selection order and candidate safety
- confirm whether candidates are Metric 0 or stale measured rows
- keep `--pumpOnly`, small limit, explicit `--minGapMinutes`, and
  `--interItemDelayMs 15000` under consideration
- do not produce or run a Metric write Red until the preflight fixes one exact
  command and expected side effects

Expected future Metric Red boundary, if approved later: external GeckoTerminal
fetch and Metric writes only. Expected non-effects remain Token update,
Notification create/update, HolderSnapshot write, Telegram send,
scheduler/systemd, repo-local data diff, rawJson full dump, and offensive raw
text dump.

## 168h Metric Backlog Selection Preflight

Date: 2026-05-24 21:41 JST

This Green preflight stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal`, did not use `--write`, did not fetch
GeckoTerminal, did not write DB rows, did not create or update Notifications,
and did not print rawJson or offensive raw text.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Queue state:

- default 24h Gecko pump queue:
  `geckoOriginTokenCount=0`, `enrichPendingCount=0`,
  `metricPendingCount=0`, `notifyCandidateCount=0`
- 168h Gecko pump queue:
  `geckoOriginTokenCount=245`, `enrichPendingCount=200`,
  `metricPendingCount=85`, `staleReviewCount=200`,
  `notifyCandidateCount=0`

The 168h Metric-pending backlog itself is cleanly shaped:

- count: `85`
- source distribution: `geckoterminal.new_pools=85`
- metadataStatus distribution: `mint_only=85`
- metricsCount distribution: `0=85`
- scoreRank distribution: `C=85`
- hardRejected distribution: `false=85`
- reviewFlags present: `0`
- website / X / Telegram / Metaplex / description / link presence: `0`

However, the current `metric:snapshot:geckoterminal` batch selector is not a
Metric-pending selector. In batch mode it:

1. loads recent Tokens by `Token.createdAt >= sinceCutoff`;
2. keeps GeckoTerminal-origin rows using `entrySnapshot.firstSeenSourceSnapshot`
   origin where present;
3. sorts by `selectionAnchorAt` descending, then id descending;
4. applies `--pumpOnly`;
5. excludes recent Metrics before `--limit` only when `--minGapMinutes` is set;
6. applies `--limit`.

With `--sinceMinutes 10080 --minGapMinutes 60`, all 245 recent Gecko pump rows
are gap-eligible, so the selector stays newest-first and does not prefer
Metric 0 rows.

Read-only simulation:

- limit 5 selects ids `5624..5620`; all are `partial`, `metricsCount=2`,
  score `C`, and pass min-gap.
- limit 20 selects ids `5624..5605`; all are `partial`, with
  `metricsCount` distribution `2=5`, `3=10`, `4=4`, `5=1`; no Metric 0 row.
- limit 30 selects ids `5624..5595`; all are `partial`, with
  `metricsCount` distribution `2=5`, `3=20`, `4=4`, `5=1`; no Metric 0 row.
- limit 75 selects ids `5624..5550`; distribution is
  `metadataStatus partial=45`, `mint_only=30`, and
  `metricsCount 1=11`, `2=33`, `3=26`, `4=4`, `5=1`; no Metric 0 row.
- the Metric 0 backlog rows are ids `5380..5464`, so they are not reached by
  any of the checked limits.

`--sinceMinutes 1440` is also not suitable for the current target because the
24h Gecko pump queue is empty. `--sinceMinutes 10080` is necessary to include
the backlog window, but not sufficient to target the Metric 0 backlog with the
current newest-first batch order.

Rate-limit and pacing:

- prior stable Metric accumulation used `--interItemDelayMs 15000`;
- keep that pacing for future Metric Red commands;
- past delayed limit 30 / 50 / 75 runs were rate-limit clean, and the latest
  stable limit 75 wrote 59 Metrics with no 429;
- this preflight did not identify a new 429 concern, but broad limit 75 is not
  recommended here because it would not reduce `metricPendingCount=85`.

Decision:

- do not issue a next Red batch command for the stated Metric backlog target;
- the current batch command candidates would write additional Metrics to
  already measured rows and leave the Metric 0 backlog untouched;
- a future safe path should either preflight exact `--mint` mode for one
  Metric 0 row with `--noNotificationCapture`, or add / preflight a
  pending-first selector before a batch Metric backlog Red.

Expected side-effect boundary for any later approved batch Metric Red remains
Metric writes only: no Token write, no Notification create/update in batch
mode, no HolderSnapshot write, no Telegram send, no scheduler/systemd, no
repo-local data diff, no rawJson full dump, and no offensive raw text dump.

## Exact-Mint Metric 0 Backlog Preflight

Date: 2026-05-24 22:33 JST

This Green preflight stayed read-only and docs-only. It did not run
`metric:snapshot:geckoterminal`, did not use `--write`, did not fetch external
APIs, did not write DB rows, did not create / update Notifications, and did
not print rawJson or offensive raw text.

Current state:

- Token / Metric / Notification / HolderSnapshot: `1541 / 459 / 10 / 1`
- Token Metric distribution: `0=1222`, `1=232`, `2+=87`
- Notification statuses: `captured=5`, `sent=5`, `failed=0`
- failed count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Metric 0 backlog ids `5380..5464` were confirmed with safe summaries only:

- count: `85`
- source distribution: `geckoterminal.new_pools=85`
- pump distribution: `true=85`
- metadataStatus distribution: `mint_only=85`
- metricsCount distribution: `0=85`
- scoreRank / scoreTotal distribution: `C=85`, `0=85`
- hardRejected distribution: `false=85`
- Notification count distribution: `0=85`
- HolderSnapshot count distribution: `0=85`
- latest Metric present count: `0`
- reviewFlags present count: `0`

Selected exact-mint candidate:

- token id: `5464`
- mint: `By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump`
- source / origin: `geckoterminal.new_pools`
- metadataStatus: `mint_only`
- metricsCount: `0`
- notificationCount: `0`
- holderSnapshotCount: `0`
- scoreRank / scoreTotal: `C / 0`
- hardRejected: `false`
- latestMetric: `null`
- selectionAnchorAt: `2026-05-18T12:34:03.491Z`

Boundary audit:

- exact `--mint` mode selects the token directly and ignores batch ordering,
  `--limit`, `--sinceMinutes`, and `--pumpOnly` selection concerns.
- exact `--mint` mode still checks `--minGapMinutes`; because token `5464`
  has no latest Metric for `geckoterminal.token_snapshot`, it should not be
  skipped by `--minGapMinutes 60`.
- exact `--mint --write` captures a `metric_appended` Notification by default,
  so `--noNotificationCapture` is required for this Red candidate.
- `--noNotificationCapture` makes `isNotificationCaptureEnabled(args)` false,
  so the `maybeCreateByNotificationKey` path is not reached.
- the write path in `metric:snapshot:geckoterminal` is `db.metric.create` only;
  no Token update, HolderSnapshot write, or Telegram sender is imported or
  called by this CLI.
- exact `--mint` mode is not delayed by `--interItemDelayMs`; for one item,
  pacing is not needed. The rate-limit risk is one GeckoTerminal token
  snapshot fetch.

Next Red exact command, not executed here:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint By3ztQbGVGGPC9vMUzpXdq78QXNusrnZaJLd7sSzpump --minGapMinutes 60 --noNotificationCapture --write
```

Expected side effects if later approved: one external GeckoTerminal token
snapshot fetch and at most one production Metric row. Expected non-effects:
Token write `0`, Notification create/update `0`, HolderSnapshot write `0`,
Telegram send `0`, scheduler/systemd `0`, repo-local data diff `0`, rawJson
full dump `0`, and offensive raw text dump `0`. If successful,
`metricPendingCount` should move `85 -> 84`, Metric count `459 -> 460`, and
Token Metric buckets `0=1222 -> 1221`, `1=232 -> 233`, `2+=87`.
