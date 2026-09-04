from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:20]}"


class ConversationMessageDB(Base):
    __tablename__ = "conversation_messages"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("message"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(30), nullable=False, default="discussion", server_default="discussion")
    intent: Mapped[str | None] = mapped_column(String(40), nullable=True)
    grounding: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ConversationAttachmentDB(Base):
    __tablename__ = "conversation_attachments"
    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: _id("attachment"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    message_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    attachment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="image", server_default="image")
    mime_type: Mapped[str] = mapped_column(String(40), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_reference: Mapped[str] = mapped_column(String(500), nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class SecretaryDigestDB(Base):
    __tablename__ = "secretary_digests"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("digest"))
    conversation_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    topics: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    key_viewpoints: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    constraints: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    terminology: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    prompt_delta: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    memory_candidates: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    asset_candidates: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class CandidateGoalDB(Base):
    __tablename__ = "candidate_goals"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("candidate-goal"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_message_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5, server_default="0.5")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="candidate", server_default="candidate")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class PendingQuestionDB(Base):
    __tablename__ = "pending_questions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("question"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_message_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open", server_default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class GoalAssetDB(Base):
    __tablename__ = "goal_assets"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("goal"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    candidate_goal_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_message_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    decision_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    knowledge_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    constraints: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    acceptance_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="goal_confirmed", server_default="goal_confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ExecutionDeltaDB(Base):
    __tablename__ = "execution_deltas"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("delta"))
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    goal_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    task_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_message_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    delta_type: Mapped[str] = mapped_column(String(40), nullable=False)
    impact_level: Mapped[str] = mapped_column(String(20), nullable=False)
    decision: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="received", server_default="received")
    package_version: Mapped[int | None] = mapped_column(nullable=True)
    analysis: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    founder_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SinoBrainSessionDB(Base):
    """Durable, provider-independent state for one Founder Brain conversation."""

    __tablename__ = "sino_brain_sessions"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: _id("brain"))
    conversation_id: Mapped[str] = mapped_column(String(40), unique=True, nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    stage: Mapped[str] = mapped_column(String(40), nullable=False, default="goal_discovery", server_default="goal_discovery")
    goal_readiness: Mapped[str] = mapped_column(String(30), nullable=False, default="unclear", server_default="unclear")
    goal_brief: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    discovery: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    strategy_proposals: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    conflicts: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    validations: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    decision: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    discussion_package: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    source_message_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
