from app.founder_ai.standard_task_execution import build_standard_task_contract, evaluate_standard_verification_evidence
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


def test_new_discussion_three_column_contract_resolves_real_target_from_discussion_context():
    contract = build_standard_task_contract(
        conversation_id="conv-three-columns",
        goal="是 + 新建讨论 这个页面，不是其他页面",
        task_id="task-three-columns",
        discussion_context=[
            "把新建讨论页面改成3列式",
            "左侧 Projects / Conversations，中间 Founder ↔ Sino Conversation，右侧 Task Status + Founder Action Queue",
        ],
    )
    assert contract["target_surface"] == "New Discussion"
    assert contract["target_route"] == "DRAFT_DISCUSSION via + 新建讨论"
    assert contract["target_component"] == "ConversationWorkspace / DraftDiscussion / SinoFounderShell"
    assert contract["visible_artifact_contract"]["required"] is True
    assert "frontend/src/sino-founder/FounderHome.jsx" in contract["implementation_scope"]


def test_new_discussion_phrase_without_confirmed_three_columns_does_not_guess_target_contract():
    contract = build_standard_task_contract(conversation_id="conv-incomplete", goal="调整新建讨论按钮")
    assert contract["target_surface"] == "Unresolved bounded task"
    assert contract["implementation_scope"] == []


def test_founder_sidebar_spacing_resolves_its_own_bounded_target():
    contract = build_standard_task_contract(
        conversation_id="conv-sidebar-spacing", task_id="task-sidebar-spacing",
        goal="把左边栏‘+新建讨论’和‘项目’之间的距离调小",
    )
    assert contract["target_surface"] == "Founder Sidebar"
    assert contract["target_component"] == "SecretarySidebar / sino-founder-ai.css"
    assert "frontend/src/sino-founder/SecretarySidebar.test.jsx" in contract["implementation_scope"]
    assert "frontend/src/sino-founder/CapabilityWorkspace.jsx" not in contract["implementation_scope"]
    assert contract["visible_artifact_contract"]["required"] is True


def test_founder_sidebar_heading_typography_does_not_inherit_capability_repository_contract():
    contract = build_standard_task_contract(
        conversation_id="conv-sidebar-font", task_id="task-sidebar-font",
        goal="把左侧栏‘会话’分组标题的字体大小调整为和‘项目’一致",
    )
    assert contract["target_surface"] == "Founder Sidebar"
    assert contract["target_component"] == "SecretarySidebar / sino-founder-ai.css"
    assert contract["objective"].startswith("把左侧栏")
    assert "frontend/src/sino-founder/CapabilityWorkspace.jsx" not in contract["implementation_scope"]
    assert contract["visible_artifact_contract"]["required"] is True
    assertions = contract["visible_artifact_contract"]["required_assertions"]
    assert "both_headings_15px" in assertions
    assert "matching_computed_typography" in assertions
    assert "matching_layout_constraints" in assertions
    assert "no_differential_scale_or_shrink" in assertions
    assert "visual_heading_parity" in assertions
    assert "screenshot_evidence_exists" in assertions


def test_runtime_url_typography_gets_its_own_scope_contract():
    goal = "将‘系统’设置弹窗中 Runtime 区域的‘前端’和‘后端’URL 字体缩小一级。"
    contract = build_standard_task_contract(conversation_id="conv-runtime", task_id="task-runtime", goal=goal)
    assert contract["target_surface"] == "Settings / System / Runtime"
    assert contract["source_goal"] == goal
    assert "frontend/src/sino-founder/ModelCenter.jsx" in contract["implementation_scope"]
    assert "frontend/src/sino-founder/CapabilityWorkspace.jsx" not in contract["implementation_scope"]
    assert "capability_repository" in contract["prohibited_scope"]


def test_sino_product_matrix_gets_a_persistent_sidebar_scope_contract():
    goal = "在左侧栏底部、设置上方增加固定的 Sino AI 产品矩阵入口气泡，展开 Sino Studio AI、Sino Operator AI，未开放产品显示即将推出。"
    contract = build_standard_task_contract(conversation_id="conv-products", task_id="task-products", goal=goal)
    assert contract["target_surface"] == "Founder Sidebar / Sino AI Product Matrix"
    assert contract["inspect_status"] == "ready_for_plan"
    assert contract["implementation_scope"] == [
        "frontend/src/sino-founder/FounderNavigationPanel.jsx",
        "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
        "frontend/src/sino-founder/FounderWorkspaceIcons.jsx",
        "frontend/src/sino-founder/sino-founder-ai.css",
    ]
    assert "capability_repository" in contract["prohibited_scope"]
    assert contract["visible_artifact_contract"]["required"] is True


