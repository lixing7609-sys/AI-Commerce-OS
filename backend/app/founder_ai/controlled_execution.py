"""Start a frozen handoff only after identity checks and continuous scope guarding."""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import subprocess

from app.founder_ai.controlled_handoff import scope_fingerprint


def start_precondition_checks(*, package: dict, session, expected: dict, repo_root: Path) -> dict:
    readiness = dict(package.get("execution_readiness_contract") or {})
    handoff = dict(package.get("executor_handoff") or {})
    live_fingerprint = scope_fingerprint(package, readiness)
    branch = subprocess.run(["git", "branch", "--show-current"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--porcelain=v1", "--untracked-files=all"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.splitlines()
    anchor = handoff.get("checkpoint_commit")
    anchor_available = bool(anchor and subprocess.run(["git", "cat-file", "-e", f"{anchor}^{{commit}}"], cwd=repo_root, capture_output=True).returncode == 0)
    return {
        "package_id": package.get("package_id") == expected["package_id"],
        "readiness_contract_id": readiness.get("contract_id") == expected["readiness_contract_id"],
        "handoff_id": handoff.get("handoff_id") == expected["handoff_id"] == session.handoff_id,
        "execution_session_id": session.id == expected["execution_session_id"],
        "scope_fingerprint": live_fingerprint == expected["scope_fingerprint"] == handoff.get("scope_fingerprint") == session.scope_fingerprint,
        "founder_approval": (package.get("approval_ref") or {}).get("status") == "approved",
        "runtime_binding": (package.get("runtime_binding") or {}).get("binding_status") == "passed",
        "preflight": package.get("preflight_status") == "ready",
        "execution_readiness": readiness.get("readiness_status") == "execution_readiness_ready",
        "working_tree_clean": not dirty,
        "branch": branch == expected["branch"],
        "rollback_anchor": anchor == expected["checkpoint_commit"] and anchor_available,
        "session_created": session.status == "created" and session.started_at is None and session.execution_started_at is None,
    }


def scope_guard(handoff: dict) -> dict:
    """Require machine-executable action descriptors before any tool or mutation."""
    operations = list(handoff.get("allowed_operations") or [])
    required = {"operation_type", "target", "side_effect_class"}
    incomplete = [item for item in operations if not isinstance(item, dict) or not required.issubset(item)]
    if incomplete:
        return {
            "allowed": False, "status": "scope_guard_blocked", "reason": "Frozen Handoff contains approved operation descriptions but no machine-executable operation_type, concrete target, and side-effect class. Executor may not infer them.",
            "blocked_operations": [item.get("work_item_id") for item in incomplete if isinstance(item, dict)],
            "route": "sino_brain", "founder_gate_reentry": False,
        }
    return {"allowed": True, "status": "scope_guard_passed", "reason": "All actions are machine-bounded.", "blocked_operations": [], "route": None, "founder_gate_reentry": False}


def blocked_execution_result(*, package: dict, session, handoff: dict, guard: dict, started_at: str) -> dict:
    completed_at = datetime.now(timezone.utc).isoformat()
    return {
        "execution_session_id": session.id, "package_id": package.get("package_id"), "handoff_id": handoff.get("handoff_id"),
        "scope_fingerprint": handoff.get("scope_fingerprint"), "execution_status": "blocked",
        "files_changed": [], "files_created": [], "files_deleted": [], "commands_executed": [],
        "verification_results": {"result": "BLOCKED", "reason": guard.get("reason"), "checks_executed": []},
        "artifacts": [], "blockers": [guard], "founder_gate_reentry": False,
        "started_at": started_at, "completed_at": completed_at,
        "side_effects": {"LOCAL_SYSTEM_STATE": ["session_started", "scope_guard_evaluated"], "LOCAL_REPOSITORY_SIDE_EFFECT": [], "LOCAL_RUNTIME_SIDE_EFFECT": [], "EXTERNAL_SERVICE_SIDE_EFFECT": [], "CLOUD_INFRASTRUCTURE_SIDE_EFFECT": [], "PRODUCTION_SIDE_EFFECT": []},
        "rollback_anchor": handoff.get("checkpoint_commit"), "scope_drift": False,
    }
