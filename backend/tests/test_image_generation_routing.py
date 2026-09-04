from types import SimpleNamespace

from app.founder_ai.image_generation_routing import build_image_generation_request, resolve_image_generation_route
from app.founder_ai import model_probe_worker


def test_ofoxai_image_generation_resolves_to_images_endpoint():
    route = resolve_image_generation_route("ofoxai")
    assert route.supported is True
    assert route.api_mode == "openai_compatible"
    assert route.request_mode == "images_generation"
    assert route.endpoint_path == "/images/generations"


def test_unregistered_provider_is_not_silently_routed_to_chat():
    route = resolve_image_generation_route("custom")
    assert route.supported is False
    assert route.reason == "provider_image_generation_request_mode_unregistered"


def test_image_request_builder_is_provider_independent():
    endpoint, payload = build_image_generation_request(base_url="https://provider.example/v1/", model_id="provider/image-model", prompt="safe")
    assert endpoint == "https://provider.example/v1/images/generations"
    assert payload == {"model": "provider/image-model", "prompt": "safe", "size": "1024x1024", "n": 1}


def test_probe_uses_resolved_images_endpoint_not_chat(monkeypatch):
    calls = []
    monkeypatch.setattr(model_probe_worker, "resolve_runtime_config", lambda **_: SimpleNamespace(provider_type="ofoxai", api_key="not-observed", base_url="https://api.ofox.ai/v1"))

    class Response:
        status_code = 200
        def json(self):
            return {"data": []}

    monkeypatch.setattr(model_probe_worker.httpx, "post", lambda url, **kwargs: calls.append((url, kwargs["json"])) or Response())
    monkeypatch.setattr(model_probe_worker, "_persist_raw_response", lambda *_: ".runtime/redacted.json")
    result = model_probe_worker.real_image_probe({"provider_id": "configured", "model_id": "google/gemini-3.1-flash-image"}, "job")
    assert calls[0][0] == "https://api.ofox.ai/v1/images/generations"
    assert "/chat/completions" not in calls[0][0]
    assert result["status"] == "FAIL"
    assert result["endpoint_resolution"]["request_mode"] == "images_generation"
