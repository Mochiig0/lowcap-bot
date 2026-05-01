# Gecko Bounded Operation MVP Runbook

## Purpose

This runbook defines the temporary bounded Gecko operation entrypoint.

This is not always-on monitoring. It is not systemd, a scheduler, a queue
worker, or an unbounded watch. The operator runs one bounded command at a time,
then confirms the result with rawJson-free read-only CLIs.

The goal is not fastest possible sniping. The goal is a safe low-MC candidate
investigation OS: detect one pump.fun candidate, enrich it, append bounded
Metric observations, and verify the saved state without exposing rawJson or
secrets.

## Current Proven Scope

- `detect:geckoterminal:new-pools` pump-only watch write has passed three times with
  `/tmp` checkpoint, `--pumpOnly`, `--limit 1`, `--maxIterations 1`, and
  `--write`.
- `scripts/run-geckoterminal-detect-watch.sh` has passed one foreground
  bounded detect watch run with
  `LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`,
  `LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS=60`, `--pumpOnly`,
  `--limit 1`, and `--maxIterations 2`. It naturally exited after two cycles,
  created mint-only Tokens
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` and
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, reported
  `selectedCount=2`, `importedCount=2`, and `failedCount=0`, and advanced only
  the `/tmp` checkpoint to `2026-04-29T17:55:30.000Z |
  BWruAw7CYweENaRJ7WFrqSX6VEWd6qwteL3faiB5UgRi`.
- The same detect wrapper has now passed one tmux bounded run through session
  `lowcap-gecko-detect-bounded` with output redirected to
  `/tmp/lowcap-gecko-detect-bounded.log`, the same isolated `/tmp` checkpoint,
  `--pumpOnly`, `--limit 1`, and `--maxIterations 1`. It selected one
  candidate, imported one mint-only Token
  `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, reported
  `selectedCount=1`, `importedCount=1`, and `failedCount=0`, and did not use
  the default checkpoint.
- The same detect wrapper has also passed a second tmux bounded run with the
  same `/tmp` checkpoint and bounded flags. It selected one candidate, imported
  one mint-only Token `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, reported
  `selectedCount=1`, `importedCount=1`, `failedCount=0`, and
  `skippedNonPumpCount=2`, and did not use the default checkpoint.
- The first foreground-created mint,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump`, has reached first Metric
  append plus rawJson-free report confirmation: enrich/rescore moved it from
  `mint_only` to `partial` as
  `Something Dumb` / `DUMB` with score `C` / `0`, `hardRejected=false`, and
  reviewFlags present; then single-mint Metric snapshot write appended Metric
  `id=1128` at `observedAt=2026-04-30T13:50:42.230Z`, moving
  `metricsCount` from 0 to 1. Token fields were preserved by the Metric write,
  Telegram was not sent, and `metrics:report`, `token:compare`, and
  `tokens:compare-report` now show Metric `id=1128` / `metricsCount=1` /
  latestMetric observedAt plus rawJson-free market-data presence columns. It
  has now also appended Metric `id=1129` at
  `observedAt=2026-04-30T14:23:38.900Z`, moving `metricsCount` from 1 to 2;
  previousMetric remains `id=1128` at
  `observedAt=2026-04-30T13:50:42.230Z`, so time-series append is confirmed.
  Token fields and Telegram state were unchanged by the second append, and
  two-Metric rawJson-free report confirmation has now passed: `metrics:report -- --mint ... --limit 2`
  shows Metric ids `1129 -> 1128`, both `observedAt` values, `volume24h=0` on
  both rows, and all four market-data presence columns true on both rows;
  `token:compare -- --mint ...` shows latestMetric `id=1129` and
  `recentMetrics` containing `1129` plus `1128`, each with true `safeSummary`
  booleans; `tokens:compare-report -- --source geckoterminal.new_pools
  --metadataStatus partial --hasMetrics true --minMetricsCount 2
  --latestMetricSource geckoterminal.token_snapshot --limit 10` includes the
  mint with `metricsCount=2`, latestMetric observedAt, and latestMetric safe
  summary columns. The report / compare output did not expose Metric rawJson and
  did not write to DB. The second
  foreground-created mint,
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, has now reached first Metric
  append: enrich/rescore moved it from `mint_only` to `partial` as
  `Ghostpool` / `GHOST` with score `C` / `0`, `hardRejected=false`, and
  reviewFlags present; then single-mint Metric snapshot write appended Metric
  `id=1130` at `observedAt=2026-04-30T16:51:54.070Z`, moving `metricsCount`
  from 0 to 1. Token fields were preserved by the Metric write, Telegram was
  not sent, `volume24h=null`, and price / fdv / reserve / topPool presence were
  true. RawJson-free report confirmation has now passed through
  `metrics:report`, `token:compare`, and `tokens:compare-report`: Metric
  `id=1130`, `observedAt=2026-04-30T16:51:54.070Z`, `metricsCount=1`,
  `volume24h=null`, and latestMetric safe summary columns are visible without
  Metric rawJson. A second single-mint Metric snapshot write then appended
  Metric `id=1131` at `observedAt=2026-04-30T23:55:54.844Z`, moved
  `metricsCount` from 1 to 2, and left previousMetric as `id=1130` at
  `observedAt=2026-04-30T16:51:54.070Z`, confirming distinct time-series
  observations. Token fields were preserved, Telegram was not sent,
  `volume24h=null`, and price / fdv / reserve / topPool presence were true.
  Two-Metric rawJson-free report confirmation has now passed:
  `metrics:report` showed Metric ids `1131 -> 1130`, both `observedAt` values,
  `volume24h=null`, and all four market-data presence columns true;
  `token:compare` showed latestMetric `id=1131` and `recentMetrics` containing
  `1131` plus `1130`; and `tokens:compare-report` included the mint with
  `metricsCount=2` and latestMetric safe summary columns. Metric rawJson was
  not exposed by the report / compare output.
