"""Thin QUICK_FIX orchestration over the existing task, queue, Codex and checkpoint chain."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import subprocess
from threading import Thread
import time
from uuid import uuid4

from sqlalchemy import select

from app.core.task_asset.model import TaskAssetDB
from app.core.task_asset.service import create_task_asset
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import create_execution_session, get_execution_session, save_execution_session
from app.founder_ai.execution_worker import enqueue_execution, resume_execution
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.quick_fix_progression import build_quick_fix_contract, project_quick_fix_execution
from core.conversation_first.model import SinoBrainSessionDB

REPO_ROOT = Path(__file__).resolve().parents[3]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_projection(conversation_id: str, *, step: str | None = None, execution: dict | None = None,
                       blocker: dict | None = None, clear_blocker: bool = False) -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        route = dict(discovery.get("task_complexity_route") or {})
        if step and route.get("current_step") != step:
            route = project_quick_fix_execution(route, {"fix": "queued", "verify": "testing", "complete": "completed"}[step])
        if execution:
            route["autonomous_execution"] = {**dict(route.get("autonomous_execution") or {}), **execution}
        if blocker:
            route["execution_status"] = "blocked"
            route["technical_blocker"] = blocker
        elif clear_blocker:
            route.pop("technical_blocker", None)
        discovery["task_complexity_route"] = route
        discovery["quick_fix_contract"] = route.get("quick_fix_contract")
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        db.commit()
        return route


def _update_task(task_id: str, *, status: str, execution_status: str, result: dict | None = None) -> None:
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id)
        if task is None:
            return
        task.status = status
        task.execution_status = execution_status
        if result is not None:
            task.result = result
        db.commit()


def _build_package(goal: str, conversation_id: str, contract: dict, *, task_id: str) -> ExecutionPackage:
    from app.founder_ai.standard_task_execution import build_standard_task_contract
    scope_contract = build_standard_task_contract(
        conversation_id=conversation_id, goal=goal, task_id=task_id,
    )
    draft = TaskAssetDraft(
        title=goal[:200], description=goal, conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {
            "quick_fix_contract": contract, "standard_task_contract": scope_contract,
            "evidence": [{"source": "quick_fix_inspect", "fact": contract["observed_problem"], "relevance": contract["target_area"]}],
            "relevant_files": [{"path": path, "reason": "Frozen Quick Fix scope"} for path in contract["allowed_files_or_paths"]],
        }},
        constraints=[
            f"Only modify paths allowed by the Quick Fix Contract: {contract['allowed_files_or_paths']}",
            f"Never perform prohibited operations: {contract['prohibited_operations']}",
            "Stop and report a scope blocker instead of expanding the task.",
        ],
        risk="low", approval_required=False,
    )
    return ExecutionPackage(
        goal=goal, context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=[
            *list(contract["verification"]), *list(scope_contract.get("acceptance_criteria") or []),
        ],
        commit_requirement=(
            "After all verification passes, use the existing Autonomous Working Tree Resolution and "
            "Autonomous Checkpoint with exact-file staging; do not use git add . or git add -A, and do not push."
        ),
        approval_required=False, execution_allowed=True,
    )


def dispatch_quick_fix(*, conversation_id: str, goal: str, source_message_id: str | None = None,
                       enqueue=enqueue_execution) -> dict:
    """Create real execution lineage once inspect is evidence-bound, then enqueue Codex."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        route = dict(discovery.get("task_complexity_route") or {})
        if route.get("classification") != "QUICK_FIX" or route.get("clarification_required") or route.get("founder_gate_required"):
            return route
        existing = dict(route.get("autonomous_execution") or {})
        route_identity = dict(route.get("task_identity") or {})
        if existing.get("execution_session_id") and (not source_message_id or route_identity.get("source_message_id") == source_message_id):
            return route

    task = create_task_asset(
        title=goal[:200], description=goal, conversation_id=conversation_id,
        scope={"lane": "QUICK_FIX", "functional_verification": False}, status="in_progress",
        approval_status="not_required", execution_status="inspecting", source_message_id=source_message_id,
        target_module=(route.get("quick_fix_contract") or {}).get("target_area"),
        target_object=(route.get("quick_fix_contract") or {}).get("visual_target"),
    )
    if getattr(task, "duplicate_reason", None):
        from app.founder_ai.execution_registry import list_execution_sessions
        existing_session = next((item for item in sorted(list_execution_sessions(), key=lambda value: str(getattr(value, "updated_at", None) or value.created_at or ""), reverse=True)
                                 if item.task_asset_id == task.id and item.status not in {"failed", "cancelled"}), None)
        if existing_session and existing_session.status == "queued":
            enqueue(existing_session.id)
        elif existing_session and existing_session.status == "paused":
            resume_execution(existing_session.id)
        return _update_projection(conversation_id, execution={
            "task_id": task.id, "duplicate_of_task_id": task.id, "duplicate_reason": task.duplicate_reason,
            "dispatch_status": existing_session.status if existing_session else task.execution_status,
            **({"execution_session_id": existing_session.id,
                "execution_package_id": existing_session.execution_package_id}
               if existing_session else {}),
        })
    contract = build_quick_fix_contract(route, conversation_id=conversation_id, task_id=task.id)
    if contract["inspect_status"] != "ready_for_fix":
        _update_task(task.id, status="blocked", execution_status="clarification_required")
        return _update_projection(conversation_id, blocker={"type": "quick_fix_inspect_incomplete", "founder_gate_required": False})

    package = _build_package(goal, conversation_id, contract, task_id=task.id)
    execution_session = create_execution_session(task.id, package)
    package = replace(package, execution_allowed=True)
    execution_session.status = "queued"
    execution_session.queued_at = _now()
    execution_session.handoff_id = f"quick-fix-handoff-{uuid4().hex[:20]}"
    execution_session.readiness_contract_id = f"quick-fix-readiness-{uuid4().hex[:20]}"
    save_execution_session(execution_session, package)
    route["quick_fix_contract"] = contract
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {})
        route = dict(discovery.get("task_complexity_route") or route)
        route["quick_fix_contract"] = contract
        discovery["quick_fix_contract"] = contract
        discovery["task_complexity_route"] = route
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    route = _update_projection(conversation_id, step="fix", execution={
        "task_id": task.id, "execution_package_id": execution_session.execution_package_id,
        "readiness_contract_id": execution_session.readiness_contract_id, "handoff_id": execution_session.handoff_id,
        "execution_session_id": execution_session.id, "executor": execution_session.executor,
        "dispatch_status": "queued", "dispatched_at": _now(), "manual_codex_instruction_count": 0,
    })
    _update_task(task.id, status="in_progress", execution_status="queued")
    enqueue(execution_session.id)
    Thread(target=_monitor_execution, args=(conversation_id, task.id, execution_session.id), daemon=True, name=f"quick-fix-{execution_session.id}").start()
    return route


