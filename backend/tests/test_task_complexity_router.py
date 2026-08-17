from app.founder_ai.task_complexity_router import *

def test_quick_fix_skips_strategy_and_architecture():
    result = route_task_complexity("修一下左边栏 AI Commerce OS 的折叠问题。")
    assert result["classification"] == QUICK_FIX
    assert result["founder_gate_required"] is False
    assert result["strategy_meeting_required"] is False
    assert result["architecture_proposal_required"] is False
    assert result["quick_fix_contract"]["prohibited_operations"]

def test_screenshot_and_text_route_to_quick_fix():
    result = route_task_complexity("箭头这里点击后应该折叠", image_understanding="Screenshot shows left sidebar AI Commerce OS project tree and collapse arrow")
    assert result["classification"] == QUICK_FIX and result["evidence"]["image_understanding_used"]

def test_standard_strategic_and_gate_routes():
    assert route_task_complexity("增加一个明确的导出字段")["classification"] == STANDARD_TASK
    assert route_task_complexity("建立一个新系统并比较架构方案")["classification"] == STRATEGIC_TASK
    assert route_task_complexity("创建生产 Credential 并产生新增费用")["classification"] == FOUNDER_GATE_TASK
