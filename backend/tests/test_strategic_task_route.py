from dataclasses import replace
from uuid import uuid4

from sqlalchemy import select

from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.brain_runtime import brain_runtime
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions, save_execution_session
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.standard_task_execution import dispatch_standard_task
from app.founder_ai.strategic_task import cancel_misclassified_execution, decide_architecture_proposal, reconcile_architecture_task
from app.founder_ai.task_complexity_router import QUICK_FIX, STANDARD_TASK, STRATEGIC_TASK, route_task_complexity
from core.conversation.model import ConversationDB
from core.conversation_first.model import SinoBrainSessionDB


GOAL = "重新设计 Sino Founder AI 与 Sino Studio AI 之间的 Capability 供给关系，让 Founder 负责创造和验证 Capability，Studio 负责发现、引用和执行已经 Ready 的 Capability。"


def test_cross_system_responsibility_redesign_is_architecture_not_standard():
    route = route_task_complexity(GOAL)
    assert route["classification"] == STRATEGIC_TASK
    assert route["task_type"] == "ARCHITECTURE_TASK"
    assert route["execution_allowed"] is False
    assert all(route["evidence"]["architecture_signals"][key] for key in ("change_intent", "system_boundary", "cross_module_relation", "authority_or_responsibility"))


def test_bounded_ui_redesign_is_not_architecture_and_existing_lanes_remain():
    assert route_task_complexity("重新设计这个按钮布局，保持现有页面风格")["classification"] != STRATEGIC_TASK
    assert route_task_complexity("给能力仓库增加按名称搜索功能")["classification"] == STANDARD_TASK
    assert route_task_complexity("修一下左边栏折叠按钮")["classification"] == QUICK_FIX


def test_strategic_route_cannot_enter_standard_dispatch():
    conversation_id = f"conv-strategic-{uuid4().hex[:12]}"
    calls = []
    with SessionLocal() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Strategic test"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={"task_complexity_route": route_task_complexity(GOAL)}))
        db.commit()
    try:
        route = dispatch_standard_task(conversation_id=conversation_id, goal=GOAL, enqueue=lambda execution_id: calls.append(execution_id))
        assert route["classification"] == STRATEGIC_TASK
        assert calls == []
        with SessionLocal() as db:
            assert db.scalar(select(TaskAssetDB).where(TaskAssetDB.conversation_id == conversation_id)) is None
    finally:
        with SessionLocal() as db:
            db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).delete()
            db.query(ConversationDB).filter_by(id=conversation_id).delete(); db.commit()


def test_architecture_reconciliation_reaches_decision_readiness_and_preserves_lineage():
    conversation_id = f"conv-strategic-{uuid4().hex[:12]}"
    with SessionLocal() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Strategic test"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, stage="standard_task", discovery={"task_complexity_route": {"classification": "STANDARD_TASK"}}))
        db.commit()
    try:
        route = reconcile_architecture_task(conversation_id=conversation_id, goal=GOAL)
        assert route["classification"] == STRATEGIC_TASK
        assert route["architecture_analysis"]["status"] == "completed"
        assert route["architecture_proposal"]["status"] == "ready_for_founder_decision"
        assert route["decision_readiness"] == {"status": "ready", "founder_action_required": True}
        assert route["manual_continue_count"] == route["manual_codex_instruction_count"] == 0
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            assert state.stage == "decision_ready"
            assert state.conversation_id == conversation_id
            assert state.decision["implementation_authorized"] is False
    finally:
        with SessionLocal() as db:
            db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).delete()
            db.query(ConversationDB).filter_by(id=conversation_id).delete(); db.commit()


def test_misclassified_execution_is_cancelled_without_deleting_evidence():
    task_id = f"task-asset-{uuid4().hex[:16]}"
    execution_id = f"execution-{uuid4().hex[:16]}"
    with SessionLocal() as db:
        db.add(TaskAssetDB(id=task_id, system_id="founder_ai", title="Wrong route", status="in_progress", execution_status="executing")); db.commit()
    package = ExecutionPackage(goal=GOAL, context={}, task_asset=TaskAssetDraft(title=GOAL, description=GOAL, scope={}, constraints=[], risk="low", approval_required=False), constraints=[], verification=[], commit_requirement="none", execution_allowed=True)
    session = ExecutionSession(id=execution_id, task_asset_id=task_id, execution_package_id=f"package-{uuid4().hex[:16]}", status="completed",
                               result={"changed_files": ["evidence-only"]}, artifact={"id": "artifact-preserved"})
    save_execution_session(session, package)
    try:
        result = cancel_misclassified_execution(execution_id=execution_id)
        stored, stored_package = get_execution_session(execution_id)
        assert result["status"] == stored.status == "cancelled"
        assert stored.source_status == "completed"
        assert stored.result["changed_files"] == ["evidence-only"] and stored.artifact["id"] == "artifact-preserved"
        assert stored_package.execution_allowed is False
        with SessionLocal() as db:
            task = db.get(TaskAssetDB, task_id)
            assert task.execution_status == "cancelled"
            assert task.result["cancellation_reason"] == "strategic_route_misclassification"
    finally:
        with SessionLocal() as db:
            db.query(TaskAssetDB).filter_by(id=task_id).delete(); db.commit()


