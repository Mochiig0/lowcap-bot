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
2. Prefer bounded human-triggered orchestration design over more Red
   reproducibility runs unless a new sample is explicitly needed.
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

## Next Phase: Bounded Human-Triggered Orchestration Design

The next design step is a bounded operator procedure specification for the
already-confirmed CLIs. This is not an implemented executor wrapper, scheduler,
queue, service, or automatic runner. It is a design boundary for handling one
mint and one stage at a time while keeping every mutating stage behind a human
gate and a separate Red exact-command task.

Target flow:

1. bounded detect creates or identifies at most one mint-only Token.
2. `token:compare` / `token:show` establish the baseline.
3. `token:enrich-rescore:geckoterminal -- --mint <MINT>` dry-runs the
   enrich/rescore plan.
4. `token:enrich-rescore:geckoterminal -- --mint <MINT> --write` runs only
   after explicit approval for that mint.
5. `metric:snapshot:geckoterminal -- --mint <MINT>` dry-runs the Metric
   candidate with rawJson-free safe summary output.
6. `metric:snapshot:geckoterminal -- --mint <MINT> --write` appends at most
   one Metric after explicit approval.
7. `metrics:report` and `token:compare` confirm the saved Metric state
   rawJson-free.
8. docs record the completed stage before moving on.

### Bounded Orchestration Design Boundary

This section fixes the next-phase orchestration boundary as docs-only design,
not completed automation. The purpose is to keep
detect -> enrich/rescore -> metric snapshot usable as a bounded, human-gated
operator flow without turning guide / planner / validator into executors.

Core principles:

- One target mint only.
- One stage at a time.
- Guide, planner, and validator are non-executors.
- Red commands are printed as exact command strings only by non-executor tools.
- Red execution happens only in a separate Red task and runs exactly one
  approved command.
- Red execution and docs commit / push remain separate tasks.
- Output must remain rawJson-free and must not expose secrets or environment
  contents.
- Telegram live send is not part of this orchestration boundary.
- systemd, scheduler, queue, unbounded watch, and default checkpoint operation
  are not part of this boundary.
- Do not expand this flow to simultaneous multi-mint processing.
- Do not perform silent retry; failed stages stop for operator review.

Stage boundaries:

| Stage | Classification | Purpose | Allowed shape | Side-effect upper bound | Not included |
| --- | --- | --- | --- | --- | --- |
| detect bounded | Red | Create at most one candidate mint | `/tmp` checkpoint, `--pumpOnly`, `--limit 1`, `--maxIterations 1`; never the default checkpoint | live fetch, `/tmp` log/checkpoint update, mint-only Token write max 1 | enrich, Metric write, Telegram, systemd, unbounded watch |
| baseline | Green read-only | Confirm pre-stage state | `token:compare`, `token:show`, `metrics:report` | none | writes, watch, checkpoint update |
| enrich/rescore dry-run | Green | Preview one mint | `pnpm -s token:enrich-rescore:geckoterminal -- --mint <MINT>` | none | Token write, Metric write, Telegram |
| enrich/rescore write | Red | Enrich/rescore one mint | `pnpm -s token:enrich-rescore:geckoterminal -- --mint <MINT> --write` | target mint Token enrich/rescore max 1; expect `notifySentCount=0`; Metric write 0 | Metric append, Telegram live send, multi-mint write |
| metric snapshot dry-run | Green | Preview one Metric candidate | `pnpm -s metric:snapshot:geckoterminal -- --mint <MINT>` | none | Metric write, Token write, Telegram |
| metric snapshot write | Red | Append one Metric | `pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write` | target mint Metric append max 1 | Token field update, Telegram, multi-mint write |
| tmux single-mint metric | Red | Run one Metric snapshot in tmux when isolation is useful | `lowcap-gecko-metric-single`, one `--mint`, no `--watch` | one tmux single-run, `/tmp/lowcap-gecko-metric-single.log`, Metric append max 1 | watch, systemd, scheduler, queue |
| planner / validator / guide | Green read-only | Select, validate, and display stage order / command text | planner prints `nextRedCommand`; validator checks planner JSON and returns `approvalReady` / `canProceedToHumanGate`; bounded-flow guide shows stage order with `red_execution` placeholder | none | existing CLI execution, Red command execution, tmux, `--write`, `--watch` |
| report confirmation | Green read-only | Confirm saved state | `metrics:report -- --mint <MINT> --limit 2`, `token:compare -- --mint <MINT>` | none | writes, rawJson output |
| docs record | Green docs-only | Record the completed Red result in a later task | docs update, commit, push | docs text only | Red execution in the same task |

Baseline and report confirmation must check the fields needed for safe
handoff: `metadataStatus`, `metricsCount`, latestMetric, `hardRejected`, Token
field changes, and rawJson-free output.

`approvalReady=true` and `canProceedToHumanGate=true` only mean the planner JSON
is suitable to present to a human gate. They do not authorize automatic
execution, do not make the validator an executor, and do not allow the guide or
planner to run existing CLIs, `nextRedCommand`, tmux, or any `--write` command.

Semi-automation may cover:

- carrying one selected mint through the stage list.
- printing the exact next Red command instead of executing it automatically.
- enforcing dry-run -> write gates per stage.
- checking stage-local counts such as `selectedCount`, `okCount`,
  `errorCount`, `enrichWriteCount`, `rescoreWriteCount`, `contextWriteCount`,
  `writtenCount`, and `metricsCount`.
- running rawJson-free read-only reports after a successful write.
- refusing to continue when repo state, mint state, or output shape does not
  match the expected single-mint contract.

Semi-automation must not include:

- unbounded watch.
- default checkpoint operation.
- systemd start / enable / restart-oriented service operation.
- scheduler / queue worker behavior.
- simultaneous multi-mint processing.
- Telegram live send or `--notify` / `--opsNotify`.
- `ops:catchup:gecko --write`.
- implicit retries that hide a failed stage from the operator.

Required stop conditions for any future wrapper:

- the target mint is missing or more than one mint is selected.
- baseline `metadataStatus`, `metricsCount`, latestMetric, or source differs
  from the stage expectation.
- any dry-run reports `errorCount > 0`, `writeEnabled=true`, or a write count
  above zero.
- any write reports `selectedCount > 1`, `okCount > 1`, `writtenCount > 1`, or
  `errorCount > 0`.
- rawJson, raw payload, `.env`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, or
  `TELEGRAM_CHAT_ID` would be printed.
- the flow would add Telegram live send, ops catchup, systemd, scheduler,
  queue worker, default checkpoint use, or unbounded / long-running watch.
- `git status --short --branch` is dirty before or after a stage.

Small implementation units, if this moves beyond docs:

- a read-only planner that selects one mint and prints the next exact command.
- a stage verifier that parses existing CLI output and applies the stop
  conditions without writing.
- a wrapper that pauses before each Red command and never auto-advances from
  dry-run into write.

### Read-Only Planner Contract

The planner is not an executor. It must not run Red commands, start tmux,
attach `--write`, send Telegram, touch checkpoints, or mutate DB state. Its only
job is to inspect one mint through read-only CLIs, decide the current stage, and
print one next exact Red command with the expected side-effect upper bound and
stop conditions.

Inputs:

- `mint`: required; exactly one mint.
- `intendedStage`: optional operator hint, one of `baseline`,
  `enrich_dry_run`, `enrich_write`, `metric_dry_run`, `metric_write`,
  `second_metric_dry_run`, `second_metric_write`, or `report_confirmation`.
- `expectedMetricsCount`: optional guard.
- `expectedMetadataStatus`: optional guard.
- `expectedStage`: optional guard for the current planner stage.

Outputs:

- current stage.
- next stage.
- one next exact Red command, or `stop`.
- machine-readable safety metadata for that command:
  `nextRedCommandKind`, `requiresHumanApproval`, `executor`, and
  `willExecute`.
- expected side-effect upper bound for that Red command, as both the existing
  `sideEffectUpperBound` string and the machine-readable
  `sideEffectUpperBoundSpec`.
- required read-only confirmation commands.
- stop conditions that apply before the command can be approved.
- rawJson-free confirmation requirement for the following report step.

Safety metadata interpretation:

- When `nextRedCommand` is present, `nextRedCommandKind` identifies the command
  family, `requiresHumanApproval=true`, `executor="human"`, and
  `willExecute=false`.
- The non-null `nextRedCommandKind` literals are:
  - `gecko_enrich_rescore_single_mint`: candidate to run
    `token:enrich-rescore:geckoterminal -- --mint <MINT> --write` after the
    human gate.
  - `gecko_metric_snapshot_single_mint`: candidate to run
    `metric:snapshot:geckoterminal -- --mint <MINT> --write` after the human
    gate.
  - `tmux_metric_single_mint`: candidate to run the
    `lowcap-gecko-metric-single` tmux single-run command after the human gate.
- When `nextRedCommand=null`, `nextRedCommandKind=null`,
  `requiresHumanApproval=false`, `executor="none"`, and
  `willExecute=false`.
- `nextRedCommandKind` is a machine-readable label, not an executor. The
  planner remains read-only / non-executing and still only prints command text
  for a later human-approved Red task. It does not run Red commands, start tmux,
  or execute any `--write` command.
- The existing `nextRedCommand` string / null field remains the
  backward-compatible command text field.
- The existing `sideEffectUpperBound` string and `stopConditions` string array
  remain backward-compatible fields.
- `sideEffectUpperBoundSpec` is the machine-readable upper bound for permitted
  effects if the later human-approved Red command is run. `stopConditionCodes`
  is the machine-readable standard checklist vocabulary to review before Red
  approval.
- `stopConditionCodes` is not an active error list. `currentStage` and `reason`
  describe the actual stop state; `stopConditions` remains the human-readable
  checklist text.

`sideEffectUpperBoundSpec` shape:

- `metricWriteMax`
- `tokenWrite`
- `tokenWriteMax`
- `telegramSend`
- `tmux`
- `tmuxSession`
- `checkpointWrite`
- `systemd`
- `multiMint`

