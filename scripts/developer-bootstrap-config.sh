#!/usr/bin/env bash
# Shared configuration for the Developer Bootstrap scripts. Sourced by
# developer-bootstrap.sh / -status.sh / -stop.sh / -restart.sh — do not
# duplicate these values in any of them.
#
# Never `exec` or run standalone; must be sourced with REPO_ROOT already
# derivable from this file's own location, so bootstrap works regardless
# of the caller's current working directory.
#
# Process persistence model (revised after a real failure): services
# started as plain `nohup ... &` background jobs from a Bash tool call
# do NOT reliably survive independent of whoever spawned them in every
# environment — confirmed by a real reproduction where the frontend and
# backend died between sessions despite nohup/disown. launchd is the
# correct macOS-native mechanism for a process that must survive
# regardless of which shell, Terminal window, or Claude Code session
# started it: once `launchctl bootstrap` registers a user LaunchAgent,
# macOS's own init system supervises it — including automatic restart on
# crash (KeepAlive) — independent of the caller. This is a per-user GUI
# session agent (gui/$UID), not a system daemon: no sudo, no
# privileged/global installation, and `launchctl bootout` cleanly and
# fully reverses it.

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
LAUNCHD_DIR="${RUNTIME_DIR}/launchd"
SESSION_FILE="${RUNTIME_DIR}/session.json"
FRONTEND_LOG="${LOG_DIR}/frontend.log"
BACKEND_LOG="${LOG_DIR}/backend.log"
TESTWATCH_LOG="${LOG_DIR}/testwatch.log"
LAUNCHER_LOG="${LOG_DIR}/launcher.log"

# Legacy PID files from the pre-launchd nohup model. Only used as a
# best-effort fallback so a bootstrap started before this revision can
# still be recognized and cleanly stopped once — never the primary
# mechanism going forward.
FRONTEND_PID_FILE="${RUNTIME_DIR}/frontend.pid"
BACKEND_PID_FILE="${RUNTIME_DIR}/backend.pid"
TESTWATCH_PID_FILE="${RUNTIME_DIR}/testwatch.pid"

# --- launchd (real process persistence, survives this Bash session) -----
LAUNCHD_UID="$(id -u)"
LAUNCHD_DOMAIN="gui/${LAUNCHD_UID}"
FRONTEND_LABEL="com.aicommerceos.dev.frontend"
BACKEND_LABEL="com.aicommerceos.dev.backend"
TESTWATCH_LABEL="com.aicommerceos.dev.testwatch"
FRONTEND_PLIST="${LAUNCHD_DIR}/${FRONTEND_LABEL}.plist"
BACKEND_PLIST="${LAUNCHD_DIR}/${BACKEND_LABEL}.plist"
TESTWATCH_PLIST="${LAUNCHD_DIR}/${TESTWATCH_LABEL}.plist"

# --- Timeouts ------------------------------------------------------------
READY_TIMEOUT_SECONDS=45
PORT_CHECK_TIMEOUT_SECONDS=2
HEALTH_TIMEOUT_SECONDS=2

# --- Claude Code executable ------------------------------------------
CLAUDE_CMD="$(command -v claude || true)"

bootstrap_log() {
  # $1 = level (INFO/WARN/ERROR), rest = message
  local level="$1"; shift
  printf '[bootstrap] %s: %s\n' "$level" "$*"
}

ensure_runtime_dir() {
  mkdir -p "${LOG_DIR}" "${LAUNCHD_DIR}"
}

