"""add persisted answer grounding metadata

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversation_messages", sa.Column("grounding", sa.JSON(), server_default=sa.text("'{}'"), nullable=False))


def downgrade() -> None:
    op.drop_column("conversation_messages", "grounding")
