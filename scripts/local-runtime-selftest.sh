#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
required=(dev-start dev-stop dev-restart dev-status dev-logs resident-start resident-stop backend-server frontend-server runtime-process-stability-selftest.sh)
for name in "${required[@]}"; do test -x "${ROOT}/scripts/${name}"; done
grep -q -- '--host 127.0.0.1 --port 5173 --strictPort' "${ROOT}/scripts/frontend-server"
grep -q -- '-m uvicorn' "${ROOT}/scripts/backend-server"
! grep -R -q 'pkill\|killall' "${ROOT}/scripts/dev-"* "${ROOT}/scripts/resident-"*
grep -q "strictPort: true" "${ROOT}/frontend/vite.config.js"
bash "${ROOT}/scripts/runtime-process-stability-selftest.sh"
echo "Local runtime self-test PASS"
