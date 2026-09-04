"""merge semantic Founder Objects and remove persisted test fixtures

Revision ID: f9c0d1e2f3a4
Revises: f8b9c0d1e2f3
"""
from alembic import op
import sqlalchemy as sa

revision = "f9c0d1e2f3a4"
down_revision = "f8b9c0d1e2f3"
branch_labels = None
depends_on = None


def _merge_unique(*values):
    result = []
    for value in values:
        for item in value or []:
            if item not in result:
                result.append(item)
    return result


def upgrade():
    connection = op.get_bind()
    objects = connection.execute(sa.text("select * from founder_objects order by created_at, id")).mappings().all()
    groups = {}
    for item in objects:
        groups.setdefault((item["object_type"], item["normalized_name"]), []).append(item)
    list_fields = ("source_message_refs", "child_object_ids", "dependency_object_ids", "related_object_ids", "execution_refs", "artifact_refs", "memory_refs", "decision_refs", "knowledge_refs")
    for _identity, records in groups.items():
        if len(records) < 2:
            continue
        canonical, duplicates = records[0], records[1:]
        merged = {field: _merge_unique(*(record[field] for record in records)) for field in list_fields}
        max_version = max(record["version"] for record in records)
        for duplicate in duplicates:
            connection.execute(sa.text("update founder_object_revisions set object_id=:canonical where object_id=:duplicate"), {"canonical": canonical["id"], "duplicate": duplicate["id"]})
            connection.execute(sa.text("update conversation_object_contexts set object_id=:canonical where object_id=:duplicate"), {"canonical": canonical["id"], "duplicate": duplicate["id"]})
            connection.execute(sa.text("delete from founder_objects where id=:id"), {"id": duplicate["id"]})
        statement = sa.text("""update founder_objects set scope_key='founder_ai', version=:version, status=:status, source_conversation_id=:source, source_message_refs=:source_message_refs, child_object_ids=:child_object_ids, dependency_object_ids=:dependency_object_ids, related_object_ids=:related_object_ids, execution_refs=:execution_refs, artifact_refs=:artifact_refs, memory_refs=:memory_refs, decision_refs=:decision_refs, knowledge_refs=:knowledge_refs where id=:id""").bindparams(*[sa.bindparam(field, type_=sa.JSON()) for field in list_fields])
        connection.execute(statement, {"id": canonical["id"], "version": max_version, "status": "approved" if any(r["status"] == "approved" for r in records) else canonical["status"], "source": canonical["source_conversation_id"], **merged})
    connection.execute(sa.text("delete from founder_projects where name in ('Binding Test', 'Object Native Test')"))
    connection.execute(sa.text("delete from conversations where title in ('Binding', 'Object Native Test', 'Founder Conversation Test', 'Read Test')"))


def downgrade():
    pass
