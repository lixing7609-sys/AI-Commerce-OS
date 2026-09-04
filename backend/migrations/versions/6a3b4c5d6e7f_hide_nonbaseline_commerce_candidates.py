"""hide non-baseline AI Commerce OS candidates from Founder product

Revision ID: 6a3b4c5d6e7f
Revises: 5f2a3b4c5d6e
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6a3b4c5d6e7f"
down_revision: Union[str, Sequence[str], None] = "5f2a3b4c5d6e"
branch_labels = None
depends_on = None


HIDDEN_ASSETS = (
    ("object-0156bfeed4234e7690fa", "non-baseline Candidate Capability"),
    ("project-cdd645a9108e4a7694cd", "non-baseline Candidate Project asset"),
    ("decision-3479151109074903842c", "non-baseline Candidate Decision"),
)


def upgrade() -> None:
    connection = op.get_bind()
    for index, (entity_id, reason) in enumerate(HIDDEN_ASSETS, start=17):
        connection.execute(sa.text("""
            INSERT INTO founder_product_visibility (id, surface, entity_type, entity_id, hidden, reason)
            VALUES (:id, 'founder', 'asset', :entity_id, true, :reason)
            ON CONFLICT (surface, entity_type, entity_id) DO NOTHING
        """), {"id": f"founder-visibility-{index:02d}", "entity_id": entity_id, "reason": reason})


def downgrade() -> None:
    op.execute(sa.text("""
        DELETE FROM founder_product_visibility
        WHERE id IN ('founder-visibility-17', 'founder-visibility-18', 'founder-visibility-19')
    """))
