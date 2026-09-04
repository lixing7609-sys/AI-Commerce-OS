from fastapi.testclient import TestClient

from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.main import app


def _create_decision(client: TestClient) -> str:
    return client.post(
        "/api/v1/decisions",
        json={"title": "Task decision", "decision": "Create a bounded task"},
    ).json()["id"]


def test_create_task_asset_is_bound_to_founder_ai():
    with TestClient(app) as client:
        decision_id = _create_decision(client)
        response = client.post(
            "/api/v1/task-assets",
            json={"title": "Founder task", "decision_id": decision_id},
        )

    assert response.status_code == 201
    body = response.json()
    assert body["system_id"] == "founder_ai"
    assert body["decision_id"] == decision_id


def test_task_asset_can_be_listed_and_read():
    with TestClient(app) as client:
        created = client.post("/api/v1/task-assets", json={"title": "List task"}).json()
        listed = client.get("/api/v1/task-assets")
        fetched = client.get(f"/api/v1/task-assets/{created['id']}")

    assert listed.status_code == 200
    assert any(item["id"] == created["id"] for item in listed.json())
    assert fetched.status_code == 200


def test_system_id_override_is_rejected():
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/task-assets",
            json={"title": "Override", "system_id": "operator_ai"},
        )
    assert response.status_code == 422


def test_task_asset_reads_are_isolated_by_system():
    with SessionLocal() as session:
        record = TaskAssetDB(system_id="operator_ai", title="Operator task")
        session.add(record)
        session.commit()
        task_id = record.id

    try:
        with TestClient(app) as client:
            listed = client.get("/api/v1/task-assets")
            hidden = client.get(f"/api/v1/task-assets/{task_id}")

        assert all(item["system_id"] == "founder_ai" for item in listed.json())
        assert hidden.status_code == 404
    finally:
        with SessionLocal() as session:
            session.query(TaskAssetDB).filter_by(id=task_id).delete()
            session.commit()
