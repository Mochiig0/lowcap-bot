# Gecko Token To Metric Minimum Loop Runbook

This runbook documents the smallest manual GeckoTerminal loop that has been proven useful for one pump mint:

1. select one GeckoTerminal `new_pools` pump mint
2. create one mint-only `Token`
3. complete the token with the gated token-only catch-up path
4. append one GeckoTerminal metric snapshot
5. confirm `ops:catchup:gecko` returns no pending work

It is intentionally not a scheduler, worker, queue, retry system, or generic source runtime.

For day-to-day bounded Gecko operation across detect, enrich/rescore, Metric
append, and rawJson-free report confirmation, use
`docs/runbooks/gecko-bounded-operation-mvp.md` as the temporary MVP entrypoint.
This minimum-loop document remains the evidence log for individual mint
progression and Metric time-series confirmation.

For records copied from this minimum loop, keep only safe summaries: statuses,
counts, mint / Metric ids, sources, `observedAt`, `metricsCount`, latest Metric
and `recentMetrics` summaries, and rawJson-free safe summary booleans. Do not
paste raw logs, raw payloads, raw stdout / stderr, exact `"rawJson":` fields,
`.env`, Telegram credentials, database URLs, raw env, or secret-bearing command
args.

## Confirmed Status

As of the successful ops-path checks, the full operator-visible Token to Metric
loop has been manually confirmed, including capture-only ops notification records
and one production Telegram ops live send for `metric_appended`:

- Gecko detector selected one pump mint candidate.
- `detect:geckoterminal:new-pools --write` created one mint-only `Token`.
- `ops:catchup:gecko --write` completed that token through the token-only runner.
- `ops:catchup:gecko --write --metricAppend` appended one `Metric` through the
  production Metric append runner.
- the Metric append execution result was `status=ok`, `writtenCount=1`, and
  `tokenWriteExecutionResults=[]`.
- the post-check matched `latestMetric.id` to the returned metric id.
- the final ops dry-run reported `plannedTokenWrites=0`,
  `plannedMetricAppends=0`, `metricPendingCount=0`,
  `latestMetricMissingCount=0`, and `nextRecommendedAction=no_action`.
- a later capture-enabled run also confirmed `--opsNotifyCaptureFile` writes
  JSONL records for `token_completed`, `metric_appended`, and `loop_complete`
  after a successful Metric append with `metricId=1115`; delivery stayed
  `capture_only`, without Telegram live send and without secret/env/raw
  stdout/raw stderr/full-args style fields in the capture output.
- after the IPv4 `https.request` transport fix, a bounded
  `ops:catchup:gecko --write --metricAppend` run with
  `--opsNotify --opsNotifyTrigger metric_appended --opsNotifyCaptureFile`
  appended exactly one Metric with `metricId=1116`, reported `writtenCount=1`
  and `tokenWriteExecutionResults=[]`, sent one production Telegram ops
  notification with `sentCount=1` and `status=sent`, and wrote capture-only
  `metric_appended` plus `loop_complete` records without secret/env/raw
  stdout/raw stderr/full-args style fields.
- `token_completed` and `loop_complete` have injected-sender selected-trigger
  success tests without production Telegram delivery.
- Telegram live loop policy now keeps `metric_appended` as the only initial
  live-send candidate after DB read confirmation, capture-only rehearsal,
  safe marker checks, and human gate. `token_completed` and `loop_complete`
  stay capture-only, and the loop / retry / dedupe / cooldown runtime remains
  unimplemented.
- the latest Red live-send preflight for `token_completed` / `loop_complete`
  stopped at `no_candidate`: token-only dry-run reported `status=no_pending`,
  `plannedTokenWrites=0`, `pendingCount=0`, and `selectedCandidates=[]`;
  Metric append dry-run reported `status=no_pending`, `plannedMetricAppends=0`,
  `metricPendingCount=0`, `pendingCount=0`, and `selectedCandidates=[]`.
- the later bounded detect origin mint
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` has confirmed the
  single-mint enrich/rescore step: `token:enrich-rescore:geckoterminal
  -- --mint ... --write` moved it from `mint_only` to `partial` with
  `name/symbol=Papu/PAPU`, `description=null`, `normalizedText=papu papu`,
  score `C` / `0`, and `hardRejected=false`. It reported
  `enrichWritten=1`, `rescoreWritten=1`, `contextWritten=1`, and
  `notifySent=0`, with `enrichedAt=2026-05-08T22:38:21.819Z` and
  `rescoredAt=2026-05-08T22:38:21.830Z`. No Metric was written:
  `metricsCount=0`, `latestMetric=null`, and `metrics:report` returned
  `count=0` / `items=[]`. Telegram, detect, watch, tmux, systemd, and
  checkpoint updates were not invoked during that enrich/rescore step.
- the same bounded detect origin mint then confirmed the first single-mint
  Metric append as a separate Red task through `first_metric_snapshot`:
  `metric:snapshot:geckoterminal -- --mint ... --write` appended exactly one
  `geckoterminal.token_snapshot` Metric, `id=1244`, at
  `observedAt=2026-05-08T23:11:09.976Z` with `volume24h=0` and
  `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. This moved `metricsCount` from 0 to 1 and set
  latestMetric / `recentMetrics` to `1244`. Token fields stayed
  `partial / Papu / PAPU / C / 0 / hardRejected=false`, the enrich/rescore
  timestamps stayed unchanged, and Telegram, detect, watch, enrich/rescore,
  tmux, systemd, and checkpoint updates were not invoked during the Metric
  step. `metrics:report` and `token:compare` confirmed the result rawJson-free.
