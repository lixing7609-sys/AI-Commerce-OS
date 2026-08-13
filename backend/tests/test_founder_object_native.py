from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.conversation.service as conversation_service
import app.core.founder_object.service as object_service


def test_conversation_recognizes_updates_and_approves_real_skill(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **kwargs: SimpleNamespace(id="task-test", **kwargs))
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: SimpleNamespace(id="execution-test", status="draft"))

    conversation = conversation_service.create_conversation(title="Object Native Test")
    objects = object_service.recognize_objects(conversation.id, "message-one", "我们需要开发一个 Chrome Extension Skill，用来处理浏览器端的数据获取。")
    skill = next(item for item in objects if item["object_type"] == "skill")
    assert skill["name"] == "Chrome Extension Skill"
    assert skill["status"] == "draft"
    object_service.attach_object_context(skill["object_id"], conversation.id)
    context = object_service.get_conversation_context_object(conversation.id)
    assert context["object_id"] == skill["object_id"]
    updated = object_service.recognize_objects(conversation.id, "message-two", "继续开发这个 Chrome Extension Skill，并增加结构化数据获取。")
    revised = next(item for item in updated if item["object_id"] == skill["object_id"])
    assert revised["version"] == 2
    assert len(object_service.get_object(skill["object_id"])["revisions"]) == 1
    persisted_context = object_service.get_conversation_context_object(conversation.id)
    assert persisted_context["object_id"] == skill["object_id"]
    assert persisted_context["version"] == 2
    assert len(persisted_context["revisions"]) == 1
    approved = object_service.approve_object(skill["object_id"])
    assert approved["status"] == "approved"
    assert approved["execution_refs"][0]["status"] == "draft"
    approved_again = object_service.approve_object(skill["object_id"])
    assert approved_again["execution_refs"] == approved["execution_refs"]
    assert any(item["object_id"] == skill["object_id"] for item in object_service.list_founder_objects())


def test_same_semantic_object_is_reused_across_unbound_conversations(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    first = conversation_service.create_conversation(title="First")
    second = conversation_service.create_conversation(title="Second")
    first_object = object_service.recognize_objects(first.id, "m1", "需要开发 Chrome Extension Skill")[0]
    second_object = object_service.recognize_objects(second.id, "m2", "继续开发 Chrome Extension Skill")[0]
    assert first_object["object_id"] == second_object["object_id"]
    assert second_object["version"] == 2


def test_context_discussion_creates_real_related_capability_and_can_detach(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    conversation = conversation_service.create_conversation(title="Context relation")
    skill = object_service.recognize_objects(conversation.id, "m1", "需要开发 Chrome Extension Skill")[0]
    object_service.attach_object_context(skill["object_id"], conversation.id)
    result = object_service.recognize_objects(conversation.id, "m2", "需要增加 Browser Session Capability 来支持浏览器会话处理")
    capability = next(item for item in result if item["object_type"] == "capability")
    updated_skill = object_service.get_object(skill["object_id"])
    assert capability["name"] == "Browser Session"
    assert capability["object_id"] in updated_skill["dependency_object_ids"]
    assert skill["object_id"] in object_service.get_object(capability["object_id"])["related_object_ids"]
    object_service.detach_object_context(conversation.id)
    assert object_service.get_conversation_context_object(conversation.id) is None
