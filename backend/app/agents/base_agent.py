from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any


class BaseAgent(ABC):
    """
    所有 AI Agent 的统一基类。

    每个 Agent 都具备：

    - 基本身份信息
    - 生命周期状态
    - 当前任务
    - 最后运行时间
    - 标准思考与执行流程
    - Dashboard 状态输出
    """

    def __init__(
        self,
        name: str,
        role: str,
        description: str,
    ) -> None:
        self.name = name
        self.role = role
        self.description = description

        self.status = "idle"
        self.current_task: str | None = None
        self.last_run_at: datetime | None = None
        self.last_error: str | None = None

    @abstractmethod
    def think(
        self,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        根据上下文进行分析并生成决策。
        """

        raise NotImplementedError

    @abstractmethod
    def execute(
        self,
        decision: dict[str, Any],
    ) -> dict[str, Any]:
        """
        执行 Agent 生成的决策。
        """

        raise NotImplementedError

    def run(
        self,
        context: dict[str, Any],
        task_name: str | None = None,
    ) -> dict[str, Any]:
        """
        Agent 标准运行流程。
        """

        self.status = "running"
        self.current_task = task_name or "正在处理任务"
        self.last_error = None

        try:
            decision = self.think(context)
            result = self.execute(decision)

            self.status = "idle"
            self.current_task = "等待新任务"
            self.last_run_at = datetime.now(timezone.utc)

            return {
                "success": True,
                "agent": self.name,
                "decision": decision,
                "result": result,
            }

        except Exception as error:
            self.status = "error"
            self.current_task = "任务执行失败"
            self.last_error = str(error)
            self.last_run_at = datetime.now(timezone.utc)

            return {
                "success": False,
                "agent": self.name,
                "error": self.last_error,
            }

    def start(
        self,
        task_name: str | None = None,
    ) -> None:
        """
        将 Agent 设置为运行状态。
        """

        self.status = "running"
        self.current_task = task_name or "系统运行中"
        self.last_error = None

    def stop(self) -> None:
        """
        将 Agent 设置为停止状态。
        """

        self.status = "stopped"
        self.current_task = "系统已停止"

    def set_idle(self) -> None:
        """
        将 Agent 设置为待机状态。
        """

        self.status = "idle"
        self.current_task = "等待新任务"

    def to_dict(self) -> dict[str, Any]:
        """
        输出适用于 API 和 Dashboard 的 Agent 状态。
        """

        return {
            "name": self.name,
            "role": self.role,
            "description": self.description,
            "status": self.status,
            "current_task": self.current_task,
            "last_run_at": (
                self.last_run_at.isoformat()
                if self.last_run_at
                else None
            ),
            "last_error": self.last_error,
        }