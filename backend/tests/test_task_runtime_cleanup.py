from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB


def test_cleanup_preserves_conversation_and_sets_derivation_watermark(monkeypatch):
    import app.founder_ai.task_runtime_cleanup as cleanup
    import app.founder_ai.conversation_task_interaction as interaction
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(cleanup, "SessionLocal", factory)
    monkeypatch.setattr(interaction, "SessionLocal", factory)
    monkeypatch.setattr(cleanup, "clear_execution_registry_runtime", lambda: {"execution_count": 2, "backup_path": None})
    monkeypatch.setattr(cleanup, "finalize_execution_registry_cleanup", lambda _path: None)
    monkeypatch.setattr(cleanup.execution_queue, "clear", lambda: 0)
    with factory() as db:
        db.add(ConversationDB(id="conv-clean", system_id="founder_ai", title="Keep discussion"))
        db.add(ConversationMessageDB(id="message-clean", conversation_id="conv-clean", role="founder", content="mature discussion"))
        db.add(SinoBrainSessionDB(conversation_id="conv-clean", discovery={
            "conversation_core": {"conversation_state": "task_candidate_ready", "updated_at": "v1", "context_updates": {"task_created": True}},
            "task_candidate": {"candidate_id": "candidate-1"}, "task_candidates": [{"candidate_id": "candidate-1"}],
            "founder_action_queue": [{"type": "TASK_CONFIRMATION"}], "focused_task_id": "candidate:candidate-1",
            "task_complexity_route": {"classification": "STANDARD_TASK"}, "current_understanding": {"goal": "preserved"},
        }))
        db.add(TaskAssetDB(id="task-clean", system_id="founder_ai", conversation_id="conv-clean", title="test", scope={}))
        db.commit()
    result = cleanup.cleanup_founder_task_runtime()
    assert result["before"]["task_candidate_count"] == 1
    with factory() as db:
        assert db.query(ConversationDB).count() == 1
        assert db.query(ConversationMessageDB).count() == 1
        assert db.query(TaskAssetDB).count() == 0
        state = db.query(SinoBrainSessionDB).one()
        assert state.discovery["current_understanding"] == {"goal": "preserved"}
        assert state.discovery["task_runtime_cleanup_baseline"]["conversation_core_updated_at"] == "v1"
        assert "task_candidate" not in state.discovery
    assert interaction.reconcile_discussion_task_candidate("conv-clean", generator=lambda *_: (_ for _ in ()).throw(AssertionError("old context must not regenerate"))) is None


def test_new_conversation_core_version_can_generate_after_cleanup(monkeypatch):
    import app.founder_ai.conversation_task_interaction as interaction
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine); factory = sessionmaker(bind=engine)
    monkeypatch.setattr(interaction, "SessionLocal", factory)
    with factory() as db:
        db.add(ConversationDB(id="conv-new", system_id="founder_ai", title="Continue later"))
        db.add(SinoBrainSessionDB(conversation_id="conv-new", discovery={
            "conversation_core": {"conversation_state": "task_candidate_ready", "updated_at": "v2", "context_updates": {"task_created": True}},
            "task_runtime_cleanup_baseline": {"conversation_core_updated_at": "v1"},
        })); db.commit()
    monkeypatch.setattr(interaction, "derive_and_persist_task_candidate", lambda *_args, **_kwargs: {"candidate_id": "new"})
    assert interaction.reconcile_discussion_task_candidate("conv-new")["candidate_id"] == "new"
