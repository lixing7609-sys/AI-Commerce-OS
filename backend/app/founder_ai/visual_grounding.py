"""Merge Founder annotation grounding (WHERE) with text intent (WHAT)."""
from __future__ import annotations

import re

GROUNDING_CONFIDENCE_THRESHOLD = 0.80


def merge_visual_grounding(text: str, image: dict) -> dict:
    target = str(image.get("likely_target") or "").strip()
    area = str(image.get("observed_ui_area") or "").strip()
    annotation = str(image.get("founder_annotation_context") or "").strip()
    confidence = max(0.0, min(1.0, float(image.get("confidence") or 0)))
    operation = "REMOVE_UI_ELEMENT" if re.search(r"去掉|删除|移除|remove", text, re.I) else "MODIFY_UI_ELEMENT"
    annotation_type = "red_arrow" if re.search(r"red arrow|红色?箭头", annotation, re.I) else "red_mark" if re.search(r"red|红", annotation, re.I) else "visual_annotation"
    element_type = "collapse_expand_chevron" if re.search(r"chevron|down.?arrow|向下.*箭头|折叠.*箭头", f"{target} {annotation}", re.I) else "annotated_ui_element"
    location = "Left Sidebar / Projects Header" if re.search(r"sidebar|侧栏|左边栏", area, re.I) and re.search(r"project|项目", area, re.I) else area
    text_action_clear = operation == "REMOVE_UI_ELEMENT" or bool(re.search(r"调整|移动|修改|修复", text))
    target_clear = bool(target and not re.search(r"unknown|unclear|multiple|不明确|多个", target, re.I))
    clarification_required = confidence < GROUNDING_CONFIDENCE_THRESHOLD or not target_clear or not text_action_clear
    action_phrase = "remove" if operation == "REMOVE_UI_ELEMENT" else "modify"
    merged = f"{action_phrase} {target} in {location}" if target and location else f"{action_phrase} {target or location}"
    return {
        "attachment_id": image.get("attachment_id"),
        "annotated_region": area,
        "annotation_type": annotation_type,
        "annotation_target": target,
        "visual_element_type": element_type,
        "visual_element_label": target,
        "visual_location": location,
        "surrounding_context": list(image.get("observed_elements") or []),
        "text_intent": {"original_text": text, "operation": operation},
        "merged_intent": merged,
        "grounding_confidence": confidence,
        "clarification_required": clarification_required,
        "model_provider": image.get("model_provider"),
        "model_id": image.get("model_id"),
    }
