#!/usr/bin/env bash
# Developer Bootstrap — the one command for daily AI Commerce OS startup
# after a Mac restart: `npm run bootstrap` (from the repo root).
#
# Coordinates the actual development environment instead of aliasing
# `npm run dev`: validates prerequisites, shows Git safety state, starts
# only the services this repository actually needs as launchd user
# LaunchAgents (see developer-bootstrap-config.sh for why — nohup'd
# background jobs from a single Bash-tool call were confirmed, by a real
# failure, not to reliably outlive the session that spawned them; launchd
# is macOS's own process supervisor and does not have that problem),
# opens a four-Terminal-tab workflow, and opens the three edition URLs
# once the frontend is ready. Safe to re-run — detects already-running
# services (bootstrap-owned or external) and reuses them rather than
# starting duplicates. Never touches Git history (no pull/checkout/
# reset/stash/commit/push/rebase) and never kills a process it did not
# start itself.
#
# Modes:
#   npm run bootstrap                  normal interactive startup
#   npm run bootstrap -- --dry-run     print the plan, start nothing
#   npm run bootstrap -- --no-browser  skip opening browser tabs
#   npm run bootstrap -- --no-claude   skip launching Claude Code in Terminal 4
#
# See docs/09-runbooks/developer-bootstrap.md for the full write-up.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./developer-bootstrap-config.sh
source "${SCRIPT_DIR}/developer-bootstrap-config.sh"

DRY_RUN=false
OPEN_BROWSER=true
OPEN_CLAUDE=true

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --no-browser) OPEN_BROWSER=false ;;
    --no-claude) OPEN_CLAUDE=false ;;
    *)
      bootstrap_log WARN "unrecognized argument '$arg' (ignored)"
      ;;
  esac
done

if $DRY_RUN; then
  bootstrap_log INFO "--dry-run: no service will be started, no Terminal tab or browser tab will be opened"
fi

echo "=============================================================="
echo " AI Commerce OS — Developer Bootstrap"
echo "=============================================================="
bootstrap_log INFO "repository root: ${REPO_ROOT}"

ensure_runtime_dir

# ----------------------------------------------------------------------
# A. Prerequisite checks (report only — never silently install/upgrade)
# ----------------------------------------------------------------------
echo ""
echo "-- Prerequisites -----------------------------------------------"

PREREQ_FAILED=false

check_cmd() {
  # $1 = command, $2 = human label, $3 = required(true)/optional(false)
  # Tolerant of commands whose `--version` doesn't exist or exits
  # non-zero (e.g. launchctl, which only has a `version` subcommand and
  # exits 1 with a usage message for an unrecognized `--version` flag) —
  # under `set -eo pipefail` an unguarded failure here would silently
  # abort the whole bootstrap before it even reaches service startup.
  local cmd="$1" label="$2" required="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    local version
    if [ "$cmd" = "launchctl" ]; then
      version="available ($(command -v launchctl))"
    else
      version="$("$cmd" --version 2>&1 | head -1 || true)"
      [ -n "${version}" ] || version="available"
    fi
    printf '  [ok] %-10s %s\n' "$label" "$version"
  else
    if [ "$required" = "true" ]; then
      printf '  [MISSING, required] %s — install it before continuing (e.g. https://brew.sh, then `brew install %s`)\n' "$label" "$cmd"
      PREREQ_FAILED=true
    else
      printf '  [missing, optional] %s — not required for the frontend-only workflow\n' "$label"
    fi
  fi
}

if [ "$(uname -s)" = "Darwin" ]; then
  printf '  [ok] %-10s macOS %s\n' "OS" "$(sw_vers -productVersion 2>/dev/null || echo unknown)"
else
  bootstrap_log WARN "this bootstrap is written for and only tested on macOS (uname reports $(uname -s))"
fi

check_cmd node "Node.js" true
check_cmd npm "npm" true
check_cmd git "Git" true
check_cmd uv "uv" false
check_cmd python3 "Python" false
check_cmd docker "Docker" false
check_cmd launchctl "launchctl" true

if [ -n "${CLAUDE_CMD}" ]; then
  printf '  [ok] %-10s %s\n' "Claude Code" "${CLAUDE_CMD}"
