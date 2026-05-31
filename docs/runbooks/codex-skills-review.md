# Codex Skills Review

Date: 2026-05-31

This Green review checked whether Codex Skills are visible in the current
environment and whether lowcap-bot operating prompts should be compressed into
Skills. It was read-only / docs-only. No production DB write, external fetch,
`ops:run:bounded --execute`, detect watch/write, Metric write, Token enrich
write, notification send, retry execution, auto live send, scheduler/systemd,
schema/migration change, app code change, `pnpm smoke`, rawJson full dump,
offensive raw text dump, or secret output was performed.

## Environment Findings

- `codex --version` returned `codex-cli 0.133.0`.
- `codex --help` did not expose a top-level `skills` subcommand. It listed
  commands such as `exec`, `review`, `mcp`, `plugin`, `doctor`, and
  `features`.
- The session environment exposed Skills metadata directly to Codex, and local
  system Skill files exist under `/home/mochi/.codex/skills/.system/`.
- Confirmed installed system Skills:
  - `imagegen`
  - `openai-docs`
  - `plugin-creator`
  - `skill-creator`
  - `skill-installer`
- The repo has `AGENTS.md` and an empty `.codex` file, but no repo-local
  `skills/` directory and no lowcap-specific Skill yet.
- Interactive `/skills` behavior was not tested because this review avoided
  interactive actions that could change session state.

## Repo Findings

- `AGENTS.md` already captures stable repo boundaries: three lanes,
  anti-patterns, read-only pause points, source-adapter rules, verification,
  docs sync, and reporting format.
- `package.json` keeps the operational surface CLI-first. Relevant commands
  include `ops:plan:bounded`, `ops:run:bounded`,
  `metric:snapshot:geckoterminal`, `token:enrich-rescore:geckoterminal`,
  `notification:auto-send:plan`, `notification:auto-send:execute`,
  `notification:retry:plan`, `mvp:status`, and `smoke`.
- `ops:plan:bounded` and `ops:run:bounded` already encode many safety
  invariants in structured output: `readOnly`, `executeRequested`,
  `expectedSideEffects`, `expectedNonEffects`, `blockedBy`,
  `stopConditionCodes`, notification planner state, checkpoint boundaries, and
  scheduler/systemd locks.
- Current read-only checks returned Token / Metric / Notification /
  HolderSnapshot `3023 / 856 / 22 / 1`; failed Notification `0`; retry
  candidate `0`; enabled auto-send allowed candidate `0`.
- Post-run planner currently recommends `metric_pending_snapshot` as the next
  human-approved Red candidate. The plan-only runner with
  `/tmp/lowcap-bot-skill-review-plan.json` was unblocked and stayed read-only.

## Fit Assessment

Skills are a good fit for compressing Codex operating procedures. They should
not replace the CLI, DB safety checks, or runbooks. The repo should continue to
treat CLI output as the source of truth for current DB state, queue state,
planner state, and stop conditions.

Best use:

- reduce repeated long Green / Yellow / Red prompts
- standardize preflight and post-run reporting
- keep exact-command Red execution guardrails close to Codex
- prevent accidental notification / Telegram escalation
- route docs updates to the closest source of truth

Weak fit:

- dynamic DB state, queue counts, and planner state
- exact command values that change each run
- operational facts that must come from live CLI output
- app behavior that belongs in TypeScript tests or CLI implementations

## Candidate Skills

### 1. Lowcap Bot Red Execution Safety Skill

Priority: high.

Purpose: standardize approved Red execution, especially exact-command one-shot
runs.

Include:

- require human approval and exact command
- no retry, no second command, no manual backfill
- start/end/duration capture
- side effects and non-effects
- stop conditions
- rawJson/offensive text/secrets guard
- post-run summary, docs commit, push

Expected benefit: highest safety gain for the longest and riskiest prompts.

### 2. Green Preflight Skill

Priority: high.

Purpose: standardize read-only preflight before Red tasks.

Include:

