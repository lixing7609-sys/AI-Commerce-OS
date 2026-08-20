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
from app.founder_ai.execution_events import append_event
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from core.conversation_first.model import SinoBrainSessionDB

REPO_ROOT = Path(__file__).resolve().parents[3]
STEPS = ("inspect", "plan", "execution", "verification", "checkpoint", "learning", "closure", "complete")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_discussion_three_column_contract(*, conversation_id: str, goal: str, task_id: str | None) -> dict:
    return {
        "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
        "task_type": "STANDARD_TASK", "target_surface": "New Discussion",
        "target_route": "DRAFT_DISCUSSION via + 新建讨论",
        "target_component": "ConversationWorkspace / DraftDiscussion / SinoFounderShell",
        "objective": "Render the real New Discussion route as the confirmed three-column Founder workspace.",
        "confirmed_layout": {
            "left": "Projects / Conversations", "center": "Founder ↔ Sino Conversation / Composer",
            "right": "Task Status + Founder Action Queue",
        },
        "acceptance_criteria": [
            "Click the real + 新建讨论 control from localhost.",
            "The left Projects / Conversations column remains visible.",
            "The center Draft Discussion / Composer column is visible.",
            "The right Task Status + Founder Action Queue column is visible.",
            "All three columns are simultaneously visible in the real browser DOM and viewport.",
            "New Discussion remains transient until the first valid submit.",
        ],
        "visible_artifact_contract": {
            "required": True, "artifact_type": "three_column_new_discussion",
            "target_route": "DRAFT_DISCUSSION via + 新建讨论",
            "required_assertions": ["new_discussion_clicked", "left_column_visible", "center_column_visible", "right_column_visible", "three_columns_in_viewport"],
        },
        "constraints": ["preserve_home", "preserve_conversation_workspace", "preserve_transient_draft_creation", "no_backend_business_change"],
        "implementation_scope": [
            "frontend/src/sino-founder/FounderHome.jsx", "frontend/src/sino-founder/ConversationWorkspace.jsx",
            "frontend/src/sino-founder/SinoFounderShell.jsx", "frontend/src/sino-founder/SinoBrainContext.jsx",
            "frontend/src/sino-founder/SinoFounderAIApp.test.jsx", "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "prohibited_scope": ["conversation_backend", "task_lifecycle", "architecture_change", "external_write", "production_write"],
        "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"],
        "inspect_status": "ready_for_plan",
        "implementation_plan": [
            "Resolve the real + 新建讨论 interaction to the DRAFT_DISCUSSION render branch.",
            "Inspect the existing shell, draft composer and task/action-queue projection before editing.",
            "Implement only the confirmed left / center / right ownership on the draft route.",
            "Preserve transient draft creation and existing Home and Conversation behavior.",
            "Run targeted tests, build, and real localhost click-through DOM verification before checkpoint.",
        ],
        "source_goal": goal,
    }


