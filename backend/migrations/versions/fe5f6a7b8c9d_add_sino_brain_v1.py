"""add Sino Brain V1 durable session

Revision ID: fe5f6a7b8c9d
Revises: fd4e5f6a7b8c
"""
from alembic import op
import sqlalchemy as sa

revision = "fe5f6a7b8c9d"
down_revision = "fd4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "sino_brain_sessions",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("conversation_id", sa.String(40), nullable=False),
        sa.Column("project_id", sa.String(40), nullable=True),
        sa.Column("stage", sa.String(40), nullable=False, server_default="goal_discovery"),
        sa.Column("goal_readiness", sa.String(30), nullable=False, server_default="unclear"),
        sa.Column("goal_brief", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("discovery", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("strategy_proposals", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("conflicts", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("validations", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("decision", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("discussion_package", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("source_message_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_sino_brain_sessions_conversation_id", "sino_brain_sessions", ["conversation_id"], unique=True)
    op.create_index("ix_sino_brain_sessions_project_id", "sino_brain_sessions", ["project_id"])


def downgrade():
    op.drop_index("ix_sino_brain_sessions_project_id", table_name="sino_brain_sessions")
    op.drop_index("ix_sino_brain_sessions_conversation_id", table_name="sino_brain_sessions")
    op.drop_table("sino_brain_sessions")
