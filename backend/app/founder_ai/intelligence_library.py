from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select

from app.core.artifact.model import ArtifactAssetDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import GoalAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.reference.model import IntelligenceReferenceDB
from app.core.task_asset.model import TaskAssetDB
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import get_execution_session

FOUNDER_SYSTEM_KEY = "founder_ai"
ARTIFACT_STATUSES = {"active", "superseded", "invalid", "archived"}
MEMORY_STATUSES = {"active", "outdated", "invalid", "archived", "merged"}


class IntelligenceLibraryError(ValueError):
    pass


def _artifact(session, identifier: str) -> ArtifactAssetDB:
    record = session.scalar(select(ArtifactAssetDB).where(ArtifactAssetDB.id == identifier, ArtifactAssetDB.system_id == FOUNDER_SYSTEM_KEY))
    if record is None:
        raise LookupError("Artifact not found")
    return record


def _memory(session, identifier: str) -> MemoryAssetDB:
    record = session.scalar(select(MemoryAssetDB).where(MemoryAssetDB.id == identifier, MemoryAssetDB.system_id == FOUNDER_SYSTEM_KEY))
    if record is None:
        raise LookupError("Memory not found")
    return record


def _reference_dict(item: IntelligenceReferenceDB) -> dict[str, Any]:
    return {"reference_id": item.id, "source_type": item.source_type, "source_id": item.source_id, "target_type": item.target_type, "target_id": item.target_id, "created_at": item.created_at, "created_by": item.created_by, "note": item.note}


def artifact_detail(identifier: str) -> dict[str, Any]:
    with SessionLocal() as session:
        item = _artifact(session, identifier)
        refs = list(session.scalars(select(IntelligenceReferenceDB).where(IntelligenceReferenceDB.source_type == "artifact", IntelligenceReferenceDB.source_id == identifier)))
        root = item.parent_artifact_id or item.id
        history = list(session.scalars(select(ArtifactAssetDB).where(ArtifactAssetDB.system_id == FOUNDER_SYSTEM_KEY, or_(ArtifactAssetDB.id == root, ArtifactAssetDB.parent_artifact_id == root)).order_by(ArtifactAssetDB.version.desc())))
        return {"artifact_id": item.id, "title": item.title, "artifact_type": item.artifact_type, "summary": item.description, "created_at": item.created_at, "updated_at": item.updated_at, "conversation_id": item.conversation_id, "goal_id": next((ref.target_id for ref in refs if ref.target_type == "goal"), None), "task_asset_id": item.task_asset_id, "execution_id": next((ref.target_id for ref in refs if ref.target_type == "execution"), None), "location": item.location, "content_ref": item.content_ref, "memory_references": [], "status": item.status, "version": item.version, "parent_artifact_id": item.parent_artifact_id, "previous_version_id": item.previous_version_id, "revision_reason": item.revision_reason, "references": [_reference_dict(ref) for ref in refs], "history": [{"artifact_id": row.id, "version": row.version, "created_at": row.created_at, "status": row.status, "revision_reason": row.revision_reason} for row in history]}


def create_artifact_version(identifier: str, *, revision_reason: str, title: str | None = None, summary: str | None = None) -> dict[str, Any]:
    with SessionLocal() as session:
        previous = _artifact(session, identifier)
        root = previous.parent_artifact_id or previous.id
        latest_version = session.scalar(select(ArtifactAssetDB.version).where(or_(ArtifactAssetDB.id == root, ArtifactAssetDB.parent_artifact_id == root)).order_by(ArtifactAssetDB.version.desc()).limit(1)) or previous.version
        previous.status = "superseded"
        item = ArtifactAssetDB(system_id=FOUNDER_SYSTEM_KEY, task_asset_id=previous.task_asset_id, conversation_id=previous.conversation_id, decision_id=previous.decision_id, artifact_type=previous.artifact_type, title=title or previous.title, description=summary if summary is not None else previous.description, location=previous.location, content_ref=previous.content_ref, version=latest_version + 1, status="active", parent_artifact_id=root, previous_version_id=previous.id, revision_reason=revision_reason)
        session.add(item); session.commit(); session.refresh(item)
        return artifact_detail(item.id)


