#!/usr/bin/env bash
set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/runtime-common.sh"

PASS=0
FAIL=0
check() {
  local description="$1"
  shift
  if "$@"; then printf '  [PASS] %s\n' "$description"; PASS=$((PASS + 1));
  else printf '  [FAIL] %s\n' "$description"; FAIL=$((FAIL + 1)); fi
}
equals() { [ "$1" = "$2" ]; }
not() { ! "$@"; }

echo "Runtime process stability self-test"

# Process-tree ownership: a reload parent may own the inherited socket and its
# server child may also be reported by lsof. Both are valid members of one tree.
pid_parent() { case "$1" in 101) echo 100;; 102) echo 101;; 201) echo 999;; *) echo 1;; esac; }
listener_pids() { case "$1" in 5173) printf '101\n';; 8000) printf '100\n102\n';; 9000) printf '201\n';; esac; }
check "expected Vite descendant owns 5173" listener_owner_matches_tree 5173 100
check "expected Uvicorn parent/child tree owns 8000" listener_owner_matches_tree 8000 100
check "foreign listener is rejected" not listener_owner_matches_tree 9000 100
check "Vite ownership state is MATCH" equals "$(listener_ownership_state 5173 100)" MATCH
check "shared Uvicorn socket ownership state is MATCH" equals "$(listener_ownership_state 8000 100)" MATCH
check "confirmed foreign ownership state is FOREIGN" equals "$(listener_ownership_state 9000 100)" FOREIGN

# A process-table permission failure is uncertainty, not affirmative evidence
# that a listener belongs to a foreign process.
pid_parent() { return 2; }
check "permission denied ancestry is PROBE_UNAVAILABLE" equals "$(pid_ancestry_state 101 100)" PROBE_UNAVAILABLE
check "permission denied listener ownership is PROBE_UNAVAILABLE" equals "$(listener_ownership_state 5173 100)" PROBE_UNAVAILABLE
pid_parent() { return 1; }
check "nonzero process probe is PROBE_UNAVAILABLE" equals "$(pid_ancestry_state 101 100)" PROBE_UNAVAILABLE
pid_parent() { return 127; }
check "missing process-table probe is PROBE_UNAVAILABLE" equals "$(pid_ancestry_state 101 100)" PROBE_UNAVAILABLE

# Restore the deterministic process tree for the remaining checks.
pid_parent() { case "$1" in 101) echo 100;; 102) echo 101;; 201) echo 999;; *) echo 1;; esac; }
check "missing listener is NO_LISTENER" equals "$(listener_ownership_state 7000 100)" NO_LISTENER

# Supervisor authority: only loaded legacy labels are conflicts. Formal labels
# are intentionally not part of AICOS_LEGACY_LABELS.
MOCK_LEGACY_LOADED=""
job_loaded() { [ "$1" = "$MOCK_LEGACY_LOADED" ]; }
job_pid() { echo 777; }
MOCK_LEGACY_LOADED=""
check "legacy unloaded passes" not legacy_supervisor_conflict
MOCK_LEGACY_LOADED="com.aicommerceos.dev.backend"
check "legacy loaded is a supervisor conflict" legacy_supervisor_conflict
check "formal and legacy labels cannot silently coexist" equals "${AICOS_CONFLICT_DETAIL}" "com.aicommerceos.dev.backend (PID 777)"

# Process-health state matrix. HTTP unavailability is DEGRADED, never STOPPED.
MOCK_JOB=1; MOCK_OWNER_STATE=MATCH; MOCK_HTTP=1
job_loaded() { [ "$MOCK_JOB" -eq 1 ]; }
job_running() { [ "$MOCK_JOB" -eq 1 ]; }
job_pid() { echo 100; }
listener_ownership_state() { echo "$MOCK_OWNER_STATE"; }
port_listening() { [ "${MOCK_PORT_LISTENING:-1}" -eq 1 ]; }
http_ok() { [ "$MOCK_HTTP" -eq 1 ]; }
check "healthy process tree and HTTP is RUNNING" equals "$(process_health_state formal 5173 url)" RUNNING
MOCK_HTTP=0
check "unavailable HTTP with live owned process is DEGRADED" equals "$(process_health_state formal 5173 url)" DEGRADED
MOCK_HTTP=1; MOCK_OWNER_STATE=PROBE_UNAVAILABLE
check "unavailable ownership probe is DEGRADED" equals "$(process_health_state formal 5173 url)" DEGRADED
MOCK_OWNER_STATE=FOREIGN
check "foreign port owner is CONFLICT" equals "$(process_health_state formal 5173 url)" CONFLICT
MOCK_OWNER_STATE=MATCH; MOCK_JOB=0; MOCK_PORT_LISTENING=1
check "foreign listener without formal job is CONFLICT" equals "$(process_health_state formal 5173 url)" CONFLICT
MOCK_PORT_LISTENING=0
check "absent process is STOPPED" equals "$(process_health_state formal 5173 url)" STOPPED

