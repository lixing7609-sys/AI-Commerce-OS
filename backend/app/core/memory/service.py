import hashlib

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class MemoryBoundaryError(ValueError):
    """Raised when a MemoryAsset crosses the Founder application boundary."""


def stable_memory_id(idempotency_key: str) -> str:
    digest = hashlib.sha256(f"memory:{idempotency_key}".encode("utf-8")).hexdigest()[:20]
    return f"memory-{digest}"


def _validate_reference(session, model, identifier: str | None, label: str) -> None:
    if identifier is None:
        return
    record = session.get(model, identifier)
    if record is None or record.system_id != FOUNDER_SYSTEM_KEY:
        raise MemoryBoundaryError(f"{label} is outside the Founder AI boundary")


def create_memory(
    *,
    memory_type: str,
    title: str,
    content: str,
    summary: str | None = None,
    confidence: float | None = None,
    status: str = "active",
    conversation_id: str | None = None,
    decision_id: str | None = None,
    task_asset_id: str | None = None,
    artifact_id: str | None = None,
    source_message_ids: list[str] | None = None,
    idempotency_key: str | None = None,
) -> MemoryAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        _validate_reference(session, TaskAssetDB, task_asset_id, "task asset")
        _validate_reference(session, ArtifactAssetDB, artifact_id, "artifact")
        memory_id = stable_memory_id(idempotency_key) if idempotency_key else None
        existing = session.get(MemoryAssetDB, memory_id) if memory_id else None
        if existing is not None:
            if existing.task_asset_id != task_asset_id or existing.memory_type != memory_type:
                raise MemoryBoundaryError("memory idempotency identity conflicts with existing lineage")
            return existing
        record = MemoryAssetDB(
            **({"id": memory_id} if memory_id else {}),
            system_id=FOUNDER_SYSTEM_KEY,
            conversation_id=conversation_id,
            decision_id=decision_id,
            task_asset_id=task_asset_id,
            artifact_id=artifact_id,
            memory_type=memory_type,
            title=title,
            content=content,
            summary=summary,
            confidence=confidence,
            status=status,
            source_message_ids=source_message_ids or [],
        )
        session.add(record)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            if not memory_id:
                raise
            record = session.get(MemoryAssetDB, memory_id)
            if record is None or record.task_asset_id != task_asset_id or record.memory_type != memory_type:
                raise
            return record
        session.refresh(record)
        return record


def list_founder_memories() -> list[MemoryAssetDB]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(MemoryAssetDB)
                .where(MemoryAssetDB.system_id == FOUNDER_SYSTEM_KEY)
                .order_by(MemoryAssetDB.updated_at.desc())
            )
        )


def get_founder_memory(memory_id: str) -> MemoryAssetDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(MemoryAssetDB).where(
                MemoryAssetDB.id == memory_id,
                MemoryAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
