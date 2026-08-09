from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class TaskAssetBoundaryError(ValueError):
    """Raised when a TaskAsset crosses the Founder application boundary."""


def _validate_reference(session, model, identifier: str | None, label: str) -> None:
    if identifier is None:
        return
    record = session.get(model, identifier)
    if record is None or record.system_id != FOUNDER_SYSTEM_KEY:
        raise TaskAssetBoundaryError(f"{label} is outside the Founder AI boundary")


def create_task_asset(
    *,
    title: str,
    description: str | None = None,
    scope: dict | None = None,
    status: str = "draft",
    approval_status: str = "pending",
    execution_status: str = "not_started",
    result: dict | None = None,
    conversation_id: str | None = None,
    decision_id: str | None = None,
) -> TaskAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        record = TaskAssetDB(
            system_id=FOUNDER_SYSTEM_KEY,
            conversation_id=conversation_id,
            decision_id=decision_id,
            title=title,
            description=description,
            scope=scope or {},
            status=status,
            approval_status=approval_status,
            execution_status=execution_status,
            result=result,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return record


def list_founder_task_assets() -> list[TaskAssetDB]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(TaskAssetDB)
                .where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY)
                .order_by(TaskAssetDB.updated_at.desc())
            )
        )


def get_founder_task_asset(task_id: str) -> TaskAssetDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(TaskAssetDB).where(
                TaskAssetDB.id == task_id,
                TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
