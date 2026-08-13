"""add provider registry v2 model registry

Revision ID: f7a8b9c0d1e2
Revises: f5e6a7b8c9d0
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "f5e6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "model_registry",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("provider_id", sa.String(length=40), nullable=False),
        sa.Column("model_id", sa.String(length=160), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("capability", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("context_window", sa.Integer(), nullable=True),
        sa.Column("supports_reasoning", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("supports_vision", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("supports_tools", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("selected", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("provider_id", "model_id", name="uq_model_registry_provider_model"),
    )
    op.create_index("ix_model_registry_provider_id", "model_registry", ["provider_id"])


def downgrade() -> None:
    op.drop_index("ix_model_registry_provider_id", table_name="model_registry")
    op.drop_table("model_registry")
