"""Finite, autonomous progression state for bounded Quick Fix work."""
from __future__ import annotations

from copy import deepcopy

STEPS = ("issue", "inspect", "fix", "verify", "complete")
STATUS_FOR_STEP = {
    "issue": "clarification_required",
    "inspect": "inspecting",
    "fix": "fixing",
    "verify": "verifying",
    "complete": "completed",
}


def begin_quick_fix(route: dict) -> dict:
    result = deepcopy(route)
    result.update({
        "manual_continue_required": False,
        "manual_continue_count": 0,
        "current_step": "issue" if result.get("clarification_required") else "inspect",
        "execution_status": "clarification_required" if result.get("clarification_required") else "inspecting",
    })
    result["progress_log"] = ["issue"] + ([] if result.get("clarification_required") else ["inspect"])
    return result


def advance_quick_fix(route: dict, next_step: str) -> dict:
    if next_step not in STEPS:
        raise ValueError("invalid_quick_fix_step")
    result = deepcopy(route)
    current = result.get("current_step") or "issue"
    if STEPS.index(next_step) != STEPS.index(current) + 1:
        raise ValueError("invalid_quick_fix_transition")
    result["current_step"] = next_step
    result["execution_status"] = STATUS_FOR_STEP[next_step]
    result["manual_continue_required"] = False
    result["manual_continue_count"] = 0
    result["progress_log"] = list(result.get("progress_log") or []) + [next_step]
    return result
