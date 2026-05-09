# Gecko Watch Readiness Runbook

## Conclusion

Do not start always-on Gecko monitoring from `systemd`. The safe progression is:

1. docs gate
2. dry-run-only
3. capture-only
4. isolated one-shot write
5. foreground or tmux
6. systemd

The existing watch runners and sample systemd units are useful entrypoints, but
they can run write-enabled flows. Treat them as Red until the lane-specific
preflight has passed and the exact command is explicitly approved.

## Current Readiness Summary

GeckoTerminal automation is currently proven as a bounded, operator-triggered
CLI workflow, not as always-on monitoring.

Use `docs/runbooks/gecko-bounded-operation-mvp.md` as the current daily
operation entrypoint. It defines the temporary bounded MVP, the recommended
detect -> enrich/rescore -> Metric -> rawJson-free report order, Red / Green
boundaries, exact-command examples, and stop conditions.

Confirmed:

- `detect:geckoterminal:new-pools` one-shot pump-only write.
- three bounded detect watch writes with `/tmp` checkpoint,
  `--pumpOnly`, `--limit 1`, `--maxIterations 1`, and `--write`.
- one foreground bounded detect watch wrapper run with env-pinned `/tmp`
  checkpoint, `--pumpOnly`, `--limit 1`, `--maxIterations 2`, two natural
  cycles, two mint-only Token writes, and no failed cycles.
- one tmux bounded detect watch wrapper run with env-pinned `/tmp` checkpoint,
  `--pumpOnly`, `--limit 1`, `--maxIterations 1`, one natural cycle, one
  mint-only Token write for
  `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, and no failed cycles.
- a second tmux bounded detect watch wrapper run with the same env-pinned
  `/tmp` checkpoint, `--pumpOnly`, `--limit 1`, `--maxIterations 1`, one
  natural cycle, one mint-only Token write for
  `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, `skippedNonPumpCount=2`, and
  no failed cycles.
- the first foreground-created mint,
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump`, has completed
  enrich/rescore, two single-mint Metric appends, and two-Metric rawJson-free
  report confirmation through `metrics:report`, `token:compare`, and
  `tokens:compare-report`.
- the second foreground-created mint,
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`, has completed
  enrich/rescore, two single-mint Metric appends, and two-Metric rawJson-free
  report confirmation through `metrics:report`, `token:compare`, and
  `tokens:compare-report`.
- the tmux-created mint,
  `F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, has completed
  enrich/rescore to `partial`, two single-mint Metric appends, and two-Metric
  rawJson-free report confirmation through `metrics:report` and
  `token:compare`.
- the second tmux-created mint,
  `AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, has completed
  enrich/rescore to `partial`, two single-mint Metric appends, and two-Metric
  rawJson-free report confirmation through `metrics:report` and
  `token:compare`.
- all three watch-detected mints completed downstream enrich/rescore, two
  single-mint Metric appends, and rawJson-free report confirmation through
  `metrics:report`, `token:compare`, and `tokens:compare-report`.
- the third watch-detected mint has reached enrich/rescore, two single-mint
  Metric appends, and rawJson-free two-Metric report confirmation.
- metric snapshot watch gates: single-mint bounded, batch bounded, foreground
  bounded, tmux bounded, and tmux no-candidate natural exit.

Still unconfirmed:

- detect tmux long-running or unbounded watch operation.
- default-checkpoint detect watch operation.
- detect long-running or unbounded watch.
- systemd start / enable and restart-oriented operation.
- scheduler / queue worker / background automatic ingestion runtime.
- automatic Red execution, executor wrapper, and Telegram live loop
  integration.

Ffn2 now confirms the bounded detect -> enrich/rescore -> first Metric ->
second Metric path as an end-to-end human-gated MVP example. This is not an
always-on readiness signal. It proves the operator-approved unit of work: one
mint, one stage, one human gate, one exact command, rawJson-free confirmation,
and docs record. Before watch can become always-on, the remaining gaps are
default checkpoint operation, restart / recovery implementation, retry /
failure implementation, duplicate-prevention enforcement across stages, log
retention / rotation, secret-free logging implementation, Telegram runtime
dedupe / failed-send / cooldown implementation, and the boundary between a
single CLI runner and any scheduler / queue.

Executor-wrapper readiness is also still a pre-watch gap. A non-executor
wrapper / dry-run planner may prepare stage order, guards, side-effect bounds,
stop conditions, approval text, and command strings, but must not execute CLIs,
run Red commands, write DB / Token / Metric rows, send Telegram, start tmux, or
update checkpoints. Bounded executor work, systemd, scheduler / queue,
unbounded watch, default-checkpoint operation, and Telegram live-loop
integration remain deferred until restart / resume, retry, duplicate
prevention, log retention, secret-free logging, Telegram runtime cooldown /
failed-send handling, and multi-candidate policy are implemented or fixed for
the target runtime.

`ops:gecko:bounded-flow:plan` is now implemented as a non-executor wrapper /
dry-run planner before executor work, not as watch readiness. It renders input
/ output shapes, checklist-style stop condition codes, forbidden actions,
intent-specific side-effect bounds, and approval-request fields for operator
review. It keeps `mode=non_executor_wrapper`, `willExecute=false`,
`executor=human`, `operatorMode=human_gated`, `currentStage=null`,
`nextStage=null`, and, for `status=ok`, `redExecution.exactCommand=null`. For
`status=stop`, it returns `commands=null`, so `redExecution` / `exactCommand`
are not output; this is the safer stop behavior because no concrete command is
printed. It does not execute existing CLIs, guide, planner, validator,
`nextRedCommand`, or any Red command; all writes, tmux starts, checkpoint
updates, Telegram sends, systemd, scheduler / queue, default-checkpoint
operation, and unbounded watch remain outside the wrapper.

Checkpoint / restart / duplicate-prevention policy is now a watch gate.
The confirmed `/tmp` checkpoint runs are bounded Red rehearsals, not default
checkpoint readiness. DB state is the first confirmation target, while a
checkpoint cursor is only a detect cursor and not proof that Token or Metric
writes succeeded. Restart / resume after partial success, checkpoint/DB
ordering failures, Metric strict duplicate enforcement, runtime retry
automation, runtime retry max count implementation, cooldown automation, log
retention, secret-free journal output, Telegram runtime cooldown / duplicate /
failed-send handling, and multi-candidate ordering remain unresolved. Keep
default checkpoint operation, systemd, scheduler / queue, unbounded watch,
automatic Red execution, and bounded executor prototype on hold until those
policies are fixed.

The read-only consistency check for `c6ee95e` passed, but this is still only a
watch-readiness gate record. It does not make the default checkpoint ready, does
not resolve restart / resume, retry, duplicate prevention, log retention,
Telegram live-loop policy, or multi-candidate handling, and does not make
systemd, scheduler / queue, unbounded watch, always-on operation, automatic Red
execution, or bounded executor prototype ready.