`sideEffectUpperBoundSpec` by `nextRedCommandKind`:

| nextRedCommandKind | metricWriteMax | tokenWrite | tokenWriteMax | telegramSend | tmux | tmuxSession | checkpointWrite | systemd | multiMint |
| --- | ---: | --- | ---: | --- | --- | --- | --- | --- | --- |
| `null` | 0 | false | 0 | false | false | null | false | false | false |
| `gecko_enrich_rescore_single_mint` | 0 | true | 1 | false | false | null | false | false | false |
| `gecko_metric_snapshot_single_mint` | 1 | false | 0 | false | false | null | false | false | false |
| `tmux_metric_single_mint` | 1 | false | 0 | false | true | `lowcap-gecko-metric-single` | false | false | false |

`stopConditionCodes` code set:

- `mint_missing_or_ambiguous`
- `guard_mismatch`
- `invalid_args`
- `selected_count_gt_1`
- `written_count_gt_1`
- `error_count_gt_0`
- `rawjson_output_risk`
- `secret_output_risk`
- `telegram_expansion_risk`
- `ops_expansion_risk`
- `systemd_expansion_risk`
- `scheduler_queue_expansion_risk`
- `unbounded_watch_expansion_risk`
- `default_checkpoint_expansion_risk`
- `git_dirty`

Stage rules:

- Token missing or mint lookup does not return exactly one token: stop.
- `metadataStatus=mint_only` with `metricsCount=0`: next stage is
  `enrich_dry_run`; if that passes, the next Red command may be
  `pnpm -s token:enrich-rescore:geckoterminal -- --mint <MINT> --write`.
- `metadataStatus=partial` with `metricsCount=0`: next stage is
  `metric_dry_run`; if that passes, the next Red command may be
  `pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write`.
- `metadataStatus=partial` with `metricsCount=1`: next stage is
  `second_metric_dry_run`; if the operator wants tmux isolation, the next Red
  command may be the strict `lowcap-gecko-metric-single` command for that mint;
  otherwise it may be the single-mint `metric:snapshot:geckoterminal --write`
  command.
- `metricsCount>=2`: next stage is `report_confirmation` or stop; do not plan a
  further Metric write unless the operator explicitly asks for another
  time-series sample and supplies a fresh preflight.
- `hardRejected=true`: stop for manual review.
- latestMetric source exists and is not `geckoterminal.token_snapshot`: stop for
  manual review.

Allowed Red command families:

- `pnpm -s token:enrich-rescore:geckoterminal -- --mint <MINT> --write`
- `pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write`
- the strict single-mint tmux Metric command:
  `tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint <MINT> --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"`

The planner must not emit:

- Telegram live-send commands, `--notify`, or `--opsNotify`.
- `ops:catchup:gecko --write`.
- systemd commands.
- unbounded watch commands.
- default-checkpoint detect commands.
- multi-mint Metric write commands.

Implementation and smoke status:

- The planner contract is implemented as
  `pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT>`.
- The planner supports three Red preflight guards:
  `--expectedMetricsCount`, `--expectedMetadataStatus`, and
  `--expectedStage`. The stage guard was introduced by
  `b64ad16 feat: add planner stage guard`.
- The planner output now includes machine-readable safety metadata fields from
  `956e18a feat: add planner safety metadata fields`: `nextRedCommandKind`,
  `requiresHumanApproval`, `executor`, and `willExecute`. The existing
  `nextRedCommand` string / null field remains the backward-compatible command
  text field.
- The planner output also includes `sideEffectUpperBoundSpec` from
  `a432580 feat: add planner side effect spec`. The existing
  `sideEffectUpperBound` string and `stopConditions` string array remain
  backward-compatible fields.
- The planner output also includes `stopConditionCodes` from
  `1780ce3 feat: add planner stop condition codes`. These are standard
  machine-readable checklist codes for Red approval preflight, not active
  errors; `currentStage` and `reason` remain the actual stop-state fields.
- `ops:gecko:single-candidate:validate` is implemented by
  `09b0853 feat: add planner output validator`. It validates planner output
  JSON from `--plannerJson <FILE>` or stdin and returns `approvalReady`,
  `canProceedToHumanGate`, and per-field `checks`. It is read-only and
  non-executing: it does not run the planner, execute `nextRedCommand`, start
  tmux, attach `--write`, connect to DB / Prisma / network, send Telegram, or
  touch systemd / scheduler / queue / unbounded watch behavior.
- Real-DB read-only smoke has passed for these stages:
  - `3Gy57Za9VFEMhQsxPZniSjTgNffiXafFAL8juachpump`:
    `currentStage=two_or_more_metrics`,
    `nextStage=report_confirmation_or_stop`, and `nextRedCommand=null`.
  - `7nuUe3Y4pC6PbwbUWe6NKkjaCcZxXa9UoNLYXSC1pump`:
    `currentStage=partial_with_one_metric`,
    `nextStage=second_metric_write_or_tmux_single`, and
    `nextRedCommand` is only the `lowcap-gecko-metric-single` tmux
    single-mint Metric command string.
  - `SMOKE_1777155335104_GECKO_COMPARE_NOISE_11`:
    `currentStage=mint_only_without_metrics`, `nextStage=enrich_write`, and
    `nextRedCommand` is only the
    `token:enrich-rescore:geckoterminal --write` command string. This is a
    smoke-only mint, not a live market candidate proof.
- `partial_without_metrics` remains unconfirmed in the smoke matrix because the
  read-only candidate report returned zero matching tokens.
- The smoke confirmed planner output is rawJson-free in the user-facing sense:
  it did not expose a Metric `rawJson` field, raw payload body, `.env`,
  `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, or `TELEGRAM_CHAT_ID`. The
  `rawJsonFreeRequired` flag and stop-condition wording are specification text,
  not raw payload output.
- The smoke did not execute any `nextRedCommand`, did not attach `--write`, did
  not start tmux, did not write DB / Token / Metric rows, did not send
  Telegram, and did not touch watch, checkpoint, systemd, scheduler, or queue
  behavior.
- A later real-DB read-only stage-guard smoke passed on
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump` with
  `--expectedMetricsCount 2 --expectedMetadataStatus partial --expectedStage two_or_more_metrics`:
  actual `guards.metricsCount=2`, `guards.metadataStatus=partial`, and
  `currentStage=two_or_more_metrics` matched, `nextRedCommand=null`, and the
  output remained rawJson-free. That smoke did not write DB / Token / Metric
  rows, did not send Telegram, and did not start tmux / watch / systemd.
- A later real-DB read-only safety-metadata smoke on the same mint confirmed
  the no-Red-command shape: `nextRedCommand=null`,
  `nextRedCommandKind=null`, `requiresHumanApproval=false`,
  `executor="none"`, and `willExecute=false`. The output remained
  rawJson-free and did not write DB / Token / Metric rows, send Telegram, start
  watch, start tmux, or touch systemd.

### Planner Operator Selection Procedure

Use the planner only to select and describe the next Red step. It is a
read-only selector, not the approval or execution step.

1. Select exactly one candidate mint from read-only reports. Prefer reports that
   show `metadataStatus`, `metricsCount`, `hardRejected`, and latestMetric
   source, such as `tokens:compare-report`, `token:compare`, and
   `metrics:report`.
2. Confirm the baseline for that mint:

```bash
pnpm -s token:compare -- --mint <MINT>
pnpm -s metrics:report -- --mint <MINT> --limit 2
```

3. Run the planner:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT>
```

For Red execution preflight, include the expected Metric count from the
baseline:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT> --expectedMetricsCount <EXPECTED_COUNT>
```

When the expected token metadata state is part of the gate, include the
metadataStatus guard as well:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT> --expectedMetricsCount <EXPECTED_COUNT> --expectedMetadataStatus <EXPECTED_STATUS>
```

Allowed `--expectedMetadataStatus` values are `mint_only`, `partial`, and
`enriched`.

For Red execution preflight, prefer all three guards when the intended planner
stage is known:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT> --expectedMetricsCount <EXPECTED_COUNT> --expectedMetadataStatus <EXPECTED_STATUS> --expectedStage <EXPECTED_STAGE>
```

