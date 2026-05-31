# Lowcap Bot Red Execution Safety Skill Draft

Date: 2026-05-31

Status: draft only. Do not install this as a real Skill yet.

This document is a future Skill draft for compressing lowcap-bot Red execution
prompts. It is not a `.codex/skills/.../SKILL.md` file and was not copied into
any global or repo-local Skills directory.

## Purpose

This Skill should make Codex safer and more consistent when running
human-approved Red operations in lowcap-bot.

It protects:

- Red pre-run and post-run safety checks
- exact-command one-shot execution
- explicit side effects and non-effects
- production DB write boundaries
- Notification / Telegram boundaries
- rawJson, offensive raw text, and secret-output boundaries
- docs commit and push hygiene after approved Red execution

It does not replace lowcap-bot CLI behavior. Existing CLI output remains the
source of truth for DB state, queue state, planner state, phase summaries, and
stop conditions.

## When to use

Use this Skill when a requested task may run a Red command, including:

- `pnpm -s metric:snapshot:geckoterminal -- ... --write`
- `pnpm -s token:enrich-rescore:geckoterminal -- ... --write`
- `pnpm -s detect:geckoterminal:new-pools -- ... --watch --write`
- `pnpm -s ops:run:bounded -- ... --execute`
- notification live send
- notification auto-send execute
- notification retry execution
- any operation that may write production `Token`, `Metric`, `Notification`,
  or `HolderSnapshot` rows
- any operation that may send Telegram
- any operation that may perform external provider fetch as part of a
  production write workflow

## When not to use

Do not use this Skill as the main workflow for:

- Green read-only preflight
- docs-only organization
- pure code review
- no-write test or typecheck work
- planner-only inspection
- translation or general explanation
- UI-only implementation without production write/send/fetch risk

Those tasks may use other future lowcap-specific Skills such as Green
Preflight, Yellow Implementation, Bounded Runner Operation, or
Notification / Telegram Safety.

## Core Rules

- Human approval is required before any Red command.
- Run exactly one approved command.
- Do not retry unless a separate Red is explicitly approved.
- Do not run a second command to compensate for partial results.
- Do not modify command options after approval.
- Do not perform manual backfill during the Red.
- Do not run `pnpm smoke` on the active DB as a no-write verification.
- Do not run `git pull`, `git fetch`, `git rebase`, `git reset`, or
  `git checkout`.
- Do not dump full `rawJson`.
- Do not dump offensive raw text.
- Do not print secrets or environment values.
- Do not unlock or run scheduler/systemd unless explicitly approved by a
  separate task.
- Keep Red execution separate from unrelated Yellow implementation or Green
  review work.

## Pre-run Checklist

Before running the approved command, confirm:

- working tree is clean with `git status --short --branch`
- `HEAD` matches the expected commit or the user-approved current state
- the approved command is fixed and exactly one command
- command options match the approval text
- current DB counts are captured:
  - Token
  - Metric
  - Notification
  - HolderSnapshot
- Notification failed count is known
- retry candidate count is known
- enabled auto-send allowed candidate count is known
- expected side effects are explicit
- expected non-effects are explicit
- stop conditions are explicit
- checkpoint path is safe if relevant
- repo-local data diff expectation is explicit
- rawJson full dump, offensive raw text, and secrets boundaries are explicit
- Telegram / Notification behavior is either explicitly part of this Red or
  explicitly out of scope

## Stop Conditions

Stop before execution if any condition is true:

- working tree is not clean
- `HEAD` is unexpected
- failed Notification count is greater than `0`
- retry candidate count is greater than `0`
- enabled auto-send allowed candidate count is greater than `0`
- selected rows or target rows are unclear
- Notification / Telegram side effect is unexpected
- exact command cannot be fixed
- the command needs option changes after approval
- schema or migration work becomes unexpectedly required
- app code changes become unexpectedly required
- rawJson full dump appears necessary
- secret or environment output appears necessary
- checkpoint path is inside the repo or otherwise unsafe
- command candidate appears to split into multiple Red commands

## Execution Rules

During execution:

