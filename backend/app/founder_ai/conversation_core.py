"""LLM-first Founder conversation reasoning with deterministic action boundaries."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationAttachmentDB, ConversationMessageDB, SecretaryDigestDB, SinoBrainSessionDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.model_center.service import resolve_runtime_config
from app.database.db import SessionLocal
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest

SEMANTIC_INTENTS = {
    "conversation", "execute_current_task", "stop_current_task", "runtime_intervention",
    "founder_decision", "founder_authorization", "founder_acceptance",
}

MAX_RECENT_CONVERSATION_MESSAGES = 32


def select_relevant_history(messages: list, source_message_ids: set[str] | None = None) -> list:
    """Keep recent dialogue plus explicitly referenced older evidence, without dumping all history."""
    source_message_ids = source_message_ids or set()
    recent = messages[-MAX_RECENT_CONVERSATION_MESSAGES:]
    selected_ids = {item.id for item in recent}
    older_referenced = [item for item in messages[:-MAX_RECENT_CONVERSATION_MESSAGES]
                        if item.id in source_message_ids and item.id not in selected_ids]
    return older_referenced + recent


def current_system_capabilities_context(*, tasks: list, assets: list, discovery: dict) -> dict:
    """Project real persisted system evidence; do not maintain a parallel feature checklist."""
    status_counts = {}
    type_counts = {}
    for item in assets:
        status_counts[item.status] = status_counts.get(item.status, 0) + 1
        type_counts[item.asset_type] = type_counts.get(item.asset_type, 0) + 1
    try:
        from app.founder_ai.execution_registry import list_execution_sessions
        executions = sorted(list_execution_sessions(), key=lambda item: str(item.updated_at or item.created_at or ""), reverse=True)[:20]
    except Exception:
        executions = []
    event_types = sorted({event.get("event_name") for item in executions for event in (item.events or []) if event.get("event_name")})
    try:
        from app.founder_ai.system_builder import ApplicationRegistry
        applications = [{"key": item.key, "name": item.name, "status": item.status} for item in ApplicationRegistry().list()]
    except Exception:
        applications = []
    return {
        "source": "persisted_system_state",
        "applications": applications,
        "recent_tasks": [{"task_id": item.id, "title": item.title, "status": item.status,
                          "execution_status": item.execution_status} for item in tasks[:12]],
        "capability_repository": {"total": len(assets), "by_status": status_counts, "by_type": type_counts,
                                  "ready_examples": [item.name for item in assets if item.status == "ready"][:8]},
        "execution_runtime": {"recent_count": len(executions), "statuses": sorted({item.status for item in executions}),
                              "observed_event_types": event_types},
        "current_conversation_features": sorted(key for key, value in discovery.items() if value not in (None, {}, [], False)),
    }


def configured_model_roles() -> dict:
    """Resolve model abilities without binding Sino identity or state to a provider."""
    def resolve_role(role: str):
        try:
            return resolve_runtime_config(role=role)
        except Exception:
            return None

    roles = {
        "conversation": resolve_role("sino_conversation"),
        "reasoning_strategy": resolve_role("deep_thinking"),
        "execution": resolve_role("code_execution"),
        "vision": None,
        "fallback": None,
        "executor": "codex",
    }
    try:
        from app.core.model_center.capability_registry import resolve_model_route
        vision = resolve_model_route("VISION_UNDERSTANDING")
        text = resolve_model_route("TEXT_REASONING")
        if vision:
            roles["vision"] = resolve_runtime_config(provider_key=vision[0]["provider_id"], model=vision[0]["model_id"])
        primary = roles["conversation"]
        fallback = next((item for item in text if not primary or (item["provider_id"], item["model_id"]) != (primary.provider_key, primary.model)), None)
        if fallback:
            roles["fallback"] = resolve_runtime_config(provider_key=fallback["provider_id"], model=fallback["model_id"])
    except Exception:
        pass
    return roles


def build_conversation_context(conversation_id: str, current_message: str, *, interaction_context: dict | None = None) -> dict:
    with SessionLocal() as db:
        conversation = db.get(ConversationDB, conversation_id)
        if conversation is None:
            raise LookupError("Founder AI conversation not found")
        all_messages = list(db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at)))
        brain = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        digest = db.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation_id))
        decisions = list(db.scalars(select(DecisionAssetDB).where(
            DecisionAssetDB.conversation_id == conversation_id, DecisionAssetDB.confirmed.is_(True)).order_by(DecisionAssetDB.updated_at.desc()).limit(12)))
        knowledge = list(db.scalars(select(MemoryAssetDB).where(
            MemoryAssetDB.conversation_id == conversation_id, MemoryAssetDB.status == "active").order_by(MemoryAssetDB.updated_at.desc()).limit(12)))
        attachments = list(db.scalars(select(ConversationAttachmentDB).where(
            ConversationAttachmentDB.conversation_id == conversation_id).order_by(ConversationAttachmentDB.created_at)))
        tasks = list(db.scalars(select(TaskAssetDB).where(TaskAssetDB.system_id == "founder_ai")
                                .order_by(TaskAssetDB.updated_at.desc()).limit(20)))
        assets = list(db.scalars(select(AssetCatalogDB).order_by(AssetCatalogDB.updated_at.desc()).limit(200)))
    project_context = {}
    if conversation.project_id:
        try:
            from app.core.project.service import assemble_project_context
            project_context = assemble_project_context(conversation.project_id)
        except Exception:
            project_context = {"project_id": conversation.project_id, "temporarily_unavailable": True}
    discovery = dict(brain.discovery or {}) if brain else {}
    source_ids = {source_id for item in decisions for source_id in (item.source_message_ids or [])}
    source_ids.update((discovery.get("conversation_understanding_snapshot") or {}).get("source_message_ids") or [])
    messages = select_relevant_history(all_messages, source_ids)
    current_client_message_id = str((interaction_context or {}).get("client_message_id") or "")
    if current_client_message_id:
        messages = [item for item in messages if str((item.grounding or {}).get("client_message_id") or "") != current_client_message_id]
    route = dict(discovery.get("task_complexity_route") or {})
    return {
        "sino_identity": "Sino Founder AI",
        "conversation": {"id": conversation.id, "title": conversation.title, "project_id": conversation.project_id},
        "current_founder_message": current_message,
        "conversation_history": [{"message_id": item.id, "role": item.role, "content": item.content,
                                  "message_type": item.message_type, "created_at": item.created_at.isoformat()} for item in messages],
        "project_context": project_context,
        "confirmed_decisions": [{"title": item.title, "decision": item.decision} for item in decisions],
        "relevant_knowledge": [{"title": item.title, "content": item.summary or item.content} for item in knowledge],
        "conversation_digest": {"summary": digest.summary, "constraints": list(digest.constraints or []),
                                "terminology": list(digest.terminology or [])} if digest else {},
        "current_task": route.get("standard_task_contract") or route.get("quick_fix_contract"),
        "current_execution": route.get("autonomous_execution"),
        "pending_founder_actions": [item for item in discovery.get("founder_action_queue") or [] if item.get("status") == "pending"],
        "conversation_understanding": discovery.get("conversation_understanding_snapshot") or discovery.get("pending_task_understanding"),
        "attachments": [{"attachment_id": item.id, "type": item.attachment_type, "mime_type": item.mime_type,
                         "interpreted_context": (interaction_context or {}).get("grounded_multimodal_context") or (interaction_context or {}).get("image_understanding")} for item in attachments],
        "interaction_context": interaction_context or {},
        "current_system_capabilities": current_system_capabilities_context(tasks=tasks, assets=assets, discovery=discovery),
        "context_selection": {"history_total": len(all_messages), "history_selected": len(messages),
                              "recent_limit": MAX_RECENT_CONVERSATION_MESSAGES},
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _validate_decision(payload: dict, *, current_message: str) -> dict:
    if not isinstance(payload, dict) or not str(payload.get("response") or "").strip():
        raise ValueError("invalid_conversation_decision")
    intent = str(payload.get("semantic_intent") or "conversation")
    if intent not in SEMANTIC_INTENTS:
        intent = "conversation"
    candidate = dict(payload.get("task_candidate") or {})
    if intent == "execute_current_task":
        goal = str(candidate.get("goal") or "").strip()
        # Execution confirmation is never allowed to become its own task goal.
        if not goal or goal.casefold() == current_message.strip().casefold():
            intent = "conversation"
            candidate = {}
    return {
        "response": str(payload["response"]).strip(),
        "semantic_intent": intent,
        "conversation_state": str(payload.get("conversation_state") or "discussion"),
        "task_candidate": candidate or None,
        "tool_intent": payload.get("tool_intent"),
        "founder_action_intent": payload.get("founder_action_intent"),
        "context_updates": dict(payload.get("context_updates") or {}),
        "model_decision": True,
    }


def reason_about_message(conversation_id: str, current_message: str, *, interaction_context: dict | None = None,
                         generator: Callable | None = None) -> dict:
    context = build_conversation_context(conversation_id, current_message, interaction_context=interaction_context)
    roles = configured_model_roles()
    prompt = """You are the conversation intelligence of Sino Founder AI and the Founder's long-term AI partner. Use the supplied relevant evidence to understand the Founder's real purpose, reason with judgment, surface overlooked implications, and offer a better direction or respectful disagreement when useful. Calibrate depth to the question. Respond naturally; do not follow a fixed structure, mechanically restate the request, or turn every answer into a report. Preserve useful Markdown chosen naturally by the model.

