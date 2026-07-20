from typing import Any

from app.agents.base_agent import BaseAgent

_CAPABILITY_NOT_IMPLEMENTED_MESSAGE = "该 AI 员工的业务能力将在后续阶段接入"


class OperationalAgent(BaseAgent):
    """
    AI-Commerce-OS 通用业务 Agent 占位实现（产品/销售/财务/行政）。

    阶段 8B 明确要求：这些 Agent 可以接收任务（包括 AI CEO 委派的
    子任务），但执行时必须安全返回 capability_not_implemented，
    不得调用任何大模型，不得伪装成已具备真实业务能力，也不会
    再对外发起委派——execute() 是一个固定输出，不读取 decision
    的任何内容，从设计上排除了这些风险。
    """

    def think(
        self,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """
        占位决策：只记录任务描述用于展示，不做任何真实分析。
        """

        task = context.get(
            "task",
            self.current_task or "等待新任务",
        )

        return {
            "agent": self.name,
            "task": task,
        }

    def execute(
        self,
        decision: dict[str, Any],
    ) -> dict[str, Any]:
        """
        固定返回业务能力未接入的安全结果；Task 仍标记为
        completed（而不是系统 failed），不调用 DeepSeek/Ollama，
        不创建任何子任务。
        """

        return {
            "status": "capability_not_implemented",
            "agent": self.name,
            "message": _CAPABILITY_NOT_IMPLEMENTED_MESSAGE,
        }
