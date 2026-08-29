from app.founder_ai.execution_scope import SCOPE_MISMATCH, SCOPE_PASS, verify_execution_scope
from app.founder_ai.semantic_scope import HIGH, LOW, resolve_task_scope
from app.founder_ai.standard_task_execution import build_standard_task_contract


def test_new_discussion_interaction_resolves_generic_founder_navigation_scope():
    scope = resolve_task_scope(
        goal="为左侧栏顶部新建讨论入口增加操作选择，可开始空白讨论或在当前项目中开始讨论。"
    )
    assert scope["scope_source"] == "semantic_module"
    assert scope["confidence"] == HIGH
    assert scope["allowed_modules"] == ["Founder Sidebar / Navigation"]
    assert "frontend/src/sino-founder/FounderNavigationPanel.jsx" in scope["allowed_file_patterns"]
    assert scope["visible_artifact_contract"]["artifact_type"] == "founder_new_discussion_interaction"


def test_new_discussion_shared_css_is_attributed_without_allowing_the_whole_file():
    contract = build_standard_task_contract(
        conversation_id="conv-new-discussion-css",
        goal="为左侧栏顶部新建讨论入口增加操作选择，可开始空白讨论或在当前项目中开始讨论。",
    )
    matching = {
        "task_changed_files": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "execution_owned_patch": (
            "--- a/frontend/src/sino-founder/sino-founder-ai.css\n"
            "+++ b/frontend/src/sino-founder/sino-founder-ai.css\n"
            "@@ -1 +1 @@\n"
            "+.sino-new-discussion-popover { position: fixed; }\n"
        ),
    }
    assert verify_execution_scope(contract=contract, attribution=matching)["status"] == SCOPE_PASS
    unrelated = {
        **matching,
        "execution_owned_patch": (
            "--- a/frontend/src/sino-founder/sino-founder-ai.css\n"
            "+++ b/frontend/src/sino-founder/sino-founder-ai.css\n"
            "@@ -1 +1 @@\n"
            "+.sino-model-center { color: red; }\n"
        ),
    }
    result = verify_execution_scope(contract=contract, attribution=unrelated)
    assert result["status"] == SCOPE_MISMATCH
    assert result["out_of_scope_hunks"] == ["frontend/src/sino-founder/sino-founder-ai.css#hunk-1"]


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


def test_product_matrix_list_typography_and_spacing_resolves_high_confidence_sidebar_scope():
    scope = resolve_task_scope(goal="把左下角 Sino AI 产品弹出框的产品名称间距缩小，字体调大一点")
    assert scope["scope_source"] == "semantic_module"
    assert scope["confidence"] == HIGH
    assert "frontend/src/sino-founder/sino-founder-ai.css" in scope["allowed_file_patterns"]
    assert scope["visible_artifact_contract"]["artifact_type"] == "founder_product_matrix_list_style"


def test_unseen_project_action_popover_task_resolves_high_confidence_project_scope():
    scope = resolve_task_scope(goal="把项目的 Rename Archive Delete 弹出框改成新建项目弹出框的样式和交互")
    assert scope["scope_source"] == "semantic_module"
    assert scope["confidence"] == HIGH
    assert scope["allowed_modules"] == ["Founder Project UI"]
    assert "frontend/src/sino-founder/FounderNavigationPanel.jsx" in scope["allowed_file_patterns"]
    assert scope["visible_artifact_contract"]["artifact_type"] == "founder_project_action_popovers"


def test_unseen_conversation_action_popover_uses_target_not_reference_module():
    scope = resolve_task_scope(goal="把对话标题后的更多操作弹出框改为与‘新建项目’弹出框一致的样式和交互")
    assert scope["scope_source"] == "semantic_module"
    assert scope["confidence"] == HIGH
    assert scope["allowed_modules"] == ["Founder Conversation"]
    assert "frontend/src/sino-founder/FounderNavigationPanel.jsx" in scope["allowed_file_patterns"]
    assert scope["visible_artifact_contract"]["artifact_type"] == "founder_conversation_action_popover"


def test_conversation_file_actions_compile_generic_visible_artifact_contract():
    goal = (
        "点击 Founder Conversation 输入区底部的＋ 文件/文档后，先提供上传文件和选择已有文档，"
        "保留当前 Conversation 输入和项目上下文。"
    )
    contract = build_standard_task_contract(conversation_id="conv-file-actions", goal=goal)
    visible = contract["visible_artifact_contract"]
    assert contract["scope_confidence"] == HIGH
    assert contract["semantic_scope"]["allowed_modules"] == ["Founder Conversation"]
    assert visible["artifact_type"] == "founder_conversation_file_actions"
    assert visible["required"] is True
    assert {
        "filechooser_opened", "file_selected_false", "document_boundary_truthful",
        "document_data_not_fabricated", "conversation_input_preserved",
        "project_context_preserved", "outside_close", "escape_close", "toggle_close",
    }.issubset(visible["required_assertions"])


