import re
from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.context.model import ConversationContextDB
from app.core.artifact.model import ArtifactAssetDB
from app.core.decision.model import DecisionAssetDB
from app.core.memory.model import MemoryAssetDB
from app.core.task_asset.model import TaskAssetDB
from app.core.conversation_first.model import CandidateGoalDB, ConversationMessageDB, ExecutionDeltaDB, GoalAssetDB, PendingQuestionDB, SecretaryDigestDB, SinoBrainSessionDB
from app.core.council.model import CouncilModelRunDB, CouncilRunDB
from app.core.project.service import get_project
from app.core.product_visibility.service import hidden_entity_ids
from app.database.db import SessionLocal
from core.founder_intent.model import ConversationCandidateContextDB, FounderObjectCandidateDB
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB

FOUNDER_SYSTEM_KEY = "founder_ai"


class ConversationBoundaryError(ValueError):
    """Raised when a conversation crosses the Founder application boundary."""


def create_conversation(*, title: str | None = None, project_id: str | None = None) -> ConversationDB:
    if project_id and get_project(project_id) is None:
        raise ConversationBoundaryError("Founder project not found")
    with SessionLocal() as session:
        record = ConversationDB(
            system_id=FOUNDER_SYSTEM_KEY,
            project_id=project_id,
            title=(title or "New Conversation").strip() or "New Conversation",
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
                    ConversationDB.id.notin_(hidden_ids),
                )
                .order_by(ConversationDB.updated_at.desc())
            )
        )
        internal_title = re.compile(r"^(goal\s*(revision|confirmation|understanding|brief)?|intent|validation|decision|discussion\s*package|package)(\b|\s|[-_:])", re.I)
        for record in records:
            if internal_title.search(record.title or ""):
                brain = session.scalar(select(SinoBrainSessionDB).where(SinoBrainSessionDB.conversation_id == record.id))
                business_title = str((brain.goal_brief or {}).get("goal") or "").strip().rstrip("。！？?!") if brain else ""
                record.title = business_title[:80] or "未命名讨论"
        return records


def get_conversation(conversation_id: str) -> ConversationDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(ConversationDB).where(
                ConversationDB.id == conversation_id,
                ConversationDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )


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
        return {"conversation_id": conversation_id, "deleted": True}
