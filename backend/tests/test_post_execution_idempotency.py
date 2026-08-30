from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database.base import Base
from app.core.artifact.model import ArtifactAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_worker import ExecutionQueue, ExecutionWorker
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft
from app.founder_ai.codex_adapter import CodexExecutionResult


def _factory(monkeypatch):
    import app.core.artifact.service as artifact_service
    import app.core.memory.service as memory_service

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(artifact_service, "SessionLocal", factory)
    monkeypatch.setattr(memory_service, "SessionLocal", factory)
    with factory() as db:
        db.add(TaskAssetDB(
            id="task-r4", system_id="founder_ai", title="R4 fixture",
            scope={"candidate_authority": {"candidate_id": "candidate-r4",
                                           "canonical_fingerprint": "fingerprint-r4"}},
        ))
        db.commit()
    return artifact_service, memory_service, factory


def _package():
    draft = replace(generate_task_asset_draft("R4 fixture"), conversation_id="conv-r4")
    return replace(build_execution_package(draft), execution_allowed=True)


def test_completed_duplicate_run_is_terminal_noop(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module

    queue = ExecutionQueue(); queue.enqueue("execution-r4"); queue.transition("execution-r4", "running")
    queue.transition("execution-r4", "completed")
    result = {"status": "completed", "verification": {"status": "PASS"}}
    session = ExecutionSession("execution-r4", "task-r4", "package-r4", status="completed", result=result)
    package = _package()
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: (_ for _ in ()).throw(
        AssertionError("terminal duplicate must not write session")))
    adapter = SimpleNamespace(execute=lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("terminal duplicate must not execute adapter")))
    worker = ExecutionWorker(
        queue=queue, adapter=adapter, project_root=tmp_path,
        artifact_writer=lambda **_kwargs: (_ for _ in ()).throw(
            AssertionError("terminal duplicate must not create artifact")),
        memory_repository=SimpleNamespace(),
    )

    returned = worker.run_item(session.id)

    assert returned is session
    assert session.status == "completed" and session.result == result
    assert queue.get(session.id).status == "completed"


def test_failed_blocked_and_cancelled_late_callbacks_are_noops(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module

    package = _package()
    for terminal in ("failed", "blocked", "cancelled"):
        queue = ExecutionQueue(); queue.enqueue(f"execution-{terminal}")
        session = ExecutionSession(f"execution-{terminal}", "task-r4", "package-r4",
                                   status=terminal, failure_reason=f"original-{terminal}")
        monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id, current=session: (current, package))
        worker = ExecutionWorker(queue=queue, project_root=tmp_path)
        returned = worker.run_item(session.id)
        assert returned is session
        assert session.status == terminal
        assert session.failure_reason == f"original-{terminal}"
        assert queue.get(session.id).status == "failed"


def test_artifact_is_idempotent_per_execution_and_type_and_restores(monkeypatch):
    artifact_service, _memory_service, factory = _factory(monkeypatch)
    kwargs = dict(
        artifact_type="execution_result", title="Execution R4", task_asset_id="task-r4",
        content_ref='{"execution_id":"execution-r4"}',
        idempotency_key="execution:execution-r4:execution_result",
    )
    first = artifact_service.create_artifact(**kwargs)
    duplicate = artifact_service.create_artifact(**kwargs)
    with factory() as db:
        restored = db.get(ArtifactAssetDB, first.id)
        assert db.scalar(select(ArtifactAssetDB)).id == first.id
        assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
        assert restored.task_asset_id == "task-r4"
    assert duplicate.id == first.id


def test_memory_is_idempotent_per_execution_and_type_but_types_remain_distinct(monkeypatch):
    _artifact_service, memory_service, factory = _factory(monkeypatch)
    common = {"title": "R4", "content": '{"execution_id":"execution-r4"}',
              "task_asset_id": "task-r4"}
    result = memory_service.create_memory(
        memory_type="execution_result", idempotency_key="execution:execution-r4:execution_result", **common)
    duplicate = memory_service.create_memory(
        memory_type="execution_result", idempotency_key="execution:execution-r4:execution_result", **common)
    learning = memory_service.create_memory(
        memory_type="learning", idempotency_key="execution:execution-r4:learning", **common)
    decision = memory_service.create_memory(
        memory_type="decision", idempotency_key="execution:execution-r4:decision", **common)
    with factory() as db:
        restored = list(db.scalars(select(MemoryAssetDB).order_by(MemoryAssetDB.memory_type)))
        assert len(restored) == 3
        assert {item.memory_type for item in restored} == {"decision", "learning", "execution_result"}
        assert all(item.task_asset_id == "task-r4" for item in restored)
    assert duplicate.id == result.id
    assert len({result.id, learning.id, decision.id}) == 3


