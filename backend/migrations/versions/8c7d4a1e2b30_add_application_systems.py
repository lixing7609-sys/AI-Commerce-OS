"""add canonical application systems

Revision ID: 8c7d4a1e2b30
Revises: f3a8c1d29e40
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "8c7d4a1e2b30"
down_revision: Union[str, Sequence[str], None] = "f3a8c1d29e40"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "application_systems",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("system_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("system_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("config", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("system_key"),
    )
    op.create_index("ix_application_systems_system_key", "application_systems", ["system_key"], unique=True)
    op.bulk_insert(
        sa.table(
            "application_systems",
            sa.column("id", sa.String), sa.column("system_key", sa.String),
            sa.column("name", sa.String), sa.column("system_type", sa.String),
            sa.column("status", sa.String), sa.column("config", sa.JSON()),
        ),
        [{"id": "app-founder-ai", "system_key": "founder_ai", "name": "Founder AI", "system_type": "application_system", "status": "active", "config": {}}],
    )


def downgrade() -> None:
    op.drop_index("ix_application_systems_system_key", table_name="application_systems")
    op.drop_table("application_systems")
