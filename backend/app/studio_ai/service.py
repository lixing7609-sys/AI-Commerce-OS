from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import select

from app.founder_ai.capability_compatibility import lookup_image_generation_compatibility
from app.core.context.model import ConversationContextDB
from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationMessageDB
from app.core.model_center.service import get_model_center
from app.database.db import SessionLocal

SYSTEM_ID = "studio_ai"


def _iso(value):
    return value.isoformat() if value else None


def _conversation(item):
    return {"conversation_id": item.id, "system_id": item.system_id, "project_id": item.project_id, "title": item.title,
            "status": item.status, "created_at": _iso(item.created_at), "updated_at": _iso(item.updated_at)}


def create_studio_conversation(title: str = "商品主图生成") -> dict:
    with SessionLocal() as session:
        record = ConversationDB(system_id=SYSTEM_ID, title=title.strip() or "Studio Conversation", conversation_kind="studio_production")
        session.add(record); session.flush()
        session.add(ConversationContextDB(conversation_id=record.id, system_id=SYSTEM_ID))
        session.commit(); session.refresh(record)
        return _conversation(record)


def list_studio_conversations() -> list[dict]:
    with SessionLocal() as session:
        rows = list(session.scalars(select(ConversationDB).where(ConversationDB.system_id == SYSTEM_ID, ConversationDB.status == "active").order_by(ConversationDB.updated_at.desc())))
        return [_conversation(item) for item in rows]


def _require_conversation(session, conversation_id: str):
    item = session.scalar(select(ConversationDB).where(ConversationDB.id == conversation_id, ConversationDB.system_id == SYSTEM_ID))
    if item is None:
        raise LookupError("Studio Conversation not found")
    return item


def lookup_image_capability() -> dict:
    result = lookup_image_generation_compatibility()
    if result["status"] not in {"EXACT_REUSE", "COMPATIBLE_REUSE"}:
        return {"status": "capability_missing", "capability": None, "temporary_binding": None, "compatibility": result}
    selected = result["selected"]
    return {"status": "available", "capability": {"asset_id": selected["asset_id"], "name": selected["name"], "status": selected["status"]}, "temporary_binding": None, "compatibility": result}


def lookup_image_generation_model() -> dict:
    center = get_model_center()
    candidates = [item for item in center.get("models", []) if item.get("supports_image_generation") and item.get("supports_text") and item.get("enabled")]
    if not candidates:
        return {"status": "model_missing", "model": None, "reason": "No healthy configured model has verified supports_image_generation evidence."}
    selected = candidates[0]
    return {"status": "available", "model": {"provider_id": selected["provider_id"], "model_id": selected["model_id"]}}


def _task(goal: str) -> dict:
    capability = lookup_image_capability()
    model = lookup_image_generation_model()
    status = "capability_missing" if capability["status"] != "available" else "model_missing" if model["status"] != "available" else "ready_for_execution"
    return {
        "task_id": f"studio-task-{uuid4().hex[:20]}", "task_type": "image_generation", "goal": goal,
        "understanding": {"content_type": "product_hero_image", "requested_output": "one product hero image"},
        "capability_lookup": capability, "model_lookup": model,
        "generation_plan": {"steps": ["understand_input", "lookup_capability", "select_model", "generate", "record_asset"], "status": "blocked" if status != "ready_for_execution" else "ready"},
        "execution_status": "not_started", "result": None, "asset": None, "status": status,
        "next_action": "Develop and approve an image-generation Capability in Founder AI." if status == "capability_missing" else "Configure and verify an image-generation model." if status == "model_missing" else "Ready for controlled Studio execution.",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def submit_studio_message(conversation_id: str, content: str) -> dict:
    if not content.strip():
        raise ValueError("studio_input_required")
    task = _task(content.strip())
    with SessionLocal() as session:
        conversation = _require_conversation(session, conversation_id)
        message_time = datetime.now(timezone.utc)
        founder = ConversationMessageDB(conversation_id=conversation_id, role="founder", content=content.strip(), message_type="studio_input", grounding={"studio_task_id": task["task_id"]}, created_at=message_time)
        reply = "当前缺少已批准的图片生成 Capability。" if task["status"] == "capability_missing" else "当前没有经验证可用的图片生成模型。" if task["status"] == "model_missing" else "Studio 图像任务已具备受控执行条件。"
        assistant = ConversationMessageDB(conversation_id=conversation_id, role="assistant", content=reply, message_type="studio_task", grounding={"studio_task": task}, created_at=message_time + timedelta(microseconds=1))
        session.add_all([founder, assistant]); conversation.title = content.strip()[:80]; conversation.updated_at = datetime.now(timezone.utc)
        session.commit()
    return studio_snapshot(conversation_id)


def studio_snapshot(conversation_id: str) -> dict:
    with SessionLocal() as session:
        conversation = _require_conversation(session, conversation_id)
        rows = list(session.scalars(select(ConversationMessageDB).where(ConversationMessageDB.conversation_id == conversation_id).order_by(ConversationMessageDB.created_at.asc(), ConversationMessageDB.id.asc())))
        messages = [{"message_id": item.id, "role": item.role, "content": item.content, "message_type": item.message_type, "grounding": dict(item.grounding or {}), "created_at": _iso(item.created_at)} for item in rows]
        task = next((dict((item.grounding or {}).get("studio_task") or {}) for item in reversed(rows) if (item.grounding or {}).get("studio_task")), None)
        return {"conversation": _conversation(conversation), "messages": messages, "task": task}
