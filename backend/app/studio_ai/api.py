from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.studio_ai.service import create_studio_conversation, list_studio_conversations, studio_snapshot, submit_studio_message

router = APIRouter(prefix="/studio-ai", tags=["Studio AI"])


class ConversationIn(BaseModel):
    title: str = Field(default="商品主图生成", max_length=200)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


@router.get("/conversations")
def conversations(): return {"conversations": list_studio_conversations()}


@router.post("/conversations", status_code=201)
def create_conversation(request: ConversationIn): return create_studio_conversation(request.title)


@router.get("/conversations/{conversation_id}")
def read_conversation(conversation_id: str):
    try: return studio_snapshot(conversation_id)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/conversations/{conversation_id}/messages")
def send_message(conversation_id: str, request: MessageIn):
    try: return submit_studio_message(conversation_id, request.content)
    except LookupError as error: raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error: raise HTTPException(status_code=400, detail=str(error)) from error
