"""Persistent Founder supplements and versioned execution-package updates."""

from dataclasses import replace
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, ExecutionDeltaDB, GoalAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_events import append_event
from app.founder_ai.execution_registry import get_execution_session, save_execution_session
from app.founder_ai.secretary import SinoSecretaryService


class ExecutionDeltaService:
    def __init__(self, secretary=None):
        self.secretary = secretary or SinoSecretaryService()

    def submit(self, *, conversation_id: str, goal_id: str, task_id: str, execution_id: str, content: str) -> dict:
        record = get_execution_session(execution_id)
        if record is None:
            raise LookupError("Execution session not found")
        session, package = record
        if session.task_asset_id != task_id or session.status not in {"queued", "executing", "testing", "paused"}:
            raise ValueError("Execution is not accepting Founder supplements")
        with SessionLocal() as db:
            goal = db.get(GoalAssetDB, goal_id)
            if goal is None or goal.conversation_id != conversation_id:
                raise ValueError("Execution delta must reference a confirmed goal")
        snapshot = self.secretary.append_message(conversation_id, content, intent="execution_delta", message_type="execution_delta")
        source = next(message for message in reversed(snapshot["messages"]) if message["role"] == "founder")
        delta_type, impact, decision = self._classify(content, package.goal)
        append_event(session, "founder_delta_received", status=session.status, message="Founder supplement received", metadata={"source_message_id": source["message_id"]})
        append_event(session, "delta_classified", status=session.status, message=f"Delta classified as {impact} impact", metadata={"delta_type": delta_type, "impact_level": impact, "decision": decision})
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            delta = ExecutionDeltaDB(conversation_id=conversation_id, goal_id=goal_id, task_id=task_id, execution_id=execution_id, source_message_id=source["message_id"], content=content.strip(), delta_type=delta_type, impact_level=impact, decision=decision, analysis={"impact": impact, "recommendation": decision, "updated_task_plan": ["Review Founder delta", "Apply delta within approved boundary", "Run existing verification"]})
            db.add(delta); db.flush()
            if decision in {"auto_apply", "apply_current_execution"}:
                next_version = package.package_version + 1
                delta.status = "applied"; delta.applied_at = now; delta.package_version = next_version
                package = replace(package, package_version=next_version, execution_deltas=[*package.execution_deltas, {"delta_id": delta.id, "content": delta.content, "delta_type": delta_type, "impact_level": impact, "applied_at": now.isoformat()}])
                append_event(session, "delta_applied", status=session.status, message=f"Delta applied to execution package V{next_version}", metadata={"delta_id": delta.id, "package_version": next_version})
            elif decision in {"pause_and_replan", "requires_founder_confirmation"}:
                delta.status = "pending_confirmation"
                session.status = "paused"; session.pause_reason = "Founder delta requires confirmation"; session.recoverable = True
                append_event(session, "execution_paused_for_delta", status="paused", message="Execution paused for Founder delta review", metadata={"delta_id": delta.id})
                append_event(session, "execution_replanned", status="paused", message="Updated impact analysis and task plan prepared", metadata={"delta_id": delta.id, "analysis": delta.analysis})
            elif decision == "store_as_candidate_goal":
                delta.status = "routed"
                db.add(CandidateGoalDB(conversation_id=conversation_id, title=content[:200], description=content, source_message_ids=[source["message_id"]], confidence=0.65))
            else:
                delta.status = "routed"
            db.commit(); db.refresh(delta)
        session.deltas = [*session.deltas, self._out(delta)]
        save_execution_session(session, package)
        return self._out(delta)

    def decide(self, delta_id: str, action: str) -> dict:
        if action not in {"confirm_adjustment", "continue_original", "convert_to_goal"}:
            raise ValueError("Unsupported Founder delta decision")
        with SessionLocal() as db:
            delta = db.get(ExecutionDeltaDB, delta_id)
            if delta is None:
                raise LookupError("Execution delta not found")
            record = get_execution_session(delta.execution_id)
            if record is None:
                raise LookupError("Execution session not found")
            session, package = record
            if action == "confirm_adjustment":
                next_version = package.package_version + 1
                delta.status = "applied"; delta.founder_confirmed = True; delta.applied_at = datetime.now(timezone.utc); delta.package_version = next_version
                package = replace(package, package_version=next_version, execution_deltas=[*package.execution_deltas, {"delta_id": delta.id, "content": delta.content, "delta_type": delta.delta_type, "impact_level": delta.impact_level, "applied_at": delta.applied_at.isoformat()}])
                append_event(session, "delta_applied", status="paused", message=f"Founder confirmed delta for package V{next_version}", metadata={"delta_id": delta.id, "package_version": next_version})
            elif action == "continue_original":
                delta.status = "rejected"; delta.founder_confirmed = True
            else:
                delta.status = "routed"; delta.founder_confirmed = True
                db.add(CandidateGoalDB(conversation_id=delta.conversation_id, title=delta.content[:200], description=delta.content, source_message_ids=[delta.source_message_id], confidence=0.8))
            db.commit(); db.refresh(delta)
        session.deltas = [self._out(delta) if item.get("delta_id") == delta.id else item for item in session.deltas]
        save_execution_session(session, package)
        return self._out(delta)

    def list_for_execution(self, execution_id: str) -> list[dict]:
        with SessionLocal() as db:
            items = list(db.scalars(select(ExecutionDeltaDB).where(ExecutionDeltaDB.execution_id == execution_id).order_by(ExecutionDeltaDB.created_at)))
            return [self._out(item) for item in items]

    @staticmethod
    def _classify(content: str, current_goal: str):
        text = content.lower()
        if any(term in text for term in ("以后", "未来", "operator ai", "另一个目标", "无关")):
            return "future_idea", "low", "store_as_candidate_goal"
        if any(term in text for term in ("改成", "改为", "不要用", "架构", "event stream", "数据库", "重做")):
            return "correction", "high", "pause_and_replan"
        if any(term in text for term in ("不要", "约束", "限制")):
            return "constraint_update", "low", "auto_apply"
        if any(term in text for term in ("ui", "标题", "颜色", "间距", "页面")):
            return "ui_adjustment", "low", "auto_apply"
        return "requirement_addition", "medium", "requires_founder_confirmation"

    @staticmethod
    def _out(delta):
        return {"delta_id": delta.id, "conversation_id": delta.conversation_id, "goal_id": delta.goal_id, "task_id": delta.task_id, "execution_id": delta.execution_id, "source_message_id": delta.source_message_id, "content": delta.content, "delta_type": delta.delta_type, "impact_level": delta.impact_level, "decision": delta.decision, "status": delta.status, "package_version": delta.package_version, "analysis": delta.analysis, "founder_confirmed": delta.founder_confirmed, "created_at": delta.created_at.isoformat() if delta.created_at else None, "applied_at": delta.applied_at.isoformat() if delta.applied_at else None}
