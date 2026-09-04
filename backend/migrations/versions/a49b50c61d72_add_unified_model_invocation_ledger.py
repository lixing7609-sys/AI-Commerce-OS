"""add unified model invocation ledger and pricing rules

Revision ID: a49b50c61d72
Revises: e48c9d0e1f2a
"""
from alembic import op
import sqlalchemy as sa

revision = "a49b50c61d72"
down_revision = "e48c9d0e1f2a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "model_pricing_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("provider_id", sa.String(80), nullable=False),
        sa.Column("model_id", sa.String(160), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=False),
        sa.Column("input_price_per_1m_tokens", sa.Numeric(18, 8), nullable=False),
        sa.Column("output_price_per_1m_tokens", sa.Numeric(18, 8), nullable=False),
        sa.Column("currency", sa.String(12), nullable=False, server_default="USD"),
        sa.Column("pricing_source", sa.String(120), nullable=False),
        sa.Column("pricing_status", sa.String(24), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("provider_id", "model_id", "effective_from", name="uq_model_pricing_rule_identity"),
    )
    op.create_index("ix_model_pricing_rules_provider_id", "model_pricing_rules", ["provider_id"])
    op.create_table(
        "model_invocations",
        sa.Column("invocation_id", sa.String(48), primary_key=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("provider_id", sa.String(80), nullable=False),
        sa.Column("model_id", sa.String(160), nullable=False),
        sa.Column("conversation_id", sa.String(40), nullable=True),
        sa.Column("council_id", sa.String(40), nullable=True),
        sa.Column("council_model_run_id", sa.String(40), nullable=True),
        sa.Column("assignment_role", sa.String(80), nullable=True),
        sa.Column("invocation_source", sa.String(80), nullable=False, server_default="runtime"),
        sa.Column("runtime_mode", sa.String(24), nullable=False, server_default="default"),
        sa.Column("fallback_from_provider", sa.String(80), nullable=True),
        sa.Column("fallback_from_model", sa.String(160), nullable=True),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("error_code", sa.String(80), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("pricing_rule_id", sa.Integer(), nullable=True),
        sa.Column("estimated_cost", sa.Numeric(18, 8), nullable=True),
        sa.Column("currency", sa.String(12), nullable=True),
    )
    op.create_index("ix_model_invocations_timestamp", "model_invocations", ["timestamp"])
    op.create_index("ix_model_invocations_provider_id", "model_invocations", ["provider_id"])
    op.create_index("ix_model_invocations_conversation_id", "model_invocations", ["conversation_id"])
    op.create_index("ix_model_invocations_council_id", "model_invocations", ["council_id"])


def downgrade():
    op.drop_table("model_invocations")
    op.drop_table("model_pricing_rules")
