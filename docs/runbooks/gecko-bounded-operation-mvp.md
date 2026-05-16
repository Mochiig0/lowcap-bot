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

- default checkpoint operation: the promotion gate is fixed, but the
  repo-local checkpoint is still unpromoted.
- restart / resume implementation: the operator policy is fixed, but runtime
  recovery remains unimplemented.
- multiple candidate handling: how selection, ordering, count limits, and
  same-cycle dedupe work before a runner can touch more than one mint.
- retry / failure implementation: operator retry policy is fixed, but runtime
  retry automation remains unimplemented.
- duplicate prevention enforcement: Token policy is fixed and Metric strict
  duplicate candidates are defined, but strict Metric enforcement is not
  implemented.
- log retention and secret-free runtime implementation: paste policy is fixed,
  but retention / rotation and journal behavior are not implemented.
- Telegram runtime implementation: docs policy is fixed, but durable dedupe
  storage, failed-send retry, cooldown automation, capture-only runtime
  integration, and live-loop integration remain unimplemented.
- systemd unit design: restart mode, env policy, journal policy, stop command,
  and first-run bounded shape.
- scheduler / queue boundary: what remains single-process CLI work, what a
  queue would own, and what must stay human-gated.
- unbounded watch safety: exact count limits, stop conditions, checkpoint
  behavior, rate-limit behavior, and operator visibility before any unlimited
  loop.

### Checkpoint / Restart / Duplicate-Prevention Policy

This is a docs-only policy boundary for the current human-gated MVP. It does
not promote default checkpoint operation, systemd, scheduler / queue, unbounded
watch, automatic Red execution, or a bounded executor prototype.

Checkpoint policy:

- `/tmp` checkpoint files are for bounded Red runs and rehearsals only. They
  isolate checkpoint movement from the repo-local default checkpoint and are
  not systemd / always-on persistent state.
- The default Gecko detect checkpoint remains
  `data/checkpoints/geckoterminal-new-pools.json`. It is not promoted yet and
  must not be used until initialization, restart, resume, failure, and log
  policy are fixed.
- `--checkpointFile` belongs to the `--watch --write` detect path. It is not a
  dry-run guard and must not be introduced into a write approval unless the
  checkpoint side effect is explicitly bounded.

Authoritative state policy:

- DB state is the first confirmation target for Token and Metric outcomes.
- A checkpoint cursor is only a detect cursor. It is not proof that Token or
  Metric writes succeeded.
- Docs records are operator logs, not runtime authoritative state.
- Latest Metric is Metric-stage evidence and does not replace the detect
  checkpoint or Token state.

Restart / resume gaps that still block always-on work:

- checkpoint advanced but DB write failed.
- DB write succeeded but checkpoint update failed.
- partial success in a multi-item or multi-stage operation.
- interruption after write but before report confirmation.
- interruption after Red execution but before docs record.

Until those cases have exact procedures, resume manually from read-only DB /
report confirmation and return to `bounded-flow:plan` -> planner -> validator
-> human gate for the next write.

Duplicate-prevention policy:

- Token duplicate prevention is currently backed by `Token.mint` uniqueness and
  the mint importer's existing-token path. `existingCount` is not a failure by
  itself; it means the candidate mapped to an already stored Token.
- Metric snapshot is a time-series append lane. Repeated same-mint snapshots
  are expected observations, not automatically duplicates.
- Strict same `tokenId` / source / `observedAt` is now the docs-level Metric
  duplicate candidate definition. Enforcement is not implemented yet; until it
  is, use `--minGapMinutes`, `metricsCount` guards, latest Metric
  confirmation, and human gate bounds.
- Multi-mint or queue execution needs per-item duplicate policy, ordering, and
  failure handling before it is allowed.

Retry / failure policy:

- `errorCount > 0` does not authorize automatic continuation.
- `selectedCount > 1` or `writtenCount > 1` is a stop condition for current
  single-mint bounded flows unless a separate approval explicitly raises the
  bound.
- Operator-level retry / cooldown and human-gate return conditions are fixed
  for bounded manual operation; runtime retry max count implementation and
  cooldown automation remain unresolved.
- After a failed or partial run, the interim procedure is to stop, inspect
  read-only reports, and rebuild the next approval through `bounded-flow:plan`,
  planner, validator, and human gate.

Log and secret-free policy:

- Keep rawJson-free reports and secret-marker checks.
- Use the Log / Secret-Free Policy below for pasted reports, docs records,
  tmux summaries, Telegram summaries, checkpoint summaries, and future journal
  excerpts.
- `/tmp` log retention / rotation implementation is not fixed.
- Journal / systemd readiness is not fixed.
- Do not paste `.env`, Telegram tokens, chat ids, raw env, raw stdout, raw
  stderr, or full command args that could contain secrets.

Telegram live-loop policy:

- Existing Telegram live-send confirmations do not make loop integration ready.
- Telegram live loop policy is fixed at the docs level, but runtime
  integration is still unimplemented.
- The initial live-send candidate is only `metric_appended`; `token_completed`
  and `loop_complete` remain capture-only.
- Telegram live loop is excluded from the initial always-on / executor design.

Systemd / scheduler / queue / unbounded watch gate:

- default checkpoint policy fixed.
- restart / resume policy fixed.
- retry / failure policy fixed.
- duplicate-prevention enforcement and queue idempotency fixed for Token,
  Metric, and multi-candidate execution.
- log / secret-free paste policy fixed, plus log retention / rotation and
  journal readiness fixed for the target runtime.
- Telegram loop policy fixed.
- Telegram duplicate notification storage, failed-send retry, cooldown
  automation, capture-only runtime integration, and live-loop integration fixed.
- multi-candidate ordering, count bounds, and per-item failure handling fixed.

Do not proceed to systemd, scheduler / queue, unbounded watch, default
checkpoint operation, bounded executor prototype, or automatic Red execution
while any item above is unresolved.

### Default Checkpoint Promotion Gate

This is a docs-only promotion gate. It defines when the GeckoTerminal detect
checkpoint may move from bounded `/tmp` rehearsal state to the repo-local
default checkpoint path. It does not create, update, or operate the default
checkpoint.

Checkpoint categories:

- `/tmp` checkpoint files are for bounded Red runs and rehearsals. They remain
  isolated from the repo-local default checkpoint and must not be treated as
  systemd, always-on, or persistent runtime state.
- The default Gecko detect checkpoint path is
  `data/checkpoints/geckoterminal-new-pools.json`. It remains unpromoted until
  every promotion prerequisite below is satisfied. Even after promotion, it is
  still a detect cursor, not proof that Token or Metric writes succeeded.

Promotion prerequisites:

- authoritative state / restart-resume policy fixed.
- duplicate-prevention policy fixed.
- retry / failure handling policy fixed.
- operator-level cooldown / retry max policy fixed.
- log retention and secret-free logging policy fixed.
- Telegram live loop explicitly excluded from the promotion path, or fixed as
  a separate policy.
- multi-candidate / queue policy fixed.
- DB / checkpoint mismatch stop conditions fixed.
- ambiguous write-result stop conditions fixed.
- partial-success stop conditions fixed.

Promotion must not mean:

- always-on ready.
- systemd ready.
- scheduler / queue ready.
- unbounded watch ready.
- automatic Red execution ready.
- Telegram live loop included.
- checkpoint is write success proof.
- restart / resume, retry, duplicate prevention, or recovery are solved by the
  checkpoint alone.

Initial promotion scope:

- bounded GeckoTerminal detect watch only.
- explicit `--watch --write`.
- explicit default checkpoint path.
- explicit bounded iteration such as `--maxIterations 1`.
- existing bounded constraints such as `--pumpOnly` and `--limit 1`.
- at most one mint-only Token side effect.
- `importedCount <= 1`.
- failed / error count is zero.
- DB read confirmation is required after the run.
- rawJson-free and secret-marker checks are required.
- human gate is required before any Red command.

Read-only preflight before a future promotion Red:

- `git status --short --branch` is clean.
- HEAD and origin match.
- Inspect whether the default checkpoint file exists without creating or
  updating it.
- If it exists, confirm its cursor value, update-time evidence, source /
  network / lane meaning, and that it is not a copied `/tmp` rehearsal cursor
  with unclear provenance.
- Confirm DB state for recent Token counts, the candidate mint, and the
  `existingCount` / `importedCount` meaning.
- Confirm docs still state that default checkpoint operation is unpromoted and
  that no previous Red run is unresolved.

Stop conditions for promotion:

- git dirty state.
- HEAD mismatch.
- origin mismatch.
- existing default checkpoint meaning is unclear.
- `/tmp` and default checkpoint state are mixed or confused.
- DB / checkpoint mismatch handling is unclear.
- promotion would contradict restart, retry, or duplicate policy.
- operation expands to multi-mint.
- Telegram live loop is added to the same step.
- operation jumps directly to systemd or unbounded watch.
- rawJson or secret-marker risk appears.
- `importedCount > 1`.
- `selectedCount > 1`.
- `errorCount > 0`.
- `failedCount > 0`.

Future Red side-effect upper bound for first create / update:

- live GeckoTerminal fetch.
- default checkpoint create / update at most once.
- bounded detect watch one cycle.
- `maxIterations=1`.
- `pumpOnly`.
- `limit=1`.
- mint-only Token creation at most one.
- `importedCount <= 1`.
- `failedCount=0`.
- no Metric write.
- no enrich / rescore.
- no Telegram.
- no tmux.
- no systemd.
- no scheduler / queue.
- no unbounded watch.

Relationship to systemd / queue / unbounded watch:

- Default checkpoint promotion gate is one readiness prerequisite, not
  readiness completion.
- It does not authorize systemd, scheduler / queue, unbounded watch, automatic
  Red execution, or a bounded executor prototype.
- Keep those paths on hold until restart, duplicate, retry, log, Telegram,
  multi-candidate, idempotency, and recovery policies are all satisfied in the
  intended runtime scope.

### Log / Secret-Free Policy

This is a docs-only policy for operator-visible output. It fixes what may be
summarized in docs, pasted reports, tmux summaries, Telegram summaries,
checkpoint summaries, and future journal excerpts. It does not implement
redaction, retention, rotation, systemd, default checkpoint operation, or
Telegram live-loop integration.

Safe-to-log fields:

- `status`.
- `reason`.
- `blockedBy`.
- `stopConditionCodes`.
- `selectedCount`.
- `writtenCount`.
- `importedCount`.
- `existingCount`.
- `errorCount`.
- `failedCount`.
- `okCount`.
- mint.
- `metricId`.
- source.
- `observedAt`.
- `metricsCount`.
- latest Metric id / source / `observedAt`.
- `rateLimited`.
- `cooldownSeconds`.
- `maxIterations`.
- `limit`.
- `pumpOnly`.
- checkpoint safe summary: path, source, cursor timestamp / pool address,
  existence, and mtime.
- rawJson-free safe summary booleans.

Never-log fields:

- `.env` contents.
- `DATABASE_URL`.
- `TELEGRAM_BOT_TOKEN`.
- `TELEGRAM_CHAT_ID`.
- Telegram API URL containing a bot token.
- raw env / `process.env`.
- raw stdout blobs.
- raw stderr blobs.
- full command args when secrets or env values may appear.
- exact `"rawJson":` payload.
- raw API response body.
- raw payload.
- metadata raw object.
- any line or blob containing a secret marker.

Marker check / stop condition:

- If an exact `"rawJson":` field, raw payload marker, or secret marker appears,
  do not paste that line or blob.
- If a marker appears in a candidate report, stop before Red, docs record,
  Telegram live send, default checkpoint promotion, or systemd promotion.
- Return to human gate with a safe reason such as `unsafe marker detected`.
- `rawJsonFreeRequired` and `rawjson_output_risk` are safe checklist codes.
  The unsafe material is the raw field, raw payload, or secret-bearing output.

`/tmp` log policy:

- `/tmp` logs are auxiliary evidence for bounded runs.
- Do not paste raw logs wholesale.
- Prefer extracted safe summaries.
- If a small excerpt is needed, keep it to the minimum tail or grep result
  needed for counts / status and run the marker check before pasting.
- Retention, rotation, maximum size, and deletion timing are not implemented
  or fixed for runtime automation.
- Re-evaluate retention, rotation, and log level before systemd or unbounded
  watch.

Systemd journal policy:

- Assume systemd journal will retain stdout and stderr.
- Do not paste raw `journalctl` output wholesale.
- Journal excerpts used in docs must be limited to safe-to-log fields.
- Service env, `.env`, Telegram credentials, `DATABASE_URL`, raw env, and full
  secret-bearing args must not appear in journal or docs.
- This policy does not make systemd ready; journal redaction / retention
  implementation remains a later gate.

Telegram output handling:

- Safe Telegram send summaries are limited to fields such as `status`,
  `errorCode`, `sentCount`, trigger, mint, and `metricId`.
- Never log Telegram response bodies, request paths containing bot tokens,
  bot tokens, or chat ids.
- Capture-only records and live sends are separate boundaries.
- Duplicate notification prevention, failed-send retry, Telegram cooldown, and
  live-loop integration remain later policy / implementation gaps.

Checkpoint file output handling:

- Checkpoint files are not expected to contain secrets, but do not paste raw
  checkpoint files by default.
- Use a safe summary: path, source, cursor, existence, and mtime.
- Always state that a checkpoint is a detect cursor, not write success proof.
- Keep marker checks before default checkpoint promotion.

Docs record / report paste rule:

- Docs records should contain safe summaries only.
- Do not paste raw stdout / stderr, raw API responses, full JSON blobs,
  secret-bearing lines, or raw payloads.
- If output safety is uncertain, omit the output and record the stop reason
  with a safe marker such as `unsafe marker detected`.

Relationship to future work:

- This policy is a gate for systemd, default checkpoint promotion, and
  Telegram live-loop work.
- It does not make systemd ready, default checkpoint operation ready, Telegram
  live-loop ready, or unbounded watch ready.
- Log redaction implementation, journal retention / rotation implementation,
  Telegram failed-send handling, and automated secret scanning remain future
  Yellow or Red-adjacent tasks depending on scope.

### Telegram Live Loop Policy

This is a docs-only policy for Telegram notification boundaries. It fixes the
initial send conditions, duplicate key, cooldown meaning, failed-send handling,
capture-only rehearsal, and safe message summary rules. It does not send
Telegram, implement a live loop, implement durable dedupe, implement failed-send
retry, start systemd, start a queue, use unbounded watch, or operate the default
checkpoint.

Initial send condition:

- The only initial live-send candidate is `metric_appended`.
- DB read confirmation must already show the expected one mint and one Metric.
- `metricId` must exist.
- `errorCount=0`, with no ambiguous write result.
- Capture-only rehearsal for the same trigger and message shape must already
  pass.
- Secret-free and rawJson-free marker checks must pass.
- Live send is allowed only after a human gate.
- `token_completed` and `loop_complete` remain capture-only.

Duplicate notification prevention:

- The initial duplicate key is `mint + eventType + metricId`.
- Events without `metricId` are not live-send candidates and stay capture-only.
- The same duplicate key must not be sent twice.
- Docs records are auxiliary operator logs. DB state and capture records are
  the confirmation inputs for the current human-gated scope.
