"""Founder Object compatibility layer over existing Conversation and Execution assets."""
from datetime import datetime, timezone
import logging
import re

from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB
from app.core.task_asset.service import create_task_asset
from app.database.db import SessionLocal
from app.founder_ai.execution_registry import create_execution_session
from app.founder_ai.orchestrator import TaskAssetDraft, build_execution_package
from core.founder_object.model import ConversationObjectContextDB, FounderObjectDB, FounderObjectRevisionDB

OBJECT_TYPES = {"application_system", "project", "agent", "skill", "workflow", "prompt", "capability", "connector", "task", "artifact", "decision", "constraint", "knowledge", "memory"}
TYPE_LABELS = {"application_system": "Application System", "project": "Project", "agent": "Agent", "skill": "Skill", "workflow": "Workflow", "prompt": "Prompt", "capability": "Capability", "connector": "Connector", "task": "Task", "artifact": "Artifact", "decision": "Decision", "constraint": "Constraint", "knowledge": "Knowledge", "memory": "Memory"}
TYPE_MARKERS = [
    ("skill", ("skill", "技能")), ("capability", ("capability", "能力")), ("agent", ("agent", "智能体", "专员")),
    ("workflow", ("workflow", "工作流")), ("prompt", ("prompt", "提示词")), ("connector", ("connector", "连接器")),
    ("application_system", ("application system", "应用系统")), ("project", ("project", "项目")), ("task", ("task", "任务")),
]
CREATION_MARKERS = ("开发", "创建", "构建", "实现", "新增", "需要", "做一个", "build", "create", "develop")
logger = logging.getLogger(__name__)


def _normalize_name(name: str) -> str:
    return re.sub(r"[\s\-_·]+", "", name).lower()


def _display(record: FounderObjectDB, revisions: list[FounderObjectRevisionDB] | None = None) -> dict:
    return {"object_id": record.id, "object_type": record.object_type, "type_label": TYPE_LABELS.get(record.object_type, record.object_type), "name": record.name, "description": record.description, "status": record.status, "version": record.version, "source_candidate_id": record.source_candidate_id, "source_conversation_id": record.source_conversation_id, "source_message_refs": list(record.source_message_refs or []), "parent_object_id": record.parent_object_id, "child_object_ids": list(record.child_object_ids or []), "dependency_object_ids": list(record.dependency_object_ids or []), "related_object_ids": list(record.related_object_ids or []), "execution_refs": list(record.execution_refs or []), "artifact_refs": list(record.artifact_refs or []), "memory_refs": list(record.memory_refs or []), "decision_refs": list(record.decision_refs or []), "knowledge_refs": list(record.knowledge_refs or []), "founder_question": record.founder_question, "created_at": record.created_at.isoformat() if record.created_at else None, "updated_at": record.updated_at.isoformat() if record.updated_at else None, "revisions": [{"revision_id": item.id, "version": item.version, "name": item.name, "description": item.description, "status": item.status, "source_conversation_id": item.source_conversation_id, "created_at": item.created_at.isoformat() if item.created_at else None} for item in (revisions or [])]}


def _recognition_candidates(text: str) -> list[dict]:
    lowered = text.lower()
    if not any(marker in lowered for marker in CREATION_MARKERS):
        return []
    candidates = []
    for object_type, markers in TYPE_MARKERS:
        marker = next((item for item in markers if item in lowered), None)
        if not marker:
            continue
        if object_type == "skill" and ("chrome" in lowered or "浏览器" in lowered or "插件" in lowered):
            name = "Chrome Extension Skill"
        elif object_type == "capability" and ("browser session" in lowered or "浏览器 session" in lowered or "浏览器会话" in lowered):
            name = "Browser Session"
        elif object_type == "capability" and ("browser automation" in lowered or "浏览器自动化" in lowered):
            name = "Browser Automation"
        elif object_type == "project" and ("chrome" in lowered or "插件" in lowered):
            name = "Chrome Plugin"
        else:
            match = re.search(r"([A-Za-z][A-Za-z0-9 .+/#-]{1,80})\s*" + re.escape(marker), text, re.I)
            name = f"{match.group(1).strip()} {TYPE_LABELS[object_type]}" if match else f"{text[:80].strip()} · {TYPE_LABELS[object_type]}"
        candidates.append({"object_type": object_type, "name": name[:240], "description": text[:2000]})
    return candidates[:5]


