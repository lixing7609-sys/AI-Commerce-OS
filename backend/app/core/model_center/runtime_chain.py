"""Single read model for connected models, eligibility, invocation and economics."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import case, func, select

from app.core.model_center.model import AICapabilityConfigDB, ApplicationCapabilityAssignmentDB, ModelInvocationDB, ModelPricingRuleDB, ModelProviderConfigDB, ModelRegistryDB, ModelRoleAssignmentDB
ROLE_CAPABILITY = {
    "vision": "VISION_UNDERSTANDING",
    "VISION_UNDERSTANDING": "VISION_UNDERSTANDING",
}
CONVERSATION_TEXT_CAPABILITIES = {
    "对话", "项目分析", "通用", "快速任务", "深度思考", "方案评审",
    "conversation", "chat", "text", "text reasoning", "text_reasoning",
    "semantic reasoning", "semantic_reasoning", "reasoning", "general", "fast_task",
}
CONSUMER_TYPE_SINO_AI = "SINO_AI"
CONSUMER_TYPE_SYSTEM_EXECUTOR = "SYSTEM_EXECUTOR"
CONSUMER_TYPE_HEALTH_PROBE = "HEALTH_PROBE"
CONSUMER_TYPE_LEGACY_UNKNOWN = "LEGACY_UNKNOWN"
CONSUMER_TYPES = {
    CONSUMER_TYPE_SINO_AI,
    CONSUMER_TYPE_SYSTEM_EXECUTOR,
    CONSUMER_TYPE_HEALTH_PROBE,
    CONSUMER_TYPE_LEGACY_UNKNOWN,
}
CONSUMER_ROLE_SINO_CONVERSATION = "SINO_CONVERSATION"
CONSUMER_ROLE_DISCUSSION = "DISCUSSION"
CONSUMER_ROLE_REASONING = "REASONING"
CONSUMER_ROLE_CLARIFICATION = "CLARIFICATION"
CONSUMER_ROLE_CANDIDATE_DERIVATION = "CANDIDATE_DERIVATION"
CONSUMER_ROLE_VISION = "VISION"
CONSUMER_ROLE_EXECUTION_SUMMARY = "EXECUTION_SUMMARY"
CONSUMER_ROLE_EXECUTION_MODEL = "EXECUTION_MODEL"
CONSUMER_ROLE_CODE_EXECUTION = "CODE_EXECUTION"
CONSUMER_ROLE_VERIFICATION = "VERIFICATION"
CONSUMER_ROLE_MODEL_HEALTH_PROBE = "MODEL_HEALTH_PROBE"
CONSUMER_ROLE_TASK_NAVIGATION = "TASK_NAVIGATION"
CONSUMER_ROLE_LEGACY_UNKNOWN = "LEGACY_UNKNOWN"
CONSUMER_ROLES = {
    CONSUMER_ROLE_SINO_CONVERSATION,
    CONSUMER_ROLE_DISCUSSION,
    CONSUMER_ROLE_REASONING,
    CONSUMER_ROLE_CLARIFICATION,
    CONSUMER_ROLE_CANDIDATE_DERIVATION,
    CONSUMER_ROLE_VISION,
    CONSUMER_ROLE_EXECUTION_SUMMARY,
    CONSUMER_ROLE_EXECUTION_MODEL,
    CONSUMER_ROLE_CODE_EXECUTION,
    CONSUMER_ROLE_VERIFICATION,
    CONSUMER_ROLE_MODEL_HEALTH_PROBE,
    CONSUMER_ROLE_TASK_NAVIGATION,
    CONSUMER_ROLE_LEGACY_UNKNOWN,
}
REFERENCE_CURRENT_SINO = "CURRENT_SINO_REFERENCE"
REFERENCE_CURRENT_SYSTEM = "CURRENT_SYSTEM_REFERENCE"
REFERENCE_CURRENT_BOTH = "CURRENT_BOTH_REFERENCE"
REFERENCE_HISTORICAL = "HISTORICAL_REFERENCE"
REFERENCE_INVALID = "INVALID_REFERENCE"
RESOURCE_KIND_MODEL = "MODEL_RESOURCE"
RESOURCE_KIND_EXECUTOR = "EXECUTION_RESOURCE"


def identity(provider_id: str, model_id: str) -> str:
    return f"{provider_id}::{model_id}"


def canonical_model_resource_identity(provider_id: str | None, model_id: str | None) -> str | None:
    if not provider_id or not model_id:
        return None
    return identity(provider_id, model_id)


def canonical_execution_resource_identity(execution_engine_id: str | None) -> str | None:
    if not execution_engine_id:
        return None
    return f"executor::{execution_engine_id}"


def _normalize_consumer_type(value: str | None) -> str | None:
    return value if value in CONSUMER_TYPES else None


def _normalize_consumer_role(value: str | None) -> str | None:
    return value if value in CONSUMER_ROLES else None


def _infer_consumer_attribution(metadata: dict) -> tuple[str | None, str | None]:
    explicit_type = _normalize_consumer_type(metadata.get("consumer_type"))
    explicit_role = _normalize_consumer_role(metadata.get("consumer_role"))
    if explicit_type or explicit_role:
        return explicit_type, explicit_role

    source = metadata.get("invocation_source")
    purpose = metadata.get("purpose")
    brain_stage = metadata.get("brain_stage")
    assignment_role = metadata.get("runtime_role") or metadata.get("assignment_role")
    if source == "model_health_probe" or assignment_role == "model_health":
        return CONSUMER_TYPE_HEALTH_PROBE, CONSUMER_ROLE_MODEL_HEALTH_PROBE
    if source == "founder_intent" or assignment_role == "founder_intent_engine":
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_CANDIDATE_DERIVATION
    if purpose == "task_candidate_derivation":
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_CANDIDATE_DERIVATION
    if purpose == "meaningful_execution_update":
        return CONSUMER_TYPE_SYSTEM_EXECUTOR, CONSUMER_ROLE_EXECUTION_SUMMARY
    if source in {"council_participant", "council_synthesis"} or assignment_role == "multi_model_discussion":
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_DISCUSSION
    if source == "vision" or assignment_role == "vision":
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_VISION
    if source == "task_navigation":
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_TASK_NAVIGATION
    if source in {"execution_model", "verification"}:
        return CONSUMER_TYPE_SYSTEM_EXECUTOR, CONSUMER_ROLE_VERIFICATION if source == "verification" else CONSUMER_ROLE_EXECUTION_MODEL
    if brain_stage:
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_REASONING
    if source == "founder_conversation" or assignment_role == "sino_conversation":
        return CONSUMER_TYPE_SINO_AI, CONSUMER_ROLE_SINO_CONVERSATION
    return None, None


MODEL_HEALTH_ERRORS = {
    "configuration_error": "CONFIG_ERROR",
    "explicit_model_not_available": "CONFIG_ERROR",
    "authentication_failed": "CONFIG_ERROR",
    "insufficient_quota": "QUOTA_EXCEEDED",
    "rate_limited": "RATE_LIMITED",
    "timeout": "TIMEOUT",
    "provider_unavailable": "UNAVAILABLE",
    "network_error": "PROVIDER_ERROR",
    "invalid_response": "PROVIDER_ERROR",
}

# Availability can change quickly because of quota, rate limits, deployment or
# provider routing.  Fifteen minutes keeps a successful signal useful within one
# working session while preventing yesterday's evidence from appearing current.
MODEL_HEALTH_FRESHNESS_WINDOW = timedelta(minutes=15)


def resolve_model_resource_health(session, provider_id: str, model_id: str) -> dict:
    """Project the latest evidence for one exact Provider/Model resource.

    Provider connectivity is intentionally not model-health evidence.  Runtime and
    explicit model probes share the invocation ledger, so the newest exact-resource
    observation wins without introducing a second health store.
    """
    latest = session.scalar(select(ModelInvocationDB).where(
        ModelInvocationDB.provider_id == provider_id,
        ModelInvocationDB.model_id == model_id,
    ).order_by(ModelInvocationDB.timestamp.desc(), ModelInvocationDB.invocation_id.desc()))
    now = datetime.now(timezone.utc)
    if latest is None:
        return {
            "health_status": "unknown", "availability": "unknown",
            "health_classification": "UNKNOWN", "health_source": "none",
            "last_status": None, "last_error_code": None, "last_error_summary": None,
            "last_checked_at": None, "last_success_at": None, "last_failure_at": None,
            "last_latency_ms": None, "last_token_usage": None,
            "fresh_until": None, "is_stale": True,
        }
    timestamp = latest.timestamp
    if timestamp and timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    fresh_until = timestamp + MODEL_HEALTH_FRESHNESS_WINDOW if timestamp else None
    stale = not fresh_until or fresh_until <= now
    successful = latest.status == "completed"
    healthy = successful and not stale
    classification = "UNKNOWN" if stale else "HEALTHY" if successful else MODEL_HEALTH_ERRORS.get(latest.error_code or "", "PROVIDER_ERROR")
    source = "model_probe" if latest.invocation_source == "model_health_probe" else "invocation"
    return {
        "health_status": "healthy" if healthy else "unknown" if stale else "unhealthy",
        "availability": "available" if healthy else "unknown" if stale else "unavailable",
        "health_classification": classification, "health_source": source,
        "last_status": latest.status, "last_error_code": latest.error_code,
        "last_error_summary": latest.error_code,
        "last_checked_at": timestamp.isoformat() if timestamp else None,
        "last_success_at": timestamp.isoformat() if successful and timestamp else None,
        "last_failure_at": timestamp.isoformat() if not successful and timestamp else None,
        "last_latency_ms": latest.latency_ms,
        "last_token_usage": {"input": latest.input_tokens, "output": latest.output_tokens, "total": latest.total_tokens},
        "fresh_until": fresh_until.isoformat() if fresh_until else None, "is_stale": stale,
    }


def model_runtime_preflight(provider_id: str, model_id: str, session=None) -> dict:
    """Return the bounded preflight action for any runtime role.

    Fresh success avoids a redundant probe. Stale/unknown evidence is verified by
    the intended invocation itself, allowing that response to do useful work.
    Fresh failure is rejected until its short window expires or a forced exact
    model probe supplies newer evidence.
    """
    owns = session is None
    session = session or _session_factory()()
    try:
        health = resolve_model_resource_health(session, provider_id, model_id)
        if health["health_status"] == "healthy":
            action = "ready"
        elif health["health_status"] == "unhealthy":
            action = "reject"
        else:
            action = "verify_on_invoke"
        return {**health, "preflight_action": action}
    finally:
        if owns:
            session.close()


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
                resource_health = resolve_model_resource_health(session, provider.provider_key, model_id)
                result.append({
                    "provider_id": provider.provider_key,
                    "model_id": model_id,
                    "identity": identity(provider.provider_key, model_id),
                    "display_name": model.display_name if model else model_id,
                    "provider_name": provider.display_name,
                    "connected": True,
                    "enabled": True,
                    **resource_health,
                    "provider_health_status": provider.health_status,
                    "provider_health_checked_at": provider.health_checked_at.isoformat() if provider.health_checked_at else None,
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


def _ref_identity(ref: dict | None) -> str | None:
    if not ref:
        return None
    provider = ref.get("provider_key", ref.get("provider_id"))
    model = ref.get("model", ref.get("model_id"))
    return identity(provider, model) if provider and model else None


def _legacy_model_aliases(session) -> dict[str, str]:
    """Single deterministic alias authority.

    This resolver intentionally starts from explicit persisted configuration only.
    It never guesses from display names or near matches, so unresolved historical
    strings such as deepseek-chat remain unresolved unless a future explicit alias
    map is added by an authorized migration/config change.
    """
    record = session.get(AICapabilityConfigDB, "legacy_model_aliases")
    aliases = dict(record.configuration or {}) if record else {}
    return {str(key): str(value) for key, value in aliases.items() if key and value}


def resolve_model_reference_identity(session, ref: dict | None) -> dict:
    provider = (ref or {}).get("provider_key", (ref or {}).get("provider_id"))
    model = (ref or {}).get("model", (ref or {}).get("model_id"))
    raw_identity = identity(provider, model) if provider and model else None
    if not raw_identity:
        return {"stored_identity": raw_identity, "resolved_identity": None, "state": "IDENTITY_UNRESOLVED", "reason": "missing_provider_or_model"}
    connected = {item["identity"] for item in connected_model_registry(session=session)}
    if raw_identity in connected:
        return {"stored_identity": raw_identity, "resolved_identity": raw_identity, "state": "RESOLVED", "reason": None}
    alias = _legacy_model_aliases(session).get(raw_identity) or _legacy_model_aliases(session).get(model or "")
    if alias and alias in connected:
        return {"stored_identity": raw_identity, "resolved_identity": alias, "state": "RESOLVED_BY_ALIAS", "reason": None}
    registry_exists = bool(session.scalar(select(ModelRegistryDB.id).where(
        ModelRegistryDB.provider_id == provider,
        ModelRegistryDB.model_id == model,
    )))
    return {
        "stored_identity": raw_identity,
        "resolved_identity": None,
        "state": "RESOURCE_MISSING" if not registry_exists else "IDENTITY_UNRESOLVED",
        "reason": "resource_missing" if not registry_exists else "not_connected",
    }


def _conversation_authorized_references(session) -> dict[str, list[str]]:
    """Conversation selector authorization comes from Conversation-capable Sino bindings."""
    configs = {item.capability_key: dict(item.configuration or {}) for item in session.scalars(select(AICapabilityConfigDB))}
    references: list[tuple[dict, str]] = []

    def add_pair(primary: dict | None, fallback: dict | None, label: str) -> None:
        primary_key, fallback_key = _ref_identity(primary), _ref_identity(fallback)
        if primary_key and primary_key == fallback_key:
            return
        if primary_key:
            references.append((primary, label))
        if fallback_key:
            references.append((fallback, f"{label} Fallback"))

    conversation = configs.get("sino_conversation") or {}
    add_pair(conversation, next(iter(conversation.get("fallbacks") or []), None), "Sino 主对话")

    from app.core.model_center.service import _discussion_slots
    seen_discussion_primaries: set[str] = set()
    for index, slot in enumerate(_discussion_slots(configs.get("multi_model_discussion")), 1):
        primary_key = _ref_identity(slot.get("primary"))
        if primary_key and primary_key in seen_discussion_primaries:
            continue
        if primary_key:
            seen_discussion_primaries.add(primary_key)
        add_pair(slot.get("primary"), slot.get("fallback"), f"讨论模型 {index}")

    roles: dict[str, list[str]] = {}
    for ref, label in references:
        key = _ref_identity(ref)
        if key:
            resolved = resolve_model_reference_identity(session, ref)
            if resolved["resolved_identity"]:
                roles.setdefault(resolved["resolved_identity"], []).append(label)
    return roles


def has_conversation_capability(model: dict | None) -> bool:
    capabilities = {str(item).strip().casefold() for item in (model or {}).get("capability") or []}
    return bool(capabilities & {item.casefold() for item in CONVERSATION_TEXT_CAPABILITIES})


def conversation_model_eligibility(provider_id: str, model_id: str, *, session=None) -> dict:
    """Single backend authority for Conversation selector and PATCH validation."""
    owns = session is None
    session = session or _session_factory()()
    try:
        key = identity(provider_id, model_id)
        connected = {item["identity"]: item for item in connected_model_registry(session=session)}
        model = connected.get(key)
        roles = _conversation_authorized_references(session).get(key, [])
        checks = {
            "configured": model is not None and model.get("metadata_present") is True,
            "enabled": bool(model and model.get("enabled") and model.get("connected")),
            "fresh_healthy": bool(model and model.get("health_status") == "healthy" and model.get("availability") == "available"),
            "sino_authorized": bool(roles),
            "conversation_capable": has_conversation_capability(model),
            "identity_resolvable": bool(model),
        }
        eligible = all(checks.values())
        reason = None
        if not eligible:
            reason = next((name for name, passed in checks.items() if not passed), "not_eligible")
        return {
            "identity": key,
            "provider_id": provider_id,
            "model_id": model_id,
            "roles": sorted(set(roles), key=_role_sort_key),
            "conversation_eligible": eligible,
            "selectable": eligible,
            "eligibility_reason": reason,
            "eligibility_checks": checks,
            "role_label_authority": False,
            "authorization_source": "sino_conversation_or_multi_model_discussion_assignment",
            **(model or {}),
        }
    finally:
        if owns:
            session.close()


def _role_sort_key(item: str) -> int:
    role_order = {
        label: index for index, label in enumerate([
            "Sino 主对话", "Sino 主对话 Fallback",
            *[label for index in range(1, 6) for label in (f"讨论模型 {index}", f"讨论模型 {index} Fallback")],
        ])
    }
    return role_order.get(item, 999)


def sino_assigned_models(session=None, conversation_id: str | None = None) -> list[dict]:
    """Return authorized healthy Conversation resources plus current selection state."""
    owns = session is None
    session = session or _session_factory()()
    try:
        authorized = _conversation_authorized_references(session)
        rows = []
        for key in authorized:
            provider_id, model_id = key.split("::", 1)
            row = conversation_model_eligibility(provider_id, model_id, session=session)
            if row["conversation_eligible"]:
                rows.append({**row, "assignment_valid": True, "conversation_selected": False})

        selected_key = None
        if conversation_id:
            from app.core.conversation.model import ConversationDB
            conversation = session.get(ConversationDB, conversation_id)
            if conversation and conversation.conversation_model_provider and conversation.conversation_model:
                selected_key = identity(conversation.conversation_model_provider, conversation.conversation_model)
                selected = conversation_model_eligibility(
                    conversation.conversation_model_provider,
                    conversation.conversation_model,
                    session=session,
                )
                if selected_key not in {item["identity"] for item in rows}:
                    rows.append({**selected, "assignment_valid": selected["conversation_eligible"], "conversation_selected": True})

        result = []
        for row in rows:
            result.append({**row, "conversation_selected": row.get("conversation_selected") or row["identity"] == selected_key})
        return sorted(result, key=lambda item: (min((_role_sort_key(role) for role in item.get("roles") or []), default=999), item["display_name"]))
    finally:
        if owns:
            session.close()


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
        consumer_type, consumer_role = _infer_consumer_attribution(metadata)
        session.add(ModelInvocationDB(
            invocation_id=invocation_id, timestamp=now, provider_id=provider_id, model_id=model_id,
            resource_identity=canonical_model_resource_identity(provider_id, model_id),
            consumer_type=consumer_type, consumer_role=consumer_role,
            task_id=metadata.get("task_id"), execution_id=metadata.get("execution_id"),
            execution_resource_identity=metadata.get("execution_resource_identity"),
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


def record_execution_resource_invocation(*, execution_resource_identity: str, status: str,
                                         metadata: dict | None = None, usage=None,
                                         latency_ms: float | None = None,
                                         error_code: str | None = None) -> str:
    metadata = metadata or {}
    now = datetime.now(timezone.utc)
    input_tokens = getattr(usage, "input_tokens", None) if usage is not None else None
    output_tokens = getattr(usage, "output_tokens", None) if usage is not None else None
    total_tokens = getattr(usage, "total_tokens", None) if usage is not None else None
    consumer_type = _normalize_consumer_type(metadata.get("consumer_type")) or CONSUMER_TYPE_SYSTEM_EXECUTOR
    consumer_role = _normalize_consumer_role(metadata.get("consumer_role")) or CONSUMER_ROLE_CODE_EXECUTION
    invocation_id = f"inv-{uuid4().hex[:24]}"
    with _session_factory()() as session:
        session.add(ModelInvocationDB(
            invocation_id=invocation_id, timestamp=now, provider_id=None, model_id=None,
            resource_identity=None, execution_resource_identity=execution_resource_identity,
            consumer_type=consumer_type, consumer_role=consumer_role,
            conversation_id=metadata.get("conversation_id"), task_id=metadata.get("task_id"),
            execution_id=metadata.get("execution_id"), council_id=metadata.get("council_id"),
            council_model_run_id=metadata.get("council_model_run_id"), assignment_role=metadata.get("assignment_role"),
            invocation_source=metadata.get("invocation_source") or "execution_resource",
            runtime_mode=metadata.get("runtime_mode") or "default",
            status=status, error_code=error_code, input_tokens=input_tokens,
            output_tokens=output_tokens, total_tokens=total_tokens, latency_ms=latency_ms,
            pricing_rule_id=None, estimated_cost=None, currency=None,
        ))
        session.commit()
        return invocation_id


def invocation_economics(session=None) -> dict:
    owns = session is None
    session = session or _session_factory()()
    try:
        connected = connected_model_registry(session=session)
        connected_by_key = {item["identity"]: item for item in connected}
        references = _usage_reference_projection(session)
        current_model_keys = set(references["sino"]) | set(references["system"])
        valid_current_model_keys = {key for key in current_model_keys if key in connected_by_key}
        business_invocation_filter = (
            func.coalesce(ModelInvocationDB.consumer_type, "") != CONSUMER_TYPE_HEALTH_PROBE,
            func.coalesce(ModelInvocationDB.consumer_role, "") != CONSUMER_ROLE_MODEL_HEALTH_PROBE,
            func.coalesce(ModelInvocationDB.invocation_source, "") != "model_health_probe",
            func.coalesce(ModelInvocationDB.runtime_mode, "") != "probe",
            func.coalesce(ModelInvocationDB.assignment_role, "") != "model_health",
        )
        invocation_rows = session.execute(select(
            ModelInvocationDB.provider_id, ModelInvocationDB.model_id,
            func.count(ModelInvocationDB.invocation_id),
            func.count(case((ModelInvocationDB.status == "completed", 1))),
            func.sum(ModelInvocationDB.input_tokens), func.sum(ModelInvocationDB.output_tokens), func.sum(ModelInvocationDB.total_tokens),
            func.avg(case((ModelInvocationDB.status == "completed", ModelInvocationDB.latency_ms))),
            func.sum(ModelInvocationDB.estimated_cost), func.count(ModelInvocationDB.total_tokens), func.count(ModelInvocationDB.pricing_rule_id),
        ).where(
            ModelInvocationDB.provider_id.is_not(None),
            ModelInvocationDB.model_id.is_not(None),
            *business_invocation_filter,
        ).group_by(ModelInvocationDB.provider_id, ModelInvocationDB.model_id)).all()
        usage = {identity(row[0], row[1]): row for row in invocation_rows}
        historical_model_keys = set(usage) - valid_current_model_keys
        rows = []
        now = datetime.now(timezone.utc)
        for key in sorted(valid_current_model_keys | historical_model_keys):
            row = usage.get(key)
            connected_model = connected_by_key.get(key)
            provider_id, model_id = key.split("::", 1)
            registry_model = session.scalar(select(ModelRegistryDB).where(
                ModelRegistryDB.provider_id == provider_id,
                ModelRegistryDB.model_id == model_id,
            ))
            provider = session.get(ModelProviderConfigDB, provider_id)
            model = connected_model or {
                "provider_id": provider_id, "model_id": model_id, "identity": key,
                "display_name": registry_model.display_name if registry_model else model_id,
                "provider_name": provider.display_name if provider else provider_id,
                "connected": False, "enabled": bool(registry_model.enabled) if registry_model else False,
                "health_status": "unknown", "availability": "unknown",
                "health_classification": "UNKNOWN", "health_source": "historical",
            }
            rule = _pricing_rule(session, provider_id, model_id, now)
            invocations = int(row[2]) if row else 0
            token_count = int(row[9]) if row else 0
            priced_count = int(row[10]) if row else 0
            if key in references["sino"] and key in references["system"]:
                classification = REFERENCE_CURRENT_BOTH
            elif key in references["sino"]:
                classification = REFERENCE_CURRENT_SINO
            elif key in references["system"]:
                classification = REFERENCE_CURRENT_SYSTEM
            else:
                classification = REFERENCE_HISTORICAL
            roles = [*references["sino"].get(key, []), *references["system"].get(key, [])]
            rows.append({**model, "resource_kind": RESOURCE_KIND_MODEL, "reference_classification": classification,
                "roles": list(dict.fromkeys(roles)), "request_count": invocations,
                "completed_request_count": int(row[3]) if row else 0,
                "input_tokens": int(row[4]) if row and row[4] is not None else None,
                "output_tokens": int(row[5]) if row and row[5] is not None else None,
                "total_tokens": int(row[6]) if row and row[6] is not None else None,
                "average_latency_ms": round(float(row[7]), 1) if row and row[7] is not None else None,
                "cost": float(row[8]) if row and row[8] is not None else None,
                "telemetry_status": "recorded" if row else "enabled_no_records",
                "token_status": "recorded" if token_count else "unavailable" if row else "enabled_no_records",
                "pricing_status": "recorded" if priced_count else "token_unavailable" if row and rule else "configured_no_usage" if rule else "not_configured",
                "pricing_rule_id": rule.id if rule else None,
                "pricing_source": rule.pricing_source if rule else None,
                "currency": rule.currency if rule else None})
        executor_usage_rows = session.execute(select(
            ModelInvocationDB.execution_resource_identity,
            func.count(ModelInvocationDB.invocation_id),
            func.count(case((ModelInvocationDB.status == "completed", 1))),
            func.sum(ModelInvocationDB.input_tokens), func.sum(ModelInvocationDB.output_tokens), func.sum(ModelInvocationDB.total_tokens),
            func.avg(case((ModelInvocationDB.status == "completed", ModelInvocationDB.latency_ms))),
            func.sum(ModelInvocationDB.estimated_cost), func.count(ModelInvocationDB.total_tokens), func.count(ModelInvocationDB.pricing_rule_id),
        ).where(
            ModelInvocationDB.execution_resource_identity.is_not(None),
            *business_invocation_filter,
        ).group_by(ModelInvocationDB.execution_resource_identity)).all()
        executor_usage = {row[0]: row for row in executor_usage_rows}
        current_executor_keys = set(references["executors"])
        for key in sorted(current_executor_keys | set(executor_usage)):
            row = executor_usage.get(key)
            rows.append({
                "identity": key, "resource_kind": RESOURCE_KIND_EXECUTOR,
                "execution_resource_identity": key, "provider_id": None, "model_id": None,
                "display_name": references["executors"].get(key, [key])[0].replace("System · ", ""),
                "provider_name": "System / Executor",
                "connected": key in current_executor_keys, "enabled": key in current_executor_keys,
                "health_status": "healthy" if key in current_executor_keys else "unknown",
                "availability": "available" if key in current_executor_keys else "unknown",
                "health_classification": "HEALTHY" if key in current_executor_keys else "UNKNOWN",
                "health_source": "execution_resource_registry" if key in current_executor_keys else "historical",
                "reference_classification": REFERENCE_CURRENT_SYSTEM if key in current_executor_keys else REFERENCE_HISTORICAL,
                "roles": references["executors"].get(key, []),
                "request_count": int(row[1]) if row else 0,
                "completed_request_count": int(row[2]) if row else 0,
                "input_tokens": int(row[3]) if row and row[3] is not None else None,
                "output_tokens": int(row[4]) if row and row[4] is not None else None,
                "total_tokens": int(row[5]) if row and row[5] is not None else None,
                "average_latency_ms": round(float(row[6]), 1) if row and row[6] is not None else None,
                "cost": float(row[7]) if row and row[7] is not None else None,
                "telemetry_status": "recorded" if row else "enabled_no_records",
                "token_status": "recorded" if row and int(row[8]) else "unavailable" if row else "enabled_no_records",
                "pricing_status": "recorded" if row and int(row[9]) else "not_configured",
                "pricing_rule_id": None, "pricing_source": None, "currency": None,
            })
        orphan_items = [
            {"provider_id": key.split("::", 1)[0], "model_id": key.split("::", 1)[1], "roles": value["roles"],
             "reason": value["reason"], "state": value["state"], "reference_classification": REFERENCE_INVALID}
            for key, value in references["invalid"].items()
        ]
        total = len(rows)
        coverage = {
            "invocation": {"covered": sum(item["telemetry_status"] == "recorded" for item in rows), "total": total},
            "token": {"covered": sum(item["token_status"] == "recorded" for item in rows), "total": total},
            "pricing": {"covered": sum(item["pricing_status"] in {"recorded", "configured", "token_unavailable"} for item in rows), "total": total},
        }
        return {"telemetry_status": "enabled", "connected_model_count": len(connected),
                "valid_assigned_model_count": len(valid_current_model_keys),
                "current_resource_count": len([item for item in rows if item["reference_classification"] in {REFERENCE_CURRENT_SINO, REFERENCE_CURRENT_SYSTEM, REFERENCE_CURRENT_BOTH}]),
                "orphan_reference_count": len(orphan_items), "telemetry_coverage": coverage, "models": rows, "orphan_references": orphan_items}
    finally:
        if owns:
            session.close()


def _assignment_references(session) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    projection = _usage_reference_projection(session)
    valid = {**projection["sino"], **projection["system"]}
    invalid = {key: value["roles"] for key, value in projection["invalid"].items()}
    return valid, invalid


def _usage_reference_projection(session) -> dict[str, dict]:
    sino: dict[str, list[str]] = {}
    system: dict[str, list[str]] = {}
    executors: dict[str, list[str]] = {}
    invalid: dict[str, dict] = {}
    labels = {
        "sino_conversation": "Sino 主对话",
        "deep_thinking": "深度推理",
        "goal_reasoning": "目标推理",
        "project_analysis": "项目分析",
        "solution_review": "方案评审",
        "system_builder": "系统构建",
        "code_execution": "System · Execution Model",
    }

    def add_model(ref, label: str, target: dict[str, list[str]]) -> None:
        resolved = resolve_model_reference_identity(session, ref)
        stored = resolved["stored_identity"]
        if resolved["resolved_identity"]:
            target.setdefault(resolved["resolved_identity"], []).append(label)
        elif stored:
            entry = invalid.setdefault(stored, {"roles": [], "reason": resolved["reason"], "state": resolved["state"]})
            entry["roles"].append(label)

    def add_executor(engine_id: str | None, label: str) -> None:
        key = canonical_execution_resource_identity(engine_id)
        if key:
            executors.setdefault(key, []).append(label)

    configs = {item.capability_key: dict(item.configuration or {}) for item in session.scalars(select(AICapabilityConfigDB))}
    for capability, label in labels.items():
        data = configs.get(capability) or {}
        if capability == "code_execution":
            add_model(data, label, system)
            add_executor(data.get("execution_engine_id", "codex"), "System · Codex")
        elif data:
            add_model(data, label, sino)
            for fallback in data.get("fallbacks") or []:
                add_model(fallback, f"{label} Fallback", sino)
    from app.core.model_center.service import _discussion_slots
    for index, slot in enumerate(_discussion_slots(configs.get("multi_model_discussion")), 1):
        add_model(slot.get("primary"), f"讨论模型 {index}", sino)
        add_model(slot.get("fallback"), f"讨论模型 {index} Fallback", sino)
    vision = (configs.get("model_routing_policy_v1") or {}).get("VISION_UNDERSTANDING") or {}
    add_model(vision.get("preferred_primary") or vision.get("active_primary"), "Vision", sino)
    add_model(vision.get("preferred_fallback"), "Vision Fallback", sino)
    return {
        "sino": {key: list(dict.fromkeys(value)) for key, value in sino.items()},
        "system": {key: list(dict.fromkeys(value)) for key, value in system.items()},
        "executors": {key: list(dict.fromkeys(value)) for key, value in executors.items()},
        "invalid": {key: {**value, "roles": list(dict.fromkeys(value["roles"]))} for key, value in invalid.items()},
    }


def _legacy_assignment_references(session) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
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
