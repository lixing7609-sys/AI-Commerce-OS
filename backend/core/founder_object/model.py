from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


class FounderObjectDB(Base):
    __tablename__ = "founder_objects"
    __table_args__ = (UniqueConstraint("object_type", "normalized_name", "scope_key", name="uq_founder_object_identity"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: _id("object"))
    object_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft", server_default="draft", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    scope_key: Mapped[str] = mapped_column(String(80), nullable=False, default="founder_ai", server_default="founder_ai")
    source_conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    source_candidate_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    source_message_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    parent_object_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    child_object_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    dependency_object_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    related_object_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    execution_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    artifact_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    memory_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    decision_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    knowledge_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    founder_question: Mapped[str] = mapped_column(Text, nullable=False, default="是否批准进入执行？", server_default="是否批准进入执行？")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class FounderObjectRevisionDB(Base):
    __tablename__ = "founder_object_revisions"
    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: _id("revision"))
    object_id: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    source_conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_message_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ConversationObjectContextDB(Base):
    __tablename__ = "conversation_object_contexts"
    conversation_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    object_id: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    attached_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
