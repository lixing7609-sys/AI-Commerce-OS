"""add Founder Intent Engine runtime persistence

Revision ID: fc3d4e5f6a7b
Revises: fb2c3d4e5f6a
"""
from alembic import op
import sqlalchemy as sa

revision = "fc3d4e5f6a7b"
down_revision = "fb2c3d4e5f6a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("founder_intent_runs", sa.Column("id", sa.String(48), primary_key=True), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("trigger_message_id", sa.String(40), nullable=False), sa.Column("runtime_provider", sa.String(80)), sa.Column("runtime_model", sa.String(160)), sa.Column("active_context_object_id", sa.String(48)), sa.Column("parse_status", sa.String(30), nullable=False, server_default="pending"), sa.Column("output", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("error_type", sa.String(80)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_founder_intent_runs_conversation_id", "founder_intent_runs", ["conversation_id"])
    op.create_index("ix_founder_intent_runs_trigger_message_id", "founder_intent_runs", ["trigger_message_id"])
    op.create_table("founder_object_candidates", sa.Column("id", sa.String(48), primary_key=True), sa.Column("intent_id", sa.String(48), nullable=False), sa.Column("conversation_id", sa.String(40), nullable=False), sa.Column("candidate_kind", sa.String(40), nullable=False), sa.Column("intent_type", sa.String(32), nullable=False), sa.Column("target_object_id", sa.String(48)), sa.Column("target_object_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("proposed_object_type", sa.String(40)), sa.Column("proposed_name", sa.String(240)), sa.Column("proposed_description", sa.Text(), nullable=False, server_default=""), sa.Column("proposed_status", sa.String(32)), sa.Column("proposed_patch", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("relation_changes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("reason", sa.Text(), nullable=False, server_default=""), sa.Column("confidence", sa.Float(), nullable=False, server_default="0"), sa.Column("source_message_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("fingerprint", sa.String(64), nullable=False, unique=True), sa.Column("review_status", sa.String(30), nullable=False, server_default="pending"), sa.Column("mutation_result", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")), sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    for name, cols in (("ix_founder_object_candidates_intent_id", ["intent_id"]), ("ix_founder_object_candidates_conversation_id", ["conversation_id"]), ("ix_founder_object_candidates_intent_type", ["intent_type"]), ("ix_founder_object_candidates_target_object_id", ["target_object_id"]), ("ix_founder_object_candidates_fingerprint", ["fingerprint"]), ("ix_founder_object_candidates_review_status", ["review_status"])): op.create_index(name, "founder_object_candidates", cols)
    op.create_table("conversation_candidate_contexts", sa.Column("conversation_id", sa.String(40), primary_key=True), sa.Column("candidate_id", sa.String(48), nullable=False), sa.Column("attached_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_conversation_candidate_contexts_candidate_id", "conversation_candidate_contexts", ["candidate_id"])


def downgrade():
    op.drop_table("conversation_candidate_contexts")
    op.drop_table("founder_object_candidates")
    op.drop_table("founder_intent_runs")
