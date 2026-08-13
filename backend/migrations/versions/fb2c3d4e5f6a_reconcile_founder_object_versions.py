"""reconcile Founder Object versions with retained revision history

Revision ID: fb2c3d4e5f6a
Revises: fa1b2c3d4e5f
"""
from alembic import op
import sqlalchemy as sa

revision = "fb2c3d4e5f6a"
down_revision = "fa1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    connection.execute(sa.text("""
        update founder_objects o
        set version = greatest(1, coalesce((select max(r.version) + 1 from founder_object_revisions r where r.object_id=o.id), 1))
    """))


def downgrade():
    pass
