# Gecko Token To Metric Minimum Loop Runbook

This runbook documents the smallest manual GeckoTerminal loop that has been proven useful for one pump mint:

1. select one GeckoTerminal `new_pools` pump mint
2. create one mint-only `Token`
3. complete the token with the gated token-only catch-up path
4. append one GeckoTerminal metric snapshot
5. confirm `ops:catchup:gecko` returns no pending work

It is intentionally not a scheduler, worker, queue, retry system, or generic source runtime.

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
- the latest Red live-send preflight for `token_completed` / `loop_complete`
  stopped at `no_candidate`: token-only dry-run reported `status=no_pending`,
  `plannedTokenWrites=0`, `pendingCount=0`, and `selectedCandidates=[]`;
  Metric append dry-run reported `status=no_pending`, `plannedMetricAppends=0`,
  `metricPendingCount=0`, `pendingCount=0`, and `selectedCandidates=[]`.
- a later same-mint manual one-shot loop for
  `4G5QLe6x3kpXC4ofTpUk887ig4y758QN66mkZeqdpump` confirmed the direct
  detector / enrich-rescore / metric snapshot path without ops notification:
  `detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write` created the
  mint-only Token, `token:enrich-rescore:geckoterminal -- --mint ... --write`
  moved it to `partial` with name/symbol/context/reviewFlags saved and score
  `C` / `0`, and `metric:snapshot:geckoterminal -- --mint ... --write`
  appended one `geckoterminal.token_snapshot` Metric with `metricId=1117`.
- the same mint then confirmed a second single-mint Metric append through the
  same `metric:snapshot:geckoterminal -- --mint ... --write` command:
  `metricsCount` moved from 1 to 2, latestMetric became `metricId=1118` with
  `observedAt=2026-04-29T10:50:02.424Z`, and the previous Metric remained at
  `observedAt=2026-04-29T10:35:31.337Z`. This check was about append/time-series
  behavior, not price evaluation.

Earlier ops-path Metric append failures are accounted for: the child-process
`cli_error` / `parse_error` path was traced to `tsx` startup and stdout capture
behavior and fixed in the production runner, while a later `fetch failed` result
was isolated to environment-level DNS / network reachability rather than the
target mint or runner output parsing.

This confirms the minimum Token to Metric loop, capture-only ops notification
records, and one `metric_appended` production Telegram ops live send. It does
not confirm scheduler, watch, systemd, `token_completed` live send,
`loop_complete` live send, multi-token write, multi-cycle write operation, or
read-only report/compare visibility for the resulting Metric time series.

## Purpose

Use this flow when a single GeckoTerminal-origin pump mint should move from mint-only intake to one current `Metric` observation with explicit operator checkpoints.

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
- `metricCandidate.rawJson.token.address` matches the mint
- `metricCandidate.rawJsonBytes` is present

Stop when:

- item status is `error`
- error is DNS or network related
- `wouldCreateMetric` is false
- selected count is not 1
- the snapshot token address does not match the mint

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
that command once. Use `--opsNotifyTrigger token_completed` or
`--opsNotifyTrigger loop_complete` to keep the selected production send to one
trigger.

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
- generic multi-source adapter runtime

## Next Candidate Steps

After this confirmed minimum loop, the next small operating steps are either:

- run one more explicit Token to Metric loop to confirm repeatability
- decide whether `token_completed` or `loop_complete` should get its own
  bounded live-send confirmation

## Notes

- Keep token completion and Metric append as separate operator-visible steps.
- Prefer single-mint commands for write confirmation.
- Do not expose raw stdout, raw stderr, env, cwd, full args, or full API responses in reports.
- Save large JSON to `/tmp` when local inspection is needed, then report only the fields required for the decision.
- If DNS fails in Codex but works in a normal WSL shell, treat the Codex sandbox network configuration as the blocker and do not rerun the metric snapshot CLI until the same shell can resolve the host.