def set_artifact_status(identifier: str, status: str) -> dict[str, Any]:
    if status not in ARTIFACT_STATUSES:
        raise IntelligenceLibraryError("Unsupported artifact status")
    with SessionLocal() as session:
        item = _artifact(session, identifier); item.status = status; item.updated_at = datetime.now(timezone.utc); session.commit()
    return artifact_detail(identifier)


def memory_detail(identifier: str) -> dict[str, Any]:
    with SessionLocal() as session:
        item = _memory(session, identifier)
        refs = list(session.scalars(select(IntelligenceReferenceDB).where(IntelligenceReferenceDB.source_type == "memory", IntelligenceReferenceDB.source_id == identifier)))
        root = item.parent_memory_id or item.id
        history = list(session.scalars(select(MemoryAssetDB).where(MemoryAssetDB.system_id == FOUNDER_SYSTEM_KEY, or_(MemoryAssetDB.id == root, MemoryAssetDB.parent_memory_id == root)).order_by(MemoryAssetDB.revision_number.desc())))
        return {"memory_id": item.id, "title": item.title, "summary": item.summary, "content": item.content, "memory_type": item.memory_type, "created_at": item.created_at, "updated_at": item.updated_at, "importance": item.importance, "status": item.status, "tags": item.tags or [], "conversation_id": item.conversation_id, "goal_id": next((ref.target_id for ref in refs if ref.target_type == "goal"), None), "task_asset_id": item.task_asset_id, "artifact_id": item.artifact_id, "execution_id": next((ref.target_id for ref in refs if ref.target_type == "execution"), None), "revision_number": item.revision_number, "parent_memory_id": item.parent_memory_id, "previous_revision_id": item.previous_revision_id, "revision_reason": item.revision_reason, "merged_into_memory_id": item.merged_into_memory_id, "references": [_reference_dict(ref) for ref in refs], "history": [{"memory_id": row.id, "revision_number": row.revision_number, "created_at": row.created_at, "status": row.status, "revision_reason": row.revision_reason} for row in history]}


def revise_memory(identifier: str, *, revision_reason: str, title: str | None = None, summary: str | None = None, content: str | None = None) -> dict[str, Any]:
    with SessionLocal() as session:
        previous = _memory(session, identifier); root = previous.parent_memory_id or previous.id
        latest = session.scalar(select(MemoryAssetDB.revision_number).where(or_(MemoryAssetDB.id == root, MemoryAssetDB.parent_memory_id == root)).order_by(MemoryAssetDB.revision_number.desc()).limit(1)) or previous.revision_number
        previous.status = "outdated"
        item = MemoryAssetDB(system_id=FOUNDER_SYSTEM_KEY, conversation_id=previous.conversation_id, decision_id=previous.decision_id, task_asset_id=previous.task_asset_id, artifact_id=previous.artifact_id, memory_type=previous.memory_type, title=title or previous.title, content=content if content is not None else previous.content, summary=summary if summary is not None else previous.summary, confidence=previous.confidence, source_message_ids=previous.source_message_ids or [], status="active", parent_memory_id=root, previous_revision_id=previous.id, revision_number=latest + 1, revision_reason=revision_reason, importance=previous.importance, tags=previous.tags or [])
        session.add(item); session.commit(); session.refresh(item)
        return memory_detail(item.id)


def set_memory_status(identifier: str, status: str) -> dict[str, Any]:
    if status not in MEMORY_STATUSES:
        raise IntelligenceLibraryError("Unsupported memory status")
    with SessionLocal() as session:
        item = _memory(session, identifier); item.status = status; item.updated_at = datetime.now(timezone.utc); session.commit()
    return memory_detail(identifier)


