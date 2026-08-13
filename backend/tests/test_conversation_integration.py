from fastapi.testclient import TestClient
import pytest

from app.core.application_system.model import ApplicationSystemDB
from app.core.conversation.model import ConversationDB
from app.database.db import SessionLocal
from app.main import app


@pytest.fixture(autouse=True)
def cleanup_persisted_api_fixtures():
    yield
    with SessionLocal() as session:
        session.query(ConversationDB).filter(ConversationDB.title.in_(["Founder Conversation Test", "Read Test", "Binding"])).delete(synchronize_session=False)
        from app.core.project.model import FounderProjectDB
        session.query(FounderProjectDB).filter(FounderProjectDB.name == "Binding Test").delete(synchronize_session=False)
        session.commit()


def test_new_conversation_is_bound_to_founder_ai():
    with TestClient(app) as client:
        response = client.post("/api/v1/conversations", json={"title": "Founder Conversation Test"})

    assert response.status_code == 201
    body = response.json()
    assert body["system_id"] == "founder_ai"


def test_conversation_can_be_listed_and_read():
    with TestClient(app) as client:
        created = client.post("/api/v1/conversations", json={"title": "Read Test"}).json()
        listed = client.get("/api/v1/conversations")
        fetched = client.get(f"/api/v1/conversations/{created['id']}")

    assert listed.status_code == 200
    assert any(item["id"] == created["id"] for item in listed.json())
    assert fetched.status_code == 200
    assert fetched.json()["system_id"] == "founder_ai"


def test_conversation_project_binding_persists_and_can_be_cleared():
    with TestClient(app) as client:
        project = client.post("/api/v1/founder-ai/projects", json={"name": "Binding Test", "description": None}).json()
        conversation = client.post("/api/v1/conversations", json={"title": "Binding"}).json()
        bound = client.patch(f"/api/v1/conversations/{conversation['id']}/project", json={"project_id": project["id"]})
        restored = client.get(f"/api/v1/conversations/{conversation['id']}")
        cleared = client.patch(f"/api/v1/conversations/{conversation['id']}/project", json={"project_id": None})
    assert bound.status_code == 200 and restored.json()["project_id"] == project["id"]
    assert cleared.status_code == 200 and cleared.json()["project_id"] is None
    with SessionLocal() as session:
        session.query(ConversationDB).filter_by(id=conversation["id"]).delete()
        from app.core.project.model import FounderProjectDB
        session.query(FounderProjectDB).filter_by(id=project["id"]).delete()
        session.commit()


def test_nonexistent_application_system_cannot_be_created_via_public_api():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/conversations",
            json={"title": "No system override", "system_id": "operator_ai"},
        )

    assert response.status_code == 422


def test_conversation_reads_are_isolated_by_system():
    with SessionLocal() as session:
        operator_system = session.query(ApplicationSystemDB).filter_by(system_key="operator_ai").first()
        operator_conversation = ConversationDB(
            system_id="operator_ai", title="Operator placeholder conversation"
        )
        session.add(operator_conversation)
        session.commit()
        operator_id = operator_conversation.id

    try:
        with TestClient(app) as client:
            listed = client.get("/api/v1/conversations")
            hidden = client.get(f"/api/v1/conversations/{operator_id}")

        assert operator_system is None
        assert all(item["system_id"] == "founder_ai" for item in listed.json())
        assert hidden.status_code == 404
    finally:
        with SessionLocal() as session:
            session.query(ConversationDB).filter_by(id=operator_id).delete()
            session.commit()
