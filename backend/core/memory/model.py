from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, Integer, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class MemoryAssetDB(Base):
    """A durable, application-scoped memory asset; no automatic evolution is implied."""

    __tablename__ = "memory_assets"

    id: Mapped[str] = mapped_column(
        String(40), primary_key=True, default=lambda: f"memory-{uuid4().hex[:20]}"
    )
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    decision_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    task_asset_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    artifact_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    memory_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_message_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    parent_memory_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    previous_revision_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    revision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    importance: Mapped[float | None] = mapped_column(Float, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    merged_into_memory_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
