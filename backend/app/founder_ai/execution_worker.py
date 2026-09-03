"""Persistent in-process bridge from Founder approval to Codex execution."""

from collections import deque
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import subprocess
from threading import Condition, Event, Lock, Thread
from typing import Callable

from app.core.artifact.service import create_artifact
from app.founder_ai.codex_adapter import SubprocessCodexAdapter
from app.founder_ai.execution_loop import (
    ArtifactAssetDraft,
    ExecutionPausedForDelta,
    ExecutionScopeBlocked,
    FounderExecutionLoop,
)
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_registry import get_execution_session, list_execution_sessions, save_execution_session
from app.founder_ai.sino_memory import SinoMemoryRepository

logger = logging.getLogger(__name__)
TERMINAL_EXECUTION_STATES = {"completed", "failed", "blocked", "cancelled", "canceled"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _project_runtime_truth(conversation_id: str | None) -> None:
    if not conversation_id:
        return
    try:
        from app.founder_ai.conversation_task_interaction import project_execution_events
        project_execution_events(conversation_id)
    except Exception:
        logger.exception("Runtime truth projection failed conversation_id=%s", conversation_id)


def _execution_terminal_summary(session, package) -> str | None:
    if dict(package.context or {}).get("operation_type") != "BOUNDED_CODE_CHANGE":
        return None
    result = dict(session.result or {})
    post = dict(result.get("post_implementation_verification") or {})
    command_evidence = list(result.get("command_verification_evidence") or post.get("evidence") or [])
    test = next((item for item in command_evidence if item.get("verifier") == "targeted_tests"), {})
    build = next((item for item in command_evidence if item.get("verifier") == "build"), {})
    changed = list(result.get("changed_files") or result.get("production_changed_files") or [])
    if session.status == "completed":
        return (
            "受控代码修改和验证已完成。\n\n"
            f"修改文件：{', '.join(changed) or '无'}\n"
            f"测试：{test.get('status') or 'NOT_RECORDED'}\n"
            f"Build：{build.get('status') or 'NOT_RECORDED'}"
        )
    reason = (
        result.get("failure_reason")
        or post.get("failure_reason")
        or session.failure_reason
        or session.error_message
        or "execution failed"
    )
    stage = post.get("stage") or session.current_stage or "execution"
    return (
        f"受控代码修改在 {stage} 阶段失败：{reason}\n\n"
        f"修改文件：{', '.join(changed) or '无'}\n"
        f"测试：{test.get('status') or 'NOT_RUN'}\n"
        f"Build：{build.get('status') or 'NOT_RUN'}"
    )


def _append_execution_terminal_message(session, package) -> None:
    conversation_id = package.task_asset.conversation_id
    if not conversation_id:
        return
    content = _execution_terminal_summary(session, package)
    if not content:
        return
    try:
        from app.database.db import SessionLocal
        from app.core.conversation.model import ConversationDB
        from app.core.conversation_first.model import ConversationMessageDB

        with SessionLocal() as db:
            existing = db.query(ConversationMessageDB).filter_by(
                conversation_id=conversation_id,
                message_type="operational_result",
            ).all()
            if any(dict(item.grounding or {}).get("execution_id") == session.id for item in existing):
                return
            conversation = db.get(ConversationDB, conversation_id)
            if conversation is None:
                return
            db.add(ConversationMessageDB(
                conversation_id=conversation_id,
                role="assistant",
                content=content,
                message_type="operational_result",
                intent="founder_execution_worker",
                grounding={
                    "execution_id": session.id,
                    "task_id": session.task_asset_id,
                    "execution_status": session.status,
                    "post_implementation_verification": dict((session.result or {}).get("post_implementation_verification") or {}),
                },
            ))
            conversation.updated_at = _now()
            db.commit()
    except Exception:
        logger.exception("Execution terminal conversation writeback failed execution_id=%s", session.id)


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
            allowed = {
                "queued": {"running", "failed"},
                "running": {"testing", "completed", "failed"},
                "testing": {"completed", "failed"},
                "completed": set(),
                "failed": set(),
            }
            if status != item.status and status not in allowed[item.status]:
                raise ValueError(f"illegal queue transition: {item.status} -> {status}")
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

    def reconcile_terminal(self, execution_id: str, status: str) -> ExecutionQueueItem | None:
        """Mirror immutable durable terminal truth without replaying lifecycle transitions."""
        if status not in TERMINAL_EXECUTION_STATES:
            raise ValueError(f"not a terminal execution status: {status}")
        with self._condition:
            item = self._items.get(execution_id)
            if item is None:
                return None
            item.status = "completed" if status == "completed" else "failed"
            item.completed_at = item.completed_at or _now()
            self._pending = deque(value for value in self._pending if value != execution_id)
            return item

    def clear(self) -> int:
        with self._condition:
            count = len(self._items)
            self._items.clear()
            self._condition.notify_all()
            return count

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
        self._watchdog_thread: Thread | None = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._recover_sessions()
        self._thread = Thread(target=self._consume, name="sino-execution-worker", daemon=True)
        self._thread.start()
        self._watchdog_thread = Thread(target=self._watchdog, name="sino-execution-watchdog", daemon=True)
        self._watchdog_thread.start()
        logger.info("Founder execution worker started")

    def stop(self):
        self._stop.set()
        self.queue.wake()
        if self._thread:
            self._thread.join(timeout=5)
        if self._watchdog_thread:
            self._watchdog_thread.join(timeout=5)

    def _consume(self):
        while not self._stop.is_set():
            item = self.queue.pickup(timeout=0.5)
            if item is not None:
                self.run_item(item.execution_id)

    @staticmethod
    def _recoverable_post_execution(session) -> bool:
        verification = dict((session.result or {}).get("post_implementation_verification") or {})
        return (
            session.status in {"testing", "blocked"}
            and verification.get("status") == "VERIFIED"
            and session.result is not None
        )

    @staticmethod
    def _restore_post_execution_drafts(session):
        """Rebuild deterministic persistence drafts from the durable verified result."""
        from app.founder_ai.orchestrator import build_memory_asset_draft

        result = dict(session.result or {})
        artifact = ArtifactAssetDraft(
            execution_id=session.id,
            commit_hash=session.commit_hash,
            changed_files=list(result.get("changed_files") or []),
            result_summary=str(result.get("stdout") or "Execution completed")[-2000:],
        )
        memory = build_memory_asset_draft(
            decision="Founder approved execution",
            artifact=", ".join(artifact.changed_files) or None,
            commit=session.commit_hash,
            learning="Execution completed through the approved Codex adapter",
        )
        return artifact, memory

    def _persist_post_execution_outputs(self, session, package, artifact_draft, memory_draft) -> None:
        """Persist only post-execution outputs; stable identities make this restart-safe."""
        execution_id = session.id
        artifact = self.artifact_writer(
            artifact_type="execution_result",
            title=f"Execution {execution_id}",
            description=artifact_draft.result_summary,
            content_ref=json.dumps({"execution_id": execution_id, "commit_hash": artifact_draft.commit_hash, "files": artifact_draft.changed_files, "package_version": package.package_version, "execution_deltas": package.execution_deltas}, ensure_ascii=False),
            task_asset_id=session.task_asset_id,
            idempotency_key=f"execution:{execution_id}:execution_result",
        )
        if not session.artifact:
            session.artifact = {
                "id": artifact.id, "execution_id": artifact_draft.execution_id,
                "commit_hash": artifact_draft.commit_hash, "files": artifact_draft.changed_files,
                "summary": artifact_draft.result_summary,
            }
            append_event(
                session, "artifact_saved", status="testing",
                message=f"Execution artifact saved: {artifact.id}",
                metadata={"artifact_id": artifact.id},
            )
            save_execution_session(session, package)
        decision = self.memory_repository.save_decision(
            title=f"Execution decision {execution_id}",
            decision={"decision": memory_draft.decision, "execution_id": execution_id},
            task_asset_id=session.task_asset_id, source_execution_id=execution_id,
        )
        learning = self.memory_repository.save_learning(
            title=f"Execution learning {execution_id}",
            learning={"learning": memory_draft.learning, "execution_id": execution_id},
            task_asset_id=session.task_asset_id, source_execution_id=execution_id,
        )
        execution_memory = self.memory_repository.save_execution_result(
            title=f"Execution result {execution_id}",
            result={**(session.result or {}), "commit_hash": session.commit_hash,
                    "package_version": package.package_version, "execution_deltas": package.execution_deltas},
            task_asset_id=session.task_asset_id, artifact_id=artifact.id,
            source_execution_id=execution_id,
        )
        session.memory = {"decision": decision.id, "learning": learning.id,
                          "execution_result": execution_memory.id}
        if not any(event.get("event_name") == "memory_saved" for event in session.events):
            append_event(
                session, "memory_saved", status="testing",
                message="Decision, learning and execution memories saved",
                metadata={"memory_ids": dict(session.memory)},
            )
        save_execution_session(session, package)

    def _mark_post_execution_interrupted(self, session, package, error: Exception) -> None:
        session.status = "testing"
        session.recoverable = True
        session.pause_reason = "Post-execution persistence interrupted"
        session.error_message = str(error)
        session.failure_reason = "POST_EXECUTION_PERSISTENCE_INTERRUPTED"
        append_event(
            session, "stall_detected", status="testing",
            message="Post-execution persistence interrupted; restart-safe retry required",
            metadata={"failure_reason": str(error), "recovery_phase": "post_execution"},
        )
        save_execution_session(session, package)

    def _resume_post_execution(self, session, package):
        artifact_draft, memory_draft = self._restore_post_execution_drafts(session)
        try:
            self._persist_post_execution_outputs(session, package, artifact_draft, memory_draft)
        except Exception as error:
            self._mark_post_execution_interrupted(session, package, error)
            try:
                self.queue.transition(session.id, "failed")
            except (KeyError, ValueError):
                pass
            logger.warning("Post-execution recovery remains retryable execution_id=%s", session.id, exc_info=True)
            return session
        return self._finalize_verified_post_execution(session, package)

    def _complete_execution(self, session, package):
        execution_id = session.id
        session.completed_at = _now().isoformat()
        session.status = "completed"
        session.recoverable = False
        session.pause_reason = session.error_message = session.failure_reason = None
        if not any(event.get("event_name") == "completed" for event in session.events):
            append_event(session, "completed", status="completed", message="Artifact and memory persistence completed", timestamp=session.completed_at)
        save_execution_session(session, package)
        try:
            self.queue.transition(execution_id, "completed")
        except (KeyError, ValueError):
            self.queue.reconcile_terminal(execution_id, "completed")
        _append_execution_terminal_message(session, package)
        _project_runtime_truth(package.task_asset.conversation_id)
        return session

    def _reconcile_verified_completion(self, session, package) -> None:
        conversation_id = package.task_asset.conversation_id
        if not conversation_id:
            return
        from app.founder_ai.technical_resolution import resolve_false_stall_after_progress
        resolve_false_stall_after_progress(conversation_id=conversation_id, execution_id=session.id)
        if package.context.get("quick_fix_contract"):
            from app.founder_ai.quick_fix_execution import reconcile_quick_fix_execution
            reconcile_quick_fix_execution(
                conversation_id=conversation_id, task_id=session.task_asset_id,
                execution_id=session.id, repo_root=self.project_root,
            )
        else:
            from app.founder_ai.standard_task_execution import reconcile_standard_task_execution
            reconcile_standard_task_execution(
                conversation_id=conversation_id, task_id=session.task_asset_id,
                execution_id=session.id, repo_root=self.project_root,
            )
        _project_runtime_truth(conversation_id)

    @staticmethod
    def _extract_verified_reusable_learning(session) -> None:
        from app.founder_ai.reusable_asset_bootstrap import (
            extract_historical_anchored_popover_asset,
            extract_historical_interaction_surface_decision,
        )
        for extractor in (
            extract_historical_anchored_popover_asset,
            extract_historical_interaction_surface_decision,
        ):
            try:
                extractor(
                    task_id=session.task_asset_id, execution_id=session.id,
                    source_commit_sha=session.commit_hash,
                )
            except (LookupError, ValueError):
                # A verified execution may be ineligible for a particular reusable family.
                pass

    def _finalize_verified_post_execution(self, session, package):
        """Share required completion reconciliation and learning across normal/restart paths."""
        try:
            # Reconciliation contracts inspect the live registry object as completed. Keep that
            # projection provisional and in-memory until every required continuation succeeds.
            # The last durable write remains testing, so a crash safely resumes this phase.
            session.status = "completed"
            session.completed_at = session.completed_at or _now().isoformat()
            self._reconcile_verified_completion(session, package)
            self._extract_verified_reusable_learning(session)
        except Exception as error:
            self._mark_post_execution_interrupted(session, package, error)
            try:
                self.queue.transition(session.id, "failed")
            except (KeyError, ValueError):
                self.queue.reconcile_terminal(session.id, "failed")
            logger.warning("Verified post-execution finalization remains retryable execution_id=%s",
                           session.id, exc_info=True)
            return session
        self._complete_execution(session, package)
        logger.info("Execution completed execution_id=%s", session.id)
        return session

    def run_item(self, execution_id: str):
        record = get_execution_session(execution_id)
        if record is None:
            self.queue.transition(execution_id, "failed")
            return
        session, package = record
        if self._recoverable_post_execution(session):
            logger.info("Resuming post-execution persistence execution_id=%s", execution_id)
            return self._resume_post_execution(session, package)
        if session.status in TERMINAL_EXECUTION_STATES:
            self.queue.reconcile_terminal(execution_id, session.status)
            logger.info("Ignoring duplicate terminal execution callback execution_id=%s status=%s",
                        execution_id, session.status)
            return session
        try:
            session.worker_id = "sino-execution-worker"
            from app.founder_ai.execution_state import runtime_revision
            session.worker_revision = runtime_revision()
            session.started_at = session.started_at or _now().isoformat()
            session.worker_heartbeat_at = _now().isoformat()
            append_event(session, "worker_started", status="executing", message="Execution worker started", timestamp=session.worker_heartbeat_at)
            save_execution_session(session, package)
            logger.info("Execution worker started execution_id=%s", execution_id)
            heartbeat_stop = Event()
            heartbeat = Thread(target=self._heartbeat, args=(execution_id, heartbeat_stop), daemon=True, name=f"heartbeat-{execution_id}")
            heartbeat.start()
            loop = FounderExecutionLoop(self.adapter, on_status=lambda status: self._on_status(execution_id, status))
            if hasattr(self.adapter, "on_process_started"):
                self.adapter.on_process_started = lambda pid: self._record_subprocess(execution_id, pid)
            try:
                session, artifact_draft, memory_draft = loop.run(session, package, cwd=self.project_root, defer_completion=True)
            finally:
                heartbeat_stop.set(); heartbeat.join(timeout=2)
            if session.status in {"cancelling", "cancelled", "canceled"}:
                logger.info("Ignoring completion callback after Founder cancellation execution_id=%s", execution_id)
                return
            # Retry one partial post-execution write safely. Stable persistence identities ensure
            # already-durable Artifact/Memory records are reused, never duplicated.
            for persistence_attempt in (1, 2):
                try:
                    self._persist_post_execution_outputs(session, package, artifact_draft, memory_draft)
                    break
                except Exception as error:
                    if persistence_attempt == 2:
                        self._mark_post_execution_interrupted(session, package, error)
                        try:
                            self.queue.transition(execution_id, "failed")
                        except (KeyError, ValueError):
                            pass
                        return session
                    logger.warning("Retrying idempotent post-execution persistence execution_id=%s",
                                   execution_id, exc_info=True)
            return self._finalize_verified_post_execution(session, package)
        except ExecutionPausedForDelta:
            save_execution_session(session, package)
            logger.info("Execution paused for delta execution_id=%s", execution_id)
        except ExecutionScopeBlocked as error:
            session.status = "blocked"
            session.error_message = str(error)
            session.failure_reason = str(error)
            session.recoverable = False
            session.completed_at = _now().isoformat()
            append_event(session, "failed", status="blocked", message=f"Execution blocked by task scope mismatch: {error}",
                         timestamp=session.completed_at, metadata={"failure_reason": str(error), "scope_verification": (session.result or {}).get("scope_verification")})
            save_execution_session(session, package)
            self.queue.transition(execution_id, "failed")
            conversation_id = package.task_asset.conversation_id
            if conversation_id:
                from app.founder_ai.standard_task_execution import project_scope_mismatch
                project_scope_mismatch(conversation_id=conversation_id, execution_id=execution_id, evidence=session.result or {})
                _project_runtime_truth(conversation_id)
            logger.warning("Founder execution blocked by scope mismatch execution_id=%s", execution_id)
        except Exception as error:
            if session.status in {"completed", "blocked", "cancelled", "canceled"}:
                self.queue.reconcile_terminal(execution_id, session.status)
                logger.warning("Ignoring late failure after terminal execution execution_id=%s status=%s error=%s",
                               execution_id, session.status, error)
                return session
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
            _append_execution_terminal_message(session, package)
            _project_runtime_truth(package.task_asset.conversation_id)
            logger.exception("Founder execution %s failed", execution_id)

    def _record_subprocess(self, execution_id: str, pid: int) -> None:
        record = get_execution_session(execution_id)
        if record:
            session, package = record
            started_at = _now().isoformat()
            session.subprocess_pid = pid
            session.subprocess_activity_at = started_at
            session.expected_long_running_operation = "codex_execution"
            session.expected_operation_started_at = started_at
            session.expected_operation_timeout_seconds = 900
            save_execution_session(session, package)

    def _heartbeat(self, execution_id: str, stop: Event) -> None:
        while not stop.wait(10):
            record = get_execution_session(execution_id)
            if record is None: return
            session, package = record
            session.worker_heartbeat_at = _now().isoformat()
            session.last_heartbeat_at = session.worker_heartbeat_at
            save_execution_session(session, package)
            _project_runtime_truth(package.task_asset.conversation_id)

    def _watchdog(self):
        """Continuously reconcile active executions without UI/API activity."""
        while not self._stop.wait(1):
            from app.founder_ai.technical_resolution import check_execution_liveness
            for session in list_execution_sessions():
                if session.status not in {"queued", "executing", "testing"}:
                    continue
                decision = check_execution_liveness(session, queue_item=self.queue.get(session.id))
                if decision["action"] == "requeue":
                    record = get_execution_session(session.id)
                    if record:
                        current, package = record
                        self.queue.requeue(current.id)
                        current.status = "queued"
                        append_event(current, "execution_resumed", status="queued", message="Watchdog restored the same execution to the worker queue", metadata={"reason": decision["reason"]})
                        save_execution_session(current, package)
                elif decision["action"] == "block":
                    record = get_execution_session(session.id)
                    if record:
                        current, package = record
                        current.status = "blocked"
                        current.failure_reason = "PIPELINE_STALLED"
                        current.error_message = decision["reason"]
                        append_event(current, "failed", status="blocked", message="Execution pipeline stalled and could not be safely recovered", metadata=decision)
                        save_execution_session(current, package)

    def _on_status(self, execution_id: str, status: str):
        record = get_execution_session(execution_id)
        if record is None:
            return
        session, package = record
        if session.status in TERMINAL_EXECUTION_STATES:
            self.queue.reconcile_terminal(execution_id, session.status)
            return
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
            safely_rolled_back_scope_block = (
                session.status == "blocked"
                and "scope mismatch" in str(session.failure_reason or session.error_message or "").lower()
                and not bool((session.result or {}).get("task_owned_patch_persisted"))
                and all(bool(item.get("corrected_rollback_succeeded", item.get("rollback_succeeded")))
                        for item in list((session.result or {}).get("scope_correction_attempts") or []))
            )
            recoverable_pipeline_stall = (
                session.status == "blocked"
                and session.failure_reason == "PIPELINE_STALLED"
                and not any((session.result, session.artifact, session.memory))
            )
            if (safely_rolled_back_scope_block or recoverable_pipeline_stall) and package.execution_allowed:
                from app.founder_ai.standard_task_execution import build_standard_task_contract
                refreshed = build_standard_task_contract(
                    conversation_id=package.task_asset.conversation_id,
                    goal=package.goal,
                    task_id=session.task_asset_id,
                )
                if refreshed.get("scope_source") != "approval_required":
                    package = replace(package, context={**dict(package.context), "standard_task_contract": refreshed})
                    session.status = "queued"
                    session.result = session.artifact = session.memory = None
                    session.error_message = session.failure_reason = None
                    session.completed_at = None
                    item = self.queue.requeue(session.id)
                    session.queued_at = item.created_at.isoformat()
                    append_event(session, "execution_resumed", status="queued", message="Runtime revision restored the same execution", metadata={"scope_reconciled": safely_rolled_back_scope_block, "pipeline_recovered": recoverable_pipeline_stall})
                    save_execution_session(session, package)
                    continue
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
                post_execution_recovery = self._recoverable_post_execution(session)
                session.recoverable = post_execution_recovery or not any((session.result, session.artifact, session.memory))
                session.status = "testing" if post_execution_recovery else ("queued" if session.recoverable else "blocked")
                session.pause_reason = "Post-execution persistence recovery" if post_execution_recovery else (None if session.recoverable else "Backend restarted with partial durable results")
                session.error_message = None
                session.failure_reason = "POST_EXECUTION_PERSISTENCE_INTERRUPTED" if post_execution_recovery else (None if session.recoverable else "PIPELINE_STALLED")
                session.completed_at = None
                append_event(
                    session,
                    "backend_restarted",
                    status=session.status,
                    message="Backend restarted; post-execution persistence will resume" if post_execution_recovery else ("Backend restarted; same execution automatically restored" if session.recoverable else "Backend restarted with partial durable results; execution blocked"),
                    metadata={"interrupted_status": interrupted_status, "recoverable": session.recoverable, "recovery_phase": "post_execution" if post_execution_recovery else None},
                )
                if session.recoverable:
                    self.queue.requeue(session.id)
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
    scope_blocked = (
        session.status == "blocked"
        and "scope mismatch" in str(session.failure_reason or session.error_message or "").lower()
        and not bool((session.result or {}).get("task_owned_patch_persisted"))
        and all(bool(item.get("corrected_rollback_succeeded", item.get("rollback_succeeded")))
                for item in list((session.result or {}).get("scope_correction_attempts") or []))
    )
    if session.status != "paused" and not scope_blocked:
        raise ValueError("only paused or safely rolled-back scope-blocked executions can be resumed")
    if not package.execution_allowed:
        raise PermissionError("Founder approval is required before resuming execution")
    if any((session.result, session.artifact, session.memory)) and not scope_blocked:
        session.recoverable = False
        save_execution_session(session, package)
        raise RuntimeError("Execution has partial durable results and requires manual review")
    if not _workspace_is_resumable(execution_worker.project_root):
        raise RuntimeError("Git workspace is unavailable for execution recovery")

    if scope_blocked:
        from app.founder_ai.standard_task_execution import build_standard_task_contract
        refreshed = build_standard_task_contract(
            conversation_id=package.task_asset.conversation_id,
            goal=package.goal,
            task_id=session.task_asset_id,
        )
        if refreshed.get("scope_source") == "approval_required":
            raise RuntimeError("semantic scope is still unresolved")
        package = replace(package, context={**dict(package.context), "standard_task_contract": refreshed})
    item = execution_queue.requeue(execution_id)
    session.status = "queued"
    session.queued_at = item.created_at.isoformat()
    session.started_at = None
    session.testing_at = None
    session.completed_at = None
    session.pause_reason = None
    session.result = None
    session.artifact = None
    session.memory = None
    session.error_message = None
    session.failure_reason = None
    session.recoverable = False
    append_event(
        session,
        "execution_resumed",
        status="queued",
        message="Execution resumed with refreshed semantic scope" if scope_blocked else "Founder confirmed recovery and execution resumed",
        metadata={"resumed": True, "scope_reconciled": scope_blocked},
    )
    append_event(
        session,
        "queued",
        status="queued",
        message="Paused execution resumed and queued",
        timestamp=session.queued_at,
        metadata={"resumed": True},
    )
    save_execution_session(session, package)
    if scope_blocked and package.context.get("quick_fix_contract") and package.task_asset.conversation_id:
        from app.founder_ai.quick_fix_execution import _update_projection
        _update_projection(
            package.task_asset.conversation_id, step="fix", clear_blocker=True,
            execution={"execution_session_id": session.id, "dispatch_status": "queued", "scope_reconciled": True},
        )
    return item
