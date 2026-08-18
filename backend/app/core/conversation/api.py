from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.conversation.service import bind_conversation_project, create_conversation, delete_conversation, get_conversation, list_conversations


class ConversationCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=200)
    project_id: str | None = Field(default=None, max_length=40)
    conversation_type: str = Field(default="USER_CONVERSATION", max_length=30)
    created_by: str = Field(default="FOUNDER", max_length=20)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    project_id: str | None
    title: str
    status: str
    conversation_kind: str
    conversation_type: str
    created_by: str
    visibility: str
    lifecycle_status: str
    topic_key: str | None
    merged_into_conversation_id: str | None
    created_at: datetime
    updated_at: datetime


class ConversationProjectIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    project_id: str | None = Field(default=None, max_length=40)


router = APIRouter(prefix="/conversations", tags=["Conversations"])


@router.get("", response_model=list[ConversationOut])
def list_founder_conversations(scope: str = "all", project_id: str | None = None):
    try:
        return list_conversations(scope=scope, project_id=project_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("", response_model=ConversationOut, status_code=201)
def create_founder_conversation(request: ConversationCreateIn):
    try:
        return create_conversation(title=request.title, project_id=request.project_id, conversation_type=request.conversation_type, created_by=request.created_by)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_founder_conversation(conversation_id: str):
    conversation = get_conversation(conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conversation


@router.patch("/{conversation_id}/project", response_model=ConversationOut)
def update_conversation_project(conversation_id: str, request: ConversationProjectIn):
    try:
        return bind_conversation_project(conversation_id, request.project_id)
    except LookupError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/{conversation_id}", response_model=dict[str, object])
def delete_founder_conversation(conversation_id: str):
    try: return delete_conversation(conversation_id)
    except LookupError as error: raise HTTPException(status_code=404, detail={"code": "conversation_not_found", "message": str(error)}) from error
