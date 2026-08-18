from pathlib import Path
import subprocess
from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from app.founder_ai import api
from app.founder_ai import codex_adapter as codex_adapter_module
from app.founder_ai.codex_adapter import (
    DEFAULT_CODEX_TIMEOUT_SECONDS,
    CodexExecutionTimeout,
    SubprocessCodexAdapter,
)
from app.founder_ai.execution_loop import CodexExecutionResult, ExecutionSession, FounderExecutionLoop
from app.founder_ai.execution_registry import create_execution_session
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft
from app.founder_ai.task_package import TaskPackageBuilder


@pytest.fixture(autouse=True)
def selected_execution_engine(monkeypatch):
    from app.founder_ai import execution_registry

    monkeypatch.setattr(execution_registry, "resolve_execution_capability", lambda: {"execution_engine_id": "codex"})


def test_unapproved_execution_returns_403(monkeypatch):
    draft = generate_task_asset_draft("开发 Agent")
    package = build_execution_package(draft)
    session = create_execution_session("task-1", package)
    with pytest.raises(HTTPException) as error:
        api.execute_founder_execution(session.id)
    assert error.value.status_code == 403


def test_execution_session_reads_selected_engine_from_registry(monkeypatch):
    from app.founder_ai import execution_registry

    monkeypatch.setattr(execution_registry, "resolve_execution_capability", lambda: {"execution_engine_id": "codex"})
    draft = generate_task_asset_draft("开发 Agent")
    session = create_execution_session("task-engine", build_execution_package(draft))
    assert session.executor == "codex"


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
    assert session.approved_at is not None
    session, artifact, memory = loop.run(session, package, cwd=Path("."))
    assert session.status == "completed"
    assert session.commit_hash == "commit-1"
    assert session.started_at is not None
    assert session.testing_at is not None
    assert session.completed_at is not None
    assert artifact.changed_files == ["app.py"]
    assert memory.commit == "commit-1"


def test_codex_adapter_terminates_process_group_on_timeout(monkeypatch, tmp_path: Path):
    class TimedOutProcess:
        pid = 4321
        returncode = None

        def __init__(self, *args, **kwargs):
            self.communications = 0

        def communicate(self, input=None, timeout=None):
            self.communications += 1
            if self.communications == 1:
                raise subprocess.TimeoutExpired("codex", timeout, output="partial output", stderr="still running")
            self.returncode = -15
            return "partial output", "terminated"

    signals = []
    monkeypatch.setattr(codex_adapter_module.subprocess, "Popen", TimedOutProcess)
    monkeypatch.setattr(codex_adapter_module.os, "killpg", lambda pid, sig: signals.append((pid, sig)))
    monkeypatch.setattr(SubprocessCodexAdapter, "_working_tree_snapshot", lambda self, cwd: {})
    monkeypatch.setattr(SubprocessCodexAdapter, "_git_head", lambda self, cwd: "head")
    package = build_execution_package(generate_task_asset_draft("Implement timeout protection"))

    with pytest.raises(CodexExecutionTimeout, match="timed out after 0.01 seconds") as error:
        SubprocessCodexAdapter(timeout_seconds=0.01).execute(package, cwd=tmp_path)

    assert error.value.stdout == "partial output"
    assert error.value.stderr == "terminated"
    assert signals == [(4321, codex_adapter_module.signal.SIGTERM)]


def test_codex_adapter_allows_long_founder_execution_by_default(monkeypatch):
    monkeypatch.delenv("FOUNDER_CODEX_TIMEOUT_SECONDS", raising=False)

    adapter = SubprocessCodexAdapter()

    assert adapter.timeout_seconds == DEFAULT_CODEX_TIMEOUT_SECONDS
    assert adapter.timeout_seconds > 600


def test_codex_adapter_resolves_user_install_when_service_path_is_reduced(monkeypatch, tmp_path):
    executable = tmp_path / ".npm-global" / "bin" / "codex"
    executable.parent.mkdir(parents=True)
    executable.write_text("#!/bin/sh\n", encoding="utf-8")
    monkeypatch.setattr(codex_adapter_module.shutil, "which", lambda _command: None)
    monkeypatch.setattr(codex_adapter_module.Path, "home", lambda: tmp_path)
    assert SubprocessCodexAdapter().command == str(executable)


def test_codex_adapter_timeout_remains_configurable(monkeypatch):
    monkeypatch.setenv("FOUNDER_CODEX_TIMEOUT_SECONDS", "900")

    assert SubprocessCodexAdapter().timeout_seconds == 900


def test_task_package_builder_keeps_bounded_execution_contract(tmp_path: Path):
    context = {
        "reasoning": {
            "evidence": [{
                "source": "Code Evidence",
                "fact": "Workspace scrolling is controlled by CSS.",
                "relevance": "Defines the change boundary.",
                "metadata": {"relevant_files": [{"path": "frontend/src/sino-founder/sino-founder-ai.css", "reason": "Owns overflow styles"}]},
            }],
            "task_plan": ["must not be transported as an unbounded context dump"],
        },
        "conversation_memory": "private historical context",
    }
    draft = generate_task_asset_draft("Hide the workspace scrollbar", context=context, constraints=["Preserve scrolling"])
    package = build_execution_package(draft, verification=["Run frontend tests"])

    path = TaskPackageBuilder().write(package, tmp_path)
    content = path.read_text(encoding="utf-8")

    assert "## Goal" in content
    assert "## Evidence" in content
    assert "Workspace scrolling is controlled by CSS." in content
    assert "## Relevant Files" in content
    assert "frontend/src/sino-founder/sino-founder-ai.css" in content
    assert "## Constraints" in content
    assert "Preserve scrolling" in content
    assert "## Acceptance Criteria" in content
    assert "Run frontend tests" in content
    assert "private historical context" not in content
    assert "must not be transported" not in content


@pytest.mark.parametrize("context_size", [128, 2_000_000])
def test_codex_adapter_transports_small_and_large_context_via_stdin(monkeypatch, tmp_path: Path, context_size: int):
    calls = []

    class SuccessfulProcess:
        pid = 4321
        returncode = 0

        def __init__(self, args, **kwargs):
            calls.append({"args": args, "kwargs": kwargs})

        def communicate(self, input=None, timeout=None):
            calls[-1]["input"] = input
            calls[-1]["timeout"] = timeout
            return "done", ""

    monkeypatch.setattr(codex_adapter_module.subprocess, "Popen", SuccessfulProcess)
    monkeypatch.setattr(SubprocessCodexAdapter, "_working_tree_snapshot", lambda self, cwd: {})
    monkeypatch.setattr(SubprocessCodexAdapter, "_git_head", lambda self, cwd: "head")
    context = {
        "reasoning": {"evidence": [{"source": "Repository", "fact": "x" * context_size, "relevance": "test"}]},
        "full_context": "y" * context_size,
    }
    package = build_execution_package(generate_task_asset_draft("Execute safely", context=context))

    result = SubprocessCodexAdapter(timeout_seconds=10).execute(package, cwd=tmp_path)

    assert result.exit_code == 0
    assert Path(calls[0]["args"][0]).name == "codex"
    assert calls[0]["args"][1:] == ["exec", "-"]
    assert len(" ".join(calls[0]["args"])) < 128
    assert len(calls[0]["input"]) > context_size
    assert "y" * min(context_size, 1000) not in calls[0]["input"]
