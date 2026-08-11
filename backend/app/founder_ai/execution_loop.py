"""Approved Founder AI execution loop with an injectable Codex adapter."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from .codex_adapter import CodexExecutionResult, SubprocessCodexAdapter
from .execution_events import append_event
from .orchestrator import ExecutionPackage, MemoryAssetDraft, build_memory_asset_draft


EXECUTION_STATES = {"draft", "approved", "queued", "executing", "testing", "paused", "completed", "failed"}


@dataclass
class ExecutionSession:
    id: str
    task_asset_id: str
    execution_package_id: str
    executor: str = "codex"
    status: str = "draft"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    approved_at: str | None = None
    queued_at: str | None = None
    started_at: str | None = None
    testing_at: str | None = None
    completed_at: str | None = None
    result: dict[str, Any] | None = None
    commit_hash: str | None = None
    error_message: str | None = None
    artifact: dict[str, Any] | None = None
    memory: dict[str, Any] | None = None
    execution_logs: list[dict[str, str]] = field(default_factory=list)
    events: list[dict[str, Any]] = field(default_factory=list)
    current_stage: str | None = None
    failure_reason: str | None = None
    pause_reason: str | None = None
    recoverable: bool = False
    deltas: list[dict[str, Any]] = field(default_factory=list)

    def log(self, stage: str, message: str, *, timestamp: str | None = None) -> None:
        self.execution_logs.append({"timestamp": timestamp or datetime.now(timezone.utc).isoformat(), "stage": stage, "message": message})


@dataclass(frozen=True)
class ArtifactAssetDraft:
    execution_id: str
    commit_hash: str | None
    changed_files: list[str]
    result_summary: str
    system_id: str = "founder_ai"


@dataclass(frozen=True)
class CodexAdapter(Protocol):
    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        ...


class ExecutionApprovalError(PermissionError):
    """Raised whenever execution is attempted without Founder approval."""


class ExecutionPausedForDelta(RuntimeError):
    """Raised at a safe stage boundary when a Founder delta requested replanning."""


class FounderExecutionLoop:
    def __init__(self, adapter: CodexAdapter, on_status=None):
        self.adapter = adapter
        self.on_status = on_status or (lambda _status: None)

    def approve(self, session: ExecutionSession) -> ExecutionSession:
        if session.status != "draft":
            raise ValueError("only draft sessions can be approved")
        session.status = "approved"
        session.approved_at = datetime.now(timezone.utc).isoformat()
        append_event(session, "approved", status="approved", message="Founder approval granted", timestamp=session.approved_at)
        return session

    def run(
        self,
        session: ExecutionSession,
        package: ExecutionPackage,
        *,
        cwd: Path,
        defer_completion: bool = False,
    ) -> tuple[ExecutionSession, ArtifactAssetDraft, MemoryAssetDraft]:
        if session.status not in {"approved", "queued"} or not package.execution_allowed:
            raise ExecutionApprovalError("Founder approval is required before Codex execution")
        session.status = "executing"
        session.started_at = session.started_at or datetime.now(timezone.utc).isoformat()
        append_event(session, "codex_started", status="executing", message="Codex subprocess started", timestamp=session.started_at)
        self.on_status("executing")
        try:
            result = self.adapter.execute(package, cwd=cwd)
            session.result = {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_code,
                "changed_files": result.changed_files,
                "tests": result.tests,
            }
            append_event(
                session,
                "codex_finished",
                status="executing",
                message=f"Codex subprocess finished with exit code {result.exit_code}",
                metadata={"exit_code": result.exit_code, "stderr_summary": (result.stderr or "")[-2000:]},
            )
            self.on_status("executing")
            if session.status == "paused":
                raise ExecutionPausedForDelta(session.pause_reason or "Execution paused for Founder delta")
            if result.exit_code != 0:
                raise RuntimeError(result.stderr or "Codex execution failed")
            session.status = "testing"
            session.testing_at = datetime.now(timezone.utc).isoformat()
            append_event(session, "testing_started", status="testing", message="Execution verification started", timestamp=session.testing_at)
            self.on_status("testing")
            append_event(
                session,
                "testing_finished",
                status="testing",
                message="Execution verification finished",
                metadata={"tests": list(result.tests or [])},
            )
            self.on_status("testing")
            session.commit_hash = result.commit_hash
            artifact = ArtifactAssetDraft(
                execution_id=session.id,
                commit_hash=result.commit_hash,
                changed_files=list(result.changed_files or []),
                result_summary=result.stdout[-2000:] or "Execution completed",
            )
            memory = build_memory_asset_draft(
                decision="Founder approved execution",
                artifact=", ".join(result.changed_files) or None,
                commit=result.commit_hash,
                learning="Execution completed through the approved Codex adapter",
            )
            if not defer_completion:
                session.status = "completed"
                session.completed_at = datetime.now(timezone.utc).isoformat()
                append_event(session, "completed", status="completed", message="Execution completed", timestamp=session.completed_at)
                self.on_status("completed")
            return session, artifact, memory
        except ExecutionPausedForDelta:
            raise
        except Exception as error:
            session.status = "failed"
            session.error_message = str(error)
            session.failure_reason = str(error)
            session.completed_at = datetime.now(timezone.utc).isoformat()
            raise
