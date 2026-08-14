"""Sino Brain V1 lifecycle orchestration.

This layer owns clarification and decision state. It deliberately does not
execute code or mutate formal Founder Objects.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.database.db import SessionLocal
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest


STAGES = (
    "goal_discovery", "goal_review", "goal_confirmed", "strategy_meeting",
    "conflict_validation", "decision_ready", "package_ready", "package_approved",
)


def _iso(value):
    return value.isoformat() if value else None


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


class SinoBrainRuntime:
    """Conversation-scoped Brain state machine with explicit Founder gates."""

    MAX_CLARIFICATION_ROUNDS = 3

    def __init__(self, *, understanding_runner=None):
        self._understanding_runner = understanding_runner or self._provider_understanding

    def snapshot(self, conversation_id: str) -> dict[str, Any] | None:
        with SessionLocal() as session:
            record = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            return self._serialize(record) if record else None

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
            session.commit()
            return {"handled": True, "reply": reply, "message_type": message_type, "brain": self._serialize(state)}

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
            "source_conversation_id": conversation_id,
        }
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            state.strategy_proposals = proposals
            state.conflicts = conflicts
            state.validations = validations
            state.decision = decision
            state.discussion_package = package
            state.stage = "package_ready" if confidence >= .7 else "conflict_validation"
            state.updated_at = datetime.now(timezone.utc)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="decision", content=recommendation, grounding={"source_refs": decision["source_refs"]}))
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", message_type="discussion_package", content=f"Discussion Package 已形成：{package['title']}。等待 Founder 审批。"))
            session.commit()
            return self._serialize(state)

    def review_package(self, conversation_id: str, action: str) -> dict[str, Any]:
        if action not in {"approve", "return"}:
            raise ValueError("Unsupported package review action")
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            package = dict(state.discussion_package or {})
            if not package:
                raise ValueError("Discussion Package 不存在")
            package["status"] = "approved" if action == "approve" else "returned"
            package["reviewed_at"] = datetime.now(timezone.utc).isoformat()
            state.discussion_package = package
            state.stage = "package_approved" if action == "approve" else "goal_confirmed"
            state.updated_at = datetime.now(timezone.utc)
            session.commit()
            return self._serialize(state)

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
        for object_type, terms in labels.items():
            if not any(term.lower() in combined.lower() for term in terms):
                continue
            label = terms[0]
            objects.append({"discussion_object_id": _id("discussion-object"), "object_type": object_type, "name": f"{goal} {label}", "action": "create", "purpose": brief.get("problem"), "source": "Strategy Meeting + Decision", "reason": decision["final_recommendation"], "dependencies": [], "confidence": decision["confidence"], "risk": decision["key_risks"]})
        if proposals:
            objects.append({"discussion_object_id": _id("discussion-object"), "object_type": "knowledge", "name": f"{goal}讨论依据", "action": "create", "purpose": "保存模型提案、冲突与验证证据", "source": "Strategy Proposals", "reason": "保证决策可追溯", "dependencies": [], "confidence": decision["confidence"], "risk": []})
        return objects

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
        return {
            "brain_id": record.id, "conversation_id": record.conversation_id, "project_id": record.project_id,
            "stage": record.stage, "goal_readiness": record.goal_readiness, "goal_brief": dict(record.goal_brief or {}),
            "discovery": dict(record.discovery or {}), "strategy_proposals": list(record.strategy_proposals or []),
            "conflicts": list(record.conflicts or []), "validations": list(record.validations or []),
            "decision": dict(record.decision or {}), "discussion_package": dict(record.discussion_package or {}),
            "source_message_refs": list(record.source_message_refs or []), "created_at": _iso(record.created_at), "updated_at": _iso(record.updated_at),
        }


brain_runtime = SinoBrainRuntime()
