from dataclasses import replace
from datetime import datetime, timedelta, timezone
import pytest

from app.core.conversation.model import ConversationDB
from app.core.conversation.service import create_conversation, ensure_conversation_runtime_state
from app.core.conversation_first.model import SinoBrainSessionDB
from app.database.db import SessionLocal
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_progress import build_execution_progress
from app.founder_ai.execution_registry import save_execution_session
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft


@pytest.fixture(autouse=True)
def cleanup_conversations():
    yield
    with SessionLocal() as db:
        ids = [item[0] for item in db.query(ConversationDB.id).filter(ConversationDB.title.in_(["P0 Atomic Conversation", "P0 Rehydrate Conversation"])).all()]
        if ids:
            db.query(SinoBrainSessionDB).filter(SinoBrainSessionDB.conversation_id.in_(ids)).delete(synchronize_session=False)
            db.query(ConversationDB).filter(ConversationDB.id.in_(ids)).delete(synchronize_session=False)
            db.commit()


def _route(session_id, *, classification="STANDARD_TASK", step="execution", status="execution", blocker=None):
    return {"classification": classification, "current_step": step, "execution_status": status,
            "founder_gate_required": False, "technical_blocker": blocker,
            "autonomous_execution": {"task_id": "task-p0", "execution_session_id": session_id}}


def _session(status="executing", *, old=False, commit=None):
    stamp = (datetime.now(timezone.utc) - timedelta(minutes=10) if old else datetime.now(timezone.utc)).isoformat()
    package = ExecutionPackage(goal="p0", context={}, task_asset=TaskAssetDraft(title="p0", description="p0", scope={}, constraints=[], risk="low", approval_required=False), constraints=[], verification=[], commit_requirement="none")
    session = ExecutionSession(id=f"execution-p0-{status}-{old}-{bool(commit)}", task_asset_id="task-p0", execution_package_id="package-p0", status=status, started_at=stamp, commit_hash=commit)
    save_execution_session(session, package)
    return session


def test_conversation_creation_atomically_persists_brain_and_workspace():
    conversation = create_conversation(title="P0 Atomic Conversation", conversation_type="VERIFICATION_RUN", created_by="VERIFICATION")
    with SessionLocal() as db:
        brain = db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation.id).one()
        assert brain.stage == "goal_discovery"
    readiness = ensure_conversation_runtime_state(conversation.id)
    assert readiness["brain_ready"] and readiness["workspace_ready"] and readiness["repaired"] == []


def test_missing_brain_is_rehydrated_idempotently():
    conversation = create_conversation(title="P0 Rehydrate Conversation", conversation_type="VERIFICATION_RUN", created_by="VERIFICATION")
    with SessionLocal() as db:
        db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation.id).delete(); db.commit()
    first = ensure_conversation_runtime_state(conversation.id)
    second = ensure_conversation_runtime_state(conversation.id)
    assert first["repaired"] == ["brain"]
    assert second["repaired"] == [] and second["brain_id"] == first["brain_id"]


def test_standard_progress_uses_canonical_phase_and_backend_time():
    session = _session("testing")
    progress = build_execution_progress(_route(session.id, step="verification", status="blocked", blocker={"type": "standard_task_verification_failed"}))
    assert progress["current_phase"] == "verification"
    assert progress["current_action"] == "验证受阻"
    assert progress["progress_percent"] == 80
    assert progress["elapsed_seconds"] >= 0
    assert progress["founder_action_required"] is False


def test_stalled_worker_and_completed_projection_are_truthful():
    stalled = _session("executing", old=True)
    stalled_progress = build_execution_progress(_route(stalled.id))
    assert stalled_progress["stalled"] is True and stalled_progress["execution_status"] == "stalled"
    completed = _session("completed", commit="checkpoint-p0")
    completed.completed_at = datetime.now(timezone.utc).isoformat(); save_execution_session(completed)
    complete_progress = build_execution_progress(_route(completed.id))
    assert complete_progress["progress_percent"] == 100
    assert complete_progress["closure_status"] == "awaiting_founder_acceptance"
    assert complete_progress["founder_action_required"] is True
    assert complete_progress["next_action"] == "等待 Founder 验收"


def test_quick_fix_uses_same_projection_with_lane_specific_mapping():
    session = _session("executing")
    progress = build_execution_progress(_route(session.id, classification="QUICK_FIX", step="fix", status="fixing"))
    assert progress["current_phase"] == "fix" and progress["progress_percent"] == 40
