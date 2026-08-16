"""add intelligence evolution feedback

Revision ID: bf2c3d4e5f6a
Revises: ae1b2c3d4e5f
"""
from alembic import op
import sqlalchemy as sa

revision = "bf2c3d4e5f6a"
down_revision = "ae1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_evolution_feedback",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("capability_id", sa.String(80), nullable=False),
        sa.Column("capability_version", sa.String(40), nullable=False),
        sa.Column("source_system", sa.String(80), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("context", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_intelligence_evolution_feedback_capability_id", "intelligence_evolution_feedback", ["capability_id"])
    op.create_index("ix_intelligence_evolution_feedback_received_at", "intelligence_evolution_feedback", ["received_at"])


def downgrade() -> None:
    op.drop_table("intelligence_evolution_feedback")