def recognize_objects(conversation_id: str, source_message_id: str, founder_text: str, sino_reply: str = "") -> list[dict]:
    """Legacy deterministic fallback. Product runtimes use FounderIntentEngine."""
    candidates = _recognition_candidates(founder_text)
    logger.info("Object Recognition input=%r output=%s", founder_text[:500], candidates)
    if not candidates:
        logger.info("Object Recognition recognized_object=None type=None reason=no_explicit_creation_and_object_type_signal")
        return list_conversation_objects(conversation_id)
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        conversation = session.get(ConversationDB, conversation_id)
        if conversation is None or conversation.system_id != "founder_ai":
            raise LookupError("Founder AI conversation not found")
        attached = session.get(ConversationObjectContextDB, conversation_id)
        context_object = session.get(FounderObjectDB, attached.object_id) if attached else None
        for candidate in candidates:
            logger.info("Object Recognition recognized_object=%s type=%s reason=explicit_creation_and_object_type_signal", candidate["name"], candidate["object_type"])
            normalized = _normalize_name(candidate["name"])
            # Semantic identity is stable across Conversations. A Project may
            # define its own namespace; otherwise all Founder conversations
            # resolve against the same Object Layer.
            scope_key = conversation.project_id or "founder_ai"
            record = session.scalar(select(FounderObjectDB).where(FounderObjectDB.object_type == candidate["object_type"], FounderObjectDB.normalized_name == normalized, FounderObjectDB.scope_key == scope_key))
            if context_object and context_object.object_type == candidate["object_type"]:
                record = context_object
            if record is None:
                record = FounderObjectDB(object_type=candidate["object_type"], name=candidate["name"], normalized_name=normalized, description=candidate["description"], scope_key=scope_key, source_conversation_id=conversation_id, source_message_refs=[source_message_id])
                session.add(record); session.flush()
                record.related_object_ids = []
                if context_object and context_object.id != record.id:
                    # A new object recognized while reopening an existing one
                    # is a real graph relation, not a UI projection artifact.
                    context_object.related_object_ids = list(dict.fromkeys([*list(context_object.related_object_ids or []), record.id]))
                    record.related_object_ids = list(dict.fromkeys([*list(record.related_object_ids or []), context_object.id]))
                    if record.object_type == "capability":
                        context_object.dependency_object_ids = list(dict.fromkeys([*list(context_object.dependency_object_ids or []), record.id]))
            else:
                refs = list(record.source_message_refs or [])
                if source_message_id not in refs:
                    refs.append(source_message_id)
                    session.add(FounderObjectRevisionDB(object_id=record.id, version=record.version, name=record.name, description=record.description, status=record.status, source_conversation_id=record.source_conversation_id, source_message_refs=list(record.source_message_refs or []), snapshot=_display(record)))
                    record.version += 1
                    record.description = candidate["description"]
                    record.source_conversation_id = conversation_id
                    record.source_message_refs = refs
                    record.updated_at = now
        session.commit()
    return list_conversation_objects(conversation_id)


def list_conversation_objects(conversation_id: str) -> list[dict]:
    with SessionLocal() as session:
        attached = session.get(ConversationObjectContextDB, conversation_id)
        object_ids = [attached.object_id] if attached else []
        records = list(session.scalars(select(FounderObjectDB).where((FounderObjectDB.source_conversation_id == conversation_id) | (FounderObjectDB.id.in_(object_ids)), FounderObjectDB.status != "archived").order_by(FounderObjectDB.updated_at.desc())))
        return [{**_display(item, list(session.scalars(select(FounderObjectRevisionDB).where(FounderObjectRevisionDB.object_id == item.id).order_by(FounderObjectRevisionDB.version.desc())))), "is_context_object": bool(attached and attached.object_id == item.id)} for item in records]


def list_founder_objects(include_archived: bool = False) -> list[dict]:
    """Return the single Object Layer used by every workspace projection."""
    with SessionLocal() as session:
        query = select(FounderObjectDB)
        if not include_archived:
            query = query.where(FounderObjectDB.status != "archived")
        records = list(session.scalars(query.order_by(FounderObjectDB.updated_at.desc())))
        return [_display(item, list(session.scalars(select(FounderObjectRevisionDB).where(FounderObjectRevisionDB.object_id == item.id).order_by(FounderObjectRevisionDB.version.asc())))) for item in records]


def get_object(object_id: str) -> dict | None:
    with SessionLocal() as session:
        record = session.get(FounderObjectDB, object_id)
        if not record: return None
        revisions = list(session.scalars(select(FounderObjectRevisionDB).where(FounderObjectRevisionDB.object_id == object_id).order_by(FounderObjectRevisionDB.version.desc())))
        return _display(record, revisions)


