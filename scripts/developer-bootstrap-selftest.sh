#!/usr/bin/env bash
# Non-destructive safety validation for the Developer Bootstrap scripts.
# Run manually: bash scripts/developer-bootstrap-selftest.sh
#
# Rewritten for the launchd-based process-persistence model (see
# developer-bootstrap-config.sh) — the previous version of this file
# checked for the pre-launchd nohup/PID-file model's guarantees (e.g. a
# `port_listening` pre-check before starting, `kill "${pid}"` in the
# stop script) which no longer describe how these scripts actually
# work. Does NOT open Terminal windows, does NOT launch Claude Code,
# and only runs bootstrap in --dry-run / read-only modes — safe to run
# repeatedly, including inside an already-running Claude Code session,
# and safe to run whether or not bootstrap-owned services are currently
# up (it never stops or starts a real service itself).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PASS=0
FAIL=0

check() {
  # $1 = description, $2 = shell condition to eval
  local desc="$1" cond="$2"
  if eval "$cond"; then
    printf '  [PASS] %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  [FAIL] %s\n' "$desc"
    FAIL=$((FAIL + 1))
  fi
}

echo "=============================================================="
echo " Developer Bootstrap self-test (non-destructive, launchd model)"
echo "=============================================================="

echo ""
echo "-- Expected files exist ---------------------------------------"
for f in developer-bootstrap.sh developer-bootstrap-status.sh developer-bootstrap-stop.sh developer-bootstrap-restart.sh developer-bootstrap-config.sh developer-bootstrap-terminal.applescript; do
  check "scripts/$f exists" "[ -f '${SCRIPT_DIR}/$f' ]"
done

echo ""
echo "-- Executable permissions --------------------------------------"
for f in developer-bootstrap.sh developer-bootstrap-status.sh developer-bootstrap-stop.sh developer-bootstrap-restart.sh; do
  check "scripts/$f is executable" "[ -x '${SCRIPT_DIR}/$f' ]"
done

echo ""
echo "-- Shell syntax is valid ----------------------------------------"
for f in developer-bootstrap.sh developer-bootstrap-status.sh developer-bootstrap-stop.sh developer-bootstrap-restart.sh developer-bootstrap-config.sh; do
  check "scripts/$f has valid bash syntax" "bash -n '${SCRIPT_DIR}/$f'"
done

echo ""
echo "-- npm commands resolve ------------------------------------------"
check "root package.json defines 'bootstrap'" "grep -q '\"bootstrap\":' '${REPO_ROOT}/package.json'"
check "root package.json defines 'bootstrap:status'" "grep -q '\"bootstrap:status\":' '${REPO_ROOT}/package.json'"
check "root package.json defines 'bootstrap:stop'" "grep -q '\"bootstrap:stop\":' '${REPO_ROOT}/package.json'"
check "root package.json defines 'bootstrap:restart'" "grep -q '\"bootstrap:restart\":' '${REPO_ROOT}/package.json'"
check "root package.json defines 'launcher:test'" "grep -q '\"launcher:test\":' '${REPO_ROOT}/package.json'"

echo ""
echo "-- Runtime directory is ignored ------------------------------------"
check "'.runtime/' is listed in .gitignore" "grep -q '\\.runtime/' '${REPO_ROOT}/.gitignore'"

echo ""
echo "-- Required URLs are configured ------------------------------------"
check "CLOUD_URL is configured" "grep -q 'CLOUD_URL=' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"
check "OPERATOR_URL is configured" "grep -q 'OPERATOR_URL=' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"
check "FOUNDER_URL is configured" "grep -q 'FOUNDER_URL=' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"

echo ""
echo "-- No destructive Git commands anywhere in the bootstrap scripts ---"
# Only the scripts bootstrap actually executes (never this selftest
# script itself, whose own check descriptions and docs would false-positive
# on the patterns being searched for) — and strip comment lines first, so a
# defensive comment documenting "never do X" isn't mistaken for doing X.
BOOTSTRAP_EXEC_SCRIPTS=(
  "${SCRIPT_DIR}/developer-bootstrap.sh"
  "${SCRIPT_DIR}/developer-bootstrap-status.sh"
  "${SCRIPT_DIR}/developer-bootstrap-stop.sh"
  "${SCRIPT_DIR}/developer-bootstrap-restart.sh"
  "${SCRIPT_DIR}/developer-bootstrap-config.sh"
)
DESTRUCTIVE_GIT_PATTERN='git (pull|checkout|reset|stash|commit|push|rebase)'
check "no 'git pull/checkout/reset/stash/commit/push/rebase' in any bootstrap script" \
  "! grep -hvE '^\\s*#' \"\${BOOTSTRAP_EXEC_SCRIPTS[@]}\" | grep -Eq '${DESTRUCTIVE_GIT_PATTERN}'"

echo ""
echo "-- No broad process-killing commands --------------------------------"
check "no 'pkill'/'killall' anywhere in the bootstrap scripts" \
  "! grep -hvE '^\\s*#' \"\${BOOTSTRAP_EXEC_SCRIPTS[@]}\" | grep -Eq '\\b(pkill|killall)\\b'"

