"""add Conversation Lifecycle and Filing V1 metadata

Revision ID: e26a7b8c9d0e
Revises: e15f6a7b8c9d
"""
from alembic import op
import sqlalchemy as sa


revision = "e26a7b8c9d0e"
down_revision = "e15f6a7b8c9d"
branch_labels = None
depends_on = None


VERIFICATION_IDS = (
    "conv-5daa4c622a2a495abb42", "conv-82711c72cf8d49caa906", "conv-6e85dcc8dea9417283d0",
    "conv-d9b6234f3cce4d6e8e86", "conv-bc3ddf6f70f84965a8a2", "conv-3a42adb000434f51ab4b",
    "conv-f5e0141971024d6cbe8e", "conv-58a946cf3560433c8e57",
    "conv-ab957190aa314307950e", "conv-5bb01b1a10f14c8ca132", "conv-5d53fe10468c4c8895b2",
    "conv-da7e85c5c63a48bba8cd", "conv-0c71ed299b3c408b8c07", "conv-e8cd4abe9ea146febfe7",
    "conv-be058cd47edb44828887", "conv-34b48a55333b4362a224", "conv-2eaaba2216774eabb3a9",
    "conv-f8ba37b6b7a447fa8610", "conv-943ab4cccb91452188ff",
)
EMPTY_VERIFICATION_IDS = (
    "conv-5daa4c622a2a495abb42", "conv-82711c72cf8d49caa906", "conv-f5e0141971024d6cbe8e",
)


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    op.add_column("conversations", sa.Column("conversation_type", sa.String(30), nullable=False, server_default="USER_CONVERSATION"))
    op.add_column("conversations", sa.Column("created_by", sa.String(20), nullable=False, server_default="FOUNDER"))
    op.add_column("conversations", sa.Column("visibility", sa.String(40), nullable=False, server_default="conversation_list"))
    op.add_column("conversations", sa.Column("lifecycle_status", sa.String(30), nullable=False, server_default="active"))
    op.create_index("ix_conversations_conversation_type", "conversations", ["conversation_type"])
    op.create_index("ix_conversations_created_by", "conversations", ["created_by"])
    op.create_index("ix_conversations_visibility", "conversations", ["visibility"])
    op.create_index("ix_conversations_lifecycle_status", "conversations", ["lifecycle_status"])
    op.execute("UPDATE conversations SET conversation_type = 'PROJECT_CONVERSATION' WHERE system_id = 'founder_ai' AND project_id IS NOT NULL")
    # These exact ids were audited as automated verification lineage. Exact-id
    # migration avoids hiding a Founder conversation merely because its title
    # happens to contain words such as Test or Verification.
    op.execute(f"UPDATE conversations SET conversation_type = 'VERIFICATION_RUN', created_by = 'VERIFICATION', visibility = 'hidden_from_conversation_list' WHERE id IN ({_quoted(VERIFICATION_IDS)})")
    op.execute(f"UPDATE conversations SET lifecycle_status = 'ephemeral' WHERE id IN ({_quoted(EMPTY_VERIFICATION_IDS)})")


def downgrade() -> None:
    op.drop_index("ix_conversations_lifecycle_status", table_name="conversations")
    op.drop_index("ix_conversations_visibility", table_name="conversations")
    op.drop_index("ix_conversations_created_by", table_name="conversations")
    op.drop_index("ix_conversations_conversation_type", table_name="conversations")
    op.drop_column("conversations", "lifecycle_status")
    op.drop_column("conversations", "visibility")
    op.drop_column("conversations", "created_by")
    op.drop_column("conversations", "conversation_type")
