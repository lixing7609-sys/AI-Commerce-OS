"""
统一 LLM Gateway 测试（阶段 8A）。

覆盖：Provider 选择/未配置安全失败、DeepSeek 各类响应映射、
Ollama 各类响应映射、日志不泄露 Key/Prompt、LLMResponse 字段
白名单。全部通过 monkeypatch httpx.post 模拟网络响应，不发起
真实网络请求（DeepSeek 未配置真实 Key，Ollama 真实可达性由
test_settings_llm_status_api.py 单独覆盖）。
"""

import logging

import httpx
import pytest

from app.llm import deepseek_provider as deepseek_module
from app.llm import ollama_provider as ollama_module
from app.llm.exceptions import (
    AuthenticationError,
    ConfigurationError,
    InvalidResponseError,
    LLMGatewayError,
    LLMTimeoutError,
    NetworkError,
    ProviderUnavailableError,
    RateLimitedError,
)
from app.llm.gateway import LLMGateway
from app.llm.models import LLMRequest


class _FakeResponse:
    def __init__(self, status_code, json_body=None):
        self.status_code = status_code
        self._json_body = json_body if json_body is not None else {}

    def json(self):
        return self._json_body


def _make_request():
    return LLMRequest(
        system_prompt="SYSTEM_PROMPT_MARKER_SECRET",
        user_prompt="USER_PROMPT_MARKER_SECRET",
        temperature=0.3,
        max_tokens=100,
    )


# ---------------------------------------------------------------------------
# Gateway：Provider 选择 / 未配置安全失败
# ---------------------------------------------------------------------------


def test_gateway_no_provider_configured_raises_configuration_error(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    gateway = LLMGateway()

    with pytest.raises(ConfigurationError):
        gateway.generate(_make_request())


def test_gateway_unknown_provider_raises_configuration_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "not-a-real-provider")

    gateway = LLMGateway()

    with pytest.raises(ConfigurationError):
        gateway.generate(_make_request())


def test_gateway_deepseek_selected_without_api_key_raises_configuration_error(
    monkeypatch,
):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    gateway = LLMGateway()

    with pytest.raises(ConfigurationError):
        gateway.generate(_make_request())


def test_gateway_ollama_selected_without_model_raises_configuration_error(
    monkeypatch,
):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.delenv("OLLAMA_MODEL", raising=False)

    gateway = LLMGateway()

    with pytest.raises(ConfigurationError):
        gateway.generate(_make_request())


def test_gateway_does_not_fall_back_across_providers(monkeypatch):
    """
    LLM_PROVIDER=deepseek 且未配置 Key 时，即使 Ollama 恰好可达，
    也必须安全失败，不允许静默切换到 Ollama。
    """

    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setenv("OLLAMA_MODEL", "some-installed-model")

    def _fail_if_called(*args, **kwargs):
        raise AssertionError("不应调用 Ollama")

    monkeypatch.setattr(ollama_module.httpx, "post", _fail_if_called)

    gateway = LLMGateway()

    with pytest.raises(ConfigurationError):
        gateway.generate(_make_request())


# ---------------------------------------------------------------------------
# DeepSeek Provider
# ---------------------------------------------------------------------------


def _deepseek_success_body():
    return {
        "choices": [{"message": {"content": '{"summary": "ok"}'}}],
        "usage": {
            "prompt_tokens": 10,
            "completion_tokens": 5,
            "total_tokens": 15,
        },
    }


def test_deepseek_success_returns_response(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key-should-not-leak")
    monkeypatch.setenv("DEEPSEEK_MODEL", "deepseek-chat")

    monkeypatch.setattr(
        deepseek_module.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, _deepseek_success_body()),
    )

    response = LLMGateway().generate(_make_request())

    assert response.content == '{"summary": "ok"}'
    assert response.provider == "deepseek"
    assert response.model == "deepseek-chat"
    assert response.usage.input_tokens == 10
    assert response.usage.output_tokens == 5
    assert response.usage.total_tokens == 15
    assert response.latency_ms >= 0


