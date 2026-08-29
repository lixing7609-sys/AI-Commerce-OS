from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.services.database_readiness_service import DatabaseReadinessError


def test_health_reports_database_and_migration(monkeypatch):
    monkeypatch.setattr(
        "app.main.DatabaseReadinessService.check_ready",
        lambda: SimpleNamespace(current_revision="revision-head"),
    )
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "AI-Commerce-OS",
        "version": "0.1.0",
        "app": "ok",
        "database": "healthy",
        "migration": "head",
        "revision": "revision-head",
    }


def test_health_is_unhealthy_when_database_is_not_ready(monkeypatch):
    def fail():
        raise DatabaseReadinessError("revision mismatch")

    monkeypatch.setattr("app.main.DatabaseReadinessService.check_ready", fail)
    response = TestClient(app).get("/health")
    assert response.status_code == 503
    assert response.json()["database"] == "unhealthy"


def test_database_pool_health_exposes_connection_lifecycle(monkeypatch):
    monkeypatch.setattr("app.main.pool_metrics_snapshot", lambda: {
        "pool_size": 5, "checked_in": 4, "checked_out": 1, "overflow": 0,
        "checkout_total": 12, "checkin_total": 11, "acquire_timeout_count": 2,
    })
    response = TestClient(app).get("/health/database-pool")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok", "pool_size": 5, "checked_in": 4, "checked_out": 1,
        "overflow": 0, "checkout_total": 12, "checkin_total": 11,
        "acquire_timeout_count": 2,
    }
