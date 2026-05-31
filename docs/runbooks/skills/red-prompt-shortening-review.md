# Red Prompt Shortening Review

Date: 2026-05-31

Status: docs-only review complete.

Decision: **A. Skill-based shortened Red prompts can be used next time**.

This review checks whether the repo-local
`.codex/skills/lowcap-red-execution-safety/SKILL.md` can replace repeated
general safety text in Red execution prompts. It does not execute any Red
command and does not perform production write/fetch/send work.

## Stale HEAD Guard Trial

Date: 2026-05-31.

A shortened Red prompt trial attempted to use the repo-local
`lowcap-red-execution-safety` Skill for the post-run
`metric_pending_snapshot` continuation. The Skill stopped execution before the
Red command because the prompt expected `HEAD=48bb4e3`, while the actual repo
HEAD was `1c27c35 docs: review red prompt shortening with skill`.

Result:

- Red command not executed
- DB write `0`
- external fetch `0`
- Notification create/update `0`
- Telegram send `0`
- Metric write `0`
- Token / HolderSnapshot write `0`
- rawJson full dump `0`

Conclusion: the shortened prompt was safe enough to catch stale state through
the Skill's `HEAD is unexpected` stop condition. The next Red prompt should use
the current HEAD and current queue/planner state.

## Current HEAD Preflight For Metric Pending Continuation

Date: 2026-05-31.

Current preflight state:

- HEAD: `1c27c35 docs: review red prompt shortening with skill`
- working tree: clean
- DB counts: Token / Metric / Notification / HolderSnapshot =
  `3023 / 856 / 22 / 1`
- metadataStatus: `mint_only=2440`, `partial=570`, `enriched=13`
- Metric buckets: `0=2307`, `1=629`, `2+=87`
- Notification statuses: `captured=17`, `sent=5`, `failed=0`
- failed Notification count: `0`
- retry candidate count: `0`
- enabled auto-send allowed candidate count: `0`

Queue/planner:

- review queue default 24h: `geckoOriginTokenCount=359`,
  `metricPendingCount=259`, `enrichPendingCount=259`,
  `staleReviewCount=107`, `notifyCandidateCount=0`
- review queue rolling 168h: `geckoOriginTokenCount=1437`,
  `metricPendingCount=1117`, `enrichPendingCount=1062`,
  `staleReviewCount=965`, `notifyCandidateCount=0`
- `ops:plan:bounded -- --hours 6 --pumpOnly --postRunPlan` recommends
  `metric_pending_snapshot`
- post-run planner has `blockedBy=[]` and `stopConditionCodes=[]`
- auto-send planner: allowed candidate `0`, `wouldSend=false`,
  `wouldUpdateNotification=false`
- retry planner: candidate `0`

Read-only Metric pending preview:

- command used `--onlyMetricPending` without `--write`, which the CLI documents
  as a selection preview that does not fetch GeckoTerminal snapshots
- selected count: `50`
- all previewed selected rows had `metricsCount=0`
- all previewed selected rows had `notificationCount=0`
- all previewed selected rows had `holderSnapshotCount=0`
- preview status: `selection_preview`
- preview wrote `0` Metrics and fetched `0` provider snapshots

Current Red candidate, requiring separate human approval:

