from dataclasses import replace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import CandidateGoalDB, ExecutionDeltaDB, GoalAssetDB
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft
import app.founder_ai.secretary.service as secretary_module
import app.founder_ai.execution_delta as delta_module


def _database(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(secretary_module, "SessionLocal", factory)
    monkeypatch.setattr(delta_module, "SessionLocal", factory)
    return factory


def test_discussion_accumulates_without_creating_formal_goal(monkeypatch):
    factory = _database(monkeypatch)
    with factory() as db:
        db.add(ConversationDB(id="conv-1", system_id="founder_ai", title="Discussion")); db.commit()
    service = secretary_module.SinoSecretaryService()
    first = service.append_message("conv-1", "我们先讨论产品方向")
    second = service.append_message("conv-1", "目前需要确认用户边界？")
    assert len(second["messages"]) == 4
    assert second["conversation"]["state"] == "clarifying"
    assert second["digest"]["pending_questions"][0]["content"] == "目前需要确认用户边界？"
    assert second["goals"] == []


def test_secretary_generates_structured_assets_and_goal_requires_confirmation(monkeypatch):
    factory = _database(monkeypatch)
    with factory() as db:
        db.add(ConversationDB(id="conv-1", system_id="founder_ai", title="Discussion")); db.commit()
    service = secretary_module.SinoSecretaryService()
    snapshot = service.append_message("conv-1", "决定不要改变颜色，以后实现 Timeline 优化")
    assert snapshot["digest"]["decisions"]
    assert snapshot["digest"]["knowledge_items"]
    candidate = snapshot["digest"]["candidate_goals"][0]
    assert snapshot["goals"] == []
    goal = service.confirm_goal("conv-1", candidate["goal_id"])
    assert goal["status"] == "goal_confirmed"
    assert service.snapshot("conv-1")["conversation"]["state"] == "goal_confirmed"


def test_explicit_execution_language_confirms_goal_without_creating_task(monkeypatch):
    factory = _database(monkeypatch)
    with factory() as db:
        db.add(ConversationDB(id="conv-1", system_id="founder_ai", title="Discussion")); db.commit()
    snapshot = secretary_module.SinoSecretaryService().append_message("conv-1", "按这个执行，开始实施 Timeline 修复")
    assert snapshot["conversation"]["state"] == "goal_confirmed"
    assert snapshot["goals"][0]["status"] == "goal_confirmed"
    assert snapshot["digest"]["candidate_goals"][0]["status"] == "confirmed"


class FakeSecretary:
    def append_message(self, conversation_id, content, **_kwargs):
        return {"messages": [{"message_id": "message-1", "role": "founder", "content": content}]}


def test_execution_delta_applies_low_impact_and_pauses_high_impact(monkeypatch):
    factory = _database(monkeypatch)
    with factory() as db:
        db.add(GoalAssetDB(id="goal-1", conversation_id="conv-1", title="Timeline", description="Timeline")); db.commit()
    session = ExecutionSession("execution-1", "task-1", "package-1", status="executing")
    package = replace(build_execution_package(generate_task_asset_draft("Timeline", conversation_id="conv-1")), execution_allowed=True)
    record = [session, package]
    monkeypatch.setattr(delta_module, "get_execution_session", lambda _id: tuple(record))
    monkeypatch.setattr(delta_module, "save_execution_session", lambda next_session, next_package: record.__setitem__(1, next_package))
    service = delta_module.ExecutionDeltaService(secretary=FakeSecretary())

    low = service.submit(conversation_id="conv-1", goal_id="goal-1", task_id="task-1", execution_id="execution-1", content="标题后面加中文，不要改变颜色")
    assert low["decision"] == "auto_apply"
    assert low["package_version"] == 2
    assert record[1].execution_deltas[0]["delta_id"] == low["delta_id"]
    assert not list(factory().query(GoalAssetDB).filter(GoalAssetDB.id != "goal-1"))

    high = service.submit(conversation_id="conv-1", goal_id="goal-1", task_id="task-1", execution_id="execution-1", content="不要用 Polling，改为 Event Stream")
    assert high["decision"] == "pause_and_replan"
    assert session.status == "paused"
    assert session.events[-1]["event_name"] == "execution_replanned"
    assert len(service.list_for_execution("execution-1")) == 2


def test_unrelated_execution_supplement_becomes_candidate_goal(monkeypatch):
    factory = _database(monkeypatch)
    with factory() as db:
        db.add(GoalAssetDB(id="goal-1", conversation_id="conv-1", title="Timeline", description="Timeline")); db.commit()
    session = ExecutionSession("execution-1", "task-1", "package-1", status="executing")
    package = replace(build_execution_package(generate_task_asset_draft("Timeline", conversation_id="conv-1")), execution_allowed=True)
    monkeypatch.setattr(delta_module, "get_execution_session", lambda _id: (session, package))
    monkeypatch.setattr(delta_module, "save_execution_session", lambda *_args: None)
    delta = delta_module.ExecutionDeltaService(secretary=FakeSecretary()).submit(conversation_id="conv-1", goal_id="goal-1", task_id="task-1", execution_id="execution-1", content="Operator AI 以后增加 Growth Agent")
    assert delta["decision"] == "store_as_candidate_goal"
    with factory() as db:
        assert db.query(CandidateGoalDB).count() == 1
