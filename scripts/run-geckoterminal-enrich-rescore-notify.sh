#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_INTERVAL_SECONDS:-900}"
LIMIT="${LOWCAP_GECKOTERMINAL_ENRICH_LIMIT:-10}"
SINCE_MINUTES="${LOWCAP_GECKOTERMINAL_ENRICH_SINCE_MINUTES:-120}"
START_DELAY_SECONDS="${LOWCAP_GECKOTERMINAL_ENRICH_START_DELAY_SECONDS:-420}"

cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is required to run the GeckoTerminal enrich-rescore-notify runner." >&2
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
  echo "[geckoterminal-enrich-rescore-notify] cycle_start=$(date -u +%Y-%m-%dT%H:%M:%SZ) limit=$LIMIT sinceMinutes=$SINCE_MINUTES" >&2

  if ! pnpm token:enrich-rescore:geckoterminal -- \
    --write \
    --notify \
    --limit "$LIMIT" \
    --sinceMinutes "$SINCE_MINUTES" \
    "$@"; then
    echo "[geckoterminal-enrich-rescore-notify] cycle_failed=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  else
    echo "[geckoterminal-enrich-rescore-notify] cycle_ok=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi

  sleep "$INTERVAL_SECONDS"
done
