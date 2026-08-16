"""Conversation-first AI Secretary persistence and structured digest service."""

import json
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.project.service import apply_project_distillation
from app.database.db import SessionLocal
from app.llm.exceptions import InvalidResponseError
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest
from .state_machine import advance_discussion


def _iso(value):
    return value.isoformat() if value else None


class SinoSecretaryService:
    """Turns an append-only discussion into traceable structured Founder assets."""

    def __init__(self, *, reply_generator=None):
        self._reply_generator = reply_generator or self._provider_reply

    def append_message(self, conversation_id: str, content: str, *, intent: str | None = None, message_type: str = "discussion", reply_override: str | None = None, skip_object_recognition: bool = False, brain_stage: str | None = None) -> dict:
        text = (content or "").strip()
        if not text:
            raise ValueError("message must not be empty")
        with SessionLocal() as session:
            conversation = session.scalar(select(ConversationDB).where(ConversationDB.id == conversation_id, ConversationDB.system_id == "founder_ai"))
            if conversation is None:
                raise LookupError("Founder AI conversation not found")
            stage_grounding = {"brain_stage": brain_stage} if brain_stage else {}
            message = ConversationMessageDB(conversation_id=conversation_id, role="founder", content=text, intent=intent, message_type=message_type, grounding=stage_grounding)
            session.add(message); session.flush()
            project_id = conversation.project_id
            conversation.updated_at = datetime.now(timezone.utc)
            session.commit()
            message_id = message.id
        # Persist recognition before provider latency so the homepage can poll
        # and show a real Draft while Sino is still composing the reply.
        if not skip_object_recognition:
            try:
                from app.core.founder_intent.service import intent_engine
                intent_engine.run(conversation_id, message_id, text)
            except Exception:
                pass
        # The Founder message is committed before the provider is invoked. Provider
        # failure therefore leaves a durable, retryable Conversation rather than
        # rolling back the first message or creating a replacement Conversation.
        reply, grounding = self._normalize_reply(reply_override if reply_override is not None else self._reply_generator(conversation_id, text))
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=reply, message_type=message_type, grounding={**grounding, **stage_grounding}))
            conversation.updated_at = datetime.now(timezone.utc)
            session.commit()
        if message_type == "project_planning":
            try:
                from app.founder_ai.brain_runtime import brain_runtime
                brain_runtime.judge_project_maturity(conversation_id)
            except Exception:
                # The reply is already durable. A maturity provider failure must
                # remain retryable and must not manufacture a default verdict.
                pass
        # The discussion is durable before enrichment starts. A failed distillation
        # must never erase the Founder message or the completed Sino reply.
        try:
            with SessionLocal() as session:
                conversation = session.get(ConversationDB, conversation_id)
                message = session.get(ConversationMessageDB, message_id)
                distillation = self._update_digest(session, conversation, message)
                session.commit()
            if project_id:
                try:
                    apply_project_distillation(project_id, **distillation)
                except Exception:
                    # Keep the last known good Project Intelligence snapshot.
                    pass
        except Exception:
            pass
        return self.snapshot(conversation_id)

    def retry_reply(self, conversation_id: str) -> dict:
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai":
                raise LookupError("Founder AI conversation not found")
            latest = session.scalar(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at.desc()))
            if latest is None:
                raise ValueError("Conversation has no Founder message to retry")
            if latest.role == "assistant":
                return self.snapshot(conversation_id)
            founder_message_id, founder_text, project_id, message_type = latest.id, latest.content, conversation.project_id, latest.message_type
        reply, grounding = self._normalize_reply(self._reply_generator(conversation_id, founder_text))
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            session.add(ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=reply, message_type=message_type, grounding=grounding))
            conversation.updated_at = datetime.now(timezone.utc)
            session.commit()
        if message_type == "project_planning":
            try:
                from app.founder_ai.brain_runtime import brain_runtime
                brain_runtime.judge_project_maturity(conversation_id)
            except Exception:
                pass
        try:
            with SessionLocal() as session:
                conversation = session.get(ConversationDB, conversation_id)
                founder_message = session.get(ConversationMessageDB, founder_message_id)
                distillation = self._update_digest(session, conversation, founder_message)
                session.commit()
            if project_id:
                try: apply_project_distillation(project_id, **distillation)
                except Exception: pass
        except Exception:
            pass
        try:
            from app.core.founder_intent.service import intent_engine
            intent_engine.run(conversation_id, founder_message_id, founder_text)
        except Exception:
            pass
        return self.snapshot(conversation_id)

    def _update_digest(self, session, conversation, message):
        digest = session.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation.id))
        if digest is None:
            digest = SecretaryDigestDB(conversation_id=conversation.id)
            session.add(digest)
        founder_messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation.id, ConversationMessageDB.role == "founder").order_by(ConversationMessageDB.created_at)))
        assistant = session.scalar(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation.id, ConversationMessageDB.role == "assistant").order_by(ConversationMessageDB.created_at.desc()))
        digest.summary = self._discussion_summary(message.content, assistant.content if assistant else "")
        topics = list(digest.topics or [])
        topic = message.content[:40]
        if topic not in topics:
            topics.append(topic)
        digest.topics = topics[-8:]
        viewpoints = list(digest.key_viewpoints or [])
        if message.content not in viewpoints:
            viewpoints.append(message.content)
        digest.key_viewpoints = viewpoints[-12:]
        digest.updated_at = datetime.now(timezone.utc)

        text = message.content
        is_capability_lifecycle = message.message_type in {"capability_lifecycle", "capability_lifecycle_error"}
        is_project_context_update = message.message_type == "project_context_update" or message.intent == "project_context_update"
        constraints = list(digest.constraints or [])
        if any(term in text for term in ("不要", "必须", "禁止", "只能", "保持", "不得")) and text not in constraints:
            constraints.append(text)
        digest.constraints = constraints[-20:]
        terminology = list(digest.terminology or [])
        if any(term in text for term in ("定义为", "称为", "叫做", "意味着")) and text not in terminology:
            terminology.append(text)
        digest.terminology = terminology[-20:]
        prompt_changes = []
        if any(term in text for term in ("不要", "必须", "禁止", "定义为", "保持", "原则", "正式确认", "正式采用", "冻结", "改为", "修正", "不再", "只负责", "替换", "而是")):
            prompt_changes.append(text)
        is_revision = any(term in text for term in ("改为", "修正", "不再", "只负责", "替换", "而是"))
        is_deprecated = any(term in text for term in ("废弃", "取消旧规则", "不再采用"))
        digest.prompt_delta = {
            "added": [] if is_revision or is_deprecated else prompt_changes,
            "revised": prompt_changes if is_revision else [],
            "deprecated": prompt_changes if is_deprecated else [],
        }
        memory_candidates = list(digest.memory_candidates or [])
        if any(term in text for term in ("记住", "长期", "原则", "以后")) and text not in memory_candidates:
            memory_candidates.append(text)
        digest.memory_candidates = memory_candidates[-12:]
        asset_candidates = list(digest.asset_candidates or [])
        if not is_project_context_update and any(term in text for term in ("标准", "规范", "Prompt", "工作流", "方案")) and text not in asset_candidates:
            asset_candidates.append(text)
        digest.asset_candidates = asset_candidates[-12:]
        if conversation.title in {"New Conversation", "新讨论", ""}:
            conversation.title = self._title(text)
        decision_markers = ("完全同意", "正式确认", "我确认", "正式采用", "正式决定", "确定采用", "按此决定", "冻结")
        decision_candidate_markers = (*decision_markers, "决定", "确定", "采用", "改为")
        if any(term in text for term in decision_candidate_markers):
            exists = session.scalar(select(DecisionAssetDB).where(DecisionAssetDB.conversation_id == conversation.id, DecisionAssetDB.decision == text))
            if exists is None:
                session.add(DecisionAssetDB(system_id="founder_ai", conversation_id=conversation.id, title=text[:80], decision=text, source_message_ids=[message.id], confirmed=any(term in text for term in decision_markers)))
        for knowledge_text in self._extract_knowledge(text, assistant.content if assistant else ""):
            exists = session.scalar(select(MemoryAssetDB).where(MemoryAssetDB.conversation_id == conversation.id, MemoryAssetDB.content == json.dumps({"knowledge": knowledge_text}, ensure_ascii=False), MemoryAssetDB.memory_type == "knowledge", MemoryAssetDB.status == "active"))
            if exists is None:
                session.add(MemoryAssetDB(system_id="founder_ai", conversation_id=conversation.id, memory_type="knowledge", title=knowledge_text[:80], content=json.dumps({"knowledge": knowledge_text}, ensure_ascii=False), confidence=0.8, source_message_ids=[message.id, assistant.id] if assistant else [message.id]))
        candidate = None
        goal_markers = ("实现", "开发", "创建", "修复", "重构", "build", "implement", "正式目标", "目标确定为", "目标是", "按这个执行", "做成任务", "开始实施")
        if not is_capability_lifecycle and not is_project_context_update and any(term in text.lower() for term in goal_markers):
            candidate = session.scalar(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation.id, CandidateGoalDB.title == text[:200], CandidateGoalDB.status == "candidate"))
            if candidate is None:
                candidate = CandidateGoalDB(conversation_id=conversation.id, title=text[:200], description=text, source_message_ids=[message.id], confidence=0.8 if any(term in text for term in ("按这个执行", "做成任务", "开始实施")) else 0.65)
                session.add(candidate)
            confirms_goal = any(term in text for term in ("正式目标", "目标确定为", "按这个执行", "做成任务", "开始实施"))
            if confirms_goal:
                session.flush()
                goal = session.scalar(select(GoalAssetDB).where(GoalAssetDB.candidate_goal_id == candidate.id))
                if goal is None:
                    session.add(GoalAssetDB(conversation_id=conversation.id, candidate_goal_id=candidate.id, title=candidate.title, description=candidate.description, source_message_ids=list(candidate.source_message_ids or [])))
                candidate.status = "confirmed"
                conversation.conversation_state = "goal_confirmed"
        if any(term in text for term in ("已解决", "答案是", "结论是", "确定为")):
            self._resolve_questions(session, conversation.id, text)
        if any(mark in text for mark in ("?", "？")):
            exists = session.scalar(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id == conversation.id, PendingQuestionDB.content == text, PendingQuestionDB.status == "open"))
            if exists is None:
                session.add(PendingQuestionDB(conversation_id=conversation.id, content=text, reason="讨论尚未形成明确结论", source_message_ids=[message.id]))
        if assistant and any(mark in assistant.content for mark in ("?", "？")):
            for sentence in assistant.content.replace("?", "？").split("？")[:-1]:
                question = sentence.split("。")[-1].strip()
                if not question:
                    continue
                question = f"{question}？"
                exists = session.scalar(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id == conversation.id, PendingQuestionDB.content == question, PendingQuestionDB.status == "open"))
                if exists is None:
                    session.add(PendingQuestionDB(conversation_id=conversation.id, content=question, reason="Sino 综合后仍待 Founder 确认", source_message_ids=[message.id, assistant.id]))
        if is_capability_lifecycle:
            conversation.conversation_state = "active"
        elif conversation.conversation_state != "goal_confirmed":
            conversation.conversation_state = advance_discussion(conversation.conversation_state, len(founder_messages), candidate is not None)
        position = self._project_position(conversation.conversation_state, bool(candidate), text)
        return {"summary": digest.summary, "viewpoints": [position], "constraints": list(digest.constraints or []), "terminology": list(digest.terminology or []), "prompt_delta": dict(digest.prompt_delta or {})}

    @staticmethod
    def _discussion_summary(founder_text: str, assistant_text: str) -> str:
        founder = " ".join((founder_text or "").split()).strip("。！？?! ")
        assistant = " ".join((assistant_text or "").split()).strip()
        topic = founder[:88]
        if assistant:
            conclusion = assistant.replace("\n", " ").split("。", 1)[0][:28]
            summary = f"当前讨论：{topic}。Sino：{conclusion}"
        else:
            summary = f"当前讨论：{topic}"
        return summary[:120]

    @staticmethod
    def _extract_knowledge(founder_text: str, assistant_text: str) -> list[str]:
        durable_markers = ("优先", "应", "需要", "依赖", "风险", "原则", "采用", "属于", "负责", "不能", "可以", "必须", "记住", "以后", "长期")
        candidates = []
        for source in (founder_text, assistant_text):
            for sentence in str(source or "").replace("\n", "。 ").split("。"):
                cleaned = " ".join(sentence.split()).strip("；;，, ")
                if 8 <= len(cleaned) <= 160 and any(marker in cleaned for marker in durable_markers):
                    candidates.append(cleaned)
        return list(dict.fromkeys(candidates))[:6]

    @staticmethod
    def _project_position(state: str, has_goal: bool, text: str) -> str:
        if any(term in text for term in ("冻结", "暂停")): return "冻结"
        if state == "goal_confirmed" or has_goal: return "准备执行"
        if state in {"consensus", "decision_forming"}: return "设计中"
        return "继续讨论"

    @staticmethod
    def _title(text: str) -> str:
        cleaned = text.strip().replace("\n", " ")
        for prefix in ("我们讨论一下", "讨论一下", "请继续", "请", "我想讨论"):
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):].lstrip("：:，, ")
        cleaned = cleaned.removeprefix("讨论").lstrip("：:，, ")
        cleaned = cleaned.removeprefix("一个公司").replace("的搭建", "搭建讨论")
        if "Project" in cleaned and any(term in cleaned for term in ("恢复", "重新进入", "上下文")):
            return "Project Intelligence 恢复机制"
        if "首页" in cleaned and "新建讨论" in cleaned:
            return "首页新讨论智能沉淀"
        cleaned = cleaned.lstrip("以后目前现在需要应该必须，, ")
        subject = cleaned.replace("。", "，").replace("；", "，").split("，", 1)[0]
        return (subject[:24] or "新讨论").rstrip("。！？?!")

    @staticmethod
    def _resolve_questions(session, conversation_id: str, answer: str) -> None:
        questions = list(session.scalars(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id == conversation_id, PendingQuestionDB.status == "open")))
        for question in questions:
            question.status = "resolved"

    @staticmethod
    def _provider_reply(conversation_id: str, text: str) -> str:
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at.desc()).limit(10)))
        from app.core.project.service import assemble_project_context, get_project_intelligence
        project_context = assemble_project_context(conversation.project_id) if conversation and conversation.project_id else {}
        project_intelligence = get_project_intelligence(conversation.project_id) if conversation and conversation.project_id else {}
        try:
            from app.core.founder_object.service import get_conversation_context_object
            context_object = get_conversation_context_object(conversation_id)
        except Exception:
            context_object = None
        recent_messages = [{"role": item.role, "content": item.content} for item in reversed(messages)]
        from app.core.model_center.service import resolve_runtime_config
        dialogue_runtime = resolve_runtime_config(role="sino_conversation")
        if dialogue_runtime is None:
            raise InvalidResponseError()
        request = LLMRequest(
            system_prompt="""你是 Sino Founder AI。Founder 不负责 Prompt Engineering。围绕当前 Project 与 Conversation 给出简洁、具体、可继续推进的中文回复。
如果 project_context 包含 parent_confirmed_context 与 child_project_context，必须把短指令（如“继续”“下一步呢”“你怎么看”）理解为推进当前 Project：先判断已有状态和最重要缺口，再主动给出专业下一步。不得要求 Founder 重复提供已继承的 Constitution、Parent、Architecture Role、Initial Positioning 或 Initial Scope。
回复应说明：你如何理解当前 Project、最重要缺口及优先原因、建议下一步、你可以先完成的分析、真正需要 Founder 判断的少量问题。不要机械复述 Context。
必须先自行分析职责、边界、父子关系、输入输出和能力需求；这些属于 Sino 的专业工作，不得反问 Founder“它应该负责什么”“与上层如何交互”或要求 Founder 排能力清单。只有无法从 confirmed Context 推断、且会实质改变系统方向的偏好，才能列为 founder_questions，最多 1–2 个；其余使用可修正的暂定判断。
普通讨论不得自动创建 Goal、Candidate、Capability、Task 或 Execution。只返回 JSON。优先使用 {"reply":"完整回复"}；如需结构化思考，可使用 understanding、gap、priority_reason、next_step、analysis、founder_questions 字段。""",
            user_prompt=json.dumps({"current_message": text, "recent_messages": recent_messages, "project_context": project_context, "context_object": context_object}, ensure_ascii=False),
            temperature=0.3,
            max_tokens=1200,
            response_format="json",
            metadata={"answer_grounding": True, "runtime_role": "sino_conversation"},
        )
        # Use the concrete model selected for Sino's Conversation skill.  Passing
        # only a provider (or no provider) lets legacy defaults select a different
        # model and previously routed ordinary replies through the reasoner.
        response = llm_gateway.generate_for_model(dialogue_runtime.provider_key, dialogue_runtime.model, request)
        try:
            payload = json.loads(response.content.strip().removeprefix("```json").removesuffix("```").strip())
            reply = str(payload.get("reply", "")).strip()
            if not reply and any(payload.get(key) for key in ("understanding", "gap", "next_step", "analysis")):
                sections = [
                    ("我目前如何理解", payload.get("understanding")),
                    ("当前最重要的缺口", payload.get("gap")),
                    ("为什么优先处理", payload.get("priority_reason")),
                    ("建议下一步", payload.get("next_step")),
                    ("Sino 可以先完成", payload.get("analysis")),
                ]
                reply = "\n\n".join(f"**{title}**\n{value}" for title, value in sections if value)
                questions = [str(item).strip() for item in payload.get("founder_questions") or [] if str(item).strip()]
                if questions:
                    reply += "\n\n**真正需要 Founder 判断**\n" + "\n".join(f"{index}. {item}" for index, item in enumerate(questions, 1))
        except (AttributeError, TypeError, ValueError, json.JSONDecodeError) as error:
            raise InvalidResponseError() from error
        if not reply:
            raise InvalidResponseError()
        grounding = SinoSecretaryService._answer_grounding(
            conversation_id=conversation_id,
            project_context=project_context,
            project_intelligence=project_intelligence,
            recent_messages=recent_messages,
            provider=response.provider,
            model=response.model,
        )
        return reply, grounding

    @staticmethod
    def _normalize_reply(generated):
        if isinstance(generated, tuple) and len(generated) == 2:
            return str(generated[0]), dict(generated[1] or {})
        return str(generated), {}

    @staticmethod
    def _answer_grounding(*, conversation_id: str, project_context: dict, project_intelligence: dict, recent_messages: list[dict], provider: str, model: str) -> dict:
        project_id = project_context.get("project_id")
        prompt = project_context.get("master_prompt") or ""
        decisions = list(project_context.get("confirmed_decisions") or [])
        knowledge = list(project_context.get("relevant_knowledge") or [])
        constraints = list(project_context.get("constraints") or [])
        terminology = list(project_context.get("terminology") or [])
        parent_context = dict(project_context.get("parent_confirmed_context") or {})
        parent_constitution = dict(parent_context.get("constitution") or {})
        child_context = dict(project_context.get("child_project_context") or {})
        historical_message_count = max(0, len(recent_messages) - 1)

        def source(key, label, *, available=False, used=False, count=None, version=None, references=None):
            item = {"key": key, "label": label, "available": bool(available), "used": bool(used)}
            if count is not None:
                item["count"] = count
            if version is not None:
                item["version"] = version
            if references:
                item["references"] = references
            return item

        sources = [
            source("project_summary", "项目摘要", available=bool(project_intelligence.get("project_summary")), used=False),
            source("current_position", "当前定位", available=bool(project_intelligence.get("current_positioning")), used=False),
            source("living_prompt", "动态提示词", available=bool(project_intelligence.get("master_prompt")), used=bool(prompt), version=f"v{project_context.get('prompt_version')}" if prompt and project_context.get("prompt_version") is not None else None, references=[{"source_id": project_id, "title": project_context.get("project_name")}] if prompt else None),
            source("confirmed_decisions", "正式决策", available=bool(project_intelligence.get("decisions")), used=bool(decisions), count=len(decisions), references=[{"source_id": item.get("decision_id"), "title": item.get("title")} for item in decisions]),
            source("knowledge", "项目知识", available=bool(project_intelligence.get("knowledge")), used=bool(knowledge), count=len(knowledge), references=[{"source_id": item.get("memory_id"), "title": item.get("title")} for item in knowledge]),
            source("constraints", "项目约束", available=bool(project_intelligence.get("constraints")), used=bool(constraints), count=len(constraints), references=[{"title": str(item)[:120]} for item in constraints]),
            source("terminology", "项目术语", available=bool(project_intelligence.get("terminology")), used=bool(terminology), count=len(terminology), references=[{"title": str(item)[:120]} for item in terminology]),
            source("pending_questions", "待确认问题", available=bool(project_intelligence.get("pending_questions")), used=False, count=0),
            source("goals", "项目目标", available=bool(project_intelligence.get("candidate_goals") or project_intelligence.get("active_goals")), used=False, count=0),
            source("conversation_history", "历史会话", available=historical_message_count > 0, used=historical_message_count > 0, count=historical_message_count),
            source("current_conversation", "当前会话", available=True, used=True, count=len(recent_messages), references=[{"source_id": conversation_id}]),
            source("parent_project", "Parent Project", available=bool(parent_context), used=bool(parent_context), references=[{"source_id": parent_context.get("project_id"), "title": parent_context.get("project_name")}] if parent_context else None),
            source("parent_constitution", "Parent Constitution", available=bool(parent_constitution), used=bool(parent_constitution), references=[{"source_id": parent_constitution.get("source_conversation_id"), "title": parent_constitution.get("title")}] if parent_constitution else None),
            source("child_project_context", "Child Project Context", available=bool(child_context), used=bool(child_context), references=[{"source_id": child_context.get("project_id"), "title": child_context.get("project_name")}] if child_context else None),
            source("initial_project_context", "Initial Project Context", available=bool(child_context.get("source_proposal_id")), used=bool(child_context.get("source_proposal_id")), references=[{"source_id": child_context.get("source_proposal_id"), "title": child_context.get("source_conversation_title")}] if child_context.get("source_proposal_id") else None),
            source("founder_current_message", "Founder 当前输入", available=True, used=True, count=1),
            source("external_model_knowledge", "模型通用知识", available=True, used=True, references=[{"source_id": provider, "title": model}]),
        ]
        return {"schema_version": 1, "sources": sources}

    def confirm_goal(self, conversation_id: str, candidate_goal_id: str) -> dict:
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            candidate = session.get(CandidateGoalDB, candidate_goal_id)
            if conversation is None or candidate is None or candidate.conversation_id != conversation_id:
                raise LookupError("Candidate goal not found")
            if candidate.status == "confirmed":
                goal = session.scalar(select(GoalAssetDB).where(GoalAssetDB.candidate_goal_id == candidate.id))
            else:
                goal = GoalAssetDB(conversation_id=conversation_id, candidate_goal_id=candidate.id, title=candidate.title, description=candidate.description, source_message_ids=list(candidate.source_message_ids or []), constraints=[], acceptance_criteria=[])
                session.add(goal); candidate.status = "confirmed"
            conversation.conversation_state = "goal_confirmed"
            session.commit(); session.refresh(goal)
            return self._goal(goal)

    def get_goal(self, goal_id: str):
        with SessionLocal() as session:
            goal = session.get(GoalAssetDB, goal_id)
            return self._goal(goal) if goal else None

    def snapshot(self, conversation_id: str) -> dict:
        with SessionLocal() as session:
            conversation = session.get(ConversationDB, conversation_id)
            if conversation is None or conversation.system_id != "founder_ai":
                raise LookupError("Founder AI conversation not found")
            digest = session.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation_id))
            messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at)))
            decisions = list(session.scalars(select(DecisionAssetDB).where(DecisionAssetDB.conversation_id == conversation_id).order_by(DecisionAssetDB.created_at.desc())))
            knowledge = list(session.scalars(select(MemoryAssetDB).where(MemoryAssetDB.conversation_id == conversation_id, MemoryAssetDB.memory_type == "knowledge").order_by(MemoryAssetDB.created_at.desc())))
            candidates = list(session.scalars(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation_id).order_by(CandidateGoalDB.created_at.desc())))
            questions = list(session.scalars(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id == conversation_id).order_by(PendingQuestionDB.created_at.desc())))
            goals = list(session.scalars(select(GoalAssetDB).where(GoalAssetDB.conversation_id == conversation_id).order_by(GoalAssetDB.created_at.desc())))
            from app.core.project.service import assemble_project_context
            project_context = assemble_project_context(conversation.project_id) if conversation.project_id else None
            digest_payload = {"conversation_id": conversation_id, "summary": digest.summary if digest else "", "topics": list(digest.topics or []) if digest else [], "key_viewpoints": list(digest.key_viewpoints or []) if digest else [], "constraints": list(digest.constraints or []) if digest else [], "terminology": list(digest.terminology or []) if digest else [], "prompt_delta": dict(digest.prompt_delta or {}) if digest else {}, "memory_candidates": list(digest.memory_candidates or []) if digest else [], "asset_candidates": list(digest.asset_candidates or []) if digest else [], "updated_at": _iso(digest.updated_at) if digest else None, "decisions": [{"decision_id": d.id, "title": d.title, "content": d.decision, "source_message_ids": d.source_message_ids, "confirmed": d.confirmed, "created_at": _iso(d.created_at)} for d in decisions], "knowledge_items": [{"knowledge_id": m.id, "category": "discussion", "title": m.title, "content": m.content, "source_message_ids": m.source_message_ids, "created_at": _iso(m.created_at)} for m in knowledge], "candidate_goals": [{"goal_id": c.id, "title": c.title, "description": c.description, "source_message_ids": c.source_message_ids, "confidence": c.confidence, "status": c.status} for c in candidates], "pending_questions": [{"question_id": q.id, "content": q.content, "reason": q.reason, "source_message_ids": q.source_message_ids, "status": q.status} for q in questions]}
            goal_payload = [self._goal(g) for g in goals]
            conversation_intelligence = {
                "conversation_id": conversation.id,
                "summary": digest_payload["summary"],
                "current_position": self._project_position(conversation.conversation_state, bool(candidates or goals), ""),
                "judgments": digest_payload["key_viewpoints"],
                "decisions": digest_payload["decisions"],
                "knowledge": digest_payload["knowledge_items"],
                "constraints": digest_payload["constraints"],
                "terminology": digest_payload["terminology"],
                "pending_questions": [item for item in digest_payload["pending_questions"] if item["status"] == "open"],
                "candidate_goals": [item for item in digest_payload["candidate_goals"] if item["status"] == "candidate"],
                "goals": goal_payload,
                "updated_at": digest_payload["updated_at"] or _iso(conversation.updated_at),
            }
            payload = {"conversation": {"id": conversation.id, "project_id": conversation.project_id, "title": conversation.title, "state": conversation.conversation_state, "updated_at": _iso(conversation.updated_at)}, "messages": [{"message_id": m.id, "role": m.role, "content": m.content, "message_type": m.message_type, "intent": m.intent, "grounding": dict(m.grounding or {}), "created_at": _iso(m.created_at)} for m in messages], "digest": digest_payload, "conversation_intelligence": conversation_intelligence, "project_context": project_context, "goals": goal_payload}
        try:
            from app.core.founder_object.service import list_conversation_objects
            payload["founder_objects"] = list_conversation_objects(conversation_id)
        except Exception:
            payload["founder_objects"] = []
        return payload

    @staticmethod
    def _goal(goal):
        return {"goal_id": goal.id, "conversation_id": goal.conversation_id, "title": goal.title, "description": goal.description, "source_message_ids": goal.source_message_ids, "decision_refs": goal.decision_refs, "knowledge_refs": goal.knowledge_refs, "constraints": goal.constraints, "acceptance_criteria": goal.acceptance_criteria, "status": goal.status}
