"""Runtime-owned verification after a Codex implementation exits successfully."""
from __future__ import annotations

from pathlib import Path
import subprocess
from typing import Callable

from .verification_fallback import (
    ACCEPTANCE_FAILED, PASS, UNAVAILABLE, evidence, execute_ui_verification_chain,
    canonical_verification_attempt, system_chrome_playwright_verifier,
)


def _run(command: list[str], *, cwd: Path) -> dict:
    completed = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)
    return {
        "command": command, "exit_code": completed.returncode,
        "stdout": completed.stdout[-4000:], "stderr": completed.stderr[-4000:],
    }


def _frontend_tests(contract: dict, changed_files: list[str], repo_root: Path) -> list[str]:
    candidates = [
        path for path in contract.get("implementation_scope") or []
        if ".test." in path and (repo_root / path).is_file()
    ]
    for path in changed_files:
        if ".test." in path and (repo_root / path).is_file() and path not in candidates:
            candidates.append(path)
    visible_type = str((contract.get("visible_artifact_contract") or {}).get("artifact_type") or "")
    if visible_type == "founder_product_matrix_list_style":
        product_style_test = "frontend/src/sino-founder/ProductMatrixStyles.test.js"
        if (repo_root / product_style_test).is_file() and product_style_test not in candidates:
            candidates.append(product_style_test)
    return [path.removeprefix("frontend/") for path in candidates if path.startswith("frontend/")]


