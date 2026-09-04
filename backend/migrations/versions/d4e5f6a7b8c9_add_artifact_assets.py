"""add artifact assets

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "artifact_assets",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("system_id", sa.String(length=80), nullable=False),
        sa.Column("task_asset_id", sa.String(length=40), nullable=True),
        sa.Column("conversation_id", sa.String(length=40), nullable=True),
        sa.Column("decision_id", sa.String(length=40), nullable=True),
        sa.Column("artifact_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=500), nullable=True),
        sa.Column("content_ref", sa.String(length=500), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="active", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_artifact_assets_system_id", "artifact_assets", ["system_id"], unique=False)
    op.create_index("ix_artifact_assets_task_asset_id", "artifact_assets", ["task_asset_id"], unique=False)
    op.create_index("ix_artifact_assets_conversation_id", "artifact_assets", ["conversation_id"], unique=False)
    op.create_index("ix_artifact_assets_decision_id", "artifact_assets", ["decision_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_artifact_assets_decision_id", table_name="artifact_assets")
    op.drop_index("ix_artifact_assets_conversation_id", table_name="artifact_assets")
    op.drop_index("ix_artifact_assets_task_asset_id", table_name="artifact_assets")
    op.drop_index("ix_artifact_assets_system_id", table_name="artifact_assets")
    op.drop_table("artifact_assets")
