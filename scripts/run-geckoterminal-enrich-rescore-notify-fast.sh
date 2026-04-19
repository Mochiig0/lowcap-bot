#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_FAST_INTERVAL_SECONDS:-60}"
LIMIT="${LOWCAP_GECKOTERMINAL_ENRICH_FAST_LIMIT:-3}"
SINCE_MINUTES="${LOWCAP_GECKOTERMINAL_ENRICH_FAST_SINCE_MINUTES:-15}"
START_DELAY_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_FAST_START_DELAY_SECONDS:-60}"
FAILURE_COOLDOWN_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_FAST_FAILURE_COOLDOWN_SECONDS:-120}"
VERBOSE_JSON="${LOWCAP_GECKOTERMINAL_ENRICH_FAST_VERBOSE_JSON:-0}"

cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to run the GeckoTerminal enrich-rescore-notify fast runner." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Error: set DATABASE_URL or create $REPO_ROOT/.env before starting the fast runner." >&2
  exit 1
fi

node ./scripts/check-prisma-token-table.mjs geckoterminal-enrich-rescore-notify-fast

if [[ "$START_DELAY_SECONDS" =~ ^[0-9]+$ ]] && (( START_DELAY_SECONDS > 0 )); then
  echo "[geckoterminal-enrich-rescore-notify-fast] start_delay_seconds=$START_DELAY_SECONDS" >&2
  sleep "$START_DELAY_SECONDS"
fi

while true; do
  cycle_json_file="$(mktemp)"
  rate_limited="false"

  echo "[geckoterminal-enrich-rescore-notify-fast] cycle_start=$(date -u +%Y-%m-%dT%H:%M:%SZ) limit=$LIMIT sinceMinutes=$SINCE_MINUTES pumpOnly=true" >&2

  if ! node --import tsx src/cli/tokenEnrichRescoreGeckoterminal.ts \
    --write \
    --notify \
    --pumpOnly \
    --limit "$LIMIT" \
    --sinceMinutes "$SINCE_MINUTES" \
    "$@" >"$cycle_json_file"; then
    if [[ "$VERBOSE_JSON" == "1" ]]; then
      cat "$cycle_json_file"
    fi
    echo "[geckoterminal-enrich-rescore-notify-fast] cycle_failed=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  else
    if [[ "$VERBOSE_JSON" == "1" ]]; then
      cat "$cycle_json_file"
    fi
    if ! rate_limited="$(
      node --input-type=module -e 'import { readFileSync } from "node:fs"; const raw = readFileSync(process.argv[1], "utf8"); const parsed = JSON.parse(raw); process.stdout.write(parsed?.summary?.rateLimited === true ? "true" : "false");' "$cycle_json_file"
    )"; then
      rate_limited="false"
      echo "[geckoterminal-enrich-rescore-notify-fast] cycle_parse_failed=$(date -u +%Y-%m-%dT%H:%M:%SZ) json_file=$cycle_json_file" >&2
    fi
    echo "[geckoterminal-enrich-rescore-notify-fast] cycle_ok=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi

  rm -f "$cycle_json_file"

  if [[ "$rate_limited" == "true" ]] && [[ "$FAILURE_COOLDOWN_SECONDS" =~ ^[0-9]+$ ]] && (( FAILURE_COOLDOWN_SECONDS > 0 )); then
    echo "[geckoterminal-enrich-rescore-notify-fast] rate_limited=true failure_cooldown_seconds=$FAILURE_COOLDOWN_SECONDS" >&2
    sleep "$FAILURE_COOLDOWN_SECONDS"
  fi

  sleep "$INTERVAL_SECONDS"
done