def test_sino_memory_repository_preserves_execution_lineage_and_deduplicates(monkeypatch):
    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    from app.founder_ai.sino_memory import SinoMemoryRepository

    repository = SinoMemoryRepository()
    first = repository.save_learning(
        title="Execution learning R4", learning={"execution_id": "execution-r4", "status": "verified"},
        task_asset_id="task-r4", source_execution_id="execution-r4",
    )
    duplicate = repository.save_learning(
        title="Execution learning R4", learning={"execution_id": "execution-r4", "status": "verified"},
        task_asset_id="task-r4", source_execution_id="execution-r4",
    )
    with factory() as db:
        records = list(db.scalars(select(MemoryAssetDB)))
        assert len(records) == 1
        assert records[0].task_asset_id == "task-r4"
        assert "execution-r4" in records[0].content
        task = db.get(TaskAssetDB, records[0].task_asset_id)
        assert task.scope["candidate_authority"]["canonical_fingerprint"] == "fingerprint-r4"
    assert first.id == duplicate.id


def test_partial_write_retry_reuses_artifact_and_prior_memory(monkeypatch):
    artifact_service, memory_service, factory = _factory(monkeypatch)
    artifact_kwargs = dict(
        artifact_type="execution_result", title="Execution R4", task_asset_id="task-r4",
        content_ref='{"execution_id":"execution-r4"}',
        idempotency_key="execution:execution-r4:execution_result",
    )
    artifact = artifact_service.create_artifact(**artifact_kwargs)
    decision = memory_service.create_memory(
        memory_type="decision", title="R4 decision", content='{"execution_id":"execution-r4"}',
        task_asset_id="task-r4", idempotency_key="execution:execution-r4:decision",
    )
    assert artifact_service.create_artifact(**artifact_kwargs).id == artifact.id
    assert memory_service.create_memory(
        memory_type="decision", title="R4 decision", content='{"execution_id":"execution-r4"}',
        task_asset_id="task-r4", idempotency_key="execution:execution-r4:decision",
    ).id == decision.id
    with factory() as db:
        assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
        assert len(list(db.scalars(select(MemoryAssetDB)))) == 1


def test_completed_and_failed_terminal_truth_restore_without_replay(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_registry as registry
    import app.founder_ai.execution_worker as worker_module

    old_sessions, old_packages = dict(registry._sessions), dict(registry._packages)
    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(tmp_path / "registry.json"))
    try:
        registry._sessions.clear(); registry._packages.clear()
        package = _package()
        completed = ExecutionSession(
            "execution-restored-completed", "task-r4", "package-r4", status="completed",
            result={"status": "completed", "verification": {"status": "PASS"}},
            artifact={"id": "artifact-r4"}, memory={"learning": "memory-learning-r4"},
        )
        failed = ExecutionSession(
            "execution-restored-failed", "task-r4", "package-r4-failed", status="failed",
            result={"failure_type": "adapter_failure"}, failure_reason="adapter unavailable",
        )
        registry.save_execution_session(completed, package)
        registry.save_execution_session(failed, package)
        registry._sessions.clear(); registry._packages.clear(); registry.load_execution_sessions()
        restored_completed, _ = registry.get_execution_session(completed.id)
        restored_failed, _ = registry.get_execution_session(failed.id)
        assert restored_completed.status == "completed"
        assert restored_completed.result == completed.result
        assert restored_completed.artifact == completed.artifact
        assert restored_completed.memory == completed.memory
        assert restored_failed.status == "failed"
        assert restored_failed.failure_reason == "adapter unavailable"
        queue = ExecutionQueue(); queue.enqueue(completed.id); queue.enqueue(failed.id)
        worker = ExecutionWorker(queue=queue, project_root=tmp_path)
        assert worker.run_item(completed.id).status == "completed"
        assert worker.run_item(failed.id).status == "failed"
        assert queue.get(completed.id).status == "completed"
        assert queue.get(failed.id).status == "failed"
    finally:
        registry._sessions.clear(); registry._sessions.update(old_sessions)
        registry._packages.clear(); registry._packages.update(old_packages)


