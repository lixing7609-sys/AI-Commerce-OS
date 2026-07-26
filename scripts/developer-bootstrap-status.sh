#!/usr/bin/env bash
# `npm run bootstrap:status` — safe, read-only report of what the
# Developer Bootstrap currently knows about. Works whether or not
# anything is running (must never error out just because nothing has
# been started yet).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./developer-bootstrap-config.sh
source "${SCRIPT_DIR}/developer-bootstrap-config.sh"

echo "=============================================================="
echo " AI Commerce OS — Developer Bootstrap status"
echo "=============================================================="
echo "repository path: ${REPO_ROOT}"
echo "runtime directory: ${RUNTIME_DIR}"
echo ""

CURRENT_BRANCH="$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo unknown)"
echo "branch: ${CURRENT_BRANCH}"
GIT_STATUS_SHORT="$(git -C "${REPO_ROOT}" status --short 2>/dev/null || true)"
if [ -n "${GIT_STATUS_SHORT}" ]; then
  echo "working tree: dirty"
else
  echo "working tree: clean"
fi

echo ""
echo "-- frontend (:${FRONTEND_PORT}) ----------------------------------"
if port_listening "${FRONTEND_PORT}"; then
  echo "  status: running"
  if pid_alive "${FRONTEND_PID_FILE}"; then
    echo "  bootstrap-owned pid: $(cat "${FRONTEND_PID_FILE}")"
  else
    echo "  bootstrap-owned pid: none on record (started outside bootstrap, or pid file missing)"
  fi
else
  echo "  status: not running"
fi

echo ""
echo "-- backend (:${BACKEND_PORT}) -------------------------------------"
if port_listening "${BACKEND_PORT}"; then
  echo "  status: running"
  if pid_alive "${BACKEND_PID_FILE}"; then
    echo "  bootstrap-owned pid: $(cat "${BACKEND_PID_FILE}")"
  else
    echo "  bootstrap-owned pid: none on record (started outside bootstrap, or pid file missing)"
  fi
else
  echo "  status: not running"
  if tcp_reachable "${POSTGRES_HOST}" "${POSTGRES_PORT}"; then
    echo "  postgres (${POSTGRES_HOST}:${POSTGRES_PORT}): reachable — backend can be started"
  else
    echo "  postgres (${POSTGRES_HOST}:${POSTGRES_PORT}): NOT reachable — this is why the backend is not running"
  fi
fi

echo ""
echo "-- test watcher ---------------------------------------------------"
if pid_alive "${TESTWATCH_PID_FILE}"; then
  echo "  status: running (pid $(cat "${TESTWATCH_PID_FILE}"))"
else
  echo "  status: not running"
fi

echo ""
echo "-- URLs -------------------------------------------------------------"
echo "  Cloud:    ${CLOUD_URL}"
echo "  Operator: ${OPERATOR_URL}"
echo "  Founder:  ${FOUNDER_URL}"

echo ""
echo "-- logs -------------------------------------------------------------"
for f in "${FRONTEND_LOG}" "${BACKEND_LOG}" "${TESTWATCH_LOG}"; do
  if [ -f "$f" ]; then
    echo "  $f ($(wc -l < "$f" | tr -d ' ') lines)"
  else
    echo "  $f (not created yet)"
  fi
done
