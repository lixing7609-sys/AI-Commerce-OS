from app.founder_ai.conversation_task_interaction import _append_projection, _lifecycle_allows_semantic, conversation_understanding_snapshot, execution_state_reply, has_explicit_execution_intent, has_stop_intent, route_conversation_message, task_understanding_reply


def _candidate_factory(monkeypatch, conversation_id="conv-candidate"):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database.base import Base
    from app.core.conversation.model import ConversationDB
    from app.core.conversation_first.model import SinoBrainSessionDB
    import app.founder_ai.conversation_task_interaction as interaction
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine); monkeypatch.setattr(interaction, "SessionLocal", factory)
    with factory() as db:
        db.add(ConversationDB(id=conversation_id, system_id="founder_ai", title="Mini Operator"))
        db.add(SinoBrainSessionDB(conversation_id=conversation_id, discovery={})); db.commit()
    return interaction, factory


def _mature_candidate():
    return {"title": "AI Commerce Mini Operator V1", "goal": "搭建最小 AI 电商经营系统",
            "scope": ["商品理解", "广告创意", "投放优化"], "constraints": ["一个广告平台", "一个广告账户", "一个真实商品"],
            "acceptance_criteria": ["完成一轮数据回流"], "confirmed_decisions": ["先完成三角闭环"],
            "dependencies": [], "risks": ["真实广告预算"], "task_type": "STANDARD_TASK"}


def test_incomplete_structured_candidate_is_never_persisted(monkeypatch):
    interaction, _factory = _candidate_factory(monkeypatch)
    try:
        interaction.persist_task_candidate("conv-candidate", {"goal": "只有目标"})
        assert False
    except ValueError as error:
        assert str(error) == "task_candidate_incomplete"


