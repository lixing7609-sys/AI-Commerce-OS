from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


class FounderIntentRunDB(Base):
    __tablename__ = "founder_intent_runs"
    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: _id("intent"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    trigger_message_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    runtime_provider: Mapped[str | None] = mapped_column(String(80), nullable=True)
    runtime_model: Mapped[str | None] = mapped_column(String(160), nullable=True)
    active_context_object_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    parse_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", server_default="pending")
    output: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    error_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class FounderObjectCandidateDB(Base):
    __tablename__ = "founder_object_candidates"
    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: _id("candidate"))
    intent_id: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    candidate_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    intent_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    target_object_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    target_object_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    proposed_object_type: Mapped[str | None] = mapped_column(String(40), nullable=True)
    proposed_name: Mapped[str | None] = mapped_column(String(240), nullable=True)
    proposed_description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    proposed_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    proposed_patch: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    relation_changes: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    reason: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0, server_default="0")
    source_message_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    review_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", server_default="pending", index=True)
    mutation_result: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConversationCandidateContextDB(Base):
    __tablename__ = "conversation_candidate_contexts"
    conversation_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    candidate_id: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    attached_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
