#!/usr/bin/env bash
# `npm run bootstrap:restart` — stop, then start, reusing the exact same
# safe stop/start semantics as `bootstrap:stop` and `bootstrap`
# (no separate implementation). Useful after pulling new code or when a
# service is stuck in a state you want to force-refresh from.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/developer-bootstrap-stop.sh"
echo ""
bash "${SCRIPT_DIR}/developer-bootstrap.sh" "$@"