def test_deepseek_401_raises_authentication_failed(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    monkeypatch.setattr(
        deepseek_module.httpx, "post", lambda *a, **k: _FakeResponse(401)
    )

    with pytest.raises(AuthenticationError) as excinfo:
        LLMGateway().generate(_make_request())

    assert excinfo.value.error_type == "authentication_failed"


def test_deepseek_403_raises_authentication_failed(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    monkeypatch.setattr(
        deepseek_module.httpx, "post", lambda *a, **k: _FakeResponse(403)
    )

    with pytest.raises(AuthenticationError):
        LLMGateway().generate(_make_request())


def test_deepseek_429_raises_rate_limited(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    monkeypatch.setattr(
        deepseek_module.httpx, "post", lambda *a, **k: _FakeResponse(429)
    )

    with pytest.raises(RateLimitedError) as excinfo:
        LLMGateway().generate(_make_request())

    assert excinfo.value.error_type == "rate_limited"


def test_deepseek_500_raises_provider_unavailable(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    monkeypatch.setattr(
        deepseek_module.httpx, "post", lambda *a, **k: _FakeResponse(500)
    )

    with pytest.raises(ProviderUnavailableError) as excinfo:
        LLMGateway().generate(_make_request())

    assert excinfo.value.error_type == "provider_unavailable"


def test_deepseek_timeout_raises_timeout(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    def _raise_timeout(*args, **kwargs):
        raise httpx.ReadTimeout("read timed out")

    monkeypatch.setattr(deepseek_module.httpx, "post", _raise_timeout)

    with pytest.raises(LLMTimeoutError) as excinfo:
        LLMGateway().generate(_make_request())

    assert excinfo.value.error_type == "timeout"


def test_deepseek_connect_error_raises_provider_unavailable(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    def _raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(deepseek_module.httpx, "post", _raise_connect_error)

    with pytest.raises(ProviderUnavailableError):
        LLMGateway().generate(_make_request())


def test_deepseek_invalid_json_raises_invalid_response(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    class _BadJsonResponse:
        status_code = 200

        def json(self):
            raise ValueError("not json")

    monkeypatch.setattr(
        deepseek_module.httpx, "post", lambda *a, **k: _BadJsonResponse()
    )

    with pytest.raises(InvalidResponseError):
        LLMGateway().generate(_make_request())


def test_deepseek_missing_choices_raises_invalid_response(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test-key")

    monkeypatch.setattr(
        deepseek_module.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, {"unexpected": "shape"}),
    )

    with pytest.raises(InvalidResponseError):
        LLMGateway().generate(_make_request())


def test_deepseek_does_not_log_api_key_or_prompt(monkeypatch, caplog):
    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-super-secret-key-marker")

    monkeypatch.setattr(
        deepseek_module.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, _deepseek_success_body()),
    )

    caplog.set_level(logging.DEBUG)

    LLMGateway().generate(_make_request())

    log_text = "\n".join(record.getMessage() for record in caplog.records)

    assert "sk-super-secret-key-marker" not in log_text
    assert "SYSTEM_PROMPT_MARKER_SECRET" not in log_text
    assert "USER_PROMPT_MARKER_SECRET" not in log_text


# ---------------------------------------------------------------------------
# Ollama Provider
# ---------------------------------------------------------------------------


def _ollama_success_body():
    return {
        "response": '{"summary": "ok"}',
        "prompt_eval_count": 12,
        "eval_count": 8,
    }


def test_ollama_success_returns_response(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")

    monkeypatch.setattr(
        ollama_module.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, _ollama_success_body()),
    )

    response = LLMGateway().generate(_make_request())

    assert response.content == '{"summary": "ok"}'
    assert response.provider == "ollama"
    assert response.model == "qwen2.5:7b"
    assert response.usage.input_tokens == 12
    assert response.usage.output_tokens == 8
    assert response.usage.total_tokens == 20


def test_ollama_unreachable_raises_provider_unavailable(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")

    def _raise_connect_error(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(ollama_module.httpx, "post", _raise_connect_error)

    with pytest.raises(ProviderUnavailableError) as excinfo:
        LLMGateway().generate(_make_request())

    assert excinfo.value.error_type == "provider_unavailable"


def test_ollama_model_not_found_raises_configuration_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "does-not-exist:latest")

    monkeypatch.setattr(
        ollama_module.httpx,
        "post",
        lambda *a, **k: _FakeResponse(
            404, {"error": "model not found, try pulling it first"}
        ),
    )

    with pytest.raises(ConfigurationError):
        LLMGateway().generate(_make_request())


def test_ollama_timeout_raises_timeout(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")

    def _raise_timeout(*args, **kwargs):
        raise httpx.ReadTimeout("read timed out")

    monkeypatch.setattr(ollama_module.httpx, "post", _raise_timeout)

    with pytest.raises(LLMTimeoutError):
        LLMGateway().generate(_make_request())


def test_ollama_does_not_log_prompt(monkeypatch, caplog):
    monkeypatch.setenv("LLM_PROVIDER", "ollama")
    monkeypatch.setenv("OLLAMA_MODEL", "qwen2.5:7b")

    monkeypatch.setattr(
        ollama_module.httpx,
        "post",
        lambda *a, **k: _FakeResponse(200, _ollama_success_body()),
    )

    caplog.set_level(logging.DEBUG)

    LLMGateway().generate(_make_request())

    log_text = "\n".join(record.getMessage() for record in caplog.records)

    assert "SYSTEM_PROMPT_MARKER_SECRET" not in log_text
    assert "USER_PROMPT_MARKER_SECRET" not in log_text


# ---------------------------------------------------------------------------
# 响应字段白名单
# ---------------------------------------------------------------------------


def test_llm_response_only_has_whitelisted_fields(monkeypatch):
    import dataclasses

    from app.llm.models import LLMResponse

    field_names = {f.name for f in dataclasses.fields(LLMResponse)}
    assert field_names == {"content", "provider", "model", "usage", "latency_ms"}


def test_llm_usage_only_has_whitelisted_fields():
    import dataclasses

    from app.llm.models import LLMUsage

    field_names = {f.name for f in dataclasses.fields(LLMUsage)}
    assert field_names == {"input_tokens", "output_tokens", "total_tokens"}


def test_all_gateway_exceptions_are_llm_gateway_error_subclasses():
    from app.llm.exceptions import (
        SAFE_LLM_ERROR_TYPES,
        ConfigurationError as CE,
        AuthenticationError as AE,
        RateLimitedError as RE,
        ProviderUnavailableError as PE,
        NetworkError as NE,
        LLMTimeoutError as TE,
        InvalidResponseError as IE,
    )

    for cls in (CE, AE, RE, PE, NE, TE, IE):
        instance = cls()
        assert isinstance(instance, LLMGatewayError)
        assert instance.error_type in SAFE_LLM_ERROR_TYPES
        assert str(instance) == instance.error_type
