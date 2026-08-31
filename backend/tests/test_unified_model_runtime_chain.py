from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.model_center.service as model_center
from app.core.model_center.model import ModelPricingRuleDB
from app.core.model_center.runtime_chain import MODEL_HEALTH_FRESHNESS_WINDOW, connected_model_registry, conversation_model_eligibility, eligible_models, invocation_economics, model_runtime_preflight, record_model_invocation, resolve_model_resource_health, sino_assigned_models
from app.llm.models import LLMUsage


def _database(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(model_center, "SessionLocal", factory)
    return engine, factory


def _provider(*, selected=None, enabled=True, health="healthy"):
    return model_center.ModelProviderConfigDB(
        provider_key="provider-a", provider_type="openai", display_name="Provider A",
        base_url="https://provider.test/v1", model="chat-a", available_models=[
            {"model_id": "chat-a", "display_name": "Chat A"},
            {"model_id": "vision-a", "display_name": "Vision A"},
            {"model_id": "catalog-only", "display_name": "Catalog Only"},
        ], selected_models=selected if selected is not None else ["chat-a", "vision-a"],
        encrypted_api_key="encrypted", enabled=enabled, health_status=health,
    )


def test_connected_registry_is_strictly_enabled_selected_models(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider())
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A", selected=False),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="vision-a", display_name="Vision A", selected=False, supports_vision=True),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="catalog-only", display_name="Catalog Only", selected=True),
        ])
        session.commit()
    rows = connected_model_registry()
    assert {row["model_id"] for row in rows} == {"chat-a", "vision-a"}
    assert all(row["connected"] for row in rows)

    with factory() as session:
        session.get(model_center.ModelProviderConfigDB, "provider-a").enabled = False
        session.commit()
    assert connected_model_registry() == []


def test_resource_health_is_per_model_and_latest_evidence_wins(monkeypatch):
    _, factory = _database(monkeypatch)
    now = datetime.now(timezone.utc)
    with factory() as session:
        session.add(_provider())
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A"),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="vision-a", display_name="Vision A"),
            model_center.ModelInvocationDB(invocation_id="old-success", timestamp=now - timedelta(minutes=2), provider_id="provider-a", model_id="chat-a", status="completed", invocation_source="runtime", runtime_mode="default"),
            model_center.ModelInvocationDB(invocation_id="new-failure", timestamp=now - timedelta(minutes=1), provider_id="provider-a", model_id="chat-a", status="failed", error_code="insufficient_quota", invocation_source="founder_conversation", runtime_mode="override"),
            model_center.ModelInvocationDB(invocation_id="vision-success", timestamp=now - timedelta(minutes=1), provider_id="provider-a", model_id="vision-a", status="completed", invocation_source="runtime", runtime_mode="default"),
        ])
        session.commit()
    rows = {row["model_id"]: row for row in connected_model_registry()}
    assert rows["chat-a"]["health_status"] == "unhealthy"
    assert rows["chat-a"]["health_classification"] == "QUOTA_EXCEEDED"
    assert rows["vision-a"]["health_status"] == "healthy"
    assert rows["chat-a"]["provider_health_status"] == rows["vision-a"]["provider_health_status"] == "healthy"


def test_stale_success_is_unknown_and_verify_on_invoke(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["chat-a"]))
        session.add(model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A"))
        session.add(model_center.ModelInvocationDB(
            invocation_id="stale", timestamp=datetime.now(timezone.utc) - MODEL_HEALTH_FRESHNESS_WINDOW - timedelta(seconds=1),
            provider_id="provider-a", model_id="chat-a", status="completed", invocation_source="runtime", runtime_mode="default",
        ))
        session.commit()
        health = resolve_model_resource_health(session, "provider-a", "chat-a")
    assert health["health_status"] == "unknown"
    assert health["is_stale"] is True
    assert model_runtime_preflight("provider-a", "chat-a")["preflight_action"] == "verify_on_invoke"


def test_fresh_success_avoids_probe_and_fresh_failure_rejects(monkeypatch):
    _, factory = _database(monkeypatch)
    now = datetime.now(timezone.utc)
    with factory() as session:
        session.add(_provider())
        session.add_all([
            model_center.ModelInvocationDB(invocation_id="chat-ok", timestamp=now, provider_id="provider-a", model_id="chat-a", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
            model_center.ModelInvocationDB(invocation_id="vision-bad", timestamp=now, provider_id="provider-a", model_id="vision-a", status="failed", error_code="rate_limited", invocation_source="runtime", runtime_mode="default"),
        ])
        session.commit()
    assert model_runtime_preflight("provider-a", "chat-a")["preflight_action"] == "ready"
    assert model_runtime_preflight("provider-a", "vision-a")["preflight_action"] == "reject"


def test_unified_eligibility_uses_connected_registry_and_verified_capability(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider())
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A", supports_vision=False),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="vision-a", display_name="Vision A", supports_vision=True),
        ])
        session.commit()
    assert {row["model_id"] for row in eligible_models(role="sino_conversation")} == {"chat-a", "vision-a"}
    assert [row["model_id"] for row in eligible_models(role="vision")] == ["vision-a"]


