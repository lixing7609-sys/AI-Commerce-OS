import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.models.task_api import (
    TaskItemResponse,
    TaskListResponse,
    TaskPaginationResponse,
    TaskStatsResponse,
)
from app.models.task_recovery import (
    TaskRecoveryCandidate,
    TaskRecoveryCandidatesResponse,
    TaskRecoverySummary,
)
from app.services.task_recovery_service import TaskRecoveryService
from app.services.task_service import TaskService

logger = logging.getLogger("app.tasks_api")

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


@router.get(
    "/recovery-candidates",
    response_model=TaskRecoveryCandidatesResponse,
)
def get_recovery_candidates(
    stale_after_minutes: int = Query(default=30, ge=1, le=10080),
    status: Literal["pending", "running"] | None = None,
    assigned_agent: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """
    只读查看会阻止 Runtime startup 自动恢复的未完成任务
    （status=pending / status=running）。

    只做诊断展示，不修改任何任务数据，不调用 RuntimeEngine 或
    RuntimeRecoveryService，不触发自动恢复、重试或重新排队。

    summary（含 blocks_runtime_recovery/blocking_reason）固定是
    全库 pending/running 口径，不受本次 status、assigned_agent、
    limit、offset 参数影响；只有 items（以及对应的
    returned_count）才按这些参数过滤和分页。换句话说，即使当前
    请求用 status/assigned_agent 筛出了一个空的 items 列表，
    summary 仍会如实反映全库是否存在会阻塞 Runtime 自动恢复的
    未完成任务。
    """

    normalized_agent = assigned_agent or None

    try:
        summary_counts = TaskRecoveryService.count_recovery_candidates(
            stale_after_minutes
        )

        candidates, _ = TaskRecoveryService.list_recovery_candidates(
            status=status,
            assigned_agent=normalized_agent,
            stale_after_minutes=stale_after_minutes,
            limit=limit,
            offset=offset,
        )
    except Exception as error:
        logger.error(
            "recovery candidates query failed: %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail=f"查询恢复候选任务失败（{type(error).__name__}）",
        ) from error

    return TaskRecoveryCandidatesResponse(
        summary=TaskRecoverySummary(**summary_counts),
        items=[TaskRecoveryCandidate(**item) for item in candidates],
        limit=limit,
        offset=offset,
        returned_count=len(candidates),
    )


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