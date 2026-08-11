from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import app.founder_ai.execution_worker as worker_module
from app.founder_ai.codex_adapter import CodexExecutionResult
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_loop import ExecutionSession
from app.founder_ai.execution_worker import ExecutionQueue, ExecutionWorker
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


class FakeAdapter:
    def __init__(self):
        self.calls = []

    def execute(self, package, *, cwd):
        self.calls.append((package, cwd))
        return CodexExecutionResult("implemented and tested", "", 0, ["backend/app/change.py"], ["pytest"], "commit-123")


class FakeMemoryRepository:
    def __init__(self):
        self.calls = []

    def _save(self, kind, kwargs):
        self.calls.append((kind, kwargs))
        return SimpleNamespace(id=f"memory-{kind}")

    def save_decision(self, **kwargs):
        return self._save("decision", kwargs)

    def save_learning(self, **kwargs):
        return self._save("learning", kwargs)

    def save_execution_result(self, **kwargs):
        return self._save("execution_result", kwargs)


def _run_worker(monkeypatch, tmp_path):
    queue = ExecutionQueue()
    adapter = FakeAdapter()
    memories = FakeMemoryRepository()
    artifacts = []
    session = ExecutionSession("execution-1", "task-1", "package-1", status="queued")
    session.approved_at = "2026-08-11T01:00:00+00:00"
    session.queued_at = "2026-08-11T01:00:01+00:00"
    append_event(session, "approved", status="approved", message="Founder approval granted", timestamp=session.approved_at)
    append_event(session, "queued", status="queued", message="Execution queued for worker", timestamp=session.queued_at)
    package = replace(build_execution_package(generate_task_asset_draft("Implement bridge")), execution_allowed=True)
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))

    def save_artifact(**kwargs):
        artifacts.append(kwargs)
        return SimpleNamespace(id="artifact-1")

    worker = ExecutionWorker(queue=queue, adapter=adapter, project_root=tmp_path, artifact_writer=save_artifact, memory_repository=memories)
    queue.enqueue(session.id)
    queue.pickup()
    worker.run_item(session.id)
    return queue, adapter, memories, artifacts, session


def test_approved_session_enters_queue(monkeypatch):
    queue = ExecutionQueue()
    session = ExecutionSession("execution-1", "task-1", "package-1", status="approved")
    package = replace(build_execution_package(generate_task_asset_draft("Implement bridge")), execution_allowed=True)
    monkeypatch.setattr(worker_module, "execution_queue", queue)
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))

    item = worker_module.enqueue_execution("execution-1")

    assert item.status == "queued"
    assert item.created_at is not None
    assert session.approved_at is None
    assert session.queued_at == item.created_at.isoformat()
    assert session.status == "queued"


def test_worker_picks_execution():
    queue = ExecutionQueue()
    queue.enqueue("execution-1")

    item = queue.pickup()

    assert item.execution_id == "execution-1"
    assert item.status == "running"
    assert item.started_at is not None


def test_worker_recovers_persisted_queued_session(monkeypatch, tmp_path: Path):
    queue = ExecutionQueue()
    queued_at = "2026-08-10T01:00:01+00:00"
    session = ExecutionSession("execution-restored", "task-1", "package-1", status="queued", queued_at=queued_at)
    package = replace(build_execution_package(generate_task_asset_draft("Restore execution")), execution_allowed=True)
    saved = []
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda current, current_package: saved.append((current, current_package)))
    worker = ExecutionWorker(queue=queue, adapter=FakeAdapter(), project_root=tmp_path)

    worker._recover_sessions()

    restored = queue.get(session.id)
    assert restored is not None
    assert restored.status == "queued"
    assert restored.created_at.isoformat() == queued_at
    assert session.queued_at == queued_at
    assert saved


def test_worker_calls_codex_adapter(monkeypatch, tmp_path: Path):
    _, adapter, _, _, _ = _run_worker(monkeypatch, tmp_path)

    assert len(adapter.calls) == 1
    assert adapter.calls[0][1] == tmp_path


def test_worker_saves_result(monkeypatch, tmp_path: Path):
    queue, _, _, _, session = _run_worker(monkeypatch, tmp_path)

    assert session.status == "completed"
    assert session.result["stdout"] == "implemented and tested"
    assert session.commit_hash == "commit-123"
    assert session.started_at is not None
    assert session.testing_at is not None
    assert session.completed_at is not None
    assert queue.get(session.id).status == "completed"
    assert [entry["event_name"] for entry in session.events] == [
        "approved",
        "queued",
        "worker_started",
        "codex_started",
        "codex_finished",
        "testing_started",
        "testing_finished",
        "artifact_saved",
        "memory_saved",
        "completed",
    ]
    assert all(
        set(event) == {"event_id", "execution_id", "event_name", "timestamp", "status", "message", "metadata"}
        for event in session.events
    )
    assert all(event["execution_id"] == session.id for event in session.events)


def test_worker_persists_queued_executing_testing_completed_lifecycle(monkeypatch, tmp_path: Path):
    persisted = []
    original_save = worker_module.save_execution_session

    def capture_save(session, package):
        persisted.append((session.status, session.started_at, session.testing_at, session.completed_at))
        original_save(session, package)

    monkeypatch.setattr(worker_module, "save_execution_session", capture_save)
    queue, _, _, _, session = _run_worker(monkeypatch, tmp_path)

    statuses = [status for status, *_ in persisted]
    assert statuses[0] == "queued"
    assert "executing" in statuses
    assert "testing" in statuses
    assert statuses[-1] == "completed"
    assert session.started_at and session.testing_at and session.completed_at
    assert queue.get(session.id).status == "completed"