- the same bounded detect origin mint then confirmed a second single-mint
  Metric append as a separate Red task through `second_metric_snapshot` and
  the strict `lowcap-gecko-metric-single` tmux single-run:
  `metric:snapshot:geckoterminal -- --mint ... --write` appended exactly one
  additional `geckoterminal.token_snapshot` Metric, `id=1245`, at
  `observedAt=2026-05-08T23:53:30.002Z` with `volume24h=0` and
  `priceUsdPresent=true`, `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. This moved `metricsCount` from 1 to 2 and set
  latestMetric / `recentMetrics` to `1245 -> 1244`. Token fields stayed
  `partial / Papu / PAPU / C / 0 / hardRejected=false`, the enrich/rescore
  timestamps stayed unchanged, and Telegram, detect, watch, enrich/rescore,
  ops, systemd, and checkpoint updates were not invoked during the Metric
  step. `metrics:report -- --mint ... --limit 2` and `token:compare`
  confirmed `1245 -> 1244` rawJson-free.
- a later same-mint manual one-shot loop for
  `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump` confirmed the direct
  detector / enrich-rescore / metric snapshot path without ops notification:
  `detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write` created the
  mint-only Token, `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it to `partial` with name/symbol/context/reviewFlags saved and score
  `C` / `0`, and `metric:snapshot:geckoterminal -- --mint ... --write`
  appended one `geckoterminal.token_snapshot` Metric with `metricId=1117`.
- a later watch-detected pump mint loop for
  `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump` confirmed the same downstream
  path from the pump-only detect watch gate:
  `detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`
  created one `mint_only` Token with the default checkpoint unused and only the
  `/tmp` checkpoint updated; `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it to `partial` with `name/symbol=Jennie/Jennie`, score `C` / `0`, and
  `hardRejected=false`; and
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric with `metricId=1122`,
  `observedAt=2026-04-29T14:54:49.239Z`, and saved volume24h / price / fdv /
  reserve / topPool presence. This moved `metricsCount` from 0 to 1 without
  token field updates or Telegram send. It confirms the watch-detected
  first-observation loop only.
- the watch-detected mint's first Metric was then confirmed through existing
  rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 1` showed
  Metric `id=1122`, `observedAt=2026-04-29T14:54:49.239Z`, `volume24h`, and
  true `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent`; `token:compare -- --mint ...` showed latestMetric
  `id=1122`, one `recentMetrics` item, and true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=1`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms report visibility for
  the watch-detected first observation without exposing Metric rawJson.
- the watch-detected mint then confirmed a second single-mint Metric append
  through the same `metric:snapshot:geckoterminal -- --mint ... --write`
  command: `metricsCount` moved from 1 to 2, latestMetric became
  `metricId=1123` with `observedAt=2026-04-29T15:09:40.608Z`, and the previous
  Metric remained `metricId=1122` with
  `observedAt=2026-04-29T14:54:49.239Z`. This check was about time-series
  append behavior for the watch-detected mint, not price evaluation. Token
  fields stayed `partial`, `Jennie` / `Jennie`, score `C` / `0`, and
  `hardRejected=false`; Telegram was not sent.
- the watch-detected mint's two-Metric history was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 2`
  showed Metric ids `1123 -> 1122`, both `observedAt` values, and true
  `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent` for both rows; `token:compare -- --mint ...` showed
  latestMetric `id=1123` plus `recentMetrics` containing `1123` and `1122`,
  each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=2`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms the watch-detected path
  through detection, enrichment, observation, time-series append, and
  rawJson-free report visibility.
- a second pump-only detect watch write with the same bounded `/tmp` checkpoint
  later created mint-only Token
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` and advanced the checkpoint to
  `2026-04-29T15:23:33.000Z |
  3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8`. That mint then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` from `mint_only`
  to `partial` with `name/symbol=wtf/WTF`, score `C` / `0`,
  `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended its first
  `geckoterminal.token_snapshot` Metric with `metricId=1124`,
  `observedAt=2026-04-29T15:41:56.989Z`, and saved volume24h / price / fdv /
  reserve / topPool presence. This moved `metricsCount` from 0 to 1 without
  token field updates or Telegram send. It confirms the second watch-detected
  mint's first-observation loop only.
- the second watch-detected mint's first Metric was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 1`
  showed Metric `id=1124`, `observedAt=2026-04-29T15:41:56.989Z`,
  `volume24h`, and true `priceUsdPresent` / `fdvUsdPresent` /
  `reserveUsdPresent` / `topPoolPresent`; `token:compare -- --mint ...` showed
  latestMetric `id=1124`, one `recentMetrics` item, and true `safeSummary`
  booleans; and `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=1`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms first-observation report
  visibility for the second watch-detected mint without exposing Metric rawJson.
- the second watch-detected mint then confirmed a second single-mint Metric
  append through the same
  `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1125` with
  `observedAt=2026-04-29T15:55:14.973Z`, and the previous Metric remained
  `metricId=1124` with `observedAt=2026-04-29T15:41:56.989Z`. Token fields
  stayed `partial`, `wtf` / `WTF`, score `C` / `0`, and `hardRejected=false`;
  Telegram was not sent. This check was about time-series append behavior for
  the second watch-detected mint, not price evaluation.
- the second watch-detected mint's two-Metric history was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 2`
  showed Metric ids `1125 -> 1124`, both `observedAt` values, and true
  `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent` for both rows; `token:compare -- --mint ...` showed
  latestMetric `id=1125` plus `recentMetrics` containing `1125` and `1124`,
  each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=2`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms that the second
  watch-detected mint also reached detection, enrichment, observation,
  time-series append, and rawJson-free report visibility.
- a third pump-only detect watch write, run as a bounded operation MVP
  rehearsal with the same `/tmp` checkpoint and `--maxIterations 1`, created
  mint-only Token `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump`, advanced the
  checkpoint to `2026-04-29T16:11:48.000Z |
  H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK`, and kept the default
  checkpoint unused. That mint then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` from `mint_only`
  to `partial` with `name/symbol=The People's House/PH`, score `C` / `0`,
  `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended its first
  `geckoterminal.token_snapshot` Metric with `metricId=1126`,
  `observedAt=2026-04-29T16:27:01.275Z`, and saved volume24h / price / fdv /
  reserve / topPool presence. This moved `metricsCount` from 0 to 1 without
  token field updates or Telegram send. It confirms the third watch-detected
  mint's first-observation loop.
- the third watch-detected mint's first Metric was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 1`
  showed Metric `id=1126`, `observedAt=2026-04-29T16:27:01.275Z`,
  `volume24h`, and true `priceUsdPresent` / `fdvUsdPresent` /
  `reserveUsdPresent` / `topPoolPresent`; `token:compare -- --mint ...` showed
  latestMetric `id=1126`, one `recentMetrics` item, and true `safeSummary`
  booleans; and `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=1`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms first-observation report
  visibility for the third watch-detected mint without exposing Metric rawJson.
  Time-series append was not part of this report check.
