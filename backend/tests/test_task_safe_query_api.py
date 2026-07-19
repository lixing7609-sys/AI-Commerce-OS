"""
阶段 7B：GET /api/v1/integrations/tasks/{task_id} 安全查询接口测试。

覆盖：与提交网关相同的 API Key 鉴权、安全字段白名单（不含
payload/context/原始 result/error/traceback/ORM 内部字段）、
completed/failed 任务的 safe_result/safe_error 展示、不存在任务
的安全 404、OpenAPI 不泄露 Secret。

测试使用真实 TestClient；EXTERNAL_TASK_API_KEY 通过
monkeypatch.setenv 在每个测试内设置，不污染进程环境；所有测试
创建的任务按精确 task_id 清理。
"""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.database.db import SessionLocal
from app.main import app
from app.models.task_db import TaskDB

TEST_MARKER = "TASK_SAFE_QUERY_TEST"
TEST_API_KEY = "task-safe-query-test-secret-7b"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def api_key(monkeypatch):
    monkeypatch.setenv("EXTERNAL_TASK_API_KEY", TEST_API_KEY)
    return TEST_API_KEY


@pytest.fixture
def auth_headers(api_key):
    return {"X-Task-API-Key": api_key}


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


def _insert_task_row(
    *,
    task_id,
    status,
    assigned_agent="AI CEO",
    priority="normal",
    payload=None,
    result=None,
    error=None,
    started_at=None,
    completed_at=None,
):
    db = SessionLocal()
    try:
        row = TaskDB(
            id=task_id,
            task_type=f"{TEST_MARKER} task",
            assigned_agent=assigned_agent,
            priority=priority,
            status=status,
            payload=payload or {"task": f"{TEST_MARKER} task", "secret_note": "hidden"},
            result=result,
            error=error,
            created_at=datetime.now(timezone.utc),
            started_at=started_at,
            completed_at=completed_at,
        )
        db.add(row)
        db.commit()
    finally:
        db.close()


def _unique_task_id():
    return f"TASKSAFEQ{uuid.uuid4().hex[:8].upper()}"


# ---------------------------------------------------------------------------
# 鉴权：与提交网关相同的 API Key
# ---------------------------------------------------------------------------


def test_missing_api_key_returns_401(client, api_key, cleanup_task_ids):
    task_id = _unique_task_id()
    _insert_task_row(task_id=task_id, status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(f"/api/v1/integrations/tasks/{task_id}")
    assert response.status_code == 401


def test_wrong_api_key_returns_401(client, api_key, cleanup_task_ids):
    task_id = _unique_task_id()
    _insert_task_row(task_id=task_id, status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}",
        headers={"X-Task-API-Key": "wrong-value"},
    )
    assert response.status_code == 401


def test_unconfigured_gateway_returns_503(client, monkeypatch, cleanup_task_ids):
    monkeypatch.delenv("EXTERNAL_TASK_API_KEY", raising=False)

    task_id = _unique_task_id()
    _insert_task_row(task_id=task_id, status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}",
        headers={"X-Task-API-Key": "anything"},
    )
    assert response.status_code == 503


def test_correct_api_key_succeeds(client, auth_headers, cleanup_task_ids):
    task_id = _unique_task_id()
    _insert_task_row(task_id=task_id, status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}", headers=auth_headers
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# 安全字段白名单
# ---------------------------------------------------------------------------


def test_response_only_contains_safe_fields(client, auth_headers, cleanup_task_ids):
    task_id = _unique_task_id()
    _insert_task_row(
        task_id=task_id,
        status="completed",
        result={"api_key": "sk-should-not-appear", "message": "ok"},
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}", headers=auth_headers
    )
    body = response.json()

    assert set(body.keys()) == {
        "id",
        "status",
        "assigned_agent",
        "task_type",
        "priority",
        "created_at",
        "started_at",
        "completed_at",
        "safe_result",
        "safe_error",
    }
    assert "payload" not in body
    assert "context" not in body
    assert "result" not in body
    assert "error" not in body
    assert "sk-should-not-appear" not in response.text
    assert "hidden" not in response.text  # payload.secret_note 不应出现


