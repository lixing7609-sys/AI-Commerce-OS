from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.reusable_asset.model import ReuseEvidenceDB  # noqa: F401 - registers tables
from app.core.task_asset.model import TaskAssetDB
from app.founder_ai.task_complexity_router import route_task_complexity


GOAL = """请在左侧栏“项目”标题旁显示当前可见的项目数量。

搜索筛选项目时，数量要同步变化；清除搜索后恢复完整数量。

请保留现有项目排序、打开项目、新建项目和项目操作方式。"""


def _runtime(monkeypatch, conversation_id="conv-r2-authority"):
    import app.core.task_asset.service as task_service
    import app.founder_ai.conversation_task_interaction as interaction
    import app.founder_ai.standard_task_execution as execution

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(execution, "SessionLocal", factory)
    monkeypatch.setattr(interaction, "SessionLocal", factory)
    monkeypatch.setattr(task_service, "SessionLocal", factory)
    with factory() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="R2 Authority"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={}))
        db.commit()
    return execution, interaction, factory


def _begin(execution, conversation_id="conv-r2-authority", **decision_overrides):
    route = route_task_complexity(GOAL)
    route["classification"] = "STANDARD_TASK"
    route["founder_acceptance_criteria"] = [
        "数量等于当前可见项目数", "搜索时同步变化", "清除搜索后恢复完整数量",
    ]
    route["founder_constraints"] = ["保留现有项目排序、打开项目、新建项目和项目操作方式"]
    if decision_overrides:
        route["canonical_pre_dispatch_decision"] = execution.build_pre_dispatch_decision(
            conversation_id=conversation_id, goal=GOAL,
            founder_acceptance_criteria=route["founder_acceptance_criteria"],
            founder_constraints=route["founder_constraints"], **decision_overrides,
        )
    return execution.begin_standard_task(
        conversation_id=conversation_id, goal=GOAL, route=route,
        source_message_id="message-r2-project-count",
    )


def test_candidate_authority_is_stable_persisted_and_restorable_without_execution(monkeypatch):
    execution, _interaction, factory = _runtime(monkeypatch)
    first = _begin(execution)
    second = _begin(execution)
    assert first["candidate_authority"]["candidate_id"] == second["candidate_authority"]["candidate_id"]
    assert first["candidate_authority"]["canonical_fingerprint"] == second["candidate_authority"]["canonical_fingerprint"]

    prepared = execution.prepare_standard_task(
        conversation_id="conv-r2-authority", goal=GOAL,
        source_message_id="message-r2-project-count",
    )
    assert prepared["production_ready"]["status"] == "ready"
    assert not prepared.get("autonomous_execution")
    with factory() as db:
        tasks = db.query(TaskAssetDB).all()
        assert len(tasks) == 1
        authority = tasks[0].scope["candidate_authority"]
        assert authority["semantic_target"]["canonical_name"] == "Projects Heading Count"
        assert authority["confidence"] == "HIGH"
        assert authority["interaction_intent"] == "visible_derived_count"
        assert authority["production_scope"] == ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]
        assert authority["test_scope"] == ["frontend/src/sino-founder/FounderNavigationPanel.test.jsx"]
        assert authority["shared_support_scope"] == ["frontend/src/sino-founder/sino-founder-ai.css"]
        assert authority["adapter"] == "system_chrome_playwright"
        assert authority["adapter_compatibility"] == "PASS"
        assert authority["risk"] == "low"
        assert authority["approval_required"] is False
        assert authority["clarification_required"] is False
        assert authority["reuse"]["attempted"] is True
    restored = execution.restore_production_ready_task(prepared["production_ready"]["task_id"])
    assert restored["authorization"] == "execution_authorized"
    assert restored["candidate_authority"]["canonical_fingerprint"] == first["candidate_authority"]["canonical_fingerprint"]


def test_prepare_retry_reuses_task_and_never_rebuilds_candidate_authority(monkeypatch):
    execution, _interaction, factory = _runtime(monkeypatch)
    _begin(execution)
    first = execution.prepare_standard_task(
        conversation_id="conv-r2-authority", goal=GOAL, source_message_id="message-r2-project-count")
    monkeypatch.setattr(execution, "build_pre_dispatch_decision", lambda **_kwargs: (_ for _ in ()).throw(
        AssertionError("Production must not rebuild an existing Candidate authority")))
    second = execution.prepare_standard_task(
        conversation_id="conv-r2-authority", goal=GOAL, source_message_id="message-r2-project-count")
    assert first["production_ready"]["task_id"] == second["production_ready"]["task_id"]
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1


