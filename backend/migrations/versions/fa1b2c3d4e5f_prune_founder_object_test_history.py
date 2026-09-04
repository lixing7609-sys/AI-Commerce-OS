"""prune merged Founder Object test history

Revision ID: fa1b2c3d4e5f
Revises: f9c0d1e2f3a4
"""
from alembic import op
import sqlalchemy as sa

revision = "fa1b2c3d4e5f"
down_revision = "f9c0d1e2f3a4"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    objects = connection.execute(sa.text("select id, execution_refs from founder_objects where object_type='skill' and normalized_name='chromeextensionskill' order by created_at limit 1")).mappings().all()
    if not objects:
        return
    item = objects[0]
    connection.execute(sa.text("delete from founder_object_revisions r where r.object_id=:id and not exists (select 1 from conversations c where c.id=r.source_conversation_id)"), {"id": item["id"]})
    refs = list(item["execution_refs"] or [])[:1]
    statement = sa.text("update founder_objects set execution_refs=:refs where id=:id").bindparams(sa.bindparam("refs", type_=sa.JSON()))
    connection.execute(statement, {"id": item["id"], "refs": refs})


def downgrade():
    pass
