#!/usr/bin/env bash
# `npm run bootstrap:stop` — stops ONLY the launchd jobs this bootstrap
# registered (com.aicommerceos.dev.frontend/backend/testwatch), via
# `launchctl bootout`. Never uses a broad command like `pkill node` /
# `killall node` / broad Docker shutdown, and never touches a process
# it does not own — an externally-owned service reusing the port is left
# completely alone (there is no launchd job for it to bootout).
#
# Also cleans up legacy PID files from the pre-launchd nohup model, if
# any are still lying around from before this revision — best-effort,
# not the primary mechanism.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./developer-bootstrap-config.sh
source "${SCRIPT_DIR}/developer-bootstrap-config.sh"

stop_launchd_service() {
  # $1 = label, $2 = human label
  local label="$1" human="$2"
  if ! launchd_loaded "${label}"; then
    bootstrap_log INFO "${human}: nothing to stop (no bootstrap-owned launchd job registered)"
    return 0
  fi
  bootstrap_log INFO "${human}: stopping launchd job '${label}'"
  launchd_stop "${label}"
  # `launchctl bootout` unregisters asynchronously — launchd_loaded can
  # briefly still report the job as loaded for a moment afterwards, so
  # poll a few times before treating that as a genuine problem.
  local still_loaded=true i=0
  for i in 1 2 3 4 5 6; do
    if ! launchd_loaded "${label}"; then
      still_loaded=false
      break
    fi
    sleep 0.5
  done
  if $still_loaded; then
    bootstrap_log WARN "${human}: job '${label}' still reports loaded after bootout — investigate manually with 'launchctl print ${LAUNCHD_DOMAIN}/${label}'"
  else
    bootstrap_log INFO "${human}: stopped"
  fi
}

stop_legacy_pid_file() {
  # $1 = pid file, $2 = human label. Best-effort cleanup only.
  local pid_file="$1" human="$2"
  if ! pid_alive "${pid_file}"; then
    [ -f "${pid_file}" ] && rm -f "${pid_file}"
    return 0
  fi
  local pid
  pid="$(cat "${pid_file}")"
  bootstrap_log INFO "${human}: found a legacy (pre-launchd) process, pid ${pid} — stopping it"
  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 "${pid}" >/dev/null 2>&1 || break
    sleep 0.5
  done
  rm -f "${pid_file}"
}

echo "=============================================================="
echo " AI Commerce OS — Developer Bootstrap stop"
echo "=============================================================="

stop_launchd_service "${FRONTEND_LABEL}" "frontend"
stop_launchd_service "${BACKEND_LABEL}" "backend"
stop_launchd_service "${TESTWATCH_LABEL}" "test watcher"

stop_legacy_pid_file "${FRONTEND_PID_FILE}" "frontend (legacy)"
stop_legacy_pid_file "${BACKEND_PID_FILE}" "backend (legacy)"
stop_legacy_pid_file "${TESTWATCH_PID_FILE}" "test watcher (legacy)"

rm -f "${SESSION_FILE}"

echo ""
echo "Note: a port still showing as occupied after this (check with"
echo "'npm run bootstrap:status') belongs to a process this bootstrap"
echo "does not own — e.g. one you started by hand outside launchd. This"
echo "script never stops a process it does not have a launchd job or"
echo "recorded PID for."
