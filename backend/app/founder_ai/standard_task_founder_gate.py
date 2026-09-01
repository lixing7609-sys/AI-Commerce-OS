"""Founder authorization boundary for external model connectivity probes."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from threading import Thread
from time import monotonic
from typing import Callable
from uuid import uuid4

from sqlalchemy import select

from app.core.decision.service import create_decision
from app.core.model_center.service import get_model_center, record_health
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import get_execution_session, save_execution_session
from app.llm.exceptions import LLMGatewayError
from app.llm.gateway import LLMGateway
from app.llm.models import LLMRequest
from core.conversation_first.model import SinoBrainSessionDB

GATE_TYPE = "EXTERNAL_MODEL_PROBE"
DEFAULT_BOUNDARY = {
    "provider_scope": [],
    "model_scope": [],
    "max_candidates": 1,
    "max_probe_count": 1,
    "cost_ceiling": "minimal_single_probe_cost_only",
    "credential_boundary": "existing_credential_references_only",
    "external_effect_boundary": "provider_inference_request_only",
    "production_write": "none",
    "cloud_nas": "none",
    "batch": "forbidden",
    "scope_expansion": "forbidden",
    "prompt": "Reply with OK.",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def classify_blocker(blocker: dict | None) -> str:
    """Classify the required next action, not the generic word 'blocked'."""
    value = dict(blocker or {})
    evidence = " ".join(str(value.get(key) or "") for key in ("type", "reason", "required_next_action", "evidence")).lower()
    authorization = any(term in evidence for term in (
        "external api", "external model", "provider inference", "incremental cost", "credential use",
        "production write", "cloud mutation", "nas mutation", "external account", "irreversible",
    ))
    technical = any(term in evidence for term in (
        "test failure", "build failure", "dirty tree", "checkpoint", "runtime exception", "worker",
        "service unavailable", "dependency", "local port", "callback",
    ))
    return "MIXED" if authorization and technical else "AUTHORIZATION" if authorization else "TECHNICAL" if technical else "UNKNOWN"


def _configured_scope() -> tuple[list[str], list[str]]:
    center = get_model_center()
    providers = [item["provider_key"] for item in center.get("providers", []) if item.get("enabled") and item.get("configured")]
    models = [f"{item['provider_id']}:{item['model_id']}" for item in center.get("models", []) if item.get("enabled") and item.get("selected")]
    return providers, models


def _validated_boundary(value: dict | None, contract: dict | None = None) -> dict:
    base = {**DEFAULT_BOUNDARY, **dict((contract or {}).get("requested_scope") or {}), **dict(value or {})}
    base["provider_scope"] = list(dict.fromkeys(base.get("provider_scope") or []))
    base["model_scope"] = list(dict.fromkeys(base.get("model_scope") or []))
    base["max_candidates"] = int(base.get("max_candidates") or 0)
    base["max_probe_count"] = int(base.get("max_probe_count") or 0)
    if not 1 <= base["max_candidates"] <= 3 or not 1 <= base["max_probe_count"] <= base["max_candidates"]:
        raise ValueError("Probe boundary must allow one to three candidates and no more probes than candidates")
    if not base["provider_scope"]:
        raise ValueError("Founder Gate requires an explicit provider scope")
    return base


def reconcile_external_model_probe_gate(
    *, conversation_id: str, task_id: str, execution_id: str, checkpoint_commit: str,
) -> dict:
    """Move a completed local implementation to its remaining external authorization boundary."""
    providers, models = _configured_scope()
    if not providers:
        raise ValueError("No configured provider is available for an external connectivity probe")
    requested_scope = _validated_boundary({"provider_scope": providers, "model_scope": models})
    now = _now()
    gate = {
        "gate_id": f"founder-gate-{uuid4().hex[:20]}", "gate_type": GATE_TYPE,
        "conversation_id": conversation_id, "task_id": task_id, "execution_id": execution_id,
        "reason": "Real provider call required to verify connectivity",
        "requested_scope": requested_scope, "decision": "pending", "created_at": now,
        "external_call_count": 0, "credential_used": False, "cost_evidence": None,
    }
    record = get_execution_session(execution_id)
    if record:
        execution, package = record
        execution.commit_hash = checkpoint_commit
        execution.result = {**dict(execution.result or {}), "checkpoint_commit": checkpoint_commit,
                            "local_verification": "PASS", "external_connectivity": "NOT_VERIFIED"}
        save_execution_session(execution, package)
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        history = list(route.get("blocker_classification_history") or [])
        if route.get("technical_blocker"):
            history.append({"classification": classify_blocker(route["technical_blocker"]), "blocker": route["technical_blocker"], "resolved_at": now})
        route.update({
            "classification": "STANDARD_TASK", "current_step": "verification",
            "execution_status": "waiting_for_founder_authorization", "founder_gate_required": True,
            "founder_gate_count": 1, "manual_continue_count": 0, "manual_codex_instruction_count": 0,
            "blocker_classification": "AUTHORIZATION", "founder_gate_contract": gate,
            "blocker_classification_history": history,
        })
        route.pop("technical_blocker", None)
        execution = dict(route.get("autonomous_execution") or {})
        execution.update({"task_id": task_id, "execution_session_id": execution_id,
                          "dispatch_status": "waiting_for_founder_authorization", "checkpoint_commit": checkpoint_commit})
        route["autonomous_execution"] = execution
        contract = dict(route.get("standard_task_contract") or {})
        contract.update({
            "task_id": task_id, "conversation_id": conversation_id, "target_surface": "Model Center / configured providers",
            "objective": "Add a guarded external model connection health check.",
            "acceptance_criteria": ["Local configuration checks require no Founder Gate.", "No external model call occurs before explicit bounded approval.", "Approved probe stays within provider, credential, cost and count boundaries."],
            "constraints": ["existing_credentials_only", "minimal_probe_only", "no_production_write", "no_cloud_or_nas"],
            "inspect_status": "ready_for_authorization",
        })
        route["standard_task_contract"] = contract
        discovery["task_complexity_route"] = route; discovery["standard_task_contract"] = contract
        state.discovery = discovery; state.stage = "standard_task"; state.updated_at = datetime.now(timezone.utc)
        session.commit()
    return gate


def assert_probe_in_scope(boundary: dict, *, provider_id: str, model_id: str | None = None, attempt: int = 1) -> None:
    if provider_id not in (boundary.get("provider_scope") or []):
        raise PermissionError("provider_outside_approved_scope")
    if model_id and boundary.get("model_scope") and f"{provider_id}:{model_id}" not in boundary["model_scope"]:
        raise PermissionError("model_outside_approved_scope")
    if attempt > int(boundary.get("max_probe_count") or 0):
        raise PermissionError("probe_count_outside_approved_scope")


def _run_probe(conversation_id: str, gate_id: str, boundary: dict) -> dict:
    provider_id = boundary["provider_scope"][0]
    assert_probe_in_scope(boundary, provider_id=provider_id, attempt=1)
    started = monotonic(); status = "FAIL"; reason = None; model_id = None
    try:
        response = LLMGateway().generate_for(provider_id, LLMRequest(
            system_prompt="You are a provider health probe.", user_prompt=boundary["prompt"], temperature=0, max_tokens=8,
            metadata={"runtime_role": "model_health", "invocation_source": "model_health_probe", "runtime_mode": "probe"},
        ))
        status, model_id = "PASS", response.model
        record_health(provider_id, "healthy")
    except Exception as error:  # adapter errors are evidence, not an authorization escape
        reason = error.error_type if isinstance(error, LLMGatewayError) else error.__class__.__name__
        try: record_health(provider_id, "unhealthy", reason)
        except LookupError: pass
    result = {"provider_id": provider_id, "model_id": model_id, "status": status, "reason": reason,
              "latency_ms": round((monotonic() - started) * 1000, 1), "completed_at": _now(), "external_call_count": 1}
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        gate = dict(route.get("founder_gate_contract") or {})
        if gate.get("gate_id") != gate_id: return result
        gate.update({"probe_result": result, "external_call_count": 1, "credential_used": True})
        route.update({"founder_gate_contract": gate, "founder_gate_required": False, "blocker_classification": None,
                      "execution_status": "completed", "current_step": "complete"})
        execution = dict(route.get("autonomous_execution") or {})
        execution.update({"dispatch_status": "completed", "external_probe": result,
                          "verification": {"status": "PASS" if status == "PASS" else "FAIL", "external_connectivity": status}})
        route["autonomous_execution"] = execution
        discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc)
        session.commit()
    return result


def decide_external_model_probe_gate(
    conversation_id: str, *, action: str, boundary: dict | None = None,
    resume: Callable[[str, str, dict], dict] | None = None,
) -> dict:
    if action not in {"approve", "modify", "reject"}:
        raise ValueError("Unsupported external model probe decision")
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None: raise LookupError("Sino Brain state not found")
        route = dict((state.discovery or {}).get("task_complexity_route") or {})
        gate = dict(route.get("founder_gate_contract") or {})
        if gate.get("gate_type") != GATE_TYPE or gate.get("decision") not in {"pending", "boundary_modified"}:
            raise ValueError("Current task is not waiting at the external model probe Founder Gate")
        source_message_ids = list(state.source_message_refs or [])
    requested = _validated_boundary(boundary, gate)
    now = _now(); decision = {"approve": "approved", "modify": "boundary_modified", "reject": "rejected"}[action]
    payload = {"gate_id": gate["gate_id"], "gate_type": GATE_TYPE, "task_id": gate["task_id"], "execution_id": gate["execution_id"],
               "conversation_id": conversation_id, "decision": decision, "requested_scope": requested,
               "approved_scope": requested if action == "approve" else None, "decided_by": "FOUNDER", "decided_at": now}
    record = create_decision(title="External Model Probe Authorization", decision=json.dumps(payload, ensure_ascii=False, sort_keys=True),
        reason=gate["reason"], impact="At most the explicitly approved minimal provider inference probe.",
        status="active" if action == "approve" else "rejected" if action == "reject" else "pending",
        conversation_id=conversation_id, source_message_ids=source_message_ids, confirmed=action != "modify")
    payload["decision_id"] = record.id
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        current = dict(route.get("founder_gate_contract") or {})
        if current.get("gate_id") != gate["gate_id"] or current.get("decision") not in {"pending", "boundary_modified"}:
            raise ValueError("Founder Gate state changed before decision persistence")
        current.update({"decision": decision, "requested_scope": requested, "approved_scope": requested if action == "approve" else None,
                        "decision_id": record.id, "decided_by": "FOUNDER", "decided_at": now})
        history = list(route.get("founder_gate_decision_history") or []); history.append(payload)
        route["founder_gate_contract"] = current; route["founder_gate_decision_history"] = history
        route["founder_gate_required"] = action == "modify"
        route["execution_status"] = "waiting_for_founder_authorization" if action == "modify" else "external_connectivity_not_verified" if action == "reject" else "verification"
        if action == "reject": route.update({"current_step": "closure", "closure_status": "closed_external_connectivity_not_verified"})
        discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); session.commit()
    if action == "approve":
        runner = resume or _run_probe
        if resume: runner(conversation_id, gate["gate_id"], requested)
        else: Thread(target=runner, args=(conversation_id, gate["gate_id"], requested), daemon=True, name=f"external-model-probe-{gate['gate_id']}").start()
    return payload
