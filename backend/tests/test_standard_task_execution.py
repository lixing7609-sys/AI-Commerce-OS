from app.founder_ai.standard_task_execution import build_standard_task_contract
from app.founder_ai.task_complexity_router import QUICK_FIX, STANDARD_TASK, STRATEGIC_TASK, route_task_complexity


GOAL = "给能力仓库增加搜索功能，可以按能力名称和 Domain 搜索，保持现有页面结构和风格不变。"


def test_clear_repository_search_is_a_standard_task_without_founder_confirmation():
    route = route_task_complexity(GOAL)
    assert route["classification"] == STANDARD_TASK
    assert route["clarification_required"] is False
    assert route["founder_gate_required"] is False
    assert route["strategy_meeting_required"] is False


def test_standard_task_contract_is_inspected_and_bounded():
    contract = build_standard_task_contract(conversation_id="conv-path-b", goal=GOAL, task_id="task-path-b")
    assert contract["task_type"] == STANDARD_TASK
    assert contract["target_surface"] == "Capability Repository"
    assert contract["search_fields"] == ["capability_name", "domain"]
    assert contract["inspect_status"] == "ready_for_plan"
    assert "backend_search_service" in contract["prohibited_scope"]
    assert len(contract["implementation_plan"]) == 5


def test_standard_lane_does_not_consume_quick_fix_or_strategic_tasks():
    assert route_task_complexity("修一下按钮样式")["classification"] == QUICK_FIX
    assert route_task_complexity("进行 Founder 与 Studio 的架构变更和跨模块重大改造")["classification"] == STRATEGIC_TASK