Authoritative state / checkpoint-DB ordering / restart-resume policy is now
fixed for bounded human-gated operation: restart confirmation starts from DB
read CLIs, checkpoint is cursor context only, docs record is an operator log,
and latest Metric is Metric-stage evidence. If checkpoint / DB state, CLI
counts, latest Metric, or `metricsCount` disagree after restart, stop and
return to human gate; do not automatically resume or rerun Red. This does not
promote the default checkpoint and does not make watch readiness complete.
Duplicate prevention policy is now fixed at the docs level: Token dedupe uses
mint / `Token.mint`, Metric snapshots remain time-series observations, and a
strict Metric duplicate candidate is same `tokenId` / source / `observedAt`.
Enforcement is still not implemented by DB constraint or pre-insert check, and
retry, log retention, Telegram runtime integration, queue idempotency, and
multi-candidate handling remain unresolved before systemd, scheduler / queue,
or unbounded watch.

Retry / failure handling policy is now fixed at the operator-policy level:
retry decisions start with DB read confirmation, ambiguous write results do not
allow automatic retry, and `errorCount > 0`, `selectedCount > 1`,
`writtenCount > 1`, or `importedCount > 1` returns the bounded flow to human
gate. This is not watch readiness: retry automation, retry max counts,
runtime retry max count implementation, cooldown automation, queue
idempotency, systemd recovery, Telegram failed-send retry, and bounded
executor behavior remain unimplemented or unfixed.

Cooldown / retry max count policy is now fixed at the operator-policy level:
Red retry max is automatic `0`, Red reruns are human-approved only, and
cooldown is a re-check / human-gate timing hint rather than automatic retry.
Existing watch / wrapper cooldown sleeps are implementation-local and must not
be read as systemd, scheduler / queue, unbounded watch, default checkpoint, or
retry automation readiness.

Default checkpoint promotion gate is now fixed at the docs level, but default
checkpoint operation has not started. The repo-local Gecko detect checkpoint
path is `data/checkpoints/geckoterminal-new-pools.json`; it remains unpromoted
and must not be treated as persistent watch readiness until a separate bounded
Red approval creates or updates it under the promotion gate. Existing `/tmp`
checkpoint evidence remains bounded rehearsal state only. Promotion does not
make checkpoint state write success proof and does not make systemd,
scheduler / queue, unbounded watch, always-on operation, automatic Red
execution, or bounded executor work ready.

Log / secret-free policy is now fixed at the docs level, but watch readiness
is still incomplete. Operator records, pasted reports, tmux summaries,
Telegram summaries, checkpoint summaries, and future journal excerpts must use
safe summaries only. Do not paste raw stdout / stderr, raw logs, raw API
responses, exact `"rawJson":` payloads, `.env`, `DATABASE_URL`, Telegram
credentials, raw env, full secret-bearing command args, or any line / blob with
a secret marker. `/tmp` logs remain auxiliary evidence and should be summarized
rather than pasted raw. Future systemd journal output needs redaction,
retention / rotation, and field policy implementation before start; this policy
does not make systemd, unbounded watch, default checkpoint operation, or
Telegram live-loop integration ready.

Telegram live loop policy is now fixed at the docs level, but watch readiness
is still incomplete. The only initial live-send candidate is `metric_appended`
after DB read confirmation, capture-only rehearsal, safe marker checks, and
human gate. `token_completed` and `loop_complete` remain capture-only. Durable
dedupe storage, failed-send retry, runtime cooldown automation, queue
idempotency, systemd recovery, and live-loop integration are still
unimplemented, so this does not make systemd, unbounded watch, or Telegram live
loop ready.

Multi-candidate / queue pre-gate policy is now fixed at the docs level, but
watch readiness is still incomplete. The safe unit remains one mint, one stage,
one human gate, one exact Red command, rawJson-free / secret-free confirmation,
and docs record. Durable notification dedupe policy uses `mint + eventType +
metricId` for the initial `metric_appended` key, but durable storage,
queue idempotency, per-item failure handling, ordering, queue persistence,
systemd recovery, default checkpoint operation, and unbounded watch remain
unimplemented. This is separate from default checkpoint promotion and does not
make scheduler / queue / systemd ready.

Capture-only rehearsal consistency policy is now fixed at the docs level, but
watch readiness is still incomplete. Capture-only remains a rehearsal before
live send, not a live send itself, and capture-only pass alone does not
complete durable dedupe. `metric_appended` remains the only initial live-send
candidate, and pass requires the expected trigger / event type / mint,
`metricId`, computable duplicate key, safe message preview, marker check pass,
and DB read confirmation alignment. `token_completed` and `loop_complete`
remain capture-only. Durable dedupe storage, Telegram live-loop integration,
queue idempotency, scheduler, systemd, default checkpoint operation, and
unbounded watch remain unimplemented.

Durable notification dedupe storage policy is now fixed at the docs level, but
watch readiness and systemd readiness are still incomplete. The initial
durable notification identity is the `metric_appended` key `mint + eventType +
metricId`; `token_completed` and `loop_complete` remain capture-only. Future
storage must distinguish capture-only from live send and `captured`, `sent`,
`failed`, `skipped`, and `blocked` states, with only a human-gated live send
with `sentAt` treated as sent. Notification DB table creation, the minimal
Notification repository, and the `metric_appended` capture-only Notification
record write integration are complete. `token_completed` / `loop_complete`
Notification writes, queue idempotency, failed-send retry, Telegram live-loop
integration, systemd recovery, default checkpoint operation, and unbounded
watch remain unimplemented.

Failed-send / resend policy is now fixed at the docs level, but watch
readiness and systemd readiness are still incomplete. `failed` is not `sent`,
and a previous `sent` on the same notification key blocks resend. Any resend
requires DB read confirmation, capture-only rehearsal, safe failed-send summary
review, secret-free / rawJson-free marker checks, a human gate, and a separate
Red approval. Failed-send retry automation, sent / failed runtime marking,
broader Notification writes beyond `metric_appended` capture-only, queue
idempotency, Telegram live-loop integration, systemd recovery, default
checkpoint operation, and unbounded watch remain unimplemented.

Notification model boundary / lifecycle policy is now fixed at the docs level,
but watch readiness and systemd readiness are still incomplete. `Notification`
is the first model-name candidate; future storage is responsible for
`notificationKey` durable dedupe, capture-only / live-send lifecycle state, and
failed-send / resend evidence, while staying separate from queue idempotency.
The initial key remains `mint + eventType + metricId` for `metric_appended`;
`token_completed` and `loop_complete` remain capture-only. DB table creation /
apply is now complete for `prisma/dev.db`, and the minimal Notification
repository is implemented. The `metric_appended` capture-only Notification
record write integration is now implemented for `ops:catchup:gecko`, and the
`metric:snapshot:geckoterminal -- --mint <MINT> --write` single-mint path now
records one `metric_appended` Notification capture row after Metric create,
with Metric create maximum 1, Notification create maximum 1, Token write 0,
Telegram send 0, checkpoint write 0, and temp-SQLite test coverage without
writing production `prisma/dev.db`. Batch / limit `metric:snapshot`
Notification writes, `token_completed` / `loop_complete` Notification writes,
Telegram live-loop integration, queue idempotency, systemd recovery, default
checkpoint operation, and unbounded watch remain unimplemented.

