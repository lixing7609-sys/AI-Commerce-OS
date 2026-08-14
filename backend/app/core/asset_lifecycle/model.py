from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class AssetCatalogDB(Base):
    __tablename__ = "asset_catalog"
    __table_args__ = (UniqueConstraint("native_type", "native_id", name="uq_asset_catalog_native"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"asset-{uuid4().hex[:20]}")
    asset_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    native_type: Mapped[str] = mapped_column(String(40), nullable=False)
    native_id: Mapped[str] = mapped_column(String(48), nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    purpose: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="committed", server_default="committed", index=True)
    domain_id: Mapped[str] = mapped_column(String(80), nullable=False, default="general", server_default="general", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    source_conversation_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    source_package_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    dependency_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    used_by_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    execution_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    development_run_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    test_run_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    ready_approval: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    learning_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    reference_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    developed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ready_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    legacy_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class AssetLearningDB(Base):
    __tablename__ = "asset_learnings"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"learning-{uuid4().hex[:20]}")
    asset_id: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    execution_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    outcome: Mapped[str] = mapped_column(String(40), nullable=False, default="no_update", server_default="no_update")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="completed", server_default="completed")
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    successful_patterns: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    failure_causes: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    metrics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    recommendations: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    impact_level: Mapped[str] = mapped_column(String(20), nullable=False, default="low", server_default="low")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
