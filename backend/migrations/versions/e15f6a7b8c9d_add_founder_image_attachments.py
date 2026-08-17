"""add Founder conversation image attachments

Revision ID: e15f6a7b8c9d
Revises: d14e5f6a7b8c
"""
from alembic import op
import sqlalchemy as sa

revision = "e15f6a7b8c9d"
down_revision = "d14e5f6a7b8c"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("conversation_attachments",
        sa.Column("id", sa.String(48), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False),
        sa.Column("message_id", sa.String(40), nullable=True), sa.Column("attachment_type", sa.String(20), nullable=False, server_default="image"),
        sa.Column("mime_type", sa.String(40), nullable=False), sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("storage_reference", sa.String(500), nullable=False), sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False), sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_conversation_attachments_conversation_id", "conversation_attachments", ["conversation_id"])
    op.create_index("ix_conversation_attachments_message_id", "conversation_attachments", ["message_id"])

def downgrade():
    op.drop_table("conversation_attachments")
