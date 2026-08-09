from sqlalchemy import select

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class ArtifactBoundaryError(ValueError):
    """Raised when an ArtifactAsset crosses the Founder application boundary."""


def _validate_reference(session, model, identifier: str | None, label: str) -> None:
    if identifier is None:
        return
    record = session.get(model, identifier)
    if record is None or record.system_id != FOUNDER_SYSTEM_KEY:
        raise ArtifactBoundaryError(f"{label} is outside the Founder AI boundary")


def create_artifact(
    *,
    artifact_type: str,
    title: str,
    description: str | None = None,
    location: str | None = None,
    content_ref: str | None = None,
    version: int = 1,
    status: str = "active",
    task_asset_id: str | None = None,
    conversation_id: str | None = None,
    decision_id: str | None = None,
) -> ArtifactAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, TaskAssetDB, task_asset_id, "task asset")
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        record = ArtifactAssetDB(
            system_id=FOUNDER_SYSTEM_KEY,
            task_asset_id=task_asset_id,
            conversation_id=conversation_id,
            decision_id=decision_id,
            artifact_type=artifact_type,
            title=title,
            description=description,
            location=location,
            content_ref=content_ref,
            version=version,
            status=status,
        )
        session.add(record)
        session.commit()
        session.refresh(record)
        return record


def list_founder_artifacts() -> list[ArtifactAssetDB]:
    with SessionLocal() as session:
        return list(
            session.scalars(
                select(ArtifactAssetDB)
                .where(ArtifactAssetDB.system_id == FOUNDER_SYSTEM_KEY)
                .order_by(ArtifactAssetDB.updated_at.desc())
            )
        )


def get_founder_artifact(artifact_id: str) -> ArtifactAssetDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(ArtifactAssetDB).where(
                ArtifactAssetDB.id == artifact_id,
                ArtifactAssetDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
