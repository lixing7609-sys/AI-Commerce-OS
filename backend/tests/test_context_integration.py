from fastapi.testclient import TestClient

from app.core.context.model import ConversationContextDB
from app.core.conversation.model import ConversationDB
from app.database.db import SessionLocal
from app.main import app


def test_creating_conversation_creates_founder_context():
    with TestClient(app) as client:
        conversation = client.post("/api/v1/conversations", json={"title": "Context Test"}).json()
        response = client.get(f"/api/v1/conversations/{conversation['id']}/context")

    assert response.status_code == 200
    body = response.json()
    assert body["conversation_id"] == conversation["id"]
    assert body["system_id"] == "founder_ai"


def test_context_defaults_are_returned():
    with TestClient(app) as client:
        conversation = client.post("/api/v1/conversations", json={}).json()
        context = client.get(f"/api/v1/conversations/{conversation['id']}/context").json()

    assert context["constraints"] == {}
    assert context["knowledge_refs"] == []
    assert context["task_refs"] == []


def test_context_reads_are_isolated_by_system():
    with SessionLocal() as session:
        conversation = ConversationDB(system_id="operator_ai", title="Operator context")
        session.add(conversation)
        session.flush()
        context = ConversationContextDB(conversation_id=conversation.id, system_id="operator_ai")
        session.add(context)
        session.commit()
        conversation_id = conversation.id

    try:
        with TestClient(app) as client:
            response = client.get(f"/api/v1/conversations/{conversation_id}/context")
        assert response.status_code == 404
    finally:
        with SessionLocal() as session:
            session.query(ConversationContextDB).filter_by(conversation_id=conversation_id).delete()
            session.query(ConversationDB).filter_by(id=conversation_id).delete()
            session.commit()
