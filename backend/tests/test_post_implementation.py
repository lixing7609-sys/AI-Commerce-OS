from pathlib import Path

from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.post_implementation import run_post_implementation_pipeline


def package():
    task = TaskAssetDraft("UI", "UI", {}, [], "low", False)
    return ExecutionPackage(
        goal="adjust sidebar UI",
        context={"standard_task_contract": {
            "implementation_scope": ["frontend/src/sino-founder/FounderNavigationPanel.test.jsx"],
            "visible_artifact_contract": {"required": True, "artifact_type": "semantic_ui"},
        }},
        task_asset=task, constraints=[], verification=[], commit_requirement="none",
        approval_required=False, execution_allowed=True,
    )


def test_runtime_runs_tests_build_diff_and_browser_without_founder_interaction(monkeypatch, tmp_path: Path):
    frontend = tmp_path / "frontend/src/sino-founder"
    frontend.mkdir(parents=True)
    (frontend / "FounderNavigationPanel.test.jsx").write_text("test")
    commands = []
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: commands.append((command, cwd)) or {
        "command": command, "exit_code": 0, "stdout": "PASS", "stderr": "",
    })
    monkeypatch.setattr("app.founder_ai.post_implementation.execute_ui_verification_chain", lambda **_kwargs: {
        "status": "VERIFIED", "evidence": [{"verifier": "system_chrome_playwright", "status": "PASS"}],
    })
    events = []
    result = run_post_implementation_pipeline(
        package=package(), repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]},
        on_event=lambda name, status, message, metadata: events.append(name),
    )
    assert result["status"] == "VERIFIED"
    assert [item[0][:3] for item in commands] == [
        ["npm", "test", "--"], ["npm", "run", "build"], ["git", "diff", "--check"],
    ]
    assert events == [
        "tests_started", "tests_passed", "build_started", "build_passed",
        "diff_check_started", "diff_check_passed", "browser_verification_started",
        "fallback_browser_passed", "verification_completed",
    ]


def test_test_failure_stops_before_build(monkeypatch, tmp_path: Path):
    frontend = tmp_path / "frontend/src/sino-founder"
    frontend.mkdir(parents=True)
    (frontend / "FounderNavigationPanel.test.jsx").write_text("test")
    commands = []
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: commands.append(command) or {
        "command": command, "exit_code": 1, "stdout": "", "stderr": "failed",
    })
    result = run_post_implementation_pipeline(
        package=package(), repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]},
    )
    assert result["status"] == "FAILED"
    assert result["stage"] == "tests"
    assert len(commands) == 1
