"""Bounded, terminal verification fallback chain for autonomous local UI work."""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import queue
import subprocess
import re
from threading import Thread
from typing import Callable


PASS = "PASS"
UNAVAILABLE = "UNAVAILABLE"
ACCEPTANCE_FAILED = "ACCEPTANCE_FAILED"
TIMEOUT = "TIMEOUT"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def evidence(verifier: str, status: str, *, detail=None, failure_reason: str | None = None,
             started_at: str | None = None) -> dict:
    return {
        "verifier": verifier,
        "status": status,
        "started_at": started_at or _now(),
        "finished_at": _now(),
        "evidence": detail,
        "failure_reason": failure_reason,
    }


def run_with_timeout(verifier: str, callback: Callable[[], dict], timeout_seconds: float) -> dict:
    """Run one verifier without letting a stuck adapter hold the execution lifecycle open."""
    started_at = _now()
    results: queue.Queue = queue.Queue(maxsize=1)

    def invoke() -> None:
        try:
            results.put(callback())
        except Exception as error:  # Adapter failure is availability, not acceptance failure.
            results.put(evidence(verifier, UNAVAILABLE, failure_reason=str(error), started_at=started_at))

    Thread(target=invoke, daemon=True, name=f"verification-{verifier}").start()
    try:
        result = results.get(timeout=timeout_seconds)
    except queue.Empty:
        return evidence(verifier, TIMEOUT, failure_reason=f"timed out after {timeout_seconds:g}s", started_at=started_at)
    normalized = dict(result or {})
    normalized.setdefault("verifier", verifier)
    normalized.setdefault("started_at", started_at)
    normalized.setdefault("finished_at", _now())
    normalized.setdefault("evidence", None)
    normalized.setdefault("failure_reason", None)
    return normalized


def preferred_browser_evidence(raw: dict | None) -> dict:
    raw = dict(raw or {})
    status = str(raw.get("status") or "MISSING").upper()
    if status == PASS:
        return evidence("preferred_browser", PASS, detail=raw)
    if status in {"FAIL", ACCEPTANCE_FAILED}:
        return evidence("preferred_browser", ACCEPTANCE_FAILED, detail=raw,
                        failure_reason=raw.get("error") or raw.get("failure_reason") or "browser acceptance failed")
    return evidence("preferred_browser", UNAVAILABLE, detail=raw,
                    failure_reason=raw.get("error") or raw.get("failure_reason") or f"preferred browser evidence {status.lower()}")


def codex_command_evidence(stdout: str, *, exit_code: int, required: list[str]) -> list[dict]:
    """Extract explicit command outcomes; expected verification labels alone are not proof."""
    text = stdout or ""
    lowered = text.lower()
    checks = []
    definitions = (
        ("targeted_tests", any("test" in item.lower() for item in required),
         bool(re.search(r"(?:\d+\s*(?:/\s*\d+)?\s*(?:项|个)?\s*(?:tests?\s*)?(?:全部\s*)?(?:passed|通过)|targeted tests?\s*[:：]\s*(?:pass|passed|通过)|test(?:\.jsx|\.tsx|\.js|\.ts|\.py)?[^\n]*[:：]\s*\d+\s*/\s*\d+)", lowered, re.I))),
        ("build", any("build" in item.lower() for item in required),
         bool(re.search(r"(?:build|构建)\s*[:：]?\s*(?:pass|passed|通过|成功)|已通过\s*[:：][\s\S]{0,400}(?:前端生产构建|production build)", lowered, re.I))),
        ("git_diff_check", any("diff" in item.lower() for item in required),
         bool(re.search(r"git diff --check`?\s*[:：]?\s*(?:pass|passed|通过|clean|无错误)", lowered, re.I))),
    )
    for verifier, required_check, explicit_pass in definitions:
        status = PASS if exit_code == 0 and (explicit_pass or not required_check) else UNAVAILABLE if exit_code == 0 else ACCEPTANCE_FAILED
        checks.append(evidence(verifier, status, detail={"required": required_check, "explicit_pass": explicit_pass},
                               failure_reason=None if status == PASS else "explicit command result missing" if status == UNAVAILABLE else "Codex execution failed"))
    return checks


