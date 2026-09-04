from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB


def _factory(monkeypatch, *, candidates=0, tasks=0):
    import app.founder_ai.conversation_task_collection as collection
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(collection, "SessionLocal", factory)
    monkeypatch.setattr(collection, "list_execution_sessions", lambda: [])
    candidate_items = [{"candidate_id": f"candidate-{index}", "conversation_id": "conv-many",
                        "title": f"Candidate {index}", "goal": f"Goal {index}", "status": "pending_founder_confirmation",
                        "created_at": f"2026-01-{index + 1:02d}T00:00:00+00:00", "updated_at": f"2026-01-{index + 1:02d}T00:00:00+00:00"}
                       for index in range(candidates)]
    actions = [{"action_id": f"confirm-{index}", "type": "TASK_CONFIRMATION", "status": "pending",
                "candidate_id": f"candidate-{index}"} for index in range(candidates)]
    with factory() as db:
        db.add(ConversationDB(id="conv-many", system_id="founder_ai", title="Many tasks"))
        db.add(SinoBrainSessionDB(conversation_id="conv-many", discovery={"task_candidates": candidate_items,
            "task_candidate": candidate_items[-1] if candidate_items else {}, "founder_action_queue": actions}))
        for index in range(tasks):
            db.add(TaskAssetDB(id=f"task-{index}", system_id="founder_ai", conversation_id="conv-many",
                               title=f"Task {index}", scope={}, status="in_progress", approval_status="not_required",
                               execution_status="queued"))
        db.commit()
    return collection, factory


def test_collection_supports_one_two_four_and_ten_tasks(monkeypatch):
    for count in (1, 2, 4, 10):
        collection, _ = _factory(monkeypatch, candidates=count)
        assert len(collection.build_conversation_tasks("conv-many")["conversation_tasks"]) == count


def test_new_task_never_removes_existing_candidates(monkeypatch):
    collection, factory = _factory(monkeypatch, candidates=10)
    with factory() as db:
        db.add(TaskAssetDB(id="task-11", system_id="founder_ai", conversation_id="conv-many", title="Task 11",
                           scope={}, status="in_progress", approval_status="not_required", execution_status="queued"))
        db.commit()
    result = collection.build_conversation_tasks("conv-many")
    assert len(result["conversation_tasks"]) == 11
    assert {f"candidate:candidate-{index}" for index in range(10)}.issubset(
        {item["task_ref"] for item in result["conversation_tasks"]})


def test_pending_candidate_and_executing_task_coexist(monkeypatch):
    collection, _ = _factory(monkeypatch, candidates=1, tasks=1)
    result = collection.build_conversation_tasks("conv-many")
    assert {item["task_ref"] for item in result["conversation_tasks"]} == {"candidate:candidate-0", "task-0"}


def test_focus_is_idempotent_and_never_changes_task_or_execution(monkeypatch):
    collection, factory = _factory(monkeypatch, candidates=1, tasks=1)
    before = collection.build_conversation_tasks("conv-many")["conversation_tasks"]
    assert collection.focus_task("conv-many", "candidate:candidate-0")["focused_task_id"] == "candidate:candidate-0"
    assert collection.focus_task("conv-many", "candidate:candidate-0")["focused_task_id"] == "candidate:candidate-0"
    assert collection.focus_task("conv-many", "task-0")["focused_task_id"] == "task-0"
    after = collection.build_conversation_tasks("conv-many")["conversation_tasks"]
    assert [(item["task_ref"], item["status"], item["execution_state"]) for item in before] == [
        (item["task_ref"], item["status"], item["execution_state"]) for item in after]
    with factory() as db:
        assert db.query(TaskAssetDB).count() == 1


def test_natural_navigation_uses_model_resolved_task_ref(monkeypatch):
    collection, factory = _factory(monkeypatch, candidates=1, tasks=1)
    runtime = type("Runtime", (), {"provider_key": "configured", "model": "conversation"})()
    monkeypatch.setattr(collection, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
    with factory() as db:
        db.add(ConversationMessageDB(conversation_id="conv-many", role="founder", content="回到第一个候选任务")); db.commit()
    result = collection.resolve_task_navigation("conv-many", generator=lambda _message, _tasks, _runtime: {
        "navigation_intent": "focus", "task_ref": "candidate:candidate-0", "ambiguous_task_refs": []})
    assert result["status"] == "focused"
    assert result["focused_task_id"] == "candidate:candidate-0"
    again = collection.resolve_task_navigation("conv-many", generator=lambda *_: (_ for _ in ()).throw(
        AssertionError("same message must not resolve twice")))
    assert again["focused_task_id"] == "candidate:candidate-0"


def test_cached_natural_navigation_reconciles_stale_focus_and_direct_focus_overrides_it(monkeypatch):
    collection, factory = _factory(monkeypatch, candidates=1, tasks=1)
    runtime = type("Runtime", (), {"provider_key": "configured", "model": "conversation"})()
    monkeypatch.setattr(collection, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
    with factory() as db:
        db.add(ConversationMessageDB(conversation_id="conv-many", role="founder", content="回到候选任务")); db.commit()
    collection.resolve_task_navigation("conv-many", generator=lambda *_: {
        "navigation_intent": "focus", "task_ref": "candidate:candidate-0", "ambiguous_task_refs": []})
    with factory() as db:
        state = db.query(SinoBrainSessionDB).filter_by(conversation_id="conv-many").one()
        discovery = dict(state.discovery); discovery["focused_task_id"] = "task-0"
        state.discovery = discovery; db.commit()
    assert collection.resolve_task_navigation("conv-many")["focused_task_id"] == "candidate:candidate-0"
    collection.focus_task("conv-many", "task-0")
    assert collection.resolve_task_navigation("conv-many")["focused_task_id"] == "task-0"


def test_ambiguous_natural_navigation_does_not_change_focus(monkeypatch):
    collection, factory = _factory(monkeypatch, candidates=2)
    runtime = type("Runtime", (), {"provider_key": "configured", "model": "conversation"})()
    monkeypatch.setattr(collection, "configured_model_roles", lambda: {"conversation": runtime, "fallback": None})
    with factory() as db:
        db.add(ConversationMessageDB(conversation_id="conv-many", role="founder", content="打开那个任务")); db.commit()
    before = collection.build_conversation_tasks("conv-many")["focused_task_id"]
    result = collection.resolve_task_navigation("conv-many", generator=lambda *_: {
        "navigation_intent": "ambiguous", "task_ref": None,
        "ambiguous_task_refs": ["candidate:candidate-0", "candidate:candidate-1"]})
    assert result["status"] == "ambiguous"
    assert result["focused_task_id"] == before


def test_completed_task_remains_retrievable(monkeypatch):
    collection, factory = _factory(monkeypatch, tasks=1)
    with factory() as db:
        task = db.get(TaskAssetDB, "task-0"); task.status = "completed"; task.execution_status = "completed"; db.commit()
    result = collection.build_conversation_tasks("conv-many")
    assert result["completed_tasks"][0]["task_ref"] == "task-0"
