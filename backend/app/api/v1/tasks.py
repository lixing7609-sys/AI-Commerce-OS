import logging
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from app.agents.agent_registry import AgentRegistry
from app.models.task_api import (
    TaskItemResponse,
    TaskListResponse,
    TaskPaginationResponse,
    TaskStatsResponse,
    TaskSubmitRequest,
    TaskSubmitResponse,
)
from app.models.task_recovery import (
    TaskRecoveryCandidate,
    TaskRecoveryCandidatesResponse,
    TaskRecoverySummary,
)
from app.models.task_recovery_actions import TaskMarkFailedRequest
from app.runtime.task import Task
from app.services.task_consumer_service import task_consumer_service
from app.services.task_recovery_action_service import (
    InvalidTaskTransitionError,
    TaskNotFoundError,
    TaskRecoveryActionService,
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


@router.post(
    "/submit",
    response_model=TaskSubmitResponse,
    status_code=202,
)
def submit_task(request: TaskSubmitRequest):
    """
    正式的 pending 任务提交入口：只把任务写入队列，不在本次 HTTP
    请求内执行 Agent。

    流程：校验请求 → 确认 assigned_agent 已在 AgentRegistry 注册
    （只做存在性校验，不检查该 Agent 当前运行状态，也不启动它）
    → 创建 status=pending 的任务并 commit → 仅在 commit 成功后
    才唤醒后台 TaskConsumerService → 立即返回 202。

    本接口完全不检查、不修改 Runtime 状态，不启动 Runtime；
    Runtime stopped 时任务照常入队并保持 pending，由用户之后
    手动启动 Runtime，或如果 Runtime 本来就 running，则由现有
    后台 consumer 在其自身循环中异步领取执行——本接口本身绝不
    调用 agent.run() 或 TaskExecutionService。
    """

    logger.info("task submission requested")

    agent = AgentRegistry.get(request.assigned_agent)

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 Agent：{request.assigned_agent}",
        )

    payload = {**request.context, "task": request.task}

    task = Task(
        task_type=request.task,
        payload=payload,
        assigned_agent=request.assigned_agent,
        priority=request.priority,
    )

    try:
        task_db = TaskService.create_task(task)
    except Exception as error:
        logger.error(
            "task submission database failure: error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail=f"任务提交失败（{type(error).__name__}）",
        ) from error

    try:
        task_consumer_service.wake()
    except Exception as error:
        logger.warning(
            "task consumer wake failed: task_id=%s error_type=%s",
            task_db.id,
            type(error).__name__,
        )

    logger.info(
        "task submitted: task_id=%s assigned_agent=%s priority=%s",
        task_db.id,
        task_db.assigned_agent,
        task_db.priority,
    )

    return TaskSubmitResponse(
        id=task_db.id,
        status=task_db.status,
        assigned_agent=task_db.assigned_agent,
        task_type=task_db.task_type,
        priority=task_db.priority,
        created_at=task_db.created_at,
        message="任务已进入执行队列",
    )


@router.post("/{task_id}/requeue", response_model=TaskItemResponse)
def requeue_task(task_id: str):
    """
    人工把一个 running 任务重新排队为 pending。

    只允许 running → pending；不允许对 pending/completed/failed
    任务调用。清空 started_at/completed_at/result/error，保留
    id/task_type/assigned_agent/priority/payload/created_at。
    只写库，不重新执行任务，不调用 RuntimeEngine 或
    AgentRegistry，不修改 system_runtime_state。
    """

    try:
        task = TaskRecoveryActionService.requeue_task(task_id)
    except TaskNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail=f"未找到任务：{task_id}",
        ) from error
    except InvalidTaskTransitionError as error:
        raise HTTPException(
            status_code=409,
            detail=error.detail,
        ) from error
    except Exception as error:
        logger.error(
            "requeue task failed: %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail=f"重新排队任务失败（{type(error).__name__}）",
        ) from error

    return task


@router.post("/{task_id}/mark-failed", response_model=TaskItemResponse)
def mark_task_failed(task_id: str, request: TaskMarkFailedRequest):
    """
    人工把一个 pending/running 任务标记为 failed。

    只允许 pending/running → failed；不允许对 completed/failed
    任务调用。写入 completed_at=当前时间、error=人工提供的安全
    原因文本，清空 result；started_at 保留原值。不调用
    RuntimeEngine 或 AgentRegistry，不修改 system_runtime_state。
    """

    try:
        task = TaskRecoveryActionService.mark_task_failed(
            task_id, request.reason
        )
    except TaskNotFoundError as error:
        raise HTTPException(
            status_code=404,
            detail=f"未找到任务：{task_id}",
        ) from error
    except InvalidTaskTransitionError as error:
        raise HTTPException(
            status_code=409,
            detail=error.detail,
        ) from error
    except Exception as error:
        logger.error(
            "mark task failed request errored: %s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=500,
            detail=f"标记任务失败时发生错误（{type(error).__name__}）",
        ) from error

    return task


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