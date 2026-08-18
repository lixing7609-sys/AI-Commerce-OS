"""reconcile audited Functional Path verification lineage

Revision ID: e37b8c9d0e1f
Revises: e26a7b8c9d0e
"""
from alembic import op


revision = "e37b8c9d0e1f"
down_revision = "e26a7b8c9d0e"
branch_labels = None
depends_on = None


AUDITED_FUNCTIONAL_PATH_IDS = (
    "conv-d9b6234f3cce4d6e8e86",  # Path A fixture
    "conv-bc3ddf6f70f84965a8a2",  # Path D fixture
    "conv-3a42adb000434f51ab4b",  # Path B fixture
)


def upgrade() -> None:
    ids = ", ".join(f"'{value}'" for value in AUDITED_FUNCTIONAL_PATH_IDS)
    op.execute(f"UPDATE conversations SET conversation_type = 'VERIFICATION_RUN', created_by = 'VERIFICATION', visibility = 'hidden_from_conversation_list' WHERE id IN ({ids})")


def downgrade() -> None:
    ids = ", ".join(f"'{value}'" for value in AUDITED_FUNCTIONAL_PATH_IDS)
    op.execute(f"UPDATE conversations SET conversation_type = 'USER_CONVERSATION', created_by = 'FOUNDER', visibility = 'conversation_list' WHERE id IN ({ids})")
