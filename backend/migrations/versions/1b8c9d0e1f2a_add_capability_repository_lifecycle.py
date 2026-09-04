"""add Capability Repository lifecycle fields

Revision ID: 1b8c9d0e1f2a
Revises: 0a7b8c9d0e1f
"""
from alembic import op
import sqlalchemy as sa

revision = "1b8c9d0e1f2a"
down_revision = "0a7b8c9d0e1f"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("asset_catalog", sa.Column("domain_id", sa.String(80), nullable=False, server_default="general"))
    op.add_column("asset_catalog", sa.Column("development_run_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("asset_catalog", sa.Column("test_run_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("asset_catalog", sa.Column("ready_approval", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.add_column("asset_catalog", sa.Column("developed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("asset_catalog", sa.Column("ready_approved_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_asset_catalog_domain_id", "asset_catalog", ["domain_id"])


def downgrade():
    op.drop_index("ix_asset_catalog_domain_id", table_name="asset_catalog")
    for column in ("ready_approved_at", "developed_at", "ready_approval", "test_run_refs", "development_run_refs", "domain_id"):
        op.drop_column("asset_catalog", column)