- `mvp:status`
- bounded planner and runner plan-only checks
- notification auto-send and retry planners
- DB counts, queue counts, checkpoint checks
- fixed Red command proposal
- no write/fetch/send guardrails

Expected benefit: reduces repeated preflight boilerplate while preserving the
current CLI as source of truth.

### 3. Yellow Implementation Skill

Priority: medium.

Purpose: standardize app code / docs implementation tasks.

Include:

- scope control and changed-file review
- `pnpm exec tsc --noEmit` after code changes
- tests appropriate to blast radius
- docs sync rule
- no production write/fetch/send
- commit / push / final report format

Expected benefit: useful, but much of it already lives in `AGENTS.md`; keep
this Skill lean.

### 4. Bounded Runner Operation Skill

Priority: high.

Purpose: compress the manual `ops:run:bounded` operating procedure.

Include:

- checkpoint must be outside repo
- hours, cycles, limits, interval, buffer, delay
- progress logging / final summary checks
- phase result extraction
- DB before/after
- queue/planner after
- Notification / Telegram boundary
- scheduler/systemd locked

Expected benefit: strong fit because the 6H bounded pipeline prompt is long and
repetitive.

### 5. Notification / Telegram Safety Skill

Priority: high.

Purpose: prevent accidental send/update escalation.

Include:

- auto-send planner and enabled planner
- retry planner
- smoke/rehearsal guard
- failed/sent/captured states
- production `--execute` forbidden conditions
- live Telegram send prerequisites

Expected benefit: strong safety fit; should be separate from bounded runner so
it can trigger on any notification task.

### 6. Docs Handoff Skill

Priority: medium.

Purpose: standardize compact handoff prompts after long sessions.

Include:

- Repo
- DB State
- Queue / planner
- recent execution
- side effects / non-effects
- validation
- not executed
- next candidate

Expected benefit: useful for long Codex sessions, but lower urgency than Red
safety and notification safety.

## Runbook Mapping

- Red Execution Safety: maps to `docs/current-status.md`,
  `docs/runbooks/gecko-bounded-operation-mvp.md`, and recent Red result
  sections.
- Green Preflight: maps to `docs/roadmap.md`, `docs/current-status.md`, and
  preflight sections across bounded and notification runbooks.
- Yellow Implementation: maps to `AGENTS.md`, docs sync rules, and standard
  verification rules.
- Bounded Runner Operation: maps most directly to
  `docs/runbooks/gecko-bounded-operation-mvp.md` and
  `docs/runbooks/gecko-token-metric-min-loop.md`.
- Notification / Telegram Safety: maps to
  `docs/runbooks/telegram-operating-slice.md` and notification planner docs.
- Docs Handoff: maps to `hand-off-prompt.txt`, `docs/current-status.md`, and
  final report formats.

Do not convert runbooks wholesale into Skills. Runbooks should remain durable
human-facing history and policy. Skills should distill only the task-time
procedure that Codex needs to execute safely.

## Change Recommendations

Recommended conclusion: **A. first stabilize Skill design docs-only**.

Do now:

- keep this review as the design source for lowcap-specific Skills
- do not change app code
- do not change CLI names or output shape
- do not make `ops:plan:bounded` or `ops:run:bounded` depend on Skills
- do not replace runbooks with Skills

Later:

- add a small AGENTS.md note only after at least one lowcap-specific Skill
  exists and has been tested
- create the first actual Skill as
  `lowcap-red-execution-safety` or `lowcap-green-preflight`
- keep Skill bodies concise and link to runbook references instead of copying
  long history

Not needed:

- app code changes
- schema or migration changes
- CLI renames
- planner/runner output changes just for Skills
- scheduler/systemd changes

## Next Task Candidate

Next one task:

**Yellow/docs-only: create the first lowcap-specific Skill draft for Red
execution safety.**

Risk: Yellow/docs-only if limited to Skill files and docs. It becomes Red only
if the task executes any production write/fetch/send command.
