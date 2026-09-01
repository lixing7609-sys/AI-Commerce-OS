from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.conversation.service as conversation_service
import app.core.founder_intent.service as intent_service
import app.core.founder_object.service as object_service
from core.founder_object.model import FounderObjectDB, ConversationObjectContextDB


def runtime(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool); Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    for module in (conversation_service, intent_service, object_service): monkeypatch.setattr(module, "SessionLocal", factory)
    monkeypatch.setattr(object_service, "create_task_asset", lambda **kwargs: SimpleNamespace(id="task-intent", **kwargs))
    monkeypatch.setattr(object_service, "create_execution_session", lambda *_args: SimpleNamespace(id="execution-intent", status="draft"))
    return factory


def add_object(factory, conversation_id, object_type, name, status="draft"):
    with factory() as session:
        item = FounderObjectDB(object_type=object_type, name=name, normalized_name=object_service._normalize_name(name), description="original", status=status, source_conversation_id=conversation_id, scope_key="founder_ai"); session.add(item); session.commit(); session.refresh(item); return item.id


def test_natural_delay_resolves_existing_and_confirm_does_not_mutate_object(monkeypatch):
    factory = runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Intent")
    object_id = add_object(factory, conversation.id, "agent", "广告投放 Agent", "approved")
    generator = lambda _ctx: ({"intents": [{"intent_type": "delay", "target_object": {"name": "广告投放 Agent"}, "proposed_status": "deferred", "reason": "Founder 当前要求暂停开发", "confidence": .94}]}, "test", "intent-model")
    engine = intent_service.FounderIntentEngine(generator); candidates = engine.run(conversation.id, "m-delay", "广告投放 Agent 现在先不要开发。")
    candidate = candidates[0]; assert candidate["target_object_id"] == object_id and candidate["review_status"] == "pending"
    assert object_service.get_object(object_id)["status"] == "approved"
    confirmed = intent_service.review_candidate(candidate["candidate_id"], "confirm"); updated = object_service.get_object(object_id)
    assert confirmed["review_status"] == "confirmed" and confirmed["reviewed_at"]
    assert confirmed["review_action"] == "confirm"
    assert confirmed["mutation_result"]["object_mutation_performed"] is False
    assert confirmed["mutation_result"]["task_asset_created"] is False
    assert confirmed["mutation_result"]["execution_created"] is False
    assert updated["status"] == "approved" and updated["version"] == 1 and len(updated["revisions"]) == 0


def test_context_modify_is_idempotent_and_reject_is_safe(monkeypatch):
    factory = runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Modify")
    object_id = add_object(factory, conversation.id, "skill", "Chrome Extension Skill", "approved")
    with factory() as session: session.add(ConversationObjectContextDB(conversation_id=conversation.id, object_id=object_id)); session.commit()
    output = {"intents": [{"intent_type": "modify", "target_object": {"name": "这个 Skill"}, "proposed_description": "增加 Cookie 管理能力", "proposed_patch": {"description": "增加 Cookie 管理能力"}, "reason": "修改当前对象", "confidence": .9}]}
    engine = intent_service.FounderIntentEngine(lambda _ctx: (output, "test", "intent-model"))
    one = engine.run(conversation.id, "m-cookie", "这个 Skill 还需要支持 Cookie 管理。"); two = engine.run(conversation.id, "m-cookie", "这个 Skill 还需要支持 Cookie 管理。")
    assert len(one) == len(two) == 1 and one[0]["target_object_id"] == object_id
    rejected = intent_service.review_candidate(one[0]["candidate_id"], "reject")
    assert rejected["review_status"] == "rejected" and rejected["review_action"] == "reject"
    assert rejected["mutation_result"]["candidate_confirmed"] is False
    assert object_service.get_object(object_id)["version"] == 1


def test_pending_modify_confirm_preserves_effective_version_and_execution(monkeypatch):
    factory = runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Modify approved")
    object_id = add_object(factory, conversation.id, "skill", "Chrome Extension Skill", "approved")
    with factory() as session:
        record = session.get(FounderObjectDB, object_id)
        record.version = 2
        record.execution_refs = [{"execution_id": "execution-v2", "task_asset_id": "task-v2", "status": "draft", "object_version": 2}]
        session.add(ConversationObjectContextDB(conversation_id=conversation.id, object_id=object_id)); session.commit()
    output = {"intents": [{"intent_type": "modify", "target_object": {"name": "这个 Skill"}, "proposed_description": "增加浏览器数据处理流程", "confidence": .9}]}
    candidate = intent_service.FounderIntentEngine(lambda _ctx: (output, "test", "intent-model")).run(conversation.id, "m-v3", "这个 Skill 增加浏览器数据处理流程")[0]
    pending_object = object_service.get_object(object_id)
    assert pending_object["version"] == 2 and pending_object["status"] == "approved" and pending_object["execution_refs"][-1]["object_version"] == 2
    confirmed = intent_service.review_candidate(candidate["candidate_id"], "confirm")
    approved = object_service.get_object(object_id)
    assert confirmed["review_status"] == "confirmed"
    assert approved["version"] == 2 and approved["status"] == "approved"
    assert len(approved["execution_refs"]) == 1 and approved["execution_refs"][-1]["execution_id"] == "execution-v2" and approved["execution_refs"][-1]["object_version"] == 2


