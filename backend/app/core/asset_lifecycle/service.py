from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.asset_lifecycle.model import AssetCatalogDB, AssetLearningDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB
from app.core.reference.model import IntelligenceReferenceDB
from app.core.task_asset.service import create_task_asset
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import create_execution_session, get_execution_session, list_execution_sessions
from app.founder_ai.orchestrator import TaskAssetDraft, build_execution_package


CAPABILITY_TYPES = {"agent", "skill", "workflow", "prompt", "capability", "connector"}
OFFICIAL_ASSET_TYPES = {"decision", "project", *CAPABILITY_TYPES, "knowledge"}
TECHNICAL_TYPES = {"execution_result", "technical_evidence", "code_change", "test_result", "build_result", "git_result", "deployment_result", "commit", "log"}
CAPABILITY_STATUSES = {"candidate", "developing", "testing", "ready", "deprecated"}
DEFAULT_DOMAINS = [
    ("commerce", "电商"), ("short-video", "短视频"), ("quant", "量化"),
    ("industrial", "工业"), ("brand", "品牌"), ("general", "通用"),
]


class LifecycleConflict(ValueError):
    def __init__(self, message: str, record: AssetCatalogDB):
        super().__init__(message)
        self.detail = {
            "code": "capability_lifecycle_conflict", "message": message,
            "asset_id": record.id, "asset_type": record.asset_type, "asset_name": record.name,
            "current_status": record.status, "available_actions": capability_available_actions(record),
        }


def capability_available_actions(record: AssetCatalogDB) -> list[str]:
    if record.status == "candidate":
        return (["develop"] if record.asset_type == "skill" else []) + ["archive", "continue_discussion"]
    if record.status == "developing":
        return ["view_development", "complete_development", "cancel"]
    if record.status == "testing":
        latest = (record.test_run_refs or [])[-1] if record.test_run_refs else None
        return ["approve_ready", "retest", "return_to_development"] if latest and latest.get("status") == "passed" else ["run_test", "return_to_development"]
    if record.status == "ready":
        return ["reuse", "upgrade", "deprecate"]
    return []


def _iso(value):
    return value.isoformat() if value else None


def _display(record: AssetCatalogDB, learnings: list[AssetLearningDB] | None = None) -> dict[str, Any]:
    return {
        "asset_id": record.id, "asset_type": record.asset_type,
        "native_type": record.native_type, "native_id": record.native_id,
        "name": record.name, "purpose": record.purpose, "content": dict(record.content or {}),
        "status": record.status, "version": record.version, "domain_id": record.domain_id,
        "source_conversation_id": record.source_conversation_id,
        "source_package_id": record.source_package_id, "project_id": record.project_id,
        "dependency_refs": list(record.dependency_refs or []),
        "used_by_refs": list(record.used_by_refs or []),
        "execution_refs": list(record.execution_refs or []),
        "development_run_refs": list(record.development_run_refs or []),
        "test_run_refs": list(record.test_run_refs or []), "ready_approval": dict(record.ready_approval or {}),
        "learning_refs": list(record.learning_refs or []),
        "reference_count": record.reference_count, "last_used_at": _iso(record.last_used_at),
        "legacy_category": record.legacy_category,
        "developed_at": _iso(record.developed_at), "ready_approved_at": _iso(record.ready_approved_at),
        "created_at": _iso(record.created_at), "updated_at": _iso(record.updated_at),
        "learning_history": [_learning_display(item) for item in (learnings or [])],
        "available_actions": capability_available_actions(record),
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
                          project_id: str | None, domain_id: str = "general", dependency_refs: list | None = None,
                          legacy_category: str | None = None) -> AssetCatalogDB:
    record = session.scalar(select(AssetCatalogDB).where(
        AssetCatalogDB.native_type == native_type, AssetCatalogDB.native_id == native_id,
    ))
    if record is None:
        record = AssetCatalogDB(id=asset_id, asset_type=asset_type, native_type=native_type, native_id=native_id, name=name)
        session.add(record)
    record.asset_type = asset_type; record.name = name; record.purpose = purpose; record.content = content
    record.status = status; record.version = version; record.source_conversation_id = source_conversation_id
    record.domain_id = domain_id or "general"
    record.source_package_id = source_package_id; record.project_id = project_id
    record.dependency_refs = list(dependency_refs or []); record.legacy_category = legacy_category
    record.updated_at = datetime.now(timezone.utc)
    return record


