"""restore reference Founder projects from durable assets

Revision ID: 2c9d0e1f2a3b
Revises: 1b8c9d0e1f2a
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "2c9d0e1f2a3b"
down_revision: Union[str, Sequence[str], None] = "1b8c9d0e1f2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("""
        INSERT INTO founder_projects (id, system_id, name, description, status, created_at, updated_at)
        SELECT
            asset.id,
            'founder_ai',
            'AI Commerce OS',
            COALESCE(NULLIF(asset.purpose, ''), 'Sino Founder AI 当前系统项目'),
            'active',
            asset.created_at,
            asset.updated_at
        FROM asset_catalog AS asset
        WHERE asset.id = 'project-ai-commerce-os'
          AND asset.asset_type = 'project'
          AND NOT EXISTS (SELECT 1 FROM founder_projects WHERE id = asset.id)
    """))
    connection.execute(sa.text("""
        INSERT INTO founder_projects (id, system_id, name, description, status, created_at, updated_at)
        SELECT
            asset.id,
            'founder_ai',
            'AI短剧生产系统',
            '验证 AI短剧生产的可行性，跑通从创意到成片的全流程',
            'active',
            asset.created_at,
            asset.updated_at
        FROM asset_catalog AS asset
        WHERE asset.id = 'project-2493bf940e8042da8c59'
          AND asset.asset_type = 'project'
          AND NOT EXISTS (SELECT 1 FROM founder_projects WHERE id = asset.id)
    """))


def downgrade() -> None:
    # These IDs are durable Project assets. A downgrade must not delete user-visible
    # Projects that may have gained new work after restoration.
    pass