def run_post_implementation_pipeline(*, package, attribution: dict, repo_root: Path,
                                     preferred_browser: dict | None = None,
                                     execution_id: str | None = None,
                                     on_event: Callable[[str, str, str, dict], None] | None = None) -> dict:
    """Run required local verification without another Founder interaction."""
    emit = on_event or (lambda *_args: None)
    contract = dict(package.context.get("standard_task_contract") or {})
    changed_files = list(attribution.get("task_changed_files") or [])
    frontend_changed = any(path.startswith("frontend/") for path in changed_files)
    checks: list[dict] = []

    if contract.get("implementation_required", True) and not changed_files:
        return {
            "status": "BLOCKED", "stage": "implementation_evidence", "evidence": checks,
            "failure_reason": "NO_IMPLEMENTATION_EVIDENCE: implementation task produced no task-owned patch",
        }

    tests = _frontend_tests(contract, changed_files, repo_root)
    emit("tests_started", "testing", "Targeted tests started", {"tests": tests})
    if frontend_changed and tests:
        test_result = _run(["npm", "test", "--", "--run", *tests], cwd=repo_root / "frontend")
        test_status = PASS if test_result["exit_code"] == 0 else ACCEPTANCE_FAILED
    elif frontend_changed:
        test_result = {"command": [], "exit_code": None, "stdout": "", "stderr": "No targeted frontend test command resolved"}
        test_status = UNAVAILABLE
    else:
        test_result = {"command": [], "exit_code": None, "stdout": "Targeted frontend tests not required", "stderr": ""}
        test_status = "NOT_REQUIRED"
    test_evidence = evidence("targeted_tests", test_status, detail=test_result,
                             failure_reason=None if test_status in {PASS, "NOT_REQUIRED"} else "targeted tests were not executed")
    checks.append(test_evidence)
    test_event = "tests_passed" if test_status == PASS else "tests_skipped" if test_status == "NOT_REQUIRED" else "tests_failed"
    emit(test_event, "testing", f"Targeted tests: {test_status}", test_evidence)
    if test_status not in {PASS, "NOT_REQUIRED"}:
        return {"status": "BLOCKED" if test_status == UNAVAILABLE else "FAILED", "stage": "tests", "evidence": checks,
                "failure_reason": test_evidence.get("failure_reason")}

    emit("build_started", "building", "Production build started", {})
    if frontend_changed:
        build_result = _run(["npm", "run", "build"], cwd=repo_root / "frontend")
        build_status = PASS if build_result["exit_code"] == 0 else ACCEPTANCE_FAILED
    else:
        build_result = {"command": [], "exit_code": None, "stdout": "Frontend build not required", "stderr": ""}
        build_status = "NOT_REQUIRED"
    build_evidence = evidence("build", build_status, detail=build_result,
                              failure_reason=None if build_status in {PASS, "NOT_REQUIRED"} else "production build failed")
    checks.append(build_evidence)
    build_event = "build_passed" if build_status == PASS else "build_skipped" if build_status == "NOT_REQUIRED" else "build_failed"
    emit(build_event, "building", f"Production build: {build_status}", build_evidence)
    if build_status not in {PASS, "NOT_REQUIRED"}:
        return {"status": "FAILED", "stage": "build", "evidence": checks}

    emit("diff_check_started", "verifying", "git diff --check started", {})
    diff_result = _run(["git", "diff", "--check"], cwd=repo_root)
    diff_status = PASS if diff_result["exit_code"] == 0 else ACCEPTANCE_FAILED
    diff_evidence = evidence("git_diff_check", diff_status, detail=diff_result,
                             failure_reason=None if diff_status == PASS else "git diff --check failed")
    checks.append(diff_evidence)
    emit("diff_check_passed" if diff_status == PASS else "diff_check_failed", "verifying", f"git diff --check: {diff_status}", diff_evidence)
    if diff_status != PASS:
        return {"status": "FAILED", "stage": "diff_check", "evidence": checks}

    visible = dict(contract.get("visible_artifact_contract") or {})
    if frontend_changed and not visible.get("required"):
        return {"status": "BLOCKED", "stage": "browser", "evidence": checks,
                "failure_reason": "UI implementation requires a visible artifact contract and browser evidence"}
    if visible.get("required"):
        attempt_identity = canonical_verification_attempt(
            execution_id=execution_id or "unbound-execution", verification_stage="visible_artifact",
            contract=visible,
        )
        emit("browser_verification_started", "verifying", "Visible artifact verification started", attempt_identity)
        chain = execute_ui_verification_chain(
            preferred=preferred_browser,
            system_browser=lambda: system_chrome_playwright_verifier(repo_root=repo_root, contract=visible),
            static_acceptance=lambda: evidence(
                "component_static_acceptance", PASS if test_status == PASS and tests else UNAVAILABLE,
                detail={"passing_component_tests": tests},
                failure_reason=None if test_status == PASS and tests else "no passing component acceptance test",
            ),
            requirements=dict(visible.get("verification_requirements") or {}),
            timeout_seconds=45,
        )
        for attempt in chain["evidence"]:
            verifier = str(attempt.get("verifier") or "browser")
            suffix = "passed" if attempt.get("status") == PASS else "unavailable" if attempt.get("status") in {UNAVAILABLE, "TIMEOUT"} else "failed"
            event_prefix = {
                "system_chrome_playwright": "fallback_browser",
                "component_static_acceptance": "component_static_acceptance",
            }.get(verifier, verifier)
            event_suffix = "pass" if event_prefix == "component_static_acceptance" and suffix == "passed" else suffix
            emit(f"{event_prefix}_{event_suffix}", "verifying", f"{verifier}: {attempt.get('status')}", {**attempt, **attempt_identity})
        checks.extend(chain["evidence"])
        if chain["status"] != "VERIFIED":
            return {"status": chain["status"], "stage": "browser", "evidence": checks,
                    "verification_attempt": {**attempt_identity, "status": chain["status"]},
                    "failure_reason": chain.get("failure_reason")}
    emit("verification_completed", "verified", "Post-implementation verification completed", {})
    result = {"status": "VERIFIED", "stage": "complete", "evidence": checks}
    if visible.get("required"):
        result["verification_attempt"] = {**attempt_identity, "status": "VERIFIED"}
        result["authority_satisfied"] = chain.get("authority_satisfied", True)
        result["verification_source"] = chain.get("verification_source")
    return result
