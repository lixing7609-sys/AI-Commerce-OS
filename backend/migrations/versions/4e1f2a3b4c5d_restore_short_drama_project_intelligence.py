"""restore AI short-drama Project Intelligence from its durable history chain

Revision ID: 4e1f2a3b4c5d
Revises: 3d0e1f2a3b4c
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4e1f2a3b4c5d"
down_revision: Union[str, Sequence[str], None] = "3d0e1f2a3b4c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("""
        INSERT INTO project_intelligence (
            project_id,
            project_summary,
            current_positioning,
            master_prompt,
            prompt_version,
            prompt_history,
            prompt_rules,
            constraints,
            terminology,
            skill_refs,
            workflow_refs,
            updated_at
        )
        SELECT
            'project-2493bf940e8042da8c59',
            COALESCE(brain.goal_brief ->> 'summary', ''),
            '',
            '',
            1,
            '[]'::json,
            '[]'::json,
            COALESCE(digest.constraints, '[]'::json),
            '[]'::json,
            '[]'::json,
            '["object-1d516298716e4f29a47f"]'::json,
            brain.updated_at
        FROM sino_brain_sessions AS brain
        JOIN asset_catalog AS project_asset
          ON project_asset.id = 'project-2493bf940e8042da8c59'
         AND project_asset.asset_type = 'project'
         AND project_asset.source_conversation_id = brain.conversation_id
         AND project_asset.source_package_id = 'package-a43ec542d404486f904a'
        LEFT JOIN secretary_digests AS digest
          ON digest.conversation_id = brain.conversation_id
        WHERE brain.conversation_id = 'conv-b436c8a45dd84de79190'
          AND EXISTS (
              SELECT 1
              FROM asset_catalog AS workflow_asset
              WHERE workflow_asset.id = 'object-1d516298716e4f29a47f'
                AND workflow_asset.asset_type = 'workflow'
                AND workflow_asset.source_package_id = project_asset.source_package_id
          )
        ON CONFLICT (project_id) DO NOTHING
    """))

    connection.execute(sa.text("""
        UPDATE conversations
        SET project_id = 'project-2493bf940e8042da8c59'
        WHERE id = 'conv-b436c8a45dd84de79190'
          AND project_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM asset_catalog
              WHERE id = 'project-2493bf940e8042da8c59'
                AND asset_type = 'project'
                AND source_conversation_id = conversations.id
                AND source_package_id = 'package-a43ec542d404486f904a'
          )
    """))


def downgrade() -> None:
    # Recovery is non-destructive because restored Project context may receive new
    # Founder work after migration.
    pass
