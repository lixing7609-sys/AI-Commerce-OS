"""add runtime environment registry

Revision ID: d14e5f6a7b8c
Revises: c03d4e5f6a7b
"""
from alembic import op
import sqlalchemy as sa

revision = "d14e5f6a7b8c"
down_revision = "c03d4e5f6a7b"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "runtime_environment_registries",
        sa.Column("id", sa.String(length=80), primary_key=True),
        sa.Column("active_environment_id", sa.String(length=80), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("environments", sa.JSON(), nullable=False),
        sa.Column("source", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )


def downgrade():
    op.drop_table("runtime_environment_registries")