def test_sino_assigned_models_returns_only_valid_healthy_assignments_and_deduplicates(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["chat-a", "vision-a", "catalog-only"]))
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A", capability=["对话"]),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="vision-a", display_name="Vision A", supports_vision=True, capability=["对话", "视觉"]),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="catalog-only", display_name="Catalog Only", capability=["对话"]),
            model_center.AICapabilityConfigDB(capability_key="sino_conversation", configuration={"provider_key": "provider-a", "model": "chat-a", "fallbacks": [{"provider_key": "provider-a", "model": "vision-a"}]}),
            model_center.AICapabilityConfigDB(capability_key="deep_thinking", configuration={"provider_key": "provider-a", "model": "chat-a", "fallbacks": []}),
            model_center.AICapabilityConfigDB(capability_key="code_execution", configuration={"provider_key": "removed", "model": "removed-model", "fallbacks": []}),
            model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"slots": [
                {"primary": {"provider_key": "provider-a", "model": "chat-a"}, "fallback": None},
                {"primary": {"provider_key": "removed", "model": "deepseek-chat"}, "fallback": None},
            ]}),
            model_center.ModelInvocationDB(invocation_id="chat-health", timestamp=datetime.now(timezone.utc), provider_id="provider-a", model_id="chat-a", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
            model_center.ModelInvocationDB(invocation_id="vision-health", timestamp=datetime.now(timezone.utc), provider_id="provider-a", model_id="vision-a", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
            model_center.ModelInvocationDB(invocation_id="catalog-health", timestamp=datetime.now(timezone.utc), provider_id="provider-a", model_id="catalog-only", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
        ])
        session.commit()
    rows = sino_assigned_models()
    assert [row["identity"] for row in rows] == ["provider-a::chat-a", "provider-a::vision-a"]
    assert rows[0]["roles"] == ["Sino 主对话", "讨论模型 1"]
    assert rows[1]["roles"] == ["Sino 主对话 Fallback"]
    assert all(row["assignment_valid"] and row["health_status"] == "healthy" for row in rows)

    with factory() as session:
        session.get(model_center.AICapabilityConfigDB, "deep_thinking").configuration = {"provider_key": "provider-a", "model": "catalog-only", "fallbacks": []}
        session.commit()
    assert "provider-a::catalog-only" not in {row["identity"] for row in sino_assigned_models()}
    with factory() as session:
        session.get(model_center.AICapabilityConfigDB, "deep_thinking").configuration = {}
        session.get(model_center.AICapabilityConfigDB, "multi_model_discussion").configuration = {"slots": [
            {"primary": {"provider_key": "provider-a", "model": "catalog-only"}, "fallback": None},
        ]}
        session.commit()
    assert "provider-a::catalog-only" in {row["identity"] for row in sino_assigned_models()}

    with factory() as session:
        session.get(model_center.ModelInvocationDB, "catalog-health").timestamp = datetime.now(timezone.utc) - MODEL_HEALTH_FRESHNESS_WINDOW - timedelta(seconds=1)
        session.commit()
    assert "provider-a::catalog-only" not in {row["identity"] for row in sino_assigned_models()}


def test_conversation_eligibility_is_capability_health_and_authorization_driven(monkeypatch):
    _, factory = _database(monkeypatch)
    now = datetime.now(timezone.utc)
    with factory() as session:
        session.add(_provider(selected=["chat-a", "vision-a", "code-a", "unauthorized-a", "same"]))
        session.add(model_center.ModelProviderConfigDB(
            provider_key="provider-b", provider_type="openai", display_name="Provider B",
            base_url="https://provider-b.test/v1", model="same", available_models=[{"model_id": "same"}],
            selected_models=["same"], encrypted_api_key="encrypted", enabled=True, health_status="healthy",
        ))
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A", capability=["对话"]),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="vision-a", display_name="Vision A", capability=["视觉"], supports_vision=True),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="code-a", display_name="Code A", capability=["coding"]),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="unauthorized-a", display_name="Unauthorized A", capability=["对话"]),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="same", display_name="Same A", capability=["通用"]),
            model_center.ModelRegistryDB(provider_id="provider-b", model_id="same", display_name="Same B", capability=["通用"]),
            model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"slots": [
                {"primary": {"provider_key": "provider-a", "model": "chat-a"}, "fallback": None},
                {"primary": {"provider_key": "provider-a", "model": "vision-a"}, "fallback": None},
                {"primary": {"provider_key": "provider-a", "model": "code-a"}, "fallback": None},
                {"primary": {"provider_key": "provider-a", "model": "same"}, "fallback": {"provider_key": "provider-b", "model": "same"}},
                {"primary": {"provider_key": "provider-a", "model": "chat-a"}, "fallback": None},
            ]}),
        ])
        for provider, model in [
            ("provider-a", "chat-a"), ("provider-a", "vision-a"), ("provider-a", "code-a"),
            ("provider-a", "unauthorized-a"), ("provider-a", "same"), ("provider-b", "same"),
        ]:
            session.add(model_center.ModelInvocationDB(
                invocation_id=f"health-{provider}-{model}", timestamp=now,
                provider_id=provider, model_id=model, status="completed",
                invocation_source="model_health_probe", runtime_mode="probe",
            ))
        session.commit()

    rows = {row["identity"]: row for row in sino_assigned_models()}
    assert set(rows) == {"provider-a::chat-a", "provider-a::same", "provider-b::same"}
    assert rows["provider-a::chat-a"]["roles"] == ["讨论模型 1"]
    assert conversation_model_eligibility("provider-a", "vision-a")["eligibility_reason"] == "conversation_capable"
    assert conversation_model_eligibility("provider-a", "code-a")["eligibility_reason"] == "conversation_capable"
    assert conversation_model_eligibility("provider-a", "unauthorized-a")["eligibility_reason"] == "sino_authorized"
    assert conversation_model_eligibility("provider-a", "chat-a")["role_label_authority"] is False