- the third watch-detected mint then confirmed a second single-mint Metric
  append through the same
  `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1127` with
  `observedAt=2026-04-29T16:42:56.330Z`, and the previous Metric remained
  `metricId=1126` with `observedAt=2026-04-29T16:27:01.275Z`. Token fields
  stayed `partial`, `The People's House` / `PH`, score `C` / `0`, and
  `hardRejected=false`; Telegram was not sent. This check was about
  time-series append behavior for the third watch-detected mint, not price
  evaluation.
- the third watch-detected mint's two-Metric history was then confirmed through
  existing rawJson-free read-only CLI: `metrics:report -- --mint ... --limit 2`
  showed Metric ids `1127 -> 1126`, both `observedAt` values, and true
  `priceUsdPresent` / `fdvUsdPresent` / `reserveUsdPresent` /
  `topPoolPresent` for both rows; `token:compare -- --mint ...` showed
  latestMetric `id=1127` plus `recentMetrics` containing `1127` and `1126`,
  each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  included the mint with `metricsCount=2`, latestMetric source / observedAt,
  and latestMetric safe summary columns. This confirms that the third
  watch-detected mint also reached detection, enrichment, observation,
  time-series append, and rawJson-free report visibility.
- the earlier one-shot mint `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump`
  then confirmed a second single-mint Metric append through the same
  `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1118` with
  `observedAt=2026-04-29T10:50:02.424Z`, and the previous Metric remained at
  `observedAt=2026-04-29T10:35:31.337Z`. This check was about append/time-series
  behavior, not price evaluation.
- the same mint then confirmed a bounded single-mint watch write through
  `metric:snapshot:geckoterminal -- --mint ... --write --watch --maxIterations 1 --minGapMinutes 10`:
  watch mode ran exactly one cycle, selected one token, appended one Metric,
  moved `metricsCount` from 2 to 3, and updated latestMetric to `metricId=1119`
  with `observedAt=2026-04-29T11:45:26.494Z`. This was not long-running
  operation; it only confirmed that one-cycle watch write can terminate safely.
- the metric snapshot lane then confirmed bounded batch watch write through
  `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 1 --minGapMinutes 10`:
  `recent_batch` mode ran exactly one cycle, selected one eligible pump token,
  appended one Metric, moved the same mint's `metricsCount` from 3 to 4, and
  updated latestMetric to `metricId=1120` with
  `observedAt=2026-04-29T12:05:54.348Z`. This was not a two-token simultaneous
  write confirmation; it only confirmed that bounded batch watch can terminate
  safely when the current eligible set contains one token.
- a later foreground bounded watch check used
  `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60`:
  the process naturally exited after two cycles, both cycles selected the same
  eligible pump token, and both cycles skipped before fetch as
  `skipped_recent_metric`. This confirmed the `minGapMinutes` repeat-append gate
  and natural foreground exit, not a foreground append; `writtenCount` stayed 0,
  `metricsCount` stayed 4, and latestMetric stayed `metricId=1120`.
- a later tmux bounded watch check used the same bounded command shape inside
  session `lowcap-gecko-metric-bounded`, redirecting output to
  `/tmp/lowcap-gecko-metric-bounded.log`: the tmux session started, naturally
  exited after `maxIterations=2`, appended Metric `metricId=1121` at
  `observedAt=2026-04-29T12:26:25.717Z` in cycle 1, then skipped cycle 2 as
  `skipped_recent_metric`. This confirmed that tmux can run the bounded gate and
  that `minGapMinutes` still suppresses immediate repeat appends; `metricsCount`
  moved from 4 to 5. This was not always-on operation and did not touch systemd.
- a later rerun of that same tmux bounded command confirmed the no-candidate /
  no-write case: it naturally exited after two cycles with `selectedCount=0`,
  `writtenCount=0`, `failedCount=0`, and `rateLimited=false`, leaving
  `metricsCount=5` and latestMetric `metricId=1121` unchanged. This was an
  operation-boundary check, not an additional observation.
- the post-tmux read-only report check confirmed the same mint at
  `metricsCount=5` with latestMetric `metricId=1121`; `metrics:report -- --mint ... --limit 5`
  showed the Metric id order `1121 -> 1120 -> 1119 -> 1118 -> 1117`, and both
  `metrics:report` plus `tokens:compare-report` showed rawJson-free safe
  summary booleans for saved price / fdv / reserve / topPool presence.
- the resulting Metric time series was then confirmed through existing
  read-only CLI: `metrics:report -- --mint ... --limit 2` and
  `token:compare -- --mint ...` show both `observedAt` values, `token:show`
  shows the latestMetric, and `tokens:compare-report` shows cohort-level
  latestMetric summaries for filtered Gecko-origin rows.
