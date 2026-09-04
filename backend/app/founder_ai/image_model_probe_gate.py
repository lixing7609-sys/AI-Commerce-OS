"""Founder authorization boundary for bounded image-generation model probes."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Callable

from sqlalchemy import select

from app.core.decision.service import create_decision
from app.database.db import SessionLocal
from app.core.conversation_first.model import SinoBrainSessionDB


DEFAULT_PROBE_BOUNDARY = {
    "allow_probe": True,
    "max_probe_candidate_count": 3,
    "allow_minimal_external_inference_cost": True,
    "approved_scope": "current_configured_image_generation_candidates_only",
    "credential_boundary": "existing_credential_references_only",
    "cost_boundary": "minimal_single_candidate_probe_cost_only",
    "external_effect_boundary": "provider_inference_calls_only",
    "production_boundary": "none",
}


def _validated_boundary(value: dict | None) -> dict:
    boundary = {**DEFAULT_PROBE_BOUNDARY, **(value or {})}
    count = int(boundary.get("max_probe_candidate_count") or 0)
    if count < 1 or count > 5:
        raise ValueError("max_probe_candidate_count must be between 1 and 5")
    boundary["max_probe_candidate_count"] = count
    boundary["allow_probe"] = bool(boundary.get("allow_probe"))
    boundary["allow_minimal_external_inference_cost"] = bool(boundary.get("allow_minimal_external_inference_cost"))
    return boundary


def _decision_projection(record, payload: dict) -> dict:
    return {
        "decision_id": record.id,
        **payload,
        "created_at": record.created_at.isoformat() if record.created_at else payload.get("decided_at"),
    }


def decide_image_model_probe_gate(
    conversation_id: str,
    *,
    action: str,
    boundary: dict | None = None,
    resume: Callable[[str, dict], dict] | None = None,
) -> dict:
    """Persist one Founder decision and resume only an explicitly approved loop."""
    if action not in {"approve", "reject", "modify"}:
        raise ValueError("Unsupported image model probe decision")
    requested = _validated_boundary(boundary)
    if action == "approve" and (not requested["allow_probe"] or not requested["allow_minimal_external_inference_cost"]):
        raise ValueError("Approved boundary does not authorize the requested bounded probe")
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        loop = dict(discovery.get("autonomous_main_loop") or {})
        if loop.get("status") not in {"founder_gate_required", "founder_gate_rejected"}:
            raise ValueError("Current task is not waiting at the image model probe Founder Gate")
        task_id = loop.get("task_id")
        if not task_id:
            raise ValueError("Founder Gate is missing its task lineage")
        source_message_ids = list(state.source_message_refs or [])

    now = datetime.now(timezone.utc).isoformat()
    approval_status = {"approve": "approved", "reject": "rejected", "modify": "boundary_modified"}[action]
    payload = {
        "task_id": task_id,
        "conversation_id": conversation_id,
        "gate_type": "IMAGE_MODEL_PROBE",
        "approval_status": approval_status,
        **requested,
        "approved_at": now if action == "approve" else None,
        "approved_by": "founder" if action == "approve" else None,
        "decided_at": now,
    }
    record = create_decision(
        title="Bounded Image Model Probe",
        decision=json.dumps(payload, ensure_ascii=False, sort_keys=True),
        reason="Founder authorization for a bounded capability probe; this does not authorize new providers, credentials, infrastructure, NAS, or production writes.",
        impact="At most the approved number of minimal inference probes against currently configured candidates.",
        status="active" if action == "approve" else "rejected" if action == "reject" else "pending",
        conversation_id=conversation_id,
        source_message_ids=source_message_ids,
        confirmed=action != "modify",
    )
    projection = _decision_projection(record, payload)

    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {})
        loop = dict(discovery.get("autonomous_main_loop") or {})
        history = list(loop.get("founder_probe_decision_history") or [])
        if loop.get("founder_probe_decision"):
            history.append(dict(loop["founder_probe_decision"]))
        loop["founder_probe_decision"] = projection
        loop["founder_probe_decision_history"] = history
        if action == "reject":
            loop["status"] = "founder_gate_rejected"
            loop["founder_gate_required"] = False
        elif action == "modify":
            loop["status"] = "founder_gate_required"
            loop["founder_gate_required"] = True
        else:
            loop["status"] = "model_probe_authorized"
            loop["founder_gate_required"] = False
        discovery["autonomous_main_loop"] = loop
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        session.commit()

    if action == "approve":
        from app.founder_ai.capability_build_loop import resume_authorized_capability_build_loop
        (resume or resume_authorized_capability_build_loop)(conversation_id, projection)
    return projection
