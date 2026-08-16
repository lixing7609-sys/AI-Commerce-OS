"""add system project parent relation

Revision ID: 7b4c5d6e7f80
Revises: 6a3b4c5d6e7f
"""
from alembic import op
import sqlalchemy as sa

revision = "7b4c5d6e7f80"
down_revision = "6a3b4c5d6e7f"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("founder_projects", sa.Column("parent_project_id", sa.String(length=40), nullable=True))
    op.add_column("founder_projects", sa.Column("project_type", sa.String(length=40), server_default="project", nullable=False))
    op.add_column("founder_projects", sa.Column("architecture_role", sa.String(length=120), nullable=True))
    op.add_column("founder_projects", sa.Column("source_conversation_id", sa.String(length=40), nullable=True))
    op.add_column("founder_projects", sa.Column("source_work_item_id", sa.String(length=80), nullable=True))
    op.add_column("founder_projects", sa.Column("source_proposal_id", sa.String(length=80), nullable=True))
    op.add_column("founder_projects", sa.Column("initial_positioning", sa.Text(), nullable=True))
    op.add_column("founder_projects", sa.Column("initial_scope", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    op.add_column("founder_projects", sa.Column("creation_reason", sa.Text(), nullable=True))
    op.create_index("ix_founder_projects_parent_project_id", "founder_projects", ["parent_project_id"])
    op.create_unique_constraint("uq_founder_projects_source_proposal_id", "founder_projects", ["source_proposal_id"])


def downgrade():
    op.drop_constraint("uq_founder_projects_source_proposal_id", "founder_projects", type_="unique")
    op.drop_index("ix_founder_projects_parent_project_id", table_name="founder_projects")
    for column in ("creation_reason", "initial_scope", "initial_positioning", "source_proposal_id", "source_work_item_id", "source_conversation_id", "architecture_role", "project_type", "parent_project_id"):
        op.drop_column("founder_projects", column)
