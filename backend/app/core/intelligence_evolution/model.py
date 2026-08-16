from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class CapabilityVersionDB(Base):
    __tablename__ = "intelligence_evolution_versions"
    __table_args__ = (UniqueConstraint("capability_id", "version", name="uq_evolution_capability_version"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"version-{uuid4().hex[:20]}")
    capability_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="ready", server_default="ready", index=True)
    change_log: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    compatibility: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    dependencies: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class EvolutionFeedbackDB(Base):
    __tablename__ = "intelligence_evolution_feedback"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"feedback-{uuid4().hex[:20]}")
    capability_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    capability_version: Mapped[str] = mapped_column(String(40), nullable=False)
    source_system: Mapped[str] = mapped_column(String(80), nullable=False)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"), index=True)


class UpgradeRequestDB(Base):
    __tablename__ = "intelligence_evolution_upgrade_requests"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"upgrade-{uuid4().hex[:20]}")
    capability_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_version: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending_review", server_default="pending_review", index=True)
    learning_signal: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    proposal: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    evaluation_report: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    founder_decision: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
