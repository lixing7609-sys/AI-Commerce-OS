import hashlib

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.decision.model import DecisionAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class ArtifactBoundaryError(ValueError):
    """Raised when an ArtifactAsset crosses the Founder application boundary."""


def stable_artifact_id(idempotency_key: str) -> str:
    digest = hashlib.sha256(f"artifact:{idempotency_key}".encode("utf-8")).hexdigest()[:20]
    return f"artifact-{digest}"


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
    idempotency_key: str | None = None,
) -> ArtifactAssetDB:
    with SessionLocal() as session:
        _validate_reference(session, TaskAssetDB, task_asset_id, "task asset")
        _validate_reference(session, ConversationDB, conversation_id, "conversation")
        _validate_reference(session, DecisionAssetDB, decision_id, "decision")
        artifact_id = stable_artifact_id(idempotency_key) if idempotency_key else None
        existing = session.get(ArtifactAssetDB, artifact_id) if artifact_id else None
        if existing is not None:
            if existing.task_asset_id != task_asset_id or existing.artifact_type != artifact_type:
                raise ArtifactBoundaryError("artifact idempotency identity conflicts with existing lineage")
            return existing
        record = ArtifactAssetDB(
            **({"id": artifact_id} if artifact_id else {}),
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
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            if not artifact_id:
                raise
            record = session.get(ArtifactAssetDB, artifact_id)
            if record is None or record.task_asset_id != task_asset_id or record.artifact_type != artifact_type:
                raise
            return record
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
