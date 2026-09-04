"""add capability configuration

Revision ID: f5e6a7b8c9d0
Revises: f4d5e6a7b8c9
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f5e6a7b8c9d0"
down_revision: Union[str, Sequence[str], None] = "f4d5e6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("ai_capability_configs", sa.Column("capability_key", sa.String(length=60), primary_key=True), sa.Column("configuration", sa.JSON(), nullable=False, server_default="{}"), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))


def downgrade() -> None:
    op.drop_table("ai_capability_configs")
