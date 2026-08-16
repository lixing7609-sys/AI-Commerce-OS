from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Integer, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class FounderProjectDB(Base):
    __tablename__ = "founder_projects"

    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"project-{uuid4().hex[:20]}")
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_project_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    project_type: Mapped[str] = mapped_column(String(40), nullable=False, default="project", server_default="project")
    architecture_role: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    source_work_item_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_proposal_id: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)
    initial_positioning: Mapped[str | None] = mapped_column(Text, nullable=True)
    initial_scope: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    creation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ProjectIntelligenceDB(Base):
    __tablename__ = "project_intelligence"

    project_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    project_summary: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    current_positioning: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    master_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    prompt_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    prompt_history: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    prompt_rules: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    constraints: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    terminology: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    skill_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    workflow_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