def _monitor_execution(conversation_id: str, task_id: str, execution_id: str) -> None:
    terminal = {"completed", "failed", "blocked", "cancelled"}
    while True:
        record = get_execution_session(execution_id)
        if record is None:
            return
        session, _package = record
        if session.status == "testing":
            try:
                _update_projection(conversation_id, step="verify", execution={"dispatch_status": "verifying"})
                _update_task(task_id, status="in_progress", execution_status="verifying")
            except ValueError:
                pass
        if session.status in terminal:
            break
        time.sleep(0.25)
    reconcile_quick_fix_execution(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id)


def reconcile_quick_fix_execution(*, conversation_id: str, task_id: str, execution_id: str, repo_root: Path = REPO_ROOT) -> dict:
    """Translate durable worker completion into verification/checkpoint/result projection."""
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Quick Fix execution session not found")
    session, _package = record
    if session.status != "completed":
        blocker = {"type": "quick_fix_execution_failed", "reason": session.failure_reason or session.error_message, "founder_gate_required": False}
        _update_task(task_id, status="blocked", execution_status=session.status, result=blocker)
        return _update_projection(conversation_id, blocker=blocker, execution={"dispatch_status": session.status})

    diff_check = subprocess.run(["git", "diff", "--check"], cwd=repo_root, capture_output=True, text=True, check=False)
    dirty = subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, capture_output=True, text=True, check=False).stdout.strip()
    command_evidence = list((session.result or {}).get("command_verification_evidence") or [])
    required_checks_pass = all(item.get("status") == "PASS" for item in command_evidence)
    verification = {
        "status": "PASS" if diff_check.returncode == 0 and required_checks_pass else "FAIL",
        "targeted_tests": list((session.result or {}).get("tests") or []),
        "git_diff_check": "PASS" if diff_check.returncode == 0 else "FAIL",
        "command_evidence": command_evidence,
        "working_tree": "clean" if not dirty else "dirty",
        "checkpoint_status": "CREATED" if session.commit_hash else "NOT_REQUESTED",
    }
    if verification["status"] != "PASS":
        blocker = {"type": "quick_fix_verification_failed", "evidence": verification, "founder_gate_required": False}
        _update_task(task_id, status="blocked", execution_status="verification_failed", result=blocker)
        return _update_projection(conversation_id, blocker=blocker, execution={"dispatch_status": "verification_failed", "verification": verification})

    result = {"status": "completed", "verification": verification, "checkpoint_commit": session.commit_hash, "completed_at": session.completed_at}
    _update_task(task_id, status="completed", execution_status="completed", result=result)
    try:
        _update_projection(conversation_id, step="verify", execution={"dispatch_status": "verifying", "verification": verification})
    except ValueError:
        pass
    return _update_projection(
        conversation_id, step="complete", clear_blocker=True,
        execution={"dispatch_status": "completed", "verification": verification, "result": result},
    )
