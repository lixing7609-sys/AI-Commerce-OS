"""add founder object layer

Revision ID: f8b9c0d1e2f3
Revises: f7a8b9c0d1e2
"""
from alembic import op
import sqlalchemy as sa

revision = "f8b9c0d1e2f3"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("founder_objects",
        sa.Column("id", sa.String(48), primary_key=True), sa.Column("object_type", sa.String(40), nullable=False),
        sa.Column("name", sa.String(240), nullable=False), sa.Column("normalized_name", sa.String(240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""), sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"), sa.Column("scope_key", sa.String(80), nullable=False, server_default="founder_ai"),
        sa.Column("source_conversation_id", sa.String(40)), sa.Column("source_message_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("parent_object_id", sa.String(48)), sa.Column("child_object_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("dependency_object_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("related_object_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("execution_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("artifact_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("memory_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("decision_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("knowledge_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("founder_question", sa.Text(), nullable=False, server_default="是否批准进入执行？"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("object_type", "normalized_name", "scope_key", name="uq_founder_object_identity"))
    op.create_index("ix_founder_objects_type", "founder_objects", ["object_type"]); op.create_index("ix_founder_objects_status", "founder_objects", ["status"]); op.create_index("ix_founder_objects_conversation", "founder_objects", ["source_conversation_id"])
    op.create_table("founder_object_revisions", sa.Column("id", sa.String(48), primary_key=True), sa.Column("object_id", sa.String(48), nullable=False), sa.Column("version", sa.Integer(), nullable=False), sa.Column("name", sa.String(240), nullable=False), sa.Column("description", sa.Text(), nullable=False, server_default=""), sa.Column("status", sa.String(32), nullable=False), sa.Column("source_conversation_id", sa.String(40)), sa.Column("source_message_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")), sa.Column("snapshot", sa.JSON(), nullable=False, server_default=sa.text("'{}'")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_founder_object_revisions_object", "founder_object_revisions", ["object_id"])
    op.create_table("conversation_object_contexts", sa.Column("conversation_id", sa.String(40), primary_key=True), sa.Column("object_id", sa.String(48), nullable=False), sa.Column("attached_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")))
    op.create_index("ix_conversation_object_contexts_object", "conversation_object_contexts", ["object_id"])


def downgrade():
    op.drop_table("conversation_object_contexts"); op.drop_table("founder_object_revisions"); op.drop_table("founder_objects")
