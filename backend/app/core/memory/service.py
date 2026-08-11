from sqlalchemy import select

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class MemoryBoundaryError(ValueError):
    """Raised when a MemoryAsset crosses the Founder application boundary."""


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
) -> MemoryAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        _validate_reference(session, TaskAssetDB, task_asset_id, "task asset")
        _validate_reference(session, ArtifactAssetDB, artifact_id, "artifact")
        record = MemoryAssetDB(
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
        session.commit()
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
