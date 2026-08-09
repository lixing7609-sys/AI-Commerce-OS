from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from app.core.context.service import get_founder_context


class ConversationContextOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    conversation_id: str
    system_id: str
    user_goal: str | None
    constraints: dict
    decisions_summary: str | None
    knowledge_refs: list
    task_refs: list
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/conversations", tags=["Conversation Context"])


@router.get("/{conversation_id}/context", response_model=ConversationContextOut)
def get_conversation_context(conversation_id: str):
    context = get_founder_context(conversation_id)
    if context is None:
        raise HTTPException(status_code=404, detail="Conversation context not found")
    return context
