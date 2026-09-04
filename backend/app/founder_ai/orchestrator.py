"""Founder AI V0.1 development coordination primitives.

This module produces typed drafts and an execution package for human/Codex
review. It intentionally does not execute code, persist assets, call Git, or
invoke a provider/runtime.
"""

from dataclasses import dataclass, field
from typing import Any, Literal, Mapping

FOUNDER_SYSTEM_KEY = "founder_ai"
GoalType = Literal["development", "migration", "research", "decision"]


@dataclass(frozen=True, slots=True)
class FounderGoal:
    text: str
    goal_type: GoalType
    system_id: str = FOUNDER_SYSTEM_KEY


@dataclass(frozen=True, slots=True)
class TaskAssetDraft:
    title: str
    description: str
    scope: dict[str, Any]
    constraints: list[str]
    risk: str
    approval_required: bool
    system_id: str = FOUNDER_SYSTEM_KEY
    conversation_id: str | None = None
    goal_type: GoalType = "development"


@dataclass(frozen=True, slots=True)
class ExecutionPackage:
    goal: str
    context: dict[str, Any]
    task_asset: TaskAssetDraft
    constraints: list[str]
    verification: list[str]
    commit_requirement: str
    approval_required: bool = True
    execution_allowed: bool = False
    package_version: int = 1
    execution_deltas: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class MemoryAssetDraft:
    decision: str | None = None
    artifact: str | None = None
    commit: str | None = None
    learning: str | None = None
    system_id: str = FOUNDER_SYSTEM_KEY
    status: str = "draft"


def classify_goal(text: str) -> FounderGoal:
    """Classify a Founder goal without invoking an LLM or external service."""

    normalized = (text or "").strip()
    if not normalized:
        raise ValueError("goal text must not be empty")

    migration_terms = ("迁移", "migration", "upgrade", "升级")
    research_terms = ("研究", "调研", "分析", "research", "audit", "审计")
    decision_terms = ("决定", "决策", "选择", "decision", "compare", "比较")
    development_terms = ("开发", "创建", "构建", "实现", "build", "create", "develop")

    lowered = normalized.lower()
    if any(term in lowered for term in migration_terms):
        goal_type: GoalType = "migration"
    elif any(term in lowered for term in research_terms):
        goal_type = "research"
    elif any(term in lowered for term in decision_terms):
        goal_type = "decision"
    elif any(term in lowered for term in development_terms):
        goal_type = "development"
    else:
        goal_type = "development"

    return FounderGoal(text=normalized, goal_type=goal_type)


def _ensure_founder_context(context: Mapping[str, Any] | None) -> dict[str, Any]:
    result = dict(context or {})
    system_id = result.get("system_id", FOUNDER_SYSTEM_KEY)
    if system_id != FOUNDER_SYSTEM_KEY:
        raise ValueError("Founder AI orchestrator only accepts founder_ai context")
    result["system_id"] = FOUNDER_SYSTEM_KEY
    return result


def generate_task_asset_draft(
    goal: str,
    *,
    conversation_id: str | None = None,
    context: Mapping[str, Any] | None = None,
    constraints: list[str] | None = None,
    risk: str = "medium",
    approval_required: bool = True,
) -> TaskAssetDraft:
    """Generate a TaskAsset draft; no TaskAssetDB row is created."""

    classified = classify_goal(goal)
    founder_context = _ensure_founder_context(context)
    task_constraints = list(constraints or [])
    if founder_context.get("constraints"):
        task_constraints.extend(str(item) for item in founder_context["constraints"])

    return TaskAssetDraft(
        title=classified.text[:200],
        description=f"Founder AI coordination draft for: {classified.text}",
        scope={"goal_type": classified.goal_type, "context": founder_context},
        constraints=task_constraints,
        risk=risk,
        approval_required=approval_required,
        conversation_id=conversation_id,
        goal_type=classified.goal_type,
    )


def build_execution_package(
    task_asset: TaskAssetDraft,
    *,
    verification: list[str] | None = None,
    commit_requirement: str = "Founder approval required before commit",
) -> ExecutionPackage:
    """Create a non-executable Codex package from a TaskAsset draft."""

    return ExecutionPackage(
        goal=task_asset.title,
        context=dict(task_asset.scope.get("context", {})),
        task_asset=task_asset,
        constraints=list(task_asset.constraints),
        verification=list(verification or ["Review generated changes", "Run required tests"]),
        commit_requirement=commit_requirement,
        approval_required=task_asset.approval_required,
        execution_allowed=False,
    )


def build_memory_asset_draft(
    *,
    decision: str | None = None,
    artifact: str | None = None,
    commit: str | None = None,
    learning: str | None = None,
) -> MemoryAssetDraft:
    """Prepare memory fields after review; does not persist MemoryAsset."""

    return MemoryAssetDraft(
        decision=decision,
        artifact=artifact,
        commit=commit,
        learning=learning,
    )
