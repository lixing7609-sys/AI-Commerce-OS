"""add memory assets

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memory_assets",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("system_id", sa.String(length=80), nullable=False),
        sa.Column("conversation_id", sa.String(length=40), nullable=True),
        sa.Column("decision_id", sa.String(length=40), nullable=True),
        sa.Column("task_asset_id", sa.String(length=40), nullable=True),
        sa.Column("artifact_id", sa.String(length=40), nullable=True),
        sa.Column("memory_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_memory_assets_system_id", "memory_assets", ["system_id"], unique=False)
    op.create_index("ix_memory_assets_conversation_id", "memory_assets", ["conversation_id"], unique=False)
    op.create_index("ix_memory_assets_decision_id", "memory_assets", ["decision_id"], unique=False)
    op.create_index("ix_memory_assets_task_asset_id", "memory_assets", ["task_asset_id"], unique=False)
    op.create_index("ix_memory_assets_artifact_id", "memory_assets", ["artifact_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_memory_assets_artifact_id", table_name="memory_assets")
    op.drop_index("ix_memory_assets_task_asset_id", table_name="memory_assets")
    op.drop_index("ix_memory_assets_decision_id", table_name="memory_assets")
    op.drop_index("ix_memory_assets_conversation_id", table_name="memory_assets")
    op.drop_index("ix_memory_assets_system_id", table_name="memory_assets")
    op.drop_table("memory_assets")
