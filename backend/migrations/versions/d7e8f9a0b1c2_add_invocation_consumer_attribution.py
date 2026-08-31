"""add invocation consumer attribution

Revision ID: d7e8f9a0b1c2
Revises: c6bd72e83f94
"""
from alembic import op
import sqlalchemy as sa

revision = "d7e8f9a0b1c2"
down_revision = "c6bd72e83f94"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("model_invocations", sa.Column("resource_identity", sa.String(300), nullable=True))
    op.add_column("model_invocations", sa.Column("consumer_type", sa.String(40), nullable=True))
    op.add_column("model_invocations", sa.Column("consumer_role", sa.String(80), nullable=True))
    op.add_column("model_invocations", sa.Column("task_id", sa.String(40), nullable=True))
    op.add_column("model_invocations", sa.Column("execution_id", sa.String(40), nullable=True))
    op.add_column("model_invocations", sa.Column("execution_resource_identity", sa.String(200), nullable=True))
    op.alter_column("model_invocations", "provider_id", existing_type=sa.String(80), nullable=True)
    op.alter_column("model_invocations", "model_id", existing_type=sa.String(160), nullable=True)

    op.create_index("ix_model_invocations_resource_identity", "model_invocations", ["resource_identity"])
    op.create_index("ix_model_invocations_consumer_type", "model_invocations", ["consumer_type"])
    op.create_index("ix_model_invocations_consumer_role", "model_invocations", ["consumer_role"])
    op.create_index("ix_model_invocations_task_id", "model_invocations", ["task_id"])
    op.create_index("ix_model_invocations_execution_id", "model_invocations", ["execution_id"])
    op.create_index("ix_model_invocations_execution_resource_identity", "model_invocations", ["execution_resource_identity"])
    op.create_index("ix_model_invocations_provider_model_timestamp", "model_invocations", ["provider_id", "model_id", "timestamp"])

    op.execute(
        """
        UPDATE model_invocations
        SET resource_identity = provider_id || '::' || model_id
        WHERE provider_id IS NOT NULL
          AND model_id IS NOT NULL
          AND resource_identity IS NULL
        """
    )
    op.execute(
        """
        UPDATE model_invocations
        SET consumer_type = CASE
            WHEN invocation_source = 'model_health_probe' OR assignment_role = 'model_health'
                THEN 'HEALTH_PROBE'
            WHEN invocation_source IN (
                'founder_conversation', 'founder_intent', 'council_participant',
                'council_synthesis', 'vision', 'task_navigation'
            ) OR assignment_role IN (
                'sino_conversation', 'multi_model_discussion', 'vision',
                'founder_intent_engine'
            )
                THEN 'SINO_AI'
            ELSE 'LEGACY_UNKNOWN'
        END
        WHERE consumer_type IS NULL
        """
    )
    op.execute(
        """
        UPDATE model_invocations
        SET consumer_role = CASE
            WHEN invocation_source = 'model_health_probe' OR assignment_role = 'model_health'
                THEN 'MODEL_HEALTH_PROBE'
            WHEN invocation_source = 'founder_intent' OR assignment_role = 'founder_intent_engine'
                THEN 'CANDIDATE_DERIVATION'
            WHEN invocation_source IN ('council_participant', 'council_synthesis')
                 OR assignment_role = 'multi_model_discussion'
                THEN 'DISCUSSION'
            WHEN invocation_source = 'vision' OR assignment_role = 'vision'
                THEN 'VISION'
            WHEN invocation_source = 'task_navigation'
                THEN 'TASK_NAVIGATION'
            WHEN invocation_source = 'founder_conversation' OR assignment_role = 'sino_conversation'
                THEN 'SINO_CONVERSATION'
            ELSE 'LEGACY_UNKNOWN'
        END
        WHERE consumer_role IS NULL
        """
    )


def downgrade():
    op.drop_index("ix_model_invocations_provider_model_timestamp", table_name="model_invocations")
    op.drop_index("ix_model_invocations_execution_resource_identity", table_name="model_invocations")
    op.drop_index("ix_model_invocations_execution_id", table_name="model_invocations")
    op.drop_index("ix_model_invocations_task_id", table_name="model_invocations")
    op.drop_index("ix_model_invocations_consumer_role", table_name="model_invocations")
    op.drop_index("ix_model_invocations_consumer_type", table_name="model_invocations")
    op.drop_index("ix_model_invocations_resource_identity", table_name="model_invocations")
    op.execute(
        """
        UPDATE model_invocations
        SET provider_id = 'executor',
            model_id = COALESCE(NULLIF(regexp_replace(execution_resource_identity, '^executor::', ''), ''), 'unknown')
        WHERE provider_id IS NULL
          AND model_id IS NULL
          AND execution_resource_identity IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE model_invocations
        SET provider_id = 'legacy_unknown'
        WHERE provider_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE model_invocations
        SET model_id = 'legacy_unknown'
        WHERE model_id IS NULL
        """
    )
    op.alter_column("model_invocations", "model_id", existing_type=sa.String(160), nullable=False)
    op.alter_column("model_invocations", "provider_id", existing_type=sa.String(80), nullable=False)
    op.drop_column("model_invocations", "execution_resource_identity")
    op.drop_column("model_invocations", "execution_id")
    op.drop_column("model_invocations", "task_id")
    op.drop_column("model_invocations", "consumer_role")
    op.drop_column("model_invocations", "consumer_type")
    op.drop_column("model_invocations", "resource_identity")