def execute_ui_verification_chain(*, preferred: dict | None,
                                  system_browser: Callable[[], dict],
                                  static_acceptance: Callable[[], dict],
                                  timeout_seconds: float = 30) -> dict:
    """Return one terminal VERIFIED/BLOCKED/FAILED decision and all attempted evidence."""
    attempts = [preferred_browser_evidence(preferred)]
    if attempts[-1]["status"] == PASS:
        return {"status": "VERIFIED", "terminal": True, "evidence": attempts}
    if attempts[-1]["status"] == ACCEPTANCE_FAILED:
        return {"status": "FAILED", "terminal": True, "failure_reason": attempts[-1]["failure_reason"], "evidence": attempts}

    for name, callback in (("system_chrome_playwright", system_browser), ("component_static_acceptance", static_acceptance)):
        attempt = run_with_timeout(name, callback, timeout_seconds)
        attempts.append(attempt)
        if attempt["status"] == PASS:
            return {"status": "VERIFIED", "terminal": True, "evidence": attempts}
        if attempt["status"] == ACCEPTANCE_FAILED:
            return {"status": "FAILED", "terminal": True, "failure_reason": attempt["failure_reason"], "evidence": attempts}
    return {
        "status": "BLOCKED", "terminal": True,
        "failure_reason": "no available UI acceptance verifier",
        "evidence": attempts,
    }


def founder_verification_narration(result: dict) -> str:
    attempts = list(result.get("evidence") or [])
    preferred_unavailable = bool(attempts and attempts[0].get("status") in {UNAVAILABLE, TIMEOUT})
    fallback = next((item for item in attempts[1:] if item.get("status") == PASS), None)
    if result.get("status") == "VERIFIED":
        if preferred_unavailable and fallback and fallback.get("verifier") == "system_chrome_playwright":
            return "内置浏览器不可用，已自动切换本机浏览器；页面验证通过，任务完成。"
        if preferred_unavailable and fallback:
            return "内置浏览器不可用，已自动使用组件验收证据完成验证；任务完成。"
        return "页面验证通过，任务完成。"
    if result.get("status") == "FAILED":
        return "页面验证已执行，但验收结果未通过；任务已停止为 FAILED。"
    return "代码修改、测试和构建已完成，但页面验证器均不可用；任务已停止为 BLOCKED，等待人工验收。"


def system_chrome_playwright_verifier(*, repo_root: Path, contract: dict, timeout_seconds: float = 45) -> dict:
    """Run the local Chrome verifier out of process so OS/browser failures are bounded."""
    script = repo_root / "frontend" / "scripts" / "founder-ui-verifier.mjs"
    if not script.is_file():
        return evidence("system_chrome_playwright", UNAVAILABLE, failure_reason="system browser verifier script missing")
    try:
        completed = subprocess.run(
            ["node", str(script), json.dumps(contract)], cwd=repo_root / "frontend",
            capture_output=True, text=True, timeout=timeout_seconds, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return evidence("system_chrome_playwright", UNAVAILABLE, failure_reason=str(error))
    try:
        payload = json.loads(completed.stdout.strip() or "{}")
    except json.JSONDecodeError:
        payload = {}
    status = str(payload.get("status") or (UNAVAILABLE if completed.returncode == 2 else ACCEPTANCE_FAILED)).upper()
    if status not in {PASS, UNAVAILABLE, ACCEPTANCE_FAILED}:
        status = ACCEPTANCE_FAILED
    return evidence("system_chrome_playwright", status, detail=payload.get("evidence"),
                    failure_reason=payload.get("failure_reason") or (completed.stderr.strip() or None))