def test_selected_unavailable_model_is_projected_without_becoming_selectable(monkeypatch):
    _, factory = _database(monkeypatch)
    now = datetime.now(timezone.utc)
    from app.core.conversation.model import ConversationDB
    with factory() as session:
        session.add(_provider(selected=["chat-a", "vision-a"]))
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A", capability=["对话"]),
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="vision-a", display_name="Vision A", capability=["对话"]),
            model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"slots": [
                {"primary": {"provider_key": "provider-a", "model": "chat-a"}, "fallback": None},
            ]}),
            model_center.ModelInvocationDB(invocation_id="chat-failed", timestamp=now, provider_id="provider-a", model_id="chat-a", status="failed", error_code="insufficient_quota", invocation_source="runtime", runtime_mode="default"),
            model_center.ModelInvocationDB(invocation_id="vision-ok", timestamp=now, provider_id="provider-a", model_id="vision-a", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
            ConversationDB(id="conv-selected", system_id="founder_ai", title="Selected", conversation_model_provider="provider-a", conversation_model="chat-a"),
        ])
        session.commit()
    rows = {row["identity"]: row for row in sino_assigned_models(conversation_id="conv-selected")}
    assert rows["provider-a::chat-a"]["conversation_selected"] is True
    assert rows["provider-a::chat-a"]["conversation_eligible"] is False
    assert rows["provider-a::chat-a"]["selectable"] is False
    assert "provider-a::vision-a" not in rows

    with factory() as session:
        session.get(model_center.ModelInvocationDB, "chat-failed").timestamp = now - timedelta(minutes=2)
        session.add(model_center.ModelInvocationDB(invocation_id="chat-ok", timestamp=now, provider_id="provider-a", model_id="chat-a", status="completed", invocation_source="model_health_probe", runtime_mode="probe"))
        session.commit()
    rows = {row["identity"]: row for row in sino_assigned_models(conversation_id="conv-selected")}
    assert rows["provider-a::chat-a"]["conversation_selected"] is True
    assert rows["provider-a::chat-a"]["conversation_eligible"] is True


