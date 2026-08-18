from types import SimpleNamespace
import importlib

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.conversation.service as conversation_service
from app.core.conversation_first.model import ConversationMessageDB


def isolated(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    monkeypatch.setattr(conversation_service, "get_project", lambda project_id: SimpleNamespace(id=project_id))
    return factory


def test_founder_and_project_conversation_filing_preserves_identity(monkeypatch):
    factory = isolated(monkeypatch)
    record = conversation_service.create_conversation(title="Conversation Lifecycle Test A")
    with factory() as session:
        session.add(ConversationMessageDB(conversation_id=record.id, role="founder", content="这是稳定内容")); session.commit()
    assert record.conversation_type == "USER_CONVERSATION"
    assert record.created_by == "FOUNDER"
    assert [item.id for item in conversation_service.list_conversations(scope="global")] == [record.id]

    filed = conversation_service.bind_conversation_project(record.id, "project-filing-test")
    assert filed.id == record.id
    assert filed.conversation_type == "PROJECT_CONVERSATION"
    assert conversation_service.list_conversations(scope="global") == []
    assert [item.id for item in conversation_service.list_conversations(scope="project", project_id="project-filing-test")] == [record.id]
    with factory() as session:
        assert session.query(ConversationMessageDB).filter_by(conversation_id=record.id).one().content == "这是稳定内容"

    unfiled = conversation_service.bind_conversation_project(record.id, None)
    assert unfiled.id == record.id
    assert unfiled.project_id is None and unfiled.conversation_type == "USER_CONVERSATION"
    assert [item.id for item in conversation_service.list_conversations(scope="global")] == [record.id]


def test_system_verification_and_temporary_records_never_pollute_lists(monkeypatch):
    isolated(monkeypatch)
    user = conversation_service.create_conversation(title="Founder discussion")
    system = conversation_service.create_conversation(title="Runtime worker", conversation_type="SYSTEM_RUN", created_by="SYSTEM")
    verification = conversation_service.create_conversation(title="Path fixture", conversation_type="VERIFICATION_RUN", created_by="VERIFICATION")
    temporary = conversation_service.create_conversation(title="Empty fixture", conversation_type="TEMPORARY_CONVERSATION", created_by="VERIFICATION")
    assert [item.id for item in conversation_service.list_conversations()] == [user.id]
    assert system.visibility == verification.visibility == temporary.visibility == "hidden_from_conversation_list"
    assert temporary.lifecycle_status == "ephemeral"
    assert conversation_service.get_conversation(system.id).id == system.id
    assert conversation_service.get_conversation(verification.id).id == verification.id


def test_first_substantive_message_activates_atomic_draft(monkeypatch):
    factory = isolated(monkeypatch)
    draft = conversation_service.create_conversation(title="新讨论", conversation_type="TEMPORARY_CONVERSATION", created_by="FOUNDER")
    assert conversation_service.list_conversations() == []
    try: conversation_service.activate_conversation(draft.id)
    except conversation_service.ConversationBoundaryError: pass
    else: raise AssertionError("An empty draft must not become a Conversation")
    with factory() as session:
        session.add(ConversationMessageDB(conversation_id=draft.id, role="founder", content="Home Draft Atomic Test")); session.commit()
    active = conversation_service.activate_conversation(draft.id)
    assert active.id == draft.id
    assert active.conversation_type == "USER_CONVERSATION"
    assert active.visibility == "conversation_list"
    assert [item.id for item in conversation_service.list_conversations()] == [draft.id]


def test_empty_shell_audit_hides_only_records_without_evidence(monkeypatch):
    factory = isolated(monkeypatch)
    empty = conversation_service.create_conversation(title="新讨论")
    substantive = conversation_service.create_conversation(title="新讨论")
    with factory() as session:
        session.add(ConversationMessageDB(conversation_id=substantive.id, role="founder", content="真实 Founder 内容")); session.commit()
    report = conversation_service.audit_empty_founder_conversations(hide=True)
    assert report["conversation_ids"] == [empty.id]
    assert report["hidden_count"] == 1
    assert conversation_service.get_conversation(empty.id).lifecycle_status == "ephemeral"
    assert [item.id for item in conversation_service.list_conversations()] == [substantive.id]


def test_non_founder_runs_cannot_be_filed_into_projects(monkeypatch):
    isolated(monkeypatch)
    run = conversation_service.create_conversation(title="Probe", conversation_type="SYSTEM_RUN", created_by="SYSTEM")
    try: conversation_service.bind_conversation_project(run.id, "project-filing-test")
    except conversation_service.ConversationBoundaryError as error: assert "Only Founder conversations" in str(error)
    else: raise AssertionError("System Run must not become a Project Conversation")


def test_historical_migration_uses_exact_audited_ids_not_titles():
    migration = importlib.import_module("migrations.versions.e26a7b8c9d0e_add_conversation_governance_v1")
    assert "conv-ab957190aa314307950e" in migration.VERIFICATION_IDS
    assert "conv-5bb01b1a10f14c8ca132" in migration.VERIFICATION_IDS
    assert "conv-d9b6234f3cce4d6e8e86" in migration.VERIFICATION_IDS
    assert "Memory Test" not in migration.VERIFICATION_IDS
    assert "Artifact Test" not in migration.VERIFICATION_IDS
