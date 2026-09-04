import logging
import time

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
from app.llm.exceptions import ConfigurationError, LLMGatewayError
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
                return self._tag_provider(DeepSeekProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
            if provider_type in {"openai", "ofoxai", "openrouter", "siliconflow", "azure_openai", "openai_compatible", "qwen", "kimi", "doubao", "local", "custom"}:
                return self._tag_provider(OpenAIProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
            if provider_type == "anthropic":
                return self._tag_provider(AnthropicProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
            if provider_type == "gemini":
                return self._tag_provider(GeminiProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)

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

            return self._tag_provider(DeepSeekProvider(
                api_key=config.api_key,
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=timeout_seconds,
            ), provider_name, config.model)

        if provider_name == "ollama":
            config = get_ollama_llm_config()

            if config is None:
                logger.error("llm configuration invalid: provider=ollama reason=model_missing")
                raise ConfigurationError("model_missing")

            return self._tag_provider(OllamaProvider(
                base_url=config.base_url,
                model=config.model,
                timeout_seconds=timeout_seconds,
            ), provider_name, config.model)

        if provider_name in {"gpt", "openai"}:
            config = get_openai_llm_config()
            if config is None:
                logger.error("llm configuration invalid: provider=openai reason=api_key_or_model_missing")
                raise ConfigurationError("api_key_or_model_missing")
            return self._tag_provider(OpenAIProvider(api_key=config.api_key, base_url=config.base_url, model=config.model, timeout_seconds=timeout_seconds), provider_name, config.model)

        if provider_name in {"claude", "anthropic"}:
            config = get_anthropic_llm_config()
            if config is None:
                logger.error("llm configuration invalid: provider=anthropic reason=api_key_or_model_missing")
                raise ConfigurationError("api_key_or_model_missing")
            return self._tag_provider(AnthropicProvider(api_key=config.api_key, base_url=config.base_url, model=config.model, timeout_seconds=timeout_seconds), provider_name, config.model)

        logger.error("llm configuration invalid: reason=provider_invalid provider=%s", provider_name)
        raise ConfigurationError("provider_invalid")

    def generate(self, request: LLMRequest) -> LLMResponse:
        provider = self._resolve_provider()
        return self._generate_and_record(provider, request)

    def generate_for(self, provider_name: str, request: LLMRequest) -> LLMResponse:
        return self._generate_and_record(self._resolve_provider(provider_name), request)

    def generate_for_model(self, provider_name: str, model: str, request: LLMRequest) -> LLMResponse:
        """Generate with an explicit model and a bounded configured Runtime fallback chain."""
        role = request.metadata.get("runtime_role")
        candidates = []
        if role:
            try:
                from app.core.model_center.service import resolve_runtime_chain
                configured = resolve_runtime_chain(role)
                if configured and (configured[0].provider_key, configured[0].model) == (provider_name, model):
                    candidates = configured
            except Exception:
                logger.exception("runtime fallback chain resolution failed")
        try:
            from app.core.model_center.service import resolve_runtime_config
            center_config = resolve_runtime_config(provider_key=provider_name, model=model)
        except Exception:
            logger.exception("explicit model center runtime resolution failed")
            center_config = None
        if center_config is None:
            raise ConfigurationError("explicit_model_not_available")
        if not candidates:
            candidates = [center_config]
        failures = []
        for index, candidate in enumerate(candidates):
            started = time.monotonic()
            fallback_from = {"provider": candidates[0].provider_key, "model": candidates[0].model} if index else None
            try:
                self._enforce_model_preflight(candidate.provider_key, candidate.model, request)
                response = self._generate(self._provider_from_runtime(candidate), request)
                invocation_id = self._record_invocation(candidate.provider_key, candidate.model, "completed", request,
                                                        response=response, latency_ms=response.latency_ms, fallback_from=fallback_from)
                request.metadata["model_invocation_id"] = invocation_id
                if index:
                    request.metadata["model_fallback"] = {"fallback_from": {"provider": candidates[0].provider_key, "model": candidates[0].model}, "provider": candidate.provider_key, "model": candidate.model, "reason": failures[-1]["error_type"]}
                    logger.warning("model fallback succeeded role=%s primary=%s/%s fallback=%s/%s reason=%s", role, candidates[0].provider_key, candidates[0].model, candidate.provider_key, candidate.model, failures[-1]["error_type"])
                return response
            except LLMGatewayError as error:
                invocation_id = self._record_invocation(candidate.provider_key, candidate.model, "failed", request,
                                                        latency_ms=(time.monotonic() - started) * 1000,
                                                        error_code=error.error_type, fallback_from=fallback_from)
                request.metadata["model_invocation_id"] = invocation_id
                failures.append({"provider": candidate.provider_key, "model": candidate.model, "error_type": error.error_type})
                if index + 1 >= len(candidates):
                    request.metadata["model_fallback_failures"] = failures
                    raise
        raise ConfigurationError("model_chain_unavailable")

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
        started = time.monotonic()
        try:
            self._enforce_model_preflight(center_config.provider_key, center_config.model, request)
            yield from provider.stream(request)
            request.metadata["model_invocation_id"] = self._record_invocation(
                center_config.provider_key, center_config.model, "completed", request,
                response=LLMResponse(
                    content="", provider=provider.__class__.__name__, model=center_config.model,
                    usage=request.metadata.get("_stream_usage"), latency_ms=(time.monotonic() - started) * 1000,
                ),
                latency_ms=(time.monotonic() - started) * 1000,
            )
        except LLMGatewayError as error:
            request.metadata["model_invocation_id"] = self._record_invocation(
                center_config.provider_key, center_config.model, "failed", request,
                latency_ms=(time.monotonic() - started) * 1000, error_code=error.error_type,
            )
            raise

    @staticmethod
    def _enforce_model_preflight(provider_id, model_id, request):
        if request.metadata.get("force_model_health_probe"):
            request.metadata["model_health_preflight"] = {"provider": provider_id, "model": model_id, "action": "forced_probe"}
            return
        from app.core.model_center.runtime_chain import model_runtime_preflight
        decision = model_runtime_preflight(provider_id, model_id)
        request.metadata["model_health_preflight"] = {
            "provider": provider_id, "model": model_id,
            "action": decision["preflight_action"], "health_source": decision["health_source"],
            "last_checked_at": decision["last_checked_at"], "fresh_until": decision["fresh_until"],
        }
        if decision["preflight_action"] != "reject":
            return
        from app.llm.exceptions import AuthenticationError, InsufficientQuotaError, LLMTimeoutError, ProviderUnavailableError, RateLimitedError
        errors = {
            "QUOTA_EXCEEDED": InsufficientQuotaError,
            "RATE_LIMITED": RateLimitedError,
            "TIMEOUT": LLMTimeoutError,
            "CONFIG_ERROR": AuthenticationError,
        }
        raise errors.get(decision["health_classification"], ProviderUnavailableError)()

    @staticmethod
    def _record_invocation(provider_id, model_id, status, request, *, response=None, latency_ms=None, error_code=None, fallback_from=None):
        try:
            from app.core.model_center.runtime_chain import record_model_invocation
            return record_model_invocation(provider_id=provider_id, model_id=model_id, status=status,
                metadata=request.metadata, usage=response.usage if response else None,
                latency_ms=latency_ms, error_code=error_code, fallback_from=fallback_from)
        except Exception:
            logger.exception("model invocation ledger write failed provider=%s model=%s", provider_id, model_id)
            return None

    @staticmethod
    def _provider_from_runtime(center_config) -> LLMProvider:
        timeout_seconds = get_llm_timeout_seconds()
        if center_config.provider_type == "deepseek":
            return LLMGateway._tag_provider(DeepSeekProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
        if center_config.provider_type in {"openai", "ofoxai", "openrouter", "siliconflow", "azure_openai", "openai_compatible", "qwen", "kimi", "doubao", "local", "custom"}:
            return LLMGateway._tag_provider(OpenAIProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
        if center_config.provider_type == "anthropic":
            return LLMGateway._tag_provider(AnthropicProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
        if center_config.provider_type == "gemini":
            return LLMGateway._tag_provider(GeminiProvider(api_key=center_config.api_key, base_url=center_config.base_url, model=center_config.model, timeout_seconds=timeout_seconds), center_config.provider_key, center_config.model)
        raise ConfigurationError("provider_invalid")

    @staticmethod
    def _tag_provider(provider: LLMProvider, provider_id: str | None, model_id: str | None) -> LLMProvider:
        setattr(provider, "_model_center_provider_id", provider_id)
        setattr(provider, "_model_center_model_id", model_id)
        return provider

    def _generate_and_record(self, provider: LLMProvider, request: LLMRequest) -> LLMResponse:
        provider_id = getattr(provider, "_model_center_provider_id", None)
        model_id = getattr(provider, "_model_center_model_id", None)
        started = time.monotonic()
        try:
            response = self._generate(provider, request)
            if provider_id and model_id:
                request.metadata["model_invocation_id"] = self._record_invocation(
                    provider_id, model_id, "completed", request,
                    response=response, latency_ms=response.latency_ms,
                )
            return response
        except LLMGatewayError as error:
            if provider_id and model_id:
                request.metadata["model_invocation_id"] = self._record_invocation(
                    provider_id, model_id, "failed", request,
                    latency_ms=(time.monotonic() - started) * 1000, error_code=error.error_type,
                )
            raise

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
