from app.founder_ai import capability_build_loop as loop_module
from app.founder_ai import capability_compatibility as compatibility_module
from app.founder_ai.capability_compatibility import classify_image_generation_asset
from app.founder_ai.task_complexity_router import route_task_complexity


GOAL = "为 Sino Studio AI 创建并验证一个最小 Image Generation Capability，让 Studio 能真实生成一张商品主图。"


def test_storyboard_is_related_but_incompatible():
    result = classify_image_generation_asset({"asset_id": "storyboard", "name": "商品分镜生成 Skill", "purpose": "生成商品分镜", "content": {}, "status": "ready"})
    assert result["classification"] == "RELATED_BUT_INCOMPATIBLE"
    assert result["compatibility"]["generated_image_asset"] is False


def test_ready_image_asset_capability_is_exact_reuse():
    result = classify_image_generation_asset({"asset_id": "image", "name": "Image Generation", "content": {"capability_type": "image_generation", "output_modality": "image", "consumer": "studio_ai"}, "status": "ready"})
    assert result["classification"] == "EXACT_REUSE"


def test_lookup_excludes_non_capability_repository_records(monkeypatch):
    monkeypatch.setattr(compatibility_module, "list_assets", lambda **_: [
        {"asset_id": "decision", "asset_type": "decision", "name": "Image decision", "content": {}, "status": "ready"},
        {"asset_id": "storyboard", "asset_type": "skill", "name": "商品分镜生成 Skill", "content": {}, "status": "ready"},
    ])
    result = compatibility_module.lookup_image_generation_compatibility()
    assert [item["asset_id"] for item in result["assessments"]] == ["storyboard"]


def test_explicit_capability_build_goal_needs_no_clarification_or_strategy():
    route = route_task_complexity(GOAL)
    assert route["classification"] == "STANDARD_TASK"
    assert route["task_type"] == "CAPABILITY_BUILD_TASK"
    assert route["clarification_required"] is False
    assert route["strategy_meeting_required"] is False
    assert route["founder_gate_required"] is False


def test_loop_autostarts_and_applies_bounded_defaults_then_stops_before_unapproved_probe(monkeypatch):
    monkeypatch.setattr(loop_module, "lookup_image_generation_compatibility", lambda: {"status": "CAPABILITY_MISSING", "selected": None, "related_but_incompatible": [{"name": "商品分镜生成 Skill", "classification": "RELATED_BUT_INCOMPATIBLE"}]})
    monkeypatch.setattr(loop_module, "get_model_center", lambda: {"models": [{"provider_id": "provider", "model_id": "image-candidate", "enabled": True, "supports_text": True, "supports_image_generation": False}]})
    result = loop_module.run_capability_build_loop(conversation_id="conv-1", goal=GOAL)
    assert result["manual_continue_count"] == 0
    assert result["manual_codex_instruction_count"] == 0
    assert result["test_defaults_applied"] is True
    assert result["status"] == "founder_gate_required"
    assert result["model_candidates"][0]["probe_status"] == "NOT_RUN"
    assert result["executor_dispatch"]["status"] == "not_dispatched"


def test_verified_model_dispatches_executor_without_manual_codex_instruction(monkeypatch):
    monkeypatch.setattr(loop_module, "lookup_image_generation_compatibility", lambda: {"status": "CAPABILITY_MISSING", "selected": None, "related_but_incompatible": []})
    monkeypatch.setattr(loop_module, "get_model_center", lambda: {"models": [{"provider_id": "provider", "model_id": "image-model", "enabled": True, "supports_text": True, "supports_image_generation": True, "image_generation_capability_source": "probe-1"}]})
    dispatched = []
    result = loop_module.run_capability_build_loop(conversation_id="conv-1", goal=GOAL, executor_dispatch=lambda payload: dispatched.append(payload) or {"status": "queued", "execution_id": "execution-1"})
    assert dispatched and result["executor_dispatch"]["status"] == "queued"
    assert result["manual_codex_instruction_count"] == 0
