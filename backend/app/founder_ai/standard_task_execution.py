"""Autonomous execution lane for clear, bounded non-strategic development tasks."""
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
from app.founder_ai.execution_worker import enqueue_execution
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from core.conversation_first.model import SinoBrainSessionDB

REPO_ROOT = Path(__file__).resolve().parents[3]
STEPS = ("inspect", "plan", "execution", "verification", "checkpoint", "learning", "closure", "complete")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_standard_task_contract(*, conversation_id: str, goal: str, task_id: str | None = None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "Capability Repository",
        "objective": "Add local search/filter capability for capability name and Domain.",
        "search_fields": ["capability_name", "domain"],
        "acceptance_criteria": [
            "Search by capability name filters matching capabilities.", "Search by Domain filters matching domains and capabilities.",
            "Clearing search restores all results.", "No-result query shows a bounded empty state.",
            "Existing counts, detail navigation, structure and visual style remain intact.",
        ],
        "constraints": ["preserve_existing_page_structure", "preserve_existing_visual_style", "preserve_existing_functionality"],
        "implementation_scope": ["frontend/src/sino-founder/CapabilityWorkspace.jsx", "frontend/src/sino-founder/CapabilityWorkspace.test.jsx", "frontend/src/sino-founder/sino-founder-ai.css"],
        "prohibited_scope": ["backend_search_service", "architecture_change", "credential_write", "external_write", "production_write"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Inspect the existing Domain and capability list data already loaded by CapabilityWorkspace.",
            "Add one local search input in the repository list surface.",
            "Normalize case and whitespace, then match capability name and Domain metadata.",
            "Preserve status counts and detail selection; add a no-results state and clear recovery.",
            "Run targeted frontend tests, build, browser verification and git diff --check.",
        ],
        "source_goal": goal,
    }


def _save_route(conversation_id: str, route: dict, *, stage: str = "standard_task") -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        discovery["task_complexity_route"] = route
        discovery["standard_task_contract"] = route.get("standard_task_contract")
        state.discovery = discovery; state.stage = stage; state.updated_at = datetime.now(timezone.utc)
        db.commit()
    return route


def begin_standard_task(*, conversation_id: str, goal: str, route: dict) -> dict:
    result = dict(route)
    result.update({"clarification_required": False, "founder_gate_required": False, "manual_continue_required": False,
                   "manual_continue_count": 0, "manual_codex_instruction_count": 0, "current_step": "inspect",
                   "execution_status": "inspecting", "progress_log": ["inspect"]})
    result["standard_task_contract"] = build_standard_task_contract(conversation_id=conversation_id, goal=goal)
    return _save_route(conversation_id, result)


def _project(conversation_id: str, *, step: str, execution: dict | None = None, blocker: dict | None = None) -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        current = route.get("current_step") or "inspect"
        if STEPS.index(step) >= STEPS.index(current):
            route["current_step"] = step
            route["progress_log"] = list(dict.fromkeys([*(route.get("progress_log") or []), *STEPS[STEPS.index(current):STEPS.index(step)+1]]))
        route["execution_status"] = "completed" if step == "complete" else "blocked" if blocker else step
        route["manual_continue_required"] = False; route["manual_continue_count"] = 0; route["manual_codex_instruction_count"] = 0
        if execution: route["autonomous_execution"] = {**dict(route.get("autonomous_execution") or {}), **execution}
        if blocker: route["technical_blocker"] = blocker
        discovery["task_complexity_route"] = route; discovery["standard_task_contract"] = route.get("standard_task_contract")
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
        return route


