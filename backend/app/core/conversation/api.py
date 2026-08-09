from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.conversation.service import create_conversation, get_conversation, list_conversations


class ConversationCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=200)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    title: str
    status: str
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("", response_model=list[ConversationOut])
def list_founder_conversations():
    return list_conversations()


@router.post("", response_model=ConversationOut, status_code=201)
def create_founder_conversation(request: ConversationCreateIn):
    return create_conversation(title=request.title)


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_founder_conversation(conversation_id: str):
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation
