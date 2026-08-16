"""add founder draft center persistence

Revision ID: 9d6e7f8091a2
Revises: 8c5d6e7f8091
"""
from alembic import op
import sqlalchemy as sa

revision = "9d6e7f8091a2"
down_revision = "8c5d6e7f8091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "founder_drafts",
        sa.Column("id", sa.String(40), primary_key=True),
        sa.Column("title", sa.String(240), nullable=False),
        sa.Column("draft_type", sa.String(60), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="refining"),
        sa.Column("project_id", sa.String(40), nullable=False),
        sa.Column("project_name", sa.String(160), nullable=False),
        sa.Column("source_conversation_id", sa.String(40), nullable=False),
        sa.Column("source_message_refs", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("source_cognitive_outcome_ref", sa.String(80), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("structured_content", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("new_findings", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("resolved_questions", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("remaining_questions", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("current_next_step", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_founder_drafts_draft_type", "founder_drafts", ["draft_type"])
    op.create_index("ix_founder_drafts_status", "founder_drafts", ["status"])
    op.create_index("ix_founder_drafts_project_id", "founder_drafts", ["project_id"])
    op.create_index("ix_founder_drafts_source_conversation_id", "founder_drafts", ["source_conversation_id"])
    op.create_index("ix_founder_drafts_source_cognitive_outcome_ref", "founder_drafts", ["source_cognitive_outcome_ref"], unique=True)


def downgrade() -> None:
    op.drop_table("founder_drafts")
