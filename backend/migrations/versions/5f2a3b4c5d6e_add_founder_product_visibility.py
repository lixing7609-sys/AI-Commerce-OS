"""add Founder product visibility and archive AI Commerce OS experiments

Revision ID: 5f2a3b4c5d6e
Revises: 4e1f2a3b4c5d
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "5f2a3b4c5d6e"
down_revision: Union[str, Sequence[str], None] = "4e1f2a3b4c5d"
branch_labels = None
depends_on = None


HIDDEN_ENTITIES = (
    ("conversation", "conv-be058cd47edb44828887", "AI Commerce OS legacy Goal Revision acceptance"),
    ("conversation", "conv-34b48a55333b4362a224", "AI Commerce OS legacy Goal Confirmation acceptance"),
    ("conversation", "conv-2eaaba2216774eabb3a9", "AI Commerce OS legacy Goal Understanding acceptance"),
    ("conversation", "conv-f8ba37b6b7a447fa8610", "AI Commerce OS legacy Goal Understanding acceptance"),
    ("discussion_package", "package-35a003b58c7c4b9483da", "legacy acceptance package"),
    ("discussion_package", "package-894f798c8e2149ea9675", "superseded golden-path package"),
    ("asset", "object-d6559e402a0f465ea5c4", "superseded golden-path object"),
    ("asset", "object-ed630b0a51d449739630", "superseded golden-path object"),
    ("asset", "decision-9304099b35454b7abe48", "superseded golden-path object"),
    ("asset", "memory-77156d6b747d4884adb8", "superseded golden-path object"),
    ("task_asset", "task-asset-2edb1817e4cf41a6", "cancelled superseded golden-path task"),
    ("memory", "memory-27ece5bd75fc460c91d8", "internal acceptance memory"),
    ("memory", "memory-b820174ea0d64617a580", "internal acceptance memory"),
    ("memory", "memory-551fcf7ae65c450dac98", "duplicate internal acceptance memory"),
    ("memory", "memory-eaa64fb88b034ad6b915", "internal acceptance memory"),
    ("memory", "memory-c4c9c512e3ac4c429c1e", "internal acceptance memory"),
)


def upgrade() -> None:
    op.create_table(
        "founder_product_visibility",
        sa.Column("id", sa.String(length=80), nullable=False),
        sa.Column("surface", sa.String(length=40), nullable=False, server_default="founder"),
        sa.Column("entity_type", sa.String(length=40), nullable=False),
        sa.Column("entity_id", sa.String(length=80), nullable=False),
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("surface", "entity_type", "entity_id", name="uq_founder_product_visibility_entity"),
    )
    op.create_index("ix_founder_product_visibility_entity_type", "founder_product_visibility", ["entity_type"])
    op.create_index("ix_founder_product_visibility_entity_id", "founder_product_visibility", ["entity_id"])

    connection = op.get_bind()
    for index, (entity_type, entity_id, reason) in enumerate(HIDDEN_ENTITIES, start=1):
        connection.execute(sa.text("""
            INSERT INTO founder_product_visibility (id, surface, entity_type, entity_id, hidden, reason)
            VALUES (:id, 'founder', :entity_type, :entity_id, true, :reason)
            ON CONFLICT (surface, entity_type, entity_id) DO NOTHING
        """), {"id": f"founder-visibility-{index:02d}", "entity_type": entity_type, "entity_id": entity_id, "reason": reason})


def downgrade() -> None:
    op.drop_index("ix_founder_product_visibility_entity_id", table_name="founder_product_visibility")
    op.drop_index("ix_founder_product_visibility_entity_type", table_name="founder_product_visibility")
    op.drop_table("founder_product_visibility")
