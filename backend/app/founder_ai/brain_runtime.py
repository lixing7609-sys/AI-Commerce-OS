"""Sino Brain V1 lifecycle orchestration.

This layer owns clarification and decision state. It deliberately does not
execute code or mutate formal Founder Objects.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB, SinoBrainSessionDB
from app.database.db import SessionLocal


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

    def snapshot(self, conversation_id: str) -> dict[str, Any] | None:
        with SessionLocal() as session:
            record = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == conversation_id))
            return self._serialize(record) if record else None

    def process_message(self, conversation_id: str, content: str) -> dict[str, Any]:
        """Advance discovery and return a staged Sino reply.

        Discovery is intentionally incremental: one high-impact question per turn.
        Existing provider conversation remains available after goal confirmation.
        """
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

            discovery = dict(state.discovery or {})
            answers = list(discovery.get("answers") or [])
            answers.append(content.strip())
            discovery["answers"] = answers
            discovery.setdefault("original_goal", content.strip())
            state.discovery = discovery
            state.updated_at = datetime.now(timezone.utc)

            question = self._next_question(answers)
            if question:
                state.stage = "goal_discovery"
                state.goal_readiness = "discovering"
                discovery["current_question"] = question
                state.discovery = discovery
                reply = question
                message_type = "goal_discovery"
            else:
                state.stage = "goal_review"
                state.goal_readiness = "reviewable"
                discovery.pop("current_question", None)
                state.discovery = discovery
                state.goal_brief = self._build_brief(answers)
                reply = "我已经把目标整理成 Goal Brief。请先确认目标，或继续补充；目标确认前不会启动策略会议。"
                message_type = "goal_brief"
            session.commit()
            return {"handled": True, "reply": reply, "message_type": message_type, "brain": self._serialize(state)}

    def confirm_goal(self, conversation_id: str) -> dict[str, Any]:
        with SessionLocal() as session:
            state = self._get(session, conversation_id)
            if state.stage not in {"goal_review", "goal_confirmed"} or not state.goal_brief:
                raise ValueError("Goal Brief 尚未达到可确认状态")
            state.stage = "goal_confirmed"
            state.goal_readiness = "confirmed"
            state.updated_at = datetime.now(timezone.utc)
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
            brief = dict(state.goal_brief or {})
            session.commit()
        return (
            "围绕以下已确认 Goal Brief 召开 Strategy Meeting。不得重定义目标。"
            "每个方案必须包含 Proposal、Required Steps、Dependencies、Risks、Cost/Complexity、"
            "Assumptions、Missing Factors、Evidence/Validation Needed。\nGoal Brief:\n" + str(brief)
        )

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
        recommendation = run.get("recommendation") or "先完成最小可验证闭环，再扩展完整能力体系。"
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
    def _next_question(answers: list[str]) -> str | None:
        short_drama = "短剧" in answers[0]
        questions = ((
            "你要做的是哪一种 AI 短剧：真人 AI 短剧、数字人短剧、AI 动画、AI 漫剧、小说推文类，还是其他形式？",
            "这是内容业务，还是要开发一套短剧生产软件？最终主要由 Founder 自用、Studio 使用，还是对外商业化？",
            "第一阶段最重要的结果是什么：降低成本、提高日产量、提高爆款率、提高自动化程度，还是验证商业模式？",
            "请给出最关键的约束和验收标准，例如目标平台、真人/全 AI、预算、团队、时间、版权合规、日产量或单条成本。",
        ) if short_drama else (
            f"你希望「{answers[0]}」最终形成什么：业务结果、可复用 AI 能力、软件产品，还是一次验证实验？",
            "最终由谁使用，谁会因为这个结果获得价值？",
            "第一阶段最重要且可衡量的结果是什么？",
            "请补充最关键的范围、时间、成本、团队、技术或合规约束，以及验收标准。",
        ))
        return questions[len(answers) - 1] if len(answers) <= len(questions) else None

    @staticmethod
    def _build_brief(answers: list[str]) -> dict[str, Any]:
        original = answers[0]
        return {
            "goal": original, "problem": f"明确并验证「{original}」的可执行产品与生产方案",
            "target_user": answers[2] if len(answers) > 2 else "待确认",
            "product_business_type": answers[1] if len(answers) > 1 else "待确认",
            "expected_outcome": answers[3] if len(answers) > 3 else "形成可验证的第一阶段闭环",
            "scope": answers[1:3], "constraints": [answers[4]] if len(answers) > 4 else [],
            "success_criteria": [answers[4]] if len(answers) > 4 else [],
            "unknowns": [], "assumptions": ["先验证最小可复制链路，再扩大范围"],
        }

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
