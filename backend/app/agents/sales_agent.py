from datetime import datetime, timezone
from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.sales_prompt import SALES_AGENT_SYSTEM_PROMPT, render_sales_user_prompt
from app.agents.sales_response import parse_sales_response
from app.core.config import (
    get_deepseek_llm_config,
    get_llm_max_tokens,
    get_llm_provider,
    get_ollama_llm_config,
)
from app.llm.exceptions import LLMGatewayError
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest

# 纯关键词规则识别，不额外调用模型做任务分类（避免"对所有任务都
# 直接调用模型"）。命中任一关键词即视为支持；不命中返回安全的
# unsupported_task 结果。同时兼容 AI CEO 委派过来的、包含这些
# 关键词的子任务任务文本。
SUPPORTED_TASK_KEYWORDS = (
    "销售",
    "营销",
    "渠道",
    "转化",
    "成交",
    "客户",
    "商品策略",
    "上架",
    "冷启动",
    "内容销售",
    "运营动作",
    "销售机会",
    "销售计划",
)

# 展示给前端的能力分类标签（而不是原始关键词列表），对应阶段
# 8C 规格里明确列出的三类支持任务。
SUPPORTED_TASK_TYPE_LABELS = ("销售机会分析", "商品销售策略", "销售运营建议")

_UNSUPPORTED_TASK_MESSAGE = (
    "销售 Agent 当前仅支持销售机会、商品销售策略和销售运营建议类任务"
)


def _is_supported_task(task_name: str) -> bool:
    return any(keyword in task_name for keyword in SUPPORTED_TASK_KEYWORDS)


def _current_llm_provider_and_model() -> tuple[str | None, str | None]:
    """
    只读环境变量推导"当前配置的 Provider/模型"，不发起任何网络
    请求——供 to_dict() 在高频轮询场景下安全调用。
    """

    provider = get_llm_provider()

    if provider == "deepseek":
        config = get_deepseek_llm_config()
        return provider, (config.model if config else None)

    if provider == "ollama":
        config = get_ollama_llm_config()
        return provider, (config.model if config else None)

    return provider, None


class SalesAgent(BaseAgent):
    """
    销售 Agent（阶段 8C）：第二个具备真实执行能力的 AI 员工。

    只负责"销售机会分析/商品销售策略/销售运营建议"三类任务，
    通过统一 LLM Gateway 调用 DeepSeek 或 Ollama 生成销售分析
    结果；上下文只包含 SalesContextBuilder 产出的、已经安全白
    名单过的数据，不包含任何 Task payload/context 原文或 Secret。

    无论 delegation_depth 是多少都正常执行（AI CEO 委派过来的
    子任务 depth=1 也照常分析），但本类从不调用
    TaskDelegationService、不构造任何委派建议字段——结构上排除
    了"销售 Agent 继续向下委派"的可能性。
    """

    def __init__(self, name: str, role: str, description: str) -> None:
        super().__init__(name, role, description)
        self._last_llm_call_status: str | None = None

    def think(self, context: dict[str, Any]) -> dict[str, Any]:
        task_name = context.get("task", self.current_task or "")
        priority = context.get("priority", "normal")

        task_meta = context.get("_task_meta") or {}
        task_id = task_meta.get("task_id")
        delegation_depth = task_meta.get("delegation_depth", 0)
        parent_task_id = task_meta.get("parent_task_id")

        if not _is_supported_task(task_name):
            return {
                "agent": self.name,
                "action": "unsupported_task",
                "task_name": task_name,
            }

        # 延迟导入：sales_context 依赖 DashboardService，
        # DashboardService 又依赖 runtime_engine 单例；
        # runtime_engine.py 在模块加载时会经由
        # default_agents.register_default_agents() 导入本文件，
        # 若在模块顶层导入 sales_context 会形成循环导入（与
        # ai_ceo_agent.py 相同的既有模式）。
        from app.agents.sales_context import build_sales_context

        return {
            "agent": self.name,
            "action": "sales_analysis",
            "task_name": task_name,
            "sales_context": build_sales_context(
                agent_name=self.name,
                task_name=task_name,
                priority=priority,
                task_id=task_id,
                parent_task_id=parent_task_id,
                delegation_depth=delegation_depth,
            ),
        }

    def execute(self, decision: dict[str, Any]) -> dict[str, Any]:
        if decision["action"] == "unsupported_task":
            return {
                "status": "unsupported_task",
                "agent": self.name,
                "message": _UNSUPPORTED_TASK_MESSAGE,
            }

        request = LLMRequest(
            system_prompt=SALES_AGENT_SYSTEM_PROMPT,
            user_prompt=render_sales_user_prompt(decision["sales_context"]),
            temperature=0.4,
            max_tokens=get_llm_max_tokens(),
            response_format="json",
        )

        try:
            response = llm_gateway.generate(request)
        except LLMGatewayError as error:
            self._last_llm_call_status = error.error_type
            raise

        self._last_llm_call_status = "success"

        parsed = parse_sales_response(response.content)

        usage = None
        if response.usage is not None:
            usage = {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        return {
            "agent": self.name,
            "analysis_type": "sales_strategy",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "provider": response.provider,
            "model": response.model,
            "format": parsed["format"],
            "sales_analysis": parsed["sales_analysis"],
            "usage": usage,
        }

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()

        provider, model = _current_llm_provider_and_model()

        base.update(
            {
                "capability_ready": True,
                "llm_provider": provider,
                "llm_model": model,
                "supported_task_types": list(SUPPORTED_TASK_TYPE_LABELS),
                "last_llm_call_status": self._last_llm_call_status,
            }
        )

        return base
