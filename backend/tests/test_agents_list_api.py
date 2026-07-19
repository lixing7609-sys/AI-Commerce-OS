"""
管理后台"AI 员工"页面依赖的 GET /api/v1/agents 安全性测试。

覆盖：真实 Agent 列表、字段白名单（不含 Prompt 原文/API Key/
模型密钥/内部对象/traceback）。该接口在阶段 4A 就已存在，这里
补充管理后台新增页面所需的安全性回归测试。
"""

from fastapi.testclient import TestClient

from app.agents.agent_registry import AgentRegistry
from app.main import app


def _client():
    return TestClient(app)


def test_list_agents_returns_real_registered_agents():
    with _client() as client:
        response = client.get("/api/v1/agents")

    assert response.status_code == 200
    body = response.json()

    assert body["total"] == AgentRegistry.count()
    assert isinstance(body["items"], list)
    assert len(body["items"]) == body["total"]


def test_agent_items_only_contain_safe_fields():
    with _client() as client:
        response = client.get("/api/v1/agents")

    body = response.json()

    if not body["items"]:
        return

    allowed_fields = {
        "name",
        "role",
        "description",
        "status",
        "current_task",
        "last_run_at",
        "last_error",
    }

    for item in body["items"]:
        assert set(item.keys()) <= allowed_fields

    forbidden_substrings = [
        "api_key",
        "apikey",
        "secret",
        "token",
        "Traceback",
        "postgresql://",
        "_sa_instance_state",
    ]

    response_text = response.text.lower()
    for substring in forbidden_substrings:
        assert substring.lower() not in response_text
