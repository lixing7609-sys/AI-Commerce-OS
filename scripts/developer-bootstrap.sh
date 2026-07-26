#!/usr/bin/env bash
# Developer Bootstrap — the one command for daily AI Commerce OS startup
# after a Mac restart: `npm run bootstrap` (from the repo root).
#
# Coordinates the actual development environment instead of aliasing
# `npm run dev`: validates prerequisites, shows Git safety state, starts
# only the services this repository actually needs (frontend always;
# backend only when its Postgres dependency is reachable; a Vitest watch
# process), opens a four-Terminal-tab workflow, and opens the three
# edition URLs once the frontend is ready. Safe to re-run — it detects
# already-running services and reuses them rather than starting
# duplicates. Never touches Git history (no pull/checkout/reset/stash/
# commit/push/rebase) and never kills a process it did not start itself.
#
# Modes:
#   npm run bootstrap                  normal interactive startup
#   npm run bootstrap -- --dry-run     print the plan, start nothing
#   npm run bootstrap -- --no-browser  skip opening browser tabs
#   npm run bootstrap -- --no-claude   skip launching Claude Code in Terminal 4
#
# See docs/02-engineering/developer-bootstrap.md for the full write-up.

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
  local cmd="$1" label="$2" required="$3"
  if command -v "$cmd" >/dev/null 2>&1; then
    local version
    version="$("$cmd" --version 2>&1 | head -1)"
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
# E. Start required services
# ----------------------------------------------------------------------
echo ""
echo "-- Services ---------------------------------------------------------"

# Frontend ---------------------------------------------------------------
if port_listening "${FRONTEND_PORT}"; then
  bootstrap_log INFO "frontend: already listening on :${FRONTEND_PORT} — reusing, not starting a duplicate"
elif $DRY_RUN; then
  echo "  frontend: would start 'npm run dev -- --port ${FRONTEND_PORT}' in frontend/, log -> ${FRONTEND_LOG}"
else
  bootstrap_log INFO "frontend: starting on :${FRONTEND_PORT}"
  (cd "${FRONTEND_DIR}" && nohup npm run dev -- --port "${FRONTEND_PORT}" >"${FRONTEND_LOG}" 2>&1 & echo $! >"${FRONTEND_PID_FILE}")
fi

# Backend — only if its Postgres dependency is actually reachable. There
# is no docker-compose.yml in this repository to provision Postgres, so
# the bootstrap never attempts to create or start a database container;
# it only checks whether one is already reachable and gives guidance if
# not, per "do not fabricate unavailable infrastructure."
BACKEND_SKIPPED_REASON=""
if port_listening "${BACKEND_PORT}"; then
  bootstrap_log INFO "backend: already listening on :${BACKEND_PORT} — reusing, not starting a duplicate"
elif ! command -v uv >/dev/null 2>&1; then
  BACKEND_SKIPPED_REASON="uv is not installed"
elif ! tcp_reachable "${POSTGRES_HOST}" "${POSTGRES_PORT}"; then
  BACKEND_SKIPPED_REASON="Postgres is not reachable at ${POSTGRES_HOST}:${POSTGRES_PORT}"
fi

if [ -n "${BACKEND_SKIPPED_REASON}" ]; then
  bootstrap_log WARN "backend: skipped — ${BACKEND_SKIPPED_REASON}."
  echo "    Founder modules that call the backend will show a visible 'backend unavailable' state; this is expected and safe."
  echo "    To start the backend: ensure Postgres is reachable (this repo expects it at ${POSTGRES_HOST}:${POSTGRES_PORT}, e.g. via your existing Docker container), then re-run 'npm run bootstrap'."
elif $DRY_RUN; then
  echo "  backend: would run 'uv run alembic upgrade head' then 'uv run uvicorn app.main:app --reload --port ${BACKEND_PORT}' in backend/, log -> ${BACKEND_LOG}"
else
  bootstrap_log INFO "backend: Postgres reachable — running migrations then starting on :${BACKEND_PORT}"
  if ! (cd "${BACKEND_DIR}" && uv run alembic upgrade head); then
    bootstrap_log ERROR "backend: 'alembic upgrade head' failed — backend not started. Frontend continues regardless."
  else
    (cd "${BACKEND_DIR}" && nohup uv run uvicorn app.main:app --reload --port "${BACKEND_PORT}" >"${BACKEND_LOG}" 2>&1 & echo $! >"${BACKEND_PID_FILE}")
  fi
fi

# Test watcher -------------------------------------------------------------
if pid_alive "${TESTWATCH_PID_FILE}"; then
  bootstrap_log INFO "test watcher: already running (pid $(cat "${TESTWATCH_PID_FILE}")) — reusing"
elif $DRY_RUN; then
  echo "  test watcher: would start 'npx vitest watch' in frontend/, log -> ${TESTWATCH_LOG}"
else
  bootstrap_log INFO "test watcher: starting 'vitest watch'"
  (cd "${FRONTEND_DIR}" && nohup npx vitest watch >"${TESTWATCH_LOG}" 2>&1 & echo $! >"${TESTWATCH_PID_FILE}")
fi

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

# ----------------------------------------------------------------------
# Wait for frontend readiness
# ----------------------------------------------------------------------
echo ""
echo "-- Waiting for frontend readiness ------------------------------------"
READY=false
for i in $(seq 1 "${READY_TIMEOUT_SECONDS}"); do
  if curl -s -o /dev/null -m 2 "http://localhost:${FRONTEND_PORT}/"; then
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
if [ -f "${SCRIPT_DIR}/developer-bootstrap-terminal.applescript" ]; then
  CLAUDE_TAB_CMD="echo 'Claude Code not launched: --no-claude or claude not found'; exec \$SHELL -l"
  if $OPEN_CLAUDE && [ -n "${CLAUDE_CMD}" ]; then
    CLAUDE_TAB_CMD="cd '${REPO_ROOT}' && exec '${CLAUDE_CMD}'"
  fi
  osascript "${SCRIPT_DIR}/developer-bootstrap-terminal.applescript" \
    "cd '${REPO_ROOT}' && echo '== frontend (and backend, if running) ==' && echo 'frontend log: ${FRONTEND_LOG}' && echo 'backend log:  ${BACKEND_LOG}' && tail -f '${FRONTEND_LOG}'" \
    "cd '${REPO_ROOT}' && echo '== test watcher ==' && tail -f '${TESTWATCH_LOG}'" \
    "cd '${REPO_ROOT}' && echo '== git ==' && git status && echo '' && git log --oneline -5 && exec \$SHELL -l" \
    "${CLAUDE_TAB_CMD}" \
    || bootstrap_log WARN "could not drive Terminal.app via osascript (this is non-fatal — services above are already running)"
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
echo " Bootstrap complete. Run 'npm run bootstrap:status' any time."
echo " Run 'npm run bootstrap:stop' to stop only what this started."
echo "=============================================================="
