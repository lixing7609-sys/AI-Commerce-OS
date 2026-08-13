"""add project intelligence and conversation distillation

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "project_intelligence",
        sa.Column("project_id", sa.String(40), primary_key=True),
        sa.Column("project_summary", sa.Text(), server_default="", nullable=False),
        sa.Column("current_positioning", sa.Text(), server_default="", nullable=False),
        sa.Column("master_prompt", sa.Text(), server_default="", nullable=False),
        sa.Column("prompt_version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("prompt_history", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("constraints", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("terminology", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("skill_refs", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("workflow_refs", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )
    for column in ("key_viewpoints", "constraints", "terminology", "memory_candidates", "asset_candidates"):
        op.add_column("secretary_digests", sa.Column(column, sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    op.add_column("secretary_digests", sa.Column("prompt_delta", sa.JSON(), server_default=sa.text("'{}'"), nullable=False))


def downgrade() -> None:
    op.drop_column("secretary_digests", "prompt_delta")
    for column in reversed(("key_viewpoints", "constraints", "terminology", "memory_candidates", "asset_candidates")):
        op.drop_column("secretary_digests", column)
    op.drop_table("project_intelligence")
