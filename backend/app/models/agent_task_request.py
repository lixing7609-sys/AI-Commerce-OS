from typing import Any

from pydantic import BaseModel, Field


class AgentTaskRequest(BaseModel):
    """
    AI Agent 独立任务请求。
    """

    task: str = Field(
        ...,
        min_length=1,
        description="需要 Agent 执行的任务内容",
    )

    priority: str = Field(
        default="normal",
        description="任务优先级，例如 low、normal、high",
    )

    context: dict[str, Any] = Field(
        default_factory=dict,
        description="附加业务上下文",
    )