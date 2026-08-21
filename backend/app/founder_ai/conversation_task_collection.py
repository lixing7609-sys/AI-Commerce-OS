"""Canonical multi-task projection and focus for one Founder Conversation."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy import select

from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.conversation_core import configured_model_roles
from app.founder_ai.execution_registry import list_execution_sessions
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest


def _iso(value) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else value


def _candidate_ref(candidate: dict) -> str:
    return f"candidate:{candidate['candidate_id']}"


def build_conversation_tasks(conversation_id: str) -> dict:
    """Aggregate every candidate and Task Asset without changing their lifecycle state."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None:
            raise LookupError("Sino Brain state not found")
        task_assets = list(db.scalars(select(TaskAssetDB).where(
            TaskAssetDB.conversation_id == conversation_id,
            TaskAssetDB.system_id == "founder_ai").order_by(TaskAssetDB.created_at.asc())))
        discovery = dict(state.discovery or {})
    candidates = [dict(item) for item in discovery.get("task_candidates") or [] if isinstance(item, dict)]
    legacy = dict(discovery.get("task_candidate") or {})
    if legacy and not any(item.get("candidate_id") == legacy.get("candidate_id") for item in candidates):
        candidates.append(legacy)
    actions = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
    route = dict(discovery.get("task_complexity_route") or {})
    try:
        from app.founder_ai.execution_progress import build_execution_progress
        current_progress = build_execution_progress(route)
    except Exception:
        current_progress = None
    current_task_id = ((route.get("autonomous_execution") or {}).get("task_id")
                       or (route.get("standard_task_contract") or {}).get("task_id")
                       or (route.get("quick_fix_contract") or {}).get("task_id"))
    sessions = {item.task_asset_id: item for item in list_execution_sessions()}
    collection = []
    for candidate in candidates:
        if candidate.get("task_id"):
            continue
        ref = _candidate_ref(candidate)
        bound_actions = [item for item in actions if item.get("candidate_id") == candidate.get("candidate_id")]
        collection.append({
            "task_ref": ref, "task_id": None, "candidate_id": candidate.get("candidate_id"),
            "conversation_id": conversation_id, "project_id": state.project_id, "title": candidate.get("title"),
            "task_type": candidate.get("task_type") or "TASK_CANDIDATE", "status": candidate.get("status"),
            "created_at": candidate.get("created_at"), "updated_at": candidate.get("updated_at"),
            "founder_action_required": any(item.get("status") == "pending" for item in bound_actions),
            "progress": None, "execution_state": "not_started", "verification_state": "not_started",
            "closure_state": "open", "founder_action_id": next((item.get("action_id") for item in bound_actions if item.get("status") == "pending"), None),
            "founder_actions": bound_actions, "is_candidate": True, "is_confirmed": False,
            "is_executing": False, "is_completed": False, "is_archived": False,
            "details": candidate,
        })
    for task in task_assets:
        is_current = task.id == current_task_id
        session = sessions.get(task.id)
        status = (route.get("execution_status") if is_current else None) or (session.status if session else None) or task.execution_status or task.status
        progress = ((current_progress or {}).get("progress_percent") if is_current else None)
        bound_actions = [item for item in actions if item.get("task_id") == task.id]
        completed = status in {"completed", "accepted", "closed"} or task.status in {"completed", "accepted", "closed"}
        archived = task.status == "archived"
        collection.append({
            "task_ref": task.id, "task_id": task.id, "candidate_id": None,
            "conversation_id": conversation_id, "project_id": state.project_id, "title": task.title,
            "task_type": ((route.get("classification") if is_current else None) or (task.scope or {}).get("lane") or "TASK"),
            "status": status, "created_at": _iso(task.created_at), "updated_at": _iso(task.updated_at),
            "founder_action_required": any(item.get("status") == "pending" for item in bound_actions),
            "progress": progress, "execution_state": status,
            "verification_state": ((route.get("autonomous_execution") or {}).get("verification") or {}).get("status") if is_current else None,
            "closure_state": "closed" if completed else "open",
            "founder_action_id": next((item.get("action_id") for item in bound_actions if item.get("status") == "pending"), None),
            "founder_actions": bound_actions, "is_candidate": False, "is_confirmed": True,
            "is_executing": status in {"queued", "executing", "testing", "verification", "blocked", "self_healing", "retrying"},
            "is_completed": completed, "is_archived": archived,
            "details": {"description": task.description, "scope": task.scope or {}, "result": task.result,
                        "execution_id": session.id if session else None},
        })
    active = [item for item in collection if not item["is_archived"] and not item["is_completed"]]
    completed = [item for item in collection if item["is_completed"] and not item["is_archived"]]
    priority = lambda item: (0 if item["founder_action_required"] else 1 if item["is_executing"] else 2,
                             item.get("created_at") or "")
    active.sort(key=priority)
    completed.sort(key=lambda item: item.get("updated_at") or "", reverse=True)
    refs = {item["task_ref"] for item in collection}
    focused = discovery.get("focused_task_id") if discovery.get("focused_task_id") in refs else None
    if focused is None and active:
        focused = max(active, key=lambda item: item.get("updated_at") or item.get("created_at") or "")["task_ref"]
    return {"conversation_tasks": [*active, *completed], "active_tasks": active,
            "completed_tasks": completed, "focused_task_id": focused}


