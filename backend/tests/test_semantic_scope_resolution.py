from app.founder_ai.execution_scope import SCOPE_MISMATCH, SCOPE_PASS, verify_execution_scope
from app.founder_ai.semantic_scope import HIGH, LOW, resolve_task_scope
from app.founder_ai.standard_task_execution import build_standard_task_contract


DRAWER_GOAL = "移除中间残留产品矩阵浮层，保留左下角入口，点击后在左侧导航区域以内以 Drawer 展开，不侵入中间画布。"


def test_known_contract_remains_explicit():
    contract = build_standard_task_contract(conversation_id="conv-explicit", goal="把 Runtime 前端和后端 URL 字号缩小一级")
    assert contract["scope_source"] == "explicit_contract"
    assert contract["scope_confidence"] == HIGH


def test_clear_unseen_sidebar_ui_task_resolves_high_semantic_scope():
    result = resolve_task_scope(goal="让左侧导航的快捷入口展开动画更紧凑", risk_level="low")
    assert result["scope_source"] == "semantic_module"
    assert result["confidence"] == HIGH
    assert result["allowed_modules"] == ["Founder Sidebar / Navigation"]


def test_product_matrix_drawer_uses_generic_semantic_scope_not_special_contract():
    contract = build_standard_task_contract(conversation_id="conv-drawer", goal=DRAWER_GOAL)
    assert contract["scope_source"] == "semantic_module"
    assert contract["scope_confidence"] == HIGH
    assert contract["target_surface"] == "Founder Sidebar / Navigation"
    assert contract["inspect_status"] == "ready_for_discovery"
    assert "frontend/src/sino-founder/FounderNavigationPanel.jsx" in contract["implementation_scope"]
    assert contract["visible_artifact_contract"]["artifact_type"] == "semantic_ui"
    assert contract["visible_artifact_contract"]["interaction"] == "drawer"


def test_semantic_scope_allows_discovery_before_bounded_write_scope():
    result = resolve_task_scope(goal=DRAWER_GOAL)
    assert result["discovery_scope"] == {"mode": "read_only", "allowed_patterns": ["**/*"]}
    assert result["write_scope"]["mode"] == "semantic_module"
    assert result["allowed_file_patterns"]


def test_shared_css_matching_sidebar_semantics_passes_scope_verification():
    contract = build_standard_task_contract(conversation_id="conv-css", goal=DRAWER_GOAL)
    attribution = {
        "task_changed_files": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "execution_owned_patch": "--- a/frontend/src/sino-founder/sino-founder-ai.css\n+++ b/frontend/src/sino-founder/sino-founder-ai.css\n@@ -1 +1 @@\n+.sino-product-matrix__popover { inset: 0; }\n",
    }
    assert verify_execution_scope(contract=contract, attribution=attribution)["status"] == SCOPE_PASS


def test_unrelated_model_center_and_backend_database_are_rejected():
    contract = build_standard_task_contract(conversation_id="conv-reject", goal=DRAWER_GOAL)
    for path in ("frontend/src/sino-founder/ModelCenter.jsx", "backend/app/database/db.py"):
        result = verify_execution_scope(contract=contract, attribution={"task_changed_files": [path], "execution_owned_patch": ""})
        assert result["status"] == SCOPE_MISMATCH
        assert result["out_of_scope_files"] == [path]


def test_unrelated_shared_css_hunk_is_rejected_by_same_semantic_model():
    contract = build_standard_task_contract(conversation_id="conv-css-reject", goal=DRAWER_GOAL)
    attribution = {
        "task_changed_files": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "execution_owned_patch": "--- a/frontend/src/sino-founder/sino-founder-ai.css\n+++ b/frontend/src/sino-founder/sino-founder-ai.css\n@@ -1 +1 @@\n+.sino-model-center { color: red; }\n",
    }
    assert verify_execution_scope(contract=contract, attribution=attribution)["status"] == SCOPE_MISMATCH


def test_vague_goal_requires_resolution_instead_of_auto_execution():
    result = resolve_task_scope(goal="优化系统")
    assert result["scope_source"] == "approval_required"
    assert result["confidence"] == LOW
    contract = build_standard_task_contract(conversation_id="conv-vague", goal="优化系统")
    assert contract["implementation_scope"] == []
    assert contract["inspect_status"] == "scope_resolution_required"


def test_empty_explicit_match_falls_through_to_dynamic_write_scope():
    contract = build_standard_task_contract(conversation_id="conv-new", goal="调整左侧栏导航入口的悬浮位置")
    assert contract["scope_source"] == "semantic_module"
    assert contract["implementation_scope"]
