"""Approved Founder AI execution loop with an injectable Codex adapter."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .codex_adapter import CodexExecutionResult, SubprocessCodexAdapter
from .orchestrator import ExecutionPackage, MemoryAssetDraft, build_memory_asset_draft


EXECUTION_STATES = {"draft", "approved", "queued", "executing", "testing", "completed", "failed"}


@dataclass
class ExecutionSession:
    id: str
    task_asset_id: str
    execution_package_id: str
    executor: str = "codex"
    status: str = "draft"
    started_at: str | None = None
    completed_at: str | None = None
    result: dict[str, Any] | None = None
    commit_hash: str | None = None
    error_message: str | None = None
    artifact: dict[str, Any] | None = None
    memory: dict[str, Any] | None = None


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


class FounderExecutionLoop:
    def __init__(self, adapter: CodexAdapter, on_status=None):
        self.adapter = adapter
        self.on_status = on_status or (lambda _status: None)

    def approve(self, session: ExecutionSession) -> ExecutionSession:
        if session.status != "draft":
            raise ValueError("only draft sessions can be approved")
        session.status = "approved"
        return session

    def run(
        self,
        session: ExecutionSession,
        package: ExecutionPackage,
        *,
        cwd: Path,
    ) -> tuple[ExecutionSession, ArtifactAssetDraft, MemoryAssetDraft]:
        if session.status not in {"approved", "queued"} or not package.execution_allowed:
            raise ExecutionApprovalError("Founder approval is required before Codex execution")
        session.status = "executing"
        self.on_status("executing")
        try:
            result = self.adapter.execute(package, cwd=cwd)
            if result.exit_code != 0:
                raise RuntimeError(result.stderr or "Codex execution failed")
            session.status = "testing"
            self.on_status("testing")
            session.result = {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "exit_code": result.exit_code,
                "changed_files": result.changed_files,
                "tests": result.tests,
            }
            session.commit_hash = result.commit_hash
            session.status = "completed"
            self.on_status("completed")
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
            return session, artifact, memory
        except Exception as error:
            session.status = "failed"
            session.error_message = str(error)
            raise