def test_high_confidence_low_risk_search_clear_task_gets_generic_visible_contract():
    goal = (
        "在左侧栏搜索中输入内容后，显示一个清晰的清除入口。\n"
        "1. 保留项目与最近会话联合搜索。\n"
        "2. 保留无结果提示。\n"
        "3. 保留 Escape 清除行为。"
    )
    contract = build_standard_task_contract(conversation_id="conv-generic-search-clear", goal=goal)
    visible = contract["visible_artifact_contract"]
    assert contract["scope_confidence"] == HIGH
    assert visible["required"] is True
    assert visible["artifact_type"] == "generic_visible_interaction"
    assert visible["interaction_type"] == "search_clear"
    assert visible["acceptance_cardinality"]["expected_visible_count"] == 1
    assert {"clear_control_count_matches", "duplicate_control_absent", "escape_clear_preserved"}.issubset(
        visible["required_assertions"]
    )
    assert contract["existing_behavior_discovery"]["mode"] == "read_only"
    assert contract["existing_behavior_discovery"]["scope_unchanged"] is True
    assert any(item["input_type"] == "search" for item in contract["existing_behavior_discovery"]["controls"])
    assert any(item["capability"] == "search_cancel" for item in contract["existing_behavior_discovery"]["browser_native_controls"])
    assert "保留 Escape 清除行为。" in contract["acceptance_criteria"]


def test_unseen_visible_ui_task_gets_non_null_generic_contract_without_weakening_browser_requirement():
    contract = build_standard_task_contract(
        conversation_id="conv-generic-visible",
        goal="让左侧导航的快捷入口展开动画更紧凑，并保留现有点击行为。",
    )
    visible = contract["visible_artifact_contract"]
    assert visible["required"] is True
    assert visible["artifact_type"] == "generic_visible_interaction"
    assert visible["verification_authority"] == "current_task"
    assert visible["verification_override_authority"] is False


def test_conversation_mode_state_resolves_canonical_bounded_control_target():
    contract = build_standard_task_contract(
        conversation_id="conv-mode-state",
        goal="让讨论模式入口在切换时显示明确且可访问的当前选中状态，并保留现有切换行为。",
    )
    semantic = contract["semantic_scope"]
    assert contract["scope_confidence"] == HIGH
    assert semantic["semantic_target"]["canonical_name"] == "Conversation Mode Selector State"
    assert semantic["interaction_type"] == "generic_control_state"
    assert contract["implementation_scope"] == [
        "frontend/src/sino-founder/GlobalSecretaryComposer.jsx",
        "frontend/src/sino-founder/GlobalSecretaryComposer.test.jsx",
        "frontend/src/sino-founder/sino-founder-ai.css",
    ]
    visible = contract["visible_artifact_contract"]
    assert visible["artifact_type"] == "generic_visible_interaction"
    assert visible["interaction_type"] == "generic_control_state"
    assert visible["state_exclusivity"] == {"expected_active_count": 1}
    assert visible["accessibility_state"]["attribute"] == "aria-pressed"
    assert visible["verification_override_authority"] is False


def test_library_navigation_state_resolves_canonical_bounded_control_target():
    scope = resolve_task_scope(goal="让库入口在打开后明确表达当前导航状态，并保留原有导航行为。")
    assert scope["confidence"] == HIGH
    assert scope["allowed_modules"] == ["Founder Sidebar / Navigation"]
    assert scope["semantic_target"]["canonical_name"] == "Sidebar Navigation Current State"
    assert scope["interaction_type"] == "generic_control_state"
    assert len(scope["allowed_file_patterns"]) == 3
    assert scope["control_state_profile"]["accessibility_semantics"]["attribute"] == "aria-current"


def test_sidebar_collapse_state_resolves_without_candidate_identity_hardcodes():
    scope = resolve_task_scope(goal="让侧边栏收起按钮明确表达当前展开状态，并保留原来的点击行为。")
    assert scope["confidence"] == HIGH
    assert scope["semantic_target"]["canonical_name"] == "Sidebar Collapse Control State"
    assert scope["semantic_target"]["property"] == "expanded"
    assert len(scope["allowed_file_patterns"]) == 3


def test_ambiguous_control_state_does_not_guess_a_high_confidence_group():
    scope = resolve_task_scope(goal="让当前按钮的状态更明确")
    assert scope["confidence"] != HIGH
    assert scope["allowed_file_patterns"] == []