For machine-readable validation before asking for Red approval, save or pipe
that planner JSON into the validator:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT> --expectedMetricsCount <EXPECTED_COUNT> --expectedMetadataStatus <EXPECTED_STATUS> --expectedStage <EXPECTED_STAGE> > /tmp/lowcap-planner.json
pnpm -s ops:gecko:single-candidate:validate -- --plannerJson /tmp/lowcap-planner.json
```

stdin is also accepted:

```bash
cat /tmp/lowcap-planner.json | pnpm -s ops:gecko:single-candidate:validate
```

Allowed `--expectedStage` values are:

- `mint_only_without_metrics`
- `partial_without_metrics`
- `partial_with_one_metric`
- `two_or_more_metrics`
- `manual_review_required`

Do not pass `missing_mint_arg`, `invalid_args`, `guard_mismatch`, or
`missing_token` as `--expectedStage`; those are parse / error / missing states,
not normal operator-intended stages.

4. Check `currentStage`, `nextStage`, `guards`, `readOnlyCommands`,
   `nextRedCommand`, `nextRedCommandKind`, `requiresHumanApproval`,
   `executor`, `willExecute`, `sideEffectUpperBound`,
   `sideEffectUpperBoundSpec`, `stopConditions`, and `stopConditionCodes`.
5. Run `ops:gecko:single-candidate:validate` against the saved planner JSON.
   Move to a separate Red approval request only when `approvalReady=true` and
   `canProceedToHumanGate=true`.
6. Confirm the planner output does not expose a Metric `rawJson` field, raw
   payload body, `.env`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, or
   `TELEGRAM_CHAT_ID`. The `rawJsonFreeRequired` flag and stop-condition wording
   are specification text, not payload output.
7. Do not execute `nextRedCommand` in the selection task. If a command is
   present, require `requiresHumanApproval=true`, `executor="human"`, and
   `willExecute=false`, then paste the exact command into the next
   human-approved Red task together with side-effect upper bound and stop
   conditions.
8. If `nextRedCommand=null`, do not move to Red. Treat the result as report
   confirmation or stop; the safety metadata should be
   `nextRedCommandKind=null`, `requiresHumanApproval=false`,
   `executor="none"`, and `willExecute=false`.

Validator `ok` requirements:

- planner `status=ok`.
- Red-stage output with a non-empty `nextRedCommand` and known
  `nextRedCommandKind`.
- `requiresHumanApproval=true`, `executor="human"`, and `willExecute=false`.
- `sideEffectUpperBoundSpec` remains within the single-mint bounds.
- required `stopConditionCodes` are present.
- output is rawJson-free and has no secret/env marker.

Validator stop cases include:

- invalid JSON, no input, or both stdin and `--plannerJson`.
- `nextRedCommand=null`.
- planner stop, `guard_mismatch`, `invalid_args`, `manual_review_required`, or
  missing-token / missing-mint stages.
- approval metadata mismatch, unknown kind, side-effect upper-bound expansion,
  required code gaps, or rawJson / secret marker detection.
- if rawJson or a secret/env marker is detected, the validator stops and does
  not reprint `nextRedCommand`.

Candidate interpretation:

- `metricsCount>=2`: generally no write is needed; confirm reports or stop.
- `partial_with_one_metric`: the planner may propose the strict
  `lowcap-gecko-metric-single` tmux single-mint Metric command, but it must not
  start tmux.
- `mint_only_without_metrics`: the planner may propose the single-mint
  `token:enrich-rescore:geckoterminal --write` command, but it must not run it.
- `partial_without_metrics`: covered by temp SQLite tests, but not yet by a
  real-DB smoke candidate because the latest candidate report returned zero
  matching tokens; confirm this stage separately when a real candidate appears.
- `hardRejected=true`, latestMetric source mismatch, or any guard mismatch:
  manual review stop.
- `--expectedMetricsCount` mismatch: stop before Red approval with
  `status=stop`, `currentStage=guard_mismatch`, `nextStage=null`,
  `nextRedCommand=null`, and actual `guards.metricsCount`. Do not proceed to
  the proposed Red command until the operator re-baselines the mint.
- `--expectedMetadataStatus` mismatch: stop before Red approval with
  `status=stop`, `currentStage=guard_mismatch`, `nextStage=null`,
  `nextRedCommand=null`, `sideEffectUpperBound=null`, and actual
  `guards.metadataStatus`. Do not proceed to the proposed Red command until the
  operator re-baselines the mint.
- `--expectedStage` mismatch: stop before Red approval with `status=stop`,
  `currentStage=guard_mismatch`, `nextStage=null`, `nextRedCommand=null`,
  `sideEffectUpperBound=null`, and actual `guards`. Do not proceed to the
  proposed Red command until the operator re-baselines the mint.
- invalid `--expectedMetricsCount` input: stop with `currentStage=invalid_args`
  and `nextRedCommand=null`.
- invalid `--expectedMetadataStatus` input, including unknown values outside
  `mint_only`, `partial`, and `enriched`, stops with
  `currentStage=invalid_args` and `nextRedCommand=null`.
- invalid `--expectedStage` input, including unknown values outside the allowed
  stage list, stops with `currentStage=invalid_args` and `nextRedCommand=null`.
- Token missing still takes priority over `--expectedMetricsCount` and
  `--expectedMetadataStatus` / `--expectedStage` as
  `currentStage=missing_token`. `--expectedMetadataStatus` mismatch is checked
  before `--expectedMetricsCount`, and both are checked before
  `--expectedStage`.
- `hardRejected=true` or latestMetric source mismatch is actual
  `currentStage=manual_review_required`. If
  `--expectedStage manual_review_required` is supplied, keep that stop. If a
  different expected stage is supplied, return `guard_mismatch`.

Human approval gate:

- Red execution is always a separate task with one exact command, expected
  counts, side-effect upper bound, and stop conditions.
- Guard mismatch, invalid args, and `manual_review_required` stop states do not
  authorize Red execution.
- Do not combine planner selection, Red execution, and docs commit / push in one
  task.
- SMOKE-prefixed mints are acceptable for planner smoke, but they are not live
  market candidate proofs.
- The planner selection flow does not authorize Telegram, ops catchup, systemd,
  scheduler, queue worker, default checkpoint operation, unbounded watch, or
  multi-mint writes.

### Planner + Validator Approval Flow Milestone

The current approval milestone is the bounded one-mint flow:

1. Pick exactly one candidate mint from read-only reports.
2. Confirm the baseline with `token:compare` and, when relevant,
   `metrics:report`.
3. Run `ops:gecko:single-candidate:plan` with all three guards:
   `--expectedMetricsCount`, `--expectedMetadataStatus`, and
   `--expectedStage`.
4. Save or pipe the planner JSON.
5. Run `ops:gecko:single-candidate:validate` against that planner JSON.
6. Move to an upstream Red approval request only when both
   `approvalReady=true` and `canProceedToHumanGate=true`.
7. Execute only one copied Red exact command in the separate Red task.
8. Confirm the result with rawJson-free read-only reports, then record the
   result in docs-only follow-up.

Example:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT> --expectedMetricsCount <N> --expectedMetadataStatus <STATUS> --expectedStage <STAGE> > /tmp/lowcap-planner.json
pnpm -s ops:gecko:single-candidate:validate -- --plannerJson /tmp/lowcap-planner.json
```

The validator can also read stdin:

```bash
cat /tmp/lowcap-planner.json | pnpm -s ops:gecko:single-candidate:validate
```

This milestone establishes the approval boundary, not automatic execution. If
the validator returns `stop`, do not move to Red. If the validator returns
`ok`, still do not execute automatically: paste the exact `nextRedCommand` into
the separate human-approved Red task with the side-effect upper bound and stop
conditions.

What the validator guarantees:

- the planner JSON has an approval-ready shape for one known Red command kind.
- `requiresHumanApproval=true`, `executor="human"`, and `willExecute=false`
  are present for a proposed Red command.
- `sideEffectUpperBoundSpec` remains within the accepted single-mint bounds.
- required `stopConditionCodes` are present.
- rawJson / secret-marker risk is not present in the validator-accepted JSON.

Validator safety coverage is fixed by fixture tests for these representative
paths:

- ok: `gecko_enrich_rescore_single_mint`,
  `gecko_metric_snapshot_single_mint`, and `tmux_metric_single_mint`.
- stop: unknown `nextRedCommandKind`, `missing_token`, `missing_mint_arg`,
  `tokenWriteMax > 1`, required `stopConditionCodes` gaps, side-effect
  upper-bound expansion, rawJson key, raw payload marker, and secret marker.
- unsafe marker detection stops and does not reprint `nextRedCommand`.

What the validator does not guarantee:

- future market-data values or liquidity state.
- Red command execution success.
- Telegram, systemd, or watch safety outside the bounded one-command approval
  contract.
- replacement of human judgment at the Red approval gate.

Planner and validator are both non-executors. They must not run Red commands,
start tmux, attach `--write`, connect to DB / Prisma / network, use
child-process execution, send Telegram, or touch systemd / scheduler / queue /
unbounded watch behavior. Systemd, unbounded watch, scheduler, queue worker,
and default checkpoint operation remain deferred.

### Bounded Flow Guide

Use `ops:gecko:bounded-flow:guide` when the operator needs the bounded
procedure as one JSON checklist. The guide is a non-executor: it prints command
strings and stage order only.

```bash
pnpm -s ops:gecko:bounded-flow:guide -- --mint <MINT> --expectedMetricsCount <N> --expectedMetadataStatus <STATUS> --expectedStage <STAGE>
```

The guide output shape includes `status`, `reason`, `mint`,
`mode="non_executor_guide"`, top-level `willExecute=false`,
`executor="human"`, `rawJsonFreeRequired=true`, `steps`, `forbidden`, and
`notes`. Its stage order is:

1. `baseline`
2. `planner`
3. `validator`
4. `human_gate`
5. `red_execution`
6. `report_confirmation`
7. `docs_record`

All steps have `willExecute=false`. The `red_execution` step is a placeholder,
not an execution step: after validator acceptance, request a separate human
gate and run exactly one copied Red command only in that separate Red task.
Keep Red execution and docs commit / push as separate follow-ups.

The guide must not execute existing CLI commands, planner, validator,
`nextRedCommand`, `--write`, `--watch`, tmux, DB / Prisma / network, Telegram,
systemd, scheduler / queue, unbounded watch, default checkpoint, multi-mint
work, or silent retry. It does not authorize systemd, unbounded watch,
scheduler, queue worker, default checkpoint operation, or Telegram live send.

Milestone: the guide contract is now consistent across implementation, tests,
and docs for input shape, output shape, stage order, the non-executor boundary,
and the full forbidden list. The forbidden list is fixed by test full equality
in this order:

1. `existing CLI execution by guide`
2. `nextRedCommand execution`
3. `--write execution`
4. `--watch execution`
5. `tmux start`
6. `Telegram send`
7. `systemd`
8. `scheduler`
9. `queue`
10. `unbounded watch`
11. `default checkpoint`
12. `multi-mint`
13. `silent retry`

Next useful work is either a Green operator smoke / template pass for the guide
or a separate preflight for bounded detect -> enrich/rescore -> metric
orchestration. More same-shape Red reproductions are lower priority. Systemd,
scheduler, queue worker, unbounded watch, and default checkpoint operation
remain deferred.

### Bounded-Flow Guide Intent Option

`ops:gecko:bounded-flow:guide --intent <VALUE>` is implemented as a
non-executor guide option. The guide remains `mode="non_executor_guide"`: it
displays command strings, stage order, guard defaults, notes, and a Red
placeholder, but it does not execute existing CLIs, planner, validator,
`nextRedCommand`, `--write`, `--watch`, tmux, DB / Prisma / network, Telegram,
systemd, scheduler / queue, unbounded watch, default checkpoint, multi-mint
work, or silent retry.

Allowed intent values are limited to these three single-mint operator flows:

| intent | Target state | Default planner guards | Red candidate | Purpose |
| --- | --- | --- | --- | --- |
| `second_metric_snapshot` | `metadataStatus=partial`, `metricsCount=1`, `expectedStage=partial_with_one_metric` | `--expectedMetricsCount 1 --expectedMetadataStatus partial --expectedStage partial_with_one_metric` | `tmux_metric_single_mint` or single-mint metric snapshot write | Guide the second Metric snapshot Red approval. |
| `first_metric_snapshot` | `metadataStatus=partial`, `metricsCount=0`, `expectedStage=partial_without_metrics` | `--expectedMetricsCount 0 --expectedMetadataStatus partial --expectedStage partial_without_metrics` | `gecko_metric_snapshot_single_mint` | Guide the first Metric snapshot Red approval. |
| `enrich_rescore` | `metadataStatus=mint_only`, `metricsCount=0`, `expectedStage=mint_only_without_metrics` | `--expectedMetricsCount 0 --expectedMetadataStatus mint_only --expectedStage mint_only_without_metrics` | `gecko_enrich_rescore_single_mint` | Guide the enrich/rescore Red approval. |

Read-only guide smoke confirmed all three intents with
`9eSNHMiLdKtud379HEk73ug7DhVdqRXR5MgFZanzpump`: `second_metric_snapshot`,
`first_metric_snapshot`, and `enrich_rescore` each returned `status=ok`,
`mode="non_executor_guide"`, top-level `willExecute=false`,
`executor="human"`, `rawJsonFreeRequired=true`, all steps
`willExecute=false`, the unchanged stage order, `red_execution` as a
placeholder with no commands and no concrete tmux command, and the 13-item
forbidden list; the exact `"rawJson":` field was absent. The planner command
string included the three default guards for each intent. The smoke did not
execute planner, validator,
`nextRedCommand`, Red commands, `--write`, `--watch`, DB / Token / Metric
writes, Telegram, tmux, systemd, or checkpoint updates.

When an intent is supplied, the guide fills missing guard values with that
intent's defaults. If an explicit `--expectedMetricsCount`,
`--expectedMetadataStatus`, or `--expectedStage` conflicts with the selected
intent default, the guide stops with `status=stop`, an `intent conflict`
reason, and top-level `willExecute=false`.

The output shape keeps the existing fields: `status`, `reason`, `mint`,
`mode="non_executor_guide"`, top-level `willExecute=false`,
`executor="human"`, `rawJsonFreeRequired=true`, `steps`, `forbidden`, and
`notes`. It now also includes:

- `intent`
- `expectedMetricsCount`
- `expectedMetadataStatus`
- `expectedStage`

The stage order remains unchanged:

1. `baseline`
2. `planner`
3. `validator`
4. `human_gate`
5. `red_execution`
6. `report_confirmation`
7. `docs_record`

Intent only specializes guard defaults, notes, and the `red_execution`
placeholder description. `red_execution` remains a placeholder with no
`commands` field and no concrete tmux command. It must not become an executable
step, and `approvalReady=true` / `canProceedToHumanGate=true` must still only
mean the operator may move to a separate human gate.

The forbidden list must remain the same 13 items:

1. `existing CLI execution by guide`
2. `nextRedCommand execution`
3. `--write execution`
4. `--watch execution`
5. `tmux start`
6. `Telegram send`
7. `systemd`
8. `scheduler`
9. `queue`
10. `unbounded watch`
11. `default checkpoint`
12. `multi-mint`
13. `silent retry`

This design does not promote executor wrappers, systemd, scheduler / queue,
unbounded watch, default checkpoint use, Telegram live send, or automatic
detect -> enrich/rescore -> Metric execution.

#### Bounded-Flow Guide Intent Milestone

The bounded-flow guide intent milestone is complete for guide-stage intent
support. The completed scope is intentionally narrow:

- `second_metric_snapshot`, `first_metric_snapshot`, and `enrich_rescore` are
  the only supported intents.
- Each intent has a fixed default guard set, and the generated planner command
  string includes `--expectedMetricsCount`, `--expectedMetadataStatus`, and
  `--expectedStage`.
- The guide output includes `intent`, `expectedMetricsCount`,
  `expectedMetadataStatus`, and `expectedStage`.
- Top-level `willExecute=false` and all step-level `willExecute=false` remain
  fixed.
- `red_execution` remains a placeholder with no `commands` field and no
  concrete tmux command.
- The 13-item forbidden list is unchanged.
- The exact `"rawJson":` field is absent from the guide output.

This milestone is guide support, not an executor wrapper. The guide still does
not execute existing CLIs, planner, validator, `nextRedCommand`, `--write`,
`--watch`, tmux, DB / Prisma / network, Telegram, systemd, scheduler / queue,
unbounded watch, default checkpoint, multi-mint work, or silent retry.

#### Intent Milestone / Next-Phase Criteria

The first live operating milestone for guide intents is complete for
`second_metric_snapshot`:

- supported intent: `second_metric_snapshot`.
- confirmed example:
  `GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump`.
- confirmed path: bounded-flow guide with
  `--intent second_metric_snapshot` -> planner -> validator -> human gate ->
  exactly one copied Red command -> one Metric append -> docs record.
- confirmed result: Metric `id=1243`, previous Metric `id=688`,
  `metricsCount` 1 -> 2, rawJson-free report confirmation, and no Token field
  update.
- additional same-shape `second_metric_snapshot` Red reproductions are
  optional and should only be added when a new single-mint observation has a
  specific operating reason.

The remaining guide intents are supported but not live-operating milestones
yet:

- `first_metric_snapshot`: wait for a real `partial + metricsCount=0`
  candidate. The latest read-only check for
  `partial + hasMetrics=false` returned `count=143`, `filteredCount=0`, and
  `items=[]`. When such a natural pump candidate appears and can be reduced to
  one mint, run a Green approval preflight before any Red command.
- `enrich_rescore`: wait for a natural `mint_only + metricsCount=0` pump
  candidate. `mint_only` rows exist (`filteredCount=200` in the limit-200
  check), but the latest read-only comparison was dominated by SMOKE /
  synthetic-looking rows, and no natural pump mint was found within the
  limit-2000 check. SMOKE and synthetic-looking rows are not live market proof
  for this milestone, and they are not approval preflight targets.

This milestone still does not implement an executor wrapper or automatic Red
execution. Guide, planner, and validator remain non-executors. Systemd,
scheduler / queue, unbounded watch, default checkpoint operation, Telegram
live send, multi-mint execution, and silent retry remain deferred.

### Bounded Detect Candidate

The candidate waiting state produced one fresh bounded detect write origin
without changing the automation boundary. A read-only guard first used
`detect:geckoterminal:new-pools -- --pumpOnly --limit 1` and confirmed a
natural Pump.fun pump candidate. After the separate Red approval, exactly one
command ran:

```bash
pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --watch --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-bounded.json --write
```

Confirmed result:

- bounded one-cycle watch write: `dryRun=false`, `writeEnabled=true`,
  `watchEnabled=true`, `checkpointEnabled=true`, `cycleCount=1`, and
  `maxIterations=1`.
- single candidate counts: `selectedCount=1`, `acceptedCount=1`,
  `importedCount=1`, `existingCount=0`, `failedCount=0`, and
  `skippedNonPumpCount=5`.
- created mint-only Token:
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, with
  `source=geckoterminal.new_pools` and `dexName=Pump.fun`.
- post-check state: `metadataStatus=mint_only`, `metricsCount=0`,
  `latestMetric=null`, `name/symbol/description=null`,
  `hardRejected=false`, `scoreRank=C`, `scoreTotal=0`, `enrichedAt=null`,
  and `rescoredAt=null`.
- checkpoint scope: created / updated only
  `/tmp/lowcap-gecko-detect-bounded.json`, advanced to
  `2026-05-08T22:04:05.000Z |
  DWHNrAbt6bL3HuygDiBGBQY51ADxtyMreERS9JuBH3tT`.
- default checkpoint remained uncreated / unused.
- Metric write, Token enrich/rescore, Telegram, tmux, systemd, scheduler /
  queue, watch continuation beyond `maxIterations=1`, and additional Red
  commands were not invoked.
- execution output and post-check reports stayed rawJson-free and did not
  expose secret markers.

This makes `Ffn2...pump` a possible future `enrich_rescore` intent approval
preflight target. The guide / planner / validator steps and any Red
enrich/rescore command are separate tasks; this detect record does not execute
or imply automatic downstream work.

### Enrich Rescore Candidate

`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` has now confirmed the
`enrich_rescore` intent path as a bounded single-mint Token write. The flow was
guide -> planner -> validator -> human gate -> exactly one Red command:

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --mint Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump --write
```

The guide remained `mode=non_executor_guide`, the planner returned
`currentStage=mint_only_without_metrics`, `nextStage=enrich_write`, and
`nextRedCommandKind=gecko_enrich_rescore_single_mint`, and the validator
returned `approvalReady=true` plus `canProceedToHumanGate=true`. Those values
were human-gate conditions only; they did not execute the Red command.

Confirmed write result:

- one target mint only: `selected=1`, `ok=1`, and `error=0`.
- bounded Token writes: `enrichWritten=1`, `rescoreWritten=1`, and
  `contextWritten=1`.
- no notification send: `notifySent=0`, and `--notify` was not present.
- Token fields moved from `mint_only` to `partial` with `name=Papu`,
  `symbol=PAPU`, `description=null`, and `normalizedText=papu papu`.
- review flags stayed false for website, X, Telegram, Metaplex, and
  description; `linkCount=0`.
- score stayed `C` / `0`, and `hardRejected=false`.
- timestamps: `enrichedAt=2026-05-08T22:38:21.819Z` and
  `rescoredAt=2026-05-08T22:38:21.830Z`.
- Metric state did not change: `metricsCount=0`, `latestMetric=null`, and
  `metrics:report` returned `count=0` / `items=[]`.
- Metric write, Telegram, detect, watch, tmux, systemd, checkpoint updates,
  scheduler / queue work, and additional Red commands were not invoked.
- planner, validator, and post-check reports stayed rawJson-free and did not
  expose secret markers.

### First Metric Snapshot Candidate

The same Ffn2 bounded-detect origin mint has now confirmed the
`first_metric_snapshot` intent path as a bounded single-mint Metric write. The
flow was guide -> planner -> validator -> human gate -> exactly one Red
command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump --write
```