def list_assets(asset_type: str | None = None, *, include_legacy: bool = True, domain_id: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    with SessionLocal() as session:
        query = select(AssetCatalogDB).where(AssetCatalogDB.status.notin_(["archived", "deprecated"]))
        if asset_type:
            query = query.where(AssetCatalogDB.asset_type == asset_type)
        elif not include_legacy:
            query = query.where(AssetCatalogDB.asset_type.in_(OFFICIAL_ASSET_TYPES))
        if domain_id:
            query = query.where(AssetCatalogDB.domain_id == domain_id)
        if status:
            query = query.where(AssetCatalogDB.status == status)
        records = list(session.scalars(query.order_by(AssetCatalogDB.updated_at.desc())))
        return [_display(item) for item in records]


def list_domains() -> list[dict[str, Any]]:
    with SessionLocal() as session:
        records = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.asset_type.in_(OFFICIAL_ASSET_TYPES))))
        configured = {key: label for key, label in DEFAULT_DOMAINS}
        for record in records:
            configured.setdefault(record.domain_id or "general", record.domain_id or "通用")
        return [{
            "domain_id": key, "name": label,
            "counts": {status: sum(1 for item in records if (item.domain_id or "general") == key and item.status == status) for status in CAPABILITY_STATUSES},
        } for key, label in configured.items()]


def _development_ref(record: AssetCatalogDB, run_id: str) -> dict[str, Any] | None:
    return next((item for item in record.development_run_refs or [] if item.get("development_run_id") == run_id), None)


def start_development(asset_id: str) -> dict[str, Any]:
    with SessionLocal() as session:
        record = session.get(AssetCatalogDB, asset_id)
        if not record:
            raise LookupError("Capability Asset not found")
        if record.status == "developing" and record.development_run_refs:
            return _display(record)
        if record.status != "candidate":
            raise LifecycleConflict("当前能力不是 Candidate，不能开始开发", record)
        if record.asset_type != "skill":
            raise LifecycleConflict("当前 Golden Path 只开放 Skill 开发；该候选会继续保留", record)
        now = datetime.now(timezone.utc)
        task = create_task_asset(
            title=f"开发 {record.name}", description=record.purpose,
            scope={"kind": "capability_development", "asset_id": record.id, "asset_type": record.asset_type, "domain_id": record.domain_id},
            conversation_id=record.source_conversation_id, status="approved", approval_status="approved", execution_status="not_started",
        )
        run = {"development_run_id": f"development-{uuid4().hex[:20]}", "task_asset_id": task.id, "status": "developing", "started_at": now.isoformat(), "asset_id": record.id}
        record.status = "developing"; record.development_run_refs = [*list(record.development_run_refs or []), run]
        record.updated_at = now; session.commit(); session.refresh(record)
        return _display(record)


def complete_development(asset_id: str) -> dict[str, Any]:
    """Create the executable Skill specification; this is a persisted implementation, not a timer transition."""
    with SessionLocal() as session:
        record = session.get(AssetCatalogDB, asset_id)
        if not record:
            raise LookupError("Capability Asset not found")
        if record.status != "developing":
            raise LifecycleConflict("开发尚未处于 Developing，不能标记完成", record)
        now = datetime.now(timezone.utc)
        content = dict(record.content or {})
        if record.asset_type == "skill":
            content["runtime_spec"] = {
                "implementation": "commerce_storyboard_v1",
                "input_schema": ["product_name", "selling_points", "platform", "content_goal"],
                "output_schema": ["title", "platform", "shots"],
                "shot_schema": ["sequence", "visual", "voiceover", "selling_point", "duration_seconds"],
            }
        else:
            content["runtime_spec"] = {"implementation": f"{record.asset_type}_configuration_v1", "validated": True}
        refs = list(record.development_run_refs or [])
        refs[-1] = {**refs[-1], "status": "completed", "completed_at": now.isoformat(), "implementation": content["runtime_spec"]}
        record.content = content; record.development_run_refs = refs; record.status = "testing"
        record.developed_at = now; record.updated_at = now; session.commit(); session.refresh(record)
        return _display(record)


def _execute_storyboard_skill(payload: dict[str, Any]) -> dict[str, Any]:
    product = str(payload.get("product_name") or "未命名商品")
    points = [str(item) for item in payload.get("selling_points") or []] or ["核心卖点"]
    platform = str(payload.get("platform") or "抖音")
    goal = str(payload.get("content_goal") or "带货短视频")
    beats = [("问题钩子", f"展示用户使用 {product} 前的痛点"), ("商品登场", f"突出 {points[0]}"), ("场景证明", f"演示 {points[-1]}"), ("行动引导", f"围绕{goal}给出明确行动")]
    return {"title": f"{product} · {platform}结构化分镜", "platform": platform, "shots": [
        {"sequence": index, "visual": visual, "voiceover": f"{product}：{visual}", "selling_point": points[(index - 1) % len(points)], "duration_seconds": 4}
        for index, (visual, _detail) in enumerate(beats, 1)
    ]}