Notification schema / migration baseline policy is now fixed at the docs level,
but watch readiness and systemd readiness are still incomplete. The first
Yellow schema cut added `Notification`, schema-level inspection test coverage,
and `/tmp/add_notification.sql` SQL preview without changing existing `Dev` /
`Token` / `Metric` models. Formal migration files now exist under
`prisma/migrations`, and the Red DB apply created the `Notification` table in
`prisma/dev.db` without reset or destructive migration. The minimal
Notification repository is now implemented and covered by a temp-SQLite test.
Commit `905d3ac` connects it to `ops:catchup:gecko` capture-only output for
`metric_appended` only, using key `${mint}:metric_appended:${metricId}`,
`status=captured`, `mode=capture_only`, safe `messagePreview`, one
Notification create maximum per run, duplicate-key count stability, and skip
behavior for missing `mint` / `metricId` or multiple captured
`metric_appended` records. Commit `442cf8e` adds the
`metric:snapshot:geckoterminal` single-mint Notification capture hook for
`--mint <MINT> --write`, using key `${mint}:metric_appended:${metricId}`,
`trigger=metric_appended`, `status=captured`, `mode=capture_only`,
`source=metric:snapshot:geckoterminal`, safe `messagePreview`, and one
Notification create maximum after Metric create; the focused test uses temp
SQLite and does not write production `prisma/dev.db`, and batch / limit mode is
still not a Notification write target. `token_completed` / `loop_complete`
Notification writes, queue idempotency, Telegram live-loop integration, sent /
failed runtime marking, systemd recovery, default checkpoint operation, and
unbounded watch remain unimplemented.

Notification migration split policy is now fixed at the docs level, but it is
not watch readiness or systemd readiness. Read-only SQL preview confirmed the
baseline SQL contains only existing `Dev` / `Token` / `Metric` table, index,
and FK creation, while the add-notification-only SQL contains only the
`Notification` table and `Notification_notificationKey_key` unique index.
Formal migration files are now created and applied to `prisma/dev.db` through
the explicit Red DB task. Backup exists at
`/tmp/lowcap-dev.db.before-notification-20260509T111516Z.bak`; `_prisma_migrations`
has records for `20260509000100_baseline_existing_schema` and
`20260509000200_add_notification`; `Notification` count is 0; existing counts
stayed unchanged (`Dev=0`, `Token=1107`, `Metric=191`). Do not treat this as
queue, systemd, default checkpoint, Telegram live-loop, or runtime durable
storage readiness.

Next phase choices:

- treat the human-triggered bounded operation MVP as complete for the
  single-candidate operator-approved scope, and keep its runbook as the current
  operator entrypoint before adding more Red gates.
- keep detect bounded to `/tmp` checkpoint, `--pumpOnly`, `--limit 1`, and an
  explicit `--maxIterations`; do not use the default checkpoint yet.
- keep enrich/rescore and Metric writes single-mint and exact-command approved.
- confirm each candidate with `metrics:report`, `token:compare`, and
  `tokens:compare-report`.
- next, either run one more bounded detect candidate, or decide whether metric
  snapshot tmux bounded should be the formal interim operating entrypoint.
- keep systemd on hold until a user-systemd-capable session is available.
- keep `token_completed` and `loop_complete` production live-send checks on
  hold until eligible candidates naturally exist.
- keep long-running / unbounded watch prohibited.

Operational boundary:

- Green includes docs updates, read-only CLI, dry-runs without `--write` /
  `--watch`, rawJson-free reports, typecheck, and targeted tests.
- Red includes any detect write, detect watch write, enrich/rescore write,
  Metric snapshot write, tmux start, systemd operation, or Telegram live send.
- Stop if counts exceed the approved bound, the default checkpoint could be
  touched, rawJson / secret display risk appears, the command differs from the
  exact approval, or the next step requires unbounded watch.

## Lanes

### `detect:geckoterminal:new-pools`

- Existing watch support: yes.
- Existing checkpoint support: yes.
- Existing bounded test shape: `--maxIterations`.
- Default checkpoint path: repo-local `data/checkpoints/geckoterminal-new-pools.json`.
- First always-on candidate: yes, but do not start always-on yet.
- Write behavior: `--write` hands accepted mints into the mint-first boundary.
- Confirmed Red one-shot gate: `pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --write`.
- Confirmed one-shot side effects: at most one mint ingest write, no checkpoint update, and no Telegram send.
- Confirmed initial pump-only watch write gate:
  `pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit 1 --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`.
  It ran one cycle with `inputCount=20`, `selectedCount=1`, `acceptedCount=1`,
  `importedCount=1`, `failedCount=0`, and created mint-only Token
  `4tCTPRoA5fitVzEP8g17ZeSGpr4i9t8mjtqf6Pkdpump`. It updated only the `/tmp`
  checkpoint to `2026-04-29T14:36:09.000Z |
  ANPbYLCgNLGtfC5Qt4iSUERnwUREa8Qpsm7iGkY3uVvx`; the default checkpoint stayed
  unused. Telegram, Metric append, enrich, and rescore were not invoked.
