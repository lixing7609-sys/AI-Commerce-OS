"""reconcile Asset Lifecycle provenance and legacy knowledge

Revision ID: 0a7b8c9d0e1f
Revises: ff6a7b8c9d0e
"""
from alembic import op
import sqlalchemy as sa

revision = "0a7b8c9d0e1f"
down_revision = "ff6a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade():
    # A package item is the authoritative provenance for an Asset Commit.
    op.execute(sa.text("""
        UPDATE asset_catalog AS asset
        SET source_package_id = brain.discussion_package ->> 'package_id',
            source_conversation_id = brain.conversation_id
        FROM sino_brain_sessions AS brain,
             LATERAL jsonb_array_elements(COALESCE((brain.discussion_package::jsonb -> 'asset_commit' -> 'items'), '[]'::jsonb)) AS item
        WHERE item ->> 'asset_id' = asset.id
          AND brain.discussion_package::jsonb -> 'asset_commit' ->> 'status' = 'committed'
    """))
    # Historical Memory was never package-approved. Keep it as compatibility
    # data, but remove it from the primary formal Asset taxonomy.
    op.execute(sa.text("""
        UPDATE asset_catalog AS asset
        SET asset_type = 'legacy', legacy_category = 'memory'
        FROM memory_assets AS memory
        WHERE asset.native_type = 'memory' AND asset.native_id = memory.id
          AND NOT (
            memory.status = 'committed'
            AND COALESCE(memory.tags::jsonb, '[]'::jsonb) ? 'discussion_package'
          )
    """))


def downgrade():
    op.execute(sa.text("""
        UPDATE asset_catalog SET asset_type = 'knowledge', legacy_category = NULL
        WHERE native_type = 'memory' AND legacy_category = 'memory'
    """))
