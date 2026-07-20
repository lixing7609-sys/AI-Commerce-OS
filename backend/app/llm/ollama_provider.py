import logging
import time

import httpx

from app.llm.exceptions import (
    ConfigurationError,
    InvalidResponseError,
    LLMTimeoutError,
    NetworkError,
    ProviderUnavailableError,
)
from app.llm.models import LLMRequest, LLMResponse, LLMUsage
from app.llm.provider import LLMProvider

logger = logging.getLogger("app.llm.ollama")


class OllamaProvider(LLMProvider):
    """
    本地 Ollama HTTP API Provider（/api/generate，stream=false）。

    只记录状态码和耗时，绝不记录请求体（含 prompt）或响应体原文。
    """

    def __init__(self, base_url: str, model: str, timeout_seconds: float):
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_seconds = timeout_seconds

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload = {
            "model": self._model,
            "prompt": f"{request.system_prompt}\n\n{request.user_prompt}",
            "stream": False,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
            },
        }

        if request.response_format == "json":
            payload["format"] = "json"

        started_at = time.monotonic()

        try:
            response = httpx.post(
                f"{self._base_url}/api/generate",
                json=payload,
                timeout=self._timeout_seconds,
            )
        except httpx.TimeoutException as error:
            logger.error("ollama request timed out")
            raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
            logger.error("ollama unreachable: error_type=%s", type(error).__name__)
            raise ProviderUnavailableError() from error
        except httpx.HTTPError as error:
            logger.error("ollama network error: error_type=%s", type(error).__name__)
            raise NetworkError() from error

        latency_ms = (time.monotonic() - started_at) * 1000

        logger.info(
            "ollama response received: status=%s latency_ms=%.1f",
            response.status_code,
            latency_ms,
        )

        if response.status_code == 404:
            # 模型未安装/未拉取——视为配置问题，不是"服务不可达"。
            raise ConfigurationError()

        if response.status_code >= 500:
            raise ProviderUnavailableError()

        if response.status_code != 200:
            raise InvalidResponseError()

        try:
            body = response.json()
            content = body["response"]

            if not isinstance(content, str):
                raise InvalidResponseError()

            prompt_tokens = body.get("prompt_eval_count")
            completion_tokens = body.get("eval_count")
            total_tokens = (
                prompt_tokens + completion_tokens
                if isinstance(prompt_tokens, int) and isinstance(completion_tokens, int)
                else None
            )

            usage = LLMUsage(
                input_tokens=prompt_tokens,
                output_tokens=completion_tokens,
                total_tokens=total_tokens,
            )
        except InvalidResponseError:
            raise
        except (KeyError, TypeError, ValueError) as error:
            raise InvalidResponseError() from error

        return LLMResponse(
            content=content,
            provider="ollama",
            model=self._model,
            usage=usage,
            latency_ms=latency_ms,
        )
