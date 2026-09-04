"""add Founder Asset Lifecycle catalog and learning records

Revision ID: ff6a7b8c9d0e
Revises: fe5f6a7b8c9d
"""
from alembic import op
import sqlalchemy as sa

revision = "ff6a7b8c9d0e"
down_revision = "fe5f6a7b8c9d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "asset_catalog",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("asset_type", sa.String(40), nullable=False),
        sa.Column("native_type", sa.String(40), nullable=False),
        sa.Column("native_id", sa.String(48), nullable=False),
        sa.Column("name", sa.String(240), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False, server_default=""),
        sa.Column("content", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("status", sa.String(30), nullable=False, server_default="committed"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source_conversation_id", sa.String(40), nullable=True),
        sa.Column("source_package_id", sa.String(48), nullable=True),
        sa.Column("project_id", sa.String(40), nullable=True),
        sa.Column("dependency_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("used_by_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("execution_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("learning_refs", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("reference_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("legacy_category", sa.String(80), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.UniqueConstraint("native_type", "native_id", name="uq_asset_catalog_native"),
    )
    for column in ("asset_type", "status", "source_conversation_id", "source_package_id", "project_id"):
        op.create_index(f"ix_asset_catalog_{column}", "asset_catalog", [column])
    op.create_table(
        "asset_learnings",
        sa.Column("id", sa.String(48), primary_key=True),
        sa.Column("asset_id", sa.String(48), nullable=False),
        sa.Column("execution_id", sa.String(40), nullable=False),
        sa.Column("outcome", sa.String(40), nullable=False, server_default="no_update"),
        sa.Column("status", sa.String(30), nullable=False, server_default="completed"),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("successful_patterns", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("failure_causes", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("metrics", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("recommendations", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("impact_level", sa.String(20), nullable=False, server_default="low"),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_asset_learnings_asset_id", "asset_learnings", ["asset_id"])
    op.create_index("ix_asset_learnings_execution_id", "asset_learnings", ["execution_id"])

    # Compatibility catalog: preserve native records and identities; do not copy
    # execution results into the official Asset Center.
    op.execute(sa.text("""
        INSERT INTO asset_catalog (id, asset_type, native_type, native_id, name, purpose, content, status, version, source_conversation_id, project_id, dependency_refs, execution_refs, created_at, updated_at)
        SELECT id, object_type, 'founder_object', id, name, description, '{}'::json, 'committed', version, source_conversation_id,
               CASE WHEN scope_key LIKE 'project-%' THEN scope_key ELSE NULL END, dependency_object_ids, execution_refs, created_at, updated_at
        FROM founder_objects WHERE status IN ('approved', 'committed', 'published', 'ready')
        ON CONFLICT (native_type, native_id) DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO asset_catalog (id, asset_type, native_type, native_id, name, purpose, content, status, version, source_conversation_id, created_at, updated_at)
        SELECT id, 'decision', 'decision', id, title, decision, json_build_object('reason', reason, 'impact', impact), 'committed', 1, conversation_id, created_at, updated_at
        FROM decision_assets WHERE confirmed = true AND status NOT IN ('archived', 'invalid')
        ON CONFLICT (native_type, native_id) DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO asset_catalog (id, asset_type, native_type, native_id, name, purpose, content, status, version, project_id, created_at, updated_at)
        SELECT id, 'project', 'project', id, name, COALESCE(description, ''), '{}'::json, 'committed', 1, id, created_at, updated_at
        FROM founder_projects WHERE status IN ('active', 'committed')
        ON CONFLICT (native_type, native_id) DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO asset_catalog (id, asset_type, native_type, native_id, name, purpose, content, status, version, source_conversation_id, created_at, updated_at)
        SELECT id, 'knowledge', 'memory', id, title, COALESCE(summary, ''), json_build_object('memory_type', memory_type), 'committed', revision_number, conversation_id, created_at, updated_at
        FROM memory_assets WHERE memory_type = 'knowledge' AND status IN ('active', 'committed')
        ON CONFLICT (native_type, native_id) DO NOTHING
    """))
    op.execute(sa.text("""
        INSERT INTO asset_catalog (id, asset_type, native_type, native_id, name, purpose, content, status, version, source_conversation_id, legacy_category, created_at, updated_at)
        SELECT id, 'legacy', 'artifact', id, title, COALESCE(description, ''), '{}'::json, 'committed', version, conversation_id, artifact_type, created_at, updated_at
        FROM artifact_assets
        WHERE artifact_type NOT IN ('execution_result','technical_evidence','code_change','test_result','build_result','git_result','deployment_result','commit','log')
        ON CONFLICT (native_type, native_id) DO NOTHING
    """))


def downgrade():
    op.drop_table("asset_learnings")
    op.drop_table("asset_catalog")
