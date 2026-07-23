from datetime import datetime, timezone
from typing import Any

from app.agents.base_agent import BaseAgent
from app.agents.product_prompt import (
    PRODUCT_AGENT_SYSTEM_PROMPT,
    render_product_user_prompt,
)
from app.agents.product_response import parse_product_response
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
# 直接调用模型"）。命中任一关键词即视为支持四类任务（商品机会
# 分析/选品评估/商品组合与组货建议/上架准备清单）中的一类；不
# 命中返回安全的 unsupported_task 结果。同时兼容 AI CEO 委派过来
# 的、包含这些关键词的子任务任务文本。
#
# "小样本"/"报价"两个关键词是审查后补充：真实选品评估任务经常
# 直接给出具体商品名称（如"LED灯带"）而不出现"商品"/"产品"/
# "选品"等泛称词，但几乎总会出现"小样本测试/验证"或"报价"这类
# 与选品评估强相关、财务/行政/数据库类任务基本不会使用的措辞，
# 因此补充这两个关键词，而不是笼统放宽"测试"/"样本"等过于宽泛、
# 容易误伤其它任务类型的词。
SUPPORTED_TASK_KEYWORDS = (
    "产品",
    "商品",
    "选品",
    "SKU",
    "sku",
    "组货",
    "货盘",
    "上架",
    "商品结构",
    "商品组合",
    "引流款",
    "利润款",
    "测试款",
    "爆款",
    "商品机会",
    "产品机会",
    "首批商品",
    "冷启动商品",
    "供应链准备",
    "小样本",
    "报价",
)

# 展示给前端的能力分类标签，对应阶段 8D 规格里明确列出的四类
# 支持任务。
SUPPORTED_TASK_TYPE_LABELS = (
    "商品机会分析",
    "选品评估",
    "商品组合与组货建议",
    "上架准备清单",
)

_UNSUPPORTED_TASK_MESSAGE = (
    "产品 Agent 当前仅支持商品机会、选品评估、商品组合和上架准备类任务"
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


class ProductAgent(BaseAgent):
    """
    产品 Agent（阶段 8D）：第三个具备真实执行能力的 AI 员工。

    只负责"商品机会分析/选品评估/商品组合与组货建议/上架准备
    清单"四类任务，通过统一 LLM Gateway 调用 DeepSeek 或 Ollama
    生成产品分析结果；上下文只包含 ProductContextBuilder 产出的、
    已经安全白名单过的数据（包括同一 root_task_id 下销售 Agent
    兄弟任务的安全摘要），不包含任何 Task payload/context 原文或
    Secret，也不直接调用销售 Agent——两者之间只有"读取已落库的
    安全摘要"这一种间接关联。

    无论 delegation_depth 是多少都正常执行（AI CEO 委派过来的
    子任务 depth=1 也照常分析），但本类从不调用
    TaskDelegationService、不构造任何委派建议字段、不创建子
    任务——结构上排除了"产品 Agent 继续向下委派"的可能性。
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
        root_task_id = task_meta.get("root_task_id")
        parent_task_id = task_meta.get("parent_task_id")
        shop_id = task_meta.get("shop_id")

        if not _is_supported_task(task_name):
            return {
                "agent": self.name,
                "action": "unsupported_task",
                "task_name": task_name,
            }

        # 延迟导入：product_context 依赖 DashboardService，
        # DashboardService 又依赖 runtime_engine 单例；
        # runtime_engine.py 在模块加载时会经由
        # default_agents.register_default_agents() 导入本文件，
        # 若在模块顶层导入 product_context 会形成循环导入（与
        # sales_agent.py/ai_ceo_agent.py 相同的既有模式）。
        from app.agents.product_context import build_product_context

        return {
            "agent": self.name,
            "action": "product_analysis",
            "task_name": task_name,
            "product_context": build_product_context(
                agent_name=self.name,
                task_name=task_name,
                priority=priority,
                task_id=task_id,
                parent_task_id=parent_task_id,
                root_task_id=root_task_id,
                delegation_depth=delegation_depth,
                shop_id=shop_id,
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
            system_prompt=PRODUCT_AGENT_SYSTEM_PROMPT,
            user_prompt=render_product_user_prompt(decision["product_context"]),
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

        parsed = parse_product_response(response.content)

        usage = None
        if response.usage is not None:
            usage = {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        return {
            "agent": self.name,
            "analysis_type": "product_strategy",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "provider": response.provider,
            "model": response.model,
            "format": parsed["format"],
            "product_analysis": parsed["product_analysis"],
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
