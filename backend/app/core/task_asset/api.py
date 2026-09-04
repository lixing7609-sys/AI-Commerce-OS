from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.core.task_asset.service import TaskAssetBoundaryError, create_task_asset, get_founder_task_asset, list_founder_task_assets


class TaskAssetCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    scope: dict = Field(default_factory=dict)
    status: str = Field(default="draft", min_length=1, max_length=30)
    approval_status: str = Field(default="pending", min_length=1, max_length=30)
    execution_status: str = Field(default="not_started", min_length=1, max_length=30)
    result: dict | None = None
    conversation_id: str | None = None
    decision_id: str | None = None


class TaskAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    system_id: str
    conversation_id: str | None
    decision_id: str | None
    title: str
    description: str | None
    scope: dict
    status: str
    approval_status: str
    execution_status: str
    result: dict | None
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/task-assets", tags=["Task Assets"])


@router.post("", response_model=TaskAssetOut, status_code=201)
def create_founder_task(request: TaskAssetCreateIn):
    try:
        return create_task_asset(**request.model_dump())
    except TaskAssetBoundaryError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("", response_model=list[TaskAssetOut])
def list_tasks():
    return list_founder_task_assets()


@router.get("/{task_id}", response_model=TaskAssetOut)
def get_task(task_id: str):
    task = get_founder_task_asset(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task asset not found")
    return task
