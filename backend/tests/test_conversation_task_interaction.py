from app.founder_ai.conversation_task_interaction import _append_projection, conversation_understanding_snapshot, has_explicit_execution_intent, has_stop_intent, task_understanding_reply


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
    for value in ("可以了，执行吧。", "就这样做", "开始执行", "按这个方案做", "执行"):
        assert has_explicit_execution_intent(value) is True
    for value in ("这个思路不错", "我理解了", "这个方向可以", "我再想想", "先这样", "继续聊", "为什么"):
        assert has_explicit_execution_intent(value) is False


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
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine); monkeypatch.setattr(interaction, "SessionLocal", factory)
    session = ExecutionSession("execution-incident", "task-incident", "package", status="executing")
    append_event(session, "stall_detected", status="stalled", message="stalled", metadata={"technical_incident_id": "incident-1"})
    monkeypatch.setattr(interaction, "get_execution_session", lambda _execution_id: (session, object()))
    route = {"classification": "STANDARD_TASK", "autonomous_execution": {"task_id": "task-incident", "execution_session_id": session.id},
             "technical_resolution_contract": {"technical_incident_id": "incident-1", "resolution_status": "diagnosing", "attempt_count": 0}}
    with factory() as db:
        db.add(ConversationDB(id="conv-incident", system_id="founder_ai", title="incident"))
        db.add(SinoBrainSessionDB(conversation_id="conv-incident", discovery={"task_complexity_route": route})); db.commit()
    assert interaction.project_execution_events("conv-incident") == 1
    assert interaction.project_execution_events("conv-incident") == 0
    with factory() as db:
        messages = db.query(ConversationMessageDB).filter_by(conversation_id="conv-incident", message_type="execution_update").all()
        assert [item.content for item in messages] == ["当前发现执行异常，正在自动恢复。这个问题暂时不需要你处理。"]


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
