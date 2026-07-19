"""
GET /api/v1/settings/integration-status 与 GET /api/v1/settings/
system-info 测试。

覆盖：integration-status 只返回布尔值、从不返回真实环境变量值；
n8n/Ollama 不可达时安全降级为 False 而不是抛异常；system-info
不包含任何 Secret 或数据库连接串。
"""

from fastapi.testclient import TestClient

from app.main import app

REAL_SECRET_VALUE = "wecom-real-secret-should-never-leak-9f8e7d"


def _client():
    return TestClient(app)


def test_integration_status_only_returns_booleans():
    with _client() as client:
        response = client.get("/api/v1/settings/integration-status")

    assert response.status_code == 200
    body = response.json()

    expected_fields = {
        "external_task_api_key_configured",
        "n8n_reachable",
        "wecom_configured",
        "deepseek_configured",
        "ollama_reachable",
    }
    assert set(body.keys()) == expected_fields

    for value in body.values():
        assert isinstance(value, bool)


def test_integration_status_never_leaks_actual_values(monkeypatch):
    monkeypatch.setenv("EXTERNAL_TASK_API_KEY", REAL_SECRET_VALUE)
    monkeypatch.setenv("WECOM_CORP_ID", REAL_SECRET_VALUE)
    monkeypatch.setenv("WECOM_AGENT_ID", REAL_SECRET_VALUE)
    monkeypatch.setenv("WECOM_APP_SECRET", REAL_SECRET_VALUE)
    monkeypatch.setenv("WECOM_CALLBACK_TOKEN", REAL_SECRET_VALUE)
    monkeypatch.setenv("WECOM_ENCODING_AES_KEY", REAL_SECRET_VALUE)
    monkeypatch.setenv("DEEPSEEK_API_KEY", REAL_SECRET_VALUE)

    with _client() as client:
        response = client.get("/api/v1/settings/integration-status")

    assert REAL_SECRET_VALUE not in response.text
    body = response.json()
    assert body["external_task_api_key_configured"] is True
    assert body["wecom_configured"] is True
    assert body["deepseek_configured"] is True


def test_unconfigured_wecom_and_gateway_report_false(monkeypatch):
    monkeypatch.delenv("EXTERNAL_TASK_API_KEY", raising=False)
    monkeypatch.delenv("WECOM_CORP_ID", raising=False)
    monkeypatch.delenv("WECOM_AGENT_ID", raising=False)
    monkeypatch.delenv("WECOM_APP_SECRET", raising=False)
    monkeypatch.delenv("WECOM_CALLBACK_TOKEN", raising=False)
    monkeypatch.delenv("WECOM_ENCODING_AES_KEY", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    with _client() as client:
        response = client.get("/api/v1/settings/integration-status")

    body = response.json()
    assert body["external_task_api_key_configured"] is False
    assert body["wecom_configured"] is False
    assert body["deepseek_configured"] is False


def test_unreachable_n8n_and_ollama_degrade_to_false(monkeypatch):
    monkeypatch.setenv("N8N_BASE_URL", "http://127.0.0.1:1")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:1")

    with _client() as client:
        response = client.get("/api/v1/settings/integration-status")

    assert response.status_code == 200
    body = response.json()
    assert body["n8n_reachable"] is False
    assert body["ollama_reachable"] is False


def test_system_info_shape_and_no_secrets():
    with _client() as client:
        response = client.get("/api/v1/settings/system-info")

    assert response.status_code == 200
    body = response.json()

    expected_fields = {
        "backend_version",
        "database_migration_head",
        "consumer_healthy",
        "environment",
        "agent_count",
    }
    assert set(body.keys()) == expected_fields
    assert isinstance(body["consumer_healthy"], bool)
    assert isinstance(body["agent_count"], int)

    forbidden_substrings = ["postgresql://", "password", "Traceback"]
    for substring in forbidden_substrings:
        assert substring not in response.text
