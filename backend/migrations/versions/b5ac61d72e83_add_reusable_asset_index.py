"""add reusable asset index and reuse evidence

Revision ID: b5ac61d72e83
Revises: a49b50c61d72
"""
from alembic import op
import sqlalchemy as sa

revision = "b5ac61d72e83"
down_revision = "a49b50c61d72"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reusable_assets",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("system_id", sa.String(80), nullable=False),
        sa.Column("artifact_id", sa.String(40), nullable=False, unique=True),
        sa.Column("asset_kind", sa.String(60), nullable=False),
        sa.Column("pattern_type", sa.String(80), nullable=False),
        sa.Column("semantic_module", sa.String(120), nullable=False),
        sa.Column("target_keywords", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("source_task_id", sa.String(40), nullable=False),
        sa.Column("source_execution_id", sa.String(40), nullable=False),
        sa.Column("source_artifact_id", sa.String(40), nullable=True),
        sa.Column("source_memory_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("source_evidence", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("implementation_pattern", sa.JSON(), nullable=False),
        sa.Column("verification_pattern", sa.JSON(), nullable=False),
        sa.Column("reuse_conditions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("invalidation_conditions", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("superseded_by", sa.String(48), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("system_id", "fingerprint", name="uq_reusable_asset_fingerprint"),
    )
    for column in ("system_id", "artifact_id", "asset_kind", "pattern_type", "semantic_module", "source_task_id", "source_execution_id", "source_artifact_id", "status", "fingerprint", "superseded_by"):
        op.create_index(f"ix_reusable_assets_{column}", "reusable_assets", [column])
    op.create_table(
        "reuse_evidence",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("system_id", sa.String(80), nullable=False),
        sa.Column("task_asset_id", sa.String(40), nullable=False),
        sa.Column("execution_id", sa.String(40), nullable=True),
        sa.Column("reuse_asset_id", sa.String(48), nullable=True),
        sa.Column("reuse_lookup_performed", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("reuse_candidate_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reuse_compatibility", sa.String(20), nullable=True),
        sa.Column("reuse_applied", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reuse_rejected_reason", sa.Text(), nullable=True),
        sa.Column("reuse_context", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("telemetry_events", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("final_result", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("injected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    for column in ("system_id", "task_asset_id", "execution_id", "reuse_asset_id"):
        op.create_index(f"ix_reuse_evidence_{column}", "reuse_evidence", [column])


def downgrade():
    op.drop_table("reuse_evidence")
    op.drop_table("reusable_assets")