- run the exact approved command only
- record start time
- for long-running commands, monitor progress without launching unrelated Red
  or write commands
- do not rerun
- do not retry
- do not run a second Red command
- do not mix write phases
- do not proceed to Telegram or notification execution unless this exact Red is
  specifically a Telegram / notification execution Red
- if an error, HTTP 429, provider error, or phase failure appears, follow the
  runner or CLI stop behavior and summarize the result
- if a bounded runner is used, record phase start/end, cycle start/end,
  stopped reasons, and final summary
- do not print raw provider payloads, full rawJson, offensive raw text, or
  secrets

## Post-run Checklist

After execution, capture safe summaries:

- executed command
- start time
- end time
- duration
- command exit status
- selected / target rows
- written / enriched / rescored / sent / skipped / error counts
- provider error and 429 status
- DB before / after:
  - Token
  - Metric
  - Notification
  - HolderSnapshot
- deltas:
  - Token
  - Metric
  - Notification
  - HolderSnapshot
- Notification status counts
- retry candidate count
- enabled auto-send allowed candidate count
- queue after
- planner after
- checkpoint path, existence, size, and safe cursor summary if relevant
- representative safe summary without rawJson or offensive raw text
- Telegram send presence or absence
- repo-local diff
- docs updates needed
- validation commands
- commit and push result if docs or code changed

## Required Final Report Format

Use this report shape unless the user asks for a narrower one:

```markdown
## Summary
- conclusion
- whether the Red succeeded
- where execution stopped
- whether progress/final summary was confirmed
- whether Notification / Telegram boundaries held
- whether the next step can proceed

## Repo
- Codex version
- HEAD before / after
- working tree before / after
- commit hash if any
- push result if any

## Execution
- exact command
- start time
- end time
- duration
- exit status
- key runner or CLI summary fields

## DB State
- before counts
- after counts
- deltas
- metadata / bucket / status distributions if relevant

## Selected / Target Result
- selected count
- written / enriched / rescored / sent count
- skipped / error count
- provider error / 429 status

## Queue / Planner After
- queue summary
- planner recommendation
- retry candidate count
- enabled auto-send allowed candidate count

## Side Effects
- DB write
- external fetch
- Token write
- Metric write
- Notification create/update
- HolderSnapshot write
- Telegram send
- checkpoint write
- repo-local data diff
- rawJson full dump
- offensive raw text dump

## Validation
- commands run
- commands not run and why
- schema / migration / app code change status

## Not Executed
- explicitly list forbidden or intentionally omitted operations

## Next Candidate
- one next task only
```

## Side Effect Vocabulary

Use this vocabulary consistently:

| Term | Meaning |
| --- | --- |
| DB write | Any production database mutation. |
| external fetch | Network/provider call such as GeckoTerminal, DexScreener, Metaplex, or Telegram. |
| Token write | `Token` create, reuse that changes data, enrich, rescore, or update. |
| Metric write | `Metric` create or update. |
| Notification create/update | `Notification` row creation, status update, retry metadata update, or send-state update. |
| HolderSnapshot write | `HolderSnapshot` create or update. |
| Telegram send | Any live Telegram API send attempt. |
| checkpoint write | Checkpoint file create or update. |
| repo-local data diff | Any runtime file diff inside the repository, especially `data/`. |
| rawJson full dump | Full raw provider payload or DB raw JSON printed to logs or final answer. |
| offensive raw text dump | Unfiltered token names, descriptions, or provider text likely to contain offensive content. |

## Red Command Patterns

These are placeholders only. Do not execute them from this draft. Replace
placeholder values from current Green preflight output and human approval.

