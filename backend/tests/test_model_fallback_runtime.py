from types import SimpleNamespace

import pytest

import app.core.model_center.service as model_center
from app.llm.exceptions import AuthenticationError, LLMTimeoutError, ProviderUnavailableError, RateLimitedError
from app.llm.gateway import LLMGateway
from app.llm.models import LLMRequest, LLMResponse


def _runtime(provider, model):
    return SimpleNamespace(provider_key=provider, provider_type="openai", api_key="secret", base_url="https://example.test/v1", model=model)


@pytest.mark.parametrize("failure", [AuthenticationError(), RateLimitedError(), LLMTimeoutError(), ProviderUnavailableError()])
def test_runtime_primary_failure_switches_once_to_fallback(monkeypatch, failure):
    primary, fallback = _runtime("primary", "model-a"), _runtime("fallback", "model-b")
    monkeypatch.setattr(model_center, "resolve_runtime_chain", lambda _role: [primary, fallback])
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **kwargs: primary)
    gateway = LLMGateway(); monkeypatch.setattr(gateway, "_provider_from_runtime", lambda config: config)
    attempts = []
    def generate(candidate, _request):
        attempts.append(candidate.provider_key)
        if candidate is primary: raise failure
        return LLMResponse("ok", candidate.provider_key, candidate.model, None, 10)
    monkeypatch.setattr(gateway, "_generate", generate)
    request = LLMRequest("system", "user", metadata={"runtime_role": "sino_conversation"})
    response = gateway.generate_for_model("primary", "model-a", request)
    assert response.content == "ok" and attempts == ["primary", "fallback"]
    assert request.metadata["model_fallback"]["reason"] == failure.error_type


def test_runtime_chain_failure_is_bounded_and_records_reasons(monkeypatch):
    primary, fallback = _runtime("primary", "model-a"), _runtime("fallback", "model-b")
    monkeypatch.setattr(model_center, "resolve_runtime_chain", lambda _role: [primary, fallback])
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **kwargs: primary)
    gateway = LLMGateway(); monkeypatch.setattr(gateway, "_provider_from_runtime", lambda config: config)
    attempts = []
    def fail(candidate, _request): attempts.append(candidate.provider_key); raise ProviderUnavailableError()
    monkeypatch.setattr(gateway, "_generate", fail)
    request = LLMRequest("system", "user", metadata={"runtime_role": "sino_conversation"})
    with pytest.raises(ProviderUnavailableError): gateway.generate_for_model("primary", "model-a", request)
    assert attempts == ["primary", "fallback"]
    assert len(request.metadata["model_fallback_failures"]) == 2
