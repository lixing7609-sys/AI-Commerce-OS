"""Non-weakening refinement of current-task visible artifact contracts."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.founder_ai.execution_state import runtime_revision


FILE_ACTION_ASSERTIONS = {
    "trigger_visible", "interaction_surface_visible", "upload_option_visible",
    "existing_document_option_visible", "recommended_surface_match", "portal_parent_body",
    "position_fixed", "anchor_positioning", "arrow_visible", "viewport_contained",
    "not_composer_clipped", "outside_close", "escape_close", "toggle_close",
    "filechooser_opened", "file_selected_false", "document_boundary_truthful",
    "document_data_not_fabricated", "conversation_input_preserved", "project_context_preserved",
}

GUIDANCE_ASSERTION_MAP = (
    (("trigger visibility", "visible target"), ("trigger_visible",)),
    (("overlay visibility",), ("interaction_surface_visible",)),
    (("anchor geometry", "bounding rectangle"), ("anchor_positioning",)),
    (("overlay stacking", "container styles"), ("portal_parent_body", "position_fixed")),
    (("outside-click",), ("outside_close",)),
    (("escape",), ("escape_close",)),
    (("toggle",), ("toggle_close",)),
    (("viewport", "resize", "scroll"), ("viewport_contained", "not_composer_clipped")),
)


GENERIC_VISIBLE_ASSERTIONS = ("target_visible", "requested_behavior_visible")
SEARCH_CLEAR_ASSERTIONS = (
    "search_input_visible", "query_value_entered", "clear_control_visible",
    "clear_control_count_matches", "duplicate_control_absent", "clear_action_works",
    "projects_restored", "recent_conversations_restored", "empty_state_preserved",
    "escape_clear_preserved", "no_unrelated_sidebar_regression",
)
DERIVED_COUNT_ASSERTIONS = (
    "display_target_visible", "display_value_integer", "derived_count_matches",
    "baseline_state_passed", "filtered_state_passed", "restored_state_passed",
    "existing_behaviors_preserved",
)
CONTROL_STATE_ASSERTIONS = (
    "control_group_visible", "initial_state_recorded", "action_completed",
    "expected_state_after_action", "previous_control_state_cleared",
    "state_exclusivity_preserved", "accessibility_state_matches",
    "original_behavior_preserved",
)


def _dedup(values: list[Any]) -> list[Any]:
    result = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


def build_generic_visible_artifact_contract(
    *, goal: str, semantic_scope: dict[str, Any], acceptance_cardinality: dict | None,
    existing_behavior_discovery: dict | None,
) -> dict | None:
    """Create a non-null base contract for a resolved LOW-risk visible UI task."""
    if semantic_scope.get("confidence") != "HIGH" or semantic_scope.get("scope_source") != "semantic_module":
        return None
    normalized = " ".join(str(goal or "").lower().split())
    module = next(iter(semantic_scope.get("allowed_modules") or []), None)
    derived_profile = deepcopy(semantic_scope.get("derived_value_profile") or {})
    control_state_profile = deepcopy(semantic_scope.get("control_state_profile") or {})
    is_derived_count = semantic_scope.get("interaction_type") == "visible_derived_count" and bool(derived_profile)
    is_control_state = semantic_scope.get("interaction_type") == "generic_control_state" and bool(control_state_profile)
    is_search_clear = any(term in normalized for term in ("搜索", "search")) and any(
        term in normalized for term in ("清除", "清空", "clear", "reset")
    )
    interaction_type = (
        "derived_visible_count" if is_derived_count else
        "generic_control_state" if is_control_state else
        "search_clear" if is_search_clear else "generic_control"
    )
    contract = {
        "required": True,
        "artifact_type": "generic_visible_interaction",
        "interaction_type": interaction_type,
        "target_route": module,
        "required_assertions": list(
            DERIVED_COUNT_ASSERTIONS if is_derived_count else
            CONTROL_STATE_ASSERTIONS if is_control_state else
            SEARCH_CLEAR_ASSERTIONS if is_search_clear else GENERIC_VISIBLE_ASSERTIONS
        ),
        "acceptance_cardinality": deepcopy(acceptance_cardinality),
        "existing_behavior_discovery": deepcopy(existing_behavior_discovery or {}),
        "verification_authority": "current_task",
        "verification_override_authority": False,
    }
    if is_derived_count:
        assertion = {
            "display_target": {"selector": derived_profile["display_selector"], "value_type": "integer"},
            "source_collection": {"selector": derived_profile["collection_selector"], "visibility": "visible"},
            "aggregation": "count", "comparison": "equals",
        }
        search_selector = derived_profile.get("search_selector")
        source_text_selector = derived_profile.get("source_text_selector")
        states = [
            {"name": "baseline", "setup_action": {"type": "none"}, "derived_assertion": assertion},
        ]
        if search_selector:
            states.extend([
                {
                    "name": "filtered",
                    "setup_action": {
                        "type": "filter_from_visible_row", "search_input_selector": search_selector,
                        "source_text_selector": source_text_selector, "require_nonzero": True, "require_reduced": True,
                    },
                    "derived_assertion": assertion,
                },
                {
                    "name": "restored", "setup_action": {"type": "clear_filter", "search_input_selector": search_selector},
                    "derived_assertion": assertion,
                },
            ])
        contract.update({
            "semantic_target": deepcopy(semantic_scope.get("semantic_target") or {}),
            "derived_value_assertion": assertion,
            "verification_states": states,
            "preserved_behaviors": _dedup([
                item.strip() for item in str(goal or "").splitlines()
                if any(term in item for term in ("保留", "保持", "不变", "preserve"))
            ]),
            "scope_authority": False,
        })
    if is_control_state:
        contract.update({
            "semantic_target": deepcopy(semantic_scope.get("semantic_target") or {}),
            "control_group_locator": deepcopy(control_state_profile.get("group_locator") or {}),
            "control_locator": deepcopy(control_state_profile.get("control_locator") or {}),
            "action": deepcopy(control_state_profile.get("action_target") or {}),
            "restore_action": deepcopy(control_state_profile.get("restore_target") or {}),
            "initial_state": {"capture": True},
            "expected_state_after_action": deepcopy(control_state_profile.get("state_representation") or {}),
            "previous_control_state": {"expected_active": False},
            "state_exclusivity": {"expected_active_count": int(control_state_profile.get("expected_active_count") or 1)},
            "accessibility_state": deepcopy(control_state_profile.get("accessibility_semantics") or {}),
            "preserved_behaviors": _dedup([
                item.strip() for item in str(goal or "").splitlines()
                if any(term in item for term in ("保留", "保持", "不变", "preserve"))
            ]),
            "scope_authority": False,
        })
    if is_search_clear:
        contract.update({
            "container_selector": ".founder-navigation-panel" if module == "Founder Sidebar / Navigation" else None,
            "target_selector": "input[type='search']",
            "application_control_selector": "button[aria-label*='清除'], button[aria-label*='Clear' i]",
            "empty_state_role": "status",
            "preserved_collection_selectors": [".sino-project-item", ".sino-conversation-item"],
        })
    return contract


def refine_visible_artifact_contract(
    *, base_contract: dict | None, acceptance_criteria: list[str] | None,
    playbook_context: dict | None, refined_at: str | None = None,
    runtime_revision_value: str | None = None,
) -> dict | None:
    """Enrich a base contract without granting Playbook verification authority."""
    if not base_contract:
        return None
    base = deepcopy(dict(base_contract))
    refined = deepcopy(base)
    playbook = dict(playbook_context or {})
    guidance = dict(playbook.get("verification_guidance") or {})
    historical = dict(guidance.get("historical") or {})
    guidance_items = _dedup([
        *[str(item) for item in acceptance_criteria or []],
        *[str(item) for item in historical.get("guidance") or []],
    ])
    applied = bool(
        playbook.get("applied") is True
        and playbook.get("safety_gate") == "PASS"
        and playbook.get("verification_override_authority") is False
    )
    before = _dedup(list(base.get("required_assertions") or []))
    supported = FILE_ACTION_ASSERTIONS if base.get("artifact_type") == "founder_conversation_file_actions" else set(before)
    mapped = []
    if applied:
        for item in guidance_items:
            normalized = item.lower()
            for terms, assertions in GUIDANCE_ASSERTION_MAP:
                if any(term in normalized for term in terms):
                    mapped.extend(assertion for assertion in assertions if assertion in supported)
    mapped = _dedup(mapped)
    added = [item for item in mapped if item not in before]
    deduped = [item for item in mapped if item in before]
    after = _dedup([*before, *added])
    refined["required_assertions"] = after
    refined["refinement"] = {
        "base_contract": base,
        "playbook_guidance_applied": applied,
        "guidance_items_added": added,
        "guidance_items_deduped": deduped,
        "guidance_sources": guidance_items,
        "required_evidence_before": before,
        "required_evidence_after": after,
        "verification_weakened": not set(before).issubset(after),
        "verification_override_authority": False,
        "refined_at": refined_at or datetime.now(timezone.utc).isoformat(),
        "runtime_revision": runtime_revision_value or runtime_revision(),
    }
    return refined