def test_worker_retries_partial_memory_write_without_duplicate_artifact_or_memory(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    from app.core.artifact.service import create_artifact
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    package = _package()
    package = replace(package, task_asset=replace(package.task_asset, conversation_id=None))
    session = ExecutionSession("execution-r4-partial", "task-r4", "package-r4", status="queued")
    queue = ExecutionQueue(); queue.enqueue(session.id); queue.pickup()
    saved = []
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda current, _package: saved.append(current.status))

    class Adapter:
        def execute(self, _package, *, cwd):
            return CodexExecutionResult(
                "implemented and tested", "", 0, ["backend/app/change.py"], ["pytest"], "commit-r4",
            )

    class FailLearningOnce(SinoMemoryRepository):
        def __init__(self):
            self.failed = False

        def save_learning(self, **kwargs):
            if not self.failed:
                self.failed = True
                raise RuntimeError("transient learning write failure")
            return super().save_learning(**kwargs)

    worker = ExecutionWorker(
        queue=queue, adapter=Adapter(), project_root=tmp_path,
        artifact_writer=create_artifact, memory_repository=FailLearningOnce(),
    )
    worker.run_item(session.id)

    assert session.status == "completed"
    with factory() as db:
        artifacts = list(db.scalars(select(ArtifactAssetDB)))
        memories = list(db.scalars(select(MemoryAssetDB)))
        assert len(artifacts) == 1
        assert len(memories) == 3
        assert {item.memory_type for item in memories} == {"decision", "learning", "execution_result"}
    assert [event["event_name"] for event in session.events].count("artifact_saved") == 1
    assert [event["event_name"] for event in session.events].count("memory_saved") == 1


def _verified_partial_session(execution_id="execution-r4-restart"):
    return ExecutionSession(
        execution_id, "task-r4", "package-r4", status="testing",
        commit_hash="commit-r4",
        result={
            "stdout": "implemented and verified",
            "changed_files": ["backend/app/change.py"],
            "post_implementation_verification": {"status": "VERIFIED"},
            "scope_verification": {"status": "PASS"},
        },
    )


def test_restart_resumes_artifact_only_partial_write_without_adapter_reexecution(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    from app.core.artifact.service import create_artifact
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    session = _verified_partial_session()
    artifact = create_artifact(
        artifact_type="execution_result", title="Execution restart", task_asset_id="task-r4",
        content_ref='{"execution_id":"execution-r4-restart"}',
        idempotency_key="execution:execution-r4-restart:execution_result",
    )
    session.artifact = {"id": artifact.id, "execution_id": session.id}
    saved = []
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda current, _package: saved.append(current.status))
    adapter = SimpleNamespace(execute=lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("post-execution recovery must not execute the business adapter")))
    queue = ExecutionQueue()
    worker = ExecutionWorker(
        queue=queue, adapter=adapter, project_root=tmp_path,
        artifact_writer=create_artifact, memory_repository=SinoMemoryRepository(),
    )

    worker._recover_sessions()
    assert session.status == "testing" and session.recoverable is True
    assert queue.pickup().execution_id == session.id
    returned = worker.run_item(session.id)

    assert returned.status == "completed"
    assert returned.result["post_implementation_verification"]["status"] == "VERIFIED"
    with factory() as db:
        assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
        memories = list(db.scalars(select(MemoryAssetDB)))
        assert len(memories) == 3
        assert {item.memory_type for item in memories} == {"decision", "learning", "execution_result"}
    assert worker.run_item(session.id).status == "completed"


