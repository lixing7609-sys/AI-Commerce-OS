from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, JSON, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class CouncilRunDB(Base):
    __tablename__ = "council_runs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"council-{uuid4().hex[:20]}")
    conversation_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    context_package: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    consensus: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    disagreements: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    unique_insights: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    risks: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    unknowns: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    recommendation: Mapped[str] = mapped_column(Text, nullable=False, default="")
    candidate_decision: Mapped[str | None] = mapped_column(Text, nullable=True)
    candidate_goal: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="completed")
    decision_status: Mapped[str] = mapped_column(String(30), nullable=False, default="candidate")
    asset_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class CouncilModelRunDB(Base):
    __tablename__ = "council_model_runs"
    id: Mapped[str] = mapped_column(String(40), primary_key=True, default=lambda: f"model-run-{uuid4().hex[:20]}")
    council_run_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    proposal: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    latency_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    context_references: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
