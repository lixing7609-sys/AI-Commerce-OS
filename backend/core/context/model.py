from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ConversationContextDB(Base):
    """Application-scoped context attached one-to-one to a conversation."""

    __tablename__ = "conversation_contexts"

    id: Mapped[str] = mapped_column(
        String(40), primary_key=True, default=lambda: f"ctx-{uuid4().hex[:20]}"
    )
    conversation_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    user_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    constraints: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    decisions_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    knowledge_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    task_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
