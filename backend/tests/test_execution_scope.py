from dataclasses import replace
from pathlib import Path
import subprocess

import pytest

from app.founder_ai.codex_adapter import CodexExecutionResult
from app.founder_ai.execution_loop import ExecutionScopeBlocked, ExecutionSession, FounderExecutionLoop
from app.founder_ai.execution_scope import (
    SCOPE_MISMATCH, SCOPE_PASS, attribute_execution_changes, capture_execution_baseline,
    codex_run_id, rollback_execution_owned_patch, rollback_scope_mismatch_patch, verify_execution_scope,
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


@pytest.mark.parametrize("verification_outcome", ["VERIFIED", "BLOCKED_BROWSER", "FAILED_BUILD", "FAILED_TEST"])
def test_scope_pass_patch_cannot_be_rolled_back_by_verification_cleanup(repo, verification_outcome):
    baseline, contents = capture_execution_baseline(repo)
    (repo / "allowed.txt").write_text("valid task artifact\n")
    attribution = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    scope = verify_execution_scope(contract=contract(), attribution=attribution)
    assert scope["status"] == SCOPE_PASS
    # A later verification outcome is intentionally not an input to rollback authority.
    assert verification_outcome in {"VERIFIED", "BLOCKED_BROWSER", "FAILED_BUILD", "FAILED_TEST"}
    assert rollback_scope_mismatch_patch(repo, scope_verification=scope, attribution=attribution) is False
    assert (repo / "allowed.txt").read_text() == "valid task artifact\n"


def test_scope_mismatch_authorizes_only_execution_owned_patch_rollback(repo):
    (repo / "existing.txt").write_text("pre-existing\n")
    baseline, contents = capture_execution_baseline(repo)
    (repo / "unrelated.txt").write_text("wrong\n")
    attribution = attribute_execution_changes(repo, baseline=baseline, dirty_contents_before=contents)
    scope = verify_execution_scope(contract=contract(), attribution=attribution)
    assert rollback_scope_mismatch_patch(repo, scope_verification=scope, attribution=attribution) is True
    assert (repo / "unrelated.txt").read_text() == "base\n"
    assert (repo / "existing.txt").read_text() == "pre-existing\n"


def test_shared_css_hunk_is_checked_against_the_task_selector():
    contract = {
        "objective": "product matrix typography",
        "implementation_scope": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "allowed_css_selectors": [".founder-navigation-panel .sino-sidebar-products"],
    }
    matching = {
        "task_changed_files": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "execution_owned_patch": "--- a/frontend/src/sino-founder/sino-founder-ai.css\n+++ b/frontend/src/sino-founder/sino-founder-ai.css\n@@ -1 +1 @@\n+.founder-navigation-panel .sino-sidebar-products { font-size: 13px; }\n",
    }
    unrelated = {
        **matching,
        "execution_owned_patch": "--- a/frontend/src/sino-founder/sino-founder-ai.css\n+++ b/frontend/src/sino-founder/sino-founder-ai.css\n@@ -1 +1 @@\n+.sino-model-center { font-size: 13px; }\n",
    }
    assert verify_execution_scope(contract=contract, attribution=matching)["status"] == SCOPE_PASS
    mismatch = verify_execution_scope(contract=contract, attribution=unrelated)
    assert mismatch["status"] == SCOPE_MISMATCH
    assert mismatch["out_of_scope_hunks"] == ["frontend/src/sino-founder/sino-founder-ai.css#hunk-1"]


def test_task_owned_jsx_class_attributes_matching_shared_css_hunk_only():
    contract = {
        "objective": "add a bounded navigation interaction",
        "scope_source": "semantic_module",
        "scope_confidence": "HIGH",
        "implementation_scope": [
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "semantic_scope": {
            "scope_source": "semantic_module",
            "confidence": "HIGH",
            "allowed_file_patterns": [
                "frontend/src/sino-founder/FounderNavigationPanel.jsx",
                "frontend/src/sino-founder/sino-founder-ai.css",
            ],
            "semantic_hunk_markers": ["FounderNavigationPanel"],
        },
    }
    matching = {
        "task_changed_files": list(contract["implementation_scope"]),
        "execution_owned_patch": (
            "--- a/frontend/src/sino-founder/FounderNavigationPanel.jsx\n"
            "+++ b/frontend/src/sino-founder/FounderNavigationPanel.jsx\n"
            "@@ -1 +1 @@\n"
            "+<div className=\"sino-task-owned-discussion-menu\" />\n"
            "--- a/frontend/src/sino-founder/sino-founder-ai.css\n"
            "+++ b/frontend/src/sino-founder/sino-founder-ai.css\n"
            "@@ -1 +1 @@\n"
            "+.sino-task-owned-discussion-menu { position: fixed; }\n"
        ),
    }
    assert verify_execution_scope(contract=contract, attribution=matching)["status"] == SCOPE_PASS
    unrelated = {
        **matching,
        "execution_owned_patch": matching["execution_owned_patch"].replace(
            ".sino-task-owned-discussion-menu { position: fixed; }",
            ".sino-model-center { position: fixed; }",
        ),
    }
    result = verify_execution_scope(contract=contract, attribution=unrelated)
    assert result["status"] == SCOPE_MISMATCH
    assert result["out_of_scope_hunks"] == ["frontend/src/sino-founder/sino-founder-ai.css#hunk-1"]


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
    assert completed.result["task_owned_patch_persisted"] is True
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


class EmptyCorrectionAdapter(CorrectingAdapter):
    def execute(self, task_package, *, cwd):
        self.calls += 1
        baseline, contents = capture_execution_baseline(cwd)
        if self.calls == 1:
            (cwd / "unrelated.txt").write_text("wrong\n")
        attribution = attribute_execution_changes(cwd, baseline=baseline, dirty_contents_before=contents)
        return CodexExecutionResult("done", "", 0, attribution["task_changed_files"], [], None,
                                    execution_baseline=baseline, execution_attribution=attribution,
                                    codex_run_id=f"empty-{self.calls}")


def test_scope_correction_empty_patch_is_not_persisted_or_completed(repo):
    adapter = EmptyCorrectionAdapter(repo)
    session = ExecutionSession("execution", "task", "package", status="approved")
    with pytest.raises(ExecutionScopeBlocked, match="NO_IMPLEMENTATION_EVIDENCE"):
        FounderExecutionLoop(adapter).run(session, package(), cwd=repo)
    assert session.status == "blocked"
    assert session.result["task_owned_patch_persisted"] is False
    assert session.result["production_changed_files"] == []


def test_codex_run_identity_is_extracted_without_reusing_previous_task_context():
    assert codex_run_id("header\nsession id: 01abc-current\n") == "01abc-current"
