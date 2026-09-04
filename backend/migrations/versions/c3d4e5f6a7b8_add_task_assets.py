"""add task assets

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, Sequence[str], None] = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_assets",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("system_id", sa.String(length=80), nullable=False),
        sa.Column("conversation_id", sa.String(length=40), nullable=True),
        sa.Column("decision_id", sa.String(length=40), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("scope", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="draft", nullable=False),
        sa.Column("approval_status", sa.String(length=30), server_default="pending", nullable=False),
        sa.Column("execution_status", sa.String(length=30), server_default="not_started", nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_assets_system_id", "task_assets", ["system_id"], unique=False)
    op.create_index("ix_task_assets_conversation_id", "task_assets", ["conversation_id"], unique=False)
    op.create_index("ix_task_assets_decision_id", "task_assets", ["decision_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_task_assets_decision_id", table_name="task_assets")
    op.drop_index("ix_task_assets_conversation_id", table_name="task_assets")
    op.drop_index("ix_task_assets_system_id", table_name="task_assets")
    op.drop_table("task_assets")
