#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS:-1800}"
MIN_GAP_MINUTES="${LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES:-10}"
LIMIT="${LOWCAP_GECKOTERMINAL_METRIC_LIMIT:-5}"
SINCE_MINUTES="${LOWCAP_GECKOTERMINAL_METRIC_SINCE_MINUTES:-120}"
SOURCE="${LOWCAP_GECKOTERMINAL_METRIC_SOURCE:-geckoterminal.token_snapshot}"
START_DELAY_SECONDS="${LOWCAP_GECKOTERMINAL_METRIC_START_DELAY_SECONDS:-900}"

cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is required to run the GeckoTerminal metric watch runner." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Error: set DATABASE_URL or create $REPO_ROOT/.env before starting the watch runner." >&2
  exit 1
fi

if [[ "$START_DELAY_SECONDS" =~ ^[0-9]+$ ]] && (( START_DELAY_SECONDS > 0 )); then
  echo "[geckoterminal-metric-watch] start_delay_seconds=$START_DELAY_SECONDS" >&2
  sleep "$START_DELAY_SECONDS"
fi

exec pnpm metric:snapshot:geckoterminal -- \
  --watch \
  --write \
  --intervalSeconds "$INTERVAL_SECONDS" \
  --minGapMinutes "$MIN_GAP_MINUTES" \
  --limit "$LIMIT" \
  --sinceMinutes "$SINCE_MINUTES" \
  --source "$SOURCE" \
  "$@"
