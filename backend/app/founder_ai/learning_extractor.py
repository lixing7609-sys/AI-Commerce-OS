"""Deterministic post-completion learning extraction for supported V1 patterns."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True, slots=True)
class LearningCandidate:
    asset_kind: str
    pattern_type: str
    semantic_module: str
    target_keywords: list[str]
    source_task_id: str
    source_execution_id: str
    source_artifact_id: str | None
    source_memory_ids: list[str]
    source_evidence: dict[str, Any]
    implementation_pattern: dict[str, Any]
    verification_pattern: dict[str, Any]
    reuse_conditions: list[str]
    invalidation_conditions: list[str]
    confidence: float


def _passed(task_result: dict[str, Any]) -> bool:
    verification = task_result.get("verification") or {}
    return str(task_result.get("status", "")).lower() == "completed" and str(verification.get("status", "")).upper() == "PASS"


def extract_anchored_portal_popover_learning(
    *, task_id: str, execution_id: str, goal: str, task_status: str,
    task_result: dict[str, Any], semantic_scope: dict[str, Any], changed_files: list[str],
    source_artifact_id: str | None = None, source_memory_ids: list[str] | None = None,
    execution_events: list[dict[str, Any]] | None = None, source_commit_sha: str | None = None,
) -> LearningCandidate | None:
    """Return a schema-bound candidate only when durable success evidence exists."""
    normalized = goal.lower()
    popover_markers = ("popover", "弹出框", "弹窗", "更多操作", "菜单")
    implementation_markers = ("portal", "锚定", "anchor", "fixed", "新建项目")
    production_files = [path for path in changed_files if not any(token in path.lower() for token in ("test", "spec", "docs/", ".md"))]
    if task_status.lower() != "completed" or not _passed(task_result):
        return None
    if not any(marker in normalized for marker in popover_markers) or not any(marker in normalized for marker in implementation_markers):
        return None
    if not production_files or semantic_scope.get("confidence") != "HIGH":
        return None
    modules = list(semantic_scope.get("allowed_modules") or [])
    if not modules:
        return None
    return LearningCandidate(
        asset_kind="ui_interaction_pattern", pattern_type="anchored_portal_popover",
        semantic_module=str(modules[0]),
        target_keywords=["popover", "anchored overlay", "portal", "more actions", "context menu", "弹出框", "更多操作"],
        source_task_id=task_id, source_execution_id=execution_id,
        source_artifact_id=source_artifact_id, source_memory_ids=list(source_memory_ids or []),
        source_evidence={
            "goal": goal, "changed_files": changed_files,
            "scope_verification": (task_result.get("verification") or {}).get("status"),
            "command_evidence": (task_result.get("verification") or {}).get("command_evidence") or [],
            "runtime_events": [item.get("event_name") for item in (execution_events or [])],
            "source_commit_sha": source_commit_sha,
        },
        implementation_pattern={
            "guidance": [
                "Keep the trigger in its source layout and portal the overlay to document.body.",
                "Use fixed positioning derived from the visible trigger bounding rectangle.",
                "Preserve overlay z-index, arrow/pointer, outside-click, Escape and toggle behavior.",
                "Reposition on viewport resize and scroll without changing the target module.",
                "Preserve aria-expanded on the trigger and dialog/menu semantics on the overlay.",
            ],
            "production_artifacts": production_files,
        },
        verification_pattern={
            "guidance": [
                "Sample trigger visibility before click on the active visible target.",
                "Verify overlay visibility and trigger-to-overlay anchor geometry.",
                "Verify expected container styles and overlay stacking.",
                "Verify outside-click and Escape close; capture computed style when required.",
            ],
            "requires_own_evidence": ["scope", "targeted_tests", "build", "diff_check", "browser_or_artifact"],
        },
        reuse_conditions=[
            "target is a compact action, menu, or popover interaction",
            "anchored overlay is semantically appropriate",
            "current semantic scope is already resolved with HIGH confidence",
        ],
        invalidation_conditions=[
            "target explicitly requires a modal or dialog",
            "mobile full-screen sheet is required",
            "reference requires a non-anchored layout",
            "accessibility contract is incompatible",
            "target module is outside the supported UI domain",
            "destructive UX requires modal confirmation",
        ],
        confidence=1.0,
    )
