"""Decision-readiness lane for strategic and architecture tasks."""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_registry import get_execution_session, save_execution_session
from core.conversation_first.model import SinoBrainSessionDB


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_architecture_proposal(*, conversation_id: str, goal: str) -> dict:
    return {
        "proposal_id": f"architecture-proposal-{uuid4().hex[:20]}",
        "conversation_id": conversation_id,
        "status": "ready_for_founder_decision",
        "current_problem": "Founder Capability lifecycle and Studio consumption need an explicit provider-independent supply boundary.",
        "proposed_boundary": "Founder owns Capability definitions and readiness; Studio consumes immutable Ready versions by reference.",
        "founder_responsibilities": ["Create and version Capability definitions", "Develop and test candidates", "Validate evidence", "Promote Ready versions", "Deprecate or supersede versions"],
        "studio_responsibilities": ["Discover Ready Capability versions", "Validate task compatibility", "Bind by stable reference", "Execute without mutating the definition", "Produce Studio Assets and return usage evidence"],
        "capability_lifecycle": ["candidate", "developing", "testing", "ready", "deprecated"],
        "binding_contract": {"reference": "capability_id + immutable version", "consumer_rule": "ready_only", "mutation_rule": "studio_read_only"},
        "data_asset_ownership": {"capability_definition": "founder_ai", "studio_task_and_generated_asset": "studio_ai", "usage_evidence": "shared lineage reference"},
        "execution_authority": {"founder": "validation and promotion", "studio": "bounded execution of Ready bindings", "pre_approval_implementation": False},
        "learning_feedback": "Studio returns usage/result evidence; Founder evaluates it before any Capability revision or promotion.",
        "migration_impact": ["Keep existing Capability IDs and versions", "Add/verify Ready-only discovery projection", "Represent Studio usage as references rather than definition mutation"],
        "risks": ["Stale bindings after deprecation", "Consumer compatibility drift", "Ambiguous ownership if Studio writes Capability definitions"],
        "recommended_decision": "Approve the Ready-only, immutable-reference supply boundary before implementation.",
        "source_evidence": [
            "backend/app/core/asset_lifecycle/service.py: capability lifecycle and Ready actions",
            "backend/app/founder_ai/capability_compatibility.py: consumer compatibility checks",
            "backend/app/founder_ai/capability_build_loop.py: Studio binding assumptions",
            "frontend/src/sino-founder/CapabilityWorkspace.jsx: Founder repository projection",
        ],
        "source_goal": goal,
    }


def cancel_misclassified_execution(*, execution_id: str, reason: str = "strategic_route_misclassification") -> dict:
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Execution session not found")
    session, package = record
    previous_status = session.status
    if session.status != "cancelled":
        session.source_status = session.source_status or previous_status
        session.status = "cancelled"
        session.current_stage = "cancelled"
        session.failure_reason = reason
        session.error_message = reason
        append_event(session, "cancelled_due_to_route_misclassification", status="cancelled", message=reason,
                     metadata={"previous_status": previous_status, "evidence_preserved": True})
        save_execution_session(session, replace(package, execution_allowed=False))
    with SessionLocal() as db:
        task = db.get(TaskAssetDB, session.task_asset_id)
        if task:
            prior = dict(task.result or {})
            task.status = "cancelled"
            task.execution_status = "cancelled"
            task.result = {**prior, "cancellation_reason": reason, "source_execution_status": previous_status, "evidence_preserved": True}
            db.commit()
    return {"execution_id": execution_id, "status": "cancelled", "source_status": previous_status, "cancellation_reason": reason}


def reconcile_architecture_task(*, conversation_id: str, goal: str, wrong_execution_id: str | None = None) -> dict:
    cancellation = cancel_misclassified_execution(execution_id=wrong_execution_id) if wrong_execution_id else None
    proposal = build_architecture_proposal(conversation_id=conversation_id, goal=goal)
    route = {
        "classification": "STRATEGIC_TASK", "task_type": "ARCHITECTURE_TASK",
        "clarification_required": False, "founder_gate_required": False,
        "strategy_meeting_required": True, "architecture_proposal_required": True,
        "execution_allowed": False, "codex_dispatch_allowed": False, "implementation_package_allowed": False,
        "current_step": "decision_readiness", "execution_status": "not_started",
        "manual_continue_required": False, "manual_continue_count": 0, "manual_codex_instruction_count": 0,
        "progress_log": ["architecture_analysis", "alternatives", "proposal", "impact_analysis", "decision_readiness"],
        "architecture_analysis": {"status": "completed", "current_system_inspected": True, "source_evidence": proposal["source_evidence"]},
        "architecture_proposal": proposal, "decision_readiness": {"status": "ready", "founder_action_required": True},
        "wrong_execution_reconciliation": cancellation,
        "evidence": {"text": goal, "reconciled_from": "STANDARD_TASK" if wrong_execution_id else None},
    }
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        discovery["task_complexity_route"] = route
        discovery.pop("standard_task_contract", None)
        state.discovery = discovery
        state.stage = "decision_ready"
        state.strategy_proposals = [{"model_run_id": proposal["proposal_id"], "model": "Sino Architecture Analysis", "provider": "Verified Repository Evidence",
                                     "proposal": {"recommendation": proposal["recommended_decision"]}, "architecture_proposal_ref": proposal["proposal_id"]}]
        state.decision = {"status": "awaiting_founder_decision", "decision_readiness": "ready", "founder_action_required": True,
                          "recommended_decision": proposal["recommended_decision"], "implementation_authorized": False,
                          "updated_at": _now()}
        state.updated_at = datetime.now(timezone.utc)
        db.commit()
    return route
