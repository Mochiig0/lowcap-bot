# AGENTS.md

## Current Repo State

This repo is a CLI-first, mint-driven accumulation MVP. It now includes narrow, source-specific semi-automation for DexScreener and GeckoTerminal through one-shot or simple watch-style runners plus bounded GeckoTerminal follow-up batches. It is still not a generic bot platform and does not include queue / worker / scheduler orchestration or a generic multi-source adapter runtime.

## Roadmap Reference

- The formal phased implementation roadmap lives in `docs/implementation-roadmap.md`.
- `docs/roadmap.md` remains the narrower near-term operating roadmap.

## Three Lanes

1. Full import lane
   - `pnpm import`
   - `pnpm import:min`
   - `pnpm import:file`
   - owns curated full import, hard reject, scoring, `Token` / `Dev` persistence, optional `Metric` creation, and selective Telegram notify
2. Mint-driven accumulation lane
   - `pnpm import:mint`
   - `pnpm import:mint:file`
   - `pnpm import:mint:source-file`
   - `pnpm detect:dexscreener:token-profiles`
   - `pnpm detect:geckoterminal:new-pools`
   - `pnpm token:enrich`
   - `pnpm token:rescore`
   - `pnpm token:enrich-rescore:geckoterminal`
   - `pnpm metric:add`
   - `pnpm metric:snapshot:geckoterminal`
   - owns mint-only token base creation, thin source-specific handoff/detect, then later enrich / rescore / metric append
3. Read-only lane
   - `pnpm compare:geckoterminal:dexscreener`
   - `pnpm ops:summary:geckoterminal`
   - `pnpm token:compare`
   - `pnpm tokens:compare-report`
   - `pnpm metrics:report`
   - `pnpm token:show`
   - `pnpm metric:show`
   - `pnpm tokens:report`
   - must stay side-effect free

## Fixed Boundaries

- Do not move scoring, notify, enrich, rescore, or metric create into the mint-only ingest layer.
- Keep Telegram notify on the full `pnpm import` path, except for the already-bounded `pnpm token:enrich-rescore:geckoterminal --write --notify` path.
- Keep `import:mint:file` as the minimal handoff payload wrapper only: `{ "items": [{ "mint": "...", "source"?: "..." }] }`.
- Keep source-specific parse and mapping inside source adapters such as `import:mint:source-file`.
- Keep read-only comparison / report flows separate from ingest-side mutation.

## Anti-Patterns

- Do not broaden `import:mint:file` to accept raw source events.
- Do not turn `import:mint:source-file` into a generic or multi-source adapter runtime.
- Do not mix detector, queue, worker, scheduler, retry, resume, or parallel-ingest concerns into current mint-only entrypoints.
- Do not route full-import responsibilities into mint-only entrypoints.
- Do not add schema fields early just to support temporary detector, review, or alert ideas.

## Read-Only Pause Point

- Treat `tokens:report`, `token:show`, `metrics:report`, and `metric:show` as sufficient lightweight inspection views for now.
- Treat `tokens:compare-report` and `token:compare` as sufficient compare views for now.
- Treat `compare:geckoterminal:dexscreener` and `ops:summary:geckoterminal` as sufficient Gecko-specific read-only helpers for now.
- Do not turn `token:show` into `token:compare`.
- Do not turn `tokens:report` into `tokens:compare-report`.
- Do not keep adding token-deep context to `metric:show` unless a clear operating bottleneck appears.

## Source-Adapter Rules

- Add source adapters one source at a time, with one source-specific raw event shape per adapter.
- Keep source adapters thinner than the full `pnpm import` path and delegate DB writes into `pnpm import:mint`.
- Do not add scoring, notify, enrich, rescore, or metric creation behavior to source adapters.
- Do not add pre-dedupe, parallel ingest, queueing, or worker-style runtime behavior before a clear operational need exists.

## Second Adapter Admission Criteria

Add a second source adapter only when:

- a different raw event shape actually exists
- there is repeated manual need to ingest that shape directly
- it can produce a stable mint-first signal
- `{ mint, source? }` is still enough after normalization
- it stays a thin one-source / one-shape wrapper over `pnpm import:mint`
- the request does not really belong in full import, detector runtime, queue/worker orchestration, or read-only review/report flows

Do not add a second source adapter when the request is really about genericization, multi-source runtime, detector loop behavior, queue/worker behavior, retry/resume orchestration, or richer full-import behavior.

## Standard Verification

- Always run `pnpm exec tsc --noEmit` after code changes unless the user explicitly limits verification.
- Run `pnpm smoke` when a change touches CLI behavior, wrapper behavior, or operational docs that depend on current CLI behavior.

## Docs Sync Rule

If current behavior changes, sync only the minimum necessary docs among:

- `README.md`
- `hand-off-prompt.txt`
- `docs/current-status.md`
- `docs/architecture.md`
- `docs/roadmap.md`

Prefer fixing the closest source of truth instead of rewriting multiple docs.

## Reporting Format

Use this report structure unless the user asks otherwise:

1. 結論
2. 現物確認で分かったこと
3. 変更ファイル
4. 実施内容
5. 検証コマンド
6. コミット提案
7. Phase 進捗メーターを更新すべきか / 据え置きか
