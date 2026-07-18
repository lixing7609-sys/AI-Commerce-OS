"""
Tasks API 筛选、分页与响应结构测试。

覆盖：

- 默认参数下的响应结构（stats/items/pagination）
- status 筛选（含非法值 422）
- assigned_agent 精确筛选（含无匹配结果）
- limit/offset 分页与边界校验
- GET /tasks/{task_id} 与 GET /tasks/stats

测试产生的任务通过 TEST_MARKER 标记 task 名称和 context，
允许保留在开发数据库中，不会与正常任务混淆。
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

TEST_MARKER = "TASKS_API_TEST_MARKER"
TEST_AGENT = "产品 Agent"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module")
def marked_task(client):
    """
    创建一条明确标记为测试数据的任务，
    用于 assigned_agent 筛选和单任务详情查询测试。
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

    return response.json()["task"]


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
