"""restore AI Commerce OS Project Intelligence from its durable council snapshot

Revision ID: 3d0e1f2a3b4c
Revises: 2c9d0e1f2a3b
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "3d0e1f2a3b4c"
down_revision: Union[str, Sequence[str], None] = "2c9d0e1f2a3b"
branch_labels = None
depends_on = None

PROJECT_ID = "project-ai-commerce-os"
COUNCIL_RUN_ID = "council-3c782d3ff02b4f0e81f3"
CONVERSATION_IDS = (
    "conv-f8ba37b6b7a447fa8610",
    "conv-2eaaba2216774eabb3a9",
    "conv-34b48a55333b4362a224",
    "conv-be058cd47edb44828887",
)


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
            'project-ai-commerce-os',
            COALESCE(context_package ->> 'project_summary', ''),
            COALESCE(context_package ->> 'current_position', ''),
            COALESCE(context_package ->> 'living_prompt', ''),
            COALESCE((context_package ->> 'prompt_version')::integer, 1),
            '[]'::json,
            '[]'::json,
            COALESCE(context_package -> 'constraints', '[]'::json),
            COALESCE(context_package -> 'terminology', '[]'::json),
            '[]'::json,
            '[]'::json,
            created_at
        FROM council_runs
        WHERE id = 'council-3c782d3ff02b4f0e81f3'
          AND project_id = 'project-ai-commerce-os'
        ON CONFLICT (project_id) DO NOTHING
    """))

    connection.execute(sa.text("""
        UPDATE conversations
        SET project_id = 'project-ai-commerce-os'
        WHERE id IN (
            'conv-f8ba37b6b7a447fa8610',
            'conv-2eaaba2216774eabb3a9',
            'conv-34b48a55333b4362a224',
            'conv-be058cd47edb44828887'
        )
          AND project_id IS NULL
          AND EXISTS (
              SELECT 1
              FROM sino_brain_sessions
              WHERE sino_brain_sessions.conversation_id = conversations.id
                AND sino_brain_sessions.project_id = 'project-ai-commerce-os'
          )
    """))


def downgrade() -> None:
    # Recovery is intentionally non-destructive. Restored Project Intelligence and
    # Conversation ownership may receive new Founder work after this migration.
    pass
