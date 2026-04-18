#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKPOINT_FILE="${LOWCAP_GECKOTERMINAL_DETECT_CHECKPOINT_FILE:-$REPO_ROOT/data/checkpoints/geckoterminal-new-pools.json}"
INTERVAL_SECONDS="${LOWCAP_GECKOTERMINAL_DETECT_INTERVAL_SECONDS:-60}"

cd "$REPO_ROOT"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Error: pnpm is required to run the GeckoTerminal detect watch runner." >&2
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]] && [[ ! -f "$REPO_ROOT/.env" ]]; then
  echo "Error: set DATABASE_URL or create $REPO_ROOT/.env before starting the watch runner." >&2
  exit 1
fi

exec pnpm detect:geckoterminal:new-pools -- \
  --watch \
  --write \
  --intervalSeconds "$INTERVAL_SECONDS" \
  --checkpointFile "$CHECKPOINT_FILE" \
  "$@"
