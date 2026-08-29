"""Read-only discovery and acceptance semantics for visible UI controls."""

from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any


_INPUT_RE = re.compile(r"<input\b(?P<attrs>.*?)(?<![=])/?>", re.IGNORECASE | re.DOTALL)
_BUTTON_RE = re.compile(r"<button\b(?P<attrs>.*?)(?<![=])>(?P<body>.*?)</button>", re.IGNORECASE | re.DOTALL)
_ATTR_RE = re.compile(r"(?P<name>[\w:-]+)\s*=\s*(?:\"(?P<double>[^\"]*)\"|'(?P<single>[^']*)')")
_CLEAR_TERMS = ("清除", "清空", "clear", "reset")


def _attributes(source: str) -> dict[str, str]:
    return {
        match.group("name"): match.group("double") if match.group("double") is not None else match.group("single")
        for match in _ATTR_RE.finditer(source)
    }


def _scope_fingerprint(scope: dict[str, Any]) -> str:
    authority = {
        "allowed_modules": list(scope.get("allowed_modules") or []),
        "allowed_file_patterns": list(scope.get("allowed_file_patterns") or []),
        "write_scope": dict(scope.get("write_scope") or {}),
    }
    return sha256(json.dumps(authority, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def extract_acceptance_cardinality(text: str) -> dict[str, Any] | None:
    """Translate explicit human cardinality into advisory-free task authority."""
    normalized = " ".join(str(text or "").lower().split())
    if not normalized:
        return None
    control_role = "clear" if any(term in normalized for term in _CLEAR_TERMS) else "control"
    none = (
        r"(?:不显示|不要|没有|移除|删除)\s*(?:任何|所有)?[^。；;\n]{0,18}(?:入口|按钮|控件|control|button)",
        r"\bno\s+(?:visible\s+)?(?:control|button|entry)\b",
    )
    exactly_one = (
        r"(?:唯一|只保留一个|只显示一个|仅保留一个)",
        r"(?:一个|1\s*个)[^。；;\n]{0,18}(?:入口|按钮|控件)",
        r"\b(?:exactly\s+one|only\s+one|single)\b",
    )
    at_least_one = (
        r"(?:至少一个|至少\s*1\s*个)",
        r"\bat\s+least\s+one\b",
    )
    if any(re.search(pattern, normalized) for pattern in none):
        return {"cardinality": "none", "expected_visible_count": 0, "duplicate_control_absent": True,
                "control_role": control_role, "source": "current_task_acceptance", "authority": "authoritative"}
    if any(re.search(pattern, normalized) for pattern in at_least_one):
        return {"cardinality": "at_least_one", "minimum_visible_count": 1,
                "control_role": control_role, "source": "current_task_acceptance", "authority": "authoritative"}
    if any(re.search(pattern, normalized) for pattern in exactly_one):
        return {"cardinality": "exactly_one", "expected_visible_count": 1, "duplicate_control_absent": True,
                "control_role": control_role, "source": "current_task_acceptance", "authority": "authoritative"}
    return None


def extract_founder_acceptance_criteria(text: str) -> list[str]:
    criteria = []
    for line in str(text or "").splitlines():
        item = re.sub(r"^\s*\d+[.)、．]\s*", "", line).strip()
        if item and item != line.strip() or re.match(r"^\s*\d+[.)、．]", line):
            if item and item not in criteria:
                criteria.append(item)
    return criteria


def discover_existing_ui_controls(*, repo_root: Path, semantic_scope: dict[str, Any], acceptance_text: str) -> dict[str, Any]:
    """Inspect only scope-authorized source files; never mutate scope or repository state."""
    before = _scope_fingerprint(semantic_scope)
    controls: list[dict[str, Any]] = []
    native_capabilities: list[dict[str, Any]] = []
    keyboard_behaviors: list[dict[str, Any]] = []
    inspected_files = []
    for relative in semantic_scope.get("allowed_file_patterns") or []:
        path = repo_root / relative
        if not path.is_file() or path.suffix.lower() not in {".js", ".jsx", ".ts", ".tsx", ".html"}:
            continue
        source = path.read_text(errors="replace")
        inspected_files.append(relative)
        for match in _INPUT_RE.finditer(source):
            attrs = _attributes(match.group("attrs"))
            input_type = attrs.get("type", "text").lower()
            controls.append({"element": "input", "input_type": input_type, "aria_label": attrs.get("aria-label"),
                             "visible_state": "rendered_when_component_visible", "click_behavior": "browser_default",
                             "source_file": relative})
            if input_type == "search":
                native_capabilities.append({"capability": "search_cancel", "provider": "browser_user_agent",
                                            "conditional_visibility": "non_empty_value",
                                            "suppression_declared": attrs.get("data-native-search-cancel") == "hidden",
                                            "source_file": relative})
        for match in _BUTTON_RE.finditer(source):
            attrs = _attributes(match.group("attrs"))
            semantics = " ".join((attrs.get("aria-label", ""), attrs.get("title", ""), match.group("body"))).lower()
            if any(term in semantics for term in _CLEAR_TERMS):
                controls.append({"element": "button", "control_role": "clear", "aria_label": attrs.get("aria-label"),
                                 "class_name": attrs.get("className") or attrs.get("class"),
                                 "visible_state": "conditional_from_application_state" if "?" in source[max(0, match.start() - 120):match.start()] else "rendered",
                                 "click_behavior": "application_handler_present" if "onClick" in match.group("attrs") else "not_detected",
                                 "source_file": relative})
        if re.search(r"(?:event|e)\.key\s*===?\s*[\"']Escape[\"']", source):
            keyboard_behaviors.append({"key": "Escape", "behavior": "application_handler_present", "source_file": relative})
    after = _scope_fingerprint(semantic_scope)
    application_clear_count = sum(item.get("control_role") == "clear" for item in controls)
    native_search_count = len(native_capabilities)
    unsuppressed_native_count = sum(not item.get("suppression_declared") for item in native_capabilities)
    return {
        "mode": "read_only", "acceptance_intent": str(acceptance_text or ""),
        "inspected_files": inspected_files, "controls": controls,
        "browser_native_controls": native_capabilities, "keyboard_behaviors": keyboard_behaviors,
        "current_control_cardinality": {
            "application_clear_controls": application_clear_count,
            "native_search_cancel_capabilities": native_search_count,
            "declared_visible_native_search_cancel_controls": unsuppressed_native_count,
            "declared_effective_clear_controls": application_clear_count + unsuppressed_native_count,
        },
        "scope_before": before, "scope_after": after, "scope_unchanged": before == after,
        "scope_authority": False, "risk_authority": False, "approval_authority": False,
        "completion_authority": False, "verification_override_authority": False,
    }