def merge_memories(identifiers: list[str], *, title: str, revision_reason: str) -> dict[str, Any]:
    if len(set(identifiers)) < 2:
        raise IntelligenceLibraryError("At least two memories are required")
    with SessionLocal() as session:
        sources = [_memory(session, identifier) for identifier in dict.fromkeys(identifiers)]
        item = MemoryAssetDB(system_id=FOUNDER_SYSTEM_KEY, conversation_id=sources[0].conversation_id, memory_type="consolidated", title=title, content="\n\n".join(source.content for source in sources), summary=revision_reason, status="active", revision_reason=revision_reason, importance=max((source.importance or 0) for source in sources), tags=sorted({tag for source in sources for tag in (source.tags or [])}))
        session.add(item); session.flush()
        for source in sources: source.status = "merged"; source.merged_into_memory_id = item.id
        session.commit(); session.refresh(item)
        return memory_detail(item.id)


def create_reference(*, source_type: str, source_id: str, target_type: str, target_id: str, created_by: str = "founder", note: str | None = None) -> dict[str, Any]:
    if source_type not in {"artifact", "memory"} or target_type not in {"conversation", "goal", "task_asset", "execution"}:
        raise IntelligenceLibraryError("Unsupported reference relation")
    with SessionLocal() as session:
        _artifact(session, source_id) if source_type == "artifact" else _memory(session, source_id)
        target = {"conversation": ConversationDB, "goal": GoalAssetDB, "task_asset": TaskAssetDB}.get(target_type)
        if target is not None:
            record = session.get(target, target_id)
            if record is None or getattr(record, "system_id", FOUNDER_SYSTEM_KEY) != FOUNDER_SYSTEM_KEY:
                raise IntelligenceLibraryError("Reference target not found")
        elif get_execution_session(target_id) is None:
            raise IntelligenceLibraryError("Reference target not found")
        existing = session.scalar(select(IntelligenceReferenceDB).where(IntelligenceReferenceDB.source_type == source_type, IntelligenceReferenceDB.source_id == source_id, IntelligenceReferenceDB.target_type == target_type, IntelligenceReferenceDB.target_id == target_id))
        if existing: return _reference_dict(existing)
        item = IntelligenceReferenceDB(system_id=FOUNDER_SYSTEM_KEY, source_type=source_type, source_id=source_id, target_type=target_type, target_id=target_id, created_by=created_by, note=note)
        session.add(item); session.commit(); session.refresh(item); return _reference_dict(item)


def references_for_target(target_type: str, target_id: str) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        items = session.scalars(select(IntelligenceReferenceDB).where(IntelligenceReferenceDB.system_id == FOUNDER_SYSTEM_KEY, IntelligenceReferenceDB.target_type == target_type, IntelligenceReferenceDB.target_id == target_id).order_by(IntelligenceReferenceDB.created_at.desc()))
        return [_reference_dict(item) for item in items]


def library_context_for_targets(targets: list[tuple[str, str | None]]) -> list[dict[str, Any]]:
    """Resolve reusable intelligence at the execution boundary without copying it into the relation."""
    with SessionLocal() as session:
        result = []
        seen = set()
        for target_type, target_id in targets:
            if not target_id:
                continue
            references = session.scalars(select(IntelligenceReferenceDB).where(IntelligenceReferenceDB.system_id == FOUNDER_SYSTEM_KEY, IntelligenceReferenceDB.target_type == target_type, IntelligenceReferenceDB.target_id == target_id).order_by(IntelligenceReferenceDB.created_at))
            for reference in references:
                marker = (reference.source_type, reference.source_id)
                if marker in seen:
                    continue
                source = _artifact(session, reference.source_id) if reference.source_type == "artifact" else _memory(session, reference.source_id)
                if source.status not in {"active"}:
                    continue
                seen.add(marker)
                result.append({
                    **_reference_dict(reference),
                    "title": source.title,
                    "summary": source.description if reference.source_type == "artifact" else source.summary,
                    "content_ref": source.content_ref if reference.source_type == "artifact" else None,
                    "content": source.content if reference.source_type == "memory" else None,
                })
        return result