def test_authorization_change_is_reflected_on_next_projection(monkeypatch):
    _, factory = _database(monkeypatch)
    now = datetime.now(timezone.utc)
    with factory() as session:
        session.add(_provider(selected=["chat-a"]))
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A", capability=["对话"]),
            model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"slots": [
                {"primary": {"provider_key": "provider-a", "model": "chat-a"}, "fallback": None},
            ]}),
            model_center.ModelInvocationDB(invocation_id="chat-ok", timestamp=now, provider_id="provider-a", model_id="chat-a", status="completed", invocation_source="model_health_probe", runtime_mode="probe"),
        ])
        session.commit()
    assert {row["identity"] for row in sino_assigned_models()} == {"provider-a::chat-a"}
    with factory() as session:
        session.get(model_center.AICapabilityConfigDB, "multi_model_discussion").configuration = {"slots": []}
        session.commit()
    assert sino_assigned_models() == []


def test_orphan_assignment_is_separate_from_current_economics(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["chat-a"]))
        session.add(model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A"))
        session.add_all([
            model_center.AICapabilityConfigDB(capability_key="sino_conversation", configuration={"provider_key": "provider-a", "model": "chat-a", "fallbacks": []}),
            model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"slots": [{"primary": {"provider_key": "removed", "model": "deepseek-chat"}, "fallback": None}]}),
        ])
        session.commit()
    result = invocation_economics()
    assert result["valid_assigned_model_count"] == 1
    assert result["models"][0]["model_id"] == "chat-a"
    assert result["models"][0]["request_count"] == 0
    assert result["models"][0]["telemetry_status"] == "enabled_no_records"
    assert result["orphan_references"] == [{"provider_id": "removed", "model_id": "deepseek-chat", "roles": ["讨论模型 1"], "reason": "not_connected"}]


def test_invocation_ledger_persists_failure_tokens_latency_and_pricing(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["chat-a"]))
        session.add(model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A"))
        session.add(model_center.AICapabilityConfigDB(capability_key="sino_conversation", configuration={"provider_key": "provider-a", "model": "chat-a", "fallbacks": []}))
        session.add(ModelPricingRuleDB(
            provider_id="provider-a", model_id="chat-a", effective_from=datetime.now(timezone.utc) - timedelta(days=1),
            input_price_per_1m_tokens=2, output_price_per_1m_tokens=4, currency="USD", pricing_source="founder_config", pricing_status="active",
        ))
        session.commit()
    success_id = record_model_invocation(
        provider_id="provider-a", model_id="chat-a", status="completed",
        metadata={"conversation_id": "conv-1", "runtime_role": "sino_conversation", "invocation_source": "founder_conversation", "runtime_mode": "override"},
        usage=LLMUsage(input_tokens=100, output_tokens=50, total_tokens=150), latency_ms=125,
    )
    failure_id = record_model_invocation(
        provider_id="provider-a", model_id="chat-a", status="failed",
        metadata={"council_id": "council-1", "runtime_role": "multi_model_discussion", "invocation_source": "council_participant"},
        latency_ms=80, error_code="provider_unavailable", fallback_from={"provider": "provider-b", "model": "chat-b"},
    )
    with factory() as session:
        success = session.get(model_center.ModelInvocationDB, success_id)
        failure = session.get(model_center.ModelInvocationDB, failure_id)
        assert (success.conversation_id, success.input_tokens, success.output_tokens, success.total_tokens, success.latency_ms) == ("conv-1", 100, 50, 150, 125)
        assert float(success.estimated_cost) == 0.0004
        assert (failure.council_id, failure.status, failure.error_code, failure.runtime_mode) == ("council-1", "failed", "provider_unavailable", "fallback")
        assert failure.total_tokens is None
    row = invocation_economics()["models"][0]
    assert (row["request_count"], row["total_tokens"], row["average_latency_ms"]) == (2, 150, 125.0)
    assert row["cost"] == 0.0004


def test_token_without_pricing_is_not_reported_as_zero_cost(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["chat-a"]))
        session.add(model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A"))
        session.add(model_center.AICapabilityConfigDB(capability_key="sino_conversation", configuration={"provider_key": "provider-a", "model": "chat-a", "fallbacks": []}))
        session.commit()
    record_model_invocation(provider_id="provider-a", model_id="chat-a", status="completed", usage=LLMUsage(5, 7, 12), latency_ms=10)
    row = invocation_economics()["models"][0]
    assert row["total_tokens"] == 12
    assert row["cost"] is None
    assert row["pricing_status"] == "not_configured"


def test_pricing_without_invocation_does_not_report_free_cost(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["chat-a"]))
        session.add(model_center.ModelRegistryDB(provider_id="provider-a", model_id="chat-a", display_name="Chat A"))
        session.add(model_center.AICapabilityConfigDB(capability_key="sino_conversation", configuration={"provider_key": "provider-a", "model": "chat-a", "fallbacks": []}))
        session.add(ModelPricingRuleDB(
            provider_id="provider-a", model_id="chat-a", effective_from=datetime.now(timezone.utc) - timedelta(days=1),
            input_price_per_1m_tokens=1, output_price_per_1m_tokens=1, currency="USD", pricing_source="founder_config", pricing_status="active",
        ))
        session.commit()

    row = invocation_economics()["models"][0]
    assert row["request_count"] == 0
    assert row["token_status"] == "enabled_no_records"
    assert row["pricing_status"] == "configured_no_usage"
    assert row["cost"] is None


