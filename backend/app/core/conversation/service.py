import re
from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.context.model import ConversationContextDB
from app.core.artifact.model import ArtifactAssetDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationAttachmentDB, ConversationMessageDB, ExecutionDeltaDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB, SinoBrainSessionDB
from app.core.council.model import CouncilModelRunDB, CouncilRunDB
from app.core.project.service import get_project
from app.core.product_visibility.service import hidden_entity_ids
from app.database.db import SessionLocal
from core.founder_intent.model import ConversationCandidateContextDB, FounderObjectCandidateDB
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB

FOUNDER_SYSTEM_KEY = "founder_ai"


class ConversationBoundaryError(ValueError):
    """Raised when a conversation crosses the Founder application boundary."""


def create_conversation(*, title: str | None = None, project_id: str | None = None, topic_key: str | None = None) -> ConversationDB:
    if project_id and get_project(project_id) is None:
        raise ConversationBoundaryError("Founder project not found")
    with SessionLocal() as session:
        record = ConversationDB(
            system_id=FOUNDER_SYSTEM_KEY,
            project_id=project_id,
            title=(title or "New Conversation").strip() or "New Conversation",
            topic_key=topic_key,
        )
        session.add(record)
        session.flush()
        session.add(
            ConversationContextDB(
                conversation_id=record.id,
                system_id=FOUNDER_SYSTEM_KEY,
            )
        )
        session.commit()
        session.refresh(record)
        return record


def list_conversations() -> list[ConversationDB]:
    with SessionLocal() as session:
        hidden_ids = hidden_entity_ids(session, "conversation")
        records = list(
            session.scalars(
                select(ConversationDB)
                .where(
                    ConversationDB.system_id == FOUNDER_SYSTEM_KEY,
                    ConversationDB.status == "active",
                    ConversationDB.conversation_kind == "founder_discussion",
                    ConversationDB.id.notin_(hidden_ids),
                )
                .order_by(ConversationDB.updated_at.desc(), ConversationDB.created_at.desc(), ConversationDB.id.desc())
            )
        )
        internal_title = re.compile(r"^(goal\s*(revision|confirmation|understanding|brief)?|intent|validation|decision|discussion\s*package|package)(\b|\s|[-_:])", re.I)
        for record in records:
            if internal_title.search(record.title or ""):
                brain = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == record.id))
                business_title = str((brain.goal_brief or {}).get("goal") or "").strip().rstrip("。！？?!") if brain else ""
                record.title = business_title[:80] or "未命名讨论"
        return records


def active_project_conversation(project_id: str) -> ConversationDB | None:
    """Return the current discussion container for a Project.

    A new Brain run or Project Planning step is not a new Conversation. Explicit
    new-discussion UI is the only normal caller of ``create_conversation``.
    """
    with SessionLocal() as session:
        return session.scalar(
            select(ConversationDB).where(
                ConversationDB.system_id == FOUNDER_SYSTEM_KEY,
                ConversationDB.project_id == project_id,
                ConversationDB.status == "active",
                ConversationDB.conversation_kind == "founder_discussion",
            ).order_by(ConversationDB.updated_at.desc(), ConversationDB.created_at.asc())
        )


def merge_project_conversations(*, project_id: str, conversation_ids: list[str], canonical_id: str | None = None, topic_key: str | None = None) -> ConversationDB:
    """Merge one Project topic without deleting its audit trail.

    Messages and council runs move to the canonical discussion. Source Brain
    sessions remain attached to their merged records for audit; their message
    references and latest planning projection are folded into the canonical
    Brain state.
    """
    unique_ids = list(dict.fromkeys(conversation_ids))
    if len(unique_ids) < 2:
        raise ValueError("At least two conversations are required")
    with SessionLocal() as session:
        records = list(session.scalars(select(ConversationDB).where(
            ConversationDB.id.in_(unique_ids),
            ConversationDB.project_id == project_id,
            ConversationDB.system_id == FOUNDER_SYSTEM_KEY,
        ).order_by(ConversationDB.created_at.asc())))
        if len(records) != len(unique_ids):
            raise ConversationBoundaryError("Conversation merge crosses a Project boundary")
        canonical = next((item for item in records if item.id == canonical_id), records[0])
        sources = [item for item in records if item.id != canonical.id]
        canonical.topic_key = topic_key or canonical.topic_key or f"project:{project_id}:current"
        canonical.status = "active"
        canonical.conversation_kind = "founder_discussion"

        brain_rows = list(session.scalars(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id.in_(unique_ids)).order_by(SinoBrainSessionDB.updated_at.asc())))
        canonical_brain = next((item for item in brain_rows if item.conversation_id == canonical.id), None)
        # Callers submit the topic history in chronological order. This remains
        # deterministic even on databases whose CURRENT_TIMESTAMP precision
        # gives adjacent conversations identical timestamps.
        conversation_order = {conversation_id: index for index, conversation_id in enumerate(unique_ids)}
        latest_brain = max(brain_rows, key=lambda item: conversation_order.get(item.conversation_id, -1)) if brain_rows else None
        if canonical_brain and latest_brain:
            source_refs = list(dict.fromkeys([*(canonical_brain.source_message_refs or []), *[ref for row in brain_rows for ref in (row.source_message_refs or [])]]))
            audit = list(dict.fromkeys([*(canonical_brain.discovery or {}).get("merged_conversation_refs", []), *[item.id for item in sources]]))
            if latest_brain is not canonical_brain:
                canonical_brain.stage = latest_brain.stage
                canonical_brain.goal_readiness = latest_brain.goal_readiness
                canonical_brain.goal_brief = latest_brain.goal_brief
                canonical_brain.discovery = {**(latest_brain.discovery or {}), "merged_conversation_refs": audit}
                canonical_brain.strategy_proposals = latest_brain.strategy_proposals
                canonical_brain.conflicts = latest_brain.conflicts
                canonical_brain.validations = latest_brain.validations
                canonical_brain.decision = latest_brain.decision
                canonical_brain.discussion_package = latest_brain.discussion_package
            else:
                canonical_brain.discovery = {**(canonical_brain.discovery or {}), "merged_conversation_refs": audit}
            canonical_brain.source_message_refs = source_refs

        source_ids = [item.id for item in sources]
        session.query(ConversationMessageDB).filter(ConversationMessageDB.conversation_id.in_(source_ids)).update({"conversation_id": canonical.id}, synchronize_session=False)
        session.query(CouncilRunDB).filter(CouncilRunDB.conversation_id.in_(source_ids)).update({"conversation_id": canonical.id}, synchronize_session=False)
        for source in sources:
            source.status = "merged"
            source.merged_into_conversation_id = canonical.id
            source.topic_key = canonical.topic_key
        latest_update = max(item.updated_at for item in records if item.updated_at)
        canonical.updated_at = latest_update
        session.commit()
        session.refresh(canonical)
        return canonical