- The first tmux-created mint,
  `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, has reached two Metric
  appends plus rawJson-free two-Metric report confirmation. Enrich/rescore moved it from
  `mint_only` to `partial` as `WHO GRANTS WISHES` / `WHO??` with score `C` /
  `0` and `hardRejected=false`. The enrich/rescore write also reported
  `contextWriteCount=1`; this was the Token
  `entrySnapshot.contextCapture.geckoterminalTokenSnapshot` context capture
  update, not a Metric write or Telegram send. Single-mint Metric snapshot
  then appended Metric `id=1132` at
  `observedAt=2026-05-01T07:53:31.204Z`, moving `metricsCount` from 0 to 1
  with source `geckoterminal.token_snapshot`, `volume24h=20333.5730222922`,
  and price / fdv / reserve / topPool presence all true. Token fields were
  preserved by the Metric write, and Telegram was not sent. A second
  single-mint Metric snapshot then appended Metric `id=1133` at
  `observedAt=2026-05-01T08:08:12.847Z`, moved `metricsCount` from 1 to 2,
  and kept previousMetric as `id=1132` at
  `observedAt=2026-05-01T07:53:31.204Z`, about 14 minutes 41 seconds earlier.
  The latest row has `volume24h=20335.4710939884`, and price / fdv / reserve /
  topPool presence all true. `metrics:report -- --mint ... --limit 2` plus
  `token:compare` confirmed Metric ids `1133 -> 1132`, latestMetric `id=1133`,
  and `recentMetrics` containing `1133` plus `1132` without exposing Metric
  rawJson. Token fields were preserved by both Metric writes, and Telegram /
  detect / watch / tmux / systemd were not invoked during the Metric steps.
- The second tmux-created mint,
  `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, has reached partial plus
  two Metric appends and rawJson-free two-Metric report confirmation. Enrich/rescore
  moved it from `mint_only` to `partial` as `WarlockCoin` / `Warlock` with
  score `C` / `0`, `hardRejected=false`, all reviewFlags false, and
  `linkCount=0`. The enrich/rescore write reported `contextWriteCount=1`;
  this was the Token `entrySnapshot.contextCapture.geckoterminalTokenSnapshot`
  context capture update, not a Metric write or Telegram send. Single-mint
  Metric snapshot then appended Metric `id=1134` at
  `observedAt=2026-05-01T09:30:04.949Z`, moving `metricsCount` from 0 to 1
  with source `geckoterminal.token_snapshot`, `volume24h=395.7346968031`, and
  price / fdv / reserve / topPool presence all true. `metrics:report -- --mint
  ... --limit 1` plus `token:compare` confirmed latestMetric `id=1134` and one
  `recentMetrics` item without exposing Metric rawJson. A second single-mint
  Metric snapshot then appended Metric `id=1135` at
  `observedAt=2026-05-01T09:46:34.724Z`, moved `metricsCount` from 1 to 2, and
  kept previousMetric as `id=1134` at
  `observedAt=2026-05-01T09:30:04.949Z`, about 16 minutes 29.775 seconds
  earlier. The latest row has `volume24h=395.7346968031`, and price / fdv /
  reserve / topPool presence all true. `metrics:report -- --mint ... --limit 2`
  plus `token:compare` confirmed Metric ids `1135 -> 1134`, latestMetric
  `id=1135`, and `recentMetrics` containing `1135` plus `1134` without
  exposing Metric rawJson. Token fields were preserved by both Metric writes,
  and Telegram / detect / watch / tmux / systemd were not invoked during the
  Metric steps.
