"""LLM-first Founder conversation reasoning with deterministic action boundaries."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Callable

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation.service import resolve_conversation_model_authority
from app.core.conversation_first.model import ConversationAttachmentDB, ConversationMessageDB, SecretaryDigestDB, SinoBrainSessionDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.model_center.service import resolve_runtime_chain, resolve_runtime_config
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
                          "execution_status": item.execution_status,
                          "task_identity": dict((getattr(item, "scope", None) or {}).get("task_identity") or {})} for item in tasks[:12]],
        "task_identity_policy": "Recent tasks are historical context, not duplicate authority. Only the backend may declare a duplicate from the same source_message_id.",
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
        chain = resolve_runtime_chain("sino_conversation")
        if chain:
            roles["conversation"] = chain[0]
            roles["fallback"] = chain[1] if len(chain) > 1 else None
    except Exception:
        pass
    try:
        from app.core.model_center.capability_registry import resolve_model_route
        vision = resolve_model_route("VISION_UNDERSTANDING")
        text = resolve_model_route("TEXT_REASONING")
        if vision:
            roles["vision"] = resolve_runtime_config(provider_key=vision[0]["provider_id"], model=vision[0]["model_id"])
        primary = roles["conversation"]
        fallback = next((item for item in text if not primary or (item["provider_id"], item["model_id"]) != (primary.provider_key, primary.model)), None)
        if fallback and roles["fallback"] is None:
            roles["fallback"] = resolve_runtime_config(provider_key=fallback["provider_id"], model=fallback["model_id"])
    except Exception:
        pass
    return roles


def conversation_model_authority(conversation_id: str) -> dict:
    """Return the single persisted semantic-model authority for a Conversation."""
    return resolve_conversation_model_authority(
        conversation_id,
        session_factory=SessionLocal,
        runtime_resolver=resolve_runtime_config,
    )


def _authority_model_roles(conversation_id: str) -> list[tuple[str, object]]:
    authority = conversation_model_authority(conversation_id)
    roles = []
    if authority.get("primary") is not None:
        roles.append(("conversation", authority["primary"]))
    roles.extend(("fallback", runtime) for runtime in authority.get("fallbacks") or [])
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


def _safe_mapping(value) -> dict:
    """Normalize provider structured fields without sacrificing a valid natural reply."""
    return dict(value) if isinstance(value, dict) else {}


def _safe_string_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if isinstance(item, (str, int, float)) and str(item).strip()]


def _normalize_task_candidate(value) -> dict:
    candidate = _safe_mapping(value)
    if not candidate:
        return {}
    normalized = dict(candidate)
    for field in ("constraints", "acceptance_criteria", "confirmed_decisions", "dependencies", "risks"):
        normalized[field] = _safe_string_list(candidate.get(field))
    scope = candidate.get("scope")
    normalized["scope"] = _safe_string_list(scope) if isinstance(scope, list) else str(scope or "").strip()
    for field in ("title", "goal", "task_type"):
        if field in normalized and not isinstance(normalized[field], str):
            normalized[field] = str(normalized[field]) if isinstance(normalized[field], (int, float)) else ""
    if str(normalized.get("goal") or "").strip() and not str(normalized.get("title") or "").strip():
        normalized["title"] = str(normalized["goal"]).strip()[:120]
    return normalized


def task_candidate_is_complete(candidate: dict | None) -> bool:
    """A discussion outcome is actionable only when the model supplied its full contract."""
    if not isinstance(candidate, dict):
        return False
    required_text = ("title", "goal")
    required_lists = ("constraints", "acceptance_criteria", "confirmed_decisions")
    if any(not str(candidate.get(field) or "").strip() for field in required_text):
        return False
    scope = candidate.get("scope")
    if not ((isinstance(scope, str) and scope.strip()) or (isinstance(scope, list) and scope)):
        return False
    if any(field not in candidate or not isinstance(candidate.get(field), list) for field in required_lists):
        return False
    return bool(candidate["acceptance_criteria"])


def derive_task_candidate_from_conversation(conversation_id: str, *, generator: Callable | None = None) -> dict:
    """Ask the configured Conversation Model to structure the existing discussion, without inventing business content."""
    authority_roles = _authority_model_roles(conversation_id)
    # Use a dedicated bounded read path. The general Conversation context also
    # assembles capability/runtime inventories, which are irrelevant here and
    # can starve a live polling reconciliation before model resolution.
    with SessionLocal() as db:
        conversation = db.get(ConversationDB, conversation_id)
        if conversation is None:
            raise LookupError("Founder AI conversation not found")
        messages = list(db.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at)))
        digest = db.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation_id))
        decisions = list(db.scalars(select(DecisionAssetDB).where(
            DecisionAssetDB.conversation_id == conversation_id,
            DecisionAssetDB.confirmed.is_(True)).order_by(DecisionAssetDB.updated_at.desc()).limit(12)))
        brain = db.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
    selected = select_relevant_history(messages)
    discovery = dict(brain.discovery or {}) if brain else {}
    context = {
        "sino_identity": "Sino Founder AI",
        "conversation": {"id": conversation.id, "title": conversation.title, "project_id": conversation.project_id},
        "conversation_history": [{"message_id": item.id, "role": item.role, "content": item.content,
                                  "message_type": item.message_type, "created_at": item.created_at.isoformat()}
                                 for item in selected],
        "conversation_digest": {"summary": digest.summary, "constraints": list(digest.constraints or []),
                                "terminology": list(digest.terminology or [])} if digest else {},
        "confirmed_decisions": [{"title": item.title, "decision": item.decision} for item in decisions],
        "conversation_understanding": discovery.get("conversation_understanding_snapshot")
                                      or discovery.get("pending_task_understanding"),
        "prior_structured_decision": discovery.get("conversation_core"),
    }
    prompt = """Using only the supplied Sino Conversation evidence, decide whether the discussion has reached a mature task candidate. Do not invent missing business decisions. Return JSON with task_readiness (sufficient or insufficient), missing_information, and task_candidate. When sufficient, task_candidate must contain title, goal, scope, constraints, acceptance_criteria, confirmed_decisions, dependencies, risks, and task_type. Preserve the meaning of the Founder and Sino discussion; this output is backend structure and is not a Founder-visible response."""
    failures = []
    attempted_runtimes = set()
    for role, runtime in authority_roles:
        runtime_identity = (runtime.provider_key, runtime.model)
        if runtime_identity in attempted_runtimes:
            continue
        attempted_runtimes.add(runtime_identity)
        request = None
        try:
            if generator:
                payload = generator(context, runtime)
            else:
                request = LLMRequest(
                    system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=.2,
                    max_tokens=1500, response_format="json",
                    metadata={"runtime_role": "sino_conversation", "purpose": "task_candidate_derivation"})
                response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, request)
                payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            raw_candidate = _safe_mapping(_safe_mapping(payload).get("task_candidate"))
            for field in ("constraints", "acceptance_criteria", "confirmed_decisions", "dependencies", "risks"):
                if isinstance(raw_candidate.get(field), str):
                    raw_candidate[field] = [raw_candidate[field]]
            candidate = _normalize_task_candidate(raw_candidate)
            readiness = str(_safe_mapping(payload).get("task_readiness") or "").lower()
            if readiness in {"sufficient", "ready", "mature"} and task_candidate_is_complete(candidate):
                return {**candidate, "derivation": {"source": "conversation_llm", "model_role": role,
                                                       "provider": runtime.provider_key, "model": runtime.model,
                                                       "context_message_ids": [item["message_id"] for item in context["conversation_history"]],
                                                       "derivation_version": "conversation-task-candidate-v6",
                                                       "derived_at": datetime.now(timezone.utc).isoformat()}}
            missing = [field for field in ("title", "goal", "scope", "constraints", "acceptance_criteria", "confirmed_decisions")
                       if field not in candidate or candidate.get(field) in (None, "", [])]
            failures.append(f"{role}:schema_not_ready:{readiness or 'missing'}:{','.join(missing) or 'unknown'}")
        except Exception as error:
            for failed in (request.metadata.get("model_fallback_failures") or []) if request else []:
                attempted_runtimes.add((failed.get("provider"), failed.get("model")))
            failures.append(f"{role}:{type(error).__name__}")
            continue
    raise ValueError("conversation_task_candidate_not_ready:" + ",".join(failures or ["no_configured_model"]))


def _validate_decision(payload: dict, *, current_message: str) -> dict:
    if not isinstance(payload, dict) or not str(payload.get("response") or "").strip():
        raise ValueError("invalid_conversation_decision")
    intent = str(payload.get("semantic_intent") or "conversation")
    if intent not in SEMANTIC_INTENTS:
        intent = "conversation"
    candidate = _normalize_task_candidate(payload.get("task_candidate"))
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
        "tool_intent": payload.get("tool_intent") if isinstance(payload.get("tool_intent"), str) else None,
        "founder_action_intent": _safe_mapping(payload.get("founder_action_intent")) or None,
        "context_updates": _safe_mapping(payload.get("context_updates")),
        "model_decision": True,
    }


def _semantic_failure_evidence(error: Exception, *, role: str, provider: str | None,
                               model: str | None, phase: str = "semantic_decision") -> dict:
    return {
        "role": role, "provider": provider, "model": model, "phase": phase,
        "error_type": str(getattr(error, "error_type", None) or type(error).__name__),
    }


def _deterministic_admission_after_model_failure(conversation_id: str, current_message: str, *,
                                                  context: dict, failures: list[dict]) -> dict:
    """Recover only explicitly authorized tasks through the canonical admission authority."""
    base = {
        "response": "Sino 当前暂时无法完成可靠的语义判断。你的消息已经保留，但我不会在判断恢复前创建或执行任务。",
        "semantic_intent": "conversation", "conversation_state": "model_unavailable",
        "task_candidate": None, "tool_intent": None, "founder_action_intent": None,
        "context_updates": {}, "model_decision": False, "model_role": None,
        "provider": None, "model": None, "context": context,
        "semantic_model_failure": {"status": "failed", "attempts": failures},
        "deterministic_fallback": {"attempted": False, "admission": None},
    }
    unavailable_types = {
        "configuration_error", "authentication_failed", "rate_limited", "insufficient_quota",
        "provider_unavailable", "network_error", "timeout",
    }
    attempted_errors = {str(item.get("error_type") or "") for item in failures}
    if attempted_errors and attempted_errors.issubset(unavailable_types):
        base["response"] = "当前会话模型暂时不可用。你的消息已经保留；在模型恢复或你明确切换模型前，我不会创建或执行任务。"
        base["conversation_state"] = "conversation_model_unavailable"
        base["semantic_model_failure"]["reason"] = "MODEL_UNAVAILABLE"
    else:
        base["semantic_model_failure"]["reason"] = "SEMANTIC_UNCERTAIN"
    from app.founder_ai.conversation_task_interaction import has_explicit_execution_intent
    if not has_explicit_execution_intent(current_message):
        return base

    from app.founder_ai.standard_task_execution import build_pre_dispatch_decision
    try:
        decision = build_pre_dispatch_decision(
            conversation_id=conversation_id, goal=current_message,
            discussion_context=[item.get("content") for item in context.get("conversation_history") or []
                                if item.get("content")],
        )
    except Exception as error:
        base["conversation_state"] = "deterministic_admission_unavailable"
        base["response"] = "语义模型暂时不可用；确定性准入也未能形成可靠判断，因此我不会创建或执行任务。"
        base["deterministic_fallback"] = {
            "attempted": True, "admission": None,
            "failure": _semantic_failure_evidence(
                error, role="canonical_admission", provider=None, model=None, phase="pre_dispatch",
            ),
        }
        return base
    admission = {
        key: decision.get(key) for key in (
            "semantic_target", "semantic_module", "interaction_intent", "semantic_confidence",
            "allowed_modules", "allowed_production_files", "allowed_test_files",
            "allowed_shared_support_files", "scope_fingerprint", "contract_fingerprint",
            "browser_adapter", "adapter_compatibility", "risk", "approval_required",
            "clarification_required", "dispatch_allowed", "blocked_reason", "decision_revision",
            "intent_fingerprint", "decision_fingerprint",
        )
    }
    base["deterministic_fallback"] = {"attempted": True, "admission": admission}
    safe_to_dispatch = (
        decision.get("semantic_target")
        and decision.get("semantic_confidence") == "HIGH"
        and str(decision.get("risk") or "").lower() == "low"
        and decision.get("approval_required") is False
        and decision.get("clarification_required") is False
        and decision.get("dispatch_allowed") is True
        and decision.get("adapter_compatibility") == "PASS"
    )
    if not safe_to_dispatch:
        if decision.get("clarification_required"):
            base["conversation_state"] = "deterministic_clarification_required"
            base["response"] = "语义模型暂时不可用；现有确定性判断仍需要补充关键信息，因此我不会创建或执行任务。"
        elif decision.get("approval_required") or str(decision.get("risk") or "").lower() != "low":
            base["conversation_state"] = "deterministic_approval_required"
            base["response"] = "语义模型暂时不可用；现有确定性判断要求审批，因此我不会绕过审批创建或执行任务。"
        else:
            base["conversation_state"] = "deterministic_admission_blocked"
            base["response"] = "语义模型暂时不可用；现有确定性准入也未通过，因此我不会创建或执行任务。"
        return base

    contract = dict(decision.get("standard_task_contract") or {})
    target = dict(decision.get("semantic_target") or {})
    candidate = _normalize_task_candidate({
        "title": target.get("canonical_name") or current_message.strip()[:120],
        "goal": current_message.strip(),
        "task_type": contract.get("task_type") or "STANDARD_TASK",
        "scope": list(decision.get("allowed_modules") or []) or list(decision.get("allowed_production_files") or []),
        "constraints": list(contract.get("constraints") or []),
        "acceptance_criteria": list(contract.get("acceptance_criteria") or []),
        "confirmed_decisions": [], "dependencies": [], "risks": [],
    })
    if not task_candidate_is_complete(candidate):
        base["conversation_state"] = "deterministic_candidate_incomplete"
        base["response"] = "语义模型暂时不可用；确定性准入虽已识别目标，但任务结构仍不完整，因此我不会创建或执行任务。"
        return base
    base.update({
        "response": "语义模型暂时不可用，但该请求已通过现有确定性准入，正在按正式任务边界继续处理。",
        "semantic_intent": "execute_current_task",
        "conversation_state": "deterministic_admission_ready",
        "task_candidate": candidate,
    })
    return base


def reason_about_message(conversation_id: str, current_message: str, *, interaction_context: dict | None = None,
                         generator: Callable | None = None) -> dict:
    context = build_conversation_context(conversation_id, current_message, interaction_context=interaction_context)
    authority = conversation_model_authority(conversation_id)
    authority_roles = []
    if authority.get("primary") is not None:
        authority_roles.append(("conversation", authority["primary"]))
    authority_roles.extend(("fallback", runtime) for runtime in authority.get("fallbacks") or [])
    runtime_mode = "override" if authority.get("explicit_override") else "materialized_default"
    prompt = """You are the conversation intelligence of Sino Founder AI and the Founder's long-term AI partner. Use the supplied relevant evidence to understand the Founder's real purpose, reason with judgment, surface overlooked implications, and offer a better direction or respectful disagreement when useful. Calibrate depth to the question. Respond naturally; do not follow a fixed structure, mechanically restate the request, or turn every answer into a report. Preserve useful Markdown chosen naturally by the model.

