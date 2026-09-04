"""add decision assets

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decision_assets",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("system_id", sa.String(length=80), nullable=False),
        sa.Column("conversation_id", sa.String(length=40), nullable=True),
        sa.Column("context_id", sa.String(length=40), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("decision", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("impact", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_decision_assets_system_id", "decision_assets", ["system_id"], unique=False)
    op.create_index("ix_decision_assets_conversation_id", "decision_assets", ["conversation_id"], unique=False)
    op.create_index("ix_decision_assets_context_id", "decision_assets", ["context_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_decision_assets_context_id", table_name="decision_assets")
    op.drop_index("ix_decision_assets_conversation_id", table_name="decision_assets")
    op.drop_index("ix_decision_assets_system_id", table_name="decision_assets")
    op.drop_table("decision_assets")
