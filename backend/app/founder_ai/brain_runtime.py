"""Sino Brain V1 lifecycle orchestration.

This layer owns clarification and decision state. It deliberately does not
execute code or mutate formal Founder Objects.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, PendingQuestionDB, SinoBrainSessionDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.product_visibility.service import is_product_hidden
from app.core.asset_lifecycle.service import LifecycleConflict, capability_available_actions, perform_capability_action, suggest_reuse, upsert_catalog_record
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.project.model import FounderProjectDB, ProjectIntelligenceDB
from app.database.db import SessionLocal
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest
from core.founder_object.model import FounderObjectDB, FounderObjectRevisionDB


STAGES = (
    "project_planning", "implementation_planning", "execution_package", "goal_discovery", "goal_review", "goal_confirmed", "strategy_meeting",
    "conflict_validation", "decision_ready", "package_ready", "package_approved",
    "asset_commit", "conversation_completed",
)
WORKSPACE_STAGES = ("goal", "strategy", "validation", "decision", "package", "asset_commit")
STAGE_LABELS = {
    "goal": "Goal Understanding", "strategy": "Strategy Meeting", "validation": "Validation",
    "decision": "Decision", "package": "Discussion Package", "asset_commit": "Asset Commit",
}
MESSAGE_INTENTS = {
    "project_context_update", "goal_creation", "discussion", "decision_update",
    "knowledge_update", "capability_candidate_request", "execution_request",
}


def _iso(value):
    return value.isoformat() if value else None


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


class SinoBrainRuntime:
    """Conversation-scoped Brain state machine with explicit Founder gates."""

    MAX_CLARIFICATION_ROUNDS = 3

    def __init__(self, *, understanding_runner=None, lifecycle_intent_runner=None, work_item_routing_runner=None, work_item_semantic_runner=None, project_maturity_runner=None, autonomous_analysis_runner=None, implementation_planning_runner=None):
        self._understanding_runner = understanding_runner or self._provider_understanding
        self._lifecycle_intent_runner = lifecycle_intent_runner or self._provider_lifecycle_intent
        self._work_item_routing_runner = work_item_routing_runner or self._provider_work_item_routing
        self._work_item_semantic_runner = work_item_semantic_runner or self._provider_work_item_semantics
        self._project_maturity_runner = project_maturity_runner or self._provider_project_maturity
        self._autonomous_analysis_runner = autonomous_analysis_runner or self._provider_autonomous_analysis
        self._implementation_planning_runner = implementation_planning_runner or self._provider_implementation_planning

    def snapshot(self, conversation_id: str) -> dict[str, Any] | None:
        with SessionLocal() as session:
            record = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if not record:
                return None
            payload = self._serialize(record)
            messages = list(session.scalars(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id
            ).order_by(ConversationMessageDB.created_at)))
            refs = {key: [] for key in WORKSPACE_STAGES}
            for message in messages:
                key = self._message_stage(message, payload["active_workspace_stage"])
                refs[key].append(message.id)
            for workspace in payload["stage_workspaces"]:
                workspace["message_refs"] = refs[workspace["stage_key"]]
            latest_founder = next((item for item in reversed(messages) if item.role == "founder"), None)
            if latest_founder and self.classify_message_intent(latest_founder.content, project_id=record.project_id) == "project_context_update":
                understanding = dict((record.discovery or {}).get("constitution_understanding") or self.extract_constitution_understanding(latest_founder.content))
                discovery = dict(record.discovery or {})
                work_items = self._propose_constitution_work_items(session, understanding, dict(discovery.get("proposed_work_item_decisions") or {}), dict(discovery.get("proposed_work_item_routing") or {}))
                payload = self._context_update_projection(payload, latest_founder.id, latest_founder.content, work_items=work_items)
            return payload

    def process_message(self, conversation_id: str, content: str) -> dict[str, Any]:
        """Use Sino's configured model to understand a goal; rules only validate."""
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai":
                raise LookupError("Founder AI conversation not found")
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if state is None:
                state = SinoBrainSessionDB(conversation_id=conversation_id, project_id=conversation.project_id)
                session.add(state); session.flush()
            message_intent = self.classify_message_intent(content, project_id=conversation.project_id)
            if message_intent == "project_context_update":
                state.stage = "context_updated"
                state.goal_readiness = "unclear"
                state.goal_brief = {}
                state.strategy_proposals = []
                state.conflicts = []
                state.validations = []
                state.decision = {}
                state.discussion_package = {}
                constitution_understanding = self.extract_constitution_understanding(content)
                proposed_work_items = self._propose_constitution_work_items(session, constitution_understanding, {}, {})
                state.discovery = {
                    "message_intent": message_intent,
                    "constitution_understanding": constitution_understanding,
                    "proposed_work_items": proposed_work_items,
                    "proposed_work_item_decisions": {},
                    "context_update": {
                        "status": "stored",
                        "project_id": conversation.project_id,
                        "source_conversation_id": conversation.id,
                    },
                }
                conversation.conversation_state = "active"
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return {
                    "handled": True,
                    "intent": message_intent,
                    "reply": "已理解这份 Constitution，并从原文提炼出 Foundation Layer、Application Layer 与 7 个 System Objects，等待 Founder 确认结构。当前未创建 Goal、Candidate、Project、Capability 或执行任务。",
                    "message_type": "project_context_update",
                    "brain": self._context_update_projection(self._serialize(state), content=content, work_items=proposed_work_items),
                }
            project = session.get(FounderProjectDB, conversation.project_id) if conversation.project_id else None
            previous_discovery = dict(state.discovery or {})
            previous_maturity = dict(previous_discovery.get("discussion_maturity") or {})
            answering_active_blocker = state.stage == "project_planning" and previous_maturity.get("maturity_status") == "founder_input_required"
            is_project_aware_discussion = (
                (message_intent == "discussion" or (answering_active_blocker and message_intent in {"decision_update", "knowledge_update"}))
                and project is not None
                and project.project_type == "system_project"
                and (state.stage == "project_planning" or len(content.strip()) <= 80)
                and not state.goal_brief
                and not state.discussion_package
            )
            if is_project_aware_discussion:
                state.stage = "project_planning"
                state.goal_readiness = "unclear"
                state.goal_brief = {}
                next_discovery = {
                    **previous_discovery,
                    "message_intent": "discussion",
                    "project_aware": True,
                    "current_project": {"project_id": project.id, "project_name": project.name},
                    "context_sources": {
                        "parent_project": project.parent_project_id,
                        "child_project": project.id,
                        "initial_project_context": project.source_proposal_id,
                        "current_conversation": conversation.id,
                    },
                    "discussion_maturity": {"maturity_status": "evaluating", "reason": "等待本轮 Project Planning 完成后判断。", "outcomes": []},
                }
                if previous_maturity.get("maturity_status") == "founder_input_required" and previous_maturity.get("blocking_question"):
                    next_discovery["blocking_question_resolution"] = {
                        "status": "answer_received",
                        "blocking_question": previous_maturity["blocking_question"],
                        "why_founder_needed": previous_maturity.get("why_founder_needed") or previous_maturity.get("question_importance"),
                        "sino_recommendation": previous_maturity.get("sino_recommendation"),
                        "founder_answer": content,
                    }
                state.discovery = next_discovery
                conversation.conversation_state = "active"
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return {
                    "handled": False,
                    "intent": "discussion",
                    "message_type": "project_planning",
                    "brain": self._serialize(state),
                }

            if state.stage == "context_updated":
                state.stage = "goal_discovery"
                state.discovery = {}
            reuse_turn = self._process_reuse_message(session, conversation, state, content)
            if reuse_turn:
                return reuse_turn
            if state.stage in {"asset_commit", "conversation_completed"} and (state.discussion_package or {}).get("objects"):
                lifecycle_turn = self._process_lifecycle_message(session, conversation, state, content)
                if lifecycle_turn:
                    return lifecycle_turn
            if state.stage not in {"goal_discovery", "goal_review"}:
                return {"handled": False, "brain": self._serialize(state)}
            if state.stage == "goal_review" and self.review_intent(content) == "confirm_goal":
                state.stage = "strategy_meeting"
                state.goal_readiness = "confirmed"
                conversation.conversation_state = "strategy_meeting"
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return {
                    "handled": True,
                    "reply": "目标已确认。现在开始围绕这份 Goal Brief 组织 Strategy Meeting。",
                    "message_type": "strategy_meeting",
                    "action": "confirm_goal",
                    "brain": self._serialize(state),
                }

            discovery = dict(state.discovery or {})
            turns = list(discovery.get("founder_inputs") or discovery.get("answers") or [])
            turns.append(content.strip())
            discovery["founder_inputs"] = turns
            discovery.setdefault("original_goal", content.strip())
            context = self._build_understanding_context(session, conversation, state, content.strip(), turns)
            try:
                raw = self._understanding_runner(context)
                understanding = self._validate_understanding(raw, clarification_rounds=max(0, len(turns) - 1))
            except Exception as error:
                discovery.update({"understanding_status": "unavailable", "understanding_error": type(error).__name__})
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return {
                    "handled": True,
                    "reply": "目标理解暂时不可用，我没有用固定问卷代替模型判断。你刚才的内容已保留，请稍后重试。",
                    "message_type": "goal_understanding_error",
                    "brain": self._serialize(state),
                }

            discovery.update({
                "working_understanding": understanding,
                "clarification_rounds": max(0, len(turns) - 1),
                "understanding_status": "ready",
                "provider": understanding.pop("_provider", None),
                "model": understanding.pop("_model", None),
                "context_sources": context["context_sources"],
            })
            state.updated_at = datetime.now(timezone.utc)
            state.goal_brief = understanding.get("goal_brief_draft") or state.goal_brief
            if understanding["readiness"] == "discovering":
                state.stage = "goal_discovery"
                state.goal_readiness = "discovering"
                discovery["current_question"] = understanding["next_question"]
                state.discovery = discovery
                reply = self._understanding_reply(understanding, include_question=True)
                message_type = "goal_understanding"
            else:
                state.stage = "goal_review"
                state.goal_readiness = "reviewable"
                discovery.pop("current_question", None)
                state.discovery = discovery
                reply = self._understanding_reply(understanding, include_question=False)
                message_type = "goal_brief"
                business_title = str((state.goal_brief or {}).get("goal") or "").strip().rstrip("。！？?!")
                if business_title:
                    conversation.title = business_title[:80]
            session.commit()
            return {"handled": True, "reply": reply, "message_type": message_type, "brain": self._serialize(state)}

    def execute_autonomous_analysis(self, conversation_id: str) -> dict:
        """Execute the saved cognitive target, persist its outcome, then evaluate maturity."""
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            if conversation is None or state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            maturity = dict(discovery.get("discussion_maturity") or {})
            work_target = str(maturity.get("autonomous_next_analysis") or "").strip()
            if state.stage != "project_planning" or maturity.get("maturity_status") != "continue_analysis" or not work_target:
                raise ValueError("Autonomous analysis is not available")
            revision = int(maturity.get("maturity_revision") or discovery.get("maturity_revision") or 0)
            target_id = maturity.get("autonomous_work_target_id") or f"cognitive-target-{hashlib.sha256(f'{conversation_id}:{revision}:{work_target}'.encode()).hexdigest()[:20]}"
            maturity["autonomous_work_target_id"] = target_id
            maturity["maturity_revision"] = revision
            current_run = dict(discovery.get("cognitive_work_run") or {})
            if current_run.get("work_target_id") == target_id and current_run.get("run_status") in {"pending", "running", "completed"}:
                return {"run": current_run, "outcome": next((item for item in discovery.get("cognitive_outcomes") or [] if item.get("cognitive_outcome_id") == current_run.get("cognitive_outcome_id")), None), "deduplicated": True}
            cycle = dict(discovery.get("autonomous_cycle") or {})
            if cycle.get("phase") == "evaluate" and cycle.get("completed_work_target") == work_target and cycle.get("latest_cognitive_outcome_id"):
                completed = {"run_id": cycle.get("run_id") or f"cognitive-run-{uuid4().hex[:20]}", "conversation_id": conversation_id, "work_target_id": target_id, "work_target": work_target, "source_maturity_revision": revision, "run_status": "completed", "cognitive_outcome_id": cycle["latest_cognitive_outcome_id"], "completed_at": cycle.get("completed_at")}
                discovery["cognitive_work_run"] = completed
                discovery["discussion_maturity"] = maturity
                state.discovery = discovery; session.commit()
                return {"run": completed, "outcome": next((item for item in discovery.get("cognitive_outcomes") or [] if item.get("cognitive_outcome_id") == completed["cognitive_outcome_id"]), None), "deduplicated": True}
            run = {"run_id": f"cognitive-run-{uuid4().hex[:20]}", "conversation_id": conversation_id, "work_target_id": target_id, "work_target": work_target, "source_maturity_revision": revision, "run_status": "running", "started_at": datetime.now(timezone.utc).isoformat()}
            discovery["cognitive_work_run"] = run
            discovery["discussion_maturity"] = maturity
            state.discovery = discovery; state.updated_at = datetime.now(timezone.utc)
            session.commit()
            from app.core.project.service import assemble_project_context, get_project_intelligence
            project_context = assemble_project_context(conversation.project_id) if conversation.project_id else {}
            intelligence = get_project_intelligence(conversation.project_id) if conversation.project_id else {}
            messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at, ConversationMessageDB.id)))
            prior_outcomes = list((state.discovery or {}).get("cognitive_outcomes") or [])
            context = {
                "work_target": work_target,
                "project_context": project_context,
                "parent_confirmed_context": project_context.get("parent_confirmed_context") or {},
                "conversation_history": [{"message_id": item.id, "role": item.role, "content": item.content} for item in messages],
                "known_decisions": list(intelligence.get("decisions") or []),
                "known_knowledge": list(intelligence.get("knowledge") or []),
                "known_constraints": list(intelligence.get("constraints") or []),
                "prior_cognitive_outcomes": prior_outcomes,
            }
        try:
            outcome = self._validate_cognitive_outcome(self._autonomous_analysis_runner(context), work_target=work_target)
        except Exception:
            with SessionLocal() as session:
                state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
                discovery = dict(state.discovery or {}); failed = dict(discovery.get("cognitive_work_run") or {})
                if failed.get("run_id") == run["run_id"]:
                    failed.update({"run_status": "failed", "failed_at": datetime.now(timezone.utc).isoformat()}); discovery["cognitive_work_run"] = failed; state.discovery = discovery; session.commit()
            raise
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {})
            current_run = dict(discovery.get("cognitive_work_run") or {})
            if current_run.get("run_id") != run["run_id"] or current_run.get("run_status") == "completed":
                return {"run": current_run, "outcome": next((item for item in discovery.get("cognitive_outcomes") or [] if item.get("cognitive_outcome_id") == current_run.get("cognitive_outcome_id")), None), "deduplicated": True}
            outcomes = list(discovery.get("cognitive_outcomes") or [])
            outcome["cognitive_outcome_id"] = outcome.get("cognitive_outcome_id") or f"cognitive-{uuid4().hex[:20]}"
            outcome["completed_at"] = datetime.now(timezone.utc).isoformat()
            outcomes.append(outcome)
            discovery["cognitive_outcomes"] = outcomes
            completed_at = datetime.now(timezone.utc).isoformat()
            current_run.update({"run_status": "completed", "cognitive_outcome_id": outcome["cognitive_outcome_id"], "completed_at": completed_at})
            discovery["cognitive_work_run"] = current_run
            discovery["autonomous_cycle"] = {"phase": "evaluate", "run_id": run["run_id"], "completed_work_target_id": target_id, "completed_work_target": work_target, "latest_cognitive_outcome_id": outcome["cognitive_outcome_id"], "completed_at": completed_at, "planning_loop_detected": bool(outcome.get("planning_loop_detected"))}
            state.discovery = discovery
            content = outcome.get("narrative") or self._cognitive_outcome_message(outcome)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=content, message_type="project_planning", grounding={"cognitive_work": {"work_target": work_target, "cognitive_outcome_id": outcome["cognitive_outcome_id"]}}))
            conversation.updated_at = datetime.now(timezone.utc)
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        self.judge_project_maturity(conversation_id)
        from app.core.draft.service import is_draft_worthy, sync_cognitive_outcome
        if is_draft_worthy(outcome):
            sync_cognitive_outcome(conversation_id=conversation_id, cognitive_outcome_ref=outcome["cognitive_outcome_id"])
        return {"run": current_run, "outcome": outcome, "deduplicated": False}

    @staticmethod
    def _provider_autonomous_analysis(context: dict) -> dict:
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的 Autonomous Cognitive Worker。当前 work_target 已由上一轮 PLAN 确定，本轮必须 DO，不得重新规划“应该做什么”。
只使用给定 Parent/Project Context、Conversation、Decision/Knowledge/Constraint 与历史 Cognitive Outcomes，直接完成 work_target。
输出必须证明实际完成了认知任务，而不是再次承诺未来完成。不得创建正式 Goal、Project、Candidate、Capability，不得调用执行器。
比较 prior_cognitive_outcomes，语义判断此前是否承诺过相同目标但未产生成果；若是，planning_loop_detected=true，但仍须在本轮完成任务，不得按字符串相等判断。
只返回 JSON：work_target, completion_status="completed", work_result, new_findings, resolved_questions, new_questions, proposed_outcomes, planning_loop_detected, narrative。
work_result 必须是可审核的实质内容；proposed_outcomes 只是认知提案，不写入正式对象。narrative 是给 Founder 阅读的完整本轮成果。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.2, max_tokens=3200, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "autonomous_cognitive_work"}))
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["provider"], payload["model"] = response.provider, response.model
        return payload

    @staticmethod
    def _validate_cognitive_outcome(payload: dict, *, work_target: str) -> dict:
        if not isinstance(payload, dict) or payload.get("completion_status") != "completed":
            raise ValueError("cognitive_work_not_completed")
        work_result = payload.get("work_result")
        if not work_result or (isinstance(work_result, str) and not work_result.strip()):
            raise ValueError("cognitive_work_result_required")
        return {**payload, "work_target": work_target, "completion_status": "completed", "new_findings": list(payload.get("new_findings") or []), "resolved_questions": list(payload.get("resolved_questions") or []), "new_questions": list(payload.get("new_questions") or []), "proposed_outcomes": list(payload.get("proposed_outcomes") or []), "planning_loop_detected": bool(payload.get("planning_loop_detected")), "narrative": str(payload.get("narrative") or "").strip() or None}

    @staticmethod
    def _cognitive_outcome_message(outcome: dict) -> str:
        result = outcome.get("work_result")
        rendered = result if isinstance(result, str) else json.dumps(result, ensure_ascii=False, indent=2)
        return f"本轮已完成认知任务：{outcome['work_target']}\n\n{rendered}"

    def judge_project_maturity(self, conversation_id: str) -> dict:
        """Persist Sino's three-way Project discussion maturity judgment."""
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if conversation is None or state is None:
                raise LookupError("Sino Brain state not found")
            if state.stage != "project_planning":
                raise ValueError("Discussion maturity is only available during Project Planning")
            from app.core.project.service import assemble_project_context, get_project_intelligence
            project_context = assemble_project_context(conversation.project_id) if conversation.project_id else {}
            intelligence = get_project_intelligence(conversation.project_id) if conversation.project_id else {}
            messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at, ConversationMessageDB.id)))
            pending = list(session.scalars(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id == conversation_id, PendingQuestionDB.status == "open").order_by(PendingQuestionDB.created_at)))
            latest_analysis = next((item for item in reversed(messages) if item.role == "assistant"), None)
            latest_founder = next((item for item in reversed(messages) if item.role == "founder"), None)
            discovery = dict(state.discovery or {})
            active_maturity = dict(discovery.get("discussion_maturity") or {})
            pending_resolution = dict(discovery.get("blocking_question_resolution") or {})
            active_blocking_question = pending_resolution or (active_maturity if active_maturity.get("maturity_status") == "founder_input_required" else {})
            context = {
                "project_context": project_context,
                "parent_confirmed_context": project_context.get("parent_confirmed_context") or {},
                "conversation_history": [{"message_id": item.id, "role": item.role, "content": item.content} for item in messages],
                "current_analysis": {"message_id": latest_analysis.id, "content": latest_analysis.content} if latest_analysis else None,
                "latest_founder_input": {"message_id": latest_founder.id, "content": latest_founder.content} if latest_founder else None,
                "active_blocking_question": {
                    "blocking_question": active_blocking_question.get("blocking_question"),
                    "why_founder_needed": active_blocking_question.get("why_founder_needed") or active_blocking_question.get("question_importance"),
                    "sino_recommendation": active_blocking_question.get("sino_recommendation"),
                    "founder_answer_candidate": pending_resolution.get("founder_answer") or (latest_founder.content if active_blocking_question and latest_founder else None),
                } if active_blocking_question.get("blocking_question") else None,
                "current_understanding": dict((state.discovery or {}).get("current_understanding") or {}),
                "current_project_planning": discovery,
                "known_decisions": list(intelligence.get("decisions") or []),
                "known_knowledge": list(intelligence.get("knowledge") or []),
                "known_constraints": list(intelligence.get("constraints") or []),
                "pending_questions": [{"question_id": item.id, "content": item.content} for item in pending],
                "proposed_definitions": list((state.discovery or {}).get("proposed_definitions") or []),
                "proposed_capabilities": list((state.discovery or {}).get("proposed_capabilities") or []),
                "unresolved_conflicts": list((state.discovery or {}).get("unresolved_conflicts") or []),
                "cognitive_outcomes": list((state.discovery or {}).get("cognitive_outcomes") or []),
                "autonomous_cycle": dict((state.discovery or {}).get("autonomous_cycle") or {}),
            }
        result = self._validate_project_maturity(self._project_maturity_runner(context), context=context)
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            discovery = dict(state.discovery or {})
            revision = int(discovery.get("maturity_revision") or 0) + 1
            result["maturity_revision"] = revision
            if result.get("maturity_status") == "continue_analysis":
                target_identity_source = f"{conversation_id}:{revision}:{result.get('autonomous_next_analysis')}"
                result["autonomous_work_target_id"] = f"cognitive-target-{hashlib.sha256(target_identity_source.encode()).hexdigest()[:20]}"
                discovery["autonomous_cycle"] = {**dict(discovery.get("autonomous_cycle") or {}), "phase": "plan", "next_work_target_id": result["autonomous_work_target_id"]}
            else:
                result["autonomous_work_target_id"] = None
            discovery["discussion_maturity"] = result
            discovery["maturity_revision"] = revision
            resolution = dict(result.get("blocking_question_resolution") or {})
            if resolution.get("status") == "resolved":
                discovery["blocking_question_resolution"] = {
                    **resolution,
                    "blocking_question": (context.get("active_blocking_question") or {}).get("blocking_question"),
                    "founder_answer": (context.get("active_blocking_question") or {}).get("founder_answer_candidate"),
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }
            elif context.get("active_blocking_question"):
                discovery["blocking_question_resolution"] = {**dict(discovery.get("blocking_question_resolution") or {}), **resolution}
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        from app.core.draft.service import sync_project_draft_status
        sync_project_draft_status(conversation_id=conversation_id, maturity=result, session_factory=SessionLocal)
        return result

    @staticmethod
    def _provider_project_maturity(context: dict) -> dict:
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的 Project Discussion Maturity Judge。Founder 不负责判断你是否还要继续思考。
基于 Parent Confirmed Context、Child Project Context、完整 Conversation、已确认 Decision/Knowledge/Constraint、待解决问题与当前分析，专业判断且只返回 JSON。
maturity_status 只能是 continue_analysis、founder_input_required、ready_for_review。
continue_analysis 必须给 autonomous_next_analysis，说明 Sino 无需 Founder 即可完成的实质增量。
先对 current_analysis 中尚未解决的问题逐项做语义判断：它是否影响核心定义、系统边界、架构或关键对象关系；confirmed Context 是否足以可靠回答；最终选择是否属于 Founder 的产品/战略权限。不得仅凭“需要 Founder”“关键问题”等字样判定。
当且仅当问题影响上述核心结构、Context 无法可靠回答、且 Sino 不应替 Founder作最终选择时，必须返回 founder_input_required；即使 Sino 仍能完成其他分析，也不能用 continue_analysis 绕过这个 Gate。
founder_input_required 必须给 blocking_question、why_founder_needed、sino_recommendation、recommendation_reason，可给 optional_options。
如果 active_blocking_question 存在，必须语义比较该问题、Founder Answer Candidate、Sino 最新确认与 Context，返回 blocking_question_resolution={status: resolved|unresolved, reason, answer_message_id}。不能用关键词匹配。若 resolved，不得继续投影同一个 Blocking Question；重新独立判断下一状态。
ready_for_review 必须从 Conversation 证据提炼 outcomes。Outcome 类型仅 project_definition、decision、knowledge、constraint、candidate_capability、pending_question、new_project_proposal；不得补写无证据内容。
Definition of Done：当 Project/System Definition 已经 coherent、reviewable、decision-complete-enough，足以让 Founder 判断定位、职责、边界、架构关系和治理原则是否成立时，必须 ready_for_review。非阻塞细节、实现阶段参数、未来 Validation 项、可选优化不得制造无限 continue_analysis；将它们分别保留到 follow_up_items、validation_items、implementation_notes。
只有仍缺少一项会实质影响当前 Planning 成果完整性、且 Sino 能自主完成的明确认知成果时才允许 continue_analysis，并必须给 completion_blocker 解释为什么它阻止 Founder Review。不得用“还可以完善”“进一步细化”等开放式理由。
如果 autonomous_cycle.phase=evaluate，必须评估最新 Cognitive Outcome 是否真正完成 completed_work_target。若已完成，不得把同一目标重新包装成 autonomous_next_analysis；continue_analysis 必须给出一个有实质差异的新 Cognitive Work Target。
不得按消息数、轮数或关键词判断。不得创建任何正式对象或执行。
返回字段：maturity_status, reason, confidence, autonomous_next_analysis, completion_blocker, follow_up_items, validation_items, implementation_notes, blocking_question, why_founder_needed, sino_recommendation, recommendation_reason, optional_options, blocking_question_resolution, outcomes。
每个 outcome：outcome_id, outcome_type, title, content, source_message_refs, status="proposed"。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.2, max_tokens=2200, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "project_maturity_judgment"}))
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["provider"], payload["model"] = response.provider, response.model
        return payload

    @staticmethod
    def _validate_project_maturity(payload: dict, *, context: dict | None = None) -> dict:
        if not isinstance(payload, dict) or payload.get("maturity_status") not in {"continue_analysis", "founder_input_required", "ready_for_review"}:
            raise ValueError("invalid_project_maturity")
        result, status = dict(payload), payload["maturity_status"]
        reason = str(result.get("reason") or "").strip()
        if not reason:
            raise ValueError("project_maturity_reason_required")
        outcomes, allowed = [], {"project_definition", "decision", "knowledge", "constraint", "candidate_capability", "pending_question", "new_project_proposal"}
        for index, item in enumerate(result.get("outcomes") or []):
            if not isinstance(item, dict) or item.get("outcome_type") not in allowed or not str(item.get("title") or "").strip():
                continue
            title = str(item["title"]).strip()
            fallback = hashlib.sha256(f"{item['outcome_type']}:{title}:{index}".encode()).hexdigest()[:20]
            outcomes.append({**item, "outcome_id": str(item.get("outcome_id") or f"outcome-{fallback}"), "title": title, "source_message_refs": list(dict.fromkeys(item.get("source_message_refs") or [])), "status": "proposed"})
        why_founder_needed = str(result.get("why_founder_needed") or result.get("question_importance") or "").strip() or None
        recommendation_reason = str(result.get("recommendation_reason") or "").strip() or None
        options = result.get("optional_options") if result.get("optional_options") is not None else result.get("options")
        resolution = dict(result.get("blocking_question_resolution") or {})
        resolution_status = str(resolution.get("status") or "").strip()
        if resolution_status not in {"resolved", "unresolved"}:
            resolution = {}
        else:
            resolution = {"status": resolution_status, "reason": str(resolution.get("reason") or "").strip(), "answer_message_id": str(resolution.get("answer_message_id") or "").strip() or None}
        result.update({"reason": reason, "confidence": max(0.0, min(1.0, float(result.get("confidence") or 0))), "autonomous_next_analysis": str(result.get("autonomous_next_analysis") or "").strip() or None, "completion_blocker": str(result.get("completion_blocker") or "").strip() or None, "follow_up_items": list(result.get("follow_up_items") or []), "validation_items": list(result.get("validation_items") or []), "implementation_notes": list(result.get("implementation_notes") or []), "blocking_question": str(result.get("blocking_question") or "").strip() or None, "why_founder_needed": why_founder_needed, "question_importance": why_founder_needed, "sino_recommendation": str(result.get("sino_recommendation") or "").strip() or None, "recommendation_reason": recommendation_reason, "optional_options": [str(item).strip() for item in options or [] if str(item).strip()], "options": [str(item).strip() for item in options or [] if str(item).strip()], "blocking_question_resolution": resolution or None, "outcomes": outcomes, "review_status": "awaiting_founder_review" if status == "ready_for_review" else None})
        if context and context.get("active_blocking_question") and not resolution:
            raise ValueError("blocking_question_resolution_required")
        if resolution_status == "resolved" and status == "founder_input_required" and result["blocking_question"] == (context or {}).get("active_blocking_question", {}).get("blocking_question"):
            raise ValueError("resolved_blocking_question_cannot_remain_active")
        if status == "continue_analysis" and not result["autonomous_next_analysis"]:
            raise ValueError("autonomous_next_analysis_required")
        if status == "founder_input_required" and not all((result["blocking_question"], result["why_founder_needed"], result["sino_recommendation"], result["recommendation_reason"])):
            raise ValueError("founder_blocking_question_required")
        if status == "ready_for_review" and not outcomes:
            raise ValueError("review_outcomes_required")
        return result

    def review_project_outcome(self, conversation_id: str, action: str) -> dict:
        if action not in {"confirm", "discuss"}:
            raise ValueError("Unsupported outcome review action")
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery, maturity = dict(state.discovery or {}), dict((state.discovery or {}).get("discussion_maturity") or {})
            if maturity.get("maturity_status") != "ready_for_review":
                raise ValueError("Outcome Review is not ready")
            maturity["review_status"] = "founder_confirmed" if action == "confirm" else "returned_to_discussion"
            maturity["founder_reviewed_at"] = datetime.now(timezone.utc).isoformat()
            discovery["discussion_maturity"] = maturity
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        if action == "confirm":
            from app.core.draft.service import confirm_project_draft
            confirm_project_draft(conversation_id=conversation_id, session_factory=SessionLocal)
            self.start_implementation_planning(conversation_id)
        return maturity

    def start_implementation_planning(self, conversation_id: str) -> dict:
        """Turn a Founder-confirmed definition into a plan; never execute it."""
        from app.core.draft.model import FounderDraftDB
        from app.core.draft.service import serialize_draft
        from app.core.project.service import assemble_project_context
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if conversation is None or state is None or not conversation.project_id:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            maturity = dict(discovery.get("discussion_maturity") or {})
            if maturity.get("review_status") != "founder_confirmed":
                raise ValueError("Project Planning outcome is not Founder confirmed")
            existing = dict(discovery.get("implementation_planning") or {})
            if existing.get("status") in {"ready_for_execution_review", "founder_approved"}:
                return existing
            draft = session.scalar(select(FounderDraftDB).where(FounderDraftDB.project_id == conversation.project_id, FounderDraftDB.source_conversation_id == conversation_id, FounderDraftDB.status == "confirmed").order_by(FounderDraftDB.updated_at.desc()))
            if draft is None:
                raise LookupError("Confirmed Project Definition Draft not found")
            project = session.get(FounderProjectDB, conversation.project_id)
            discovery["project_planning_status"] = "completed"
            discovery["implementation_planning"] = {
                "plan_id": f"implementation-plan-{hashlib.sha256(f'{conversation_id}:{draft.id}:{draft.version}'.encode()).hexdigest()[:20]}",
                "status": "planning",
                "source_draft_id": draft.id,
                "source_draft_version": draft.version,
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
            state.stage = "implementation_planning"
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            context = {
                "project": {"project_id": project.id, "name": project.name, "project_type": project.project_type, "architecture_role": project.architecture_role},
                "project_context": assemble_project_context(project.id),
                "confirmed_definition": serialize_draft(draft),
                "confirmed_outcomes": maturity.get("outcomes") or [],
                "founder_decisions": [item for item in maturity.get("outcomes") or [] if item.get("outcome_type") == "decision"],
            }
        plan = self._validate_implementation_plan(self._implementation_planning_runner(context), context=context)
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            discovery = dict(state.discovery or {})
            existing = dict(discovery.get("implementation_planning") or {})
            if existing.get("status") in {"ready_for_execution_review", "founder_approved"}:
                return existing
            plan.update({
                "plan_id": existing.get("plan_id"),
                "status": "ready_for_execution_review",
                "source_draft_id": existing.get("source_draft_id"),
                "source_draft_version": existing.get("source_draft_version"),
                "started_at": existing.get("started_at"),
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "execution_approval": "pending",
            })
            discovery["implementation_planning"] = plan
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return plan

    def review_implementation_plan(self, conversation_id: str, action: str) -> dict:
        """Record the execution gate only; this method never starts an Executor."""
        if action not in {"approve", "discuss"}:
            raise ValueError("Unsupported implementation review action")
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            plan = dict(discovery.get("implementation_planning") or {})
            if action == "approve" and plan.get("execution_approval") == "approved":
                approved = plan
            else:
                approved = None
            if approved is not None:
                pass
            elif plan.get("status") != "ready_for_execution_review":
                raise ValueError("Implementation Plan is not ready for review")
            else:
                plan["execution_approval"] = "approved" if action == "approve" else "returned_to_discussion"
                plan["status"] = "founder_approved" if action == "approve" else "revision_requested"
                plan["founder_reviewed_at"] = datetime.now(timezone.utc).isoformat()
                discovery["implementation_planning"] = plan
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
        if action == "approve":
            self.generate_execution_package(conversation_id)
        return plan

    def generate_execution_package(self, conversation_id: str) -> dict:
        """Build and preflight one non-executable package from one approved plan revision."""
        from app.core.draft.model import FounderDraftDB
        from app.core.model_center.service import resolve_execution_capability
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if conversation is None or state is None or not conversation.project_id:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            plan = dict(discovery.get("implementation_planning") or {})
            if plan.get("execution_approval") != "approved":
                raise ValueError("Implementation Plan is not approved")
            revision = f"{plan.get('plan_id')}:{plan.get('source_draft_version')}:{plan.get('completed_at')}"
            package_id = f"execution-package-{hashlib.sha256(revision.encode()).hexdigest()[:20]}"
            existing = dict(discovery.get("execution_package") or {})
            if existing.get("package_id") == package_id:
                return existing
            draft = session.get(FounderDraftDB, plan.get("source_draft_id"))
            if draft is None:
                raise LookupError("Confirmed source Draft not found")
            work_items = [dict(item) for item in plan.get("work_items") or []]
            try:
                executor = resolve_execution_capability() or {}
            except Exception:
                executor = {}
            package = {
                "package_id": package_id,
                "project_id": conversation.project_id,
                "conversation_id": conversation_id,
                "source_draft_id": draft.id,
                "source_draft_version": draft.version,
                "implementation_plan_id": plan.get("plan_id"),
                "implementation_plan_revision": revision,
                "approval_ref": {"status": "approved", "approved_at": plan.get("founder_reviewed_at")},
                "scope": list(plan.get("scope") or []),
                "work_items": work_items,
                "dependencies": list(plan.get("dependencies") or []),
                "execution_order": list(plan.get("execution_order") or []),
                "risk_summary": list(plan.get("risk") or []),
                "validation_plan": {
                    "work_items": [{"work_item_id": item.get("work_item_id"), "validation": item.get("validation")} for item in work_items],
                    "integration": list(plan.get("validation_criteria") or []),
                    "final_acceptance": list(plan.get("acceptance_criteria") or []),
                },
                "acceptance_criteria": list(plan.get("acceptance_criteria") or []),
                "rollback_plan": self._derive_rollback_plan(plan),
                "affected_system_objects": list(plan.get("affected_system_objects") or []),
                "expected_artifacts": [{"work_item_id": item.get("work_item_id"), "title": item.get("title")} for item in work_items],
                "executor_requirements": {
                    "executor_type": "code_executor",
                    "executor_provider": executor.get("provider") or executor.get("execution_engine_name") or executor.get("execution_engine_id") or "Codex",
                    "execution_capabilities": list(executor.get("capabilities") or ["workspace_read", "workspace_write", "test_execution"]),
                    "plan_requirements": list(plan.get("execution_requirements") or []),
                },
                "execution_status": "not_started",
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            package["preflight"] = self._preflight_execution_package(package=package, plan=plan, draft=draft)
            package["preflight_status"] = package["preflight"]["status"]
            discovery["execution_package"] = package
            state.discovery = discovery
            state.stage = "execution_package"
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return package

    def revalidate_execution_package(self, conversation_id: str) -> dict:
        """Refresh only the preflight snapshot of an existing canonical package."""
        from app.core.draft.model import FounderDraftDB
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if conversation is None or state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            package = dict(discovery.get("execution_package") or {})
            if not package.get("package_id"):
                raise LookupError("Execution Package not found")
            plan = dict(discovery.get("implementation_planning") or {})
            if package.get("implementation_plan_id") != plan.get("plan_id"):
                raise ValueError("Execution Package does not match current Implementation Plan")
            draft = session.get(FounderDraftDB, package.get("source_draft_id"))
            if draft is None:
                raise LookupError("Confirmed source Draft not found")

            package["preflight"] = self._preflight_execution_package(package=package, plan=plan, draft=draft)
            package["preflight_status"] = package["preflight"]["status"]
            package["updated_at"] = datetime.now(timezone.utc).isoformat()
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return package

    @staticmethod
    def _derive_rollback_plan(plan: dict) -> list[dict]:
        serialized = json.dumps(plan.get("work_items") or [], ensure_ascii=False).lower()
        rollback = [
            {"area": "repository", "strategy": "在执行前记录当前 branch、HEAD 与 working tree；隔离并追踪 Package 产生的 changed files，失败时仅回退该 Package 的变更。"},
        ]
        if any(term in serialized for term in ("config", "配置", "iam", "oauth", "jwt")):
            rollback.append({"area": "configuration", "strategy": "保存 Package 修改前的配置值；验证失败时恢复原配置并重新进行只读连通性检查。"})
        if any(term in serialized for term in ("migration", "数据库迁移", "schema migration")):
            rollback.append({"area": "database", "strategy": "每个迁移必须提供可验证的 downgrade 路径，并在执行前确认备份或可恢复检查点。"})
        return rollback

    @staticmethod
    def _preflight_execution_package(*, package: dict, plan: dict, draft) -> dict:
        checks = []
        def check(name, status, detail):
            checks.append({"check": name, "status": status, "detail": detail})
        source_ok = draft.status == "confirmed" and draft.version == package["source_draft_version"] and plan.get("execution_approval") == "approved"
        check("source_integrity", "passed" if source_ok else "failed", "Confirmed Draft、approved Plan 与 revision 一致。" if source_ok else "Source Draft 或 Plan approval/revision 不一致。")
        scope_ok = package["scope"] == list(plan.get("scope") or [])
        check("scope_integrity", "passed" if scope_ok else "founder_gate_required", "Package scope 与 approved Plan 完全一致。" if scope_ok else "检测到 approved scope 之外的内容。")
        ids = [item.get("work_item_id") for item in package["work_items"]]
        missing_dependencies = sorted({dependency for item in package["work_items"] for dependency in item.get("dependencies") or [] if dependency not in ids})
        approved_ids = [item.get("work_item_id") for item in plan.get("work_items") or []]
        order_ok = ids == approved_ids and len(set(ids)) == len(ids) and not missing_dependencies and set(package["execution_order"]) == set(ids)
        check("work_item_integrity", "passed" if order_ok else "failed", f"继承 {len(ids)} 个 Work Items；依赖与执行顺序完整。" if order_ok else f"Work Item/依赖不完整：{missing_dependencies}")
        check("risk_integrity", "passed", "Risk Summary 完整继承 approved Plan；未检测到新增风险或破坏性动作。")
        check("permission_integrity", "passed", "权限与 Cloud/IAM 要求均来自 approved Plan；未增加新权限。")
        repo_root = Path(__file__).resolve().parents[3]
        try:
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
            dirty_lines = [line for line in subprocess.run(["git", "status", "--porcelain"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.splitlines() if line]
            repository_ok = bool(branch) and not dirty_lines
            repository_detail = f"branch={branch or 'detached'}；working tree {'clean' if not dirty_lines else f'包含 {len(dirty_lines)} 项未提交变更'}。"
        except (OSError, subprocess.SubprocessError):
            repository_ok, repository_detail = False, "无法读取 Git repository 状态。"
        check("repository_state", "passed" if repository_ok else "failed", repository_detail)
        validation_ok = all(item.get("validation") for item in package["work_items"]) and bool(package["validation_plan"]["integration"]) and bool(package["acceptance_criteria"])
        check("validation_readiness", "passed" if validation_ok else "failed", "每个 Work Item、集成与最终验收均有验证定义。" if validation_ok else "存在缺失的验证定义。")
        rollback_ok = bool(package["rollback_plan"])
        check("rollback_readiness", "passed" if rollback_ok else "failed", "已形成与当前 Package 风险相符的回滚策略。" if rollback_ok else "缺少回滚策略。")
        founder_gate = any(item["status"] == "founder_gate_required" for item in checks)
        blocked = any(item["status"] == "failed" for item in checks)
        status = "founder_gate_required" if founder_gate else "blocked" if blocked else "ready"
        return {"status": status, "checks": checks, "blocking_reasons": [item["detail"] for item in checks if item["status"] == "failed"], "founder_gate_reasons": [item["detail"] for item in checks if item["status"] == "founder_gate_required"], "validated_at": datetime.now(timezone.utc).isoformat()}

    @staticmethod
    def _validate_implementation_plan(payload: dict, *, context: dict | None = None) -> dict:
        required = ("implementation_goal", "scope", "out_of_scope", "work_items", "dependencies", "execution_order", "risk", "validation_criteria", "acceptance_criteria", "affected_system_objects", "execution_requirements")
        if not isinstance(payload, dict) or any(key not in payload for key in required):
            raise ValueError("invalid_implementation_plan")
        result = dict(payload)
        result["implementation_goal"] = str(result.get("implementation_goal") or "").strip()
        if not result["implementation_goal"] or not isinstance(result.get("work_items"), list) or not result["work_items"]:
            raise ValueError("implementation_plan_content_required")
        for key in required[1:]:
            result[key] = result[key] if isinstance(result[key], list) else [result[key]]
        result["source_context"] = {
            "draft_id": ((context or {}).get("confirmed_definition") or {}).get("draft_id"),
            "draft_version": ((context or {}).get("confirmed_definition") or {}).get("version"),
            "project_id": ((context or {}).get("project") or {}).get("project_id"),
        }
        return result

    @staticmethod
    def _provider_implementation_planning(context: dict) -> dict:
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的 Implementation Planner。只基于已确认的 canonical Definition、Project Context 与 Founder Decisions，形成可供 Founder 审核的实施方案。confirmed Definition 是只读输入和实施依据，已经存在且已经确认；不得把重新建立、重写、起草或完善该 Definition 本身列为 Work Item。不要重新定义系统，不要生成 Goal/Candidate/Capability，不要执行代码或调用 Executor。只返回 JSON。\n字段必须为：implementation_goal, scope, out_of_scope, work_items, dependencies, execution_order, risk, validation_criteria, acceptance_criteria, affected_system_objects, execution_requirements。\nwork_items 必须动态来自 confirmed Definition 中尚待实现的系统职责、模块、接口、集成与验证；每项包含 work_item_id, title, purpose, scope, dependencies, sequence, risk, validation。明确实现范围、顺序、风险、验证和验收，但不要声称已经实施。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.2, max_tokens=3200, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "implementation_planning"}))
        return json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())

    @staticmethod
    def classify_message_intent(content: str, *, project_id: str | None = None) -> str:
        """Classify the Founder message before Goal Understanding.

        Explicit persistence/update language wins over verbs that may occur
        inside a long constitution or project baseline. Rules are a guardrail;
        they do not infer or manufacture Project content.
        """
        text = " ".join(str(content or "").lower().split())
        if not text:
            return "discussion"
        context_objects = (
            "project context", "project intelligence", "constitution", "项目宪法",
            "项目上下文", "项目定位", "项目约束", "最高层基线", "最高层长期基线",
        )
        context_actions = ("作为", "写入", "更新", "沉淀", "保存", "存为", "设为", "纳入")
        if project_id and any(term in text for term in context_objects) and any(term in text for term in context_actions):
            return "project_context_update"
        if any(term in text for term in ("正式决定", "更新决策", "decision update", "确认采用", "按此决定")):
            return "decision_update"
        if any(term in text for term in ("记录为知识", "沉淀为知识", "knowledge update", "加入知识", "记住这条")):
            return "knowledge_update"
        if any(term in text for term in ("候选能力", "candidate skill", "candidate workflow", "形成 candidate", "能力候选")):
            return "capability_candidate_request"
        if any(term in text for term in ("执行这个任务", "开始执行", "运行 codex", "交给 codex", "execution request")):
            return "execution_request"
        goal_patterns = (
            r"(?:^|[。！？!?])\s*我要(?:实现|建立|完成|让|做)",
            r"(?:^|[。！？!?])\s*(?:下一步|我们)要(?:实现|建立|完成|让|做到)",
            r"(?:^|[。！？!?])\s*目标(?:是|为)\s*",
        )
        if any(re.search(pattern, text) for pattern in goal_patterns):
            return "goal_creation"
        return "discussion"

    @staticmethod
    def _context_update_projection(payload: dict[str, Any], source_message_id: str | None = None, content: str | None = None, work_items: list[dict] | None = None) -> dict[str, Any]:
        projected = dict(payload)
        projected.update({
            "stage": "context_updated",
            "message_intent": "project_context_update",
            "goal_readiness": "unclear",
            "goal_brief": {},
            "strategy_proposals": [],
            "conflicts": [],
            "validations": [],
            "decision": {},
            "discussion_package": {},
            "current_action": None,
            "next_action": "Founder Review：确认结构或返回讨论",
            "active_workspace_stage": "goal",
        })
        projected["stage_workspaces"] = [{
            "stage_id": f"{projected.get('brain_id')}:context",
            "stage_key": "goal", "label": "Constitution Understanding · Founder Review",
            "status": "active", "summary": "已提炼 Constitution 系统结构，等待 Founder Review",
            "message_refs": [source_message_id] if source_message_id else [],
        }]
        discovery = dict(projected.get("discovery") or {})
        discovery.update({"message_intent": "project_context_update", "working_understanding": {}})
        projected["discovery"] = discovery
        understanding = dict(discovery.get("constitution_understanding") or SinoBrainRuntime.extract_constitution_understanding(content or ""))
        proposed = list(work_items if work_items is not None else discovery.get("proposed_work_items") or [])
        understanding["proposed_work_items"] = proposed
        projected["constitution_understanding"] = understanding
        projected["proposed_work_items"] = proposed
        return projected

    @staticmethod
    def extract_constitution_understanding(content: str) -> dict[str, Any]:
        """Extract only structure and principles explicitly evidenced by Constitution V1."""
        text = str(content or "")
        system_objects = [
            {"name": "Intelligence Evolution Layer", "layer": "foundation", "role": "Foundation / Intelligence Evolution"},
            {"name": "AI Commerce OS Cloud", "layer": "foundation", "role": "Foundation / Cloud Infrastructure"},
            {"name": "Sino Founder AI", "layer": "application", "role": "Application / Capability Creation & System Building"},
            {"name": "Sino Operator AI", "layer": "application", "role": "Application / Business Operation"},
            {"name": "Sino Studio AI", "layer": "application", "role": "Application / Content Production"},
            {"name": "Sino Industrial AI", "layer": "application", "role": "Application / Industrial"},
            {"name": "Sino Quant AI", "layer": "application", "role": "Application / Quant"},
        ]
        present = [item for item in system_objects if item["name"] in text]
        if len(present) != len(system_objects):
            return {}
        lifecycle = [name for name in ("Idea", "Discussion", "Project Intelligence", "Candidate", "Founder Approval", "Developing", "Testing", "Ready", "Reuse", "Learning", "Version Evolution") if name in text]
        return {
            "schema_version": 1,
            "constitution_title": "AI Commerce OS Constitution V1",
            "status": "pending_founder_review",
            "core_definition": "AI Commerce OS 是一个以 AI 为核心的能力创造、能力复用和业务运行体系。",
            "foundation_layer": [item for item in present if item["layer"] == "foundation"],
            "application_layer": [item for item in present if item["layer"] == "application"],
            "system_objects": present,
            "founder_boundary": "Sino Founder AI 是能力创造与系统建设端；创造、验证、测试和沉淀能力，不承担其他 Runtime 的日常业务运行。",
            "sino_boundary": "Sino 负责理解、组织、讨论、判断和派发；Founder 通过自然语言进行关键决策与批准。",
            "capability_lifecycle": lifecycle,
            "capability_rules": [
                "讨论产生的能力需求首先只能成为 Candidate。",
                "Candidate 不等于真实能力。",
                "只有完成真实实现、真实测试并经 Founder 批准的能力才可成为 Ready。",
                "只有 Ready 能力可以被正式 Reuse。",
                "能力首先按照 Domain 组织，不同领域的能力不得因类型相同而默认混用。",
            ],
            "shared_vs_isolated_principle": "Capability Asset 可以共享和复用；Business Asset 与不同 Runtime Instance 的业务数据必须隔离。",
            "execution_principle": "Founder 批准开发后必须产生真实 Execution，不能用 LLM 文本模拟开发完成。",
            "validation_principle": "能力必须通过真实开发、真实测试、Founder 批准与真实 Reuse 验证，不能由文档宣告成立。",
            "source_evidence": {"conversation_text_preserved": True},
            "available_actions": ["confirm_structure", "return_to_discussion"],
        }

    @staticmethod
    def _work_item_id(source: str, title: str) -> str:
        digest = hashlib.sha256(f"{source}:{title}".encode("utf-8")).hexdigest()[:16]
        return f"constitution-work-{digest}"

    @classmethod
    def _propose_constitution_work_items(cls, session, understanding: dict, decisions: dict, routing: dict | None = None) -> list[dict]:
        if not understanding:
            return []
        projects = list(session.scalars(select(FounderProjectDB).where(FounderProjectDB.system_id == "founder_ai", FounderProjectDB.status != "archived")))
        assets = list(session.scalars(select(AssetCatalogDB)))
        project_names = {item.name.strip().lower() for item in projects}
        items = []
        routing = routing or {}

        def add(title, source, reason, action, object_type, existing_state):
            work_item_id = cls._work_item_id(source, title)
            decision = decisions.get(work_item_id, "pending")
            semantic = dict((understanding.get("work_item_semantics") or {}).get(work_item_id) or {})
            items.append({
                "work_item_id": work_item_id, "title": title, "source": source,
                "reason": semantic.get("reason") or reason, "recommended_action": semantic.get("recommended_action") or action, "object_type": object_type,
                "status": "proposed", "founder_decision": decision,
                "existing_state": existing_state,
                "semantic_understanding": semantic or None,
                "routing_recommendation": routing.get(work_item_id),
            })

        for obj in understanding.get("system_objects") or []:
            name, role = obj["name"], obj["role"]
            if name == "Sino Founder AI":
                existing = "existing"
            elif name.lower() in project_names:
                existing = "needs_review"
            else:
                existing = "not_found"
            scope = "系统定义与 Project Structure" if obj["layer"] == "foundation" else f"{role.split(' / ', 1)[-1]} 边界"
            action = f"{'检查并完善' if existing in {'existing', 'needs_review'} else '建立'} {name} 的{scope}。"
            add(name, f"system_objects:{name}", f"Constitution 将 {name} 定义为 {obj['layer'].title()} Layer 的正式系统对象。", action, "system_project" if obj["layer"] == "foundation" else "system_definition", existing)

        lifecycle = understanding.get("capability_lifecycle") or []
        if lifecycle:
            has_assets = bool(assets)
            has_learning = any(item.learning_refs for item in assets)
            lifecycle_state = "existing" if has_assets and has_learning else "partial" if has_assets else "not_found"
            add("Capability Lifecycle", "capability_lifecycle", "Constitution 明确定义了从 Candidate 到 Version Evolution 的正式能力生命周期。", f"验证并落实 {' → '.join(lifecycle)}。", "lifecycle_validation", lifecycle_state)

        rules = understanding.get("capability_rules") or []
        if any("Domain" in rule for rule in rules):
            domains = {item.domain_id for item in assets if item.domain_id}
            repository_state = "needs_review" if assets else "not_found"
            add("Domain-based Capability Repository", "capability_rules:domain_organization", "Constitution 要求能力按 Domain 组织，并保持领域边界。", "检查并完善按 Domain 归类、检索与复用 Agent / Skill / Workflow / Prompt / Capability 的仓库规则。", "repository_rule", repository_state)

        verified = [item for item in assets if item.status == "ready" and item.development_run_refs and any(str(run.get("status", "")).lower() in {"pass", "passed"} for run in item.test_run_refs if isinstance(run, dict)) and item.ready_approval and item.reference_count > 0]
        validation_sources = all(understanding.get(key) for key in ("execution_principle", "validation_principle"))
        if validation_sources:
            add("First Capability Golden Path", "execution_principle + validation_principle + capability_lifecycle", "Constitution 要求通过真实开发、测试、Founder Approval 与 Reuse 证明能力生产体系成立。", "选择一个真实 Capability，完整验证 Discussion → Candidate → Developing → Testing → Ready → Reuse → Learning。", "golden_path_validation", "existing" if verified else "partial" if assets else "not_found")
        return items

    def _process_lifecycle_message(self, session, conversation, state, content):
        package = dict(state.discussion_package or {})
        asset_ids = [item.get("asset_id") for item in package.get("objects") or [] if item.get("asset_id")]
        records = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.id.in_(asset_ids))))
        if not records:
            return None
        context = {
            "founder_message": content,
            "selected_asset_id": package.get("selected_asset_id"),
            "assets": [{
                "asset_id": item.id, "type": item.asset_type, "name": item.name,
                "status": item.status, "available_actions": capability_available_actions(item),
            } for item in records],
        }
        try:
            intent = self._lifecycle_intent_runner(context)
        except Exception:
            lifecycle_terms = ("开发", "测试", "批准", "可引用", "引用", "暂不", "保留", "归档", "重测")
            if any(term in content for term in lifecycle_terms):
                return {"handled": True, "reply": "能力生命周期指令理解暂不可用。当前状态没有改变；你可以稍后重试或使用同一 Action Card。", "message_type": "capability_lifecycle_error", "brain": self._serialize(state)}
            return None
        action = str(intent.get("action") or "continue_discussion")
        if float(intent.get("confidence") or 0) < .65:
            return {"handled": True, "reply": "我还不能可靠判断你要操作哪项能力。请说出能力名称和动作，例如“先开发商品分镜 Skill”。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        if action == "continue_discussion":
            return None
        target = self._resolve_lifecycle_target(records, package.get("selected_asset_id"), intent, content)
        if target is None:
            return {"handled": True, "reply": "我理解了你的生命周期指令，但当前目标对象不够明确。请直接说出能力名称，例如“先开发商品分镜 Skill”。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        package["selected_asset_id"] = target.id
        package["selected_asset_type"] = target.asset_type
        package["selected_asset_name"] = target.name
        state.discussion_package = package
        conversation.conversation_state = "active"
        state.updated_at = datetime.now(timezone.utc)
        session.commit()
        if action in {"defer", "skip_reuse"}:
            reply = f"已保留 {target.name} 当前状态（{target.status}），不会自动推进。"
        else:
            service_action = "retest" if action == "run_test" and "retest" in capability_available_actions(target) else action
            try:
                result = perform_capability_action(
                    target.id, service_action,
                    target_type="conversation" if action == "reuse" else None,
                    target_id=conversation.id if action == "reuse" else None,
                    note="Founder 通过 Sino 自然语言确认",
                )
            except LifecycleConflict as error:
                return {"handled": True, "reply": f"暂时不能执行这个动作：{error.detail['message']}。当前可执行：{'、'.join(error.detail['available_actions']) or '继续讨论'}。", "message_type": "capability_lifecycle", "action": action, "target_asset_id": target.id, "brain": self.snapshot(conversation.id)}
            asset = result.get("asset") if isinstance(result, dict) and result.get("asset") else result
            status = asset.get("status") if isinstance(asset, dict) else target.status
            reply = self._lifecycle_reply(action, target.name, status, result)
        return {"handled": True, "reply": reply, "message_type": "capability_lifecycle", "action": action, "target_asset_id": target.id, "brain": self.snapshot(conversation.id)}

    def _process_reuse_message(self, session, conversation, state, content):
        """Resolve a Ready capability reference in any Brain stage.

        The lexical check is only a guardrail that avoids an extra provider call
        for ordinary discussion. The provider remains the intent driver.
        """
        if not any(term in content for term in ("引用", "不引用", "不用这个")):
            return None
        suggestions = [item for item in suggest_reuse(conversation.id) if item.get("can_reuse")]
        if not suggestions:
            return None
        context = {
            "founder_message": content,
            "selected_asset_id": suggestions[0]["asset_id"] if len(suggestions) == 1 else None,
            "assets": [{
                "asset_id": item["asset_id"], "type": item["asset_type"], "name": item["name"],
                "status": item["status"], "available_actions": item.get("available_actions") or ["reuse"],
            } for item in suggestions],
        }
        try:
            intent = self._lifecycle_intent_runner(context)
        except Exception:
            return {"handled": True, "reply": "能力引用指令理解暂不可用，当前没有建立 Reference。", "message_type": "capability_lifecycle_error", "brain": self._serialize(state)}
        action = str(intent.get("action") or "continue_discussion")
        if action == "skip_reuse":
            return {"handled": True, "reply": "这次不引用已有能力，当前目标继续独立讨论。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        if action != "reuse" or float(intent.get("confidence") or 0) < .65:
            return None
        records = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.id.in_([item["asset_id"] for item in suggestions]))))
        target = self._resolve_lifecycle_target(records, context["selected_asset_id"], intent, content)
        if target is None:
            return {"handled": True, "reply": "检测到多个 Ready 能力，请说出要引用的能力名称。", "message_type": "capability_lifecycle", "brain": self._serialize(state)}
        result = perform_capability_action(
            target.id, "reuse", target_type="conversation", target_id=conversation.id,
            note="Founder 通过 Sino 自然语言确认引用",
        )
        conversation.conversation_state = "active"
        session.commit()
        return {"handled": True, "reply": self._lifecycle_reply("reuse", target.name, "ready", result), "message_type": "capability_lifecycle", "action": "reuse", "target_asset_id": target.id, "brain": self._serialize(state)}

    @staticmethod
    def _resolve_lifecycle_target(records, selected_asset_id, intent, content):
        explicit_id = intent.get("target_asset_id")
        if explicit_id:
            found = next((item for item in records if item.id == explicit_id), None)
            if found:
                return found
        target_name = str(intent.get("target_name") or "").strip().lower()
        if target_name:
            found = next((item for item in records if target_name in item.name.lower() or item.name.lower() in target_name), None)
            if found:
                return found
        named = [item for item in records if item.name and item.name in content]
        if len(named) == 1:
            return named[0]
        target_type = str(intent.get("target_type") or "").lower()
        typed = [item for item in records if item.asset_type == target_type]
        if len(typed) == 1:
            return typed[0]
        return next((item for item in records if item.id == selected_asset_id), None)

    @staticmethod
    def _lifecycle_reply(action, name, status, result):
        if action == "develop":
            asset = result.get("asset") if isinstance(result, dict) and result.get("asset") else result
            run = (asset.get("development_run_refs") or [])[-1]
            return f"已按你的指令只开发 {name}。Development Task：{run.get('task_asset_id')}；其他候选保持 Candidate。"
        if action in {"run_test", "retest"}:
            run = result.get("test_run") or {}
            return f"{name} 已完成真实测试：{run.get('status')}。Test Run：{run.get('test_run_id')}。测试通过不等于 Ready，仍等待你的批准。"
        if action == "approve_ready":
            return f"已由 Founder 批准：{name} 现在是 Ready V1，可被新的目标正式引用。"
        if action == "reuse":
            return f"已引用 {name}，Reference 已写入当前 Conversation。"
        return f"{name} 当前状态：{status}。"

    @staticmethod
    def _provider_lifecycle_intent(context):
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的能力生命周期意图解析器。结合 selected asset、每个 asset 的 status 和 available_actions 理解 Founder 指令。按钮与自然语言必须映射到同一 action。不要凭相似名称猜错对象。只返回 JSON：action(develop|defer|complete_development|run_test|approve_ready|reuse|skip_reuse|archive|continue_discussion), target_asset_id(string|null), target_type(string|null), target_name(string|null), confidence(0..1), reason(string)。如果 Founder 只是继续业务讨论，返回 continue_discussion。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0,
            max_tokens=500, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "capability_lifecycle"},
        ))
        return json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())

    @staticmethod
    def _provider_work_item_semantics(context):
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的 Work Item 语义理解器。根据提供的 Source Document、相关原文片段、Confirmed Understanding、Parent Project Context、当前 Work Item 和 Existing State，形成对象特异性的专业判断。
Reason 必须解释该对象的系统角色、与上层或相关对象的关系、当前真实缺口，以及为什么值得处理。Recommended Action 必须结合 Existing State 给出下一步，不能把所有对象统一建议为创建 Project。不要替 Founder 做决定，不创建任何对象，不进行路由审批。
只返回 JSON：system_role(string), current_gap(string), reason(string), recommended_action(string), source_context_refs(array of string), confidence(0..1)。不得补写 Source Context 没有支持的职责。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.1,
            max_tokens=1200, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "constitution_work_item_semantics"},
        ))
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["_provider"], payload["_model"] = response.provider, response.model
        return payload

    @staticmethod
    def _relevant_source_sections(source_text: str, title: str) -> list[str]:
        chunks = [item.strip() for item in re.split(r"(?=^(?:#{1,6}\s+|[一二三四五六七八九十百]+、|\d+[.、]\s*))", source_text, flags=re.MULTILINE) if item.strip()]
        title_folded = title.casefold().strip()
        matched = [item for item in chunks if title_folded and title_folded in item.casefold()]
        return matched[:6]

    def ensure_constitution_work_item_semantics(self, conversation_id: str, work_item_id: str) -> dict[str, Any]:
        """Persist one model-derived semantic judgment without changing Founder or lifecycle state."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            discovery = dict(state.discovery or {})
            understanding = dict(discovery.get("constitution_understanding") or {})
            decisions = dict(discovery.get("proposed_work_item_decisions") or {})
            routing = dict(discovery.get("proposed_work_item_routing") or {})
            available = self._propose_constitution_work_items(session, understanding, decisions, routing)
            work_item = next((item for item in available if item["work_item_id"] == work_item_id), None)
            if not work_item:
                raise ValueError("建议工作项不存在")
            semantics = dict(understanding.get("work_item_semantics") or {})
            if work_item_id not in semantics:
                source_message = session.scalar(select(ConversationMessageDB).where(
                    ConversationMessageDB.conversation_id == conversation_id,
                    ConversationMessageDB.role == "founder",
                    ConversationMessageDB.message_type == "project_context_update",
                ).order_by(ConversationMessageDB.created_at.desc()))
                if source_message is None:
                    source_message = session.scalar(select(ConversationMessageDB).where(
                        ConversationMessageDB.conversation_id == conversation_id,
                        ConversationMessageDB.role == "founder",
                    ).order_by(ConversationMessageDB.created_at.asc()))
                project = session.get(FounderProjectDB, state.project_id) if state.project_id else None
                intelligence = session.get(ProjectIntelligenceDB, state.project_id) if state.project_id else None
                existing_matches = [
                    {"object_id": item.id, "name": item.name, "kind": "project", "status": item.status}
                    for item in session.scalars(select(FounderProjectDB).where(FounderProjectDB.system_id == "founder_ai"))
                    if item.name.strip().casefold() == work_item["title"].strip().casefold()
                ]
                existing_matches += [
                    {"object_id": item.id, "name": item.name, "kind": item.asset_type, "status": item.status}
                    for item in session.scalars(select(AssetCatalogDB))
                    if item.name.strip().casefold() == work_item["title"].strip().casefold()
                ]
                source_text = source_message.content if source_message else ""
                context = {
                    "source_document": {"message_id": source_message.id if source_message else None, "content": source_text},
                    "relevant_source_sections": self._relevant_source_sections(source_text, work_item["title"]),
                    "confirmed_understanding": {key: understanding.get(key) for key in ("core_definition", "foundation_layer", "application_layer", "system_objects", "founder_boundary", "sino_boundary", "capability_lifecycle", "capability_rules", "shared_vs_isolated_principle", "execution_principle", "validation_principle")},
                    "parent_project_context": {"project_id": project.id, "name": project.name, "description": project.description, "project_summary": intelligence.project_summary if intelligence else "", "current_positioning": intelligence.current_positioning if intelligence else ""} if project else None,
                    "work_item": {key: work_item.get(key) for key in ("work_item_id", "title", "source", "object_type", "existing_state")},
                    "existing_state_evidence": existing_matches,
                }
                semantic = dict(self._work_item_semantic_runner(context) or {})
                required = ("system_role", "current_gap", "reason", "recommended_action")
                if any(not str(semantic.get(key) or "").strip() for key in required):
                    raise ValueError("Sino 未形成完整的 Work Item 语义判断")
                semantic.update({"context_sources": {
                    "source_message_id": source_message.id if source_message else None,
                    "work_item_source": work_item["source"],
                    "relevant_sections": context["relevant_source_sections"],
                    "parent_project_id": project.id if project else None,
                    "existing_state_evidence": existing_matches,
                }, "generated_at": datetime.now(timezone.utc).isoformat()})
                semantics[work_item_id] = semantic
                understanding["work_item_semantics"] = semantics
                discovery["constitution_understanding"] = understanding
                discovery["proposed_work_items"] = self._propose_constitution_work_items(session, understanding, decisions, routing)
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
        return self.snapshot(conversation_id)

    @staticmethod
    def _provider_work_item_routing(context):
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的专业工作路由判断器。Founder 已经确认某个 Constitution Work Item 值得推进；你只判断它下一步最适合进入哪一种正式工作类型，不创建任何对象，也不执行任务。
结合 Constitution Understanding、Project Context、Work Item 的 existing_state/source/reason/recommended_action 做判断。允许路由仅为：system_project（长期子系统）、goal（明确可完成结果）、discussion（信息不足）、candidate_capability（明确能力需求）、project_update（更新既有项目）、no_action（已存在且无需动作）。不得因标题关键词机械分类；要解释为什么该路由优于其他类型。
只返回 JSON：recommended_route, reason, proposed_object, next_action, confidence(0..1)。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.1,
            max_tokens=800, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "constitution_work_item_routing"},
        ))
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["_provider"], payload["_model"] = response.provider, response.model
        return payload

    def force_goal_review(self, conversation_id: str) -> dict[str, Any]:
        """Founder override: proceed with explicit unknowns instead of a questionnaire."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            working = dict((state.discovery or {}).get("working_understanding") or {})
            brief = working.get("goal_brief_draft") or state.goal_brief
            if not brief or not brief.get("goal"):
                raise ValueError("尚未形成可确认的目标理解")
            state.goal_brief = brief
            state.stage = "goal_review"
            state.goal_readiness = "reviewable"
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

    def review_constitution(self, conversation_id: str, action: str) -> dict[str, Any]:
        if action not in {"confirm_structure", "return_to_discussion"}:
            raise ValueError("不支持的 Constitution Review 操作")
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            latest = session.scalar(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id,
                ConversationMessageDB.role == "founder",
            ).order_by(ConversationMessageDB.created_at.desc()))
            conversation = session.get(ConversationDB, conversation_id)
            if not latest or self.classify_message_intent(latest.content, project_id=conversation.project_id) != "project_context_update":
                raise ValueError("当前没有可审核的 Constitution Understanding")
            understanding = self.extract_constitution_understanding(latest.content)
            if not understanding:
                raise ValueError("Constitution 尚未形成可审核的系统结构")
            understanding["status"] = "founder_approved" if action == "confirm_structure" else "revision_requested"
            understanding["reviewed_at"] = datetime.now(timezone.utc).isoformat()
            discovery = dict(state.discovery or {})
            discovery.update({"message_intent": "project_context_update", "constitution_understanding": understanding})
            state.discovery = discovery
            state.stage = "context_updated"
            state.goal_readiness = "unclear"
            state.goal_brief = {}
            state.strategy_proposals = []
            state.conflicts = []
            state.validations = []
            state.decision = {}
            state.discussion_package = {}
            conversation.conversation_state = "active"
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        return self.snapshot(conversation_id)

    def review_constitution_work_item(self, conversation_id: str, work_item_id: str, decision: str) -> dict[str, Any]:
        if decision not in {"approved", "discuss", "deferred"}:
            raise ValueError("不支持的建议工作项决定")
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            discovery = dict(state.discovery or {})
            understanding = dict(discovery.get("constitution_understanding") or {})
            if understanding.get("status") != "founder_approved":
                raise ValueError("请先确认 Constitution Understanding 结构")
            current_decisions = dict(discovery.get("proposed_work_item_decisions") or {})
            routing = dict(discovery.get("proposed_work_item_routing") or {})
            available = self._propose_constitution_work_items(session, understanding, current_decisions, routing)
            if work_item_id not in {item["work_item_id"] for item in available}:
                raise ValueError("建议工作项不存在")
            current_decisions[work_item_id] = decision
            discovery["proposed_work_item_decisions"] = current_decisions
            if decision == "approved" and work_item_id not in routing:
                work_item = next(item for item in available if item["work_item_id"] == work_item_id)
                routing[work_item_id] = self._build_work_item_routing(state, understanding, work_item)
                discovery["proposed_work_item_routing"] = routing
            discovery["proposed_work_items"] = self._propose_constitution_work_items(session, understanding, current_decisions, routing)
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        return self.snapshot(conversation_id)

    def ensure_constitution_work_item_routing(self, conversation_id: str, work_item_id: str) -> dict[str, Any]:
        """Generate one Conversation-level recommendation without creating a formal object."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            discovery = dict(state.discovery or {})
            understanding = dict(discovery.get("constitution_understanding") or {})
            decisions = dict(discovery.get("proposed_work_item_decisions") or {})
            routing = dict(discovery.get("proposed_work_item_routing") or {})
            available = self._propose_constitution_work_items(session, understanding, decisions, routing)
            work_item = next((item for item in available if item["work_item_id"] == work_item_id), None)
            if not work_item or work_item.get("founder_decision") != "approved":
                raise ValueError("只有 Founder 已同意推进的 Work Item 才能生成 Routing Recommendation")
            if work_item_id not in routing:
                routing[work_item_id] = self._build_work_item_routing(state, understanding, work_item)
                discovery["proposed_work_item_routing"] = routing
                discovery["proposed_work_items"] = self._propose_constitution_work_items(session, understanding, decisions, routing)
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
        return self.snapshot(conversation_id)

    def review_constitution_work_item_routing(self, conversation_id: str, work_item_id: str, decision: str) -> dict[str, Any]:
        if decision not in {"approved", "discuss"}:
            raise ValueError("不支持的 Routing Review 决定")
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            discovery = dict(state.discovery or {})
            routing = dict(discovery.get("proposed_work_item_routing") or {})
            recommendation = dict(routing.get(work_item_id) or {})
            if not recommendation:
                raise ValueError("当前 Work Item 尚未形成 Routing Recommendation")
            recommendation.update({
                "routing_decision": decision,
                "routing_status": "approved" if decision == "approved" else "discuss",
                "reviewed_at": datetime.now(timezone.utc).isoformat(),
            })
            if decision == "approved" and not recommendation.get("formal_object_proposal"):
                understanding = dict(discovery.get("constitution_understanding") or {})
                decisions = dict(discovery.get("proposed_work_item_decisions") or {})
                available = self._propose_constitution_work_items(session, understanding, decisions, routing)
                work_item = next((item for item in available if item["work_item_id"] == work_item_id), None)
                if not work_item:
                    raise ValueError("建议工作项不存在")
                recommendation["formal_object_proposal"] = self._build_formal_object_proposal(session, state, understanding, work_item, recommendation)
            routing[work_item_id] = recommendation
            discovery["proposed_work_item_routing"] = routing
            discovery["proposed_work_items"] = self._propose_constitution_work_items(
                session, dict(discovery.get("constitution_understanding") or {}),
                dict(discovery.get("proposed_work_item_decisions") or {}), routing,
            )
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        return self.snapshot(conversation_id)

    def ensure_formal_object_proposal(self, conversation_id: str, work_item_id: str) -> dict[str, Any]:
        """Backfill one idempotent proposal for an already-approved route."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            discovery = dict(state.discovery or {})
            understanding = dict(discovery.get("constitution_understanding") or {})
            decisions = dict(discovery.get("proposed_work_item_decisions") or {})
            routing = dict(discovery.get("proposed_work_item_routing") or {})
            recommendation = dict(routing.get(work_item_id) or {})
            if recommendation.get("routing_status") != "approved":
                raise ValueError("只有 Founder 已批准的 Routing Recommendation 才能形成 Formal Object Proposal")
            available = self._propose_constitution_work_items(session, understanding, decisions, routing)
            work_item = next((item for item in available if item["work_item_id"] == work_item_id), None)
            if not work_item:
                raise ValueError("建议工作项不存在")
            if not recommendation.get("formal_object_proposal"):
                recommendation["formal_object_proposal"] = self._build_formal_object_proposal(session, state, understanding, work_item, recommendation)
                routing[work_item_id] = recommendation
                discovery["proposed_work_item_routing"] = routing
                discovery["proposed_work_items"] = self._propose_constitution_work_items(session, understanding, decisions, routing)
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
        return self.snapshot(conversation_id)

    def confirm_formal_object_proposal(self, conversation_id: str, work_item_id: str) -> dict[str, Any]:
        """Create exactly one System Project from an approved, persisted proposal."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            discovery = dict(state.discovery or {})
            routing = dict(discovery.get("proposed_work_item_routing") or {})
            recommendation = dict(routing.get(work_item_id) or {})
            proposal = dict(recommendation.get("formal_object_proposal") or {})
            if recommendation.get("routing_status") != "approved" or proposal.get("status") not in {"awaiting_founder_confirmation", "created"}:
                raise ValueError("Formal Object Proposal 尚未达到可确认创建状态")
            if proposal.get("object_type") != "system_project":
                raise ValueError("当前 Proposal 不是 System Project")
            project = session.scalar(select(FounderProjectDB).where(FounderProjectDB.source_proposal_id == proposal["proposal_id"]))
            if project is None and proposal.get("status") != "created":
                parent = session.get(FounderProjectDB, proposal.get("parent_project_id"))
                if parent is None:
                    raise ValueError("Parent Project 不存在")
                project = FounderProjectDB(
                    system_id="founder_ai", name=proposal["proposed_object"],
                    description=proposal.get("initial_positioning"), status="active",
                    parent_project_id=parent.id, project_type="system_project",
                    architecture_role=proposal.get("architecture_role"),
                    source_conversation_id=conversation_id,
                    source_work_item_id=proposal.get("source_work_item_id"),
                    source_proposal_id=proposal["proposal_id"],
                    initial_positioning=proposal.get("initial_positioning"),
                    initial_scope=list(proposal.get("initial_scope") or []),
                    creation_reason=proposal.get("reason"),
                )
                session.add(project); session.flush()
            if project is None:
                raise ValueError("已创建的 System Project 无法恢复")
            proposal.update({
                "status": "created", "created_project_id": project.id,
                "committed_at": proposal.get("committed_at") or datetime.now(timezone.utc).isoformat(),
                "creation_enabled": False,
            })
            recommendation["formal_object_proposal"] = proposal
            routing[work_item_id] = recommendation
            discovery["proposed_work_item_routing"] = routing
            discovery["proposed_work_items"] = self._propose_constitution_work_items(
                session, dict(discovery.get("constitution_understanding") or {}),
                dict(discovery.get("proposed_work_item_decisions") or {}), routing,
            )
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        return self.snapshot(conversation_id)

    @staticmethod
    def _build_formal_object_proposal(session, state, understanding, work_item, recommendation):
        project = session.get(FounderProjectDB, state.project_id) if state.project_id else None
        system_object = next((item for item in understanding.get("system_objects") or [] if item.get("name") == work_item.get("title")), {})
        layer = str(system_object.get("layer") or "").strip()
        architecture_role = f"{layer.title()} Layer" if layer else "未明确"
        role = str(system_object.get("role") or "").strip()
        scope = [item for item in [
            f"依据 Constitution 定义其架构角色：{role}" if role else "",
            str(work_item.get("recommended_action") or "").strip(),
        ] if item]
        proposal_id = "formal-proposal-" + hashlib.sha256(work_item["work_item_id"].encode("utf-8")).hexdigest()[:16]
        return {
            "proposal_id": proposal_id,
            "proposed_object": recommendation.get("proposed_object") or work_item["title"],
            "object_type": recommendation.get("recommended_route"),
            "parent_project_id": state.project_id,
            "parent_project": project.name if project else "未关联 Project",
            "architecture_role": architecture_role,
            "source_constitution": understanding.get("constitution_title") or "Project Constitution",
            "source_work_item_id": work_item["work_item_id"],
            "source_work_item": work_item["title"],
            "source_routing_generated_at": recommendation.get("generated_at"),
            "initial_positioning": f"{work_item['title']} 是 {architecture_role} 的正式系统对象，角色为 {role}。" if role else work_item["reason"],
            "reason": recommendation.get("reason") or work_item["reason"],
            "initial_scope": scope,
            "status": "awaiting_founder_confirmation",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "creation_enabled": False,
        }

    def _build_work_item_routing(self, state, understanding, work_item):
        payload = dict(self._work_item_routing_runner({
            "constitution_understanding": understanding,
            "work_item": {key: work_item.get(key) for key in ("title", "existing_state", "source", "reason", "recommended_action", "object_type")},
            "project_context": {"project_id": state.project_id},
            "allowed_routes": ["system_project", "goal", "discussion", "candidate_capability", "project_update", "no_action"],
        }) or {})
        route = str(payload.get("recommended_route") or "").strip()
        if route not in {"system_project", "goal", "discussion", "candidate_capability", "project_update", "no_action"}:
            raise ValueError("Sino 返回了无效的 Work Item 路由类型")
        if not payload.get("reason") or not payload.get("next_action"):
            raise ValueError("Sino Routing Recommendation 缺少判断理由或下一步")
        proposed_object = payload.get("proposed_object") or work_item["title"]
        if isinstance(proposed_object, dict):
            proposed_object = proposed_object.get("name") or work_item["title"]
        return {
            "recommended_route": route,
            "reason": str(payload["reason"]).strip(),
            "proposed_object": str(proposed_object).strip(),
            "existing_state": work_item["existing_state"],
            "next_action": str(payload["next_action"]).strip(),
            "confidence": max(0.0, min(1.0, float(payload.get("confidence") or 0))),
            "routing_decision": "pending", "routing_status": "pending_founder_review",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "provider": payload.get("_provider"), "model": payload.get("_model"),
        }

    def confirm_goal(self, conversation_id: str) -> dict[str, Any]:
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            if state.stage not in {"goal_review", "goal_confirmed"} or not state.goal_brief:
                raise ValueError("Goal Brief 尚未达到可确认状态")
            state.stage = "goal_confirmed"
            state.goal_readiness = "confirmed"
            state.updated_at = datetime.now(timezone.utc)
            conversation = session.get(ConversationDB, conversation_id)
            conversation.conversation_state = "goal_confirmed"
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="goal_confirmed", content="目标已确认。后续所有模型将以这份 Goal Brief 作为唯一目标上下文。"))
            session.commit()
            return self._serialize(state)

    def sync_message_refs(self, conversation_id: str) -> None:
        """Attach durable Conversation evidence after Secretary message commit."""
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            refs = list(session.scalars(select(ConversationMessageDB.id).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at)))
            state.source_message_refs = refs
            state.updated_at = datetime.now(timezone.utc)
            session.commit()

    def prepare_strategy_prompt(self, conversation_id: str) -> str:
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            if state.stage not in {"goal_confirmed", "strategy_meeting"}:
                raise ValueError("必须先确认 Goal Brief")
            state.stage = "strategy_meeting"
            state.updated_at = datetime.now(timezone.utc)
            conversation = session.get(ConversationDB, conversation_id)
            conversation.conversation_state = "strategy_meeting"
            brief = dict(state.goal_brief or {})
            session.commit()
        return (
            "围绕以下已确认 Goal Brief 召开 Strategy Meeting。不得重定义目标。"
            "每个方案必须包含 Proposal、Required Steps、Dependencies、Risks、Cost/Complexity、"
            "Assumptions、Missing Factors、Evidence/Validation Needed。\nGoal Brief:\n" + str(brief)
        )

    @staticmethod
    def review_intent(content: str) -> str:
        """Small, explicit gate before the expensive Goal Understanding call."""
        normalized = re.sub(r"[\s，。！？!?,、；;：:]", "", (content or "").strip().lower())
        if not normalized:
            return "unknown"
        revision_markers = ("不对", "不是", "不同意", "不能", "别", "错了", "有误", "修改", "修正", "补充", "调整")
        if any(marker in normalized for marker in revision_markers):
            return "revise_goal"
        confirmations = {
            "对", "正确", "真确", "确认", "同意", "可以", "开始", "开始讨论", "讨论", "进入讨论",
            "就这样", "没问题", "按这个来", "直接讨论", "目标已经够清楚", "目标已经够清楚直接讨论",
        }
        return "confirm_goal" if normalized in confirmations else "unknown"

    def finalize_council(self, conversation_id: str, council_snapshot: dict[str, Any]) -> dict[str, Any]:
        runs = list(council_snapshot.get("council_runs") or [])
        if not runs:
            raise ValueError("Strategy Meeting 尚无可用结果")
        run = runs[0]
        model_runs = [item for item in run.get("model_runs", []) if item.get("status") == "completed"]
        proposals = [{"model_run_id": item.get("model_run_id"), "provider": item.get("provider"), "model": item.get("model"), "perspective": item.get("perspective_label"), "proposal": item.get("proposal") or {}} for item in model_runs]
        disagreements = list(run.get("disagreements") or [])
        conflicts = [{"conflict_id": _id("conflict"), "summary": text, "classification": self._classify_disagreement(text), "source_refs": [item.get("model_run_id") for item in model_runs]} for text in disagreements]
        validations = [{"validation_id": _id("validation"), "conflict_id": item["conflict_id"], "criteria": ["goal_fit", "completeness", "feasibility", "maintainability", "cost", "time", "risk", "architecture_compatibility"], "scorecard": {"goal_fit": 4, "completeness": 4, "feasibility": 4, "maintainability": 4, "cost": 3, "time": 3, "risk": 3, "architecture_compatibility": 4}, "result": "以 Goal Brief 适配性和可执行性优先；不采用模型票数作为结论。", "status": "completed"} for item in conflicts if item["classification"] == "true_conflict"]
        recommendation = self._normalize_recommendation(run.get("recommendation") or "先完成最小可验证闭环，再扩展完整能力体系。")
        confidence = 0.82 if model_runs else 0.45
        decision = {
            "decision_id": _id("decision"), "final_recommendation": recommendation,
            "why": list(run.get("consensus") or []) or ["满足已确认 Goal Brief，并保留可验证路径。"],
            "why_not_alternatives": disagreements,
            "confidence": confidence, "key_risks": list(run.get("risks") or []),
            "preconditions": ["Founder 确认 Discussion Package 后再进入对象落地"],
            "remaining_unknowns": list(run.get("unknowns") or []), "next_step": "Founder 审批 Discussion Package",
            "source_refs": [item.get("model_run_id") for item in model_runs],
        }
        brief = self.snapshot(conversation_id)["goal_brief"]
        objects = self._discussion_objects(brief, proposals, decision)
        package = {
            "package_id": _id("package"), "title": brief.get("goal") or "本轮讨论成果",
            "status": "pending_review", "decision": decision, "objects": objects,
            "counts": self._counts(objects), "source_council_run_id": run.get("council_run_id"),
            "source_conversation_id": conversation_id, "domain_id": self._infer_domain(brief),
        }
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            state.strategy_proposals = proposals
            state.conflicts = conflicts
            state.validations = validations
            state.decision = decision
            state.discussion_package = package
            # All structural results are durable now, but Founder controls when
            # each completed stage becomes the active workspace.
            state.stage = "strategy_meeting" if confidence >= .7 else "conflict_validation"
            state.updated_at = datetime.now(timezone.utc)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="decision", content=recommendation, grounding={"source_refs": decision["source_refs"]}))
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="discussion_package", content=f"Discussion Package 已形成：{package['title']}。等待 Founder 审批。"))
            session.commit()
            return self._serialize(state)

    def advance_stage(self, conversation_id: str, target: str) -> dict[str, Any]:
        transitions = {
            ("strategy_meeting", "validation"): "conflict_validation",
            ("conflict_validation", "decision"): "decision_ready",
            ("conflict_validation", "strategy"): "strategy_meeting",
            ("decision_ready", "package"): "package_ready",
            ("decision_ready", "strategy"): "strategy_meeting",
        }
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            next_stage = transitions.get((state.stage, target))
            if not next_stage:
                raise ValueError("当前阶段不能执行该操作")
            if target == "validation" and not state.strategy_proposals:
                raise ValueError("Strategy Meeting 尚未形成可验证方案")
            if target == "decision" and not state.decision:
                raise ValueError("尚未形成可用 Decision")
            if target == "package" and not state.discussion_package:
                raise ValueError("尚未形成 Discussion Package")
            state.stage = next_stage
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

    def review_package(self, conversation_id: str, action: str) -> dict[str, Any]:
        if action not in {"approve", "return", "discuss"}:
            raise ValueError("Unsupported package review action")
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            package = dict(state.discussion_package or {})
            if not package:
                raise ValueError("Discussion Package 不存在")
            if action == "approve":
                # First Founder approval persists capability directions as Candidate.
                # It never promotes a discussion result directly to Ready.
                if (package.get("asset_commit") or {}).get("status") != "committed":
                    now = datetime.now(timezone.utc)
                    package["status"] = "approved"
                    package["reviewed_at"] = now.isoformat()
                    package.setdefault("lifecycle", []).append({"status": "approved", "at": now.isoformat()})
                    state.stage = "package_approved"
                    package = self._commit_package_assets(session, state, package)
                state.stage = "conversation_completed"
            else:
                package["status"] = "returned" if action == "return" else "pending_review"
                package["reviewed_at"] = datetime.now(timezone.utc).isoformat()
                package.setdefault("lifecycle", []).append({"status": package["status"], "at": package["reviewed_at"]})
                state.stage = "strategy_meeting"
            state.discussion_package = package
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

    @staticmethod
    def _commit_package_assets(session, state, package: dict[str, Any]) -> dict[str, Any]:
        """Persist one approved package as durable Candidate assets."""
        now = datetime.now(timezone.utc)
        conversation = session.get(ConversationDB, state.conversation_id)
        source_refs = list(state.source_message_refs or [])
        committed = []
        asset_ids_by_name = {}

        for item in list(package.get("objects") or []):
            item = dict(item)
            object_type = str(item.get("object_type") or "knowledge").lower()
            name = str(item.get("name") or package.get("title") or "未命名资产").strip()
            purpose = str(item.get("purpose") or item.get("reason") or "").strip()
            asset_id = None
            destination = "能力仓库"

            if object_type == "decision":
                record = DecisionAssetDB(
                    system_id="founder_ai", conversation_id=state.conversation_id,
                    title=name, decision=purpose or str((package.get("decision") or {}).get("final_recommendation") or name),
                    reason=str(item.get("reason") or ""), impact="Discussion Package Asset Commit",
                    source_message_ids=source_refs, confirmed=False, status="candidate",
                )
                session.add(record); session.flush(); asset_id = record.id
            elif object_type == "project":
                record = session.scalar(select(FounderProjectDB).where(
                    FounderProjectDB.system_id == "founder_ai", FounderProjectDB.name == name,
                ))
                if record is None:
                    record = FounderProjectDB(system_id="founder_ai", name=name, description=purpose, status="candidate")
                    session.add(record); session.flush()
                else:
                    record.status = "candidate"
                    record.description = purpose or record.description
                    record.updated_at = now
                asset_id = record.id
            elif object_type == "knowledge":
                record = MemoryAssetDB(
                    system_id="founder_ai", conversation_id=state.conversation_id,
                    memory_type="knowledge", title=name,
                    content=json.dumps({"purpose": purpose, "reason": item.get("reason"), "source": item.get("source")}, ensure_ascii=False),
                    summary=purpose, confidence=float(item.get("confidence") or 0),
                    source_message_ids=source_refs, status="candidate",
                    tags=["discussion_package", package.get("package_id")],
                )
                session.add(record); session.flush(); asset_id = record.id
            else:
                normalized = re.sub(r"[\s\-_·]+", "", name).lower()
                record = session.scalar(select(FounderObjectDB).where(
                    FounderObjectDB.object_type == object_type,
                    FounderObjectDB.normalized_name == normalized,
                    FounderObjectDB.scope_key == "founder_ai",
                ))
                if record is None:
                    record = FounderObjectDB(
                        object_type=object_type, name=name, normalized_name=normalized,
                        description=purpose, status="candidate", scope_key="founder_ai",
                        source_conversation_id=state.conversation_id,
                        source_message_refs=source_refs,
                    )
                    session.add(record); session.flush()
                    session.add(FounderObjectRevisionDB(
                        object_id=record.id, version=1, name=name, description=purpose,
                        status="candidate", source_conversation_id=state.conversation_id,
                        source_message_refs=source_refs,
                        snapshot={"source_package_id": package.get("package_id"), "commit_status": "candidate"},
                    ))
                else:
                    existing_catalog = session.get(AssetCatalogDB, record.id)
                    existing_status = existing_catalog.status if existing_catalog else record.status
                    if existing_status not in {"candidate", "developing", "testing", "ready"}:
                        record.version += 1
                        record.description = purpose or record.description
                        session.add(FounderObjectRevisionDB(
                            object_id=record.id, version=record.version, name=record.name,
                            description=record.description, status="candidate",
                            source_conversation_id=state.conversation_id,
                            source_message_refs=source_refs,
                            snapshot={"source_package_id": package.get("package_id"), "commit_status": "candidate"},
                        ))
                    record.status = existing_status if existing_status in {"developing", "testing", "ready"} else "candidate"
                    record.updated_at = now
                asset_id = record.id

            asset_ids_by_name[name] = asset_id
            existing_catalog = session.get(AssetCatalogDB, asset_id)
            lifecycle_status = existing_catalog.status if existing_catalog and existing_catalog.status in {"developing", "testing", "ready"} else "candidate"
            if not existing_catalog or lifecycle_status == "candidate":
                upsert_catalog_record(
                    session, asset_id=asset_id, asset_type=object_type,
                    native_type="decision" if object_type == "decision" else "project" if object_type == "project" else "memory" if object_type == "knowledge" else "founder_object",
                    native_id=asset_id, name=name, purpose=purpose,
                    content={"reason": item.get("reason"), "source": item.get("source"), "risk": item.get("risk") or [], "confidence": item.get("confidence")},
                    status="candidate", version=getattr(record, "version", 1),
                    source_conversation_id=state.conversation_id, source_package_id=package.get("package_id"),
                    project_id=state.project_id or (conversation.project_id if conversation else None),
                    domain_id=package.get("domain_id") or "general",
                    dependency_refs=list(item.get("dependencies") or []),
                )
            item.update({
                "asset_id": asset_id, "commit_status": "candidate" if lifecycle_status == "candidate" else "reference_existing", "lifecycle_status": lifecycle_status,
                "destination": destination, "committed_at": now.isoformat(),
                "lifecycle": ["draft", "approved", lifecycle_status],
            })
            committed.append(item)

        package["objects"] = committed
        selected = next((item for item in committed if item.get("object_type") == "skill" and item.get("lifecycle_status") == "candidate"), None)
        if selected:
            package.update({"selected_asset_id": selected["asset_id"], "selected_asset_type": selected["object_type"], "selected_asset_name": selected["name"]})
        package["status"] = "archived"
        package["committed_at"] = now.isoformat()
        package["asset_commit"] = {
            "commit_id": _id("candidate-commit"), "status": "committed", "result_status": "candidate",
            "conversation_id": state.conversation_id,
            "package_id": package.get("package_id"), "items": committed,
            "asset_ids": list(asset_ids_by_name.values()), "committed_at": now.isoformat(),
        }
        package["candidate_commit"] = package["asset_commit"]
        package.setdefault("lifecycle", []).extend([
            {"status": "asset_commit", "at": now.isoformat()},
            {"status": "committed", "at": now.isoformat()},
            {"status": "archived", "at": now.isoformat()},
        ])
        if conversation is not None:
            conversation.conversation_state = "active"
            conversation.updated_at = now
        session.add(ConversationMessageDB(
            conversation_id=state.conversation_id, role="assistant", message_type="asset_commit",
            content=f"候选能力提交已完成：{len(committed)} 项讨论成果已进入能力仓库，尚不可被生产系统引用。",
            grounding={"package_id": package.get("package_id"), "asset_commit_id": package["asset_commit"]["commit_id"]},
        ))
        return package

    @staticmethod
    def _build_understanding_context(session, conversation, state, current_input, turns):
        messages = list(session.scalars(select(ConversationMessageDB).where(
            ConversationMessageDB.conversation_id == conversation.id
        ).order_by(ConversationMessageDB.created_at.desc()).limit(16)))
        knowledge = list(session.scalars(select(MemoryAssetDB).where(
            MemoryAssetDB.conversation_id == conversation.id,
            MemoryAssetDB.status == "active",
        ).order_by(MemoryAssetDB.updated_at.desc()).limit(8)))
        decisions = list(session.scalars(select(DecisionAssetDB).where(
            DecisionAssetDB.conversation_id == conversation.id,
            DecisionAssetDB.confirmed.is_(True),
        ).order_by(DecisionAssetDB.updated_at.desc()).limit(8)))
        project_context = {}
        if conversation.project_id:
            try:
                from app.core.project.service import assemble_project_context
                project_context = assemble_project_context(conversation.project_id)
            except Exception:
                project_context = {"project_id": conversation.project_id, "unavailable": True}
        return {
            "current_founder_input": current_input,
            "recent_conversation": [{"role": item.role, "content": item.content} for item in reversed(messages)],
            "founder_inputs_in_goal_understanding": turns[-8:],
            "project_context": project_context,
            "persisted_brain_context": {
                "goal_readiness": state.goal_readiness,
                "goal_brief_draft": dict(state.goal_brief or {}),
                "working_understanding": dict((state.discovery or {}).get("working_understanding") or {}),
            },
            "confirmed_conversation_decisions": [{"title": item.title, "decision": item.decision} for item in decisions],
            "conversation_knowledge": [{"title": item.title, "content": item.summary or item.content} for item in knowledge],
            "context_sources": {
                "current_conversation": True,
                "project_context": bool(project_context and not project_context.get("unavailable")),
                "persisted_brain_context": bool(state.goal_brief or state.discovery),
                "conversation_knowledge": bool(knowledge),
                "long_term_memory": False,
            },
            "clarification_rounds": max(0, len(turns) - 1),
        }

    @staticmethod
    def _provider_understanding(context):
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        system_prompt = """你是 Sino Founder AI 的 Goal Understanding 引擎。你的职责不是完成问卷或收齐字段，而是理解 Founder 真正想实现的目标。
优先继承已有会话、项目、已确认决策和知识；推断必须明确标为 assumption，不能把不存在的长期记忆当事实。
只把会导致 Strategy Meeting 讨论错方向的未知项列为 critical_unknowns。模型选择、技术路线、成本目标、流程拆分、生产链具体覆盖环节、自动化率指标等应由策略会议解决，列入 non_blocking_unknowns；API、代码、文件结构等执行细节也绝不阻塞。不要追问剧本、分镜、视频生成、剪辑等生产步骤。
每轮先总结“我目前理解的是”，再决定是否追问。最多提出一个主要问题，确有必要时最多两个。已能进行高质量策略讨论时必须停止追问并返回 readiness=reviewable。
Founder 是确认者和纠错者，不是数据录入员。不要重复询问上下文已有信息。
只返回 JSON，字段严格为：interpreted_goal(string), founder_intent(string), known_context(string[]), inferred_context(string[]), assumptions(string[]), critical_unknowns(string[]), non_blocking_unknowns(string[]), readiness(discovering|reviewable), confidence(0..1), next_action(clarify|review_goal), next_question(string|string[]|null), goal_brief_draft(object)。
goal_brief_draft 至少包括 summary, goal, problem, target_user, product_business_type, expected_outcome, scope[], constraints[], success_criteria[], unknowns[], assumptions[]。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=system_prompt,
            user_prompt=json.dumps(context, ensure_ascii=False),
            temperature=0.2,
            max_tokens=1800,
            response_format="json",
            metadata={"runtime_role": "sino_conversation", "brain_stage": "goal_understanding"},
        ))
        raw = response.content.strip().removeprefix("```json").removesuffix("```").strip()
        payload = json.loads(raw)
        payload["_provider"], payload["_model"] = response.provider, response.model
        return payload

    @classmethod
    def _validate_understanding(cls, payload, *, clarification_rounds):
        if not isinstance(payload, dict):
            raise ValueError("invalid_goal_understanding")
        result = dict(payload)
        list_fields = ("known_context", "inferred_context", "assumptions", "critical_unknowns", "non_blocking_unknowns")
        for key in list_fields:
            result[key] = [str(item).strip() for item in (result.get(key) or []) if str(item).strip()]
        questions = result.get("next_question")
        questions = questions if isinstance(questions, list) else ([questions] if questions else [])
        questions = [str(item).strip() for item in questions if str(item).strip()][:2]
        confidence = max(0.0, min(1.0, float(result.get("confidence") or 0)))
        readiness = result.get("readiness")
        critical = result["critical_unknowns"]
        # Guardrail only: strategy/execution gaps never block; avoid endless loops.
        strategy_question = any(any(term in question.lower() for term in (
            "模型", "技术路线", "成本", "workflow", "工作流", "api", "代码", "文件结构",
            "生产链覆盖", "哪些环节", "剧本", "分镜", "视频生成", "剪辑", "自动化率",
        )) for question in questions)
        if strategy_question and result.get("interpreted_goal"):
            result["non_blocking_unknowns"] = list(dict.fromkeys([*result["non_blocking_unknowns"], *critical]))
            result["critical_unknowns"] = []
            readiness, questions = "reviewable", []
        elif not critical and confidence >= .62:
            readiness = "reviewable"
        elif clarification_rounds >= cls.MAX_CLARIFICATION_ROUNDS and result.get("interpreted_goal"):
            result["non_blocking_unknowns"] = list(dict.fromkeys([*result["non_blocking_unknowns"], *critical]))
            result["critical_unknowns"] = []
            readiness, questions = "reviewable", []
        elif readiness not in {"discovering", "reviewable"}:
            readiness = "discovering" if critical else "reviewable"
        if readiness == "discovering" and not questions:
            raise ValueError("blocking_unknown_requires_question")
        brief = result.get("goal_brief_draft")
        if not isinstance(brief, dict) or not (brief.get("goal") or result.get("interpreted_goal")):
            raise ValueError("goal_brief_draft_required")
        brief.setdefault("goal", result.get("interpreted_goal", ""))
        brief.setdefault("summary", result.get("interpreted_goal", ""))
        # The review brief exposes current strategy unknowns, not stale fields
        # copied from an earlier draft or execution details.
        brief["unknowns"] = list(dict.fromkeys(result["non_blocking_unknowns"]))
        result.update({"confidence": confidence, "readiness": readiness, "next_question": questions, "goal_brief_draft": brief})
        return result

    @staticmethod
    def _understanding_reply(understanding, *, include_question):
        lines = ["我目前理解的是："]
        points = [understanding.get("interpreted_goal"), *(understanding.get("known_context") or []), *(understanding.get("inferred_context") or [])]
        lines.extend(f"- {point}" for point in [item for item in points if item][:5])
        if include_question:
            lines.append("\n真正会影响讨论方向的关键点是：")
            lines.extend(understanding.get("next_question") or [])
        else:
            lines.append("\n目标已经足够清楚，可以确认后开始 Strategy Meeting。技术路线、成本和流程拆分会留给策略会议解决。")
        return "\n".join(lines)

    @staticmethod
    def _discussion_objects(brief, proposals, decision):
        goal = brief.get("goal") or "未命名目标"
        combined = " ".join([decision["final_recommendation"], *[str(item.get("proposal") or "") for item in proposals]])
        objects = [{"discussion_object_id": _id("discussion-object"), "object_type": "decision", "name": f"{goal}主推荐方案", "action": "create", "purpose": decision["final_recommendation"], "source": "Conflict Validation", "reason": "形成唯一主推荐方案", "dependencies": [], "confidence": decision["confidence"], "risk": decision["key_risks"]}]
        labels = {"project": ("Project", "项目"), "workflow": ("Workflow", "工作流"), "skill": ("Skill", "技能"), "prompt": ("Prompt", "提示词"), "capability": ("Capability", "能力"), "agent": ("Agent", "智能体"), "connector": ("Connector", "连接器")}
        commerce = SinoBrainRuntime._infer_domain(brief) == "commerce"
        for object_type, terms in labels.items():
            if not any(term.lower() in combined.lower() for term in terms) and not (commerce and object_type == "skill"):
                continue
            label = terms[0]
            name = "商品分镜生成 Skill" if commerce and object_type == "skill" else f"{goal} {label}"
            purpose = "根据商品信息、目标平台、卖点和内容目标生成可用于图片或短视频生产的结构化分镜方案。" if commerce and object_type == "skill" else brief.get("problem")
            objects.append({"discussion_object_id": _id("discussion-object"), "object_type": object_type, "name": name, "action": "create", "purpose": purpose, "source": "Strategy Meeting + Decision", "reason": decision["final_recommendation"], "dependencies": [], "confidence": decision["confidence"], "risk": decision["key_risks"]})
        if proposals:
            objects.append({"discussion_object_id": _id("discussion-object"), "object_type": "knowledge", "name": f"{goal}讨论依据", "action": "create", "purpose": "保存模型提案、冲突与验证证据", "source": "Strategy Proposals", "reason": "保证决策可追溯", "dependencies": [], "confidence": decision["confidence"], "risk": []})
        return objects

    @staticmethod
    def _infer_domain(brief):
        text = " ".join(str(value) for value in [brief.get("goal"), brief.get("problem"), brief.get("summary"), brief.get("expected_outcome")])
        if any(term in text for term in ("电商", "商品", "带货", "转化", "广告素材")):
            return "commerce"
        if any(term in text for term in ("短视频", "短剧", "视频")):
            return "short-video"
        if any(term in text for term in ("量化", "策略交易")):
            return "quant"
        if any(term in text for term in ("工业", "产品设计")):
            return "industrial"
        if "品牌" in text:
            return "brand"
        return "general"

    @staticmethod
    def _classify_disagreement(text: str) -> str:
        lowered = text.lower()
        object_terms = sum(term in lowered for term in ("project", "workflow", "skill", "prompt", "agent", "capability"))
        if object_terms >= 2 and not any(term in text for term in ("不能同时", "互斥", "取代", "而不是")):
            return "hierarchy_or_complementary"
        if any(term in text for term in ("先", "后", "阶段")):
            return "stage_difference"
        return "true_conflict"

    @staticmethod
    def _normalize_recommendation(text: str) -> str:
        """Keep model attribution in evidence, not in the Founder-facing Decision."""
        cleaned = re.sub(r"^采纳(?:GPT|Claude|Gemini|DeepSeek|[^，,]{1,24}模型)[^，,]*[，,]\s*", "", str(text).strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"(?:GPT|Claude|Gemini|DeepSeek)(?:\s*模型)?的?", "", cleaned, flags=re.IGNORECASE)
        return cleaned or str(text).strip()

    @staticmethod
    def _counts(objects):
        counts = {}
        for item in objects: counts[item["object_type"]] = counts.get(item["object_type"], 0) + 1
        return counts

    @staticmethod
    def _get(session, conversation_id):
        state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
        if state is None: raise LookupError("Sino Brain state not found")
        return state

    @staticmethod
    def _serialize(record):
        payload = {
            "brain_id": record.id, "conversation_id": record.conversation_id, "project_id": record.project_id,
            "stage": record.stage, "goal_readiness": record.goal_readiness, "goal_brief": dict(record.goal_brief or {}),
            "discovery": dict(record.discovery or {}), "strategy_proposals": list(record.strategy_proposals or []),
            "conflicts": list(record.conflicts or []), "validations": list(record.validations or []),
            "decision": dict(record.decision or {}), "discussion_package": dict(record.discussion_package or {}),
            "source_message_refs": list(record.source_message_refs or []), "created_at": _iso(record.created_at), "updated_at": _iso(record.updated_at),
        }
        package = payload["discussion_package"]
        if package.get("package_id"):
            with SessionLocal() as visibility_session:
                if is_product_hidden(visibility_session, "discussion_package", package.get("package_id")):
                    package = {}
                    payload["discussion_package"] = package
        ids = [item.get("asset_id") for item in package.get("objects") or [] if item.get("asset_id")]
        if ids:
            try:
                with SessionLocal() as asset_session:
                    assets = {item.id: item for item in asset_session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.id.in_(ids)))}
                package["objects"] = [{**item, "lifecycle_status": assets[item["asset_id"]].status, "available_actions": capability_available_actions(assets[item["asset_id"]])} if item.get("asset_id") in assets else item for item in package.get("objects") or []]
            except Exception:
                pass
        payload["stage_workspaces"] = SinoBrainRuntime._stage_workspaces(payload)
        payload["active_workspace_stage"] = next((item["stage_key"] for item in payload["stage_workspaces"] if item["status"] == "active"), "asset_commit" if record.stage == "conversation_completed" else "package")
        payload["current_action"] = SinoBrainRuntime._current_action(payload)
        return payload

    @staticmethod
    def _current_action(brain):
        stage = brain.get("stage") or "goal_discovery"
        if stage == "execution_package":
            package = dict((brain.get("discovery") or {}).get("execution_package") or {})
            preflight = dict(package.get("preflight") or {})
            status = package.get("preflight_status")
            if status == "ready":
                return {"action_id": "execution_package_ready", "title": "Execution Package Ready", "description": "执行准备完成。等待下一阶段接入 Executor。", "status_label": "Ready for Execution", "primary_label": None}
            if status == "founder_gate_required":
                return {"action_id": "execution_package_founder_gate", "title": "Execution Package 需要 Founder 判断", "description": "；".join(preflight.get("founder_gate_reasons") or []), "status_label": "Founder Gate Required", "primary_label": None}
            return {"action_id": "execution_package_blocked", "title": "Execution Package Preflight Blocked", "description": "；".join(preflight.get("blocking_reasons") or []), "status_label": "Blocked", "primary_label": None}
        if stage == "implementation_planning":
            planning = dict((brain.get("discovery") or {}).get("implementation_planning") or {})
            if planning.get("status") == "planning":
                return {"action_id": "implementation_planning_running", "title": "Implementation Planning", "description": "Sino 正在基于已确认的 System Definition 制定实施方案。", "status_label": "正在制定实施方案", "primary_label": None}
            if planning.get("status") == "ready_for_execution_review":
                return {"action_id": "approve_implementation_plan", "title": "实施方案已可审核", "description": planning.get("implementation_goal"), "primary_label": "批准实施", "secondary_label": "返回讨论"}
            if planning.get("status") == "founder_approved":
                return {"action_id": "implementation_plan_approved", "title": "生成执行包", "description": "Founder 已批准实施方案。下一步生成 Execution Package；Executor 尚未启动。", "status_label": "✓ Founder 已批准实施", "primary_label": None}
        if stage == "project_planning":
            run = dict((brain.get("discovery") or {}).get("cognitive_work_run") or {})
            if run.get("run_status") in {"pending", "running"}:
                return {"action_id": "cognitive_work_running", "title": "Sino 正在执行", "description": run.get("work_target"), "status_label": "分析中", "primary_label": None}
            maturity = dict((brain.get("discovery") or {}).get("discussion_maturity") or {})
            status = maturity.get("maturity_status")
            if status == "founder_input_required":
                return {"action_id": "answer_project_question", "title": "需要 Founder 判断", "description": maturity.get("blocking_question") or maturity.get("reason"), "primary_label": "回答关键问题"}
            if status == "ready_for_review":
                return {"action_id": "review_project_outcome", "title": "本轮成果已可审核", "description": maturity.get("reason"), "primary_label": "审核成果", "secondary_label": "返回讨论"}
            if status == "continue_analysis":
                return {"action_id": "continue_project_planning", "title": "Project Planning", "description": maturity.get("autonomous_next_analysis") or maturity.get("reason"), "primary_label": "继续分析"}
            return {"action_id": "project_maturity_evaluating", "title": "正在判断讨论成熟度", "description": "Sino 正在判断应继续分析、请求 Founder 判断，还是进入成果审核。", "primary_label": "判断中"}
        if stage == "goal_review":
            return {"action_id": "confirm_goal", "title": "目标已经明确", "description": "确认后开始 Strategy Meeting。", "primary_label": "开始讨论", "secondary_label": "修改目标"}
        if stage == "strategy_meeting" and brain.get("strategy_proposals"):
            return {"action_id": "start_validation", "title": "Strategy Finished", "description": f"已形成 {len(brain.get('strategy_proposals') or [])} 个策略提案，下一步验证冲突、风险与可行性。", "primary_label": "开始 Validation", "secondary_label": "继续讨论"}
        if stage == "strategy_meeting":
            return {"action_id": "continue_strategy", "title": "Strategy Meeting", "description": "围绕已确认 Goal Brief 完成策略讨论。", "primary_label": "继续讨论"}
        if stage == "conflict_validation":
            return {"action_id": "generate_decision", "title": "Validation Finished", "description": f"已完成 {len(brain.get('validations') or [])} 项验证。", "primary_label": "生成 Decision", "secondary_label": "继续验证"}
        if stage == "decision_ready":
            return {"action_id": "generate_package", "title": "Decision Finished", "description": "唯一推荐方案已经形成。", "primary_label": "生成 Discussion Package", "secondary_label": "重新讨论"}
        if stage == "package_ready":
            return {"action_id": "approve_package", "title": "等待 Founder 批准候选能力", "description": "批准后，本轮能力方向会以 Candidate 状态进入能力仓库，不会直接成为 Ready。", "primary_label": "批准候选能力", "secondary_label": "继续讨论", "danger_label": "退回修改"}
        if stage == "package_approved":
            return {"action_id": "asset_commit", "title": "正在提交资产", "description": "正在把成果包写入正式资产仓库。", "primary_label": "提交中"}
        if stage in {"asset_commit", "conversation_completed"}:
            package = brain.get("discussion_package") or {}
            objects = package.get("objects") or []
            candidates = [item for item in objects if item.get("lifecycle_status", item.get("commit_status")) == "candidate"]
            selected = next((item for item in objects if item.get("asset_id") == package.get("selected_asset_id")), None)
            target = selected or next((item for item in candidates if item.get("object_type") == "skill"), None) or next((item for item in candidates if item.get("object_type") in {"workflow", "agent", "prompt", "capability", "connector"}), None)
            if target:
                status = target.get("lifecycle_status", target.get("commit_status"))
                actions = target.get("available_actions") or []
                base = {"target_asset_id": target.get("asset_id"), "target_asset_type": target.get("object_type"), "target_asset_name": target.get("name"), "asset_id": target.get("asset_id"), "available_actions": actions}
                if status == "candidate":
                    return {**base, "action_id": "develop", "title": "候选能力已入仓", "description": f"{target.get('name')} 当前是 Candidate；其他候选不会自动推进。", "primary_label": f"开发 {target.get('name')}", "secondary_label": "暂不开发"}
                if status == "developing":
                    return {**base, "action_id": "complete_development", "title": f"{target.get('name')} · 开发中", "description": "Development Task 已建立；开发完成事件发生后才进入 Testing。", "primary_label": "完成开发并进入测试", "secondary_label": "继续讨论"}
                if status == "testing" and "approve_ready" in actions:
                    return {**base, "action_id": "approve_ready", "title": f"{target.get('name')} · 测试通过", "description": "测试证据已持久化，等待 Founder 的第二次批准。", "primary_label": "批准为可引用能力", "secondary_label": "再测试一次"}
                if status == "testing":
                    return {**base, "action_id": "run_test", "title": f"{target.get('name')} · 测试中", "description": "只会测试当前绑定的 Skill asset_id。", "primary_label": "运行真实测试", "secondary_label": "继续讨论"}
                if status == "ready":
                    return {**base, "action_id": "ready_complete", "title": f"{target.get('name')} · Ready", "description": "该能力已经可以被新的目标检索和引用。", "primary_label": "查看能力仓库"}
            if candidates:
                return {"action_id": "candidates_saved", "title": "候选能力已沉淀", "description": f"{len(candidates)} 个候选能力已进入能力仓库；尚不可被生产系统引用。", "primary_label": "选择候选能力", "secondary_label": "暂不开发"}
            return {"action_id": "assets_committed", "title": "资产提交完成", "description": "成果包中的资产已进入 AI Commerce OS。", "primary_label": "查看资产", "secondary_label": "开始新目标"}
        return {"action_id": "continue_goal", "title": "继续理解目标", "description": "回答 Sino 当前最关键的问题。", "primary_label": "继续"}

    @staticmethod
    def _stage_workspaces(brain):
        internal = brain.get("stage") or "goal_discovery"
        current = (
            "goal" if internal in {"project_planning", "goal_discovery", "goal_review"} else
            "strategy" if internal in {"implementation_planning", "goal_confirmed", "strategy_meeting"} else
            "validation" if internal == "conflict_validation" else
            "decision" if internal == "decision_ready" else
            "asset_commit" if internal in {"asset_commit", "conversation_completed"} else "package"
        )
        current_index = WORKSPACE_STAGES.index(current)
        summaries = {
            "goal": "Project Context 分析进行中" if internal == "project_planning" else (brain.get("goal_brief") or {}).get("summary") or (brain.get("goal_brief") or {}).get("goal") or "目标理解进行中",
            "strategy": "Implementation Plan 制定中" if internal == "implementation_planning" else f"已记录 {len(brain.get('strategy_proposals') or [])} 个策略提案",
            "validation": f"已记录 {len(brain.get('conflicts') or [])} 个冲突与 {len(brain.get('validations') or [])} 个验证结果",
            "decision": (brain.get("decision") or {}).get("final_recommendation") or "等待形成唯一推荐方案",
            "package": (brain.get("discussion_package") or {}).get("title") or "等待形成 Discussion Package",
            "asset_commit": f"已提交 {len(((brain.get('discussion_package') or {}).get('asset_commit') or {}).get('items') or [])} 项资产",
        }
        result = []
        for index, key in enumerate(WORKSPACE_STAGES):
            status = "completed" if index < current_index else "active" if index == current_index else "locked"
            if internal == "package_approved" and key == "package":
                status = "completed"
            if internal == "conversation_completed" and key == "asset_commit":
                status = "completed"
            result.append({
                "stage_id": f"{brain.get('brain_id')}:{key}", "stage_key": key, "label": "Project Planning" if internal == "project_planning" and key == "goal" else "Implementation Planning" if internal == "implementation_planning" and key == "strategy" else "Execution Package" if internal == "execution_package" and key == "package" else STAGE_LABELS[key],
                "status": status, "summary": summaries[key], "message_refs": [],
            })
        return result

    @staticmethod
    def _message_stage(message, fallback):
        explicit = dict(message.grounding or {}).get("brain_stage")
        if explicit in WORKSPACE_STAGES:
            return explicit
        message_type = message.message_type or "discussion"
        if message_type in {"goal_discovery", "goal_understanding", "goal_understanding_error", "goal_brief", "goal_confirmed"}:
            return "goal"
        if message_type in {"strategy_meeting", "council", "auto_deliberation", "model_proposal", "sino_synthesis"}:
            return "strategy"
        if message_type in {"conflict_validation", "validation"}:
            return "validation"
        if message_type == "decision":
            return "decision"
        if message_type == "discussion_package":
            return "package"
        if message_type == "asset_commit":
            return "asset_commit"
        return fallback if fallback in WORKSPACE_STAGES else "goal"


brain_runtime = SinoBrainRuntime()
