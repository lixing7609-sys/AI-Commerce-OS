from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.reusable_asset.model import ReuseEvidenceDB  # noqa: F401 - register tables
from app.core.task_asset.model import TaskAssetDB
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_worker import ExecutionQueue
from app.founder_ai.task_complexity_router import route_task_complexity


GOAL = """请在左侧栏“项目”标题旁显示当前可见的项目数量。

搜索筛选项目时，数量要同步变化；清除搜索后恢复完整数量。

请保留现有项目排序、打开项目、新建项目和项目操作方式。"""


def _runtime(monkeypatch, conversation_id="conv-r3-start"):
    import app.core.task_asset.service as task_service
    import app.founder_ai.conversation_task_interaction as interaction
    import app.founder_ai.standard_task_execution as execution

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(execution, "SessionLocal", factory)
    monkeypatch.setattr(interaction, "SessionLocal", factory)
    monkeypatch.setattr(task_service, "SessionLocal", factory)
    monkeypatch.setattr(execution, "Thread", lambda **_kwargs: SimpleNamespace(start=lambda: None))
    with factory() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="R3 Start"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={}))
        db.commit()
    return execution, task_service, factory


def _prepare(execution, *, risk="low", approval_required=False, clarification_required=False):
    route = route_task_complexity(GOAL)
    route["classification"] = "STANDARD_TASK"
    route["founder_acceptance_criteria"] = ["数量随筛选同步", "清除搜索恢复完整数量"]
    route["founder_constraints"] = ["保留现有项目行为"]
    route["canonical_pre_dispatch_decision"] = execution.build_pre_dispatch_decision(
        conversation_id="conv-r3-start", goal=GOAL,
        founder_acceptance_criteria=route["founder_acceptance_criteria"],
        founder_constraints=route["founder_constraints"], risk=risk,
        approval_required=approval_required, clarification_required=clarification_required,
    )
    execution.begin_standard_task(
        conversation_id="conv-r3-start", goal=GOAL, route=route,
        source_message_id="message-r3-project-count",
    )
    return execution.prepare_standard_task(
        conversation_id="conv-r3-start", goal=GOAL,
        source_message_id="message-r3-project-count",
    )


def _execution_factory(created, saved):
    def create(task_id, package, *, execution_id=None):
        session = ExecutionSession(
            execution_id or "execution-test", task_id, "package-r3", status="created",
        )
        created.append((session, package))
        return session
    return create


def test_duplicate_start_and_restore_reuse_one_execution_and_enqueue(monkeypatch):
    execution, _service, factory = _runtime(monkeypatch)
    prepared = _prepare(execution)
    created, saved, enqueued = [], [], []
    monkeypatch.setattr(execution, "create_execution_session", _execution_factory(created, saved))
    monkeypatch.setattr(execution, "save_execution_session", lambda session, package=None: saved.append((session, package)))

    first = execution.start_prepared_standard_task(
        conversation_id="conv-r3-start", enqueue=lambda execution_id: enqueued.append(execution_id),
    )
    second = execution.start_prepared_standard_task(
        conversation_id="conv-r3-start", enqueue=lambda execution_id: enqueued.append(execution_id),
    )

    expected = execution.stable_execution_id(
        task_id=prepared["production_ready"]["task_id"],
        canonical_fingerprint=prepared["production_ready"]["canonical_fingerprint"],
    )
    assert first["autonomous_execution"]["execution_session_id"] == expected
    assert second["autonomous_execution"]["execution_session_id"] == expected
    assert second["autonomous_execution"]["duplicate_start_reused"] is True
    assert len(created) == 1
    assert enqueued == [expected]
    with factory() as db:
        task = db.get(TaskAssetDB, prepared["production_ready"]["task_id"])
        assert task.scope["execution_start"]["execution_id"] == expected
        assert task.scope["execution_start"]["status"] == "queued"


def test_enqueue_failure_is_truthfully_persisted_everywhere(monkeypatch):
    execution, _service, factory = _runtime(monkeypatch)
    prepared = _prepare(execution)
    created, saved = [], []
    monkeypatch.setattr(execution, "create_execution_session", _execution_factory(created, saved))
    monkeypatch.setattr(execution, "save_execution_session", lambda session, package=None: saved.append((session, package)))

    route = execution.start_prepared_standard_task(
        conversation_id="conv-r3-start",
        enqueue=lambda _execution_id: (_ for _ in ()).throw(RuntimeError("queue unavailable")),
    )

    session = created[0][0]
    assert session.status == "failed"
    assert "EXECUTION_ENQUEUE_FAILED" in session.failure_reason
    assert session.result["failure_type"] == "enqueue_failure"
    assert route["execution_status"] == "failed"
    assert route["autonomous_execution"]["dispatch_status"] == "failed"
    assert route["technical_blocker"]["type"] == "execution_enqueue_failed"
    assert "dispatched_at" not in route["autonomous_execution"]
    with factory() as db:
        task = db.get(TaskAssetDB, prepared["production_ready"]["task_id"])
        assert task.execution_status == "failed"
        assert task.status == "failed"
        assert task.scope["execution_start"]["status"] == "failed"
        assert "EXECUTION_ENQUEUE_FAILED" in task.scope["execution_start"]["failure_reason"]
        assert task.result["failure_type"] == "enqueue_failure"


