import hashlib

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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
    source_message_id: str | None = None,
    target_module: str | None = None,
    target_object: str | None = None,
) -> TaskAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        task_scope = dict(scope or {})
        task_id = None
        identity = None
        if source_message_id:
            from app.founder_ai.task_identity import build_task_identity, duplicate_reason
            conversation = session.get(ConversationDB, conversation_id) if conversation_id else None
            identity = build_task_identity(source_message_id=source_message_id, conversation_id=conversation_id or "",
                project_id=conversation.project_id if conversation else None, goal=description or title,
                target_module=target_module, target_object=target_object)
            for existing in session.scalars(select(TaskAssetDB).where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY)):
                reason = duplicate_reason(existing.scope, identity)
                if reason:
                    existing.duplicate_reason = reason
                    existing.duplicate_of_task_id = existing.id
                    return existing
            digest = hashlib.sha256(f"founder-task:{source_message_id}".encode()).hexdigest()[:16]
            task_id = f"task-asset-msg-{digest}"
            task_scope["task_identity"] = identity
        record = TaskAssetDB(
            **({"id": task_id} if task_id else {}),
            system_id=FOUNDER_SYSTEM_KEY,
            conversation_id=conversation_id,
            decision_id=decision_id,
            title=title,
            description=description,
            scope=task_scope,
            status=status,
            approval_status=approval_status,
            execution_status=execution_status,
            result=result,
        )
        session.add(record)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            if not task_id:
                raise
            record = session.get(TaskAssetDB, task_id)
            if record is None:
                raise
            record.duplicate_reason = "same_source_message_id"
            record.duplicate_of_task_id = record.id
            return record
        session.refresh(record)
        record.duplicate_reason = None
        record.duplicate_of_task_id = None
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


def find_task_by_source_message(source_message_id: str | None) -> TaskAssetDB | None:
    """Return the canonical Task for one persisted Founder message, never by title/project similarity."""
    if not source_message_id:
        return None
    from app.founder_ai.task_identity import task_identity_from_scope
    with SessionLocal() as session:
        for item in session.scalars(select(TaskAssetDB).where(TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY)):
            if task_identity_from_scope(item.scope).get("source_message_id") == source_message_id:
                return item
    return None


def get_founder_task_asset(task_id: str) -> TaskAssetDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(TaskAssetDB).where(
                TaskAssetDB.id == task_id,
                TaskAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
