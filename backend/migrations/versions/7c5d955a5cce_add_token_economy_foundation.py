"""add token economy foundation (Phase 1A)

Revision ID: 7c5d955a5cce
Revises: c7d91d875587
Create Date: 2026-07-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7c5d955a5cce'
down_revision: Union[str, Sequence[str], None] = 'c7d91d875587'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    op.create_table(
        'token_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('owner_scope_type', sa.String(length=30), nullable=False),
        sa.Column('owner_scope_id', sa.String(length=100), nullable=False),
        sa.Column(
            'status',
            sa.String(length=20),
            server_default='active',
            nullable=False,
        ),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "owner_scope_type IN ('installation')",
            name='ck_token_accounts_owner_scope_type',
        ),
        sa.CheckConstraint(
            "status IN ('active','closed')",
            name='ck_token_accounts_status',
        ),
        sa.UniqueConstraint(
            'owner_scope_type',
            'owner_scope_id',
            name='uq_token_accounts_owner_scope',
        ),
    )
    op.create_index(
        op.f('ix_token_accounts_owner_scope_type'),
        'token_accounts',
        ['owner_scope_type'],
    )
    op.create_index(
        op.f('ix_token_accounts_owner_scope_id'),
        'token_accounts',
        ['owner_scope_id'],
    )

    op.create_table(
        'token_account_projections',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_account_id', sa.Integer(), nullable=False),
        sa.Column(
            'available_balance',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
        sa.Column(
            'reserved_balance',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
        sa.Column(
            'projection_version',
            sa.Integer(),
            server_default='0',
            nullable=False,
        ),
        sa.Column('last_ledger_entry_id', sa.BigInteger(), nullable=True),
        sa.Column(
            'last_reconciled_at', sa.DateTime(timezone=True), nullable=True
        ),
        sa.Column(
            'last_discrepancy_found_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'token_account_id',
            name='uq_token_account_projections_account',
        ),
    )
    op.create_index(
        op.f('ix_token_account_projections_token_account_id'),
        'token_account_projections',
        ['token_account_id'],
    )

    op.create_table(
        'token_ledger_entries',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('token_account_id', sa.Integer(), nullable=False),
        sa.Column('entry_type', sa.String(length=30), nullable=False),
        sa.Column('available_delta', sa.Integer(), nullable=False),
        sa.Column('reserved_delta', sa.Integer(), nullable=False),
        sa.Column('lot_id', sa.Integer(), nullable=True),
        sa.Column('lot_delta', sa.Integer(), nullable=False),
        sa.Column('reference_type', sa.String(length=40), nullable=False),
        sa.Column('reference_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "entry_type IN ('grant_credit','manual_adjustment')",
            name='ck_token_ledger_entries_entry_type',
        ),
        sa.UniqueConstraint(
            'reference_type',
            'reference_id',
            name='uq_token_ledger_entries_reference',
        ),
    )
    op.create_index(
        op.f('ix_token_ledger_entries_token_account_id'),
        'token_ledger_entries',
        ['token_account_id'],
    )
    op.create_index(
        op.f('ix_token_ledger_entries_entry_type'),
        'token_ledger_entries',
        ['entry_type'],
    )
    op.create_index(
        op.f('ix_token_ledger_entries_lot_id'),
        'token_ledger_entries',
        ['lot_id'],
    )

    op.create_table(
        'token_lots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_account_id', sa.Integer(), nullable=False),
        sa.Column('source_type', sa.String(length=30), nullable=False),
        sa.Column('source_reference_type', sa.String(length=40), nullable=False),
        sa.Column('source_reference_id', sa.Integer(), nullable=False),
        sa.Column('original_amount', sa.Integer(), nullable=False),
        sa.Column('remaining_amount', sa.Integer(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            'issued_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "source_type IN ('promotional','compensation','manually_granted')",
            name='ck_token_lots_source_type',
        ),
    )
    op.create_index(
        op.f('ix_token_lots_token_account_id'), 'token_lots', ['token_account_id']
    )
    op.create_index(
        op.f('ix_token_lots_source_type'), 'token_lots', ['source_type']
    )

    op.create_table(
        'token_grants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_account_id', sa.Integer(), nullable=False),
        sa.Column('source_type', sa.String(length=30), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('grant_reference', sa.String(length=128), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('actor', sa.String(length=100), nullable=False),
        sa.Column('operation_log_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'token_account_id',
            'grant_reference',
            name='uq_token_grants_account_reference',
        ),
    )
    op.create_index(
        op.f('ix_token_grants_token_account_id'),
        'token_grants',
        ['token_account_id'],
    )
    op.create_index(
        op.f('ix_token_grants_operation_log_id'),
        'token_grants',
        ['operation_log_id'],
    )

    op.create_table(
        'token_adjustments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('token_account_id', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Integer(), nullable=False),
        sa.Column('adjustment_reference', sa.String(length=128), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('actor', sa.String(length=100), nullable=False),
        sa.Column('operation_log_id', sa.Integer(), nullable=False),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'token_account_id',
            'adjustment_reference',
            name='uq_token_adjustments_account_reference',
        ),
    )
    op.create_index(
        op.f('ix_token_adjustments_token_account_id'),
        'token_adjustments',
        ['token_account_id'],
    )
    op.create_index(
        op.f('ix_token_adjustments_operation_log_id'),
        'token_adjustments',
        ['operation_log_id'],
    )

    op.create_table(
        'operation_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('domain', sa.String(length=40), nullable=False),
        sa.Column('entity_type', sa.String(length=60), nullable=False),
        sa.Column('entity_id', sa.String(length=60), nullable=False),
        sa.Column('action', sa.String(length=60), nullable=False),
        sa.Column('owner_scope_type', sa.String(length=30), nullable=True),
        sa.Column('owner_scope_id', sa.String(length=100), nullable=True),
        sa.Column('actor_type', sa.String(length=30), nullable=False),
        sa.Column('actor_id', sa.String(length=100), nullable=True),
        sa.Column('reason_code', sa.String(length=60), nullable=True),
        sa.Column('reason_text', sa.Text(), nullable=True),
        sa.Column('reference_ids', sa.JSON(), nullable=True),
        sa.Column('metadata_json', sa.JSON(), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_operation_logs_domain'), 'operation_logs', ['domain']
    )
    op.create_index(
        'ix_operation_logs_domain_entity',
        'operation_logs',
        ['domain', 'entity_type', 'entity_id'],
    )
    op.create_index(
        'ix_operation_logs_owner_scope',
        'operation_logs',
        ['owner_scope_type', 'owner_scope_id'],
    )

    op.create_table(
        'provider_cost_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('version', sa.String(length=60), nullable=False),
        sa.Column('provider', sa.String(length=60), nullable=False),
        sa.Column('model_or_service', sa.String(length=100), nullable=False),
        sa.Column('unit_type', sa.String(length=40), nullable=False),
        sa.Column('provider_currency', sa.String(length=10), nullable=False),
        sa.Column('provider_unit_cost', sa.Numeric(18, 8), nullable=False),
        sa.Column('effective_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('effective_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source_reference', sa.String(length=255), nullable=False),
        sa.Column('estimation_status', sa.String(length=20), nullable=False),
        sa.Column('published_by', sa.String(length=100), nullable=False),
        sa.Column('operation_log_id', sa.Integer(), nullable=False),
        sa.Column(
            'published_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "estimation_status IN ('reported','estimated')",
            name='ck_provider_cost_snapshots_estimation_status',
        ),
        sa.UniqueConstraint('version'),
    )
    op.create_index(
        op.f('ix_provider_cost_snapshots_provider'),
        'provider_cost_snapshots',
        ['provider'],
    )
    op.create_index(
        op.f('ix_provider_cost_snapshots_model_or_service'),
        'provider_cost_snapshots',
        ['model_or_service'],
    )
    op.create_index(
        op.f('ix_provider_cost_snapshots_operation_log_id'),
        'provider_cost_snapshots',
        ['operation_log_id'],
    )

    op.create_table(
        'token_pricing_snapshots',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('version', sa.String(length=60), nullable=False),
        sa.Column('provider', sa.String(length=60), nullable=True),
        sa.Column('model_or_service', sa.String(length=100), nullable=True),
        sa.Column('usage_unit_mapping', sa.JSON(), nullable=False),
        sa.Column('token_charge_rule', sa.JSON(), nullable=False),
        sa.Column('effective_from', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_by', sa.String(length=100), nullable=False),
        sa.Column('operation_log_id', sa.Integer(), nullable=False),
        sa.Column(
            'published_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('CURRENT_TIMESTAMP'),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('version'),
    )
    op.create_index(
        op.f('ix_token_pricing_snapshots_provider'),
        'token_pricing_snapshots',
        ['provider'],
    )
    op.create_index(
        op.f('ix_token_pricing_snapshots_model_or_service'),
        'token_pricing_snapshots',
        ['model_or_service'],
    )
    op.create_index(
        op.f('ix_token_pricing_snapshots_operation_log_id'),
        'token_pricing_snapshots',
        ['operation_log_id'],
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_table('token_pricing_snapshots')
    op.drop_table('provider_cost_snapshots')
    op.drop_table('operation_logs')
    op.drop_table('token_adjustments')
    op.drop_table('token_grants')
    op.drop_table('token_lots')
    op.drop_table('token_ledger_entries')
    op.drop_table('token_account_projections')
    op.drop_table('token_accounts')