- Durable dedupe storage, queue idempotency, and notification-key persistence
  are not implemented. Fix them before queue or systemd work.

Cooldown policy:

- Telegram cooldown is separate from Red retry / cooldown policy.
- It is not automatic retry.
- Treat cooldown as same-key / same-mint / same-event suppression and
  human-recheck timing only.
- Initial policy is human-approved only, with no automatic resend.
- Runtime cooldown automation is not implemented.

Failed-send handling:

- Use only safe summary fields such as `status`, `errorCode`, `sentCount`,
  trigger, mint, and `metricId`.
- Never log Telegram response body, request path, bot token, chat id, or a
  token-containing URL.
- Do not automatically retry failed sends.
- Confirm DB state, record a safe failed-send summary, and return to human
  gate.
- Commit `a5d1575` adds a manual retry path for
  `notification:send --retryFailed`, limited to one notificationKey-specified
  `metric_appended` `failed` / `live_send` row. Failed-send retry automation
  remains a later implementation gap; use the failed-send / resend policy below
  for the human-gated boundary.

Capture-only rehearsal:

- Before live send, capture-only must be confirmed for the same trigger and
  message shape.
- Capture output is limited to safe summaries: trigger, mint, `metricId`, and
  message preview.
- If a secret marker or rawJson marker appears, do not live-send; return to
  human gate.
- Capture-only and live send remain separate boundaries.

Message content / safe summary:

- Use safe-to-log fields only: trigger, mint, name / symbol, score summary,
  `hardRejected`, `metricsCount`, latest Metric id / source / `observedAt`,
  `metricId`, source, and status.
- Do not include raw payload, raw API response, exact `"rawJson"` payload,
  secret-bearing output, bot token, chat id, or token-containing URL.
- Avoid URL and raw metadata fields in the initial live message.

Stage-specific Telegram policy:

- Detect write: no live send; capture-only can be considered later.
- `enrich_rescore`: `token_completed` remains capture-only; no live send yet.
- Metric snapshot: `metric_appended` is the only initial live-send candidate.
- Tmux single-run: not a Telegram lane; require a separate DB-confirmed gate
  before any notification work.
- Ops / catchup: keep existing preview / capture / gated-send boundaries.
- Systemd loop: out of scope and unimplemented.

Never include in this policy:

- systemd / scheduler / queue / unbounded watch.
- default checkpoint promotion.
- automatic Red execution.
- bounded executor prototype.
- retry automation.
- raw Telegram response body, token, chat id, or token-bearing request path.

Relationship to future work:

- This policy is one readiness prerequisite, not live-loop readiness.
- Future work still includes durable duplicate notification storage,
  failed-send retry policy / implementation, runtime cooldown automation,
  queue idempotency, systemd recovery, and capture-only runtime integration.

### Multi-Candidate / Queue Pre-Gate Policy

This is a docs-only pre-gate policy. It defines what must be true before the
bounded Gecko flow can expand from one operator-approved item into
multi-candidate, queue, scheduler, systemd, or unbounded watch work. It does
not implement a queue, scheduler, systemd unit, durable worker, durable
notification dedupe storage, Telegram live loop, default checkpoint operation,
or any new write behavior.

Current safe unit:

- one mint.
- one stage.
- one human gate.
- one exact Red command.
- rawJson-free / secret-free confirmation.
- docs record.
- multi-mint, queue, scheduler, and systemd execution remain unapproved.

Queue pre-gate:

Before queue or multi-candidate execution, these policies must be fixed for the
target runtime:

- per-mint Token dedupe.
- per-Metric strict duplicate policy and enforcement.
- durable notification dedupe.
- capture-only rehearsal consistency.
- per-item failure handling.
- retry max count / cooldown.
- item ordering.
- idempotency key.
- queue persistence.
- restart / resume.
- checkpoint / DB mismatch handling.
- log / secret-free policy.
- Telegram capture / live boundary.

Durable notification dedupe policy:

- The initial live candidate remains `metric_appended`.
- The initial notification key is `mint + eventType + metricId`.
- Events without `metricId` are not live-send candidates.
- `token_completed` and `loop_complete` remain capture-only.
- The same key must not be sent twice.
- Durable storage is not implemented.
- Docs record is an auxiliary audit log, not durable dedupe state.
- Capture record and DB state are confirmation inputs, not the queue runtime's
  canonical dedupe store.
- Before queue work, separately fix durable dedupe storage and the
  idempotency-key behavior.

Capture-only rehearsal relationship:

- Capture-only is required before live send.
- Capture-only pass alone does not complete durable dedupe.
- Capture output is limited to safe summaries: trigger, mint, `metricId`, and
  message preview.
- If rawJson or secret markers appear, do not proceed to live send.
- Capture-only consistency is fixed by the policy below; runtime integration
  and durable dedupe storage remain later work.

Per-item failure handling:

- Queue work needs item-level `success`, `failure`, `skipped`, `duplicate`,
  and `retry-blocked` states before implementation.
- `errorCount > 0`, partial success, and ambiguous write result are item-level
  stop conditions.
- Do not automatically move to the next item or next stage.
- Return to human gate when the current item cannot be classified safely.

Ordering / idempotency:

- Queue item ordering is not fixed.
- Discovery order, `createdAt`, `detectedAt`, priority score, and manual
  operator selection remain candidates.
- Idempotency keys are not implemented.
- Initial idempotency-key candidates are:
  - Token stage: mint + stage.
  - Metric stage: mint + stage + expected metrics count.
  - Notification stage: mint + event type + `metricId`.

Retry / cooldown relationship:

- Operator-level Red retry max remains automatic `0`.
- Queue retry is not implemented.
- Cooldown automation is not implemented.
- Before queue worker work, separately fix item-level retry max and cooldown
  semantics.

Checkpoint / restart relationship:

- After restart, DB state remains the first confirmation target.
- A checkpoint remains a detect cursor, not success proof.
- DB / checkpoint mismatch does not allow queue auto-resume.
- Default checkpoint operation has not started.
- Queue, scheduler, and systemd need item-level restart / resume policy before
  implementation.

Telegram policy relationship:

- `metric_appended` remains the only initial live candidate.
- `token_completed` and `loop_complete` remain capture-only.
- Failed-send retry is not implemented.
- Do not turn Telegram into a live loop until durable notification dedupe and
  capture-only rehearsal consistency are fixed for the target runtime.

Stop conditions before queue:

- duplicate decision cannot be made.
- per-item failure handling is not fixed.
- ordering is not fixed.
- idempotency key is not fixed.
- retry / cooldown behavior is not fixed for queue runtime.
- checkpoint / DB mismatch appears.
- Telegram dedupe is not fixed for the intended runtime.
- capture-only runtime integration is not fixed.
- raw log or secret-free policy is violated.
- multi-mint expansion risk.
- systemd, scheduler, or unbounded watch expansion risk.

Not fixed / future work:

- durable queue runtime.
- durable notification dedupe storage.
- queue idempotency.
- scheduler.
- systemd.
- unbounded watch.
- default checkpoint operation.
- Telegram live loop integration.
- capture-only runtime integration.

### Capture-Only Rehearsal Consistency Policy

This is a docs-only policy for the Telegram rehearsal gate before any later
live send, queue worker, scheduler, systemd service, unbounded watch, or
default checkpoint operation. It does not run capture-only commands, send
Telegram messages, implement durable dedupe storage, or change runtime code.

Position:

- Capture-only is required before live send.
- Capture-only and live send are separate boundaries.
- Capture-only pass alone does not complete durable dedupe.
- Capture records are rehearsal evidence.
- Docs records are operator audit logs.
- Neither capture records nor docs records are durable dedupe stores.

Capture-only pass conditions:

- `trigger` is expected.
- `eventType` is expected.
- `mint` matches the target mint.
- For `metric_appended`, `metricId` is present.
- The duplicate key can be computed:
  - `metric_appended`: mint + event type + `metricId`.
- The message preview stays within safe-summary fields.
- No rawJson, raw payload, or secret marker is present.
- The capture content does not conflict with DB read confirmation.
- Fields required for the human gate are present.
- The flow is not attempting to live-send `token_completed` or
  `loop_complete`.

Capture-only fail conditions:

- `metric_appended` is missing `metricId`.
- `token_completed` or `loop_complete` is being treated as live-send ready.
- The duplicate key cannot be computed.
- `eventType` or `trigger` is unknown.
- The message preview contains rawJson, raw payload, or a secret marker.
- DB state and capture content conflict.
- `mint` does not match the target mint.
- `metricsCount`, latest Metric, or `metricId` does not match expectation.
- The output does not match the current count bound or stage.
- The message preview exceeds safe-to-log fields.
- Durable dedupe state is required but unavailable.

Event policy:

- `metric_appended` is the only initial live-send candidate, and only after
  capture-only pass, DB read confirmation, marker checks, and human gate.
- `token_completed` remains capture-only because it has no `metricId` key for
  the initial live-send lane.
- `loop_complete` remains capture-only because it has no `metricId` key for
  the initial live-send lane.
- Failed-send records may use only safe summaries such as status, error code,
  and sent count. They do not authorize automatic retry.
- Detect candidates are not initial live-send candidates.
- Enrich / rescore results are not initial live-send candidates.
- Systemd loops are out of scope and unimplemented.

Message preview safe summary:

- Allowed candidates: trigger, event type, mint, `metricId`, name / symbol,
  score summary, `hardRejected`, `metricsCount`, latest Metric id / source /
  observedAt, status / reason, sent count, and error code.
- Avoid in the initial live message: URL, raw metadata, raw API response, raw
  payload, exact rawJson, secrets, bot token, chat id, and token-bearing URL.
- Preview should remain a short safe summary. Do not paste a long full message
  or raw blob. If truncation is needed, treat it as a later implementation
  detail; truncation automation is not implemented here.

Duplicate key relationship:

- The `metric_appended` duplicate key is mint + event type + `metricId`.
- Capture-only pass requires the duplicate key to be computable.
- The same key must not be sent twice.
- Capture records are not durable dedupe stores.
- Durable dedupe storage and runtime idempotency keys are not implemented and
  remain later work.

DB read confirmation relationship:

- Compare capture content against DB state before live send.
- If `metricId` does not match latest Metric, do not live send.
- If `metricsCount` is not expected, do not live send.
- If `mint` does not match the target, do not live send.
- If DB read confirmation is unavailable, return to human gate.

Return to human gate when:

- capture-only fails.
- marker check fails.
- duplicate key is missing.
- DB state mismatches capture content.
- `metricId` is missing.
- `eventType` is unknown.
- message preview is unsafe.
- `token_completed` or `loop_complete` is being attempted as live send.
- durable dedupe state is unavailable.
- rawJson or secret marker risk appears.
- Telegram live-loop expansion risk appears.
- queue, systemd, scheduler, or unbounded expansion risk appears.

Not fixed / future work:

- Telegram live-loop integration.
- broader runtime Notification record write integration beyond the
  `metric_appended` capture-only path.
- failed-send retry.
- cooldown automation.
- queue idempotency.
- systemd recovery.
- capture-only command execution for this policy.
- Telegram live send for this policy.

### Durable Notification Dedupe Storage Policy

This is the policy for the durable Telegram notification dedupe store. The
first schema cut now provides a `Notification` model, formal migration files
exist, and the Red DB apply created the `Notification` table in
`prisma/dev.db`. The minimal Notification repository is implemented, but this
does not run capture-only, send Telegram, start queue / systemd, or connect
runtime Notification record writes.

Responsibilities:

- Prevent double live send for the same notification key.
- Distinguish capture-only rehearsal from live send.
- Distinguish `captured`, `sent`, `failed`, `skipped`, and `blocked`.
- Treat only human-gated live send as `sent`.
- Provide duplicate-decision evidence, not retry automation.
- Do not treat docs records or capture records alone as durable dedupe state.

Notification key:

- Initial live-send event: `metric_appended` only.
- Initial notification key: mint + event type + `metricId`.
- `token_completed` and `loop_complete` have no initial `metricId` key, so
  they remain capture-only and are not initial live-send events.
- Future key candidates include mint + event type + stage and mint + event
  type + `observedAt`, but they are not initial live dedupe keys.

Status / mode boundary:

- Status candidates: `captured`, `sent`, `failed`, `skipped`, and `blocked`.
- Mode candidates: `capture_only` and `live_send`.
- Capture-only pass is not `sent`.
- `captured` is rehearsal evidence.
- Only a row / state with `sentAt` is live-send proof.
- `failed` is not equivalent to `sent`.
- Resend after `failed` requires DB confirmation and a separate human gate; it
  is not automatic retry.
- `skipped` and `blocked` record safe reasons for no live send.

Future storage fields:

- `notificationKey`.
- `eventType`.
- `mint`.
- nullable `metricId`.
- `trigger`.
- `status`.
- `mode`.
- safe-summary `messagePreview`.
- nullable `capturedAt`.
- nullable `sentAt`.
- nullable `failedAt`.
- nullable `errorCode`.
- nullable `reason`.
- `rawJsonFree`.
- `secretFree`.
- `source`.
- `createdAt`.
- `updatedAt`.

Never store:

- Telegram response body.
- bot token.
- chat id.
- token-containing URL.
- raw API response.
- raw payload.
- exact rawJson payload.
- raw stdout.
- raw stderr.
- `.env`.
- `DATABASE_URL`.
- `process.env`.
- any line or blob with a secret marker.

Unique constraint / idempotency candidates:

- Treat `notificationKey` as the durable identity in the initial policy.
- Strongly consider a unique `notificationKey` for the first implementation.
- Do not include `status` in the unique identity without a clear reason; doing
  so can weaken duplicate prevention for a key that was already sent.
- Prefer modeling capture-only and live-send as one notification-key lifecycle.
- The first schema cut now has the `notificationKey` identity in the Prisma
  schema, formal migration files now exist, and the Red DB apply created the
  `Notification` table in `prisma/dev.db`.

Capture-only relationship:

- Capture-only pass is a live-send precondition.
- Capture-only pass alone does not complete durable dedupe.
- Capture records can be confirmation material, but they are not proof of
  `sent`.
- Before live send, compare the capture record, DB state, notification key,
  `metricId`, event type, and safe-summary message preview.

Failed-send relationship:

- `failed` status and `errorCode` are safe-summary storage candidates.
- Telegram response body is never stored.
- Do not automatically retry failed sends.
- Manual retry of a failed key requires DB confirmation, a human gate, and the
  explicit `--retryFailed` flag. Retry success must clear `failedAt`,
  `errorCode`, and `reason`; retry failure may store only safe `errorCode` and
  fixed safe reason.
- Sent row resend remains prohibited.
- Failed-send retry automation remains a later gap.

Queue / systemd relationship:

- Durable notification dedupe storage is one queue pre-gate.
- This policy does not make queue, systemd, live loop, scheduler, or unbounded
  watch ready.
- Queue idempotency, ordering, item-level retry, and systemd recovery remain
  later work.

Stop before live send or queue when:

- `notificationKey` is missing.
- `metric_appended` is missing `metricId`.
- `token_completed` or `loop_complete` is being treated as live-send ready.
- duplicate-key judgment cannot be made.
- durable dedupe state is unavailable when required.
- capture record and DB state mismatch.
- failed-send retry is being automated.
- rawJson or secret marker risk appears.
- Telegram token, chat id, or response body would be stored.
- queue, systemd, scheduler, or unbounded expansion risk appears.

