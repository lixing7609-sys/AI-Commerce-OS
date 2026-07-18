"""baseline schema

Revision ID: 9b5fd1eb1c5e
Revises: 
Create Date: 2026-07-14 10:13:54.850526

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '9b5fd1eb1c5e'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('products',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('product_code', sa.String(length=50), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('platform', sa.String(length=50), nullable=True),
    sa.Column('price', sa.Numeric(precision=10, scale=2), nullable=True),
    sa.Column('status', sa.String(length=30), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('product_code')
    )
    op.create_index(op.f('ix_products_id'), 'products', ['id'], unique=False)

    op.create_table('stores',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('store_code', sa.String(length=50), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('platform', sa.String(length=50), nullable=False),
    sa.Column('owner', sa.String(length=100), nullable=True),
    sa.Column('status', sa.String(length=30), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('store_code')
    )
    op.create_index(op.f('ix_stores_id'), 'stores', ['id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_stores_id'), table_name='stores')
    op.drop_table('stores')

    op.drop_index(op.f('ix_products_id'), table_name='products')
    op.drop_table('products')
