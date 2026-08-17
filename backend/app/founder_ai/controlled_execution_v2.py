"""Execute only frozen read-only machine actions from Controlled Handoff v2."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
from urllib.request import urlopen

from sqlalchemy import text

from app.database.db import engine
from app.founder_ai.controlled_handoff import scope_fingerprint_v2


def session_start_guard(*, package: dict, handoff: dict, session, expected: dict, repo_root: Path) -> dict:
    action_contract = dict(package.get("active_machine_action_contract") or {})
    readiness = dict(package.get("execution_readiness_contract") or {})
    clean = not subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
    branch = subprocess.run(["git", "branch", "--show-current"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
    anchor_available = subprocess.run(["git", "merge-base", "--is-ancestor", handoff.get("repository_checkpoint", ""), "HEAD"], cwd=repo_root, check=False).returncode == 0
    checks = {
        "package_id": package.get("package_id") == expected["package_id"] == handoff.get("package_id") == session.execution_package_id,
        "readiness_contract_id": readiness.get("contract_id") == expected["readiness_contract_id"] == handoff.get("readiness_contract_id") == session.readiness_contract_id,
        "action_contract_id": action_contract.get("action_contract_id") == expected["action_contract_id"] == handoff.get("action_contract_id") == session.action_contract_id,
        "action_contract_fingerprint": action_contract.get("action_contract_fingerprint") == expected["action_contract_fingerprint"] == handoff.get("action_contract_fingerprint") == session.action_contract_fingerprint,
        "handoff_id": handoff.get("handoff_id") == expected["handoff_id"] == session.handoff_id,
        "session_id": session.id == expected["execution_session_id"],
        "scope_fingerprint": scope_fingerprint_v2(package, readiness, action_contract) == expected["scope_fingerprint"] == handoff.get("scope_fingerprint") == session.scope_fingerprint,
        "founder_approval": (package.get("approval_ref") or {}).get("status") == "approved",
        "runtime_binding": (package.get("runtime_binding") or {}).get("binding_status") == "passed",
        "preflight": package.get("preflight_status") == "ready",
        "execution_not_started": package.get("execution_status") == "not_started",
        "working_tree_clean": clean, "branch": branch == expected["branch"], "repository_anchor": anchor_available,
        "action_compilation": action_contract.get("compilation_status") == "action_compilation_ready",
        "blocked_actions": action_contract.get("blocked_action_count") == 0,
        "founder_decision": action_contract.get("founder_decision_required") is False,
        "session_created": session.status == "created" and session.execution_started_at is None,
        "machine_actions_frozen": handoff.get("machine_actions") == action_contract.get("actions"),
    }
    return {"allowed": all(checks.values()), "checks": checks, "branch": branch}


def _listener(port: int) -> bool:
    result = subprocess.run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN"], text=True, capture_output=True, check=False)
    return result.returncode == 0 and bool(result.stdout.strip())


def _execute_adapter(action: dict, repo_root: Path, previous: list[dict]) -> tuple[list[str], dict, str, str | None]:
    operation = action["operation_type"]
    target = action.get("target") or {}
    target_id = target.get("target_id")
    target_type = action.get("target_type")
    if operation == "VERIFY_CONNECTIVITY" and (target_id == "observed-runtime/storage/current-postgresql-development-database" or target_type == "postgresql_database"):
        try:
            with engine.connect() as connection:
                value = connection.execute(text("SELECT 1")).scalar_one()
            observed = {"connection_attempt_succeeded": value == 1, "secret_value_observed": False}
            return ["sqlalchemy.read_only_select_constant"], observed, "PASS" if value == 1 else "FAIL", None
        except Exception as error:
            return ["sqlalchemy.read_only_select_constant"], {"connection_attempt_succeeded": False, "error_type": type(error).__name__, "secret_value_observed": False}, "BLOCKED", "storage target unavailable"
    if operation == "VERIFY_CAPABILITY" and (target_id == "observed-runtime/compute/current-development-application-process" or target_type == "application_process"):
        port = int(target.get("port") or 8000)
        listener = _listener(port)
        health = False
        if listener:
            try:
                with urlopen(f"{target.get('protocol', 'http')}://{target.get('host', '127.0.0.1')}:{port}/health", timeout=3) as response:
                    health = response.status == 200
            except Exception:
                health = False
        observed = {"process_listener_running": listener, "health_probe_passed": health}
        return [f"local_listener_probe:{port}", "http_read_only_health_probe"], observed, "PASS" if listener and health else "FAIL", None
    if operation == "VERIFY_CONFIGURATION" and (target_id == "application-identity/intelligence-evolution-http-bearer-rbac" or target_type == "application_rbac_configuration"):
        auth = (repo_root / "backend/app/core/intelligence_evolution/auth.py").read_text(errors="replace")
        api = (repo_root / "backend/app/core/intelligence_evolution/api.py").read_text(errors="replace")
        checks = {"http_bearer": "HTTPBearer" in auth, "role_claims": 'claims.get("roles")' in auth, "protected_routes": "Depends(require_roles" in api, "secret_value_observed": False}
        passed = checks["http_bearer"] and checks["role_claims"] and checks["protected_routes"] and not checks["secret_value_observed"]
        return ["source_metadata_probe:application_rbac"], checks, "PASS" if passed else "FAIL", None
    if operation == "VERIFY_CONFIGURATION" and (target_id == "development-network/loopback/backend-8000-frontend-5173" or target_type == "development_loopback_boundary"):
        backend = (repo_root / "scripts/backend-server").read_text(errors="replace")
        frontend = (repo_root / "scripts/frontend-server").read_text(errors="replace")
        backend_target = target.get("backend") or {"host": "127.0.0.1", "port": 8000}
        frontend_target = target.get("frontend") or {"host": "127.0.0.1", "port": 5173}
        checks = {"backend_loopback_configured": f"--host {backend_target['host']} --port {backend_target['port']}" in backend, "frontend_loopback_configured": f"--host {frontend_target['host']} --port {frontend_target['port']}" in frontend, "backend_listener": _listener(int(backend_target["port"])), "frontend_listener": _listener(int(frontend_target["port"]))}
        return ["source_metadata_probe:loopback_boundary", f"local_listener_probe:{backend_target['port']},{frontend_target['port']}"], checks, "PASS" if all(checks.values()) else "FAIL", None
    if operation == "READ_ONLY_VALIDATE" and (target_id == "dependency-check/intelligence-evolution-layer/wi-007" or target_type == "runtime_readiness_dependencies"):
        required = list((action.get("inputs") or {}).get("depends_on") or ["wi-cloud-001", "wi-cloud-002", "wi-cloud-003", "wi-cloud-004"])
        prerequisites = [item for item in previous if item["work_item_id"] in set(required)]
        passed = len(prerequisites) == len(required) and all(item["status"] == "PASS" for item in prerequisites)
        observed = {"prerequisite_pass_count": sum(item["status"] == "PASS" for item in prerequisites), "required_count": len(required), "runtime_readiness_preconditions": passed}
        return ["in_memory_dependency_result_validation"], observed, "PASS" if passed else "BLOCKED", None if passed else "prerequisite action not PASS"
    return [], {"target_id": target_id}, "BLOCKED", "unsupported operation or target"


def execute_frozen_actions(*, handoff: dict, action_contract: dict, repo_root: Path) -> tuple[list[dict], dict]:
    frozen = handoff.get("machine_actions") or []
    canonical = {item["action_id"]: item for item in action_contract.get("actions") or []}
    results = []
    for action in frozen:
        started_at = datetime.now(timezone.utc).isoformat()
        source = canonical.get(action.get("action_id"))
        guard = bool(source and json.dumps(source, ensure_ascii=False, sort_keys=True) == json.dumps(action, ensure_ascii=False, sort_keys=True) and action.get("action_status") == "executable")
        dependencies = list((action.get("inputs") or {}).get("depends_on") or [])
        dependencies_pass = (not dependencies and action.get("work_item_id") != "wi-cloud-005") or all(item["status"] == "PASS" for item in results if item["work_item_id"] in set(dependencies or ["wi-cloud-001", "wi-cloud-002", "wi-cloud-003", "wi-cloud-004"]))
        if not guard:
            calls, observed, status, blocker = [], {}, "BLOCKED", "scope_guard_blocked"
        elif not dependencies_pass:
            calls, observed, status, blocker = [], {}, "BLOCKED", "BLOCKED_DEPENDENCY"
        else:
            calls, observed, status, blocker = _execute_adapter(action, repo_root, results)
        results.append({"action_id": action["action_id"], "work_item_id": action["work_item_id"], "started_at": started_at, "completed_at": datetime.now(timezone.utc).isoformat(), "operation_type": action["operation_type"], "target": action["target"], "evidence_refs": action["evidence_refs"], "side_effect_class": action["side_effect_class"], "commands_or_adapter_calls": calls, "observed_result": observed, "verification_result": status, "status": status, "blocker": blocker})
        if status != "PASS":
            break
    counts = {name: sum(item["status"] == name for item in results) for name in ("PASS", "FAIL", "BLOCKED")}
    final = "PASS" if len(results) == len(frozen) and counts["PASS"] == len(frozen) else "FAIL" if counts["FAIL"] else "BLOCKED"
    return results, {"result": final, "counts": counts, "scope_drift": any(item.get("blocker") == "scope_guard_blocked" for item in results)}
