"""Conversation-first execution intent and durable Founder-readable event projection."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationAttachmentDB, ConversationMessageDB, SinoBrainSessionDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import get_execution_session, save_execution_session


EXECUTION_INTENT = re.compile(r"(?:^|[，。,.!！\s])(?:可以了[，,\s]*)?(?:执行吧|开始执行|按(?:这个|此|上述)方案做|就这样做|可以[，,\s]*开始|下一步[，,\s]*做吧|执行)(?:[。.!！\s]|$)", re.I)
STOP_INTENT = re.compile(r"(?:停止任务|先停下来|不要继续了|停止执行|先停止)")
NON_EXECUTION = ("这个思路不错", "我理解了", "有道理", "可以讨论", "这个方向可以", "我再想想", "先这样", "继续聊", "为什么")


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


EVENT_SUMMARIES = {
    "worker_started": "已开始执行。",
    "codex_started": "已完成执行准备，正在实施已确认的修改。",
    "codex_finished": "代码修改已经完成，正在进入验证。",
    "testing_started": "正在验证本次修改是否满足验收条件。",
    "testing_finished": "自动测试已经完成，正在核对可见结果与任务状态。",
    "stall_detected": "当前发现执行异常，正在自动恢复。这个问题暂时不需要你处理。",
    "technical_resolution_started": "已开始自动诊断并恢复原执行流程，暂时不需要 Founder 操作。",
    "technical_resolution_completed": "已恢复，继续验证。",
    "technical_resolution_exhausted": "自动恢复尝试已经用尽，需要 Founder 关注。详细证据已放在右侧。",
    "founder_stop_requested": "收到，正在安全停止当前任务。",
    "cancelled_by_founder": "任务已停止，执行证据已保留。",
    "completed": "任务已经完成，验证结果正在收口。",
}


def _append_projection(db, *, conversation_id: str, task_id: str | None, source_event_id: str, event_type: str, summary: str, created_at: str | None = None) -> bool:
    # JSON predicates differ between SQLite/PostgreSQL; bounded per-conversation scan is portable.
    messages = db.scalars(select(ConversationMessageDB).where(
        ConversationMessageDB.conversation_id == conversation_id,
        ConversationMessageDB.message_type == "execution_update",
    )).all()
    if any((item.grounding or {}).get("source_event_id") == source_event_id for item in messages):
        return False
    db.add(ConversationMessageDB(
        conversation_id=conversation_id, role="assistant", content=summary,
        message_type="execution_update", intent="execution_progress",
        grounding={"event_id": source_event_id, "source_event_id": source_event_id, "task_id": task_id, "event_type": event_type, "visibility": "founder"},
        **({"created_at": datetime.fromisoformat(created_at)} if created_at else {}),
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
            for event in session.events or []:
                summary = EVENT_SUMMARIES.get(event.get("event_name"))
                if summary and _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=event["event_id"], event_type=event["event_name"], summary=summary, created_at=event.get("timestamp")):
                    added += 1
        resolution = dict(route.get("technical_resolution_contract") or {})
        if resolution:
            status = resolution.get("resolution_status")
            source = f"technical-resolution:{execution_id}:{status}:{resolution.get('attempt_count', 0)}"
            summary = "当前发现执行异常，正在自动恢复。这个问题暂时不需要你处理。" if status in {"pending", "diagnosing", "retrying"} else "已恢复，继续验证。" if status == "resolved" else None
            if summary and _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=source, event_type="technical_resolution", summary=summary): added += 1
        gate = dict(route.get("founder_gate_contract") or {})
        if gate and route.get("founder_gate_required"):
            source = f"founder-gate:{gate.get('gate_id') or gate.get('decision_id') or task_id}:pending"
            summary = f"{gate.get('reason') or '下一步操作'}需要 Founder 批准，详细授权范围已经放在右侧。"
            if _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=source, event_type="founder_action_required", summary=summary): added += 1
        visible = dict(route.get("visible_result") or {})
        if visible.get("verification_status") == "PASS":
            source = f"visible-result:{task_id}:{visible.get('verified_at') or 'pass'}"
            if _append_projection(db, conversation_id=conversation_id, task_id=task_id, source_event_id=source, event_type="founder_acceptance_required", summary="任务已经完成，验证通过，等待你验收。详细结果已放在右侧。"): added += 1
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
