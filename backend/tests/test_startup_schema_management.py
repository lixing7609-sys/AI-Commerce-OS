"""
应用启动期数据库结构管理职责测试。

覆盖：

- FastAPI lifespan 启动不会调用 Base.metadata.create_all；
- create_database_tables 已被移除，不再是可用的建表入口；
- Alembic 仍是数据库结构管理的唯一入口。
"""

from fastapi.testclient import TestClient

import app.database.db as db_module
from app.database.base import Base
from app.main import app


def test_create_database_tables_function_removed():
    """
    create_database_tables 已被移除（Alembic 是唯一建表入口）。
    """

    assert not hasattr(db_module, "create_database_tables")


def test_lifespan_startup_does_not_call_create_all(monkeypatch):
    """
    应用启动（lifespan）过程中不应触发任何
    Base.metadata.create_all 调用。
    """

    called = {"create_all": False}

    def fake_create_all(*args, **kwargs):
        called["create_all"] = True

    monkeypatch.setattr(Base.metadata, "create_all", fake_create_all)

    with TestClient(app):
        pass

    assert called["create_all"] is False


def test_health_endpoint_available_after_startup():
    """
    移除建表逻辑后，应用仍能正常启动并响应基础请求
    （前提是数据库已由 Alembic 迁移到位，这是本项目
    开发/测试环境的既有前提，不在本测试内重新验证）。
    """

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
