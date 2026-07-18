"""
Runtime 手动启停与 system_runtime_state 接线测试。

覆盖 GET/POST /api/v1/runtime/* 与持久化状态的完整交互：
正常启停、重复调用幂等、内存与数据库不一致时的重新对齐、
RuntimeEngine 异常、数据库写入失败等路径。

autouse fixture 会在每个测试前后快照/恢复 system_runtime_state
和 RuntimeEngine 内存状态（含 Agent 状态），不污染开发环境，
不依赖固定 task 数量，不修改任务数据。
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.runtime_state_service import RuntimeStateService


def _snapshot_db_state():
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


def _restore_db_state(snapshot):
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
    db_snapshot = _snapshot_db_state()
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

    _restore_db_state(db_snapshot)


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


def test_get_status_returns_persisted_fields(client):
    response = client.get("/api/v1/runtime/status")

    assert response.status_code == 200

    body = response.json()

    for field in (
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
    ):
        assert field in body


def test_manual_start_persists_and_starts_agents(client):
    response = client.post("/api/v1/runtime/start")

    assert response.status_code == 200

    body = response.json()
    assert body["running"] is True
    assert body["agents"]["running"] == 5

    assert runtime_engine.running is True

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "running"
    assert state.last_started_at is not None


def test_manual_stop_persists_and_stops_agents(client):
    client.post("/api/v1/runtime/start")

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 200

    body = response.json()
    assert body["running"] is False

    assert runtime_engine.running is False

    state = RuntimeStateService.get_state()
    assert state.desired_state == "stopped"
    assert state.actual_state == "stopped"
    assert state.last_stopped_at is not None
    assert state.last_shutdown_type == "graceful"


def test_repeated_start_does_not_overwrite_last_started_at(client):
    first = client.post("/api/v1/runtime/start")
    assert first.status_code == 200
    first_last_started_at = first.json()["last_started_at"]
    assert first_last_started_at is not None

    second = client.post("/api/v1/runtime/start")
    assert second.status_code == 200
    second_last_started_at = second.json()["last_started_at"]

    assert second_last_started_at == first_last_started_at


def test_repeated_stop_does_not_overwrite_last_stopped_at(client):
    client.post("/api/v1/runtime/start")

    first = client.post("/api/v1/runtime/stop")
    assert first.status_code == 200
    first_last_stopped_at = first.json()["last_stopped_at"]
    assert first_last_stopped_at is not None

    second = client.post("/api/v1/runtime/stop")
    assert second.status_code == 200
    second_last_stopped_at = second.json()["last_stopped_at"]

    assert second_last_stopped_at == first_last_stopped_at


def test_start_realigns_memory_and_db_when_desynced(client):
    # 人为制造不一致：内存为 stopped，但数据库声称 running。
    runtime_engine.running = False
    runtime_engine.started_at = None
    runtime_engine.stopped_at = None
    AgentRegistry.stop_all()

    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state="running", actual_state="running"
    )

    response = client.post("/api/v1/runtime/start")

    assert response.status_code == 200
    assert runtime_engine.running is True

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "running"


def test_stop_realigns_memory_and_db_when_desynced(client):
    # 人为制造不一致：内存为 running，但数据库声称 stopped。
    runtime_engine.running = True
    runtime_engine.started_at = datetime.now(timezone.utc)
    runtime_engine.stopped_at = None
    AgentRegistry.start_all()

    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state="stopped", actual_state="stopped"
    )

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 200
    assert runtime_engine.running is False

    state = RuntimeStateService.get_state()
    assert state.desired_state == "stopped"
    assert state.actual_state == "stopped"


def test_runtime_engine_start_exception_reports_error(client, monkeypatch):
    def fake_start(*args, **kwargs):
        raise RuntimeError("模拟 RuntimeEngine 启动异常")

    monkeypatch.setattr(runtime_engine, "start", fake_start)

    response = client.post("/api/v1/runtime/start")

    assert response.status_code == 500

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "error"
    assert state.last_error


def test_runtime_engine_stop_exception_reports_error(client, monkeypatch):
    client.post("/api/v1/runtime/start")

    def fake_stop(*args, **kwargs):
        raise RuntimeError("模拟 RuntimeEngine 停止异常")

    monkeypatch.setattr(runtime_engine, "stop", fake_stop)

    response = client.post("/api/v1/runtime/stop")

    assert response.status_code == 500

    state = RuntimeStateService.get_state()
    assert state.desired_state == "stopped"
    assert state.actual_state == "error"


def test_first_db_write_failure_prevents_runtime_engine_start(
    client, monkeypatch
):
    def fake_update_state(*args, **kwargs):
        raise RuntimeError("模拟数据库写入失败")

    monkeypatch.setattr(
        RuntimeStateService, "update_state", staticmethod(fake_update_state)
    )

    start_called = {"value": False}
    original_start = runtime_engine.start

    def spy_start(*args, **kwargs):
        start_called["value"] = True
        return original_start(*args, **kwargs)

    monkeypatch.setattr(runtime_engine, "start", spy_start)

    response = client.post("/api/v1/runtime/start")

    assert response.status_code == 500
    assert start_called["value"] is False


def test_final_db_write_failure_after_successful_start(client, monkeypatch):
    call_count = {"value": 0}
    original_update_state = RuntimeStateService.update_state

    def flaky_update_state(*args, **kwargs):
        call_count["value"] += 1

        if call_count["value"] == 1:
            return original_update_state(*args, **kwargs)

        raise RuntimeError("模拟最终状态写入失败")

    monkeypatch.setattr(
        RuntimeStateService, "update_state", staticmethod(flaky_update_state)
    )

    response = client.post("/api/v1/runtime/start")

    assert response.status_code == 500

    # 如实断言：RuntimeEngine.start() 已经成功执行，
    # 内存状态可能已经改变，即使最终持久化失败。
    assert runtime_engine.running is True


def test_get_status_does_not_call_runtime_engine_start(client, monkeypatch):
    start_called = {"value": False}

    def fake_start(*args, **kwargs):
        start_called["value"] = True

    monkeypatch.setattr(runtime_engine, "start", fake_start)

    response = client.get("/api/v1/runtime/status")

    assert response.status_code == 200
    assert start_called["value"] is False


def test_agent_run_still_returns_409_when_runtime_stopped(client):
    client.post("/api/v1/runtime/stop")

    response = client.post(
        "/api/v1/agents/AI CEO/run",
        json={"task": "回归验证"},
    )

    assert response.status_code == 409
