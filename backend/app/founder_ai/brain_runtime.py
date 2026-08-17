"""Sino Brain V1 lifecycle orchestration.

This layer owns clarification and decision state. It deliberately does not
execute code or mutate formal Founder Objects.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.context.model import ConversationContextDB
from app.core.conversation_first.model import ConversationMessageDB, PendingQuestionDB, SinoBrainSessionDB
from app.core.asset_lifecycle.model import AssetCatalogDB
from app.core.product_visibility.service import is_product_hidden
from app.core.asset_lifecycle.service import LifecycleConflict, capability_available_actions, perform_capability_action, suggest_reuse, upsert_catalog_record
from app.core.decision.model import DecisionAssetDB
from app.core.dependency_outcome.service import dependency_evidence_for_target
from app.core.memory.model import MemoryAssetDB
from app.core.project.model import FounderProjectDB, ProjectIntelligenceDB
from app.core.project.lifecycle_projection import project_lifecycle_projection
from app.database.db import SessionLocal, engine
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest
from app.founder_ai.working_tree_resolution import analyze_working_tree
from app.founder_ai.execution_readiness import build_execution_readiness_contract
from app.founder_ai.autonomous_checkpoint import execute_autonomous_checkpoint
from app.founder_ai.controlled_handoff import create_controlled_handoff
from app.founder_ai.controlled_execution import blocked_execution_result, scope_guard, start_precondition_checks
from app.founder_ai.action_contract import compile_action_contract
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

    def __init__(self, *, understanding_runner=None, lifecycle_intent_runner=None, work_item_routing_runner=None, work_item_semantic_runner=None, project_maturity_runner=None, autonomous_analysis_runner=None, implementation_planning_runner=None, initial_project_planning_runner=None, founder_gate_resolution_runner=None):
        self._understanding_runner = understanding_runner or self._provider_understanding
        self._lifecycle_intent_runner = lifecycle_intent_runner or self._provider_lifecycle_intent
        self._work_item_routing_runner = work_item_routing_runner or self._provider_work_item_routing
        self._work_item_semantic_runner = work_item_semantic_runner or self._provider_work_item_semantics
        self._project_maturity_runner = project_maturity_runner or self._provider_project_maturity
        self._autonomous_analysis_runner = autonomous_analysis_runner or self._provider_autonomous_analysis
        self._implementation_planning_runner = implementation_planning_runner or self._provider_implementation_planning
        self._initial_project_planning_runner = initial_project_planning_runner or self._provider_initial_project_planning
        self._founder_gate_resolution_runner = founder_gate_resolution_runner or self._provider_founder_gate_resolution

    def ensure_project_planning_conversation(self, project_id: str) -> dict[str, Any]:
        """Reconcile one canonical planning Conversation and its first Sino analysis."""
        with SessionLocal() as session:
            project = session.scalar(select(FounderProjectDB).where(
                FounderProjectDB.id == project_id,
                FounderProjectDB.system_id == "founder_ai",
            ).with_for_update())
            if project is None:
                raise LookupError("Founder project not found")
            if project.project_type != "system_project" or not project.source_proposal_id:
                raise ValueError("Canonical planning reconciliation requires a formally created System Project")
            conversation = session.scalar(select(ConversationDB).where(
                ConversationDB.project_id == project.id,
                ConversationDB.system_id == "founder_ai",
                ConversationDB.status == "active",
                ConversationDB.conversation_kind == "founder_discussion",
            ).order_by(ConversationDB.created_at.asc()))
            created = conversation is None
            if conversation is None:
                conversation = ConversationDB(
                    system_id="founder_ai", project_id=project.id,
                    title=f"{project.name} · 项目规划", status="active",
                    conversation_kind="founder_discussion",
                    topic_key=f"project:{project.id}:planning",
                    conversation_state="active",
                )
                session.add(conversation); session.flush()
                session.add(ConversationContextDB(conversation_id=conversation.id, system_id="founder_ai"))
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation.id))
            if state is None:
                state = SinoBrainSessionDB(
                    conversation_id=conversation.id, project_id=project.id, stage="project_planning",
                    discovery={"project_aware": True, "initial_project_planning": {"status": "pending"}},
                )
                session.add(state)
            planning = dict((state.discovery or {}).get("initial_project_planning") or {})
            already_completed = planning.get("status") == "completed"
            already_running = planning.get("status") == "running"
            if not already_completed and not already_running:
                discovery = dict(state.discovery or {})
                discovery["initial_project_planning"] = {"status": "running", "started_at": datetime.now(timezone.utc).isoformat()}
                state.discovery = discovery
            conversation_id = conversation.id
            project_id_value = project.id
            session.commit()
        if already_completed or already_running:
            return {"conversation_id": conversation_id, "created": created, "initialized": False, "brain": self.snapshot(conversation_id)}

        from app.core.project.service import assemble_project_context
        project_context = assemble_project_context(project_id_value)
        initial = dict(project_context.get("child_project_context") or {})
        context = {
            "project": {"project_id": project_id_value, "project_name": project_context.get("project_name")},
            "project_definition": {
                "architecture_role": initial.get("architecture_role"),
                "initial_positioning": initial.get("initial_positioning"),
                "initial_scope": initial.get("initial_scope"),
            },
            "inherited_constitution": (project_context.get("parent_confirmed_context") or {}).get("constitution"),
            "creation_provenance": {
                key: initial.get(key) for key in (
                    "source_conversation_id", "source_work_item_id", "source_work_item",
                    "source_proposal_id", "founder_decision", "routing_recommendation",
                    "formal_object_proposal", "real_dependency_evidence",
                )
            },
            "existing_state": project_context,
        }
        try:
            analysis = self._validate_initial_project_planning(self._initial_project_planning_runner(context))
        except Exception:
            with SessionLocal() as session:
                state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
                discovery = dict(state.discovery or {})
                discovery["initial_project_planning"] = {"status": "failed", "context_sources": project_context.get("context_sources") or {}}
                state.discovery = discovery; session.commit()
            raise
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            discovery = dict(state.discovery or {})
            current = dict(discovery.get("initial_project_planning") or {})
            existing_message = session.scalar(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id,
                ConversationMessageDB.message_type == "project_planning",
            ).order_by(ConversationMessageDB.created_at.asc()))
            if current.get("status") != "completed":
                message = existing_message or ConversationMessageDB(
                    conversation_id=conversation_id, role="assistant",
                    content=analysis["narrative"], message_type="project_planning",
                    grounding={"initial_project_planning": True, "source_proposal_id": initial.get("source_proposal_id")},
                )
                if existing_message is None:
                    session.add(message); session.flush()
                discovery.update({
                    "project_aware": True,
                    "current_project": {"project_id": project_id_value, "project_name": project_context.get("project_name")},
                    "current_understanding": analysis,
                    "initial_project_planning": {
                        "status": "completed", "source_message_id": message.id,
                        "context_sources": project_context.get("context_sources") or {},
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                    },
                    "context_sources": project_context.get("context_sources") or {},
                    "discussion_maturity": {"maturity_status": "evaluating", "reason": "首轮 Project Planning 已完成，正在判断下一步。", "outcomes": []},
                })
                state.stage = "project_planning"; state.discovery = discovery; state.updated_at = datetime.now(timezone.utc)
                conversation = session.get(ConversationDB, conversation_id)
                conversation.updated_at = datetime.now(timezone.utc)
                session.commit()
        self.judge_project_maturity(conversation_id)
        return {"conversation_id": conversation_id, "created": created, "initialized": True, "brain": self.snapshot(conversation_id)}

    @staticmethod
    def _validate_initial_project_planning(payload: dict) -> dict:
        required = ("current_understanding", "current_gap", "priority_reason", "recommended_next_step")
        if not isinstance(payload, dict) or any(not payload.get(key) for key in required) or "sino_can_complete" not in payload:
            raise ValueError("initial_project_planning_incomplete")
        return {
            **payload,
            "founder_question": str(payload.get("founder_question") or "").strip() or None,
            "narrative": str(payload.get("narrative") or "").strip() or "\n\n".join([
                f"我目前如何理解\n{payload['current_understanding']}",
                f"当前最重要的缺口\n{payload['current_gap']}",
                f"为什么优先处理\n{payload['priority_reason']}",
                f"建议下一步\n{payload['recommended_next_step']}",
                f"Sino 可以先完成\n{payload['sino_can_complete']}",
                f"真正需要 Founder 判断\n{payload.get('founder_question') or '暂无'}",
            ]),
        }

    @staticmethod
    def _provider_initial_project_planning(context: dict) -> dict:
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的 Initial Project Planning 分析器。一个正式 System Project 已经由 Founder 确认创建，请基于 confirmed Constitution、Formal Object Proposal、Parent/Project Context、Existing State 与真实 Dependency Evidence，直接完成第一轮规划分析。不得创建 Goal、Draft、Implementation Plan、Execution Package 或执行任务。必须区分长期完整 System Scope 与当前被真实证据证明的 Immediate Blocking Scope，不能把后者误当作完整产品定义。只有真正改变核心定义、边界或架构且 Context 无法决定的问题才列为 founder_question；否则为空。只返回 JSON：current_understanding, long_term_system_scope, immediate_blocking_scope, current_gap, priority_reason, recommended_next_step, sino_can_complete, founder_question, narrative。narrative 必须完整呈现这些判断。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.2, max_tokens=2200, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "initial_project_planning"}))
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["provider"], payload["model"] = response.provider, response.model
        return payload

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
            discovery = dict(record.discovery or {})
            constitution_active = discovery.get("message_intent") == "project_context_update" and (discovery.get("constitution_understanding") or {}).get("system_objects")
            source_founder = (next((item for item in messages if item.role == "founder" and self.extract_constitution_understanding(item.content).get("system_objects")), None) or next((item for item in messages if item.role == "founder"), None)) if constitution_active else latest_founder
            if source_founder and (constitution_active or self.classify_message_intent(source_founder.content, project_id=record.project_id) == "project_context_update"):
                understanding = dict(discovery.get("constitution_understanding") or self.extract_constitution_understanding(source_founder.content))
                work_items = self._propose_constitution_work_items(session, understanding, dict(discovery.get("proposed_work_item_decisions") or {}), dict(discovery.get("proposed_work_item_routing") or {}))
                payload = self._context_update_projection(payload, source_founder.id, source_founder.content, work_items=work_items)
            return payload

    @staticmethod
    def _is_work_item_semantic_refresh(content: str, interaction_context: dict | None) -> bool:
        context = interaction_context or {}
        if context.get("active_surface") != "constitution_review" or not context.get("selected_constitution_work_item_id"):
            return False
        text = " ".join(str(content or "").casefold().split())
        refresh_actions = ("重新判断", "重新分析", "重新评估", "更新判断", "更新理解", "重新理解", "refresh", "reassess", "re-evaluate", "reanalyze", "re-analyze")
        evidence_context = ("新证据", "新增证据", "real dependency evidence", "dependency evidence", "最新证据", "current evidence")
        return any(action in text for action in refresh_actions) or (any(term in text for term in evidence_context) and any(term in text for term in ("判断", "分析", "评估", "理解", "understanding")))

    def process_message(self, conversation_id: str, content: str, *, interaction_context: dict | None = None) -> dict[str, Any]:
        """Use Sino's configured model to understand a goal; rules only validate."""
        if self._is_work_item_semantic_refresh(content, interaction_context):
            work_item_id = str((interaction_context or {}).get("selected_constitution_work_item_id"))
            snapshot = self.ensure_constitution_work_item_semantics(conversation_id, work_item_id, refresh=True)
            work_item = next((item for item in (snapshot.get("constitution_understanding") or {}).get("proposed_work_items") or [] if item.get("work_item_id") == work_item_id), {})
            semantic = work_item.get("semantic_understanding") or {}
            return {
                "handled": True,
                "intent": "work_item_semantic_refresh",
                "reply": f"已基于当前 Constitution、Existing State 与最新 Real Dependency Evidence 更新 {work_item.get('title') or '当前 Work Item'} 的语义判断。Founder Decision 保持不变。\n\nSystem Role：{semantic.get('system_role')}\n\nCurrent Gap：{semantic.get('current_gap')}\n\nRecommended Action：{semantic.get('recommended_action')}",
                "message_type": "work_item_semantic_refresh",
                "brain": snapshot,
            }
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
        from app.core.draft.service import ensure_project_definition_draft, sync_project_draft_status
        ensure_project_definition_draft(conversation_id=conversation_id, session_factory=SessionLocal)
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
        if action == "confirm":
            from app.core.draft.service import confirm_project_draft
            confirm_project_draft(conversation_id=conversation_id, session_factory=SessionLocal)
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
            proposal = self._materialize_founder_gate_proposal(
                conversation=conversation,
                discovery=discovery,
                package=package,
                plan=plan,
                draft=draft,
                context_evidence=self._founder_gate_context_evidence(session, draft),
            )
            if proposal:
                package["founder_gate_proposal_id"] = proposal["proposal_id"]
                package["founder_gate_proposal"] = proposal
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
            existing_readiness = dict(package.get("execution_readiness_contract") or {})
            existing_readiness_id = existing_readiness.get("contract_id")
            package["execution_readiness_contract"] = build_execution_readiness_contract(
                package=package,
                project={"project_id": conversation.project_id, "name": getattr(draft, "project_name", None)},
                repo_root=Path(__file__).resolve().parents[3],
                baseline_checkpoint=existing_readiness.get("checkpoint_commit"),
            )
            if existing_readiness_id:
                package["execution_readiness_contract"]["contract_id"] = existing_readiness_id
            proposal = self._materialize_founder_gate_proposal(
                conversation=conversation,
                discovery=discovery,
                package=package,
                plan=plan,
                draft=draft,
                context_evidence=self._founder_gate_context_evidence(session, draft),
            )
            if proposal:
                package["founder_gate_proposal_id"] = proposal["proposal_id"]
                package["founder_gate_proposal"] = proposal
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return package

    def ensure_execution_readiness_contract(self, conversation_id: str) -> dict:
        """Materialize the machine-verifiable handoff boundary without starting execution."""
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
            draft = session.get(FounderDraftDB, package.get("source_draft_id"))
            if draft is None:
                raise LookupError("Confirmed source Draft not found")
            existing_readiness = dict(package.get("execution_readiness_contract") or {})
            existing_readiness_id = existing_readiness.get("contract_id")
            contract = build_execution_readiness_contract(
                package=package,
                project={"project_id": conversation.project_id, "name": draft.project_name},
                repo_root=Path(__file__).resolve().parents[3],
                baseline_checkpoint=existing_readiness.get("checkpoint_commit"),
            )
            if existing_readiness_id:
                contract["contract_id"] = existing_readiness_id
            package["execution_readiness_contract"] = contract
            package["updated_at"] = datetime.now(timezone.utc).isoformat()
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return contract

    def run_self_healing_preflight(self, conversation_id: str, *, verification_evidence: list[str], max_cycles: int = 2, checkpoint_name: str = "founder: checkpoint execution readiness contract") -> dict:
        """Resolve a sole dirty-tree readiness blocker, then stop before execution."""
        repo_root = Path(__file__).resolve().parents[3]
        cycles = []
        trigger_reason = "execution_readiness_blocked:working_tree_clean=false"
        for cycle in range(1, max_cycles + 1):
            contract = self.ensure_execution_readiness_contract(conversation_id)
            failed = [name for name, passed in (contract.get("readiness_checks") or {}).items() if not passed]
            if not failed:
                final_status = "self_healing_completed"
                break
            if failed != ["working_tree_clean"] or contract.get("founder_decision_required"):
                final_status = "self_healing_founder_gate_required" if contract.get("founder_decision_required") else "self_healing_blocked"
                break
            resolution = analyze_working_tree(repo_root, verification_evidence=verification_evidence)
            counts = dict(resolution.get("eligibility_counts") or {})
            if resolution.get("status") != "working_tree_resolution_ready" or resolution.get("founder_decision_required") or any(counts.get(key) for key in ("UNKNOWN", "SENSITIVE", "UNRELATED", "NEEDS_SEPARATION", "GENERATED")):
                final_status = "self_healing_founder_gate_required" if resolution.get("founder_decision_required") else "self_healing_blocked"
                cycles.append({"cycle": cycle, "working_tree_resolution": resolution, "checkpoint_result": None})
                break
            checkpoint = execute_autonomous_checkpoint(
                repo_root=repo_root, resolution=resolution,
                commit_message=checkpoint_name,
                verification_evidence=verification_evidence,
            )
            with SessionLocal() as session:
                state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
                if state is None:
                    raise LookupError("Sino Brain state not found")
                discovery = dict(state.discovery or {})
                package = dict(discovery.get("execution_package") or {})
                package["autonomous_checkpoint"] = {**checkpoint, "package_revalidated": False}
                discovery["execution_package"] = package
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
            package = self.revalidate_execution_package(conversation_id)
            readiness = dict(package.get("execution_readiness_contract") or {})
            cycles.append({
                "cycle": cycle, "working_tree_resolution": resolution, "checkpoint_result": checkpoint,
                "package_revalidation": {"package_id": package.get("package_id"), "preflight_status": package.get("preflight_status")},
                "readiness_revalidation": {"contract_id": readiness.get("contract_id"), "status": readiness.get("readiness_status")},
            })
            if package.get("preflight_status") == "ready" and readiness.get("readiness_status") == "execution_readiness_ready" and package.get("execution_status") == "not_started":
                final_status = "self_healing_completed"
                break
        else:
            final_status = "self_healing_stalled"

        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            package = dict(discovery.get("execution_package") or {})
            final_contract = dict(package.get("execution_readiness_contract") or {})
            result = {
                "self_healing_status": final_status, "trigger_reason": trigger_reason, "cycle_count": len(cycles),
                "max_self_healing_cycles": max_cycles, "cycles": cycles,
                "working_tree_resolution": (cycles[-1].get("working_tree_resolution") if cycles else None),
                "checkpoint_result": (cycles[-1].get("checkpoint_result") if cycles else None),
                "package_revalidation": (cycles[-1].get("package_revalidation") if cycles else None),
                "readiness_revalidation": (cycles[-1].get("readiness_revalidation") if cycles else None),
                "final_status": final_contract.get("readiness_status"), "executor_started": False,
                "external_side_effects": {"local_repository_commit": bool(cycles and cycles[-1].get("checkpoint_result")), "external_cloud_runtime": False},
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }
            package["self_healing_preflight"] = result
            if cycles and cycles[-1].get("checkpoint_result"):
                package["autonomous_checkpoint"] = {**cycles[-1]["checkpoint_result"], "package_revalidated": True}
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return result

    def create_controlled_executor_handoff(self, conversation_id: str, *, package_id: str, readiness_contract_id: str, checkpoint_commit: str) -> dict:
        """Create one inert executor session from the frozen contract; never queue or execute it."""
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            package = dict(discovery.get("execution_package") or {})
            existing = dict(package.get("executor_handoff") or {})
            if existing:
                if existing.get("package_id") != package_id or existing.get("readiness_contract_id") != readiness_contract_id or existing.get("checkpoint_commit") != checkpoint_commit:
                    raise ValueError("handoff_scope_mismatch")
                return existing
            handoff, _execution_session = create_controlled_handoff(
                package=package, expected_package_id=package_id,
                expected_readiness_contract_id=readiness_contract_id, expected_checkpoint=checkpoint_commit,
            )
            package["executor_handoff"] = handoff
            package["execution_status"] = "not_started"
            package["updated_at"] = datetime.now(timezone.utc).isoformat()
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return handoff

    def start_controlled_execution(self, conversation_id: str, *, expected: dict) -> dict:
        """Start the existing inert session, then enforce scope before every side effect."""
        from app.founder_ai.execution_registry import get_execution_session, save_execution_session
        repo_root = Path(__file__).resolve().parents[3]
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            package = dict(discovery.get("execution_package") or {})
            handoff = dict(package.get("executor_handoff") or {})
            registered = get_execution_session(expected["execution_session_id"])
            if registered is None:
                raise LookupError("Execution Session not found")
            execution_session, _typed_package = registered
            checks = start_precondition_checks(package=package, session=execution_session, expected=expected, repo_root=repo_root)
            if not all(checks.values()):
                package["controlled_execution_blocker"] = {"status": "start_blocked", "checks": checks, "recorded_at": datetime.now(timezone.utc).isoformat()}
                discovery["execution_package"] = package
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
                return package["controlled_execution_blocker"]

            started_at = datetime.now(timezone.utc).isoformat()
            execution_session.status = "executing"
            execution_session.started_at = started_at
            execution_session.execution_started_at = started_at
            package["execution_status"] = "running"
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            save_execution_session(execution_session)

            guard = scope_guard(handoff)
            if not guard["allowed"]:
                result = blocked_execution_result(package=package, session=execution_session, handoff=handoff, guard=guard, started_at=started_at)
                execution_session.status = "blocked"
                execution_session.completed_at = result["completed_at"]
                execution_session.failure_reason = guard["reason"]
                execution_session.result = result
                save_execution_session(execution_session)
                with SessionLocal() as result_session:
                    state = result_session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
                    discovery = dict(state.discovery or {})
                    package = dict(discovery.get("execution_package") or {})
                    package["execution_status"] = "blocked"
                    package["execution_result"] = result
                    discovery["execution_package"] = package
                    state.discovery = discovery
                    state.updated_at = datetime.now(timezone.utc)
                    result_session.commit()
                return result
            raise RuntimeError("controlled_executor_adapter_not_invoked_without_explicit_action_descriptors")

    def compile_machine_action_contract(self, conversation_id: str, *, handoff_id: str, blocked_session_id: str, scope_fingerprint: str) -> dict:
        """Compile one versioned contract without mutating the historical handoff/session."""
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id).with_for_update())
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            package = dict(discovery.get("execution_package") or {})
            handoff = dict(package.get("executor_handoff") or {})
            result = dict(package.get("execution_result") or {})
            if handoff.get("handoff_id") != handoff_id or result.get("execution_session_id") != blocked_session_id or result.get("execution_status") != "blocked" or handoff.get("scope_fingerprint") != scope_fingerprint:
                raise ValueError("action_contract_source_mismatch")
            contracts = [dict(item) for item in package.get("machine_action_contracts") or []]
            existing = next((item for item in contracts if item.get("source_handoff_id") == handoff_id and item.get("source_blocked_session_id") == blocked_session_id and item.get("contract_version") == 1), None)
            if existing:
                return existing
            proposal = dict(discovery.get("active_founder_gate_proposal") or package.get("founder_gate_proposal") or {})
            contract = compile_action_contract(package=package, proposal=proposal, source_handoff_id=handoff_id, source_session_id=blocked_session_id, source_scope_fingerprint=scope_fingerprint)
            contracts.append(contract)
            package["machine_action_contracts"] = contracts
            package["active_machine_action_contract"] = contract
            discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return contract

    def ensure_founder_gate_proposal(self, conversation_id: str) -> dict | None:
        """Materialize one canonical review object for the current Founder Gate."""
        from app.core.draft.model import FounderDraftDB
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if conversation is None or state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            package = dict(discovery.get("execution_package") or {})
            plan = dict(discovery.get("implementation_planning") or {})
            if not package.get("package_id"):
                raise LookupError("Execution Package not found")
            draft = session.get(FounderDraftDB, package.get("source_draft_id"))
            if draft is None:
                raise LookupError("Confirmed source Draft not found")
            proposal = self._materialize_founder_gate_proposal(
                conversation=conversation, discovery=discovery, package=package, plan=plan, draft=draft,
                context_evidence=self._founder_gate_context_evidence(session, draft),
            )
            if proposal:
                package["founder_gate_proposal_id"] = proposal["proposal_id"]
                package["founder_gate_proposal"] = proposal
                discovery["execution_package"] = package
                state.discovery = discovery
                state.updated_at = datetime.now(timezone.utc)
                session.commit()
            return proposal

    @staticmethod
    def _founder_gate_context_evidence(session, draft) -> list[dict]:
        from app.core.dependency_outcome.service import dependency_evidence_for_target
        return dependency_evidence_for_target(session, getattr(draft, "project_name", "")) if getattr(draft, "project_name", None) else []

    @staticmethod
    def _runtime_environment_discovery(package: dict) -> dict:
        """Read non-secret local metadata; never provisions or mutates infrastructure."""
        binding = dict(package.get("runtime_binding") or {})
        recommended_binding = dict((binding.get("recommendation") or {}).get("runtime_binding") or {})
        proposed = {**binding, **{key: value for key, value in recommended_binding.items() if value not in (None, [], {})}}
        approved = binding.get("binding_status") in {"approved", "passed"}
        required = list(binding.get("required_resource_bindings") or [])
        supplied = {
            str(item.get("logical_dependency")): item.get("concrete_target")
            for item in proposed.get("resource_bindings") or []
            if isinstance(item, dict) and item.get("logical_dependency")
        }
        database = engine.url
        app_environment = os.environ.get("APP_ENV", "development")
        configured_cloud = {
            "storage": bool(os.environ.get("DATABASE_URL")),
            "compute": bool(os.environ.get("AI_COMMERCE_CLOUD_COMPUTE_ENDPOINT")),
            "iam": all(bool(os.environ.get(key)) for key in (
                "AI_COMMERCE_CLOUD_IAM_ISSUER", "AI_COMMERCE_CLOUD_IAM_AUDIENCE", "AI_COMMERCE_CLOUD_IAM_PUBLIC_KEY",
            )),
            "network": bool(os.environ.get("AI_COMMERCE_CLOUD_NETWORK_ZONE")),
        }
        candidates = []
        for logical_dependency in required:
            name = str(logical_dependency)
            concrete_target = supplied.get(name)
            if concrete_target:
                candidates.append({
                    "logical_dependency": name,
                    "candidate": concrete_target,
                    "availability": "APPROVED_FOR_THIS_PACKAGE" if approved else "RECOMMENDED",
                    "approved_for_package": approved,
                    "evidence": "Current canonical Execution Package runtime binding.",
                })
            elif name in {"storage", "database"}:
                candidates.append({
                    "logical_dependency": name,
                    "candidate": f"Current {database.get_backend_name()} development database",
                    "availability": "ACTIVE",
                    "approved_for_package": False,
                    "evidence": "The application has an active development database connection; credentials and URI were not read or exposed.",
                })
            elif configured_cloud.get(name):
                candidates.append({
                    "logical_dependency": name,
                    "candidate": f"Configured {name} runtime reference",
                    "availability": "CONFIGURED",
                    "approved_for_package": False,
                    "evidence": "A non-empty runtime reference is present; its secret or endpoint value was not read or exposed.",
                })
            elif name == "compute":
                candidates.append({
                    "logical_dependency": name,
                    "candidate": f"Current {app_environment} application process",
                    "availability": "ACTIVE",
                    "approved_for_package": False,
                    "evidence": "The backend process is active in the current application environment, but is not an approved Cloud runtime binding.",
                })
        if database.username and database.password:
            candidates.append({
                "logical_dependency": "credential",
                "candidate": "Current development database credential reference",
                "availability": "CONFIGURED",
                "approved_for_package": False,
                "evidence": "A database credential reference is configured; its username, password and URI were not read, copied or exposed.",
            })
        approved_candidates = [item for item in candidates if item["approved_for_package"]]
        candidate_options = []
        if candidates:
            candidate_options.append({
                "option_id": "reuse-observed-infrastructure",
                "name": "评估并隔离复用当前已观测开发基础设施",
                "basis": [item["logical_dependency"] for item in candidates],
                "status": "candidate_only",
                "constraint": "必须先证明隔离性并由 Founder 批准绑定；当前观测不等于授权。",
            })
        if required and len({item["logical_dependency"] for item in candidates}) < len(set(map(str, required))):
            candidate_options.append({
                "option_id": "new-isolated-non-production-runtime",
                "name": "建立新的隔离非生产 Runtime",
                "basis": [name for name in map(str, required) if name not in {item["logical_dependency"] for item in candidates}],
                "status": "requires_provider_and_cost_decision",
                "constraint": "Provider、费用、凭据与外部副作用边界尚未确定。",
            })
        blockers = []
        if not proposed.get("provider"):
            blockers.append({"field": "provider", "label": "Runtime Provider / Type", "reason": "No runtime provider or provider-independent runtime type is approved for this Package."})
        if not proposed.get("target_environment"):
            blockers.append({"field": "target_environment", "label": "Target Environment", "reason": "The current development environment is observable, but is not approved as this Package's target."})
        for name in required:
            if not supplied.get(str(name)):
                blockers.append({"field": f"resource:{name}", "label": str(name).upper(), "reason": "A candidate may exist, but no concrete target is approved for this Package."})
        boundary_labels = {
            "credential_source": "Credential Authorization",
            "cost_boundary": "Cost Authorization",
            "external_side_effect_boundary": "External Side Effect Authorization",
            "production_impact": "Production Impact Authorization",
        }
        for field, label in boundary_labels.items():
            if proposed.get(field) is None:
                blockers.append({"field": field, "label": label, "reason": "No explicit approved boundary is recorded."})
        return {
            "status": "completed",
            "mode": "read_only",
            "observed_environment": app_environment,
            "database_metadata": {"backend": database.get_backend_name(), "host_scope": "local" if database.host in {None, "localhost", "127.0.0.1"} else "remote", "configured": True},
            "runtime_reference_presence": configured_cloud,
            "candidate_infrastructure": candidates,
            "candidate_options": candidate_options,
            "approved_bindings": approved_candidates,
            "blocking_unknowns": blockers,
            "external_side_effects_performed": False,
            "discovered_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _provider_founder_gate_resolution(context: dict) -> dict:
        from app.core.model_center.service import resolve_runtime_config
        runtime = resolve_runtime_config(role="sino_conversation")
        if runtime is None:
            raise RuntimeError("sino_conversation_model_unavailable")
        prompt = """你是 Sino Founder AI 的 Founder Gate Autonomous Resolution Worker。Founder 不是 Unknown Resolver。你必须只基于输入中的 canonical Project Definition、approved Implementation Plan、Execution Package、read-only discovery、候选基础设施、依赖证据和安全边界，对每个 blocking unknown 分类并尽可能自主解决。
分类只能是 DISCOVERABLE、DESIGNABLE、FOUNDER_AUTHORIZATION、EXTERNAL_UNAVAILABLE、TECHNICAL_BLOCKER。DISCOVERABLE 使用已有只读证据；DESIGNABLE 必须形成 provider-independent、隔离、非生产、最小范围、可回滚的具体 architecture candidate；不得把代码、SDK、环境变量或 ACTIVE candidate 当成已批准 binding。费用、Credential、生产影响与外部副作用必须先分析成具体边界，只有最终业务/风险授权才转为 FOUNDER_AUTHORIZATION。禁止猜测商业 Provider、设备、endpoint、CIDR、Secret 或价格；无证据时明确 external/technical blocker。不得执行、配置、联网探测、创建资源或产生费用。
如果 prior_resolution 中存在 validation_issues，必须逐项修正：没有 Credential/IAM/Network candidate 时可以设计新的 project-scoped boundary，但不得声称复用“现有”Credential/IAM/Network；费用只能在条件成立时表述为 conditional zero incremental external cost；未来会创建 schema、进程、配置或身份边界时不得宣称完全没有 side effect，而应明确 side-effect scope。FOUNDER_AUTHORIZATION 不是 blocker，不得放入 unresolved_blockers。
不得凭空选择 local container、Docker、local volume、商业 Cloud 或设备。具体 Runtime/Storage/Compute 只能来自 candidate_infrastructure；没有候选时使用 provider-independent 的抽象 project-scoped boundary，或保留明确 blocker。
若 candidate_infrastructure 已提供 ACTIVE Storage/Compute，必须评估“经 Founder 授权后的隔离复用”是否足以作为当前 Minimum Non-Production Runtime，而不是仅因尚未 approved 就判为 EXTERNAL_UNAVAILABLE。对于没有候选的 IAM/Network/Credential，可以设计新的 project-scoped application boundary；必须明确未来会发生的本地 schema/process/config/identity side effects。只有确实缺少无法设计或无法从候选推导的外部事实才使用 EXTERNAL_UNAVAILABLE。
一个 decision-ready Candidate 必须能直接绑定当前 Package 所需的全部逻辑依赖；不得使用“未来再绑定 concrete provider/real resource”作为批准后的占位方案。若采用 observed Storage/Compute candidate，策略中必须明确引用该 candidate 并说明隔离复用边界。
只返回 JSON：unknown_resolutions(array，每项 original_unknown,resolution_type,status,resolution result|founder_authorization|external_unavailable|technical_blocker,source_refs,reason,confidence,result), architecture_candidate(object或null，字段 name,runtime_type,target_environment_type,storage_strategy,compute_strategy,iam_strategy,network_strategy,credential_strategy,cost_model,external_side_effects,production_impact,isolation_strategy,rollback_strategy,why,risks,confidence,required_founder_authorizations), founder_decisions_required(array，每项 decision,label,scope,reason,risk), unresolved_blockers(array，每项 field,classification,reason,missing_external_fact), recommendation_status。所有结论必须带来源、理由和 confidence。"""
        response = llm_gateway.generate_for_model(runtime.provider_key, runtime.model, LLMRequest(
            system_prompt=prompt, user_prompt=json.dumps(context, ensure_ascii=False), temperature=0.1,
            max_tokens=4200, response_format="json", metadata={"runtime_role": "sino_conversation", "brain_stage": "founder_gate_autonomous_resolution"},
        ))
        payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
        payload["provider"], payload["model"] = response.provider, response.model
        return payload

    @staticmethod
    def _validate_founder_gate_resolution(payload: dict, *, original_unknowns: list[dict]) -> dict:
        classifications = {"DISCOVERABLE", "DESIGNABLE", "FOUNDER_AUTHORIZATION", "EXTERNAL_UNAVAILABLE", "TECHNICAL_BLOCKER"}
        if not isinstance(payload, dict):
            raise ValueError("founder_gate_resolution_required")
        resolutions = []
        for item in payload.get("unknown_resolutions") or []:
            item = dict(item or {})
            original = item.get("original_unknown")
            if isinstance(original, dict):
                original = original.get("field")
            classification = str(item.get("resolution_type") or "").upper()
            if classification not in classifications or not original or not item.get("reason"):
                raise ValueError("invalid_founder_gate_unknown_resolution")
            confidence = max(0.0, min(1.0, float(item.get("confidence") or 0)))
            resolutions.append({**item, "original_unknown": str(original), "resolution_type": classification, "source_refs": list(item.get("source_refs") or []), "confidence": confidence})
        resolved_fields = {str(item.get("original_unknown")) for item in resolutions}
        for unknown in original_unknowns:
            field = str(unknown.get("field"))
            if field not in resolved_fields:
                resolutions.append({
                    "original_unknown": field, "resolution_type": "EXTERNAL_UNAVAILABLE", "status": "external_unavailable",
                    "source_refs": [], "reason": "Autonomous analysis returned no supported resolution for this required fact.",
                    "confidence": 1.0, "result": None,
                })
        candidate = payload.get("architecture_candidate")
        if candidate is not None:
            candidate = dict(candidate)
            required = ("name", "runtime_type", "target_environment_type", "storage_strategy", "compute_strategy", "iam_strategy", "network_strategy", "credential_strategy", "cost_model", "external_side_effects", "production_impact", "isolation_strategy", "rollback_strategy", "why", "risks", "confidence", "required_founder_authorizations")
            if any(candidate.get(key) in (None, "", []) for key in required):
                raise ValueError("incomplete_founder_gate_architecture_candidate")
            candidate["confidence"] = max(0.0, min(1.0, float(candidate.get("confidence") or 0)))
            candidate["risks"] = list(candidate.get("risks") or [])
            candidate["required_founder_authorizations"] = list(candidate.get("required_founder_authorizations") or [])
        blockers = [dict(item) for item in payload.get("unresolved_blockers") or [] if str((item or {}).get("classification") or "").upper() in {"EXTERNAL_UNAVAILABLE", "TECHNICAL_BLOCKER"}]
        decisions = [dict(item) for item in payload.get("founder_decisions_required") or []]
        terminal = [item for item in resolutions if item["resolution_type"] in {"EXTERNAL_UNAVAILABLE", "TECHNICAL_BLOCKER"} or item.get("status") in {"external_unavailable", "technical_blocker"}]
        for item in terminal:
            if not any(str(blocker.get("field")) == str(item.get("original_unknown")) for blocker in blockers):
                blockers.append({"field": item.get("original_unknown"), "classification": item["resolution_type"], "reason": item.get("reason"), "missing_external_fact": item.get("result")})
        decision_ready = bool(candidate) and not blockers and bool(decisions)
        return {
            "unknown_resolutions": resolutions,
            "architecture_candidate": candidate,
            "founder_decisions_required": decisions,
            "unresolved_blockers": blockers,
            "decision_ready": decision_ready,
            "recommendation_status": "decision_ready" if decision_ready else "blocked" if blockers else "analysis_incomplete",
            "provider": payload.get("provider"), "model": payload.get("model"),
        }

    @staticmethod
    def _founder_gate_resolution_validation_issues(result: dict, *, context: dict) -> list[dict]:
        candidate = dict(result.get("architecture_candidate") or {})
        discovery = dict(context.get("environment_discovery") or {})
        observed = {str(item.get("logical_dependency")) for item in discovery.get("candidate_infrastructure") or []}
        credential = str(candidate.get("credential_strategy") or "").casefold()
        runtime_type = str(candidate.get("runtime_type") or "").casefold()
        storage = str(candidate.get("storage_strategy") or "").casefold()
        compute = str(candidate.get("compute_strategy") or "").casefold()
        iam = str(candidate.get("iam_strategy") or "").casefold()
        network = str(candidate.get("network_strategy") or "").casefold()
        cost = str(candidate.get("cost_model") or "").casefold()
        side_effects = str(candidate.get("external_side_effects") or "").casefold().strip()
        why = str(candidate.get("why") or "").casefold()
        decisions_text = " ".join(json.dumps(item, ensure_ascii=False).casefold() for item in result.get("founder_decisions_required") or [])
        issues = []
        observed_text = " ".join(str(item.get("candidate") or "").casefold() for item in discovery.get("candidate_infrastructure") or [])
        if any(term in runtime_type for term in ("container", "docker")) and not any(term in observed_text for term in ("container", "docker")):
            issues.append({"field": "provider", "reason": "No container runtime was discovered; use an observed compute candidate or a provider-independent abstract runtime boundary."})
        if any(term in storage for term in ("local_volume", "local volume", "filesystem", "文件卷")) and not any(term in observed_text for term in ("volume", "filesystem")):
            issues.append({"field": "resource:storage", "reason": "No local volume/filesystem candidate was discovered; evaluate the observed storage candidate or retain a blocker."})
        if any(term in f"{why} {decisions_text}" for term in ("future binding", "eventually provide real", "without concrete provider binding", "未来绑定", "后续绑定")):
            issues.append({"field": "provider", "reason": "The recommendation defers an execution-required concrete binding to a future decision; it is not decision-ready for this Package."})
        storage_candidates = [str(item.get("candidate") or "").casefold() for item in discovery.get("candidate_infrastructure") or [] if str(item.get("logical_dependency")) in {"storage", "database"}]
        if storage_candidates and not any(any(token in storage for token in candidate.replace("-", " ").split() if len(token) >= 6) for candidate in storage_candidates):
            issues.append({"field": "resource:storage", "reason": "A Storage candidate was discovered, but the recommendation does not evaluate or bind that observed candidate."})
        compute_candidates = [str(item.get("candidate") or "").casefold() for item in discovery.get("candidate_infrastructure") or [] if str(item.get("logical_dependency")) == "compute"]
        if compute_candidates and not any(any(token in compute for token in candidate.replace("-", " ").split() if len(token) >= 6) for candidate in compute_candidates):
            issues.append({"field": "resource:compute", "reason": "A Compute candidate was discovered, but the recommendation does not evaluate or bind that observed candidate."})
        if "credential" not in observed and any(term in credential for term in ("reuse existing", "reuses existing", "existing credential", "复用现有", "已有凭据")):
            issues.append({"field": "credential_source", "reason": "No Credential candidate was discovered; design a new scoped credential boundary or retain an explicit blocker instead of claiming reuse."})
        if "iam" not in observed and any(term in iam for term in ("existing", "现有", "已有")):
            issues.append({"field": "resource:iam", "reason": "No IAM candidate was discovered; describe a designed project-scoped identity boundary, not an existing IAM binding."})
        if "network" not in observed and any(term in network for term in ("existing network", "现有网络", "已有网络")):
            issues.append({"field": "resource:network", "reason": "No Network candidate was discovered; describe a designed private/local boundary, not an existing Network binding."})
        if any(term in cost for term in ("zero incremental", "zero cost", "零增量", "零成本")) and not any(term in cost for term in ("if ", "conditional", "subject to", "若", "前提", "条件")):
            issues.append({"field": "cost_boundary", "reason": "Zero incremental cost is only conditional on authorized reuse; express the condition and prohibit unapproved paid resources."})
        if side_effects in {"none", "none.", "无"} and candidate:
            issues.append({"field": "external_side_effect_boundary", "reason": "Architecture implementation changes local resources or configuration; state the bounded future side effects even though none were performed during analysis."})
        return issues

    def _resolve_founder_gate_unknowns(self, *, context: dict, original_unknowns: list[dict], prior: dict | None = None) -> dict:
        max_rounds = 3
        attempts = []
        previous_fingerprint = None
        result = dict(prior or {})
        prompt_prior = dict(prior or {})
        status = "pending"
        for round_number in range(1, max_rounds + 1):
            raw = self._founder_gate_resolution_runner({**context, "original_blocking_unknowns": original_unknowns, "prior_resolution": prompt_prior or None, "autonomous_round": round_number, "max_autonomous_rounds": max_rounds})
            next_result = self._validate_founder_gate_resolution(raw, original_unknowns=original_unknowns)
            validation_issues = self._founder_gate_resolution_validation_issues(next_result, context=context)
            if validation_issues:
                next_result["decision_ready"] = False
                next_result["recommendation_status"] = "evidence_revision_required"
                next_result["validation_issues"] = validation_issues
            fingerprint = hashlib.sha256(json.dumps(next_result, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()
            progress = fingerprint != previous_fingerprint
            attempts.append({"round": round_number, "progress": progress, "decision_ready": next_result["decision_ready"], "blocking_count": len(next_result["unresolved_blockers"])})
            result = next_result
            if result["decision_ready"]:
                status = "decision_ready"
                break
            if result.get("validation_issues"):
                previous_fingerprint = fingerprint
                prompt_prior = {"validation_issues": result["validation_issues"], "rejected_candidate": (result.get("architecture_candidate") or {}).get("name")}
                status = "analysis_in_progress"
                continue
            if result["unresolved_blockers"]:
                status = "blocked"
                break
            if not progress:
                status = "autonomous_resolution_stalled"
                break
            previous_fingerprint = fingerprint
            prompt_prior = result
        else:
            status = "autonomous_resolution_stalled"
        if status == "autonomous_resolution_stalled" and result.get("validation_issues"):
            result["unresolved_blockers"] = [
                {"field": item.get("field"), "classification": "TECHNICAL_BLOCKER", "reason": item.get("reason"), "missing_external_fact": None}
                for item in result["validation_issues"]
            ]
            result["decision_ready"] = False
            result["recommendation_status"] = "evidence_validation_blocked"
        return {**result, "resolution_status": status, "resolution_attempts": attempts, "resolution_rounds": len(attempts), "max_autonomous_rounds": max_rounds, "last_resolution_reason": "Founder authorization is ready." if status == "decision_ready" else "External or technical facts remain unavailable." if status == "blocked" else "No additional supported resolution was produced.", "resolved_at": datetime.now(timezone.utc).isoformat()}

    def _materialize_founder_gate_proposal(self, *, conversation, discovery: dict, package: dict, plan: dict, draft, context_evidence: list[dict] | None = None) -> dict | None:
        preflight = dict(package.get("preflight") or {})
        if package.get("preflight_status") != "founder_gate_required" or not preflight.get("founder_gate_reasons"):
            return None
        runtime_binding = dict(package.get("runtime_binding") or {})
        gate_type = "runtime_environment_binding" if runtime_binding.get("requires_runtime_binding") else "execution_exception"
        gate_reasons = list(preflight.get("founder_gate_reasons") or [])
        occurrence_seed = json.dumps({"package_id": package.get("package_id"), "gate_type": gate_type, "reasons": gate_reasons}, ensure_ascii=False, sort_keys=True)
        occurrence_id = hashlib.sha256(occurrence_seed.encode()).hexdigest()[:16]
        proposal_seed = f"{package.get('package_id')}:{gate_type}:{occurrence_id}"
        proposal_id = f"founder-gate-proposal-{hashlib.sha256(proposal_seed.encode()).hexdigest()[:20]}"
        proposals = [dict(item) for item in discovery.get("founder_gate_proposals") or []]
        existing = next((item for item in proposals if item.get("proposal_id") == proposal_id), None)
        evidence = list(context_evidence or [])
        environment_discovery = SinoBrainRuntime._runtime_environment_discovery(package) if gate_type == "runtime_environment_binding" else {
            "status": "not_applicable", "mode": "read_only", "candidate_infrastructure": [], "approved_bindings": [],
            "blocking_unknowns": [], "external_side_effects_performed": False,
        }
        recommendation = dict(runtime_binding.get("recommendation") or {})
        original_unknowns = list(environment_discovery.get("blocking_unknowns") or [])
        resolution_input = {
            "resolution_schema_version": 7,
            "gate_type": gate_type,
            "project": {"project_id": conversation.project_id, "name": getattr(draft, "project_name", None)},
            "confirmed_definition": {"draft_id": package.get("source_draft_id"), "version": package.get("source_draft_version"), "content": getattr(draft, "structured_content", None)},
            "implementation_plan": plan,
            "execution_package": {key: package.get(key) for key in ("package_id", "scope", "work_items", "execution_order", "risk_summary", "acceptance_criteria", "rollback_plan", "executor_requirements")},
            "dependency_evidence": evidence,
            "environment_discovery": environment_discovery,
            "architecture_synthesis_guidance": {
                "observed_candidates_to_evaluate": [
                    {"logical_dependency": item.get("logical_dependency"), "candidate": item.get("candidate"), "availability": item.get("availability"), "approved_for_package": item.get("approved_for_package")}
                    for item in environment_discovery.get("candidate_infrastructure") or []
                ],
                "resources_without_observed_candidate": [
                    str(name) for name in runtime_binding.get("required_resource_bindings") or []
                    if str(name) not in {str(item.get("logical_dependency")) for item in environment_discovery.get("candidate_infrastructure") or []}
                ],
                "allowed_design_scope": "project-scoped application boundaries only; no concrete external provider or device may be invented",
                "authorization_rule": "ACTIVE/CONFIGURED candidates remain unapproved until Founder approves the recommendation",
            },
            "safety_constraints": ["read_only_analysis", "no_external_resource_creation", "no_secret_generation", "no_cost", "no_production_change", "isolated", "non_production", "reversible", "minimum_scope"],
        }
        fingerprint_payload = json.loads(json.dumps(resolution_input, ensure_ascii=False, default=str))
        (fingerprint_payload.get("environment_discovery") or {}).pop("discovered_at", None)
        resolution_input_fingerprint = hashlib.sha256(json.dumps(fingerprint_payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
        prior_resolution = dict((existing or {}).get("autonomous_resolution") or {})
        if prior_resolution.get("input_fingerprint") == resolution_input_fingerprint and prior_resolution.get("resolution_status") in {"decision_ready", "blocked", "autonomous_resolution_stalled"}:
            autonomous_resolution = prior_resolution
        else:
            autonomous_resolution = self._resolve_founder_gate_unknowns(context=resolution_input, original_unknowns=original_unknowns, prior=prior_resolution or None)
            autonomous_resolution["input_fingerprint"] = resolution_input_fingerprint
        architecture_candidate = dict(autonomous_resolution.get("architecture_candidate") or {})
        synthesized_binding = {}
        if architecture_candidate:
            strategy_keys = {"storage": "storage_strategy", "compute": "compute_strategy", "iam": "iam_strategy", "network": "network_strategy"}
            synthesized_binding = {
                "provider": architecture_candidate.get("runtime_type"),
                "target_environment": architecture_candidate.get("target_environment_type"),
                "resource_bindings": [
                    {"logical_dependency": name, "concrete_target": architecture_candidate.get(strategy_keys.get(str(name), f"{name}_strategy")), "status": "recommended"}
                    for name in runtime_binding.get("required_resource_bindings") or []
                    if architecture_candidate.get(strategy_keys.get(str(name), f"{name}_strategy"))
                ],
                "credential_source": architecture_candidate.get("credential_strategy"),
                "cost_boundary": architecture_candidate.get("cost_model"),
                "external_side_effect_boundary": architecture_candidate.get("external_side_effects"),
                "production_impact": architecture_candidate.get("production_impact"),
            }
        candidates = list(environment_discovery.get("candidate_infrastructure") or [])
        candidate_by_resource = {item.get("logical_dependency"): item for item in candidates}
        resource_recommendations = []
        recommendation_binding = dict(recommendation.get("runtime_binding") or synthesized_binding)
        for item in recommendation_binding.get("resource_bindings") or runtime_binding.get("resource_bindings") or []:
            name = item.get("logical_dependency")
            candidate = candidate_by_resource.get(name) or {}
            resource_recommendations.append({
                "logical_dependency": name,
                "recommended_target": item.get("concrete_target") or candidate.get("candidate") or "Unknown",
                "classification": candidate.get("availability") or "UNKNOWN",
                "approved_for_package": bool(candidate.get("approved_for_package")),
                "reason": candidate.get("evidence") or "Read-only discovery found no concrete candidate.",
            })
        known = [
            {"label": "Project", "value": getattr(draft, "project_name", None) or conversation.project_id},
            {"label": "Approved Implementation Plan", "value": package.get("implementation_plan_id")},
            {"label": "Canonical Execution Package", "value": package.get("package_id")},
            {"label": "Founder Approval", "value": (package.get("approval_ref") or {}).get("status")},
            {"label": "Required Resources", "value": list(runtime_binding.get("required_resource_bindings") or [])},
        ]
        if evidence:
            known.append({"label": "Real Dependency Evidence", "value": evidence})
        recommended_binding = recommendation_binding
        proposed_binding = {
            "provider": recommended_binding.get("provider") or runtime_binding.get("provider"),
            "target_environment": recommended_binding.get("target_environment") or runtime_binding.get("target_environment"),
            "resource_bindings": list(recommended_binding.get("resource_bindings") or runtime_binding.get("resource_bindings") or []),
            "credential_source": recommended_binding.get("credential_source") or runtime_binding.get("credential_source"),
            "cost_boundary": recommended_binding.get("cost_boundary") or runtime_binding.get("cost_boundary"),
            "external_side_effect_boundary": recommended_binding.get("external_side_effect_boundary") or runtime_binding.get("external_side_effect_boundary"),
            "production_impact": recommended_binding.get("production_impact") if "production_impact" in recommended_binding else runtime_binding.get("production_impact"),
        }
        blocking_unknowns = list(autonomous_resolution.get("unresolved_blockers") or [])
        founder_decisions_required = list(autonomous_resolution.get("founder_decisions_required") or [])
        decision_ready = not blocking_unknowns and bool(resource_recommendations)
        decision_ready = bool(autonomous_resolution.get("decision_ready")) and decision_ready
        recommendation_status = autonomous_resolution.get("recommendation_status") or ("concrete" if decision_ready else "requires_discovery_resolution")
        target = proposed_binding.get("target_environment") or "Unknown — no approved target environment"
        provider = proposed_binding.get("provider") or "Unknown — no approved runtime provider/type"
        proposal_content = {
            "known": known,
            "recommended": {
                "name": architecture_candidate.get("name") or recommendation.get("summary") or "隔离的非生产 Runtime Binding（待具体目标确认）",
                "target_environment": target,
                "provider": provider,
                "why": architecture_candidate.get("why") or recommendation.get("reason") or gate_reasons[0],
                "existing_infrastructure": candidates,
                "resource_recommendations": resource_recommendations,
                "new_credential": proposed_binding.get("credential_source") or "Unknown — credential type and authorization are unresolved",
                "new_cost": proposed_binding.get("cost_boundary") or "Unknown — no approved cost boundary",
                "production_impact": proposed_binding.get("production_impact") if proposed_binding.get("production_impact") is not None else "Unknown — production impact is not authorized",
                "external_side_effect": proposed_binding.get("external_side_effect_boundary") or "Unknown — external resource creation boundary is unresolved",
                "rollback_isolation": architecture_candidate.get("rollback_strategy") or "仅推荐隔离、非生产、可回滚的目标；具体回滚方案随 concrete binding 一并确认。",
                "isolation": architecture_candidate.get("isolation_strategy"),
                "risks": list(architecture_candidate.get("risks") or []),
                "confidence": architecture_candidate.get("confidence") if architecture_candidate else "low",
                "unresolved_facts": blocking_unknowns,
                "runtime_binding": proposed_binding,
            },
            "requires_founder_confirmation": founder_decisions_required,
            "unknown_items": [item.get("field") for item in blocking_unknowns],
            "founder_decision_required": "Sino 完成具体目标调查后再提交 Founder 决策。" if blocking_unknowns else "批准推荐方案，或返回当前 canonical Project Conversation 继续修改。",
            "environment_discovery": environment_discovery,
            "architecture_candidate": architecture_candidate or None,
            "resolution_evidence": list(autonomous_resolution.get("unknown_resolutions") or []),
        }
        now = datetime.now(timezone.utc).isoformat()
        readiness = {
            "decision_ready": decision_ready,
            "blocking_unknowns": blocking_unknowns,
            "discovery_status": environment_discovery.get("status"),
            "recommendation_status": recommendation_status,
            "founder_decisions_required": founder_decisions_required,
            "resolution_status": autonomous_resolution.get("resolution_status"),
            "resolution_attempts": list(autonomous_resolution.get("resolution_attempts") or []),
            "last_resolution_reason": autonomous_resolution.get("last_resolution_reason"),
        }
        if existing:
            comparable_before = {"content": existing.get("content"), "readiness": existing.get("decision_readiness")}
            comparable_after = {"content": proposal_content, "readiness": readiness}
            # Discovery timestamps are observational metadata, not a semantic revision.
            for comparable in (comparable_before, comparable_after):
                ((comparable.get("content") or {}).get("environment_discovery") or {}).pop("discovered_at", None)
            if comparable_before != comparable_after:
                history = list(discovery.get("founder_gate_proposal_history") or [])
                history.append(dict(existing))
                existing["version"] = int(existing.get("version") or 1) + 1
                existing["content"] = proposal_content
                existing["decision_readiness"] = readiness
                existing["decision_ready"] = decision_ready
                existing["autonomous_resolution"] = autonomous_resolution
                existing["updated_at"] = now
                discovery["founder_gate_proposal_history"] = history
            proposals = [existing if item.get("proposal_id") == proposal_id else item for item in proposals]
            discovery["founder_gate_proposals"] = proposals
            discovery["active_founder_gate_proposal"] = existing
            return existing

        proposal = {
            "proposal_id": proposal_id,
            "proposal_type": "founder_gate_proposal",
            "gate_type": gate_type,
            "gate_occurrence_id": occurrence_id,
            "title": "Runtime Environment Recommendation" if gate_type == "runtime_environment_binding" else "Founder Execution Exception Recommendation",
            "status": "ready_for_review",
            "version": 1,
            "project_id": conversation.project_id,
            "source_conversation_id": conversation.id,
            "source_draft_id": package.get("source_draft_id"),
            "source_draft_version": package.get("source_draft_version"),
            "implementation_plan_id": package.get("implementation_plan_id"),
            "execution_package_id": package.get("package_id"),
            "founder_gate_reasons": gate_reasons,
            "content": proposal_content,
            "decision_readiness": readiness,
            "decision_ready": decision_ready,
            "autonomous_resolution": autonomous_resolution,
            "created_at": now,
            "updated_at": now,
        }
        proposals.append(proposal)
        discovery["founder_gate_proposals"] = proposals
        discovery["active_founder_gate_proposal"] = proposal
        return proposal

    def review_founder_gate_proposal(self, conversation_id: str, proposal_id: str, action: str) -> dict:
        """Record one Founder decision without creating a Package or Execution Session."""
        if action not in {"approve", "revise"}:
            raise ValueError("Unsupported Founder Gate Proposal action")
        with SessionLocal() as session:
            state = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            if state is None:
                raise LookupError("Sino Brain state not found")
            discovery = dict(state.discovery or {})
            proposals = [dict(item) for item in discovery.get("founder_gate_proposals") or []]
            index = next((index for index, item in enumerate(proposals) if item.get("proposal_id") == proposal_id), None)
            if index is None:
                raise LookupError("Founder Gate Proposal not found")
            proposal = proposals[index]
            if proposal.get("status") == "approved" and action == "approve":
                return proposal
            if action == "approve" and proposal.get("decision_ready") is not True:
                raise ValueError("Founder Gate Proposal is not decision-ready")
            history = list(discovery.get("founder_gate_proposal_history") or [])
            history.append(dict(proposal))
            proposal["status"] = "approved" if action == "approve" else "needs_revision"
            proposal["founder_reviewed_at"] = datetime.now(timezone.utc).isoformat()
            proposal["updated_at"] = proposal["founder_reviewed_at"]
            proposals[index] = proposal
            discovery["founder_gate_proposals"] = proposals
            discovery["founder_gate_proposal_history"] = history
            discovery["active_founder_gate_proposal"] = proposal
            if action == "approve":
                package = dict(discovery.get("execution_package") or {})
                if package.get("package_id") != proposal.get("execution_package_id"):
                    raise ValueError("Founder Gate Proposal does not match current Execution Package")
                runtime_binding = dict(package.get("runtime_binding") or {})
                proposed_binding = dict(((proposal.get("content") or {}).get("recommended") or {}).get("runtime_binding") or {})
                runtime_binding.update({key: value for key, value in proposed_binding.items() if value not in (None, [], {})})
                runtime_binding["binding_status"] = "approved"
                package["runtime_binding"] = runtime_binding
                discovery["execution_package"] = package
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
        if action == "approve":
            self.revalidate_execution_package(conversation_id)
        return proposal

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
    def _runtime_binding_assessment(*, package: dict, plan: dict) -> dict:
        """Evaluate concrete environment authorization separately from plan approval."""
        work_items = [dict(item) for item in package.get("work_items") or []]
        plan_requirements = list((package.get("executor_requirements") or {}).get("plan_requirements") or plan.get("execution_requirements") or [])
        semantic_text = json.dumps(
            {
                "scope": package.get("scope") or [],
                "work_items": work_items,
                "requirements": plan_requirements,
                "affected_system_objects": package.get("affected_system_objects") or [],
            },
            ensure_ascii=False,
        ).lower()
        side_effect_signals = (
            "provision", "deploy", "create resource", "configure infrastructure", "cloud runtime",
            "storage", "compute", "iam", "network", "database provisioning", "dns", "credential",
            "production", "external api", "external system", "创建资源", "配置资源", "配置基础设施",
            "部署服务", "运行时依赖", "生产环境", "外部系统", "真实凭据", "产生费用",
        )
        action_signals = ("create", "configure", "provision", "deploy", "创建", "配置", "部署", "开通")
        requires_runtime_binding = any(signal in semantic_text for signal in side_effect_signals) and any(signal in semantic_text for signal in action_signals)

        existing = dict(package.get("runtime_binding") or {})
        explicit_requirements = list(existing.get("required_resource_bindings") or [])
        if not explicit_requirements and requires_runtime_binding:
            resource_terms = (
                "storage", "compute", "iam", "network", "database", "dns", "queue", "cache",
                "object_store", "container", "cluster", "external_api",
            )
            discovered = []
            for item in work_items:
                item_text = json.dumps(item, ensure_ascii=False).lower()
                for term in resource_terms:
                    if term in item_text and term not in discovered:
                        discovered.append(term)
            explicit_requirements = discovered or [item.get("work_item_id") or item.get("title") for item in work_items]

        supplied_bindings = existing.get("resource_bindings") or []
        if isinstance(supplied_bindings, dict):
            supplied_bindings = [
                {"logical_dependency": key, "concrete_target": value}
                for key, value in supplied_bindings.items()
            ]
        binding_by_name = {
            str(item.get("logical_dependency")): item
            for item in supplied_bindings
            if isinstance(item, dict) and item.get("logical_dependency")
        }
        resource_bindings = []
        for requirement in explicit_requirements:
            current = dict(binding_by_name.get(str(requirement)) or {})
            concrete_target = current.get("concrete_target")
            resource_bindings.append({
                "logical_dependency": requirement,
                "concrete_target": concrete_target,
                "status": "resolved" if concrete_target else "unresolved",
            })

        provider = existing.get("provider")
        target_environment = existing.get("target_environment")
        credential_source = existing.get("credential_source")
        cost_boundary = existing.get("cost_boundary")
        external_boundary = existing.get("external_side_effect_boundary")
        production_impact = existing.get("production_impact")
        approved = existing.get("binding_status") in {"approved", "passed"}
        statuses = {
            "provider_resolved": bool(provider),
            "target_environment_resolved": bool(target_environment),
            "required_resource_bindings_resolved": bool(resource_bindings) and all(item["status"] == "resolved" for item in resource_bindings),
            "credential_boundary_resolved": bool(credential_source),
            "cost_boundary_resolved": bool(cost_boundary),
            "external_side_effect_boundary_resolved": bool(external_boundary),
            "production_impact_resolved": production_impact is not None,
        }
        fully_resolved = not requires_runtime_binding or (approved and all(statuses.values()))
        recommendation = dict(existing.get("recommendation") or {})
        if requires_runtime_binding and not recommendation:
            recommendation = {
                "summary": "先绑定一个隔离的非生产运行环境，再由 Executor 消费当前 Package；不得直接落到生产环境。",
                "target_environment": target_environment or "建议使用隔离的非生产环境；具体环境尚待 Founder 确认",
                "resource_bindings": [
                    {"logical_dependency": item["logical_dependency"], "recommendation": "绑定到所选 Provider 中隔离、可回滚的对应资源", "status": item["status"]}
                    for item in resource_bindings
                ],
                "existing_infrastructure": "未发现已明确批准并绑定到本 Package 的 active runtime environment。",
                "required_new_infrastructure": [item["logical_dependency"] for item in resource_bindings],
                "new_credential": "Unknown · 选择 Provider 与 Target Environment 后才能确认",
                "new_cost": "Unknown · 尚无已批准的成本边界",
                "production_impact": "Unknown · 当前不得假定生产影响已获授权",
                "external_side_effect": "将创建或配置真实基础设施资源，必须先获得 Runtime Binding 授权",
                "reason": "approved Implementation Plan 只批准了实施范围，没有指定真实 Provider、环境、资源目标及凭据、费用和外部副作用边界。",
            }
        return {
            **existing,
            "requires_runtime_binding": requires_runtime_binding,
            "provider": provider,
            "target_environment": target_environment,
            "required_resource_bindings": explicit_requirements,
            "resource_bindings": resource_bindings,
            "credential_source": credential_source,
            "cost_boundary": cost_boundary,
            "external_side_effect_boundary": external_boundary,
            "production_impact": production_impact,
            "binding_status": "passed" if fully_resolved else "founder_review_required" if requires_runtime_binding else "not_required",
            "recommendation": recommendation,
            **statuses,
        }

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
        check("permission_integrity", "passed", "Package 权限要求来自 approved Plan；该检查不代表真实 Runtime Environment 已授权。")
        runtime_binding = SinoBrainRuntime._runtime_binding_assessment(package=package, plan=plan)
        package["runtime_binding"] = runtime_binding
        if not runtime_binding["requires_runtime_binding"]:
            runtime_status = "passed"
            runtime_detail = "当前 Package 不创建或配置外部基础设施资源，无需 Runtime Environment Binding。"
        elif runtime_binding["binding_status"] == "passed":
            runtime_status = "passed"
            runtime_detail = "Runtime Provider、Target Environment、资源绑定及凭据、费用、外部副作用与生产影响边界均已明确批准。"
        else:
            runtime_status = "founder_gate_required"
            unresolved = [key.replace("_resolved", "") for key, value in runtime_binding.items() if key.endswith("_resolved") and not value]
            runtime_detail = "Runtime Environment Binding Required：" + "、".join(unresolved)
        check("runtime_environment_binding", runtime_status, runtime_detail)
        repo_root = Path(__file__).resolve().parents[3]
        try:
            branch = subprocess.run(["git", "branch", "--show-current"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.strip()
            dirty_lines = [line for line in subprocess.run(["git", "status", "--porcelain"], cwd=repo_root, text=True, capture_output=True, check=True).stdout.splitlines() if line]
            repository_ok = bool(branch) and not dirty_lines
            repository_detail = f"branch={branch or 'detached'}；working tree {'clean' if not dirty_lines else f'包含 {len(dirty_lines)} 项未提交变更'}。"
        except (OSError, subprocess.SubprocessError):
            repository_ok, repository_detail = False, "无法读取 Git repository 状态。"
        check("repository_state", "passed" if repository_ok else "failed", repository_detail)
        if repository_ok:
            working_tree_resolution = {
                "resolution_type": "autonomous_working_tree_resolution", "mode": "read_only", "status": "clean",
                "branch": branch, "dirty_count": 0, "inventory": [], "checkpoint_proposal": None,
                "founder_decision_required": False, "external_side_effects_performed": False,
            }
        else:
            try:
                working_tree_resolution = analyze_working_tree(repo_root)
            except (OSError, subprocess.SubprocessError):
                working_tree_resolution = {
                    "resolution_type": "autonomous_working_tree_resolution", "mode": "read_only", "status": "working_tree_blocked",
                    "branch": branch, "dirty_count": len(dirty_lines), "inventory": [], "checkpoint_proposal": None,
                    "founder_decision_required": False, "external_side_effects_performed": False,
                    "blocking_reason": "Git evidence could not be read safely.",
                }
        validation_ok = all(item.get("validation") for item in package["work_items"]) and bool(package["validation_plan"]["integration"]) and bool(package["acceptance_criteria"])
        check("validation_readiness", "passed" if validation_ok else "failed", "每个 Work Item、集成与最终验收均有验证定义。" if validation_ok else "存在缺失的验证定义。")
        rollback_ok = bool(package["rollback_plan"])
        check("rollback_readiness", "passed" if rollback_ok else "failed", "已形成与当前 Package 风险相符的回滚策略。" if rollback_ok else "缺少回滚策略。")
        founder_gate = any(item["status"] == "founder_gate_required" for item in checks)
        blocked = any(item["status"] == "failed" for item in checks)
        status = "founder_gate_required" if founder_gate else "blocked" if blocked else "ready"
        return {"status": status, "checks": checks, "blocking_reasons": [item["detail"] for item in checks if item["status"] == "failed"], "founder_gate_reasons": [item["detail"] for item in checks if item["status"] == "founder_gate_required"], "working_tree_resolution": working_tree_resolution, "validated_at": datetime.now(timezone.utc).isoformat()}

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
                "real_dependency_evidence": dependency_evidence_for_target(session, title),
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
        prompt = """你是 Sino Founder AI 的 Work Item 语义理解器。根据提供的 Source Document、相关原文片段、Confirmed Understanding、Parent Project Context、当前 Work Item、Existing State 与可追踪的 Real Dependency Evidence，形成对象特异性的专业判断。
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

    def ensure_constitution_work_item_semantics(self, conversation_id: str, work_item_id: str, *, refresh: bool = False) -> dict[str, Any]:
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
            if refresh or work_item_id not in semantics:
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
                    "work_item": {key: work_item.get(key) for key in ("work_item_id", "title", "source", "object_type", "existing_state", "founder_decision", "semantic_understanding")},
                    "existing_state_evidence": existing_matches,
                    "real_dependency_evidence": list(work_item.get("real_dependency_evidence") or []),
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
                    "real_dependency_evidence": [item.get("dependency_id") for item in context["real_dependency_evidence"]],
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

    def restore_constitution_review_after_invalid_goal(self, conversation_id: str) -> dict[str, Any]:
        """Restore a confirmed Constitution surface after a context-routing error.

        Formal Founder decisions are reconstructed only from durable child-project
        source references; no Goal or Project is created or deleted.
        """
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            conversation = session.get(ConversationDB, conversation_id)
            messages = list(session.scalars(select(ConversationMessageDB).where(
                ConversationMessageDB.conversation_id == conversation_id,
            ).order_by(ConversationMessageDB.created_at)))
            source_message = next((item for item in messages if item.role == "founder" and self.extract_constitution_understanding(item.content).get("system_objects")), None)
            if source_message is None:
                raise ValueError("Constitution source message not found")
            understanding = self.extract_constitution_understanding(source_message.content)
            understanding.update({"status": "founder_approved", "reviewed_at": datetime.now(timezone.utc).isoformat()})
            decisions, routing = {}, {}
            projects = session.scalars(select(FounderProjectDB).where(FounderProjectDB.source_conversation_id == conversation_id))
            for project in projects:
                if not project.source_work_item_id:
                    continue
                decisions[project.source_work_item_id] = "approved"
                routing[project.source_work_item_id] = {
                    "recommended_route": "system_project", "reason": project.creation_reason,
                    "proposed_object": project.name, "existing_state": "existing",
                    "next_action": "进入已创建 Project", "confidence": 1,
                    "routing_status": "approved", "routing_decision": "approved",
                    "formal_object_proposal": {
                        "proposal_id": project.source_proposal_id, "proposed_object": project.name,
                        "object_type": "system_project", "parent_project": session.get(FounderProjectDB, project.parent_project_id).name if project.parent_project_id and session.get(FounderProjectDB, project.parent_project_id) else None,
                        "architecture_role": project.architecture_role, "source_constitution": understanding.get("constitution_title"),
                        "source_work_item": project.name, "initial_positioning": project.initial_positioning,
                        "reason": project.creation_reason, "initial_scope": list(project.initial_scope or []),
                        "status": "created", "created_project_id": project.id,
                    },
                }
            discovery = {"message_intent": "project_context_update", "constitution_understanding": understanding, "proposed_work_item_decisions": decisions, "proposed_work_item_routing": routing}
            discovery["proposed_work_items"] = self._propose_constitution_work_items(session, understanding, decisions, routing)
            state.stage, state.goal_readiness, state.goal_brief = "context_updated", "unclear", {}
            state.strategy_proposals, state.conflicts, state.validations, state.decision, state.discussion_package = [], [], [], {}, {}
            state.discovery = discovery
            conversation.title = understanding.get("constitution_title") or conversation.title
            conversation.conversation_state = "active"
            for message in messages[-2:]:
                if message.message_type == "goal_brief":
                    message.grounding = {**(message.grounding or {}), "invalid_routing": True, "discarded": True}
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
            project_id = project.id
            session.commit()
        self.ensure_project_planning_conversation(project_id)
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
        payload["project_lifecycle"] = project_lifecycle_projection(payload["discovery"], conversation_stage=record.stage)
        payload["stage_workspaces"] = SinoBrainRuntime._stage_workspaces(payload)
        payload["active_workspace_stage"] = next((item["stage_key"] for item in payload["stage_workspaces"] if item["status"] == "active"), "asset_commit" if record.stage == "conversation_completed" else "package")
        payload["current_action"] = SinoBrainRuntime._current_action(payload)
        return payload

    @staticmethod
    def _current_action(brain):
        lifecycle = brain.get("project_lifecycle") or {}
        if lifecycle.get("rank", 0) >= 300 and lifecycle.get("current_action"):
            return dict(lifecycle["current_action"])
        stage = brain.get("stage") or "goal_discovery"
        if stage == "execution_package":
            package = dict((brain.get("discovery") or {}).get("execution_package") or {})
            preflight = dict(package.get("preflight") or {})
            status = package.get("preflight_status")
            if status == "ready":
                return {"action_id": "execution_package_ready", "title": "Execution Package Ready", "description": "执行准备完成。等待下一阶段接入 Executor。", "status_label": "Ready for Execution", "primary_label": None}
            if status == "founder_gate_required":
                runtime_binding = package.get("runtime_binding") or {}
                if runtime_binding.get("requires_runtime_binding") and runtime_binding.get("binding_status") != "passed":
                    recommendation = runtime_binding.get("recommendation") or {}
                    return {"action_id": "runtime_environment_binding_review", "title": "审核运行环境方案", "description": recommendation.get("summary") or "Runtime Environment 尚未绑定。", "status_label": "Founder Gate Required", "primary_label": None}
                return {"action_id": "execution_package_founder_gate", "title": "Execution Package 需要 Founder 判断", "description": "；".join(preflight.get("founder_gate_reasons") or []), "status_label": "Founder Gate Required", "primary_label": None}
            working_tree = dict(preflight.get("working_tree_resolution") or {})
            if working_tree.get("status") == "working_tree_resolution_ready":
                checkpoint = dict(working_tree.get("checkpoint_proposal") or {})
                return {"action_id": "working_tree_resolution_ready", "title": "Working Tree Resolution Ready", "description": f"Sino 已完成只读审计，建议 {checkpoint.get('checkpoint_name') or '形成安全 checkpoint'}；完成 clean baseline 后重新验证同一 Package。", "status_label": "Preflight Resolution Ready", "primary_label": None}
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
        lifecycle = brain.get("project_lifecycle") or {}
        lifecycle_stage = lifecycle.get("lifecycle_stage")
        current = (
            "validation" if lifecycle_stage in {"execution", "execution_result", "validation_result", "validated_result"} else
            "package" if lifecycle_stage == "execution_package" else
            "strategy" if lifecycle_stage == "implementation_planning" else
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
            "validation": (lifecycle.get("current_action") or {}).get("description") or f"已记录 {len(brain.get('conflicts') or [])} 个冲突与 {len(brain.get('validations') or [])} 个验证结果",
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
                "stage_id": f"{brain.get('brain_id')}:{key}", "stage_key": key, "label": lifecycle.get("stage_label") if key == current and lifecycle.get("rank", 0) >= 300 else "Project Planning" if internal == "project_planning" and key == "goal" else "Implementation Planning" if internal == "implementation_planning" and key == "strategy" else "Execution Package" if internal == "execution_package" and key == "package" else STAGE_LABELS[key],
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
