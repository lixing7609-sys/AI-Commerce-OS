import json
import logging
import time
import httpx

from app.llm.exceptions import AuthenticationError, InvalidResponseError, LLMTimeoutError, NetworkError, ProviderUnavailableError, RateLimitedError
from app.llm.models import LLMRequest, LLMResponse, LLMUsage
from app.llm.provider import LLMProvider

logger = logging.getLogger("app.llm.openai")


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str, timeout_seconds: float):
        self._api_key, self._base_url, self._model, self._timeout_seconds = api_key, base_url.rstrip("/"), model, timeout_seconds

    def generate(self, request: LLMRequest) -> LLMResponse:
        images = list(request.metadata.get("images") or [])
        user_content = [{"type": "text", "text": request.user_prompt}, *[{"type": "image_url", "image_url": {"url": item["data_url"]}} for item in images]] if images else request.user_prompt
        payload = {"model": self._model, "messages": [{"role": "system", "content": request.system_prompt}, {"role": "user", "content": user_content}], "temperature": request.temperature, "max_tokens": request.max_tokens}
        if request.response_format == "json": payload["response_format"] = {"type": "json_object"}
        started = time.monotonic()
        try: response = httpx.post(f"{self._base_url}/chat/completions", json=payload, headers={"Authorization": f"Bearer {self._api_key}"}, timeout=self._timeout_seconds)
        except httpx.TimeoutException as error: raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error: raise ProviderUnavailableError() from error
        except httpx.HTTPError as error: raise NetworkError() from error
        latency = (time.monotonic() - started) * 1000
        if response.status_code in (401, 403): raise AuthenticationError()
        if response.status_code == 429: raise RateLimitedError()
        if response.status_code >= 500: raise ProviderUnavailableError()
        if response.status_code != 200: raise InvalidResponseError()
        try:
            body = response.json(); content = body["choices"][0]["message"]["content"]; usage_raw = body.get("usage") or {}
            if not isinstance(content, str): raise InvalidResponseError()
        except InvalidResponseError: raise
        except (KeyError, IndexError, TypeError, ValueError) as error: raise InvalidResponseError() from error
        return LLMResponse(content=content, provider="openai", model=self._model, usage=LLMUsage(usage_raw.get("prompt_tokens"), usage_raw.get("completion_tokens"), usage_raw.get("total_tokens")), latency_ms=latency)

    def stream(self, request: LLMRequest):
        images = list(request.metadata.get("images") or [])
        user_content = [{"type": "text", "text": request.user_prompt}, *[{"type": "image_url", "image_url": {"url": item["data_url"]}} for item in images]] if images else request.user_prompt
        payload = {"model": self._model, "messages": [{"role": "system", "content": request.system_prompt}, {"role": "user", "content": user_content}], "temperature": request.temperature, "max_tokens": request.max_tokens, "stream": True}
        if request.response_format == "json": payload["response_format"] = {"type": "json_object"}
        try:
            with httpx.stream("POST", f"{self._base_url}/chat/completions", json=payload, headers={"Authorization": f"Bearer {self._api_key}"}, timeout=self._timeout_seconds) as response:
                if response.status_code in (401, 403): raise AuthenticationError()
                if response.status_code == 429: raise RateLimitedError()
                if response.status_code >= 500: raise ProviderUnavailableError()
                if response.status_code != 200: raise InvalidResponseError()
                for line in response.iter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]": continue
                    try: chunk = (json.loads(line[6:]).get("choices") or [{}])[0].get("delta", {}).get("content")
                    except (ValueError, TypeError, IndexError): chunk = None
                    if chunk: yield chunk
        except httpx.TimeoutException as error: raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error: raise ProviderUnavailableError() from error
        except httpx.HTTPError as error: raise NetworkError() from error
