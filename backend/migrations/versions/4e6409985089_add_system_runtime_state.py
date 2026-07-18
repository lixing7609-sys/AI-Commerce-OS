"""add system runtime state

Revision ID: 4e6409985089
Revises: 5fa1b1fdcf41
Create Date: 2026-07-18 12:05:16.741360

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4e6409985089'
down_revision: Union[str, Sequence[str], None] = '5fa1b1fdcf41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'system_runtime_state',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('desired_state', sa.String(length=20), nullable=False),
        sa.Column('actual_state', sa.String(length=20), nullable=False),
        sa.Column('auto_resume_enabled', sa.Boolean(), nullable=False),
        sa.Column('last_started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_stopped_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_heartbeat_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_shutdown_type', sa.String(length=20), nullable=False),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('recovery_failure_count', sa.Integer(), nullable=False),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "desired_state IN ('running', 'stopped')",
            name='ck_system_runtime_state_desired_state',
        ),
        sa.CheckConstraint(
            "actual_state IN ('starting', 'running', 'stopping', 'stopped', 'error')",
            name='ck_system_runtime_state_actual_state',
        ),
        sa.CheckConstraint(
            "last_shutdown_type IN ('graceful', 'unexpected', 'unknown')",
            name='ck_system_runtime_state_last_shutdown_type',
        ),
    )

    op.execute(
        "INSERT INTO system_runtime_state "
        "(id, desired_state, actual_state, auto_resume_enabled, "
        "last_shutdown_type, recovery_failure_count) "
        "VALUES (1, 'stopped', 'stopped', false, 'unknown', 0)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('system_runtime_state')
