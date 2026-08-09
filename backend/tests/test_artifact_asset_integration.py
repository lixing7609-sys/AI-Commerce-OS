from fastapi.testclient import TestClient

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.main import app


def _create_relations(client: TestClient) -> tuple[str, str, str]:
    conversation = client.post("/api/v1/conversations", json={"title": "Artifact Test"}).json()
    context = client.get(f"/api/v1/conversations/{conversation['id']}/context").json()
    decision = client.post(
        "/api/v1/decisions",
        json={
            "title": "Artifact decision",
            "decision": "Create an artifact",
            "conversation_id": conversation["id"],
            "context_id": context["id"],
        },
    ).json()
    task = client.post(
        "/api/v1/task-assets",
        json={"title": "Artifact task", "decision_id": decision["id"]},
    ).json()
    return task["id"], conversation["id"], decision["id"]


def test_create_artifact_is_bound_to_founder_ai_and_relations():
    with TestClient(app) as client:
        task_id, conversation_id, decision_id = _create_relations(client)
        response = client.post(
            "/api/v1/artifacts",
            json={
                "artifact_type": "document",
                "title": "Founder artifact",
                "task_asset_id": task_id,
                "conversation_id": conversation_id,
                "decision_id": decision_id,
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert body["system_id"] == "founder_ai"
    assert body["task_asset_id"] == task_id
    assert body["conversation_id"] == conversation_id
    assert body["decision_id"] == decision_id


def test_artifact_can_be_listed_and_read():
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/artifacts", json={"artifact_type": "code", "title": "List artifact"}
        ).json()
        listed = client.get("/api/v1/artifacts")
        fetched = client.get(f"/api/v1/artifacts/{created['id']}")

    assert listed.status_code == 200
    assert any(item["id"] == created["id"] for item in listed.json())
    assert fetched.status_code == 200


def test_system_id_override_is_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/artifacts",
            json={"artifact_type": "file", "title": "Override", "system_id": "operator_ai"},
        )
    assert response.status_code == 422


def test_artifact_reads_are_isolated_by_system():
    with SessionLocal() as session:
        record = ArtifactAssetDB(
            system_id="operator_ai", artifact_type="file", title="Operator artifact"
        )
        session.add(record)
        session.commit()
        artifact_id = record.id

    try:
        with TestClient(app) as client:
            listed = client.get("/api/v1/artifacts")
            hidden = client.get(f"/api/v1/artifacts/{artifact_id}")

        assert all(item["system_id"] == "founder_ai" for item in listed.json())
        assert hidden.status_code == 404
    finally:
        with SessionLocal() as session:
            session.query(ArtifactAssetDB).filter_by(id=artifact_id).delete()
            session.commit()
