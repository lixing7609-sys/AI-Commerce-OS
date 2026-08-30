#!/usr/bin/env bash
set -euo pipefail

RUNTIME_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AICOS_ROOT="$(cd "${RUNTIME_SCRIPT_DIR}/.." && pwd)"
AICOS_RUNTIME="${AICOS_ROOT}/.runtime/local-runtime"
AICOS_LOG_DIR="${AICOS_ROOT}/.runtime/logs"
AICOS_PLIST_DIR="${AICOS_RUNTIME}/launchd"
AICOS_DOMAIN="gui/$(id -u)"
AICOS_FRONTEND_URL="http://127.0.0.1:5173/"
AICOS_BACKEND_URL="http://127.0.0.1:8000/health"
AICOS_RUNTIME_STATUS_URL="http://127.0.0.1:8000/api/v1/runtime/status"
AICOS_DEV_BACKEND_LABEL="com.sinofut.ai-commerce-os.dev.backend"
AICOS_DEV_FRONTEND_LABEL="com.sinofut.ai-commerce-os.dev.frontend"
AICOS_RESIDENT_BACKEND_LABEL="com.sinofut.ai-commerce-os.backend"
AICOS_RESIDENT_FRONTEND_LABEL="com.sinofut.ai-commerce-os.frontend"
AICOS_LEGACY_LABELS=(com.aicommerceos.dev.backend com.aicommerceos.dev.frontend com.aicommerceos.dev.testwatch)
AICOS_HEARTBEAT_FRESH_SECONDS="${AICOS_HEARTBEAT_FRESH_SECONDS:-45}"
AICOS_STABLE_READY_SAMPLES="${AICOS_STABLE_READY_SAMPLES:-3}"
AICOS_STABLE_READY_INTERVAL="${AICOS_STABLE_READY_INTERVAL:-3}"

mkdir -p "${AICOS_RUNTIME}" "${AICOS_LOG_DIR}" "${AICOS_PLIST_DIR}"

job_loaded() { launchctl print "${AICOS_DOMAIN}/$1" >/dev/null 2>&1; }
job_pid() { launchctl print "${AICOS_DOMAIN}/$1" 2>/dev/null | awk -F'= ' '/^[[:space:]]*pid = /{print $2; exit}'; }
job_running() { launchctl print "${AICOS_DOMAIN}/$1" 2>/dev/null | grep -q 'state = running'; }
stop_job() { job_loaded "$1" && launchctl bootout "${AICOS_DOMAIN}/$1" >/dev/null || true; }
http_ok() { curl --silent --fail --max-time 3 "$1" >/dev/null 2>&1; }
listener_pids() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | sort -u; }
port_listening() { [ -n "$(listener_pids "$1" || true)" ]; }

pid_parent() { ps -o ppid= -p "$1" 2>/dev/null | tr -d ' '; }
pid_command() { ps -o command= -p "$1" 2>/dev/null; }

is_descendant_pid() {
  local child="$1" ancestor="$2" parent steps=0
  [[ "$child" =~ ^[0-9]+$ && "$ancestor" =~ ^[0-9]+$ ]] || return 1
  while [ "$child" -gt 1 ] && [ "$steps" -lt 64 ]; do
    [ "$child" = "$ancestor" ] && return 0
    parent="$(pid_parent "$child")"
    [[ "$parent" =~ ^[0-9]+$ ]] || return 1
    [ "$parent" = "$child" ] && return 1
    child="$parent"
    steps=$((steps + 1))
  done
  [ "$child" = "$ancestor" ]
}

listener_owner_matches_tree() {
  local port="$1" root_pid="$2" pid found=0
  [[ "$root_pid" =~ ^[0-9]+$ ]] || return 1
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    found=1
    is_descendant_pid "$pid" "$root_pid" || return 1
  done < <(listener_pids "$port")
  [ "$found" -eq 1 ]
}

tree_has_command() {
  local root_pid="$1" pattern="$2" pid
  [[ "$root_pid" =~ ^[0-9]+$ ]] || return 1
  while IFS= read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    if is_descendant_pid "$pid" "$root_pid" && pid_command "$pid" | grep -Eq "$pattern"; then
      return 0
    fi
  done < <(ps -axo pid= 2>/dev/null | tr -d ' ')
  return 1
}

legacy_supervisor_conflict() {
  local label pid conflicts=()
  for label in "${AICOS_LEGACY_LABELS[@]}"; do
    if job_loaded "$label"; then
      pid="$(job_pid "$label")"
      conflicts+=("${label}${pid:+ (PID ${pid})}")
    fi
  done
  [ "${#conflicts[@]}" -eq 0 ] && return 1
  AICOS_CONFLICT_DETAIL="$(IFS=', '; echo "${conflicts[*]}")"
  return 0
}

runtime_status_json() { curl --silent --fail --max-time 3 "${AICOS_RUNTIME_STATUS_URL}" 2>/dev/null; }

json_field() {
  local payload="$1" field="$2"
  "${AICOS_ROOT}/backend/.venv/bin/python" -c 'import json,sys; value=json.loads(sys.stdin.read()); print(value.get(sys.argv[1], ""))' "$field" <<<"$payload" 2>/dev/null
}

heartbeat_age_seconds() {
  local payload="$1"
  "${AICOS_ROOT}/backend/.venv/bin/python" -c 'import json,sys; from datetime import datetime,timezone; value=json.loads(sys.stdin.read()).get("last_heartbeat_at"); stamp=datetime.fromisoformat(value.replace("Z", "+00:00")); print(max(0, int((datetime.now(timezone.utc)-stamp).total_seconds())))' <<<"$payload" 2>/dev/null
}

