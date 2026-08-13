from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class IntelligenceReferenceDB(Base):
    __tablename__ = "intelligence_references"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"reference-{uuid4().hex[:20]}")
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    source_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    target_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    created_by: Mapped[str] = mapped_column(String(80), nullable=False, default="founder", server_default="founder")
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
