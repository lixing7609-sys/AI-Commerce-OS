"""add conversation contexts

Revision ID: a1b2c3d4e5f6
Revises: 9d1e5b6c7f80
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "9d1e5b6c7f80"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_contexts",
        sa.Column("id", sa.String(length=40), nullable=False),
        sa.Column("conversation_id", sa.String(length=40), nullable=False),
        sa.Column("system_id", sa.String(length=80), nullable=False),
        sa.Column("user_goal", sa.Text(), nullable=True),
        sa.Column("constraints", sa.JSON(), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("decisions_summary", sa.Text(), nullable=True),
        sa.Column("knowledge_refs", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("task_refs", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id"),
    )
    op.create_index("ix_conversation_contexts_conversation_id", "conversation_contexts", ["conversation_id"], unique=False)
    op.create_index("ix_conversation_contexts_system_id", "conversation_contexts", ["system_id"], unique=False)

    # Existing conversations predate this boundary; preserve them with empty Founder contexts.
    bind = op.get_bind()
    rows = bind.execute(sa.text("SELECT id, system_id FROM conversations"))
    for row in rows:
        bind.execute(
            sa.text(
                "INSERT INTO conversation_contexts "
                "(id, conversation_id, system_id, constraints, knowledge_refs, task_refs) "
                "VALUES (:id, :conversation_id, :system_id, '{}'::json, '[]'::json, '[]'::json)"
            ),
            {
                "id": f"ctx-{row.id[-20:]}",
                "conversation_id": row.id,
                "system_id": row.system_id,
            },
        )


def downgrade() -> None:
    op.drop_index("ix_conversation_contexts_system_id", table_name="conversation_contexts")
    op.drop_index("ix_conversation_contexts_conversation_id", table_name="conversation_contexts")
    op.drop_table("conversation_contexts")
