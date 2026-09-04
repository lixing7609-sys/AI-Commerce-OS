from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.project.model import FounderProjectDB
from app.database.base import Base
import app.core.dependency_outcome.service as service


def _factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(service, "SessionLocal", factory)
    return factory


def test_execution_result_creates_one_traceable_external_dependency_outcome(monkeypatch):
    factory = _factory(monkeypatch)
    package = {"package_id": "package-1", "affected_system_objects": ["Runtime Platform（external）"], "work_items": [{"work_item_id": "wi-1"}]}
    execution = {"execution_session_id": "session-1", "execution_status": "blocked", "validation_status": "failed", "remaining_issues": [{"work_item_id": "wi-1", "reason": "Runtime Platform runtime is unavailable", "checks": {"storage": False, "identity": False}}]}
    with factory() as db:
        project = FounderProjectDB(id="project-a", system_id="founder_ai", name="System A")
        conversation = ConversationDB(id="conv-a", system_id="founder_ai", project_id=project.id, title="Planning")
        state = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="execution_package", discovery={"execution_package": package, "execution_session": execution})
        db.add_all([project, conversation, state]); db.commit()

    first = service.feedback_execution_dependencies("conv-a")
    second = service.feedback_execution_dependencies("conv-a")
    assert first["implementation_status"] == "completed"
    assert second["validation_status"] == "blocked_by_external_dependency"
    assert first["external_dependencies"][0]["dependency_id"] == second["external_dependencies"][0]["dependency_id"]
    assert first["external_dependencies"][0]["required_capabilities"] == ["storage", "identity"]
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-a").one()
        assert len(state.discovery["dependency_outcomes"]) == 1
        assert state.discovery["execution_session"]["execution_status"] == "blocked"


def test_dependency_evidence_is_retrieved_by_target_semantics(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as db:
        project = FounderProjectDB(id="project-a", system_id="founder_ai", name="System A")
        conversation = ConversationDB(id="conv-a", system_id="founder_ai", project_id=project.id, title="Planning")
        outcome = {"dependency_id": "dependency-1", "dependency_target": "Runtime Platform", "updated_at": "2026-08-17T00:00:00Z"}
        state = SinoBrainSessionDB(conversation_id=conversation.id, project_id=project.id, stage="execution_package", discovery={"dependency_outcomes": [outcome]})
        db.add_all([project, conversation, state]); db.commit()
        assert service.dependency_evidence_for_target(db, "runtime-platform") == [outcome]
        assert service.dependency_evidence_for_target(db, "Unrelated System") == []
