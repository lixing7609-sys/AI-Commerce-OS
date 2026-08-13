"""add model center

Revision ID: f3c4d5e6a7b8
Revises: f2b3c4d5e6f7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f3c4d5e6a7b8"
down_revision: Union[str, Sequence[str], None] = "f2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_provider_configs",
        sa.Column("provider_key", sa.String(length=40), primary_key=True),
        sa.Column("display_name", sa.String(length=80), nullable=False),
        sa.Column("base_url", sa.String(length=500), nullable=False),
        sa.Column("model", sa.String(length=160), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=True),
        sa.Column("api_key_mask", sa.String(length=40), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("health_status", sa.String(length=30), nullable=False, server_default="unknown"),
        sa.Column("health_error", sa.String(length=80), nullable=True),
        sa.Column("health_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_table(
        "model_role_assignments",
        sa.Column("role_key", sa.String(length=40), primary_key=True),
        sa.Column("provider_key", sa.String(length=40), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("role_key", name="uq_model_role_assignment_role"),
    )


def downgrade() -> None:
    op.drop_table("model_role_assignments")
    op.drop_table("model_provider_configs")
