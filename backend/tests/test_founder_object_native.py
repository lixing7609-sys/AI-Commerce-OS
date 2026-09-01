from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.conversation.service as conversation_service
import app.core.founder_object.service as object_service
from core.founder_object.model import FounderObjectDB


def add_object(factory, conversation_id, object_type, name, status="draft"):
    with factory() as session:
        item = FounderObjectDB(object_type=object_type, name=name, normalized_name=object_service._normalize_name(name), description="original", status=status, source_conversation_id=conversation_id, scope_key="founder_ai")
        session.add(item); session.commit(); session.refresh(item)
        return item.id


def test_conversation_recognizes_updates_and_approves_real_skill(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Object Approval must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Object Approval must not create Execution")), raising=False)

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
    assert approved["execution_refs"] == []
    approved_again = object_service.approve_object(skill["object_id"])
    assert approved_again["execution_refs"] == approved["execution_refs"]
    assert any(item["object_id"] == skill["object_id"] for item in object_service.list_founder_objects())
    restored = object_service.attach_object_context(skill["object_id"], "conv-deleted-test-fixture")
    assert restored["context_conversation_id"] == conversation.id


def test_approve_task_object_is_status_only_without_taskasset_or_execution(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Object Approval must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Object Approval must not create Execution")), raising=False)
    conversation = conversation_service.create_conversation(title="Task object approval")
    object_id = add_object(factory, conversation.id, "task", "生成落地页 Agent", "draft")
    approved = object_service.approve_object(object_id)
    assert approved["status"] == "approved"
    assert approved["object_type"] == "task"
    assert approved["execution_refs"] == []
    approved_again = object_service.approve_object(object_id)
    assert approved_again["status"] == "approved"
    assert approved_again["execution_refs"] == []


def test_approve_decision_object_is_status_only_without_taskasset_or_execution(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Object Approval must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Object Approval must not create Execution")), raising=False)
    conversation = conversation_service.create_conversation(title="Decision object approval")
    object_id = add_object(factory, conversation.id, "decision", "第一阶段平台决策", "draft")
    approved = object_service.approve_object(object_id)
    assert approved["status"] == "approved"
    assert approved["object_type"] == "decision"
    assert approved["execution_refs"] == []


def test_continue_discussion_keeps_draft_object_without_execution_side_effects(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **_kwargs: (_ for _ in ()).throw(AssertionError("Continue Discussion must not create TaskAsset")), raising=False)
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: (_ for _ in ()).throw(AssertionError("Continue Discussion must not create Execution")), raising=False)
    conversation = conversation_service.create_conversation(title="Continue draft")
    object_id = add_object(factory, conversation.id, "task", "继续讨论任务对象", "draft")
    restored = object_service.attach_object_context(object_id, conversation.id)
    unchanged = object_service.get_object(object_id)
    assert restored["context_conversation_id"] == conversation.id
    assert unchanged["status"] == "draft"
    assert unchanged["execution_refs"] == []


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
