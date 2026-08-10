"""Persistent in-process bridge from Founder approval to Codex execution."""

from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from threading import Condition, Event, Lock, Thread
from typing import Callable

from app.core.artifact.service import create_artifact
from app.founder_ai.codex_adapter import SubprocessCodexAdapter
from app.founder_ai.execution_loop import FounderExecutionLoop
from app.founder_ai.execution_registry import get_execution_session
from app.founder_ai.sino_memory import SinoMemoryRepository

logger = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(slots=True)
class ExecutionQueueItem:
    execution_id: str
    status: str = "queued"
    created_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = _now()

    def to_dict(self):
        return asdict(self)


class ExecutionQueue:
    """Thread-safe, idempotent execution queue with observable lifecycle state."""

    def __init__(self):
        self._pending: deque[str] = deque()
        self._items: dict[str, ExecutionQueueItem] = {}
        self._condition = Condition(Lock())

    def enqueue(self, execution_id: str) -> ExecutionQueueItem:
        with self._condition:
            existing = self._items.get(execution_id)
            if existing is not None:
                return existing
            item = ExecutionQueueItem(execution_id)
            self._items[execution_id] = item
            self._pending.append(execution_id)
            self._condition.notify()
            return item

    def pickup(self, timeout: float | None = None) -> ExecutionQueueItem | None:
        with self._condition:
            if not self._pending:
                self._condition.wait(timeout)
            if not self._pending:
                return None
            execution_id = self._pending.popleft()
            return self.transition(execution_id, "running", locked=True)

    def transition(self, execution_id: str, status: str, *, locked: bool = False) -> ExecutionQueueItem:
        if status not in {"queued", "running", "testing", "completed", "failed"}:
            raise ValueError(f"unsupported queue status: {status}")

        def update():
            item = self._items[execution_id]
            item.status = status
            if status == "running" and item.started_at is None:
                item.started_at = _now()
            if status in {"completed", "failed"}:
                item.completed_at = _now()
            return item

        if locked:
            return update()
        with self._condition:
            return update()

    def get(self, execution_id: str) -> ExecutionQueueItem | None:
        with self._condition:
            return self._items.get(execution_id)

    def wake(self):
        with self._condition:
            self._condition.notify_all()


class ExecutionWorker:
    def __init__(self, *, queue: ExecutionQueue, adapter=None, project_root: Path, artifact_writer: Callable = create_artifact, memory_repository=None):
        self.queue = queue
        self.adapter = adapter or SubprocessCodexAdapter()
        self.project_root = project_root.resolve()
        self.artifact_writer = artifact_writer
        self.memory_repository = memory_repository or SinoMemoryRepository()
        self._stop = Event()
        self._thread: Thread | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = Thread(target=self._consume, name="sino-execution-worker", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self.queue.wake()
        if self._thread:
            self._thread.join(timeout=5)

    def _consume(self):
        while not self._stop.is_set():
            item = self.queue.pickup(timeout=0.5)
            if item is not None:
                self.run_item(item.execution_id)

    def run_item(self, execution_id: str):
        record = get_execution_session(execution_id)
        if record is None:
            self.queue.transition(execution_id, "failed")
            return
        session, package = record
        try:
            session.started_at = _now().isoformat()
            loop = FounderExecutionLoop(self.adapter, on_status=lambda status: self._on_status(execution_id, status))
            session, artifact_draft, memory_draft = loop.run(session, package, cwd=self.project_root)
            # Do not expose completion until callback assets and memories are durable.
            session.status = "testing"
            artifact = self.artifact_writer(
                artifact_type="execution_result",
                title=f"Execution {execution_id}",
                description=artifact_draft.result_summary,
                content_ref=json.dumps({"execution_id": execution_id, "commit_hash": artifact_draft.commit_hash, "files": artifact_draft.changed_files}, ensure_ascii=False),
                task_asset_id=session.task_asset_id,
            )
            decision = self.memory_repository.save_decision(title=f"Execution decision {execution_id}", decision={"decision": memory_draft.decision, "execution_id": execution_id})
            learning = self.memory_repository.save_learning(title=f"Execution learning {execution_id}", learning={"learning": memory_draft.learning, "execution_id": execution_id}, task_asset_id=session.task_asset_id)
            execution_memory = self.memory_repository.save_execution_result(title=f"Execution result {execution_id}", result={**(session.result or {}), "commit_hash": session.commit_hash}, task_asset_id=session.task_asset_id, artifact_id=artifact.id)
            session.artifact = {
                "id": artifact.id,
                "execution_id": artifact_draft.execution_id,
                "commit_hash": artifact_draft.commit_hash,
                "files": artifact_draft.changed_files,
                "summary": artifact_draft.result_summary,
            }
            session.memory = {"decision": decision.id, "learning": learning.id, "execution_result": execution_memory.id}
            session.completed_at = _now().isoformat()
            session.status = "completed"
            self.queue.transition(execution_id, "completed")
        except Exception as error:
            session.status = "failed"
            session.error_message = str(error)
            session.completed_at = _now().isoformat()
            self.queue.transition(execution_id, "failed")
            logger.exception("Founder execution %s failed", execution_id)

    def _on_status(self, execution_id: str, status: str):
        if status == "testing":
            self.queue.transition(execution_id, "testing")


execution_queue = ExecutionQueue()
execution_worker = ExecutionWorker(queue=execution_queue, project_root=Path(__file__).resolve().parents[3])


def enqueue_execution(execution_id: str) -> ExecutionQueueItem:
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Execution session not found")
    session, package = record
    if session.status not in {"approved", "queued"} or not package.execution_allowed:
        raise PermissionError("Founder approval is required before execution")
    item = execution_queue.enqueue(execution_id)
    session.status = "queued"
    return item
