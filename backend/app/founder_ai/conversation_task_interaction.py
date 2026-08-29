"""Conversation-first execution intent and durable Founder-readable event projection."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationAttachmentDB, ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import get_execution_session, save_execution_session


EXECUTION_INTENT = re.compile(r"(?:^|[，。,.!！\s])(?:可以了[，,\s]*)?(?:直接执行|立即执行|立刻执行|确认执行|执行吧|开始执行|按(?:这个|此|上述)方案做|就这样做|可以[，,\s]*开始|下一步[，,\s]*做吧|执行)(?:[。.!！\s]|$)", re.I)
STOP_INTENT = re.compile(r"(?:停止任务|先停下来|不要继续了|停止执行|先停止)")
NON_EXECUTION = ("这个思路不错", "我理解了", "有道理", "可以讨论", "这个方向可以", "我再想想", "先这样", "继续聊", "为什么")
EXECUTE_CONTROLS = {"执行", "立即执行", "立刻执行", "确认执行", "开始执行", "执行吧"}
CONTINUE_CONTROLS = {"继续", "继续执行"}
STOP_CONTROLS = {"停止", "暂停", "停止执行", "暂停执行", "停止任务"}


def _normalized_control(text: str) -> str:
    return re.sub(r"[，。,.!！?？\s]+", "", str(text or "")).casefold()


def current_conversation_task_context(conversation_id: str, *, discovery: dict | None = None) -> dict:
    """Return the one persisted candidate/task/execution currently owned by this conversation."""
    if discovery is None:
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            discovery = dict(state.discovery or {}) if state else {}
    else:
        discovery = dict(discovery)
    route = dict(discovery.get("task_complexity_route") or {})
    execution = dict(route.get("autonomous_execution") or {})
    candidate = dict(discovery.get("task_candidate") or {})
    if not candidate:
        candidate = dict((discovery.get("conversation_core") or {}).get("task_candidate") or {})
    status = str(route.get("execution_status") or execution.get("dispatch_status") or "")
    active = bool(execution.get("execution_session_id") and status not in {"completed", "cancelled", "rejected", "failed"})
    terminal = status in {"completed", "cancelled", "rejected", "failed"}
    if candidate.get("status") == "confirmed" and candidate.get("task_id") and terminal:
        candidate = {}
    if not candidate and not active:
        with SessionLocal() as db:
            task = db.scalar(select(TaskAssetDB).where(
                TaskAssetDB.conversation_id == conversation_id,
                TaskAssetDB.status.notin_(["completed", "failed", "cancelled", "superseded"]),
            ).order_by(TaskAssetDB.updated_at.desc()).limit(1))
        if task is not None:
            candidate = {
                "title": task.title, "goal": task.description or task.title, "task_id": task.id,
                "status": task.status, "scope": dict(task.scope or {}), "source": "canonical_task_asset",
            }
    return {
        "candidate": candidate or None,
        "route": route,
        "task_id": execution.get("task_id") or candidate.get("task_id"),
        "execution_id": execution.get("execution_session_id") or candidate.get("execution_id"),
        "execution_status": status or None,
        "active_execution": active,
    }


def bind_task_candidate_execution(conversation_id: str, route: dict) -> None:
    """Bind a directly-dispatched candidate to its canonical runtime lineage."""
    execution = dict(route.get("autonomous_execution") or {})
    if not execution.get("execution_session_id"):
        return
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        candidate = dict(discovery.get("task_candidate") or {})
        if not candidate:
            return
        candidate.update({
            "status": "confirmed", "task_id": execution.get("task_id"),
            "execution_id": execution.get("execution_session_id"),
            "execution_package_id": execution.get("execution_package_id"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        discovery["task_candidate"] = candidate
        discovery["task_candidates"] = [candidate if item.get("candidate_id") == candidate.get("candidate_id") else item
                                          for item in discovery.get("task_candidates") or []]
        discovery["focused_task_id"] = candidate.get("task_id")
        state.discovery = discovery
        state.updated_at = datetime.now(timezone.utc)
        db.commit()


def route_conversation_message(conversation_id: str, text: str, *, discovery: dict | None = None) -> dict:
    """Resolve deterministic execution controls before ordinary LLM conversation reasoning."""
    control = _normalized_control(text)
    context = current_conversation_task_context(conversation_id, discovery=discovery)
    if control in EXECUTE_CONTROLS:
        return {"intent": "EXECUTE_CURRENT_TASK" if context.get("candidate") or context.get("execution_id") else "DISCUSSION", "control_command": True, **context}
    if control in CONTINUE_CONTROLS and (context.get("candidate") or context.get("execution_id")):
        return {"intent": "CONTINUE_CURRENT_TASK", "control_command": True, **context}
    if control in STOP_CONTROLS and context.get("execution_id"):
        return {"intent": "STOP_CURRENT_TASK", "control_command": True, **context}
    return {"intent": "DISCUSSION", "control_command": control in EXECUTE_CONTROLS | CONTINUE_CONTROLS | STOP_CONTROLS, **context}


def execution_state_reply(route: dict) -> str:
    """Project Founder-visible execution narration exclusively from durable runtime identity/state."""
    execution = dict(route.get("autonomous_execution") or {})
    if not execution.get("execution_session_id"):
        return "任务已经准备好，等待进入执行。"
    status = str(route.get("execution_status") or execution.get("dispatch_status") or "queued")
    if status in {"queued", "pending", "inspecting"}:
        return "任务已进入队列。"
    if status in {"testing", "verifying", "verification"}:
        return "代码修改完成，正在验证。"
    if status == "completed":
        return "任务已完成并通过验证。"
    if status in {"blocked", "failed", "verification_failed"}:
        return "任务已停止，执行中心已记录当前阻塞原因。"
    return "已开始执行。"


def has_explicit_execution_intent(text: str) -> bool:
    value = (text or "").strip()
    return bool(value and value not in NON_EXECUTION and EXECUTION_INTENT.search(value))


def has_stop_intent(text: str) -> bool:
    return bool(STOP_INTENT.search((text or "").strip()))


def persist_task_understanding(conversation_id: str, goal: str, route: dict) -> None:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        previous = dict(discovery.get("pending_task_understanding") or {})
        discussion_turns = list(previous.get("discussion_turns") or [])
        if goal.strip() and (not discussion_turns or discussion_turns[-1] != goal.strip()):
            discussion_turns.append(goal.strip())
        discovery["pending_task_understanding"] = {
            "goal": goal.strip(), "route": dict(route), "status": "discussion",
            "discussion_turns": discussion_turns[-12:],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()


def pending_task_understanding(conversation_id: str) -> dict | None:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None:
            return None
        return dict((state.discovery or {}).get("pending_task_understanding") or {}) or None


def persist_task_candidate(conversation_id: str, candidate: dict, *, source_message_id: str | None = None) -> dict:
    """Persist a mature discussion outcome and its Founder confirmation action atomically."""
    from app.founder_ai.conversation_core import task_candidate_is_complete
    if not task_candidate_is_complete(candidate):
        raise ValueError("task_candidate_incomplete")
    goal = str(candidate.get("goal") or "").strip()
    if not goal:
        raise ValueError("task_candidate_goal_required")
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        existing = dict(discovery.get("task_candidate") or {})
        candidates = [dict(item) for item in discovery.get("task_candidates") or [] if isinstance(item, dict)]
        if existing and not any(item.get("candidate_id") == existing.get("candidate_id") for item in candidates):
            candidates.append(existing)
        matching = next((item for item in candidates
                         if item.get("status") in {"pending_founder_confirmation", "needs_revision", "discussion_continues"}
                         and item.get("goal") == goal), None)
        if matching:
            existing = matching
            candidate_id = existing["candidate_id"]
            created_at = existing.get("created_at") or now.isoformat()
        else:
            candidate_id = f"task-candidate-{uuid4().hex[:20]}"
            created_at = now.isoformat()
        record = {
            "candidate_id": candidate_id, "conversation_id": conversation_id,
            "title": str(candidate.get("title") or goal[:120]).strip(), "goal": goal,
            "scope": candidate.get("scope") or [], "constraints": list(candidate.get("constraints") or []),
            "acceptance_criteria": list(candidate.get("acceptance_criteria") or []),
            "confirmed_decisions": list(candidate.get("confirmed_decisions") or []),
            "dependencies": list(candidate.get("dependencies") or []), "risks": list(candidate.get("risks") or []),
            "task_type": candidate.get("task_type"), "source_message_id": source_message_id,
            "derivation": dict(candidate.get("derivation") or {}),
            "created_at": created_at, "updated_at": now.isoformat(), "status": "pending_founder_confirmation",
            "task_id": existing.get("task_id"), "execution_id": existing.get("execution_id"),
            "execution_package_id": existing.get("execution_package_id"),
        }
        action_id = f"task-confirmation:{candidate_id}"
        queue = [dict(item) for item in discovery.get("founder_action_queue") or []
                 if not (item.get("type") == "TASK_CONFIRMATION" and item.get("candidate_id") == candidate_id)]
        queue.append({
            "action_id": action_id, "conversation_id": conversation_id, "task_id": None,
            "candidate_id": candidate_id, "type": "TASK_CONFIRMATION", "status": "pending",
            "title": record["title"], "summary": record["goal"], "required_input": "CONFIRM_TASK_CANDIDATE",
            "task_candidate": record, "created_at": created_at, "resolved_at": None, "resolution": None,
        })
        discovery["task_candidate"] = record
        discovery["task_candidates"] = [item for item in candidates if item.get("candidate_id") != candidate_id] + [record]
        if record["derivation"].get("source") == "conversation_llm":
            discovery["task_candidate_reconciliation"] = {
                "status": "completed", "candidate_id": candidate_id,
                "derivation_version": record["derivation"].get("derivation_version"),
                "completed_at": now.isoformat(),
            }
        discovery["task_projection"] = {"status": "pending_founder_confirmation", "candidate_id": candidate_id,
                                         "title": record["title"], "founder_action_required": True}
        discovery["founder_action_queue"] = queue
        discovery["focused_task_id"] = f"candidate:{candidate_id}"
        discovery["founder_action_required"] = True
        state.discovery = discovery; state.updated_at = now; db.commit()
        return record


def derive_and_persist_task_candidate(conversation_id: str, *, source_message_id: str | None = None,
                                      generator=None) -> dict:
    """Canonical Discussion -> Candidate transition, entirely sourced from Conversation Model output."""
    from app.founder_ai.conversation_core import derive_task_candidate_from_conversation
    candidate = derive_task_candidate_from_conversation(conversation_id, generator=generator)
    return persist_task_candidate(conversation_id, candidate, source_message_id=source_message_id)


def reconcile_discussion_task_candidate(conversation_id: str, *, generator=None) -> dict | None:
    """Repair an older LLM decision that announced a candidate before the canonical transition existed."""
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {})
        existing = dict(discovery.get("task_candidate") or {})
        if existing.get("status") in {"pending_founder_confirmation", "needs_revision", "discussion_continues", "confirmed"}:
            return existing
        core = dict(discovery.get("conversation_core") or {})
        cleanup_baseline = dict(discovery.get("task_runtime_cleanup_baseline") or {})
        if cleanup_baseline and cleanup_baseline.get("conversation_core_updated_at") == core.get("updated_at"):
            return None
        updates = dict(core.get("context_updates") or {})
        mature = bool(core.get("conversation_state") in {"task_candidate_ready", "task_established"}
                      or updates.get("task_created") is True)
        if not mature:
            return None
        core_version = str(core.get("updated_at") or "")
        attempt = dict(discovery.get("task_candidate_reconciliation") or {})
        derivation_version = "conversation-task-candidate-v6"
        if (attempt.get("source_decision_updated_at") == core_version
                and attempt.get("derivation_version") == derivation_version
                and attempt.get("status") in {"deriving", "not_ready"}):
            return None
        discovery["task_candidate_reconciliation"] = {
            "status": "deriving", "source_decision_updated_at": core_version,
            "derivation_version": derivation_version,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
    try:
        return derive_and_persist_task_candidate(conversation_id, generator=generator)
    except ValueError as error:
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(
                SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {})
            discovery["task_candidate_reconciliation"] = {
                "status": "not_ready", "source_decision_updated_at": core_version,
                "derivation_version": derivation_version,
                "failure": str(error),
                "attempted_at": datetime.now(timezone.utc).isoformat(),
            }
            state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
        return None


def decide_task_candidate(conversation_id: str, candidate_id: str, action: str, *, dispatch=None) -> dict:
    """Resolve one candidate exactly once; only confirmation may create an executable task."""
    if action not in {"confirm", "modify", "continue_discussion"}:
        raise ValueError("invalid_task_confirmation_action")
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); candidate = dict(discovery.get("task_candidate") or {})
        if candidate.get("candidate_id") != candidate_id:
            candidate = next((dict(item) for item in discovery.get("task_candidates") or []
                              if item.get("candidate_id") == candidate_id), {})
        if candidate.get("candidate_id") != candidate_id:
            raise ValueError("task_candidate_not_found")
        existing_route = dict(discovery.get("task_complexity_route") or {})
        existing_execution = dict(existing_route.get("autonomous_execution") or {})
        if candidate.get("status") == "confirmed" and existing_execution.get("execution_session_id"):
            execution_id = existing_execution["execution_session_id"]
            record = get_execution_session(execution_id)
            if record is not None and record[0].status == "paused":
                from app.founder_ai.execution_worker import resume_execution
                resume_execution(execution_id)
                existing_execution["dispatch_status"] = "queued"
                existing_route["execution_status"] = "queued"
                existing_route["autonomous_execution"] = existing_execution
                discovery["task_complexity_route"] = existing_route
                state.discovery = discovery
                state.updated_at = now
                db.commit()
            return {"status": "confirmed", "task_candidate": candidate, "route": existing_route}
        queue = [dict(item) for item in discovery.get("founder_action_queue") or []]
        item = next((entry for entry in queue if entry.get("type") == "TASK_CONFIRMATION" and entry.get("candidate_id") == candidate_id), None)
        reconciling_confirmed = action == "confirm" and (
            candidate.get("status") in {"confirmed", "ready_to_execute"}
            or (item or {}).get("status") in {"confirmed", "ready_to_execute"}
        )
        if not reconciling_confirmed and (item is None or item.get("status") != "pending"):
            raise ValueError("task_confirmation_not_pending")
        if action != "confirm":
            candidate["status"] = "needs_revision" if action == "modify" else "discussion_continues"
            candidate["updated_at"] = now.isoformat(); item.update({"status": candidate["status"], "resolution": action, "resolved_at": now.isoformat()})
            discovery["task_candidate"] = candidate; discovery["founder_action_queue"] = queue
            discovery["task_candidates"] = [candidate if item.get("candidate_id") == candidate_id else item
                                              for item in discovery.get("task_candidates") or []]
            discovery["task_projection"] = {"status": candidate["status"], "candidate_id": candidate_id, "title": candidate["title"], "founder_action_required": False}
            discovery["founder_action_required"] = False; state.discovery = discovery; state.updated_at = now; db.commit()
            return {"status": candidate["status"], "task_candidate": candidate, "route": discovery.get("task_complexity_route") or {}}
        candidate["status"] = "confirming"; candidate["updated_at"] = now.isoformat()
        discovery["task_candidate"] = candidate; state.discovery = discovery; state.updated_at = now; db.commit()
    try:
        if dispatch is None:
            from app.founder_ai.task_complexity_router import route_task_complexity
            route = route_task_complexity(candidate["goal"])
            route["discussion_context"] = [candidate["goal"], str(candidate.get("scope") or "")]
            route["founder_acceptance_criteria"] = list(candidate.get("acceptance_criteria") or [])
            route["founder_constraints"] = list(candidate.get("constraints") or [])
            route["confirmed_decisions"] = list(candidate.get("confirmed_decisions") or [])
            source_message_id = candidate.get("source_message_id")
            if route.get("classification") == "QUICK_FIX":
                from app.founder_ai.quick_fix_progression import begin_quick_fix
                route = begin_quick_fix(route)
                persist_task_understanding(conversation_id, candidate["goal"], route)
                with SessionLocal() as db:
                    state = db.scalar(select(SinoBrainSessionDB).where(
                        SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
                    discovery = dict(state.discovery or {}); discovery["task_complexity_route"] = route
                    state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
                from app.founder_ai.quick_fix_execution import dispatch_quick_fix
                route = dispatch_quick_fix(conversation_id=conversation_id, goal=candidate["goal"],
                                           source_message_id=source_message_id)
            elif route.get("classification") == "STANDARD_TASK":
                from app.founder_ai.standard_task_execution import begin_standard_task, dispatch_standard_task
                begin_standard_task(conversation_id=conversation_id, goal=candidate["goal"], route=route,
                                    source_message_id=source_message_id)
                route = dispatch_standard_task(conversation_id=conversation_id, goal=candidate["goal"],
                                               source_message_id=source_message_id)
            elif route.get("classification") == "STRATEGIC_TASK":
                from app.founder_ai.strategic_task import reconcile_architecture_task
                route = reconcile_architecture_task(conversation_id=conversation_id, goal=candidate["goal"])
        else:
            route = dispatch(conversation_id, candidate)
    except Exception:
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {}); restored = dict(discovery.get("task_candidate") or {})
            restored["status"] = "pending_founder_confirmation"; discovery["task_candidate"] = restored
            discovery["task_candidates"] = [restored if item.get("candidate_id") == candidate_id else item
                                              for item in discovery.get("task_candidates") or []]
            state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
        raise
    execution = dict(route.get("autonomous_execution") or {})
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        discovery = dict(state.discovery or {}); confirmed = dict(discovery.get("task_candidate") or {})
        lifecycle_status = "confirmed" if execution.get("execution_session_id") else "ready_to_execute"
        confirmed.update({"status": lifecycle_status, "task_id": execution.get("task_id") or confirmed.get("task_id"),
                          "execution_id": execution.get("execution_session_id"),
                          "execution_package_id": execution.get("execution_package_id"), "updated_at": datetime.now(timezone.utc).isoformat()})
        queue = [dict(entry) for entry in discovery.get("founder_action_queue") or []]
        for entry in queue:
            if entry.get("type") == "TASK_CONFIRMATION" and entry.get("candidate_id") == candidate_id:
                entry.update({"status": lifecycle_status, "task_id": confirmed.get("task_id"), "resolution": "confirm", "resolved_at": datetime.now(timezone.utc).isoformat()})
        discovery["task_candidate"] = confirmed; discovery["founder_action_queue"] = queue
        discovery["task_complexity_route"] = route
        discovery["task_candidates"] = [confirmed if item.get("candidate_id") == candidate_id else item
                                          for item in discovery.get("task_candidates") or []]
        discovery["focused_task_id"] = confirmed.get("task_id") or f"candidate:{candidate_id}"
        discovery["task_projection"] = {"status": lifecycle_status, "candidate_id": candidate_id, "task_id": confirmed.get("task_id"),
                                         "title": confirmed["title"], "founder_action_required": False}
        discovery["founder_action_required"] = False; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()
        return {"status": lifecycle_status, "task_candidate": confirmed, "route": route}


def _message_value(message) -> dict:
    if isinstance(message, dict):
        return message
    return {"message_id": message.id, "role": message.role, "content": message.content,
            "message_type": message.message_type, "intent": message.intent,
            "grounding": dict(message.grounding or {}), "created_at": message.created_at.isoformat()}


def conversation_understanding_snapshot(messages: list, pending: dict | None = None) -> dict:
    """Build current semantic context before asking Founder to repeat information."""
    values = [_message_value(item) for item in messages]
    intent_indexes = [index for index, item in enumerate(values)
                      if item.get("role") == "founder" and has_explicit_execution_intent(item.get("content", ""))]
    intent_index = intent_indexes[-1] if intent_indexes else len(values)
    context_values = values[:intent_index]
    founder_turns = [item["content"].strip() for item in context_values
                     if item.get("role") == "founder" and item.get("content", "").strip()]
    sino_turns = [item["content"].strip() for item in context_values
                  if item.get("role") == "assistant" and item.get("content", "").strip()]
    semantic_text = "\n".join(founder_turns + sino_turns)
    role_patterns = {
        "left": r"(?:左侧|左栏|左边)\s*[：:]?\s*([^\n，。；;]+)",
        "center": r"(?:中间|中栏|中央)\s*[：:]?\s*([^\n，。；;]+)",
        "right": r"(?:右侧|右栏|右边)\s*[：:]?\s*([^\n，。；;]+)",
    }
    column_roles = {}
    for key, pattern in role_patterns.items():
        matches = re.findall(pattern, semantic_text, re.I)
        if matches: column_roles[key] = matches[-1].strip()
    confirmed_decisions = []
    if len(column_roles) == 3:
        confirmed_decisions.append({"type": "three_column_responsibilities", **column_roles})
    route = dict((pending or {}).get("route") or {})
    context_sufficient = bool(not route.get("clarification_required") or len(column_roles) == 3)
    goal = (pending or {}).get("goal") or (founder_turns[-1] if founder_turns else "")
    attachments = [ref for item in context_values for ref in (item.get("attachment_refs") or [])]
    return {
        "goal": goal,
        "scope": list((route.get("quick_fix_contract") or route.get("standard_task_contract") or {}).get("allowed_files_or_paths") or []),
        "confirmed_decisions": confirmed_decisions,
        "constraints": list((route.get("quick_fix_contract") or route.get("standard_task_contract") or {}).get("constraints") or []),
        "acceptance_criteria": list((route.get("standard_task_contract") or {}).get("acceptance_criteria") or []),
        "open_questions": [] if context_sufficient else ["三栏内容与职责分配尚未在当前 Conversation 中确认。"],
        "rejected_interpretations": [], "relevant_artifacts": attachments,
        "discussion_turns": founder_turns + sino_turns,
        "source_message_ids": [item.get("message_id") for item in context_values if item.get("message_id")],
        "context_sufficient": context_sufficient, "explicit_execution_intent": bool(intent_indexes),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def reconcile_conversation_understanding(conversation_id: str, *, execution_text: str | None = None) -> dict:
    """Persist execution intent and a consistent clarification action when context is incomplete."""
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(
            SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None: raise LookupError("Sino Brain state not found")
        messages = db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at, ConversationMessageDB.id)).all()
        values = [_message_value(item) for item in messages]
        if execution_text and not any(item.get("role") == "founder" and has_explicit_execution_intent(item.get("content", "")) for item in values):
            values.append({"role": "founder", "content": execution_text, "created_at": now.isoformat()})
        discovery = dict(state.discovery or {}); pending = dict(discovery.get("pending_task_understanding") or {})
        snapshot = conversation_understanding_snapshot(values, pending)
        attachments = db.scalars(select(ConversationAttachmentDB).where(
            ConversationAttachmentDB.conversation_id == conversation_id).order_by(ConversationAttachmentDB.created_at)).all()
        snapshot["relevant_artifacts"] = [{"attachment_id": item.id, "attachment_type": item.attachment_type,
                                            "interpretation_status": (pending.get("route") or {}).get("evidence", {}).get("image_context_status", "not_present")}
                                           for item in attachments]
        if execution_text and has_explicit_execution_intent(execution_text): snapshot["explicit_execution_intent"] = True
        discovery["conversation_understanding_snapshot"] = snapshot
        previous_intent = dict(discovery.get("execution_intent") or {})
        persisted_source_text = execution_text or previous_intent.get("source_text") or next(
            (item.get("content") for item in reversed(values)
             if item.get("role") == "founder" and has_explicit_execution_intent(item.get("content", ""))), None)
        discovery["execution_intent"] = {
            "status": "pending" if snapshot["explicit_execution_intent"] else "not_requested",
            "intent": "EXECUTE_CURRENT_CONFIRMED_UNDERSTANDING", "source_text": persisted_source_text,
            "updated_at": now.isoformat(),
        }
        queue = [dict(item) for item in discovery.get("founder_action_queue") or []
                 if item.get("type") != "CLARIFICATION" or item.get("status") != "pending"]
        if snapshot["explicit_execution_intent"] and not snapshot["context_sufficient"]:
            question = (discovery.get("working_understanding") or {}).get("next_question") or ["请确认当前任务的关键范围与职责分配。"]
            if isinstance(question, list): question = question[0] if question else "请确认当前任务理解。"
            action = {
                "action_id": f"clarification-{conversation_id}", "conversation_id": conversation_id,
                "task_id": None, "type": "CLARIFICATION", "status": "pending",
                "title": "三栏职责需要确认" if "三列" in snapshot["goal"] or "3列" in snapshot["goal"] else "任务理解需要确认",
                "summary": question, "required_input": "CONFIRM_CURRENT_TASK_UNDERSTANDING",
                "current_understanding": snapshot, "created_at": now.isoformat(),
                "resolved_at": None, "resolution": None,
            }
            queue.append(action)
            discovery["clarification_state"] = {"status": "awaiting_founder_clarification", "clarification_required": True,
                                                   "founder_action_required": True, "action_id": action["action_id"]}
        else:
            discovery["clarification_state"] = {"status": "resolved", "clarification_required": False,
                                                   "founder_action_required": False}
        discovery["founder_action_queue"] = queue
        state.discovery = discovery; state.updated_at = now; db.commit()
        return {"snapshot": snapshot, "founder_action_queue": queue,
                "founder_action_required": any(item.get("status") == "pending" for item in queue),
                "clarification_required": not snapshot["context_sufficient"]}


def resolve_clarification(conversation_id: str, action: str) -> dict:
    if action not in {"confirm", "continue_discussion"}: raise ValueError("invalid_clarification_action")
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None: raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); queue = [dict(item) for item in discovery.get("founder_action_queue") or []]
        pending_action = next((item for item in queue if item.get("type") == "CLARIFICATION" and item.get("status") == "pending"), None)
        if pending_action is None: raise ValueError("clarification_action_not_pending")
        snapshot = dict(discovery.get("conversation_understanding_snapshot") or {})
        if action == "confirm" and not snapshot.get("confirmed_decisions"):
            raise ValueError("current_understanding_not_confirmable")
        pending_action.update({"status": "resolved" if action == "confirm" else "continued_discussion",
                               "resolved_at": now.isoformat(), "resolution": action})
        if action == "confirm": snapshot["context_sufficient"] = True; snapshot["open_questions"] = []
        discovery["conversation_understanding_snapshot"] = snapshot; discovery["founder_action_queue"] = queue
        discovery["clarification_state"] = {"status": "resolved" if action == "confirm" else "discussion",
                                               "clarification_required": False, "founder_action_required": False}
        if action == "continue_discussion":
            discovery["execution_intent"] = {**dict(discovery.get("execution_intent") or {}), "status": "paused_for_discussion", "updated_at": now.isoformat()}
        state.discovery = discovery; state.updated_at = now; db.commit()
        return {"action": pending_action, "snapshot": snapshot,
                "reuse_execution_intent": action == "confirm" and (discovery.get("execution_intent") or {}).get("status") == "pending"}


def task_understanding_reply(goal: str, route: dict) -> str:
    classification = route.get("classification")
    contract = route.get("quick_fix_contract") or {}
    target = contract.get("target_area") or "当前讨论涉及的范围"
    if route.get("clarification_required"):
        return "我已经理解了你想改善的方向，但目标范围或完成标准还不够唯一。我们可以继续讨论，我暂时不会创建任务或开始执行。"
    kind = "局部调整" if classification == "QUICK_FIX" else "开发任务" if classification == "STANDARD_TASK" else "架构议题"
    return (f"我理解你的意思是：这是一项{kind}，目标是“{goal.strip()}”。"
            f"本次主要围绕{target}，并保持你已经明确的约束；完成时会按当前讨论形成的验收标准验证。"
            "现在仍处于讨论阶段，不会创建执行任务。如果理解不完整，我们可以继续讨论；确认后请明确告诉我“执行吧”。")


EVENT_SEMANTICS = {
    "queued": "execution_started", "worker_started": "execution_started", "codex_started": "execution_started",
    "scope_verification_finished": "implementation_completed",
    "scope_correction_finished": "implementation_completed", "testing_started": "verification_started",
    "testing_finished": "verification_completed", "stall_detected": "technical_incident",
    "technical_resolution_started": "technical_incident", "technical_resolution_completed": "technical_incident_resolved",
    "technical_resolution_exhausted": "technical_incident_exhausted", "founder_stop_requested": "cancellation_started",
    "cancelled_by_founder": "cancelled", "completed": "execution_completed",
    "completion_invalidated": "completion_invalidated", "execution_reopened": "execution_reopened",
    "verification_fallback_finished": "verification_terminal",
}


def _production_implementation_completed(event: dict) -> bool:
    """A subprocess exit is not proof that an implementation exists or is in scope."""
    if event.get("event_name") not in {"scope_verification_finished", "scope_correction_finished"}:
        return False
    metadata = dict(event.get("metadata") or {})
    scope = dict(metadata.get("scope_verification") or {})
    if scope.get("status") != "SCOPE_PASS" or event.get("status") != "scope_passed":
        return False
    changed = list(scope.get("actual_changed_files") or [])
    return any(
        ".test." not in path and not path.startswith(("backend/tests/", "frontend/tests/", "docs/"))
        for path in changed
    )


def _event_semantic(event: dict) -> str | None:
    semantic = EVENT_SEMANTICS.get(event.get("event_name"))
    if semantic == "implementation_completed" and not _production_implementation_completed(event):
        return None
    return semantic


def _lifecycle_allows_semantic(route: dict, semantic: str) -> bool:
    """Executor completion is evidence, not canonical task completion."""
    if semantic not in {"verification_completed", "execution_completed"}:
        return True
    verification = dict((route.get("autonomous_execution") or {}).get("verification") or {})
    verified = verification.get("status") == "PASS"
    lifecycle_complete = route.get("current_step") == "complete" and route.get("execution_status") == "completed"
    return verified if semantic == "verification_completed" else verified and lifecycle_complete


def _append_projection(db, *, conversation_id: str, task_id: str | None, source_event_id: str, event_type: str, summary: str, created_at: str | None = None) -> bool:
    # JSON predicates differ between SQLite/PostgreSQL; bounded per-conversation scan is portable.
    messages = db.scalars(select(ConversationMessageDB).where(
        ConversationMessageDB.conversation_id == conversation_id,
        ConversationMessageDB.message_type == "execution_update",
    )).all()
    if any((item.grounding or {}).get("source_event_id") == source_event_id for item in messages):
        return False
    try:
        persisted_at = datetime.fromisoformat(created_at) if created_at else datetime.now(timezone.utc)
    except (TypeError, ValueError):
        persisted_at = datetime.now(timezone.utc)
    if persisted_at.tzinfo is None:
        persisted_at = persisted_at.replace(tzinfo=timezone.utc)
    db.add(ConversationMessageDB(
        conversation_id=conversation_id, role="assistant", content=summary,
        message_type="execution_update", intent="execution_progress",
        grounding={"event_id": source_event_id, "source_event_id": source_event_id, "task_id": task_id, "event_type": event_type, "visibility": "founder"},
        created_at=persisted_at,
    ))
    return True


def project_execution_events(conversation_id: str) -> int:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        route = dict((state.discovery or {}).get("task_complexity_route") or {}) if state else {}
        execution = dict(route.get("autonomous_execution") or {})
        execution_id = execution.get("execution_session_id")
        record = get_execution_session(execution_id) if execution_id else None
        task_id = execution.get("task_id") or (route.get("standard_task_contract") or route.get("quick_fix_contract") or {}).get("task_id")
        added = 0
        if record:
            session, _ = record
            existing = db.scalars(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id,
                ConversationMessageDB.message_type == "execution_update",
            )).all()
            projected_semantics = {(item.grounding or {}).get("event_type") for item in existing
                                   if (item.grounding or {}).get("task_id") == task_id}
            grouped = {}
            for event in session.events or []:
                semantic = _event_semantic(event)
                if semantic and semantic not in projected_semantics and _lifecycle_allows_semantic(route, semantic):
                    grouped.setdefault(semantic, []).append(event)
            from app.founder_ai.conversation_core import summarize_execution_events
            for semantic, events in grouped.items():
                summary = ((events[-1].get("metadata") or {}).get("founder_summary")
                           or summarize_execution_events(conversation_id, events))
                source = "semantic-events:" + ":".join(item["event_id"] for item in events)
                if summary and _append_projection(db, conversation_id=conversation_id, task_id=task_id,
                        source_event_id=source, event_type=semantic, summary=summary, created_at=events[-1].get("timestamp")):
                    added += 1
        resolution = dict(route.get("technical_resolution_contract") or {})
        if resolution:
            status = resolution.get("resolution_status")
            incident_id = resolution.get("technical_incident_id")
            incident_already_projected = bool(record and incident_id and any(
                item.get("event_name") in {"stall_detected", "technical_resolution_started", "technical_resolution_completed"}
                and (item.get("metadata") or {}).get("technical_incident_id") == incident_id
                for item in record[0].events or []
            ))
            source = f"technical-resolution:{incident_id or execution_id}:{status}:{resolution.get('attempt_count', 0)}"
            summary = None
            if not incident_already_projected:
                from app.founder_ai.conversation_core import summarize_execution_events
                summary = summarize_execution_events(conversation_id, [{"event_name": "technical_resolution", "status": status,
                    "issue_type": resolution.get("issue_type"), "attempt_count": resolution.get("attempt_count"), "retry_limit": resolution.get("retry_limit")}])
            if summary and not incident_already_projected and _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=source, event_type="technical_resolution", summary=summary): added += 1
        gate = dict(route.get("founder_gate_contract") or {})
        if gate and route.get("founder_gate_required"):
            source = f"founder-gate:{gate.get('gate_id') or gate.get('decision_id') or task_id}:pending"
            from app.founder_ai.conversation_core import summarize_execution_events
            summary = summarize_execution_events(conversation_id, [{"event_name": "founder_action_required", "reason": gate.get("reason"),
                "gate_type": gate.get("gate_type"), "scope": gate.get("scope"), "action_queue_location": "right_panel"}])
            if summary and _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=source, event_type="founder_action_required", summary=summary): added += 1
        visible = dict(route.get("visible_result") or {})
        if visible.get("verification_status") == "PASS":
            # Reconciliation can refresh verified_at, but one task has only one
            # semantic Founder-acceptance transition. Keep its idempotency key stable.
            source = f"visible-result:{task_id}:pass"
            from app.founder_ai.conversation_core import summarize_execution_events
            summary = summarize_execution_events(conversation_id, [{"event_name": "founder_acceptance_required", "verification_status": "PASS",
                "target_surface": visible.get("target_surface"), "action_queue_location": "right_panel"}])
            if summary and _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=source, event_type="founder_acceptance_required", summary=summary): added += 1
        if added:
            conversation = db.get(ConversationDB, conversation_id)
            if conversation: conversation.updated_at = datetime.now(timezone.utc)
            db.commit()
        return added


def record_runtime_intervention(conversation_id: str, content: str, route: dict) -> str:
    execution_id = (route.get("autonomous_execution") or {}).get("execution_session_id")
    record = get_execution_session(execution_id) if execution_id else None
    if not record:
        return "我已记录这条补充，会继续在当前 Conversation 中讨论。"
    session, package = record
    from app.founder_ai.execution_events import append_event
    append_event(session, "founder_delta_received", status=session.status, message="Founder runtime intervention received", metadata={"content": content[:500]})
    contract_key = "standard_task_contract" if route.get("classification") == "STANDARD_TASK" else "quick_fix_contract"
    contract = dict(route.get(contract_key) or {}); constraints = list(contract.get("constraints") or [])
    if "不要" in content or "范围" in content:
        constraints.append(content.strip()); contract["constraints"] = constraints; route[contract_key] = contract
        append_event(session, "delta_applied", status=session.status, message="Founder constraint applied to current execution scope")
        save_execution_session(session, package)
        with SessionLocal() as db:
            state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {}); discovery["task_complexity_route"] = route; state.discovery = discovery; db.commit()
        return "我已把这条要求作为当前任务的新约束，并会在不扩大范围的前提下继续；如需改变已确认边界，我会在右侧生成 Scope Change。"
    save_execution_session(session, package)
    resolution = dict(route.get("technical_resolution_contract") or {})
    if "为什么" in content and resolution:
        return f"当前异常是：{resolution.get('issue_type', '执行流程未正常闭环')}。Sino 正在按安全方案恢复，目前是第 {resolution.get('attempt_count', 0)}/{resolution.get('retry_limit', 3)} 次尝试，不需要你操作终端。"
    return "我已收到执行中的补充，并关联到当前任务；Sino 会继续在这个 Conversation 中同步关键进展。"


def accept_task_result(conversation_id: str) -> dict:
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None: raise LookupError("Sino Brain state not found")
        discovery = dict(state.discovery or {}); route = dict(discovery.get("task_complexity_route") or {})
        visible = dict(route.get("visible_result") or {})
        if visible.get("verification_status") != "PASS": raise ValueError("task_result_not_ready_for_acceptance")
        task_id = (route.get("autonomous_execution") or {}).get("task_id") or (route.get("standard_task_contract") or route.get("quick_fix_contract") or {}).get("task_id")
        acceptance = dict(route.get("founder_acceptance") or {})
        if acceptance.get("status") != "accepted":
            acceptance = {"status": "accepted", "accepted_by": "FOUNDER", "accepted_at": now.isoformat()}
            route["founder_acceptance"] = acceptance; route["closure_status"] = "closed"
            discovery["task_complexity_route"] = route; state.discovery = discovery; state.updated_at = now
            task = db.get(TaskAssetDB, task_id) if task_id else None
            if task:
                task.status = "closed"; task.result = {**dict(task.result or {}), "founder_acceptance": acceptance}
            _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=f"founder-acceptance:{task_id}", event_type="founder_acceptance", summary="收到，任务已验收并关闭。相关结果和 Learning 已保存。")
            conversation = db.get(ConversationDB, conversation_id)
            if conversation: conversation.updated_at = now
            db.commit()
        return acceptance


def project_founder_decision(conversation_id: str, *, source_id: str, action: str, subject: str) -> None:
    summaries = {
        "approve": f"已收到 Founder 批准。{subject}将按右侧确认的边界继续推进。",
        "reject": f"已收到 Founder 驳回。{subject}不会继续执行，相关证据已保留。",
        "request_revision": f"已收到修改方案请求。{subject}将根据 Founder 意见修订后再次等待决策。",
        "modify": f"授权边界正在修改，新的范围在 Founder 批准前不会执行。",
    }
    summary = summaries.get(action)
    if not summary: return
    with SessionLocal() as db:
        if _append_projection(db, conversation_id=conversation_id, task_id=None, source_event_id=f"founder-decision:{source_id}:{action}", event_type="founder_decision_received", summary=summary):
            conversation = db.get(ConversationDB, conversation_id)
            if conversation: conversation.updated_at = datetime.now(timezone.utc)
            db.commit()