Not fixed / future work:

- broader runtime Notification record write integration beyond
  `metric_appended` capture-only.
- `token_completed` / `loop_complete` Notification write integration.
- queue idempotency.
- failed-send retry.
- Telegram live-loop integration.
- systemd recovery.

### Failed-Send / Resend Policy

This is the policy for failed Telegram notification outcomes and later
human-approved resend decisions. The first schema cut now provides a
`Notification` model and the Red DB apply created the `Notification` table, but
runtime code still does not write notification records, send Telegram,
implement failed-send retry automation, or start a queue / systemd service.

Failed vs sent boundary:

- `sent` means a human-gated live send succeeded.
- In future storage, only a state with `sentAt` is sent proof.
- `failed` is not equivalent to `sent`.
- `failed` is not previous sent proof.
- Failed history is resend-decision evidence.
- `captured` is rehearsal evidence, not sent.
- `skipped` and `blocked` are safe reasons that no live send occurred.

Resend allowed conditions:

- Resend is not automatic.
- The same notification key has no previous `sent`.
- DB read confirmation passes.
- Capture-only rehearsal passes.
- The same notification key's current state has been checked.
- The previous failed safe summary has been reviewed.
- `errorCode` / reason stays within safe-to-log fields.
- Secret-free and rawJson-free marker checks pass.
- A human gate approves a separate Red task.
- The Red exact command is one command in that separate task.

Resend blocked conditions:

- A previous `sent` exists for the notification key.
- `notificationKey` is missing.
- `metric_appended` is missing `metricId`.
- DB state and capture content mismatch.
- The previous failure reason is unknown.
- The safe `errorCode` is missing or cannot support the decision.
- Telegram response body would be needed as evidence.
- Duplicate-key judgment cannot be made.
- rawJson or secret marker risk appears.
- Telegram token, chat id, or request path exposure risk appears.
- `token_completed` or `loop_complete` is being treated as live-send ready.
- The flow expands into queue, systemd, or automatic retry.

Failed-send storage fields:

- `notificationKey`.
- `eventType`.
- `mint`.
- nullable `metricId`.
- `status=failed`.
- `mode=live_send`.
- `errorCode`.
- safe-summary reason.
- `failedAt`.
- `rawJsonFree`.
- `secretFree`.
- `source`.
- `createdAt` / `updatedAt`.

Never store for failed-send:

- Telegram response body.
- request path.
- bot token.
- chat id.
- token-containing URL.
- raw API response.
- raw payload.
- exact rawJson payload.
- raw stdout / stderr.
- `.env`.
- raw env / `process.env`.
- `DATABASE_URL`.
- any line or blob with a secret marker.

Notification-key lifecycle:

- Keep `notificationKey` as the durable identity.
- If `notificationKey` is unique, the lifecycle must allow `failed` to move to
  `sent` after a later human-approved resend.
- Do not treat `failed` as `sent`.
- Do not resend a key that already has previous `sent`.
- Be careful with `status` in a unique key; including it can weaken duplicate
  prevention for an already-sent key.
- Resend approval may be represented as same-key state transition metadata or
  explicit approval metadata in a later implementation.
- The first schema cut now has the same-key lifecycle candidate in Prisma
  schema, formal migration files now exist, and the Red DB apply created the
  `Notification` table in `prisma/dev.db`.

Capture-only / DB confirmation relationship:

- Capture-only pass is required before resend.
- Capture records are not sent proof.
- DB state, capture content, `metricId`, `notificationKey`, and safe message
  preview must align before resend.
- Capture-only pass alone does not authorize resend.

Queue / systemd / retry boundary:

- Failed-send policy is one queue pre-gate.
- This policy does not make queue, systemd, or live loop ready.
- Queue retry, systemd recovery, and Telegram failed-send retry automation
  remain future work.
- The current boundary is human-approved only.

Stop and return to human gate when:

- failed-send retry is becoming automatic.
- a key with previous `sent` is being resent.
- previous failed safe summary is missing.
- `errorCode` / reason is not a safe summary.
- Telegram response body would be required.
- `notificationKey` is missing.
- `metricId` is missing.
- DB state and capture content mismatch.
- duplicate-key judgment cannot be made.
- rawJson or secret marker risk appears.
- Telegram token, chat id, or request path exposure risk appears.
- queue, systemd, scheduler, or unbounded expansion risk appears.

Not fixed / future work:

- failed-send retry automation.
- broader runtime Notification record write integration beyond
  `metric_appended` capture-only.
- `token_completed` / `loop_complete` Notification write integration.
- Telegram live-loop integration.
- queue idempotency.
- systemd recovery.

### Notification Model Boundary / Lifecycle Policy

This policy defines the durable notification model boundary. The first schema
cut now adds `Notification` to `prisma/schema.prisma` with scalar nullable
`tokenId` / `metricId` fields and no Prisma relations or back relations. The
formal migrations are applied to `prisma/dev.db`, and the minimal repository is
implemented. It still does not execute capture-only, send Telegram, write
runtime Notification records, or start queue / systemd / unbounded watch
runtime.

Model responsibility:

- durable dedupe by `notificationKey`.
- capture-only / live-send lifecycle management.
- `captured`, `sent`, `failed`, `skipped`, and `blocked` state management.
- failed-send / resend decision evidence.
- Telegram live-loop readiness input.
- not queue idempotency itself.

Model name:

- First candidate: `Notification`.
- `Notification` keeps the responsibility broad enough if later channels are
  added.
- `NotificationEvent` reads more like append-only history and is less aligned
  with same-key lifecycle management.
- `TelegramNotification` fits the current channel but fixes the model name to
  Telegram too early.
- `TokenNotification` is too narrow for `metric_appended` and loop events.

Field candidates:

- `id`.
- `notificationKey`.
- `eventType`.
- `mint`.
- nullable `tokenId`.
- nullable `metricId`.
- `trigger`.
- `status`.
- `mode`.
- safe-summary `messagePreview`.
- nullable `capturedAt`.
- nullable `sentAt`.
- nullable `failedAt`.
- nullable `errorCode`.
- nullable `reason`.
- `rawJsonFree`.
- `secretFree`.
- nullable `source`.
- `createdAt`.
- `updatedAt`.

Relation candidates:

- A Token relation is a candidate.
- Keep `mint` as a denormalized field candidate.
- A Metric relation is naturally nullable.
- `metric_appended` requires `metricId` by policy.
- `token_completed` and `loop_complete` keep nullable `metricId` and remain
  capture-only.
- Required / nullable `metricId` should be enforced by event-type operating
  rules unless a later schema design can express it safely.
- The first schema cut keeps relation fields out of the schema; relation design
  remains a future decision.

Unique / index candidates:

- `notificationKey` unique is the first candidate.
- Do not include `status` in the unique identity without a clear reason;
  including it can weaken resend prevention for an already-sent key.
- If failed-to-sent same-key lifecycle is allowed, use same-row state
  transition or explicit approval metadata.
- Index candidates: `mint`, `eventType`, `status`, `metricId`, `createdAt`,
  `capturedAt`, `sentAt`, and `failedAt`.

Status / mode lifecycle:

- Mode candidates: `capture_only` and `live_send`.
- Status candidates: `captured`, `sent`, `failed`, `skipped`, and `blocked`.
- Capture-only pass is not `sent`.
- Only `sentAt` is future sent proof.
- `failed` is not `sent`.
- A key with previous `sent` is not resendable.
- `skipped` and `blocked` record safe reasons for no live send.
- Human-approved resend after `failed` needs same-row state transition or
  approval metadata.

Never store:

- Telegram response body.
- request path.
- bot token.
- chat id.
- token-containing URL.
- raw API response.
- raw payload.
- exact rawJson payload.
- raw stdout.
- raw stderr.
- `.env`.
- `DATABASE_URL`.
- `process.env`.
- any line or blob with a secret marker.

Migration pre-risks:

- nullable relation design.
- Prisma enum versus string fields.
- `notificationKey` unique lifecycle / backfill.
- relationship to historical capture-only JSONL.
- rollback and test DB handling.
- fixture / seed needs.
- bad key design can block the resend lifecycle.

Not fixed / future work:

- broader runtime Notification record write integration beyond
  `metric_appended` capture-only.
- `token_completed` / `loop_complete` Notification write integration.
- Telegram live-loop integration.
- queue idempotency.
- systemd recovery.

### Notification Schema / Migration Baseline Policy

This policy covers the first Yellow Notification schema task and the later
migration-file cut. The first schema cut added `Notification` to
`prisma/schema.prisma`, added `tests/notificationSchema.test.ts`, run
schema-level verification, run `prisma validate`, run `prisma generate`, run
TypeScript check, and previewed SQL at `/tmp/add_notification.sql`. The later
migration-file cut added the baseline and add-notification formal migration
files under `prisma/migrations`. The Red DB apply then resolved the baseline
migration as applied and deployed the add-notification migration to
`prisma/dev.db`. A later Yellow added the minimal Notification repository and
temp-SQLite repository test. Commit `905d3ac` then connected the repository to
`ops:catchup:gecko` capture-only output for `metric_appended` records only. It
does not connect Telegram live send, `token_completed` / `loop_complete`
Notification writes, failed-send retry, or queue / systemd runtime. Commit
`442cf8e` then added the
`metric:snapshot:geckoterminal -- --mint <MINT> --write` single-mint
Notification capture hook for `metric_appended` after a successful Metric
create, with Metric create maximum 1, Notification create maximum 1, Token
write 0, Telegram send 0, checkpoint write 0, and temp-SQLite test coverage
without writing production `prisma/dev.db`. Batch / limit `metric:snapshot`
Notification writes are still out of scope. The first production Red rehearsal
for this hook succeeded on
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` after backup
`/tmp/lowcap-dev.db.before-metric-snapshot-notification-20260509T135724Z.bak`:
Token count stayed `1107 -> 1107`, Metric count moved `191 -> 192`,
Notification count moved `0 -> 1`, Metric `1264` was created for token
`5043`, and Notification `1` used key
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264` with
`eventType=metric_appended`, `trigger=metric_appended`, `status=captured`,
`mode=capture_only`, `source=metric:snapshot:geckoterminal`,
`rawJsonFree=true`, and `secretFree=true`. Rollback was not needed and restore
was not executed.
Commit `2d83b05` adds the `metric_appended` sent / failed marking path for an
existing captured Notification row using mocked sender and temp-SQLite tests.
It builds the same `${mint}:metric_appended:${metricId}` key, calls the sender
only when the row exists and is `captured` / `capture_only`, blocks missing
rows, already `sent` rows, and non-captured rows, and updates at most one row.
Mocked sender success marks `status=sent`, `mode=live_send`, and `sentAt`;
mocked sender failure marks `status=failed`, `mode=live_send`, `failedAt`, and
safe `errorCode` / `reason`. It does not create Notification rows, does not add
Metric / Token writes, does not store Telegram response bodies, request paths,
bot tokens, chat ids, or env values, and does not execute real Telegram live
send or Red live-send rehearsal.
Commit `983b7e3` adds the notificationKey-specified live-send rehearsal path
and `pnpm notification:send`. The CLI is default dry-run / no-send, requires
explicit `--live` before any sender call, supports `metric_appended` only,
looks up one existing Notification row by `notificationKey`, blocks missing
rows, already `sent` rows, non-`captured` / non-`capture_only` rows, and
missing `mint` / `metricId`, and then updates at most one row through
`markNotificationSent` or `markNotificationFailed`. It creates no Notification
rows, adds no Metric / Token writes, stores no Telegram response bodies,
request paths, bot tokens, chat ids, or env values, and is covered by
temp-SQLite mocked-sender tests. The notificationKey-specified real Telegram
live-send Red rehearsal is now complete for
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264` through
`pnpm -s notification:send -- --notificationKey <KEY> --trigger metric_appended --live`.
Backup `/tmp/lowcap-dev.db.before-notification-live-send-20260509T151757Z.bak`
was created. The dry-run returned `status=ready`, `senderCalled=false`,
`sentCount=0`, and `updatedCount=0`; the live command returned `status=sent`,
`senderCalled=true`, `sentCount=1`, and `updatedCount=1`. Counts stayed
unchanged (`Token=1107`, `Metric=192`, `Notification=1`), only the existing
Notification row was updated, and the row now has `status=sent`,
`mode=live_send`, `sentAt=1778339880613`, `failedAt=null`, `errorCode=null`,
`reason=null`, `rawJsonFree=1`, and `secretFree=1`. Telegram response body,
bot token, chat id, and env markers were not stored; rollback was unnecessary
and restore was not executed. Automatic failed-send retry, queue, scheduler,
systemd, default checkpoint operation, automatic Red execution, and always-on
operation remain unimplemented.
Commit `a5d1575` adds the manual retry path for `notification:send`: explicit
`--retryFailed` is required, only a `failed` / `live_send` `metric_appended`
row selected by `notificationKey` is retry-eligible, and sent row resend is
still blocked. Retry success calls `markNotificationSent`, sets `status=sent`,
`mode=live_send`, and `sentAt`, and clears `failedAt`, `errorCode`, and
`reason`; retry failure calls `markNotificationFailed`, sets `status=failed`,
`mode=live_send`, `failedAt`, safe `errorCode`, and fixed safe
`reason=ops_notify_send_failed`. It creates no Notification rows, adds no
Metric / Token writes, stores no Telegram response body, bot token, chat id, or
env, and is covered by temp-SQLite mocked-sender tests. The manual retry Red
rehearsal is now complete for
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`
through
`pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`.
Backup `/tmp/lowcap-dev.db.before-notification-retry-send-20260509T235410Z.bak`
was created. The dry-run returned `status=ready`, `senderCalled=false`,
`sentCount=0`, and `updatedCount=0`; live retry called the sender once and
returned `status=failed`, `senderCalled=true`, `sentCount=0`,
`updatedCount=1`, and `errorCode=telegram_network_error`. Counts stayed
unchanged (`Token=1107`, `Metric=192`, `Notification=2`), the retry target row
remains `status=failed`, `mode=live_send`, `sentAt=null`,
`failedAt=1778370852010`, `errorCode=telegram_network_error`,
`reason=ops_notify_send_failed`, `rawJsonFree=1`, and `secretFree=1`, and the
existing sent row remains `status=sent`, `mode=live_send`, and
`sentAt=1778339880613`. Telegram response body, bot token, chat id, and env
markers were not stored; rollback was unnecessary and restore was not executed.
This is failed retry evidence, not retry success. Automatic retry, retry queue,
`retryCount` / `nextRetryAt` / cooldown automation, `token_completed` /
`loop_complete` retry, queue, scheduler, systemd, default checkpoint operation,
automatic Red execution, unbounded watch, and always-on operation remain
unimplemented / unexecuted.
Commit `02728ae` adds `notification:retry:plan` as the read-only retry planner.
Run it as `pnpm -s notification:retry:plan`; it reports
`mode=read_only_retry_planner`, `willExecute=false`, and `executor=human` when
it finds a candidate or `executor=none` when it stops. It does not write the DB,
send Telegram, update Notifications, or execute `notification:send`; it only
prints `nextRedCommand` for a human Red gate. Selection is limited to
`failed` / `live_send` `metric_appended` rows with `trigger=metric_appended`,
`rawJsonFree=true`, `secretFree=true`, `notificationKey`, `mint`, and
`metricId`; `token_completed`, `loop_complete`, `sent`, and `captured` rows are
excluded. The sort is `failedAt ASC`, `updatedAt ASC`, `id ASC`, and
`selectedCount` is at most 1. Candidate 0 returns `status=stop` and
`nextRedCommand=null`; candidate 1+ prints
`pnpm -s notification:send -- --notificationKey <KEY> --trigger metric_appended --live --retryFailed`
as a string only. The printed Red command's side-effect bound remains Telegram
send max 1, Notification update max 1, Notification create 0, Token / Metric
write 0, and no checkpoint / queue / systemd. Temp-SQLite tests cover the
planner without using production `prisma/dev.db`. This does not implement
automatic retry, retry queue, scheduler / systemd, `retryCount` / `nextRetryAt`
/ cooldown automation, claim / lease, sent row resend, `token_completed` /
`loop_complete` retry, default checkpoint operation, unbounded watch, always-on
operation, or automatic Red command execution.
The planner-selected manual retry Red rehearsal has also run through the
`notification:retry:plan` selected `nextRedCommand`:
`pnpm -s notification:send -- --notificationKey <RETRY_KEY> --trigger metric_appended --live --retryFailed`.
The target was
`Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`.
Backup `/tmp/lowcap-dev.db.before-planner-retry-send-20260510T060558Z.bak`
was created. Planner confirmation returned `status=ok`, `candidateCount=1`,
`selectedCount=1`, and matching `nextRedCommand`; live retry returned
`status=failed`, `senderCalled=true`, `sentCount=0`, `updatedCount=1`, and
`errorCode=telegram_network_error`. Counts stayed `Token=1107`,
`Metric=192`, and `Notification=2`. The retry target row remains
`status=failed`, `mode=live_send`, `sentAt=null`,
`failedAt=1778393159818`, `errorCode=telegram_network_error`,
`reason=ops_notify_send_failed`, `rawJsonFree=1`, and `secretFree=1`; the
existing sent row remains `status=sent`, `mode=live_send`,
`sentAt=1778339880613`, `failedAt=null`, `errorCode=null`, `reason=null`,
`rawJsonFree=1`, and `secretFree=1`. Telegram response body, bot token, chat
id, and env markers were not stored; rollback was unnecessary and restore was
not executed. This is planner-selected failed retry evidence, not retry
success. Automatic retry, retry queue, `retryCount` / `nextRetryAt` / cooldown
automation, claim / lease, sent row resend, `token_completed` /
`loop_complete` retry, queue, scheduler, systemd, durable queue runtime,
default checkpoint operation, automatic Red execution, unbounded watch, and
always-on operation remain unimplemented / unenabled.