The guide used `--intent first_metric_snapshot` and remained
`mode=non_executor_guide`; all steps had `willExecute=false`, and
`red_execution` remained a placeholder. The planner returned
`currentStage=partial_without_metrics`, `nextStage=metric_write`, and
`nextRedCommandKind=gecko_metric_snapshot_single_mint`; the validator returned
`approvalReady=true` plus `canProceedToHumanGate=true`. Those values were
human-gate conditions only and did not execute the Red command.

Confirmed Metric write result:

- one target mint only: `selectedCount=1`, `okCount=1`, and `errorCount=0`.
- one Metric append: `writtenCount=1`, Metric `id=1244`, source
  `geckoterminal.token_snapshot`,
  `observedAt=2026-05-08T23:11:09.976Z`, and `volume24h=0`.
- safe summary: `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, and `topPoolPresent=true`.
- Metric state moved from `metricsCount=0`, `latestMetric=null`, and
  `metrics:report count=0` to `metricsCount=1`, latestMetric `id=1244`, and
  `recentMetrics=1244`.
- Token metadata and scoring fields did not change: `metadataStatus=partial`,
  `name=Papu`, `symbol=PAPU`, `scoreRank=C`, `scoreTotal=0`,
  `hardRejected=false`, and the enrich/rescore timestamps stayed
  `2026-05-08T22:38:21.819Z` / `2026-05-08T22:38:21.830Z`.
- Telegram, detect, watch, enrich/rescore, tmux, systemd, checkpoint updates,
  scheduler / queue work, and additional Red commands were not invoked.
- planner, validator, Red result, and post-check reports stayed rawJson-free
  and did not expose secret markers.

### Second Metric Snapshot Candidate

The same Ffn2 bounded-detect origin mint has now confirmed the
`second_metric_snapshot` intent path as a strict tmux single-mint Metric write.
The completed human-gated path is:

1. bounded detect write
2. `enrich_rescore`
3. `first_metric_snapshot`
4. `second_metric_snapshot`

The second Metric flow was guide -> planner -> validator -> human gate ->
exactly one Red command:

```bash
tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"
```

The guide used `--intent second_metric_snapshot` and remained
`mode=non_executor_guide`; all steps had `willExecute=false`, and
`red_execution` remained a placeholder. The planner returned
`currentStage=partial_with_one_metric`,
`nextStage=second_metric_write_or_tmux_single`, and
`nextRedCommandKind=tmux_metric_single_mint`; the validator returned
`approvalReady=true` plus `canProceedToHumanGate=true`. Those values were
human-gate conditions only and did not execute the Red command.

Confirmed tmux Metric write result:

- one `lowcap-gecko-metric-single` session, no `--watch`, and natural
  single-run exit.
- log side effect only at `/tmp/lowcap-gecko-metric-single.log`.
- one target mint only: `selectedCount=1`, `okCount=1`, and `errorCount=0`.
- one Metric append: `writtenCount=1`, Metric `id=1245`, source
  `geckoterminal.token_snapshot`,
  `observedAt=2026-05-08T23:53:30.002Z`, and `volume24h=0`.
- safe summary: `priceUsdPresent=true`, `fdvUsdPresent=true`,
  `reserveUsdPresent=true`, and `topPoolPresent=true`.
- Metric state moved from `metricsCount=1`, latestMetric `id=1244`, and
  `recentMetrics=1244` to `metricsCount=2`, latestMetric `id=1245`, and
  `recentMetrics=1245 -> 1244`.
- Token metadata and scoring fields did not change: `metadataStatus=partial`,
  `name=Papu`, `symbol=PAPU`, `scoreRank=C`, `scoreTotal=0`,
  `hardRejected=false`, and the enrich/rescore timestamps stayed
  `2026-05-08T22:38:21.819Z` / `2026-05-08T22:38:21.830Z`.
- Telegram, detect, watch, enrich/rescore, ops, systemd, checkpoint updates,
  scheduler / queue work, and additional Red commands were not invoked.
- planner, validator, tmux log, Red result, and post-check reports stayed
  rawJson-free and did not expose secret markers.

This completes the bounded detect -> enrich_rescore -> first_metric_snapshot
-> second_metric_snapshot human-gated path for Ffn2. It confirms first plus
second Metric time-series observation for the mint and does not promote
automatic Red execution, batch/watch operation, systemd, scheduler / queue, or
default checkpoint use.

### Ffn2 End-to-End Bounded Path Milestone

Ffn2 is the first documented end-to-end human-gated bounded path milestone for
this runbook. The confirmed sequence is intentionally stage-by-stage:

1. bounded detect write: created the mint-only Token with the isolated
   `/tmp/lowcap-gecko-detect-bounded.json` checkpoint and did not use the
   default checkpoint or write Metrics.
2. `enrich_rescore`: moved the Token from `mint_only` to `partial` as
   `Papu` / `PAPU`, kept score `C` / `0` and `hardRejected=false`, wrote no
   Metric, and sent no Telegram.
3. `first_metric_snapshot`: appended non-tmux Metric `id=1244` at
   `observedAt=2026-05-08T23:11:09.976Z`, moving `metricsCount` from 0 to 1
   with no Token field update.
4. `second_metric_snapshot`: appended tmux single-run Metric `id=1245` at
   `observedAt=2026-05-08T23:53:30.002Z`, moving `metricsCount` from 1 to 2
   with previous Metric `id=1244` preserved and no Token field update.
5. rawJson-free confirmation and docs consistency check: planner, validator,
   Red results, post reports, and docs records stayed free of Metric rawJson
   fields and secret markers.

The boundary remains human-gated. The guide / planner / validator CLIs are
non-executors; `approvalReady=true` and `canProceedToHumanGate=true` are
approval conditions only; each Red stage used exactly one approved command.
The first Metric write was the foreground single-mint command, while the
second Metric write was the strict `lowcap-gecko-metric-single` no-`--watch`
tmux single-run. This milestone does not implement an executor wrapper,
automatic Red execution, always-on operation, systemd, scheduler / queue,
unbounded watch, or default-checkpoint operation.

Reasonable next Green tasks are either to repeat the same path on the next
natural pump candidate, or to write down the remaining readiness gaps before
any always-on work. Systemd, scheduler / queue, unbounded watch, and default
checkpoint use remain out of scope for this milestone.

### MVP Reached / Readiness Gap

The bounded MVP is reached for the single-candidate, human-approved operating
unit only:

- one mint.
- one stage.
- one human gate.
- one exact Red command.
- rawJson-free confirmation.
- docs-only record after the Red task.

Do not widen this milestone into automation. `approvalReady=true` is not an
execution permit, guide / planner / validator are not executors, and the
printed Red command must not be run by those CLIs. The current MVP proves that
an operator can safely carry one candidate through the path; it does not prove
automatic Red execution, an executor wrapper, always-on operation, Telegram
loop delivery, systemd, scheduler / queue, unbounded watch, or default
checkpoint operation.

Readiness gaps before the next automation layer:

- default checkpoint policy: when it may be used, how it is initialized, and
  how to stop before accidental repo-local checkpoint mutation.
- restart / resume policy: what state is authoritative after process exit,
  partial success, rate limit, or operator interruption.
- multiple candidate handling: how selection, ordering, count limits, and
  same-cycle dedupe work before a runner can touch more than one mint.
- retry / failure handling: which failures are retryable, how many retries are
  allowed, and when a retry becomes a new human-gated task.
- duplicate prevention: how Token and Metric uniqueness is checked across
  detect, enrich/rescore, and snapshot stages.
- log retention and secret-free logging: where logs live, how long they are
  kept, and what must never be copied from stdout, stderr, journal, or capture
  files.
- Telegram loop policy: send conditions, duplicate prevention, cooldown,
  failed-send handling, and capture-only rehearsal before live loop delivery.
- systemd unit design: restart mode, env policy, journal policy, stop command,
  and first-run bounded shape.
- scheduler / queue boundary: what remains single-process CLI work, what a
  queue would own, and what must stay human-gated.
- unbounded watch safety: exact count limits, stop conditions, checkpoint
  behavior, rate-limit behavior, and operator visibility before any unlimited
  loop.

Recommended next order:

1. docs-only readiness gap fixed.
2. read-only design preflight for an executor wrapper.
3. non-executor wrapper / dry-run planner shape.
4. bounded executor prototype only after human gate rules are fixed.
5. systemd / scheduler / queue only after restart, retry, and checkpoint
   policy are fixed.

### Executor Boundary / Wrapper Readiness

The next wrapper step is a design boundary, not automatic execution. The current
MVP can support a non-executor wrapper / dry-run planner that prepares the
human gate, but it must preserve the same one-mint, one-stage, one-command
operating unit.

Allowed responsibilities for a non-executor wrapper / dry-run planner:

- render stage order.
- render expected guards.
- render `sideEffectUpperBound` / `sideEffectUpperBoundSpec`.
- render stop conditions.
- generate the approval request.
- generate review command strings for baseline, guide, planner, validator, and
  report confirmation.
- keep Red execution as a placeholder with `exactCommand=null`.

Forbidden responsibilities for that wrapper:

- execute existing CLIs.
- execute `nextRedCommand` or any Red command.
- write DB, Token, or Metric rows.
- send Telegram.
- start tmux.
- update checkpoints.
- touch systemd, scheduler / queue, or unbounded watch.

A bounded executor prototype is a later milestone and is still unimplemented.
Before it exists, the project must fix the default checkpoint policy, restart /
resume policy, partial-success handling, retry / failure handling, duplicate
prevention across Token and Metric writes, log retention, secret-free logging,
Telegram send / duplicate / cooldown / failed-send policy, capture-only
rehearsal, and multi-candidate handling. The prototype must not bypass the
human gate, and it must not start as a multi-mint runner, queue worker, systemd
service, or unbounded watch.

Systemd, scheduler / queue, and unbounded watch are further downstream than a
bounded executor prototype. Do not enter that layer until restart / recovery,
duplicate prevention, checkpoint behavior, and secret-free logging are fixed.
Existing Telegram checks do not make Telegram live-loop integration ready; the
wrapper boundary excludes Telegram until send conditions, duplicate prevention,
cooldown, failed-send handling, capture-only rehearsal, and secret-free logging
are fixed.

### Non-Executor Wrapper / Dry-Run Planner

`ops:gecko:bounded-flow:plan` is implemented as the non-executor wrapper /
dry-run planner CLI for this shape:

```bash
pnpm -s ops:gecko:bounded-flow:plan -- --mint <MINT> --intent <INTENT>
```

The purpose is to prepare the operator-facing human gate, not to build a
bounded executor. It does not execute existing CLIs, guide, planner, validator,
`nextRedCommand`, or any Red command. It does not connect to DB / Prisma /
network, use child-process execution, read or write files, attach `--write` or
`--watch`, start tmux, send Telegram, update checkpoints, or touch systemd /
scheduler / queue / unbounded watch behavior.

Initial scope:

- one mint.
- one stage.
- one human gate.
- one later exact Red command, supplied outside this CLI after human gate.
- rawJson-free confirmation requirements.
- docs record after any approved Red task.
- no multi-mint runner, queue, or automatic execution.

Implemented input shape:

```json
{
  "mint": "<MINT>",
  "intent": "enrich_rescore | first_metric_snapshot | second_metric_snapshot",
  "expectedMetricsCount": 0,
  "expectedMetadataStatus": "mint_only | partial",
  "expectedStage": "mint_only_without_metrics | partial_without_metrics | partial_with_one_metric",
  "operatorMode": "human_gated"
}
```

`detect write` is not part of the initial wrapper scope because checkpoint,
restart, and resume policy are still unresolved. The implemented intent set is
limited to `enrich_rescore`, `first_metric_snapshot`, and
`second_metric_snapshot`.

Default guard values:

| intent | expectedMetricsCount | expectedMetadataStatus | expectedStage |
| --- | ---: | --- | --- |
| `enrich_rescore` | 0 | `mint_only` | `mint_only_without_metrics` |
| `first_metric_snapshot` | 0 | `partial` | `partial_without_metrics` |
| `second_metric_snapshot` | 1 | `partial` | `partial_with_one_metric` |

If an explicit guard conflicts with the intent default, the CLI returns
`status=stop`, includes `intent conflict` in `reason`, and keeps
`willExecute=false`.

Implemented output shape:

```json
{
  "status": "ok | stop",
  "reason": "<human-readable reason>",
  "mode": "non_executor_wrapper",
  "willExecute": false,
  "executor": "human",
  "mint": "<MINT>",
  "intent": "<INTENT>",
  "operatorMode": "human_gated",
  "expectedMetricsCount": 0,
  "expectedMetadataStatus": "mint_only | partial",
  "expectedStage": "mint_only_without_metrics | partial_without_metrics | partial_with_one_metric",
  "currentStage": null,
  "nextStage": null,
  "stageOrder": [
    "baseline",
    "guide",
    "planner",
    "validator",
    "human_gate",
    "red_execution",
    "report_confirmation",
    "docs_record"
  ],
  "commands": {
    "baseline": ["..."],
    "guide": "...",
    "planner": "...",
    "validator": "...",
    "redExecution": {
      "placeholder": true,
      "exactCommand": null
    },
    "reportConfirmation": ["..."]
  },
  "approvalRequest": {
    "requiredFields": [
      "repo_state",
      "baseline",
      "guide_result",
      "planner_result",
      "validator_result",
      "exact_red_command",
      "side_effect_upper_bound",
      "stop_conditions",
      "rawjson_free_confirmation",
      "not_executed_list"
    ]
  },
  "sideEffectUpperBoundSpec": {
    "metricWriteMax": 0,
    "tokenWrite": false,
    "tokenWriteMax": 0,
    "telegramSend": false,
    "tmux": false,
    "tmuxSession": null,
    "checkpointWrite": false,
    "systemd": false,
    "multiMint": false
  },
  "stopConditionCodes": ["..."],
  "forbidden": ["..."],
  "rawJsonFreeRequired": true
}
```

All command fields are strings for operator review only. The wrapper does not
execute `guide`, `planner`, `validator`, `nextRedCommand`, or any existing CLI.
Because it performs no DB read, `currentStage` and `nextStage` are always
`null`; stage selection remains the job of the separate read-only planner.
For `status=ok`, `commands` is present, `redExecution` stays a placeholder with
`exactCommand=null`, and `willExecute=false` is mandatory. For `status=stop`,
`commands=null`; `redExecution` and `exactCommand` are not output. This is the
safe stop shape: no concrete tmux command, no `--write` Red command, and no
human gate / Red execution path is printed. `status` and `reason` carry the
stop cause, including intent-conflict stops, while `stopConditionCodes` remains
the pre-human-gate checklist. The actual exact Red command belongs only in the
human-gate approval request and a later separate Red task; this CLI does not
print concrete tmux commands or `--write` Red commands in `redExecution`.

Test coverage note: `1ae2fd4` fixes this stop output safety in
`tests/geckoterminalBoundedFlowPlan.test.ts` via `assertStopOutputSafety`.
Covered stop cases include missing `--mint`, missing `--intent`, invalid /
duplicate `--intent`, invalid expected guard args, and intent-conflict stops.
The assertion keeps `commands=null`, common non-executor fields,
`stopConditionCodes` / `forbidden`, rawJson-free output, and no
`exactCommand`, concrete tmux command, Metric snapshot command, enrich-rescore
command, or detect command. The ok path remains unchanged:
`commands.redExecution.placeholder=true` with `exactCommand=null`.

Consistency check note: `ba8792b` has been checked against docs,
implementation, and tests. The three sources agree that `status=stop` means
`commands=null`, no `redExecution`, no `exactCommand`, and no concrete command,
while `status=ok` keeps commands plus `redExecution.placeholder=true` and
`exactCommand=null`. `stopConditionCodes` remains a human-gate checklist,
`forbidden` remains wrapper-specific, and the CLI remains a non-executor
planning aid rather than an executor wrapper or automatic Red runner.

Read-only recheck note: `fa3ccac` has also passed docs consistency for the same
boundary. The docs agree that ok output includes commands with
`redExecution.placeholder=true` and `exactCommand=null`, while stop output is
`commands=null` with no `redExecution`, no `exactCommand`, and no concrete
command. This recheck did not change the non-executor boundary and does not
promote automatic Red execution, executor wrapper, always-on operation,
systemd, scheduler / queue, unbounded watch, or default checkpoint operation.

Checklist-style `stopConditionCodes` should include at least:

- `git_dirty`
- `head_mismatch`
- `origin_mismatch`
- `mint_missing_or_ambiguous`
- `intent_missing_or_invalid`
- `guard_mismatch`
- `metadata_status_mismatch`
- `metrics_count_mismatch`
- `expected_stage_mismatch`
- `planner_status_not_ok`
- `validator_not_approval_ready`
- `next_red_command_missing`
- `next_red_command_kind_mismatch`
- `side_effect_bound_exceeded`
- `selected_count_gt_1`
- `written_count_gt_1`
- `error_count_gt_0`
- `rawjson_output_risk`
- `secret_output_risk`
- `telegram_expansion_risk`
- `ops_expansion_risk`
- `systemd_expansion_risk`
- `scheduler_queue_expansion_risk`
- `unbounded_watch_expansion_risk`
- `default_checkpoint_expansion_risk`
- `multi_mint_expansion_risk`

These codes are a human-gate checklist, not an active error list. Actual stop
state is represented by `status=stop` and `reason`.

Wrapper-specific forbidden list:

- existing CLI execution by wrapper.
- planner execution by wrapper.
- validator execution by wrapper.
- `nextRedCommand` execution.
- Red command execution.
- `--write` execution.
- `--watch` execution.
- tmux start.
- Telegram send.
- systemd.
- scheduler.
- queue.
- unbounded watch.
- default checkpoint.
- multi-mint.
- silent retry.

The current bounded-flow guide has a narrower historical forbidden list. The
larger list above is implemented by `ops:gecko:bounded-flow:plan` as the
wrapper-specific forbidden checklist; it does not mean the wrapper performs or
authorizes any of those actions.

Intent-specific `sideEffectUpperBoundSpec`:

`enrich_rescore`:

- `metricWriteMax=0`
- `tokenWrite=true`
- `tokenWriteMax=1`
- `telegramSend=false`
- `tmux=false`
- `checkpointWrite=false`
- `systemd=false`
- `multiMint=false`

`first_metric_snapshot`:

- `metricWriteMax=1`
- `tokenWrite=false`
- `tokenWriteMax=0`
- `telegramSend=false`
- `tmux=false`
- `checkpointWrite=false`
- `systemd=false`
- `multiMint=false`

`second_metric_snapshot`:

- `metricWriteMax=1`
- `tokenWrite=false`
- `tokenWriteMax=0`
- `telegramSend=false`
- `tmux=true`
- `tmuxSession=lowcap-gecko-metric-single`
- `checkpointWrite=false`
- `systemd=false`
- `multiMint=false`

Read-only smoke confirmation:

- Target mint:
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`.
- All three supported intents returned `status=ok`,
  `mode=non_executor_wrapper`, `willExecute=false`, `executor=human`,
  `operatorMode=human_gated`, `currentStage=null`, `nextStage=null`,
  `redExecution.placeholder=true`, `redExecution.exactCommand=null`,
  `stopConditionCodes`, `forbidden`, and `rawJsonFreeRequired=true`.
