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
AICOS_DEV_BACKEND_LABEL="com.sinofut.ai-commerce-os.dev.backend"
AICOS_DEV_FRONTEND_LABEL="com.sinofut.ai-commerce-os.dev.frontend"
AICOS_RESIDENT_BACKEND_LABEL="com.sinofut.ai-commerce-os.backend"
AICOS_RESIDENT_FRONTEND_LABEL="com.sinofut.ai-commerce-os.frontend"
AICOS_LEGACY_LABELS=(com.aicommerceos.dev.backend com.aicommerceos.dev.frontend com.aicommerceos.dev.testwatch)

mkdir -p "${AICOS_RUNTIME}" "${AICOS_LOG_DIR}" "${AICOS_PLIST_DIR}"

job_loaded() { launchctl print "${AICOS_DOMAIN}/$1" >/dev/null 2>&1; }
job_pid() { launchctl print "${AICOS_DOMAIN}/$1" 2>/dev/null | awk -F'= ' '/^[[:space:]]*pid = /{print $2; exit}'; }
stop_job() { job_loaded "$1" && launchctl bootout "${AICOS_DOMAIN}/$1" >/dev/null || true; }
http_ok() { curl --silent --fail --max-time 3 "$1" >/dev/null 2>&1; }
listener_pids() { lsof -nP -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | sort -u; }

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
  local port pids pid cwd i
  for port in 5173 8000; do
    pids="$(listener_pids "$port" || true)"
    [ -z "$pids" ] && continue
    for pid in $pids; do
      [[ "$pid" =~ ^[0-9]+$ ]] || continue
      cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/{sub(/^n/,""); print; exit}')"
      if [[ "$cwd" == "${AICOS_ROOT}"* ]]; then
        echo "清理 AI Commerce OS 残留进程：端口 ${port}，PID ${pid}" >>"${AICOS_LOG_DIR}/bootstrap.log"
        kill -TERM "$pid"
        for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
        if kill -0 "$pid" 2>/dev/null; then
          echo "AI Commerce OS 残留进程 PID ${pid} 未能安全停止。" >&2
          return 1
        fi
      else
        echo "其他应用占用 ${port}（PID ${pid}），AI Commerce OS 不会自动换端口。" >&2
        return 1
      fi
    done
  done
  sleep 1
  [ -z "$(listener_pids 5173 || true)" ] && [ -z "$(listener_pids 8000 || true)" ]
}

start_job() {
  local label="$1" plist="$2"
  job_loaded "$label" || launchctl bootstrap "${AICOS_DOMAIN}" "$plist"
}
