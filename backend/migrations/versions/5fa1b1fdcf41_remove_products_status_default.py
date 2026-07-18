"""remove products status default

Revision ID: 5fa1b1fdcf41
Revises: c2f0c84be41a
Create Date: 2026-07-18 10:48:01.440648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '5fa1b1fdcf41'
down_revision: Union[str, Sequence[str], None] = 'c2f0c84be41a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _get_products_status_column(inspector):
    if 'products' not in inspector.get_table_names():
        return None

    for column in inspector.get_columns('products'):
        if column['name'] == 'status':
            return column

    return None


def upgrade() -> None:
    """Upgrade schema."""

    # products.status 目前带有一个数据库层的 server_default 'draft'，
    # 但 ProductDB model 和 baseline migration 都没有声明它——这是历史上
    # 通过带外（out-of-band）手段直接 ALTER 到数据库的遗留漂移。
    # 这里只移除默认约束本身，不触碰列的类型、nullable 或已有数据。
    bind = op.get_bind()
    inspector = inspect(bind)

    column = _get_products_status_column(inspector)

    if column is None:
        return

    if column.get('default') is None:
        return

    op.alter_column(
        'products',
        'status',
        existing_type=sa.String(length=30),
        existing_nullable=True,
        server_default=None,
    )


def downgrade() -> None:
    """Downgrade schema.

    注意：本 downgrade 只恢复 status 列的 server_default 约束本身，
    不会修改已有行的 status 数值——被 upgrade 之前就是 NULL 或 'draft'
    的行，在 downgrade 之后仍然保持原值不变。
    """

    bind = op.get_bind()
    inspector = inspect(bind)

    column = _get_products_status_column(inspector)

    if column is None:
        return

    if column.get('default') is not None:
        return

    op.alter_column(
        'products',
        'status',
        existing_type=sa.String(length=30),
        existing_nullable=True,
        server_default=sa.text("'draft'"),
    )