Notification retry queue foundation:

- The production-side-effect-free foundation adds retry metadata to
  `Notification`: `retryCount`, `nextRetryAt`, `lastAttemptAt`, `leaseUntil`,
  and `workerId`.
- The separate Red migration apply gate has already aligned production
  `prisma/dev.db`; the applied state was later confirmed read-only by checking
  `20260510000100_add_notification_retry_foundation`, the retry metadata
  columns, and the retry candidate / lease indexes. That confirmation did not
  run `migrate deploy`.
- `pnpm -s notification:retry:plan` now passes against production
  `prisma/dev.db` as a read-only planner and only prints a human-gated
  `nextRedCommand`; it does not execute `notification:send`, send Telegram, or
  update Notifications.
- After production retry schema alignment, the planner-selected manual retry
  rehearsal ran one human-gated exact command for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump:metric_appended:1264:retry_rehearsal_failed_1`.
  Before the run, planner output was `status=ok`, `candidateCount=1`,
  `selectedCount=1`; after the run, planner output was `status=stop`,
  `candidateCount=0`, `selectedCount=0`, and `nextRedCommand=null`. The live
  retry returned `status=sent`, `senderCalled=true`, `sentCount=1`, and
  `updatedCount=1`; the target row is now `status=sent`, `mode=live_send`,
  `sentAt=1778450118596`, `failedAt=null`, `retryCount=0`,
  `lastAttemptAt=1778450118596`, `nextRetryAt=null`, `leaseUntil=null`,
  `workerId=null`, `errorCode=null`, and `reason=null`. Raw Telegram response
  body, bot token, chat id, and env markers were not stored.
- Repository selection / claim helpers are allowed only as a bounded foundation:
  `failed` / `live_send` `metric_appended` rows are candidates, `sent` rows are
  still blocked from resend, retry-count and `nextRetryAt` gates must apply,
  and an active lease must prevent a second claim.
- This is not automatic retry. It must not start a worker, scheduler, systemd
  unit, queue runtime, Telegram live send, default checkpoint operation,
  unbounded watch, or always-on bot.

Manual retry closeout:

- The current Notification retry manual validation slice is closed after the
  planner-selected one-row rehearsal. Do not continue into automatic retry until
  retry policy, cooldown, claim recovery, worker ownership, attempt limits, and
  scheduler / systemd boundaries are separately designed.
- The next core feature candidate should return to the observation OS: turn
  `docs/philosophy/memecoin-market-model.md` candidate fields into a bounded
  plan before schema / CLI expansion. Prefer docs-first or read-only/report
  work for narrative, attention, risk, community, market condition, and outcome
  logging; include skip, failed, dead, rug, and missed-opportunity records as
  learning targets instead of tracking successful cases only.
- The first bounded implementation step is `pnpm token:observation -- --mint
  <MINT>`, a read-only JSON report over existing Token / Metric / Notification
  data. Missing narrative, community, holder-distribution, market-condition,
  and outcome labels stay `not_observed`; the report is not a buy signal and
  does not enable automatic retry, queue, scheduler, systemd, checkpoint, or
  watch operation.
- `token:observation` also reflects existing `Token.reviewFlagsJson` as a
  read-only community / metadata snapshot: website, X, Telegram, link count,
  description-present, and Metaplex-hit state. This is not a schema expansion;
  holder distribution, market condition, and outcome labels still remain
  `not_observed`.
- The manual observation capture foundation is `pnpm token:observe -- --mint
  <MINT> ...`, which writes only `Token.entrySnapshot.manualObservation` with
  operator narrative category, watch / skip thesis, outcome label, note,
  `source=manual`, and `schemaVersion=1`. It is covered by temp SQLite tests
  and one separately approved production one-token Red rehearsal; future
  production use still requires explicit Red approval. `token:observation`
  reads that namespace back as review context.
  This is not a buy signal and does not enable automatic retry, queue,
  scheduler, systemd, checkpoint, or watch operation.
- The first production one-token Red rehearsal for `token:observe` is complete
  for `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`. The exact flow backed up
  `prisma/dev.db`, wrote one `Token.entrySnapshot.manualObservation` namespace
  with `narrativeCategory=crypto_meta`, `outcomeLabel=watched`, and manual
  review context, then confirmed through `token:observation` that narrative /
  thesis / outcome gaps were removed. Holder distribution and market condition
  remain `not_observed`; rawJson, env, Telegram secrets, Telegram response body,
  automatic retry, queue, scheduler, systemd, checkpoint, `--write`, and
  `--watch` were not used.
- The multi-token follow-up view is `pnpm tokens:observation-gaps -- [--limit
  <N>] [--sinceHours <N>] [--pumpOnly] [--rank <S|A|B|C>] [--gap <GAP>]`.
  It is a read-only queue/report, not a worker: it lists existing tokens with
  observation gaps, summarizes missing narrative / thesis / outcome / community
  / holder / market-condition context, and prints suggested `token:observe`
  commands as human-gated strings only when `token:observe` can reduce
  narrative / thesis / outcome gaps. Holder distribution, market condition,
  community-link, metric, and notification gaps remain `not_observed` or
  separate follow-up work until separately designed. The output includes an
  `unsupportedGapPlan` matrix for those gaps: holder distribution and market
  condition need separate capability design, community links map to
  reviewFlagsJson / enrichment, metric missing maps to the Metric flow, and
  notification missing must not be filled by Telegram send solely for coverage.
  It does not write DB state, does not execute `token:observe`, is not a buy
  signal, and does not enable automatic retry, queue, scheduler, systemd,
  checkpoint, `--write`, or `--watch` operation.
- Holder distribution is now fixed as a docs-first future capability in
  `docs/design/holder-distribution-snapshot.md`. The design covers candidate
  fields such as `topHolderPct`, `top10HolderPct`, `holderCount`,
  `freshWalletCount`, `bundlerSignal`, `sameFundingOriginSignal`,
  `lpWalletExcluded`, `devWalletPct`, `devBuyImpact`, `mcapVolumeRatio`, and
  `bottedChartPattern`; compares future storage choices; and keeps external
  fetch, schema, production DB write, queue / scheduler / systemd, checkpoint,
  `--write`, and `--watch` outside the current task. The source contract now
  prefers a Rugcheck-style safe summary for the first external-source
  rehearsal only if raw payloads and wallet lists are not persisted; manual
  holder review or external report only remain fallback paths, while unbounded
  on-chain holder crawl and funding graph traversal remain deferred.
- The holder safe-summary parser foundation is
  `src/observation/holderDistributionSafeSummary.ts`, covered by static
  fixture tests only. It accepts the fixed `HolderDistributionSafeSummary`
  shape and rejects unknown extra fields, unsafe percent / count / timestamp
  values, `rawFree=false`, `secretFree=false`, raw wallet-list keys, raw
  response-body / raw JSON keys, and secret-like API token or chat id keys.
  Storage remains undecided, and the parser does not fetch, write production DB
  state, add schema, send Telegram, start queue / scheduler / systemd /
  checkpoint, or enable `--write` / `--watch`.
- The holder safe-summary file report is
  `pnpm holder:safe-summary:report -- --file <PATH>`. It is read-only and
  validates static / manual / external report fixtures before any storage
  decision. It emits valid / invalid counts, safe summary fields, sanitized
  issue text, and review hints only; raw payload values and secret-like values
  are not printed. It does not fetch, write production DB state, add schema,
  send Telegram, start queue / scheduler / systemd / checkpoint, or enable
  `--write` / `--watch`.
- Holder distribution production storage schema is migrated, and the first
  one-token HolderSnapshot row write rehearsal has completed. The rehearsal
  used a static manual safe-summary fixture only; no holder values were fetched
  or inferred.
  `Token.entrySnapshot` is deferred because it is weak for repeated
  source-labeled holder snapshots; `Metric.rawJson` is deferred because holder
  distribution should not become a market Metric payload bucket.
- `HolderSnapshot` now exists in `prisma/schema.prisma`, and production
  `prisma/dev.db` has applied
  `prisma/migrations/20260515000100_add_holder_snapshot/migration.sql` after
  backup
  `/home/mochi/lowcap-bot-backups/dev.db.before-holder-snapshot-migration-20260515012828.db`.
  It adds a Token relation, safe summary scalar fields, `source`, `observedAt`,
  `confidence`, `rawFree`, `secretFree`, and indexes for token history and
  source audit. It does not add a first unique constraint and does not include
  raw payload / rawJson / wallet-list columns.
- Holder snapshot CLIs are implemented:
  `holder:snapshot:add -- --mint <MINT> --file <SAFE_SUMMARY_FILE>` is the
  one-row write command, and `holder:snapshot:show -- --mint <MINT> [--limit
  <N>]` is the read-only verifier. The write command validates with
  `parseHolderDistributionSafeSummary`, rejects batch `items` input, updates no
  Token / Metric / Notification rows, performs no fetch or Telegram send, and
  returns `holderSnapshotId` for rollback. It has been verified with temp
  SQLite tests and one production Red one-token rehearsal.
- HolderSnapshot production migration apply has passed. `prisma migrate deploy`
  applied `20260515000100_add_holder_snapshot`; migration status is up to date;
  PRAGMA checks confirmed the `HolderSnapshot` table, both expected indexes,
  and `HolderSnapshot` count `0`. Token / Metric / Notification counts stayed
  unchanged at `1116 / 191 / 6`.
- The production one-token HolderSnapshot row write rehearsal was run for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` after backup
  `/home/mochi/lowcap-bot-backups/dev.db.before-holder-snapshot-row-rehearsal-20260515015522.db`.
  The static fixture used `source=manual_holder_review`, `confidence=low`,
  holder percentage / count fields `null`, funding / bundler signals `unknown`,
  `rawFree=true`, and `secretFree=true`. The fixture report returned
  `validCount=1`; the exact one-row add command returned `holderSnapshotId=1`;
  `holder:snapshot:show` confirmed `count=1`. Token / Metric / Notification
  counts stayed unchanged at `1116 / 191 / 6`; HolderSnapshot count moved
  `0 -> 1`. `holder:gaps:plan` still reports the holder gap because persisted
  HolderSnapshot integration is future Yellow work. No external fetch,
  on-chain fetch, Telegram, queue / scheduler / systemd / checkpoint,
  `--write` / `--watch`, or `pnpm smoke` ran in the write rehearsal.
- `token:observation` and `holder:gaps:plan` now read persisted
  `HolderSnapshot` rows. The rehearsal mint
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` now shows
  `holderDistributionSnapshot.holderSnapshotId=1` in `token:observation`, no
  longer carries `holder_distribution_not_recorded`, and keeps
  `holder_distribution_values_unknown` / `holder_distribution_manual_review_only`
  because the fixture intentionally stored unknown holder values. The same mint
  is no longer re-proposed by `holder:gaps:plan`; the planner reports
  `holderSnapshotPresentCount=1`. Production `HolderSnapshot` count remains
  `1`. This was read-only integration only: no production write, fetch,
  Telegram, queue / scheduler / systemd / checkpoint, `--write` / `--watch`, or
  `pnpm smoke`.
- Holder distribution MVP loop is complete only for storage / parser /
  write-path / read-path validation. The completed loop is:
  HolderSnapshot schema and production migration applied, `holder:snapshot:add`
  / show implemented, one production manual safe-summary row written for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`, `holderSnapshotId=1`,
  `token:observation` reads that latest snapshot, and `holder:gaps:plan` no
  longer re-proposes the same token. This is not real holder analysis and not
  trading guidance: the current row is `source=manual_holder_review`, holder
  values are `null` / `unknown`, and
  `holder_distribution_values_unknown` /
  `holder_distribution_manual_review_only` remain review gaps. External source
  capture remains future work.
- Next-phase shortcuts are forbidden: do not jump directly to scheduler /
  queue / systemd, do not run an unbounded on-chain crawl, do not store raw
  provider JSON, and do not turn holder state into a buy / sell / position /
  exit signal.
- A Rugcheck-style synthetic/static mapper rehearsal now exists in
  `src/observation/holderSourceMappers.ts`. It accepts only a narrow synthetic
  summary shape, maps explicit holder concentration / wallet-signal fields into
  `HolderDistributionSafeSummary`, leaves missing or ambiguous fields as
  `null` / `unknown`, and rejects raw provider JSON, wallet-list fields,
  request URLs, and secret-like keys without printing raw values. This is not a
  real Rugcheck API fetch and does not approve an endpoint, source credential,
  production write, queue / scheduler / systemd, or trading signal.
