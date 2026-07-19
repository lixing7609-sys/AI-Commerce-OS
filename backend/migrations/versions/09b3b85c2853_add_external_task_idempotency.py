"""add external task idempotency

Revision ID: 09b3b85c2853
Revises: 4e6409985089
Create Date: 2026-07-19 14:03:10.596546

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '09b3b85c2853'
down_revision: Union[str, Sequence[str], None] = '4e6409985089'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # 新增两个可空字段，不影响任何已有行；PostgreSQL 的唯一约束
    # 默认允许多行 NULL/NULL，因此全部现有内部任务（两字段均为
    # NULL）不受影响，也不会互相冲突。
    op.add_column(
        'tasks',
        sa.Column('external_source', sa.String(length=50), nullable=True),
    )
    op.add_column(
        'tasks',
        sa.Column(
            'external_request_id', sa.String(length=128), nullable=True
        ),
    )
    op.create_unique_constraint(
        'uq_tasks_external_source_request_id',
        'tasks',
        ['external_source', 'external_request_id'],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'uq_tasks_external_source_request_id', 'tasks', type_='unique'
    )
    op.drop_column('tasks', 'external_request_id')
    op.drop_column('tasks', 'external_source')
