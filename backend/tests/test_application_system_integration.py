from fastapi.testclient import TestClient

from app.core.application_system.model import ApplicationSystemDB
from app.database.db import SessionLocal
from app.main import app


def test_founder_ai_exists_and_is_the_only_current_system():
    with TestClient(app) as client:
        response = client.get("/api/v1/application-systems")

    assert response.status_code == 200
    systems = response.json()
    assert any(item["system_key"] == "founder_ai" for item in systems)
    assert {item["system_key"] for item in systems} == {"founder_ai"}


def test_system_key_is_unique():
    with SessionLocal() as session:
        founder_rows = list(
            session.query(ApplicationSystemDB)
            .filter(ApplicationSystemDB.system_key == "founder_ai")
            .all()
        )

    assert len(founder_rows) == 1


def test_application_system_can_be_read_by_id():
    with TestClient(app) as client:
        systems = client.get("/api/v1/application-systems").json()
        system_id = systems[0]["id"]
        response = client.get(f"/api/v1/application-systems/{system_id}")

    assert response.status_code == 200
    assert response.json()["system_key"] == "founder_ai"


def test_future_placeholders_do_not_change_founder_identity():
    with TestClient(app) as client:
        response = client.get("/api/v1/application-systems")

    assert response.status_code == 200
    assert response.json()[0]["system_key"] == "founder_ai"