- Real Rugcheck-style source contract review is docs-only. Public docs point to
  report and report-summary endpoints, but the real capture contract is not
  approved because auth / rate limits and exact holder-field semantics remain
  unresolved. If this source moves forward, start with a one-token summary
  endpoint preflight only after approval; avoid full reports that expose
  `topHolders[]` / wallet-list payload, do not store raw provider JSON, and keep
  the real-response mapper separate from the current synthetic fixture mapper.
- The Rugcheck summary endpoint preflight plan is also docs-only. A future Red
  task is bounded to one re-confirmed mint, one summary endpoint request, no
  retry, no batch, no full-report fallback, no DB write, no
  `holder:snapshot:add`, no raw response persistence, no queue / scheduler /
  systemd, no checkpoint update, no `--write` / `--watch`, and no `pnpm smoke`.
  Permitted output is only HTTP status, top-level keys, dangerous-key presence,
  sanitized field-shape summary, and safe-summary mapping feasibility; raw
  response bodies, wallet / owner addresses, auth material, `.env`, and
  screenshots containing wallet lists or secrets remain forbidden.
- The bounded Red Rugcheck summary endpoint preflight has been run once for
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump`. The summary endpoint returned
  HTTP `200` and JSON shape parsing succeeded. Only sanitized output was
  printed: top-level keys were `tokenProgram`, `tokenType`, `risks`, `score`,
  `score_normalised`, and `lpLockedPct`; dangerous key categories were not
  observed; candidate fields present were `lpLockedPct`, `risks`, and `score`.
  `topHoldersPct`, `holderCount`, `lpLocked`, `rugged`, `tokenMeta`, and
  `markets` were absent. The mapping decision is `needs_more_source_review`;
  no raw response body, wallet / owner address, auth material, `.env`, raw
  provider JSON fixture, DB write, or `holder:snapshot:add` occurred.
- Rugcheck summary preflight closeout does not approve the summary endpoint as
  a holder distribution source. No holder concentration fields were confirmed,
  the real mapper remains unimplemented, and `score`, `score_normalised`,
  `risks`, and `lpLockedPct` must not be mapped into
  `HolderDistributionSafeSummary` concentration fields. Treat those observed
  fields only as possible future risk / liquidity context under a separate
  contract; avoid full-report preflight by default because `topHolders[]` /
  wallet payload risk is high.
- Alternative holder source review is docs-only and leaves real holder
  concentration source approval unresolved. Birdeye holder distribution and
  CoinGecko / GeckoTerminal Onchain Token Info are possible aggregate-first
  preflight candidates only after separate auth / terms / rate-limit approval:
  Birdeye must be constrained to no wallet list output, and CoinGecko /
  GeckoTerminal holder data is Pro API / beta. Solscan and Bubblemaps are
  deferred because the reviewed docs point toward holder-list or graph payloads,
  while DEX Screener / current GeckoTerminal public API docs do not expose the
  needed aggregate fields. Continue manual holder review or external-report-only
  review until an aggregate source is approved.
- CoinGecko / GeckoTerminal Onchain Token Info boundary review keeps the source
  unapproved but identifies it as the best next one-token shape-only preflight
  candidate. Docs show `holders.count` and
  `holders.distribution_percentage.top_10`, while holder data is beta and Pro
  API auth / paid-plan / rate-limit / terms approval is required. Any future
  mapping is limited to `holderCount` and `top10HolderPct`; keep
  `topHolderPct=null`, wallet signals unknown, and `lpWalletExcluded=null`.
  Avoid the separate Top Token Holders endpoint because it returns wallet
  addresses and holder-list payload.
- CoinGecko Token Info preflight plan is docs-only and remains unapproved for
  execution until the exact Red task is approved. Future scope is one
  re-approved mint, one Token Info request, header auth via `x-cg-pro-api-key`,
  no query-string API key, no Top Token Holders endpoint, no retry, no batch,
  no raw response persistence, no DB write, no `holder:snapshot:add`, no mapper
  implementation, and no `pnpm smoke`. Output must stay shape-only: HTTP /
  parse status, top-level and shallow holder keys, presence of `holders.count`
  and `holders.distribution_percentage.top_10`, primitive type summary,
  dangerous-key categories, and mapping feasibility only.
- CoinGecko preflight operator approval checklist is docs-only and must be
  satisfied before the Red command exists: target mint, `solana` network,
  Token Info endpoint, exactly one request, Pro API key use, header auth only,
  no query-string auth, paid-plan / credit / minute-rate-limit / terms
  acceptance, beta holder data acceptance, output sanitation, no raw response
  persistence, no Top Token Holders endpoint, no DB write, no
  `holder:snapshot:add`, no mapper implementation, and no `pnpm smoke`. The
  future command sketch reads `COINGECKO_PRO_API_KEY` from env and must not
  print the key, headers, `.env`, secret-bearing URLs, or raw response body.
- CoinGecko Pro API / paid holder-source work is parked for MVP completion.
  The attempted Red preflight stopped before request execution because
  `COINGECKO_PRO_API_KEY` was unavailable. Paid holder capture is not an MVP
  blocker: HolderSnapshot is complete only as storage / parser / one-row write
  / read validation, while real holder analysis remains future work. Continue
  `manual_holder_review` and external-report-only review. Resume paid holder
  source work only after budget, API key, paid-plan terms, rate-limit, and
  secret-boundary approval are ready.
- MVP completion now means the free / existing-source CLI-first research loop
  is operable: candidate intake, scoring / hard-reject persistence, bounded
  Gecko follow-up, Metric accumulation, limited Telegram operation, read-only
  observation / gap review, and minimal manual/community/holder context
  visibility. Scheduler, queue, systemd, paid holder capture, always-on
  operation, and trading guidance are post-MVP.
- Recommended next Yellow slice: implement a read-only `pnpm mvp:status` report
  and consolidate the runbook command order for manual operation. It should
  inspect DB / migration / command availability, core counts, observation-loop
  coverage, and blockers without fetches, writes, Telegram sends, schema
  changes, `--write`, `--watch`, or `pnpm smoke`.
- `pnpm mvp:status` is now available as that read-only report. Use it before
  planning the 3-to-6-hour bounded monitoring rehearsal to see counts,
  migration summary, key command availability, readiness flags, blockers,
  `nearTermGoal=3_to_6_hour_bounded_monitoring_mvp`, and
  `nextRecommendedSlice=bounded_watch_readiness_check`. It does not write,
  fetch, send Telegram, start queue / scheduler / systemd, update checkpoints,
  run `--write` / `--watch`, or run `pnpm smoke`.
- The holder distribution follow-up planner is `pnpm holder:gaps:plan --
  [--limit <N>] [--sinceHours <N>] [--pumpOnly] [--rank <S|A|B|C>]`. It is
  read-only and lists tokens with `holder_distribution_not_recorded` as future
  `holder_distribution_snapshot` candidates using existing Token / Metric /
  manual observation / reviewFlagsJson state only. `suggestedCommand` stays
  `null`; the planner does not fetch external or on-chain data, does not infer
  holder data, does not write DB state, does not add schema, and does not
  enable Telegram, queue / scheduler / systemd / checkpoint, `--write`, or
  `--watch`. The output is planning context rather than a buy signal.
- The community-link follow-up planner is `pnpm community:gaps:plan --
  [--limit <N>] [--sinceHours <N>] [--pumpOnly]`. It is read-only and
  classifies existing `Token.reviewFlagsJson` into missing / invalid /
  present-without-links / reviewed-without-links / present-with-links, then
  suggests either dry-run enrichment, reviewFlags inspection, or manual
  community-link review as a human-gated string. A valid
  `source=manual_community_review` no-link state is reported as
  `reviewed_no_links`: the community gap remains because no public links are
  recorded, but the planner does not repeat `community:review` for that token.
  Future enrichment can revisit it if links appear. It does not fetch, write DB
  state, run enrichment, send Telegram, or start queue / scheduler / systemd /
  checkpoint / `--write` / `--watch`. Community links are not a buy signal and
  are not filled through `token:observe`; holder distribution and market
  condition remain separate unsupported capabilities.
- The manual community review capture foundation is `pnpm community:review --
  --mint <MINT> --hasWebsite <true|false> --hasX <true|false> --hasTelegram
  <true|false> --descriptionPresent <true|false> [--metaplexHit
  <true|false>] [--linkCount <N>] [--operatorNote <TEXT>]`. It writes only
  `Token.reviewFlagsJson` and keeps the existing parser shape intact. Temp
  SQLite coverage exists, and the first production one-token Red rehearsal was
  run for `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` after backup. The
  rehearsal intentionally recorded a reviewed no-link state
  (`source=manual_community_review`, all community link flags false, `linkCount=0`);
  `token:observation` reflects that state, and `community:gaps:plan` now
  distinguishes it as `reviewed_no_links` without suggesting another manual
  review command. The result is review context rather than a buy signal and
  does not enable fetch, Telegram, queue / scheduler / systemd / checkpoint /
  `--write` / `--watch`, holder distribution, or market condition capture.
- `pnpm smoke` is side-effecting, not read-only verification. It may write
  temporary Token / Metric / Dev rows to the configured database and restore
  `data/trend.json`; do not use it for ordinary Green / Yellow verification
  unless the task explicitly includes backup, residue checks, and cleanup
  confirmation. The smoke residue cleanup performed after this boundary was
  limited to the safe `source GLOB 'smoke-test*'` subset only: 6 Token rows and
  1 Metric row were deleted after backup, leaving that subset at 0. Broad
  `mint GLOB '*SMOKE*'` cleanup remains intentionally unrun because non-smoke
  sources such as `geckoterminal.new_pools` can contain SMOKE-like mints.

Migration baseline policy:

- `prisma/migrations` now contains the baseline existing schema migration and
  the add-notification migration.
- `prisma/schema.prisma` and `prisma/dev.db` already exist, so treat migration
  baseline / drift carefully before adding Notification storage.
- The first Yellow must prioritize not breaking the existing DB.
- When creating the migration, inspect schema diff and migration SQL before
  proceeding.
- Stop if the diff includes anything beyond adding the Notification model and
  its intended indexes / constraints.
- Stop if existing `Dev`, `Token`, or `Metric` models receive unintended
  changes.
- Do not use force reset, `db reset`, or destructive migration.
- Do not write to a production-equivalent DB.

Read-only SQL preview results:

- `/tmp/lowcap-baseline-existing-schema.sql` contains only the existing
  `Dev`, `Token`, and `Metric` `CREATE TABLE` statements plus their current
  indexes and foreign keys.
- The baseline SQL does not include `Notification`.
- `/tmp/lowcap-add-notification-only.sql` contains only `CREATE TABLE
  "Notification"` and `CREATE UNIQUE INDEX
  "Notification_notificationKey_key"`.
- The add-notification-only SQL does not include `Dev`, `Token`, or `Metric`
  `DROP`, `ALTER`, or `CREATE`.
- Preview showed no destructive migration.

Recommended formal migration split:

1. Baseline migration: represent the existing `Dev` / `Token` / `Metric`
   schema and current indexes / foreign keys.
2. Add-notification migration: add only the `Notification` table and
   `Notification_notificationKey_key` unique index.

This split is now present as formal migration files and has been applied to
`prisma/dev.db` through the explicit Red DB application task.

Existing DB application boundary:

- The Red DB application task is complete for `prisma/dev.db`.
- Backup exists at
  `/tmp/lowcap-dev.db.before-notification-20260509T111516Z.bak`.
- `20260509000100_baseline_existing_schema` is recorded as applied.
- `20260509000200_add_notification` is deployed.
- `_prisma_migrations` exists with both migration records.
- `Notification` table exists with `Notification_notificationKey_key`.
- `Notification` count is 0.
- Existing counts stayed unchanged: `Dev=0`, `Token=1107`, `Metric=191`.
- `prisma/dev.db` is not dirty in git status.
- Do not run `prisma migrate dev`, `prisma db push`, reset, or destructive
  migration for this state.

First Yellow scope:

Completed:

- add a `Notification` model to `prisma/schema.prisma`.
- confirm migration strategy.
- inspect migration SQL via `/tmp/add_notification.sql`.
- run Prisma validate.
- run Prisma generate.
- run TypeScript check.
- add schema-level verification.

Still excluded:

- DB write integration test.
- broader runtime Notification record write integration beyond the
  `metric_appended` capture-only hooks.
- batch / limit mode Notification writes for `metric:snapshot:geckoterminal`.
- `token_completed` / `loop_complete` Notification write integration.
- Telegram live-send integration.
- failed-send retry.
- queue idempotency.
- systemd recovery.
- durable queue runtime.
- default checkpoint operation.

Notification model design for first Yellow:

- model name: `Notification`.
- `notificationKey @unique` is the first candidate.
- `status` is initially a String candidate.
- `mode` is initially a String candidate.
- `mint` is a denormalized field.
- `tokenId` is nullable.
- `metricId` is nullable.
- `messagePreview` stores safe summary only.
- `rawJsonFree` and `secretFree` are booleans.
- never-store fields stay out of the schema.

Schema-level test policy:

- verify the Notification model exists in the Prisma schema.
- verify `notificationKey` is unique.
- verify never-store fields are absent:
  - Telegram response body.
  - request path.
  - bot token.
  - chat id.
  - token-containing URL.
  - raw API response.
  - raw payload.
  - exact rawJson payload.
  - raw stdout / stderr.
  - `.env`.
  - `DATABASE_URL`.
  - `process.env`.
- verify `status`, `mode`, timestamps, and nullable relation candidates match
  the policy.
- keep tests focused on schema / source inspection; do not include DB write
  integration in the first Yellow.

Yellow stop conditions:

- migration diff expands beyond Notification addition.
- existing models receive unintended changes.
- destructive migration is required.
- `db reset` or force reset is required.
- production DB write is required.
- a never-store field is about to be added.
- Prisma enum introduces unnecessary complexity for the first model cut.
- work expands into repository, capture-only, or Telegram integration.
- work expands into queue or systemd.

Consistency check note: `c6ee95e` passed read-only docs consistency for this
policy. The docs agree that `/tmp` checkpoint files are bounded Red rehearsal
state, the default Gecko checkpoint remains unpromoted, DB state is the first
confirmation target, a checkpoint is only a detect cursor, `existingCount`
confirms an already stored Token, Metric snapshot is a time-series append lane,
strict same `tokenId` / source / `observedAt` Metric duplicate policy was still
unfixed at that checkpoint, `errorCount > 0` does not authorize automatic
continuation, and `selectedCount > 1` / `writtenCount > 1` remain stop
conditions for current single-mint bounded flows. Multi-mint / queue execution,
Telegram live-loop integration, systemd, scheduler / queue, unbounded watch,
default checkpoint operation, bounded executor prototype, and automatic Red
execution remain deferred.

### Authoritative State / Checkpoint Ordering / Restart-Resume Policy

This policy is fixed for the current bounded human-gated scope. It is the
restart / resume foundation before duplicate-prevention, retry, default
checkpoint promotion, systemd, scheduler / queue, or unbounded watch work. It
does not promote the default checkpoint and does not allow automatic resume.

Authoritative state priority:

1. DB state is the first confirmation target for Token and Metric outcomes,
   including Token existence, `metadataStatus`, `metricsCount`, and latest
   Metric. After Red, report confirmation must use DB-read CLIs.
2. A checkpoint is only a detect cursor. It is not proof that Token or Metric
   writes succeeded, and it must not be used alone to mark a mint imported.
3. CLI output is the immediate execution result. Use counts such as
   `selectedCount`, `writtenCount`, `errorCount`, `importedCount`, and
   `existingCount` as evidence for the just-finished run, but prefer DB state
   after restart.
4. Docs record is an operator audit log, not runtime authoritative state. If
   docs are stale, use DB reads to establish current state.
5. Latest Metric is Metric-stage evidence. It does not replace the detect
   checkpoint or Token state.

Checkpoint-DB ordering failure policy:

- If checkpoint advanced but DB write failed, do not treat checkpoint as
  success proof. Confirm DB state, stop on mismatch, and return to human gate.
  Do not continue through default checkpoint or unbounded watch.
- If DB write succeeded but checkpoint update failed, use DB state as the first
  confirmation target. On rerun, inspect `existingCount`, `metricsCount`, and
  latest Metric before approving any next step. Do not roll back only the
  checkpoint and auto-rerun.
- If partial success appears, including `errorCount > 0`, `selectedCount > 1`,
  `writtenCount > 1`, or `importedCount > 1` outside an approved bound, stop.
  Do not continue to the next item or next stage automatically. Compare DB
  state with CLI output and rebuild the approval through human gate.
- If interrupted after write before report confirmation, do not rerun the Red
  command first. Run read-only DB confirmation, then either complete report
  confirmation if state matches or stop and return to human gate.
- If interrupted after Red before docs record, do not rerun Red. Run read-only
  DB confirmation; if state matches, proceed with a Green docs-only record. If
  state mismatches, stop and return to human gate.

Restart / resume policy:

- After restart, start from DB state confirmation.
- Treat checkpoint as cursor context only, not success proof.
- Treat docs record as auxiliary operator log.
- If CLI output or logs are missing, prefer DB reads over reconstructing state
  from checkpoint or docs.
- Maintain rawJson-free and secret-marker checks.
- Any mismatch returns to human gate; automatic resume is not allowed.

Restart confirmation command policy:

```bash
git status --short --branch
git log --oneline -5
pnpm -s token:compare -- --mint <MINT>
pnpm -s token:show -- --mint <MINT>
pnpm -s metrics:report -- --mint <MINT> --limit 2
```

Checkpoint-file inspection, when needed, must stay read-only. The default
checkpoint is still not used for the bounded MVP.

Stop conditions after restart:

- git dirty state.
- HEAD mismatch.
- origin mismatch.
- DB state mismatch.
- checkpoint / DB mismatch.
- `errorCount > 0`.
- `selectedCount > 1`.
- `writtenCount > 1`.
- `importedCount > 1`.
- latest Metric or `metricsCount` mismatch.
- rawJson or secret-marker risk.
- default checkpoint expansion risk.
- unbounded watch expansion risk.
- systemd, scheduler, or queue expansion risk.

Relationship to remaining policy gaps:

- Duplicate prevention and retry policy must build on this authoritative-state
  policy. Token duplicate handling continues to use `Token.mint` uniqueness and
  the existing-token path. Metric remains a time-series append lane; strict
  Metric duplicate enforcement is a later implementation gap.
- Retry remains bounded by this restart / resume policy. Do not expand
  automatic retry until duplicate handling and human-gate return conditions are
  fixed.
- Default checkpoint promotion is still a later task. Before using it,
  restart / resume, duplicate prevention, retry, and log policy must be fixed.
- This policy is only one readiness prerequisite. It does not make systemd,
  scheduler / queue, unbounded watch, always-on operation, bounded executor
  prototype, or automatic Red execution ready.

### Duplicate Prevention Policy

This is a docs-only policy boundary. It fixes the duplicate-prevention
decision rules for the bounded human-gated scope, but it does not add a Prisma
unique constraint, migration, pre-insert dedupe implementation, retry
automation, queue idempotency, systemd, scheduler / queue, unbounded watch, or
default checkpoint operation.

Token duplicate policy:

- Token duplicate detection uses mint as the first key.
- `Token.mint` uniqueness is the current DB-schema foundation.
- When detect / import sees an existing Token for the same mint, treat it as
  `existingCount`. This is not a failure, does not increment `importedCount`,
  and must not recreate the Token.
- After restart or retry consideration, confirm Token existence through DB
  reads first. Do not infer Token creation from checkpoint alone.

Metric duplicate policy:

- Metric snapshot is a time-series append lane.
- Multiple snapshots for the same mint are expected observations when
  `observedAt` differs.
- A strict Metric duplicate candidate is same `tokenId`, same source, and same
  `observedAt`.
- The current Prisma schema has `@@index([tokenId, observedAt])`, not a unique
  constraint, so strict duplicates are not prevented by DB constraint.
- Before always-on, queue, or multi-candidate execution, pick one enforcement
  path: a pre-insert check for same `tokenId` / source / `observedAt`, or a
  Prisma schema / migration adding an appropriate unique constraint. This task
  does neither.

Bounded-flow duplicate control:

- Use `expectedMetricsCount` guards, latest Metric / `recentMetrics`
  confirmation, `--minGapMinutes` where supported, human gate, `writtenCount <=
  1`, and `metrics:report -- --mint <MINT> --limit 2` post-confirmation.
- Do not immediately rerun the same Red command after retry or interruption.
- If interrupted after a possible Metric write, run `metrics:report`,
  `token:compare`, and `token:show` first. If the expected Metric exists, do
  not rerun. If it does not exist, still return to human gate instead of
  automatic retry.

Retry / restart relationship:

- Use the authoritative restart policy: DB state is the first confirmation
  target.
- Retry decisions prefer DB read confirmation over checkpoint state.
- If CLI output is missing, confirm Token / Metric / latest Metric /
  `metricsCount` from DB reads.
- If the operator cannot distinguish duplicate risk from failed write, stop and
  return to human gate.

Multi-candidate / queue gate:

- Before multi-mint, scheduler, queue, or systemd work, fix per-mint Token
  dedupe, per-Metric strict duplicate enforcement, per-item failure handling,
  retry max count, cooldown, ordering, and idempotency-key behavior.
- If these are not fixed, do not proceed to queue, systemd, default checkpoint,
  or unbounded watch.

Duplicate stop conditions:

- same `tokenId` / source / `observedAt` duplicate risk.
- `metricsCount` mismatch.
- latest Metric mismatch.
- `writtenCount > 1`.
- `importedCount > 1`.
- ambiguous `existingCount` / `importedCount` interpretation.
- checkpoint / DB mismatch.
- retry after ambiguous write result.
- duplicate decision cannot be made from DB reads.
- multi-mint expansion risk.

Not fixed by this policy:

- strict Metric duplicate enforcement.
- Prisma unique constraint or migration.
- pre-insert dedupe implementation.
- retry automation.
- queue idempotency.
- systemd, scheduler / queue, unbounded watch, default checkpoint operation, or
  always-on operation.

### Retry / Failure Handling Policy

This is a docs-only operator policy for the bounded human-gated scope. It does
not implement retry automation, retry max counts, cooldown policy, queue
idempotency, systemd recovery, Telegram failed-send retry, a bounded executor
prototype, or automatic Red execution.

Basic policy:

- Retry decisions prefer DB read confirmation over checkpoint state.
- Ambiguous write results do not allow automatic retry.
- `errorCount > 0` does not authorize automatic continuation.
- `selectedCount > 1`, `writtenCount > 1`, or `importedCount > 1` is a stop
  condition for current bounded flows unless a separate approval explicitly
  raises the bound.
- Any retry consideration must return through `bounded-flow:plan`, planner,
  validator, and human gate.

No-side-effect failure:

- Failures before Red execution, including guide / planner / validator failure,
  guard mismatch, marker check failure, or invalid approval shape, are treated
  as no-write failures.
- Do not run `nextRedCommand`; inspect `status` / `reason` and do not proceed
  to human gate until the issue is resolved.
- Dry-run failures with `writeEnabled=false` have no DB write; recheck input,
  guard, and candidate instead of escalating to Red.

Write-attempted failure:

- After Red execution, `errorCount > 0` requires read-only DB confirmation via
  `token:compare`, `token:show`, `metrics:report`, or the closest relevant
  report CLI.
- If DB state does not match the expected one-mint / one-stage outcome, stop
  and return to human gate.
- `selectedCount > 1`, `writtenCount > 1`, or `importedCount > 1` is outside
  the current bounded flow and must not proceed to docs record or next stage
  without a new approval.

Partial success:

- Mixed `okCount` / `errorCount` results are partial success and must not
  continue automatically.
- Confirm DB state first.
- If the result exceeds the expected one-mint / one-stage bound, stop.
- Do not move to the next item or next stage automatically.

Ambiguous write result:

- Missing CLI output / log, unknown tmux single-run exit, interrupted process,
  or a network error where write outcome cannot be separated from fetch failure
  is an ambiguous write result.
- Do not rerun Red first.
- Run DB read confirmation first.
- If the operator cannot distinguish duplicate risk from failed write, stop and
  return to human gate.

Cooldown / retry count:

- Operator-level Red retry max is automatic `0`.
- Existing fetch / watch cooldown behavior is implementation-local and is not
  an operator-level retry policy.
- Runtime retry max count implementation and cooldown automation must remain
  unresolved until systemd, scheduler / queue, unbounded watch, or default
  checkpoint operation are separately approved.
- Do not expand automatic retry at this stage.

Stage-specific policy:

- Detect write expects `importedCount <= 1`. `existingCount` is an existing
  Token confirmation value, not a failure. `importedCount > 1` stops. A
  checkpoint is not success proof.
- `enrich_rescore` expects one selected mint, one ok result, zero errors, and
  writes limited to the target mint. Keep notify sends out of the base bounded
  retry path unless a separate Red approval allows them.
- Metric snapshot expects `selectedCount=1`, `writtenCount=1`, and
  `errorCount=0` for a write step. Confirm through `metricsCount`, latest
  Metric, and `recentMetrics`. Repeated snapshots are observations when
  `observedAt` differs; same `tokenId` / source / `observedAt` is the strict
  duplicate candidate.

Relationship to restart and duplicate policies:

- Restart uses DB state as the first confirmation target.
- Duplicate prevention uses mint / `Token.mint` for Token and same `tokenId` /
  source / `observedAt` as the strict Metric duplicate candidate.
- Retry decisions are based on DB read confirmation, not checkpoint state.

Return to human gate when:

- `errorCount > 0`.
- `selectedCount > 1`.
- `writtenCount > 1`.
- `importedCount > 1`.
- partial success.
- ambiguous write result.
- DB state mismatch.
- checkpoint / DB mismatch.
- duplicate decision cannot be made.
- latest Metric or `metricsCount` mismatch.
- rawJson or secret-marker risk.
- Telegram, systemd, scheduler / queue, or unbounded expansion risk.

Not fixed by this policy:

- retry automation.
- runtime retry max count implementation.
- cooldown automation.
- queue idempotency.
- systemd recovery.
- Telegram failed-send retry.
- bounded executor prototype.

### Cooldown / Retry Max Count Policy

This is a docs-only operator policy. It does not implement retry automation,
queue idempotency, systemd recovery, default checkpoint operation, Telegram
failed-send retry, a bounded executor prototype, or automatic Red execution.

Retry categories:

- no-side-effect fetch retry.
- write-attempted retry.
- ambiguous write retry.
- Telegram failed-send retry.
- systemd / queue retry.

No-side-effect fetch retry:

- Fetch-only retry before any write is separate from write-attempted retry.
- The existing `detect:geckoterminal:new-pools` watch behavior that retries one
  fetch-only 429 / timeout-like failure is implementation-local fetch retry.
- A retry is no-side-effect only when no DB / Token / Metric write has
  happened.
- If fetch retry fails, do not move to Red. Inspect status / reason /
  candidate state and return to the operator flow.

Write-attempted retry:

- Automatic retry after a Red exact command is not allowed.
- Operator-level Red retry max is automatic `0`.
- `errorCount > 0`, `selectedCount > 1`, `writtenCount > 1`, or
  `importedCount > 1` is not a retry trigger; it is a stop condition.
- Run DB read confirmation first.
- If a rerun is still needed, return to human gate and treat it as a separate
  Red approval.

Ambiguous write result:

- Missing CLI output / log, unknown tmux exit, interrupted process, or network
  error where fetch failure and write outcome cannot be separated is ambiguous.
- Automatic retry is not allowed.
- Do not rerun the Red command first.
- Run DB read confirmation first.
- If duplicate vs failed write cannot be decided, stop and return to human
  gate.

Cooldown policy:

- Operator-level cooldown is not automatic retry.
- Cooldown is only a waiting hint for re-check timing or human-gate timing.
- Cooldown seconds and retry counts are not used as runtime automation.
- Existing watch / wrapper cooldown sleeps are implementation-local and do not
  change the operator-level retry max.
- Re-evaluate cooldown policy before systemd, scheduler / queue, unbounded
  watch, or default checkpoint operation.

Telegram failed-send retry:

- Telegram sender failed status / error code and live-loop retry are separate
  concerns.
- Send condition, capture-only rehearsal consistency, and log / secret-free
  output policy are fixed at the docs level.
- Durable notification dedupe storage implementation, runtime integration,
  cooldown automation, and failed-send retry automation remain future work.
- Telegram failed-send retry is outside this retry max count policy.

Systemd / queue retry:

- Systemd restart retry and queue retry remain deferred.
- Queue idempotency, default checkpoint behavior, multi-candidate failure
  handling, and duplicate-prevention enforcement are not fixed enough for
  service-level retry.
- Do not design automatic service restart as a way to rerun Red commands.

Stage-specific policy:

- Detect separates fetch-only retry from detect write retry. `importedCount >
  1` stops, `existingCount` is not a failure, and checkpoint state is not the
  retry authority.
- `enrich_rescore` expects `selected=1`, `ok=1`, `error=0`, target-mint-only
  writes, and `notifySent=0` unless a separate Red approval allows notify.
  Errors require DB read confirmation and human gate.
- Metric snapshot expects `selectedCount=1`, `writtenCount=1`, and
  `errorCount=0`. Ambiguous results require `metrics:report` / `token:compare`
  before any rerun, and same-observedAt strict duplicate risk stops.
- Tmux single-run does not become retry automation. If tmux exit / log /
  outcome is unclear, inspect `/tmp` log plus DB read confirmation and return
  to human gate before any new tmux Red command.

Return to human gate when:

- `errorCount > 0`.
- `selectedCount > 1`.
- `writtenCount > 1`.
- `importedCount > 1`.
- partial success.
- ambiguous write result.
- DB state mismatch.
- checkpoint / DB mismatch.
- duplicate decision cannot be made.
- latest Metric or `metricsCount` mismatch.
- rawJson or secret-marker risk.
- Telegram, systemd, scheduler / queue, or unbounded expansion risk.

Not fixed by this policy:

- retry automation.
- runtime retry max count implementation.
- queue idempotency.
- systemd recovery.
- Telegram failed-send retry.
- bounded executor prototype.

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
Telegram runtime dedupe / cooldown / failed-send implementation,
capture-only runtime integration, and multi-candidate handling. The prototype must not bypass the
human gate, and it must not start as a multi-mint runner, queue worker, systemd
service, or unbounded watch.

Systemd, scheduler / queue, and unbounded watch are further downstream than a
bounded executor prototype. Do not enter that layer until restart / recovery,
duplicate prevention, checkpoint behavior, and secret-free logging are fixed.
Existing Telegram checks do not make Telegram live-loop integration ready; the
wrapper boundary excludes Telegram until the fixed docs policy is backed by
runtime dedupe, failed-send handling, cooldown automation, capture-only
consistency, and secret-free implementation in the intended runtime scope.

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

`detect write` is not part of the initial wrapper scope because default
checkpoint operation, queue/runtime restart implementation, and detect cursor
side effects remain outside this wrapper boundary. The implemented intent set
is limited to `enrich_rescore`, `first_metric_snapshot`, and
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

Second read-only recheck note: `7a1e410` also passed docs consistency for this
boundary. The docs still agree on the ok / stop split: ok output has commands
with `redExecution.placeholder=true` and `exactCommand=null`; stop output has
`commands=null`, no `redExecution`, no `exactCommand`, and no concrete command.
`stopConditionCodes` remains a human-gate checklist, `forbidden` remains
wrapper-specific, and the CLI remains a non-executor planning aid rather than
an executor wrapper or automatic Red runner.

### Bounded-flow Plan Operator Flow

Use `ops:gecko:bounded-flow:plan` as the first operator-facing packet, not as
an executor. The recommended human-gated order is:

1. `ops:gecko:bounded-flow:plan`
2. `ops:gecko:bounded-flow:guide`
3. `ops:gecko:single-candidate:plan`
4. `ops:gecko:single-candidate:validate`
5. human gate
6. Red exact command in a separate Red task

Responsibilities:

- `bounded-flow:plan`: builds the operator-facing skeleton with command
  strings, `approvalRequest.requiredFields`, `sideEffectUpperBoundSpec`,
  `stopConditionCodes`, `forbidden`, and the stage order. It does not read DB
  state, so `currentStage=null` and `nextStage=null`. It does not print an
  `exactCommand` and does not run existing CLIs, guide, planner, validator,
  `nextRedCommand`, or any Red command.
- `bounded-flow:guide`: displays the intent-specific stage order and command
  guide as `mode=non_executor_guide`. It is for operator review and does not
  build the approval skeleton or execute commands.
- `single-candidate:plan`: reads the actual DB state for the mint, determines
  `currentStage`, `nextStage`, `nextRedCommand`, `nextRedCommandKind`, and the
  side-effect upper bound, while keeping `willExecute=false`.
- `single-candidate:validate`: validates the saved planner JSON and returns
  `approvalReady` / `canProceedToHumanGate`. If unsafe rawJson / secret markers
  are detected, it does not reprint `nextRedCommand`.
- `human gate`: confirms that validator approval is present. This is still not
  automatic execution; `approvalReady=true` and `canProceedToHumanGate=true`
  only mean the operator may prepare a separate Red approval request.
- `Red exact command`: runs only after the human gate in a separate Red task,
  and only as the exact command copied from the approved planner / validator
  path.

This flow keeps `bounded-flow:plan` as a non-executor wrapper / planning aid.
Do not make it run guide, planner, validator, `nextRedCommand`, or Red
execution. Automatic Red execution, executor wrapper, always-on operation,
systemd, scheduler / queue, unbounded watch, default checkpoint operation, and
Telegram live-loop integration remain outside this flow.

Consistency check note: `3388751` passed read-only docs consistency for this
operator flow. The docs agree on the order `bounded-flow:plan` ->
`bounded-flow:guide` -> `single-candidate:plan` ->
`single-candidate:validate` -> human gate -> Red exact command, and on the role
split: `plan` provides the skeleton / checklist / command strings, `guide`
shows the intent-specific stage order, planner reads DB state and selects
`currentStage` / `nextRedCommand`, validator checks `approvalReady` /
`canProceedToHumanGate`, the human gate is not automatic execution, and Red
execution is a separate exact-command task. This check did not promote
`bounded-flow:plan` into an executor and did not change the hold on automatic
Red execution, executor wrapper, always-on operation, systemd, scheduler /
queue, unbounded watch, default checkpoint operation, or Telegram live-loop
integration.

Verified note: `6296e05` also passed read-only docs consistency for the same
operator flow. The recommended order stays `bounded-flow:plan` ->
`bounded-flow:guide` -> `single-candidate:plan` ->
`single-candidate:validate` -> human gate -> Red exact command. The role split
is unchanged: `plan` is the skeleton / checklist / command-string packet,
`guide` is the intent-specific stage-order guide, planner performs DB-backed
stage / `nextRedCommand` selection, validator checks `approvalReady` /
`canProceedToHumanGate`, the human gate is not automatic execution, and Red is
a separate exact-command task. This verification keeps `bounded-flow:plan` as
a non-executor planning aid and does not promote automatic Red execution,
executor wrapper, always-on operation, systemd, scheduler / queue, unbounded
watch, default checkpoint operation, or Telegram live-loop integration.

Verified follow-up note: `b9abee6` also passed read-only docs consistency for
the operator flow. The docs still agree on
`bounded-flow:plan` -> `bounded-flow:guide` ->
`single-candidate:plan` -> `single-candidate:validate` -> human gate -> Red
exact command. The role split remains unchanged: `plan` builds the operator
packet / approval skeleton / checklist with command strings and required
fields, `guide` reviews the intent-specific stage order, planner performs
DB-backed stage / `nextRedCommand` selection, validator checks `approvalReady`
/ `canProceedToHumanGate`, the human gate is not automatic execution, and Red
is a separate exact-command task. This keeps `bounded-flow:plan` as a
non-executor planning aid that does not run guide, planner, validator,
`nextRedCommand`, or Red, and it leaves automatic Red execution, executor
wrapper, always-on operation, systemd, scheduler / queue, unbounded watch,
default checkpoint operation, and Telegram live-loop integration deferred.

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

## Bounded Watch Readiness CLI

`pnpm bounded:watch:readiness` is the read-only readiness check before moving
from one-off bounded operations toward a 3-to-6-hour bounded monitoring MVP.
It reports detect command availability, checkpoint support, Token.mint dedupe
support, Metric accumulation support, notification capture / retry-plan
support, observation review support, readiness flags, blockers, and next
command suggestions as strings only.

The command does not write production DB rows, fetch external APIs, send
Telegram, update checkpoints, start queue / scheduler / systemd, execute
`--write` / `--watch`, or run `pnpm smoke`. Pro API and paid holder source work
remain parked. The operating purpose is candidate detection, storage,
score/risk review, Metric accumulation, bounded notification handling, and
later outcome review; it is not automatic trading or buy-signal output.

Use the readiness report before asking for a Red 3h dry-run:

```bash
pnpm -s bounded:watch:readiness
```

The next step after a clean readiness report is still a separate approval for a
3h dry-run. A 3h write rehearsal and any 6h monitored run must stay separate
Red tasks. Scheduler / systemd work waits until after the 3h/6h monitored-run
path has been verified.

### Three Hour Dry-Run Result

The first 3h GeckoTerminal detect watch dry-run completed on 2026-05-16:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --pumpOnly --limit 1 --maxIterations 180 --intervalSeconds 60
```

