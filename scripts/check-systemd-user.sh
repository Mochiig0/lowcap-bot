#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_SCRIPT="$REPO_ROOT/scripts/run-detect-dexscreener-watch.sh"
UNIT_FILE="$REPO_ROOT/ops/systemd/lowcap-bot-dexscreener-watch.service"

pid1_comm="$(ps -p 1 -o comm= 2>/dev/null | tr -d '[:space:]' || true)"
has_systemctl=false
has_loginctl=false
systemctl_user_ready=false
loginctl_user_ready=false
has_tmux=false

if command -v systemctl >/dev/null 2>&1; then
  has_systemctl=true
  if systemctl --user show-environment >/dev/null 2>&1; then
    systemctl_user_ready=true
  fi
fi

if command -v loginctl >/dev/null 2>&1; then
  has_loginctl=true
  if loginctl show-user "${USER:-}" >/dev/null 2>&1; then
    loginctl_user_ready=true
  fi
fi

if command -v tmux >/dev/null 2>&1; then
  has_tmux=true
fi

if [[ "$systemctl_user_ready" == "true" ]]; then
  recommendation="systemd-user"
elif [[ "$has_tmux" == "true" ]]; then
  recommendation="tmux"
else
  recommendation="foreground"
fi

cat <<EOF
systemctlUserReady=$systemctl_user_ready
loginctlUserReady=$loginctl_user_ready
pid1=$pid1_comm
xdgRuntimeDir=${XDG_RUNTIME_DIR:-}
dbusSessionBusAddress=${DBUS_SESSION_BUS_ADDRESS:-}
recommendedMode=$recommendation
sampleUnit=$UNIT_FILE
runScript=$RUN_SCRIPT
tmuxCommand=tmux new -s lowcap-bot-watch 'cd $REPO_ROOT && bash ./scripts/run-detect-dexscreener-watch.sh'
foregroundCommand=bash $RUN_SCRIPT
EOF

case "$recommendation" in
  systemd-user)
    echo "systemd --user looks available. Install the sample unit and start it with systemctl --user." >&2
    ;;
  tmux)
    echo "systemd --user is not ready here. Use tmux with the run script instead." >&2
    ;;
  foreground)
    echo "systemd --user is not ready here and tmux is missing. Run the watch script in the foreground." >&2
    ;;
esac