Discussion, exploration, correction and agreement are not tasks by default. Decide execution only when the current message semantically authorizes executing an already mature understanding in the preceding context; negation, hypotheticals, questions and deferred consent never authorize execution. If executing, task_candidate.goal/scope/constraints/acceptance_criteria must be derived from the preceding conversation rather than the confirmation phrase. Recent tasks are context only: never claim that a request is duplicate, queued already, or should reuse another task. Duplicate identity is decided exclusively by the backend from the persisted source_message_id. A task with the same title, project, conversation, module, or status is not proof of duplication. You may propose a Founder action only when Founder input is genuinely required. Return JSON with: response, semantic_intent, conversation_state, task_candidate, tool_intent, founder_action_intent, context_updates. semantic_intent is one of conversation, execute_current_task, stop_current_task, runtime_intervention, founder_decision, founder_authorization, founder_acceptance. The response is the exact Founder-visible natural answer."""

    def invoke(runtime, role):
        if generator:
            return generator(context, runtime)
        request = LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=.45,
            max_tokens=1800, response_format="json", metadata={"runtime_role": "sino_conversation", "conversation_core": "llm_first", "answer_grounding": True,
                "conversation_id": conversation_id, "invocation_source": "founder_conversation", "runtime_mode": runtime_mode})

        def attach_gateway_attempts(error):
            failures = list(request.metadata.get("model_fallback_failures") or [])
            if failures:
                error.attempted_model_identities = [
                    (item.get("provider"), item.get("model")) for item in failures
                    if item.get("provider") and item.get("model")
                ]
                error.semantic_attempts = [
                    {"role": "conversation" if index == 0 else "fallback",
                     "provider": item.get("provider"), "model": item.get("model"),
                     "phase": "semantic_decision", "error_type": item.get("error_type")}
                    for index, item in enumerate(failures)
                ]
            return error
        from app.founder_ai.conversation_streaming import partial_json_string, publisher_for
        publisher = publisher_for((interaction_context or {}).get("client_message_id"))
        if publisher:
            try:
                raw = ""
                published = ""
                for chunk in llm_gateway.stream_for_model(runtime.provider_key, runtime.model, request):
                    raw += chunk
                    visible = partial_json_string(raw)
                    if visible and visible != published:
                        publisher(visible); published = visible
                payload = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
                payload["_model_fallback"] = request.metadata.get("model_fallback")
                return payload
            except Exception as stream_error:
                # A provider stream may fail independently of ordinary completion. Reuse the
                # same idempotent message round and publish only its complete fallback result.
                try:
                    response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, request)
                except Exception as completion_error:
                    attach_gateway_attempts(completion_error)
                    completion_error.semantic_attempts = [
                        _semantic_failure_evidence(stream_error, role=role, provider=runtime.provider_key,
                                                   model=runtime.model, phase="stream"),
                        *(getattr(completion_error, "semantic_attempts", None) or [
                            _semantic_failure_evidence(completion_error, role=role, provider=runtime.provider_key,
                                                       model=runtime.model, phase="completion")
                        ]),
                    ]
                    raise
                payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
                if str(payload.get("response") or "").strip():
                    publisher(str(payload["response"]))
                payload["_model_fallback"] = request.metadata.get("model_fallback")
                return payload
        try:
            response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, request)
        except Exception as error:
            raise attach_gateway_attempts(error)
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["_model_fallback"] = request.metadata.get("model_fallback")
        return payload

    failures = []
    attempted_runtimes = set()
    for role, runtime in authority_roles:
        runtime_identity = (runtime.provider_key, runtime.model)
        if runtime_identity in attempted_runtimes:
            continue
        attempted_runtimes.add(runtime_identity)
        try:
            payload = invoke(runtime, role)
            fallback_event = payload.pop("_model_fallback", None) if isinstance(payload, dict) else None
            result = _validate_decision(payload, current_message=current_message)
            result["model_role"] = role; result["provider"] = fallback_event.get("provider") if fallback_event else runtime.provider_key; result["model"] = fallback_event.get("model") if fallback_event else runtime.model
            result["model_fallback"] = fallback_event
            if fallback_event:
                result["response"] = f"Primary 不可用，已自动切换到 Fallback（{fallback_event['model']}）。\n\n{result['response']}"
            result["context"] = context
            duplicate_text = " ".join([result["response"], result.get("conversation_state") or "",
                *list((result.get("task_candidate") or {}).get("constraints") or [])]).casefold()
            duplicate_claim = any(marker in duplicate_text for marker in (
                "同名需求", "不会重复创建", "已有一项", "复用当前已排队", "duplicate", "existing_task", "reuse existing"))
            if duplicate_claim:
                from app.core.task_asset.service import find_task_by_source_message
                source_message_id = str((interaction_context or {}).get("source_message_id") or "")
                existing = find_task_by_source_message(source_message_id)
                if existing is None and result.get("task_candidate"):
                    # The model already treated the request as an executable queued task. When
                    # canonical identity disproves that claim, preserve the intent but create a
                    # fresh Task instead of silently dropping it.
                    result["semantic_intent"] = "execute_current_task"
                    result["conversation_state"] = "new_task_requested"
                    result["response"] = "已识别为新的独立任务，正在创建并按执行器状态进入执行或队列。"
                    candidate = dict(result["task_candidate"])
                    candidate["constraints"] = [item for item in candidate.get("constraints") or []
                                                if not any(marker in item for marker in ("不重复创建", "复用当前已排队"))]
                    result["task_candidate"] = candidate
                elif existing is not None:
                    result["duplicate_task"] = {"duplicate_of_task_id": existing.id,
                                                "duplicate_reason": "same_source_message_id"}
                    result["response"] = f"这条请求已经创建任务（{existing.id}），我继续跟踪原任务，不重复创建。"
            return result
        except Exception as error:
            for failed in getattr(error, "attempted_model_identities", None) or []:
                attempted_runtimes.add(tuple(failed))
            failures.extend(getattr(error, "semantic_attempts", None) or [
                _semantic_failure_evidence(error, role=role, provider=runtime.provider_key, model=runtime.model)
            ])
            continue
    if not failures:
        failures.append({"role": "conversation", "provider": None, "model": None,
                         "phase": "configuration", "error_type": "model_role_unavailable"})
    return _deterministic_admission_after_model_failure(
        conversation_id, current_message, context=context, failures=failures,
    )


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
            "provider": decision.get("provider"), "model": decision.get("model"), "model_fallback": decision.get("model_fallback"), "updated_at": datetime.now(timezone.utc).isoformat(),
            "semantic_model_failure": decision.get("semantic_model_failure"),
            "deterministic_fallback": decision.get("deterministic_fallback"),
        }
        requested_action = _safe_mapping(decision.get("founder_action_intent"))
        queue = [dict(item) for item in discovery.get("founder_action_queue") or [] if isinstance(item, dict)]
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
    authority_roles = _authority_model_roles(conversation_id)
    context = build_conversation_context(conversation_id, "", interaction_context={"meaningful_execution_events": events})
    prompt = """You are Sino Founder AI reporting a small batch of causally related execution events. Write at most one concise, natural Founder-facing update. Merge duplicate start/progress facts, preserve causal order, omit raw commands and internal IDs, and do not claim success beyond the evidence. Return JSON {\"summary\": string}."""
    attempted_runtimes = set()
    for role, runtime in authority_roles:
        runtime_identity = (runtime.provider_key, runtime.model)
        if runtime_identity in attempted_runtimes:
            continue
        attempted_runtimes.add(runtime_identity)
        request = None
        try:
            if generator:
                payload = generator(context, events, runtime)
            else:
                request = LLMRequest(
                    system_prompt=prompt, user_prompt=json.dumps({"conversation_context": context, "events": events}, ensure_ascii=False),
                    temperature=.35, max_tokens=320, response_format="json",
                    metadata={"runtime_role": "sino_conversation", "purpose": "meaningful_execution_update"})
                response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, request)
                payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            summary = str(payload.get("summary") or "").strip()
            if summary:
                return summary
        except Exception:
            for failed in (request.metadata.get("model_fallback_failures") or []) if request else []:
                attempted_runtimes.add((failed.get("provider"), failed.get("model")))
            continue
    return None