def test_response_does_not_leak_orm_or_internal_fields(
    client, auth_headers, cleanup_task_ids
):
    task_id = _unique_task_id()
    _insert_task_row(task_id=task_id, status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}", headers=auth_headers
    )
    body = response.json()

    forbidden_substrings = ["_sa_instance_state", "Traceback", "postgresql://"]
    for substring in forbidden_substrings:
        assert substring not in response.text


# ---------------------------------------------------------------------------
# completed / failed 安全展示
# ---------------------------------------------------------------------------


def test_completed_task_returns_safe_result(client, auth_headers, cleanup_task_ids):
    task_id = _unique_task_id()
    _insert_task_row(
        task_id=task_id,
        status="completed",
        result={
            "success": True,
            "api_key": "sk-leak-test",
            "message": "任务已完成",
        },
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}", headers=auth_headers
    )
    body = response.json()

    assert body["status"] == "completed"
    assert "任务已完成" in body["safe_result"]
    assert "sk-leak-test" not in body["safe_result"]
    assert '"api_key": "***"' in body["safe_result"]
    assert body["safe_error"] == "暂无错误信息"


def test_failed_task_returns_safe_error(client, auth_headers, cleanup_task_ids):
    task_id = _unique_task_id()
    _insert_task_row(
        task_id=task_id,
        status="failed",
        error="Agent 执行超时",
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}", headers=auth_headers
    )
    body = response.json()

    assert body["status"] == "failed"
    assert body["safe_error"] == "Agent 执行超时"
    assert body["safe_result"] == "暂无执行结果"


def test_pending_task_has_placeholder_result_and_error(
    client, auth_headers, cleanup_task_ids
):
    task_id = _unique_task_id()
    _insert_task_row(task_id=task_id, status="pending")
    cleanup_task_ids.append(task_id)

    response = client.get(
        f"/api/v1/integrations/tasks/{task_id}", headers=auth_headers
    )
    body = response.json()

    assert body["safe_result"] == "暂无执行结果"
    assert body["safe_error"] == "暂无错误信息"
    assert body["started_at"] is None
    assert body["completed_at"] is None


# ---------------------------------------------------------------------------
# 不存在任务的安全 404
# ---------------------------------------------------------------------------


def test_nonexistent_task_returns_safe_404(client, auth_headers):
    response = client.get(
        "/api/v1/integrations/tasks/TASK-DOES-NOT-EXIST-7B",
        headers=auth_headers,
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "Traceback" not in detail
    assert "postgresql://" not in detail


# ---------------------------------------------------------------------------
# OpenAPI 不泄露 Secret
# ---------------------------------------------------------------------------


def test_openapi_query_route_and_model(client):
    schema = client.get("/openapi.json").json()

    assert "/api/v1/integrations/tasks/{task_id}" in schema["paths"]
    get_op = schema["paths"]["/api/v1/integrations/tasks/{task_id}"]["get"]

    assert "security" in get_op or "parameters" in get_op

    response_ref = get_op["responses"]["200"]["content"]["application/json"][
        "schema"
    ].get("$ref", "")
    assert "TaskSafeQueryResponse" in response_ref

    components = schema["components"]["schemas"]
    response_props = components["TaskSafeQueryResponse"]["properties"]

    for field in (
        "id",
        "status",
        "assigned_agent",
        "task_type",
        "priority",
        "created_at",
        "started_at",
        "completed_at",
        "safe_result",
        "safe_error",
    ):
        assert field in response_props

    assert "payload" not in response_props
    assert "context" not in response_props
    assert "result" not in response_props
    assert "error" not in response_props

    schema_text = str(schema)
    assert TEST_API_KEY not in schema_text