else
  printf '  [missing, optional] Claude Code — Terminal 4 will not be able to launch it\n'
  OPEN_CLAUDE=false
fi

if [ ! -f "${BACKEND_DIR}/.env" ]; then
  bootstrap_log WARN "backend/.env not found (backend/.env.example documents the optional variables; missing ones fail safe, they do not block startup)"
fi

if $PREREQ_FAILED; then
  bootstrap_log ERROR "one or more required prerequisites are missing — fix the items marked [MISSING, required] above and re-run"
  exit 1
fi

# ----------------------------------------------------------------------
# C. Git safety state (report only — never mutates)
# ----------------------------------------------------------------------
echo ""
echo "-- Git state ------------------------------------------------------"
CURRENT_BRANCH="$(git -C "${REPO_ROOT}" branch --show-current 2>/dev/null || echo unknown)"
echo "  branch: ${CURRENT_BRANCH}"
echo "  recent commits:"
git -C "${REPO_ROOT}" log --oneline -5 2>/dev/null | sed 's/^/    /'
GIT_STATUS_SHORT="$(git -C "${REPO_ROOT}" status --short 2>/dev/null || true)"
if [ -n "${GIT_STATUS_SHORT}" ]; then
  bootstrap_log WARN "working tree is not clean:"
  echo "${GIT_STATUS_SHORT}" | sed 's/^/    /'
else
  echo "  working tree: clean"
fi

# ----------------------------------------------------------------------
# D. Dependency validation (respects lockfiles, never upgrades)
# ----------------------------------------------------------------------
echo ""
echo "-- Dependencies ---------------------------------------------------"
if [ ! -d "${FRONTEND_DIR}/node_modules" ]; then
  if $DRY_RUN; then
    echo "  frontend/node_modules missing — would run 'npm ci' in frontend/ (respects package-lock.json)"
  else
    bootstrap_log INFO "frontend/node_modules missing — running 'npm ci' (this is the one dependency-install step; it will not run again once node_modules exists)"
    (cd "${FRONTEND_DIR}" && npm ci)
  fi
else
  echo "  frontend/node_modules: present (not reinstalling — lockfile untouched)"
fi

# ----------------------------------------------------------------------
# E. Start required services as launchd user LaunchAgents
# ----------------------------------------------------------------------
echo ""
echo "-- Services (launchd-supervised, survive this session ending) -----"

# Frontend ---------------------------------------------------------------
FRONTEND_STATE="$(service_state "${FRONTEND_LABEL}" "${FRONTEND_PORT}" "${CLOUD_URL}")"
case "${FRONTEND_STATE}" in
  RUNNING)
    bootstrap_log INFO "frontend: already running and healthy (bootstrap-owned) — reusing"
    ;;
  EXTERNAL)
    bootstrap_log INFO "frontend: something else is already listening on :${FRONTEND_PORT} (not bootstrap-owned) — reusing for this session, but it will not be supervised or auto-restarted by launchd. If it disappears, re-run bootstrap to start a bootstrap-owned one."
    ;;
  *)
    if $DRY_RUN; then
      echo "  frontend: would install and start launchd job '${FRONTEND_LABEL}' -> npm run dev -- --port ${FRONTEND_PORT}, log -> ${FRONTEND_LOG}"
    else
      bootstrap_log INFO "frontend: starting as launchd job (state was ${FRONTEND_STATE})"
      launchd_stop "${FRONTEND_LABEL}" || true
      write_service_plist "${FRONTEND_PLIST}" "${FRONTEND_LABEL}" "${FRONTEND_DIR}" "${FRONTEND_LOG}" \
        "/bin/bash" "-lc" "exec npm run dev -- --port ${FRONTEND_PORT}"
      launchd_start "${FRONTEND_LABEL}" "${FRONTEND_PLIST}"
    fi
    ;;
esac

