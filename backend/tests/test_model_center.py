from pathlib import Path
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
import app.core.model_center.service as model_center
import app.core.model_center.api as model_center_api
from app.founder_ai.system_builder import SinoSystemBuilder


def _database(monkeypatch, tmp_path: Path):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(model_center, "SessionLocal", factory)
    monkeypatch.setenv("MODEL_CENTER_KEY_FILE", str(tmp_path / "model-center.key"))
    return factory


def test_model_center_saves_encrypted_provider_and_restores_roles(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    saved = model_center.save_provider("gpt", base_url="https://provider.example/v1", model="gpt-runtime", api_key="secret-key-1234", enabled=True)
    assert saved["configured"] is True
    assert saved["api_key_mask"] == "****1234"
    assert "secret-key" not in str(saved)
    with factory() as session:
        row = session.get(model_center.ModelProviderConfigDB, "gpt")
        assert row.encrypted_api_key != "secret-key-1234"
    runtime = model_center.resolve_runtime_config("gpt")
    assert runtime.api_key == "secret-key-1234"
    assert runtime.model == "gpt-runtime"
    result = model_center.save_roles({"reasoner": "gpt", "architect": "gpt", "reviewer": None, "executor": None})
    assert next(item for item in result["roles"] if item["role_key"] == "sino_conversation")["provider_key"] == "gpt"
    assert model_center.resolve_runtime_config(role="architect").provider_key == "gpt"


def test_model_center_preserves_existing_key_and_records_health(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="first-secret", enabled=True)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-v2", api_key=None, enabled=True)
    assert model_center.resolve_runtime_config("deepseek").api_key == "first-secret"
    health = model_center.record_health("deepseek", "healthy")
    assert health["health_status"] == "healthy"
    assert health["health_checked_at"]


def test_model_center_projects_persisted_vision_capability_into_connected_registry(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="vision-model", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    with factory() as session:
        model = session.query(model_center.ModelRegistryDB).filter_by(provider_id="deepseek", model_id="vision-model").one()
        model.supports_vision = True
        session.commit()
    center = model_center.get_model_center()
    model = next(item for item in center["models"] if item["model_id"] == "vision-model")
    registry_model = next(item for item in center["model_capability_registry"]["models"] if item["model_id"] == "vision-model")
    assert model["supports_vision"] is True
    assert model["vision_capability_source"] == "MODEL_REGISTRY_VERIFIED"
    assert registry_model["capabilities"]["supports_vision_understanding"]["status"] == "VERIFIED"


def test_model_center_exposes_unified_invocation_counts_tokens_and_latency(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    model_center.save_capability_assignment("sino_conversation", "deepseek", "deepseek-chat")
    with factory() as session:
        session.add_all([
            model_center.ModelInvocationDB(invocation_id="inv-1", provider_id="deepseek", model_id="deepseek-chat", assignment_role="sino_conversation", invocation_source="founder_conversation", runtime_mode="default", status="completed", input_tokens=10, output_tokens=20, total_tokens=30, latency_ms=100),
            model_center.ModelInvocationDB(invocation_id="inv-2", provider_id="deepseek", model_id="deepseek-chat", assignment_role="multi_model_discussion", invocation_source="council_participant", runtime_mode="default", status="completed", input_tokens=15, output_tokens=25, total_tokens=40, latency_ms=200),
            model_center.ModelInvocationDB(invocation_id="inv-3", provider_id="deepseek", model_id="deepseek-chat", assignment_role="multi_model_discussion", invocation_source="council_participant", runtime_mode="fallback", status="failed", error_code="provider_unavailable", latency_ms=900),
        ])
        session.commit()
    usage = model_center.get_model_center()["model_usage"]
    assert len(usage) == 1
    assert usage[0]["provider_id"] == "deepseek"
    assert usage[0]["model_id"] == "deepseek-chat"
    assert usage[0]["request_count"] == 3
    assert usage[0]["total_tokens"] == 70
    assert usage[0]["average_latency_ms"] == 150.0
    assert usage[0]["telemetry_status"] == "recorded"


def test_system_builder_reads_architect_assignment_without_exposing_key(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("claude", base_url="https://api.anthropic.com/v1", model="claude-runtime", api_key="builder-secret", enabled=True)
    model_center.save_roles({"architect": "claude"})
    plan = SinoSystemBuilder().build("创建 Operator AI")
    assert plan.system_blueprint.system_key == "operator_ai"
    assert "builder-secret" not in str(plan.to_dict())


def test_placeholder_model_is_unconfigured_and_cannot_be_assigned(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    try:
        model_center.save_provider("gpt", base_url="https://api.openai.com/v1", model="GPT", api_key="not-a-real-key", enabled=True)
    except ValueError as error:
        assert str(error) == "base_url_and_model_required"
    else:
        raise AssertionError("placeholder model must be rejected")
    provider = next(item for item in model_center.get_model_center()["providers"] if item["provider_key"] == "gpt")
    assert provider["health_status"] == "not_configured"
    assert provider["api_key_mask"] is None
    try:
        model_center.save_roles({"architect": "gpt"})
    except ValueError as error:
        assert str(error) == "provider_not_available"
    else:
        raise AssertionError("unconfigured provider must not be assignable")


def test_unconfigured_health_is_business_state_without_external_probe(monkeypatch):
    configuration = {"provider_key": "gpt", "health_status": "not_configured", "configured": False}
    monkeypatch.setattr(model_center_api, "resolve_runtime_config", lambda **_kwargs: None)
    monkeypatch.setattr(model_center_api, "get_model_center", lambda: {"providers": [configuration], "roles": []})
    monkeypatch.setattr(model_center_api.LLMGateway, "generate_for", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("external probe must not run")))
    result = model_center_api.probe_provider("gpt")
    assert result["status"] == "not_configured"
    assert result["configuration"] is configuration


def test_exact_model_health_probe_uses_requested_resource_without_changing_provider_health(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    saved = model_center.save_provider("gpt", base_url="https://provider.example/v1", model="default-model", api_key="secret-key", enabled=True)
    with factory() as session:
        row = session.get(model_center.ModelProviderConfigDB, "gpt")
        row.selected_models = ["default-model", "exact-model"]
        row.available_models = ["default-model", "exact-model"]
        row.health_status = "healthy"
        session.commit()
    calls = []
    def generate(_gateway, provider, model, request):
        calls.append((provider, model, request.metadata.copy()))
        request.metadata["model_invocation_id"] = "inv-probe"
        return SimpleNamespace()
    monkeypatch.setattr(model_center_api.LLMGateway, "generate_for_model", generate)
    result = model_center_api.probe_model_resource("gpt", model_center_api.ModelHealthProbeIn(model_id="exact-model"))
    assert result == {"status": "healthy", "provider": "gpt", "model": "exact-model", "invocation_id": "inv-probe"}
    assert calls == [("gpt", "exact-model", {"runtime_role": "model_health", "invocation_source": "model_health_probe", "runtime_mode": "probe", "force_model_health_probe": True})]
    with factory() as session:
        assert session.get(model_center.ModelProviderConfigDB, "gpt").health_status == "healthy"


def test_executor_is_fixed_codex(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    executor = next(item for item in model_center.get_model_center()["roles"] if item["role_key"] == "code_execution")
    assert executor["execution_engine_id"] == "codex"
    assert executor["model"] is None
    assert model_center.get_model_center()["execution_engines"] == [{"engine_id": "codex", "display_name": "Codex", "status": "available", "engine_type": "codex"}]


def test_provider_install_discovers_and_selects_models(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    class Response:
        status_code = 200
        def json(self): return {"data": [{"id": "model-large"}, {"id": "model-mini"}]}
    monkeypatch.setattr(model_center.httpx, "get", lambda *args, **kwargs: Response())
    installed = model_center.install_provider(provider_type="openai", api_key="real-secret", base_url=None)
    assert [item["model_id"] for item in installed["available_models"]] == ["model-large", "model-mini"]
    assert installed["selected_models"] == []
    selected = model_center.select_models(installed["provider_key"], ["model-mini"])
    assert selected["model"] == "model-mini"
    assert selected["configured"] is True


def test_unassigned_model_removal_preserves_provider_catalog_credentials_and_usage(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-reasoner", api_key=None, enabled=True)
    with factory() as session:
        session.add(model_center.CouncilModelRunDB(council_run_id="council-history", provider="deepseek", model="deepseek-reasoner", role="analyst", status="completed", proposal={}, latency_ms=120, context_references={}))
        session.commit()
    result = model_center.select_models("deepseek", ["deepseek-chat"])
    assert result["selected_models"] == ["deepseek-chat"]
    assert "deepseek-reasoner" in [item["model_id"] for item in result["available_models"]]
    assert result["credential_configured"] is True
    with factory() as session:
        assert session.query(model_center.CouncilModelRunDB).filter_by(model="deepseek-reasoner").count() == 1


def test_last_unassigned_model_can_be_removed_without_disconnecting_provider(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    result = model_center.select_models("deepseek", [])
    assert result["selected_models"] == []
    assert result["installed"] is True
    assert result["credential_configured"] is True
    assert result["enabled"] is True
    assert "deepseek-chat" in [item["model_id"] for item in result["available_models"]]


def test_model_removal_rejects_primary_fallback_and_discussion_dependencies(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-reasoner", api_key=None, enabled=True)
    model_center.record_health("deepseek", "healthy")
    model_center.save_capability_assignment("sino_conversation", "deepseek", "deepseek-chat", [{"provider_key": "deepseek", "model": "deepseek-reasoner"}])
    with pytest.raises(ValueError, match="model_in_use:Sino 主对话$"):
        model_center.select_models("deepseek", ["deepseek-reasoner"])
    with pytest.raises(ValueError, match="model_in_use:Sino 主对话 Fallback"):
        model_center.select_models("deepseek", ["deepseek-chat"])
    model_center.save_capability_assignment("sino_conversation", None, None, [])
    model_center.save_multi_model_assignment(slots=[{"primary": {"provider_key": "deepseek", "model": "deepseek-chat"}, "fallback": {"provider_key": "deepseek", "model": "deepseek-reasoner"}}])
    with pytest.raises(ValueError, match="model_in_use:讨论模型 1$"):
        model_center.select_models("deepseek", ["deepseek-reasoner"])
    with pytest.raises(ValueError, match="model_in_use:讨论模型 1 Fallback"):
        model_center.select_models("deepseek", ["deepseek-chat"])


def test_model_removal_rejects_application_runtime_dependency(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-reasoner", api_key=None, enabled=True)
    model_center.save_application_assignments("operator_ai", {"deep_thinking": {"provider_key": "deepseek", "model": "deepseek-reasoner"}})
    with pytest.raises(ValueError, match="model_in_use:Operator AI · 深度推理"):
        model_center.select_models("deepseek", ["deepseek-chat"])


def test_application_assignment_drives_founder_runtime(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    result = model_center.save_application_assignments("founder_ai", {"sino_conversation": {"provider_key": "deepseek", "model": "deepseek-chat"}})
    founder = next(item for item in result["applications"] if item["application_key"] == "founder_ai")
    assert next(item for item in founder["assignments"] if item["capability_key"] == "sino_conversation")["model"] == "deepseek-chat"
    runtime = model_center.resolve_runtime_config(role="reasoner")
    assert runtime.provider_key == "deepseek"


def test_capability_assignment_persists_exact_healthy_model(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    result = model_center.save_capability_assignment("system_builder", "deepseek", "deepseek-chat")
    assigned = next(item for item in result["roles"] if item["role_key"] == "system_builder")
    assert (assigned["provider_key"], assigned["model"]) == ("deepseek", "deepseek-chat")
    assert model_center.resolve_runtime_config(role="system_builder").model == "deepseek-chat"


def test_capability_assignment_persists_bounded_runtime_fallback_chain(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    for key, model in (("deepseek", "deepseek-chat"), ("gpt", "gpt-5-pro")):
        model_center.save_provider(key, base_url="https://provider.example/v1", model=model, api_key=f"{key}-secret", enabled=True)
        model_center.record_health(key, "healthy")
    result = model_center.save_capability_assignment("sino_conversation", "deepseek", "deepseek-chat", [{"provider_key": "gpt", "model": "gpt-5-pro"}])
    assigned = next(item for item in result["roles"] if item["role_key"] == "sino_conversation")
    assert assigned["fallbacks"] == [{"provider_key": "gpt", "model": "gpt-5-pro"}]
    assert [(item.provider_key, item.model) for item in model_center.resolve_runtime_chain("sino_conversation")] == [("deepseek", "deepseek-chat"), ("gpt", "gpt-5-pro")]


def test_sino_skill_assignment_overrides_stale_application_assignment(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="deepseek-secret", enabled=True)
    model_center.save_provider("claude", base_url="https://api.anthropic.com/v1", model="claude-sonnet-5", api_key="claude-secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    model_center.record_health("claude", "healthy")
    model_center.save_application_assignments("founder_ai", {"sino_conversation": {"provider_key": "claude", "model": "claude-sonnet-5"}})
    model_center.save_capability_assignment("sino_conversation", "deepseek", "deepseek-chat")

    runtime = model_center.resolve_runtime_config(role="sino_conversation")

    assert (runtime.provider_key, runtime.model) == ("deepseek", "deepseek-chat")


def test_provider_catalog_includes_extensible_founder_choices(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    catalog = {item["provider_type"]: item["display_name"] for item in model_center.get_model_center()["provider_catalog"]}
    assert catalog["gemini"] == "Gemini"
    assert catalog["doubao"] == "豆包"
    assert catalog["local"] == "本地模型"
    assert catalog["ofoxai"] == "OfoxAI"


def test_ofoxai_discovery_populates_provider_independent_model_registry(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)

    class Response:
        status_code = 200

        def json(self):
            return {"data": [{"id": "gpt-5-pro"}, {"id": "claude-sonnet-5"}]}

    calls = []
    monkeypatch.setattr(model_center.httpx, "get", lambda url, **kwargs: calls.append((url, kwargs)) or Response())

    provider = model_center.install_provider(
        provider_type="ofoxai",
        api_key="ofox-real-secret",
        base_url="https://gateway.ofox.example/v1",
    )
    provider = model_center.select_models(provider["provider_key"], ["gpt-5-pro"])

    assert provider["provider_type"] == "ofoxai"
    assert provider["selected_models"] == ["gpt-5-pro"]
    assert calls[0][0] == "https://gateway.ofox.example/v1/models"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer ofox-real-secret"
    with factory() as session:
        rows = session.query(model_center.ModelRegistryDB).order_by(model_center.ModelRegistryDB.model_id).all()
        assert [(row.provider_id, row.model_id, row.selected) for row in rows] == [
            (provider["provider_key"], "claude-sonnet-5", False),
            (provider["provider_key"], "gpt-5-pro", True),
        ]
        assert all(not hasattr(row, "provider_name") for row in rows)


def test_ofoxai_selected_model_can_be_assigned_to_sino(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    class Response:
        status_code = 200
        def json(self): return {"data": [{"id": "gpt-5-pro"}]}
    monkeypatch.setattr(model_center.httpx, "get", lambda *_args, **_kwargs: Response())
    provider = model_center.install_provider(provider_type="ofoxai", api_key="secret", base_url="https://gateway.ofox.example/v1")
    provider = model_center.select_models(provider["provider_key"], ["gpt-5-pro"])
    model_center.record_health(provider["provider_key"], "healthy")
    model_center.save_capability_assignment("sino_conversation", provider["provider_key"], "gpt-5-pro")
    runtime = model_center.resolve_runtime_config(role="sino_conversation")
    assert (runtime.provider_key, runtime.provider_type, runtime.model) == (provider["provider_key"], "ofoxai", "gpt-5-pro")


def test_runtime_decrypts_real_secret_and_never_uses_mask(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="real-founder-secret-9876", enabled=True)
    runtime = model_center.resolve_runtime_config(provider_key="deepseek")
    assert runtime.api_key == "real-founder-secret-9876"
    assert not runtime.api_key.startswith("****")


def test_execution_system_model_and_engine_are_persisted_separately(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    result = model_center.save_capability_assignment("code_execution", "deepseek", "deepseek-chat")
    execution = next(item for item in result["roles"] if item["role_key"] == "code_execution")
    assert execution["model"] == "deepseek-chat"
    assert execution["execution_engine_id"] == "codex"
    contract = model_center.resolve_execution_capability()
    assert contract["execution_system_model_id"] == "deepseek-chat"
    assert contract["execution_engine_id"] == "codex"


def test_execution_engine_registry_selection_persists_without_overwriting_system_model(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    model_center.save_capability_assignment("code_execution", "deepseek", "deepseek-chat")
    monkeypatch.setitem(model_center.EXECUTION_ENGINE_REGISTRY, "future-engine", {"display_name": "Future Engine", "status": "available", "engine_type": "future"})

    result = model_center.save_execution_engine("future-engine")
    execution = next(item for item in result["roles"] if item["role_key"] == "code_execution")
    assert execution["model"] == "deepseek-chat"
    assert execution["execution_engine_id"] == "future-engine"
    assert model_center.resolve_execution_capability()["execution_engine"]["engine_type"] == "future"

    result = model_center.save_capability_assignment("code_execution", "deepseek", "deepseek-chat")
    execution = next(item for item in result["roles"] if item["role_key"] == "code_execution")
    assert execution["execution_engine_id"] == "future-engine"


def test_unavailable_execution_engine_cannot_be_selected(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    monkeypatch.setitem(model_center.EXECUTION_ENGINE_REGISTRY, "offline", {"display_name": "Offline", "status": "unavailable", "engine_type": "test"})
    with pytest.raises(ValueError, match="execution_engine_not_available"):
        model_center.save_execution_engine("offline")


def test_agent_registry_lists_only_real_founder_agent(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    center = model_center.get_model_center()
    assert [agent["agent_id"] for agent in center["agents"]] == ["sino_founder_ai"]
    assert center["agents"][0]["display_name"] == "Sino AI 秘书"
    assert center["agents"][0]["application_system_id"] == "founder_ai"
    assert center["agents"][0]["work_refs"] == ()
    assert "business_works" not in center


def test_sino_skill_registry_belongs_to_agent_and_contains_only_real_skills(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    center = model_center.get_model_center()
    skills = {skill["skill_id"]: skill for skill in center["skills"]}
    assert all(skill["agent_id"] == "sino_founder_ai" for skill in skills.values())
    assert set(skills) == {"conversation", "reasoning", "project_intelligence", "decision", "knowledge", "living_prompt", "goal", "system_builder", "execution_coordination", "memory", "multi_model_discussion"}
    assert "pending_questions" not in skills
    assert "conversation_context" not in skills
    assert skills["reasoning"]["capability_refs"] == ("deep_thinking", "goal_reasoning")
    assert skills["multi_model_discussion"]["capability_refs"] == ("multi_model_discussion",)
    assert skills["conversation"]["workflow_refs"] == ()
    assert skills["conversation"]["tool_refs"] == ()


def test_legacy_discussion_models_are_exposed_as_five_slots_without_fake_fallbacks(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    legacy = [{"provider_key": f"provider-{index}", "model": f"model-{index}"} for index in range(1, 5)]
    with factory() as session:
        session.add(model_center.AICapabilityConfigDB(capability_key="multi_model_discussion", configuration={"models": legacy}))
        session.commit()
    discussion = next(item for item in model_center.get_model_center()["roles"] if item["role_key"] == "multi_model_discussion")
    assert len(discussion["slots"]) == 5
    assert [item["primary"] for item in discussion["slots"][:4]] == legacy
    assert all(item["fallback"] is None for item in discussion["slots"])
    assert discussion["slots"][4]["primary"] is None
    with factory() as session:
        persisted = session.get(model_center.AICapabilityConfigDB, "multi_model_discussion").configuration
        assert persisted == {"models": legacy}


def test_discussion_slots_persist_fallbacks_and_reject_duplicate_primaries(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    for provider, model in (("deepseek", "deepseek-chat"), ("claude", "claude-sonnet-5"), ("gpt", "gpt-5-pro")):
        model_center.save_provider(provider, base_url=f"https://{provider}.example/v1", model=model, api_key=f"{provider}-secret", enabled=True)
    slots = [
        {"primary": {"provider_key": "deepseek", "model": "deepseek-chat"}, "fallback": {"provider_key": "gpt", "model": "gpt-5-pro"}},
        {"primary": {"provider_key": "claude", "model": "claude-sonnet-5"}, "fallback": {"provider_key": "gpt", "model": "gpt-5-pro"}},
    ]
    result = model_center.save_multi_model_assignment(slots=slots)
    discussion = next(item for item in result["roles"] if item["role_key"] == "multi_model_discussion")
    assert discussion["slots"][:2] == slots
    assert len(discussion["slots"]) == 5
    with pytest.raises(ValueError, match="duplicate_discussion_primary"):
        model_center.save_multi_model_assignment(slots=[slots[0], {"primary": slots[0]["primary"], "fallback": None}])
    with pytest.raises(ValueError, match="primary_fallback_must_differ"):
        model_center.save_multi_model_assignment(slots=[{"primary": slots[0]["primary"], "fallback": slots[0]["primary"]}])


def test_assigned_discussion_model_cannot_be_removed_and_usage_history_is_untouched(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.save_multi_model_assignment(slots=[{"primary": {"provider_key": "deepseek", "model": "deepseek-chat"}, "fallback": None}])
    with factory() as session:
        session.add(model_center.CouncilModelRunDB(council_run_id="historical-run", provider="deepseek", model="deepseek-chat", role="analyst", status="completed", proposal={}, latency_ms=100, context_references={}))
        session.commit()
    with pytest.raises(ValueError, match="model_in_use:讨论模型 1"):
        model_center.select_models("deepseek", [])
    with factory() as session:
        assert session.query(model_center.CouncilModelRunDB).filter_by(model="deepseek-chat").count() == 1


def test_conversation_override_blocks_model_removal(monkeypatch, tmp_path):
    factory = _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    with factory() as session:
        session.add(ConversationDB(id="conv-model-override", system_id="founder_ai", title="Override", conversation_model_provider="deepseek", conversation_model="deepseek-chat"))
        session.commit()
    with pytest.raises(ValueError, match="Conversation Override · conv-model-override"):
        model_center.select_models("deepseek", [])


def test_skill_model_assignment_persists_via_internal_capability(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    result = model_center.save_capability_assignment("deep_thinking", "deepseek", "deepseek-chat")
    reasoning = next(skill for skill in result["skills"] if skill["skill_id"] == "reasoning")
    assert reasoning["model_assignment"] == {"provider_key": "deepseek", "model": "deepseek-chat"}
    assert reasoning["status"] == "running"


def test_sino_agent_model_assignment_persists_through_internal_capability(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    result = model_center.save_capability_assignment("project_analysis", "deepseek", "deepseek-chat")
    role = next(item for item in result["roles"] if item["role_key"] == "project_analysis")
    assert role["provider_key"] == "deepseek"
    assert role["model"] == "deepseek-chat"


def test_agent_registry_is_isolated_to_founder_application(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    center = model_center.get_model_center()
    assert all(agent["application_system_id"] == "founder_ai" for agent in center["agents"])
    assert not any(agent["application_system_id"] in {"operator_ai", "studio_ai", "industrial_ai", "quant_ai"} for agent in center["agents"])


def test_sino_code_execution_preserves_execution_contract(monkeypatch, tmp_path):
    _database(monkeypatch, tmp_path)
    model_center.save_provider("deepseek", base_url="https://api.deepseek.com", model="deepseek-chat", api_key="secret", enabled=True)
    model_center.record_health("deepseek", "healthy")
    model_center.save_capability_assignment("code_execution", "deepseek", "deepseek-chat")
    contract = model_center.resolve_execution_capability()
    assert contract["execution_system_model_id"] == "deepseek-chat"
    assert contract["execution_engine_id"] == "codex"
