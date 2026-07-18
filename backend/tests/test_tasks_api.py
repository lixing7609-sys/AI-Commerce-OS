"""
Tasks API 筛选、分页与响应结构测试。

覆盖：

- 默认参数下的响应结构（stats/items/pagination）
- status 筛选（含非法值 422）
- assigned_agent 精确筛选（含无匹配结果）
- limit/offset 分页与边界校验
- GET /tasks/{task_id} 与 GET /tasks/stats

测试产生的任务通过 TEST_MARKER 标记 task 名称和 context，
整个模块测试结束后按精确 task_id 删除，不永久遗留在开发数据库。
"""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.database.db import SessionLocal
from app.main import app
from app.models.runtime_state_db import RuntimeStateDB
from app.models.task_db import TaskDB
from app.runtime.engine.runtime_engine import runtime_engine

TEST_MARKER = "TASKS_API_TEST_MARKER"
TEST_AGENT = "产品 Agent"


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


@pytest.fixture(scope="module", autouse=True)
def _preserve_runtime_and_db_state():
    """
    本模块的 marked_task fixture 会调用 POST /runtime/start，
    该接口现在会写入 system_runtime_state。这里在整个模块的
    测试开始前后快照/恢复该行和 RuntimeEngine 内存状态，
    避免污染开发数据库。
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


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def marked_task(client):
    """
    创建一条明确标记为测试数据的任务，
    用于 assigned_agent 筛选和单任务详情查询测试。

    模块内所有依赖此 fixture 的测试结束后（无论断言是否失败），
    按精确 task_id 删除该任务，不按 status/assigned_agent 做任何
    批量删除，不影响其它真实任务。
    """

    client.post("/api/v1/runtime/start")

    response = client.post(
        f"/api/v1/agents/{TEST_AGENT}/run",
        json={
            "task": f"{TEST_MARKER} assigned_agent filter check",
            "priority": "low",
            "context": {"source": TEST_MARKER},
        },
    )
    assert response.status_code == 200

    task = response.json()["task"]

    yield task

    db = SessionLocal()

    try:
        db.query(TaskDB).filter(TaskDB.id == task["id"]).delete()
        db.commit()
    finally:
        db.close()


def test_list_tasks_default_params(client):
    response = client.get("/api/v1/tasks")

    assert response.status_code == 200

    body = response.json()
    assert "stats" in body
    assert "items" in body
    assert "pagination" in body
    assert body["pagination"]["limit"] == 50
    assert body["pagination"]["offset"] == 0
    assert body["pagination"]["returned"] == len(body["items"])


def test_list_tasks_filter_by_status_completed(client, marked_task):
    response = client.get(
        "/api/v1/tasks",
        params={"status": "completed"},
    )

    assert response.status_code == 200

    body = response.json()
    assert all(item["status"] == "completed" for item in body["items"])
    assert "total" in body["stats"]
    assert (
        body["pagination"]["filtered_total"]
        >= body["pagination"]["returned"]
    )


def test_list_tasks_invalid_status_returns_422(client):
    response = client.get(
        "/api/v1/tasks",
        params={"status": "invalid"},
    )

    assert response.status_code == 422


def test_list_tasks_filter_by_assigned_agent(client, marked_task):
    response = client.get(
        "/api/v1/tasks",
        params={"assigned_agent": TEST_AGENT},
    )

    assert response.status_code == 200

    body = response.json()
    assert len(body["items"]) > 0
    assert all(
        item["assigned_agent"] == TEST_AGENT for item in body["items"]
    )
    assert marked_task["id"] in [item["id"] for item in body["items"]]


def test_list_tasks_no_match_assigned_agent(client):
    response = client.get(
        "/api/v1/tasks",
        params={"assigned_agent": "NONEXISTENT_AGENT_TASKS_API_TEST"},
    )

    assert response.status_code == 200

    body = response.json()
    assert body["items"] == []
    assert body["pagination"]["filtered_total"] == 0


def test_list_tasks_pagination_limit_one(client, marked_task):
    response = client.get(
        "/api/v1/tasks",
        params={"limit": 1, "offset": 0},
    )

    assert response.status_code == 200

    body = response.json()
    assert len(body["items"]) <= 1
    assert body["pagination"]["limit"] == 1
    assert body["pagination"]["offset"] == 0
    assert body["pagination"]["returned"] == len(body["items"])


def test_list_tasks_limit_zero_returns_422(client):
    response = client.get("/api/v1/tasks", params={"limit": 0})

    assert response.status_code == 422


def test_list_tasks_limit_over_max_returns_422(client):
    response = client.get("/api/v1/tasks", params={"limit": 101})

    assert response.status_code == 422


def test_list_tasks_negative_offset_returns_422(client):
    response = client.get("/api/v1/tasks", params={"offset": -1})

    assert response.status_code == 422


def test_get_task_detail_existing(client, marked_task):
    response = client.get(f"/api/v1/tasks/{marked_task['id']}")

    assert response.status_code == 200
    assert response.json()["id"] == marked_task["id"]


def test_get_task_detail_not_found(client):
    response = client.get("/api/v1/tasks/TASK-DOES-NOT-EXIST-00000000")

    assert response.status_code == 404


def test_get_task_stats_structure(client):
    response = client.get("/api/v1/tasks/stats")

    assert response.status_code == 200

    body = response.json()

    for key in ["total", "pending", "running", "completed", "failed", "queued"]:
        assert key in body
        assert isinstance(body[key], int)
