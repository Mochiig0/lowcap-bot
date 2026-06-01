---
name: lowcap-red-execution-safety
description: Use when running or reviewing a human-approved lowcap-bot Red operation that may write production DB state, fetch providers, write checkpoints, or send Telegram. Enforces exact-command execution, approval, side-effect boundaries, stop conditions, and post-run reporting.
---

# Lowcap Red Execution Safety

## Purpose

Protect Red execution in lowcap-bot.
Enforce exact-command, approval, side-effect boundaries, and post-run reporting.

## Use this skill when

- Running any command that may write production DB state
- Running external fetch plus write workflows
- Running detect watch/write
- Running metric snapshot `--write`
- Running token enrich/rescore `--write`
- Running `ops:run:bounded --execute`
- Running notification live send, auto-send execute, or retry execution

## Do not use this skill when

- Green read-only preflight
- Docs-only changes
- Yellow implementation without production write/fetch
- Plan-only commands
- Explanation-only tasks

## Mandatory Red rules

- Human approval is required.
- For Red-prone GeckoTerminal CLIs in Codex, prefer the repo safe scripts that
  execute through `node --import tsx`: `metric:snapshot:geckoterminal:safe`,
  `token:enrich-rescore:geckoterminal:safe`, and
  `detect:geckoterminal:new-pools:safe`.
- Do not use the older direct `tsx` package scripts for new Codex Red command
  patterns unless the user explicitly approves that exact form.
- Run the exact command one time only.
- Do not retry unless separately approved.
- Do not run a second command.
- Do not change options.
- Do not manually backfill or compensate with another write command.
- Do not run `pnpm smoke`.
- Do not run `git pull`, `git fetch`, `git rebase`, `git reset`, or `git checkout`.
- Do not dump full `rawJson`.
- Do not dump offensive raw text.
- Do not print secrets or environment values.
- Do not run scheduler/systemd unless explicitly unlocked.

## Pre-run checklist

- Working tree is clean.
- `HEAD` is expected.
- DB counts are captured.
- Failed Notification count is `0`.
- Retry candidate count is `0`.
- Enabled auto-send allowed candidate count is `0`.
- Expected side effects and non-effects are written.
- Stop conditions are written.
- Checkpoint path is safe if relevant.
- Exact command is fixed.
- If a command uses a package script, confirm whether it is a safe
  `node --import tsx` script or an older direct `tsx` script before execution.

## Stop immediately if

- Working tree is dirty.
- `HEAD` is unexpected.
- Failed Notification count is greater than `0`.
- Retry candidate count is greater than `0`.
- Enabled auto-send allowed candidate count is greater than `0`.
- Command target is ambiguous.
- Telegram or Notification side effect is unexpected.
- Checkpoint path is unsafe.
- Full `rawJson`, secrets, or offensive raw text would be needed.
- Schema or migration work becomes unexpectedly needed.
- Exact command cannot be fixed.

## During execution

- Run the exact command once.
- Do not modify options.
- Do not rerun.
- Do not run a second Red.
- Do not manually compensate with another write command.
- On HTTP 429, provider error, CLI failure, or runner failure, stop and summarize.
- Keep Telegram and notification execution separate unless specifically approved.

## Post-run checklist

- Command summary.
- DB before/after.
- Token / Metric / Notification / HolderSnapshot deltas.
- Notification statuses.
- Retry and auto-send planner results.
- Queue / planner after.
- Checkpoint summary if relevant.
- Representative safe summaries only.
- No full `rawJson` dump.
- Docs update / commit / push when requested.

## Required report sections

- Summary
- Repo
- Execution
- DB State
- Target Result
- Queue / Planner After
- Side Effects
- Validation
- Not Executed
- Next Candidate

## Side effect vocabulary

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

## Relationship to runbooks

This skill is the short execution guard for Red tasks. Detailed history and
policies remain in `docs/runbooks`. Existing CLI, planner, runner, and DB state
remain the source of truth for actual behavior and current state. Explicit user
instructions and repo `AGENTS.md` take precedence.
