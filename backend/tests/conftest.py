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
import os
from pathlib import Path
import tempfile

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

# Establish the test database authority before importing any application module
# that creates the global SQLAlchemy engine/SessionLocal.
os.environ["AI_COMMERCE_TESTING"] = "1"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://n8n:password123@localhost:5432/ai_commerce_os_test",
)

# Founder execution runtime state must never share the developer's live registry.
os.environ.setdefault(
    "FOUNDER_EXECUTION_REGISTRY_PATH",
    str(Path(tempfile.mkdtemp(prefix="sino-execution-tests-")) / "registry.json"),
)

from app.agents.agent_registry import AgentRegistry
from app.database.db import DATABASE_RUNTIME_CONFIG, SessionLocal, engine
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

    except SQLAlchemyError:
        # Pure unit tests must remain runnable when the developer PostgreSQL
        # instance is unavailable (for example inside a network sandbox).
        return _DATABASE_UNAVAILABLE

    finally:
        db.close()


def _restore_runtime_state_row(snapshot):
    if snapshot is _DATABASE_UNAVAILABLE:
        return

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


_DATABASE_UNAVAILABLE = object()


def _reset_test_database() -> None:
    if not DATABASE_RUNTIME_CONFIG.testing or DATABASE_RUNTIME_CONFIG.database_name != "ai_commerce_os_test":
        raise RuntimeError("pytest_database_authority_is_not_isolated")
    with engine.begin() as connection:
        tables = list(connection.execute(text(
            "SELECT tablename FROM pg_tables "
            "WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        )).scalars())
        if tables:
            quoted = ", ".join(f'"{name.replace(chr(34), chr(34) * 2)}"' for name in tables)
            connection.execute(text(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE"))
        connection.execute(text(
            "INSERT INTO application_systems "
            "(id, system_key, name, system_type, status, config) "
            "VALUES "
            "('app-founder-ai', 'founder_ai', 'Founder AI', 'application_system', 'active', '{}')"
        ))


@pytest.fixture(scope="session", autouse=True)
def _isolated_test_database_authority():
    print(f"\nTEST DATABASE: {DATABASE_RUNTIME_CONFIG.safe_identity}")
    _reset_test_database()
    yield
    _reset_test_database()


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