def run_capability_test(asset_id: str, test_input: dict[str, Any] | None = None) -> dict[str, Any]:
    with SessionLocal() as session:
        record = session.get(AssetCatalogDB, asset_id)
        if not record:
            raise LookupError("Capability Asset not found")
        if record.status != "testing":
            raise LifecycleConflict("当前能力尚未完成开发并进入 Testing，不能运行测试", record)
        runtime = dict(record.content or {}).get("runtime_spec") or {}
        if runtime.get("implementation") != "commerce_storyboard_v1":
            raise LifecycleConflict(f"{record.name}（{record.asset_type}）没有商品分镜 Skill 测试适配器，请先选择正确的 Skill", record)
        fixture = test_input or {"product_name": "便携咖啡机", "selling_points": ["快速萃取", "便携"], "platform": "抖音", "content_goal": "带货短视频"}
        actual = _execute_storyboard_skill(fixture)
        required = {"title", "platform", "shots"}
        passed = required.issubset(actual) and len(actual["shots"]) >= 4 and all({"sequence", "visual", "voiceover", "selling_point", "duration_seconds"}.issubset(item) for item in actual["shots"])
        now = datetime.now(timezone.utc)
        run = {"test_run_id": f"test-{uuid4().hex[:20]}", "asset_id": record.id, "status": "passed" if passed else "failed", "test_case": "电商商品分镜结构化输出", "input": fixture, "expected": {"required_fields": sorted(required), "minimum_shots": 4}, "actual": actual, "evidence": ["runtime_spec=commerce_storyboard_v1", f"shots={len(actual.get('shots') or [])}", f"required_fields={','.join(sorted(required))}"], "failure_reason": None if passed else "结构化分镜输出未满足约束", "started_at": now.isoformat(), "completed_at": now.isoformat()}
        record.test_run_refs = [*list(record.test_run_refs or []), run]; record.updated_at = now
        session.commit()
        return run


def approve_ready(asset_id: str, *, approved_by: str = "founder") -> dict[str, Any]:
    with SessionLocal() as session:
        record = session.get(AssetCatalogDB, asset_id)
        if not record:
            raise LookupError("Capability Asset not found")
        if record.status == "ready":
            return _display(record)
        if record.status != "testing" or not record.test_run_refs or record.test_run_refs[-1].get("status") != "passed":
            raise LifecycleConflict("只有最新 Test Run 通过后，Founder 才能批准 Ready", record)
        now = datetime.now(timezone.utc)
        record.status = "ready"; record.ready_approval = {"approved_by": approved_by, "approved_at": now.isoformat(), "test_run_id": record.test_run_refs[-1]["test_run_id"]}
        record.ready_approved_at = now; record.updated_at = now; session.commit(); session.refresh(record)
        return _display(record)


def perform_capability_action(asset_id: str, action: str, *, test_input: dict[str, Any] | None = None,
                              target_type: str | None = None, target_id: str | None = None,
                              note: str | None = None) -> dict[str, Any]:
    """One lifecycle command path shared by Founder language and Action Cards."""
    if action == "develop":
        return start_development(asset_id)
    if action == "complete_development":
        return complete_development(asset_id)
    if action in {"run_test", "retest"}:
        run = run_capability_test(asset_id, test_input)
        return {"asset": get_asset(asset_id), "test_run": run}
    if action == "approve_ready":
        return approve_ready(asset_id)
    if action == "reuse":
        if not target_type or not target_id:
            raise ValueError("Reuse target is required")
        reference = reuse_asset(asset_id, target_type=target_type, target_id=target_id, note=note)
        return {"asset": get_asset(asset_id), "reference": reference}
    if action in {"defer", "skip_reuse", "continue_discussion"}:
        return get_asset(asset_id)
    if action in {"archive", "deprecate"}:
        with SessionLocal() as session:
            record = session.get(AssetCatalogDB, asset_id)
            if not record:
                raise LookupError("Capability Asset not found")
            record.status = "deprecated"; record.updated_at = datetime.now(timezone.utc)
            session.commit(); session.refresh(record)
            return _display(record)
    raise ValueError(f"Unsupported capability action: {action}")


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
        if not asset or asset.status != "ready":
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
        messages = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at.desc()).limit(12)))
        text = " ".join([conversation.title or "", *[item.content or "" for item in messages]])
        domain_id = "commerce" if any(term in text for term in ("电商", "商品", "带货", "转化", "广告素材")) else "short-video" if any(term in text for term in ("短视频", "短剧", "抖音", "视频")) else "general"
        ready = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.status == "ready", AssetCatalogDB.domain_id == domain_id).order_by(AssetCatalogDB.updated_at.desc()).limit(6)))
        candidate = list(session.scalars(select(AssetCatalogDB).where(AssetCatalogDB.status == "candidate", AssetCatalogDB.domain_id == domain_id).order_by(AssetCatalogDB.updated_at.desc()).limit(3)))
        return [
            {**_display(item), "reuse_reason": f"当前目标属于{dict(DEFAULT_DOMAINS).get(domain_id, domain_id)}，可直接复用 Ready 能力", "can_reuse": True}
            for item in ready
        ] + [
            {**_display(item), "reuse_reason": "发现相关候选能力，需先开发和测试", "can_reuse": False}
            for item in candidate
        ]
