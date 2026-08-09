from sqlalchemy import select

from app.core.context.model import ConversationContextDB
from app.database.db import SessionLocal

FOUNDER_SYSTEM_KEY = "founder_ai"


def get_founder_context(conversation_id: str) -> ConversationContextDB | None:
    with SessionLocal() as session:
        return session.scalar(
            select(ConversationContextDB).where(
                ConversationContextDB.conversation_id == conversation_id,
                ConversationContextDB.system_id == FOUNDER_SYSTEM_KEY,
            )
        )