- Confirmed second pump-only watch write gate with the same bounded command and
  `/tmp` checkpoint: it ran one cycle with `inputCount=20`, `selectedCount=1`,
  `acceptedCount=1`, `importedCount=1`, `existingCount=0`, and `failedCount=0`,
  and created mint-only Token
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump`. The checkpoint advanced from
  `2026-04-29T14:36:09.000Z |
  ANPbYLCgNLGtfC5Qt4iSUERnwUREa8Qpsm7iGkY3uVvx` to
  `2026-04-29T15:23:33.000Z |
  3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8`. The default checkpoint stayed
  uncreated / unused, and Telegram, Metric append, enrich, rescore, and ops
  catchup were not invoked.
- Confirmed third pump-only watch write gate with the same bounded command and
  `/tmp` checkpoint: it ran one cycle with `inputCount=20`, `selectedCount=1`,
  `acceptedCount=1`, `importedCount=1`, `existingCount=0`, and `failedCount=0`,
  and created mint-only Token
  `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump`. The checkpoint advanced from
  `2026-04-29T15:23:33.000Z |
  3HpavdNkUh1WqK3XSrdUP1EAaHWkGkABkzc84fxNACp8` to
  `2026-04-29T16:11:48.000Z |
  H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK`. The default checkpoint stayed
  uncreated / unused, and Telegram, Metric append, enrich, rescore, and ops
  catchup were not invoked. This was a bounded operation MVP rehearsal.
- Confirmed candidate-waiting bounded detect write gate with a fresh `/tmp`
  checkpoint:
  `pnpm -s detect:geckoterminal:new-pools -- --pumpOnly --limit 1 --watch --maxIterations 1 --checkpointFile /tmp/lowcap-gecko-detect-bounded.json --write`.
  It ran one bounded cycle with `selectedCount=1`, `acceptedCount=1`,
  `importedCount=1`, `existingCount=0`, `failedCount=0`, and
  `skippedNonPumpCount=5`, and created mint-only Token
  `Ffn2FhA6XzcdHG7ACEGNwFsQ1bPqg9RpqZAwtnH7pump` from Pump.fun. It updated
  only `/tmp/lowcap-gecko-detect-bounded.json` to
  `2026-05-08T22:04:05.000Z |
  DWHNrAbt6bL3HuygDiBGBQY51ADxtyMreERS9JuBH3tT`; the default checkpoint stayed
  uncreated / unused. Metric append, enrich/rescore, Telegram, tmux, systemd,
  scheduler / queue, unbounded watch, and additional Red commands were not
  invoked.
- Confirmed downstream single-mint enrich/rescore for that bounded-detect mint
  as a separate Red task: `Ffn2...pump` moved from `mint_only` to `partial` as
  `Papu` / `PAPU` with score `C` / `0`, `hardRejected=false`,
  `enrichWritten=1`, `rescoreWritten=1`, `contextWritten=1`, and
  `notifySent=0`. It did not append a Metric (`metricsCount=0`,
  `latestMetric=null`) and did not send Telegram, run detect/watch, start tmux,
  touch systemd, or update checkpoints during the enrich/rescore step.
- Confirmed first single-mint Metric append for that same bounded-detect mint
  as a later separate Red task: `Ffn2...pump` appended Metric `id=1244` with
  source `geckoterminal.token_snapshot` at
  `observedAt=2026-05-08T23:11:09.976Z`, moving `metricsCount` from 0 to 1
  while preserving Token fields (`Papu` / `PAPU`, score `C` / `0`,
  `hardRejected=false`). The Metric step did not send Telegram, run
  detect/watch, run enrich/rescore, start tmux, touch systemd, or update any
  checkpoint. This confirms the bounded-detect origin can reach first Metric
  append without making unbounded watch, systemd, scheduler / queue, or default
  checkpoint operation ready.
- Confirmed second Metric append for that same bounded-detect mint as a later
  separate Red task through the strict `lowcap-gecko-metric-single` tmux
  single-run: `Ffn2...pump` appended Metric `id=1245` with source
  `geckoterminal.token_snapshot` at
  `observedAt=2026-05-08T23:53:30.002Z`, moving `metricsCount` from 1 to 2
  with `recentMetrics=1245 -> 1244` while preserving Token fields
  (`Papu` / `PAPU`, score `C` / `0`, `hardRejected=false`). The Metric step
  did not send Telegram, run detect/watch, run enrich/rescore, run ops, touch
  systemd, or update any checkpoint. This confirms first plus second Metric
  observation for the bounded-detect origin without making unbounded watch,
  systemd, scheduler / queue, or default checkpoint operation ready.
- Confirmed foreground bounded detect watch wrapper gate:
  `LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS=60 bash scripts/run-geckoterminal-detect-watch.sh --pumpOnly --limit 1 --maxIterations 2`.
  The wrapper kept the checkpoint on `/tmp`, naturally exited after
  `cycleCount=2`, and reported `watchEnabled=true`, `writeEnabled=true`,
  `checkpointEnabled=true`, `checkpointUpdated=true`, `failedCount=0`,
  `inputCount=40`, `selectedCount=2`, `skippedNonPumpCount=10`,
  `acceptedCount=2`, `rejectedCount=0`, `importedCount=2`, and
  `existingCount=0`. It created mint-only Tokens
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` and
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump`. The checkpoint advanced
  from `2026-04-29T16:11:48.000Z |
  H7zeAcM31GRu6EyhNt52qCrv9EYULaef2f5kKP1oU5AK` to
  `2026-04-29T17:55:30.000Z |
  BWruAw7CYweENaRJ7WFrqSX6VEWd6qwteL3faiB5UgRi`. The default checkpoint stayed
  uncreated / unused, and Telegram, Metric append, enrich, rescore, ops
  catchup, tmux, systemd, and journal operations were not invoked.
- Confirmed first foreground-created downstream observation:
  `5vLb2TaW3sx7bc8pPjmiZX3sYwBxb2kg9mW67ggspump` moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` from
  `mint_only` to `metadataStatus=partial` with
  `name/symbol=Something Dumb/DUMB`, score `C` / `0`, `hardRejected=false`,
  and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and
  setting latestMetric to `id=1128` at
  `observedAt=2026-04-30T13:50:42.230Z`; volume24h / price / fdv / reserve /
  topPool were present. The Metric write preserved Token fields, did not send
  Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd.
  `metrics:report -- --mint ... --limit 1` shows Metric `id=1128`,
  `observedAt=2026-04-30T13:50:42.230Z`, `volume24h=0`, and all four
  rawJson-free market-data presence columns true; `token:compare -- --mint ...`
  shows latestMetric `id=1128`, one `recentMetrics` item, and all four
  `safeSummary` booleans true; `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 1 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=1`, latestMetric source /
  observedAt, and latestMetric safe summary columns. The report / compare
  output did not expose Metric rawJson and did not write to DB. A second
  `metric:snapshot:geckoterminal -- --mint ... --write` then appended Metric
  `id=1129`, moved `metricsCount` from 1 to 2, and updated latestMetric to
  `observedAt=2026-04-30T14:23:38.900Z`; previousMetric remains `id=1128` at
  `observedAt=2026-04-30T13:50:42.230Z`, confirming distinct time-series
  observations. The second append preserved Token fields, did not send
  Telegram, and did not invoke detect / enrich / ops / watch / tmux / systemd.
  `volume24h=0` persisted, while price / fdv / reserve / topPool were present.
  `metrics:report -- --mint ... --limit 2` now shows Metric ids `1129 -> 1128`,
  both `observedAt` values, `volume24h=0` on both rows, and all four
  market-data presence columns true on both rows. `token:compare -- --mint ...`
  shows latestMetric `id=1129` and `recentMetrics` containing `1129` plus
  `1128`, each with true `safeSummary` booleans. `tokens:compare-report -- --source
  geckoterminal.new_pools --metadataStatus partial --hasMetrics true
  --minMetricsCount 2 --latestMetricSource geckoterminal.token_snapshot
  --limit 10` includes the mint with `metricsCount=2`, latestMetric source /
  observedAt, and latestMetric safe summary columns. The report / compare output
  did not expose Metric rawJson and did not write to DB. This confirms the
  foreground-created path through detect foreground -> enrich/rescore -> Metric
  1 -> Metric 2 -> report confirmation.