def test_formal_approval_binds_task_candidate_and_fingerprint_and_restores(monkeypatch):
    execution, service, factory = _runtime(monkeypatch)
    prepared = _prepare(execution, risk="high", approval_required=True)
    task_id = prepared["production_ready"]["task_id"]
    fingerprint = prepared["production_ready"]["canonical_fingerprint"]
    candidate_id = prepared["production_ready"]["candidate_id"]
    created, saved, enqueued = [], [], []
    monkeypatch.setattr(execution, "create_execution_session", _execution_factory(created, saved))
    monkeypatch.setattr(execution, "save_execution_session", lambda session, package=None: saved.append((session, package)))

    with factory() as db:
        pending_task = db.get(TaskAssetDB, task_id)
        pending = pending_task.scope["execution_approval"]
        assert pending["decision"] == "pending"
        assert pending["approval_id"] == service.stable_execution_approval_id(
            task_id=task_id, canonical_fingerprint=fingerprint,
        )
    missing = execution.start_prepared_standard_task(conversation_id="conv-r3-start")
    assert missing["execution_status"] == "pending_approval"
    assert missing["execution_authorization"]["reason"] == "blocked_approval_missing"
    approval = service.decide_task_execution_approval(
        task_id=task_id, decision="approved", canonical_fingerprint=fingerprint,
        candidate_id=candidate_id,
    )
    assert approval["approval_id"] == service.stable_execution_approval_id(
        task_id=task_id, canonical_fingerprint=fingerprint,
    )
    with factory() as db:
        restored = db.get(TaskAssetDB, task_id)
        validation = service.validate_task_execution_approval(
            restored, restored.scope["candidate_authority"],
        )
        assert validation["authorized"] is True
        assert validation["approval"]["candidate_id"] == candidate_id
    started = execution.start_prepared_standard_task(
        conversation_id="conv-r3-start", enqueue=lambda value: enqueued.append(value),
    )
    assert started["execution_authorization"]["reason"] == "authorized"
    assert created[0][1].task_asset.risk == "high"
    assert len(enqueued) == 1


def test_rejected_and_stale_approval_never_start(monkeypatch):
    execution, service, factory = _runtime(monkeypatch)
    prepared = _prepare(execution, risk="high", approval_required=True)
    task_id = prepared["production_ready"]["task_id"]
    service.decide_task_execution_approval(
        task_id=task_id, decision="rejected",
        canonical_fingerprint=prepared["production_ready"]["canonical_fingerprint"],
        candidate_id=prepared["production_ready"]["candidate_id"],
    )
    rejected = execution.start_prepared_standard_task(conversation_id="conv-r3-start")
    assert rejected["execution_status"] == "blocked"
    assert rejected["execution_authorization"]["reason"] == "blocked_approval_rejected"

    with factory() as db:
        task = db.get(TaskAssetDB, task_id)
        scope = dict(task.scope); approval = dict(scope["execution_approval"])
        approval["canonical_fingerprint"] = "stale"
        scope["execution_approval"] = approval; task.scope = scope; db.commit()
    stale = execution.start_prepared_standard_task(conversation_id="conv-r3-start")
    assert stale["execution_authorization"]["reason"] == "blocked_stale_approval"
    with factory() as db:
        invalidated = db.get(TaskAssetDB, task_id)
        assert invalidated.approval_status == "invalidated"
        assert invalidated.scope["execution_approval"]["decision"] == "invalidated"
        assert invalidated.scope["execution_approval"]["invalidation_reason"] == "canonical_fingerprint_mismatch"


def test_clarification_and_authority_mismatch_stop_before_execution(monkeypatch):
    execution, _service, factory = _runtime(monkeypatch)
    blocked = _prepare(execution, clarification_required=True)
    assert blocked["execution_status"] == "blocked"
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 0


def test_execution_queue_enforces_transition_graph():
    queue = ExecutionQueue()
    queue.enqueue("execution-graph")
    with pytest.raises(ValueError, match="queued -> completed"):
        queue.transition("execution-graph", "completed")
    running = queue.transition("execution-graph", "running")
    assert running.status == "running"
    completed = queue.transition("execution-graph", "completed")
    assert completed.status == "completed"
    with pytest.raises(ValueError, match="completed -> running"):
        queue.transition("execution-graph", "running")

    failed = ExecutionQueue(); failed.enqueue("execution-failed")
    failed.transition("execution-failed", "failed")
    with pytest.raises(ValueError, match="failed -> running"):
        failed.transition("execution-failed", "running")