def test_same_model_id_pricing_and_cost_are_provider_scoped(monkeypatch):
    _, factory = _database(monkeypatch)
    with factory() as session:
        session.add(_provider(selected=["shared"]))
        session.add(model_center.ModelProviderConfigDB(
            provider_key="provider-b", provider_type="openai", display_name="Provider B",
            base_url="https://provider-b.test/v1", model="shared", available_models=[{"model_id": "shared"}],
            selected_models=["shared"], encrypted_api_key="encrypted", enabled=True, health_status="healthy",
        ))
        session.add_all([
            model_center.ModelRegistryDB(provider_id="provider-a", model_id="shared", display_name="Shared A"),
            model_center.ModelRegistryDB(provider_id="provider-b", model_id="shared", display_name="Shared B"),
            model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"slots": [
                {"primary": {"provider_key": "provider-a", "model": "shared"}, "fallback": {"provider_key": "provider-b", "model": "shared"}},
            ]}),
            ModelPricingRuleDB(provider_id="provider-a", model_id="shared", effective_from=datetime.now(timezone.utc) - timedelta(days=1), input_price_per_1m_tokens=1, output_price_per_1m_tokens=1, currency="USD", pricing_source="a"),
            ModelPricingRuleDB(provider_id="provider-b", model_id="shared", effective_from=datetime.now(timezone.utc) - timedelta(days=1), input_price_per_1m_tokens=10, output_price_per_1m_tokens=10, currency="USD", pricing_source="b"),
        ])
        session.commit()

    record_model_invocation(provider_id="provider-a", model_id="shared", status="completed", usage=LLMUsage(100, 100, 200), latency_ms=10)
    record_model_invocation(provider_id="provider-b", model_id="shared", status="completed", usage=LLMUsage(100, 100, 200), latency_ms=20)

    rows = {row["identity"]: row for row in invocation_economics()["models"]}
    assert rows["provider-a::shared"]["cost"] == 0.0002
    assert rows["provider-b::shared"]["cost"] == 0.002
    assert rows["provider-a::shared"]["average_latency_ms"] == 10.0
    assert rows["provider-b::shared"]["average_latency_ms"] == 20.0


def test_model_center_get_is_read_only_even_for_legacy_discussion_data(monkeypatch):
    engine, factory = _database(monkeypatch)
    legacy = {"models": [{"provider_key": "removed", "model": "deepseek-chat"}]}
    with factory() as session:
        session.add(model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration=legacy))
        session.commit()
    flushes = []
    event.listen(engine, "before_cursor_execute", lambda _conn, _cursor, statement, _parameters, _context, _many: flushes.append(statement) if statement.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE")) else None)
    model_center.get_model_center()
    assert flushes == []
    with factory() as session:
        assert session.get(model_center.AICapabilityConfigDB, "multi_model_discussion").configuration == legacy
