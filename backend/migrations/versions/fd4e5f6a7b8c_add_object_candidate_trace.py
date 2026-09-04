"""add approved Candidate trace to Founder Object

Revision ID: fd4e5f6a7b8c
Revises: fc3d4e5f6a7b
"""
from alembic import op
import sqlalchemy as sa

revision = "fd4e5f6a7b8c"
down_revision = "fc3d4e5f6a7b"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("founder_objects", sa.Column("source_candidate_id", sa.String(48), nullable=True))
    op.create_index("ix_founder_objects_source_candidate_id", "founder_objects", ["source_candidate_id"])
    op.execute("""update founder_objects o set source_candidate_id=c.id from founder_object_candidates c where c.mutation_result->>'object_id'=o.id and c.review_status='approved'""")

def downgrade():
    op.drop_index("ix_founder_objects_source_candidate_id", table_name="founder_objects")
    op.drop_column("founder_objects", "source_candidate_id")
