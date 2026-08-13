from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.context.model import ConversationContextDB
from app.core.project.service import get_project
from app.database.db import SessionLocal

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
        return list(
            session.scalars(
                select(ConversationDB)
                .where(ConversationDB.system_id == FOUNDER_SYSTEM_KEY)
                .order_by(ConversationDB.updated_at.desc())
            )
        )


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
