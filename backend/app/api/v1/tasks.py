from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.models.task_api import (
    TaskItemResponse,
    TaskListResponse,
    TaskPaginationResponse,
    TaskStatsResponse,
)
from app.services.task_service import TaskService


router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"],
)


@router.get("", response_model=TaskListResponse)
def list_tasks(
    status: Literal["pending", "running", "completed", "failed"]
    | None = None,
    assigned_agent: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """
    获取 PostgreSQL 中保存的任务记录。

    支持按 status、assigned_agent 筛选，并支持分页。
    stats 始终表示全库任务统计，不受筛选和分页影响；
    空字符串的 assigned_agent 按未传处理。
    """

    normalized_agent = assigned_agent or None

    items, filtered_total = TaskService.get_all_tasks(
        status=status,
        assigned_agent=normalized_agent,
        limit=limit,
        offset=offset,
    )

    stats = TaskService.get_stats()

    return TaskListResponse(
        stats=TaskStatsResponse(**stats, queued=0),
        items=items,
        pagination=TaskPaginationResponse(
            limit=limit,
            offset=offset,
            returned=len(items),
            filtered_total=filtered_total,
        ),
    )


@router.get("/stats", response_model=TaskStatsResponse)
def get_task_stats():
    """
    获取 PostgreSQL 任务状态统计。
    """

    stats = TaskService.get_stats()

    return TaskStatsResponse(**stats, queued=0)


@router.get("/{task_id}", response_model=TaskItemResponse)
def get_task(task_id: str):
    """
    根据任务编号查询 PostgreSQL 任务详情。
    """

    task = TaskService.get_task(task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"未找到任务：{task_id}",
        )

    return task