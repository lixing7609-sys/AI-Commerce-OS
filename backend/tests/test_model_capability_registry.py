from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.model_center.model import AICapabilityConfigDB, ModelInvocationDB, ModelProviderConfigDB, ModelRegistryDB
from app.core.model_center import capability_registry


def _db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(capability_registry, "SessionLocal", factory)
    return factory


def test_verified_capability_routes_unverified_preference_to_fallback(monkeypatch):
    factory = _db(monkeypatch)
    with factory() as session:
        session.add_all([
            ModelProviderConfigDB(provider_key="gpt", provider_type="openai", display_name="GPT", base_url="https://gpt.test/v1", model="gpt-5-pro", available_models=["gpt-5-pro"], selected_models=["gpt-5-pro"], enabled=True, health_status="healthy"),
            ModelProviderConfigDB(provider_key="gemini", provider_type="ofoxai", display_name="Gemini", base_url="https://gemini.test/v1", model="gemini-vision", available_models=["gemini-vision"], selected_models=["gemini-vision"], enabled=True, health_status="healthy"),
            ModelRegistryDB(provider_id="gpt", model_id="gpt-5-pro", display_name="GPT", selected=True, enabled=True),
            ModelRegistryDB(provider_id="gemini", model_id="gemini-vision", display_name="Gemini Vision", selected=True, enabled=True),
            AICapabilityConfigDB(capability_key="vision_model_routing", configuration={"model_probes": {"gemini:gemini-vision": {"supports_image": True, "status": "passed", "source": "real_multimodal_capability_probe", "observed_at": "2026-08-18T00:00:00Z"}}}),
            ModelInvocationDB(invocation_id="gemini-health", provider_id="gemini", model_id="gemini-vision", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
        ])
        session.commit()
    policy = next(item for item in capability_registry.get_model_capability_registry()["routing_policies"] if item["capability"] == "VISION_UNDERSTANDING")
    assert policy["preferred_primary"] == {"provider_id": "gpt", "model_id": "gpt-5-pro"}
    assert policy["active_primary"]["model_id"] == "gemini-vision"
    assert policy["preferred_status"] == "UNVERIFIED_OR_UNHEALTHY"


def test_unverified_preferred_never_becomes_active_and_image_generation_is_missing(monkeypatch):
    factory = _db(monkeypatch)
    with factory() as session:
        session.add(ModelProviderConfigDB(provider_key="p", provider_type="custom", display_name="P", base_url="https://p.test/v1", model="image", available_models=["image"], selected_models=["image"], enabled=True, health_status="healthy"))
        session.add(ModelRegistryDB(provider_id="p", model_id="image", display_name="Image", selected=True, enabled=True))
        session.commit()
    capability_registry.save_routing_preferred("IMAGE_GENERATION", {"provider_id": "p", "model_id": "image"})
    policy = next(item for item in capability_registry.get_model_capability_registry()["routing_policies"] if item["capability"] == "IMAGE_GENERATION")
    assert policy["active_primary"] is None and policy["status"] == "MISSING"


def test_unhealthy_verified_primary_falls_back(monkeypatch):
    factory = _db(monkeypatch)
    probes = {"primary:a": {"supports_image": True, "status": "passed", "source": "real_multimodal_capability_probe"}, "fallback:b": {"supports_image": True, "status": "passed", "source": "real_multimodal_capability_probe"}}
    with factory() as session:
        session.add_all([
            ModelProviderConfigDB(provider_key="primary", provider_type="custom", display_name="Primary", base_url="https://a", model="a", available_models=["a"], selected_models=["a"], enabled=True, health_status="unhealthy"),
            ModelProviderConfigDB(provider_key="fallback", provider_type="custom", display_name="Fallback", base_url="https://b", model="b", available_models=["b"], selected_models=["b"], enabled=True, health_status="healthy"),
            ModelRegistryDB(provider_id="primary", model_id="a", display_name="A", selected=True, enabled=True),
            ModelRegistryDB(provider_id="fallback", model_id="b", display_name="B", selected=True, enabled=True),
            AICapabilityConfigDB(capability_key="vision_model_routing", configuration={"model_probes": probes}),
            AICapabilityConfigDB(capability_key=capability_registry.POLICY_KEY, configuration={"VISION_UNDERSTANDING": {"preferred_primary": {"provider_id": "primary", "model_id": "a"}}}),
            ModelInvocationDB(invocation_id="primary-health", provider_id="primary", model_id="a", status="failed", error_code="provider_unavailable", invocation_source="model_health_probe", runtime_mode="probe"),
            ModelInvocationDB(invocation_id="fallback-health", provider_id="fallback", model_id="b", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
        ])
        session.commit()
    assert capability_registry.resolve_model_route("VISION_UNDERSTANDING")[0]["model_id"] == "b"


def test_persisted_verified_vision_survives_a_later_operational_probe_failure(monkeypatch):
    factory = _db(monkeypatch)
    with factory() as session:
        session.add_all([
            ModelProviderConfigDB(provider_key="ofox", provider_type="ofoxai", display_name="OfoxAI", base_url="https://ofox.test/v1", model="google/gemini-3.1-flash-image", available_models=["google/gemini-3.1-flash-image"], selected_models=["google/gemini-3.1-flash-image"], enabled=True, health_status="healthy"),
            ModelRegistryDB(provider_id="ofox", model_id="google/gemini-3.1-flash-image", display_name="Google/gemini 3.1 Flash Image", supports_vision=True, selected=True, enabled=True),
            AICapabilityConfigDB(capability_key="vision_model_routing", configuration={"model_probes": {"ofox:google/gemini-3.1-flash-image": {"supports_image": False, "status": "failed", "source": "real_multimodal_capability_probe", "error_type": "JSONDecodeError"}}}),
            ModelInvocationDB(invocation_id="ofox-health", provider_id="ofox", model_id="google/gemini-3.1-flash-image", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
        ])
        session.commit()
    registry = capability_registry.get_model_capability_registry()
    model = registry["models"][0]
    assert model["capabilities"]["supports_vision_understanding"]["status"] == "VERIFIED"
    assert model["capabilities"]["supports_vision_understanding"]["source"] == "MODEL_REGISTRY_VERIFIED"
    policy = next(item for item in registry["routing_policies"] if item["capability"] == "VISION_UNDERSTANDING")
    assert policy["active_primary"]["model_id"] == "google/gemini-3.1-flash-image"


def test_explicit_capability_aliases_normalize_without_model_name_guessing():
    for alias in ("image", "vision", "multimodal", "image_input", "image-understanding", "VISION_UNDERSTANDING"):
        assert capability_registry.normalize_capability_vocabulary([alias]) == {"VISION_UNDERSTANDING"}
    assert capability_registry.normalize_capability_vocabulary(["unknown", "Google/gemini Image"]) == set()
