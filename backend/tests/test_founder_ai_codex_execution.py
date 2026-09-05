from pathlib import Path
import subprocess
from dataclasses import replace
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
from app.founder_ai.autonomous_execution_policy import AUTO_CONTINUE, FOUNDER_APPROVAL_REQUIRED
from app.founder_ai.codex_permission_adapter import (
    PERMISSION_AUTO_HANDLED,
    PERMISSION_FOUNDER_REQUIRED,
    decide_codex_permission,
)
from app.founder_ai.execution_loop import CodexExecutionResult, ExecutionSession, FounderExecutionLoop
from app.founder_ai.execution_registry import create_execution_session
from app.founder_ai.orchestrator import build_execution_package, generate_task_asset_draft
from app.founder_ai.task_package import TaskPackageBuilder


@pytest.fixture(autouse=True)
def selected_execution_engine(monkeypatch):
    from app.founder_ai import execution_registry

    monkeypatch.setattr(execution_registry, "resolve_execution_capability", lambda: {"execution_engine_id": "codex"})


def _package_with_autonomous_policy(*, operation_type: str = "REPO_INSPECTION", policy_decision: str = AUTO_CONTINUE, reason: str = "low_risk_read_only_operation", context: dict | None = None):
    policy = {
        "decision": policy_decision,
        "reason": reason,
        "approval_required": policy_decision != AUTO_CONTINUE,
        "auto_continue": policy_decision == AUTO_CONTINUE,
    }
    draft = generate_task_asset_draft(
        "Execute safely",
        context={
            "operation_type": operation_type,
            "task_id": "task-policy",
            "execution_id": "execution-policy",
            "risk_level": "LOW" if policy_decision == AUTO_CONTINUE else "HIGH",
            "autonomous_execution_policy": policy,
            **(context or {}),
        },
        approval_required=False,
    )
    return replace(build_execution_package(draft), execution_allowed=True, approval_required=False)


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
    package = _package_with_autonomous_policy(operation_type="BOUNDED_CODE_CHANGE", reason="founder_approved_bounded_local_development")

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


@pytest.mark.parametrize("operation_type,reason", [
    ("REPO_INSPECTION", "low_risk_read_only_operation"),
    ("FOCUSED_TEST", "low_risk_allowlisted_test"),
    ("FRONTEND_BUILD", "low_risk_local_build"),
    ("BOUNDED_CODE_CHANGE", "founder_approved_bounded_local_development"),
])
def test_permission_adapter_auto_handles_authoritative_auto_continue(operation_type, reason):
    decision = decide_codex_permission(_package_with_autonomous_policy(operation_type=operation_type, reason=reason))

    assert decision["decision"] == PERMISSION_AUTO_HANDLED
    assert decision["auto_handled"] is True
    assert decision["founder_action_required"] is False
    assert decision["codex_approval_policy"] == "never"
    assert decision["policy_decision"] == AUTO_CONTINUE
    assert decision["reason"] == reason


@pytest.mark.parametrize("operation_type,reason,context", [
    ("SAFE_PUSH", "remote_write_requires_founder_approval", {"remote_write": True}),
    ("RESET_HARD", "destructive_operation_requires_founder_approval", {"destructive": True}),
    ("DEPLOY_PRODUCTION", "production_operation_requires_founder_approval", {"production": True}),
    ("CREDENTIAL_CHANGE", "credential_change_requires_founder_approval", {"credential_change": True}),
    ("UNKNOWN_OPERATION", "unknown_operation_or_risk", {}),
    ("BOUNDED_CODE_CHANGE", "bounded_local_development_requires_scope_and_approval", {}),
])
def test_permission_adapter_does_not_auto_handle_founder_required_policy(operation_type, reason, context):
    decision = decide_codex_permission(
        _package_with_autonomous_policy(
            operation_type=operation_type,
            policy_decision=FOUNDER_APPROVAL_REQUIRED,
            reason=reason,
            context=context,
        )
    )

    assert decision["decision"] == PERMISSION_FOUNDER_REQUIRED
    assert decision["auto_handled"] is False
    assert decision["founder_action_required"] is True
    assert decision["codex_approval_policy"] is None
    assert decision["reason"] == reason


def test_permission_adapter_missing_policy_fails_closed():
    package = replace(build_execution_package(generate_task_asset_draft("Execute safely")), execution_allowed=True)

    decision = decide_codex_permission(package)

    assert decision["decision"] == PERMISSION_FOUNDER_REQUIRED
    assert decision["reason"] == "missing_authoritative_autonomous_execution_policy"
    assert decision["founder_action_required"] is True


def test_permission_adapter_exception_fails_closed(monkeypatch):
    from app.founder_ai import codex_permission_adapter

    monkeypatch.setattr(codex_permission_adapter, "_policy_from_package", lambda _package: (_ for _ in ()).throw(RuntimeError("adapter failed")))

    decision = codex_permission_adapter.decide_codex_permission(_package_with_autonomous_policy())

    assert decision["decision"] == PERMISSION_FOUNDER_REQUIRED
    assert decision["reason"] == "permission_adapter_exception"
    assert decision["founder_action_required"] is True


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
    package = _package_with_autonomous_policy(context=context)

    result = SubprocessCodexAdapter(timeout_seconds=10).execute(package, cwd=tmp_path)

    assert result.exit_code == 0
    assert result.permission_decision["decision"] == PERMISSION_AUTO_HANDLED
    codex_call = next(item for item in calls if Path(item["args"][0]).name == "codex")
    assert codex_call["args"][1:] == ["exec", "-s", "workspace-write", "-c", 'approval_policy="never"', "-"]
    assert len(" ".join(codex_call["args"])) < 128
    assert len(codex_call["input"]) > context_size
    assert "y" * min(context_size, 1000) not in codex_call["input"]


def test_codex_adapter_does_not_start_process_without_auto_handled_permission(monkeypatch, tmp_path: Path):
    calls = []

    class UnexpectedProcess:
        def __init__(self, *args, **kwargs):
            calls.append({"args": args, "kwargs": kwargs})

    monkeypatch.setattr(codex_adapter_module.subprocess, "Popen", UnexpectedProcess)
    package = _package_with_autonomous_policy(
        operation_type="SAFE_PUSH",
        policy_decision=FOUNDER_APPROVAL_REQUIRED,
        reason="remote_write_requires_founder_approval",
    )

    with pytest.raises(PermissionError, match="codex_permission_not_auto_handled"):
        SubprocessCodexAdapter(timeout_seconds=10).execute(package, cwd=tmp_path)

    assert calls == []
