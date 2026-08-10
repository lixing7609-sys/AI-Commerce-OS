"""Approved Founder AI execution loop with an injectable Codex adapter."""

from dataclasses import dataclass, field
from pathlib import Path
import subprocess
from typing import Any, Protocol

from .orchestrator import ExecutionPackage, MemoryAssetDraft, build_memory_asset_draft


EXECUTION_STATES = {"draft", "approved", "executing", "testing", "completed", "failed"}


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


@dataclass(frozen=True)
class CodexExecutionResult:
    stdout: str
    stderr: str
    changed_files: list[str] = field(default_factory=list)
    tests: list[str] = field(default_factory=list)
    commit_hash: str | None = None


class CodexAdapter(Protocol):
    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        ...


class ExecutionApprovalError(PermissionError):
    """Raised whenever execution is attempted without Founder approval."""


class SubprocessCodexAdapter:
    """Thin Codex CLI adapter; it never runs unless the loop passes approval."""

    def __init__(self, command: str = "codex", timeout_seconds: int = 1800):
        self.command = command
        self.timeout_seconds = timeout_seconds

    def execute(self, package: ExecutionPackage, *, cwd: Path) -> CodexExecutionResult:
        instruction = (
            f"Goal: {package.goal}\n"
            f"Constraints: {package.constraints}\n"
            f"Verification: {package.verification}\n"
            f"Commit requirement: {package.commit_requirement}\n"
        )
        completed = subprocess.run(
            [self.command, "exec", instruction],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=self.timeout_seconds,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(completed.stderr or "Codex execution failed")
        return CodexExecutionResult(stdout=completed.stdout, stderr=completed.stderr)


class FounderExecutionLoop:
    def __init__(self, adapter: CodexAdapter):
        self.adapter = adapter

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
    ) -> tuple[ExecutionSession, MemoryAssetDraft]:
        if session.status != "approved" or not package.execution_allowed:
            raise ExecutionApprovalError("Founder approval is required before Codex execution")
        session.status = "executing"
        try:
            result = self.adapter.execute(package, cwd=cwd)
            session.status = "testing"
            session.result = {
                "stdout": result.stdout,
                "stderr": result.stderr,
                "changed_files": result.changed_files,
                "tests": result.tests,
            }
            session.commit_hash = result.commit_hash
            session.status = "completed"
            return session, build_memory_asset_draft(
                decision="Founder approved execution",
                artifact=", ".join(result.changed_files) or None,
                commit=result.commit_hash,
                learning="Execution completed through the approved Codex adapter",
            )
        except Exception as error:
            session.status = "failed"
            session.error_message = str(error)
            raise
