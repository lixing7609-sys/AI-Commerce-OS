from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from app.core.asset_lifecycle.model import AssetCatalogDB, AssetLearningDB
from app.core.conversation.model import ConversationDB
from app.core.reference.model import IntelligenceReferenceDB
from app.core.task_asset.service import create_task_asset
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import create_execution_session, get_execution_session, list_execution_sessions
from app.founder_ai.orchestrator import TaskAssetDraft, build_execution_package


CAPABILITY_TYPES = {"agent", "skill", "workflow", "prompt", "capability", "connector"}
OFFICIAL_ASSET_TYPES = {"decision", "project", *CAPABILITY_TYPES, "knowledge"}
TECHNICAL_TYPES = {"execution_result", "technical_evidence", "code_change", "test_result", "build_result", "git_result", "deployment_result", "commit", "log"}


def _iso(value):
    return value.isoformat() if value else None


def _display(record: AssetCatalogDB, learnings: list[AssetLearningDB] | None = None) -> dict[str, Any]:
    return {
        "asset_id": record.id, "asset_type": record.asset_type,
        "native_type": record.native_type, "native_id": record.native_id,
        "name": record.name, "purpose": record.purpose, "content": dict(record.content or {}),
        "status": record.status, "version": record.version,
        "source_conversation_id": record.source_conversation_id,
        "source_package_id": record.source_package_id, "project_id": record.project_id,
        "dependency_refs": list(record.dependency_refs or []),
        "used_by_refs": list(record.used_by_refs or []),
        "execution_refs": list(record.execution_refs or []),
        "learning_refs": list(record.learning_refs or []),
        "reference_count": record.reference_count, "last_used_at": _iso(record.last_used_at),
        "legacy_category": record.legacy_category,
        "created_at": _iso(record.created_at), "updated_at": _iso(record.updated_at),
        "learning_history": [_learning_display(item) for item in (learnings or [])],
    }


def _learning_display(record: AssetLearningDB) -> dict[str, Any]:
    return {
        "learning_id": record.id, "asset_id": record.asset_id, "execution_id": record.execution_id,
        "outcome": record.outcome, "status": record.status, "summary": record.summary,
        "successful_patterns": list(record.successful_patterns or []), "failure_causes": list(record.failure_causes or []),
        "metrics": dict(record.metrics or {}), "recommendations": list(record.recommendations or []),
        "impact_level": record.impact_level, "confidence": record.confidence, "created_at": _iso(record.created_at),
    }


def upsert_catalog_record(session, *, asset_id: str, asset_type: str, native_type: str, native_id: str,
                          name: str, purpose: str, content: dict, status: str, version: int,
                          source_conversation_id: str | None, source_package_id: str | None,
                          project_id: str | None, dependency_refs: list | None = None,
                          legacy_category: str | None = None) -> AssetCatalogDB:
    record = session.scalar(select(AssetCatalogDB).where(
        AssetCatalogDB.native_type == native_type, AssetCatalogDB.native_id == native_id,
    ))
    if record is None:
        record = AssetCatalogDB(id=asset_id, asset_type=asset_type, native_type=native_type, native_id=native_id, name=name)
        session.add(record)
    record.asset_type = asset_type; record.name = name; record.purpose = purpose; record.content = content
    record.status = status; record.version = version; record.source_conversation_id = source_conversation_id
    record.source_package_id = source_package_id; record.project_id = project_id
    record.dependency_refs = list(dependency_refs or []); record.legacy_category = legacy_category
    record.updated_at = datetime.now(timezone.utc)
    return record


def list_assets(asset_type: str | None = None, *, include_legacy: bool = True) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        query = select(AssetCatalogDB).where(AssetCatalogDB.status.notin_(["archived", "deprecated"]))
        if asset_type:
            query = query.where(AssetCatalogDB.asset_type == asset_type)
        elif not include_legacy:
            query = query.where(AssetCatalogDB.asset_type.in_(OFFICIAL_ASSET_TYPES))
        records = list(session.scalars(query.order_by(AssetCatalogDB.updated_at.desc())))
        return [_display(item) for item in records]


