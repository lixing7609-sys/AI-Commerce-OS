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


def _dedup(values: list[Any]) -> list[Any]:
    result = []
    for value in values:
        if value not in result:
            result.append(value)
    return result


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
