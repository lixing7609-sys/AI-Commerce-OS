"""add intelligence evolution capability versions

Revision ID: ae1b2c3d4e5f
Revises: 9d6e7f8091a2
"""
from alembic import op
import sqlalchemy as sa

revision = "ae1b2c3d4e5f"
down_revision = "9d6e7f8091a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "intelligence_evolution_versions",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("capability_id", sa.String(80), nullable=False),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="ready"),
        sa.Column("change_log", sa.Text(), nullable=False, server_default=""),
        sa.Column("compatibility", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("dependencies", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("content", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("capability_id", "version", name="uq_evolution_capability_version"),
    )
    op.create_index("ix_intelligence_evolution_versions_capability_id", "intelligence_evolution_versions", ["capability_id"])
    op.create_index("ix_intelligence_evolution_versions_status", "intelligence_evolution_versions", ["status"])


def downgrade() -> None:
    op.drop_table("intelligence_evolution_versions")