echo ""
echo "-- launchd jobs are per-user (gui/\$UID), never a system daemon ------"
check "config uses the gui/\$UID launchd domain, not system/ or a privileged domain" \
  "grep -q 'LAUNCHD_DOMAIN=\"gui/\\\${LAUNCHD_UID}\"' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"
check "no 'sudo' anywhere in the bootstrap scripts" \
  "! grep -hvE '^\\s*#' \"\${BOOTSTRAP_EXEC_SCRIPTS[@]}\" | grep -Eq '\\bsudo\\b'"
check "launchd job labels are namespaced under com.aicommerceos.dev.*" \
  "grep -q 'FRONTEND_LABEL=\"com.aicommerceos.dev.frontend\"' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"

echo ""
echo "-- Duplicate-start protection exists (state-machine based) -----------"
check "bootstrap.sh computes frontend service_state before deciding to start it" \
  "grep -q 'FRONTEND_STATE=\"\\\$(service_state \"\\\${FRONTEND_LABEL}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"
check "bootstrap.sh computes backend service_state before deciding to start it" \
  "grep -q 'BACKEND_STATE=\"\\\$(service_state \"\\\${BACKEND_LABEL}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"
check "bootstrap.sh checks for an already-loaded test watcher before starting" \
  "grep -q 'launchd_loaded \"\\\${TESTWATCH_LABEL}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"
check "launchd_start is idempotent (no-op if the label is already loaded)" \
  "grep -A3 '^launchd_start()' '${SCRIPT_DIR}/developer-bootstrap-config.sh' | grep -q 'launchd_loaded'"
check "bootstrap.sh skips re-opening Terminal/browser tabs on a repeat run (session-file guard)" \
  "grep -q 'if \\[ -f \"\\\${SESSION_FILE}\" \\]' '${SCRIPT_DIR}/developer-bootstrap.sh'"

echo ""
echo "-- stop script only targets recorded launchd labels, never a broad kill --"
check "stop script uses per-label 'launchctl bootout', not a broad process match" \
  "grep -q 'launchctl bootout' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"
check "stop script never calls a broad-match kill (only legacy single-PID cleanup, if any)" \
  "! grep -hvE '^\\s*#' '${SCRIPT_DIR}/developer-bootstrap-stop.sh' | grep -Eq '\\bkill\\b.*\\*'"

echo ""
echo "-- restart.sh delegates to stop+bootstrap, no separate logic ---------"
check "restart.sh calls developer-bootstrap-stop.sh" \
  "grep -q 'developer-bootstrap-stop.sh' '${SCRIPT_DIR}/developer-bootstrap-restart.sh'"
check "restart.sh calls developer-bootstrap.sh (the same canonical entrypoint)" \
  "grep -q 'developer-bootstrap.sh' '${SCRIPT_DIR}/developer-bootstrap-restart.sh'"

echo ""
echo "-- Health probing is real HTTP, not just 'port is listening' ---------"
check "config defines http_healthy() as a real curl probe" \
  "grep -A8 '^http_healthy()' '${SCRIPT_DIR}/developer-bootstrap-config.sh' | grep -q 'curl'"
check "bootstrap.sh waits on http_healthy, not just port_listening, before declaring readiness" \
  "grep -q 'http_healthy \"\\\${CLOUD_URL}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"

echo ""
echo "-- service_state() returns a well-defined state machine ---------------"
for state in RUNNING STARTING UNHEALTHY STALE EXTERNAL STOPPED; do
  check "service_state() can report ${state}" \
    "grep -q '${state}' '${SCRIPT_DIR}/developer-bootstrap-config.sh'"
done

echo ""
echo "-- Dry run does not start services or open windows -------------------"
DRY_OUTPUT="$(bash "${SCRIPT_DIR}/developer-bootstrap.sh" --dry-run 2>&1)"
check "dry-run output reaches the 'stopping here' marker" \
  "printf '%s' \"\$DRY_OUTPUT\" | grep -q 'Dry run: stopping here'"
check "dry-run does not claim to have started the frontend" \
  "! printf '%s' \"\$DRY_OUTPUT\" | grep -q 'frontend: starting as launchd job'"
check "dry-run does not claim to have started the backend" \
  "! printf '%s' \"\$DRY_OUTPUT\" | grep -q 'backend: Postgres reachable'"

echo ""
echo "-- Status command is safe regardless of what is currently running ----"
check "'bootstrap:status' exits 0" "bash '${SCRIPT_DIR}/developer-bootstrap-status.sh' >/dev/null 2>&1"

echo ""
echo "-- Status output reports the full required field set ------------------"
STATUS_OUTPUT="$(bash "${SCRIPT_DIR}/developer-bootstrap-status.sh" 2>&1 || true)"
for field in Repository Branch Frontend Backend "Runtime directory" "Log files" "Cloud URL" "Operator URL" "Founder URL"; do
  check "status output includes '${field}'" \
    "printf '%s' \"\$STATUS_OUTPUT\" | grep -q '${field}'"
done

echo ""
echo "=============================================================="
echo " ${PASS} passed, ${FAIL} failed"
echo "=============================================================="

[ "${FAIL}" -eq 0 ]
