from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace

import app.founder_ai.execution_worker as worker_module
from app.founder_ai.codex_adapter import CodexExecutionResult
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
    assert session.status == "queued"


def test_worker_picks_execution():
    queue = ExecutionQueue()
    queue.enqueue("execution-1")

    item = queue.pickup()

    assert item.execution_id == "execution-1"
    assert item.status == "running"
    assert item.started_at is not None


def test_worker_calls_codex_adapter(monkeypatch, tmp_path: Path):
    _, adapter, _, _, _ = _run_worker(monkeypatch, tmp_path)

    assert len(adapter.calls) == 1
    assert adapter.calls[0][1] == tmp_path


def test_worker_saves_result(monkeypatch, tmp_path: Path):
    queue, _, _, _, session = _run_worker(monkeypatch, tmp_path)

    assert session.status == "completed"
    assert session.result["stdout"] == "implemented and tested"
    assert session.commit_hash == "commit-123"
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