Result summary:

- duration: approximately 3 hours / 180 watch cycles.
- `dryRun=true`, `writeEnabled=false`, `watchEnabled=true`,
  `checkpointEnabled=false`.
- `inputCount=3600`, `processedCount=180`, `selectedCount=180`,
  `acceptedCount=180`, `rejectedCount=0`, `importedCount=0`,
  `existingCount=0`.
- `failedCount=0`, `rateLimitRetryCount=0`,
  `rateLimitRetrySuccessCount=0`, `failureCooldownCount=0`.
- Token / Metric / Notification / HolderSnapshot counts stayed
  `1116 / 191 / 6 / 1` before and after.
- The only checkpoint file present before and after was
  `data/checkpoints/dexscreener-token-profiles-latest-v1.json`; no
  GeckoTerminal checkpoint file was created or updated.
- `data/trend.json` stayed unchanged and the worktree stayed clean before the
  docs record.
- The existing CLI printed detector candidate summaries in its final JSON, but
  no raw provider response body, environment variable, API key, or Telegram
  secret was recorded.

This result is sufficient to consider a separately approved 3h write rehearsal
or narrower bounded write rehearsal. It is not approval for scheduler /
systemd, queue, unbounded watch, Telegram live send, or checkpoint promotion.

### Three Hour Write Rehearsal Preflight