- All three watch-detected mints completed:
  detect -> enrich/rescore -> Metric 1 -> Metric 2 -> rawJson-free report
  confirmation.
- The third bounded watch-detected mint,
  `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump`, has now reached
  enrich/rescore plus first Metric append. It moved from `mint_only` to
  `partial` as `The People's House` / `PH`, then appended Metric `id=1126` at
  `observedAt=2026-04-29T16:27:01.275Z`. The same mint has also passed
  rawJson-free initial Metric report confirmation through `metrics:report`,
  `token:compare`, and `tokens:compare-report`. It has now also appended a
  second Metric, moving `metricsCount` from 1 to 2 and setting latestMetric to
  `id=1127` at `observedAt=2026-04-29T16:42:56.330Z`, while previousMetric
  remains `id=1126` at `observedAt=2026-04-29T16:27:01.275Z`. RawJson-free
  two-Metric report confirmation has also passed through `metrics:report`,
  `token:compare`, and `tokens:compare-report`.
- `metric:snapshot:geckoterminal` has passed bounded single-mint, batch,
  foreground, tmux append, tmux no-candidate natural-exit, and strict
  single-mint tmux single-run gates. The strict tmux single-run confirmation
  used `lowcap-gecko-metric-single`, one `--mint`, no `--watch`, and
  `/tmp/lowcap-gecko-metric-single.log`; it appended exactly one Metric
  (`id=1136`) for `MMeYRRhuFtpJUvHYb7UDsQGDrmB6uKCcMEWsLtopump`, moved
  `metricsCount` from 1 to 2 with previous Metric `id=1116`, preserved Token
  fields, and did not invoke Telegram / detect / watch / enrich / ops /
  systemd. The same formal interim operator procedure was then reproduced for
  `3Gy57Za9VFEMhQsxPZniSjTgNffiXafFAL8juachpump`: one
  `lowcap-gecko-metric-single` single-run appended exactly one Metric
  (`id=1137`) with source `geckoterminal.token_snapshot`, moved `metricsCount`
  from 1 to 2 with previous Metric `id=1115`, confirmed `1137 -> 1115`
  rawJson-free through `metrics:report` and `token:compare`, preserved Token
  fields, and did not invoke Telegram / detect / watch / enrich / ops /
  systemd.
- `metrics:report`, `token:compare`, and `tokens:compare-report` can confirm
  saved Metric state without showing Metric rawJson.
- User systemd is blocked in this environment, the default GeckoTerminal detect
  checkpoint is still unused, and always-on / scheduler / queue worker /
  unbounded watch operation is not implemented.

## Milestone Status

The human-triggered bounded operation MVP is complete within its intended
scope. This means the operator-approved, single-candidate path has been proven
end to end: bounded detect with `/tmp` checkpoint isolation, no default
checkpoint use, `--pumpOnly --limit 1` plus explicit `--maxIterations`,
single-mint enrich/rescore, two single-mint Metric appends, and rawJson-free
report confirmation.

