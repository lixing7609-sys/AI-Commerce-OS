from fastapi import APIRouter, HTTPException

from app.runtime.task_queue import task_queue


router = APIRouter(
    prefix="/tasks",
    tags=["Tasks"],
)


@router.get("")
def list_tasks():
    """
    获取全部任务记录。
    """

    return {
        "stats": task_queue.stats(),
        "items": task_queue.list_status(),
    }


@router.get("/stats")
def get_task_stats():
    """
    获取任务状态统计。
    """

    return task_queue.stats()


@router.get("/{task_id}")
def get_task(task_id: str):
    """
    根据任务编号查询任务详情。
    """

    task = task_queue.get(task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"未找到任务：{task_id}",
        )

    return task.to_dict()