def get_conversation(conversation_id: str) -> ConversationDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(ConversationDB).where(
                ConversationDB.id == conversation_id,
                ConversationDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )


def resolve_conversation_id(conversation_id: str) -> str:
    """Follow a merged Conversation to its active canonical container."""
    with SessionLocal() as session:
        seen: set[str] = set()
        current_id = conversation_id
        while current_id not in seen:
            seen.add(current_id)
            record = session.scalar(select(ConversationDB).where(
                ConversationDB.id == current_id,
                ConversationDB.system_id == FOUNDER_SYSTEM_KEY,
            ))
            if record is None or record.status != "merged" or not record.merged_into_conversation_id:
                return current_id
            current_id = record.merged_into_conversation_id
        raise ConversationBoundaryError("Conversation merge cycle detected")


def bind_conversation_project(conversation_id: str, project_id: str | None) -> ConversationDB:
    if project_id and get_project(project_id) is None:
        raise ConversationBoundaryError("Founder project not found")
    with SessionLocal() as session:
        record = session.scalar(select(ConversationDB).where(ConversationDB.id == conversation_id, ConversationDB.system_id == FOUNDER_SYSTEM_KEY))
        if record is None:
            raise LookupError("Conversation not found")
        record.project_id = project_id
        session.commit(); session.refresh(record)
        return record


def delete_conversation(conversation_id: str) -> dict:
    """Delete chat-local state while preserving durable Object/asset lifecycles."""
    with SessionLocal() as session:
        record = session.scalar(select(ConversationDB).where(ConversationDB.id == conversation_id, ConversationDB.system_id == FOUNDER_SYSTEM_KEY))
        if record is None: raise LookupError("Conversation not found")
        council_ids = list(session.scalars(select(CouncilRunDB.id).where(CouncilRunDB.conversation_id == conversation_id)))
        if council_ids: session.query(CouncilModelRunDB).filter(CouncilModelRunDB.council_run_id.in_(council_ids)).delete(synchronize_session=False)
        session.query(CouncilRunDB).filter_by(conversation_id=conversation_id).delete(synchronize_session=False)
        attachment_refs = list(session.scalars(select(ConversationAttachmentDB.storage_reference).where(ConversationAttachmentDB.conversation_id == conversation_id)))
        session.query(ConversationAttachmentDB).filter_by(conversation_id=conversation_id).delete(synchronize_session=False)
        for model in (ConversationMessageDB, SecretaryDigestDB, CandidateGoalDB, PendingQuestionDB, GoalAssetDB, ExecutionDeltaDB, ConversationContextDB, ConversationObjectContextDB, ConversationCandidateContextDB):
            session.query(model).filter_by(conversation_id=conversation_id).delete(synchronize_session=False)
        # Pending/rejected candidates are conversation-local review state.
        session.query(FounderObjectCandidateDB).filter(FounderObjectCandidateDB.conversation_id == conversation_id, FounderObjectCandidateDB.review_status != "approved").delete(synchronize_session=False)
        # Approved candidate/intent records are immutable provenance for durable
        # Objects. They intentionally retain the deleted conversation id as
        # historical metadata, but are no longer reachable as live bindings.
        # Durable assets and approved Objects survive; only their live source link is detached.
        for model in (TaskAssetDB, ArtifactAssetDB, MemoryAssetDB, DecisionAssetDB):
            session.query(model).filter_by(conversation_id=conversation_id).update({"conversation_id": None}, synchronize_session=False)
        session.query(FounderObjectDB).filter_by(source_conversation_id=conversation_id).update({"source_conversation_id": None}, synchronize_session=False)
        session.query(FounderObjectRevisionDB).filter_by(source_conversation_id=conversation_id).update({"source_conversation_id": None}, synchronize_session=False)
        session.delete(record); session.commit()
        from app.founder_ai.attachments import delete_conversation_attachment_files
        delete_conversation_attachment_files(attachment_refs)
        return {"conversation_id": conversation_id, "deleted": True}