port_listening() {
  # $1 = port. Returns 0 (true) if something is listening on it. This
  # alone is NOT proof of a healthy service — see http_healthy — a
  # process can bind a port while still starting up, or while hung.
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

tcp_reachable() {
  # $1 = host, $2 = port. Returns 0 if a TCP connect succeeds within
  # PORT_CHECK_TIMEOUT_SECONDS.
  local host="$1" port="$2"
  nc -z -G "${PORT_CHECK_TIMEOUT_SECONDS}" "${host}" "${port}" >/dev/null 2>&1
}

http_healthy() {
  # $1 = URL. Returns 0 only if the endpoint actually answers HTTP
  # within HEALTH_TIMEOUT_SECONDS — the real readiness/health probe,
  # distinct from "something is listening on the port."
  local url="$1"
  curl -s -o /dev/null -m "${HEALTH_TIMEOUT_SECONDS}" "${url}"
}

pid_alive() {
  # $1 = pid file. Returns 0 if the file exists and the PID is running.
  # Legacy nohup-model fallback only.
  local pid_file="$1"
  [ -f "${pid_file}" ] || return 1
  local pid
  pid="$(cat "${pid_file}" 2>/dev/null || true)"
  [ -n "${pid}" ] || return 1
  kill -0 "${pid}" >/dev/null 2>&1
}

# ---------------------------------------------------------------------
# launchd helpers
# ---------------------------------------------------------------------

launchd_loaded() {
  # $1 = label. Returns 0 if a job with this label is currently
  # registered with launchd (loaded), regardless of whether its process
  # is running right now (a crashed KeepAlive job stays "loaded" while
  # launchd is between restart attempts).
  local label="$1"
  launchctl print "${LAUNCHD_DOMAIN}/${label}" >/dev/null 2>&1
}

launchd_pid() {
  # $1 = label. Prints the running PID if the job is loaded and
  # currently has a live process; prints nothing otherwise.
  local label="$1"
  launchctl print "${LAUNCHD_DOMAIN}/${label}" 2>/dev/null \
    | awk -F'= ' '/^[[:space:]]*pid = /{print $2; exit}'
}

launchd_last_exit_status() {
  # $1 = label. Prints the last recorded exit code, if any.
  local label="$1"
  launchctl print "${LAUNCHD_DOMAIN}/${label}" 2>/dev/null \
    | awk -F'= ' '/last exit code = /{print $2; exit}'
}

# $1 = label, $2 = port, $3 = health URL (optional, empty to skip).
# Prints exactly one of: RUNNING STARTING UNHEALTHY STALE EXTERNAL STOPPED
service_state() {
  local label="$1" port="$2" health_url="${3:-}"

  if launchd_loaded "${label}"; then
    local pid
    pid="$(launchd_pid "${label}")"
    if [ -z "${pid}" ]; then
      echo "STALE"
      return 0
    fi
    if ! port_listening "${port}"; then
      echo "STARTING"
      return 0
    fi
    if [ -n "${health_url}" ] && ! http_healthy "${health_url}"; then
      echo "UNHEALTHY"
      return 0
    fi
    echo "RUNNING"
    return 0
  fi

  if port_listening "${port}"; then
    echo "EXTERNAL"
    return 0
  fi

  echo "STOPPED"
}

# $1 = label. "owned" if a launchd job with this label is loaded,
# "external" if the port is occupied by something else, "none" if
# nothing is running at all. Caller passes the already-computed state
# to avoid recomputing.
ownership_for_state() {
  local state="$1"
  case "${state}" in
    RUNNING|STARTING|UNHEALTHY|STALE) echo "bootstrap-owned" ;;
    EXTERNAL) echo "external" ;;
    *) echo "none" ;;
  esac
}

# Writes a launchd plist for a long-running dev service.
# $1 = output path, $2 = label, $3 = working dir, $4 = log file,
# $5.. = the command and its arguments (each a separate positional arg).
write_service_plist() {
  local out_path="$1" label="$2" workdir="$3" logfile="$4"
  shift 4
  local args_xml=""
  for arg in "$@"; do
    args_xml+="    <string>${arg}</string>
"
  done
  cat > "${out_path}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
${args_xml}  </array>
  <key>WorkingDirectory</key>
  <string>${workdir}</string>
  <key>StandardOutPath</key>
  <string>${logfile}</string>
  <key>StandardErrorPath</key>
  <string>${logfile}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Interactive</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${PATH}</string>
  </dict>
</dict>
</plist>
PLIST
}

# $1 = label, $2 = plist path. Idempotent: if already loaded, does
# nothing and returns success (matches "second bootstrap does not
# create duplicate services").
launchd_start() {
  local label="$1" plist="$2"
  if launchd_loaded "${label}"; then
    return 0
  fi
  launchctl bootstrap "${LAUNCHD_DOMAIN}" "${plist}"
}

# $1 = label. Safe no-op if not loaded.
launchd_stop() {
  local label="$1"
  if ! launchd_loaded "${label}"; then
    return 0
  fi
  launchctl bootout "${LAUNCHD_DOMAIN}/${label}"
}