### Metric Snapshot

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit <LIMIT> --sinceMinutes <MINUTES> --minGapMinutes <MIN_GAP> --interItemDelayMs <DELAY_MS> --onlyMetricPending --noNotificationCapture --write
```

Values such as `<LIMIT>`, `<MINUTES>`, `<MIN_GAP>`, and `<DELAY_MS>` must come
from the current preflight or explicit approval.

### Token Enrich / Rescore

```bash
pnpm -s token:enrich-rescore:geckoterminal -- --pumpOnly --limit <LIMIT> --sinceMinutes <MINUTES> --interItemDelayMs <DELAY_MS> --write
```

Do not add `--notify` unless the Red is specifically approved for notification
capture/send behavior.

### Detect Write Watch

```bash
pnpm -s detect:geckoterminal:new-pools -- --watch --write --pumpOnly --limit <LIMIT> --maxIterations <N> --intervalSeconds <SECONDS> --checkpointFile /tmp/<SAFE_CHECKPOINT>.json
```

Checkpoint path must be outside the repository.

### Bounded Runner Execute

```bash
pnpm -s ops:run:bounded -- --hours <HOURS> --pumpOnly --checkpointFile /tmp/<SAFE_CHECKPOINT>.json --metricLimit <LIMIT> --enrichLimit <LIMIT> --postRunMetricCycles <N> --postRunEnrichCycles <N> --intervalSeconds <SECONDS> --postRunBufferMinutes <MINUTES> --interItemDelayMs <DELAY_MS> --execute
```

This is a long-running Red. Record start/end/duration and phase/cycle/final
summary.

### Notification Auto-send Execute

```bash
NOTIFICATION_AUTO_SEND_ENABLED=true pnpm -s notification:auto-send:execute -- --execute
```

Only use after a dedicated notification preflight confirms a selected
production candidate, no failed Notification blockers, no unexpected retry
candidate, and one-run side-effect bounds.

## Relationship to Existing Runbooks

- `docs/runbooks/gecko-bounded-operation-mvp.md`: detailed bounded pipeline
  history and operating context.
- `docs/runbooks/gecko-token-metric-min-loop.md`: minimum token / metric /
  enrich loop context.
- `docs/runbooks/telegram-operating-slice.md`: Notification and Telegram
  safety history.
- `docs/runbooks/metric-snapshot-rate-limit-policy.md`: rate-limit behavior
  and provider-error expectations.
- `docs/runbooks/metric-report-readiness.md`: reporting and queue-review
  readiness.
- `docs/runbooks/codex-skills-review.md`: parent design review for Skill
  adoption.

Runbooks remain the durable human-facing history and detailed policy record.
This Skill should become the short Codex task-time safety procedure. Existing
CLI, DB, planner, and runner implementations remain the source of truth for
actual state and behavior.

## Open Questions Before Real Skill Install

- Should the real Skill live in a repo-local Skill directory or global
  `C:\Users\mochi\.codex\skills`?
- If repo-local, what path should Codex discover reliably?
- Should `AGENTS.md` mention the Skill after it exists?
- Should Green Preflight, Yellow Implementation, Bounded Runner Operation, and
  Notification / Telegram Safety become separate Skills?
- Should Red Execution Safety be tested alone first before adding the other
  Skills?
- Should references point to runbooks directly, or should a smaller
  `references/` file be bundled with the real Skill?

## Proposed Future SKILL.md Outline

If installed later, keep `SKILL.md` concise:

```markdown
---
name: lowcap-red-execution-safety
description: Use when running or reviewing a human-approved lowcap-bot Red operation that may write production DB state, fetch providers, write checkpoints, or send Telegram. Enforces exact-command execution, no retry without separate approval, pre-run stop conditions, post-run summaries, and rawJson/secrets/offensive-text boundaries.
---

# Lowcap Red Execution Safety

## Use For
- metric snapshot writes
- token enrich/rescore writes
- detect watch/write
- ops:run:bounded --execute
- notification live send / auto-send execute / retry execution

## Non-negotiables
- human approval
- exact command one time
- no retry / second command / option changes
- no rawJson, offensive raw text, or secrets
- no scheduler/systemd unless explicitly unlocked

## Workflow
1. Pre-run checklist.
2. Stop-condition audit.
3. Execute exact command.
4. Monitor without manual backfill.
5. Post-run checklist.
6. Final report.

## References
- docs/runbooks/gecko-bounded-operation-mvp.md
- docs/runbooks/telegram-operating-slice.md
- docs/runbooks/codex-skills-review.md
```

Do not create this real Skill until a separate task approves the install path
and scope.
