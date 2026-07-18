"""remove products created_at

Revision ID: c2f0c84be41a
Revises: a3c5b35665c7
Create Date: 2026-07-18 10:34:38.399188

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = 'c2f0c84be41a'
down_revision: Union[str, Sequence[str], None] = 'a3c5b35665c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # products.created_at 是历史遗留字段：不在 ProductDB model 中声明，
    # 项目全局也没有任何代码读取或写入它（详见迁移审计记录）。
    # 这里先探测表和列是否存在，避免在裸库（该列本就不存在）上执行时报错。
    bind = op.get_bind()
    inspector = inspect(bind)

    if 'products' not in inspector.get_table_names():
        return

    columns = [col['name'] for col in inspector.get_columns('products')]

    if 'created_at' not in columns:
        return

    op.drop_column('products', 'created_at')


def downgrade() -> None:
    """Downgrade schema.

    注意：本 downgrade 只能恢复 created_at 字段的结构
    （类型、nullable、server_default），无法恢复 upgrade 之前
    各行原有的历史时间戳数值——这些具体数值在 drop_column 时
    已被物理删除，恢复后的列对已有行会是 NULL，仅对之后新插入的
    行按 server_default 生效。
    """

    bind = op.get_bind()
    inspector = inspect(bind)

    if 'products' not in inspector.get_table_names():
        return

    columns = [col['name'] for col in inspector.get_columns('products')]

    if 'created_at' in columns:
        return

    op.add_column(
        'products',
        sa.Column(
            'created_at',
            sa.DateTime(),
            nullable=True,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
    )
