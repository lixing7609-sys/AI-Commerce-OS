from app.founder_ai.quick_fix_progression import advance_quick_fix, begin_quick_fix
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
