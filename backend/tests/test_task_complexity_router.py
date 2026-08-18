from app.founder_ai.task_complexity_router import *
from app.founder_ai.quick_fix_progression import build_quick_fix_contract

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

def test_text_first_quick_fix_survives_unavailable_vision():
    result = route_task_complexity("箭头这里，AI Commerce OS 点击后应该可以折叠，帮我修复。", image_context_status="unavailable")
    assert result["classification"] == QUICK_FIX
    assert result["evidence"]["image_context_status"] == "unavailable"
    assert result["quick_fix_contract"]["issue_type"] == "UI_INTERACTION_BUG"
    assert result["quick_fix_contract"]["target_area"] == "Left Sidebar / AI Commerce OS Project Tree"
    assert result["quick_fix_contract"]["expected_behavior"] == "AI Commerce OS project node toggles collapse / expand"

def test_ambiguous_text_requires_clarification_when_vision_is_unavailable():
    result = route_task_complexity("这里不对。", image_context_status="unavailable")
    assert result["classification"] == QUICK_FIX
    assert result["clarification_required"] is True
    assert result["strategy_meeting_required"] is False

def test_grounded_removal_intent_is_a_quick_fix_without_clarification():
    grounded = {
        "merged_intent": 'remove the collapse/expand chevron immediately left of the "+" control in the Projects header',
        "annotation_target": 'collapse/expand chevron immediately left of the "+" control',
        "visual_location": "Left Sidebar / Projects Header",
        "text_intent": {"operation": "REMOVE_UI_ELEMENT"},
        "grounding_confidence": 0.95,
        "clarification_required": False,
    }
    result = route_task_complexity("去掉图中 + 号左边的箭头", image_understanding=grounded)
    assert result["classification"] == QUICK_FIX
    assert result["clarification_required"] is False
    assert result["strategy_meeting_required"] is False
    assert result["quick_fix_contract"]["issue_type"] == "UI_CLEANUP"
    assert result["quick_fix_contract"]["operation"] == "REMOVE_UI_ELEMENT"
    assert result["quick_fix_contract"]["visual_target"] == grounded["annotation_target"]


def test_grounded_draft_card_layout_resolves_stale_clarification_and_is_ready_for_inspect():
    grounded = {
        "attachment_id": "attachment-draft-center",
        "visual_target": "Draft Center cards/table layout region",
        "annotation_target": "Draft Center cards/table layout region",
        "target_area": "Capability Repository / Draft Center / Draft cards region",
        "visual_location": "Capability Repository / Draft Center / Draft cards region",
        "text_intent": {"operation": "BOUNDED_UI_LAYOUT", "action_clear": True},
        "expected_change": "organize card layout, alignment and spacing for readability",
        "constraints": ["preserve_existing_functionality", "preserve_existing_visual_style"],
        "merged_intent": "organize layout of Draft Center cards/table layout region",
        "grounding_confidence": 0.95,
        "clarification_required": True,
        "clarification_reason": "text_action_unclear",
    }
    result = route_task_complexity(
        "把截图中箭头所指区域的卡片排版梳理整齐，保持现有功能和整体风格不变。",
        image_understanding=grounded,
        image_context_status="available",
    )
    assert result["classification"] == QUICK_FIX
    assert result["clarification_required"] is False
    assert result["quick_fix_contract"]["target_area"] == grounded["target_area"]
    assert result["quick_fix_contract"]["clarification_reason"] is None
    contract = build_quick_fix_contract(result, conversation_id="functional-verification-v1-a")
    assert contract["inspect_status"] == "ready_for_fix"

def test_unrelated_production_label_in_screenshot_does_not_trigger_founder_gate():
    grounded = {
        "merged_intent": 'remove the chevron left of "+" in Projects header',
        "annotation_target": 'chevron left of "+"',
        "visual_location": "Left Sidebar / Projects Header",
        "surrounding_context": ["AI Commerce OS", "AI短剧生产系统"],
        "text_intent": {"operation": "REMOVE_UI_ELEMENT"},
        "grounding_confidence": 0.98,
        "clarification_required": False,
    }
    result = route_task_complexity("左边栏红色箭头所指向的向下箭头去掉", image_understanding=grounded)
    assert result["classification"] == QUICK_FIX
    assert result["founder_gate_required"] is False

def test_standard_strategic_and_gate_routes():
    assert route_task_complexity("增加一个明确的导出字段")["classification"] == STANDARD_TASK
    assert route_task_complexity("建立一个新系统并比较架构方案")["classification"] == STRATEGIC_TASK
    assert route_task_complexity("创建生产 Credential 并产生新增费用")["classification"] == FOUNDER_GATE_TASK