def test_sidebar_recent_heading_count_resolves_bounded_derived_value_contract():
    acceptance = [
        "无搜索条件时，最近旁显示完整可见最近会话数量",
        "输入搜索条件后，数量等于筛选后实际显示的最近会话数量",
        "清除搜索后，数量恢复为完整最近会话数量",
        "现有会话排序、时间显示、打开会话、更多操作和列表滚动行为保持不变",
    ]
    contract = build_standard_task_contract(
        conversation_id="conv-recent-count",
        goal="在左侧栏最近标题旁显示当前实际可见的最近会话数量，并随搜索筛选实时同步。",
        founder_acceptance_criteria=acceptance,
    )
    assert contract["scope_confidence"] == HIGH
    assert contract["target_surface"] == "Founder Sidebar / Navigation"
    assert contract["semantic_scope"]["semantic_target"]["canonical_name"] == "Recent Conversations Heading Count"
    assert contract["semantic_scope"]["interaction_type"] == "visible_derived_count"
    assert "frontend/src/sino-founder/FounderNavigationPanel.jsx" in contract["implementation_scope"]
    assert all(item in contract["acceptance_criteria"] for item in acceptance)
    visible = contract["visible_artifact_contract"]
    assert visible["artifact_type"] == "generic_visible_interaction"
    assert visible["interaction_type"] == "derived_visible_count"
    assert visible["derived_value_assertion"] == {
        "display_target": {"selector": ".sino-sidebar__conversation-count", "value_type": "integer"},
        "source_collection": {"selector": ".sino-conversation-item", "visibility": "visible"},
        "aggregation": "count", "comparison": "equals",
    }
    assert [item["name"] for item in visible["verification_states"]] == ["baseline", "filtered", "restored"]
    assert visible["scope_authority"] is False and visible["verification_override_authority"] is False
    assert acceptance[-1] in visible["preserved_behaviors"]


def test_generic_project_and_task_collection_counts_resolve_without_r1_identity_hardcodes():
    projects = resolve_task_scope(goal="在左侧栏项目标题旁显示当前可见项目数量")
    tasks = resolve_task_scope(goal="在执行中心任务列表标题旁显示当前可见任务数量")
    assert projects["confidence"] == HIGH
    assert projects["semantic_target"]["entity"] == "projects"
    assert tasks["confidence"] == HIGH
    assert tasks["allowed_modules"] == ["Founder Execution Center"]
    assert tasks["semantic_target"]["entity"] == "tasks"


def test_ambiguous_visible_count_does_not_guess_high_confidence_target():
    result = resolve_task_scope(goal="在标题旁显示当前可见数量")
    assert result["confidence"] != HIGH
    assert result["allowed_file_patterns"] == []


def test_unresolved_scope_appends_blocker_without_replacing_founder_acceptance():
    acceptance = ["显示值必须等于当前可见条目数", "保留现有打开行为"]
    contract = build_standard_task_contract(
        conversation_id="conv-unresolved-count", goal="在标题旁显示当前可见数量",
        founder_acceptance_criteria=acceptance, founder_constraints=["不修改其他模块"],
    )
    assert contract["acceptance_criteria"][:2] == acceptance
    assert contract["acceptance_criteria"][-1] == "Resolve the exact semantic target before modifying files."
    assert "保留现有打开行为" in contract["acceptance_criteria"]
    assert "不修改其他模块" in contract["constraints"]


def test_project_action_scope_accepts_production_component_test_and_matching_shared_css():
    contract = build_standard_task_contract(
        conversation_id="conv-project-actions",
        goal="把项目的 Rename Archive Delete 弹出框改成新建项目弹出框的样式和交互",
    )
    attribution = {
        "task_changed_files": [
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ],
        "execution_owned_patch": (
            "+++ b/frontend/src/sino-founder/FounderNavigationPanel.jsx\n+sino-project-action-popover\n"
            "+++ b/frontend/src/sino-founder/sino-founder-ai.css\n+.sino-project-action-popover { position: fixed; }\n"
        ),
    }
    assert verify_execution_scope(contract=contract, attribution=attribution)["status"] == SCOPE_PASS


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


def test_conversation_project_selector_shared_css_is_attributed_to_composer_task():
    contract = build_standard_task_contract(
        conversation_id="conv-project-selector",
        goal="把 Conversation Composer 底部的选择项目弹出框改成 anchored Popover",
    )
    attribution = {
        "task_changed_files": ["frontend/src/sino-founder/sino-founder-ai.css"],
        "execution_owned_patch": (
            "--- a/frontend/src/sino-founder/sino-founder-ai.css\n"
            "+++ b/frontend/src/sino-founder/sino-founder-ai.css\n"
            "@@ -1 +1 @@\n"
            "+.sino-project-selector__popover--anchored { position: fixed; }\n"
            "+.sino-project-selector__arrow { position: absolute; }\n"
        ),
    }
    assert verify_execution_scope(contract=contract, attribution=attribution)["status"] == SCOPE_PASS
    assert contract["visible_artifact_contract"]["artifact_type"] == "founder_conversation_project_selector_popover"


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