heartbeat_fresh() {
  local payload="$1" age
  age="$(heartbeat_age_seconds "$payload")" || return 1
  [[ "$age" =~ ^[0-9]+$ ]] && [ "$age" -le "$AICOS_HEARTBEAT_FRESH_SECONDS" ]
}

health_components_ready() {
  local payload
  payload="$(curl --silent --fail --max-time 3 "${AICOS_BACKEND_URL}" 2>/dev/null)" || return 1
  "${AICOS_ROOT}/backend/.venv/bin/python" -c 'import json,sys; v=json.loads(sys.stdin.read()); raise SystemExit(0 if v.get("status")=="ok" and v.get("database")=="healthy" and v.get("migration")=="head" else 1)' <<<"$payload" 2>/dev/null
}

frontend_process_ready() {
  local root_pid
  job_loaded "$AICOS_DEV_FRONTEND_LABEL" && job_running "$AICOS_DEV_FRONTEND_LABEL" || return 1
  root_pid="$(job_pid "$AICOS_DEV_FRONTEND_LABEL")"
  listener_owner_matches_tree 5173 "$root_pid" || return 1
  tree_has_command "$root_pid" '(^|/)vite( |$)|node .*/vite' || return 1
}

backend_process_ready() {
  local root_pid
  job_loaded "$AICOS_DEV_BACKEND_LABEL" && job_running "$AICOS_DEV_BACKEND_LABEL" || return 1
  root_pid="$(job_pid "$AICOS_DEV_BACKEND_LABEL")"
  listener_owner_matches_tree 8000 "$root_pid" || return 1
  tree_has_command "$root_pid" 'multiprocessing\.spawn|spawn_main' || return 1
}

process_health_state() {
  local label="$1" port="$2" url="$3" root_pid
  if ! job_loaded "$label" || ! job_running "$label"; then
    if port_listening "$port"; then echo CONFLICT; else echo STOPPED; fi
    return
  fi
  root_pid="$(job_pid "$label")"
  if ! listener_owner_matches_tree "$port" "$root_pid"; then echo CONFLICT; return; fi
  if ! http_ok "$url"; then echo DEGRADED; return; fi
  echo RUNNING
}

readiness_sample() {
  local runtime_json
  AICOS_LAST_READINESS_REASON=""
  if legacy_supervisor_conflict; then AICOS_LAST_READINESS_REASON="SUPERVISOR_CONFLICT: ${AICOS_CONFLICT_DETAIL}"; return 1; fi
  if ! frontend_process_ready; then AICOS_LAST_READINESS_REASON="FRONTEND_PORT_OWNERSHIP_MISMATCH"; return 1; fi
  if ! http_ok "$AICOS_FRONTEND_URL"; then AICOS_LAST_READINESS_REASON="FRONTEND_HEALTH_UNAVAILABLE"; return 1; fi
  if ! backend_process_ready; then AICOS_LAST_READINESS_REASON="BACKEND_PORT_OWNERSHIP_MISMATCH"; return 1; fi
  if ! http_ok "$AICOS_BACKEND_URL"; then AICOS_LAST_READINESS_REASON="BACKEND_HEALTH_UNAVAILABLE"; return 1; fi
  if ! health_components_ready; then AICOS_LAST_READINESS_REASON="DATABASE_NOT_READY"; return 1; fi
  runtime_json="$(runtime_status_json)" || { AICOS_LAST_READINESS_REASON="BACKEND_HEALTH_UNAVAILABLE"; return 1; }
  if ! heartbeat_fresh "$runtime_json"; then AICOS_LAST_READINESS_REASON="BACKEND_HEARTBEAT_STALE"; return 1; fi
  return 0
}

stable_readiness_window() {
  local sample
  for ((sample=1; sample<=AICOS_STABLE_READY_SAMPLES; sample++)); do
    readiness_sample || return 1
    [ "$sample" -eq "$AICOS_STABLE_READY_SAMPLES" ] || sleep "$AICOS_STABLE_READY_INTERVAL"
  done
}

wait_http() {
  local url="$1" seconds="${2:-45}" i
  for ((i=0; i<seconds; i++)); do http_ok "$url" && return 0; sleep 1; done
  return 1
}

write_plist() {
  local path="$1" label="$2" workdir="$3" program="$4" log="$5" reload="${6:-0}"
  cat >"${path}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${program}</string></array>
<key>WorkingDirectory</key><string>${workdir}</string>
<key>EnvironmentVariables</key><dict>
<key>AICOS_RELOAD</key><string>${reload}</string>
<key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
</dict>
<key>StandardOutPath</key><string>${log}</string>
<key>StandardErrorPath</key><string>${log}</string>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>
EOF
  plutil -lint "${path}" >/dev/null
}

assert_ports_free() {
  local port pids pid cwd
  for port in 5173 8000; do
    pids="$(listener_pids "$port" || true)"
    [ -z "$pids" ] && continue
    for pid in $pids; do
      [[ "$pid" =~ ^[0-9]+$ ]] || continue
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/{sub(/^n/,""); print; exit}')"
      echo "PORT_OWNERSHIP_CONFLICT: 端口 ${port} 已由 PID ${pid} 占用${cwd:+（${cwd}）}。" >&2
      return 1
    done
  done
  [ -z "$(listener_pids 5173 || true)" ] && [ -z "$(listener_pids 8000 || true)" ]
}

start_job() {
  local label="$1" plist="$2"
  job_loaded "$label" || launchctl bootstrap "${AICOS_DOMAIN}" "$plist"
}