def get_asset(asset_id: str) -> dict[str, Any]:
    with SessionLocal() as session:
        record = session.get(AssetCatalogDB, asset_id)
        if not record:
            raise LookupError("Asset not found")
        learnings = list(session.scalars(select(AssetLearningDB).where(AssetLearningDB.asset_id == asset_id).order_by(AssetLearningDB.created_at.desc())))
        refs = list(session.scalars(select(IntelligenceReferenceDB).where(
            IntelligenceReferenceDB.system_id == "founder_ai",
            IntelligenceReferenceDB.source_type == "asset", IntelligenceReferenceDB.source_id == asset_id,
        ).order_by(IntelligenceReferenceDB.created_at.desc())))
        payload = _display(record, learnings)
        payload["references"] = [{"reference_id": item.id, "target_type": item.target_type, "target_id": item.target_id, "note": item.note, "created_at": _iso(item.created_at)} for item in refs]
        return payload


def create_asset_execution(asset_id: str) -> dict[str, Any]:
    asset = get_asset(asset_id)
    existing = next((item for item in reversed(asset["execution_refs"]) if item.get("status") in {"draft", "approved", "queued", "executing", "testing"}), None)
    if existing:
        return existing
    task = create_task_asset(
        title=f"执行 {asset['name']}", description=asset["purpose"],
        scope={"asset_id": asset_id, "asset_type": asset["asset_type"], "source_package_id": asset["source_package_id"]},
        conversation_id=asset["source_conversation_id"], status="draft", approval_status="pending", execution_status="not_started",
    )
    draft = TaskAssetDraft(
        title=task.title, description=task.description or asset["purpose"], scope={"context": {"asset_id": asset_id, "asset": asset}},
        constraints=["Founder approval is required before execution"], risk="medium", approval_required=True,
        conversation_id=asset["source_conversation_id"],
    )
    execution = create_execution_session(task.id, build_execution_package(draft))
    reference = {"execution_id": execution.id, "task_asset_id": task.id, "status": execution.status, "asset_id": asset_id, "created_at": execution.created_at}
    with SessionLocal() as session:
        record = session.get(AssetCatalogDB, asset_id)
        record.execution_refs = [*list(record.execution_refs or []), reference]
        record.updated_at = datetime.now(timezone.utc); session.commit()
    return reference


def list_executions() -> list[dict[str, Any]]:
    assets = {item["execution_id"]: asset for asset in list_assets() for item in asset["execution_refs"] if item.get("execution_id")}
    result = []
    for execution in list_execution_sessions():
        asset = assets.get(execution.id)
        package_record = get_execution_session(execution.id)
        package = package_record[1] if package_record else None
        result.append({
            "execution_id": execution.id, "asset_id": asset["asset_id"] if asset else None,
            "asset_name": asset["name"] if asset else None, "conversation_id": asset["source_conversation_id"] if asset else getattr(package.task_asset, "conversation_id", None) if package else None,
            "project_id": asset["project_id"] if asset else None, "task_package_id": execution.execution_package_id,
            "task_asset_id": execution.task_asset_id, "status": execution.status,
            "result": execution.result, "error": execution.error_message or execution.failure_reason,
            "created_at": execution.created_at, "completed_at": execution.completed_at,
        })
    return sorted(result, key=lambda item: item["completed_at"] or item["created_at"] or "", reverse=True)


