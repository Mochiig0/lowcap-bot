#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS:-300}"
LIMIT="${LOWCAP_GECKOTERMINAL_ENRICH_LIMIT:-5}"
SINCE_MINUTES="${LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES:-60}"
START_DELAY_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS:-180}"
FAILURE_COOLDOWN_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_FAILURE_COOLDOWN_SECONDS:-300}"

cd "$REPO_ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is required to run the GeckoTerminal enrich-rescore-notify runner." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Error: set DATABASE_URL or create $REPO_ROOT/.env before starting the runner." >&2
  exit 1
fi

if [[ "$START_DELAY_SECONDS" =~ ^[0-9]+$ ]] && (( START_DELAY_SECONDS > 0 )); then
  echo "[geckoterminal-enrich-rescore-notify] start_delay_seconds=$START_DELAY_SECONDS" >&2
  sleep "$START_DELAY_SECONDS"
fi

while true; do
  cycle_json_file="$(mktemp)"
  rate_limited="false"

  echo "[geckoterminal-enrich-rescore-notify] cycle_start=$(date -u +%Y-%m-%dT%H:%M:%SZ) limit=$LIMIT sinceMinutes=$SINCE_MINUTES" >&2

  if ! node --import tsx src/cli/tokenEnrichRescoreGeckoterminal.ts \
    --write \
    --notify \
    --limit "$LIMIT" \
    --sinceMinutes "$SINCE_MINUTES" \
    "$@" >"$cycle_json_file"; then
    cat "$cycle_json_file"
    echo "[geckoterminal-enrich-rescore-notify] cycle_failed=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  else
    cat "$cycle_json_file"
    if ! rate_limited="$(
      node --input-type=module -e 'import { readFileSync } from "node:fs"; const raw = readFileSync(process.argv[1], "utf8"); const parsed = JSON.parse(raw); process.stdout.write(parsed?.summary?.rateLimited === true ? "true" : "false");' "$cycle_json_file"
    )"; then
      rate_limited="false"
      echo "[geckoterminal-enrich-rescore-notify] cycle_parse_failed=$(date -u +%Y-%m-%dT%H:%M:%SZ) json_file=$cycle_json_file" >&2
    fi
    echo "[geckoterminal-enrich-rescore-notify] cycle_ok=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi

  rm -f "$cycle_json_file"

  if [[ "$rate_limited" == "true" ]] && [[ "$FAILURE_COOLDOWN_SECONDS" =~ ^[0-9]+$ ]] && (( FAILURE_COOLDOWN_SECONDS > 0 )); then
    echo "[geckoterminal-enrich-rescore-notify] rate_limited=true failure_cooldown_seconds=$FAILURE_COOLDOWN_SECONDS" >&2
    sleep "$FAILURE_COOLDOWN_SECONDS"
  fi

  sleep "$INTERVAL_SECONDS"
done
