"""Canonical execution stages derived exclusively from durable runtime events."""

from __future__ import annotations

import os
import subprocess
from hashlib import sha256
from functools import lru_cache
from pathlib import Path


STAGE_BY_EVENT = {
    "approved": "READY",
    "queued": "QUEUED",
    "worker_started": "DISPATCHING",
    "execution_resumed": "QUEUED",
    "backend_restarted": "QUEUED",
    "codex_started": "IMPLEMENTING",
    "codex_finished": "IMPLEMENTING",
    "scope_verification_started": "SCOPE_VERIFYING",
    "scope_verification_finished": "SCOPE_VERIFYING",
    "scope_correction_started": "SCOPE_VERIFYING",
    "scope_correction_finished": "SCOPE_VERIFYING",
    "tests_started": "TESTING",
    "tests_passed": "TESTING",
    "tests_failed": "FAILED",
    "build_started": "BUILDING",
    "build_passed": "BUILDING",
    "build_failed": "FAILED",
    "diff_check_started": "DIFF_CHECKING",
    "diff_check_passed": "DIFF_CHECKING",
    "diff_check_failed": "FAILED",
    "browser_verification_started": "UI_VERIFYING",
    "preferred_browser_started": "UI_VERIFYING",
    "preferred_browser_unavailable": "UI_VERIFYING",
    "fallback_browser_started": "UI_VERIFYING",
    "fallback_browser_passed": "UI_VERIFYING",
    "verification_completed": "FINALIZING",
    "artifact_saved": "FINALIZING",
    "memory_saved": "FINALIZING",
    "completed": "COMPLETED",
    "failed": "BLOCKED",
    "cancelled_by_founder": "CANCELLED",
    "cancelled_due_to_route_misclassification": "CANCELLED",
}

STAGE_PROGRESS = {
    "CREATED": 5, "READY": 10, "QUEUED": 15, "DISPATCHING": 20,
    "IMPLEMENTING": 40, "SCOPE_VERIFYING": 50, "TESTING": 60,
    "BUILDING": 70, "DIFF_CHECKING": 80, "UI_VERIFYING": 90,
    "FINALIZING": 95, "COMPLETED": 100, "BLOCKED": 100,
    "FAILED": 100, "CANCELLED": 100,
}


def canonical_stage(event_name: str, status: str | None = None) -> str:
    if event_name == "failed" and status == "failed":
        return "FAILED"
    return STAGE_BY_EVENT.get(event_name, "CREATED")


@lru_cache(maxsize=1)
def runtime_revision() -> str:
    configured = os.getenv("FOUNDER_RUNTIME_REVISION") or os.getenv("GIT_SHA")
    if configured:
        return configured
    root = Path(__file__).resolve().parents[3]
    try:
        head = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"], cwd=root,
            capture_output=True, text=True, timeout=2, check=True,
        ).stdout.strip() or "unknown"
        dirty = subprocess.run(
            ["git", "status", "--porcelain=v1"], cwd=root,
            capture_output=True, text=True, timeout=2, check=True,
        ).stdout
        if dirty.strip():
            return f"{head}+dirty-{sha256(dirty.encode()).hexdigest()[:8]}"
        return head
    except (OSError, subprocess.SubprocessError):
        return "unknown"
