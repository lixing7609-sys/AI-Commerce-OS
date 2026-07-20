"""
GET /api/v1/agents 安全性测试（阶段 8D：产品 Agent 真实接入）。

覆盖：产品 Agent capability_ready=true 且带上安全的业务能力
字段；其它未接入 Agent（财务/行政）状态不变
（capability_ready=false）；API 从不返回 Key/Prompt/Base URL
凭据/完整模型响应。
"""

from fastapi.testclient import TestClient

from app.main import app


def _client():
    return TestClient(app)


def _get_agent_items():
    with _client() as client:
        response = client.get("/api/v1/agents")
    assert response.status_code == 200
    return response.json()["items"]


def test_product_agent_capability_ready_true():
    items = _get_agent_items()
    product_agent = next(item for item in items if item["name"] == "产品 Agent")

    assert product_agent["capability_ready"] is True
    assert "llm_provider" in product_agent
    assert "llm_model" in product_agent
    assert set(product_agent["supported_task_types"]) == {
        "商品机会分析",
        "选品评估",
        "商品组合与组货建议",
        "上架准备清单",
    }
    assert "last_llm_call_status" in product_agent


def test_other_unimplemented_agents_still_capability_ready_false():
    items = _get_agent_items()

    for name in ("财务 Agent", "行政 Agent"):
        agent = next(item for item in items if item["name"] == name)
        assert agent["capability_ready"] is False
        assert "llm_provider" not in agent
        assert "supported_task_types" not in agent


def test_ai_ceo_and_sales_agent_still_capability_ready_true():
    items = _get_agent_items()

    ai_ceo = next(item for item in items if item["name"] == "AI CEO")
    assert ai_ceo["capability_ready"] is True

    sales_agent = next(item for item in items if item["name"] == "销售 Agent")
    assert sales_agent["capability_ready"] is True


def test_agents_api_never_returns_secrets():
    with _client() as client:
        response = client.get("/api/v1/agents")

    forbidden_substrings = [
        "api_key",
        "apikey",
        "DEEPSEEK_API_KEY",
        "Authorization",
        "Bearer",
        "Traceback",
        "postgresql://",
        "_sa_instance_state",
    ]

    response_text_lower = response.text.lower()
    for substring in forbidden_substrings:
        assert substring.lower() not in response_text_lower
