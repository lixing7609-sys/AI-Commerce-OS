import logging

from app.core.config import (
    get_deepseek_llm_config,
    get_llm_provider,
    get_llm_timeout_seconds,
    get_ollama_llm_config,
)
from app.llm.deepseek_provider import DeepSeekProvider
from app.llm.exceptions import ConfigurationError
from app.llm.models import LLMRequest, LLMResponse
from app.llm.ollama_provider import OllamaProvider
from app.llm.provider import LLMProvider

logger = logging.getLogger("app.llm.gateway")


class LLMGateway:
    """
    统一模型网关：根据 LLM_PROVIDER 环境变量选择底层 Provider 并
    调用 generate()。

    每次调用都重新读取环境变量解析 Provider（不缓存实例），与
    项目内其它集成配置（WeComConfig 等）的既有约定一致，允许
    在不重启进程的情况下通过更新环境变量切换/修复配置（前提是
    有触发环境变量重新加载的手段），也让测试可以直接
    monkeypatch 环境变量。

    不做任何跨 Provider 自动回退：LLM_PROVIDER 指定 deepseek 时，
    即使 Ollama 恰好可用，也不会静默切换过去。
    """

    def _resolve_provider(self) -> LLMProvider:
        provider_name = get_llm_provider()
        timeout_seconds = get_llm_timeout_seconds()

        if provider_name == "deepseek":
            config = get_deepseek_llm_config()

            if config is None:
                raise ConfigurationError()

            return DeepSeekProvider(
                api_key=config.api_key,
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=timeout_seconds,
            )

        if provider_name == "ollama":
            config = get_ollama_llm_config()

            if config is None:
                raise ConfigurationError()

            return OllamaProvider(
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=timeout_seconds,
            )

        raise ConfigurationError()

    def generate(self, request: LLMRequest) -> LLMResponse:
        provider = self._resolve_provider()

        logger.info("llm generate requested: provider=%s", type(provider).__name__)

        response = provider.generate(request)

        logger.info(
            "llm generate completed: provider=%s model=%s latency_ms=%.1f",
            response.provider,
            response.model,
            response.latency_ms,
        )

        return response


llm_gateway = LLMGateway()
