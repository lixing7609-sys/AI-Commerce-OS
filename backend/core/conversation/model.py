from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class ConversationDB(Base):
    """Application-scoped conversation identity; messages arrive in a later phase."""

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(
        String(40), primary_key=True, default=lambda: f"conv-{uuid4().hex[:20]}"
    )
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="New Conversation")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", server_default="active")
    conversation_state: Mapped[str] = mapped_column(String(30), nullable=False, default="exploring", server_default="exploring")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
