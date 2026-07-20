import logging
import time

import httpx

from app.llm.exceptions import (
    AuthenticationError,
    InvalidResponseError,
    LLMTimeoutError,
    NetworkError,
    ProviderUnavailableError,
    RateLimitedError,
)
from app.llm.models import LLMRequest, LLMResponse, LLMUsage
from app.llm.provider import LLMProvider

logger = logging.getLogger("app.llm.deepseek")


class DeepSeekProvider(LLMProvider):
    """
    DeepSeek OpenAI-compatible Chat Completions Provider。

    只记录状态码和耗时，绝不记录请求头（含 Authorization）、
    请求体（含 system/user prompt）或响应体原文。
    """

    def __init__(self, api_key: str, base_url: str, model: str, timeout_seconds: float):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_seconds = timeout_seconds

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }

        if request.response_format == "json":
            payload["response_format"] = {"type": "json_object"}

        started_at = time.monotonic()

        try:
            response = httpx.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {self._api_key}"},
                timeout=self._timeout_seconds,
            )
        except httpx.TimeoutException as error:
            logger.error("deepseek request timed out")
            raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
            logger.error("deepseek unreachable: error_type=%s", type(error).__name__)
            raise ProviderUnavailableError() from error
        except httpx.HTTPError as error:
            logger.error("deepseek network error: error_type=%s", type(error).__name__)
            raise NetworkError() from error

        latency_ms = (time.monotonic() - started_at) * 1000

        logger.info(
            "deepseek response received: status=%s latency_ms=%.1f",
            response.status_code,
            latency_ms,
        )

        if response.status_code in (401, 403):
            raise AuthenticationError()

        if response.status_code == 429:
            raise RateLimitedError()

        if response.status_code >= 500:
            raise ProviderUnavailableError()

        if response.status_code != 200:
            raise InvalidResponseError()

        try:
            body = response.json()
            content = body["choices"][0]["message"]["content"]

            if not isinstance(content, str):
                raise InvalidResponseError()

            usage_raw = body.get("usage") or {}
            usage = LLMUsage(
                input_tokens=usage_raw.get("prompt_tokens"),
                output_tokens=usage_raw.get("completion_tokens"),
                total_tokens=usage_raw.get("total_tokens"),
            )
        except InvalidResponseError:
            raise
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise InvalidResponseError() from error

        return LLMResponse(
            content=content,
            provider="deepseek",
            model=self._model,
            usage=usage,
            latency_ms=latency_ms,
        )