# Stable readiness needs three consecutive successes. An explicit failed middle
# sample terminates the window and cannot be hidden by a later success.
AICOS_STABLE_READY_SAMPLES=3
AICOS_STABLE_READY_INTERVAL=0
ORIGINAL_READINESS_SAMPLE="$(declare -f readiness_sample)"
SEQUENCE="PASS PASS PASS"; SAMPLE_INDEX=0
readiness_sample() { SAMPLE_INDEX=$((SAMPLE_INDEX + 1)); [ "$(echo "$SEQUENCE" | awk -v n="$SAMPLE_INDEX" '{print $n}')" = PASS ]; }
check "three passing samples become READY" stable_readiness_window
SEQUENCE="PASS FAIL PASS"; SAMPLE_INDEX=0
check "PASS/FAIL/PASS does not become READY" not stable_readiness_window
unset -f readiness_sample
eval "$ORIGINAL_READINESS_SAMPLE"

# Heartbeat threshold follows the configured 15-second loop with a 45-second
# grace window. Business actual_state remains an independent displayed value.
fresh_json='{"actual_state":"stopped","last_heartbeat_at":"2999-01-01T00:00:00Z"}'
stale_json='{"actual_state":"running","last_heartbeat_at":"2000-01-01T00:00:00Z"}'
check "fresh backend heartbeat is accepted" heartbeat_fresh "$fresh_json"
check "stale backend heartbeat is rejected" not heartbeat_fresh "$stale_json"
check "business runtime stopped remains stopped" equals "$(json_field "$fresh_json" actual_state)" stopped

# Projection probes are independent: uncertain process ownership may degrade the
# process line, but successful HTTP/runtime probes retain their durable truth.
AICOS_PROJECTED_BACKEND_STATE=DEGRADED
project_runtime_truth DEGRADED HEALTHY "$fresh_json"
check "database remains Healthy during ownership probe uncertainty" equals "$AICOS_DATABASE_STATE" Healthy
check "heartbeat remains Fresh during ownership probe uncertainty" equals "$AICOS_HEARTBEAT_STATE" "Fresh (<=45s)"
check "business runtime remains stopped during ownership probe uncertainty" equals "$AICOS_BUSINESS_RUNTIME_STATE" stopped
check "lifecycle remains available during ownership probe uncertainty" equals "$AICOS_LIFECYCLE_STATE" "Backend-hosted / available"

# Admission reasons remain structured: stale heartbeat and ownership mismatch
# cannot be collapsed into a generic startup failure.
legacy_supervisor_conflict() { return 1; }
frontend_process_ready() { return "${MOCK_FRONTEND_READY_STATUS:-0}"; }
backend_process_ready() { return 0; }
health_components_ready() { return 0; }
http_ok() { return 0; }
runtime_status_json() { printf '%s' "$MOCK_RUNTIME_JSON"; }
MOCK_FRONTEND_READY_STATUS=0; MOCK_RUNTIME_JSON="$stale_json"
check "stale heartbeat blocks readiness" not readiness_sample
check "stale heartbeat has a truthful reason" equals "$AICOS_LAST_READINESS_REASON" BACKEND_HEARTBEAT_STALE
MOCK_FRONTEND_READY_STATUS=1; MOCK_RUNTIME_JSON="$fresh_json"
check "port ownership mismatch blocks readiness" not readiness_sample
check "ownership mismatch has a truthful reason" equals "$AICOS_LAST_READINESS_REASON" FRONTEND_PORT_OWNERSHIP_MISMATCH
MOCK_FRONTEND_READY_STATUS=2
check "ownership probe unavailable blocks full READY" not readiness_sample
check "ownership probe unavailable has an incomplete reason" equals "$AICOS_LAST_READINESS_REASON" "PROCESS_OWNERSHIP_PROBE_UNAVAILABLE: frontend"

printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
