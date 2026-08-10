from dataclasses import replace
from pathlib import Path

import pytest

from app.founder_ai.execution_loop import (
    CodexExecutionResult,
    ExecutionApprovalError,
    ExecutionSession,
    FounderExecutionLoop,
)
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


class FakeCodexAdapter:
    def execute(self, package, *, cwd: Path):
        return CodexExecutionResult(
            stdout="ok",
            stderr="",
            changed_files=["src/example.py"],
            tests=["pytest"],
            commit_hash="abc123",
        )


def make_package(execution_allowed=False):
    draft = generate_task_asset_draft("开发一个安全的 Founder Agent")
    package = build_execution_package(draft)
    return replace(package, execution_allowed=execution_allowed)


def test_execution_requires_approval():
    loop = FounderExecutionLoop(FakeCodexAdapter())
    session = ExecutionSession("session-1", "task-1", "package-1")
    with pytest.raises(ExecutionApprovalError):
        loop.run(session, make_package(execution_allowed=True), cwd=Path("."))
    assert session.status == "draft"


def test_approved_package_calls_adapter_and_captures_result():
    loop = FounderExecutionLoop(FakeCodexAdapter())
    session = loop.approve(ExecutionSession("session-1", "task-1", "package-1"))
    completed, memory = loop.run(session, make_package(execution_allowed=True), cwd=Path("."))
    assert completed.status == "completed"
    assert completed.commit_hash == "abc123"
    assert completed.result["changed_files"] == ["src/example.py"]
    assert memory.commit == "abc123"
    assert memory.artifact == "src/example.py"


def test_adapter_failure_marks_session_failed():
    class FailingAdapter:
        def execute(self, package, *, cwd):
            raise RuntimeError("test failure")

    loop = FounderExecutionLoop(FailingAdapter())
    session = loop.approve(ExecutionSession("session-1", "task-1", "package-1"))
    with pytest.raises(RuntimeError):
        loop.run(session, make_package(execution_allowed=True), cwd=Path("."))
    assert session.status == "failed"
    assert session.error_message == "test failure"