def test_rejected_modify_keeps_approved_execution_version(monkeypatch):
    factory = runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Reject approved")
    object_id = add_object(factory, conversation.id, "skill", "Chrome Extension Skill", "approved")
    with factory() as session:
        record = session.get(FounderObjectDB, object_id); record.version = 3; record.execution_refs = [{"execution_id": "execution-v3", "status": "draft", "object_version": 3}]
        session.add(ConversationObjectContextDB(conversation_id=conversation.id, object_id=object_id)); session.commit()
    output = {"intents": [{"intent_type": "modify", "target_object": {"name": "这个 Skill"}, "proposed_description": "候选 V4", "confidence": .9}]}
    candidate = intent_service.FounderIntentEngine(lambda _ctx: (output, "test", "intent-model")).run(conversation.id, "m-v4", "这个 Skill 形成候选 V4")[0]
    rejected = intent_service.review_candidate(candidate["candidate_id"], "reject")
    unchanged = object_service.get_object(object_id)
    assert rejected["mutation_result"]["candidate_confirmed"] is False
    assert unchanged["version"] == 3 and unchanged["status"] == "approved" and unchanged["execution_refs"][-1]["object_version"] == 3


def test_create_without_fixed_wording_and_ambiguous_reference(monkeypatch):
    runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Create")
    output = {"intents": [{"intent_type": "create", "proposed_object_type": "capability", "proposed_name": "Browser Session", "reason": "应独立为共享能力", "confidence": .76}]}
    engine = intent_service.FounderIntentEngine(lambda _ctx: (output, "test", "intent-model")); candidates = engine.run(conversation.id, "m-natural", "浏览器会话最好独立出来，Chrome 插件和自动化流程都依赖它。")
    assert candidates[0]["candidate_kind"] == "create_object" and object_service.list_founder_objects() == []
    confirmed = intent_service.review_candidate(candidates[0]["candidate_id"], "confirm")
    assert confirmed["review_status"] == "confirmed" and confirmed["mutation_result"]["execution_created"] is False
    assert object_service.list_founder_objects() == []
    again = intent_service.review_candidate(candidates[0]["candidate_id"], "approve")
    assert again["mutation_result"] == confirmed["mutation_result"] and object_service.list_founder_objects() == []


def test_confirm_candidate_does_not_call_mutation_or_approval(monkeypatch):
    runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Safety")
    output = {"intents": [{"intent_type": "create", "proposed_object_type": "capability", "proposed_name": "Safe Candidate", "reason": "明确候选", "confidence": .8}]}
    candidate = intent_service.FounderIntentEngine(lambda _ctx: (output, "test", "intent-model")).run(conversation.id, "m-safe", "我们应该形成 Safe Candidate 能力。")[0]
    monkeypatch.setattr(intent_service, "_apply_mutation", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("confirm must not mutate")))
    confirmed = intent_service.review_candidate(candidate["candidate_id"], "confirm")
    assert confirmed["review_status"] == "confirmed"
    assert confirmed["mutation_result"]["object_mutation_performed"] is False
    assert confirmed["mutation_result"]["task_asset_created"] is False
    assert confirmed["mutation_result"]["execution_created"] is False
    assert object_service.list_founder_objects() == []


def test_continue_candidate_discussion_keeps_candidate_pending_in_same_conversation(monkeypatch):
    runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Continue")
    output = {"intents": [{"intent_type": "create", "proposed_object_type": "agent", "proposed_name": "Discussion Agent", "reason": "候选需要继续讨论", "confidence": .7}]}
    candidate = intent_service.FounderIntentEngine(lambda _ctx: (output, "test", "intent-model")).run(conversation.id, "m-continue", "我们可能需要一个 Discussion Agent。")[0]
    attached = intent_service.attach_candidate_context(candidate["candidate_id"], conversation.id)
    context = intent_service.get_conversation_candidate_context(conversation.id)
    assert attached["candidate_id"] == candidate["candidate_id"]
    assert attached["conversation_id"] == conversation.id
    assert context["candidate_id"] == candidate["candidate_id"]
    assert context["review_status"] == "pending"
    assert object_service.list_founder_objects() == []


def test_provider_and_parse_failure_never_mutate(monkeypatch):
    runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Failure")
    def fail(_ctx): raise ValueError("bad provider output")
    assert intent_service.FounderIntentEngine(fail).run(conversation.id, "m-fail", "自然讨论") == []
    assert object_service.list_founder_objects() == []


def test_invalid_object_and_candidate_context_bindings_are_cleaned(monkeypatch):
    factory = runtime(monkeypatch); conversation = conversation_service.create_conversation(title="Context integrity")
    with factory() as session:
        session.add(ConversationObjectContextDB(conversation_id=conversation.id, object_id="missing-object"))
        session.add(intent_service.ConversationCandidateContextDB(conversation_id=conversation.id, candidate_id="missing-candidate")); session.commit()
    assert object_service.get_conversation_context_object(conversation.id) is None
    assert intent_service.get_conversation_candidate_context(conversation.id) is None
    with factory() as session:
        assert session.get(ConversationObjectContextDB, conversation.id) is None
        assert session.get(intent_service.ConversationCandidateContextDB, conversation.id) is None
