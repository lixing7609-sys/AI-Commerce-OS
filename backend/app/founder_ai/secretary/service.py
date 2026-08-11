"""Conversation-first AI Secretary persistence and structured digest service."""

import json
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.database.db import SessionLocal
from .state_machine import advance_discussion


def _iso(value):
    return value.isoformat() if value else None


class SinoSecretaryService:
    """Turns an append-only discussion into traceable structured Founder assets."""

    def append_message(self, conversation_id: str, content: str, *, intent: str | None = None, message_type: str = "discussion") -> dict:
        text = (content or "").strip()
        if not text:
            raise ValueError("message must not be empty")
        with SessionLocal() as session:
            conversation = session.scalar(select(ConversationDB).where(ConversationDB.id == conversation_id, ConversationDB.system_id == "founder_ai"))
            if conversation is None:
                raise LookupError("Founder AI conversation not found")
            message = ConversationMessageDB(conversation_id=conversation_id, role="founder", content=text, intent=intent, message_type=message_type)
            session.add(message); session.flush()
            self._update_digest(session, conversation, message)
            assistant = ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=self._reply(text), message_type=message_type)
            session.add(assistant)
            conversation.updated_at = datetime.now(timezone.utc)
            session.commit()
        return self.snapshot(conversation_id)

    def _update_digest(self, session, conversation, message):
        digest = session.scalar(select(SecretaryDigestDB).where(SecretaryDigestDB.conversation_id == conversation.id))
        if digest is None:
            digest = SecretaryDigestDB(conversation_id=conversation.id)
            session.add(digest)
        founder_messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation.id, ConversationMessageDB.role == "founder").order_by(ConversationMessageDB.created_at)))
        digest.summary = "；".join(item.content for item in founder_messages[-4:])[-1200:]
        topics = list(digest.topics or [])
        topic = message.content[:40]
        if topic not in topics:
            topics.append(topic)
        digest.topics = topics[-8:]
        digest.updated_at = datetime.now(timezone.utc)

        text = message.content
        if any(term in text for term in ("决定", "确定", "不要", "先不", "必须", "改为")):
            exists = session.scalar(select(DecisionAssetDB).where(DecisionAssetDB.conversation_id == conversation.id, DecisionAssetDB.decision == text))
            if exists is None:
                session.add(DecisionAssetDB(system_id="founder_ai", conversation_id=conversation.id, title=text[:80], decision=text, source_message_ids=[message.id], confirmed=True))
        if any(term in text for term in ("以后", "目前", "现状", "注意", "记住", "原则")):
            exists = session.scalar(select(MemoryAssetDB).where(MemoryAssetDB.conversation_id == conversation.id, MemoryAssetDB.title == text[:80], MemoryAssetDB.memory_type == "knowledge"))
            if exists is None:
                session.add(MemoryAssetDB(system_id="founder_ai", conversation_id=conversation.id, memory_type="knowledge", title=text[:80], content=json.dumps({"knowledge": text}, ensure_ascii=False), source_message_ids=[message.id]))
        candidate = None
        if any(term in text.lower() for term in ("实现", "开发", "创建", "修复", "重构", "build", "implement", "按这个执行", "做成任务", "开始实施")):
            candidate = session.scalar(select(CandidateGoalDB).where(CandidateGoalDB.conversation_id == conversation.id, CandidateGoalDB.title == text[:200], CandidateGoalDB.status == "candidate"))
            if candidate is None:
                candidate = CandidateGoalDB(conversation_id=conversation.id, title=text[:200], description=text, source_message_ids=[message.id], confidence=0.8 if any(term in text for term in ("按这个执行", "做成任务", "开始实施")) else 0.65)
                session.add(candidate)
            if any(term in text for term in ("按这个执行", "做成任务", "开始实施")):
                session.flush()
                goal = session.scalar(select(GoalAssetDB).where(GoalAssetDB.candidate_goal_id == candidate.id))
                if goal is None:
                    session.add(GoalAssetDB(conversation_id=conversation.id, candidate_goal_id=candidate.id, title=candidate.title, description=candidate.description, source_message_ids=list(candidate.source_message_ids or [])))
                candidate.status = "confirmed"
                conversation.conversation_state = "goal_confirmed"
        if any(mark in text for mark in ("?", "？")):
            exists = session.scalar(select(PendingQuestionDB).where(PendingQuestionDB.conversation_id == conversation.id, PendingQuestionDB.content == text, PendingQuestionDB.status == "open"))
            if exists is None:
                session.add(PendingQuestionDB(conversation_id=conversation.id, content=text, reason="讨论尚未形成明确结论", source_message_ids=[message.id]))
        if conversation.conversation_state != "goal_confirmed":
            conversation.conversation_state = advance_discussion(conversation.conversation_state, len(founder_messages), candidate is not None)

    @staticmethod
    def _reply(text: str) -> str:
        if any(mark in text for mark in ("?", "？")):
            return "我已记录这个待确认问题。我们可以继续澄清边界，再决定是否形成目标。"
        return "我已记录并整理这条讨论。它不会自动进入执行；讨论成熟后可由你确认为正式目标。"

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
            return {"conversation": {"id": conversation.id, "title": conversation.title, "state": conversation.conversation_state, "updated_at": _iso(conversation.updated_at)}, "messages": [{"message_id": m.id, "role": m.role, "content": m.content, "message_type": m.message_type, "intent": m.intent, "created_at": _iso(m.created_at)} for m in messages], "digest": {"conversation_id": conversation_id, "summary": digest.summary if digest else "", "topics": list(digest.topics or []) if digest else [], "updated_at": _iso(digest.updated_at) if digest else None, "decisions": [{"decision_id": d.id, "title": d.title, "content": d.decision, "source_message_ids": d.source_message_ids, "confirmed": d.confirmed, "created_at": _iso(d.created_at)} for d in decisions], "knowledge_items": [{"knowledge_id": m.id, "category": "discussion", "title": m.title, "content": m.content, "source_message_ids": m.source_message_ids, "created_at": _iso(m.created_at)} for m in knowledge], "candidate_goals": [{"goal_id": c.id, "title": c.title, "description": c.description, "source_message_ids": c.source_message_ids, "confidence": c.confidence, "status": c.status} for c in candidates], "pending_questions": [{"question_id": q.id, "content": q.content, "reason": q.reason, "source_message_ids": q.source_message_ids, "status": q.status} for q in questions]}, "goals": [self._goal(g) for g in goals]}

    @staticmethod
    def _goal(goal):
        return {"goal_id": goal.id, "conversation_id": goal.conversation_id, "title": goal.title, "description": goal.description, "source_message_ids": goal.source_message_ids, "decision_refs": goal.decision_refs, "knowledge_refs": goal.knowledge_refs, "constraints": goal.constraints, "acceptance_criteria": goal.acceptance_criteria, "status": goal.status}
