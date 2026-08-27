"""Create supported reusable assets from durable, verified historical executions."""

import json

from sqlalchemy import select

from app.core.artifact.model import ArtifactAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import get_execution_session
from app.founder_ai.learning_extractor import extract_anchored_portal_popover_learning
from app.founder_ai.decision_strategy_extractor import extract_interaction_surface_decision
from app.founder_ai.reusable_asset_service import save_reusable_asset
from core.conversation_first.model import ConversationMessageDB


def extract_historical_anchored_popover_asset(*, task_id: str, execution_id: str,
                                               source_commit_sha: str | None = None,
                                               session_factory=SessionLocal):
    with session_factory() as db:
        task = db.get(TaskAssetDB, task_id)
        artifact = db.scalar(select(ArtifactAssetDB).where(
            ArtifactAssetDB.task_asset_id == task_id,
            ArtifactAssetDB.artifact_type == "execution_result",
        ).order_by(ArtifactAssetDB.created_at.desc()))
        memories = list(db.scalars(select(MemoryAssetDB).where(MemoryAssetDB.task_asset_id == task_id)))
    if task is None:
        raise LookupError("source task not found")
    registry = get_execution_session(execution_id)
    if registry is None or registry[0].task_asset_id != task_id:
        raise LookupError("source execution not found for task")
    session, package = registry
    contract = dict((package.context or {}).get("standard_task_contract") or {})
    semantic_scope = dict(contract.get("semantic_scope") or {})
    content = json.loads(artifact.content_ref or "{}") if artifact else {}
    candidate = extract_anchored_portal_popover_learning(
        task_id=task.id, execution_id=session.id, goal=package.goal or task.title,
        task_status=task.status, task_result=dict(task.result or {}), semantic_scope=semantic_scope,
        changed_files=list(content.get("files") or (session.artifact or {}).get("files") or []),
        source_artifact_id=artifact.id if artifact else None,
        source_memory_ids=[item.id for item in memories], execution_events=list(session.events or []),
        source_commit_sha=source_commit_sha,
    )
    if candidate is None:
        raise ValueError("source execution is not eligible for anchored portal learning")
    return save_reusable_asset(candidate, session_factory=session_factory)


def extract_historical_interaction_surface_decision(
    *, task_id: str, execution_id: str, source_commit_sha: str | None = None,
    session_factory=SessionLocal,
):
    """Build one decision strategy from durable task, conversation and execution evidence."""
    with session_factory() as db:
        task = db.get(TaskAssetDB, task_id)
        if task is None:
            raise LookupError("source task not found")
        artifact = db.scalar(select(ArtifactAssetDB).where(
            ArtifactAssetDB.task_asset_id == task_id,
            ArtifactAssetDB.artifact_type == "execution_result",
        ).order_by(ArtifactAssetDB.created_at.desc()))
        memories = list(db.scalars(select(MemoryAssetDB).where(MemoryAssetDB.task_asset_id == task_id)))
        messages = list(db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == task.conversation_id,
        ).order_by(ConversationMessageDB.created_at.asc())))
    registry = get_execution_session(execution_id)
    if registry is None or registry[0].task_asset_id != task_id:
        raise LookupError("source execution not found for task")
    session, package = registry
    contract = dict((package.context or {}).get("standard_task_contract") or {})
    semantic_scope = dict(contract.get("semantic_scope") or {})
    modules = list(semantic_scope.get("allowed_modules") or [])
    content = json.loads(artifact.content_ref or "{}") if artifact else {}
    verification = dict((task.result or {}).get("verification") or {})
    candidate = extract_interaction_surface_decision(
        task_id=task.id, execution_id=session.id, task_status=task.status,
        verification_status=str(verification.get("status") or ""),
        changed_files=list(content.get("files") or (session.artifact or {}).get("files") or []),
        semantic_module=str(modules[0]) if modules else "",
        conversation_messages=[{"message_id": item.id, "role": item.role, "content": item.content} for item in messages],
        source_conversation_id=task.conversation_id,
        source_artifact_id=artifact.id if artifact else None,
        source_memory_ids=[item.id for item in memories], source_commit_sha=source_commit_sha,
    )
    if candidate is None:
        raise ValueError("source execution is not eligible for interaction-surface decision learning")
    return save_reusable_asset(candidate, session_factory=session_factory)
