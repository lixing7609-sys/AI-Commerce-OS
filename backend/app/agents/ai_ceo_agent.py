from datetime import datetime, timezone
from typing import Any

from app.agents.ai_ceo_prompt import AI_CEO_SYSTEM_PROMPT, render_user_prompt
from app.agents.ai_ceo_response import parse_ai_ceo_response
from app.agents.base_agent import BaseAgent
from app.core.config import (
    get_deepseek_llm_config,
    get_llm_max_tokens,
    get_llm_provider,
    get_ollama_llm_config,
)
from app.llm.exceptions import LLMGatewayError
from app.llm.gateway import llm_gateway
from app.llm.models import LLMRequest

_EMPTY_DELEGATION_SUMMARY = {
    "status": "none",
    "created_count": 0,
    "skipped_count": 0,
    "child_task_ids": [],
    "items": [],
}

# 第一阶段只接受明确的"系统经营分析"类任务，通过任务名关键词
# 匹配识别——不调用模型做任务分类，避免"对所有任务都直接调用
# 模型"。命中即视为支持；不命中返回安全的 unsupported_task 结果，
# 不当作系统错误处理，也不调用模型。
SUPPORTED_TASK_KEYWORDS = (
    "经营分析",
    "系统运行",
    "行动建议",
    "任务执行情况",
    "运营情况",
    "经营状况",
    "运行情况",
)

_UNSUPPORTED_TASK_MESSAGE = "AI CEO 当前仅支持系统经营分析任务"


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


class AICEOAgent(BaseAgent):
    """
    AI CEO（阶段 8A）：第一个具备真实执行能力的 AI 员工。

    只负责"系统经营分析"一类任务，通过统一 LLM Gateway 调用
    DeepSeek 或 Ollama 生成分析结果；上下文只包含已经安全聚合过
    的系统数据，不包含任何 Task payload/context 原文或 Secret。
    """

    def __init__(self, name: str, role: str, description: str) -> None:
        super().__init__(name, role, description)
        self._last_llm_call_status: str | None = None

    def think(self, context: dict[str, Any]) -> dict[str, Any]:
        task_name = context.get("task", self.current_task or "")

        # _task_meta 由 BaseAgent.run() 注入，携带只读的任务身份
        # 信息（task_id/delegation_depth/root_task_id）；直接
        # think()/execute() 调用（例如测试）不会有这个键，此时
        # 安全降级为 task_id=None、depth=0，execute() 会因
        # task_id 缺失而跳过委派，不会异常。
        task_meta = context.get("_task_meta") or {}
        task_id = task_meta.get("task_id")
        delegation_depth = task_meta.get("delegation_depth", 0)
        root_task_id = task_meta.get("root_task_id")

        if not _is_supported_task(task_name):
            return {
                "agent": self.name,
                "action": "unsupported_task",
                "task_name": task_name,
                "task_id": task_id,
                "delegation_depth": delegation_depth,
                "root_task_id": root_task_id,
            }

        # 延迟导入：ai_ceo_context 依赖 DashboardService，
        # DashboardService 又依赖 runtime_engine 单例；
        # runtime_engine.py 在模块加载时会经由
        # default_agents.register_default_agents() 导入本文件，
        # 若在模块顶层导入 ai_ceo_context 会形成循环导入。放到方法
        # 内部，等 runtime_engine 模块已完成初始化后再导入即可。
        from app.agents.ai_ceo_context import build_ai_ceo_context

        return {
            "agent": self.name,
            "action": "system_operations_analysis",
            "task_name": task_name,
            "analysis_context": build_ai_ceo_context(),
            "task_id": task_id,
            "delegation_depth": delegation_depth,
            "root_task_id": root_task_id,
        }

    def execute(self, decision: dict[str, Any]) -> dict[str, Any]:
        if decision["action"] == "unsupported_task":
            return {
                "status": "unsupported_task",
                "message": _UNSUPPORTED_TASK_MESSAGE,
            }

        request = LLMRequest(
            system_prompt=AI_CEO_SYSTEM_PROMPT,
            user_prompt=render_user_prompt(decision["analysis_context"]),
            temperature=0.3,
            max_tokens=get_llm_max_tokens(),
            response_format="json",
        )

        try:
            response = llm_gateway.generate(request)
        except LLMGatewayError as error:
            self._last_llm_call_status = error.error_type
            raise

        self._last_llm_call_status = "success"

        parsed = parse_ai_ceo_response(response.content)

        usage = None
        if response.usage is not None:
            usage = {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        delegation_summary = self._delegate_if_eligible(decision, parsed)

        return {
            "agent": self.name,
            "analysis_type": "system_operations",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "provider": response.provider,
            "model": response.model,
            "delegation": delegation_summary,
            "format": parsed["format"],
            "analysis": parsed["analysis"],
            "usage": usage,
        }

    def _delegate_if_eligible(
        self, decision: dict[str, Any], parsed: dict[str, Any]
    ) -> dict[str, Any]:
        """
        只有满足全部条件才创建真实子任务：任务身份已知（说明是
        经由 run() 正常执行的，而不是测试直接调用 think/execute）、
        depth==0（防止递归委派）、模型返回 structured 格式且
        delegations 非空。任一条件不满足都安全返回"none"，不算
        任务失败。

        延迟导入 TaskDelegationService：它经由
        task_consumer_service -> task_execution_service ->
        runtime_engine -> default_agents 间接导入本模块，模块
        顶层导入会形成循环导入。
        """

        task_id = decision.get("task_id")
        delegation_depth = decision.get("delegation_depth", 0)

        if task_id is None or delegation_depth != 0:
            return dict(_EMPTY_DELEGATION_SUMMARY)

        if parsed["format"] != "structured":
            return dict(_EMPTY_DELEGATION_SUMMARY)

        raw_delegations = parsed["analysis"].get("delegations") or []

        if not raw_delegations:
            return dict(_EMPTY_DELEGATION_SUMMARY)

        from app.services.task_delegation_service import TaskDelegationService

        root_task_id = decision.get("root_task_id") or task_id

        return TaskDelegationService.create_delegated_tasks(
            parent_task_id=task_id,
            parent_agent_name=self.name,
            parent_depth=delegation_depth,
            root_task_id=root_task_id,
            delegations=raw_delegations,
        )

    def to_dict(self) -> dict[str, Any]:
        base = super().to_dict()

        provider, model = _current_llm_provider_and_model()

        base.update(
            {
                "capability_ready": True,
                "llm_provider": provider,
                "llm_model": model,
                "supported_task_types": list(SUPPORTED_TASK_KEYWORDS),
                "last_llm_call_status": self._last_llm_call_status,
            }
        )

        return base
