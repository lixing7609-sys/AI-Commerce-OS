"""Create a clean Founder business-data baseline without removing system configuration."""
from __future__ import annotations

import base64
import gzip
import json
import shutil
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import inspect, text

from app.database.db import engine
from app.founder_ai.execution_registry import (
    clear_execution_registry_runtime,
    finalize_execution_registry_cleanup,
    list_execution_sessions,
    restore_execution_registry_cleanup,
)
from app.founder_ai.execution_worker import execution_queue


REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
BACKUP_ROOT = REPOSITORY_ROOT / ".runtime" / "backups"
ATTACHMENT_ROOT = REPOSITORY_ROOT / ".runtime" / "founder-attachments"

# These rows configure the system itself.  They are deliberately not reset.
SYSTEM_TABLES = frozenset({
    "ai_capability_configs",
    "alembic_version",
    "application_capability_assignments",
    "application_systems",
    "model_provider_configs",
    "model_registry",
    "model_role_assignments",
    "runtime_environment_registries",
    "shop_credentials",
    "shops",
    "system_runtime_state",
    "token_account_projections",
    "token_accounts",
    "token_adjustments",
    "token_grants",
    "token_ledger_entries",
    "token_lots",
    "token_pricing_snapshots",
})

# All persisted Founder/business/runtime records.  Domain shells are code-backed,
# so deleting asset_catalog removes capability contents but not the taxonomy.
BUSINESS_TABLES = (
    "deliverable_versions",
    "deliverables",
    "operation_logs",
    "orders",
    "inventories",
    "listings",
    "stores",
    "suppliers",
    "products",
    "provider_cost_snapshots",
    "tasks",
    "asset_learnings",
    "asset_catalog",
    "founder_product_visibility",
    "intelligence_evolution_feedback",
    "intelligence_evolution_upgrade_requests",
    "intelligence_evolution_versions",
    "conversation_object_contexts",
    "conversation_candidate_contexts",
    "founder_object_revisions",
    "founder_object_candidates",
    "founder_intent_runs",
    "founder_objects",
    "intelligence_references",
    "artifact_assets",
    "memory_assets",
    "decision_assets",
    "founder_drafts",
    "project_intelligence",
    "execution_deltas",
    "goal_assets",
    "pending_questions",
    "candidate_goals",
    "council_model_runs",
    "council_runs",
    "secretary_digests",
    "conversation_attachments",
    "conversation_contexts",
    "conversation_messages",
    "sino_brain_sessions",
    "task_assets",
    "conversations",
)

PROJECT_SHELLS = {
    "project-ai-commerce-os": "AI Commerce OS",
    "project-ce71485a84d9472b85b4": "Sino Operator AI",
    "project-3f2d0ac6eb5e4ba79f28": "Sino Studio AI",
    "project-2493bf940e8042da8c59": "AI短剧生产系统",
}
PROJECT_SHELL_NAMES = frozenset(name.lower() for name in PROJECT_SHELLS.values())


def _json_value(value):
    if isinstance(value, (datetime, date)):
        return {"$type": "datetime", "value": value.isoformat()}
    if isinstance(value, Decimal):
        return {"$type": "decimal", "value": str(value)}
    if isinstance(value, UUID):
        return {"$type": "uuid", "value": str(value)}
    if isinstance(value, bytes):
        return {"$type": "bytes", "value": base64.b64encode(value).decode("ascii")}
    raise TypeError(f"Unsupported backup value: {type(value).__name__}")