This is a docs-only preflight. The 3h write rehearsal has not been run.

Implementation boundary confirmed from the current CLI:

- `detect:geckoterminal:new-pools --write` evaluates GeckoTerminal new-pool
  candidates and, for accepted candidates, delegates to `importMint`.
- `importMint` reads by unique `Token.mint`; if the mint already exists, it
  returns the existing Token without creating another row.
- If the mint is new, `importMint` creates one `Token` with
  `metadataStatus=mint_only`, `source`, `importedAt`, and an
  `entrySnapshot.firstSeenSourceSnapshot`.
- The detect write path does not append `Metric` rows, create `Notification`
  rows, touch `HolderSnapshot`, enrich, rescore, or call Telegram live send.
- There is no `--notify` flag in this detect command. Existing Telegram
  credentials, if present in the environment, are not used by this CLI path.

DB boundary:

- The DB write target is the active Prisma `DATABASE_URL`.
- `--checkpointFile /tmp/...` isolates only the checkpoint side effect; it does
  not move Token writes to a temporary database.
- A current-DB rehearsal validates the real MVP accumulation loop because Token
  counts can increase in the same DB used by later enrichment, Metric
  accumulation, notification review, and outcome reporting.
- An isolated rehearsal would require an explicit environment override such as
  `DATABASE_URL=file:/tmp/<db>.db` plus schema preparation before the run. That
  is safer for side-effect containment, but it does not validate current-DB
  accumulation and is a different Red task.

Checkpoint boundary:

- `--checkpointFile` is supported only when both `--watch` and `--write` are
  present.
- Without `--checkpointFile`, watch write mode defaults to
  `data/checkpoints/geckoterminal-new-pools.json`.
- The Red rehearsal should use a fresh isolated `/tmp` checkpoint so existing
  repo-local `data/checkpoints` files are not touched.
- If the chosen `/tmp` checkpoint already exists, stop or explicitly decide to
  reuse it before running, because an existing cursor can filter candidates.

Current-DB rehearsal option:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 180 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal.json
```

Expected side effects if approved and run:

- external GeckoTerminal fetches occur during the watch.
- current `DATABASE_URL` may receive new `mint_only` Token rows.
- existing mints may be counted as existing rather than imported.
- the isolated `/tmp` checkpoint may be created or advanced.
- no Metric, Notification, HolderSnapshot, Telegram live send, queue,
  scheduler, systemd, schema, migration, `pnpm smoke`, enrichment, rescoring,
  or outcome persistence is expected from this detect command.

Isolated `/tmp` DB rehearsal option:

- Use only if the operator wants DB side effects contained outside the current
  DB.
- Requires a separate approved setup step to point `DATABASE_URL` at a
  temporary SQLite file and prepare the schema.
- It can confirm CLI write mechanics, but it is not the same as validating the
  current-DB MVP accumulation path.

Recommended next Red execution:

- Prefer the current-DB rehearsal above if the operator accepts durable
  mint-only observations as the intended MVP validation.
- Keep the checkpoint isolated in `/tmp`.
- Capture before / after counts for Token, Metric, Notification, and
  HolderSnapshot.
- Stop on failed cycles, 429/rate-limit growth, unexpected Metric /
  Notification / HolderSnapshot writes, Telegram output, raw response leakage,
  checkpoint writes outside `/tmp`, or worktree/data-file drift.

### Three Hour Write Rehearsal Result

The current-DB 3h write rehearsal completed as the approved Red task. Exact
command:

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 180 --intervalSeconds 60 --checkpointFile /tmp/lowcap-bot-gecko-write-rehearsal.json
```

Runtime / command summary:

- duration: roughly three hours, naturally stopped at `maxIterations=180`.
- `dryRun=false`, `writeEnabled=true`, `watchEnabled=true`,
  `checkpointEnabled=true`.
- `checkpointFile=/tmp/lowcap-bot-gecko-write-rehearsal.json`.
- `cycleCount=180`, `inputCount=3600`, `processedCount=180`,
  `selectedCount=180`, `acceptedCount=180`, `rejectedCount=0`.
- `importedCount=180`, `existingCount=0`.
- `failedCount=0`, `rateLimitRetryCount=0`,
  `rateLimitRetrySuccessCount=0`, `failureCooldownCount=0`.
- The final `/tmp` checkpoint cursor was
  `poolCreatedAt=2026-05-16T17:10:57.000Z`.

DB count confirmation:

| Table | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Token | 1116 | 1296 | +180 |
| Metric | 191 | 191 | 0 |
| Notification | 6 | 6 | 0 |
| HolderSnapshot | 1 | 1 | 0 |

Boundary confirmation:

- The rehearsal confirmed current-DB mint-only Token accumulation through
  `detect:geckoterminal:new-pools --watch --write`.
- It did not confirm Metric accumulation, Notification capture, Telegram live
  send, enrich / rescore, holder snapshot capture, or outcome persistence.
- No Telegram live send was observed.
- The checkpoint side effect was isolated to
  `/tmp/lowcap-bot-gecko-write-rehearsal.json`.
- Repo-local `data/checkpoints` stayed unchanged; only the existing
  DexScreener checkpoint file was present after the run.
- `data/trend.json` stayed unchanged.
- The CLI output included detector / handoff / import summaries, not raw
  provider response bodies or secrets.

Next boundary:

- Treat Metric accumulation as a separate slice, likely via a bounded
  `metric:snapshot:geckoterminal` preflight / Red task.
- Treat Notification accumulation / Telegram live send as a separate slice.
- Do not fold Metric, Notification, Telegram, queue, scheduler, systemd, or
  outcome persistence into the detect write command.

### Bounded Metric Accumulation Preflight

This is a docs-only preflight. `metric:snapshot:geckoterminal` has not been
run after the 3h write rehearsal.

Git history boundary:

- HEAD contains the parallel docs-only policy commits:
  `2b5521e`, `205962e`, `a20b826`, `a54db45`, `9899c4f`, and `d380162`.
- HEAD also contains `cf07465`, the 3h write rehearsal result commit.
- The write rehearsal result is therefore recorded on top of the docs policy
  history rather than replacing it.

Current DB state:

- Token / Metric / Notification / HolderSnapshot counts are
  `1296 / 191 / 6 / 1`.
- The 3h write rehearsal added 180 GeckoTerminal-origin pump tokens.
- `review:queue:geckoterminal -- --pumpOnly --limit 10` reports
  `geckoOriginTokenCount=180`, `firstSeenSourceSnapshotCount=180`,
  `enrichPendingCount=180`, and `metricPendingCount=180`.
- The cohort can be recognized by GeckoTerminal origin, `metadataStatus=mint_only`,
  first-seen anchors in the 2026-05-16 14:10-17:12Z rehearsal window,
  `metricsCount=0`, and pump mints.

Implementation boundary confirmed from `metric:snapshot:geckoterminal`:

