from fastapi import APIRouter, HTTPException

from app.services.task_service import TaskService


router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"],
)


@router.get("")
def list_tasks():
    """
    获取 PostgreSQL 中保存的全部任务记录。
    """

    tasks = TaskService.get_all_tasks()
    stats = TaskService.get_stats()

    return {
        "stats": {
            **stats,
            "queued": 0,
        },
        "items": [
            TaskService.to_dict(task)
            for task in tasks
        ],
    }


@router.get("/stats")
def get_task_stats():
    """
    获取 PostgreSQL 任务状态统计。
    """

    return {
        **TaskService.get_stats(),
        "queued": 0,
    }


@router.get("/{task_id}")
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

    return TaskService.to_dict(task)