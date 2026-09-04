"""add reusable asset lifecycle governance events

Revision ID: c6bd72e83f94
Revises: b5ac61d72e83
"""
from alembic import op
import sqlalchemy as sa


revision = "c6bd72e83f94"
down_revision = "b5ac61d72e83"
branch_labels = None
depends_on = None


def upgrade():
    op.create_check_constraint(
        "ck_reusable_asset_lifecycle_status", "reusable_assets",
        "status IN ('active', 'invalidated', 'superseded')",
    )
    op.create_table(
        "reusable_asset_lifecycle_events",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("transition_key", sa.String(64), nullable=False),
        sa.Column("reusable_asset_id", sa.String(48), nullable=False),
        sa.Column("from_status", sa.String(24), nullable=False),
        sa.Column("to_status", sa.String(24), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("actor", sa.String(120), nullable=False),
        sa.Column("source", sa.String(80), nullable=False),
        sa.Column("evidence_ref", sa.String(64), nullable=True),
        sa.Column("successor_id", sa.String(48), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("transition_key", name="uq_reusable_asset_lifecycle_transition"),
    )
    for column in ("transition_key", "reusable_asset_id", "to_status", "evidence_ref", "successor_id"):
        op.create_index(
            f"ix_reusable_asset_lifecycle_events_{column}",
            "reusable_asset_lifecycle_events", [column],
        )


def downgrade():
    op.drop_table("reusable_asset_lifecycle_events")
    op.drop_constraint("ck_reusable_asset_lifecycle_status", "reusable_assets", type_="check")
