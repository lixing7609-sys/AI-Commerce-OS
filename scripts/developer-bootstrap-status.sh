#!/usr/bin/env bash
# `npm run bootstrap:status` — safe, read-only report of what the
# Developer Bootstrap currently knows about. Works whether or not
# anything is running (must never error out just because nothing has
# been started yet). Reports real ownership (bootstrap-owned via
# launchd vs externally-owned vs none) and real health (an HTTP probe,
# not just "a port is listening") for every service.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./developer-bootstrap-config.sh
source "${SCRIPT_DIR}/developer-bootstrap-config.sh"

echo "=============================================================="
echo " AI Commerce OS — Developer Bootstrap status"
echo "=============================================================="

CURRENT_BRANCH="$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo unknown)"
GIT_STATUS_SHORT="$(git -C "${REPO_ROOT}" status --short 2>/dev/null || true)"

echo "Repository:        ${REPO_ROOT}"
echo "Branch:             ${CURRENT_BRANCH}"
if [ -n "${GIT_STATUS_SHORT}" ]; then
  echo "Working tree:       dirty"
else
  echo "Working tree:       clean"
fi

FRONTEND_STATE="$(service_state "${FRONTEND_LABEL}" "${FRONTEND_PORT}" "${CLOUD_URL}")"
FRONTEND_OWNERSHIP="$(ownership_for_state "${FRONTEND_STATE}")"
echo ""
echo "Frontend:            ${FRONTEND_STATE}"
echo "Frontend ownership:  ${FRONTEND_OWNERSHIP}"
if [ "${FRONTEND_STATE}" = "RUNNING" ] || [ "${FRONTEND_STATE}" = "UNHEALTHY" ] || [ "${FRONTEND_STATE}" = "STARTING" ]; then
  echo "Frontend health:     $([ "${FRONTEND_STATE}" = "RUNNING" ] && echo healthy || echo "not yet healthy")  (pid $(launchd_pid "${FRONTEND_LABEL}"))"
elif [ "${FRONTEND_STATE}" = "EXTERNAL" ]; then
  echo "Frontend health:     unknown (not bootstrap-owned, no probe performed beyond port)"
else
  echo "Frontend health:     n/a"
fi

BACKEND_STATE="$(service_state "${BACKEND_LABEL}" "${BACKEND_PORT}" "http://localhost:${BACKEND_PORT}/docs")"
BACKEND_OWNERSHIP="$(ownership_for_state "${BACKEND_STATE}")"
echo ""
echo "Backend:             ${BACKEND_STATE}"
echo "Backend ownership:   ${BACKEND_OWNERSHIP}"
if [ "${BACKEND_STATE}" = "RUNNING" ] || [ "${BACKEND_STATE}" = "UNHEALTHY" ] || [ "${BACKEND_STATE}" = "STARTING" ]; then
  echo "Backend health:      $([ "${BACKEND_STATE}" = "RUNNING" ] && echo healthy || echo "not yet healthy")  (pid $(launchd_pid "${BACKEND_LABEL}"))"
elif [ "${BACKEND_STATE}" = "EXTERNAL" ]; then
  echo "Backend health:      unknown (not bootstrap-owned, no probe performed beyond port)"
elif [ "${BACKEND_STATE}" = "STOPPED" ]; then
  if tcp_reachable "${POSTGRES_HOST}" "${POSTGRES_PORT}"; then
    echo "Backend health:      n/a — postgres (${POSTGRES_HOST}:${POSTGRES_PORT}) reachable, backend can be started"
  else
    echo "Backend health:      n/a — postgres (${POSTGRES_HOST}:${POSTGRES_PORT}) NOT reachable, this is why the backend is not running"
  fi
else
  echo "Backend health:      n/a"
fi

echo ""
if launchd_loaded "${TESTWATCH_LABEL}" && [ -n "$(launchd_pid "${TESTWATCH_LABEL}")" ]; then
  echo "Test watcher:        RUNNING (pid $(launchd_pid "${TESTWATCH_LABEL}"))"
elif launchd_loaded "${TESTWATCH_LABEL}"; then
  echo "Test watcher:        STALE (job loaded, no live process)"
else
  echo "Test watcher:        STOPPED"
fi

echo ""
echo "Port 5173:           $(port_listening "${FRONTEND_PORT}" && echo occupied || echo free)"
echo "Port 8000:            $(port_listening "${BACKEND_PORT}" && echo occupied || echo free)"

echo ""
echo "Runtime directory:  ${RUNTIME_DIR}"
echo "Log files:"
for f in "${FRONTEND_LOG}" "${BACKEND_LOG}" "${TESTWATCH_LOG}"; do
  if [ -f "$f" ]; then
    echo "  $f ($(wc -l < "$f" | tr -d ' ') lines)"
  else
    echo "  $f (not created yet)"
  fi
done

echo ""
echo "Cloud URL:          ${CLOUD_URL}"
echo "Operator URL:       ${OPERATOR_URL}"
echo "Founder URL:        ${FOUNDER_URL}"
