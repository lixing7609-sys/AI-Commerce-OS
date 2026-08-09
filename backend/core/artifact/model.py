from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ArtifactAssetDB(Base):
    """A durable, application-scoped result produced by a TaskAsset."""

    __tablename__ = "artifact_assets"

    id: Mapped[str] = mapped_column(
        String(40), primary_key=True, default=lambda: f"artifact-{uuid4().hex[:20]}"
    )
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    task_asset_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    decision_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    artifact_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    content_ref: Mapped[str | None] = mapped_column(String(500), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