def test_product_matrix_typography_gets_css_and_computed_style_contract():
    goal = "把左侧栏底部“Sino AI 产品矩阵”文字的字号缩小一级，只修改这个文字字号。"
    contract = build_standard_task_contract(conversation_id="conv-products-font", task_id="task-products-font", goal=goal)
    assert contract["target_surface"] == "Founder Sidebar / Sino AI Product Matrix Typography"
    assert "frontend/src/sino-founder/sino-founder-ai.css" in contract["implementation_scope"]
    assert contract["allowed_css_selectors"] == [".founder-navigation-panel .sino-sidebar-products"]
    assert contract["visible_artifact_contract"]["artifact_type"] == "founder_product_matrix_typography"
    assert contract["visible_artifact_contract"]["expected_font_size"] == "13px"


def test_new_task_does_not_inherit_previous_semantic_goal_from_discussion_context():
    contract = build_standard_task_contract(
        conversation_id="conv-isolated", task_id="task-runtime",
        goal="将系统设置 Runtime 前端和后端 URL 字体缩小一级。",
        discussion_context=["给能力仓库增加按能力名称和 Domain 搜索"],
    )
    assert contract["target_surface"] == "Settings / System / Runtime"
    assert contract["source_goal"].startswith("将系统设置 Runtime")


def test_complete_task_scoped_evidence_closes_verification_even_if_callback_was_lost():
    result = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
    )
    assert result["verification_complete"] is True
    assert result["missing_evidence"] == []


def test_scope_failure_prevents_completion_even_when_all_other_evidence_passes():
    result = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
        scope_verification_pass=False,
    )
    assert result["verification_complete"] is False
    assert result["missing_evidence"] == ["scope_verification_pass"]


def test_unrelated_repo_changes_are_not_part_of_task_scoped_closure_evidence():
    result = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
    )
    assert "unrelated_repo_clean" not in result
    assert result["verification_complete"] is True


def test_missing_browser_or_failed_build_prevents_verification_completion():
    missing_browser = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=False, checkpoint_exists=True, task_owned_files_clean=True,
    )
    failed_build = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=False,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
    )
    assert missing_browser["verification_complete"] is False
    assert missing_browser["missing_evidence"] == ["visible_artifact_pass"]
    assert failed_build["verification_complete"] is False
    assert failed_build["missing_evidence"] == ["build_pass"]


def test_verified_dirty_patch_completes_without_checkpoint():
    result = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=False, task_owned_files_clean=False,
        diff_check_pass=True, checkpoint_requested=False,
    )
    assert result["verification_complete"] is True
    assert result["missing_evidence"] == []
    assert result["version_control_evidence"]["checkpoint_status"] == "NOT_REQUESTED"


def test_requested_checkpoint_is_post_completion_pending_state():
    result = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=False, task_owned_files_clean=False,
        diff_check_pass=True, checkpoint_requested=True,
    )
    assert result["verification_complete"] is True
    assert result["version_control_evidence"] == {
        "checkpoint_requested": True,
        "checkpoint_exists": False,
        "task_owned_files_clean": False,
        "checkpoint_status": "PENDING",
    }


def test_checkpoint_cannot_override_failed_task_verification():
    browser_failed = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=False, checkpoint_exists=True, task_owned_files_clean=True,
        checkpoint_requested=True,
    )
    tests_failed = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=False, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
        checkpoint_requested=True,
    )
    assert browser_failed["verification_complete"] is False
    assert tests_failed["verification_complete"] is False


def test_diff_and_scope_remain_completion_gates_independent_of_git_state():
    diff_failed = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
        diff_check_pass=False,
    )
    scope_failed = evaluate_standard_verification_evidence(
        implementation_complete=True, task_owned_tests_pass=True, build_pass=True,
        visible_artifact_pass=True, checkpoint_exists=True, task_owned_files_clean=True,
        scope_verification_pass=False,
    )
    assert diff_failed["missing_evidence"] == ["diff_check_pass"]
    assert scope_failed["missing_evidence"] == ["scope_verification_pass"]


def test_new_source_message_does_not_reuse_previous_conversation_execution(monkeypatch):
    import app.founder_ai.standard_task_execution as execution
    monkeypatch.setattr(execution, "_save_route", lambda _conversation_id, route, **_: route)
    old_route = {
        "classification": "STANDARD_TASK",
        "task_identity": {"source_message_id": "message-old"},
        "autonomous_execution": {"task_id": "task-old", "execution_session_id": "execution-old"},
        "technical_blocker": {"type": "old"},
    }
    fresh = execution.begin_standard_task(conversation_id="conv-one", goal=GOAL, route=old_route,
                                          source_message_id="message-new")
    assert "autonomous_execution" not in fresh
    assert "technical_blocker" not in fresh
    assert fresh["task_identity"]["source_message_id"] == "message-new"
