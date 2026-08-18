"""Decision-readiness lane for strategic and architecture tasks."""
from __future__ import annotations

from dataclasses import replace
from copy import deepcopy
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
        "proposal_version": 1,
        "previous_proposal_id": None,
        "status": "ready_for_founder_decision",
        "decision_status": "pending",
        "decision_history": [],
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


def _proposal_event(*, proposal: dict, action: str, status: str, feedback: str | None = None) -> dict:
    return {
        "decision_id": f"architecture-decision-{uuid4().hex[:20]}",
        "proposal_id": proposal["proposal_id"],
        "proposal_version": proposal["proposal_version"],
        "decision_status": status,
        "action": action,
        "decided_by": "FOUNDER",
        "decided_at": _now(),
        "founder_feedback": feedback,
    }


def decide_architecture_proposal(
    *, conversation_id: str, proposal_id: str, proposal_version: int,
    action: str, founder_feedback: str | None = None,
) -> dict:
    """Persist one decision against the active proposal version without dispatching implementation."""
    allowed = {"approve", "reject", "request_revision", "submit_revision", "cancel_revision"}
    if action not in allowed:
        raise ValueError("unsupported_architecture_decision")
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        route = dict(discovery.get("task_complexity_route") or {})
        if route.get("classification") != "STRATEGIC_TASK":
            raise ValueError("not_architecture_task")
        active = deepcopy(route.get("architecture_proposal") or {})
        active.setdefault("proposal_version", 1)
        active.setdefault("previous_proposal_id", None)
        active.setdefault("decision_status", "pending")
        active.setdefault("decision_history", [])
        if active.get("proposal_id") != proposal_id or active.get("proposal_version") != proposal_version:
            raise ValueError("stale_proposal")

        history = list(route.get("architecture_decision_history") or [])
        revision_created = False
        current_status = active.get("decision_status")
        if action == "approve" and current_status == "approved":
            return route
        if action == "reject" and current_status == "rejected":
            return route
        if current_status in {"approved", "rejected"}:
            raise ValueError("proposal_already_decided")

        if action == "approve":
            event = _proposal_event(proposal=active, action=action, status="approved")
            active.update({"status": "approved", "decision_status": "approved", "approved_at": event["decided_at"], "approved_by": "FOUNDER"})
            route.update({"current_step": "approved", "execution_allowed": True, "codex_dispatch_allowed": False,
                          "implementation_package_allowed": False, "execution_status": "not_started",
                          "task_status": "approved_for_implementation", "closure_status": "approved_for_implementation",
                          "decision_readiness": {"status": "approved_for_implementation", "founder_action_required": False}})
            state.stage = "decision_ready"
            state.decision = {"status": "approved", "decision_readiness": "approved_for_implementation",
                              "founder_action_required": False, "implementation_authorized": True,
                              "auto_dispatch_allowed": False, "proposal_id": proposal_id,
                              "proposal_version": proposal_version, "updated_at": event["decided_at"]}
        elif action == "reject":
            event = _proposal_event(proposal=active, action=action, status="rejected")
            active.update({"status": "rejected", "decision_status": "rejected", "rejected_at": event["decided_at"], "rejected_by": "FOUNDER"})
            route.update({"current_step": "rejected", "execution_allowed": False, "codex_dispatch_allowed": False,
                          "implementation_package_allowed": False, "execution_status": "not_started",
                          "task_status": "rejected", "closure_status": "closed",
                          "decision_readiness": {"status": "rejected", "founder_action_required": False}})
            state.decision = {"status": "rejected", "decision_readiness": "rejected", "founder_action_required": False,
                              "implementation_authorized": False, "proposal_id": proposal_id,
                              "proposal_version": proposal_version, "updated_at": event["decided_at"]}
        elif action == "request_revision":
            if current_status == "revision_requested":
                return route
            event = _proposal_event(proposal=active, action=action, status="revision_requested")
            active.update({"status": "revision_requested", "decision_status": "revision_requested"})
            route.update({"current_step": "decision_readiness", "execution_allowed": False, "codex_dispatch_allowed": False,
                          "implementation_package_allowed": False,
                          "task_status": "revision_requested", "closure_status": "pending",
                          "decision_readiness": {"status": "revision_requested", "founder_action_required": True}})
            state.decision = {"status": "revision_requested", "decision_readiness": "founder_feedback_required",
                              "founder_action_required": True, "implementation_authorized": False,
                              "proposal_id": proposal_id, "proposal_version": proposal_version, "updated_at": event["decided_at"]}
        elif action == "cancel_revision":
            if current_status != "revision_requested":
                return route
            event = _proposal_event(proposal=active, action=action, status="pending")
            active.update({"status": "ready_for_founder_decision", "decision_status": "pending"})
            route.update({"task_status": "decision_ready", "closure_status": "pending",
                          "decision_readiness": {"status": "ready", "founder_action_required": True}})
            state.decision = {"status": "awaiting_founder_decision", "decision_readiness": "ready",
                              "founder_action_required": True, "implementation_authorized": False,
                              "proposal_id": proposal_id, "proposal_version": proposal_version, "updated_at": event["decided_at"]}
        else:
            feedback = (founder_feedback or "").strip()
            if current_status != "revision_requested" or not feedback:
                raise ValueError("founder_feedback_required")
            event = _proposal_event(proposal=active, action=action, status="superseded", feedback=feedback)
            active.update({"status": "superseded", "decision_status": "superseded", "founder_feedback": feedback})
            active["decision_history"] = list(active.get("decision_history") or []) + [event]
            versions = list(route.get("architecture_proposals") or [])
            versions = [item for item in versions if item.get("proposal_id") != active["proposal_id"]] + [deepcopy(active)]
            revised = deepcopy(active)
            revised.update({"proposal_id": f"architecture-proposal-{uuid4().hex[:20]}", "proposal_version": proposal_version + 1,
                            "previous_proposal_id": proposal_id, "status": "ready_for_founder_decision",
                            "decision_status": "pending", "decision_history": [], "founder_feedback": feedback,
                            "recommended_decision": f"Review revision v{proposal_version + 1} with Founder constraint: {feedback}"})
            route["architecture_proposals"] = versions + [deepcopy(revised)]
            active = revised
            revision_created = True
            route.update({"current_step": "decision_readiness", "execution_allowed": False, "codex_dispatch_allowed": False,
                          "implementation_package_allowed": False,
                          "task_status": "decision_ready", "closure_status": "pending",
                          "decision_readiness": {"status": "ready", "founder_action_required": True}})
            state.decision = {"status": "awaiting_founder_decision", "decision_readiness": "ready",
                              "founder_action_required": True, "implementation_authorized": False,
                              "proposal_id": revised["proposal_id"], "proposal_version": revised["proposal_version"],
                              "updated_at": event["decided_at"]}

        history.append(event)
        if not revision_created:
            active["decision_history"] = list(active.get("decision_history") or []) + [event]
        route["architecture_proposal"] = active
        if not revision_created:
            versions = list(route.get("architecture_proposals") or [])
            route["architecture_proposals"] = [item for item in versions if item.get("proposal_id") != active["proposal_id"]] + [deepcopy(active)]
        route["architecture_decision_history"] = history
        discovery["task_complexity_route"] = route
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        db.commit()
        return route


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
        "architecture_proposal": proposal, "architecture_proposals": [deepcopy(proposal)], "architecture_decision_history": [],
        "decision_readiness": {"status": "ready", "founder_action_required": True},
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
