"""add connector runs table

Revision ID: d9ff6f6dcced
Revises: f3a8c1d29e40
Create Date: 2026-08-01 11:57:36.268779

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd9ff6f6dcced'
down_revision: Union[str, Sequence[str], None] = 'f3a8c1d29e40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 注意：本文件最初由 `alembic revision --autogenerate` 生成，但当时
# migrations/env.py 里 target_metadata 缺少 shops/deliverables/
# token_*/operation_logs 等既有表的 Model 导入，导致 autogenerate
# 把它们全部误判为"需要删除的表"。这里手写只保留新增
# connector_runs 表本身，不改动任何既有表结构。

def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'connector_runs',
        sa.Column('id', sa.String(length=40), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('conversation_id', sa.String(length=64), nullable=False),
        sa.Column('decision_id', sa.String(length=64), nullable=True),
        sa.Column('task_package_id', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('input_summary', sa.Text(), nullable=True),
        sa.Column('output_summary', sa.Text(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('detail', sa.JSON(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_ms', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_connector_runs_conversation_id'), 'connector_runs', ['conversation_id'], unique=False)
    op.create_index(op.f('ix_connector_runs_decision_id'), 'connector_runs', ['decision_id'], unique=False)
    op.create_index(op.f('ix_connector_runs_kind'), 'connector_runs', ['kind'], unique=False)
    op.create_index(op.f('ix_connector_runs_status'), 'connector_runs', ['status'], unique=False)
    op.create_index(op.f('ix_connector_runs_task_package_id'), 'connector_runs', ['task_package_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_connector_runs_task_package_id'), table_name='connector_runs')
    op.drop_index(op.f('ix_connector_runs_status'), table_name='connector_runs')
    op.drop_index(op.f('ix_connector_runs_kind'), table_name='connector_runs')
    op.drop_index(op.f('ix_connector_runs_decision_id'), table_name='connector_runs')
    op.drop_index(op.f('ix_connector_runs_conversation_id'), table_name='connector_runs')
    op.drop_table('connector_runs')
