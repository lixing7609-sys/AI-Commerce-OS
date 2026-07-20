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
        *,
        task_id: str | None = None,
        delegation_depth: int = 0,
        root_task_id: str | None = None,
        parent_task_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Agent 标准运行流程。

        task_id/delegation_depth/root_task_id/parent_task_id（阶段
        8B/8C）由调用方（TaskExecutionService 或
        POST /agents/{name}/run）根据数据库中的任务行注入，只读、
        由后端生成——Agent 自身和 Task payload/context 都不能伪造
        这些字段。它们会被合并进传给 think() 的 context 副本的
        保留键 "_task_meta" 下；普通 Agent（如 OperationalAgent）
        会忽略这个键，只有需要感知自身任务身份（例如判断是否允许
        发起委派、是否需要读取父任务安全摘要）的 Agent 才读取它。
        原始 context 对象本身不会被修改。
        """

        self.status = "running"
        self.current_task = task_name or "正在处理任务"
        self.last_error = None

        enriched_context = {
            **context,
            "_task_meta": {
                "task_id": task_id,
                "delegation_depth": delegation_depth,
                "root_task_id": root_task_id,
                "parent_task_id": parent_task_id,
            },
        }

        try:
            decision = self.think(enriched_context)
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

        capability_ready 默认 False（占位 Agent 的既定语义）；
        已接入真实业务能力的 Agent（AICEOAgent/SalesAgent）在各自
        to_dict() 里覆盖为 True，不需要前端靠"是否存在
        llm_provider 字段"这种隐式判断。
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
            "capability_ready": False,
        }