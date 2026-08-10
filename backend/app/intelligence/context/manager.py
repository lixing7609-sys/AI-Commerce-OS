from dataclasses import asdict, dataclass, field
from typing import Any

from sqlalchemy import select

from app.core.context.service import get_founder_context
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


@dataclass(frozen=True, slots=True)
class ProjectState:
    current_phase: str
    completed_tasks: list[dict[str, Any]] = field(default_factory=list)
    active_tasks: list[dict[str, Any]] = field(default_factory=list)
    blocked_items: list[dict[str, Any]] = field(default_factory=list)
    next_recommended_action: str = "Define the next Founder goal"


@dataclass(frozen=True, slots=True)
class FounderContext:
    conversation_memory: dict[str, Any]
    decision_memory: list[dict[str, Any]]
    task_memory: list[dict[str, Any]]
    execution_memory: list[dict[str, Any]]
    project_state: ProjectState

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class SinoContextManager:
    """Builds the bounded Founder context read at the start of every Brain run."""

    def load(self, conversation_id: str | None = None) -> FounderContext:
        conversation = get_founder_context(conversation_id) if conversation_id else None
        with SessionLocal() as session:
            decisions = list(session.scalars(select(DecisionAssetDB).where(DecisionAssetDB.system_id == FOUNDER_SYSTEM_KEY).order_by(DecisionAssetDB.updated_at.desc()).limit(20)))
            tasks = list(session.scalars(select(TaskAssetDB).where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY).order_by(TaskAssetDB.updated_at.desc()).limit(50)))
            executions = list(session.scalars(select(MemoryAssetDB).where(MemoryAssetDB.system_id == FOUNDER_SYSTEM_KEY, MemoryAssetDB.memory_type.in_(("execution_result", "execution", "learning", "project_state"))).order_by(MemoryAssetDB.updated_at.desc()).limit(30)))

        task_rows = [self._task(item) for item in tasks]
        completed = [item for item in task_rows if item["execution_status"] == "completed" or item["status"] == "completed"]
        blocked = [item for item in task_rows if item["status"] == "blocked" or item["execution_status"] == "failed"]
        active = [item for item in task_rows if item not in completed and item not in blocked]
        phase = self._phase(completed, active, blocked)
        next_action = blocked[0]["title"] if blocked else active[0]["title"] if active else "Define the next Founder goal"
        return FounderContext(
            conversation_memory=self._conversation(conversation),
            decision_memory=[{"id": item.id, "title": item.title, "decision": item.decision, "reason": item.reason, "status": item.status} for item in decisions],
            task_memory=task_rows,
            execution_memory=[{"id": item.id, "type": item.memory_type, "title": item.title, "summary": item.summary, "content": item.content, "status": item.status} for item in executions],
            project_state=ProjectState(phase, completed, active, blocked, next_action),
        )

    @staticmethod
    def _conversation(context) -> dict[str, Any]:
        if context is None:
            return {}
        return {"conversation_id": context.conversation_id, "user_goal": context.user_goal, "constraints": context.constraints or [], "decisions_summary": context.decisions_summary, "knowledge_refs": context.knowledge_refs or [], "task_refs": context.task_refs or []}

    @staticmethod
    def _task(item: TaskAssetDB) -> dict[str, Any]:
        return {"id": item.id, "title": item.title, "status": item.status, "approval_status": item.approval_status, "execution_status": item.execution_status}

    @staticmethod
    def _phase(completed, active, blocked) -> str:
        if blocked:
            return "blocked"
        if active:
            return "execution"
        if completed:
            return "iteration"
        return "planning"