- Confirmed second foreground-created downstream first observation:
  `6MD8LtMX1Jf7W9hDs8rnthkeFS2sonzSaYiQHkZgpump` moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` from
  `mint_only` to `metadataStatus=partial` with
  `name/symbol=Ghostpool/GHOST`, score `C` / `0`, `hardRejected=false`, and
  reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and
  setting latestMetric to `id=1130` at
  `observedAt=2026-04-30T16:51:54.070Z`; `volume24h=null`, while price / fdv /
  reserve / topPool presence were true. The Metric write preserved Token fields,
  did not send Telegram, and did not invoke detect / enrich / ops / watch /
  tmux / systemd. The same mint has now also passed rawJson-free report
  confirmation: `metrics:report -- --mint ... --limit 1` showed Metric
  `id=1130`, `observedAt=2026-04-30T16:51:54.070Z`, `volume24h=null`, and all
  four market-data presence columns true; `token:compare -- --mint ...` showed
  latestMetric `id=1130`, one `recentMetrics` item, and all four `safeSummary`
  booleans true; and `tokens:compare-report` with Gecko-origin partial /
  hasMetrics / `minMetricsCount=1` filters included the mint with
  `metricsCount=1`, latestMetric observedAt, and latestMetric safe summary
  columns. The report / compare output did not expose Metric rawJson and did not
  write to DB. A second single-mint Metric snapshot write then appended Metric
  `id=1131`, moved `metricsCount` from 1 to 2, and updated latestMetric to
  `observedAt=2026-04-30T23:55:54.844Z`; previousMetric remains `id=1130` at
  `observedAt=2026-04-30T16:51:54.070Z`, confirming distinct time-series
  observations. The second append preserved Token fields, did not send
  Telegram, kept `volume24h=null`, and retained price / fdv / reserve / topPool
  presence. It did not invoke detect / enrich / ops / watch / tmux / systemd.
  Two-Metric rawJson-free report confirmation has now also passed:
  `metrics:report -- --mint ... --limit 2` showed Metric ids `1131 -> 1130`,
  both `observedAt` values, `volume24h=null` on both rows, and all four
  market-data presence columns true on both rows. `token:compare -- --mint ...`
  showed latestMetric `id=1131` and `recentMetrics` containing `1131` plus
  `1130`, each with true `safeSummary`. `tokens:compare-report` with
  Gecko-origin partial / hasMetrics / `minMetricsCount=2` filters included the
  mint with `metricsCount=2`, latestMetric observedAt, and latestMetric safe
  summary columns. The report / compare output did not expose Metric rawJson and
  did not write to DB.
  The first foreground-created mint remains unchanged with `metricsCount=2` and
  latestMetric `id=1129`.
- Confirmed third watch-detected downstream first observation: the
  `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump` Token then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` to
  `metadataStatus=partial` with `name/symbol=The People's House/PH`, score
  `C` / `0`, `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and
  setting latestMetric to `id=1126` with
  `observedAt=2026-04-29T16:27:01.275Z`; volume24h / price / fdv / reserve /
  topPool were present. The Metric step did not update token fields and did not
  send Telegram.
- Confirmed third watch-detected read-only report visibility:
  `metrics:report -- --mint ... --limit 1` showed Metric `id=1126`,
  `observedAt=2026-04-29T16:27:01.275Z`, `volume24h`, and all four
  rawJson-free Metric presence fields as true; `token:compare -- --mint ...`
  showed latestMetric `id=1126`, one `recentMetrics` item, and all four
  `safeSummary` booleans as true; and `tokens:compare-report` with
  Gecko-origin partial / hasMetrics / `minMetricsCount=1` filters included the
  mint with `metricsCount=1`, latestMetric source / observedAt, and latestMetric
  safe summary columns. These report checks did not expose Metric rawJson and
  did not write to DB.
- Confirmed third watch-detected time-series append: a second
  `metric:snapshot:geckoterminal -- --mint ... --write` on the same
  `CQgM65qrpe3whqU2SJhcU7MfVhodL92zRADqanbvpump` mint appended Metric
  `id=1127`, moved `metricsCount` from 1 to 2, and updated latestMetric to
  `observedAt=2026-04-29T16:42:56.330Z`. The previous Metric remains
  `id=1126` at `observedAt=2026-04-29T16:27:01.275Z`, so the third
  watch-detected mint now has two distinct Metric observations. This was a
  single-mint one-shot append, not watch mode, and it did not update token
  fields or send Telegram.
- Confirmed third watch-detected two-Metric report visibility:
  `metrics:report -- --mint ... --limit 2` showed Metric ids `1127 -> 1126`
  with both `observedAt` values and rawJson-free market-data presence fields;
  `token:compare -- --mint ...` showed latestMetric `id=1127` and
  `recentMetrics` containing `1127` plus `1126`, each with true `safeSummary`;
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=2` filters included the mint with `metricsCount=2`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed second watch-detected downstream first observation: the
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` Token then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` to
  `metadataStatus=partial` with `name/symbol=wtf/WTF`, score `C` / `0`,
  `hardRejected=false`, and reviewFlags present. A following
  `metric:snapshot:geckoterminal -- --mint ... --write` appended the first
  `geckoterminal.token_snapshot` Metric, moving `metricsCount` from 0 to 1 and
  setting latestMetric to `id=1124` with
  `observedAt=2026-04-29T15:41:56.989Z`; volume24h / price / fdv / reserve /
  topPool were present. The Metric step did not update token fields and did not
  send Telegram.
- Confirmed second watch-detected read-only report visibility:
  `metrics:report -- --mint ... --limit 1` showed Metric `id=1124`, its
  `observedAt`, `volume24h`, and all four rawJson-free Metric presence fields
  as true; `token:compare -- --mint ...` showed latestMetric `id=1124`, one
  `recentMetrics` item, and all four `safeSummary` booleans as true; and
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=1` filters included the mint with `metricsCount=1`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed second watch-detected time-series append: a second
  `metric:snapshot:geckoterminal -- --mint ... --write` on the same
  `3zSwTacnYy4GiWtqXHoh4W9H5yqMaQ3tRYUcP7Xwpump` mint appended Metric
  `id=1125`, moved `metricsCount` from 1 to 2, and updated latestMetric to
  `observedAt=2026-04-29T15:55:14.973Z`. The previous Metric remains
  `id=1124` at `observedAt=2026-04-29T15:41:56.989Z`, so the second
  watch-detected mint now also has two distinct Metric observations. This was a
  single-mint one-shot append, not watch mode, and it did not update token
  fields or send Telegram. Two-Metric rawJson-free report confirmation for this
  mint remains the next gate.
- Confirmed second watch-detected two-Metric report visibility:
  `metrics:report -- --mint ... --limit 2` showed Metric ids `1125 -> 1124`
  with both `observedAt` values and rawJson-free market-data presence fields;
  `token:compare -- --mint ...` showed latestMetric `id=1125` and
  `recentMetrics` containing `1125` plus `1124`, each with true `safeSummary`;
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=2` filters included the mint with `metricsCount=2`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed watch-detected downstream observation loop: the same watch-origin
  mint then moved through
  `token:enrich-rescore:geckoterminal -- --mint ... --write` to
  `metadataStatus=partial` with `name/symbol=Jennie/Jennie`, score `C` / `0`,
  and `hardRejected=false`, then through
  `metric:snapshot:geckoterminal -- --mint ... --write` to append the first
  `geckoterminal.token_snapshot` Metric. That moved `metricsCount` from 0 to 1
  and set latestMetric to `id=1122` with
  `observedAt=2026-04-29T14:54:49.239Z`; volume24h / price / fdv / reserve /
  topPool were present. The Metric step did not update token fields and did not
  send Telegram.
