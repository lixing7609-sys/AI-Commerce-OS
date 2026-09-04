from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class TaskAssetDB(Base):
    """An application-scoped execution asset, separate from legacy TaskDB."""

    __tablename__ = "task_assets"

    id: Mapped[str] = mapped_column(
        String(40), primary_key=True, default=lambda: f"task-asset-{uuid4().hex[:16]}"
    )
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    decision_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    scope: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft", server_default="draft")
    approval_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", server_default="pending")
    execution_status: Mapped[str] = mapped_column(String(30), nullable=False, default="not_started", server_default="not_started")
    result: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
