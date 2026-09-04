"""Conversation-bound local image attachments; binaries never enter conversation JSON."""
from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4
import base64

from PIL import Image
from sqlalchemy import select

from app.core.conversation.model import ConversationDB
from app.core.conversation_first.model import ConversationAttachmentDB
from app.database.db import SessionLocal

ALLOWED_IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_IMAGE_BYTES = 12 * 1024 * 1024
STORAGE_ROOT = Path(__file__).resolve().parents[3] / ".runtime" / "founder-attachments"

def _payload(item: ConversationAttachmentDB) -> dict:
    return {"attachment_id": item.id, "conversation_id": item.conversation_id, "message_id": item.message_id,
            "attachment_type": item.attachment_type, "mime_type": item.mime_type, "original_filename": item.original_filename,
            "storage_reference": item.storage_reference, "width": item.width, "height": item.height, "size": item.size,
            "created_at": item.created_at.isoformat() if item.created_at else None}

def save_pending_image(conversation_id: str, filename: str, mime_type: str, content: bytes) -> dict:
    if mime_type not in ALLOWED_IMAGE_TYPES: raise ValueError("unsupported_image_type")
    if not content or len(content) > MAX_IMAGE_BYTES: raise ValueError("invalid_image_size")
    try:
        with Image.open(BytesIO(content)) as image:
            image.verify(); width, height = image.size
    except Exception as error: raise ValueError("invalid_image_content") from error
    attachment_id = f"attachment-{uuid4().hex[:20]}"
    relative = Path(conversation_id) / f"{attachment_id}{ALLOWED_IMAGE_TYPES[mime_type]}"
    target = STORAGE_ROOT / relative; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(content)
    with SessionLocal() as session:
        conversation = session.get(ConversationDB, conversation_id)
        if conversation is None or conversation.system_id != "founder_ai":
            target.unlink(missing_ok=True); raise LookupError("Founder AI conversation not found")
        item = ConversationAttachmentDB(id=attachment_id, conversation_id=conversation_id, message_id=None, attachment_type="image",
            mime_type=mime_type, original_filename=Path(filename or f"image{ALLOWED_IMAGE_TYPES[mime_type]}").name,
            storage_reference=str(relative), width=width, height=height, size=len(content), created_at=datetime.now(timezone.utc))
        session.add(item); session.commit(); session.refresh(item); return _payload(item)

def bind_attachments(conversation_id: str, message_id: str, attachment_ids: list[str]) -> list[dict]:
    if not attachment_ids: return []
    with SessionLocal() as session:
        rows = list(session.scalars(select(ConversationAttachmentDB).where(ConversationAttachmentDB.id.in_(attachment_ids))))
        if len(rows) != len(set(attachment_ids)) or any(x.conversation_id != conversation_id or x.message_id not in {None, message_id} for x in rows):
            raise ValueError("attachment_conversation_mismatch")
        for item in rows: item.message_id = message_id
        session.commit(); return [_payload(item) for item in rows]

def attachments_for_messages(conversation_id: str, message_ids: list[str]) -> dict[str, list[dict]]:
    if not message_ids: return {}
    with SessionLocal() as session:
        rows = list(session.scalars(select(ConversationAttachmentDB).where(ConversationAttachmentDB.conversation_id == conversation_id, ConversationAttachmentDB.message_id.in_(message_ids))))
        result: dict[str, list[dict]] = {}
        for item in rows: result.setdefault(item.message_id, []).append(_payload(item))
        return result

def attachment_file(conversation_id: str, attachment_id: str) -> tuple[Path, str]:
    with SessionLocal() as session:
        item = session.get(ConversationAttachmentDB, attachment_id)
        if item is None or item.conversation_id != conversation_id or item.message_id is None: raise LookupError("Attachment not found")
        path = (STORAGE_ROOT / item.storage_reference).resolve()
        if STORAGE_ROOT.resolve() not in path.parents or not path.is_file(): raise LookupError("Attachment file not found")
        return path, item.mime_type

def multimodal_images(conversation_id: str, attachment_ids: list[str]) -> list[dict]:
    with SessionLocal() as session:
        rows = list(session.scalars(select(ConversationAttachmentDB).where(ConversationAttachmentDB.id.in_(attachment_ids))))
        if len(rows) != len(set(attachment_ids)) or any(x.conversation_id != conversation_id for x in rows): raise ValueError("attachment_conversation_mismatch")
        result = []
        for item in rows:
            path = (STORAGE_ROOT / item.storage_reference).resolve()
            if STORAGE_ROOT.resolve() not in path.parents or not path.is_file(): raise LookupError("Attachment file not found")
            encoded = base64.b64encode(path.read_bytes()).decode("ascii")
            result.append({"mime_type": item.mime_type, "base64": encoded, "data_url": f"data:{item.mime_type};base64,{encoded}"})
        return result

def delete_conversation_attachment_files(storage_refs: list[str]) -> None:
    for reference in storage_refs:
        path = (STORAGE_ROOT / reference).resolve()
        if STORAGE_ROOT.resolve() in path.parents: path.unlink(missing_ok=True)
