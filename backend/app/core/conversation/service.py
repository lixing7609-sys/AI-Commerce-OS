from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.context.model import ConversationContextDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


class ConversationBoundaryError(ValueError):
    """Raised when a conversation crosses the Founder application boundary."""


def create_conversation(*, title: str | None = None) -> ConversationDB:
    with SessionLocal() as session:
        record = ConversationDB(
            system_id=FOUNDER_SYSTEM_KEY,
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