# Backend — only if its Postgres dependency is actually reachable. There
# is no docker-compose.yml in this repository to provision Postgres, so
# the bootstrap never attempts to create or start a database container;
# it only checks whether one is already reachable and gives guidance if
# not, per "do not fabricate unavailable infrastructure."
BACKEND_STATE="$(service_state "${BACKEND_LABEL}" "${BACKEND_PORT}" "http://localhost:${BACKEND_PORT}/docs")"
BACKEND_SKIPPED_REASON=""
if [ "${BACKEND_STATE}" = "STOPPED" ]; then
  if ! command -v uv >/dev/null 2>&1; then
    BACKEND_SKIPPED_REASON="uv is not installed"
  elif ! tcp_reachable "${POSTGRES_HOST}" "${POSTGRES_PORT}"; then
    BACKEND_SKIPPED_REASON="Postgres is not reachable at ${POSTGRES_HOST}:${POSTGRES_PORT}"
  fi
fi

case "${BACKEND_STATE}" in
  RUNNING)
    bootstrap_log INFO "backend: already running and healthy (bootstrap-owned) — reusing"
    ;;
  EXTERNAL)
    bootstrap_log INFO "backend: something else is already listening on :${BACKEND_PORT} (not bootstrap-owned) — reusing for this session"
    ;;
  *)
    if [ -n "${BACKEND_SKIPPED_REASON}" ]; then
      bootstrap_log WARN "backend: skipped — ${BACKEND_SKIPPED_REASON}."
      echo "    Founder modules that call the backend will show a visible 'backend unavailable' state; this is expected and safe."
      echo "    To start the backend: ensure Postgres is reachable (this repo expects it at ${POSTGRES_HOST}:${POSTGRES_PORT}, e.g. via your existing Docker container), then re-run 'npm run bootstrap'."
    elif $DRY_RUN; then
      echo "  backend: would run 'uv run alembic upgrade head' then install and start launchd job '${BACKEND_LABEL}', log -> ${BACKEND_LOG}"
    else
      bootstrap_log INFO "backend: Postgres reachable — running migrations then starting as launchd job (state was ${BACKEND_STATE})"
      if ! (cd "${BACKEND_DIR}" && uv run alembic upgrade head); then
        bootstrap_log ERROR "backend: 'alembic upgrade head' failed — backend not started. Frontend continues regardless."
      else
        launchd_stop "${BACKEND_LABEL}" || true
        write_service_plist "${BACKEND_PLIST}" "${BACKEND_LABEL}" "${BACKEND_DIR}" "${BACKEND_LOG}" \
          "/bin/bash" "-lc" "exec uv run uvicorn app.main:app --reload --port ${BACKEND_PORT}"
        launchd_start "${BACKEND_LABEL}" "${BACKEND_PLIST}"
      fi
    fi
    ;;
esac

if $DRY_RUN; then
  echo ""
  echo "-- Dry run: stopping here (no readiness wait, no Terminal tabs, no browser tabs) --"
  echo "  Would open Terminal tabs:"
  echo "    1. development server / full stack  -> tail -f ${FRONTEND_LOG}"
  echo "    2. test watcher                     -> tail -f ${TESTWATCH_LOG}"
  echo "    3. git monitoring workspace         -> git status / git log --oneline -5, then an interactive shell"
  echo "    4. Claude Code                      -> cd '${REPO_ROOT}' && exec claude"
  echo "  Would open browser tabs:"
  echo "    ${CLOUD_URL}"
  echo "    ${OPERATOR_URL}"
  echo "    ${FOUNDER_URL}"
  exit 0
fi

# Test watcher -------------------------------------------------------------
# Has no port to probe, so service_state's port/health logic doesn't
# apply — "job loaded with a live pid" is treated as running.
if launchd_loaded "${TESTWATCH_LABEL}" && [ -n "$(launchd_pid "${TESTWATCH_LABEL}")" ]; then
  bootstrap_log INFO "test watcher: already running — reusing"
else
  bootstrap_log INFO "test watcher: starting as launchd job"
  launchd_stop "${TESTWATCH_LABEL}" || true
  write_service_plist "${TESTWATCH_PLIST}" "${TESTWATCH_LABEL}" "${FRONTEND_DIR}" "${TESTWATCH_LOG}" \
    "/bin/bash" "-lc" "exec npx vitest watch"
  launchd_start "${TESTWATCH_LABEL}" "${TESTWATCH_PLIST}"
fi

