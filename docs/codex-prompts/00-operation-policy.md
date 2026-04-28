# Codex Operation Policy

This prompt policy is for lowcap-bot CodexCLI sessions. It keeps small safe work moving while forcing explicit stops before operational side effects.

## Risk Classes

### Green

Green work is low-risk and may be completed autonomously through implementation, focused verification, commit, and push.

Examples:

- docs, README, or runbook changes
- typo fixes
- usage text fixes
- test expectation fixes
- mock or fixture test additions
- small parser fixes
- small output display adjustments
- changes that do not involve DB write, live fetch plus write, Telegram, Metric append, token CLI write, or ops write

Allowed autonomous scope:

- inspect the repo
- edit the requested files
- run targeted tests when relevant
- run `pnpm exec tsc --noEmit` when code changed
- run `git diff --check`
- commit
- push

### Yellow

Yellow work may touch production code, but must stay bounded and avoid operational side effects. It may be completed autonomously through implementation, focused verification, commit, and push when the scope stays as requested.

Examples:

- small to medium production code fixes
- parser, validator, or output shape fixes
- runner result mapper fixes
- `postCheckResult` or `recoveryHints` maintenance
- detector safety gate additions
- mock, fixture, or injected runner test additions

Rules:

- do not perform DB write
- do not combine live fetch with write
- do not send Telegram
- do not run Metric append
- stop if the change expands beyond the requested boundary

### Red

Red work can affect real data, external services, or operational infrastructure. Default behavior is read-only investigation and plan/report preparation only.

Red examples:

- DB write
- live fetch plus write
- `ops:catchup:gecko --write`
- `detect:geckoterminal:new-pools --write`
- `token:enrich-rescore:geckoterminal --write`
- `import:mint`
- Metric append
- Telegram real send
- Prisma schema or migration changes
- DB data deletion
- scheduler, watch, or systemd setup
- queue, worker, daemon, or always-on behavior
- force push
- work that may expose secrets, raw stdout, raw stderr, parsed output, env, cwd, or full args

Red stop rule:

- do not execute the side effect until the user explicitly permits that exact side effect for the current turn
- when permission is partial, execute only the permitted command shape
- prefer a read-only preflight and a clear next-step recommendation

## Common Prohibitions

Unless the user explicitly allows it for the current turn, do not:

- force push
- display `.env` or secret values
- put raw stdout, raw stderr, `parsedOutput`, env, cwd, or full args in user-facing output
- run `pnpm smoke`
- run `pnpm test`
- perform DB write
- combine live fetch with write
- send Telegram
- run a Metric append CLI
- configure or start scheduler, watch, or systemd flows
- run dangerous production runner or child process behavior
- perform multi-row write
- perform multi-cycle write

## Subagent Use

Use subagents only when the user explicitly asks for subagents, delegation, or parallel agent work.

When subagents are explicitly allowed:

- assign one concrete bounded task per subagent
- avoid overlapping write ownership
- tell coding subagents that they are not alone in the codebase and must not revert unrelated edits
- keep urgent blocking work local
- review subagent changes before integrating

Do not use subagents merely because a task is large, detailed, or needs research.

## Reporting Format

Use this report structure unless the user asks for another format:

1. Conclusion
2. What Was Confirmed In The Repo
3. Changed Files
4. Work Performed
5. Verification Commands
6. Commit Proposal
7. Whether To Update The Phase Progress Meter Or Keep It Unchanged

For Red work, include:

- what was intentionally not executed
- whether DB state changed
- whether live fetch happened
- whether the next write step is safe to run
