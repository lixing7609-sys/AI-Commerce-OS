"""add multi model council persistence

Revision ID: f2b3c4d5e6f7
Revises: f1a2b3c4d5e6
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("council_runs", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("project_id", sa.String(40)), sa.Column("question", sa.Text(), nullable=False), sa.Column("context_package", sa.JSON(), nullable=False), sa.Column("consensus", sa.JSON(), nullable=False), sa.Column("disagreements", sa.JSON(), nullable=False), sa.Column("unique_insights", sa.JSON(), nullable=False), sa.Column("risks", sa.JSON(), nullable=False), sa.Column("unknowns", sa.JSON(), nullable=False), sa.Column("recommendation", sa.Text(), nullable=False), sa.Column("candidate_decision", sa.Text()), sa.Column("candidate_goal", sa.Text()), sa.Column("status", sa.String(30), nullable=False), sa.Column("decision_status", sa.String(30), nullable=False), sa.Column("asset_id", sa.String(40)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_council_runs_conversation_id", "council_runs", ["conversation_id"])
    op.create_index("ix_council_runs_project_id", "council_runs", ["project_id"])
    op.create_table("council_model_runs", sa.Column("id", sa.String(40), primary_key=True), sa.Column("council_run_id", sa.String(40), nullable=False), sa.Column("provider", sa.String(40), nullable=False), sa.Column("model", sa.String(120)), sa.Column("role", sa.String(120), nullable=False), sa.Column("status", sa.String(30), nullable=False), sa.Column("proposal", sa.JSON(), nullable=False), sa.Column("latency_ms", sa.Float()), sa.Column("error_type", sa.String(50)), sa.Column("context_references", sa.JSON(), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_council_model_runs_council_run_id", "council_model_runs", ["council_run_id"])


def downgrade() -> None:
    op.drop_table("council_model_runs")
    op.drop_table("council_runs")
