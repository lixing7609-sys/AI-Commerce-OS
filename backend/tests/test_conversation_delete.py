from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.conversation.service as conversation_service
from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation_first.model import ConversationMessageDB
from app.core.task_asset.model import TaskAssetDB
from core.founder_intent.model import ConversationCandidateContextDB, FounderIntentRunDB, FounderObjectCandidateDB
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB


def isolated(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(conversation_service, "get_project", lambda _id: SimpleNamespace(id=_id))
    return factory


def test_delete_conversation_cleans_chat_state_and_preserves_formal_assets(monkeypatch):
    factory = isolated(monkeypatch); conversation = conversation_service.create_conversation(title="Delete me")
    with factory() as session:
        session.add(ConversationMessageDB(conversation_id=conversation.id, role="founder", content="message"))
        obj = FounderObjectDB(object_type="skill", name="Durable Skill", normalized_name="durableskill", status="approved", source_conversation_id=conversation.id, source_message_refs=["message"]); session.add(obj); session.flush()
        session.add(FounderObjectRevisionDB(object_id=obj.id, version=1, name=obj.name, description="", status="approved", source_conversation_id=conversation.id))
        session.add(ConversationObjectContextDB(conversation_id=conversation.id, object_id=obj.id))
        run = FounderIntentRunDB(conversation_id=conversation.id, trigger_message_id="message"); session.add(run); session.flush()
        candidate = FounderObjectCandidateDB(intent_id=run.id, conversation_id=conversation.id, candidate_kind="modify_object", intent_type="modify", target_object_id=obj.id, fingerprint="pending-delete", review_status="pending"); session.add(candidate); session.flush()
        session.add(ConversationCandidateContextDB(conversation_id=conversation.id, candidate_id=candidate.id))
        session.add(TaskAssetDB(system_id="founder_ai", conversation_id=conversation.id, title="Durable Task", description="task", scope={}, status="approved", approval_status="approved", execution_status="not_started"))
        session.add(ArtifactAssetDB(system_id="founder_ai", conversation_id=conversation.id, artifact_type="code", title="Durable Artifact")); session.commit(); object_id = obj.id
    result = conversation_service.delete_conversation(conversation.id)
    assert result["deleted"] is True and conversation_service.get_conversation(conversation.id) is None
    with factory() as session:
        assert session.query(ConversationMessageDB).filter_by(conversation_id=conversation.id).count() == 0
        assert session.get(ConversationObjectContextDB, conversation.id) is None
        assert session.get(ConversationCandidateContextDB, conversation.id) is None
        assert session.query(FounderObjectCandidateDB).filter_by(conversation_id=conversation.id).count() == 0
        durable = session.get(FounderObjectDB, object_id); assert durable is not None and durable.status == "approved" and durable.source_conversation_id is None
        assert session.query(FounderObjectRevisionDB).filter_by(object_id=object_id).one().source_conversation_id is None
        assert session.query(TaskAssetDB).one().conversation_id is None
        assert session.query(ArtifactAssetDB).one().conversation_id is None


def test_delete_missing_conversation_is_controlled(monkeypatch):
    isolated(monkeypatch)
    try: conversation_service.delete_conversation("missing")
    except LookupError as error: assert str(error) == "Conversation not found"
    else: raise AssertionError("missing Conversation must not appear deleted")
