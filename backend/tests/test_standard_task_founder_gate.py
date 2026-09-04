from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.decision.model import DecisionAssetDB
from app.database.db import SessionLocal
from app.founder_ai.standard_task_founder_gate import assert_probe_in_scope, classify_blocker, decide_external_model_probe_gate
from app.founder_ai.execution_progress import build_execution_progress


def _seed():
    conversation_id = f"conv-external-gate-{uuid4().hex[:12]}"
    gate_id = f"gate-{uuid4().hex[:12]}"
    boundary = {"provider_scope": ["gpt"], "model_scope": ["gpt:model-a"], "max_candidates": 1, "max_probe_count": 1,
                "cost_ceiling": "minimal", "credential_boundary": "existing_only"}
    route = {"classification": "STANDARD_TASK", "founder_gate_required": True, "execution_status": "waiting_for_founder_authorization",
             "manual_continue_count": 0, "manual_codex_instruction_count": 0,
             "founder_gate_contract": {"gate_id": gate_id, "gate_type": "EXTERNAL_MODEL_PROBE", "task_id": "task-1", "execution_id": "execution-1",
                                       "reason": "Real provider call required to verify connectivity", "requested_scope": boundary, "decision": "pending", "external_call_count": 0}}
    with SessionLocal() as session:
        session.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="External Probe Gate"))
        session.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="standard_task", source_message_refs=[], discovery={"task_complexity_route": route}))
        session.commit()
    return conversation_id, boundary


def _cleanup(conversation_id):
    with SessionLocal() as session:
        session.query(DecisionAssetDB).filter(DecisionAssetDB.conversation_id == conversation_id).delete()
        session.query(SinoBrainSessionDB).filter(SinoBrainSessionDB.conversation_id == conversation_id).delete()
        session.query(ConversationDB).filter(ConversationDB.id == conversation_id).delete()
        session.commit()


def test_blocker_classification_uses_required_next_action():
    assert classify_blocker({"reason": "local test failure"}) == "TECHNICAL"
    assert classify_blocker({"required_next_action": "external model API provider inference with incremental cost"}) == "AUTHORIZATION"
    assert classify_blocker({"reason": "dirty tree", "required_next_action": "external API credential use"}) == "MIXED"
    assert classify_blocker({"reason": "inspect more evidence"}) == "UNKNOWN"


def test_approve_persists_exact_scope_and_resumes_without_continue():
    conversation_id, boundary = _seed(); resumed = []
    try:
        result = decide_external_model_probe_gate(conversation_id, action="approve", boundary=boundary,
            resume=lambda cid, gate_id, approved: resumed.append((cid, gate_id, approved)) or {})
        assert result["decision"] == "approved"
        assert result["approved_scope"]["provider_scope"] == boundary["provider_scope"]
        assert result["approved_scope"]["max_probe_count"] == 1
        assert len(resumed) == 1
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            route = state.discovery["task_complexity_route"]
            assert route["founder_gate_required"] is False
            assert route["manual_continue_count"] == 0
            assert session.get(DecisionAssetDB, result["decision_id"]).confirmed is True
    finally: _cleanup(conversation_id)


def test_modify_and_reject_never_resume_or_call_provider():
    for action in ("modify", "reject"):
        conversation_id, boundary = _seed(); resumed = []
        try:
            result = decide_external_model_probe_gate(conversation_id, action=action, boundary=boundary,
                resume=lambda *args: resumed.append(args))
            assert resumed == []
            with SessionLocal() as session:
                route = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id)).discovery["task_complexity_route"]
                assert route["founder_gate_contract"]["external_call_count"] == 0
                assert route["founder_gate_required"] is (action == "modify")
            assert result["decision"] == ("boundary_modified" if action == "modify" else "rejected")
        finally: _cleanup(conversation_id)


def test_scope_escape_is_blocked():
    boundary = {"provider_scope": ["gpt"], "model_scope": ["gpt:model-a"], "max_probe_count": 1}
    assert_probe_in_scope(boundary, provider_id="gpt", model_id="model-a", attempt=1)
    with pytest.raises(PermissionError, match="provider_outside"):
        assert_probe_in_scope(boundary, provider_id="gemini", attempt=1)
    with pytest.raises(PermissionError, match="model_outside"):
        assert_probe_in_scope(boundary, provider_id="gpt", model_id="model-b", attempt=1)
    with pytest.raises(PermissionError, match="probe_count"):
        assert_probe_in_scope(boundary, provider_id="gpt", model_id="model-a", attempt=2)


def test_pending_gate_overrides_completed_execution_projection():
    progress = build_execution_progress({"classification": "STANDARD_TASK", "current_step": "verification",
        "execution_status": "waiting_for_founder_authorization", "founder_gate_required": True,
        "standard_task_contract": {"task_id": "task-1"}})
    assert progress["current_action"] == "等待 Founder 授权"
    assert progress["execution_status"] == "waiting_for_founder_authorization"
    assert progress["progress_percent"] == 80
    assert progress["founder_action_required"] is True
