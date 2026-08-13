"""add founder project context

Revision ID: c8d9e0f1a2b3
Revises: a7b8c9d0e1f2
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("founder_projects", sa.Column("id", sa.String(40), primary_key=True), sa.Column("system_id", sa.String(80), nullable=False), sa.Column("name", sa.String(160), nullable=False), sa.Column("description", sa.Text()), sa.Column("status", sa.String(30), server_default="active", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_founder_projects_system_id", "founder_projects", ["system_id"])
    op.add_column("conversations", sa.Column("project_id", sa.String(40), nullable=True))
    op.create_index("ix_conversations_project_id", "conversations", ["project_id"])
    op.execute(sa.text("INSERT INTO founder_projects (id, system_id, name, description, status) VALUES ('project-ai-commerce-os', 'founder_ai', 'AI Commerce OS', 'Sino Founder AI 当前系统项目', 'active')"))


def downgrade() -> None:
    op.drop_index("ix_conversations_project_id", table_name="conversations")
    op.drop_column("conversations", "project_id")
    op.drop_table("founder_projects")
