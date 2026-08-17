from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.decision.model import DecisionAssetDB
from app.database.db import SessionLocal
from app.founder_ai.image_model_probe_gate import decide_image_model_probe_gate


def _seed():
    conversation_id = f"conv-probe-{uuid4().hex[:12]}"
    task_id = f"task-probe-{uuid4().hex[:12]}"
    with SessionLocal() as session:
        session.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Probe Gate"))
        session.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="autonomous_execution", source_message_refs=[], discovery={"autonomous_main_loop": {"task_id": task_id, "status": "founder_gate_required", "founder_gate_required": True, "model_candidates": [{"provider_id": "configured", "model_id": "seedream", "probe_status": "NOT_RUN"}]}}))
        session.commit()
    return conversation_id, task_id


def _cleanup(conversation_id):
    with SessionLocal() as session:
        session.query(DecisionAssetDB).filter(DecisionAssetDB.conversation_id == conversation_id).delete()
        session.query(SinoBrainSessionDB).filter(SinoBrainSessionDB.conversation_id == conversation_id).delete()
        session.query(ConversationDB).filter(ConversationDB.id == conversation_id).delete()
        session.commit()


def test_approve_persists_contract_and_calls_autonomous_resume_once():
    conversation_id, task_id = _seed()
    resumed = []
    try:
        result = decide_image_model_probe_gate(conversation_id, action="approve", boundary={"max_probe_candidate_count": 1}, resume=lambda cid, decision: resumed.append((cid, decision)) or {})
        assert result["approval_status"] == "approved"
        assert result["task_id"] == task_id
        assert result["gate_type"] == "IMAGE_MODEL_PROBE"
        assert result["approved_by"] == "founder"
        assert resumed == [(conversation_id, result)]
        with SessionLocal() as session:
            record = session.scalar(select(DecisionAssetDB).where(DecisionAssetDB.id == result["decision_id"]))
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            assert record is not None and record.confirmed is True
            assert state.discovery["autonomous_main_loop"]["status"] == "model_probe_authorized"
    finally:
        _cleanup(conversation_id)


def test_reject_persists_and_never_resumes():
    conversation_id, _ = _seed()
    resumed = []
    try:
        result = decide_image_model_probe_gate(conversation_id, action="reject", resume=lambda *args: resumed.append(args))
        assert result["approval_status"] == "rejected"
        assert resumed == []
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            assert state.discovery["autonomous_main_loop"]["status"] == "founder_gate_rejected"
    finally:
        _cleanup(conversation_id)


def test_modify_keeps_gate_pending_and_validates_probe_budget():
    conversation_id, _ = _seed()
    try:
        result = decide_image_model_probe_gate(conversation_id, action="modify", boundary={"max_probe_candidate_count": 2, "allow_minimal_external_inference_cost": False})
        assert result["approval_status"] == "boundary_modified"
        assert result["max_probe_candidate_count"] == 2
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            assert state.discovery["autonomous_main_loop"]["status"] == "founder_gate_required"
    finally:
        _cleanup(conversation_id)