The milestone is based on two tmux-created mints,
`F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump` and
`AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, both of which completed
detect -> enrich/rescore -> Metric 1 -> Metric 2 -> rawJson-free report
confirmation. This does not mark lowcap-bot complete, does not make the lane
always-on, and does not approve systemd, unbounded watch, the default
checkpoint, scheduler / queue worker operation, multiple-token simultaneous
Metric writes, or additional production Telegram live-send gates.

## Interim Adoption

Treat this completed bounded operation MVP as the current interim operating
entrypoint. It is suitable for deliberate, human-approved candidate
accumulation, not for always-on monitoring.

Adopted scope:

- detect uses the isolated `/tmp` checkpoint with `--pumpOnly`, `--limit 1`,
  an explicit `--maxIterations`, and `--write` only after explicit Red
  approval.
- enrich/rescore uses one `token:enrich-rescore:geckoterminal --write` for one
  mint.
- Metric capture uses one `metric:snapshot:geckoterminal --write` for one mint.
  When tmux wrapping is useful, the confirmed strict interim shape is one
  `lowcap-gecko-metric-single` tmux session that runs the same single-mint
  command once without `--watch` and writes only `/tmp/lowcap-gecko-metric-single.log`
  plus at most one Metric row.
- reporting uses `metrics:report`, `token:compare`, and
  `tokens:compare-report` without Metric rawJson.
- the default GeckoTerminal detect checkpoint remains unused.
- every Red command remains exact, one-at-a-time, and explicitly approved.

Next-phase recommendation:

1. Keep this bounded MVP fixed as the daily operator workflow.
2. Run one more bounded detect candidate if another detect-origin sample is the
   next goal.
3. Treat strict single-mint tmux metric snapshot as the adopted interim
   operator procedure for the Metric lane before systemd or unbounded watch:
   one `lowcap-gecko-metric-single` session, one `--mint`, no `--watch`,
   `/tmp/lowcap-gecko-metric-single.log`, and at most one Metric append.
4. Keep systemd deferred until user systemd is available.
5. Keep `token_completed` and `loop_complete` production live sends deferred
   until eligible candidates naturally exist.

Do not move to default checkpoint, long-running watch, unbounded watch,
scheduler / queue worker, restart-oriented operation, or systemd without a new
preflight and explicit Red approval.

## Daily Operator Order

Use this order when continuing bounded Gecko candidate accumulation.

1. Confirm repo state:

```bash
pwd
git status --short --branch
git log --oneline -8
```

2. Run a read-only preflight for the specific Red step being considered. If the
   next step is detect, confirm no `lowcap-gecko-detect-bounded` tmux session
   already exists and keep the exact command pinned to `/tmp` checkpoint
   isolation.

3. With explicit Red approval only, run one bounded detect watch write using
   the isolated `/tmp` checkpoint, `--pumpOnly`, `--limit 1`, and an explicit
   `--maxIterations`.

   The proven tmux shape is:

```bash
tmux new-session -d -s lowcap-gecko-detect-bounded "bash -lc 'cd /home/mochi/projects/lowcap-bot && LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS=60 bash scripts/run-geckoterminal-detect-watch.sh --pumpOnly --limit 1 --maxIterations 1 > /tmp/lowcap-gecko-detect-bounded.log 2>&1'"
```

   Its allowed side effects are limited to starting that tmux session, updating
   `/tmp/lowcap-gecko-detect-bounded.log`, live GeckoTerminal fetch, at most one
   mint-only Token creation, and updating
   `/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`.

4. Confirm detect output before downstream work: `selectedCount=1`,
   `importedCount<=1`, `failedCount=0`, default checkpoint unused, no Telegram,
   no Metric write, and clean `git status`.

5. Confirm the created mint with `token:compare`, `token:show`, or a narrow
   read-only query. It should start as `metadataStatus=mint_only` with no
   Metrics.

6. Run `token:enrich-rescore:geckoterminal` dry-run for that mint.

7. With explicit Red approval only, run one
   `token:enrich-rescore:geckoterminal --write` for that mint.

   If `contextWriteCount` appears, treat it as a Token context-capture update
   such as `entrySnapshot.contextCapture.geckoterminalTokenSnapshot`; verify it
   is not a Metric write or Telegram send.

8. Run `metric:snapshot:geckoterminal` dry-run for that mint and verify the
   output is rawJson-free safe summary output.

9. With explicit Red approval only, run one
   `metric:snapshot:geckoterminal --write` for that mint.

10. Confirm with rawJson-free read-only reports:
   `metrics:report`, `token:compare`, and `tokens:compare-report`.

11. If time-series confirmation is needed, record the time gap from the latest
    Metric, run a second dry-run, then with explicit Red approval run exactly
    one second `metric:snapshot:geckoterminal --write` for the same mint.

12. Confirm the two-Metric history with `metrics:report -- --mint <MINT>
    --limit 2` and `token:compare -- --mint <MINT>`. The latest row should be
    the new Metric, the previous row should be the first Metric, and neither
    report should expose Metric rawJson.

## Red / Green Boundary

Green tasks:

- docs updates.
- read-only CLI commands.
- `metrics:report`.
- `token:compare`.
- `tokens:compare-report`.
- dry-run commands without `--write` or `--watch`.
- `pnpm exec tsc --noEmit` and targeted tests when requested.

Red tasks:

- `detect:geckoterminal:new-pools --write`.
- `detect:geckoterminal:new-pools --watch --write`.
- `token:enrich-rescore:geckoterminal --write`.
- `metric:snapshot:geckoterminal --write`.
- tmux session start.
- any systemd operation.
- Telegram live send.

Red commands must be exact, one-at-a-time, and explicitly approved before
execution.

## Proven Command Examples

These are examples of proven command shapes. They are not standing permission
to execute them.

Bounded detect watch write:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json
```

