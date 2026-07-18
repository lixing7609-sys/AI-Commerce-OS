from fastapi import APIRouter, HTTPException

from app.agents.agent_registry import AgentRegistry
from app.models.agent_task_request import AgentTaskRequest
from app.runtime.engine.runtime_engine import runtime_engine
from app.runtime.task import Task
from app.runtime.task_queue import task_queue
from app.services.task_service import TaskService


router = APIRouter(
    prefix="/agents",
    tags=["Agents"],
)


@router.get("")
def list_agents():
    """
    获取全部 AI 员工实时状态。
    """

    return {
        "total": AgentRegistry.count(),
        "items": AgentRegistry.list_status(),
    }


@router.get("/{agent_name}")
def get_agent(agent_name: str):
    """
    根据名称获取单个 AI 员工状态。
    """

    agent = AgentRegistry.get(agent_name)

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 Agent：{agent_name}",
        )

    return agent.to_dict()


@router.post("/{agent_name}/run")
def run_agent_task(
    agent_name: str,
    request: AgentTaskRequest,
):
    """
    向指定 AI 员工发送并同步执行任务。

    任务会：

    1. 创建标准 Task；
    2. 写入 PostgreSQL；
    3. 进入 TaskQueue；
    4. 执行 Agent；
    5. 更新最终执行状态和结果。
    """

    if not runtime_engine.running:
        raise HTTPException(
            status_code=409,
            detail="RuntimeEngine 尚未启动",
        )

    agent = AgentRegistry.get(agent_name)

    if agent is None:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 Agent：{agent_name}",
        )

    context = {
        **request.context,
        "task": request.task,
        "priority": request.priority,
    }

    task = Task(
        task_type="agent_task",
        payload=context,
        assigned_agent=agent_name,
        priority=request.priority,
    )

    try:
        TaskService.create_task(task)

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"任务写入数据库失败：{error}",
        ) from error

    task_queue.push(task)

    queued_task = task_queue.pop()

    if queued_task is None:
        task.mark_failed("任务队列读取失败")
        TaskService.update_task(task)

        raise HTTPException(
            status_code=500,
            detail=task.to_dict(),
        )

    queued_task.mark_running()
    TaskService.update_task(queued_task)

    try:
        result = agent.run(
            context=context,
            task_name=request.task,
        )

        if not result["success"]:
            error_message = result.get(
                "error",
                "Agent 任务执行失败",
            )

            queued_task.mark_failed(error_message)
            TaskService.update_task(queued_task)

            raise HTTPException(
                status_code=500,
                detail=queued_task.to_dict(),
            )

        queued_task.mark_completed(result)
        TaskService.update_task(queued_task)

        return {
            "success": True,
            "task": queued_task.to_dict(),
        }

    except HTTPException:
        raise

    except Exception as error:
        queued_task.mark_failed(str(error))
        TaskService.update_task(queued_task)

        raise HTTPException(
            status_code=500,
            detail=queued_task.to_dict(),
        ) from error