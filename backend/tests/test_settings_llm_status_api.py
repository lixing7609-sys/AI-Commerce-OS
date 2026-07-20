"""
GET /api/v1/settings/llm-status 测试。

覆盖：只返回 Provider 名称/模型标识符/布尔值，从不返回 API Key
或 Base URL 凭据；Ollama 不可达时安全降级为 False，不抛异常。
"""

from fastapi.testclient import TestClient

from app.main import app

REAL_SECRET_VALUE = "deepseek-real-key-should-never-leak-4f7c2a"


def _client():
    return TestClient(app)


def test_llm_status_shape():
    with _client() as client:
        response = client.get("/api/v1/settings/llm-status")

    assert response.status_code == 200
    body = response.json()

    expected_fields = {
        "llm_provider",
        "deepseek_configured",
        "ollama_reachable",
        "llm_model",
        "llm_ready",
        "checked_at",
    }
    assert set(body.keys()) == expected_fields
    assert isinstance(body["deepseek_configured"], bool)
    assert isinstance(body["ollama_reachable"], bool)
    assert isinstance(body["llm_ready"], bool)


def test_llm_status_never_leaks_api_key(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_API_KEY", REAL_SECRET_VALUE)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-chat")

    with _client() as client:
        response = client.get("/api/v1/settings/llm-status")

    assert REAL_SECRET_VALUE not in response.text
    body = response.json()
    assert body["deepseek_configured"] is True
    assert body["llm_provider"] == "deepseek"
    assert body["llm_model"] == "deepseek-chat"
    assert body["llm_ready"] is True


def test_llm_status_deepseek_not_configured(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")

    with _client() as client:
        response = client.get("/api/v1/settings/llm-status")

    body = response.json()
    assert body["deepseek_configured"] is False
    assert body["llm_ready"] is False


def test_llm_status_unreachable_ollama_degrades_safely(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "some-model")
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:1")

    with _client() as client:
        response = client.get("/api/v1/settings/llm-status")

    assert response.status_code == 200
    body = response.json()
    assert body["ollama_reachable"] is False
    assert body["llm_ready"] is False


def test_llm_status_no_provider_configured(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    with _client() as client:
        response = client.get("/api/v1/settings/llm-status")

    body = response.json()
    assert body["llm_provider"] is None
    assert body["llm_ready"] is False
    assert body["llm_model"] is None
