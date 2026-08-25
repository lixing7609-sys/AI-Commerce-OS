from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.task_asset.model import TaskAssetDB
import app.core.task_asset.service as task_service


def _factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(task_service, "SessionLocal", factory)
    with factory() as db:
        db.add(ConversationDB(id="conv-tasks", system_id="founder_ai", title="tasks"))
        db.commit()
    return factory


def _create(message_id, goal, **kwargs):
    return task_service.create_task_asset(title=kwargs.pop("title", goal), description=goal,
        conversation_id="conv-tasks", source_message_id=message_id, status="in_progress",
        execution_status=kwargs.pop("execution_status", "queued"), scope=kwargs.pop("scope", {}), **kwargs)


def test_same_source_message_returns_one_canonical_task(monkeypatch):
    factory = _factory(monkeypatch)
    first = _create("message-1", "增加产品矩阵入口")
    second = _create("message-1", "增加产品矩阵入口")
    assert second.id == first.id
    assert second.duplicate_reason == "same_source_message_id"
    assert second.duplicate_of_task_id == first.id
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1


def test_same_conversation_and_title_do_not_duplicate_different_messages(monkeypatch):
    factory = _factory(monkeypatch)
    first = _create("message-1", "Runtime URL 字号缩小", title="调整设置页面", execution_status="executing")
    second = _create("message-2", "增加产品矩阵入口", title="调整设置页面")
    assert second.id != first.id
    assert second.duplicate_reason is None
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 2


def test_queued_or_executing_task_does_not_block_a_different_task(monkeypatch):
    factory = _factory(monkeypatch)
    _create("message-running", "任务 A", execution_status="executing")
    queued = _create("message-new", "任务 B", execution_status="queued")
    assert queued.execution_status == "queued"
    with factory() as db:
        assert {item.description for item in db.query(TaskAssetDB).all()} == {"任务 A", "任务 B"}


def test_task_identity_is_auditable_and_uses_stable_message_identity(monkeypatch):
    _factory(monkeypatch)
    task = _create("message-audit", "  增加  Sino Studio 入口  ", target_module="Sidebar", target_object="Product matrix")
    identity = task.scope["task_identity"]
    assert identity["source_message_id"] == "message-audit"
    assert identity["conversation_id"] == "conv-tasks"
    assert identity["normalized_goal"] == "增加 sino studio 入口"
    assert identity["target_module"] == "Sidebar"
    assert identity["target_object"] == "Product matrix"
    assert len(identity["task_fingerprint"]) == 64
