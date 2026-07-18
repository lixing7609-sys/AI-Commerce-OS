"""
数据库启动前就绪检查测试。

覆盖 DatabaseReadinessService 各方法的正常/异常路径，
以及 FastAPI lifespan 对就绪检查失败/通过的实际反应。

除"正常数据库"用例直接对接真实开发数据库（只读）之外，
其余异常路径均通过 monkeypatch 模拟，不修改真实数据库结构。
"""

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.database.base import Base
from app.main import app
from app.runtime.engine.runtime_engine import runtime_engine
from app.services.database_readiness_service import (
    DatabaseReadinessError,
    DatabaseReadinessService,
)


class _FakeInspector:
    def __init__(self, table_names):
        self._table_names = table_names

    def get_table_names(self):
        return self._table_names


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _FakeConnection:
    def __init__(self, rows):
        self._rows = rows

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def execute(self, _statement):
        return _FakeResult(self._rows)


def test_check_ready_success_against_real_database():
    result = DatabaseReadinessService.check_ready()

    assert result.ready is True
    assert result.current_revision == result.expected_revision
    assert result.missing_tables == []


def test_check_connection_failure_raises(monkeypatch):
    def fake_connect():
        raise ConnectionError("模拟连接失败")

    monkeypatch.setattr(
        "app.services.database_readiness_service.engine.connect",
        fake_connect,
    )

    with pytest.raises(DatabaseReadinessError):
        DatabaseReadinessService.check_connection()


def test_get_current_revision_missing_alembic_version_table(monkeypatch):
    monkeypatch.setattr(
        "app.services.database_readiness_service.inspect",
        lambda _engine: _FakeInspector(["tasks", "system_runtime_state"]),
    )

    with pytest.raises(DatabaseReadinessError, match="alembic_version"):
        DatabaseReadinessService.get_current_revision()


def test_get_current_revision_no_rows(monkeypatch):
    monkeypatch.setattr(
        "app.services.database_readiness_service.inspect",
        lambda _engine: _FakeInspector(["alembic_version"]),
    )
    monkeypatch.setattr(
        "app.services.database_readiness_service.engine.connect",
        lambda: _FakeConnection([]),
    )

    with pytest.raises(DatabaseReadinessError, match="revision"):
        DatabaseReadinessService.get_current_revision()


def test_check_ready_revision_mismatch_reports_both_values(monkeypatch):
    monkeypatch.setattr(
        DatabaseReadinessService,
        "check_connection",
        staticmethod(lambda: None),
    )
    monkeypatch.setattr(
        DatabaseReadinessService,
        "get_current_revision",
        staticmethod(lambda: "old_fake_revision"),
    )
    monkeypatch.setattr(
        DatabaseReadinessService,
        "check_required_tables",
        staticmethod(lambda: []),
    )

    expected = DatabaseReadinessService.get_expected_head_revision()

    with pytest.raises(DatabaseReadinessError) as exc_info:
        DatabaseReadinessService.check_ready()

    message = str(exc_info.value)
    assert "old_fake_revision" in message
    assert expected in message


def test_get_expected_head_revision_multi_head_raises(monkeypatch):
    class _FakeScript:
        def get_heads(self):
            return ["revision_a", "revision_b"]

    monkeypatch.setattr(
        "app.services.database_readiness_service.ScriptDirectory.from_config",
        lambda _config: _FakeScript(),
    )

    with pytest.raises(DatabaseReadinessError, match="head"):
        DatabaseReadinessService.get_expected_head_revision()


def test_check_required_tables_reports_missing_system_runtime_state(monkeypatch):
    monkeypatch.setattr(
        "app.services.database_readiness_service.inspect",
        lambda _engine: _FakeInspector(["tasks", "products"]),
    )

    missing = DatabaseReadinessService.check_required_tables()

    assert "system_runtime_state" in missing


def test_check_required_tables_reports_missing_tasks(monkeypatch):
    monkeypatch.setattr(
        "app.services.database_readiness_service.inspect",
        lambda _engine: _FakeInspector(["system_runtime_state", "products"]),
    )

    missing = DatabaseReadinessService.check_required_tables()

    assert "tasks" in missing


def test_check_ready_missing_required_table_fails(monkeypatch):
    monkeypatch.setattr(
        DatabaseReadinessService,
        "check_connection",
        staticmethod(lambda: None),
    )
    monkeypatch.setattr(
        DatabaseReadinessService,
        "get_current_revision",
        staticmethod(DatabaseReadinessService.get_expected_head_revision),
    )
    monkeypatch.setattr(
        DatabaseReadinessService,
        "check_required_tables",
        staticmethod(lambda: ["tasks"]),
    )

    with pytest.raises(DatabaseReadinessError, match="tasks"):
        DatabaseReadinessService.check_ready()


def test_lifespan_startup_failure_blocks_app(monkeypatch):
    def fake_check_ready():
        raise DatabaseReadinessError("模拟数据库未就绪")

    monkeypatch.setattr(
        main_module.DatabaseReadinessService,
        "check_ready",
        staticmethod(fake_check_ready),
    )

    with pytest.raises(DatabaseReadinessError):
        with TestClient(app):
            pass


def test_lifespan_startup_success_health_ok():
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200


def test_startup_does_not_call_create_all_upgrade_or_runtime_start(monkeypatch):
    calls = {"create_all": False, "upgrade": False, "runtime_start": False}

    monkeypatch.setattr(
        Base.metadata,
        "create_all",
        lambda *args, **kwargs: calls.__setitem__("create_all", True),
    )
    monkeypatch.setattr(
        "alembic.command.upgrade",
        lambda *args, **kwargs: calls.__setitem__("upgrade", True),
    )

    original_start = runtime_engine.start

    def fake_start(*args, **kwargs):
        calls["runtime_start"] = True
        return original_start(*args, **kwargs)

    monkeypatch.setattr(runtime_engine, "start", fake_start)

    with TestClient(app):
        pass

    assert calls["create_all"] is False
    assert calls["upgrade"] is False
    assert calls["runtime_start"] is False
