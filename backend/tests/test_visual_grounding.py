from app.founder_ai.visual_grounding import merge_visual_grounding


def vision(target, confidence=0.95, annotation="red arrow"):
    return {
        "attachment_id": "attachment-real-screenshot",
        "observed_ui_area": "Left navigation sidebar - Projects section header",
        "observed_elements": ["项目", "+", "down chevron"],
        "likely_target": target,
        "visible_issue": "Founder annotation points at a UI control",
        "founder_annotation_context": annotation,
        "confidence": confidence,
        "model_provider": "google",
        "model_id": "gemini-3.6-flash",
    }


def test_case_one_merges_red_arrow_where_with_remove_action():
    result = merge_visual_grounding(
        "左边栏红色箭头所指向的向下箭头去掉",
        vision("down chevron / collapse-expand control indicated by Founder red arrow", 0.98),
    )
    assert result["visual_location"] == "Left Sidebar / Projects Header"
    assert result["visual_element_type"] == "collapse_expand_chevron"
    assert result["text_intent"]["operation"] == "REMOVE_UI_ELEMENT"
    assert result["grounding_confidence"] == 0.98
    assert result["clarification_required"] is False


def test_case_two_grounds_icon_immediately_left_of_plus():
    result = merge_visual_grounding(
        "去掉图中 + 号左边的箭头",
        vision('chevron/down-arrow immediately left of the "+" control', 0.95, "red underline/mark"),
    )
    assert 'immediately left of the "+" control' in result["annotation_target"]
    assert result["merged_intent"].startswith("remove ")
    assert result["clarification_required"] is False


def test_low_confidence_ambiguous_annotation_requires_clarification():
    result = merge_visual_grounding("这里不对", vision("multiple possible controls", 0.52, "unclear mark"))
    assert result["clarification_required"] is True
