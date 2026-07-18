"""
pytest session 级别的全局状态保护。

FastAPI lifespan 现在会在每次 TestClient(app) 退出时调用
RuntimeStateService.record_graceful_shutdown()，向
system_runtime_state 写入真实的 last_stopped_at /
last_heartbeat_at 等字段。这个副作用发生在任何使用 TestClient
的测试文件里，不只是专门为此做了快照/恢复的文件。这里在整个
pytest session 级别做一次外层快照/恢复，作为最终的安全网，
防止反复运行测试把开发数据库的 Runtime 持久化状态永久改变。
"""

from datetime import datetime, timezone

import pytest

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.models.runtime_state_db import RuntimeStateDB
from app.runtime.engine.runtime_engine import runtime_engine


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


@pytest.fixture(scope="session", autouse=True)
def _protect_runtime_state_across_session():
    """
    在整个测试 session 开始前快照 system_runtime_state 和
    RuntimeEngine 内存状态，session 结束后恢复。
    """

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
