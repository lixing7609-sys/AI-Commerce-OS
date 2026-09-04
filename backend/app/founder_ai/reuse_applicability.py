"""Versioned provenance/applicability separation for reusable Founder UI knowledge."""

from __future__ import annotations

from hashlib import sha256
import json
from typing import Any


SUPPORTED_COMPACT_UI_MODULES = (
    "Founder Sidebar / Navigation",
    "Founder Conversation",
)


def _stable(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def semantic_scope_fingerprint(scope: dict[str, Any]) -> str:
    bounded = {
        "scope_source": scope.get("scope_source"),
        "confidence": scope.get("confidence"),
        "allowed_modules": list(scope.get("allowed_modules") or []),
        "allowed_file_patterns": list(scope.get("allowed_file_patterns") or []),
        "denied_modules": list(scope.get("denied_modules") or []),
    }
    return sha256(_stable(bounded).encode()).hexdigest()


def infer_applicability_profile(asset: Any) -> dict[str, Any]:
    """Interpret legacy canonical assets without updating their durable rows."""
    implementation = dict(asset.implementation_pattern or {})
    decision = dict(implementation.get("decision_strategy") or {})
    explicit = dict(implementation.get("applicability_profile") or decision.get("applicability_profile") or {})
    if explicit:
        return {**explicit, "inference": "materialized_payload"}
    if asset.asset_kind == "ui_interaction_pattern" and asset.pattern_type == "anchored_portal_popover":
        return {
            "profile_version": "capability-1.1-legacy-inferred",
            "domains": ["founder_ui.compact_contextual_interaction"],
            "interaction_types": ["compact_contextual_anchored_interaction"],
            "supported_semantic_modules": list(SUPPORTED_COMPACT_UI_MODULES),
            "supported_risk_levels": ["low"],
            "required_conditions": [
                "semantic target resolved", "visible contextual trigger", "compact action set",
                "no large workspace", "no destructive confirmation", "no full-screen requirement",
            ],
            "invalidation_conditions": list(asset.invalidation_conditions or []),
            "cross_module_allowed": True,
            "inference": "asset_kind_pattern_type_and_legacy_conditions",
        }
    if asset.asset_kind == "decision_strategy" and asset.pattern_type == "interaction_surface_choice":
        return {
            "profile_version": "capability-2.1-legacy-inferred",
            "domains": ["founder_ui.interaction_surface_decision"],
            "interaction_types": ["compact_contextual_action_choice"],
            "supported_semantic_modules": list(SUPPORTED_COMPACT_UI_MODULES),
            "supported_risk_levels": ["low"],
            "required_conditions": [
                "semantic target resolved", "contextual trigger", "compact action set", "low risk",
                "no large workspace", "no destructive confirmation", "no explicit modal requirement",
                "no full-screen requirement",
            ],
            "invalidation_conditions": list(asset.invalidation_conditions or []),
            "cross_module_allowed": True,
            "inference": "asset_kind_strategy_type_and_legacy_conditions",
        }
    return {
        "profile_version": "legacy-source-module-only",
        "domains": [], "interaction_types": [],
        "supported_semantic_modules": [asset.semantic_module],
        "supported_risk_levels": [], "required_conditions": [],
        "invalidation_conditions": list(asset.invalidation_conditions or []),
        "cross_module_allowed": False,
        "inference": "unsupported_legacy_asset",
    }


def profile_supports_scope(profile: dict[str, Any], scope: dict[str, Any]) -> bool:
    current = list(scope.get("allowed_modules") or [])
    supported = set(profile.get("supported_semantic_modules") or [])
    return bool(current) and bool(supported.intersection(current))


def source_module_rank(asset: Any, scope: dict[str, Any]) -> int:
    """Provenance affinity is a ranking signal, never a compatibility boundary."""
    return int(asset.semantic_module in set(scope.get("allowed_modules") or []))


def interaction_factors(*, goal: str, constraints: list[str] | None = None) -> dict[str, bool]:
    text = " ".join([goal, *(constraints or [])]).lower()
    return {
        "compact": any(term in text for term in (
            "一组操作", "几个操作", "操作入口", "操作选择", "操作选项", "菜单", "下拉",
            "action set", "action choice", "actions", "menu", "上传文件", "选择已有", "搜索范围",
        )),
        "contextual_trigger": any(term in text for term in (
            "入口", "trigger", "按钮", "图标", "标题后", "底部", "点击后", "菜单", "搜索框",
        )),
        "explicit_anchored_surface": any(term in text for term in (
            "popover", "弹出框", "弹层", "锚定", "anchored",
        )),
        "explicit_modal": any(term in text for term in ("必须 modal", "必须模态", "explicit modal")),
        "destructive_or_high_risk": any(term in text for term in (
            "destructive", "高风险", "破坏性", "删除确认", "不可撤销",
        )),
        "large_or_multistep": any(term in text for term in (
            "多步骤", "大工作区", "large workspace", "multi-step", "multistep",
        )),
        "full_screen": any(term in text for term in (
            "全屏", "full-screen", "bottom sheet", "移动端 sheet", "mobile sheet",
        )),
        "accessibility_incompatible": any(term in text for term in (
            "无障碍不兼容", "accessibility incompatible",
        )),
        "clear_non_surface_intent": any(term in text for term in (
            "字号", "字体", "颜色", "间距", "文案", "copy change", "typography",
        )),
    }


def historical_source_files(asset: Any) -> list[str]:
    files = list(dict(asset.implementation_pattern or {}).get("production_artifacts") or [])
    for source in list(asset.source_evidence or []):
        evidence = dict(source.get("evidence") or {})
        files.extend(evidence.get("changed_files") or source.get("changed_files") or [])
    return sorted({str(path) for path in files if path})


def source_file_leakage(*, source_files: list[str], scope_before: dict[str, Any],
                        scope_after: dict[str, Any]) -> dict[str, Any]:
    before = set(scope_before.get("allowed_file_patterns") or [])
    after = set(scope_after.get("allowed_file_patterns") or [])
    added = after - before
    leaked = sorted(set(source_files).intersection(added))
    return {
        "source_file_leakage": bool(leaked),
        "leaked_source_files": leaked,
        "added_write_scope": sorted(added),
        "check": "REJECT" if leaked else "PASS",
    }