def test_production_ready_and_execution_start_are_separate_boundaries(monkeypatch):
    execution, _interaction, _factory = _runtime(monkeypatch)
    _begin(execution)
    prepared = execution.prepare_standard_task(
        conversation_id="conv-r2-authority", goal=GOAL, source_message_id="message-r2-project-count")
    assert prepared["execution_status"] == "prepared"
    created = []
    fake = SimpleNamespace(
        id="execution-r2", execution_package_id="package-r2", status="created", queued_at=None,
        handoff_id=None, readiness_contract_id=None,
    )
    monkeypatch.setattr(execution, "create_execution_session", lambda task_id, package: created.append(
        (task_id, package)) or fake)
    monkeypatch.setattr(execution, "save_execution_session", lambda *_args: None)
    monkeypatch.setattr(execution, "Thread", lambda **_kwargs: SimpleNamespace(start=lambda: None))
    queued = []
    started = execution.start_prepared_standard_task(
        conversation_id="conv-r2-authority", enqueue=queued.append)
    assert created and queued == ["execution-r2"]
    assert started["autonomous_execution"]["execution_session_id"] == "execution-r2"
    package = created[0][1]
    assert package.task_asset.risk == "low"
    assert package.approval_required is False
    assert package.context["candidate_authority"]["canonical_fingerprint"] == prepared["production_ready"]["canonical_fingerprint"]


def test_high_risk_and_approval_are_preserved_and_cannot_start(monkeypatch):
    execution, _interaction, factory = _runtime(monkeypatch)
    route = _begin(execution, risk="high", approval_required=True)
    assert route["candidate_authority"]["risk"] == "high"
    prepared = execution.prepare_standard_task(
        conversation_id="conv-r2-authority", goal=GOAL, source_message_id="message-r2-project-count")
    assert prepared["production_ready"]["status"] == "pending_approval"
    monkeypatch.setattr(execution, "create_execution_session", lambda *_args: (_ for _ in ()).throw(
        AssertionError("Approval-required Candidate must not start")))
    blocked = execution.start_prepared_standard_task(conversation_id="conv-r2-authority")
    assert blocked["execution_status"] == "pending_approval"
    with factory() as db:
        task = db.get(TaskAssetDB, prepared["production_ready"]["task_id"])
        assert task.scope["candidate_authority"]["risk"] == "high"
        assert task.scope["candidate_authority"]["approval_required"] is True
        assert task.approval_status == "pending"


def test_clarification_candidate_never_becomes_production_ready(monkeypatch):
    execution, _interaction, factory = _runtime(monkeypatch)
    _begin(execution, clarification_required=True)
    monkeypatch.setattr(execution, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(
        AssertionError("Clarification Candidate must not create TaskAsset")))
    route = execution.prepare_standard_task(
        conversation_id="conv-r2-authority", goal=GOAL, source_message_id="message-r2-project-count")
    assert route["execution_status"] == "blocked"
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 0


def test_persisted_discussion_candidate_owns_one_stable_canonical_snapshot(monkeypatch):
    execution, interaction, _factory = _runtime(monkeypatch)
    candidate = {
        "title": "Projects Heading Count", "goal": GOAL, "scope": ["Founder Sidebar"],
        "constraints": ["保留现有项目行为"], "acceptance_criteria": ["数量随筛选同步"],
        "confirmed_decisions": [], "dependencies": [], "risks": [], "task_type": "STANDARD_TASK",
    }
    first = interaction.persist_task_candidate(
        "conv-r2-authority", candidate, source_message_id="message-r2-project-count")
    second = interaction.persist_task_candidate(
        "conv-r2-authority", candidate, source_message_id="message-r2-project-count")
    assert first["candidate_id"] == second["candidate_id"]
    assert first["candidate_authority"]["canonical_fingerprint"] == second["candidate_authority"]["canonical_fingerprint"]
    assert first["canonical_pre_dispatch_decision"]["decision_fingerprint"] == first["candidate_authority"]["canonical_fingerprint"]
    assert first["candidate_id"] == execution.stable_candidate_id(
        conversation_id="conv-r2-authority", source_message_id="message-r2-project-count",
        intent_fingerprint=first["candidate_authority"]["intent_fingerprint"],
    )