def create_learning(execution_id: str) -> dict[str, Any]:
    with SessionLocal() as session:
        # The column remains portable JSON (rather than PostgreSQL-only JSONB),
        # so resolve the bounded execution reference set in Python.
        asset = next((item for item in session.scalars(select(AssetCatalogDB)) if any(ref.get("execution_id") == execution_id for ref in item.execution_refs or [])), None)
        if asset is None:
            raise LookupError("Execution is not linked to an Asset")
        existing = session.scalar(select(AssetLearningDB).where(AssetLearningDB.execution_id == execution_id, AssetLearningDB.asset_id == asset.id))
        if existing:
            return _learning_display(existing)
        execution_record = get_execution_session(execution_id)
        if not execution_record:
            raise LookupError("Execution not found")
        execution, _package = execution_record
        if execution.status not in {"completed", "failed"}:
            raise ValueError("Learning requires a completed or failed Execution")
        success = execution.status == "completed"
        result = dict(execution.result or {})
        learning = AssetLearningDB(
            asset_id=asset.id, execution_id=execution_id,
            outcome="no_update" if success else "update_existing_asset",
            status="completed" if success else "review_required",
            summary="执行成功，当前资产无需更新。" if success else "执行失败，建议评估并更新现有资产。",
            successful_patterns=["执行与测试完成"] if success else [],
            failure_causes=[] if success else [execution.error_message or execution.failure_reason or "未知执行错误"],
            metrics={"exit_code": result.get("exit_code"), "test_count": len(result.get("tests") or []), "changed_file_count": len(result.get("changed_files") or [])},
            recommendations=[] if success else ["回到资产讨论，修正失败原因后创建新版本"],
            impact_level="low" if success else "high", confidence=1.0 if execution.status in {"completed", "failed"} else .5,
        )
        session.add(learning); session.flush()
        asset.learning_refs = [*list(asset.learning_refs or []), {"learning_id": learning.id, "execution_id": execution_id, "outcome": learning.outcome}]
        asset.updated_at = datetime.now(timezone.utc); session.commit(); session.refresh(learning)
        return _learning_display(learning)


def list_learnings() -> list[dict[str, Any]]:
    with SessionLocal() as session:
        return [_learning_display(item) for item in session.scalars(select(AssetLearningDB).order_by(AssetLearningDB.created_at.desc()))]


def reuse_asset(asset_id: str, *, target_type: str, target_id: str, note: str | None = None) -> dict[str, Any]:
    if target_type not in {"conversation", "project"}:
        raise ValueError("Unsupported reuse target")
    with SessionLocal() as session:
        asset = session.get(AssetCatalogDB, asset_id)
        if not asset or asset.status != "committed":
            raise LookupError("Reusable Asset not found")
        if target_type == "conversation" and session.get(ConversationDB, target_id) is None:
            raise LookupError("Target Conversation not found")
        existing = session.scalar(select(IntelligenceReferenceDB).where(
            IntelligenceReferenceDB.system_id == "founder_ai", IntelligenceReferenceDB.source_type == "asset",
            IntelligenceReferenceDB.source_id == asset_id, IntelligenceReferenceDB.target_type == target_type,
            IntelligenceReferenceDB.target_id == target_id,
        ))
        if existing is None:
            existing = IntelligenceReferenceDB(system_id="founder_ai", source_type="asset", source_id=asset_id, target_type=target_type, target_id=target_id, created_by="founder", note=note)
            session.add(existing); session.flush()
            ref = {"reference_id": existing.id, "target_type": target_type, "target_id": target_id}
            asset.used_by_refs = [*list(asset.used_by_refs or []), ref]
            asset.reference_count += 1
        asset.last_used_at = datetime.now(timezone.utc); asset.updated_at = asset.last_used_at
        session.commit()
        return {"asset_id": asset_id, "reference_id": existing.id, "target_type": target_type, "target_id": target_id}


def suggest_reuse(conversation_id: str) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        conversation = session.get(ConversationDB, conversation_id)
        if not conversation:
            raise LookupError("Conversation not found")
        records = list(session.scalars(select(AssetCatalogDB).where(
            AssetCatalogDB.status == "committed",
            (AssetCatalogDB.project_id == conversation.project_id) if conversation.project_id else AssetCatalogDB.project_id.is_(None),
        ).order_by(AssetCatalogDB.updated_at.desc()).limit(4)))
        return [{**_display(item), "reuse_reason": "与当前 Project Context 相关的正式资产"} for item in records]
