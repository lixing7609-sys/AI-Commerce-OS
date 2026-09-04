from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, Integer, JSON, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class ReusableAssetDB(Base):
    """Structured reuse index attached to the existing ArtifactAsset catalog."""

    __tablename__ = "reusable_assets"
    __table_args__ = (
        UniqueConstraint("system_id", "fingerprint", name="uq_reusable_asset_fingerprint"),
        CheckConstraint(
            "status IN ('active', 'invalidated', 'superseded')",
            name="ck_reusable_asset_lifecycle_status",
        ),
    )

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"reuse-asset-{uuid4().hex[:20]}")
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    artifact_id: Mapped[str] = mapped_column(String(40), nullable=False, unique=True, index=True)
    asset_kind: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    pattern_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    semantic_module: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    target_keywords: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    source_task_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_execution_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    source_artifact_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    source_memory_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    source_evidence: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    implementation_pattern: Mapped[dict] = mapped_column(JSON, nullable=False)
    verification_pattern: Mapped[dict] = mapped_column(JSON, nullable=False)
    reuse_conditions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    invalidation_conditions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0, server_default="1")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="active", server_default="active", index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    superseded_by: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ReuseEvidenceDB(Base):
    """Durable proof that retrieval and advisory injection occurred for a task."""

    __tablename__ = "reuse_evidence"

    id: Mapped[str] = mapped_column(String(48), primary_key=True, default=lambda: f"reuse-evidence-{uuid4().hex[:20]}")
    system_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    task_asset_id: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    execution_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    reuse_asset_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    reuse_lookup_performed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    reuse_candidate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    reuse_compatibility: Mapped[str | None] = mapped_column(String(20), nullable=True)
    reuse_applied: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    reuse_rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    reuse_context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    telemetry_events: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default=text("'[]'"))
    final_result: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default=text("'{}'"))
    injected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"))


class ReusableAssetLifecycleEventDB(Base):
    """Append-only governance evidence for a ReusableAsset state transition."""

    __tablename__ = "reusable_asset_lifecycle_events"
    __table_args__ = (
        UniqueConstraint("transition_key", name="uq_reusable_asset_lifecycle_transition"),
    )

    id: Mapped[str] = mapped_column(
        String(64), primary_key=True,
        default=lambda: f"reuse-lifecycle-{uuid4().hex[:20]}",
    )
    transition_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reusable_asset_id: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
    from_status: Mapped[str] = mapped_column(String(24), nullable=False)
    to_status: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str] = mapped_column(String(120), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    evidence_ref: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    successor_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP"),
    )
