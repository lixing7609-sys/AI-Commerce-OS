"""add reusable intelligence library

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, Sequence[str], None] = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("artifact_assets", sa.Column("parent_artifact_id", sa.String(40), nullable=True))
    op.add_column("artifact_assets", sa.Column("previous_version_id", sa.String(40), nullable=True))
    op.add_column("artifact_assets", sa.Column("revision_reason", sa.Text(), nullable=True))
    op.create_index("ix_artifact_assets_parent_artifact_id", "artifact_assets", ["parent_artifact_id"])
    op.create_index("ix_artifact_assets_previous_version_id", "artifact_assets", ["previous_version_id"])
    op.add_column("memory_assets", sa.Column("parent_memory_id", sa.String(40), nullable=True))
    op.add_column("memory_assets", sa.Column("previous_revision_id", sa.String(40), nullable=True))
    op.add_column("memory_assets", sa.Column("revision_number", sa.Integer(), server_default="1", nullable=False))
    op.add_column("memory_assets", sa.Column("revision_reason", sa.Text(), nullable=True))
    op.add_column("memory_assets", sa.Column("importance", sa.Float(), nullable=True))
    op.add_column("memory_assets", sa.Column("tags", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    op.add_column("memory_assets", sa.Column("merged_into_memory_id", sa.String(40), nullable=True))
    op.create_index("ix_memory_assets_parent_memory_id", "memory_assets", ["parent_memory_id"])
    op.create_index("ix_memory_assets_previous_revision_id", "memory_assets", ["previous_revision_id"])
    op.create_index("ix_memory_assets_merged_into_memory_id", "memory_assets", ["merged_into_memory_id"])
    op.create_table("intelligence_references", sa.Column("id", sa.String(40), primary_key=True), sa.Column("system_id", sa.String(80), nullable=False), sa.Column("source_type", sa.String(20), nullable=False), sa.Column("source_id", sa.String(40), nullable=False), sa.Column("target_type", sa.String(20), nullable=False), sa.Column("target_id", sa.String(40), nullable=False), sa.Column("created_by", sa.String(80), server_default="founder", nullable=False), sa.Column("note", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    for column in ("system_id", "source_type", "source_id", "target_type", "target_id"):
        op.create_index(f"ix_intelligence_references_{column}", "intelligence_references", [column])


def downgrade() -> None:
    op.drop_table("intelligence_references")
    for column in ("merged_into_memory_id", "tags", "importance", "revision_reason", "revision_number", "previous_revision_id", "parent_memory_id"):
        op.drop_column("memory_assets", column)
    for column in ("revision_reason", "previous_version_id", "parent_artifact_id"):
        op.drop_column("artifact_assets", column)
