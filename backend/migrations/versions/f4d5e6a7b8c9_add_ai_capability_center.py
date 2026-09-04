"""add ai capability center

Revision ID: f4d5e6a7b8c9
Revises: f3c4d5e6a7b8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f4d5e6a7b8c9"
down_revision: Union[str, Sequence[str], None] = "f3c4d5e6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("model_provider_configs", sa.Column("provider_type", sa.String(length=40), nullable=False, server_default="openai_compatible"))
    op.add_column("model_provider_configs", sa.Column("available_models", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("model_provider_configs", sa.Column("selected_models", sa.JSON(), nullable=False, server_default="[]"))
    op.execute("UPDATE model_provider_configs SET provider_type = CASE provider_key WHEN 'gpt' THEN 'openai' WHEN 'claude' THEN 'anthropic' ELSE provider_key END")
    op.execute("UPDATE model_provider_configs SET available_models = json_build_array(model), selected_models = json_build_array(model) WHERE model <> ''")
    op.create_table(
        "application_capability_assignments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("application_key", sa.String(length=60), nullable=False),
        sa.Column("capability_key", sa.String(length=60), nullable=False),
        sa.Column("provider_key", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=160), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("application_key", "capability_key", name="uq_application_capability_assignment"),
    )
    op.create_index("ix_application_capability_assignments_application_key", "application_capability_assignments", ["application_key"])


def downgrade() -> None:
    op.drop_index("ix_application_capability_assignments_application_key", table_name="application_capability_assignments")
    op.drop_table("application_capability_assignments")
    op.drop_column("model_provider_configs", "selected_models")
    op.drop_column("model_provider_configs", "available_models")
    op.drop_column("model_provider_configs", "provider_type")
