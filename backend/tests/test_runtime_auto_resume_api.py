"""
PUT /api/v1/runtime/auto-resume 测试。

覆盖：开关切换的持久化效果、不触发 RuntimeEngine/恢复流程、
不改变 desired_state/actual_state/recovery_failure_count/last_error、
数据库写入失败时的安全错误响应、非法请求体的 422、
以及 GET/POST/PUT 三个 endpoint 响应结构的一致性。

不真实重启 backend，不触发 heartbeat 等待；autouse fixture
在每个测试前后快照/恢复 system_runtime_state 和 RuntimeEngine/
Agent 内存状态，不修改 tasks。
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.runtime_recovery_service import RuntimeRecoveryService
from app.services.runtime_state_service import RuntimeStateService


def _snapshot_runtime_state_row():
    db = SessionLocal()

    try:
        row = (
            db.query(RuntimeStateDB)
            .filter(RuntimeStateDB.id == 1)
            .first()
        )

        if row is None:
            return None

        return {
            "desired_state": row.desired_state,
            "actual_state": row.actual_state,
            "auto_resume_enabled": row.auto_resume_enabled,
            "last_started_at": row.last_started_at,
            "last_stopped_at": row.last_stopped_at,
            "last_heartbeat_at": row.last_heartbeat_at,
            "last_shutdown_type": row.last_shutdown_type,
            "last_error": row.last_error,
            "recovery_failure_count": row.recovery_failure_count,
        }

    finally:
        db.close()


def _restore_runtime_state_row(snapshot):
    db = SessionLocal()

    try:
        row = (
            db.query(RuntimeStateDB)
            .filter(RuntimeStateDB.id == 1)
            .first()
        )

        if snapshot is None:
            if row is not None:
                db.delete(row)
                db.commit()
            return

        if row is None:
            row = RuntimeStateDB(id=1, **snapshot)
            db.add(row)
            db.commit()
            return

        for key, value in snapshot.items():
            setattr(row, key, value)

        row.updated_at = datetime.now(timezone.utc)

        db.commit()

    finally:
        db.close()


@pytest.fixture(autouse=True)
def _preserve_runtime_and_db_state():
    db_snapshot = _snapshot_runtime_state_row()
    memory_snapshot = {
        "running": runtime_engine.running,
        "started_at": runtime_engine.started_at,
        "stopped_at": runtime_engine.stopped_at,
    }

    yield

    runtime_engine.running = memory_snapshot["running"]
    runtime_engine.started_at = memory_snapshot["started_at"]
    runtime_engine.stopped_at = memory_snapshot["stopped_at"]

    if memory_snapshot["running"]:
        AgentRegistry.start_all()
    else:
        AgentRegistry.stop_all()

    _restore_runtime_state_row(db_snapshot)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


RUNTIME_STATUS_RESPONSE_KEYS = {
    "running",
    "status",
    "started_at",
    "stopped_at",
    "agents",
    "desired_state",
    "actual_state",
    "auto_resume_enabled",
    "last_started_at",
    "last_stopped_at",
    "last_heartbeat_at",
    "last_shutdown_type",
    "last_error",
    "recovery_failure_count",
    "updated_at",
}


# ---------------------------------------------------------------------------
# 1-3. 开关切换的持久化效果与响应结构
# ---------------------------------------------------------------------------


def test_put_auto_resume_enabled_true(client):
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state="stopped", actual_state="stopped", auto_resume_enabled=False
    )

    memory_before = runtime_engine.running

    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": True}
    )

    assert response.status_code == 200

    state = RuntimeStateService.get_state()
    assert state.auto_resume_enabled is True
    assert runtime_engine.running == memory_before
    assert state.desired_state == "stopped"
    assert state.actual_state == "stopped"


def test_put_auto_resume_enabled_false(client):
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(auto_resume_enabled=True)

    memory_before = runtime_engine.running

    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": False}
    )

    assert response.status_code == 200

    state = RuntimeStateService.get_state()
    assert state.auto_resume_enabled is False
    assert runtime_engine.running == memory_before


def test_put_auto_resume_response_matches_status_response_schema(client):
    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": True}
    )

    assert response.status_code == 200
    assert set(response.json().keys()) == RUNTIME_STATUS_RESPONSE_KEYS


# ---------------------------------------------------------------------------
# 4. 不调用 RuntimeEngine / RuntimeRecoveryService
# ---------------------------------------------------------------------------


def test_put_auto_resume_does_not_call_engine_or_recovery(client, monkeypatch):
    calls = {"start": False, "stop": False, "recovery": False}

    monkeypatch.setattr(
        runtime_engine, "start", lambda: calls.__setitem__("start", True)
    )
    monkeypatch.setattr(
        runtime_engine, "stop", lambda: calls.__setitem__("stop", True)
    )
    monkeypatch.setattr(
        RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(lambda: calls.__setitem__("recovery", True)),
    )

    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": True}
    )

    assert response.status_code == 200
    assert calls == {"start": False, "stop": False, "recovery": False}


# ---------------------------------------------------------------------------
# 5. 不修改 desired_state/actual_state/recovery_failure_count/last_error
# ---------------------------------------------------------------------------


def test_put_auto_resume_does_not_modify_other_fields(client):
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state="running",
        actual_state="error",
        last_error="既有错误信息",
        recovery_failure_count=2,
        auto_resume_enabled=False,
    )

    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": True}
    )

    assert response.status_code == 200

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "error"
    assert state.last_error == "既有错误信息"
    assert state.recovery_failure_count == 2
    assert state.auto_resume_enabled is True


# ---------------------------------------------------------------------------
# 6. 数据库写入失败
# ---------------------------------------------------------------------------


def test_put_auto_resume_db_write_failure_returns_500(client, monkeypatch):
    def fake_set_auto_resume(enabled):
        raise RuntimeError("模拟数据库写入失败，包含敏感连接串 postgresql://user:pass@host")

    monkeypatch.setattr(
        RuntimeStateService, "set_auto_resume", staticmethod(fake_set_auto_resume)
    )

    memory_before = runtime_engine.running

    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": True}
    )

    assert response.status_code == 500

    body = response.json()
    assert "postgresql://" not in body["detail"]
    assert "pass" not in body["detail"]
    assert "RuntimeError" in body["detail"]

    assert runtime_engine.running == memory_before


# ---------------------------------------------------------------------------
# 7. 非法请求体
# ---------------------------------------------------------------------------


def test_put_auto_resume_missing_enabled_returns_422(client):
    response = client.put("/api/v1/runtime/auto-resume", json={})

    assert response.status_code == 422


def test_put_auto_resume_invalid_type_returns_422(client):
    response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": "not-a-bool"}
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 8-9. GET 完整字段 与 三个 endpoint 响应 schema 一致
# ---------------------------------------------------------------------------


def test_get_status_returns_full_persisted_fields(client):
    response = client.get("/api/v1/runtime/status")

    assert response.status_code == 200
    assert set(response.json().keys()) == RUNTIME_STATUS_RESPONSE_KEYS


def test_start_stop_auto_resume_response_schema_consistent(client):
    get_response = client.get("/api/v1/runtime/status")
    start_response = client.post("/api/v1/runtime/start")
    stop_response = client.post("/api/v1/runtime/stop")
    put_response = client.put(
        "/api/v1/runtime/auto-resume", json={"enabled": False}
    )

    for response in (get_response, start_response, stop_response, put_response):
        assert response.status_code == 200
        assert set(response.json().keys()) == RUNTIME_STATUS_RESPONSE_KEYS
