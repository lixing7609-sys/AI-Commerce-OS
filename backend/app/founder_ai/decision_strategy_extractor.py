"""Deterministic extraction of the first reusable decision strategy."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class DecisionStrategyCandidate:
    asset_kind: str
    pattern_type: str
    strategy_name: str
    semantic_module: str
    target_keywords: list[str]
    source_task_id: str
    source_execution_id: str
    source_artifact_id: str | None
    source_memory_ids: list[str]
    source_evidence: dict[str, Any]
    decision_payload: dict[str, Any]
    reuse_conditions: list[str]
    invalidation_conditions: list[str]
    confidence: float


def extract_interaction_surface_decision(
    *, task_id: str, execution_id: str, task_status: str,
    verification_status: str, changed_files: list[str], semantic_module: str,
    conversation_messages: list[dict[str, Any]], source_conversation_id: str | None = None,
    source_artifact_id: str | None = None, source_memory_ids: list[str] | None = None,
    source_commit_sha: str | None = None,
) -> DecisionStrategyCandidate | None:
    """Extract anchored-overlay choice only from explicit, verified decision evidence."""
    production_files = [path for path in changed_files if not any(
        token in path.lower() for token in ("test", "spec", "docs/", ".md")
    )]
    founder_messages = [
        item for item in conversation_messages
        if str(item.get("role", "")).lower() in {"founder", "user"}
    ]
    evidence_text = "\n".join(str(item.get("content") or "") for item in founder_messages).lower()
    rejected_drawer = any(term in evidence_text for term in (
        "不要 drawer", "不是 drawer", "不要抽屉", "不是抽屉", "drawer 不", "drawer太",
        "不是现在这样的充满左边栏", "不是现在这样的充满左侧栏", "不是铺满左边栏", "不是铺满左侧栏",
    ))
    chose_popover = any(term in evidence_text for term in ("改成 popover", "改为 popover", "锚定", "弹出框", "弹层", "popover"))
    correction = any(term in evidence_text for term in ("不对", "不是", "不要", "只移动", "只改", "应该是", "改成", "改为"))
    if task_status.lower() != "completed" or verification_status.upper() != "PASS":
        return None
    if not production_files or not semantic_module or not (correction and rejected_drawer and chose_popover):
        return None

    sources = [{
        "conversation_id": source_conversation_id,
        "message_id": item.get("message_id") or item.get("id"),
        "role": item.get("role"),
        "content": item.get("content"),
    } for item in founder_messages if item.get("content")]
    return DecisionStrategyCandidate(
        asset_kind="decision_strategy",
        pattern_type="interaction_surface_choice",
        strategy_name="anchored_overlay_choice",
        semantic_module=semantic_module,
        target_keywords=["compact actions", "contextual trigger", "popover", "drawer", "modal", "弹出框", "弹层", "抽屉"],
        source_task_id=task_id,
        source_execution_id=execution_id,
        source_artifact_id=source_artifact_id,
        source_memory_ids=list(source_memory_ids or []),
        source_evidence={
            "conversation_id": source_conversation_id,
            "messages": sources,
            "changed_files": changed_files,
            "source_commit_sha": source_commit_sha,
            "verification_status": verification_status,
        },
        decision_payload={
            "strategy_type": "interaction_surface_choice",
            "strategy_name": "anchored_overlay_choice",
            "decision_question": "Which interaction surface should a compact, contextual, low-risk trigger use?",
            "recommended_strategy": "anchored_popover",
            "alternative_strategies": ["drawer", "modal"],
            "selection_conditions": [
                "interaction is compact", "interaction is contextual to a trigger", "risk is low",
                "action set is limited", "quick open and close is required",
                "large editing workspace is not required", "strong interruption is not required",
                "full-screen flow is not required",
            ],
            "rejection_conditions": {
                "drawer": ["too heavy for a compact action set", "consumes excessive workspace", "persistent panel is unnecessary"],
                "modal": ["too interruptive for low-risk contextual actions", "decision barrier is unnecessary", "breaks the current interaction flow"],
            },
            "rationale": "Use an anchored popover for compact, low-risk actions tied to a visible trigger; reserve heavier surfaces for interruption or workspace needs.",
            "tradeoffs": ["keeps context and closes quickly", "provides less workspace than a drawer", "provides less interruption than a modal"],
            "constraints": ["preserve the trigger location", "preserve current business actions", "do not broaden current semantic scope"],
            "implementation_implications": ["select an anchored popover before applying an implementation pattern asset"],
            "verification_implications": ["verify anchoring, visibility, preserved controls, and close interactions with current-task evidence"],
            "semantic_modules": [semantic_module],
            "risk_constraints": ["low risk only", "does not authorize destructive confirmation"],
        },
        reuse_conditions=[
            "interaction is compact and contextual to a trigger", "risk is low", "limited action set",
            "no large editing workspace or strong interruption is required",
        ],
        invalidation_conditions=[
            "explicit modal confirmation required", "destructive or high-risk confirmation",
            "multi-step editing", "large workspace required", "mobile full-screen sheet explicitly required",
            "accessibility requirements incompatible", "target cannot support anchored interaction",
        ],
        confidence=1.0,
    )
