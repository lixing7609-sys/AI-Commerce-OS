from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.memory.service import MemoryBoundaryError, create_memory, get_founder_memory, list_founder_memories


class MemoryCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    memory_type: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1)
    summary: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    status: str = Field(default="active", min_length=1, max_length=30)
    conversation_id: str | None = None
    decision_id: str | None = None
    task_asset_id: str | None = None
    artifact_id: str | None = None


class MemoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    conversation_id: str | None
    decision_id: str | None
    task_asset_id: str | None
    artifact_id: str | None
    memory_type: str
    title: str
    content: str
    summary: str | None
    confidence: float | None
    status: str
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/memories", tags=["Memory Assets"])


@router.post("", response_model=MemoryOut, status_code=201)
def create_founder_memory(request: MemoryCreateIn):
    try:
        return create_memory(**request.model_dump())
    except MemoryBoundaryError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("", response_model=list[MemoryOut])
def list_memories():
    return list_founder_memories()


@router.get("/{memory_id}", response_model=MemoryOut)
def get_memory(memory_id: str):
    memory = get_founder_memory(memory_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="Memory asset not found")
    return memory
