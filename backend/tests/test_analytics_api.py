"""
GET /api/v1/analytics/tasks 聚合统计接口测试。

数据库中存在真实历史任务，因此测试不假设"空库"，而是插入带
唯一标记（assigned_agent 使用测试专属名称）的任务，只对这些
标记数据做精确断言；总量类字段只做"不小于已知插入数"的宽松
断言。所有测试任务在用例结束后按 id 精确删除。
"""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.database.db import SessionLocal
from app.main import app
from app.models.task_db import TaskDB

TEST_AGENT = None  # 每个测试内动态生成，避免相互污染


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def cleanup_task_ids():
    task_ids = []
    yield task_ids
    if not task_ids:
        return
    db = SessionLocal()
    try:
        db.query(TaskDB).filter(TaskDB.id.in_(task_ids)).delete(
            synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


def _unique_agent_name():
    return f"ANALYTICS-TEST-AGENT-{uuid.uuid4().hex[:8]}"


def _unique_task_id():
    return f"ANALYTICSTEST{uuid.uuid4().hex[:8].upper()}"


def _insert_task(
    *,
    status,
    assigned_agent,
    priority="normal",
    created_at=None,
    started_at=None,
    completed_at=None,
    error=None,
):
    task_id = _unique_task_id()
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type="analytics_test_task",
            assigned_agent=assigned_agent,
            priority=priority,
            status=status,
            payload={"task": "analytics test"},
            error=error,
            created_at=created_at or datetime.now(timezone.utc),
            started_at=started_at,
            completed_at=completed_at,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return task_id


def test_response_shape(client):
    response = client.get("/api/v1/analytics/tasks")
    assert response.status_code == 200
    body = response.json()

    for key in (
        "range",
        "totals",
        "completion_rate",
        "failure_rate",
        "today_new_tasks",
        "trend",
        "by_agent",
        "by_priority",
        "avg_duration_seconds",
        "recent_failed_tasks",
    ):
        assert key in body

    assert body["range"] == "7d"
    assert len(body["trend"]) == 7


def test_invalid_range_falls_back_to_7d(client):
    response = client.get("/api/v1/analytics/tasks?range=bogus")
    assert response.status_code == 200
    assert response.json()["range"] == "7d"


def test_by_agent_and_by_priority_grouping(client, cleanup_task_ids):
    agent = _unique_agent_name()
    now = datetime.now(timezone.utc)

    cleanup_task_ids.append(
        _insert_task(
            status="completed",
            assigned_agent=agent,
            priority="high",
            created_at=now,
            started_at=now - timedelta(seconds=30),
            completed_at=now,
        )
    )
    cleanup_task_ids.append(
        _insert_task(
            status="failed",
            assigned_agent=agent,
            priority="high",
            created_at=now,
            error="analytics test failure",
        )
    )

    response = client.get("/api/v1/analytics/tasks?range=today")
    body = response.json()

    agent_bucket = next(
        (item for item in body["by_agent"] if item["agent"] == agent), None
    )
    assert agent_bucket is not None
    assert agent_bucket["total"] == 2
    assert agent_bucket["completed"] == 1
    assert agent_bucket["failed"] == 1

    priority_bucket = next(
        (item for item in body["by_priority"] if item["priority"] == "high"),
        None,
    )
    assert priority_bucket is not None
    assert priority_bucket["total"] >= 2


def test_avg_duration_and_recent_failed_tasks(client, cleanup_task_ids):
    agent = _unique_agent_name()
    now = datetime.now(timezone.utc)

    cleanup_task_ids.append(
        _insert_task(
            status="completed",
            assigned_agent=agent,
            created_at=now,
            started_at=now - timedelta(seconds=100),
            completed_at=now,
        )
    )
    failed_id = _insert_task(
        status="failed",
        assigned_agent=agent,
        created_at=now,
        error="analytics test failure detail",
    )
    cleanup_task_ids.append(failed_id)

    response = client.get("/api/v1/analytics/tasks?range=today")
    body = response.json()

    assert body["avg_duration_seconds"] is not None

    failed_entry = next(
        (item for item in body["recent_failed_tasks"] if item["id"] == failed_id),
        None,
    )
    assert failed_entry is not None
    assert failed_entry["safe_error"] == "analytics test failure detail"
    assert failed_entry["assigned_agent"] == agent
    assert "payload" not in failed_entry
    assert "context" not in failed_entry


def test_recent_failed_tasks_do_not_leak_sensitive_result(client, cleanup_task_ids):
    agent = _unique_agent_name()
    task_id = _insert_task(
        status="failed",
        assigned_agent=agent,
        error="plain safe reason",
    )
    cleanup_task_ids.append(task_id)

    response = client.get("/api/v1/analytics/tasks?range=today")

    forbidden_substrings = ["Traceback", "postgresql://", "_sa_instance_state"]
    for substring in forbidden_substrings:
        assert substring not in response.text


def test_range_today_excludes_older_tasks(client, cleanup_task_ids):
    agent = _unique_agent_name()
    old_time = datetime.now(timezone.utc) - timedelta(days=10)

    cleanup_task_ids.append(
        _insert_task(
            status="completed",
            assigned_agent=agent,
            created_at=old_time,
        )
    )

    response = client.get("/api/v1/analytics/tasks?range=today")
    body = response.json()

    agent_bucket = next(
        (item for item in body["by_agent"] if item["agent"] == agent), None
    )
    assert agent_bucket is None