Discussion, exploration, correction and agreement are not tasks by default. Decide execution only when the current message semantically authorizes executing an already mature understanding in the preceding context; negation, hypotheticals, questions and deferred consent never authorize execution. If executing, task_candidate.goal/scope/constraints/acceptance_criteria must be derived from the preceding conversation rather than the confirmation phrase. You may propose a Founder action only when Founder input is genuinely required. Return JSON with: response, semantic_intent, conversation_state, task_candidate, tool_intent, founder_action_intent, context_updates. semantic_intent is one of conversation, execute_current_task, stop_current_task, runtime_intervention, founder_decision, founder_authorization, founder_acceptance. The response is the exact Founder-visible natural answer."""

    def invoke(runtime):
        if generator:
            return generator(context, runtime)
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=.45,
            max_tokens=1800, response_format="json", metadata={"runtime_role": "sino_conversation", "conversation_core": "llm_first", "answer_grounding": True}))
        return json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())

    for role in ("conversation", "fallback"):
        runtime = roles.get(role)
        if runtime is None:
            continue
        try:
            result = _validate_decision(invoke(runtime), current_message=current_message)
            result["model_role"] = role; result["provider"] = runtime.provider_key; result["model"] = runtime.model
            result["context"] = context
            return result
        except Exception:
            continue
    return {
        "response": "Sino 当前暂时无法完成可靠的语义判断。你的消息已经保留，但我不会在判断恢复前创建或执行任务。",
        "semantic_intent": "conversation", "conversation_state": "model_unavailable",
        "task_candidate": None, "tool_intent": None, "founder_action_intent": None,
        "context_updates": {}, "model_decision": False, "model_role": None, "provider": None, "model": None,
        "context": context,
    }


def persist_conversation_decision(conversation_id: str, decision: dict) -> None:
    with SessionLocal() as db:
        state = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
        if state is None:
            return
        discovery = dict(state.discovery or {})
        discovery["conversation_core"] = {
            "mode": "LLM_FIRST", "semantic_intent": decision["semantic_intent"],
            "conversation_state": decision["conversation_state"], "task_candidate": decision.get("task_candidate"),
            "tool_intent": decision.get("tool_intent"), "founder_action_intent": decision.get("founder_action_intent"),
            "context_updates": decision.get("context_updates") or {}, "model_role": decision.get("model_role"),
            "provider": decision.get("provider"), "model": decision.get("model"), "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        requested_action = dict(decision.get("founder_action_intent") or {})
        queue = [dict(item) for item in discovery.get("founder_action_queue") or []]
        if requested_action.get("type") == "CLARIFICATION" and requested_action.get("required_input"):
            action_id = str(requested_action.get("action_id") or f"clarification-{conversation_id}-{len(queue) + 1}")
            if not any(item.get("action_id") == action_id and item.get("status") == "pending" for item in queue):
                queue.append({
                    "action_id": action_id, "conversation_id": conversation_id, "task_id": None,
                    "type": "CLARIFICATION", "status": "pending",
                    "title": str(requested_action.get("title") or "需要确认"),
                    "summary": str(requested_action.get("summary") or "Sino 需要一项关键信息才能继续。"),
                    "required_input": requested_action["required_input"],
                    "created_at": datetime.now(timezone.utc).isoformat(), "resolved_at": None, "resolution": None,
                })
            discovery["founder_action_queue"] = queue
            discovery["clarification_state"] = {"status": "awaiting_founder_clarification", "clarification_required": True,
                                                  "founder_action_required": True, "action_id": action_id}
        state.discovery = discovery; state.updated_at = datetime.now(timezone.utc); db.commit()


def summarize_execution_events(conversation_id: str, events: list[dict], *, generator: Callable | None = None) -> str | None:
    """Let the Conversation Model express a causal event batch without exposing raw logs."""
    if not events:
        return None
    roles = configured_model_roles()
    context = build_conversation_context(conversation_id, "", interaction_context={"meaningful_execution_events": events})
    prompt = """You are Sino Founder AI reporting a small batch of causally related execution events. Write at most one concise, natural Founder-facing update. Merge duplicate start/progress facts, preserve causal order, omit raw commands and internal IDs, and do not claim success beyond the evidence. Return JSON {\"summary\": string}."""
    for role in ("conversation", "fallback"):
        runtime = roles.get(role)
        if runtime is None:
            continue
        try:
            if generator:
                payload = generator(context, events, runtime)
            else:
                response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
                    system_prompt=prompt, user_prompt=json.dumps({"conversation_context": context, "events": events}, ensure_ascii=False),
                    temperature=.35, max_tokens=320, response_format="json",
                    metadata={"runtime_role": "sino_conversation", "purpose": "meaningful_execution_update"}))
                payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            summary = str(payload.get("summary") or "").strip()
            if summary:
                return summary
        except Exception:
            continue
    return None
