"""Founder Action Queue projection over canonical lifecycle sources."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from app.core.conversation_first.model import SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from core.founder_object.model import FounderObjectDB

MVP_ACTION_TYPES = {"OBJECT_APPROVAL", "EXECUTION_APPROVAL", "EXECUTION_START"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _task_execution_id(task: TaskAssetDB) -> str | None:
    return dict((task.scope or {}).get("execution_start") or {}).get("execution_id")


def _source_key(item: dict) -> tuple[str | None, str | None, str | None]:
    return (item.get("source_type"), item.get("source_id"), item.get("action_type") or item.get("type"))


def _object_action(state: SinoBrainSessionDB, record: FounderObjectDB, now: str) -> dict:
    return {
        "action_id": f"object-approval:{record.id}",
        "action_type": "OBJECT_APPROVAL",
        "type": "OBJECT_APPROVAL",
        "title": "批准对象",
        "summary": record.name,
        "risk_level": "MEDIUM",
        "risk": "medium",
        "status": "pending",
        "conversation_id": record.source_conversation_id,
        "project_id": state.project_id,
        "source_type": "founder_object",
        "source_id": record.id,
        "object_id": record.id,
        "task_id": None,
        "execution_id": None,
        "created_at": now,
        "updated_at": now,
        "decision": None,
        "decided_at": None,
        "context": {"object_type": record.object_type, "object_status": record.status},
        "reason": "draft_object_requires_founder_approval",
        "metadata": {"queue_schema": "founder-action-queue-mvp-v1"},
    }


def _execution_approval_action(state: SinoBrainSessionDB, task: TaskAssetDB, now: str) -> dict:
    return {
        "action_id": f"execution-approval:{task.id}",
        "action_type": "EXECUTION_APPROVAL",
        "type": "EXECUTION_APPROVAL",
        "title": "批准执行",
        "summary": task.title,
        "risk_level": "HIGH",
        "risk": "high",
        "status": "pending",
        "conversation_id": task.conversation_id,
        "project_id": state.project_id,
        "source_type": "task_asset",
        "source_id": task.id,
        "object_id": dict((task.scope or {}).get("founder_object_bridge") or {}).get("source_founder_object_id"),
        "task_id": task.id,
        "execution_id": None,
        "created_at": now,
        "updated_at": now,
        "decision": None,
        "decided_at": None,
        "context": {"approval_status": task.approval_status, "execution_status": task.execution_status},
        "reason": "task_asset_requires_execution_approval",
        "metadata": {"queue_schema": "founder-action-queue-mvp-v1"},
    }


def _execution_start_action(state: SinoBrainSessionDB, task: TaskAssetDB, now: str) -> dict:
    return {
        "action_id": f"execution-start:{task.id}",
        "action_type": "EXECUTION_START",
        "type": "EXECUTION_START",
        "title": "开始执行",
        "summary": task.title,
        "risk_level": "HIGH",
        "risk": "high",
        "status": "pending",
        "conversation_id": task.conversation_id,
        "project_id": state.project_id,
        "source_type": "task_asset",
        "source_id": task.id,
        "object_id": dict((task.scope or {}).get("founder_object_bridge") or {}).get("source_founder_object_id"),
        "task_id": task.id,
        "execution_id": None,
        "created_at": now,
        "updated_at": now,
        "decision": None,
        "decided_at": None,
        "context": {"approval_status": task.approval_status, "execution_status": task.execution_status},
        "reason": "approved_task_asset_waiting_for_explicit_start",
        "metadata": {"queue_schema": "founder-action-queue-mvp-v1"},
    }


def sync_founder_action_queue(conversation_id: str) -> list[dict]:
    """Synchronize MVP queue items from canonical lifecycle state.

    The queue is a durable pending-decision projection. FounderObject,
    TaskAsset and ExecutionSession remain the business source of truth.
    """
    now = _now()
    with SessionLocal() as session:
        state = session.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return []
        discovery = dict(state.discovery or {})
        existing = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
        active: dict[tuple[str | None, str | None, str | None], dict] = {}
        objects = list(session.scalars(select(FounderObjectDB).where(
            FounderObjectDB.source_conversation_id == conversation_id,
            FounderObjectDB.status != "archived",
        )))
        tasks = list(session.scalars(select(TaskAssetDB).where(
            TaskAssetDB.conversation_id == conversation_id,
            TaskAssetDB.system_id == "founder_ai",
        )))
        for record in objects:
            if record.status == "draft":
                item = _object_action(state, record, now)
                active[_source_key(item)] = item
        for task in tasks:
            if task.approval_status == "pending" and task.execution_status == "not_started":
                item = _execution_approval_action(state, task, now)
                active[_source_key(item)] = item
            elif task.approval_status == "approved" and task.execution_status == "not_started" and not _task_execution_id(task):
                item = _execution_start_action(state, task, now)
                active[_source_key(item)] = item
        resolved = []
        for item in existing:
            action_type = item.get("action_type") or item.get("type")
            if action_type not in MVP_ACTION_TYPES:
                resolved.append(item)
                continue
            key = _source_key(item)
            if key in active:
                next_item = active.pop(key)
                next_item["created_at"] = item.get("created_at") or next_item["created_at"]
                resolved.append(next_item)
            else:
                item.update({
                    "action_type": action_type,
                    "type": action_type,
                    "status": "completed",
                    "updated_at": now,
                    "decided_at": item.get("decided_at") or now,
                    "decision": item.get("decision") or "source_resolved",
                })
                resolved.append(item)
        resolved.extend(active.values())
        discovery["founder_action_queue"] = resolved
        discovery["founder_action_required"] = any(item.get("status") == "pending" for item in resolved)
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
        return resolved


def list_founder_action_queue(conversation_id: str | None = None) -> list[dict]:
    """Return pending Founder queue items for one conversation or all conversations."""
    with SessionLocal() as session:
        query = select(SinoBrainSessionDB.conversation_id)
        if conversation_id:
            query = query.where(SinoBrainSessionDB.conversation_id == conversation_id)
        conversation_ids = list(session.scalars(query))
    items: list[dict] = []
    for item_conversation_id in conversation_ids:
        items.extend(sync_founder_action_queue(item_conversation_id))
    return [item for item in items if item.get("status") == "pending"]
