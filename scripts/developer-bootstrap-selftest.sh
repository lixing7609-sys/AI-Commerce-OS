#!/usr/bin/env bash
# Non-destructive safety validation for the Developer Bootstrap scripts.
# Run manually: bash scripts/developer-bootstrap-selftest.sh
#
# Does NOT open Terminal windows, does NOT launch Claude Code, and only
# runs bootstrap in --dry-run / read-only modes — safe to run repeatedly,
# including inside an already-running Claude Code session.

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
echo " Developer Bootstrap self-test (non-destructive)"
echo "=============================================================="

echo ""
echo "-- Expected files exist ---------------------------------------"
for f in developer-bootstrap.sh developer-bootstrap-status.sh developer-bootstrap-stop.sh developer-bootstrap-config.sh developer-bootstrap-terminal.applescript; do
  check "scripts/$f exists" "[ -f '${SCRIPT_DIR}/$f' ]"
done

echo ""
echo "-- Executable permissions --------------------------------------"
for f in developer-bootstrap.sh developer-bootstrap-status.sh developer-bootstrap-stop.sh; do
  check "scripts/$f is executable" "[ -x '${SCRIPT_DIR}/$f' ]"
done

echo ""
echo "-- Shell syntax is valid ----------------------------------------"
for f in developer-bootstrap.sh developer-bootstrap-status.sh developer-bootstrap-stop.sh developer-bootstrap-config.sh; do
  check "scripts/$f has valid bash syntax" "bash -n '${SCRIPT_DIR}/$f'"
done

echo ""
echo "-- npm commands resolve ------------------------------------------"
check "root package.json defines 'bootstrap'" "grep -q '\"bootstrap\":' '${REPO_ROOT}/package.json'"
check "root package.json defines 'bootstrap:status'" "grep -q '\"bootstrap:status\":' '${REPO_ROOT}/package.json'"
check "root package.json defines 'bootstrap:stop'" "grep -q '\"bootstrap:stop\":' '${REPO_ROOT}/package.json'"

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
# Only the four scripts bootstrap actually executes (never this selftest
# script itself, whose own check descriptions and docs would false-positive
# on the patterns being searched for) — and strip comment lines first, so a
# defensive comment documenting "never do X" isn't mistaken for doing X.
BOOTSTRAP_EXEC_SCRIPTS=(
  "${SCRIPT_DIR}/developer-bootstrap.sh"
  "${SCRIPT_DIR}/developer-bootstrap-status.sh"
  "${SCRIPT_DIR}/developer-bootstrap-stop.sh"
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
echo "-- Duplicate-start protection exists ---------------------------------"
check "bootstrap.sh checks for an already-listening frontend port before starting" \
  "grep -q 'port_listening \"\\\${FRONTEND_PORT}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"
check "bootstrap.sh checks for an already-listening backend port before starting" \
  "grep -q 'port_listening \"\\\${BACKEND_PORT}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"
check "bootstrap.sh checks for an already-running test watcher before starting" \
  "grep -q 'pid_alive \"\\\${TESTWATCH_PID_FILE}\"' '${SCRIPT_DIR}/developer-bootstrap.sh'"

echo ""
echo "-- stop script only targets recorded PIDs, never broad kills --------"
check "stop script uses per-PID 'kill \${pid}', not a broad process match" \
  "grep -q 'kill \"\\\${pid}\"' '${SCRIPT_DIR}/developer-bootstrap-stop.sh'"

echo ""
echo "-- Dry run does not start services or open windows -------------------"
DRY_OUTPUT="$(bash "${SCRIPT_DIR}/developer-bootstrap.sh" --dry-run 2>&1)"
check "dry-run output reaches the 'stopping here' marker" \
  "printf '%s' \"\$DRY_OUTPUT\" | grep -q 'Dry run: stopping here'"
check "dry-run does not claim to have started the frontend" \
  "! printf '%s' \"\$DRY_OUTPUT\" | grep -q 'frontend: starting on'"
check "dry-run does not claim to have started the backend" \
  "! printf '%s' \"\$DRY_OUTPUT\" | grep -q 'backend: Postgres reachable'"

echo ""
echo "-- Status command is safe with nothing bootstrap-owned running -------"
check "'bootstrap:status' exits 0" "bash '${SCRIPT_DIR}/developer-bootstrap-status.sh' >/dev/null 2>&1"

echo ""
echo "-- Stop command is safe with nothing bootstrap-owned running ----------"
check "'bootstrap:stop' exits 0 even when nothing bootstrap-owned is running" \
  "bash '${SCRIPT_DIR}/developer-bootstrap-stop.sh' >/dev/null 2>&1"

echo ""
echo "=============================================================="
echo " ${PASS} passed, ${FAIL} failed"
echo "=============================================================="

[ "${FAIL}" -eq 0 ]
