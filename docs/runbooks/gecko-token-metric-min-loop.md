# Gecko Token To Metric Minimum Loop Runbook

This runbook documents the smallest manual GeckoTerminal loop that has been proven useful for one pump mint:

1. select one GeckoTerminal `new_pools` pump mint
2. create one mint-only `Token`
3. complete the token with the gated token-only catch-up path
4. append one GeckoTerminal metric snapshot
5. confirm `ops:catchup:gecko` returns no pending work

It is intentionally not a scheduler, worker, queue, retry system, or generic source runtime.

## Purpose

Use this flow when a single GeckoTerminal-origin pump mint should move from mint-only intake to one current `Metric` observation with explicit operator checkpoints.

## Preconditions

- The repo is clean and on the expected branch.
- The operator has explicit permission for each write step.
- Network/DNS access works before live GeckoTerminal fetches.
- No write step is run as part of a broad batch unless the current prompt explicitly allows it.
- Telegram send is not part of this loop.

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

### Step 8: Metric Snapshot Write

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

Do not combine these write steps into one hidden automation path.

## Phase Update Criteria

Update the phase progress only when the relevant write and read-only confirmation both completed.

Use these markers:

- Detector write complete: one pump mint was accepted and a mint-only token exists.
- Token-only ops write complete: post-check confirms token found, not pending, name and symbol present.
- Metric append complete: exactly one Metric row was appended and `token:show` reports a latest metric.
- Loop complete: final `ops:catchup:gecko` dry-run reports `no_pending` and `no_action`.

Keep the phase unchanged when:

- work was read-only only
- DNS or HTTPS failed before snapshot
- dry-run did not produce `wouldCreateMetric=true`
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
- Telegram notification
- generic multi-source adapter runtime

## Notes

- Keep token completion and Metric append as separate operator-visible steps.
- Prefer single-mint commands for write confirmation.
- Do not expose raw stdout, raw stderr, env, cwd, full args, or full API responses in reports.
- Save large JSON to `/tmp` when local inspection is needed, then report only the fields required for the decision.
- If DNS fails in Codex but works in a normal WSL shell, treat the Codex sandbox network configuration as the blocker and do not rerun the metric snapshot CLI until the same shell can resolve the host.