# ----------------------------------------------------------------------
# Wait for frontend readiness (real HTTP probe, not just a port check)
# ----------------------------------------------------------------------
echo ""
echo "-- Waiting for frontend readiness ------------------------------------"
READY=false
i=0
for i in $(seq 1 "${READY_TIMEOUT_SECONDS}"); do
  if http_healthy "${CLOUD_URL}"; then
    READY=true
    break
  fi
  sleep 1
done
if $READY; then
  bootstrap_log INFO "frontend ready after ~${i}s"
else
  bootstrap_log WARN "frontend did not respond within ${READY_TIMEOUT_SECONDS}s — check ${FRONTEND_LOG}. Continuing anyway."
fi

# ----------------------------------------------------------------------
# F. Four-terminal layout (osascript driving Terminal.app)
# ----------------------------------------------------------------------
echo ""
echo "-- Terminal layout ----------------------------------------------------"
if [ -f "${SESSION_FILE}" ]; then
  bootstrap_log INFO "Terminal layout: session already opened previously (see ${SESSION_FILE}) — not opening another set of tabs/windows. Delete that file (or run 'npm run bootstrap:stop') if you want a fresh layout."
elif [ -f "${SCRIPT_DIR}/developer-bootstrap-terminal.applescript" ]; then
  CLAUDE_TAB_CMD="echo 'Claude Code not launched: --no-claude or claude not found'; exec \$SHELL -l"
  if $OPEN_CLAUDE && [ -n "${CLAUDE_CMD}" ]; then
    CLAUDE_TAB_CMD="cd '${REPO_ROOT}' && exec '${CLAUDE_CMD}'"
  fi
  osascript "${SCRIPT_DIR}/developer-bootstrap-terminal.applescript" \
    "cd '${REPO_ROOT}' && echo '== frontend (and backend, if running) ==' && echo 'frontend log: ${FRONTEND_LOG}' && echo 'backend log:  ${BACKEND_LOG}' && tail -f '${FRONTEND_LOG}'" \
    "cd '${REPO_ROOT}' && echo '== test watcher ==' && tail -f '${TESTWATCH_LOG}'" \
    "cd '${REPO_ROOT}' && echo '== git ==' && git status && echo '' && git log --oneline -5 && exec \$SHELL -l" \
    "${CLAUDE_TAB_CMD}" \
    || bootstrap_log WARN "could not drive Terminal.app via osascript (this is non-fatal — services above are already running and, being launchd-supervised, do not depend on this Terminal layout at all)"
else
  bootstrap_log WARN "developer-bootstrap-terminal.applescript not found — skipping Terminal tab layout"
fi

# ----------------------------------------------------------------------
# G. Open development pages (idempotency: only once, guarded by session file)
# ----------------------------------------------------------------------
if $OPEN_BROWSER && $READY; then
  if [ -f "${SESSION_FILE}" ]; then
    bootstrap_log INFO "browser tabs: session already opened previously (see ${SESSION_FILE}) — not reopening to avoid duplicate tabs. Delete that file (or run 'npm run bootstrap:stop') if you want fresh tabs."
  else
    bootstrap_log INFO "opening the three edition URLs"
    open "${CLOUD_URL}"
    open "${OPERATOR_URL}"
    open "${FOUNDER_URL}"
  fi
elif $OPEN_BROWSER && ! $READY; then
  bootstrap_log WARN "skipping browser open — frontend never became ready"
fi

# ----------------------------------------------------------------------
# Session bookkeeping
# ----------------------------------------------------------------------
cat > "${SESSION_FILE}" <<EOF
{
  "startedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "repoRoot": "${REPO_ROOT}",
  "branch": "${CURRENT_BRANCH}",
  "frontendPort": ${FRONTEND_PORT},
  "backendPort": ${BACKEND_PORT}
}
EOF

echo ""
echo "=============================================================="
echo " Bootstrap complete. These services are launchd-supervised and"
echo " will keep running (and auto-restart on crash) independent of"
echo " this Terminal window or Claude Code session."
echo " Run 'npm run bootstrap:status' any time."
echo " Run 'npm run bootstrap:stop' to stop only what this started."
echo "=============================================================="
