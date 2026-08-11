"""Persistent in-process bridge from Founder approval to Codex execution."""

from collections import deque
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import subprocess
from threading import Condition, Event, Lock, Thread
from typing import Callable

from app.core.artifact.service import create_artifact
from app.founder_ai.codex_adapter import SubprocessCodexAdapter
from app.founder_ai.execution_loop import FounderExecutionLoop
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions, save_execution_session
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

    def enqueue(self, execution_id: str, *, created_at: datetime | None = None) -> ExecutionQueueItem:
        with self._condition:
            existing = self._items.get(execution_id)
            if existing is not None:
                return existing
            item = ExecutionQueueItem(execution_id, created_at=created_at)
            self._items[execution_id] = item
            self._pending.append(execution_id)
            self._condition.notify()
            return item

    def requeue(self, execution_id: str, *, created_at: datetime | None = None) -> ExecutionQueueItem:
        with self._condition:
            item = self._items.get(execution_id)
            if item is None:
                item = ExecutionQueueItem(execution_id, created_at=created_at)
                self._items[execution_id] = item
            item.status = "queued"
            item.created_at = created_at or _now()
            item.started_at = None
            item.completed_at = None
            if execution_id not in self._pending:
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
        self._recover_sessions()
        self._thread = Thread(target=self._consume, name="sino-execution-worker", daemon=True)
        self._thread.start()
        logger.info("Founder execution worker started")

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
            session.started_at = session.started_at or _now().isoformat()
            append_event(session, "worker_started", status="executing", message="Execution worker started", timestamp=session.started_at)
            save_execution_session(session, package)
            logger.info("Execution worker started execution_id=%s", execution_id)
            loop = FounderExecutionLoop(self.adapter, on_status=lambda status: self._on_status(execution_id, status))
            session, artifact_draft, memory_draft = loop.run(session, package, cwd=self.project_root, defer_completion=True)
            # Do not expose completion until callback assets and memories are durable.
            artifact = self.artifact_writer(
                artifact_type="execution_result",
                title=f"Execution {execution_id}",
                description=artifact_draft.result_summary,
                content_ref=json.dumps({"execution_id": execution_id, "commit_hash": artifact_draft.commit_hash, "files": artifact_draft.changed_files}, ensure_ascii=False),
                task_asset_id=session.task_asset_id,
            )
            append_event(
                session,
                "artifact_saved",
                status="testing",
                message=f"Execution artifact saved: {artifact.id}",
                metadata={"artifact_id": artifact.id},
            )
            save_execution_session(session, package)
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
            append_event(
                session,
                "memory_saved",
                status="testing",
                message="Decision, learning and execution memories saved",
                metadata={"memory_ids": dict(session.memory)},
            )
            save_execution_session(session, package)
            session.completed_at = _now().isoformat()
            session.status = "completed"
            append_event(session, "completed", status="completed", message="Artifact and memory persistence completed", timestamp=session.completed_at)
            save_execution_session(session, package)
            self.queue.transition(execution_id, "completed")
            logger.info("Execution completed execution_id=%s", execution_id)
        except Exception as error:
            previous_event = session.events[-1] if session.events else None
            result = session.result or {}
            session.status = "failed"
            session.error_message = str(error)
            session.failure_reason = str(error)
            session.recoverable = False
            session.completed_at = _now().isoformat()
            append_event(
                session,
                "failed",
                status="failed",
                message=f"Execution failed: {error}",
                timestamp=session.completed_at,
                metadata={
                    "failure_reason": str(error),
                    "last_event": previous_event,
                    "current_stage": previous_event.get("event_name") if previous_event else session.current_stage,
                    "stderr_summary": str(result.get("stderr") or "")[-2000:],
                    "exit_code": result.get("exit_code"),
                },
            )
            save_execution_session(session, package)
            self.queue.transition(execution_id, "failed")
            logger.exception("Founder execution %s failed", execution_id)

    def _on_status(self, execution_id: str, status: str):
        record = get_execution_session(execution_id)
        if record is None:
            return
        session, package = record
        if status == "testing":
            self.queue.transition(execution_id, "testing")
        if status in {"executing", "testing"}:
            save_execution_session(session, package)

    def _recover_sessions(self):
        for session in list_execution_sessions():
            record = get_execution_session(session.id)
            if record is None:
                continue
            _, package = record
            if session.status in {"approved", "queued"} and package.execution_allowed:
                queued_at = _parse_time(session.queued_at)
                item = self.queue.enqueue(session.id, created_at=queued_at)
                session.status = "queued"
                session.queued_at = session.queued_at or item.created_at.isoformat()
                if not any(log.get("stage") == "queued" for log in session.execution_logs):
                    append_event(session, "queued", status="queued", message="Execution restored to worker queue", timestamp=session.queued_at)
                save_execution_session(session, package)
            elif session.status in {"executing", "testing"}:
                interrupted_status = session.status
                session.status = "paused"
                session.pause_reason = "Backend restarted"
                session.recoverable = not any((session.result, session.artifact, session.memory))
                session.error_message = None
                session.failure_reason = None
                session.completed_at = None
                append_event(
                    session,
                    "backend_restarted",
                    status="paused",
                    message="Backend restarted during execution; review and resume when safe",
                    metadata={"interrupted_status": interrupted_status, "recoverable": session.recoverable},
                )
                save_execution_session(session, package)


execution_queue = ExecutionQueue()
execution_worker = ExecutionWorker(queue=execution_queue, project_root=Path(__file__).resolve().parents[3])


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def enqueue_execution(execution_id: str) -> ExecutionQueueItem:
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Execution session not found")
    session, package = record
    if session.status not in {"approved", "queued"} or not package.execution_allowed:
        raise PermissionError("Founder approval is required before execution")
    item = execution_queue.enqueue(execution_id, created_at=_parse_time(session.queued_at))
    session.status = "queued"
    session.queued_at = session.queued_at or item.created_at.isoformat()
    if not any(log.get("stage") == "queued" for log in session.execution_logs):
        append_event(session, "queued", status="queued", message="Execution queued for worker", timestamp=session.queued_at)
    save_execution_session(session, package)
    return item


def _workspace_is_resumable(project_root: Path) -> bool:
    result = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=str(project_root),
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def resume_execution(execution_id: str) -> ExecutionQueueItem:
    record = get_execution_session(execution_id)
    if record is None:
        raise LookupError("Execution session not found")
    session, package = record
    if session.status != "paused":
        raise ValueError("only paused executions can be resumed")
    if not package.execution_allowed:
        raise PermissionError("Founder approval is required before resuming execution")
    if any((session.result, session.artifact, session.memory)):
        session.recoverable = False
        save_execution_session(session, package)
        raise RuntimeError("Execution has partial durable results and requires manual review")
    if not _workspace_is_resumable(execution_worker.project_root):
        raise RuntimeError("Git workspace is unavailable for execution recovery")

    item = execution_queue.requeue(execution_id)
    session.status = "queued"
    session.queued_at = item.created_at.isoformat()
    session.started_at = None
    session.testing_at = None
    session.completed_at = None
    session.pause_reason = None
    session.recoverable = False
    append_event(
        session,
        "queued",
        status="queued",
        message="Paused execution resumed and queued",
        timestamp=session.queued_at,
        metadata={"resumed": True},
    )
    save_execution_session(session, package)
    return item
