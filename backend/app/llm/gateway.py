import logging

from app.core.config import (
    get_deepseek_llm_config,
    get_openai_llm_config,
    get_anthropic_llm_config,
    get_llm_provider,
    get_llm_timeout_seconds,
    get_ollama_llm_config,
)
from app.llm.deepseek_provider import DeepSeekProvider
from app.llm.openai_provider import OpenAIProvider
from app.llm.anthropic_provider import AnthropicProvider
from app.llm.gemini_provider import GeminiProvider
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

    def _resolve_provider(self, provider_name: str | None = None) -> LLMProvider:
        requested_name = provider_name
        try:
            from app.core.model_center.service import resolve_runtime_config
            center_config = resolve_runtime_config(provider_key=requested_name) if requested_name else resolve_runtime_config(role="reasoner")
        except Exception:
            logger.exception("model center runtime resolution failed; preserving legacy runtime")
            center_config = None
        if center_config:
            provider_name = center_config.provider_key
            provider_type = center_config.provider_type
            timeout_seconds = get_llm_timeout_seconds()
            if provider_type == "deepseek":
                return DeepSeekProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
            if provider_type in {"openai", "ofoxai", "openrouter", "siliconflow", "azure_openai", "openai_compatible", "qwen", "kimi", "doubao", "local", "custom"}:
                return OpenAIProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
            if provider_type == "anthropic":
                return AnthropicProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
            if provider_type == "gemini":
                return GeminiProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)

        provider_name = requested_name or get_llm_provider()
        timeout_seconds = get_llm_timeout_seconds()

        if not provider_name:
            logger.error("llm configuration invalid: reason=provider_missing")
            raise ConfigurationError("provider_missing")

        if provider_name == "deepseek":
            config = get_deepseek_llm_config()

            if config is None:
                logger.error("llm configuration invalid: provider=deepseek reason=api_key_missing")
                raise ConfigurationError("api_key_missing")

            return DeepSeekProvider(
                api_key=config.api_key,
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=timeout_seconds,
            )

        if provider_name == "ollama":
            config = get_ollama_llm_config()

            if config is None:
                logger.error("llm configuration invalid: provider=ollama reason=model_missing")
                raise ConfigurationError("model_missing")

            return OllamaProvider(
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=timeout_seconds,
            )

        if provider_name in {"gpt", "openai"}:
            config = get_openai_llm_config()
            if config is None:
                logger.error("llm configuration invalid: provider=openai reason=api_key_or_model_missing")
                raise ConfigurationError("api_key_or_model_missing")
            return OpenAIProvider(api_key=config.api_key, base_url=config.base_url, model=config.model, timeout_seconds=timeout_seconds)

        if provider_name in {"claude", "anthropic"}:
            config = get_anthropic_llm_config()
            if config is None:
                logger.error("llm configuration invalid: provider=anthropic reason=api_key_or_model_missing")
                raise ConfigurationError("api_key_or_model_missing")
            return AnthropicProvider(api_key=config.api_key, base_url=config.base_url, model=config.model, timeout_seconds=timeout_seconds)

        logger.error("llm configuration invalid: reason=provider_invalid provider=%s", provider_name)
        raise ConfigurationError("provider_invalid")

    def generate(self, request: LLMRequest) -> LLMResponse:
        provider = self._resolve_provider()

        return self._generate(provider, request)

    def generate_for(self, provider_name: str, request: LLMRequest) -> LLMResponse:
        return self._generate(self._resolve_provider(provider_name), request)

    def generate_for_model(self, provider_name: str, model: str, request: LLMRequest) -> LLMResponse:
        """Generate with an explicit installed text model; never fall back to provider default."""
        try:
            from app.core.model_center.service import resolve_runtime_config
            center_config = resolve_runtime_config(provider_key=provider_name, model=model)
        except Exception:
            logger.exception("explicit model center runtime resolution failed")
            center_config = None
        if center_config is None:
            raise ConfigurationError("explicit_model_not_available")
        return self._generate(self._provider_from_runtime(center_config), request)

    def stream_for_model(self, provider_name: str, model: str, request: LLMRequest):
        """Yield native provider chunks, or the provider's safe complete-response fallback."""
        try:
            from app.core.model_center.service import resolve_runtime_config
            center_config = resolve_runtime_config(provider_key=provider_name, model=model)
        except Exception:
            logger.exception("explicit streaming model center runtime resolution failed")
            center_config = None
        if center_config is None:
            raise ConfigurationError("explicit_model_not_available")
        provider = self._provider_from_runtime(center_config)
        logger.info("llm stream requested: provider=%s", type(provider).__name__)
        yield from provider.stream(request)

    @staticmethod
    def _provider_from_runtime(center_config) -> LLMProvider:
        timeout_seconds = get_llm_timeout_seconds()
        if center_config.provider_type == "deepseek":
            return DeepSeekProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
        if center_config.provider_type in {"openai", "ofoxai", "openrouter", "siliconflow", "azure_openai", "openai_compatible", "qwen", "kimi", "doubao", "local", "custom"}:
            return OpenAIProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
        if center_config.provider_type == "anthropic":
            return AnthropicProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
        if center_config.provider_type == "gemini":
            return GeminiProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds)
        raise ConfigurationError("provider_invalid")

    @staticmethod
    def _generate(provider: LLMProvider, request: LLMRequest) -> LLMResponse:

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