- `enrich_rescore` returned default guards
  `expectedMetricsCount=0`, `expectedMetadataStatus=mint_only`,
  `expectedStage=mint_only_without_metrics`, with `tokenWrite=true`,
  `tokenWriteMax=1`, `metricWriteMax=0`, and `tmux=false`.
- `first_metric_snapshot` returned default guards
  `expectedMetricsCount=0`, `expectedMetadataStatus=partial`,
  `expectedStage=partial_without_metrics`, with `metricWriteMax=1`,
  `tokenWrite=false`, and `tmux=false`.
- `second_metric_snapshot` returned default guards
  `expectedMetricsCount=1`, `expectedMetadataStatus=partial`,
  `expectedStage=partial_with_one_metric`, with `metricWriteMax=1`,
  `tokenWrite=false`, `tmux=true`, and
  `tmuxSession=lowcap-gecko-metric-single`.
- The smoke output kept `redExecution.exactCommand=null`, printed no concrete
  tmux `new-session` command, printed no concrete `--write` Red command in
  `redExecution`, and did not expose an exact `"rawJson":` field. The
  `rawJsonFreeRequired=true` field is the expected specification marker.
- The smoke did not execute existing CLIs, guide, planner, validator,
  `nextRedCommand`, or any Red command. It did not write DB / Token / Metric
  rows, send Telegram, run watch, start tmux, touch checkpoints, or touch
  systemd / scheduler / queue / unbounded watch / default checkpoint behavior.

