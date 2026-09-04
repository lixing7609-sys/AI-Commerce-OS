"""Verified model-capability registry and routing policy projection V1."""
from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy import select

from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.model_center.model import AICapabilityConfigDB, ModelProviderConfigDB, ModelRegistryDB
from app.database.db import SessionLocal

REGISTRY_ID = "model-capability-registry-v1"
POLICY_KEY = "model_routing_policy_v1"
CAPABILITIES = ("TEXT_REASONING", "VISION_UNDERSTANDING", "IMAGE_GENERATION", "TOOL_USE", "STRUCTURED_OUTPUT")
VISION_CAPABILITY_ALIASES = frozenset({
    "VISION_UNDERSTANDING",
    "VISION",
    "IMAGE",
    "IMAGE_INPUT",
    "IMAGE_UNDERSTANDING",
    "MULTIMODAL",
    "VISUAL",
})
DEFAULT_PREFERRED = {
    "TEXT_REASONING": {"provider_id": "gpt", "model_id": "gpt-5-pro"},
    "VISION_UNDERSTANDING": {"provider_id": "gpt", "model_id": "gpt-5-pro"},
    "IMAGE_GENERATION": None,
    "TOOL_USE": None,
    "STRUCTURED_OUTPUT": None,
}


def _ref(provider_id: str, model_id: str) -> str:
    return f"{provider_id}:{model_id}"


def _state(status: str, source: str, evidence: dict | None = None, verified_at: str | None = None) -> dict:
    return {"status": status, "verified": status == "VERIFIED", "source": source, "evidence": evidence or {}, "verified_at": verified_at}


def normalize_capability_vocabulary(values: list | tuple | set | None) -> set[str]:
    """Normalize explicit catalog/registry capability keys to the V1 vocabulary."""
    normalized = set()
    for value in values or []:
        key = str(value).strip().replace("-", "_").replace(" ", "_").upper()
        if key in VISION_CAPABILITY_ALIASES:
            normalized.add("VISION_UNDERSTANDING")
        elif key in CAPABILITIES:
            normalized.add(key)
    return normalized


def _vision_capability_state(model, probe: dict | None) -> dict:
    # A successful runtime probe sets ModelRegistryDB.supports_vision permanently.
    # A later operational failure must not erase that capability evidence: health
    # and capability validity are separate facts.
    if probe and probe.get("status") == "passed" and probe.get("supports_image"):
        return _state("VERIFIED", "REAL_PROBE", probe, probe.get("observed_at"))
    if bool(model.supports_vision):
        return _state(
            "VERIFIED",
            "MODEL_REGISTRY_VERIFIED",
            {"supports_vision": True, "latest_probe": probe or {}},
            probe.get("observed_at") if probe else None,
        )
    if "VISION_UNDERSTANDING" in normalize_capability_vocabulary(model.capability):
        return _state(
            "VERIFIED",
            "MODEL_REGISTRY_CAPABILITY_METADATA",
            {"capability_keys": list(model.capability or [])},
        )
    return _state(
        "BLOCKED" if probe else "UNVERIFIED",
        "REAL_PROBE" if probe else "INFERRED_UNVERIFIED",
        probe,
        probe.get("observed_at") if probe else None,
    )


def _image_probe_results(session) -> dict[str, dict]:
    results = {}
    for state in session.scalars(select(SinoBrainSessionDB)):
        loop = dict((state.discovery or {}).get("autonomous_main_loop") or {})
        for result in (loop.get("model_probe_job") or {}).get("probe_results") or []:
            key = _ref(str(result.get("provider_id")), str(result.get("model_id")))
            results[key] = result
    return results


def get_model_capability_registry() -> dict:
    with SessionLocal() as session:
        providers = {item.provider_key: item for item in session.scalars(select(ModelProviderConfigDB))}
        models = list(session.scalars(select(ModelRegistryDB)))
        configs = {item.capability_key: item for item in session.scalars(select(AICapabilityConfigDB))}
        image_results = _image_probe_results(session)
        from app.core.model_center.runtime_chain import identity, resolve_model_resource_health
        resource_health = {
            identity(model.provider_id, model.model_id): resolve_model_resource_health(session, model.provider_id, model.model_id)
            for model in models
        }
    return build_model_capability_registry(providers, models, configs, image_results, resource_health)


