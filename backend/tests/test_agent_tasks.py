"""
Agent 任务系统集成测试。

覆盖：

- RuntimeEngine 未启动时，Agent run 返回 409
- RuntimeEngine 启动后，Agent 可以成功执行任务
- 任务写入 PostgreSQL
- Tasks API 能查询
- 任务通过独立数据库连接可读（验证持久化，等价于后端重启后任务仍存在）
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.database.db import DATABASE_URL
from app.main import app
from app.runtime.engine.runtime_engine import runtime_engine

AGENT_NAME = "AI CEO"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _stopped_runtime(client):
    """
    确保每个测试用例开始前 RuntimeEngine 处于停止状态。
    """

    client.post("/api/v1/runtime/stop")
    yield


def test_agent_run_without_runtime_returns_409(client):
    response = client.post(
        f"/api/v1/agents/{AGENT_NAME}/run",
        json={"task": "生成经营建议"},
    )

    assert response.status_code == 409


def test_agent_run_persists_task_and_is_queryable(client):
    start_response = client.post("/api/v1/runtime/start")
    assert start_response.status_code == 200
    assert start_response.json()["running"] is True

    run_response = client.post(
        f"/api/v1/agents/{AGENT_NAME}/run",
        json={"task": "生成今日经营分析", "priority": "high"},
    )
    assert run_response.status_code == 200

    body = run_response.json()
    assert body["success"] is True

    task = body["task"]
    assert task["status"] == "completed"
    assert task["assigned_agent"] == AGENT_NAME

    task_id = task["id"]

    # Tasks API 能查询到刚执行的任务
    detail_response = client.get(f"/api/v1/tasks/{task_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "completed"

    list_response = client.get("/api/v1/tasks")
    assert list_response.status_code == 200
    task_ids = [item["id"] for item in list_response.json()["items"]]
    assert task_id in task_ids

    # 通过一条独立于应用进程的数据库连接直接读取任务，
    # 验证任务已经真正提交到 PostgreSQL（而非仅存在于内存中），
    # 这等价于后端进程重启后任务记录依然存在。
    independent_engine = create_engine(DATABASE_URL)

    with independent_engine.connect() as connection:
        row = connection.execute(
            text("SELECT status FROM tasks WHERE id = :id"),
            {"id": task_id},
        ).fetchone()

    independent_engine.dispose()

    assert row is not None
    assert row[0] == "completed"
