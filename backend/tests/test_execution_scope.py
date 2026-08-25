from dataclasses import replace
from pathlib import Path
import subprocess

import pytest

from app.founder_ai.codex_adapter import CodexExecutionResult
from app.founder_ai.execution_loop import ExecutionScopeBlocked, ExecutionSession, FounderExecutionLoop
from app.founder_ai.execution_scope import (
    SCOPE_MISMATCH, SCOPE_PASS, attribute_execution_changes, capture_execution_baseline,
    codex_run_id, rollback_execution_owned_patch, verify_execution_scope,
)
from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft


def git(repo: Path, *args: str):
    return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True, text=True)


@pytest.fixture
def repo(tmp_path):
    git(tmp_path, "init")
    git(tmp_path, "config", "user.email", "scope@test.invalid")
    git(tmp_path, "config", "user.name", "Scope Test")
    (tmp_path / "allowed.txt").write_text("base\n")
    (tmp_path / "existing.txt").write_text("base\n")
    (tmp_path / "unrelated.txt").write_text("base\n")
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "baseline")
    return tmp_path


def contract():
    return {"objective": "change allowed", "implementation_scope": ["allowed.txt"], "module_boundary": [], "prohibited_scope": ["unrelated"]}


def package():
    task = TaskAssetDraft(title="scope", description="scope", scope={}, constraints=[], risk="low", approval_required=False)
    return ExecutionPackage(goal="change allowed", context={"standard_task_contract": contract()}, task_asset=task,
                            constraints=[], verification=[], commit_requirement="none", approval_required=False, execution_allowed=True)


def test_preexisting_dirty_hunk_is_not_attributed_to_current_task(repo):
    (repo / "existing.txt").write_text("pre-existing\n")
    baseline, contents = capture_execution_baseline(repo)
    (repo / "allowed.txt").write_text("task\n")
    attribution = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    assert attribution["task_changed_files"] == ["allowed.txt"]
    assert "existing.txt" not in attribution["execution_owned_patch"]


def test_correct_and_unrelated_files_produce_distinct_scope_results(repo):
    baseline, contents = capture_execution_baseline(repo)
    (repo / "allowed.txt").write_text("task\n")
    allowed = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    assert verify_execution_scope(contract=contract(), attribution=allowed)["status"] == SCOPE_PASS
    (repo / "unrelated.txt").write_text("wrong\n")
    unrelated = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    result = verify_execution_scope(contract=contract(), attribution=unrelated)
    assert result["status"] == SCOPE_MISMATCH
    assert result["out_of_scope_files"] == ["unrelated.txt"]


def test_rollback_reverses_only_execution_owned_patch_and_preserves_preexisting(repo):
    (repo / "existing.txt").write_text("pre-existing\n")
    baseline, contents = capture_execution_baseline(repo)
    (repo / "unrelated.txt").write_text("wrong\n")
    attribution = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    assert rollback_execution_owned_patch(repo, attribution["execution_owned_patch"]) is True
    assert (repo / "unrelated.txt").read_text() == "base\n"
    assert (repo / "existing.txt").read_text() == "pre-existing\n"


def test_committed_change_is_still_attributed_and_marked_non_reversible(repo):
    baseline, contents = capture_execution_baseline(repo)
    (repo / "unrelated.txt").write_text("committed wrong\n")
    git(repo, "add", "unrelated.txt")
    git(repo, "commit", "-m", "wrong task commit")
    attribution = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    assert attribution["task_changed_files"] == ["unrelated.txt"]
    assert attribution["head_changed"] is True
    assert verify_execution_scope(contract=contract(), attribution=attribution)["status"] == SCOPE_MISMATCH


class CorrectingAdapter:
    def __init__(self, repo): self.repo = repo; self.calls = 0
    def execute(self, task_package, *, cwd):
        self.calls += 1
        baseline, contents = capture_execution_baseline(cwd)
        target = "unrelated.txt" if self.calls == 1 else "allowed.txt"
        (cwd / target).write_text(f"attempt-{self.calls}\n")
        attribution = attribute_execution_changes(cwd, baseline=baseline, dirty_contents_before=contents)
        return CodexExecutionResult("tests passed\nbuild passed\ngit diff --check passed", f"session id: run-{self.calls}", 0,
                                    attribution["task_changed_files"], [], None, execution_baseline=baseline,
                                    execution_attribution=attribution, codex_run_id=f"run-{self.calls}")


def test_low_risk_scope_mismatch_is_corrected_once_without_preserving_wrong_patch(repo):
    adapter = CorrectingAdapter(repo)
    session = ExecutionSession("execution", "task", "package", status="approved")
    completed, artifact, _ = FounderExecutionLoop(adapter).run(session, package(), cwd=repo)
    assert adapter.calls == 2
    assert completed.result["scope_verification"]["status"] == SCOPE_PASS
    assert completed.result["codex_run_id"] == "run-2"
    assert artifact.changed_files == ["allowed.txt"]
    assert (repo / "unrelated.txt").read_text() == "base\n"


class AlwaysWrongAdapter(CorrectingAdapter):
    def execute(self, task_package, *, cwd):
        self.calls += 1
        baseline, contents = capture_execution_baseline(cwd)
        (cwd / "unrelated.txt").write_text(f"wrong-{self.calls}\n")
        attribution = attribute_execution_changes(cwd, baseline=baseline, dirty_contents_before=contents)
        return CodexExecutionResult("tests passed\nbuild passed", f"session id: wrong-{self.calls}", 0,
                                    attribution["task_changed_files"], [], None, execution_baseline=baseline,
                                    execution_attribution=attribution)


def test_second_scope_correction_failure_is_terminal_blocked(repo):
    adapter = AlwaysWrongAdapter(repo)
    session = ExecutionSession("execution", "task", "package", status="approved")
    with pytest.raises(ExecutionScopeBlocked):
        FounderExecutionLoop(adapter).run(session, package(), cwd=repo)
    assert adapter.calls == 2
    assert session.status == "blocked"
    assert (repo / "unrelated.txt").read_text() == "base\n"


def test_codex_run_identity_is_extracted_without_reusing_previous_task_context():
    assert codex_run_id("header\nsession id: 01abc-current\n") == "01abc-current"
