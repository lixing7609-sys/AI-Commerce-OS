from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from app.founder_ai import api
from app.founder_ai.execution_loop import CodexExecutionResult, ExecutionSession, FounderExecutionLoop
from app.founder_ai.execution_registry import create_execution_session
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft


def test_unapproved_execution_returns_403(monkeypatch):
    draft = generate_task_asset_draft("开发 Agent")
    package = build_execution_package(draft)
    session = create_execution_session("task-1", package)
    with pytest.raises(HTTPException) as error:
        api.execute_founder_execution(session.id)
    assert error.value.status_code == 403


def test_approved_execution_uses_adapter_and_captures_assets():
    class FakeAdapter:
        def execute(self, package, *, cwd: Path):
            return CodexExecutionResult("done", "", 0, ["app.py"], ["pytest"], "commit-1")

    draft = generate_task_asset_draft("开发 Agent")
    package = build_execution_package(draft)
    package = package.__class__(
        goal=package.goal,
        context=package.context,
        task_asset=package.task_asset,
        constraints=package.constraints,
        verification=package.verification,
        commit_requirement=package.commit_requirement,
        approval_required=package.approval_required,
        execution_allowed=True,
    )
    loop = FounderExecutionLoop(FakeAdapter())
    session = loop.approve(ExecutionSession("session-1", "task-1", "package-1"))
    session, artifact, memory = loop.run(session, package, cwd=Path("."))
    assert session.status == "completed"
    assert session.commit_hash == "commit-1"
    assert artifact.changed_files == ["app.py"]
    assert memory.commit == "commit-1"
