"""add shops and deliverables (stage 8E)

Revision ID: f3a8c1d29e40
Revises: c7d91d875587
Create Date: 2026-07-21 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f3a8c1d29e40'
down_revision: Union[str, Sequence[str], None] = '7c5d955a5cce'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SHOP_PLATFORMS = (
    "douyin", "kuaishou", "taobao", "tmall", "jd", "pinduoduo",
    "xiaohongshu", "wechat_shop", "amazon", "shopee", "other",
)
SHOP_STATUSES = ("active", "disabled", "archived")
SHOP_CONNECTION_STATUSES = (
    "not_configured", "configured", "testing", "connected", "expired", "error",
)
SHOP_AUTH_TYPES = ("none", "manual", "oauth")
SHOP_CREDENTIAL_TYPES = (
    "app_key", "app_secret", "access_token", "refresh_token", "merchant_id",
    "seller_id", "client_id", "client_secret", "webhook_secret", "other",
)
DELIVERABLE_TYPES = (
    "ceo_analysis", "sales_analysis", "product_analysis", "general_result",
)
DELIVERABLE_STATUSES = (
    "draft", "pending_review", "approved", "rejected",
    "converted_to_task", "archived",
)


def upgrade() -> None:
    """Upgrade schema."""

    # ------------------------------------------------------------------
    # shops
    # ------------------------------------------------------------------
    op.create_table(
        'shops',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shop_code', sa.String(length=40), nullable=False),
        sa.Column('platform', sa.String(length=30), nullable=False),
        sa.Column('shop_name', sa.String(length=255), nullable=False),
        sa.Column('platform_shop_id', sa.String(length=255), nullable=True),
        sa.Column('legal_entity_name', sa.String(length=255), nullable=True),
        sa.Column('region', sa.String(length=100), nullable=True),
        sa.Column('currency', sa.String(length=10), nullable=True),
        sa.Column('timezone', sa.String(length=50), nullable=True),
        sa.Column(
            'status', sa.String(length=20), nullable=False,
            server_default='active',
        ),
        sa.Column(
            'connection_status', sa.String(length=20), nullable=False,
            server_default='not_configured',
        ),
        sa.Column(
            'auth_type', sa.String(length=20), nullable=False,
            server_default='none',
        ),
        sa.Column('token_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_connection_test_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_connection_test_status', sa.String(length=30), nullable=True),
        sa.Column('last_sync_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('shop_code', name='uq_shops_shop_code'),
        sa.UniqueConstraint(
            'platform', 'platform_shop_id',
            name='uq_shops_platform_platform_shop_id',
        ),
        sa.CheckConstraint(
            "platform IN ('" + "','".join(SHOP_PLATFORMS) + "')",
            name='ck_shops_platform',
        ),
        sa.CheckConstraint(
            "status IN ('" + "','".join(SHOP_STATUSES) + "')",
            name='ck_shops_status',
        ),
        sa.CheckConstraint(
            "connection_status IN ('" + "','".join(SHOP_CONNECTION_STATUSES) + "')",
            name='ck_shops_connection_status',
        ),
        sa.CheckConstraint(
            "auth_type IN ('" + "','".join(SHOP_AUTH_TYPES) + "')",
            name='ck_shops_auth_type',
        ),
    )
    op.create_index(op.f('ix_shops_shop_code'), 'shops', ['shop_code'])
    op.create_index(op.f('ix_shops_platform'), 'shops', ['platform'])

    # ------------------------------------------------------------------
    # shop_credentials
    # ------------------------------------------------------------------
    op.create_table(
        'shop_credentials',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('shop_id', sa.Integer(), nullable=False),
        sa.Column('credential_type', sa.String(length=30), nullable=False),
        sa.Column('encrypted_value', sa.Text(), nullable=True),
        sa.Column('value_mask', sa.String(length=50), nullable=True),
        sa.Column(
            'configured', sa.Boolean(), nullable=False,
            server_default=sa.false(),
        ),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['shop_id'], ['shops.id'],
            name='fk_shop_credentials_shop_id',
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint(
            'shop_id', 'credential_type',
            name='uq_shop_credentials_shop_id_credential_type',
        ),
        sa.CheckConstraint(
            "credential_type IN ('" + "','".join(SHOP_CREDENTIAL_TYPES) + "')",
            name='ck_shop_credentials_credential_type',
        ),
    )
    op.create_index(
        op.f('ix_shop_credentials_shop_id'), 'shop_credentials', ['shop_id']
    )

    # ------------------------------------------------------------------
    # tasks.shop_id / tasks.source_deliverable_id
    # ------------------------------------------------------------------
    # 两列均可空，不回填虚假店铺/成果，既有 154 条历史任务不受影响。
    op.add_column('tasks', sa.Column('shop_id', sa.Integer(), nullable=True))
    op.add_column(
        'tasks', sa.Column('source_deliverable_id', sa.Integer(), nullable=True)
    )
    op.create_index(op.f('ix_tasks_shop_id'), 'tasks', ['shop_id'])
    op.create_index(
        op.f('ix_tasks_source_deliverable_id'), 'tasks', ['source_deliverable_id']
    )
    op.create_foreign_key(
        'fk_tasks_shop_id', 'tasks', 'shops', ['shop_id'], ['id'],
        ondelete='SET NULL',
    )

    # ------------------------------------------------------------------
    # deliverables
    # ------------------------------------------------------------------
    op.create_table(
        'deliverables',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deliverable_code', sa.String(length=40), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('deliverable_type', sa.String(length=30), nullable=False),
        sa.Column(
            'status', sa.String(length=30), nullable=False,
            server_default='pending_review',
        ),
        sa.Column('source_task_id', sa.String(length=32), nullable=False),
        sa.Column('root_task_id', sa.String(length=32), nullable=False),
        sa.Column('parent_task_id', sa.String(length=32), nullable=True),
        sa.Column('shop_id', sa.Integer(), nullable=True),
        sa.Column('agent_name', sa.String(length=100), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column(
            'current_version', sa.Integer(), nullable=False, server_default='1'
        ),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejected_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['source_task_id'], ['tasks.id'],
            name='fk_deliverables_source_task_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['shop_id'], ['shops.id'],
            name='fk_deliverables_shop_id',
            ondelete='SET NULL',
        ),
        sa.UniqueConstraint(
            'deliverable_code', name='uq_deliverables_deliverable_code'
        ),
        sa.UniqueConstraint(
            'source_task_id', name='uq_deliverables_source_task_id'
        ),
        sa.CheckConstraint(
            "deliverable_type IN ('" + "','".join(DELIVERABLE_TYPES) + "')",
            name='ck_deliverables_deliverable_type',
        ),
        sa.CheckConstraint(
            "status IN ('" + "','".join(DELIVERABLE_STATUSES) + "')",
            name='ck_deliverables_status',
        ),
    )
    op.create_index(
        op.f('ix_deliverables_deliverable_code'), 'deliverables', ['deliverable_code']
    )
    op.create_index(
        op.f('ix_deliverables_deliverable_type'), 'deliverables', ['deliverable_type']
    )
    op.create_index(op.f('ix_deliverables_status'), 'deliverables', ['status'])
    op.create_index(
        op.f('ix_deliverables_source_task_id'), 'deliverables', ['source_task_id']
    )
    op.create_index(
        op.f('ix_deliverables_root_task_id'), 'deliverables', ['root_task_id']
    )
    op.create_index(op.f('ix_deliverables_shop_id'), 'deliverables', ['shop_id'])
    op.create_index(
        op.f('ix_deliverables_agent_name'), 'deliverables', ['agent_name']
    )

    op.create_foreign_key(
        'fk_tasks_source_deliverable_id',
        'tasks',
        'deliverables',
        ['source_deliverable_id'],
        ['id'],
        ondelete='SET NULL',
    )

    # ------------------------------------------------------------------
    # deliverable_versions
    # ------------------------------------------------------------------
    op.create_table(
        'deliverable_versions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('deliverable_id', sa.Integer(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column(
            'format', sa.String(length=20), nullable=False,
            server_default='structured',
        ),
        sa.Column('content', sa.Text(), nullable=False, server_default=''),
        sa.Column('structured_content', sa.JSON(), nullable=False),
        sa.Column(
            'created_at', sa.DateTime(timezone=True), nullable=False,
            server_default=sa.text('CURRENT_TIMESTAMP'),
        ),
        sa.Column(
            'created_by', sa.String(length=50), nullable=False,
            server_default='system',
        ),
        sa.Column('source_task_id', sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['deliverable_id'], ['deliverables.id'],
            name='fk_deliverable_versions_deliverable_id',
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint(
            'deliverable_id', 'version_number',
            name='uq_deliverable_versions_deliverable_id_version_number',
        ),
    )
    op.create_index(
        op.f('ix_deliverable_versions_deliverable_id'),
        'deliverable_versions',
        ['deliverable_id'],
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_index(
        op.f('ix_deliverable_versions_deliverable_id'),
        table_name='deliverable_versions',
    )
    op.drop_table('deliverable_versions')

    op.drop_constraint(
        'fk_tasks_source_deliverable_id', 'tasks', type_='foreignkey'
    )

    op.drop_index(op.f('ix_deliverables_agent_name'), table_name='deliverables')
    op.drop_index(op.f('ix_deliverables_shop_id'), table_name='deliverables')
    op.drop_index(op.f('ix_deliverables_root_task_id'), table_name='deliverables')
    op.drop_index(op.f('ix_deliverables_source_task_id'), table_name='deliverables')
    op.drop_index(op.f('ix_deliverables_status'), table_name='deliverables')
    op.drop_index(op.f('ix_deliverables_deliverable_type'), table_name='deliverables')
    op.drop_index(
        op.f('ix_deliverables_deliverable_code'), table_name='deliverables'
    )
    op.drop_table('deliverables')

    op.drop_constraint('fk_tasks_shop_id', 'tasks', type_='foreignkey')
    op.drop_index(op.f('ix_tasks_source_deliverable_id'), table_name='tasks')
    op.drop_index(op.f('ix_tasks_shop_id'), table_name='tasks')
    op.drop_column('tasks', 'source_deliverable_id')
    op.drop_column('tasks', 'shop_id')

    op.drop_index(
        op.f('ix_shop_credentials_shop_id'), table_name='shop_credentials'
    )
    op.drop_table('shop_credentials')

    op.drop_index(op.f('ix_shops_platform'), table_name='shops')
    op.drop_index(op.f('ix_shops_shop_code'), table_name='shops')
    op.drop_table('shops')
