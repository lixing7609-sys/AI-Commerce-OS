import time

from app.founder_ai.verification_fallback import (
    ACCEPTANCE_FAILED, PASS, UNAVAILABLE, codex_command_evidence, evidence, execute_ui_verification_chain,
    founder_verification_narration, system_chrome_playwright_verifier,
)


def unavailable(name):
    return lambda: evidence(name, UNAVAILABLE, failure_reason="not available")


def passed(name):
    return lambda: evidence(name, PASS, detail={"assertions": "passed"})


def test_preferred_browser_pass_is_verified_without_fallback():
    called = []
    result = execute_ui_verification_chain(preferred={"status": "PASS"},
        system_browser=lambda: called.append(True), static_acceptance=lambda: called.append(True))
    assert result["status"] == "VERIFIED" and called == []


def test_preferred_unavailable_falls_back_to_system_chrome():
    result = execute_ui_verification_chain(preferred={"status": "MISSING", "error": "Browser is not available: iab"},
        system_browser=passed("system_chrome_playwright"), static_acceptance=unavailable("static"))
    assert result["status"] == "VERIFIED"
    assert [item["status"] for item in result["evidence"]] == [UNAVAILABLE, PASS]


def test_all_ui_verifiers_unavailable_is_terminal_blocked():
    result = execute_ui_verification_chain(preferred=None, system_browser=unavailable("chrome"), static_acceptance=unavailable("static"))
    assert result["status"] == "BLOCKED" and result["terminal"] is True


def test_acceptance_failure_is_failed_not_unavailable():
    result = execute_ui_verification_chain(preferred=None,
        system_browser=lambda: evidence("chrome", ACCEPTANCE_FAILED, failure_reason="target UI absent"),
        static_acceptance=passed("static"))
    assert result["status"] == "FAILED"
    assert result["evidence"][-1]["failure_reason"] == "target UI absent"


def test_verifier_timeout_continues_to_next_fallback():
    def stuck():
        time.sleep(.05)
        return passed("late")()
    result = execute_ui_verification_chain(preferred=None, system_browser=stuck,
        static_acceptance=passed("static"), timeout_seconds=.001)
    assert result["status"] == "VERIFIED"
    assert [item["status"] for item in result["evidence"]] == [UNAVAILABLE, "TIMEOUT", PASS]


def test_system_chrome_process_crash_is_unavailable_not_acceptance_failure(monkeypatch, tmp_path):
    script = tmp_path / "frontend/scripts/founder-ui-verifier.mjs"
    script.parent.mkdir(parents=True)
    script.write_text("// fixture")
    completed = type("Completed", (), {"returncode": -6, "stdout": "", "stderr": "Chrome SIGABRT"})()
    monkeypatch.setattr("app.founder_ai.verification_fallback.subprocess.run", lambda *args, **kwargs: completed)
    result = system_chrome_playwright_verifier(repo_root=tmp_path, contract={"artifact_type": "fixture"})
    assert result["status"] == UNAVAILABLE
    assert "SIGABRT" in result["failure_reason"]


def test_conversation_file_adapter_targets_only_visible_active_textarea_and_truthful_boundaries():
    from pathlib import Path
    script = (Path(__file__).resolve().parents[2] / "frontend/scripts/founder-ui-verifier.mjs").read_text()
    assert "founder_conversation_file_actions" in script
    assert ".sino-global-composer textarea:visible" in script
    assert "active_textarea_count" in script
    assert "tolerance = 1" in script
    assert "filechooser_opened" in script and "file_selected_false" in script
    assert "document_boundary_truthful" in script and "document_data_not_fabricated" in script


def test_generic_visible_adapter_counts_native_and_application_controls():
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    script = (root / "frontend/scripts/founder-ui-verifier.mjs").read_text()
    core = (root / "frontend/scripts/founder-ui-verifier-core.mjs").read_text()
    assert 'artifactType === "generic_visible_interaction"' in script
    assert 'contract.interaction_type === "search_clear"' in script
    assert "::-webkit-search-cancel-button" in script
    assert "effective_visible_clear_control_count" in script
    assert "clear_control_count_matches" in script and "duplicate_control_absent" in script
    assert "effectiveVisibleControlCount" in core and "evaluateVisibleCardinality" in core


def test_conversation_narration_matches_terminal_verification_state():
    verified = execute_ui_verification_chain(preferred=None, system_browser=passed("system_chrome_playwright"), static_acceptance=unavailable("static"))
    blocked = execute_ui_verification_chain(preferred=None, system_browser=unavailable("chrome"), static_acceptance=unavailable("static"))
    failed = execute_ui_verification_chain(preferred=None, system_browser=lambda: evidence("chrome", ACCEPTANCE_FAILED), static_acceptance=passed("static"))
    assert "本机浏览器" in founder_verification_narration(verified) and "任务完成" in founder_verification_narration(verified)
    assert "BLOCKED" in founder_verification_narration(blocked)
    assert "FAILED" in founder_verification_narration(failed)


def test_codex_command_results_require_explicit_evidence_not_expected_labels():
    missing = codex_command_evidence("implementation done", exit_code=0, required=["targeted tests", "frontend build", "git diff --check"])
    passed_checks = codex_command_evidence("15/15 tests passed\nfrontend build: passed\n`git diff --check`: passed", exit_code=0,
                                           required=["targeted tests", "frontend build", "git diff --check"])
    assert [item["status"] for item in missing] == [UNAVAILABLE, UNAVAILABLE, UNAVAILABLE]
    assert [item["status"] for item in passed_checks] == [PASS, PASS, PASS]


def test_codex_command_results_accept_chinese_counted_test_summary():
    checks = codex_command_evidence("定向测试：24 项全部通过\nFrontend Build：PASS\ngit diff --check：PASS", exit_code=0,
                                    required=["targeted frontend tests", "frontend build", "git diff --check"])
    assert [item["status"] for item in checks] == [PASS, PASS, PASS]


def test_codex_command_results_accept_verified_section_with_test_ratio():
    summary = "已通过：\n- `FounderNavigationPanel.test.jsx`：24/24\n- 前端生产构建\n- scoped `git diff --check`"
    checks = codex_command_evidence(summary, exit_code=0,
                                    required=["targeted frontend tests", "frontend build", "git diff --check"])
    assert [item["status"] for item in checks[:2]] == [PASS, PASS]
