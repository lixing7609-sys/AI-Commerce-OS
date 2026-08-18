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
    return build_model_capability_registry(providers, models, configs, image_results)


def build_model_capability_registry(providers: dict, models: list, configs: dict, image_results: dict | None = None) -> dict:
    image_results = image_results or {}
    vision = dict(((configs.get("vision_model_routing").configuration if configs.get("vision_model_routing") else {}) or {}).get("model_probes") or {})
    image_verified = dict(((configs.get("image_generation_model_routing").configuration if configs.get("image_generation_model_routing") else {}) or {}).get("model_probes") or {})
    items = []
    for model in models:
        key = _ref(model.provider_id, model.model_id)
        provider = providers.get(model.provider_id)
        healthy = bool(provider and provider.enabled and provider.health_status == "healthy")
        vision_probe = vision.get(key)
        image_probe = image_results.get(key)
        image_pass = image_verified.get(key)
        vision_state = _state("VERIFIED", "REAL_PROBE", vision_probe, vision_probe.get("observed_at")) if vision_probe and vision_probe.get("status") == "passed" else _state("BLOCKED" if vision_probe else "UNVERIFIED", "REAL_PROBE" if vision_probe else "INFERRED_UNVERIFIED", vision_probe)
        if image_pass and image_pass.get("supports_image_generation"):
            image_state = _state("VERIFIED", "REAL_PROBE", image_pass, image_pass.get("observed_at"))
        elif image_probe:
            evidence = dict(image_probe.get("evidence") or {})
            reason = evidence.get("reason")
            status = "UNVERIFIED" if reason == "configured_model_or_credential_reference_unavailable" else "BLOCKED"
            image_state = _state(status, "REAL_PROBE", {"probe_status": image_probe.get("probe_status"), "reason": reason, "http_status": evidence.get("http_status")}, image_probe.get("timestamp"))
        else:
            image_state = _state("UNVERIFIED", "INFERRED_UNVERIFIED")
        structured_state = _state("VERIFIED", "REAL_PROBE", {"source_probe": "vision_json_response"}, vision_probe.get("observed_at")) if vision_state["verified"] else _state("UNVERIFIED", "INFERRED_UNVERIFIED")
        items.append({
            "provider_id": model.provider_id, "model_id": model.model_id, "display_name": model.display_name,
            "enabled": bool(model.enabled), "selected": bool(model.selected), "healthy": healthy,
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
        preferred = (configuration.get(capability) or {}).get("preferred_primary", DEFAULT_PREFERRED[capability])
        verified = [item for item in models if item["enabled"] and item["healthy"] and item["capabilities"][field]["verified"]]
        verified.sort(key=lambda item: (-item["priority"], item["provider_id"], item["model_id"]))
        preferred_model = by_ref.get(_ref(preferred["provider_id"], preferred["model_id"])) if preferred else None
        active = preferred_model if preferred_model in verified else (verified[0] if verified else None)
        fallbacks = [item for item in verified if item is not active][:2]
        configured_fallback = active if preferred and active is not preferred_model else (fallbacks[0] if fallbacks else None)
        policies.append({
            "capability": capability, "preferred_primary": preferred,
            "active_primary": _model_ref(active), "fallbacks": [_model_ref(item) for item in fallbacks],
            "configured_fallback": _model_ref(configured_fallback),
            "status": "ACTIVE" if active else "MISSING",
            "preferred_status": "AUTO" if preferred is None else "ACTIVE" if preferred_model is active else "UNVERIFIED_OR_UNHEALTHY",
        })
    return policies


def _model_ref(model: dict | None) -> dict | None:
    return {key: model[key] for key in ("provider_id", "model_id", "display_name")} if model else None


def save_routing_preferred(capability: str, preferred_primary: dict | None) -> dict:
    if capability not in CAPABILITIES:
        raise ValueError("unsupported_model_capability")
    with SessionLocal() as session:
        record = session.get(AICapabilityConfigDB, POLICY_KEY)
        configuration = dict(record.configuration or {}) if record else {}
        configuration[capability] = {"preferred_primary": preferred_primary, "updated_at": datetime.now(timezone.utc).isoformat()}
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
