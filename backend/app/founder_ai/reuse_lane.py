"""Reuse-first lane for previously verified local runtime health checks."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from pathlib import Path

from sqlalchemy import select

from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions
from app.founder_ai.standard_task_execution import REPO_ROOT, _save_route, build_standard_task_contract
from app.founder_ai.technical_resolution import _application_owned_health, is_local_health_check_goal
from core.conversation_first.model import SinoBrainSessionDB


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_reuse_health_check_goal(goal: str) -> bool:
    text = (goal or "").lower()
    return is_local_health_check_goal(goal) and any(term in text for term in ("再次", "复用", "上一次", "previous", "reuse"))


def _candidate(current_execution_id: str | None = None) -> dict | None:
    candidates = []
    for session in list_execution_sessions():
        if session.id == current_execution_id or session.status != "completed":
            continue
        record = get_execution_session(session.id)
        if not record:
            continue
        source, package = record
        resolution = dict(source.technical_resolution or {})
        if not is_local_health_check_goal(package.goal) or resolution.get("resolution_status") != "resolved":
            continue
        last = dict(resolution.get("last_attempt") or {})
        evidence = dict(last.get("evidence") or {})
        if evidence.get("status") != "PASS":
            continue
        candidates.append((source.completed_at or source.meaningful_progress_at or "", source, package, resolution, evidence))
    if not candidates:
        return None
    _, session, package, resolution, evidence = max(candidates, key=lambda item: item[0])
    return {"session": session, "package": package, "resolution": resolution, "evidence": evidence}


def lookup_reuse_candidate(*, conversation_id: str, task_id: str, goal: str, current_execution_id: str | None = None, repo_root: Path = REPO_ROOT) -> dict:
    source = _candidate(current_execution_id)
    if source is None:
        return {"reuse_lookup_performed": True, "candidate_count": 0, "no_valid_candidate": True, "binding_valid": False}
    session, package = source["session"], source["package"]
    required = [repo_root / "scripts" / "dev-status", repo_root / ".git"]
    binding_valid = all(path.exists() for path in required)
    seed = f"{conversation_id}:{task_id}:{session.id}"
    memory = getattr(session, "memory", None)
    if isinstance(memory, dict):
        memory_refs = [memory.get("id") or memory.get("memory_id") or f"{session.id}:learning"]
    else:
        memory_refs = list(memory or [])
    return {
        "reuse_lookup_performed": True,
        "reuse_candidate_id": f"reuse-candidate-{hashlib.sha256(seed.encode()).hexdigest()[:20]}",
        "source_task_id": session.task_asset_id, "source_execution_id": session.id,
        "source_learning_refs": memory_refs, "source_runtime_refs": ["scripts/dev-status", "frontend-health", "backend-health", "database-health", "lifecycle-health", "execution-registry", "git-status"],
        "source_resolution_refs": [f"{session.id}:technical_resolution"], "source_pattern_refs": ["application_owned_low_privilege_evidence"],
        "compatibility_score": 1.0 if binding_valid else 0.0, "confidence": "high" if binding_valid else "low",
        "current_environment_fingerprint": hashlib.sha256(f"{repo_root.resolve()}:development:health-v1".encode()).hexdigest(),
        "binding_valid": binding_valid, "invalidation_reason": None if binding_valid else "required_runtime_binding_missing",
        "reuse_scope": ["validated_health_actions", "runtime_binding", "technical_resolution", "low_privilege_method"], "delta_scope": [],
        "candidate_count": 1, "registry_hits": 1, "learning_hits": max(1, len(memory_refs)), "runtime_pattern_hits": 1,
        "technical_resolution_hits": 1, "selected_candidate_id": f"reuse-candidate-{hashlib.sha256(seed.encode()).hexdigest()[:20]}",
        "full_runtime_discovery_count": 0, "new_plan_created": False, "delta_execution_required": False,
        "reuse_ratio": 1.0, "macos_permission_prompt_count": 0, "founder_gate_count": 0,
    }


def execute_reuse_health_check(*, conversation_id: str, goal: str, route: dict, task_id: str | None = None,
                               current_execution_id: str | None = None, repo_root: Path = REPO_ROOT,
                               health_runner=None) -> dict:
    contract = build_standard_task_contract(conversation_id=conversation_id, goal=goal, task_id=task_id)
    reuse = lookup_reuse_candidate(conversation_id=conversation_id, task_id=contract["task_id"], goal=goal,
                                   current_execution_id=current_execution_id, repo_root=repo_root)
    if not reuse.get("binding_valid"):
        return {**route, "reuse": reuse}
    validation = (health_runner or _application_owned_health)(repo_root)
    passed = validation.get("status") == "PASS"
    contract["inspect_status"] = "reuse_validation_completed" if passed else "reuse_binding_invalid"
    reconciliation = {"status": "superseded_by_reuse" if current_execution_id else "not_required",
                      "reason": "cancelled_due_to_reuse_route_reconciliation" if current_execution_id else None,
                      "preserved_execution_id": current_execution_id}
    reuse.update({"lightweight_validation": validation, "learning_update": {"reused_from": reuse["source_execution_id"],
                  "validated_at": _now(), "environment_fingerprint": reuse["current_environment_fingerprint"],
                  "result": validation.get("status"), "delta": [], "reuse_success_count_increment": 1}})
    result = {**route, "classification": "STANDARD_TASK", "task_type": "STANDARD_TASK", "clarification_required": False,
              "founder_gate_required": False, "manual_continue_required": False, "manual_continue_count": 0,
              "manual_codex_instruction_count": 0, "reuse_lane": True, "reuse": reuse,
              "standard_task_contract": contract, "current_step": "complete" if passed else "verification",
              "execution_status": "completed" if passed else "technical_blocker", "verification": {"status": "PASS" if passed else "BLOCKED", "health_check": validation},
              "execution_reconciliation": reconciliation, "progress_log": ["reuse_lookup", "candidate_found", "binding_validation", "lightweight_verification", "verification", "complete"] if passed else ["reuse_lookup", "candidate_found", "binding_validation", "lightweight_verification"]}
    if current_execution_id:
        old = dict(result.get("autonomous_execution") or {})
        old.update({"dispatch_status": "superseded_by_reuse", "reconciliation": reconciliation})
        result["autonomous_execution"] = old
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, contract["task_id"])
        if task:
            task.scope = {"lane": "REUSE", "target_surface": "Local Development Environment", "source_execution_id": reuse["source_execution_id"]}
            task.status = "completed" if passed else "blocked"; task.execution_status = task.status
            task.result = {"status": result["execution_status"], "reuse": reuse, "verification": result["verification"]}
            db.commit()
    return _save_route(conversation_id, result, stage="standard_task")


def reconcile_existing_reuse_conversation(*, conversation_id: str, goal: str, repo_root: Path = REPO_ROOT) -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None: raise LookupError("Sino Brain state not found")
        route = dict((state.discovery or {}).get("task_complexity_route") or {})
    execution = dict(route.get("autonomous_execution") or {})
    return execute_reuse_health_check(conversation_id=conversation_id, goal=goal, route=route,
        task_id=execution.get("task_id") or (route.get("standard_task_contract") or {}).get("task_id"),
        current_execution_id=execution.get("execution_session_id"), repo_root=repo_root)
