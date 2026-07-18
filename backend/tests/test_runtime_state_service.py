"""
system_runtime_state 持久化服务测试。

测试不依赖测试开始前数据库中是否已存在 id=1 状态行：
autouse fixture 会在每个测试前记录当前完整状态（或"不存在"），
测试结束后原样恢复，不污染开发数据库中的 Runtime 用户意图。
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.database.db import SessionLocal
from app.models.runtime_state_db import RuntimeStateDB
from app.services.runtime_state_service import RuntimeStateService


def _snapshot():
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


def _restore(snapshot):
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
def _preserve_runtime_state():
    snapshot = _snapshot()
    yield
    _restore(snapshot)


def test_get_or_create_state_returns_unique_row():
    state = RuntimeStateService.get_or_create_state()

    assert state.id == 1


def test_default_fields_are_legal():
    db = SessionLocal()

    try:
        row = (
            db.query(RuntimeStateDB)
            .filter(RuntimeStateDB.id == 1)
            .first()
        )

        if row is not None:
            db.delete(row)
            db.commit()

    finally:
        db.close()

    state = RuntimeStateService.get_or_create_state()

    assert state.desired_state == "stopped"
    assert state.actual_state == "stopped"
    assert state.auto_resume_enabled is False
    assert state.last_shutdown_type == "unknown"
    assert state.recovery_failure_count == 0


def test_repeated_call_does_not_create_second_row():
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.get_or_create_state()
    RuntimeStateService.get_or_create_state()

    db = SessionLocal()

    try:
        count = db.query(RuntimeStateDB).count()
    finally:
        db.close()

    assert count == 1


def test_set_desired_state_running_persists():
    RuntimeStateService.set_desired_state("running")

    state = RuntimeStateService.get_state()

    assert state.desired_state == "running"


def test_set_desired_state_invalid_raises():
    with pytest.raises(ValueError):
        RuntimeStateService.set_desired_state("invalid")


def test_set_actual_state_error_saves_error():
    RuntimeStateService.set_actual_state("error", error="模拟恢复失败")

    state = RuntimeStateService.get_state()

    assert state.actual_state == "error"
    assert state.last_error == "模拟恢复失败"


def test_set_actual_state_invalid_raises():
    with pytest.raises(ValueError):
        RuntimeStateService.set_actual_state("invalid")


def test_set_auto_resume_persists():
    RuntimeStateService.set_auto_resume(True)
    assert RuntimeStateService.get_state().auto_resume_enabled is True

    RuntimeStateService.set_auto_resume(False)
    assert RuntimeStateService.get_state().auto_resume_enabled is False


def test_record_heartbeat_writes_timezone_aware_time():
    before = datetime.now(timezone.utc)

    RuntimeStateService.record_heartbeat()

    state = RuntimeStateService.get_state()

    assert state.last_heartbeat_at is not None
    assert state.last_heartbeat_at.tzinfo is not None
    assert state.last_heartbeat_at >= before - timedelta(seconds=5)


def test_record_graceful_shutdown_does_not_change_desired_state():
    RuntimeStateService.set_desired_state("running")

    RuntimeStateService.record_graceful_shutdown()

    state = RuntimeStateService.get_state()

    assert state.desired_state == "running"
    assert state.last_shutdown_type == "graceful"
    assert state.actual_state == "stopped"


def test_increment_recovery_failure_accumulates():
    RuntimeStateService.reset_recovery_failure()

    RuntimeStateService.increment_recovery_failure("第一次失败")
    state = RuntimeStateService.get_state()
    assert state.recovery_failure_count == 1
    assert state.last_error == "第一次失败"

    RuntimeStateService.increment_recovery_failure("第二次失败")
    state = RuntimeStateService.get_state()
    assert state.recovery_failure_count == 2
    assert state.last_error == "第二次失败"


def test_reset_recovery_failure_clears_count_and_error():
    RuntimeStateService.increment_recovery_failure("某次失败")

    RuntimeStateService.reset_recovery_failure()

    state = RuntimeStateService.get_state()

    assert state.recovery_failure_count == 0
    assert state.last_error is None


def test_updated_at_not_earlier_after_update():
    state_before = RuntimeStateService.get_or_create_state()
    original_updated_at = state_before.updated_at

    RuntimeStateService.set_desired_state("running")

    state_after = RuntimeStateService.get_state()

    assert state_after.updated_at >= original_updated_at


def test_table_always_has_single_row():
    RuntimeStateService.set_desired_state("running")
    RuntimeStateService.set_actual_state("running")
    RuntimeStateService.record_heartbeat()

    db = SessionLocal()

    try:
        count = db.query(RuntimeStateDB).count()
    finally:
        db.close()

    assert count == 1


def test_check_constraint_rejects_invalid_desired_state():
    RuntimeStateService.get_or_create_state()

    db = SessionLocal()
    raised = False

    try:
        db.execute(
            text(
                "UPDATE system_runtime_state "
                "SET desired_state = 'invalid_value' WHERE id = 1"
            )
        )
        db.commit()
    except Exception:
        raised = True
        db.rollback()
    finally:
        db.close()

    assert raised
