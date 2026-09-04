"""add founder conversation boundary

Revision ID: 9d1e5b6c7f80
Revises: 8c7d4a1e2b30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "9d1e5b6c7f80"
down_revision: Union[str, Sequence[str], None] = "8c7d4a1e2b30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("system_id", sa.String(length=80), nullable=False),
        sa.Column("title", sa.String(length=200), server_default="New Conversation", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_system_id", "conversations", ["system_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_conversations_system_id", table_name="conversations")
    op.drop_table("conversations")