def _architecture_fixture():
    conversation_id = f"conv-architecture-decision-{uuid4().hex[:12]}"
    with SessionLocal() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Architecture decision fixture"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={}))
        db.commit()
    route = reconcile_architecture_task(conversation_id=conversation_id, goal=GOAL)
    return conversation_id, route["architecture_proposal"]


def _delete_architecture_fixture(conversation_id):
    with SessionLocal() as db:
        db.query(SinoBrainSessionDB).filter_by(conversation_id=conversation_id).delete()
        db.query(ConversationDB).filter_by(id=conversation_id).delete(); db.commit()


def test_architecture_approve_persists_is_idempotent_and_never_dispatches():
    conversation_id, proposal = _architecture_fixture()
    execution_ids_before = {item.id for item in list_execution_sessions()}
    try:
        first = decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal["proposal_id"], proposal_version=1, action="approve")
        second = decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal["proposal_id"], proposal_version=1, action="approve")
        assert first["architecture_proposal"]["decision_status"] == "approved"
        assert first["execution_allowed"] is True and first["codex_dispatch_allowed"] is False
        assert len(first["architecture_decision_history"]) == len(second["architecture_decision_history"]) == 1
        assert {item.id for item in list_execution_sessions()} == execution_ids_before
        snapshot = brain_runtime.snapshot(conversation_id)
        assert snapshot["current_action"]["title"] == "方案已批准"
        assert snapshot["execution_progress"]["founder_action_required"] is False
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            assert state.decision["implementation_authorized"] is True
            assert state.decision["auto_dispatch_allowed"] is False
    finally:
        _delete_architecture_fixture(conversation_id)


def test_architecture_reject_persists_and_closes_without_execution():
    conversation_id, proposal = _architecture_fixture()
    execution_ids_before = {item.id for item in list_execution_sessions()}
    try:
        route = decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal["proposal_id"], proposal_version=1, action="reject")
        assert route["architecture_proposal"]["decision_status"] == "rejected"
        assert route["decision_readiness"] == {"status": "rejected", "founder_action_required": False}
        assert route["execution_allowed"] is route["codex_dispatch_allowed"] is False
        assert {item.id for item in list_execution_sessions()} == execution_ids_before
        assert brain_runtime.snapshot(conversation_id)["current_action"]["title"] == "方案已驳回"
    finally:
        _delete_architecture_fixture(conversation_id)


def test_architecture_revision_preserves_v1_and_stale_version_cannot_be_approved():
    conversation_id, proposal = _architecture_fixture()
    feedback = "Studio 只允许引用 Ready Capability，不允许修改 Capability Definition。"
    try:
        requested = decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal["proposal_id"], proposal_version=1, action="request_revision")
        assert requested["architecture_proposal"]["decision_status"] == "revision_requested"
        revised = decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal["proposal_id"], proposal_version=1, action="submit_revision", founder_feedback=feedback)
        active = revised["architecture_proposal"]
        assert active["proposal_version"] == 2 and active["previous_proposal_id"] == proposal["proposal_id"]
        assert active["status"] == "ready_for_founder_decision"
        assert brain_runtime.snapshot(conversation_id)["current_action"]["title"] == "等待 Founder 决策"
        assert len(revised["architecture_proposals"]) == 2
        old = next(item for item in revised["architecture_proposals"] if item["proposal_id"] == proposal["proposal_id"])
        assert old["decision_status"] == "superseded" and old["founder_feedback"] == feedback
        try:
            decide_architecture_proposal(conversation_id=conversation_id, proposal_id=proposal["proposal_id"], proposal_version=1, action="approve")
            assert False, "stale proposal approval must fail"
        except ValueError as error:
            assert str(error) == "stale_proposal"
    finally:
        _delete_architecture_fixture(conversation_id)
