from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
import app.core.model_center.service as model_center
from app.core.model_center.model import ModelPricingRuleDB
from app.core.model_center.runtime_chain import connected_model_registry, eligible_models, invocation_economics, record_model_invocation, sino_assigned_models
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
        session.get(model_center.ModelProviderConfigDB, "provider-a").health_status = "unhealthy"
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
