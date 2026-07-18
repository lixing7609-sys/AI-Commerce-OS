"""
Startup 自动恢复决策测试。

覆盖 backend/app/services/runtime_recovery_service.py 的
RuntimeRecoveryService 和 backend/app/main.py lifespan 与它的接线。

不真实重启整台机器，不真实等待心跳周期；pending/running 任务场景
通过 monkeypatch RuntimeRecoveryService.get_unfinished_task_counts
模拟查询结果，不污染真实 tasks 表。

会话级 conftest.py 已经在 session 范围内保护 system_runtime_state，
本文件仍在每个测试前后做函数级快照/恢复，并额外恢复
RuntimeEngine/AgentRegistry 内存状态，双重保险。
"""

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


def _set_state(
    desired_state="stopped",
    auto_resume_enabled=False,
    recovery_failure_count=0,
    actual_state="stopped",
):
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.update_state(
        desired_state=desired_state,
        actual_state=actual_state,
        auto_resume_enabled=auto_resume_enabled,
        recovery_failure_count=recovery_failure_count,
        clear_last_error=True,
    )


def _no_unfinished_tasks(monkeypatch):
    monkeypatch.setattr(
        RuntimeRecoveryService,
        "get_unfinished_task_counts",
        staticmethod(lambda: {"pending": 0, "running": 0}),
    )


# ---------------------------------------------------------------------------
# 1-2. 无需恢复场景
# ---------------------------------------------------------------------------


