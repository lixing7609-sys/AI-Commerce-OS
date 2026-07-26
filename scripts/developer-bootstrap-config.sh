#!/usr/bin/env bash
# Shared configuration for the Developer Bootstrap scripts. Sourced by
# developer-bootstrap.sh / -status.sh / -stop.sh — do not duplicate these
# values in any of them.
#
# Never `exec` or run standalone; must be sourced with REPO_ROOT already
# derivable from this file's own location, so bootstrap works regardless
# of the caller's current working directory.

set -euo pipefail

# --- Repository root -------------------------------------------------
# Derived from this file's location (scripts/ is always one level under
# the repo root), not hard-coded to any specific home directory, so the
# bootstrap works for any checkout location — including paths with
# spaces (quoted throughout).
BOOTSTRAP_CONFIG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${BOOTSTRAP_CONFIG_DIR}/.." && pwd)"

FRONTEND_DIR="${REPO_ROOT}/frontend"
BACKEND_DIR="${REPO_ROOT}/backend"

# --- Ports / hosts -----------------------------------------------------
FRONTEND_PORT=5173
BACKEND_PORT=8000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# --- URLs opened after frontend readiness -----------------------------
CLOUD_URL="http://localhost:${FRONTEND_PORT}/"
OPERATOR_URL="http://localhost:${FRONTEND_PORT}/?mode=operator-preview"
FOUNDER_URL="http://localhost:${FRONTEND_PORT}/?mode=founder&module=secretary"

# --- Runtime state (gitignored, never committed) ------------------------
RUNTIME_DIR="${REPO_ROOT}/.runtime/dev-bootstrap"
LOG_DIR="${RUNTIME_DIR}/logs"
FRONTEND_PID_FILE="${RUNTIME_DIR}/frontend.pid"
BACKEND_PID_FILE="${RUNTIME_DIR}/backend.pid"
TESTWATCH_PID_FILE="${RUNTIME_DIR}/testwatch.pid"
SESSION_FILE="${RUNTIME_DIR}/session.json"
FRONTEND_LOG="${LOG_DIR}/frontend.log"
BACKEND_LOG="${LOG_DIR}/backend.log"
TESTWATCH_LOG="${LOG_DIR}/testwatch.log"

# --- Timeouts ------------------------------------------------------------
READY_TIMEOUT_SECONDS=45
PORT_CHECK_TIMEOUT_SECONDS=2

# --- Claude Code executable ------------------------------------------
CLAUDE_CMD="$(command -v claude || true)"

bootstrap_log() {
  # $1 = level (INFO/WARN/ERROR), rest = message
  local level="$1"; shift
  printf '[bootstrap] %s: %s\n' "$level" "$*"
}

ensure_runtime_dir() {
  mkdir -p "${LOG_DIR}"
}

port_listening() {
  # $1 = port. Returns 0 (true) if something is listening on it.
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

tcp_reachable() {
  # $1 = host, $2 = port. Returns 0 if a TCP connect succeeds within
  # PORT_CHECK_TIMEOUT_SECONDS.
  local host="$1" port="$2"
  nc -z -G "${PORT_CHECK_TIMEOUT_SECONDS}" "${host}" "${port}" >/dev/null 2>&1
}

pid_alive() {
  # $1 = pid file. Returns 0 if the file exists and the PID is running.
  local pid_file="$1"
  [ -f "${pid_file}" ] || return 1
  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  [ -n "${pid}" ] || return 1
  kill -0 "${pid}" >/dev/null 2>&1
}