def get_conversation_context_object(conversation_id: str) -> dict | None:
    with SessionLocal() as session:
        context = session.get(ConversationObjectContextDB, conversation_id)
        record = session.get(FounderObjectDB, context.object_id) if context else None
        if not record:
            if context:
                session.delete(context)
                session.commit()
            return None
        revisions = list(session.scalars(select(FounderObjectRevisionDB).where(FounderObjectRevisionDB.object_id == record.id).order_by(FounderObjectRevisionDB.version.desc())))
        return _display(record, revisions)


def attach_object_context(object_id: str, conversation_id: str | None = None) -> dict:
    with SessionLocal() as session:
        record = session.get(FounderObjectDB, object_id)
        if not record:
            raise LookupError("Founder Object not found")
        requested = session.get(ConversationDB, conversation_id) if conversation_id else None
        source = session.get(ConversationDB, record.source_conversation_id) if record.source_conversation_id else None
        conversation = requested if requested and requested.system_id == "founder_ai" else source
        if not conversation or conversation.system_id != "founder_ai":
            raise LookupError("Founder Object has no restorable source Conversation")
        context = session.get(ConversationObjectContextDB, conversation.id)
        if context: context.object_id = object_id; context.attached_at = datetime.now(timezone.utc)
        else: session.add(ConversationObjectContextDB(conversation_id=conversation.id, object_id=object_id))
        session.commit()
        return {**_display(record), "context_conversation_id": conversation.id}


def detach_object_context(conversation_id: str) -> None:
    with SessionLocal() as session:
        context = session.get(ConversationObjectContextDB, conversation_id)
        if context:
            session.delete(context)
            session.commit()


def archive_object(object_id: str) -> dict:
    with SessionLocal() as session:
        record = session.get(FounderObjectDB, object_id)
        if not record: raise LookupError("Founder Object not found")
        record.status = "archived"; record.updated_at = datetime.now(timezone.utc); session.commit(); session.refresh(record)
        return _display(record)


def approve_object(object_id: str, source_candidate_id: str | None = None) -> dict:
    with SessionLocal() as session:
        record = session.get(FounderObjectDB, object_id)
        if not record: raise LookupError("Founder Object not found")
        if record.status == "archived": raise ValueError("Archived Object cannot be approved")
        # Approval is an idempotent lifecycle transition. Repeated browser
        # submissions must not create a second Task Asset / Execution Session.
        if record.status == "approved" and record.execution_refs:
            # A newly-approved revision keeps the existing waiting execution
            # identity, but explicitly advances its approved object version.
            # Pending candidates never reach this branch, so execution cannot
            # inherit an unapproved version.
            refs = list(record.execution_refs or [])
            refs[-1] = {**refs[-1], "object_version": record.version, "source_candidate_id": source_candidate_id or refs[-1].get("source_candidate_id")}
            record.execution_refs = refs
            if source_candidate_id: record.source_candidate_id = source_candidate_id
            record.updated_at = datetime.now(timezone.utc)
            session.commit(); session.refresh(record)
            return _display(record)
        if source_candidate_id and not record.source_candidate_id: record.source_candidate_id = source_candidate_id; session.commit()
        conversation_id, name, description, object_type, candidate_id = record.source_conversation_id, record.name, record.description, record.object_type, record.source_candidate_id or source_candidate_id
    trace = {"founder_object_id": object_id, "source_object_id": object_id, "source_candidate_id": candidate_id, "object_type": object_type, "object_name": name, "object_version": get_object(object_id)["version"]}
    task = create_task_asset(title=name, description=description, scope=trace, status="approved", approval_status="approved", execution_status="not_started", conversation_id=conversation_id)
    draft = TaskAssetDraft(title=name, description=description, scope={"context": trace}, constraints=["Founder Object approval is the execution boundary"], risk="medium", approval_required=True, conversation_id=conversation_id)
    execution = create_execution_session(task.id, build_execution_package(draft))
    with SessionLocal() as session:
        record = session.get(FounderObjectDB, object_id); record.status = "approved"; record.source_candidate_id = candidate_id; record.execution_refs = [*list(record.execution_refs or []), {"execution_id": execution.id, "task_asset_id": task.id, "status": execution.status, "source_object_id": object_id, "source_candidate_id": candidate_id, "object_version": record.version}]; record.updated_at = datetime.now(timezone.utc); session.commit(); session.refresh(record)
        return _display(record)
