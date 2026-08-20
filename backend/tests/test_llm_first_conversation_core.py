from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
import app.founder_ai.conversation_core as core


def _factory(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(core, "SessionLocal", factory)
    runtime = SimpleNamespace(provider_key="configured-provider", model="configured-conversation-model")
    monkeypatch.setattr(core, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
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


def test_model_roles_resolve_from_configuration_without_provider_binding(monkeypatch):
    calls = []
    configured = {
        "sino_conversation": SimpleNamespace(provider_key="provider-a", model="chat-a"),
        "deep_thinking": SimpleNamespace(provider_key="provider-b", model="reason-b"),
        "code_execution": SimpleNamespace(provider_key="provider-c", model="execute-c"),
    }
    monkeypatch.setattr(core, "resolve_runtime_config", lambda role=None, **kwargs: calls.append((role, kwargs)) or configured.get(role))
    roles = core.configured_model_roles()
    assert roles["conversation"].model == "chat-a"
    assert roles["reasoning_strategy"].model == "reason-b"
    assert roles["execution"].model == "execute-c"
    assert roles["executor"] == "codex"
    assert [item[0] for item in calls[:3]] == ["sino_conversation", "deep_thinking", "code_execution"]


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
    assert context["capability_repository"]["by_status"]["ready"] == 1
    assert "conversation_core" in context["current_conversation_features"]