- Confirmed watch-detected read-only report visibility: `metrics:report -- --mint ... --limit 1`
  showed Metric `id=1122`, its `observedAt`, `volume24h`, and all four
  rawJson-free Metric presence fields as true; `token:compare -- --mint ...`
  showed latestMetric `id=1122`, one `recentMetrics` item, and all four
  `safeSummary` booleans as true; `tokens:compare-report` with Gecko-origin
  partial / hasMetrics filters included the same mint with `metricsCount=1`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These report checks did not expose Metric rawJson and did not write to DB.
- Confirmed watch-detected time-series append: a second
  `metric:snapshot:geckoterminal -- --mint ... --write` on the same watch-origin
  mint appended Metric `id=1123`, moved `metricsCount` from 1 to 2, and updated
  latestMetric to `observedAt=2026-04-29T15:09:40.608Z`. The previous Metric
  remains `id=1122` at `observedAt=2026-04-29T14:54:49.239Z`, so the
  watch-detected path now has two distinct Metric observations. This was a
  single-mint one-shot append, not watch mode, and it did not update token
  fields or send Telegram.
- Confirmed watch-detected two-Metric report visibility:
  `metrics:report -- --mint ... --limit 2` showed Metric ids `1123 -> 1122`
  with both `observedAt` values and rawJson-free market-data presence fields;
  `token:compare -- --mint ...` showed latestMetric `id=1123` and
  `recentMetrics` containing `1123` plus `1122`, each with `safeSummary`;
  `tokens:compare-report` with Gecko-origin partial / hasMetrics /
  `minMetricsCount=2` filters included the mint with `metricsCount=2`,
  latestMetric source / observedAt, and latestMetric safe summary columns.
  These checks did not expose Metric rawJson and did not write to DB.
- Confirmed separate single-mint observation loop: a one-shot-origin pump.fun
  mint moved through detect one-shot write,
  `token:enrich-rescore:geckoterminal -- --mint ... --write`,
  and `metric:snapshot:geckoterminal -- --mint ... --write` to reach
  `partial` plus two `geckoterminal.token_snapshot` Metrics with distinct
  `observedAt` values.
- Confirmed bounded single-mint metric watch write: `metric:snapshot:geckoterminal -- --mint ... --write --watch --maxIterations 1 --minGapMinutes 10`
  ran one cycle, selected one token, appended one Metric, moved `metricsCount`
  from 2 to 3, and finished without token field updates or Telegram send.
- Confirmed bounded batch metric watch write: `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 1 --minGapMinutes 10`
  ran in `recent_batch` mode for one cycle, selected one eligible pump token,
  appended one Metric, moved the target mint's `metricsCount` from 3 to 4, and
  finished without token field updates or Telegram send.
- Confirmed foreground bounded watch gate: `metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60`
  naturally exited after two cycles. Both cycles selected the same eligible pump
  token and skipped before fetch as `skipped_recent_metric`, so `writtenCount`
  stayed 0, `metricsCount` stayed 4, and latestMetric stayed `id=1120`.
- Confirmed tmux bounded watch gate: `tmux new-session -d -s lowcap-gecko-metric-bounded "bash -lc 'cd /home/mochi/projects/lowcap-bot && pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60 > /tmp/lowcap-gecko-metric-bounded.log 2>&1'"`
  started the same bounded command in tmux, naturally exited after
  `maxIterations=2`, appended Metric `id=1121` in cycle 1, skipped cycle 2 as
  `skipped_recent_metric`, and moved the target mint's `metricsCount` from 4 to
  5 without token field updates, Telegram send, or systemd operations.
- Confirmed tmux bounded no-candidate rerun: the same command started with no
  existing session, naturally exited after `maxIterations=2`, selected 0 tokens,
  wrote 0 Metrics, had `failedCount=0` and `rateLimited=false`, and left
  `metricsCount=5` plus latestMetric `id=1121` unchanged. This confirms both an
  append case and a candidate-0 / no-write case can terminate safely.
- Confirmed read-only visibility: `metrics:report -- --mint ... --limit 2` and
  `token:compare -- --mint ...` can show the two-row Metric history before any
  watch or systemd work.
- Confirmed cohort report visibility: `metrics:report -- --limit 10` can show
  multiple token / multiple Metric rows with rawJson-free safe summary columns,
  and `tokens:compare-report` can show filtered Gecko-origin latestMetric /
  `metricsCount` cohort summaries.
- Confirmed post-tmux read-only visibility: after the tmux bounded gate,
  `metrics:report -- --mint ... --limit 5` showed Metric ids
  `1121 -> 1120 -> 1119 -> 1118 -> 1117`, `token:show` showed
  `metricsCount=5` plus latestMetric `id=1121`, and `tokens:compare-report`
  showed the same mint in the Gecko-origin cohort with latestMetric safe summary
  booleans.
- Confirmed rawJson-free token compare output: `token:compare` now omits Metric
  rawJson from latestMetric / `recentMetrics` and includes `safeSummary`
  booleans for price / fdv / reserve / topPool presence.
- At this point, `metrics:report`, `tokens:compare-report`, and `token:compare`
  are all suitable for rawJson-free read-only Metric confirmation before any
  longer watch or systemd step.
- Pump-only watch write gate is implemented and the first isolated Red run has
  passed. Continue to treat it as Red for any further live execution.
- `--write --pumpOnly` still requires `--limit 1` in both one-shot and watch
  modes.
- Checkpoint safety for the bounded pump-only watch path is covered by targeted
  test: with two eligible pump candidates and `--limit 1`, `checkpointAfter`
  advances only to the selected / processed candidate cursor and does not skip
  the limit-out candidate.

