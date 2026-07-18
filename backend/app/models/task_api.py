from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


TaskStatus = Literal["pending", "running", "completed", "failed"]


class TaskItemResponse(BaseModel):
    """
    单个任务的 API 响应结构。
    """

    model_config = ConfigDict(from_attributes=True)

    id: str
    task_type: str
    payload: dict[str, Any]
    assigned_agent: str | None
    priority: str
    status: str
    created_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    result: dict[str, Any] | None
    error: str | None


class TaskStatsResponse(BaseModel):
    """
    全库任务状态统计，不受筛选和分页影响。
    """

    total: int
    pending: int
    running: int
    completed: int
    failed: int
    queued: int


class TaskPaginationResponse(BaseModel):
    """
    当前查询的分页信息。
    """

    limit: int
    offset: int
    returned: int
    filtered_total: int


class TaskListResponse(BaseModel):
    """
    GET /api/v1/tasks 的完整响应结构。
    """

    stats: TaskStatsResponse
    items: list[TaskItemResponse]
    pagination: TaskPaginationResponse
