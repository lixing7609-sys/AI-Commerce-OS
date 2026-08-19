from app.founder_ai.conversation_task_interaction import _append_projection, has_explicit_execution_intent, has_stop_intent, task_understanding_reply


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
