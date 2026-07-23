from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.deliverable_db import DELIVERABLE_STATUSES, DELIVERABLE_TYPES


class DeliverableVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version_number: int
    format: str
    content: str
    structured_content: dict[str, Any]
    created_at: datetime
    created_by: str
    source_task_id: str


class DeliverableVersionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version_number: int
    created_at: datetime
    created_by: str


class DeliverableTaskSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    task_type: str
    assigned_agent: str | None
    created_at: datetime | None
    completed_at: datetime | None


class DeliverableShopSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    shop_code: str
    shop_name: str
    platform: str


class DeliverableItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    deliverable_code: str
    title: str
    deliverable_type: str
    status: str
    source_task_id: str
    root_task_id: str
    parent_task_id: str | None
    shop_id: int | None
    agent_name: str
    summary: str | None
    current_version: int
    created_at: datetime
    updated_at: datetime
    approved_at: datetime | None
    rejected_at: datetime | None
    archived_at: datetime | None
    shop_name: str | None = None


class DeliverableListResponse(BaseModel):
    items: list[DeliverableItemResponse]
    total: int
    limit: int
    offset: int


class DeliverableDetailResponse(DeliverableItemResponse):
    current_version_data: DeliverableVersionResponse | None = None
    versions: list[DeliverableVersionSummary] = Field(default_factory=list)
    source_task: DeliverableTaskSummary | None = None
    parent_task: DeliverableTaskSummary | None = None
    child_tasks: list[DeliverableTaskSummary] = Field(default_factory=list)
    shop: DeliverableShopSummary | None = None
    available_actions: list[str] = Field(default_factory=list)


class CreateFollowUpTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=64)
    assigned_agent: str = Field(..., min_length=1, max_length=100)
    instruction: str = Field(default="", max_length=2000)
    priority: Literal["high", "normal", "low"] = Field(default="normal")
    inherit_shop_scope: bool = Field(default=True)
    target_shop_id: int | None = Field(default=None)

    @field_validator("title", "instruction", mode="before")
    @classmethod
    def _strip(cls, value):
        if isinstance(value, str):
            return value.strip()
        return value


class CreateFollowUpTaskResponse(BaseModel):
    task_id: str
    status: str
    assigned_agent: str | None
    shop_id: int | None
    message: str


class DeliverableActionResponse(BaseModel):
    deliverable: DeliverableItemResponse
    message: str


def validate_deliverable_type(value: str) -> bool:
    return value in DELIVERABLE_TYPES


def validate_deliverable_status(value: str) -> bool:
    return value in DELIVERABLE_STATUSES
