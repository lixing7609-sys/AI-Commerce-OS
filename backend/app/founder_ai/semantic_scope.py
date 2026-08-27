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
        ("左侧栏", "左边栏", "侧边栏", "左下角", "sidebar", "navigation", "导航", "产品矩阵", "sino ai 产品", "产品弹出框", "入口", "popover", "drawer", "浮层"),
        (
            "frontend/src/sino-founder/FounderNavigationPanel.jsx",
            "frontend/src/sino-founder/FounderNavigationPanel.test.jsx",
            "frontend/src/sino-founder/FounderWorkspaceIcons.jsx",
            "frontend/src/sino-founder/SecretarySidebar.jsx",
            "frontend/src/sino-founder/SecretarySidebar.test.jsx",
            "frontend/src/sino-founder/sino-founder-ai.css",
        ),
        ("FounderNavigationPanel", "SecretarySidebar", "sino-product-matrix", "sino-sidebar-products", "sino-sidebar", "product-matrix"),
    ),
    SemanticModule(
        "Founder Conversation",
        ("conversation", "对话", "会话", "对话标题", "会话标题", "更多操作", "会话操作", "消息", "气泡", "附件", "composer", "输入框"),
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
        ("FounderNavigationPanel", "ConversationThread", "ConversationWorkspace", "sino-conversation", "sino-conversation-item", "conversation-action-popover", "message-", "composer"),
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

UI_TERMS = ("ui", "界面", "页面", "布局", "位置", "样式", "字号", "字体", "颜色", "间距", "圆角", "弹出", "展开", "drawer", "popover", "modal")
HIGH_RISK_TERMS = ("数据库", "database", "schema", "secret", "密钥", "production", "生产", "deploy", "部署", "git push", "删除数据", "付费 api", "系统权限")
VAGUE_GOALS = ("优化系统", "优化一下", "改进系统", "完善系统")


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


def semantic_css_hunk_allowed(scope: dict[str, Any], hunk: str) -> bool:
    markers = [str(item) for item in scope.get("semantic_hunk_markers") or []]
    return bool(markers) and any(marker.lower() in hunk.lower() for marker in markers)


def _semantic_visible_contract(goal: str, module: SemanticModule) -> dict[str, Any] | None:
    """Compile a declarative UI check from common interaction semantics."""
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
    return None
