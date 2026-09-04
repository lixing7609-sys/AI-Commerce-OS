"""Transactional cleanup of Founder task runtime while preserving conversation and assets."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, func, select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, ExecutionDeltaDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import (
    clear_execution_registry_runtime, finalize_execution_registry_cleanup,
    list_execution_sessions, restore_execution_registry_cleanup,
)
from app.founder_ai.execution_worker import execution_queue


TASK_RUNTIME_DISCOVERY_KEYS = {
    "active_founder_gate_proposal", "autonomous_cycle", "autonomous_main_loop",
    "clarification_state", "execution_context_feedback", "execution_intent",
    "execution_package", "execution_result", "execution_session", "focused_task_id",
    "founder_action_queue", "founder_action_required", "founder_gate_proposal_history",
    "founder_gate_proposals", "implementation_planning", "pending_task_understanding",
    "quick_fix_contract", "standard_task_contract", "task_candidate",
    "task_candidate_reconciliation", "task_candidates", "task_complexity_route",
    "task_focus", "task_navigation_resolution", "task_projection",
}


def _candidate_count(discovery: dict) -> int:
    candidates = {item.get("candidate_id") for item in discovery.get("task_candidates") or [] if isinstance(item, dict)}
    legacy = discovery.get("task_candidate")
    if isinstance(legacy, dict) and legacy.get("candidate_id"):
        candidates.add(legacy["candidate_id"])
    return len(candidates)


def _clean_discovery(discovery: dict, latest_message_id: str | None) -> dict:
    cleaned = {key: value for key, value in discovery.items() if key not in TASK_RUNTIME_DISCOVERY_KEYS}
    core = dict(discovery.get("conversation_core") or {})
    cleaned["task_runtime_cleanup_baseline"] = {
        "status": "clean", "latest_message_id": latest_message_id,
        "conversation_core_updated_at": core.get("updated_at"),
        "cleaned_at": datetime.now(timezone.utc).isoformat(),
    }
    return cleaned


def cleanup_founder_task_runtime() -> dict:
    registry = {"backup_path": None, "execution_count": len(list_execution_sessions())}
    before = {}
    try:
        registry = clear_execution_registry_runtime()
        with SessionLocal.begin() as db:
            states = list(db.scalars(select(SinoBrainSessionDB).with_for_update()))
            before["task_candidate_count"] = sum(_candidate_count(dict(state.discovery or {})) for state in states)
            before["founder_task_action_count"] = sum(len((state.discovery or {}).get("founder_action_queue") or []) for state in states)
            before["task_count"] = db.scalar(select(func.count()).select_from(TaskAssetDB)) or 0
            before["execution_delta_count"] = db.scalar(select(func.count()).select_from(ExecutionDeltaDB)) or 0
            before["conversation_count"] = db.scalar(select(func.count()).select_from(ConversationDB)) or 0
            before["conversation_message_count"] = db.scalar(select(func.count()).select_from(ConversationMessageDB)) or 0
            latest_by_conversation = dict(db.execute(select(
                ConversationMessageDB.conversation_id, func.max(ConversationMessageDB.created_at)
            ).group_by(ConversationMessageDB.conversation_id)).all())
            latest_ids = {}
            for conversation_id, created_at in latest_by_conversation.items():
                latest_ids[conversation_id] = db.scalar(select(ConversationMessageDB.id).where(
                    ConversationMessageDB.conversation_id == conversation_id,
                    ConversationMessageDB.created_at == created_at).limit(1))
            for state in states:
                state.discovery = _clean_discovery(dict(state.discovery or {}), latest_ids.get(state.conversation_id))
                state.updated_at = datetime.now(timezone.utc)
            db.execute(delete(ExecutionDeltaDB))
            db.execute(delete(TaskAssetDB))
        execution_queue.clear()
    except Exception:
        restore_execution_registry_cleanup(registry.get("backup_path"))
        raise
    finalize_execution_registry_cleanup(registry.get("backup_path"))
    return {"before": {**before, "execution_count": registry["execution_count"]},
            "deleted": {"task_assets": before["task_count"], "execution_sessions": registry["execution_count"],
                        "execution_deltas": before["execution_delta_count"], "task_candidates": before["task_candidate_count"],
                        "founder_task_actions": before["founder_task_action_count"]}}
