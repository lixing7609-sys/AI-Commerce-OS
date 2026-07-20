"""
Task API 父子任务字段测试（阶段 8B）。

覆盖：GET /api/v1/tasks/{id} 返回 parent_task_id/root_task_id/
delegation_depth/created_by_agent/child_task_count/children/
parent_summary；children 只含安全展示字段（不含 payload/context/
result/error）；父任务不存在时安全降级为 parent_summary=None，
不报错；GET /api/v1/tasks 列表也带上 child_task_count。
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database.db import SessionLocal
from app.main import app
from app.models.task_db import TaskDB

TEST_MARKER = "TASK_DELEGATION_API_TEST"


def _client():
    return TestClient(app)


def _make_task_id():
    return f"TASKDELEGAPI{uuid.uuid4().hex[:8].upper()}"


def _insert_task(
    *,
    task_id=None,
    assigned_agent="AI CEO",
    status="completed",
    parent_task_id=None,
    root_task_id=None,
    delegation_depth=0,
    created_by_agent=None,
    delegation_key=None,
    payload=None,
    result=None,
):
    task_id = task_id or _make_task_id()
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER}_task",
            assigned_agent=assigned_agent,
            priority="normal",
            status=status,
            payload=payload if payload is not None else {"task": "x", "secret_note": "SENSITIVE-CHILD-PAYLOAD"},
            result=result,
            created_at=datetime.now(timezone.utc),
            parent_task_id=parent_task_id,
            root_task_id=root_task_id if root_task_id is not None else task_id,
            delegation_depth=delegation_depth,
            created_by_agent=created_by_agent,
            delegation_key=delegation_key,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()
    return task_id


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


# ---------------------------------------------------------------------------
# 28. task detail 父子字段
# ---------------------------------------------------------------------------


def test_task_detail_includes_delegation_fields(cleanup_task_ids):
    task_id = _insert_task(delegation_depth=0)
    cleanup_task_ids.append(task_id)

    with _client() as client:
        response = client.get(f"/api/v1/tasks/{task_id}")

    assert response.status_code == 200
    body = response.json()

    for field in (
        "parent_task_id",
        "root_task_id",
        "delegation_depth",
        "created_by_agent",
        "child_task_count",
        "children",
        "parent_summary",
    ):
        assert field in body

    assert body["root_task_id"] == task_id
    assert body["delegation_depth"] == 0
    assert body["parent_task_id"] is None
    assert body["parent_summary"] is None
    assert body["children"] == []
    assert body["child_task_count"] == 0


# ---------------------------------------------------------------------------
# 29/30. children 响应安全，不含 payload/context/result/error
# ---------------------------------------------------------------------------


def test_task_detail_children_are_safe_summaries(cleanup_task_ids):
    parent_id = _insert_task(
        delegation_depth=0, payload={"task": "生成今日经营分析"}
    )
    cleanup_task_ids.append(parent_id)

    child_id = _insert_task(
        assigned_agent="产品 Agent",
        status="pending",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
        created_by_agent="AI CEO",
        delegation_key="dummy-key-1",
        payload={"task": "分析商品结构", "secret_note": "SENSITIVE-CHILD-PAYLOAD"},
    )
    cleanup_task_ids.append(child_id)

    with _client() as client:
        response = client.get(f"/api/v1/tasks/{parent_id}")

    assert response.status_code == 200
    body = response.json()

    assert body["child_task_count"] == 1
    assert len(body["children"]) == 1

    child = body["children"][0]
    assert set(child.keys()) == {
        "id",
        "assigned_agent",
        "status",
        "task_type",
        "created_at",
        "completed_at",
    }
    assert child["id"] == child_id
    assert child["assigned_agent"] == "产品 Agent"
    assert child["status"] == "pending"

    assert "SENSITIVE-CHILD-PAYLOAD" not in response.text
    assert "payload" not in child
    assert "context" not in child
    assert "result" not in child
    assert "error" not in child


def test_task_detail_parent_summary_is_safe(cleanup_task_ids):
    parent_id = _insert_task(
        assigned_agent="AI CEO",
        status="completed",
        payload={"task": "生成今日经营分析", "secret_note": "SENSITIVE-PARENT-PAYLOAD"},
        result={"result": {"analysis": {"summary": "SENSITIVE-PARENT-RESULT"}}},
    )
    cleanup_task_ids.append(parent_id)

    child_id = _insert_task(
        assigned_agent="产品 Agent",
        status="pending",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
        created_by_agent="AI CEO",
        delegation_key="dummy-key-2",
    )
    cleanup_task_ids.append(child_id)

    with _client() as client:
        response = client.get(f"/api/v1/tasks/{child_id}")

    assert response.status_code == 200
    body = response.json()

    assert body["parent_task_id"] == parent_id
    assert body["created_by_agent"] == "AI CEO"
    assert body["parent_summary"] is not None
    assert body["parent_summary"]["id"] == parent_id
    assert body["parent_summary"]["status"] == "completed"

    assert set(body["parent_summary"].keys()) == {
        "id",
        "status",
        "task_type",
        "assigned_agent",
    }
    assert "SENSITIVE-PARENT-PAYLOAD" not in response.text
    assert "SENSITIVE-PARENT-RESULT" not in response.text


# ---------------------------------------------------------------------------
# 31. parent 不存在安全处理
# ---------------------------------------------------------------------------


def test_task_detail_handles_missing_parent_safely(cleanup_task_ids):
    orphan_id = _insert_task(
        assigned_agent="产品 Agent",
        status="pending",
        parent_task_id=f"TASKDELEGAPI{uuid.uuid4().hex[:8].upper()}",
        root_task_id=None,
        delegation_depth=1,
        created_by_agent="AI CEO",
        delegation_key="dummy-key-orphan",
    )
    cleanup_task_ids.append(orphan_id)

    with _client() as client:
        response = client.get(f"/api/v1/tasks/{orphan_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["parent_summary"] is None


def test_nonexistent_task_still_returns_safe_404(cleanup_task_ids):
    with _client() as client:
        response = client.get("/api/v1/tasks/TASK-DOES-NOT-EXIST-8B")

    assert response.status_code == 404
    assert "Traceback" not in response.text
    assert "postgresql://" not in response.text


# ---------------------------------------------------------------------------
# 列表接口也带上 child_task_count
# ---------------------------------------------------------------------------


def test_task_list_includes_child_task_count(cleanup_task_ids):
    parent_id = _insert_task()
    cleanup_task_ids.append(parent_id)

    child_id = _insert_task(
        assigned_agent="产品 Agent",
        parent_task_id=parent_id,
        root_task_id=parent_id,
        delegation_depth=1,
        created_by_agent="AI CEO",
        delegation_key="dummy-key-list",
    )
    cleanup_task_ids.append(child_id)

    with _client() as client:
        response = client.get(
            "/api/v1/tasks", params={"assigned_agent": "AI CEO", "limit": 100}
        )

    assert response.status_code == 200
    body = response.json()

    matching = [item for item in body["items"] if item["id"] == parent_id]
    assert len(matching) == 1
    assert matching[0]["child_task_count"] == 1
    assert matching[0]["children"] is None
    assert matching[0]["parent_summary"] is None