### Red Approval Request Template

After the guide, planner, and validator steps, use this copy-paste template for
the upstream Red approval request. `approvalReady=true` and
`canProceedToHumanGate=true` only mean the request may move to the human gate;
they do not authorize automatic execution. Run the exact command only in a
separate Red task after approval, and keep Red execution separate from docs
commit / push.

```text
Red approval request: GeckoTerminal single-mint follow-up

Repo state:
- pwd: /home/mochi/projects/lowcap-bot
- git status --short --branch: <STATUS>
- HEAD: <SHA> <SUBJECT>
- working tree clean: <true|false>

Target mint:
- mint: <MINT>

Baseline:
- metadataStatus: <mint_only|partial|enriched>
- source: <SOURCE>
- name / symbol: <NAME> / <SYMBOL>
- scoreRank / scoreTotal: <RANK> / <TOTAL>
- hardRejected: <true|false>
- metricsCount: <N>
- latestMetric: id=<ID|null>, source=<SOURCE|null>, observedAt=<ISO|null>
- recentMetrics: <IDS_OR_SUMMARY>

Planner result:
- currentStage: <STAGE>
- nextStage: <STAGE|null>
- nextRedCommandKind: <KIND|null>
- nextRedCommand: <EXACT_COMMAND|null>
- requiresHumanApproval: <true|false>
- executor: <human|none>
- willExecute: false
- sideEffectUpperBound: <TEXT|null>
- sideEffectUpperBoundSpec: <JSON>
- stopConditionCodes: <CODES>

Validator result:
- approvalReady: <true|false>
- canProceedToHumanGate: <true|false>
- checks: <JSON>

rawJson-free / secret check:
- rawJson field present: false
- raw payload present: false
- secret marker present: false

Not executed in this request:
- nextRedCommand: not executed
- DB write: not executed
- Metric write: not executed
- Token write: not executed
- Telegram send: not executed
- watch: not executed
- tmux: not started
- systemd: not touched
- checkpoint: not updated

Red approval target:
- exact command: <EXACT_COMMAND>

Side-effect upper bound:
- mint scope: exactly one mint, <MINT>
- write scope: <nextRedCommandKind-specific bound, e.g. Metric append max 1 or Token write max 1>
- Telegram / watch / systemd / scheduler / queue / default checkpoint: none

Stop conditions:
- git dirty
- guard mismatch
- selectedCount > 1
- writtenCount > 1
- errorCount > 0
- rawJson / secret output
- Telegram / ops / systemd / scheduler / queue expansion
- unbounded watch / default checkpoint expansion
```

If `approvalReady=false`, `canProceedToHumanGate=false`, or
`nextRedCommand=null`, do not request Red execution. If approval is granted,
the follow-up Red task runs exactly one copied command and then stops for
rawJson-free report confirmation. Record the passed result in a later Green
docs-only task.

### Triple-Guard Planner Gated Operation Milestone

The current milestone is the strict planner-gated single-mint flow, not a broad
automation runtime. For Red execution preflight, use all three guards whenever
the intended stage is known:

```bash
pnpm -s ops:gecko:single-candidate:plan -- --mint <MINT> --expectedMetricsCount <EXPECTED_COUNT> --expectedMetadataStatus <EXPECTED_STATUS> --expectedStage <EXPECTED_STAGE>
```

The milestone is complete only when:

- `guard_mismatch`, `invalid_args`, and `manual_review_required` stop before
  Red.
- `nextRedCommand=null` stops before Red.
- the planner only prints `nextRedCommand`; it never starts tmux or runs a Red
  command.
- a separate human-approved Red task runs exactly one copied command.
- Red execution and docs commit / push remain separate tasks.
- strict `lowcap-gecko-metric-single` execution has one mint, no `--watch`,
  `writtenCount=1`, at most one Metric append, rawJson-free report
  confirmation, and no Token field update.

Confirmed milestone evidence:

- `H2RJiUGeB9LUeAHhKp2JZc836oGonhAYYgB5QPxCpump` passed
  `--expectedMetricsCount 1 --expectedMetadataStatus partial --expectedStage partial_with_one_metric`
  with `currentStage=partial_with_one_metric` and
  `nextStage=second_metric_write_or_tmux_single`.
- after the separate human gate, the exact
  `lowcap-gecko-metric-single` command appended Metric `id=1151`, kept
  previous Metric `id=1102`, moved `metricsCount` from 1 to 2, reported
  `writtenCount=1`, and was confirmed rawJson-free.
- Token fields stayed `partial / REKT / REKT / C / 0 / hardRejected=false`.
- latest safe-presence false values such as `priceUsdPresent=false`,
  `fdvUsdPresent=false`, and `topPoolPresent=false` are observed
  availability in the saved snapshot, not failed Red gates.

Next-step comparison:

- A, more same-shape triple-guard Red reproductions: low priority now that the
  milestone has one guarded real-DB success.
- B, milestone docs整理: this section records that milestone.
- C, planner output / `nextRedCommand` safety hardening: completed for
  machine-readable approval / executor metadata; keep future changes docs-first.
- D, detect -> enrich/rescore -> metric bounded orchestration: good next
  design target after the safety contract is clear.
- E, systemd / unbounded watch / default checkpoint / scheduler / queue: hold.
  This milestone does not authorize those behaviors.

Planner-gated Red execution record:

- `7nuUe3Y4pC6PbwbUWe6NKkjaCcZxXa9UoNLYXSC1pump` is the first live operator
  selection flow that moved from planner output to a separate Red task. The
  baseline was `partial / INDIA KASHMIR RAID / Inkraid / C / 1 /
  hardRejected=false`, `metricsCount=1`, latestMetric `id=1114` with source
  `geckoterminal.token_snapshot`, and rawJson-free reports.
- The planner returned `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`, and only printed the
  `lowcap-gecko-metric-single` tmux single-mint command string. It did not
  execute the command.
- After the human approval gate, the exact `nextRedCommand` ran once as a
  separate Red task:

```bash
tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint 7nuUe3Y4pC6PbwbUWe6NKkjaCcZxXa9UoNLYXSC1pump --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"
```

- The run naturally exited as a no-`--watch` single-run, reported
  `selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
  `writtenCount=1`, and appended exactly one
  `geckoterminal.token_snapshot` Metric. The new Metric is `id=1138` at
  `observedAt=2026-05-01T16:56:49.272Z`, `volume24h=0`, with price / fdv /
  reserve / topPool presence all true. `metricsCount` moved from 1 to 2 with
  `recentMetrics` `1138 -> 1114`.
- `metrics:report -- --mint ... --limit 2` and `token:compare` confirmed
  `1138 -> 1114` rawJson-free. Token fields were unchanged, and Telegram /
  detect / watch / enrich / ops / systemd / checkpoint operations were not
  invoked. The Red execution remained separate from this docs commit / push.
- The same planner-gated Red pattern was reproduced for
  `GaUK8sUuGfLUD15sZmKhwtBk6Y9PHybdzUzYaSaLpump`. Its baseline was
  `partial / CheatGPT / CheatGPT / C / 0 / hardRejected=false`,
  `metricsCount=1`, latestMetric `id=1113` with source
  `geckoterminal.token_snapshot`, and rawJson-free reports. The planner again
  only printed `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`, and the
  `lowcap-gecko-metric-single` tmux single-mint command string; it did not
  execute the command. After the human approval gate, that exact command ran
  once as a separate Red task, naturally exited as a no-`--watch` single-run,
  reported `selectedCount=1`, `okCount=1`, `errorCount=0`,
  `writeEnabled=true`, and `writtenCount=1`, and appended Metric `id=1139` at
  `observedAt=2026-05-01T17:24:03.489Z` with source
  `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv / reserve /
  topPool presence all true. `metricsCount` moved from 1 to 2 with
  `recentMetrics` `1139 -> 1113`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields were
  unchanged, Telegram / detect / watch / enrich / ops / systemd / checkpoint
  operations were not invoked, and the Red execution remained separate from the
  docs commit / push.
