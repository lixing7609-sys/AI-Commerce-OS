#!/usr/bin/env bash
# `npm run bootstrap:stop` — stops ONLY the processes this bootstrap
# started itself, identified by the PID files it wrote. Never uses a
# broad command like `pkill node` / `killall node` / broad Docker
# shutdown, and never touches a process whose PID file is missing or
# whose PID no longer matches a live process (that means it either was
# never bootstrap-owned, or already exited).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./developer-bootstrap-config.sh
source "${SCRIPT_DIR}/developer-bootstrap-config.sh"

stop_by_pid_file() {
  # $1 = pid file, $2 = human label
  local pid_file="$1" label="$2"
  if ! pid_alive "${pid_file}"; then
    bootstrap_log INFO "${label}: nothing to stop (no live bootstrap-owned process on record)"
    [ -f "${pid_file}" ] && rm -f "${pid_file}"
    return 0
  fi
  local pid
  pid="$(cat "${pid_file}")"
  bootstrap_log INFO "${label}: stopping pid ${pid}"
  kill "${pid}" 2>/dev/null || true
  for _ in $(seq 1 10); do
    kill -0 "${pid}" >/dev/null 2>&1 || break
    sleep 0.5
  done
  if kill -0 "${pid}" >/dev/null 2>&1; then
    bootstrap_log WARN "${label}: pid ${pid} did not exit after SIGTERM — leaving it running rather than force-killing. Investigate manually if needed."
  else
    bootstrap_log INFO "${label}: stopped"
    rm -f "${pid_file}"
  fi
}

echo "=============================================================="
echo " AI Commerce OS — Developer Bootstrap stop"
echo "=============================================================="

stop_by_pid_file "${FRONTEND_PID_FILE}" "frontend"
stop_by_pid_file "${BACKEND_PID_FILE}" "backend"
stop_by_pid_file "${TESTWATCH_PID_FILE}" "test watcher"

rm -f "${SESSION_FILE}"

echo ""
echo "Note: ports still showing a listener above (if any) belong to a"
echo "process this bootstrap did not start (e.g. one you launched by hand,"
echo "or a leftover from before you ran 'npm run bootstrap'). This script"
echo "never stops processes it does not have a recorded PID for."
