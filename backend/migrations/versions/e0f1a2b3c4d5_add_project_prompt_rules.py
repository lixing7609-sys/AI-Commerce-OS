"""add durable living project prompt rules

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("project_intelligence", sa.Column("prompt_rules", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))


def downgrade() -> None:
    op.drop_column("project_intelligence", "prompt_rules")
