from app.founder_ai.quick_fix_progression import advance_quick_fix, begin_quick_fix, build_quick_fix_contract, project_quick_fix_execution
from app.founder_ai.brain_runtime import SinoBrainRuntime


def route(**overrides):
    value = {"classification": "QUICK_FIX", "clarification_required": False, "founder_gate_required": False}
    value.update(overrides)
    return value


def test_clear_quick_fix_starts_inspection_without_manual_continue():
    result = begin_quick_fix(route())
    assert result["current_step"] == "inspect"
    assert result["execution_status"] == "inspecting"
    assert result["manual_continue_required"] is False
    assert result["manual_continue_count"] == 0
    action = SinoBrainRuntime._current_action({"discovery": {"task_complexity_route": result}})
    assert action["action_id"] == "quick_fix_inspecting"
    assert action["primary_label"] is None


def test_quick_fix_progresses_issue_inspect_fix_verify_complete_without_continue():
    result = begin_quick_fix(route())
    for step in ("fix", "verify", "complete"):
        result = advance_quick_fix(result, step)
    assert result["progress_log"] == ["issue", "inspect", "fix", "verify", "complete"]
    assert result["execution_status"] == "completed"
    assert result["manual_continue_count"] == 0
    action = SinoBrainRuntime._current_action({"discovery": {"task_complexity_route": result}})
    assert action == {"action_id": "quick_fix_completed", "title": "已完成，等待 Founder 验收", "description": "Quick Fix 已完成并通过验证。", "primary_label": None}


def test_clarification_stays_in_quick_fix_without_continue_goal():
    result = begin_quick_fix(route(clarification_required=True))
    action = SinoBrainRuntime._current_action({"discovery": {"task_complexity_route": result}})
    assert result["current_step"] == "issue"
    assert action["action_id"] == "quick_fix_clarification"
    assert action["primary_label"] is None


def test_quick_fix_inspect_contract_is_executable_and_evidence_bound():
    started = begin_quick_fix(route(quick_fix_contract={
        "issue_type": "UI_INTERACTION_BUG", "target_area": "isolated fixture",
        "observed_problem": "button does not toggle", "expected_behavior": "button toggles",
        "allowed_files_or_paths": ["frontend/src/fixture/**"],
        "prohibited_operations": ["external_write"], "verification": ["targeted_frontend_tests"],
        "founder_gate_reentry_conditions": ["architecture_boundary_change"],
    }))
    contract = build_quick_fix_contract(started, conversation_id="functional-verification-v1-a", task_id="task-a")
    assert contract["inspect_status"] == "ready_for_fix"
    assert contract["conversation_id"] == "functional-verification-v1-a"
    assert contract["task_id"] == "task-a"


def test_executor_status_autonomously_advances_full_quick_fix_lane():
    result = begin_quick_fix(route())
    for status in ("queued", "executing", "testing", "completed"):
        result = project_quick_fix_execution(result, status)
    assert result["progress_log"] == ["issue", "inspect", "fix", "verify", "complete"]
    assert result["execution_status"] == "completed"
    assert result["manual_continue_required"] is False
    assert result["manual_continue_count"] == 0
    assert result.get("founder_gate_required") is False