def build_model_capability_registry(providers: dict, models: list, configs: dict, image_results: dict | None = None,
                                    resource_health: dict | None = None) -> dict:
    image_results = image_results or {}
    resource_health = resource_health or {}
    vision = dict(((configs.get("vision_model_routing").configuration if configs.get("vision_model_routing") else {}) or {}).get("model_probes") or {})
    image_verified = dict(((configs.get("image_generation_model_routing").configuration if configs.get("image_generation_model_routing") else {}) or {}).get("model_probes") or {})
    items = []
    for model in models:
        key = _ref(model.provider_id, model.model_id)
        provider = providers.get(model.provider_id)
        resource_key = f"{model.provider_id}::{model.model_id}"
        health = resource_health.get(resource_key) or {}
        healthy = bool(provider and provider.enabled and health.get("health_status") == "healthy")
        vision_probe = vision.get(key)
        image_probe = image_results.get(key)
        image_pass = image_verified.get(key)
        vision_state = _vision_capability_state(model, vision_probe)
        if image_pass and image_pass.get("supports_image_generation"):
            image_state = _state("VERIFIED", "REAL_PROBE", image_pass, image_pass.get("observed_at"))
        elif image_probe:
            evidence = dict(image_probe.get("evidence") or {})
            reason = evidence.get("reason")
            status = "UNVERIFIED" if reason == "configured_model_or_credential_reference_unavailable" else "BLOCKED"
            image_state = _state(status, "REAL_PROBE", {"probe_status": image_probe.get("probe_status"), "reason": reason, "http_status": evidence.get("http_status")}, image_probe.get("timestamp"))
        else:
            image_state = _state("UNVERIFIED", "INFERRED_UNVERIFIED")
        structured_state = _state("VERIFIED", "REAL_PROBE", {"source_probe": "vision_json_response"}, vision_probe.get("observed_at")) if vision_probe and vision_probe.get("status") == "passed" else _state("UNVERIFIED", "INFERRED_UNVERIFIED")
        items.append({
            "provider_id": model.provider_id, "model_id": model.model_id, "display_name": model.display_name,
            "enabled": bool(model.enabled), "selected": bool(model.selected), "healthy": healthy,
            "health_status": health.get("health_status", "unknown"),
            "health_classification": health.get("health_classification", "UNKNOWN"),
            "health_source": health.get("health_source", "none"),
            "last_checked_at": health.get("last_checked_at"),
            "provider_health_status": provider.health_status if provider else None,
            "capabilities": {
                "supports_text_reasoning": _state("UNVERIFIED", "INFERRED_UNVERIFIED"),
                "supports_vision_understanding": vision_state,
                "supports_image_generation": image_state,
                "supports_tool_use": _state("UNVERIFIED", "INFERRED_UNVERIFIED"),
                "supports_structured_output": structured_state,
            },
            "priority": 100 if model.selected else 50, "cost_class": None, "latency_class": None,
            "last_probe_status": image_state["evidence"].get("probe_status") or vision_state["evidence"].get("status"),
        })
    policies = _resolve_policies(items, (configs.get(POLICY_KEY).configuration if configs.get(POLICY_KEY) else {}) or {})
    return {"registry_id": REGISTRY_ID, "version": 1, "capability_keys": list(CAPABILITIES), "models": items, "routing_policies": policies}


def _resolve_policies(models: list[dict], configuration: dict) -> list[dict]:
    policies = []
    by_ref = {_ref(item["provider_id"], item["model_id"]): item for item in models}
    for capability in CAPABILITIES:
        field = "supports_" + capability.lower()
        configured_policy = configuration.get(capability) or {}
        preferred = configured_policy.get("preferred_primary", DEFAULT_PREFERRED[capability])
        preferred_fallback = configured_policy.get("preferred_fallback")
        verified = [item for item in models if item["enabled"] and item["healthy"] and item["capabilities"][field]["verified"]]
        verified.sort(key=lambda item: (-item["priority"], item["provider_id"], item["model_id"]))
        preferred_model = by_ref.get(_ref(preferred["provider_id"], preferred["model_id"])) if preferred else None
        active = preferred_model if preferred_model in verified else (verified[0] if verified else None)
        fallbacks = [item for item in verified if item is not active][:2]
        preferred_fallback_model = by_ref.get(_ref(preferred_fallback["provider_id"], preferred_fallback["model_id"])) if preferred_fallback else None
        configured_fallback = preferred_fallback_model if preferred_fallback_model in verified and preferred_fallback_model is not active else (active if preferred and active is not preferred_model else (fallbacks[0] if fallbacks else None))
        policies.append({
            "capability": capability, "preferred_primary": preferred, "preferred_fallback": preferred_fallback,
            "active_primary": _model_ref(active), "fallbacks": [_model_ref(item) for item in fallbacks],
            "configured_fallback": _model_ref(configured_fallback),
            "status": "ACTIVE" if active else "MISSING",
            "preferred_status": "AUTO" if preferred is None else "ACTIVE" if preferred_model is active else "UNVERIFIED_OR_UNHEALTHY",
        })
    return policies


def _model_ref(model: dict | None) -> dict | None:
    return {key: model[key] for key in ("provider_id", "model_id", "display_name")} if model else None


def save_routing_preferred(capability: str, preferred_primary: dict | None, preferred_fallback: dict | None = None) -> dict:
    if capability not in CAPABILITIES:
        raise ValueError("unsupported_model_capability")
    with SessionLocal() as session:
        record = session.get(AICapabilityConfigDB, POLICY_KEY)
        configuration = dict(record.configuration or {}) if record else {}
        configuration[capability] = {"preferred_primary": preferred_primary, "preferred_fallback": preferred_fallback, "updated_at": datetime.now(timezone.utc).isoformat()}
        if record is None:
            session.add(AICapabilityConfigDB(capability_key=POLICY_KEY, configuration=configuration))
        else:
            record.configuration = configuration
        session.commit()
    return get_model_capability_registry()


def resolve_model_route(capability: str) -> list[dict]:
    registry = get_model_capability_registry()
    policy = next(item for item in registry["routing_policies"] if item["capability"] == capability)
    return [item for item in [policy["active_primary"], *policy["fallbacks"]] if item]
