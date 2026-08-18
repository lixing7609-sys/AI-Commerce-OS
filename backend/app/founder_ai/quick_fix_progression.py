"""Finite, autonomous progression state for bounded Quick Fix work."""
from __future__ import annotations

from copy import deepcopy
from uuid import uuid4

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


def build_quick_fix_contract(route: dict, *, conversation_id: str, task_id: str | None = None) -> dict:
    """Freeze inspect output before any executable Quick Fix is dispatched."""
    source = deepcopy(route.get("quick_fix_contract") or {})
    required = ("issue_type", "target_area", "observed_problem", "expected_behavior")
    inspect_ready = all(source.get(key) for key in required) and bool(source.get("allowed_files_or_paths"))
    source.update({
        "task_id": task_id or f"quick-fix-task-{uuid4().hex[:20]}",
        "conversation_id": conversation_id,
        "allowed_files_or_paths": list(source.get("allowed_files_or_paths") or []),
        "prohibited_operations": list(source.get("prohibited_operations") or []),
        "verification": list(source.get("verification") or []),
        "founder_gate_reentry_conditions": list(source.get("founder_gate_reentry_conditions") or []),
        "inspect_status": "ready_for_fix" if inspect_ready else "clarification_required",
    })
    return source


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


def project_quick_fix_execution(route: dict, execution_status: str) -> dict:
    """Consume executor lifecycle without requiring a Founder continue action."""
    target = {
        "queued": "fix", "executing": "fix", "testing": "verify",
        "completed": "complete",
    }.get(execution_status)
    result = deepcopy(route)
    if target is None:
        return result
    current = result.get("current_step") or "inspect"
    while STEPS.index(current) < STEPS.index(target):
        current = STEPS[STEPS.index(current) + 1]
        result = advance_quick_fix(result, current)
    result["manual_continue_required"] = False
    result["manual_continue_count"] = 0
    return result