def focus_task(conversation_id: str, task_ref: str) -> dict:
    projection = build_conversation_tasks(conversation_id)
    item = next((item for item in projection["conversation_tasks"] if item["task_ref"] == task_ref), None)
    if item is None:
        raise ValueError("conversation_task_not_found")
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {})
        discovery["focused_task_id"] = task_ref
        discovery["task_focus"] = {"task_ref": task_ref, "focused_at": datetime.now(timezone.utc).isoformat()}
        previous_navigation = dict(discovery.get("task_navigation_resolution") or {})
        discovery["task_navigation_resolution"] = {
            **previous_navigation, "status": "focused", "task_ref": task_ref,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    return {**projection, "focused_task_id": task_ref, "focused_task": item}


def resolve_task_navigation(conversation_id: str, *, generator: Callable | None = None) -> dict:
    """Let the configured Conversation Model resolve a natural task reference against the collection."""
    projection = build_conversation_tasks(conversation_id)
    if len(projection["conversation_tasks"]) < 2:
        return {"status": "not_applicable", **projection}
    cached_status = None
    cached_task_ref = None
    conversation_context = []
    with SessionLocal() as db:
        latest = db.scalar(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id,
            ConversationMessageDB.role == "founder").order_by(ConversationMessageDB.created_at.desc()).limit(1))
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if latest is None or state is None:
            return {"status": "not_applicable", **projection}
        latest_message_id, latest_content = latest.id, latest.content
        recent = list(db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id).order_by(
            ConversationMessageDB.created_at.desc()).limit(12)))
        conversation_context = [{"role": item.role, "content": item.content} for item in reversed(recent)]
        discovery = dict(state.discovery or {})
        previous = dict(discovery.get("task_navigation_resolution") or {})
        if previous.get("source_message_id") == latest_message_id:
            cached_status, cached_task_ref = previous.get("status"), previous.get("task_ref")
        else:
            discovery["task_navigation_resolution"] = {"status": "resolving", "source_message_id": latest_message_id}
            state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    if cached_status:
        if cached_status == "focused" and cached_task_ref in {item["task_ref"] for item in projection["conversation_tasks"]} and cached_task_ref != projection.get("focused_task_id"):
            focus_task(conversation_id, cached_task_ref)
        return {"status": cached_status, **build_conversation_tasks(conversation_id)}
    roles = configured_model_roles()
    prompt = """Determine whether the latest Founder message asks to focus or inspect one existing task. Resolve semantically using titles, ordering, recent reference, and conversation context; do not create or modify tasks. Return JSON: navigation_intent (focus, ambiguous, or none), task_ref, ambiguous_task_refs. task_ref must be one supplied task_ref."""
    payload = None
    for role in ("conversation", "fallback"):
        runtime = roles.get(role)
        if runtime is None:
            continue
        try:
            compact = [{"task_ref": item["task_ref"], "title": item["title"], "status": item["status"]}
                       for item in projection["conversation_tasks"]]
            if generator:
                payload = generator(latest_content, compact, runtime)
            else:
                response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
                    system_prompt=prompt,
                    user_prompt=json.dumps({"latest_founder_message": latest_content,
                                            "recent_conversation_context": conversation_context,
                                            "tasks": compact}, ensure_ascii=False),
                    temperature=.1, max_tokens=300, response_format="json",
                    metadata={"runtime_role": "sino_conversation", "purpose": "task_navigation"}))
                payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            break
        except Exception:
            continue
    intent = str((payload or {}).get("navigation_intent") or "none").lower()
    task_ref = str((payload or {}).get("task_ref") or "")
    refs = {item["task_ref"] for item in projection["conversation_tasks"]}
    status = "no_navigation"
    if intent == "focus" and task_ref in refs:
        focus_task(conversation_id, task_ref); status = "focused"
    elif intent == "ambiguous":
        status = "ambiguous"
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {})
        discovery["task_navigation_resolution"] = {
            "status": status, "source_message_id": latest_message_id,
            "task_ref": task_ref if status == "focused" else None,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    return {"status": status, **build_conversation_tasks(conversation_id)}