- a later foreground bounded detect watch wrapper run created two additional
  Gecko-origin pump mints,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` and
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, with the wrapper pinned by
  env to `/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json` and
  `--pumpOnly --limit 1 --maxIterations 2`.
- the first foreground-created mint,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump`, then confirmed the minimum
  observation path through first Metric append: `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it from `mint_only` to `partial` with
  `name/symbol=Something Dumb/DUMB`, score `C` / `0`, `hardRejected=false`,
  and reviewFlags present; `metric:snapshot:geckoterminal -- --mint ... --write`
  appended Metric `id=1128` at `observedAt=2026-04-30T13:50:42.230Z`,
  moving `metricsCount` from 0 to 1 and setting latestMetric source to
  `geckoterminal.token_snapshot`. The Metric append preserved Token fields and
  did not send Telegram. Volume24h, price, fdv, reserve, and topPool were
  present in the saved Metric snapshot, though token-level `volume24h` was 0.
  That first Metric has now also passed rawJson-free report confirmation:
  `metrics:report -- --mint ... --limit 1` shows Metric `id=1128`,
  `observedAt=2026-04-30T13:50:42.230Z`, `volume24h=0`, and all four
  market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1128`, one `recentMetrics` item, and all four
  `safeSummary` booleans true; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=1`, latestMetric
  observedAt, and latestMetric safe summary columns. Metric rawJson was not
  exposed by the report / compare views. A second single-mint Metric snapshot
  write then confirmed time-series append behavior: Metric `id=1129` was
  appended at `observedAt=2026-04-30T14:23:38.900Z`, moving `metricsCount`
  from 1 to 2 while previousMetric remained `id=1128` at
  `observedAt=2026-04-30T13:50:42.230Z`. The two observations have distinct
  timestamps. Token fields were preserved, Telegram was not sent,
  `volume24h=0` persisted, and price / fdv / reserve / topPool were present.
  The two-Metric history has now also passed rawJson-free report confirmation:
  `metrics:report -- --mint ... --limit 2` shows Metric ids `1129 -> 1128`,
  both `observedAt` values, `volume24h=0` on both rows, and all four
  market-data presence columns true on both rows; `token:compare -- --mint ...`
  shows latestMetric `id=1129` and `recentMetrics` containing `1129` plus
  `1128`, each with true `safeSummary` booleans; and
  `tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 10`
  includes the mint in the cohort with `metricsCount=2`, latestMetric
  observedAt, and latestMetric safe summary columns. Metric rawJson was not
  exposed by the report / compare views. This confirms the foreground-created
  mint through detection, enrichment, first observation, time-series append, and
  rawJson-free report visibility.
- the second foreground-created mint,
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, then confirmed its minimum
  observation path through first Metric append:
  `token:enrich-rescore:geckoterminal -- --mint ... --write` moved it from
  `mint_only` to `partial` with `name/symbol=Ghostpool/GHOST`, score
  `C` / `0`, `hardRejected=false`, and reviewFlags present; and
  `metric:snapshot:geckoterminal -- --mint ... --write` appended Metric
  `id=1130` at `observedAt=2026-04-30T16:51:54.070Z`, moving `metricsCount`
  from 0 to 1 and setting latestMetric source to
  `geckoterminal.token_snapshot`. The Metric append preserved Token fields and
  did not send Telegram. `volume24h=null`, while price / fdv / reserve / topPool
  presence were true. That first Metric has now also passed rawJson-free report
  confirmation: `metrics:report -- --mint ... --limit 1` shows Metric
  `id=1130`, `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all
  four market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1130`, one `recentMetrics` item, and all four `safeSummary`
  booleans true; and `tokens:compare-report` includes the mint with
  `metricsCount=1`, latestMetric observedAt, and latestMetric safe summary
  columns. Metric rawJson was not exposed by the report / compare views. A
  second single-mint Metric snapshot write later appended Metric
  `id=1131` at `observedAt=2026-04-30T23:55:54.844Z`, moved `metricsCount`
  from 1 to 2, and left previousMetric as `id=1130` at
  `observedAt=2026-04-30T16:51:54.070Z`, confirming time-series append shape
  for this foreground-created mint. This is a loop-shape confirmation rather
  than a price-quality judgment. Token fields were preserved, Telegram was not
  sent, `volume24h=null`, and price / fdv / reserve / topPool presence were
  true. Two-Metric rawJson-free report confirmation has now also passed:
  `metrics:report -- --mint ... --limit 2` shows Metric ids `1131 -> 1130`,
  latest `observedAt=2026-04-30T23:55:54.844Z`, previous
  `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all four
  market-data presence columns true; `token:compare -- --mint ...` shows
  latestMetric `id=1131` and `recentMetrics` containing `1131` plus `1130`;
  and `tokens:compare-report` includes the mint with `metricsCount=2` and
  latestMetric safe summary columns. Metric rawJson was not exposed by the
  report / compare views.
- the first tmux bounded detect-created mint,
  `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, has now completed the
  two-Metric observation step. The detect wrapper ran in tmux with `/tmp` checkpoint
  isolation, `--pumpOnly`, `--limit 1`, and `--maxIterations 1`, selected one
  candidate, imported one mint-only Token, and did not use the default
  checkpoint. Enrich/rescore then moved the mint to `partial` as
  `WHO GRANTS WISHES` / `WHO??` with score `C` / `0` and
  `hardRejected=false`. Its `contextWriteCount=1` was the Token
  `entrySnapshot.contextCapture.geckoterminalTokenSnapshot` update, not a
  Metric write or Telegram send. A single-mint Metric snapshot then appended
  Metric `id=1132` at `observedAt=2026-05-01T07:53:31.204Z`, moved
  `metricsCount` from 0 to 1, and set latestMetric source to
  `geckoterminal.token_snapshot`; `volume24h=20333.5730222922`, and price /
  fdv / reserve / topPool presence were true. `metrics:report` and
  `token:compare` confirmed that one saved Metric rawJson-free. A second
  single-mint Metric snapshot then appended Metric `id=1133` at
  `observedAt=2026-05-01T08:08:12.847Z`, moved `metricsCount` from 1 to 2, and
  left previousMetric as `id=1132` at
  `observedAt=2026-05-01T07:53:31.204Z`, confirming a time-series append about
  14 minutes 41 seconds later. The latest row has
  `volume24h=20335.4710939884`, and price / fdv / reserve / topPool presence
  were true. `metrics:report -- --mint ... --limit 2` and `token:compare`
  confirmed Metric ids `1133 -> 1132`, latestMetric `id=1133`, and
  `recentMetrics` containing `1133` plus `1132` rawJson-free.
- the second tmux bounded detect-created mint,
  `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, has now completed the
  two-Metric observation step. The detect wrapper ran in tmux with `/tmp` checkpoint isolation,
  `--pumpOnly`, `--limit 1`, and `--maxIterations 1`, selected one candidate,
  imported one mint-only Token, reported `failedCount=0` and
  `skippedNonPumpCount=2`, and did not use the default checkpoint. Enrich/rescore
  then moved the mint to `partial` as `WarlockCoin` / `Warlock` with score
  `C` / `0`, `hardRejected=false`, all reviewFlags false, and `linkCount=0`.
  Its `contextWriteCount=1` was the Token
  `entrySnapshot.contextCapture.geckoterminalTokenSnapshot` update, not a
  Metric write or Telegram send. A single-mint Metric snapshot then appended
  Metric `id=1134` at `observedAt=2026-05-01T09:30:04.949Z`, moved
  `metricsCount` from 0 to 1, and set latestMetric source to
  `geckoterminal.token_snapshot`; `volume24h=395.7346968031`, and price / fdv /
  reserve / topPool presence were true. `metrics:report -- --mint ... --limit
  1` and `token:compare` confirmed latestMetric `id=1134` plus one
  `recentMetrics` item rawJson-free. A second single-mint Metric snapshot then
  appended Metric `id=1135` at `observedAt=2026-05-01T09:46:34.724Z`, moved
  `metricsCount` from 1 to 2, and left previousMetric as `id=1134` at
  `observedAt=2026-05-01T09:30:04.949Z`, confirming a time-series append about
  16 minutes 29.775 seconds later. The latest row has
  `volume24h=395.7346968031`, and price / fdv / reserve / topPool presence
  were true. `metrics:report -- --mint ... --limit 2` and `token:compare`
  confirmed Metric ids `1135 -> 1134`, latestMetric `id=1135`, and
  `recentMetrics` containing `1135` plus `1134` rawJson-free.