def test_registry_restore_resumes_partial_post_execution_in_new_runtime(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_registry as registry
    from app.core.artifact.service import create_artifact
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    session = _verified_partial_session("execution-r4-registry-restart")
    artifact = create_artifact(
        artifact_type="execution_result", title="Execution restart", task_asset_id="task-r4",
        content_ref='{"execution_id":"execution-r4-registry-restart"}',
        idempotency_key="execution:execution-r4-registry-restart:execution_result",
    )
    session.artifact = {"id": artifact.id, "execution_id": session.id}
    old_sessions, old_packages = dict(registry._sessions), dict(registry._packages)
    monkeypatch.setenv("FOUNDER_EXECUTION_REGISTRY_PATH", str(tmp_path / "registry.json"))
    try:
        registry._sessions.clear(); registry._packages.clear()
        registry.save_execution_session(session, package)
        registry._sessions.clear(); registry._packages.clear()
        registry.load_execution_sessions()
        restored, _ = registry.get_execution_session(session.id)
        assert restored is not session

        queue = ExecutionQueue()
        worker = ExecutionWorker(
            queue=queue, adapter=SimpleNamespace(execute=lambda *_args, **_kwargs: (_ for _ in ()).throw(
                AssertionError("restored post-execution recovery must not execute adapter"))),
            project_root=tmp_path, artifact_writer=create_artifact,
            memory_repository=SinoMemoryRepository(),
        )
        worker._recover_sessions(); queue.pickup(); worker.run_item(restored.id)

        restored_again, _ = registry.get_execution_session(restored.id)
        assert restored_again.status == "completed"
        assert restored_again.result["post_implementation_verification"]["status"] == "VERIFIED"
        with factory() as db:
            assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
            assert len(list(db.scalars(select(MemoryAssetDB)))) == 3
    finally:
        registry._sessions.clear(); registry._sessions.update(old_sessions)
        registry._packages.clear(); registry._packages.update(old_packages)


def test_post_execution_resume_failure_survives_second_restart_and_reuses_partial_records(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    from app.core.artifact.service import create_artifact
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    session = _verified_partial_session("execution-r4-double-restart")
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)

    class FailLearning(SinoMemoryRepository):
        def save_learning(self, **kwargs):
            raise RuntimeError("learning store unavailable")

    first_queue = ExecutionQueue()
    first_worker = ExecutionWorker(
        queue=first_queue, project_root=tmp_path, artifact_writer=create_artifact,
        memory_repository=FailLearning(),
    )
    first_worker._recover_sessions(); first_queue.pickup()
    first_worker.run_item(session.id)
    assert session.status == "testing"
    assert session.recoverable is True
    assert session.failure_reason == "POST_EXECUTION_PERSISTENCE_INTERRUPTED"

    second_queue = ExecutionQueue()
    second_worker = ExecutionWorker(
        queue=second_queue, project_root=tmp_path, artifact_writer=create_artifact,
        memory_repository=SinoMemoryRepository(),
    )
    second_worker._recover_sessions(); second_queue.pickup()
    second_worker.run_item(session.id)

    assert session.status == "completed"
    with factory() as db:
        assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
        memories = list(db.scalars(select(MemoryAssetDB)))
        assert len(memories) == 3
        assert {item.memory_type for item in memories} == {"decision", "learning", "execution_result"}


def test_restart_resumes_after_artifact_and_prior_memory_without_duplicates(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    from app.core.artifact.service import create_artifact
    from app.core.memory.service import create_memory
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    session = _verified_partial_session("execution-r4-memory-restart")
    artifact = create_artifact(
        artifact_type="execution_result", title="Execution restart", task_asset_id="task-r4",
        content_ref='{"execution_id":"execution-r4-memory-restart"}',
        idempotency_key="execution:execution-r4-memory-restart:execution_result",
    )
    session.artifact = {"id": artifact.id, "execution_id": session.id}
    create_memory(
        memory_type="decision", title="prior decision", content='{"execution_id":"execution-r4-memory-restart"}',
        task_asset_id="task-r4", idempotency_key="execution:execution-r4-memory-restart:decision",
    )
    create_memory(
        memory_type="execution_result", title="prior result", content='{"execution_id":"execution-r4-memory-restart"}',
        task_asset_id="task-r4", artifact_id=artifact.id,
        idempotency_key="execution:execution-r4-memory-restart:execution_result",
    )
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    queue = ExecutionQueue()
    worker = ExecutionWorker(
        queue=queue, adapter=SimpleNamespace(execute=lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("post-execution recovery must not execute the business adapter"))),
        project_root=tmp_path, artifact_writer=create_artifact,
        memory_repository=SinoMemoryRepository(),
    )

    worker._recover_sessions(); queue.pickup(); worker.run_item(session.id)

    assert session.status == "completed"
    with factory() as db:
        assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
        memories = list(db.scalars(select(MemoryAssetDB)))
        assert len(memories) == 3
        assert {item.memory_type for item in memories} == {"decision", "learning", "execution_result"}


def test_restart_does_not_resume_failed_unverified_or_nonrecoverable_blocked_sessions(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module

    package = _package()
    sessions = [
        ExecutionSession("execution-failed", "task-r4", "package-r4", status="failed",
                         result={"post_implementation_verification": {"status": "VERIFIED"}}),
        ExecutionSession("execution-unverified", "task-r4", "package-r4", status="testing",
                         result={"post_implementation_verification": {"status": "FAILED"}}),
        ExecutionSession("execution-blocked", "task-r4", "package-r4", status="blocked",
                         result={"post_implementation_verification": {"status": "FAILED"}}),
    ]
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: sessions)
    monkeypatch.setattr(worker_module, "get_execution_session", lambda execution_id: (
        next(item for item in sessions if item.id == execution_id), package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    adapter = SimpleNamespace(execute=lambda *_args, **_kwargs: (_ for _ in ()).throw(
        AssertionError("failed or unverified sessions must not execute")))
    queue = ExecutionQueue()
    worker = ExecutionWorker(queue=queue, adapter=adapter, project_root=tmp_path)

    worker._recover_sessions()

    assert sessions[0].status == "failed"
    assert sessions[1].status == "blocked" and sessions[1].failure_reason == "PIPELINE_STALLED"
    assert sessions[2].status == "blocked"
    assert queue.get(sessions[0].id) is None
    assert queue.get(sessions[1].id) is None
    assert queue.get(sessions[2].id) is None


def test_recovery_runs_shared_reconciliation_and_both_reusable_learning_stages(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    import app.founder_ai.reusable_asset_bootstrap as reusable_module
    from app.core.artifact.service import create_artifact
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _factory(monkeypatch)
    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    session = _verified_partial_session("execution-r4-learning-continuation")
    calls = {"adapter": 0, "reconcile": 0, "popover": 0, "decision": 0}
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    monkeypatch.setattr(reusable_module, "extract_historical_anchored_popover_asset",
                        lambda **_kwargs: calls.__setitem__("popover", calls["popover"] + 1))
    monkeypatch.setattr(reusable_module, "extract_historical_interaction_surface_decision",
                        lambda **_kwargs: calls.__setitem__("decision", calls["decision"] + 1))
    queue = ExecutionQueue(); queue.enqueue(session.id); queue.pickup()
    worker = ExecutionWorker(
        queue=queue,
        adapter=SimpleNamespace(execute=lambda *_args, **_kwargs: calls.__setitem__("adapter", calls["adapter"] + 1)),
        project_root=tmp_path, artifact_writer=create_artifact,
        memory_repository=SinoMemoryRepository(),
    )
    monkeypatch.setattr(worker, "_reconcile_verified_completion",
                        lambda *_args: calls.__setitem__("reconcile", calls["reconcile"] + 1))

    worker.run_item(session.id)

    assert session.status == "completed"
    assert calls == {"adapter": 0, "reconcile": 1, "popover": 1, "decision": 1}
    worker.run_item(session.id)
    assert calls == {"adapter": 0, "reconcile": 1, "popover": 1, "decision": 1}


def test_learning_failure_reopens_completion_and_next_restart_continues_without_duplicates(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    import app.founder_ai.reusable_asset_bootstrap as reusable_module
    from app.core.artifact.service import create_artifact
    from app.founder_ai.sino_memory import SinoMemoryRepository

    _artifact_service, _memory_service, factory = _factory(monkeypatch)
    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    session = _verified_partial_session("execution-r4-learning-restart")
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    attempts = {"popover": 0, "decision": 0}

    def fail_once(**_kwargs):
        attempts["popover"] += 1
        if attempts["popover"] == 1:
            raise RuntimeError("reusable learning unavailable")

    monkeypatch.setattr(reusable_module, "extract_historical_anchored_popover_asset", fail_once)
    monkeypatch.setattr(reusable_module, "extract_historical_interaction_surface_decision",
                        lambda **_kwargs: attempts.__setitem__("decision", attempts["decision"] + 1))
    first_queue = ExecutionQueue(); first_queue.enqueue(session.id); first_queue.pickup()
    first_worker = ExecutionWorker(
        queue=first_queue, project_root=tmp_path, artifact_writer=create_artifact,
        memory_repository=SinoMemoryRepository(),
    )
    first_worker.run_item(session.id)
    assert session.status == "testing" and session.recoverable is True
    assert session.failure_reason == "POST_EXECUTION_PERSISTENCE_INTERRUPTED"
    assert attempts == {"popover": 1, "decision": 0}

    second_queue = ExecutionQueue()
    second_worker = ExecutionWorker(
        queue=second_queue, project_root=tmp_path, artifact_writer=create_artifact,
        memory_repository=SinoMemoryRepository(),
    )
    second_worker._recover_sessions(); second_queue.pickup(); second_worker.run_item(session.id)

    assert session.status == "completed"
    assert attempts == {"popover": 2, "decision": 1}
    with factory() as db:
        assert len(list(db.scalars(select(ArtifactAssetDB)))) == 1
        assert len(list(db.scalars(select(MemoryAssetDB)))) == 3


def test_normal_and_restart_recovery_share_verified_finalization_semantics(monkeypatch, tmp_path: Path):
    import app.founder_ai.execution_worker as worker_module
    import app.founder_ai.reusable_asset_bootstrap as reusable_module

    package = replace(_package(), task_asset=replace(_package().task_asset, conversation_id=None))
    normal = ExecutionSession("execution-normal-equivalence", "task-r4", "package-r4", status="queued")
    recovered = _verified_partial_session("execution-recovery-equivalence")
    sessions = {normal.id: normal, recovered.id: recovered}
    calls = {execution_id: {"reconcile": 0, "popover": 0, "decision": 0} for execution_id in sessions}
    adapter_calls = {normal.id: 0, recovered.id: 0}
    monkeypatch.setattr(worker_module, "get_execution_session", lambda execution_id: (sessions[execution_id], package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    monkeypatch.setattr(reusable_module, "extract_historical_anchored_popover_asset",
                        lambda **kwargs: calls[kwargs["execution_id"]].__setitem__("popover", 1))
    monkeypatch.setattr(reusable_module, "extract_historical_interaction_surface_decision",
                        lambda **kwargs: calls[kwargs["execution_id"]].__setitem__("decision", 1))

    class Adapter:
        def execute(self, _package, *, cwd):
            adapter_calls[normal.id] += 1
            return CodexExecutionResult(
                "implemented and verified", "", 0, ["backend/app/change.py"], ["pytest"], "commit-r4",
            )

    class Memory:
        def save_decision(self, *, source_execution_id, **_kwargs):
            return SimpleNamespace(id=f"decision-{source_execution_id}")
        def save_learning(self, *, source_execution_id, **_kwargs):
            return SimpleNamespace(id=f"learning-{source_execution_id}")
        def save_execution_result(self, *, source_execution_id, **_kwargs):
            return SimpleNamespace(id=f"result-{source_execution_id}")

    for session in (normal, recovered):
        queue = ExecutionQueue(); queue.enqueue(session.id); queue.pickup()
        worker = ExecutionWorker(
            queue=queue, adapter=Adapter(), project_root=tmp_path,
            artifact_writer=lambda id=session.id, **_kwargs: SimpleNamespace(id=f"artifact-{id}"),
            memory_repository=Memory(),
        )
        monkeypatch.setattr(worker, "_reconcile_verified_completion",
                            lambda current, _package, target=session.id: calls[target].__setitem__("reconcile", 1))
        worker.run_item(session.id)

    assert normal.status == recovered.status == "completed"
    assert normal.result["post_implementation_verification"]["status"] == "VERIFIED"
    assert recovered.result["post_implementation_verification"]["status"] == "VERIFIED"
    assert calls[normal.id] == calls[recovered.id] == {"reconcile": 1, "popover": 1, "decision": 1}
    assert adapter_calls == {normal.id: 1, recovered.id: 0}
    assert set(normal.memory) == set(recovered.memory) == {"decision", "learning", "execution_result"}
