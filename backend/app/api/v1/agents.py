from fastapi import APIRouter, Depends, HTTPException

from app.agents.agent_registry import AgentRegistry
from app.core.edition import Edition, require_edition
from app.models.agent_task_request import AgentTaskRequest
from app.runtime.engine.runtime_engine import runtime_engine
from app.runtime.task import Task
from app.runtime.task_queue import task_queue
from app.services.task_service import TaskService


router = APIRouter(
    prefix="/agents",
    tags=["Agents"],
    dependencies=[Depends(require_edition(Edition.DEVELOPER))],
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

    # 直接以 running 状态创建任务（而不是先提交 pending、再单独
    # 提交一次 running），任务因此不会以 status=pending 的形式对
    # 数据库短暂可见。这是为了避免后台 TaskConsumerService（阶段
    # 4B）通过 SELECT ... FOR UPDATE SKIP LOCKED 把这条本应由本
    # 请求同步执行的任务当成普通 pending 任务抢先领取，与本请求
    # 并发执行同一个任务。响应结构和最终写库状态与此前完全一致。
    task.mark_running()

    try:
        TaskService.create_task(task)

    except Exception as error:
        # 首次写库失败：此时任务尚未落库、Agent 尚未执行，不留下
        # 半完成的数据库记录；detail 只暴露安全的异常类型名，不
        # 拼接 str(error)（可能包含数据库连接串等敏感信息）。
        raise HTTPException(
            status_code=500,
            detail=f"任务写入数据库失败（{type(error).__name__}）",
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

    try:
        result = agent.run(
            context=context,
            task_name=request.task,
            task_id=task.id,
            delegation_depth=task.delegation_depth,
            root_task_id=task.root_task_id,
            parent_task_id=task.parent_task_id,
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