- `token:compare` Metric views were later made rawJson-free and now include
  `safeSummary` booleans, so latestMetric and `recentMetrics` can be used in
  operator reports without exposing Metric rawJson.
- after adding rawJson-free safe summary columns, a later read-only cohort check
  confirmed that `metrics:report -- --limit 10` can show multiple token /
  multiple Metric rows with `priceUsdPresent`, `fdvUsdPresent`,
  `reserveUsdPresent`, and `topPoolPresent`, and that `tokens:compare-report`
  can show the target mint in a filtered Gecko-origin cohort with `metricsCount`
  and latestMetric source / observedAt.

Earlier ops-path Metric append failures are accounted for: the child-process
`cli_error` / `parse_error` path was traced to `tsx` startup and stdout capture
behavior and fixed in the production runner, while a later `fetch failed` result
was isolated to environment-level DNS / network reachability rather than the
target mint or runner output parsing.

This confirms the minimum Token to Metric loop, capture-only ops notification
records, one `metric_appended` production Telegram ops live send, all three
watch-detected mints' downstream enrich/rescore, two Metric appends, and
rawJson-free report confirmation, bounded single-mint and batch Metric snapshot
watch writes, foreground bounded watch natural exit with `minGapMinutes` skip,
tmux bounded watch with one Metric append plus one `skipped_recent_metric`, and
read-only report/compare visibility for a same-mint Metric time series plus
multi-token Metric-row cohort reporting.
For the three watch-detected mints, the important proof is loop shape rather
than price quality: detect, enrich/rescore, first observation, second
observation, and rawJson-free confirmation all work as separate
operator-visible steps.
The first foreground-created mint is now part of the confirmed Token to Metric
loop through first observation, first-Metric rawJson-free report confirmation,
second Metric append, and two-Metric rawJson-free report confirmation. The
second foreground-created mint has now entered the Metric path through
enrich/rescore plus first Metric append, and its first Metric `id=1130` is now
visible rawJson-free through `metrics:report`, `token:compare`, and
`tokens:compare-report`. It has also confirmed time-series append with Metric
`id=1130 -> 1131` and `metricsCount` `1 -> 2`, then confirmed the two-Metric
history rawJson-free through `metrics:report`, `token:compare`, and
`tokens:compare-report`.
The first tmux-created mint has now entered the loop through bounded tmux
detect, enrich/rescore, two Metric appends, and rawJson-free two-Metric report
confirmation for Metric ids `1133 -> 1132`.
The second tmux-created mint has also completed the same loop through bounded
tmux detect, enrich/rescore, two Metric appends, and rawJson-free two-Metric
report confirmation for Metric ids `1135 -> 1134`. Together these two
tmux-created mints make the human-triggered bounded operation MVP complete for
the single-candidate operator-approved Token-to-Metric scope.
It does not confirm scheduler, systemd, `token_completed` live send,
`loop_complete` live send, foreground append, two-or-more-token simultaneous
Metric write, long-running or restart-oriented watch operation, or numeric value
formatting for latestMetric safe summary fields.

## Purpose

Use this flow when a single GeckoTerminal-origin pump mint should move from mint-only intake to one current `Metric` observation with explicit operator checkpoints.

For restart or interruption recovery in the Metric stage, DB state is the first
confirmation target. Use `metrics:report`, `token:compare`, and `token:show`
before considering any rerun. Latest Metric and `metricsCount` confirm the
Metric stage only; they are not detect-checkpoint substitutes.

Metric duplicate policy is docs-fixed but not enforcement-fixed: repeated
same-mint snapshots with different `observedAt` values are time-series
observations, while a strict duplicate candidate is same `tokenId`, same source,
and same `observedAt`. The current schema does not enforce that strict
candidate as unique, so use `metricsCount`, latest Metric, `recentMetrics`,
`--minGapMinutes` where supported, and post-confirmation before any rerun.

For Metric retry / failure handling, ambiguous write results do not permit an
immediate rerun. If CLI output, tmux output, or network/write outcome is
unclear, confirm DB state with `metrics:report`, `token:compare`, and
`token:show` first. `errorCount > 0`, `writtenCount > 1`, latest Metric
mismatch, or `metricsCount` mismatch returns to human gate; retry automation is
not part of this loop.

For cooldown / retry max count, Metric Red retry max is automatic `0`.
Cooldown is only a timing hint for re-check / human gate, not permission to
rerun `metric:snapshot:geckoterminal --write`. Same-observedAt strict duplicate
risk stops until DB read confirmation and a new human-approved Red gate.