- Script: `pnpm metric:snapshot:geckoterminal`.
- CLI options include `--mint`, `--limit`, `--sinceMinutes`, `--pumpOnly`,
  `--prioritizeRichPending`, `--minGapMinutes`, `--source`, `--write`,
  `--watch`, `--intervalSeconds`, and `--maxIterations`.
- It is dry-run by default.
- It fetches live GeckoTerminal token snapshots from the token endpoint, one
  request per selected token, unless a fixture env override is explicitly used.
- It writes `Metric` rows only when `--write` is present.
- It writes `observedAt`, `source`, sanitized `rawJson`, and `volume24h` when
  available; FDV / market-cap / liquidity-style values stay in sanitized
  `rawJson` for read-only reports.
- It does not update Token rows.
- It does not write HolderSnapshot rows.
- It does not send Telegram.
- It has no checkpoint file option or checkpoint update behavior.
- In recent batch mode, it does not create Notification rows.
- In exact `--mint` mode, after a successful Metric write it also creates a
  capture-only `metric_appended` Notification row through
  `maybeCreateByNotificationKey`.
- In watch mode, a 429-like token snapshot error aborts the remaining selected
  tokens for that cycle and records rate-limit counters.

Selection / duplicate boundary:

- Recent batch mode selects GeckoTerminal-origin Tokens by
  `firstSeenSourceSnapshot.detectedAt` when present, otherwise `Token.createdAt`,
  bounded by `--sinceMinutes`.
- `--pumpOnly` filters to pump mints.
- `--limit` bounds the selected token count.
- There is no metadata-status filter and no "has no Metric" filter in this CLI.
- `--minGapMinutes` checks the latest Metric for the same token and source
  before fetch; when the latest Metric is still inside the gap, the token is
  skipped before external fetch and no Metric is created.
- Initial Red execution should use a small limit and `--minGapMinutes` even
  though the current 180-token cohort has no Metrics.

Recommended first Red command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Expected side effects if separately approved and run:

- one live GeckoTerminal token snapshot fetch;
- one current-DB Metric append if the selected token is not skipped and fetch /
  parse succeeds;
- Metric count should increase by at most 1;
- Token / Notification / HolderSnapshot counts should remain unchanged in this
  batch-mode command;
- no Telegram live send;
- no checkpoint update;
- no detect command, enrich / rescore, scheduler, systemd, queue, or
  `pnpm smoke`.

Alternatives:

- `--limit 3` can be considered after the limit-1 Red result is clean.
- Exact `--mint <MINT> --write` should be treated as a separate Notification
  accumulation preflight because it also creates a capture-only
  `metric_appended` Notification row after a successful Metric write.
- Do not target all 180 tokens in the first Metric accumulation Red task.

Stop conditions for the next Red task:

- more than the approved Metric count would be written;
- Notification appears in batch mode;
- Token or HolderSnapshot writes appear;
- Telegram output appears;
- rate-limit / 429 counters grow;
- raw provider body or secret-like material appears;
- checkpoint, queue, scheduler, systemd, detect, enrich / rescore, or
  `pnpm smoke` is introduced.

### Bounded Metric Accumulation Result

The first bounded Metric accumulation Red task completed in recent batch mode.
Exact command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 1 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Selection and write summary:

- selected mint:
  `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump`
- selected token id: `5379`
- Metric id: `1274`
- `observedAt=2026-05-16T20:39:48.499Z`
- `source=geckoterminal.token_snapshot`
- `volume24h=0`
- `selectedCount=1`, `okCount=1`, `writtenCount=1`, `skippedCount=0`,
  `errorCount=0`
- `minGapMinutes=60` was active.
- No `skipped_recent_metric`, fetch error, rate-limit retry, or failure
  cooldown was observed.

DB count confirmation:

| Table | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Token | 1296 | 1296 | 0 |
| Metric | 191 | 192 | +1 |
| Notification | 6 | 6 | 0 |
| HolderSnapshot | 1 | 1 | 0 |

Queue confirmation:

- `review:queue:geckoterminal -- --pumpOnly` moved `metricPendingCount` from
  180 to 179.
- The selected mint now has `metricsCount=1`,
  `latestMetricObservedAt=2026-05-16T20:39:48.499Z`, and
  `latestMetricSource=geckoterminal.token_snapshot`.

Boundary confirmation:

- This was batch mode; exact `--mint` mode was not used.
- Notification capture was not part of this task, and Notification count stayed
  unchanged.
- Telegram live send did not occur.
- HolderSnapshot count stayed unchanged.
- Token enrich / rescore did not run, and Token count stayed unchanged.
- No checkpoint file was created or updated by this command.
- No detect / import / queue / scheduler / systemd / `pnpm smoke` command was
  run.
- `metrics:window-report -- --mint
  AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump --windows 30,60,1440`
  remained read-only and confirmed one valid FDV sample in the 24h window; the
  30m and 60m windows remained `no_data` because the Metric was observed
  outside those windows.

Next boundary:

- A small follow-up Metric accumulation run such as `--limit 3` can be
  considered after a separate Red approval.
- Notification capture remains a separate slice because exact `--mint` mode can
  create a capture-only `metric_appended` Notification after a successful
  Metric write.
- This result confirms one Metric append from the 3h write rehearsal cohort; it
  does not confirm Telegram live send, HolderSnapshot real-source capture,
  enrich / rescore, scheduler / systemd operation, or outcome persistence.

### Bounded Metric Accumulation Limit 3 Result

The second bounded Metric accumulation Red task expanded the same recent batch
mode to `--limit 3`. Exact command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 3 --sinceMinutes 1440 --minGapMinutes 60 --write
```

Selection and write summary:

| Token id | Mint | Status | Metric id | observedAt |
| ---: | --- | --- | ---: | --- |
| 5379 | `AW7QAFFfEiGg5o4EfB6yUg4EB8ML3N74F3A2F4uepump` | `skipped_recent_metric` | null | latest Metric `2026-05-16T20:39:48.499Z` |
| 5378 | `G4qJ2GcVBkSEGa9D4Z7FhbHcZFSPaKxFyKiaw7K2pump` | `ok` | 1275 | `2026-05-16T21:00:33.409Z` |
| 5377 | `P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump` | `ok` | 1276 | `2026-05-16T21:00:33.842Z` |

Command summary:

- `selectedCount=3`, `okCount=2`, `skippedCount=1`, `errorCount=0`,
  `writtenCount=2`.
- `minGapMinutes=60` was active and correctly skipped the prior AW7 Metric
  row.
- The two written rows used source `geckoterminal.token_snapshot`.
- Both written rows reported `volume24h=0` and safe-summary presence for
  price, FDV, reserve, and top pool.
- No fetch error, rate-limit retry, failure cooldown, or destructive operation
  was observed.

DB count confirmation:

| Table | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Token | 1296 | 1296 | 0 |
| Metric | 192 | 194 | +2 |
| Notification | 6 | 6 | 0 |
| HolderSnapshot | 1 | 1 | 0 |

Queue confirmation:

- `review:queue:geckoterminal -- --pumpOnly` moved `metricPendingCount` from
  179 to 177.
- The two newly written mints now have `metricsCount=1` and
  `latestMetricSource=geckoterminal.token_snapshot`.
- The next metric-pending preview starts after those written tokens.

Read-only report confirmation:

- `metrics:window-report -- --mint
  G4qJ2GcVBkSEGa9D4Z7FhbHcZFSPaKxFyKiaw7K2pump --windows 30,60,1440`
  returned `metricCount=1`, `fdvMetricCount=1`,
  `latestFdv=2613.4820446808`, and one thin 24h FDV sample.
- `metrics:window-report -- --mint
  P3ugqvSd3ZqH7Nkj3n8hiCYHdouvqob6dBLKowfpump --windows 30,60,1440`
  returned `metricCount=1`, `fdvMetricCount=1`,
  `latestFdv=2433.7898164111`, and one thin 24h FDV sample.
- The 30m and 60m windows remained `no_data` for both mints because their first
  Metrics were observed outside those windows.

Boundary confirmation:

- This was batch mode; exact `--mint` mode was not used.
- Notification capture was not part of this task, and Notification count stayed
  unchanged.
- Telegram live send did not occur.
- HolderSnapshot count stayed unchanged.
- Token enrich / rescore did not run, and Token count stayed unchanged.
- No checkpoint file was created or updated by this command.
- No detect / import / queue / scheduler / systemd / `pnpm smoke` command was
  run.

Next boundary:

- Exact `--mint` mode Notification capture needs a separate preflight because
  it can create a capture-only `metric_appended` Notification after a
  successful Metric write.
- Further Metric accumulation can be considered in small bounded batches after
  explicit Red approval; do not jump directly to the remaining full cohort
  without another boundary check.

### Metric Appended Notification Capture Preflight

This is a read-only / docs-only preflight. Exact `--mint` mode Notification
capture has not been run.

Current state:

- Token / Metric / Notification / HolderSnapshot counts are
  `1296 / 194 / 6 / 1`.
- `review:queue:geckoterminal -- --pumpOnly` reports
  `metricPendingCount=177`.
- AW7 / G4 / P3 from the previous Metric accumulation steps now each have
  `metricsCount=1` and no Notification row; they are not the preferred target
  for this preflight because `--minGapMinutes 60` can skip existing recent
  Metrics before fetch.

Implementation boundary confirmed from `metric:snapshot:geckoterminal`:

- `--mint <MINT>` selects exactly one existing Token and sets mode `single`.
- `--pumpOnly`, `--limit`, and `--sinceMinutes` are batch-selection options
  and are not needed for exact `--mint` mode.
- `--minGapMinutes` is applied before fetch for both batch and exact modes. If
  the latest Metric for the same token and source is still inside the gap, the
  result is `skipped_recent_metric`.
- `skipped_recent_metric` creates no Metric and no Notification.
- With `--write`, a successful fetch / parse creates one Metric row.
- Only when `args.mint` is present and a Metric was created does the CLI call
  `maybeCreateByNotificationKey`.
- The captured Notification key is `<mint>:metric_appended:<metricId>`.
- The captured Notification uses:
  - `eventType=metric_appended`
  - `trigger=metric_appended`
  - `status=captured`
  - `mode=capture_only`
  - `source=metric:snapshot:geckoterminal`
  - `tokenId=<target token id>`
  - `metricId=<created Metric id>`
  - `rawJsonFree=true`
  - `secretFree=true`
- The CLI imports no Telegram sender and has no live-send call in this path.
  `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` presence therefore does not cause a
  send from this command.
- The command does not update Token rows, HolderSnapshot rows, checkpoints,
  enrich / rescore state, queue / scheduler / systemd, or Telegram state.

Recommended target mint:

```text
ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump
```

Selection reason:

- Token id `5376`.
- GeckoTerminal-origin pump token from the 3h write rehearsal cohort.
- `metadataStatus=mint_only`.
- `metricsCount=0`.
- `notificationCount=0`.
- Appears in the current `metricPending` queue.
- Avoids the min-gap skip risk of the already-written AW7 / G4 / P3 mints.

Candidate Red command:

```bash
pnpm -s metric:snapshot:geckoterminal -- --mint ENRAEN9assGLHU2QQCo4cAv818mDrMkb6f6pG8hHpump --minGapMinutes 60 --write
```

Expected result if separately approved and run:

- one live GeckoTerminal token snapshot fetch;
- Metric count `+1`;
- Notification count `+1`;
- Notification `status=captured`;
- Notification `mode=capture_only`;
- Notification `trigger=metric_appended`;
- Notification `metricId` points to the created Metric;
- Notification `tokenId` points to Token `5376`;
- Token count unchanged;
- HolderSnapshot count unchanged;
- no Telegram live send;
- no Token enrich / rescore;
- no checkpoint update;
- no detect / import / queue / scheduler / systemd / `pnpm smoke`.

Stop before Red execution if:

- target mint already has a recent Metric that would trigger min-gap skip;
- target mint gains a Notification row before execution;
- the command shape would add `--watch`, `--pumpOnly`, `--limit`, detect /
  import / enrich / rescore, Telegram, queue, scheduler, systemd, or
  `pnpm smoke`;
- raw provider body, secrets, `.env`, Telegram token / chat id, or rawJson would
  be displayed;
- Notification capture is expected without a successful Metric write.

## Metric Window Peak Report

`pnpm metrics:window-report -- --mint <MINT>` is the read-only report for
checking whether accumulated Metric history later showed FDV peaks after
candidate detection or notification. The Metric outcome evaluation policy is
fixed in `docs/design/metric-outcome-evaluation.md`. The implemented report
uses `alertedAt` as the anchor, resolved from `Notification.sentAt`,
`Notification.capturedAt`,
`Token.entrySnapshot.firstSeenSourceSnapshot.detectedAt`, `Token.importedAt`,
then `Token.createdAt`. The current CLI still accepts `--entryAt <ISO>` for an
operator override.

The report computes each window as `max(fdv)` over observed Metric rows inside
the window. The 24h peak is not a single 24h-later snapshot; it is the observed
maximum across the full 24h window, so a short-lived early pump can still be
counted by later review. If a window has Metric rows but no FDV candidate
field, `sampleCount` still counts the rows while `fdvSampleCount=0` and
`peakFdv=null`.

Default future outcome windows are:

```text
30,60,90,120,180,240,300,360,480,600,720,1440
```

Read-only window output includes `alertFdv`, `alertFdvObservedAt`,
`alertFdvFreshnessSeconds`, `latestFdv`,
`latestFdvAgeSeconds`, `windowStartAt`, `windowEndAt`, `isWindowComplete`,
`outcomeIsProvisional`, `peakObservedAt`, `fdvSampleCount`,
`fdvSampleCoverageLabel`, `timeToPeakMinutes`, `peakMultipleFromAlert`,
`drawdownFromPeak`, and `outcomeLabel`. For MVP evaluation,
`evaluationAt=reportGeneratedAt`, where `reportGeneratedAt` is the report
execution time. A window is complete only when
`evaluationAt >= windowEndAt`; otherwise its outcome label is provisional.
Labels are computed only for review: `no_data`, `flat`, `small_win`, `hit`,
and `big_hit`. They are not stored in DB yet and must not be treated as
trading guidance.

Allowed read-only use:

```bash
pnpm -s metrics:window-report -- --mint <MINT>
pnpm -s metrics:window-report -- --mint <MINT> --entryAt 2026-05-16T00:00:00.000Z --windows 30,60,1440
```

The report does not print provider payload values, write DB rows, fetch
external APIs, send Telegram, update checkpoints, execute `--write` /
`--watch`, or run `pnpm smoke`. It is notification / score verification
context, not automatic trading or buy-signal output.

Metric result fields are not live snapshot write targets in the MVP. The
source of truth for this boundary is
`docs/design/metric-result-field-policy.md`. `metric:snapshot:geckoterminal`
should keep appending observation snapshots; it should not fill
`Metric.peakFdv24h`, `Metric.peakFdv7d`, `Metric.maxMultiple15m`,
`Metric.maxMultiple1h`, `Metric.volume7d`, `Metric.timeToPeakMinutes`,
`Metric.alertedAt`, or `Metric.peakMultipleFromAlert` during live snapshot
capture. Outcome review comes later from `metrics:window-report` over
accumulated Metric history.

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