Start with file-backed or live one-shot dry-run inspection, then use the
confirmed one-shot write gate above when the goal is to validate the pump.fun
lowcap ingest path. The single-mint loop confirms the real-data one-shot path
before automation, and the read-only reports now confirm both single-mint
history and cohort-level visibility. The detect watch proof is still limited to
bounded pump-only live cycles with an isolated `/tmp` checkpoint, but it has now
passed three one-cycle writes, one foreground `maxIterations=2` wrapper run, and
one tmux bounded wrapper run. The tmux run used
`lowcap-gecko-detect-bounded`, `/tmp/lowcap-gecko-detect-bounded.log`,
`LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE=/tmp/lowcap-gecko-detect-watch-pump-checkpoint.json`,
`--pumpOnly --limit 1 --maxIterations 1`, selected one candidate, imported one
mint-only Token, and had `failedCount=0` without touching the default
checkpoint. The first watch-detected mint has also passed enrich/rescore, two
Metric appends with distinct `observedAt` values, and rawJson-free report
confirmation for the two-row Metric history. The second watch-detected mint has
now also passed enrich/rescore, two Metric appends with distinct `observedAt`
values, and rawJson-free report confirmation for the two-row Metric history.
The third watch-detected mint has also completed that same downstream loop.
The first foreground-created mint has now reached enrich/rescore, two Metric
appends, and two-Metric rawJson-free report confirmation. The second
foreground-created mint has reached enrich/rescore, two Metric appends, and
two-Metric rawJson-free report confirmation. The first tmux-created mint,
`F6eetKrYwCsF8FYLu9ZbrHXyb7JvP1kaoVDgs37ppump`, has reached enrich/rescore,
two Metric appends, and two-Metric rawJson-free report confirmation:
enrich/rescore moved
it to `partial` as `WHO GRANTS WISHES` / `WHO??` with score `C` / `0` and
`hardRejected=false`; `contextWriteCount=1` was the Token
`entrySnapshot.contextCapture.geckoterminalTokenSnapshot` update, not a Metric
write or Telegram send; and single-mint Metric snapshot appended Metric
`id=1132` at `observedAt=2026-05-01T07:53:31.204Z` with source
`geckoterminal.token_snapshot`, `volume24h=20333.5730222922`, and price / fdv /
reserve / topPool presence all true. A second single-mint Metric snapshot
appended Metric `id=1133` at `observedAt=2026-05-01T08:08:12.847Z`, moved
`metricsCount` from 1 to 2, and left previousMetric as `id=1132`; the elapsed
time from `1132` to `1133` was about 14 minutes 41 seconds. The latest row has
`volume24h=20335.4710939884`, and price / fdv / reserve / topPool presence all
true. `metrics:report -- --mint ... --limit 2` and `token:compare` confirmed
Metric ids `1133 -> 1132` without exposing Metric rawJson.
The second tmux-created mint,
`AchhX1W8L4pqefS3dxNPvrWwGsfoSz6YfvYBWwnDpump`, has reached enrich/rescore,
two Metric appends, and rawJson-free two-Metric report confirmation:
enrich/rescore moved it to `partial` as `WarlockCoin` / `Warlock` with score
`C` / `0`, `hardRejected=false`, all reviewFlags false, and `linkCount=0`;
`contextWriteCount=1` was the Token
`entrySnapshot.contextCapture.geckoterminalTokenSnapshot` update, not a Metric
write or Telegram send; and single-mint Metric snapshot appended Metric
`id=1134` at `observedAt=2026-05-01T09:30:04.949Z` with source
`geckoterminal.token_snapshot`, `volume24h=395.7346968031`, and price / fdv /
reserve / topPool presence all true. `metrics:report -- --mint ... --limit 1`
and `token:compare` confirmed latestMetric `id=1134` and one `recentMetrics`
item without exposing Metric rawJson. A second single-mint Metric snapshot
appended Metric `id=1135` at `observedAt=2026-05-01T09:46:34.724Z`, moved
`metricsCount` from 1 to 2, and left previousMetric as `id=1134`; the elapsed
time from `1134` to `1135` was about 16 minutes 29.775 seconds. The latest row
has `volume24h=395.7346968031`, and price / fdv / reserve / topPool presence
all true. `metrics:report -- --mint ... --limit 2` and `token:compare`
confirmed Metric ids `1135 -> 1134` without exposing Metric rawJson.
For any next detect watch write,
do not touch the default
checkpoint; keep a bounded command shape with
`--pumpOnly --limit 1 --write --watch`, an explicit `--maxIterations`, and
`/tmp` checkpoint isolation.
The first attempts in the Codex sandbox for some live `tsx` commands failed
before application startup due to `tsx` IPC `EPERM`; rerunning the same exact
commands outside the sandbox succeeded and stayed within the allowed
side-effect bounds. Treat any long-running detect watch, tmux detect watch, or
systemd detect watch as a later Red task.

Still unconfirmed for this lane:

- detect tmux long-running or unbounded watch operation
- detect systemd operation
- default-checkpoint detect watch operation
- long-running or unbounded detect watch
- two-or-more-token simultaneous metric snapshot write
- foreground metric append during bounded watch
- long-running metric snapshot watch
- restart-oriented metric snapshot operation
- metric snapshot systemd operation
- multi-token or multi-metric cycles
- `token_completed` production live send
- `loop_complete` production live send

### `metric:snapshot:geckoterminal`

- Existing watch support: yes.
- Existing bounded test shape: `--maxIterations`.
- Existing spacing guard: `--minGapMinutes`.
- Existing rate-limit behavior: watch mode stops the current cycle after the
  first token snapshot rate limit and continues later.
- Existing checkpoint or state file: none in this lane.
- Confirmed bounded watch write gates: single mint plus `--maxIterations 1` plus
  `--minGapMinutes`, batch mode with `--pumpOnly`, small `--limit`,
  `--maxIterations`, and `--minGapMinutes`, plus foreground and tmux runs using
  the same bounded command shape.
- First always-on candidate: yes, after multi-token dry-run and foreground checks.
- Write behavior: `--write` appends `Metric` rows.

Start with dry-run-only watch using `--maxIterations 1` or `2`. Move to Red only
when selected count and expected write count are bounded. For single-mint checks,
prefer `--mint <MINT> --write --watch --maxIterations 1 --minGapMinutes <N>`.
For batch watch write, prefer `--pumpOnly --limit <N> --write --watch --maxIterations 1 --minGapMinutes <N>`.
Checkpoint/state protection is not available, so small `--limit`,
`--maxIterations`, and `--minGapMinutes` are mandatory gates before any
foreground, tmux, or systemd step. Do not run unbounded watch, watch without
`--limit`, or systemd start from this lane.
The two-cycle foreground and tmux checks confirmed that `--minGapMinutes`
suppresses repeat appends before fetch; keep the same bounded command shape for
any next tmux check, and do not move to systemd yet. Before systemd, compare the
wrapper and sample unit defaults against this gate explicitly: `--limit`,
`--maxIterations` or another bounded stop condition, `--minGapMinutes`,
`--intervalSeconds`, log location, restart policy, and stop command must all be
documented before install / enable / start is requested.

Systemd preflight for this lane has been checked read-only. The current wrapper
and sample unit do not yet match the confirmed bounded gate:

- Confirmed bounded gate: `--pumpOnly --limit 2 --write --watch --maxIterations 2 --minGapMinutes 10 --intervalSeconds 60`.
- `scripts/run-geckoterminal-metric-watch.sh` defaults to
  `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=5`,
  `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`,
  `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=1800`,
  `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=900`,
  `LOWCAP_GECKOTERMINAL_METRIC_SINCE_MINUTES=120`, and
  `LOWCAP_GECKOTERMINAL_METRIC_SOURCE=geckoterminal.token_snapshot`.
- The wrapper always passes `--watch --write`. It now supports
  `LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true|1|yes` to add `--pumpOnly`, and
  `LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=<N>` to add
  `--maxIterations <N>`. Both are off by default, so existing unbounded wrapper
  behavior is unchanged unless the first-run environment sets them.
