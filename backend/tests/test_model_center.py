from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
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
        assert persisted["slots"] == discussion["slots"]


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