def build_standard_task_contract(*, conversation_id: str, goal: str, task_id: str | None = None, discussion_context: list[str] | None = None) -> dict:
    from app.founder_ai.technical_resolution import is_local_health_check_goal
    if is_local_health_check_goal(goal):
        return {
            "task_id": task_id or f"standard-task-{uuid4().hex[:20]}", "conversation_id": conversation_id,
            "task_type": "STANDARD_TASK", "target_surface": "Local Development Environment",
            "objective": "Verify Founder frontend, Backend, Database, Worker, Execution Lifecycle and Git Working Tree.",
            "acceptance_criteria": ["Frontend responds", "Backend and Database are healthy", "Lifecycle is healthy", "Git working tree is clean"],
            "constraints": ["application_owned_evidence_only", "no_privileged_cross_app_inspection", "no_business_changes"],
            "implementation_scope": [], "prohibited_scope": ["macos_privacy_changes", "external_calls", "business_code_changes"],
            "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact"],
            "inspect_status": "ready_for_reuse_lookup", "implementation_plan": [], "source_goal": goal,
        }
    combined_context = "\n".join([goal, *(discussion_context or [])]).lower()
    has_new_discussion = ("新建讨论" in combined_context or "draft_discussion" in combined_context)
    has_three_columns = ("3列" in combined_context or "三列" in combined_context) and all(
        marker in combined_context for marker in ("projects", "conversation", "task status")
    )
    if has_new_discussion and has_three_columns:
        return _new_discussion_three_column_contract(conversation_id=conversation_id, goal=goal, task_id=task_id)
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
    result["standard_task_contract"] = build_standard_task_contract(conversation_id=conversation_id, goal=goal, discussion_context=list(route.get("discussion_context") or []))
    if route.get("discussion_context"):
        result["standard_task_contract"]["confirmed_conversation_context"] = list(route["discussion_context"])
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
        elif step == "complete": route.pop("technical_blocker", None)
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
    existing_contract = dict(route.get("standard_task_contract") or {})
    discussion_context = list(route.get("discussion_context") or existing_contract.get("confirmed_conversation_context") or [])
    contract = build_standard_task_contract(conversation_id=conversation_id, goal=goal, discussion_context=discussion_context)
    task = create_task_asset(title=goal[:200], description=goal, conversation_id=conversation_id,
        scope={"lane": "STANDARD_TASK", "target_surface": contract["target_surface"], "target_route": contract.get("target_route"), "target_component": contract.get("target_component")}, status="in_progress",
        approval_status="not_required", execution_status="inspecting")
    contract = build_standard_task_contract(conversation_id=conversation_id, goal=goal, task_id=task.id, discussion_context=discussion_context)
    if discussion_context:
        contract["confirmed_conversation_context"] = discussion_context
    route["standard_task_contract"] = contract
    _save_route(conversation_id, route)
    draft = TaskAssetDraft(title=goal[:200], description=goal, conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {"standard_task_contract": contract,
            "relevant_files": [{"path": path, "reason": "Bounded Standard Task scope"} for path in contract["implementation_scope"]]}},
        constraints=[f"Only modify {contract['implementation_scope']}", f"Never perform {contract['prohibited_scope']}", "Do not enter Strategy Meeting or request technical approval."],
        risk="low", approval_required=False)
    verification = list(contract["acceptance_criteria"])
    verification.extend(["targeted frontend tests", "frontend build", "git diff --check"])
    if contract.get("visible_artifact_contract"):
        verification.append(f"Write real browser evidence to .founder-execution/visible-artifact-{task.id}.json only after every required DOM assertion passes")
    package = ExecutionPackage(goal=contract["objective"], context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=verification,
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


def reconcile_standard_task_target_and_resume(*, conversation_id: str, enqueue=enqueue_execution) -> dict:
    """Replace a mis-targeted execution with an immutable revision on the same Task lineage."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        previous = dict(route.get("autonomous_execution") or {})
        task_id = previous.get("task_id")
        previous_execution_id = previous.get("execution_session_id")
        if not task_id or not previous_execution_id:
            raise LookupError("Standard Task execution lineage not found")
        discussion_context = list(route.get("discussion_context") or [])
        goal = (route.get("standard_task_contract") or {}).get("source_goal") or (discussion_context[-1] if discussion_context else "")
        contract = build_standard_task_contract(conversation_id=conversation_id, goal=goal, task_id=task_id, discussion_context=discussion_context)
        if contract["target_surface"] == (route.get("standard_task_contract") or {}).get("target_surface"):
            return route
        old_record = get_execution_session(previous_execution_id)
        if old_record:
            old_session, old_package = old_record
            old_session.source_status = old_session.status
            old_session.status = "cancelled"
            old_session.failure_reason = "task_target_resolution_misclassification"
            append_event(old_session, "cancelled_due_to_route_misclassification", status="cancelled", message="Execution superseded after canonical target reconciliation", metadata={"cancellation_reason": "task_target_resolution_misclassification"})
            save_execution_session(old_session, old_package)
        task = db.get(TaskAssetDB, task_id)
        if task:
            task.scope = {"lane": "STANDARD_TASK", "target_surface": contract["target_surface"], "target_route": contract.get("target_route"), "target_component": contract.get("target_component")}
            task.status = "in_progress"; task.execution_status = "inspecting"
        route["standard_task_contract"] = contract
        route["current_step"] = "inspect"; route["execution_status"] = "inspecting"
        route["visible_artifact_verification"] = {"status": "FAIL", "completion_allowed": False, "reason": "previous_execution_did_not_verify_target_artifact"}
        route.pop("technical_blocker", None); route.pop("technical_resolution_contract", None)
        discovery["task_complexity_route"] = route; discovery["standard_task_contract"] = contract
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    draft = TaskAssetDraft(title=contract["objective"][:200], description=contract["objective"], conversation_id=conversation_id,
        scope={"goal_type": "development", "context": {"standard_task_contract": contract,
            "relevant_files": [{"path": path, "reason": "Canonical target scope"} for path in contract["implementation_scope"]]}},
        constraints=[f"Only modify {contract['implementation_scope']}", f"Never perform {contract['prohibited_scope']}", "Do not mark complete without the required real browser evidence."],
        risk="low", approval_required=False)
    verification = [*contract["acceptance_criteria"], "targeted frontend tests", "frontend build", "git diff --check",
        f"Write real browser evidence to .founder-execution/visible-artifact-{task_id}.json only after every required DOM assertion passes"]
    package = ExecutionPackage(goal=contract["objective"], context=dict(draft.scope["context"]), task_asset=draft,
        constraints=list(draft.constraints), verification=verification, commit_requirement="Use exact-file Autonomous Checkpoint; do not push.", approval_required=False, execution_allowed=True)
    execution = create_execution_session(task_id, package); execution.status = "queued"; execution.queued_at = _now()
    execution.handoff_id = f"standard-reconcile-handoff-{uuid4().hex[:20]}"; execution.readiness_contract_id = f"standard-reconcile-readiness-{uuid4().hex[:20]}"
    execution.deltas.append({"type": "target_reconciliation", "supersedes_execution_id": previous_execution_id, "reason": "task_target_resolution_misclassification", "created_at": _now()})
    save_execution_session(execution, package)
    route = _project(conversation_id, step="execution", execution={"task_id": task_id, "execution_package_id": execution.execution_package_id,
        "readiness_contract_id": execution.readiness_contract_id, "handoff_id": execution.handoff_id, "execution_session_id": execution.id,
        "supersedes_execution_id": previous_execution_id, "executor": "codex", "dispatch_status": "queued", "dispatched_at": _now(), "manual_codex_instruction_count": 0})
    enqueue(execution.id)
    Thread(target=_monitor, args=(conversation_id, task_id, execution.id), daemon=True, name=f"standard-reconcile-{execution.id}").start()
    return route


def _monitor(conversation_id: str, task_id: str, execution_id: str) -> None:
    while True:
        record = get_execution_session(execution_id)
        if record is None: return
        session, _ = record
        if session.status in {"queued", "executing", "testing"}:
            from app.founder_ai.technical_resolution import evaluate_stall, mark_stalled_execution
            stall = evaluate_stall(session)
            if stall["stalled"]:
                mark_stalled_execution(conversation_id=conversation_id, execution_id=execution_id, stall_evidence=stall)
        if session.status == "testing": _project(conversation_id, step="verification", execution={"dispatch_status": "verifying"})
        if session.status in {"completed", "failed", "blocked", "cancelled"}: break
        time.sleep(.25)
    reconcile_standard_task_execution(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id)


def reconcile_standard_task_execution(*, conversation_id: str, task_id: str, execution_id: str, repo_root: Path = REPO_ROOT) -> dict:
    session, package = get_execution_session(execution_id) or (None, None)
    if session is None: raise LookupError("Standard execution session not found")
    if session.status != "completed": return _project(conversation_id, step="execution", blocker={"type": "standard_task_execution_failed", "reason": session.failure_reason, "founder_gate_required": False}, execution={"dispatch_status": session.status})
    from app.founder_ai.technical_resolution import is_local_health_check_goal, resolve_local_health_check
    if package and is_local_health_check_goal(package.goal):
        resolution = dict(session.technical_resolution or {})
        if resolution.get("resolution_status") != "resolved":
            resolve_local_health_check(conversation_id=conversation_id, task_id=task_id, execution_id=execution_id, repo_root=repo_root)
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            return dict((state.discovery or {}).get("task_complexity_route") or {})
    diff_ok = subprocess.run(["git", "diff", "--check"], cwd=repo_root, capture_output=True, text=True).returncode == 0
    clean = not subprocess.run(["git", "status", "--porcelain=v1"], cwd=repo_root, capture_output=True, text=True).stdout.strip()
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        contract = dict(((state.discovery or {}).get("task_complexity_route") or {}).get("standard_task_contract") or {}) if state else {}
    browser_evidence = dict((session.result or {}).get("browser_verification") or {})
    visible_gate = None
    if contract.get("visible_artifact_contract", {}).get("required"):
        from app.founder_ai.visible_artifact import browser_gate
        visible_gate = browser_gate(browser_evidence, contract=contract.get("visible_artifact_contract"))
    base_pass = diff_ok and clean and bool(session.commit_hash)
    passed = base_pass and (visible_gate is None or visible_gate["completion_allowed"])
    verification = {"status": "PASS" if passed else "FAIL", "targeted_tests": list((session.result or {}).get("tests") or []), "git_diff_check": "PASS" if diff_ok else "FAIL", "checkpoint": "PASS" if session.commit_hash else "FAIL", "working_tree": "clean" if clean else "dirty", "browser_verification": visible_gate}
    if verification["status"] != "PASS": return _project(conversation_id, step="verification", blocker={"type": "standard_task_verification_failed", "evidence": verification, "founder_gate_required": False})
    learning = {"status": "recorded", "type": "STANDARD_TASK_IMPLEMENTATION", "rule": "Use existing repository data for bounded local filtering before adding a backend search service."}
    closure = {"closure_status": "closed", "task_closed": True, "closed_by": "sino_autonomous_closure", "closed_at": _now()}
    result = {"status": "completed", "verification": verification, "checkpoint_commit": session.commit_hash, "learning": learning, "closure": closure}
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, task_id); task.status = "completed"; task.execution_status = "completed"; task.result = result; db.commit()
    return _project(conversation_id, step="complete", execution={"dispatch_status": "completed", "verification": verification, "learning": learning, "closure": closure, "result": result})