## Preconditions

- The repo is clean and on the expected branch.
- The operator has explicit permission for each write step.
- Network/DNS access works before live GeckoTerminal fetches.
- No write step is run as part of a broad batch unless the current prompt explicitly allows it.
- Telegram send is not part of the base loop unless a current Red execution
  prompt explicitly requests `--opsNotify`.

Start every session with:

```bash
pwd
git status --short --branch
git log --oneline -5
```

## Environment Checks

Before any GeckoTerminal live fetch, confirm DNS and HTTPS from the same shell environment:

```bash
getent hosts example.com
getent hosts api.geckoterminal.com
curl -I -L --max-time 10 https://example.com
curl -I -L --max-time 10 https://api.geckoterminal.com
```

The GeckoTerminal top path may return HTTP 404. That is acceptable for reachability; DNS resolution and a real HTTP status are the important checks.

Do not run the metric snapshot dry-run when DNS fails with `EAI_AGAIN`, `ECONNREFUSED`, or host resolve errors.

## Full Flow

### Step 1: Detector Dry-Run

```bash
pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1
```

Pass conditions:

- output is dry-run
- selected count is 1
- selected mint ends with `pump`
- source is `geckoterminal.new_pools`
- no DB write has been requested

Stop when:

- no pump candidate is selected
- the candidate is not GeckoTerminal-origin
- the output shape is unexpected
- network is failing

### Step 2: Detector Write

Red step. Run only with explicit permission for one detector write.

```bash
pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write
```

Pass conditions:

- exactly one accepted mint is handed to the mint-first boundary
- the created or existing token has source `geckoterminal.new_pools`
- `entrySnapshot.firstSeenSourceSnapshot` is preserved when source data exposes it

Stop when:

- more than one write is planned
- `--pumpOnly --limit 1` is not in effect
- the mint does not end with `pump`
- the command reports rate limiting or an unexpected source shape

### Step 3: Token Read-Only Check

```bash
pnpm -s token:show -- --mint <MINT>
```

Expected initial shape:

- `metadataStatus` is usually `mint_only`
- `metricsCount` is 0
- `latestMetric` is null

### Step 4: Token Catch-Up Dry-Run

```bash
pnpm -s ops:catchup:gecko -- --pumpOnly --limit 1 --maxCycles 1
```

Pass conditions before token write:

- `readOnly` is true
- `writeEnabled` is false
- `plannedTokenWrites` is 1
- `plannedMetricAppends` is 1 for a metric-missing incomplete token
- blocking safety checks are empty
- warning safety checks are empty
- write command plan is for `token:enrich-rescore:geckoterminal`
- write command plan has `notify=false`, `metricAppend=false`, and `postCheck=true`

Stop when:

- any blocking safety check appears
- any warning safety check appears
- selected count is not 1
- selected candidate is hard rejected
- selected candidate already has metrics when the goal is the initial token write
- a notify candidate appears and stop-on-notify is enabled

### Step 5: Token-Only Ops Write

Red step. Run only with explicit permission for one gated token-only ops write.

```bash
pnpm -s ops:catchup:gecko -- --write --pumpOnly --limit 1 --maxCycles 1
```

This path runs the token write runner only. It must not append metrics and must not notify.
When capture-only ops notification preview records are explicitly being checked,
add the capture file option:

```bash
pnpm -s ops:catchup:gecko -- --write --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080 --opsNotifyCaptureFile /tmp/lowcap-ops-notify-capture.jsonl
```

Pass conditions:

- one token write execution result is reported
- `postCheckResult.checked` is true
- token is found
- token is no longer pending
- name and symbol are present
- `metadataStatus` moved beyond `mint_only`, usually to `partial`, `enriched`, or another non-pending status
- if `metricsCount` is still 0, `metric_missing_after_token_only_write` may appear as the expected warning
- `metricOnlyAppendCandidates` contains the mint when token completion succeeded but metrics are still missing

Stop when:

- runner status is `cli_error` or `parse_error` and DB state did not complete the token
- `tokenWriteRetryCandidates` contains the mint
- `runnerDbMismatchCandidates` contains the mint
- token remains pending
- capture-only was requested but no `token_completed` record appears after an otherwise successful token completion

### Step 6: Post Token Write Read-Only Check

```bash
pnpm -s token:show -- --mint <MINT>
```

Pass conditions:

- name is present
- symbol is present
- `metadataStatus` is not `mint_only`
- `metricsCount` is 0 before metric append
- `latestMetric` is null before metric append

### Step 7: Metric Snapshot Dry-Run

Run this only after the environment checks pass.

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT>
```

Pass conditions:

- `mode` is `single`
- `dryRun` is true
- `writeEnabled` is false
- `selectedCount` is 1
- item status is `ok`
- `wouldCreateMetric` is true
- `metricId` is null
- `writtenCount` is 0
- `metricCandidate.source` is `geckoterminal.token_snapshot`
- `metricCandidate.safeSummary.priceUsdPresent` is visible
- `metricCandidate.safeSummary.fdvUsdPresent` is visible
- `metricCandidate.safeSummary.reserveUsdPresent` is visible
- `metricCandidate.safeSummary.topPoolPresent` is visible
- `metricCandidate.volume24h` is visible as a number or null
- no `metricCandidate.rawJson` field, raw payload body, or rawJson byte count is
  printed in user-facing output; DB storage of Metric rawJson remains unchanged

Stop when:

- item status is `error`
- error is DNS or network related
- `wouldCreateMetric` is false
- selected count is not 1
- safe summary fields are missing from the dry-run output
- a rawJson field or raw payload body appears in user-facing output

### Step 8: Metric Append Write

There are two confirmed one-metric append paths.

Manual path:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write
```

Ops path:

```bash
pnpm -s ops:catchup:gecko -- --write --metricAppend --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080
```

Use the manual path when directly confirming the metric snapshot CLI for one known mint.
Use the ops path when confirming the production catch-up supervisor can delegate exactly one
Metric append through the injected runner.
When capture-only ops notification preview records are explicitly being checked,
the ops path may include:

```bash
--opsNotifyCaptureFile /tmp/lowcap-ops-notify-capture.jsonl
```

#### Manual Path

Red step. Run only with explicit permission for one Metric append write.

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write
```

Pass conditions:

- `mode` is `single`
- `writeEnabled` is true
- item status is `ok`
- `writtenCount` is 1
- `writeSummary.metricId` is not null
- exactly one `Metric` row is created
- token fields are not mutated by the metric append

Stop when:

- more than one item is selected
- more than one metric is written
- token address in snapshot does not match the mint
- GeckoTerminal returns a rate limit or network failure

#### Ops Path

Red step. Run only with explicit permission for one ops Metric append write.

```bash
pnpm -s ops:catchup:gecko -- --write --metricAppend --pumpOnly --limit 1 --maxCycles 1 --sinceMinutes 10080
```

Preconditions:

- target token is already complete
- `metricsCount` is 0
- `latestMetric` is null
- ops `--metricAppend` dry-run reports `plannedTokenWrites=0`
- ops `--metricAppend` dry-run reports `plannedMetricAppends=1`
- `metricAppendCommandPlan` length is 1
- safety checks have no fail or warn entries

Pass conditions:

- `metricAppendExecutionResults` length is 1
- metric append runner status is `ok`
- selected count is 1
- `writtenCount` is 1
- `writeSummary.metricId` is not null
- `tokenWriteExecutionResults` length is 0
- `token:show` reports `metricsCount=1` or greater
- `token:show` reports latest metric source `geckoterminal.token_snapshot`
- if capture-only was requested, JSONL includes `metric_appended` and
  `loop_complete` records with `delivery=capture_only`
- final ops dry-run reports `no_pending`
- final ops dry-run reports `nextRecommendedAction=no_action`

Stop when:

- the token write plan is not empty
- `metricAppendCommandPlan` length is not 1
- any safety check is fail or warn
- more than one metric append execution result is reported
- `writtenCount` is not exactly 1
- `writeSummary.metricId` is missing
- `tokenWriteExecutionResults` is not empty
- post-check warnings, retry candidates, or runner DB mismatch candidates appear
- capture-only was requested but the capture records include secret/env/raw
  stdout/raw stderr/full-args style fields

Do not:

- run token write and Metric append in the same execution
- run ops Metric append without `--metricAppend`
- increase `--limit` above 1
- increase `--maxCycles` above 1
- move from this confirmation into Telegram, scheduler, watch, or systemd setup
- treat capture-only as Telegram live send readiness by itself

### Step 9: Final Read-Only Checks

```bash
pnpm -s token:show -- --mint <MINT>
pnpm -s ops:catchup:gecko -- --pumpOnly --limit 1 --maxCycles 1
```

If a metric id was returned:

```bash
pnpm -s metric:show -- --id <METRIC_ID>
```

Final pass conditions:

- `metricsCount` is 1 or greater for the mint
- `latestMetric` is present
- capture-only records, when requested, contain only safe preview fields and
  include the expected trigger names for the completed step
- `summary.status` is `no_pending`
- `plannedTokenWrites` is 0
- `plannedMetricAppends` is 0
- `blockingSafetyChecks` is empty
- `warningSafetyChecks` is empty
- `nextRecommendedAction` is `no_action`
- `metricOnlyAppendCandidates` is empty
- `tokenWriteRetryCandidates` is empty
- `runnerDbMismatchCandidates` is empty

### Step 10: Read-Only Metric History Checks

After a second same-mint Metric append, use read-only views to confirm the
history and cohort visibility before moving toward watch or systemd:

```bash
pnpm -s metrics:report -- --mint <MINT> --limit 2
pnpm -s metrics:report -- --mint <MINT> --limit 5
pnpm -s metrics:report -- --limit 10
pnpm -s token:compare -- --mint <MINT>
pnpm -s token:show -- --mint <MINT>
pnpm -s tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot --limit 5
```

Pass conditions:

- `metrics:report -- --mint <MINT> --limit 2` returns the two latest rows for
  that mint, shows two distinct `observedAt` values, and exposes rawJson-free
  safe summary columns for market-data presence.
- After the bounded tmux confirmation, `metrics:report -- --mint <MINT> --limit 5`
  confirmed the five-row Metric history with ids
  `1121 -> 1120 -> 1119 -> 1118 -> 1117`.
- `metrics:report -- --limit <N>` can show multiple token / multiple Metric
  rows with the same safe summary columns.
- `token:compare -- --mint <MINT>` shows single-token details plus
  `metricsCount`, latestMetric, and `recentMetrics`; Metric views omit rawJson
  and include `safeSummary` booleans for price / fdv / reserve / topPool
  presence.
- `token:show -- --mint <MINT>` is useful for confirming the latestMetric only;
  it is not the best view for the full two-row history.
- `tokens:compare-report` is useful for cohort and latestMetric summaries; it is
  not the best direct view for two-row same-mint history, but it does expose
  latestMetric safe summary columns. The post-tmux check used `minMetricsCount=5`
  to confirm the target mint in the Gecko-origin cohort with `metricsCount=5`
  and latestMetric `id=1121`.
- Together, `metrics:report`, `token:compare`, and `tokens:compare-report`
  cover Metric row history, single-token history/details, and cohort/latestMetric
  summaries without printing Metric rawJson.

Known gap:

- To inspect Metric row history after filtering by Token source or
  `metadataStatus`, operators currently need to combine `tokens:compare-report`
  for cohort selection with `metrics:report` for Metric rows.
- Safe summary fields are presence booleans only; numeric formatting remains a
  separate future improvement.

## Dry-Run Versus Write

Dry-run commands may perform live fetches, but they must not create or update database rows.

Write commands mutate data and require explicit current-turn permission:

- `detect:geckoterminal:new-pools --write` creates or reuses one mint-only token through the mint-first boundary
- `ops:catchup:gecko --write` performs one gated token-only write through `token:enrich-rescore:geckoterminal`
- `metric:snapshot:geckoterminal --write` appends one `Metric` row for a successful snapshot
- `ops:catchup:gecko --write --metricAppend` delegates exactly one Metric append through the production runner only when the gated one-token, one-cycle Metric-only plan is eligible
- `ops:catchup:gecko --opsNotifyCaptureFile <PATH>` appends ops notification preview records to a local JSONL file only; live Telegram send happens only when `--opsNotify` is also explicitly requested and the selected trigger passes the send gate

Do not combine these write steps into one hidden automation path.

Do not run a Red Telegram live-send execution when the read-only preflight has
no eligible candidate. Do not create a write target only to confirm a live send.
When a future eligible candidate appears, first run the read-only preflight,
then choose exactly one command, get explicit Red permission, and only then run
that command once. The current policy keeps production live send limited to
`--opsNotifyTrigger metric_appended`; `token_completed` and `loop_complete`
remain capture-only.

## Phase Update Criteria

Update the phase progress only when the relevant write and read-only confirmation both completed.

Use these markers:

- Detector write complete: one pump mint was accepted and a mint-only token exists.
- Token-only ops write complete: post-check confirms token found, not pending, name and symbol present.
- Metric append complete: exactly one Metric row was appended and `token:show` reports a latest metric.
- Loop complete: final `ops:catchup:gecko` dry-run reports `no_pending` and `no_action`.
- Capture-only ops notification complete: JSONL contains the expected
  `token_completed`, `metric_appended`, and `loop_complete` records with
  `delivery=capture_only` and no secret/env/raw-output/full-args leakage.
- Metric-appended Telegram ops live send complete: a bounded
  `ops:catchup:gecko --write --metricAppend` execution reports `sentCount=1`,
  `status=sent`, the selected trigger is `metric_appended`, exactly one Metric
  row was appended, and capture-only JSONL records were written without
  secret/env/raw-output/full-args leakage.
- Telegram live loop policy fixed: `metric_appended` is the only initial live
  candidate, duplicate key is `mint + eventType + metricId`, and live send
  still requires DB read confirmation, capture-only rehearsal, marker checks,
  and human gate.
- Queue pre-gate policy fixed: the `metric_appended` notification key remains
  `mint + eventType + metricId`, only events with `metricId` are initial live
  candidates, and `token_completed` / `loop_complete` remain capture-only.
  Durable dedupe storage and queue idempotency are still not implemented.
- Capture-only rehearsal consistency policy fixed: `metric_appended` is still
  the only initial live candidate, but live send still requires capture-only
  pass, DB read confirmation, marker checks, and human gate. Capture-only pass
  requires the expected trigger / event type / mint, a `metricId`, computable
  duplicate key, safe message preview, and no rawJson / raw payload / secret
  marker. Capture-only pass alone does not complete durable dedupe, and
  `token_completed` / `loop_complete` remain capture-only.
- Durable notification dedupe storage policy fixed: the initial
  `metric_appended` notification key is `mint + eventType + metricId`, and
  only events with `metricId` are initial live candidates. `token_completed` /
  `loop_complete` remain capture-only. Formal migration, DB table creation /
  write, durable storage, queue idempotency, failed-send retry, and Telegram
  live-loop integration are still not implemented.
- Failed-send / resend policy fixed: `failed` is not `sent`, previous `sent`
  on the same notification key blocks resend, and any `metric_appended` resend
  still requires DB confirmation, capture-only pass, marker checks, human gate,
  and separate Red approval. Automatic failed-send retry remains unimplemented.
- Notification model boundary / lifecycle policy fixed: `Notification` is now
  present in `prisma/schema.prisma`, uses `mint + eventType + metricId` for the
  initial `metric_appended` key, keeps `metricId`-bearing `metric_appended` as
  the only initial live candidate, and keeps `token_completed` /
  `loop_complete` capture-only. Formal migration, durable storage, and
  capture-only write integration remain unimplemented.
- Notification schema / migration baseline policy fixed: the first Yellow
  schema cut added the model, schema-level inspection test, and
  `/tmp/add_notification.sql` SQL preview, with Prisma validate / generate,
  TypeScript check, and schema-level verification completed. It does not include
  DB write integration, capture-only write integration, Telegram live send,
  queue, or systemd.
- Notification migration split policy fixed: `/tmp/lowcap-baseline-existing-schema.sql`
  contains only existing `Dev` / `Token` / `Metric` creation, while
  `/tmp/lowcap-add-notification-only.sql` contains only the `Notification`
  table and `Notification_notificationKey_key` unique index. Formal migration
  files are still uncreated, DB table creation / DB write is still unrun, and
  applying anything to `prisma/dev.db` is a separate Red task with explicit
  target DB, backup, rollback, and verification.

Keep the phase unchanged when:

- work was read-only only
- DNS or HTTPS failed before snapshot
- dry-run did not produce `wouldCreateMetric=true`
- Red live-send preflight returns no eligible candidate
- write was not explicitly permitted
- post-check exposes retry or mismatch candidates

## Not Automated Yet

This loop does not yet include:

- queue or worker orchestration
- scheduler or systemd setup
- always-on watch operation
- multi-token write
- multi-cycle write
- automatic Metric append after token write
- automatic retry or resume
- `token_completed` Telegram ops live-send execution
- `loop_complete` Telegram ops live-send execution
- Telegram live loop integration, durable dedupe storage, failed-send retry, or
  cooldown automation
- queue idempotency, per-item failure handling, or durable notification dedupe
  storage
- generic multi-source adapter runtime

## Next Candidate Steps

After this confirmed minimum loop, the next small operating steps are either:

- run one more explicit Token to Metric loop to confirm repeatability
- define the next docs-only runtime gate before any additional Telegram live
  send category is approved

## Notes

- Keep token completion and Metric append as separate operator-visible steps.
- Prefer single-mint commands for write confirmation.
- Do not expose raw stdout, raw stderr, env, cwd, full args, or full API responses in reports.
- Save large JSON to `/tmp` when local inspection is needed, then report only the fields required for the decision.
- If DNS fails in Codex but works in a normal WSL shell, treat the Codex sandbox network configuration as the blocker and do not rerun the metric snapshot CLI until the same shell can resolve the host.
