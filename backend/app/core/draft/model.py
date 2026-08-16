from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class FounderDraftDB(Base):
    __tablename__ = "founder_drafts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"draft-{uuid4().hex[:20]}")
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    draft_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="refining", server_default="refining", index=True)
    project_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    project_name: Mapped[str] = mapped_column(String(160), nullable=False)
    source_conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_message_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    source_cognitive_outcome_ref: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    structured_content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    new_findings: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    resolved_questions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    remaining_questions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    current_next_step: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
