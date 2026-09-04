"""add intelligence evolution upgrade requests

Revision ID: c03d4e5f6a7b
Revises: bf2c3d4e5f6a
"""
from alembic import op
import sqlalchemy as sa

revision = "c03d4e5f6a7b"
down_revision = "bf2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_evolution_upgrade_requests",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("capability_id", sa.String(80), nullable=False),
        sa.Column("source_version", sa.String(40), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="pending_review"),
        sa.Column("learning_signal", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("proposal", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("evaluation_report", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("founder_decision", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_intelligence_evolution_upgrade_requests_capability_id", "intelligence_evolution_upgrade_requests", ["capability_id"])
    op.create_index("ix_intelligence_evolution_upgrade_requests_status", "intelligence_evolution_upgrade_requests", ["status"])


def downgrade() -> None:
    op.drop_table("intelligence_evolution_upgrade_requests")
