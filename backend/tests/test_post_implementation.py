from pathlib import Path

from app.founder_ai.orchestrator import ExecutionPackage, TaskAssetDraft
from app.founder_ai.post_implementation import run_post_implementation_pipeline
from app.founder_ai.verification_fallback import UNAVAILABLE, evidence


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


def test_ui_implementation_without_task_owned_patch_is_blocked(tmp_path: Path):
    result = run_post_implementation_pipeline(
        package=package(), repo_root=tmp_path, attribution={"task_changed_files": []},
    )
    assert result["status"] == "BLOCKED"
    assert result["stage"] == "implementation_evidence"


def test_frontend_change_without_targeted_test_command_is_not_pass(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: {
        "command": command, "exit_code": 0, "stdout": "PASS", "stderr": "",
    })
    task = TaskAssetDraft("UI", "UI", {}, [], "low", False)
    no_tests = ExecutionPackage(
        goal="adjust UI", context={"standard_task_contract": {
            "implementation_required": True, "implementation_scope": [],
            "visible_artifact_contract": {"required": True, "artifact_type": "semantic_ui"},
        }}, task_asset=task, constraints=[], verification=[], commit_requirement="none",
        approval_required=False, execution_allowed=True,
    )
    result = run_post_implementation_pipeline(
        package=no_tests, repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]},
    )
    assert result["status"] == "BLOCKED"
    assert result["stage"] == "tests"
    assert result["evidence"][0]["status"] == "UNAVAILABLE"
    assert result["evidence"][0]["evidence"]["command"] == []


def test_frontend_verification_resolves_canonical_safe_command(monkeypatch, tmp_path: Path):
    commands = []
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: commands.append((command, cwd)) or {
        "command": command, "exit_code": 0, "stdout": "PASS", "stderr": "",
    })
    task = TaskAssetDraft("Fixture", "Fixture", {}, [], "medium", False)
    bounded = ExecutionPackage(
        goal="change fixture",
        context={
            "operation_type": "BOUNDED_CODE_CHANGE",
            "standard_task_contract": {
                "implementation_required": True,
                "implementation_scope": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            },
            "verification_commands": [[
                "npm", "--prefix", "frontend", "test", "--", "--run",
                "src/sino-founder/ConversationThread.test.jsx",
            ]],
        },
        task_asset=task, constraints=[], verification=[], commit_requirement="none",
        approval_required=False, execution_allowed=True,
    )

    result = run_post_implementation_pipeline(
        package=bounded, repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"]},
    )

    assert result["status"] == "VERIFIED"
    assert commands[0] == ([
        "npm", "--prefix", "frontend", "test", "--", "--run",
        "src/sino-founder/ConversationThread.test.jsx",
    ], tmp_path)
    assert commands[1][0] == ["npm", "run", "build"]
    assert commands[2][0] == ["git", "diff", "--check"]


def test_canonical_frontend_test_failure_stops_before_build(monkeypatch, tmp_path: Path):
    commands = []

    def runner(command, cwd):
        commands.append(command)
        return {"command": command, "exit_code": 1, "stdout": "", "stderr": "failed"}

    monkeypatch.setattr("app.founder_ai.post_implementation._run", runner)
    task = TaskAssetDraft("Fixture", "Fixture", {}, [], "medium", False)
    bounded = ExecutionPackage(
        goal="change fixture",
        context={
            "operation_type": "BOUNDED_CODE_CHANGE",
            "standard_task_contract": {
                "implementation_required": True,
                "implementation_scope": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            },
            "verification_plan": [[
                "npm", "--prefix", "frontend", "test", "--", "--run",
                "src/sino-founder/ConversationThread.test.jsx",
            ]],
        },
        task_asset=task, constraints=[], verification=[], commit_requirement="none",
        approval_required=False, execution_allowed=True,
    )

    result = run_post_implementation_pipeline(
        package=bounded, repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"]},
    )

    assert result["status"] == "FAILED"
    assert result["stage"] == "tests"
    assert len(commands) == 1


def test_codex_transcript_is_not_canonical_verification_authority(monkeypatch, tmp_path: Path):
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: {
        "command": command, "exit_code": 0, "stdout": "PASS", "stderr": "",
    })
    task = TaskAssetDraft("Fixture", "Fixture", {}, [], "medium", False)
    bounded = ExecutionPackage(
        goal="change fixture",
        context={
            "operation_type": "BOUNDED_CODE_CHANGE",
            "standard_task_contract": {
                "implementation_required": True,
                "implementation_scope": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"],
            },
        },
        task_asset=task, constraints=[], verification=["Codex transcript says tests passed"],
        commit_requirement="none", approval_required=False, execution_allowed=True,
    )

    result = run_post_implementation_pipeline(
        package=bounded, repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/live-founder-acceptance-fixture.txt"]},
    )

    assert result["status"] == "BLOCKED"
    assert result["stage"] == "tests"
    assert result["evidence"][0]["evidence"]["command"] == []


def test_frontend_change_without_visible_contract_cannot_complete(monkeypatch, tmp_path: Path):
    frontend = tmp_path / "frontend/src/sino-founder"
    frontend.mkdir(parents=True)
    (frontend / "FounderNavigationPanel.test.jsx").write_text("test")
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: {
        "command": command, "exit_code": 0, "stdout": "PASS", "stderr": "",
    })
    task = TaskAssetDraft("UI", "UI", {}, [], "low", False)
    no_browser = ExecutionPackage(
        goal="adjust UI", context={"standard_task_contract": {
            "implementation_required": True,
            "implementation_scope": ["frontend/src/sino-founder/FounderNavigationPanel.test.jsx"],
        }}, task_asset=task, constraints=[], verification=[], commit_requirement="none",
        approval_required=False, execution_allowed=True,
    )
    result = run_post_implementation_pipeline(
        package=no_browser, repo_root=tmp_path,
        attribution={"task_changed_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]},
    )
    assert result["status"] == "BLOCKED"
    assert result["stage"] == "browser"


def test_component_tests_cannot_complete_real_browser_required_interaction(monkeypatch, tmp_path: Path):
    frontend = tmp_path / "frontend/src/sino-founder"
    frontend.mkdir(parents=True)
    (frontend / "FounderNavigationPanel.test.jsx").write_text("test")
    monkeypatch.setattr("app.founder_ai.post_implementation._run", lambda command, cwd: {
        "command": command, "exit_code": 0, "stdout": "PASS", "stderr": "",
    })
    monkeypatch.setattr(
        "app.founder_ai.post_implementation.system_chrome_playwright_verifier",
        lambda **_kwargs: evidence("system_chrome_playwright", UNAVAILABLE, failure_reason="adapter unavailable"),
    )
    required = package()
    required.context["standard_task_contract"]["visible_artifact_contract"].update({
        "interaction_type": "generic_control_state",
        "verification_requirements": {
            "real_browser_required": True, "interaction_required": True,
            "component_static_allowed": False,
        },
    })
    result = run_post_implementation_pipeline(
        package=required, repo_root=tmp_path, execution_id="execution-authority",
        attribution={"task_changed_files": ["frontend/src/sino-founder/FounderNavigationPanel.jsx"]},
    )
    assert result["status"] == "BLOCKED"
    assert result["stage"] == "browser"
    assert result["verification_attempt"]["attempt_number"] == 1
    assert result["evidence"][-1]["verifier"] == "component_static_acceptance"
