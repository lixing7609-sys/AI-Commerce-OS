from types import SimpleNamespace

import pytest

import app.core.model_center.service as model_center
import app.core.model_center.runtime_chain as runtime_chain
from app.llm.exceptions import AuthenticationError, LLMTimeoutError, ProviderUnavailableError, RateLimitedError
from app.llm.gateway import LLMGateway
from app.llm.models import LLMRequest, LLMResponse, LLMUsage


def _runtime(provider, model):
    return SimpleNamespace(provider_key=provider, provider_type="openai", api_key="secret", base_url="https://example.test/v1", model=model)


@pytest.mark.parametrize("failure", [AuthenticationError(), RateLimitedError(), LLMTimeoutError(), ProviderUnavailableError()])
def test_runtime_primary_failure_switches_once_to_fallback(monkeypatch, failure):
    primary, fallback = _runtime("primary", "model-a"), _runtime("fallback", "model-b")
    monkeypatch.setattr(model_center, "resolve_runtime_chain", lambda _role: [primary, fallback])
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **kwargs: primary)
    gateway = LLMGateway(); monkeypatch.setattr(gateway, "_provider_from_runtime", lambda config: config)
    ledger = []
    monkeypatch.setattr(gateway, "_record_invocation", lambda provider, model, status, request, **details: ledger.append((provider, model, status, details)) or f"inv-{len(ledger)}")
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
    assert [(item[0], item[1], item[2]) for item in ledger] == [("primary", "model-a", "failed"), ("fallback", "model-b", "completed")]
    assert ledger[1][3]["fallback_from"] == {"provider": "primary", "model": "model-a"}


def test_runtime_chain_failure_is_bounded_and_records_reasons(monkeypatch):
    primary, fallback = _runtime("primary", "model-a"), _runtime("fallback", "model-b")
    monkeypatch.setattr(model_center, "resolve_runtime_chain", lambda _role: [primary, fallback])
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **kwargs: primary)
    gateway = LLMGateway(); monkeypatch.setattr(gateway, "_provider_from_runtime", lambda config: config)
    ledger = []
    monkeypatch.setattr(gateway, "_record_invocation", lambda provider, model, status, request, **details: ledger.append((provider, model, status, details)) or f"inv-{len(ledger)}")
    attempts = []
    def fail(candidate, _request): attempts.append(candidate.provider_key); raise ProviderUnavailableError()
    monkeypatch.setattr(gateway, "_generate", fail)
    request = LLMRequest("system", "user", metadata={"runtime_role": "sino_conversation"})
    with pytest.raises(ProviderUnavailableError): gateway.generate_for_model("primary", "model-a", request)
    assert attempts == ["primary", "fallback"]
    assert len(request.metadata["model_fallback_failures"]) == 2
    assert [item[2] for item in ledger] == ["failed", "failed"]


def test_fresh_unhealthy_fallback_is_rejected_without_provider_call(monkeypatch):
    primary, fallback = _runtime("primary", "model-a"), _runtime("fallback", "model-b")
    monkeypatch.setattr(model_center, "resolve_runtime_chain", lambda _role: [primary, fallback])
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **kwargs: primary)
    monkeypatch.setattr(runtime_chain, "model_runtime_preflight", lambda provider, _model: {
        "preflight_action": "ready" if provider == "primary" else "reject", "health_source": "invocation",
        "last_checked_at": "now", "fresh_until": "later", "health_classification": "RATE_LIMITED",
    })
    gateway = LLMGateway(); monkeypatch.setattr(gateway, "_provider_from_runtime", lambda config: config)
    attempts = []
    def generate(candidate, _request): attempts.append(candidate.provider_key); raise ProviderUnavailableError()
    monkeypatch.setattr(gateway, "_generate", generate)
    monkeypatch.setattr(gateway, "_record_invocation", lambda *_args, **_kwargs: "inv")
    with pytest.raises(RateLimitedError):
        gateway.generate_for_model("primary", "model-a", LLMRequest("system", "user", metadata={"runtime_role": "sino_conversation"}))
    assert attempts == ["primary"]


def test_streaming_final_usage_is_recorded_when_provider_reports_it(monkeypatch):
    runtime = _runtime("primary", "model-a")
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **_kwargs: runtime)
    gateway = LLMGateway()
    monkeypatch.setattr(gateway, "_enforce_model_preflight", lambda *_args, **_kwargs: None)

    class StreamingProvider:
        def stream(self, request):
            request.metadata["_stream_usage"] = LLMUsage(11, 7, 18)
            yield "ok"

    monkeypatch.setattr(gateway, "_provider_from_runtime", lambda _config: StreamingProvider())
    ledger = []
    monkeypatch.setattr(gateway, "_record_invocation", lambda provider, model, status, request, **details: ledger.append((provider, model, status, details)) or "inv-stream")
    request = LLMRequest("system", "user", metadata={"runtime_role": "sino_conversation", "conversation_id": "conv-1"})

    assert list(gateway.stream_for_model("primary", "model-a", request)) == ["ok"]

    assert request.metadata["model_invocation_id"] == "inv-stream"
    usage = ledger[0][3]["response"].usage
    assert (usage.input_tokens, usage.output_tokens, usage.total_tokens) == (11, 7, 18)


def test_streaming_without_usage_records_unknown_tokens_not_zero(monkeypatch):
    runtime = _runtime("primary", "model-a")
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **_kwargs: runtime)
    gateway = LLMGateway()
    monkeypatch.setattr(gateway, "_enforce_model_preflight", lambda *_args, **_kwargs: None)

    class StreamingProvider:
        def stream(self, _request):
            yield "ok"

    monkeypatch.setattr(gateway, "_provider_from_runtime", lambda _config: StreamingProvider())
    ledger = []
    monkeypatch.setattr(gateway, "_record_invocation", lambda provider, model, status, request, **details: ledger.append(details) or "inv-stream")

    assert list(gateway.stream_for_model("primary", "model-a", LLMRequest("system", "user"))) == ["ok"]

    assert ledger[0]["response"].usage is None


def test_legacy_generate_paths_still_record_invocation_truth(monkeypatch):
    runtime = _runtime("legacy-provider", "legacy-model")
    monkeypatch.setattr(model_center, "resolve_runtime_config", lambda **_kwargs: runtime)
    gateway = LLMGateway()
    ledger = []
    monkeypatch.setattr(gateway, "_record_invocation", lambda provider, model, status, request, **details: ledger.append((provider, model, status, details)) or "inv-legacy")
    monkeypatch.setattr(gateway, "_generate", lambda _provider, _request: LLMResponse("ok", "openai", "legacy-model", LLMUsage(3, 4, 7), 12))

    request = LLMRequest("system", "user", metadata={"runtime_role": "legacy_agent", "invocation_source": "legacy_agent"})
    response = gateway.generate_for("legacy-provider", request)

    assert response.content == "ok"
    assert request.metadata["model_invocation_id"] == "inv-legacy"
    assert ledger[0][0:3] == ("legacy-provider", "legacy-model", "completed")
    assert ledger[0][3]["response"].usage.total_tokens == 7
