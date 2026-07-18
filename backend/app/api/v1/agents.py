from fastapi import APIRouter, HTTPException

from app.agents.agent_registry import AgentRegistry
from app.models.agent_task_request import AgentTaskRequest
from app.runtime.engine.runtime_engine import runtime_engine


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
    向指定 AI 员工发送并执行任务。
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

    result = agent.run(
        context=context,
        task_name=request.task,
    )

    if not result["success"]:
        raise HTTPException(
            status_code=500,
            detail=result,
        )

    return result