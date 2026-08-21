"""add conversation model preference

Revision ID: e48c9d0e1f2a
Revises: e37b8c9d0e1f
"""
from alembic import op
import sqlalchemy as sa

revision = "e48c9d0e1f2a"
down_revision = "e37b8c9d0e1f"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("conversations", sa.Column("conversation_model_provider", sa.String(length=80), nullable=True))
    op.add_column("conversations", sa.Column("conversation_model", sa.String(length=160), nullable=True))


def downgrade():
    op.drop_column("conversations", "conversation_model")
    op.drop_column("conversations", "conversation_model_provider")
