"""
后台心跳与优雅 shutdown 记录测试。

覆盖 backend/app/main.py 的 _heartbeat_loop 和 lifespan：
心跳循环本身的行为、心跳异常后的持续、lifespan 与心跳/
readiness 检查的交互、以及 RuntimeStateService.record_graceful_shutdown()
的语义（保留 desired_state、清空 last_error 等）。

不真实等待 15 秒：直接调用 _heartbeat_loop 并传入极小的
interval_seconds，或用 asyncio.sleep(0)/极短 sleep 让事件循环
推进；不真正 kill 进程，全部通过 TestClient 的 lifespan 生命周期
和 monkeypatch 模拟。

会话级 conftest.py 已经在 session 范围内保护 system_runtime_state，
本文件仍在每个测试前后做函数级快照/恢复，双重保险。
"""

import asyncio
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.database_readiness_service import DatabaseReadinessError
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


async def _run_briefly_then_cancel(coro_task, run_seconds):
    await asyncio.sleep(run_seconds)
    coro_task.cancel()

    try:
        await coro_task
    except asyncio.CancelledError:
        pass


# ---------------------------------------------------------------------------
# 1-3. _heartbeat_loop 本身的行为（直接调用，不经过 lifespan/TestClient）
# ---------------------------------------------------------------------------


def test_heartbeat_loop_calls_record_heartbeat(monkeypatch):
    call_count = {"value": 0}

    def fake_record_heartbeat():
        call_count["value"] += 1

    monkeypatch.setattr(
        RuntimeStateService,
        "record_heartbeat",
        staticmethod(fake_record_heartbeat),
    )

    async def run():
        task = asyncio.create_task(main_module._heartbeat_loop(0.01))
        await _run_briefly_then_cancel(task, 0.05)

    asyncio.run(run())

    assert call_count["value"] >= 2


def test_heartbeat_interval_can_be_shortened_via_monkeypatch(monkeypatch):
    """
    心跳周期可以通过传入极小的 interval_seconds 大幅缩短，
    不需要真实等待默认的 15 秒。
    """

    call_count = {"value": 0}

    def fake_record_heartbeat():
        call_count["value"] += 1

    monkeypatch.setattr(
        RuntimeStateService,
        "record_heartbeat",
        staticmethod(fake_record_heartbeat),
    )

    async def run():
        task = asyncio.create_task(main_module._heartbeat_loop(0.005))
        await _run_briefly_then_cancel(task, 0.03)

    asyncio.run(run())

    # 0.03 秒内、0.005 秒一次的心跳，应该已经触发多次。
    assert call_count["value"] >= 3


def test_heartbeat_loop_continues_after_exception(monkeypatch):
    call_count = {"value": 0}

    def flaky_record_heartbeat():
        call_count["value"] += 1

        if call_count["value"] == 1:
            raise RuntimeError("模拟心跳写入失败")

    monkeypatch.setattr(
        RuntimeStateService,
        "record_heartbeat",
        staticmethod(flaky_record_heartbeat),
    )

    async def run():
        task = asyncio.create_task(main_module._heartbeat_loop(0.01))
        await _run_briefly_then_cancel(task, 0.05)

    asyncio.run(run())

    # 第一次调用抛出异常后，循环仍应继续尝试后续周期。
    assert call_count["value"] >= 2


# ---------------------------------------------------------------------------
# 4-6. lifespan 与心跳任务的交互
# ---------------------------------------------------------------------------


def test_lifespan_starts_heartbeat_after_readiness_success(monkeypatch):
    started = {"value": False}

    async def fake_heartbeat_loop(interval_seconds):
        started["value"] = True

        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            raise

    monkeypatch.setattr(main_module, "_heartbeat_loop", fake_heartbeat_loop)

    with TestClient(app):
        pass

    assert started["value"] is True


def test_lifespan_readiness_failure_does_not_start_heartbeat(monkeypatch):
    def fake_check_ready():
        raise DatabaseReadinessError("模拟数据库未就绪")

    monkeypatch.setattr(
        main_module.DatabaseReadinessService,
        "check_ready",
        staticmethod(fake_check_ready),
    )

    started = {"value": False}

    async def fake_heartbeat_loop(interval_seconds):
        started["value"] = True

    monkeypatch.setattr(main_module, "_heartbeat_loop", fake_heartbeat_loop)

    with pytest.raises(DatabaseReadinessError):
        with TestClient(app):
            pass

    assert started["value"] is False


def test_heartbeat_task_cancelled_after_client_exit(monkeypatch):
    captured = {"task": None}
    original_create_task = asyncio.create_task

    def spy_create_task(coro, *args, **kwargs):
        task = original_create_task(coro, *args, **kwargs)
        captured["task"] = task
        return task

    monkeypatch.setattr(main_module.asyncio, "create_task", spy_create_task)

    with TestClient(app):
        pass

    assert captured["task"] is not None
    assert captured["task"].cancelled() or captured["task"].done()


# ---------------------------------------------------------------------------
# 7-9. graceful shutdown 语义
# ---------------------------------------------------------------------------


def test_graceful_shutdown_preserves_desired_state_running():
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state="running", actual_state="running"
    )

    RuntimeStateService.record_graceful_shutdown()

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "stopped"
    assert state.last_shutdown_type == "graceful"
    assert state.last_stopped_at is not None
    assert state.last_error is None


def test_graceful_shutdown_preserves_desired_state_stopped():
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state="stopped", actual_state="stopped"
    )

    RuntimeStateService.record_graceful_shutdown()

    state = RuntimeStateService.get_state()
    assert state.desired_state == "stopped"
    assert state.actual_state == "stopped"
    assert state.last_shutdown_type == "graceful"


def test_shutdown_record_failure_does_not_mask_app_shutdown(monkeypatch):
    def fake_record_graceful_shutdown():
        raise RuntimeError("模拟 shutdown 记录失败")

    monkeypatch.setattr(
        main_module.RuntimeStateService,
        "record_graceful_shutdown",
        staticmethod(fake_record_graceful_shutdown),
    )

    # 不应该抛出异常导致应用退出流程被打断；
    # 只要这个 with 块能正常进入退出，就说明关闭流程未被掩盖。
    with TestClient(app):
        pass


# ---------------------------------------------------------------------------
# 10-11. GET status 与 RuntimeEngine 不受影响
# ---------------------------------------------------------------------------


def test_get_status_does_not_trigger_extra_heartbeat(monkeypatch):
    call_count = {"value": 0}
    original_record_heartbeat = RuntimeStateService.record_heartbeat

    def spy_record_heartbeat():
        call_count["value"] += 1
        return original_record_heartbeat()

    monkeypatch.setattr(
        RuntimeStateService,
        "record_heartbeat",
        staticmethod(spy_record_heartbeat),
    )

    with TestClient(app) as client:
        response = client.get("/api/v1/runtime/status")

    assert response.status_code == 200
    assert call_count["value"] == 0


def test_lifespan_does_not_call_runtime_engine_start_or_stop(monkeypatch):
    calls = {"start": False, "stop": False}

    monkeypatch.setattr(
        runtime_engine,
        "start",
        lambda *args, **kwargs: calls.__setitem__("start", True),
    )
    monkeypatch.setattr(
        runtime_engine,
        "stop",
        lambda *args, **kwargs: calls.__setitem__("stop", True),
    )

    with TestClient(app):
        pass

    assert calls["start"] is False
    assert calls["stop"] is False
