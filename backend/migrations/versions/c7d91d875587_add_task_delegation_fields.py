"""add task delegation fields

Revision ID: c7d91d875587
Revises: 09b3b85c2853
Create Date: 2026-07-20 11:13:17.180772

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d91d875587'
down_revision: Union[str, Sequence[str], None] = '09b3b85c2853'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # 五个新增字段全部可空或带默认值，不影响任何已有行。
    op.add_column(
        'tasks',
        sa.Column('parent_task_id', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'tasks',
        sa.Column('root_task_id', sa.String(length=32), nullable=True),
    )
    op.add_column(
        'tasks',
        sa.Column(
            'delegation_depth',
            sa.Integer(),
            nullable=False,
            server_default='0',
        ),
    )
    op.add_column(
        'tasks',
        sa.Column(
            'created_by_agent', sa.String(length=100), nullable=True
        ),
    )
    op.add_column(
        'tasks',
        sa.Column('delegation_key', sa.String(length=64), nullable=True),
    )

    op.create_index(
        op.f('ix_tasks_parent_task_id'), 'tasks', ['parent_task_id']
    )
    op.create_index(
        op.f('ix_tasks_root_task_id'), 'tasks', ['root_task_id']
    )

    # parent_task_id/delegation_key 只在子任务上同时非空；PostgreSQL
    # 唯一约束允许多行 NULL/NULL 共存（与既有
    # uq_tasks_external_source_request_id 完全相同的既定模式），
    # 因此全部现有任务和全部未来的非委派任务都不受影响。该约束是
    # 防止同一父任务重复执行时重复创建同一条子任务的唯一可靠保障
    # （数据库层面，而不仅是应用层"先查后建"）。
    op.create_unique_constraint(
        'uq_tasks_parent_delegation_key',
        'tasks',
        ['parent_task_id', 'delegation_key'],
    )

    # 回填历史任务：root_task_id 统一等于自身 id，保持"每条任务
    # 都有非空 root_task_id"的不变式，不修改 status/result/error
    # 等任何其它字段，不影响这 154 条历史任务的现有语义。
    op.execute('UPDATE tasks SET root_task_id = id WHERE root_task_id IS NULL')


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_constraint(
        'uq_tasks_parent_delegation_key', 'tasks', type_='unique'
    )
    op.drop_index(op.f('ix_tasks_root_task_id'), table_name='tasks')
    op.drop_index(op.f('ix_tasks_parent_task_id'), table_name='tasks')
    op.drop_column('tasks', 'delegation_key')
    op.drop_column('tasks', 'created_by_agent')
    op.drop_column('tasks', 'delegation_depth')
    op.drop_column('tasks', 'root_task_id')
    op.drop_column('tasks', 'parent_task_id')
