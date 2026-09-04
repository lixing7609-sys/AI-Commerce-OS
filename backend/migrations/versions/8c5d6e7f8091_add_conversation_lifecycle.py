"""add conversation lifecycle metadata

Revision ID: 8c5d6e7f8091
Revises: 7b4c5d6e7f80
"""
from alembic import op
import sqlalchemy as sa

revision = "8c5d6e7f8091"
down_revision = "7b4c5d6e7f80"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("conversation_kind", sa.String(30), nullable=False, server_default="founder_discussion"))
    op.add_column("conversations", sa.Column("topic_key", sa.String(160), nullable=True))
    op.add_column("conversations", sa.Column("merged_into_conversation_id", sa.String(40), nullable=True))
    op.create_index("ix_conversations_topic_key", "conversations", ["topic_key"])
    op.create_index("ix_conversations_merged_into_conversation_id", "conversations", ["merged_into_conversation_id"])


def downgrade() -> None:
    op.drop_index("ix_conversations_merged_into_conversation_id", table_name="conversations")
    op.drop_index("ix_conversations_topic_key", table_name="conversations")
    op.drop_column("conversations", "merged_into_conversation_id")
    op.drop_column("conversations", "topic_key")
    op.drop_column("conversations", "conversation_kind")
