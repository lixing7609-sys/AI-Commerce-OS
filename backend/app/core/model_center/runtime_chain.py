"""Single read model for connected models, eligibility, invocation and economics."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import case, func, select

from app.core.model_center.model import AICapabilityConfigDB, ApplicationCapabilityAssignmentDB, ModelInvocationDB, ModelPricingRuleDB, ModelProviderConfigDB, ModelRegistryDB, ModelRoleAssignmentDB
ROLE_CAPABILITY = {
    "vision": "VISION_UNDERSTANDING",
    "VISION_UNDERSTANDING": "VISION_UNDERSTANDING",
}


def identity(provider_id: str, model_id: str) -> str:
    return f"{provider_id}::{model_id}"


def _session_factory():
    # Model Center tests and embedded runtimes replace this factory explicitly.
    from app.core.model_center import service
    return service.SessionLocal


def connected_model_registry(session=None) -> list[dict]:
    """Connected is derived only from enabled Provider selected_models."""
    owns = session is None
    session = session or _session_factory()()
    try:
        providers = list(session.scalars(select(ModelProviderConfigDB)))
        registry = {(m.provider_id, m.model_id): m for m in session.scalars(select(ModelRegistryDB))}
        result = []
        for provider in providers:
            if not provider.enabled:
                continue
            catalog = {
                str(item.get("model_id") or item.get("id") or item.get("name")) if isinstance(item, dict) else str(item): item
                for item in provider.available_models or []
            }
            for model_id in provider.selected_models or []:
                model = registry.get((provider.provider_key, model_id))
                result.append({
                    "provider_id": provider.provider_key,
                    "model_id": model_id,
                    "identity": identity(provider.provider_key, model_id),
                    "display_name": model.display_name if model else model_id,
                    "provider_name": provider.display_name,
                    "connected": True,
                    "enabled": True,
                    "health_status": "healthy" if provider.health_status == "healthy" else "unhealthy" if provider.health_status == "unhealthy" else "unknown",
                    "availability": "available" if provider.health_status == "healthy" else "unavailable" if provider.health_status == "unhealthy" else "unknown",
                    "capability": list(model.capability or []) if model else [],
                    "supports_reasoning": bool(model and model.supports_reasoning),
                    "supports_vision": bool(model and model.supports_vision),
                    "supports_image": bool(model and model.supports_vision),
                    "vision_capability_source": "MODEL_REGISTRY_VERIFIED" if model and model.supports_vision else "UNVERIFIED",
                    "supports_tools": bool(model and model.supports_tools),
                    "selected": True,
                    "metadata_present": model is not None,
                    "catalog_present": model_id in catalog,
                })
        return result
    finally:
        if owns:
            session.close()


def eligible_models(role: str | None = None, capability: str | None = None, *, include_unhealthy: bool = True, session=None) -> list[dict]:
    """The only candidate query used by Settings and Conversation UI."""
    required = capability or ROLE_CAPABILITY.get(role or "")
    models = connected_model_registry(session=session)
    result = []
    for model in models:
        eligible = True
        reason = None
        if required == "VISION_UNDERSTANDING" and not model["supports_vision"]:
            eligible, reason = False, "capability_not_verified"
        if not include_unhealthy and model["health_status"] != "healthy":
            eligible, reason = False, "model_unhealthy"
        if eligible:
            result.append({**model, "eligible": True, "eligibility_reason": reason, "required_capability": required})
    return result


def reconcile_model_registry() -> int:
    """Explicit reconciliation; read APIs must never call this function."""
    from app.core.model_center.service import _sync_model_registry
    with _session_factory()() as session:
        providers = list(session.scalars(select(ModelProviderConfigDB)))
        for provider in providers:
            _sync_model_registry(session, provider, provider.available_models or [])
        session.commit()
        return len(providers)


def _pricing_rule(session, provider_id: str, model_id: str, at: datetime):
    return session.scalar(select(ModelPricingRuleDB).where(
        ModelPricingRuleDB.provider_id == provider_id,
        ModelPricingRuleDB.model_id == model_id,
        ModelPricingRuleDB.pricing_status == "active",
        ModelPricingRuleDB.effective_from <= at,
    ).order_by(ModelPricingRuleDB.effective_from.desc()))


def save_pricing_rule(*, provider_id: str, model_id: str, effective_from: datetime,
                      input_price_per_1m_tokens: Decimal, output_price_per_1m_tokens: Decimal,
                      currency: str, pricing_source: str, pricing_status: str = "active") -> dict:
    if identity(provider_id, model_id) not in {item["identity"] for item in connected_model_registry()}:
        raise ValueError("model_not_connected")
    with _session_factory()() as session:
        row = ModelPricingRuleDB(
            provider_id=provider_id, model_id=model_id, effective_from=effective_from,
            input_price_per_1m_tokens=input_price_per_1m_tokens,
            output_price_per_1m_tokens=output_price_per_1m_tokens,
            currency=currency.upper(), pricing_source=pricing_source, pricing_status=pricing_status,
        )
        session.add(row); session.commit(); session.refresh(row)
        return {"pricing_rule_id": row.id, "provider_id": row.provider_id, "model_id": row.model_id,
                "effective_from": row.effective_from, "input_price_per_1m_tokens": float(row.input_price_per_1m_tokens),
                "output_price_per_1m_tokens": float(row.output_price_per_1m_tokens), "currency": row.currency,
                "pricing_source": row.pricing_source, "pricing_status": row.pricing_status}


def record_model_invocation(*, provider_id: str, model_id: str, status: str, metadata: dict | None = None,
                            usage=None, latency_ms: float | None = None, error_code: str | None = None,
                            fallback_from: dict | None = None) -> str:
    metadata = metadata or {}
    now = datetime.now(timezone.utc)
    with _session_factory()() as session:
        rule = _pricing_rule(session, provider_id, model_id, now)
        input_tokens = getattr(usage, "input_tokens", None) if usage is not None else None
        output_tokens = getattr(usage, "output_tokens", None) if usage is not None else None
        total_tokens = getattr(usage, "total_tokens", None) if usage is not None else None
        cost = None
        if rule and input_tokens is not None and output_tokens is not None:
            cost = (Decimal(input_tokens) * Decimal(rule.input_price_per_1m_tokens) + Decimal(output_tokens) * Decimal(rule.output_price_per_1m_tokens)) / Decimal(1_000_000)
        invocation_id = f"inv-{uuid4().hex[:24]}"
        session.add(ModelInvocationDB(
            invocation_id=invocation_id, timestamp=now, provider_id=provider_id, model_id=model_id,
            conversation_id=metadata.get("conversation_id"), council_id=metadata.get("council_id"),
            council_model_run_id=metadata.get("council_model_run_id"), assignment_role=metadata.get("runtime_role") or metadata.get("assignment_role"),
            invocation_source=metadata.get("invocation_source") or "runtime", runtime_mode="fallback" if fallback_from else metadata.get("runtime_mode") or "default",
            fallback_from_provider=(fallback_from or {}).get("provider"), fallback_from_model=(fallback_from or {}).get("model"),
            status=status, error_code=error_code, input_tokens=input_tokens, output_tokens=output_tokens,
            total_tokens=total_tokens, latency_ms=latency_ms, pricing_rule_id=rule.id if rule else None,
            estimated_cost=cost, currency=rule.currency if rule else None,
        ))
        session.commit()
        return invocation_id


def invocation_economics(session=None) -> dict:
    owns = session is None
    session = session or _session_factory()()
    try:
        connected = connected_model_registry(session=session)
        connected_by_key = {item["identity"]: item for item in connected}
        assignments, orphans = _assignment_references(session)
        valid_keys = {key for key in assignments if key in connected_by_key}
        invocation_rows = session.execute(select(
            ModelInvocationDB.provider_id, ModelInvocationDB.model_id,
            func.count(ModelInvocationDB.invocation_id),
            func.count(case((ModelInvocationDB.status == "completed", 1))),
            func.sum(ModelInvocationDB.input_tokens), func.sum(ModelInvocationDB.output_tokens), func.sum(ModelInvocationDB.total_tokens),
            func.avg(case((ModelInvocationDB.status == "completed", ModelInvocationDB.latency_ms))),
            func.sum(ModelInvocationDB.estimated_cost), func.count(ModelInvocationDB.total_tokens), func.count(ModelInvocationDB.pricing_rule_id),
        ).group_by(ModelInvocationDB.provider_id, ModelInvocationDB.model_id)).all()
        usage = {identity(row[0], row[1]): row for row in invocation_rows}
        rows = []
        now = datetime.now(timezone.utc)
        for key in sorted(valid_keys):
            model = connected_by_key[key]; row = usage.get(key)
            rule = _pricing_rule(session, model["provider_id"], model["model_id"], now)
            invocations = int(row[2]) if row else 0
            token_count = int(row[9]) if row else 0
            priced_count = int(row[10]) if row else 0
            rows.append({**model, "roles": assignments[key], "request_count": invocations,
                "completed_request_count": int(row[3]) if row else 0,
                "input_tokens": int(row[4]) if row and row[4] is not None else None,
                "output_tokens": int(row[5]) if row and row[5] is not None else None,
                "total_tokens": int(row[6]) if row and row[6] is not None else None,
                "average_latency_ms": round(float(row[7]), 1) if row and row[7] is not None else None,
                "cost": float(row[8]) if row and row[8] is not None else 0.0 if not row and rule else None,
                "telemetry_status": "recorded" if row else "enabled_no_records",
                "token_status": "recorded" if token_count else "unavailable" if row else "enabled_no_records",
                "pricing_status": "recorded" if priced_count else "token_unavailable" if row and rule else "configured" if rule else "not_configured"})
        orphan_items = [{"provider_id": key.split("::", 1)[0], "model_id": key.split("::", 1)[1], "roles": roles, "reason": "not_connected"} for key, roles in orphans.items()]
        total = len(rows)
        coverage = {
            "invocation": {"covered": sum(item["telemetry_status"] == "recorded" for item in rows), "total": total},
            "token": {"covered": sum(item["token_status"] == "recorded" for item in rows), "total": total},
            "pricing": {"covered": sum(item["pricing_status"] in {"recorded", "configured", "token_unavailable"} for item in rows), "total": total},
        }
        return {"telemetry_status": "enabled", "connected_model_count": len(connected), "valid_assigned_model_count": len(rows),
                "orphan_reference_count": len(orphan_items), "telemetry_coverage": coverage, "models": rows, "orphan_references": orphan_items}
    finally:
        if owns:
            session.close()


def _assignment_references(session) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    refs: dict[str, list[str]] = {}
    labels = {"sino_conversation": "Sino 主对话", "deep_thinking": "深度推理", "code_execution": "Coding"}
    legacy_roles = {"reasoner": "sino_conversation", "architect": "system_builder", "reviewer": "project_analysis", "executor": "code_execution"}
    def add(ref, label):
        if not ref: return
        provider = ref.get("provider_key", ref.get("provider_id")); model = ref.get("model", ref.get("model_id"))
        if provider and model: refs.setdefault(identity(provider, model), []).append(label)
    capability_configs = list(session.scalars(select(AICapabilityConfigDB)))
    configured_capabilities = {config.capability_key for config in capability_configs}
    for config in capability_configs:
        data = dict(config.configuration or {})
        if config.capability_key in labels:
            add(data, labels[config.capability_key])
            for fallback in data.get("fallbacks") or []: add(fallback, f"{labels[config.capability_key]} Fallback")
        elif config.capability_key == "multi_model_discussion":
            from app.core.model_center.service import _discussion_slots
            for index, slot in enumerate(_discussion_slots(data), 1):
                add(slot.get("primary"), f"讨论模型 {index}"); add(slot.get("fallback"), f"讨论模型 {index} Fallback")
        elif config.capability_key == "model_routing_policy_v1":
            vision = data.get("VISION_UNDERSTANDING") or {}
            add(vision.get("preferred_primary") or vision.get("active_primary"), "Vision")
            add(vision.get("preferred_fallback"), "Vision Fallback")
    for assignment in session.scalars(select(ApplicationCapabilityAssignmentDB)):
        add({"provider_key": assignment.provider_key, "model": assignment.model}, f"{assignment.application_key} · {labels.get(assignment.capability_key, assignment.capability_key)}")
    providers = {row.provider_key: row for row in session.scalars(select(ModelProviderConfigDB))}
    for assignment in session.scalars(select(ModelRoleAssignmentDB)):
        capability = legacy_roles.get(assignment.role_key, assignment.role_key)
        if capability in configured_capabilities:
            continue
        provider = providers.get(assignment.provider_key)
        if provider:
            add({"provider_key": provider.provider_key, "model": provider.model}, labels.get(capability, capability))
    from app.core.conversation.model import ConversationDB
    for conversation in session.scalars(select(ConversationDB).where(
        ConversationDB.conversation_model_provider.is_not(None),
        ConversationDB.conversation_model.is_not(None),
        ConversationDB.lifecycle_status == "active",
    )):
        add({"provider_key": conversation.conversation_model_provider, "model": conversation.conversation_model}, f"Conversation Override · {conversation.id}")
    connected = {item["identity"] for item in connected_model_registry(session=session)}
    valid = {key: list(dict.fromkeys(value)) for key, value in refs.items() if key in connected}
    orphan = {key: list(dict.fromkeys(value)) for key, value in refs.items() if key not in connected}
    return valid, orphan