def create_business_data_backup() -> dict:
    """Back up every database table plus attachment files before destructive reset."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = BACKUP_ROOT / f"founder-business-data-{stamp}"
    target.mkdir(parents=True, mode=0o700)
    database_path = target / "database.json.gz"
    table_counts = {}
    inspector = inspect(engine)
    with engine.connect() as connection, gzip.open(database_path, "wt", encoding="utf-8") as stream:
        stream.write('{"format":"sino-founder-logical-backup-v1","tables":{')
        for index, table_name in enumerate(sorted(inspector.get_table_names())):
            rows = [dict(row) for row in connection.execute(text(f'SELECT * FROM "{table_name}"')).mappings()]
            table_counts[table_name] = len(rows)
            if index:
                stream.write(",")
            stream.write(json.dumps(table_name))
            stream.write(":")
            stream.write(json.dumps(rows, ensure_ascii=False, default=_json_value))
        stream.write('},"table_counts":')
        stream.write(json.dumps(table_counts, sort_keys=True))
        stream.write("}")
    database_path.chmod(0o600)
    attachment_backup = None
    if ATTACHMENT_ROOT.exists() and any(ATTACHMENT_ROOT.iterdir()):
        attachment_backup = target / "founder-attachments"
        shutil.copytree(ATTACHMENT_ROOT, attachment_backup)
    manifest = target / "manifest.json"
    manifest.write_text(json.dumps({
        "created_at": datetime.now(timezone.utc).isoformat(),
        "database": database_path.name,
        "attachments": attachment_backup.name if attachment_backup else None,
        "table_counts": table_counts,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    manifest.chmod(0o600)
    return {"backup_path": str(target), "table_counts": table_counts}


def _ensure_project_shells(connection) -> list[str]:
    for project_id, name in PROJECT_SHELLS.items():
        connection.execute(text("""
            INSERT INTO founder_projects
              (id, system_id, name, project_type, initial_scope, status, created_at, updated_at)
            VALUES (:id, 'founder_ai', :name, 'project', '[]'::json, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, system_id = 'founder_ai',
              description = NULL, parent_project_id = NULL, project_type = 'project',
              architecture_role = NULL, source_conversation_id = NULL,
              source_work_item_id = NULL, source_proposal_id = NULL,
              initial_positioning = NULL, initial_scope = '[]'::json,
              creation_reason = NULL, status = 'active', updated_at = CURRENT_TIMESTAMP
        """), {"id": project_id, "name": name})
    return list(PROJECT_SHELLS)


def _counts(connection) -> dict[str, int]:
    names = set(inspect(connection).get_table_names())
    tracked = set(BUSINESS_TABLES) | {"founder_projects"}
    return {name: connection.execute(text(f'SELECT count(*) FROM "{name}"')).scalar_one()
            for name in sorted(tracked & names)}


def _clear_attachments() -> None:
    if not ATTACHMENT_ROOT.exists():
        return
    for entry in ATTACHMENT_ROOT.iterdir():
        shutil.rmtree(entry) if entry.is_dir() else entry.unlink()


def _restore_attachments(backup: dict | None) -> None:
    if not backup:
        return
    source = Path(backup["backup_path"]) / "founder-attachments"
    if not source.exists():
        return
    ATTACHMENT_ROOT.mkdir(parents=True, exist_ok=True)
    for entry in source.iterdir():
        target = ATTACHMENT_ROOT / entry.name
        shutil.copytree(entry, target, dirs_exist_ok=True) if entry.is_dir() else shutil.copy2(entry, target)


def reset_founder_business_data(*, backup_required: bool = True) -> dict:
    """Transactionally delete business/runtime rows and retain only system shells."""
    backup = create_business_data_backup() if backup_required else None
    registry = {"backup_path": None, "execution_count": len(list_execution_sessions())}
    try:
        registry = clear_execution_registry_runtime()
        with engine.begin() as connection:
            before = _counts(connection)
            available = set(inspect(connection).get_table_names())
            # Break the legacy tasks/deliverables cycle before deleting either side.
            if "tasks" in available and "deliverables" in available:
                connection.execute(text("UPDATE tasks SET source_deliverable_id = NULL"))
            for table_name in BUSINESS_TABLES:
                if table_name in available:
                    connection.execute(text(f'DELETE FROM "{table_name}"'))
            shell_ids = _ensure_project_shells(connection)
            connection.execute(text("DELETE FROM founder_projects WHERE id <> ALL(:shell_ids)"), {"shell_ids": shell_ids})
            after = _counts(connection)
            # Keep filesystem cleanup inside the database transaction boundary.
            # If it fails, SQL rolls back; if commit fails, the exception handler
            # restores these files from the already verified local backup.
            _clear_attachments()
        execution_queue.clear()
    except Exception:
        restore_execution_registry_cleanup(registry.get("backup_path"))
        _restore_attachments(backup)
        raise
    finalize_execution_registry_cleanup(registry.get("backup_path"))
    return {
        "backup": backup,
        "before": {**before, "execution_registry": registry["execution_count"]},
        "after": {**after, "execution_registry": len(list_execution_sessions())},
        "project_shell_ids": shell_ids,
    }