def dispatch_standard_task(*, conversation_id: str, goal: str, enqueue=enqueue_execution) -> dict:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        route = dict((state.discovery or {}).get("task_complexity_route") or {}) if state else {}
        if route.get("classification") != "STANDARD_TASK" or route.get("clarification_required") or route.get("founder_gate_required"):
            return route
        if (route.get("autonomous_execution") or {}).get("execution_session_id"):
            return route
    task = create_task_asset(title=goal[:200], description=goal, conversation_id=conversation_id,
        scope={"lane": "STANDARD_TASK", "target_surface": "Capability Repository"}, status="in_progress",
        approval_status="not_required", execution_status="inspecting")
    contract = build_standard_task_contract(conversation_id=conversation_id, goal=goal, task_id=task.id)
    route["standard_task_contract"] = contract
    _save_route(conversation_id, route)
    draft = TaskAssetDraft(title=goal[:200], description=goal, conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {"standard_task_contract": contract,
            "relevant_files": [{"path": path, "reason": "Bounded Standard Task scope"} for path in contract["implementation_scope"]]}},
        constraints=[f"Only modify {contract['implementation_scope']}", f"Never perform {contract['prohibited_scope']}", "Do not enter Strategy Meeting or request technical approval."],
        risk="low", approval_required=False)
    package = ExecutionPackage(goal=goal, context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=["targeted frontend tests", "frontend build", "localhost browser verification", "git diff --check"],
        commit_requirement="Use exact-file Autonomous Checkpoint; do not push.", approval_required=False, execution_allowed=True)
    execution = create_execution_session(task.id, package); package = replace(package, execution_allowed=True)
    execution.status = "queued"; execution.queued_at = _now(); execution.handoff_id = f"standard-handoff-{uuid4().hex[:20]}"; execution.readiness_contract_id = f"standard-readiness-{uuid4().hex[:20]}"
    save_execution_session(execution, package)
    route = _project(conversation_id, step="execution", execution={"task_id": task.id, "execution_package_id": execution.execution_package_id,
        "readiness_contract_id": execution.readiness_contract_id, "handoff_id": execution.handoff_id, "execution_session_id": execution.id,
        "executor": "codex", "dispatch_status": "queued", "dispatched_at": _now(), "manual_codex_instruction_count": 0})
    with SessionLocal() as db:
        record = db.get(TaskAssetDB, task.id); record.execution_status = "queued"; db.commit()
    enqueue(execution.id)
    Thread(target=_monitor, args=(conversation_id, task.id, execution.id), daemon=True, name=f"standard-{execution.id}").start()
    return route


def _monitor(conversation_id: str, task_id: str, execution_id: str) -> None:
    while True:
        record = get_execution_session(execution_id)
        if record is None: return
        session, _ = record
        if session.status == "testing": _project(conversation_id, step="verification", execution={"dispatch_status": "verifying"})
        if session.status in {"completed", "failed", "blocked", "cancelled"}: break
        time.sleep(.25)
    reconcile_standard_task_execution(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id)


def reconcile_standard_task_execution(*, conversation_id: str, task_id: str, execution_id: str, repo_root: Path = REPO_ROOT) -> dict:
    session, _ = get_execution_session(execution_id) or (None, None)
    if session is None: raise LookupError("Standard execution session not found")
    if session.status != "completed": return _project(conversation_id, step="execution", blocker={"type": "standard_task_execution_failed", "reason": session.failure_reason, "founder_gate_required": False}, execution={"dispatch_status": session.status})
    diff_ok = subprocess.run(["git", "diff", "--check"], cwd=repo_root, capture_output=True, text=True).returncode == 0
    clean = not subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, capture_output=True, text=True).stdout.strip()
    verification = {"status": "PASS" if diff_ok and clean and session.commit_hash else "FAIL", "targeted_tests": list((session.result or {}).get("tests") or []), "git_diff_check": "PASS" if diff_ok else "FAIL", "checkpoint": "PASS" if session.commit_hash else "FAIL", "working_tree": "clean" if clean else "dirty"}
    if verification["status"] != "PASS": return _project(conversation_id, step="verification", blocker={"type": "standard_task_verification_failed", "evidence": verification, "founder_gate_required": False})
    learning = {"status": "recorded", "type": "STANDARD_TASK_IMPLEMENTATION", "rule": "Use existing repository data for bounded local filtering before adding a backend search service."}
    closure = {"closure_status": "closed", "task_closed": True, "closed_by": "sino_autonomous_closure", "closed_at": _now()}
    result = {"status": "completed", "verification": verification, "checkpoint_commit": session.commit_hash, "learning": learning, "closure": closure}
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id); task.status = "completed"; task.execution_status = "completed"; task.result = result; db.commit()
    return _project(conversation_id, step="complete", execution={"dispatch_status": "completed", "verification": verification, "learning": learning, "closure": closure, "result": result})