def test_worker_generates_artifact(monkeypatch, tmp_path: Path):
    _, _, _, artifacts, session = _run_worker(monkeypatch, tmp_path)

    assert artifacts[0]["content_ref"]
    assert session.artifact["id"] == "artifact-1"
    assert session.artifact["files"] == ["backend/app/change.py"]


def test_worker_generates_decision_learning_and_execution_memory(monkeypatch, tmp_path: Path):
    _, _, memories, _, session = _run_worker(monkeypatch, tmp_path)

    assert [kind for kind, _ in memories.calls] == ["decision", "learning", "execution_result"]
    assert session.memory == {"decision": "memory-decision", "learning": "memory-learning", "execution_result": "memory-execution_result"}


def _run_failed_worker(monkeypatch, tmp_path, *, adapter=None, artifact_writer=None, memory_repository=None):
    queue = ExecutionQueue()
    session = ExecutionSession("execution-failed", "task-1", "package-1", status="queued")
    package = replace(build_execution_package(generate_task_asset_draft("Fail safely")), execution_allowed=True)
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    worker = ExecutionWorker(
        queue=queue,
        adapter=adapter or FakeAdapter(),
        project_root=tmp_path,
        artifact_writer=artifact_writer or (lambda **_kwargs: SimpleNamespace(id="artifact-1")),
        memory_repository=memory_repository or FakeMemoryRepository(),
    )
    queue.enqueue(session.id)
    queue.pickup()
    worker.run_item(session.id)
    return session, queue


def test_codex_nonzero_exit_records_failed_evidence(monkeypatch, tmp_path: Path):
    class FailedCodex:
        def execute(self, package, *, cwd):
            return CodexExecutionResult("", "compile failed", 2, [], ["pytest"], None)

    session, queue = _run_failed_worker(monkeypatch, tmp_path, adapter=FailedCodex())

    assert session.status == "failed"
    assert session.failure_reason == "compile failed"
    assert session.events[-1]["event_name"] == "failed"
    assert session.events[-1]["metadata"]["exit_code"] == 2
    assert session.events[-1]["metadata"]["stderr_summary"] == "compile failed"
    assert session.events[-1]["metadata"]["last_event"]["event_name"] == "codex_finished"
    assert queue.get(session.id).status == "failed"


def test_artifact_writer_failure_cannot_complete(monkeypatch, tmp_path: Path):
    def fail_artifact(**_kwargs):
        raise RuntimeError("artifact storage unavailable")

    session, _ = _run_failed_worker(monkeypatch, tmp_path, artifact_writer=fail_artifact)

    assert session.status == "failed"
    assert "artifact_saved" not in [event["event_name"] for event in session.events]
    assert "completed" not in [event["event_name"] for event in session.events]
    assert session.events[-1]["metadata"]["current_stage"] == "testing_finished"


def test_memory_writer_failure_cannot_complete(monkeypatch, tmp_path: Path):
    class FailedMemory(FakeMemoryRepository):
        def save_decision(self, **kwargs):
            raise RuntimeError("memory storage unavailable")

    session, _ = _run_failed_worker(monkeypatch, tmp_path, memory_repository=FailedMemory())
    names = [event["event_name"] for event in session.events]

    assert session.status == "failed"
    assert "artifact_saved" in names
    assert "memory_saved" not in names
    assert "completed" not in names


def test_backend_restart_pauses_inflight_session(monkeypatch, tmp_path: Path):
    session = ExecutionSession("execution-paused", "task-1", "package-1", status="executing")
    package = replace(build_execution_package(generate_task_asset_draft("Recover safely")), execution_allowed=True)
    saved = []
    monkeypatch.setattr(worker_module, "list_execution_sessions", lambda: [session])
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: saved.append(session.status))

    ExecutionWorker(queue=ExecutionQueue(), adapter=FakeAdapter(), project_root=tmp_path)._recover_sessions()

    assert session.status == "paused"
    assert session.pause_reason == "Backend restarted"
    assert session.recoverable is True
    assert session.events[-1]["event_name"] == "backend_restarted"
    assert saved[-1] == "paused"


def test_resume_paused_execution_restores_queue(monkeypatch, tmp_path: Path):
    queue = ExecutionQueue()
    session = ExecutionSession("execution-paused", "task-1", "package-1", status="paused", pause_reason="Backend restarted", recoverable=True)
    package = replace(build_execution_package(generate_task_asset_draft("Resume safely")), execution_allowed=True)
    monkeypatch.setattr(worker_module, "execution_queue", queue)
    monkeypatch.setattr(worker_module, "execution_worker", SimpleNamespace(project_root=tmp_path))
    monkeypatch.setattr(worker_module, "get_execution_session", lambda _execution_id: (session, package))
    monkeypatch.setattr(worker_module, "save_execution_session", lambda *_args: None)
    monkeypatch.setattr(worker_module, "_workspace_is_resumable", lambda _root: True)

    item = worker_module.resume_execution(session.id)

    assert item.status == "queued"
    assert session.status == "queued"
    assert session.pause_reason is None
    assert session.events[-1]["event_name"] == "queued"
    assert session.events[-1]["metadata"] == {"resumed": True}