def test_no_recovery_when_desired_state_stopped(monkeypatch):
    _set_state(desired_state="stopped", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    start_spy = {"called": False}
    monkeypatch.setattr(
        runtime_engine, "start", lambda: start_spy.__setitem__("called", True)
    )

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["attempted"] is False
    assert result["recovered"] is False
    assert start_spy["called"] is False

    state = RuntimeStateService.get_state()
    assert state.actual_state == "stopped"
    assert state.recovery_failure_count == 0


def test_no_recovery_when_auto_resume_disabled(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=False)
    _no_unfinished_tasks(monkeypatch)

    start_spy = {"called": False}
    monkeypatch.setattr(
        runtime_engine, "start", lambda: start_spy.__setitem__("called", True)
    )

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["attempted"] is False
    assert start_spy["called"] is False

    state = RuntimeStateService.get_state()
    assert state.actual_state == "stopped"
    assert state.recovery_failure_count == 0


# ---------------------------------------------------------------------------
# 3-4. 恢复成功
# ---------------------------------------------------------------------------


def test_recovery_succeeds_when_conditions_met(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result == {
        "attempted": True,
        "recovered": True,
        "reason": "success",
    }
    assert runtime_engine.running is True


def test_recovery_success_sets_expected_state_and_agents(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    RuntimeRecoveryService.attempt_startup_recovery()

    state = RuntimeStateService.get_state()
    assert state.actual_state == "running"
    assert state.desired_state == "running"
    assert state.recovery_failure_count == 0
    assert state.last_error is None
    assert state.last_started_at is not None

    agents = AgentRegistry.list_status()
    assert len(agents) == 5
    assert all(agent["status"] == "running" for agent in agents)


# ---------------------------------------------------------------------------
# 5-7. 未完成任务拒绝恢复
# ---------------------------------------------------------------------------


def test_recovery_rejected_when_pending_tasks_exist(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    monkeypatch.setattr(
        RuntimeRecoveryService,
        "get_unfinished_task_counts",
        staticmethod(lambda: {"pending": 2, "running": 0}),
    )

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["attempted"] is True
    assert result["recovered"] is False
    assert result["reason"] == "unfinished_tasks"
    assert runtime_engine.running is False

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "error"
    assert "未完成任务" in state.last_error
    assert state.recovery_failure_count == 1


def test_recovery_rejected_when_running_tasks_exist(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    monkeypatch.setattr(
        RuntimeRecoveryService,
        "get_unfinished_task_counts",
        staticmethod(lambda: {"pending": 0, "running": 3}),
    )

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["reason"] == "unfinished_tasks"
    assert runtime_engine.running is False

    state = RuntimeStateService.get_state()
    assert state.actual_state == "error"
    assert state.recovery_failure_count == 1


def test_recovery_rejection_does_not_modify_tasks(monkeypatch):
    from app.services.task_service import TaskService

    _set_state(desired_state="running", auto_resume_enabled=True)
    monkeypatch.setattr(
        RuntimeRecoveryService,
        "get_unfinished_task_counts",
        staticmethod(lambda: {"pending": 1, "running": 0}),
    )

    update_task_spy = {"called": False}
    original_update_task = TaskService.update_task

    def spy_update_task(task):
        update_task_spy["called"] = True
        return original_update_task(task)

    monkeypatch.setattr(TaskService, "update_task", staticmethod(spy_update_task))

    RuntimeRecoveryService.attempt_startup_recovery()

    assert update_task_spy["called"] is False


# ---------------------------------------------------------------------------
# 8-9. RuntimeEngine.start() 异常
# ---------------------------------------------------------------------------


def test_recovery_engine_start_exception_sets_actual_state_error(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    def failing_start():
        raise RuntimeError("模拟 RuntimeEngine 启动失败")

    monkeypatch.setattr(runtime_engine, "start", failing_start)

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["reason"] == "engine_start_failed"

    state = RuntimeStateService.get_state()
    assert state.desired_state == "running"
    assert state.actual_state == "error"
    assert "启动失败" in state.last_error
    assert "模拟" not in state.last_error


def test_recovery_engine_start_exception_increments_failure_count(monkeypatch):
    _set_state(
        desired_state="running", auto_resume_enabled=True, recovery_failure_count=1
    )
    _no_unfinished_tasks(monkeypatch)

    monkeypatch.setattr(
        runtime_engine,
        "start",
        lambda: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    RuntimeRecoveryService.attempt_startup_recovery()

    state = RuntimeStateService.get_state()
    assert state.recovery_failure_count == 2


# ---------------------------------------------------------------------------
# 10. 前置状态写库失败
# ---------------------------------------------------------------------------


def test_recovery_pre_write_failure_does_not_call_engine_start(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    original_update_state = RuntimeStateService.update_state

    def flaky_update_state(*args, **kwargs):
        if kwargs.get("actual_state") == "starting":
            raise RuntimeError("模拟前置状态写库失败")
        return original_update_state(*args, **kwargs)

    monkeypatch.setattr(
        RuntimeStateService, "update_state", staticmethod(flaky_update_state)
    )

    start_spy = {"called": False}
    monkeypatch.setattr(
        runtime_engine, "start", lambda: start_spy.__setitem__("called", True)
    )

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["reason"] == "pre_write_failed"
    assert start_spy["called"] is False
    assert runtime_engine.running is False


# ---------------------------------------------------------------------------
# 11. 达到失败上限
# ---------------------------------------------------------------------------


def test_recovery_skipped_when_failure_count_at_limit(monkeypatch):
    _set_state(
        desired_state="running", auto_resume_enabled=True, recovery_failure_count=3
    )
    _no_unfinished_tasks(monkeypatch)

    start_spy = {"called": False}
    monkeypatch.setattr(
        runtime_engine, "start", lambda: start_spy.__setitem__("called", True)
    )

    result = RuntimeRecoveryService.attempt_startup_recovery()

    assert result["attempted"] is False
    assert start_spy["called"] is False

    state = RuntimeStateService.get_state()
    assert state.actual_state == "error"
    assert "连续失败 3 次" in state.last_error
    assert state.recovery_failure_count == 3
    # 本轮不自动把 auto_resume_enabled 改为 false
    assert state.auto_resume_enabled is True


# ---------------------------------------------------------------------------
# 12. 重复调用不重复 start
# ---------------------------------------------------------------------------


def test_repeated_attempt_does_not_restart_already_running_engine(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    call_count = {"value": 0}
    original_start = runtime_engine.start

    def counting_start():
        call_count["value"] += 1
        return original_start()

    monkeypatch.setattr(runtime_engine, "start", counting_start)

    first_result = RuntimeRecoveryService.attempt_startup_recovery()
    second_result = RuntimeRecoveryService.attempt_startup_recovery()

    assert first_result["recovered"] is True
    assert second_result["attempted"] is False
    assert second_result["reason"] == "already_running"
    assert call_count["value"] == 1


# ---------------------------------------------------------------------------
# 13-14. lifespan 接线
# ---------------------------------------------------------------------------


def test_lifespan_readiness_failure_skips_recovery(monkeypatch):
    def fake_check_ready():
        raise DatabaseReadinessError("模拟数据库未就绪")

    monkeypatch.setattr(
        main_module.DatabaseReadinessService,
        "check_ready",
        staticmethod(fake_check_ready),
    )

    call_count = {"value": 0}
    monkeypatch.setattr(
        main_module.RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(lambda: call_count.__setitem__("value", call_count["value"] + 1)),
    )

    with pytest.raises(DatabaseReadinessError):
        with TestClient(app):
            pass

    assert call_count["value"] == 0


def test_lifespan_readiness_success_calls_recovery_once(monkeypatch):
    call_count = {"value": 0}

    def fake_attempt_startup_recovery():
        call_count["value"] += 1
        return {"attempted": False, "recovered": False, "reason": "test"}

    monkeypatch.setattr(
        main_module.RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(fake_attempt_startup_recovery),
    )

    with TestClient(app):
        pass

    assert call_count["value"] == 1


# ---------------------------------------------------------------------------
# 15-16. 恢复失败不阻塞服务 / 恢复成功后状态可查询
# ---------------------------------------------------------------------------


def test_recovery_failure_does_not_block_health_endpoint(monkeypatch):
    def failing_attempt():
        raise RuntimeError("模拟恢复流程意外抛出")

    monkeypatch.setattr(
        main_module.RuntimeRecoveryService,
        "attempt_startup_recovery",
        staticmethod(failing_attempt),
    )

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200


def test_status_endpoint_reflects_recovered_running_state(monkeypatch):
    _set_state(desired_state="running", auto_resume_enabled=True)
    _no_unfinished_tasks(monkeypatch)

    with TestClient(app) as client:
        response = client.get("/api/v1/runtime/status")

    assert response.status_code == 200

    body = response.json()
    assert body["running"] is True
    assert body["status"] == "running"
    assert body["actual_state"] == "running"
