"""Generic semantic scope resolution for bounded Founder UI tasks."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


HIGH = "HIGH"
MEDIUM = "MEDIUM"
LOW = "LOW"


@dataclass(frozen=True)
class SemanticModule:
    name: str
    keywords: tuple[str, ...]
    files: tuple[str, ...]
    hunk_markers: tuple[str, ...]


MODULES = (
    SemanticModule(
        "Founder Sidebar / Navigation",
        ("左侧栏", "左边栏", "侧边栏", "左下角", "sidebar", "navigation", "导航", "产品矩阵", "sino ai 产品", "产品弹出框", "入口", "popover", "drawer", "浮层", "新建讨论", "new discussion", "new conversation", "start discussion", "blank discussion", "空白讨论", "当前项目中开始讨论"),
        (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/FounderWorkspaceIcons.jsx",
            "frontend/src/sino-founder/SecretarySidebar.jsx",
            "frontend/src/sino-founder/SecretarySidebar.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
        (
            "FounderNavigationPanel", "SecretarySidebar", "sino-product-matrix", "sino-sidebar-products",
            "sino-sidebar", "product-matrix", "sino-new-discussion", "new-discussion",
            "new-conversation", "discussion-create", "conversation-create", "sidebar-action",
            "navigation-popover",
        ),
    ),
    SemanticModule(
        "Founder Conversation",
        ("conversation", "对话", "会话", "对话标题", "会话标题", "更多操作", "会话操作", "消息", "气泡", "附件", "composer", "输入框", "输入区", "文件/文档", "上传文件", "选择已有文档"),
        (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/ConversationThread.jsx",
            "frontend/src/sino-founder/ConversationThread.test.jsx",
            "frontend/src/sino-founder/ConversationWorkspace.jsx",
            "frontend/src/sino-founder/FounderHome.jsx",
            "frontend/src/sino-founder/FounderHome.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
        ("FounderNavigationPanel", "ConversationThread", "ConversationWorkspace", "sino-conversation", "sino-conversation-item", "conversation-action-popover", "sino-project-selector", "message-", "composer"),
    ),
    SemanticModule(
        "Founder Settings / Model Center",
        ("settings", "设置", "model center", "模型中心", "模型与 api", "用量与成本", "runtime", "provider"),
        (
            "frontend/src/sino-founder/ModelCenter.jsx",
            "frontend/src/sino-founder/ModelCenter.test.jsx",
            "frontend/src/sino-founder/SinoModelSelector.jsx",
            "frontend/src/sino-founder/SinoModelSelector.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
        ("ModelCenter", "SinoModelSelector", "sino-model", "runtime-", "economics"),
    ),
    SemanticModule(
        "Founder Execution Center",
        ("execution center", "执行中心", "任务状态", "进度"),
        (
            "frontend/src/sino-founder/ExecutionCenter.jsx",
            "frontend/src/sino-founder/ExecutionCenter.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
        ("ExecutionCenter", "execution-center", "execution-status"),
    ),
    SemanticModule(
        "Founder Project UI",
        (
            "project ui", "项目页面", "项目界面", "project conversation", "object discussion",
            "项目操作", "项目弹出框", "rename", "archive", "delete", "重命名", "归档", "删除",
            "新建项目", "兴建项目",
        ),
        (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/FounderHome.jsx",
            "frontend/src/sino-founder/FounderHome.test.jsx",
            "frontend/src/sino-founder/ConversationWorkspace.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
        (
            "FounderNavigationPanel", "FounderHome", "ConversationWorkspace", "project-", "workspace-",
            "sino-project-item", "sino-project-action-popover", "sino-project-create-popover",
        ),
    ),
)

UI_TERMS = (
    "ui", "界面", "页面", "布局", "位置", "样式", "字号", "字体", "颜色", "间距", "圆角",
    "弹出", "展开", "按钮", "入口", "操作选择", "点击", "显示", "可见", "标题", "数量", "计数",
    "列表", "选中", "当前状态", "展开状态", "收起状态", "可访问状态", "active", "selected",
    "pressed", "expanded", "current", "drawer", "popover", "modal", "count",
)
HIGH_RISK_TERMS = ("数据库", "database", "schema", "secret", "密钥", "production", "生产", "deploy", "部署", "git push", "删除数据", "付费 api", "系统权限")
VAGUE_GOALS = ("优化系统", "优化一下", "改进系统", "完善系统")


DERIVED_COLLECTION_TARGETS = (
    {
        "canonical_name": "Recent Conversations Heading Count",
        "entity": "recent_conversations",
        "labels": ("最近会话", "最近"),
        "module": "Founder Sidebar / Navigation",
        "region": "recent_conversations",
        "display_selector": ".sino-sidebar__conversation-count",
        "collection_selector": ".sino-conversation-item",
        "search_selector": ".sino-sidebar-search input[type='search']",
        "source_text_selector": ".sino-conversation-item__open b",
        "bounded_files": (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
    },
    {
        "canonical_name": "Projects Heading Count",
        "entity": "projects",
        "labels": ("项目列表", "项目"),
        "module": "Founder Sidebar / Navigation",
        "region": "projects",
        "display_selector": ".sino-project-heading .sino-sidebar__collection-count",
        "collection_selector": ".sino-project-item",
        "search_selector": ".sino-sidebar-search input[type='search']",
        "source_text_selector": ".sino-project-item__open span",
        "bounded_files": (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
    },
    {
        "canonical_name": "Execution Tasks Heading Count",
        "entity": "tasks",
        "labels": ("执行任务", "任务列表", "任务"),
        "module": "Founder Execution Center",
        "region": "execution_tasks",
        "display_selector": "[data-execution-task-count]",
        "collection_selector": "[data-execution-task-row]",
        "search_selector": None,
        "source_text_selector": "[data-execution-task-row]",
        "bounded_files": (
            "frontend/src/sino-founder/ExecutionCenter.jsx",
            "frontend/src/sino-founder/ExecutionCenter.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
    },
)


CONTROL_STATE_TARGETS = (
    {
        "canonical_name": "Conversation Mode Selector State",
        "aliases": ("讨论模式", "对话模式", "conversation mode", "mode selector"),
        "module": "Founder Conversation",
        "region": "conversation_composer",
        "control_group": "discussion_mode_selector",
        "state_property": "active",
        "group_locator": {"strategy": "css", "value": ".sino-council-mode"},
        "control_locator": {"strategy": "css", "value": "button"},
        "action_target": {"strategy": "non_initial_enabled_control"},
        "state_representation": {"type": "class", "name": "is-active", "active_value": True},
        "accessibility_semantics": {"attribute": "aria-pressed", "active_value": "true", "inactive_value": "false"},
        "expected_active_count": 1,
        "bounded_files": (
            "frontend/src/sino-founder/GlobalSecretaryComposer.jsx",
            "frontend/src/sino-founder/GlobalSecretaryComposer.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
    },
    {
        "canonical_name": "Sidebar Navigation Current State",
        "aliases": ("库入口", "library entry", "library navigation", "当前导航"),
        "module": "Founder Sidebar / Navigation",
        "region": "primary_navigation",
        "control_group": "sidebar_primary_navigation",
        "state_property": "current",
        "group_locator": {"strategy": "css", "value": ".sino-sidebar__fixed-top"},
        "control_locator": {"strategy": "css", "value": ":scope > .sino-sidebar-row"},
        "action_target": {"strategy": "css", "value": ".sino-sidebar-library"},
        "restore_target": {"strategy": "css", "value": ".sino-sidebar-home"},
        "state_representation": {"type": "class", "name": "is-active", "active_value": True},
        "accessibility_semantics": {"attribute": "aria-current", "active_value": "page", "inactive_value": None},
        "expected_active_count": 1,
        "bounded_files": (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
    },
    {
        "canonical_name": "Sidebar Collapse Control State",
        "aliases": ("侧边栏收起", "侧边栏展开", "sidebar collapse", "sidebar expanded"),
        "module": "Founder Sidebar / Navigation",
        "region": "sidebar_header",
        "control_group": "sidebar_visibility_control",
        "state_property": "expanded",
        "group_locator": {"strategy": "css", "value": ".sino-sidebar-top-actions"},
        "control_locator": {"strategy": "css", "value": ".sino-sidebar-toggle"},
        "action_target": {"strategy": "first_enabled_control"},
        "state_representation": {"type": "aria", "name": "aria-expanded", "active_value": "true", "inactive_value": "false"},
        "accessibility_semantics": {"attribute": "aria-expanded", "active_value": "true", "inactive_value": "false"},
        "expected_active_count": 1,
        "bounded_files": (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/SinoFounderShell.test.jsx",
        ),
    },
)


def _control_state_target(normalized: str) -> dict[str, Any] | None:
    state_intent = any(term in normalized for term in (
        "选中", "当前状态", "导航状态", "可访问状态", "展开状态", "收起状态", "active", "selected",
        "pressed", "expanded", "aria-pressed", "aria-current", "aria-selected", "aria-expanded",
    ))
    if not state_intent:
        return None
    matches = [item for item in CONTROL_STATE_TARGETS if any(alias in normalized for alias in item["aliases"])]
    if len(matches) != 1:
        return None
    profile = dict(matches[0])
    return {
        "canonical_name": profile.pop("canonical_name"),
        "surface": profile["module"],
        "region": profile["region"],
        "entity": profile["control_group"],
        "visible_element": "application_control_group",
        "property": profile["state_property"],
        "interaction_intent": "generic_control_state",
        "control_state_profile": profile,
    }


def _derived_visible_target(normalized: str) -> dict[str, Any] | None:
    """Resolve bounded collection-count UI semantics without task-specific identities."""
    count_intent = any(term in normalized for term in ("数量", "计数", "总数", "几个", "count"))
    visible_intent = any(term in normalized for term in ("显示", "可见", "标题", "旁", "徽标", "数字", "count"))
    if not count_intent or not visible_intent:
        return None
    matches = [item for item in DERIVED_COLLECTION_TARGETS if any(label in normalized for label in item["labels"])]
    if len(matches) != 1:
        return None
    target = dict(matches[0])
    return {
        "canonical_name": target.pop("canonical_name"),
        "surface": target["module"],
        "region": target["region"],
        "entity": target["entity"],
        "visible_element": "heading_count",
        "property": "displayed_integer",
        "interaction_intent": "visible_derived_count",
        "derived_value_profile": target,
    }


def resolve_task_scope(*, goal: str, risk_level: str = "low", explicit_contract: dict[str, Any] | None = None) -> dict[str, Any]:
    """Resolve explicit, semantic-module, or approval-required scope.

    Repository discovery is always read-only. A HIGH confidence semantic result
    freezes a narrow write scope before Codex is dispatched.
    """
    if explicit_contract:
        return {
            "scope_source": "explicit_contract",
            "confidence": HIGH,
            "allowed_modules": [explicit_contract.get("target_surface")],
            "allowed_file_patterns": list(explicit_contract.get("implementation_scope") or []),
            "denied_modules": list(explicit_contract.get("prohibited_scope") or []),
            "semantic_keywords": [],
            "discovery_scope": {"mode": "read_only", "allowed_patterns": ["**/*"]},
            "reason": "A bounded explicit contract matched the current goal.",
        }

    normalized = " ".join(str(goal or "").lower().split())
    if risk_level.lower() != "low" or any(term in normalized for term in HIGH_RISK_TERMS):
        return _approval("Task crosses a protected or non-LOW-risk boundary.")
    if not normalized or any(normalized == item or normalized.startswith(item) for item in VAGUE_GOALS):
        return _approval("The goal is too vague to identify a safe semantic module.")

    control_state_target = _control_state_target(normalized)
    if control_state_target:
        module = next(item for item in MODULES if item.name == control_state_target["surface"])
        profile = dict(control_state_target["control_state_profile"])
        bounded_files = list(profile.pop("bounded_files"))
        denied = [item.name for item in MODULES if item.name != module.name]
        denied.extend(["backend", "database", "runtime infrastructure", "provider", "production"])
        return {
            "scope_source": "semantic_module", "confidence": HIGH,
            "allowed_modules": [module.name], "allowed_file_patterns": bounded_files,
            "denied_modules": denied, "semantic_keywords": [control_state_target["entity"], "generic_control_state"],
            "semantic_hunk_markers": list(module.hunk_markers), "discovered_files": bounded_files,
            "discovery_scope": {"mode": "read_only", "allowed_patterns": ["**/*"]},
            "write_scope": {"mode": "semantic_module", "allowed_patterns": bounded_files},
            "reason": f"Resolved a bounded application control state to {module.name}.",
            "semantic_target": {key: value for key, value in control_state_target.items() if key != "control_state_profile"},
            "interaction_type": "generic_control_state",
            "control_state_profile": profile,
            "visible_artifact_contract": None,
        }

    derived_target = _derived_visible_target(normalized)
    if derived_target:
        module = next(item for item in MODULES if item.name == derived_target["surface"])
        bounded_files = list(derived_target["derived_value_profile"].pop("bounded_files"))
        denied = [item.name for item in MODULES if item.name != module.name]
        denied.extend(["backend", "database", "runtime infrastructure", "provider", "production"])
        return {
            "scope_source": "semantic_module", "confidence": HIGH,
            "allowed_modules": [module.name], "allowed_file_patterns": bounded_files,
            "denied_modules": denied, "semantic_keywords": [derived_target["entity"], "visible_derived_count"],
            "semantic_hunk_markers": list(module.hunk_markers), "discovered_files": bounded_files,
            "discovery_scope": {"mode": "read_only", "allowed_patterns": ["**/*"]},
            "write_scope": {"mode": "semantic_module", "allowed_patterns": bounded_files},
            "reason": f"Resolved a bounded visible collection count to {module.name}.",
            "semantic_target": {key: value for key, value in derived_target.items() if key != "derived_value_profile"},
            "interaction_type": "visible_derived_count",
            "derived_value_profile": derived_target["derived_value_profile"],
            "visible_artifact_contract": None,
        }

    # Wording after comparison/reference terms describes visual inspiration, not
    # a second write target. Weight the target clause more strongly.
    target_clause = normalized
    reference_clause = ""
    for separator in ("与‘", "与\"", "与“", "参考", "类似", "一致"):
        if separator in target_clause:
            target_clause, reference_clause = target_clause.split(separator, 1)
            break
    scored: list[tuple[int, SemanticModule, list[str]]] = []
    for module in MODULES:
        target_matches = [keyword for keyword in module.keywords if keyword in target_clause]
        reference_matches = [keyword for keyword in module.keywords if keyword in reference_clause]
        matches = target_matches + [item for item in reference_matches if item not in target_matches]
        if matches:
            scored.append((len(target_matches) * 3 + len(reference_matches), module, matches))
    scored.sort(key=lambda item: item[0], reverse=True)
    has_ui_intent = any(term in normalized for term in UI_TERMS)
    if not scored or not has_ui_intent:
        return _approval("No clear LOW-risk Founder frontend UI module could be resolved.")
    best_score, best, matches = scored[0]
    tied = [item for item in scored if item[0] == best_score]
    confidence = HIGH if best_score >= 3 and len(tied) == 1 else MEDIUM
    if confidence != HIGH:
        return {
            **_approval("The goal spans or ambiguously names adjacent frontend modules."),
            "confidence": confidence,
            "semantic_keywords": matches,
        }
    denied = [module.name for module in MODULES if module.name != best.name]
    denied.extend(["backend", "database", "runtime infrastructure", "provider", "production"])
    return {
        "scope_source": "semantic_module",
        "confidence": HIGH,
        "allowed_modules": [best.name],
        "allowed_file_patterns": list(best.files),
        "denied_modules": denied,
        "semantic_keywords": matches,
        "semantic_hunk_markers": list(best.hunk_markers),
        "discovered_files": list(best.files),
        "discovery_scope": {"mode": "read_only", "allowed_patterns": ["**/*"]},
        "write_scope": {"mode": "semantic_module", "allowed_patterns": list(best.files)},
        "reason": f"Resolved a clear LOW-risk UI goal to {best.name}.",
        "visible_artifact_contract": _semantic_visible_contract(normalized, best),
    }


def _approval(reason: str) -> dict[str, Any]:
    return {
        "scope_source": "approval_required",
        "confidence": LOW,
        "allowed_modules": [],
        "allowed_file_patterns": [],
        "denied_modules": ["repository_writes"],
        "semantic_keywords": [],
        "discovered_files": [],
        "discovery_scope": {"mode": "read_only", "allowed_patterns": ["**/*"]},
        "reason": reason,
    }


def semantic_scope_file_allowed(scope: dict[str, Any], path: str) -> bool:
    return path in set(scope.get("allowed_file_patterns") or [])


def semantic_css_hunk_allowed(
    scope: dict[str, Any], hunk: str, *, task_owned_class_tokens: set[str] | None = None,
) -> bool:
    markers = [str(item) for item in scope.get("semantic_hunk_markers") or []]
    normalized_hunk = hunk.lower()
    if markers and any(marker.lower() in normalized_hunk for marker in markers):
        return True
    return any(f".{token.lower()}" in normalized_hunk for token in (task_owned_class_tokens or set()))


def _semantic_visible_contract(goal: str, module: SemanticModule) -> dict[str, Any] | None:
    """Compile a declarative UI check from common interaction semantics."""
    if module.name == "Founder Sidebar / Navigation" and any(
        term in goal for term in ("新建讨论", "new discussion", "new conversation", "start discussion", "blank discussion")
    ):
        return {
            "required": True, "artifact_type": "founder_new_discussion_interaction",
            "target_route": "Sino Founder shell / sidebar navigation",
            "required_assertions": [
                "new_discussion_trigger_visible", "interaction_surface_visible",
                "blank_discussion_action_visible", "current_project_discussion_action_visible",
                "outside_close_works", "escape_close_works",
            ],
        }
    if module.name == "Founder Sidebar / Navigation" and "drawer" in goal:
        label = "Sino AI 产品矩阵" if "产品矩阵" in goal else None
        if label:
            return {
                "required": True, "artifact_type": "semantic_ui", "interaction": "drawer",
                "target_route": "Sino Founder shell / all Founder views",
                "trigger_role": "button", "trigger_name": label, "dialog_name": label,
                "container_selector": ".founder-navigation-panel",
                "excluded_container_selector": ".founder-conversation-surface",
                "close_button_name": "关闭产品矩阵",
                "required_assertions": [
                    "trigger_visible", "dialog_visible", "dialog_within_container",
                    "dialog_outside_excluded_container", "close_action_works",
                ],
            }
    if module.name == "Founder Sidebar / Navigation" and any(term in goal for term in ("字号", "字体", "间距")) and any(term in goal for term in ("产品矩阵", "sino ai 产品", "产品弹出框")):
        return {
            "required": True, "artifact_type": "founder_product_matrix_list_style",
            "target_route": "Sino Founder shell / all Founder views",
            "required_assertions": [
                "product_matrix_entry_visible", "product_matrix_dialog_visible", "product_items_visible",
                "product_title_font_size_increased", "product_description_font_size_increased",
                "product_vertical_gap_compact", "outside_close_works",
            ],
        }
    if module.name == "Founder Project UI" and any(term in goal for term in ("rename", "archive", "delete", "重命名", "归档", "删除")):
        return {
            "required": True, "artifact_type": "founder_project_action_popovers",
            "target_route": "Sino Founder shell / project navigation",
            "required_assertions": [
                "project_action_trigger_visible", "rename_popover_visible",
                "archive_popover_visible", "delete_popover_visible",
                "project_action_popovers_match_create_project", "outside_close_works",
            ],
        }
    if module.name == "Founder Conversation" and any(term in goal for term in ("更多操作", "会话操作", "对话标题", "会话标题")):
        return {
            "required": True, "artifact_type": "founder_conversation_action_popover",
            "target_route": "Sino Founder shell / conversation navigation",
            "required_assertions": [
                "conversation_action_trigger_visible", "conversation_action_popover_visible",
                "conversation_action_popover_matches_create_project", "outside_close_works",
            ],
        }
    if module.name == "Founder Conversation" and "选择项目" in goal and any(term in goal for term in ("弹出框", "popover", "锚定")):
        return {
            "required": True, "artifact_type": "founder_conversation_project_selector_popover",
            "target_route": "Sino Founder shell / conversation composer",
            "required_assertions": [
                "project_selector_trigger_visible", "project_selector_popover_visible",
                "project_selector_uses_portal", "project_selector_fixed_position",
                "project_selector_arrow_visible", "project_selector_business_controls_visible",
                "outside_close_works", "escape_close_works", "toggle_close_works",
            ],
        }
    if module.name == "Founder Conversation" and any(term in goal for term in ("文件/文档", "文件和文档", "上传文件")) and any(
        term in goal for term in ("选择已有文档", "已有文档", "文档库")
    ):
        return {
            "required": True,
            "artifact_type": "founder_conversation_file_actions",
            "target_route": "Sino Founder shell / conversation composer",
            "required_assertions": [
                "trigger_visible", "interaction_surface_visible",
                "upload_option_visible", "existing_document_option_visible",
                "recommended_surface_match", "portal_parent_body",
                "position_fixed", "anchor_positioning", "arrow_visible",
                "viewport_contained", "not_composer_clipped",
                "outside_close", "escape_close", "toggle_close",
                "filechooser_opened", "file_selected_false",
                "document_boundary_truthful", "document_data_not_fabricated",
                "conversation_input_preserved", "project_context_preserved",
            ],
        }
    return None
