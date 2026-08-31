from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.core.model_center.model import AICapabilityConfigDB, ModelProviderConfigDB, ModelRegistryDB
from app.llm.exceptions import InsufficientQuotaError
import app.founder_ai.conversation_core as core
import app.core.conversation.service as conversation_service


def _factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(core, "SessionLocal", factory)
    runtime = SimpleNamespace(provider_key="configured-provider", model="configured-conversation-model")
    monkeypatch.setattr(core, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
    monkeypatch.setattr(core, "resolve_conversation_model_authority", lambda *_args, **_kwargs: {
        "primary": runtime, "fallbacks": [], "explicit_override": True,
    })
    return factory


def _conversation(factory, *, messages):
    with factory() as db:
        db.add(ConversationDB(id="conv-llm", system_id="founder_ai", title="自然讨论"))
        db.add(SinoBrainSessionDB(conversation_id="conv-llm", discovery={}))
        for role, content in messages:
            db.add(ConversationMessageDB(conversation_id="conv-llm", role=role, content=content))
        db.commit()


def test_execution_confirmation_binds_goal_from_mature_context(monkeypatch):
    factory = _factory(monkeypatch)
    _conversation(factory, messages=[("founder", "保留现有搜索，只增加清除入口"), ("assistant", "可以在有关键词时显示，清除后恢复完整列表。")])
    decision = core.reason_about_message("conv-llm", "同意执行", generator=lambda context, runtime: {
        "response": "好，我会按刚才确定的范围开始处理。", "semantic_intent": "execute_current_task",
        "conversation_state": "task_ready", "task_candidate": {"goal": "在能力仓库搜索有关键词时显示清除入口，清除后恢复完整列表", "task_type": "STANDARD_TASK",
        "scope": ["能力仓库搜索交互"], "constraints": ["保持布局"], "acceptance_criteria": ["清除后恢复完整列表"]},
    })
    assert decision["semantic_intent"] == "execute_current_task"
    assert decision["task_candidate"]["goal"] != "同意执行"
    assert decision["provider"] == "configured-provider"
    assert len(decision["context"]["conversation_history"]) == 2


def test_confirmation_phrase_cannot_become_task_goal(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[("founder", "讨论一个方案")])
    decision = core.reason_about_message("conv-llm", "同意执行", generator=lambda *_: {
        "response": "我还需要结合前文确认实际执行对象。", "semantic_intent": "execute_current_task",
        "task_candidate": {"goal": "同意执行"},
    })
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None


def test_negative_execution_examples_follow_semantic_model_decision(monkeypatch):
    negatives = ["我还没同意执行", "为什么现在执行？", "先不要执行", "如果执行会怎么样？", "等我同意再执行"]
    for index, text in enumerate(negatives):
        factory = _factory(monkeypatch)
        with factory() as db:
            db.add(ConversationDB(id=f"conv-negative-{index}", system_id="founder_ai", title="negative"))
            db.add(SinoBrainSessionDB(conversation_id=f"conv-negative-{index}", discovery={})); db.commit()
        decision = core.reason_about_message(f"conv-negative-{index}", text, generator=lambda *_: {
            "response": "不会开始执行，我们可以继续讨论。", "semantic_intent": "conversation", "conversation_state": "discussion"})
        assert decision["semantic_intent"] == "conversation"
        assert decision["task_candidate"] is None


def test_model_unavailable_fallback_never_executes(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    monkeypatch.setattr(core, "configured_model_roles", lambda: {"conversation": None, "fallback": None})
    decision = core.reason_about_message("conv-llm", "执行吧")
    assert decision["model_decision"] is False
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None
    assert "不会" in decision["response"]


def _canonical_decision(**overrides):
    result = {
        "semantic_target": {"canonical_name": "Projects Heading Count"},
        "semantic_module": "Founder Sidebar / Navigation",
        "interaction_intent": "visible_derived_count", "semantic_confidence": "HIGH",
        "allowed_modules": ["Founder Sidebar / Navigation"],
        "allowed_production_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"],
        "allowed_test_files": ["frontend/src/sino-founder/FounderNavigationPanel.test.jsx"],
        "allowed_shared_support_files": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "scope_fingerprint": "scope", "contract_fingerprint": "contract",
        "browser_adapter": "system_chrome_playwright", "adapter_compatibility": "PASS",
        "risk": "low", "approval_required": False, "clarification_required": False,
        "dispatch_allowed": True, "blocked_reason": None, "decision_revision": "canonical-v1",
        "intent_fingerprint": "intent", "decision_fingerprint": "decision",
        "standard_task_contract": {
            "task_type": "STANDARD_TASK", "constraints": ["preserve_existing_behavior"],
            "acceptance_criteria": ["derived count matches the visible collection"],
        },
    }
    result.update(overrides)
    return result


def test_provider_failure_uses_canonical_admission_for_supported_explicit_task(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.founder_ai.standard_task_execution as execution
    calls = []
    monkeypatch.setattr(execution, "build_pre_dispatch_decision",
                        lambda **kwargs: calls.append(kwargs) or _canonical_decision())
    decision = core.reason_about_message(
        "conv-llm", "请显示当前可见数量并直接完成。",
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    assert len(calls) == 1
    assert decision["semantic_intent"] == "execute_current_task"
    assert decision["conversation_state"] == "deterministic_admission_ready"
    assert decision["task_candidate"]["title"] == "Projects Heading Count"
    assert decision["semantic_model_failure"]["attempts"][0]["error_type"] == "insufficient_quota"
    assert decision["deterministic_fallback"]["admission"]["dispatch_allowed"] is True


def test_provider_failure_with_unclear_task_stays_safely_blocked(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.founder_ai.standard_task_execution as execution
    monkeypatch.setattr(execution, "build_pre_dispatch_decision", lambda **_: _canonical_decision(
        semantic_target=None, semantic_confidence="LOW", clarification_required=True,
        dispatch_allowed=False, blocked_reason="Resolve the exact semantic target.",
    ))
    decision = core.reason_about_message(
        "conv-llm", "把那个东西直接完成。",
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None
    assert decision["conversation_state"] == "deterministic_clarification_required"


def test_provider_and_canonical_failure_remain_observable_and_do_not_dispatch(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.founder_ai.standard_task_execution as execution
    monkeypatch.setattr(execution, "build_pre_dispatch_decision",
                        lambda **_: (_ for _ in ()).throw(ValueError("scope_unresolved")))
    decision = core.reason_about_message(
        "conv-llm", "把那个东西直接完成。",
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None
    assert decision["conversation_state"] == "deterministic_admission_unavailable"
    assert decision["deterministic_fallback"]["failure"]["error_type"] == "ValueError"


def test_provider_failure_does_not_turn_ordinary_conversation_into_a_task(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.founder_ai.standard_task_execution as execution
    monkeypatch.setattr(execution, "build_pre_dispatch_decision",
                        lambda **_: (_ for _ in ()).throw(AssertionError("chat must not enter admission")))
    decision = core.reason_about_message(
        "conv-llm", "你觉得这个方向怎么样？",
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None
    assert decision["deterministic_fallback"]["attempted"] is False


def test_discussion_does_not_use_reasoning_strategy_as_hidden_fallback(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    primary = SimpleNamespace(provider_key="primary-provider", model="conversation-model")
    reasoning = SimpleNamespace(provider_key="reasoning-provider", model="deep-thinking-model")
    monkeypatch.setattr(core, "resolve_conversation_model_authority", lambda *_args, **_kwargs: {
        "primary": primary, "fallbacks": [], "explicit_override": True,
    })
    calls = []
    founder_message = "讨论下‘如何构建一个 AI Commerce Mini Operator？就先把 Sino Operator AI 做一个小版本出来’"

    def decide(_context, runtime):
        calls.append((runtime.provider_key, runtime.model))
        raise InsufficientQuotaError()

    decision = core.reason_about_message("conv-llm", founder_message, generator=decide)
    assert calls == [("primary-provider", "conversation-model")]
    assert decision["semantic_intent"] == "conversation"
    assert decision["conversation_state"] == "conversation_model_unavailable"
    assert decision["task_candidate"] is None
    assert decision["semantic_model_failure"]["reason"] == "MODEL_UNAVAILABLE"
    assert "当前会话模型暂时不可用" in decision["response"]


def test_explicit_conversation_fallback_preserves_multi_turn_context(monkeypatch):
    factory = _factory(monkeypatch)
    _conversation(factory, messages=[
        ("founder", "讨论下如何构建一个 AI Commerce Mini Operator"),
        ("assistant", "先收紧最小运营闭环和产品边界。"),
        ("founder", "第一阶段只支持一个商品、一个广告平台、一个广告账户。"),
        ("assistant", "这个约束适合作为首版边界。"),
    ])
    primary = SimpleNamespace(provider_key="primary-provider", model="conversation-model")
    fallback = SimpleNamespace(provider_key="fallback-provider", model="fallback-model")
    monkeypatch.setattr(core, "resolve_conversation_model_authority", lambda *_args, **_kwargs: {
        "primary": primary, "fallbacks": [fallback], "explicit_override": True,
    })
    observed = {}

    def decide(context, runtime):
        if runtime is primary:
            raise ValueError("malformed provider response")
        observed["history"] = [item["content"] for item in context["conversation_history"]]
        return {
            "response": "第一版可以从运营协调、广告执行和状态观察三个 Agent 角色讨论。",
            "semantic_intent": "conversation", "conversation_state": "discussion",
            "task_candidate": None,
        }

    decision = core.reason_about_message("conv-llm", "那第一版需要哪些 Agent？", generator=decide)
    assert observed["history"][-2:] == ["第一阶段只支持一个商品、一个广告平台、一个广告账户。", "这个约束适合作为首版边界。"]
    assert decision["semantic_intent"] == "conversation"
    assert "Agent" in decision["response"]


def test_all_semantic_roles_malformed_still_fail_closed(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    roles = {
        "conversation": SimpleNamespace(provider_key="p1", model="m1"),
        "fallback": SimpleNamespace(provider_key="p2", model="m2"),
        "reasoning_strategy": SimpleNamespace(provider_key="p3", model="m3"),
    }
    monkeypatch.setattr(core, "resolve_conversation_model_authority", lambda *_args, **_kwargs: {
        "primary": roles["conversation"], "fallbacks": [roles["fallback"]], "explicit_override": True,
    })
    decision = core.reason_about_message(
        "conv-llm", "你觉得这个方向怎么样？",
        generator=lambda *_: (_ for _ in ()).throw(ValueError("malformed semantic response")),
    )
    assert decision["conversation_state"] == "model_unavailable"
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None
    assert len(decision["semantic_model_failure"]["attempts"]) == 2
    assert "无法完成可靠的语义判断" in decision["response"]


def test_provider_failure_never_bypasses_approval_or_high_risk_gate(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.founder_ai.standard_task_execution as execution
    monkeypatch.setattr(execution, "build_pre_dispatch_decision", lambda **_: _canonical_decision(
        risk="high", approval_required=True, dispatch_allowed=False,
        blocked_reason="Founder approval is required.",
    ))
    decision = core.reason_about_message(
        "conv-llm", "直接完成这个高风险变更。",
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    assert decision["semantic_intent"] == "conversation"
    assert decision["task_candidate"] is None
    assert decision["conversation_state"] == "deterministic_approval_required"
    assert decision["deterministic_fallback"]["admission"]["approval_required"] is True


def test_model_failure_and_deterministic_admission_are_both_persisted(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.founder_ai.standard_task_execution as execution
    monkeypatch.setattr(execution, "build_pre_dispatch_decision", lambda **_: _canonical_decision())
    decision = core.reason_about_message(
        "conv-llm", "请显示当前可见数量并直接完成。",
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    core.persist_conversation_decision("conv-llm", decision)
    with factory() as db:
        persisted = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-llm").one().discovery["conversation_core"]
    assert persisted["semantic_model_failure"]["attempts"][0]["error_type"] == "insufficient_quota"
    assert persisted["deterministic_fallback"]["admission"]["semantic_confidence"] == "HIGH"


def test_real_projects_heading_count_message_reaches_canonical_admission_without_dispatch(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    founder_message = """请在左侧栏“项目”标题旁显示当前可见的项目数量。

搜索筛选项目时，
数量要同步变化；清除搜索后恢复完整数量。

请保留现有项目排序、打开项目、新建项目和项目操作方式。

你自己判断最合适的实现方式并直接完成，完成真实代码修改、必要测试和真实页面验证以后再告诉我结果。"""
    decision = core.reason_about_message(
        "conv-llm", founder_message,
        generator=lambda *_: (_ for _ in ()).throw(InsufficientQuotaError()),
    )
    admission = decision["deterministic_fallback"]["admission"]
    assert decision["semantic_intent"] == "execute_current_task"
    assert admission["semantic_target"]["canonical_name"] == "Projects Heading Count"
    assert admission["semantic_confidence"] == "HIGH"
    assert admission["interaction_intent"] == "visible_derived_count"
    assert admission["allowed_production_files"] == ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]
    assert admission["contract_fingerprint"] == "7142c84d4bb6af267b07673904db49f386eac47c5aed6f95f7c51b5b3d61b1e3"
    assert admission["browser_adapter"] == "system_chrome_playwright"
    assert admission["adapter_compatibility"] == "PASS"
    assert admission["risk"] == "low"
    assert admission["clarification_required"] is False
    assert admission["approval_required"] is False
    assert admission["dispatch_allowed"] is True
    assert decision["semantic_model_failure"]["attempts"][0]["error_type"] == "insufficient_quota"
    with factory() as db:
        assert db.query(TaskAssetDB).filter_by(conversation_id="conv-llm").count() == 0


def test_clarification_action_is_structured_but_response_remains_model_authored(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    decision = core.reason_about_message("conv-llm", "开始吧", generator=lambda *_: {
        "response": "开始之前，我需要确认你指的是哪个页面。", "semantic_intent": "conversation",
        "founder_action_intent": {"type": "CLARIFICATION", "title": "目标页面", "summary": "请选择目标页面", "required_input": "target_surface"},
    })
    core.persist_conversation_decision("conv-llm", decision)
    with factory() as db:
        discovery = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-llm").one().discovery
        assert discovery["conversation_core"]["mode"] == "LLM_FIRST"
        assert discovery["founder_action_queue"][0]["type"] == "CLARIFICATION"
        assert discovery["clarification_state"]["founder_action_required"] is True


def test_malformed_structured_fields_do_not_discard_the_natural_model_response(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    decision = core.reason_about_message("conv-llm", "继续说明", generator=lambda *_: {
        "response": "我会继续结合当前任务说明，不需要你重新输入。",
        "semantic_intent": "conversation",
        "task_candidate": ["not", "a", "mapping"],
        "context_updates": ["malformed"],
        "founder_action_intent": "not-a-mapping",
        "tool_intent": {"unexpected": True},
    })
    assert decision["response"] == "我会继续结合当前任务说明，不需要你重新输入。"
    assert decision["task_candidate"] is None
    assert decision["context_updates"] == {}
    assert decision["founder_action_intent"] is None
    assert decision["tool_intent"] is None
    core.persist_conversation_decision("conv-llm", decision)


def test_malformed_nested_task_candidate_lists_are_safely_normalized(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    decision = core.reason_about_message("conv-llm", "执行当前方案", generator=lambda *_: {
        "response": "我会按当前方案继续。", "semantic_intent": "execute_current_task",
        "task_candidate": {"goal": "调整当前样式", "constraints": "not-a-list", "acceptance_criteria": ["视觉一致", {"bad": True}]},
    })
    assert decision["semantic_intent"] == "execute_current_task"
    assert decision["task_candidate"]["constraints"] == []
    assert decision["task_candidate"]["acceptance_criteria"] == ["视觉一致"]


def test_clear_low_risk_candidate_can_be_persisted_without_a_separate_confirmed_decision_list():
    candidate = core._normalize_task_candidate({
        "goal": "删除产品矩阵标题栏", "scope": ["Founder Sidebar"],
        "constraints": ["保留产品列表"], "acceptance_criteria": ["标题栏消失"],
        "confirmed_decisions": [],
    })
    assert candidate["title"] == "删除产品矩阵标题栏"
    assert core.task_candidate_is_complete(candidate) is True


def test_model_roles_resolve_from_configuration_without_provider_binding(monkeypatch):
    calls = []
    configured = {
        "sino_conversation": SimpleNamespace(provider_key="provider-a", model="chat-a"),
        "deep_thinking": SimpleNamespace(provider_key="provider-b", model="reason-b"),
        "code_execution": SimpleNamespace(provider_key="provider-c", model="execute-c"),
    }
    monkeypatch.setattr(core, "resolve_runtime_config", lambda role=None, **kwargs: calls.append((role, kwargs)) or configured.get(role))
    monkeypatch.setattr(core, "resolve_runtime_chain", lambda _role: [])
    roles = core.configured_model_roles()
    assert roles["conversation"].model == "chat-a"
    assert roles["reasoning_strategy"].model == "reason-b"
    assert roles["execution"].model == "execute-c"
    assert roles["executor"] == "codex"
    assert [item[0] for item in calls[:3]] == ["sino_conversation", "deep_thinking", "code_execution"]


def test_conversation_model_override_drives_the_same_streaming_reasoning_path(monkeypatch):
    factory = _factory(monkeypatch)
    with factory() as db:
        db.add(ConversationDB(id="conv-override", system_id="founder_ai", title="模型选择", conversation_model_provider="provider-b", conversation_model="chat-b"))
        db.add(SinoBrainSessionDB(conversation_id="conv-override", discovery={}))
        db.commit()
    override = SimpleNamespace(provider_key="provider-b", model="chat-b")
    monkeypatch.setattr(core, "resolve_runtime_config", lambda provider_key=None, model=None, **_: override if (provider_key, model) == ("provider-b", "chat-b") else None)
    monkeypatch.setattr(core, "resolve_conversation_model_authority", conversation_service.resolve_conversation_model_authority)
    decision = core.reason_about_message("conv-override", "继续讨论", generator=lambda _context, runtime: {
        "response": f"由 {runtime.model} 回复", "semantic_intent": "conversation", "conversation_state": "discussion",
    })
    assert decision["provider"] == "provider-b"
    assert decision["model"] == "chat-b"
    assert decision["response"] == "由 chat-b 回复"


def test_conversation_model_override_persists_and_rejects_unavailable_models(monkeypatch):
    factory = _factory(monkeypatch)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    with factory() as db:
        db.add(ConversationDB(id="conv-preference", system_id="founder_ai", title="模型偏好"))
        db.commit()
    import app.core.model_center.service as model_center_service
    import app.core.model_center.runtime_chain as runtime_chain
    selected = SimpleNamespace(provider_key="provider-b", model="chat-b")
    monkeypatch.setattr(model_center_service, "resolve_runtime_config", lambda provider_key=None, model=None, **_: selected if (provider_key, model) == ("provider-b", "chat-b") else None)
    monkeypatch.setattr(runtime_chain, "sino_assigned_models", lambda **_: [{"identity": "provider-b::chat-b"}])
    updated = conversation_service.set_conversation_model("conv-preference", "provider-b", "chat-b")
    assert (updated.conversation_model_provider, updated.conversation_model) == ("provider-b", "chat-b")
    with factory() as db:
        persisted = db.get(ConversationDB, "conv-preference")
        assert (persisted.conversation_model_provider, persisted.conversation_model) == ("provider-b", "chat-b")
    try:
        conversation_service.set_conversation_model("conv-preference", "disabled-provider", "disabled-model")
    except conversation_service.ConversationBoundaryError as error:
        assert "unavailable" in str(error)
    else:
        raise AssertionError("disabled model must be rejected")


def test_new_conversation_persists_the_current_default_model(monkeypatch):
    factory = _factory(monkeypatch)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    with factory() as db:
        db.add(ModelProviderConfigDB(
            provider_key="provider-default", provider_type="openai", display_name="Provider Default",
            base_url="https://provider.test/v1", model="chat-default", available_models=[],
            selected_models=["chat-default"], encrypted_api_key="encrypted", enabled=True,
            health_status="healthy",
        ))
        db.add(AICapabilityConfigDB(capability_key="sino_conversation", configuration={
            "provider_key": "provider-default", "model": "chat-default", "fallbacks": [],
        }))
        db.commit()
    created = conversation_service.create_conversation(title="Persisted default")
    assert (created.conversation_model_provider, created.conversation_model) == ("provider-default", "chat-default")


def test_legacy_conversation_default_materializes_once_and_survives_global_change(monkeypatch):
    factory = _factory(monkeypatch)
    monkeypatch.setattr(conversation_service, "SessionLocal", factory)
    first = SimpleNamespace(provider_key="provider-a", model="chat-a")
    second = SimpleNamespace(provider_key="provider-b", model="chat-b")
    runtimes = {("provider-a", "chat-a"): first, ("provider-b", "chat-b"): second}
    with factory() as db:
        db.add(ConversationDB(id="conv-legacy", system_id="founder_ai", title="Legacy"))
        db.add(AICapabilityConfigDB(capability_key="sino_conversation", configuration={
            "provider_key": "provider-a", "model": "chat-a", "fallbacks": [],
        }))
        db.commit()
    resolve = lambda **kwargs: runtimes.get((kwargs.get("provider_key"), kwargs.get("model")))
    first_authority = conversation_service.resolve_conversation_model_authority(
        "conv-legacy", session_factory=factory, runtime_resolver=resolve,
    )
    assert first_authority["resource_identity"] == "provider-a::chat-a"
    assert first_authority["source"] == "materialized_system_default"
    with factory() as db:
        db.get(AICapabilityConfigDB, "sino_conversation").configuration = {
            "provider_key": "provider-b", "model": "chat-b", "fallbacks": [],
        }
        db.commit()
    second_authority = conversation_service.resolve_conversation_model_authority(
        "conv-legacy", session_factory=factory, runtime_resolver=resolve,
    )
    assert second_authority["resource_identity"] == "provider-a::chat-a"
    with factory() as db:
        persisted = db.get(ConversationDB, "conv-legacy")
        assert (persisted.conversation_model_provider, persisted.conversation_model) == ("provider-a", "chat-a")


def test_candidate_derivation_and_execution_summary_share_conversation_authority(monkeypatch):
    factory = _factory(monkeypatch)
    selected = SimpleNamespace(provider_key="selected-provider", model="selected-model")
    with factory() as db:
        db.add(ConversationDB(id="conv-authority", system_id="founder_ai", title="Authority",
                              conversation_model_provider="selected-provider", conversation_model="selected-model"))
        db.add(SinoBrainSessionDB(conversation_id="conv-authority", discovery={}))
        db.add(ConversationMessageDB(conversation_id="conv-authority", role="founder", content="按确定边界形成任务"))
        db.commit()
    monkeypatch.setattr(core, "resolve_conversation_model_authority", conversation_service.resolve_conversation_model_authority)
    monkeypatch.setattr(core, "resolve_runtime_config", lambda provider_key=None, model=None, **_: selected if (provider_key, model) == ("selected-provider", "selected-model") else None)
    seen = []
    candidate = core.derive_task_candidate_from_conversation("conv-authority", generator=lambda _context, runtime: seen.append(runtime.model) or {
        "task_readiness": "sufficient", "task_candidate": {
            "title": "Selected task", "goal": "按确定边界形成任务", "scope": ["Conversation"],
            "constraints": [], "acceptance_criteria": ["uses selected model"],
            "confirmed_decisions": [], "dependencies": [], "risks": [], "task_type": "STANDARD_TASK",
        },
    })
    summary = core.summarize_execution_events("conv-authority", [{"event_name": "queued"}],
        generator=lambda _context, _events, runtime: seen.append(runtime.model) or {"summary": "已进入队列。"})
    assert candidate["derivation"]["provider"] == "selected-provider"
    assert summary == "已进入队列。"
    assert seen == ["selected-model", "selected-model"]


def test_execution_event_batch_gets_one_model_authored_summary(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    calls = []
    summary = core.summarize_execution_events("conv-llm", [
        {"event_name": "queued"}, {"event_name": "worker_started"}, {"event_name": "codex_started"},
    ], generator=lambda context, events, runtime: calls.append(events) or {"summary": "我开始处理这项任务。"})
    assert summary == "我开始处理这项任务。"
    assert len(calls) == 1


def test_client_message_id_persists_one_founder_message_and_one_reply(monkeypatch):
    import app.founder_ai.secretary.service as secretary_service
    import app.founder_ai.attachments as attachments
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    monkeypatch.setattr(secretary_service, "SessionLocal", factory)
    monkeypatch.setattr(attachments, "SessionLocal", factory)
    monkeypatch.setattr(secretary_service, "bind_attachments", lambda *args: None)
    service = secretary_service.SinoSecretaryService(reply_generator=lambda *_: "自然回复")
    first_id = service.persist_founder_message("conv-llm", "只发送一次", client_message_id="client-message-123")
    assert service.persist_founder_message("conv-llm", "只发送一次", client_message_id="client-message-123") == first_id
    service.append_message("conv-llm", "只发送一次", client_message_id="client-message-123")
    service.append_message("conv-llm", "只发送一次", client_message_id="client-message-123")
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-llm").all()
        assert [item.role for item in messages].count("founder") == 1
        assert [item.role for item in messages].count("assistant") == 1


def test_context_selection_is_bounded_but_keeps_referenced_history():
    messages = [SimpleNamespace(id=f"m-{index}") for index in range(50)]
    selected = core.select_relevant_history(messages, {"m-2"})
    assert selected[0].id == "m-2"
    assert len(selected) == core.MAX_RECENT_CONVERSATION_MESSAGES + 1
    assert selected[-1].id == "m-49"


def test_current_capabilities_come_from_persisted_state_not_a_static_answer(monkeypatch):
    task = SimpleNamespace(id="task-1", title="Conversation-first", status="completed", execution_status="completed")
    asset = SimpleNamespace(status="ready", asset_type="skill", name="检索能力")
    monkeypatch.setattr("app.founder_ai.execution_registry.list_execution_sessions", lambda: [])
    context = core.current_system_capabilities_context(tasks=[task], assets=[asset], discovery={"conversation_core": {"mode": "LLM_FIRST"}})
    assert context["source"] == "persisted_system_state"
    assert context["recent_tasks"][0]["title"] == "Conversation-first"
    assert "backend" in context["task_identity_policy"]
    assert context["capability_repository"]["by_status"]["ready"] == 1
    assert "conversation_core" in context["current_conversation_features"]


def test_model_duplicate_claim_cannot_suppress_a_new_source_message(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.core.task_asset.service as task_service
    monkeypatch.setattr(task_service, "find_task_by_source_message", lambda _source: None)
    decision = core.reason_about_message("conv-llm", "增加新的产品矩阵入口",
        interaction_context={"source_message_id": "message-new"}, generator=lambda *_: {
            "response": "系统里已经有一项同名需求处于排队中，我不会重复创建任务。",
            "semantic_intent": "founder_decision", "conversation_state": "requirement_captured_existing_task_queued",
            "task_candidate": {"title": "调整页面", "goal": "增加新的产品矩阵入口", "task_type": "STANDARD_TASK",
                "scope": ["Sidebar"], "constraints": ["复用当前已排队的同名任务，不重复创建"],
                "acceptance_criteria": ["入口可见"], "confirmed_decisions": [], "dependencies": [], "risks": []},
        })
    assert decision["semantic_intent"] == "execute_current_task"
    assert decision["conversation_state"] == "new_task_requested"
    assert "新的独立任务" in decision["response"]
    assert decision["task_candidate"]["constraints"] == []


def test_canonical_same_message_duplicate_returns_existing_task_identity(monkeypatch):
    factory = _factory(monkeypatch); _conversation(factory, messages=[])
    import app.core.task_asset.service as task_service
    existing = SimpleNamespace(id="task-existing")
    monkeypatch.setattr(task_service, "find_task_by_source_message", lambda _source: existing)
    decision = core.reason_about_message("conv-llm", "重复发送",
        interaction_context={"source_message_id": "message-same"}, generator=lambda *_: {
            "response": "系统里已经有一项同名需求处于排队中，我不会重复创建任务。",
            "semantic_intent": "conversation", "conversation_state": "duplicate",
            "task_candidate": {"title": "任务", "goal": "重复发送", "scope": ["Sidebar"],
                "constraints": [], "acceptance_criteria": ["完成"], "confirmed_decisions": []},
        })
    assert decision["duplicate_task"] == {"duplicate_of_task_id": "task-existing", "duplicate_reason": "same_source_message_id"}
    assert "task-existing" in decision["response"]