- The first `--expectedMetricsCount 1` guarded planner-gated Red pattern was
  then confirmed for `7G1KRX4PvHWgJStBrsp8CVKEoZEVF336HTz6kjncpump`. Its
  baseline was `partial / Choice / 1# C / C / 0 / hardRejected=false`,
  `metricsCount=1`, latestMetric `id=1112` with source
  `geckoterminal.token_snapshot`, `observedAt=2026-04-28T14:35:42.952Z`, and
  `volume24h=0`. The planner command with `--expectedMetricsCount 1` passed
  with `status=ok`, actual `guards.metricsCount=1`,
  `currentStage=partial_with_one_metric`, and
  `nextStage=second_metric_write_or_tmux_single`; it only printed the
  `lowcap-gecko-metric-single` tmux single-mint command string. After the
  human approval gate, that exact command ran once as a separate Red task,
  naturally exited as a no-`--watch` single-run, reported `selectedCount=1`,
  `okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
  appended Metric `id=1140` at `observedAt=2026-05-01T17:46:40.309Z` with
  source `geckoterminal.token_snapshot`, `volume24h=0`, and price / fdv /
  reserve / topPool presence all true. `metricsCount` moved from 1 to 2 with
  `recentMetrics` `1140 -> 1112`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields were
  unchanged, Telegram / detect / watch / enrich / ops / systemd / checkpoint
  operations were not invoked, and the Red execution remained separate from the
  docs commit / push.
- The first dual-guard planner-gated Red pattern was then confirmed for
  `9zqkA49JLwKqZ94qRXRdxrdWppHspaksLa7F6imWpump`. Its baseline was
  `partial / Palantir Manifesto / Manifesto / C / 0 / hardRejected=false`,
  `metricsCount=1`, latestMetric `id=993` with source
  `geckoterminal.token_snapshot`, and
  `observedAt=2026-04-24T15:44:41.073Z`. The planner command with
  `--expectedMetricsCount 1 --expectedMetadataStatus partial` passed with
  `status=ok`, actual `guards.metricsCount=1`,
  `guards.metadataStatus=partial`, `currentStage=partial_with_one_metric`, and
  `nextStage=second_metric_write_or_tmux_single`; it only printed the
  `lowcap-gecko-metric-single` tmux single-mint command string. After the
  human approval gate, that exact command ran once as a separate Red task,
  naturally exited as a no-`--watch` single-run, reported `selectedCount=1`,
  `okCount=1`, `errorCount=0`, `writeEnabled=true`, and `writtenCount=1`, and
  appended Metric `id=1141` at `observedAt=2026-05-02T06:08:23.396Z` with
  source `geckoterminal.token_snapshot` and `volume24h=0`. The latest
  rawJson-free safe presence was `priceUsdPresent=false`,
  `fdvUsdPresent=false`, `reserveUsdPresent=true`, and
  `topPoolPresent=false`; the false values are an observed safe-summary state,
  not a failed Red gate. `metricsCount` moved from 1 to 2 with `recentMetrics`
  `1141 -> 993`; `metrics:report -- --mint ... --limit 2` and
  `token:compare` confirmed the result rawJson-free. Token fields were
  unchanged, Telegram / detect / watch / enrich / ops / systemd / checkpoint
  operations were not invoked, and the Red execution remained separate from the
  docs commit / push.
- The first triple-guard planner-gated Red pattern was then confirmed for
  `H2RJiUGeB9LUeAHhKp2JZc836oGonhAYYgB5QPxCpump`. Its baseline was
  `partial / REKT / REKT / C / 0 / hardRejected=false`, `metricsCount=1`,
  latestMetric `id=1102` with source `geckoterminal.token_snapshot`,
  `observedAt=2026-04-25T03:28:20.484Z`, and `volume24h=0`; the baseline
  safe summary had price / fdv / reserve / topPool present. The planner
  command with
  `--expectedMetricsCount 1 --expectedMetadataStatus partial --expectedStage partial_with_one_metric`
  passed with `status=ok`, actual `guards.metricsCount=1`,
  `guards.metadataStatus=partial`, `currentStage=partial_with_one_metric`, and
  `nextStage=second_metric_write_or_tmux_single`; it only printed the
  `lowcap-gecko-metric-single` tmux single-mint command string. After the
  human approval gate, that exact command ran once as a separate Red task,
  naturally exited as a no-`--watch` single-run with no tmux server remaining,
  reported `selectedCount=1`, `okCount=1`, `errorCount=0`,
  `writeEnabled=true`, and `writtenCount=1`, and appended Metric `id=1151` at
  `observedAt=2026-05-05T14:34:02.700Z` with source
  `geckoterminal.token_snapshot` and `volume24h=0`. The latest rawJson-free
  safe presence was `priceUsdPresent=false`, `fdvUsdPresent=false`,
  `reserveUsdPresent=true`, and `topPoolPresent=false`; the false values are
  an observed safe-summary state, not a failed Red gate. `metricsCount` moved
  from 1 to 2 with `recentMetrics` `1151 -> 1102`;
  `metrics:report -- --mint ... --limit 2` and `token:compare` confirmed the
  result rawJson-free. Token fields were unchanged, Telegram / detect / watch /
  enrich / ops / systemd / checkpoint operations were not invoked, and the Red
  execution remained separate from the docs commit / push.
- The first bounded orchestration Red record after
  `ops:gecko:bounded-flow:guide` was then confirmed for
  `9eSNHMiLdKtud379HEk73ug7DhVdqRXR5MgFZanzpump`. Its baseline was
  `partial / Magic Internet Money / MIM / C / 0 / hardRejected=false`,
  source `geckoterminal.new_pools`, `metricsCount=1`, and latestMetric
  `id=1005` at `observedAt=2026-04-24T16:51:33.585Z` with source
  `geckoterminal.token_snapshot`. The bounded-flow guide returned
  `status=ok`, `mode=non_executor_guide`, all steps `willExecute=false`, and
  `red_execution` as a placeholder. The triple-guard planner returned
  `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`,
  `nextRedCommandKind=tmux_metric_single_mint`,
  `requiresHumanApproval=true`, `executor=human`, and `willExecute=false`;
  the validator returned `approvalReady=true` and
  `canProceedToHumanGate=true`. These approvals did not auto-run anything.
  After the separate human gate, exactly one copied Red command ran as a
  separate task:

```bash
tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint 9eSNHMiLdKtud379HEk73ug7DhVdqRXR5MgFZanzpump --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"
```

- The run naturally exited as a no-`--watch` single-run with no tmux server
  remaining, created / updated `/tmp/lowcap-gecko-metric-single.log`, reported
  `selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
  `writtenCount=1`, and appended exactly one Metric: `id=1233` at
  `observedAt=2026-05-07T14:18:35.735Z`, source
  `geckoterminal.token_snapshot`, `volume24h=0`.
- The latest rawJson-free safe presence was `priceUsdPresent=false`,
  `fdvUsdPresent=false`, `reserveUsdPresent=true`, and
  `topPoolPresent=false`; these false values are observed snapshot
  availability, not a failed Red gate. `metricsCount` moved from 1 to 2 with
  `recentMetrics` `1233 -> 1005`; `metrics:report -- --mint ... --limit 2`
  and `token:compare` confirmed the result rawJson-free. Token fields were
  unchanged as `partial / Magic Internet Money / MIM / C / 0 /
  hardRejected=false`, Telegram / detect / watch / enrich / ops / systemd /
  checkpoint operations were not invoked, and this docs record remains a later
  Green follow-up separate from the Red execution.
- The first `--intent second_metric_snapshot` bounded-flow guide Red record was
  then confirmed for
  `GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump`. Its baseline was
  `partial / highest in the room / HIGHEST / C / 0 / hardRejected=false`,
  source `geckoterminal.new_pools`, `metricsCount=1`, latestMetric `id=688`
  with source `geckoterminal.token_snapshot`, and
  `observedAt=2026-04-21T14:00:50.063Z`; the baseline safe summary had price /
  fdv / reserve / topPool present. The bounded-flow guide returned
  `status=ok`, `intent=second_metric_snapshot`, `expectedMetricsCount=1`,
  `expectedMetadataStatus=partial`, `expectedStage=partial_with_one_metric`,
  all steps `willExecute=false`, and `red_execution` as a placeholder with no
  concrete tmux command. The planner returned
  `currentStage=partial_with_one_metric`,
  `nextStage=second_metric_write_or_tmux_single`,
  `nextRedCommandKind=tmux_metric_single_mint`,
  `requiresHumanApproval=true`, `executor=human`, and `willExecute=false`; the
  validator returned `approvalReady=true` and `canProceedToHumanGate=true`.
  These approvals did not auto-run anything. After the separate human gate,
  exactly one copied Red command ran as a separate task:

```bash
tmux new-session -d -s lowcap-gecko-metric-single "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --mint GvQqdiqq8TccXMz9BYCdx7EhXWbAxH4pezktC1oYpump --write > /tmp/lowcap-gecko-metric-single.log 2>&1'"
```

- The run naturally exited as a no-`--watch` single-run with no tmux server
  remaining, created / updated `/tmp/lowcap-gecko-metric-single.log`, reported
  `selectedCount=1`, `okCount=1`, `errorCount=0`, `writeEnabled=true`, and
  `writtenCount=1`, and appended exactly one Metric: `id=1243` at
  `observedAt=2026-05-08T13:46:44.319Z`, source
  `geckoterminal.token_snapshot`, `volume24h=0`.
- The latest rawJson-free safe presence was `priceUsdPresent=true`,
  `fdvUsdPresent=true`, `reserveUsdPresent=true`, and
  `topPoolPresent=true`. `metricsCount` moved from 1 to 2 with
  `recentMetrics` `1243 -> 688`; `metrics:report -- --mint ... --limit 2` and
  `token:compare` confirmed the result rawJson-free. Token fields were
  unchanged as `partial / highest in the room / HIGHEST / C / 0 /
  hardRejected=false`; enrich/rescore, Telegram, detect / watch, ops,
  systemd, checkpoint updates, additional tmux runs, and other mint processing
  were not invoked. This docs record remains a later Green follow-up separate
  from the Red execution, and systemd / scheduler / queue / unbounded watch /
  default checkpoint operation remain deferred.

Planner stop conditions:

- the mint is missing, ambiguous, or not a GeckoTerminal-origin candidate.
- `expectedMetricsCount` or `expectedMetadataStatus` does not match.
- the stage would require more than one mint.
- a dry-run needed for the next stage reports `errorCount > 0`,
  `writeEnabled=true`, or a write count above zero.
- the next Red command could report `selectedCount > 1`, `writtenCount > 1`, or
  update Token fields outside the selected stage.
- rawJson, raw payload, `.env`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, or
  `TELEGRAM_CHAT_ID` would be printed.
- the flow expands into Telegram, ops catchup, systemd, scheduler, queue worker,
  unbounded watch, or default checkpoint operation.
- `git status --short --branch` is dirty.

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
