"""add conversation first and execution delta assets

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, Sequence[str], None] = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("conversations", sa.Column("conversation_state", sa.String(30), server_default="exploring", nullable=False))
    op.add_column("decision_assets", sa.Column("source_message_ids", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    op.add_column("decision_assets", sa.Column("confirmed", sa.Boolean(), server_default=sa.text("true"), nullable=False))
    op.add_column("memory_assets", sa.Column("source_message_ids", sa.JSON(), server_default=sa.text("'[]'"), nullable=False))
    op.create_table("conversation_messages", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("role", sa.String(20), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("message_type", sa.String(30), server_default="discussion", nullable=False), sa.Column("intent", sa.String(40)), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_conversation_messages_conversation_id", "conversation_messages", ["conversation_id"])
    op.create_table("secretary_digests", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False, unique=True), sa.Column("summary", sa.Text(), server_default="", nullable=False), sa.Column("topics", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_secretary_digests_conversation_id", "secretary_digests", ["conversation_id"])
    op.create_table("candidate_goals", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("source_message_ids", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("confidence", sa.Float(), server_default="0.5", nullable=False), sa.Column("status", sa.String(30), server_default="candidate", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_candidate_goals_conversation_id", "candidate_goals", ["conversation_id"])
    op.create_table("pending_questions", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("reason", sa.Text()), sa.Column("source_message_ids", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("status", sa.String(30), server_default="open", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_pending_questions_conversation_id", "pending_questions", ["conversation_id"])
    op.create_table("goal_assets", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("candidate_goal_id", sa.String(40)), sa.Column("title", sa.String(200), nullable=False), sa.Column("description", sa.Text(), nullable=False), sa.Column("source_message_ids", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("decision_refs", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("knowledge_refs", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("constraints", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("acceptance_criteria", sa.JSON(), server_default=sa.text("'[]'"), nullable=False), sa.Column("status", sa.String(30), server_default="goal_confirmed", nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False))
    op.create_index("ix_goal_assets_conversation_id", "goal_assets", ["conversation_id"])
    op.create_index("ix_goal_assets_candidate_goal_id", "goal_assets", ["candidate_goal_id"])
    op.create_table("execution_deltas", sa.Column("id", sa.String(40), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("goal_id", sa.String(40), nullable=False), sa.Column("task_id", sa.String(40), nullable=False), sa.Column("execution_id", sa.String(40), nullable=False), sa.Column("source_message_id", sa.String(40), nullable=False), sa.Column("content", sa.Text(), nullable=False), sa.Column("delta_type", sa.String(40), nullable=False), sa.Column("impact_level", sa.String(20), nullable=False), sa.Column("decision", sa.String(40), nullable=False), sa.Column("status", sa.String(30), server_default="received", nullable=False), sa.Column("package_version", sa.Integer()), sa.Column("analysis", sa.JSON(), server_default=sa.text("'{}'"), nullable=False), sa.Column("founder_confirmed", sa.Boolean(), server_default=sa.text("false"), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False), sa.Column("applied_at", sa.DateTime(timezone=True)))
    for column in ("conversation_id", "goal_id", "task_id", "execution_id", "source_message_id"):
        op.create_index(f"ix_execution_deltas_{column}", "execution_deltas", [column])


def downgrade() -> None:
    op.drop_table("execution_deltas")
    op.drop_table("goal_assets")
    op.drop_table("pending_questions")
    op.drop_table("candidate_goals")
    op.drop_table("secretary_digests")
    op.drop_table("conversation_messages")
    op.drop_column("conversations", "conversation_state")
    op.drop_column("memory_assets", "source_message_ids")
    op.drop_column("decision_assets", "confirmed")
    op.drop_column("decision_assets", "source_message_ids")
