#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INTERVAL_SECONDS="${LOWCAP_GECKOTERMINAL_METRIC_INTERVAL_SECONDS:-300}"
MIN_GAP_MINUTES="${LOWCAP_GECKOTERMINAL_METRIC_MIN_GAP_MINUTES:-10}"
LIMIT="${LOWCAP_GECKOTERMINAL_METRIC_LIMIT:-20}"
SINCE_MINUTES="${LOWCAP_GECKOTERMINAL_METRIC_SINCE_MINUTES:-180}"
SOURCE="${LOWCAP_GECKOTERMINAL_METRIC_SOURCE:-geckoterminal.token_snapshot}"

cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is required to run the GeckoTerminal metric watch runner." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Error: set DATABASE_URL or create $REPO_ROOT/.env before starting the watch runner." >&2
  exit 1
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