Single-mint enrich/rescore write:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --mint <MINT> --write
```

Single-mint Metric snapshot write:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write
```

RawJson-free report checks:

```bash
pnpm -s metrics:report -- --mint <MINT> --limit 2
pnpm -s token:compare -- --mint <MINT>
pnpm -s tokens:compare-report -- --source geckoterminal.new_pools --metadataStatus partial --hasMetrics true --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot --limit 10
```

## Stop Conditions

Stop before continuing if any of these happen:

- `selectedCount > 1`.
- `importedCount > 1`.
- `failedCount > 0`.
- rate limit, timeout, or network instability.
- the tmux session name already exists for a detect run.
- the command may touch the default checkpoint.
- `--pumpOnly`, `--limit 1`, or explicit `--maxIterations` would be removed.
- rawJson, `.env`, token, chat id, or other secret display risk appears.
- the next step would require removing `--maxIterations`.
- the task expands into systemd, ops catchup, or a tmux command outside the
  explicitly approved step.
- Telegram sending becomes part of the path.
- `git status` becomes dirty outside docs-only tasks.
- the exact command differs from the approved command.

## Reporting Rules

Reports should summarize counts, Metric ids, `observedAt`, sources, and
safe-summary booleans. Do not paste raw payloads, Metric rawJson, huge stdout /
stderr, environment variables, or secret values.

For Metric confirmation, prefer:

- `metrics:report` for Metric row history.
- `token:compare` for single-token latestMetric and `recentMetrics`.
- `tokens:compare-report` for cohort-level latestMetric and `metricsCount`.

## Out Of Scope / Still Unconfirmed

- detect long-running watch.
- default checkpoint operation.
- systemd start / enable.
- scheduler / queue worker.
- unbounded watch.
- restart-oriented operation.
- multiple-token simultaneous Metric snapshot write.
- `token_completed` production live send.
- `loop_complete` production live send.

## Next Phase Decision

The current bounded operation MVP is useful as a semi-automated investigation
workflow and should be treated as the interim MVP until a new preflight proves a
wider operating mode. For Metric capture, the adopted interim operator
procedure is the strict single-mint tmux single-run shape documented above and
in `docs/runbooks/gecko-metric-tmux-bounded.md`. Batch/watch bounded metric
operation remains a separate wider-bound option, and service-style operation
waits for a user-systemd-capable environment.
