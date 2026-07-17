from typing import Any

from app.agents.base_agent import BaseAgent


class OperationalAgent(BaseAgent):
    """
    AI-Commerce-OS 通用业务 Agent。

    当前阶段先负责：

    - 接收标准化业务上下文
    - 生成基础执行决策
    - 返回结构化执行结果

    后续接入大模型、n8n 和平台 API 时，
    可以在 think 和 execute 方法中继续扩展。
    """

    def think(
        self,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        根据输入上下文生成基础决策。
        """

        task = context.get(
            "task",
            self.current_task or "等待新任务",
        )

        priority = context.get(
            "priority",
            "normal",
        )

        return {
            "agent": self.name,
            "role": self.role,
            "task": task,
            "priority": priority,
            "context": context,
            "action": "process_task",
        }

    def execute(
        self,
        decision: dict[str, Any],
    ) -> dict[str, Any]:
        """
        执行基础业务决策。

        当前返回结构化模拟结果，
        后续将在这里连接真实工作流。
        """

        return {
            "executed": True,
            "agent": self.name,
            "action": decision.get("action"),
            "task": decision.get("task"),
            "priority": decision.get("priority"),
            "message": f"{self.name} 已完成基础任务处理",
        }