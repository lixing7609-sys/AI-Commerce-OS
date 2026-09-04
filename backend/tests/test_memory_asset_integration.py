from fastapi.testclient import TestClient

from app.core.memory.model import MemoryAssetDB
from app.database.db import SessionLocal
from app.main import app


def _create_assets(client: TestClient) -> tuple[str, str, str, str]:
    conversation = client.post("/api/v1/conversations", json={"title": "Memory Test"}).json()
    context = client.get(f"/api/v1/conversations/{conversation['id']}/context").json()
    decision = client.post(
        "/api/v1/decisions",
        json={
            "title": "Memory decision",
            "decision": "Keep the asset boundary",
            "conversation_id": conversation["id"],
            "context_id": context["id"],
        },
    ).json()
    task = client.post(
        "/api/v1/task-assets", json={"title": "Memory task", "decision_id": decision["id"]}
    ).json()
    artifact = client.post(
        "/api/v1/artifacts",
        json={
            "artifact_type": "document",
            "title": "Memory artifact",
            "task_asset_id": task["id"],
            "conversation_id": conversation["id"],
            "decision_id": decision["id"],
        },
    ).json()
    return conversation["id"], decision["id"], task["id"], artifact["id"]


def test_create_memory_is_bound_to_founder_and_relations():
    with TestClient(app) as client:
        conversation_id, decision_id, task_id, artifact_id = _create_assets(client)
        response = client.post(
            "/api/v1/memories",
            json={
                "memory_type": "decision",
                "title": "Founder memory",
                "content": "Keep the canonical system boundary.",
                "confidence": 0.9,
                "conversation_id": conversation_id,
                "decision_id": decision_id,
                "task_asset_id": task_id,
                "artifact_id": artifact_id,
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert body["system_id"] == "founder_ai"
    assert body["conversation_id"] == conversation_id
    assert body["decision_id"] == decision_id
    assert body["task_asset_id"] == task_id
    assert body["artifact_id"] == artifact_id


def test_memory_can_be_listed_and_read():
    with TestClient(app) as client:
        created = client.post(
            "/api/v1/memories",
            json={"memory_type": "knowledge", "title": "List memory", "content": "Content"},
        ).json()
        listed = client.get("/api/v1/memories")
        fetched = client.get(f"/api/v1/memories/{created['id']}")

    assert listed.status_code == 200
    assert any(item["id"] == created["id"] for item in listed.json())
    assert fetched.status_code == 200


def test_system_id_override_is_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/memories",
            json={"memory_type": "rule", "title": "Override", "content": "Invalid", "system_id": "operator_ai"},
        )
    assert response.status_code == 422


def test_memory_reads_are_isolated_by_system():
    with SessionLocal() as session:
        record = MemoryAssetDB(
            system_id="operator_ai", memory_type="knowledge", title="Operator memory", content="Private"
        )
        session.add(record)
        session.commit()
        memory_id = record.id

    try:
        with TestClient(app) as client:
            listed = client.get("/api/v1/memories")
            hidden = client.get(f"/api/v1/memories/{memory_id}")

        assert all(item["system_id"] == "founder_ai" for item in listed.json())
        assert hidden.status_code == 404
    finally:
        with SessionLocal() as session:
            session.query(MemoryAssetDB).filter_by(id=memory_id).delete()
            session.commit()
