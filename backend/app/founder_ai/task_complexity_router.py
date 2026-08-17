"""Bounded, evidence-aware lane selection before the Autonomous Main Loop."""
from __future__ import annotations
import re

QUICK_FIX = "QUICK_FIX"
STANDARD_TASK = "STANDARD_TASK"
STRATEGIC_TASK = "STRATEGIC_TASK"
FOUNDER_GATE_TASK = "FOUNDER_GATE_TASK"

def route_task_complexity(text: str, *, image_understanding: str | None = None) -> dict:
    combined = f"{text}\n{image_understanding or ''}".strip()
    gate = re.search(r"credential|secret|新增费用|付费|生产|production|外部写|external side effect|不可逆|architecture boundary", combined, re.I)
    strategic = re.search(r"新系统|新 capability|架构变更|architecture change|跨模块|重大改造|方案比较", combined, re.I)
    quick = re.search(r"折叠|滚动|按钮.*(?:点不了|无效)|卡片错位|文案错误|状态展示|返回定位|样式|局部.*(?:ui|页面)|sidebar|scroll|click|layout", combined, re.I)
    classification = FOUNDER_GATE_TASK if gate else STRATEGIC_TASK if strategic else QUICK_FIX if quick else STANDARD_TASK
    result = {"classification": classification, "founder_gate_required": classification == FOUNDER_GATE_TASK,
              "strategy_meeting_required": classification == STRATEGIC_TASK, "architecture_proposal_required": classification == STRATEGIC_TASK,
              "evidence": {"text": text, "image_understanding_used": bool(image_understanding)}}
    if classification == QUICK_FIX:
        target_area = "Left Sidebar / AI Commerce OS Project Tree" if re.search(r"左边栏|侧边栏|sidebar", combined, re.I) else "Founder UI area identified by message and screenshot"
        result["quick_fix_contract"] = {"issue_type": "UI Interaction Bug" if re.search(r"折叠|click|按钮", combined, re.I) else "Bounded UI Bug",
            "target_area": target_area, "observed_problem": text,
            "expected_behavior": image_understanding or text, "allowed_files_or_paths": ["frontend/src/sino-founder/**"],
            "prohibited_operations": ["architecture_change", "credential_write", "external_write", "production_write"],
            "verification": ["targeted_frontend_tests", "frontend_build_if_required", "git_diff_check"],
            "founder_gate_reentry_conditions": ["credential", "incremental_cost", "external_side_effect", "production_impact", "architecture_boundary_change"]}
    return result