def test_discussion_candidate_is_derived_from_conversation_model_before_persistence(monkeypatch):
    interaction, factory = _candidate_factory(monkeypatch)
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    import app.founder_ai.conversation_core as conversation_core
    monkeypatch.setattr(conversation_core, "SessionLocal", factory)
    runtime = type("Runtime", (), {"provider_key": "configured-provider", "model": "configured-model"})()
    monkeypatch.setattr(conversation_core, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
    with factory() as db:
        db.add(ConversationMessageDB(conversation_id="conv-candidate", role="founder", content="讨论中的真实目标"))
        db.add(ConversationMessageDB(conversation_id="conv-candidate", role="assistant", content="讨论形成的真实范围和验收标准"))
        db.commit()
    seen = {}
    def derive(context, _runtime):
        seen["history"] = [item["content"] for item in context["conversation_history"]]
        return {"task_readiness": "sufficient", "task_candidate": _mature_candidate()}
    candidate = interaction.derive_and_persist_task_candidate("conv-candidate", generator=derive)
    assert seen["history"] == ["讨论中的真实目标", "讨论形成的真实范围和验收标准"]
    assert candidate["derivation"]["source"] == "conversation_llm"
    assert candidate["derivation"]["provider"] == "configured-provider"
    with factory() as db:
        discovery = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-candidate").one().discovery
        assert discovery["task_candidate"]["goal"] == "搭建最小 AI 电商经营系统"
        assert len([item for item in discovery["founder_action_queue"] if item["status"] == "pending"]) == 1


def test_mature_legacy_llm_decision_reconciles_without_founder_resubmission(monkeypatch):
    interaction, factory = _candidate_factory(monkeypatch)
    import app.founder_ai.conversation_core as conversation_core
    monkeypatch.setattr(conversation_core, "SessionLocal", factory)
    runtime = type("Runtime", (), {"provider_key": "configured-provider", "model": "configured-model"})()
    monkeypatch.setattr(conversation_core, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
    with factory() as db:
        from app.core.conversation_first.model import SinoBrainSessionDB
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-candidate").one()
        state.discovery = {"conversation_core": {"conversation_state": "task_established",
            "context_updates": {"task_created": True}, "updated_at": "decision-1"}}
        db.commit()
    candidate = interaction.reconcile_discussion_task_candidate(
        "conv-candidate", generator=lambda _context, _runtime: {
            "task_readiness": "sufficient", "task_candidate": _mature_candidate()})
    assert candidate["status"] == "pending_founder_confirmation"
    assert interaction.reconcile_discussion_task_candidate("conv-candidate", generator=lambda *_: (_ for _ in ()).throw(
        AssertionError("must be idempotent")))["candidate_id"] == candidate["candidate_id"]


def test_mature_discussion_persists_task_candidate_and_confirmation_action(monkeypatch):
    interaction, factory = _candidate_factory(monkeypatch)
    candidate = interaction.persist_task_candidate("conv-candidate", _mature_candidate(), source_message_id="client-1")
    assert candidate["status"] == "pending_founder_confirmation"
    with factory() as db:
        from app.core.conversation_first.model import SinoBrainSessionDB
        discovery = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-candidate").one().discovery
        assert discovery["task_projection"]["status"] == "pending_founder_confirmation"
        assert discovery["founder_action_required"] is True
        actions = [item for item in discovery["founder_action_queue"] if item["type"] == "TASK_CONFIRMATION" and item["status"] == "pending"]
        assert len(actions) == 1


def test_task_confirmation_creates_one_task_package_and_is_idempotent(monkeypatch):
    interaction, _factory = _candidate_factory(monkeypatch)
    candidate = interaction.persist_task_candidate("conv-candidate", _mature_candidate())
    calls = []
    def dispatch(_conversation_id, _candidate):
        calls.append(_candidate["candidate_id"])
        return {"classification": "STANDARD_TASK", "autonomous_execution": {"task_id": "task-1", "execution_session_id": "execution-1", "execution_package_id": "package-1"}}
    first = interaction.decide_task_candidate("conv-candidate", candidate["candidate_id"], "confirm", dispatch=dispatch)
    second = interaction.decide_task_candidate("conv-candidate", candidate["candidate_id"], "confirm", dispatch=dispatch)
    assert calls == [candidate["candidate_id"]]
    assert first["task_candidate"]["task_id"] == second["task_candidate"]["task_id"] == "task-1"
    assert first["task_candidate"]["execution_package_id"] == "package-1"


def test_modify_and_continue_discussion_never_dispatch(monkeypatch):
    for action, expected in (("modify", "needs_revision"), ("continue_discussion", "discussion_continues")):
        interaction, _factory = _candidate_factory(monkeypatch, conversation_id=f"conv-{action}")
        candidate = interaction.persist_task_candidate(f"conv-{action}", _mature_candidate())
        result = interaction.decide_task_candidate(f"conv-{action}", candidate["candidate_id"], action,
                                                   dispatch=lambda *_: (_ for _ in ()).throw(AssertionError("must not dispatch")))
        assert result["status"] == expected


def test_task_creation_failure_restores_pending_candidate(monkeypatch):
    interaction, _factory = _candidate_factory(monkeypatch)
    candidate = interaction.persist_task_candidate("conv-candidate", _mature_candidate())
    try:
        interaction.decide_task_candidate("conv-candidate", candidate["candidate_id"], "confirm",
                                          dispatch=lambda *_: (_ for _ in ()).throw(RuntimeError("package failed")))
        assert False
    except RuntimeError:
        pass
    result = interaction.persist_task_candidate("conv-candidate", _mature_candidate())
    assert result["status"] == "pending_founder_confirmation"


def test_clarification_reconciliation_enforces_founder_action_invariant(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database.base import Base
    from app.core.conversation.model import ConversationDB
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    import app.founder_ai.conversation_task_interaction as interaction

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(interaction, "SessionLocal", factory)
    pending = {"goal": "把新建讨论页面改成3列式", "route": {"classification": "QUICK_FIX", "clarification_required": True}}
    with factory() as db:
        db.add(ConversationDB(id="conv-clarify", system_id="founder_ai", title="三列式"))
        db.add(SinoBrainSessionDB(conversation_id="conv-clarify", discovery={"pending_task_understanding": pending,
            "working_understanding": {"next_question": ["三栏分别是什么？"]}}))
        db.add(ConversationMessageDB(conversation_id="conv-clarify", role="founder", content="把新建讨论页面改成3列式"))
        db.add(ConversationMessageDB(conversation_id="conv-clarify", role="founder", content="可以了，执行吧。"))
        db.commit()
    result = interaction.reconcile_conversation_understanding("conv-clarify")
    assert result["clarification_required"] is True
    assert result["founder_action_required"] is True
    assert len([item for item in result["founder_action_queue"] if item["status"] == "pending"]) == 1
    with factory() as db:
        discovery = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-clarify").one().discovery
        assert discovery["clarification_state"]["status"] == "awaiting_founder_clarification"
        assert discovery["execution_intent"]["status"] == "pending"
    try:
        interaction.resolve_clarification("conv-clarify", "confirm")
        assert False, "unknown understanding must not be confirmed"
    except ValueError as error:
        assert str(error) == "current_understanding_not_confirmable"


def test_confirming_a_persisted_understanding_reuses_existing_execution_intent(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database.base import Base
    from app.core.conversation.model import ConversationDB
    from app.core.conversation_first.model import SinoBrainSessionDB
    import app.founder_ai.conversation_task_interaction as interaction
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine); monkeypatch.setattr(interaction, "SessionLocal", factory)
    snapshot = {"goal": "三列式", "context_sufficient": False, "open_questions": ["确认职责"], "confirmed_decisions": [{"type": "three_column_responsibilities", "left": "Projects", "center": "Conversation", "right": "Task Queue"}]}
    action = {"action_id": "clarification-confirmable", "type": "CLARIFICATION", "status": "pending", "current_understanding": snapshot}
    with factory() as db:
        db.add(ConversationDB(id="conv-confirm", system_id="founder_ai", title="三列式"))
        db.add(SinoBrainSessionDB(conversation_id="conv-confirm", discovery={"conversation_understanding_snapshot": snapshot, "execution_intent": {"status": "pending"}, "founder_action_queue": [action]})); db.commit()
    resolved = interaction.resolve_clarification("conv-confirm", "confirm")
    assert resolved["reuse_execution_intent"] is True
    assert resolved["action"]["status"] == "resolved"
    with factory() as db:
        discovery = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-confirm").one().discovery
        assert discovery["clarification_state"]["founder_action_required"] is False
        assert not [item for item in discovery["founder_action_queue"] if item["status"] == "pending"]


def test_only_explicit_execution_language_starts_a_task():
    for value in ("可以了，执行吧。", "就这样做", "开始执行", "直接执行", "立即执行", "立刻执行", "按这个方案做", "执行"):
        assert has_explicit_execution_intent(value) is True
    for value in ("这个思路不错", "我理解了", "这个方向可以", "我再想想", "先这样", "继续聊", "为什么"):
        assert has_explicit_execution_intent(value) is False


def test_discussion_and_execution_controls_are_routed_before_the_llm():
    candidate = _mature_candidate()
    discovery = {"task_candidate": candidate}
    assert route_conversation_message("conv", "这个 Popover 是不是太宽？", discovery=discovery)["intent"] == "DISCUSSION"
    assert route_conversation_message("conv", "执行", discovery=discovery)["intent"] == "EXECUTE_CURRENT_TASK"
    assert route_conversation_message("conv", "立即执行。", discovery=discovery)["intent"] == "EXECUTE_CURRENT_TASK"


def test_five_discussion_turns_never_become_execution_controls():
    discovery = {"task_candidate": _mature_candidate()}
    for text in ("这个 Popover 是不是太宽？", "缩窄一点会怎样？", "还有别的方案吗？", "为什么？", "继续聊"):
        assert route_conversation_message("conv", text, discovery=discovery)["intent"] == "DISCUSSION"


def test_execute_without_current_task_stays_discussion_and_requests_clarification():
    result = route_conversation_message("conv", "执行", discovery={})
    assert result["intent"] == "DISCUSSION"
    assert result["control_command"] is True
    assert result["task_id"] is None
    assert result["execution_id"] is None


def test_repeated_execute_controls_reuse_one_active_execution():
    discovery = {"task_complexity_route": {
        "execution_status": "executing",
        "autonomous_execution": {"task_id": "task-1", "execution_session_id": "execution-1", "dispatch_status": "executing"},
    }}
    for text in ("执行", "执行", "立即执行"):
        result = route_conversation_message("conv", text, discovery=discovery)
        assert result["intent"] == "EXECUTE_CURRENT_TASK"
        assert result["task_id"] == "task-1"
        assert result["execution_id"] == "execution-1"
        assert result["active_execution"] is True
    assert execution_state_reply(discovery["task_complexity_route"]) == "已开始执行。"


def test_execution_narration_requires_real_execution_identity():
    assert execution_state_reply({"execution_status": "executing", "autonomous_execution": {}}) == "任务已经准备好，等待进入执行。"
    assert execution_state_reply({"execution_status": "queued", "autonomous_execution": {"execution_session_id": "execution-1"}}) == "任务已进入队列。"
    assert execution_state_reply({"execution_status": "completed", "autonomous_execution": {"execution_session_id": "execution-1"}}) == "任务已完成并通过验证。"


def test_stop_language_uses_the_existing_emergency_stop_intent():
    assert has_stop_intent("停止任务") is True
    assert has_stop_intent("先停下来") is True
    assert has_stop_intent("为什么正在自愈？") is False


def test_task_understanding_is_a_conversation_reply_not_an_execution_claim():
    reply = task_understanding_reply("能力仓库搜索框增加清除按钮", {"classification": "STANDARD_TASK", "clarification_required": False})
    assert "现在仍处于讨论阶段" in reply
    assert "不会创建执行任务" in reply
    assert "执行吧" in reply


def test_founder_readable_execution_projection_is_idempotent_by_source_event():
    class Results:
        def __init__(self, rows): self.rows = rows
        def all(self): return self.rows

    class FakeDB:
        def __init__(self): self.messages = []
        def scalars(self, _query): return Results(self.messages)
        def add(self, item): self.messages.append(item)

    db = FakeDB()
    assert _append_projection(db, conversation_id="conv-1", task_id="task-1", source_event_id="event-1", event_type="worker_started", summary="已开始执行。") is True
    assert _append_projection(db, conversation_id="conv-1", task_id="task-1", source_event_id="event-1", event_type="worker_started", summary="已开始执行。") is False
    assert len(db.messages) == 1
    assert db.messages[0].grounding["visibility"] == "founder"


def test_executor_completion_cannot_claim_task_completion_before_canonical_verification():
    blocked = {"current_step": "verification", "execution_status": "blocked", "autonomous_execution": {"verification": {"status": "FAIL"}}}
    assert _lifecycle_allows_semantic(blocked, "verification_completed") is False
    assert _lifecycle_allows_semantic(blocked, "execution_completed") is False
    complete = {"current_step": "complete", "execution_status": "completed", "autonomous_execution": {"verification": {"status": "PASS"}}}
    assert _lifecycle_allows_semantic(complete, "verification_completed") is True
    assert _lifecycle_allows_semantic(complete, "execution_completed") is True


def test_one_technical_incident_projects_only_one_recovery_message(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database.base import Base
    from app.core.conversation.model import ConversationDB
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    from app.founder_ai.execution_loop import ExecutionSession
    from app.founder_ai.execution_events import append_event
    import app.founder_ai.conversation_task_interaction as interaction
    import app.founder_ai.conversation_core as conversation_core
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine); monkeypatch.setattr(interaction, "SessionLocal", factory)
    session = ExecutionSession("execution-incident", "task-incident", "package", status="executing")
    append_event(session, "stall_detected", status="stalled", message="stalled", metadata={"technical_incident_id": "incident-1"})
    monkeypatch.setattr(interaction, "get_execution_session", lambda _execution_id: (session, object()))
    monkeypatch.setattr(conversation_core, "summarize_execution_events", lambda _conversation_id, _events: "当前发现执行异常，正在自动恢复。")
    route = {"classification": "STANDARD_TASK", "autonomous_execution": {"task_id": "task-incident", "execution_session_id": session.id},
             "technical_resolution_contract": {"technical_incident_id": "incident-1", "resolution_status": "diagnosing", "attempt_count": 0}}
    with factory() as db:
        db.add(ConversationDB(id="conv-incident", system_id="founder_ai", title="incident"))
        db.add(SinoBrainSessionDB(conversation_id="conv-incident", discovery={"task_complexity_route": route})); db.commit()
    assert interaction.project_execution_events("conv-incident") == 1
    assert interaction.project_execution_events("conv-incident") == 0
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-incident", message_type="execution_update").all()
        assert [item.content for item in messages] == ["当前发现执行异常，正在自动恢复。"]


def test_visible_result_projection_is_idempotent_when_verified_at_changes(monkeypatch):
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database.base import Base
    from app.core.conversation.model import ConversationDB
    from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
    import app.founder_ai.conversation_task_interaction as interaction
    import app.founder_ai.conversation_core as conversation_core
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine); monkeypatch.setattr(interaction, "SessionLocal", factory)
    monkeypatch.setattr(interaction, "get_execution_session", lambda _execution_id: None)
    monkeypatch.setattr(conversation_core, "summarize_execution_events", lambda _conversation_id, _events: "验证已通过。")
    route = {"classification": "STANDARD_TASK", "standard_task_contract": {"task_id": "task-visible"},
             "visible_result": {"verification_status": "PASS", "verified_at": "first"}}
    with factory() as db:
        db.add(ConversationDB(id="conv-visible", system_id="founder_ai", title="visible"))
        db.add(SinoBrainSessionDB(conversation_id="conv-visible", discovery={"task_complexity_route": route})); db.commit()
    assert interaction.project_execution_events("conv-visible") == 1
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-visible").one()
        discovery = dict(state.discovery); current = dict(discovery["task_complexity_route"])
        current["visible_result"] = {**current["visible_result"], "verified_at": "second"}
        discovery["task_complexity_route"] = current; state.discovery = discovery; db.commit()
    assert interaction.project_execution_events("conv-visible") == 0
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-visible", message_type="execution_update").all()
        assert len(messages) == 1
        assert messages[0].grounding["source_event_id"] == "visible-result:task-visible:pass"


def test_execution_intent_uses_confirmed_multiturn_context_before_clarifying():
    pending = {"goal": "把新建讨论页面改成3列式", "route": {"classification": "QUICK_FIX", "clarification_required": True}}
    messages = [
        {"message_id": "m1", "role": "founder", "content": "把新建讨论页面改成3列式"},
        {"message_id": "m2", "role": "assistant", "content": "当前理解：左侧：Projects / Conversations\n中间：Founder ↔ Sino Conversation\n右侧：Task Status + Founder Action Queue"},
        {"message_id": "m3", "role": "founder", "content": "可以了，执行吧。"},
    ]
    snapshot = conversation_understanding_snapshot(messages, pending)
    assert snapshot["explicit_execution_intent"] is True
    assert snapshot["context_sufficient"] is True
    assert snapshot["confirmed_decisions"] == [{"type": "three_column_responsibilities", "left": "Projects / Conversations", "center": "Founder ↔ Sino Conversation", "right": "Task Status + Founder Action Queue"}]


def test_execution_intent_with_genuinely_missing_context_requires_clarification():
    pending = {"goal": "把新建讨论页面改成3列式", "route": {"classification": "QUICK_FIX", "clarification_required": True}}
    snapshot = conversation_understanding_snapshot([
        {"message_id": "m1", "role": "founder", "content": "把新建讨论页面改成3列式"},
        {"message_id": "m2", "role": "founder", "content": "可以了，执行吧。"},
    ], pending)
    assert snapshot["context_sufficient"] is False
    assert snapshot["open_questions"]