- The wrapper does not echo `.env` or secret values, but the delegated CLI emits
  JSON output; a systemd run may leave sanitized snapshot JSON in journald unless
  a summary-only logging plan is added.
- `ops/systemd/lowcap-bot-geckoterminal-metric-watch.service` points
  `ExecStart` at the wrapper, sets `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=5`,
  `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=1800`,
  `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`,
  `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=900`, and
  `LOWCAP_GECKOTERMINAL_METRIC_SOURCE=geckoterminal.token_snapshot`, but has no
  `EnvironmentFile`, no `--pumpOnly`, no `--maxIterations`, and
  `Restart=always`.
- `ops/systemd/lowcap-bot-geckoterminal-metric-watch-first-run.service` is the
  bounded first-run sample. It uses the same wrapper, sets
  `LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true`,
  `LOWCAP_GECKOTERMINAL_METRIC_LIMIT=2`,
  `LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=2`,
  `LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`,
  `LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=60`,
  `LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS=0`, and `Restart=no`.
  This unit is for manual first-run confirmation only and is not the always-on
  metric watch unit.

Do not install, enable, or start this unit yet. The first systemd run must be
bounded close to the confirmed gate by explicitly setting
`LOWCAP_GECKOTERMINAL_METRIC_PUMP_ONLY=true`,
`LOWCAP_GECKOTERMINAL_METRIC_LIMIT=2`,
`LOWCAP_GECKOTERMINAL_METRIC_MAX_ITERATIONS=2`,
`LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES=10`, and
`LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS=60`, plus exact stop and log-check
commands and a clear policy that journald must not expose secrets or full raw
payloads.

Yellow follow-up candidates before any Red systemd run:

- Decide whether metric watch output should be summary-only for journald, rather
  than full CLI JSON.

Red systemd first-run must still be split into exact commands and explicitly
approved before execution:

1. Copy/install the first-run unit into the user systemd directory.
2. Run `systemctl --user daemon-reload`.
3. Start only `lowcap-bot-geckoterminal-metric-watch-first-run.service`.
4. Stop the first-run unit if any stop condition is hit.
5. Check bounded logs for cycle count, selected count, written count, skipped
   count, failure/rate-limit fields, and natural exit. Do not paste rawJson,
   secrets, or large journal output into reports.

Do not run `enable` for the first-run unit. Do not start the always-on metric
watch unit until the first-run unit has been installed, started, observed,
stopped or naturally exited, and documented under separate Red approval.

Current Codex environment blocker:

- Phase A installed
  `/home/mochi/.config/systemd/user/lowcap-bot-geckoterminal-metric-watch-first-run.service`
  and confirmed it matches the repo sample.
- `systemctl --user daemon-reload` failed with no user bus.
- Read-only follow-up found PID 1 is `codex-linux-san`, not systemd.
- `XDG_RUNTIME_DIR` is set, but the user bus socket is missing.
- `systemctl --user is-system-running --no-pager` reports `offline`.
- `loginctl show-user` cannot connect because the environment was not booted
  with systemd as init.

Do not proceed to Phase B start in this environment. To continue the systemd
path, use a session where PID 1 is systemd, `XDG_RUNTIME_DIR/bus` exists, and
`systemctl --user` is not offline, then rerun Phase A from the install /
daemon-reload step. If that environment is not available, the practical
fallback remains tmux bounded operation. `sudo`, `loginctl enable-linger`, and
system unit conversion are separate Red tasks and are not part of this gate.

For the tmux bounded fallback, use
[`gecko-metric-tmux-bounded.md`](./gecko-metric-tmux-bounded.md). It keeps the
confirmed `lowcap-gecko-metric-bounded` command shape, log path, stop conditions,
numeric summary checks, and post-run read-only report checks separate from
systemd work.

### Enrich / Rescore Notify Wrappers

- Existing shell loop wrappers: yes.
- Fast runner: `scripts/run-geckoterminal-enrich-rescore-notify-fast.sh`.
- Slower runner: `scripts/run-geckoterminal-enrich-rescore-notify.sh`.
- Write behavior: both delegate to `token:enrich-rescore:geckoterminal --write`.
- Notify behavior: both include `--notify`.

These wrappers need an explicit notify gate before operational use. Keep them
behind manual foreground or tmux checks until notification behavior, log volume,
and rate-limit cooldowns are acceptable.

### `ops:catchup:gecko`

- Current role: bounded operator-visible one-shot.
- Existing loop bound: `--maxCycles`.
- Confirmed production Telegram ops send: one `metric_appended`.
- Unconfirmed production Telegram ops sends: `token_completed` and
  `loop_complete`.
- Not current role: scheduler, worker, queue, or always-on loop.

Do not promote `ops:catchup:gecko` into scheduler, worker, queue, or systemd
operation yet. Keep token write and Metric append as explicit Red executions.

## Risk Boundaries

### Green

- Docs and runbook updates.
- Read-only inspection.
- Targeted tests.
- `pnpm exec tsc --noEmit`.
- Dry-run-only command planning.

### Yellow

- Dry-run-only wrapper additions.
- Log summary or stop-condition test-only reinforcement.
- Small production gate additions that do not write, send Telegram messages, or
  start watch mode.

### Red

- `--watch --write`.
- `detect:geckoterminal:new-pools --write`.
- Any detector, metric snapshot, or ops catch-up command with `--write`.
- Production Telegram send.
- `systemd` install, enable, or start.
- Scheduler or watch process startup.

## Preflight Checklist

Before any watch or scheduler step:

1. Confirm `git status --short --branch` is clean.
2. Confirm `git log --oneline -8` shows the expected HEAD.
3. Pick exactly one lane.
4. Start with `--maxIterations 1` or a bounded one-shot.
5. Put the first checkpoint file under `/tmp`.
6. Put capture files under `/tmp`.
7. Do not print Telegram token, chat id, `.env`, or other secrets.
8. Confirm candidate count from dry-run output.
9. Advance to Red permission only when the write count is limited to one expected action.

## Stop Conditions

Stop before write, send, watch, or systemd if any of these happen:

- Candidate count is higher than expected.
- Planned or actual write count is higher than expected.
- A checkpoint would update outside the intended path.
- Rate-limit, network, or retry errors repeat.
- Expected capture records are not created.
- Any trigger other than the selected `--opsNotifyTrigger` is eligible to send.
- `token_completed` or `loop_complete` live-send candidate count is zero.
- There is any risk of showing `.env`, Telegram token, Telegram chat id, raw env,
  raw stdout, raw stderr, or full command args containing secrets.

## Systemd Checklist

Before using a sample systemd unit:

1. Confirm the same lane has already run briefly in foreground or tmux.
2. Explain why it is time to move from an isolated `/tmp` checkpoint to the
   intended persistent checkpoint.
3. Document log location, restart policy, and stop command.
4. Confirm the sample unit command matches the current runbook command.
5. Require an exact install / enable / start command and explicit Red approval.

Sample units are not activation instructions by themselves. They are templates
to review after the lane has passed the earlier gates.