```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Expected side effects are external GeckoTerminal fetch and production DB Metric
write up to `50`, moving selected Tokens from `metricsCount=0` to
`metricsCount=1`. Expected non-effects are Token write `0`, Notification
create/update `0`, HolderSnapshot write `0`, Telegram send `0`, retry
execution `0`, auto-send execution `0`, scheduler/systemd `0`, rawJson full
dump `0`, offensive raw text dump `0`, and `pnpm smoke` `0`.

## Confirmed Inputs

- Codex CLI: `codex-cli 0.133.0`
- Skill file exists:
  `.codex/skills/lowcap-red-execution-safety/SKILL.md`
- `AGENTS.md` tells Codex to use the repo-local
  `lowcap-red-execution-safety` Skill for human-approved Red execution tasks.
- `AGENTS.md` also keeps explicit user instructions, project runbooks, and
  CLI planner/runner output as higher-priority sources of truth.
- `pnpm -s mvp:status` was read-only with `willWrite=false`,
  `willFetch=false`, and `willSendTelegram=false`.
- Notification planners remained read-only:
  - auto-send allowed candidate count: `0`
  - retry candidate count: `0`

## What Can Be Delegated To The Skill

The next Red prompt does not need to repeat these general rules in full:

- human approval requirement
- exact command one-shot rule
- no retry unless separately approved
- no second command
- no option changes after approval
- no manual backfill or compensating write command
- no `pnpm smoke`
- no `git pull`, `git fetch`, `git rebase`, `git reset`, or `git checkout`
- no full `rawJson` dump
- no offensive raw text dump
- no secrets or environment output
- no scheduler/systemd unless explicitly unlocked
- generic pre-run checklist
- generic stop conditions
- generic execution behavior on HTTP 429, provider error, or CLI failure
- generic post-run checklist
- required final report sections
- shared side-effect vocabulary

The prompt should still name the Skill explicitly so Codex knows the Red safety
procedure is intentional for that task.

## What Must Remain In Each Red Prompt

These are task-specific and should remain explicit every time:

- task name and Red class
- statement that human approval is granted for that one task
- the exact command, as a single command block
- latest known `HEAD`
- expected working tree state
- current DB counts and relevant distributions
- current queue summary
- current planner summary
- exact checkpoint path if relevant
- task-specific limits, windows, delays, cycles, and selected IDs
- expected side effects with maximum write/send/fetch bounds
- expected non-effects
- task-specific stop conditions not already captured by the Skill
- post-run docs targets
- commit message proposal
- final report format if it differs from the Skill default

The main risk is over-shortening the prompt so far that Codex has to infer the
current DB state, command options, or side-effect bounds. Those values must stay
in the prompt because the Skill cannot know the current operating state.

## Short Red Prompt Template

Use this as the default shape for future Red execution tasks:

````markdown
You are ~/projects/lowcap-bot execution owner.

Use repo-local Skill: lowcap-red-execution-safety.

Task: <short task name>
Risk lane: Red
Human approval: granted for the exact command below only.

Exact command:
```bash
<one exact command>
```

Latest known state:
- HEAD: <commit and subject>
- working tree: expected clean
- DB: Token / Metric / Notification / HolderSnapshot = <counts>
- queue/planner: <short current summary>
- failed Notification: <count>
- retry candidate: <count>
- enabled auto-send allowed candidate: <count>

Task-specific expected side effects:
- <external fetch/write/checkpoint/send upper bounds>

Task-specific expected non-effects:
- <writes/sends/executions that must remain zero>

Task-specific stop conditions:
- <conditions beyond the Skill defaults>

Docs update:
- <docs targets>
- commit message: <message>
- push after commit: yes

Final report:
- Use the Skill report sections.
- Include <extra fields only if this Red needs them>.
````

Notes:

- Keep the command in exactly one command block.
- Keep all current counts and planner state concrete.
- Do not re-list the whole Skill body.
- If a Red involves Telegram or notification execution, state that explicitly
  as the approved Red, not as an incidental side effect.

## Example: Post-run Metric Pending Continuation

This is an example prompt only. Do not execute it from this document.

````markdown
You are ~/projects/lowcap-bot execution owner.

Use repo-local Skill: lowcap-red-execution-safety.

Task: post-run metric_pending_snapshot continuation
Risk lane: Red
Human approval: granted for the exact command below only.

Exact command:
```bash
pnpm -s metric:snapshot:geckoterminal -- --pumpOnly --limit 50 --sinceMinutes 420 --minGapMinutes 60 --interItemDelayMs 15000 --onlyMetricPending --noNotificationCapture --write
```

Latest known state:
- HEAD: <latest commit and subject>
- working tree: expected clean
- DB: Token / Metric / Notification / HolderSnapshot = <counts>
- review:queue default: metricPendingCount=<count>, notifyCandidateCount=0
- review:queue sinceHours 168: metricPendingCount=<count>, notifyCandidateCount=0
- failed Notification: 0
- retry candidate: 0
- enabled auto-send allowed candidate: 0

Task-specific expected side effects:
- external GeckoTerminal fetch
- production DB Metric write: max 50
- selected Token metricsCount should move from 0 to 1 when successful

Task-specific expected non-effects:
- Token create/update: 0
- Notification create/update: 0
- HolderSnapshot write: 0
- Telegram send: 0
- notification capture: 0
- retry execution: 0
- auto live send execution: 0

Task-specific stop conditions:
- selected rows are not metric-pending
- notification capture/send appears possible
- Token or HolderSnapshot write appears possible
- exact command needs modification

Docs update:
- docs/current-status.md
- docs/roadmap.md
- docs/runbooks/gecko-bounded-operation-mvp.md if relevant
- docs/runbooks/gecko-token-metric-min-loop.md if relevant
- docs/runbooks/metric-report-readiness.md if relevant
- commit message: docs: record post run metric pending continuation
- push after commit: yes

Final report:
- Use the Skill report sections.
- Include selected/written/skipped/error, interItemDelayMs/count, provider
  error/429 status, Metric bucket before/after, and rawJson full dump absence.
````

## Cautions

- The Skill should compress general Red safety rules, not hide task-specific
  state.
- A prompt that omits the exact command is not acceptable for Red.
- A prompt that omits current planner blockers is not acceptable for Red.
- A prompt that lets Codex choose limits, checkpoint paths, or write mode is not
  acceptable for Red.
- Keep Green preflight and Yellow implementation prompts separate from this
  Red template.

## Not Executed

- no actual Red command
- no `ops:run:bounded --execute`
- no detect watch or detect `--write`
- no metric snapshot `--write`
- no token enrich/rescore `--write`
- no notification send
- no retry execution
- no auto live send
- no scheduler/systemd
- no `pnpm smoke`
- no production DB write
- no external fetch
- no rawJson full dump
