#!/usr/bin/env bash
# Self-test for "AI Commerce OS Launcher.app" — run manually or via
# `npm run launcher:test`.
#
# Honest limitation: this environment cannot simulate an actual mouse
# double-click inside Finder. The closest available equivalent is
# `open <bundle.app>`, which drives the exact same LaunchServices code
# path macOS uses for a Finder double-click (same process launch, same
# Info.plist executable resolution, same working directory semantics).
# Static checks below verify bundle structure/content; the live check
# (Part 2) actually launches the bundle via `open` and observes its
# real effects (log output, launchd services, notification). This is
# NOT a substitute for a literal Finder double-click test — that must
# still be performed by a human in a normal (non-headless) macOS GUI
# session — but it is a genuine, non-fabricated verification of the
# launcher's actual behavior, not just its source code.
#
# Non-destructive: reuses/starts the same bootstrap-owned launchd
# services `npm run bootstrap` would (idempotent either way), never
# stops anything, never touches Git.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=./developer-bootstrap-config.sh
source "${SCRIPT_DIR}/developer-bootstrap-config.sh"

APP_BUNDLE="${REPO_ROOT}/AI Commerce OS Launcher.app"
LAUNCHER_SCRIPT="${APP_BUNDLE}/Contents/MacOS/launcher"
INFO_PLIST="${APP_BUNDLE}/Contents/Info.plist"

PASS=0
FAIL=0
SKIP=0

check() {
  local desc="$1" cond="$2"
  if eval "$cond"; then
    printf '  [PASS] %s\n' "$desc"
    PASS=$((PASS + 1))
  else
    printf '  [FAIL] %s\n' "$desc"
    FAIL=$((FAIL + 1))
  fi
}

skip() {
  printf '  [SKIP] %s\n' "$1"
  SKIP=$((SKIP + 1))
}

echo "=============================================================="
echo " AI Commerce OS Launcher self-test"
echo "=============================================================="

echo ""
echo "-- Part 1: static bundle structure -----------------------------"
check "app bundle exists at repo root" "[ -d '${APP_BUNDLE}' ]"
check "Info.plist exists" "[ -f '${INFO_PLIST}' ]"
check "Info.plist declares CFBundleExecutable 'launcher'" \
  "grep -A1 'CFBundleExecutable' '${INFO_PLIST}' | grep -q '<string>launcher</string>'"
check "launcher executable exists at Contents/MacOS/launcher" "[ -f '${LAUNCHER_SCRIPT}' ]"
check "launcher executable has the executable bit set" "[ -x '${LAUNCHER_SCRIPT}' ]"
check "launcher script has valid bash syntax" "bash -n '${LAUNCHER_SCRIPT}'"

echo ""
echo "-- Part 2: static behavior checks (grep-based, source of truth) --"
check "launcher calls the canonical 'npm run bootstrap' (no separate startup logic)" \
  "grep -q 'npm run bootstrap' '${LAUNCHER_SCRIPT}'"
check "launcher does NOT call 'npm run dev' directly (the original no-op bug)" \
  "! grep -Ev '^\\s*#' '${LAUNCHER_SCRIPT}' | grep -q 'npm run dev'"
check "launcher does NOT call 'npm run test:watch' directly (the original no-op bug)" \
  "! grep -Ev '^\\s*#' '${LAUNCHER_SCRIPT}' | grep -q 'npm run test:watch'"
check "launcher resolves and validates the repository path before doing anything else" \
  "grep -q 'package.json' '${LAUNCHER_SCRIPT}' && grep -q 'scripts' '${LAUNCHER_SCRIPT}'"
check "launcher uses non-blocking 'display notification', not a blocking 'display alert'" \
  "grep -q 'display notification' '${LAUNCHER_SCRIPT}'"
check "launcher never uses a blocking 'display alert' (would hang a double-click and automated tests)" \
  "! grep -Ev '^\\s*#' '${LAUNCHER_SCRIPT}' | grep -q 'display alert'"
check "launcher has a headless fallback path if Terminal automation is unavailable" \
  "grep -q 'TERMINAL_OPENED' '${LAUNCHER_SCRIPT}'"
check "launcher waits for real frontend readiness (curl), not just launching and exiting" \
  "grep -q 'curl' '${LAUNCHER_SCRIPT}'"
check "launcher logs to the same runtime log directory as bootstrap" \
  "grep -q '.runtime/dev-bootstrap/logs' '${LAUNCHER_SCRIPT}'"
check "launcher reports both success and failure via notify() (never a silent no-op)" \
  "grep -c 'notify ' '${LAUNCHER_SCRIPT}' | grep -qE '^[2-9]|^[1-9][0-9]'"
check "launcher never runs a destructive Git command" \
  "! grep -Ev '^\\s*#' '${LAUNCHER_SCRIPT}' | grep -Eq 'git (pull|checkout|reset|stash|commit|push|rebase)'"
check "launcher never uses sudo" \
  "! grep -q '\\bsudo\\b' '${LAUNCHER_SCRIPT}'"

echo ""
echo "-- Part 3: live invocation via 'open' (LaunchServices, same path Finder uses) --"
echo "  NOTE: this is 'open <bundle>', not a literal simulated Finder double-click."
echo "  It exercises the real bundle end-to-end but is not proof of Finder-specific"
echo "  behavior (e.g. Dock bounce, Finder's own error dialogs on a broken bundle)."

if ! command -v open >/dev/null 2>&1; then
  skip "live invocation — 'open' command not available on this system"
else
  BEFORE_LOG_LINES=0
  [ -f "${LAUNCHER_LOG}" ] && BEFORE_LOG_LINES="$(wc -l < "${LAUNCHER_LOG}" | tr -d ' ')"

  bootstrap_log INFO "launcher-selftest: invoking 'open \"${APP_BUNDLE}\"'" 2>/dev/null || true
  if open "${APP_BUNDLE}"; then
    check "'open' accepted the bundle without error" "true"

    echo "  waiting up to 35s for the launcher to finish its own readiness wait..."
    LOG_GREW=false
    for _ in $(seq 1 35); do
      if [ -f "${LAUNCHER_LOG}" ]; then
        AFTER_LOG_LINES="$(wc -l < "${LAUNCHER_LOG}" | tr -d ' ')"
        if [ "${AFTER_LOG_LINES}" -gt "${BEFORE_LOG_LINES}" ]; then
          LOG_GREW=true
          break
        fi
      fi
      sleep 1
    done
    check "launcher.log received new entries after invocation" "$LOG_GREW"

    if [ -f "${LAUNCHER_LOG}" ]; then
      LAST_LINES="$(tail -20 "${LAUNCHER_LOG}")"
      echo "  -- last launcher.log lines --"
      printf '%s\n' "${LAST_LINES}" | sed 's/^/    /'
      check "launcher.log shows the frontend was confirmed ready (or a clear, logged error)" \
        "printf '%s' \"\$LAST_LINES\" | grep -qE 'Frontend confirmed ready|ERROR'"
    fi

    check "frontend actually responds after launcher invocation" \
      "curl -s -o /dev/null -m 5 '${CLOUD_URL}'"
  else
    check "'open' accepted the bundle without error" "false"
  fi
fi

echo ""
echo "=============================================================="
echo " ${PASS} passed, ${FAIL} failed, ${SKIP} skipped"
echo " Limitation: verified via 'open' (LaunchServices), not a literal"
echo " Finder double-click — see the header comment for why, and"
echo " perform a manual Finder double-click test separately if a"
echo " fully interactive GUI session is available."
echo "=============================================================="

[ "${FAIL}" -eq 0 ]
