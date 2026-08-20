import json
import time
import httpx

from app.llm.exceptions import AuthenticationError, InsufficientQuotaError, InvalidResponseError, LLMTimeoutError, NetworkError, ProviderUnavailableError, RateLimitedError
from app.llm.models import LLMRequest, LLMResponse, LLMUsage
from app.llm.provider import LLMProvider


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, base_url: str, model: str, timeout_seconds: float):
        self._api_key, self._base_url, self._model, self._timeout_seconds = api_key, base_url.rstrip("/"), model, timeout_seconds

    def generate(self, request: LLMRequest) -> LLMResponse:
        images = list(request.metadata.get("images") or [])
        user_content = [{"type": "image", "source": {"type": "base64", "media_type": item["mime_type"], "data": item["base64"]}} for item in images] + [{"type": "text", "text": request.user_prompt}] if images else request.user_prompt
        payload = {"model": self._model, "system": request.system_prompt, "messages": [{"role": "user", "content": user_content}], "temperature": request.temperature, "max_tokens": request.max_tokens}
        started = time.monotonic()
        try: response = httpx.post(f"{self._base_url}/messages", json=payload, headers={"x-api-key": self._api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, timeout=self._timeout_seconds)
        except httpx.TimeoutException as error: raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error: raise ProviderUnavailableError() from error
        except httpx.HTTPError as error: raise NetworkError() from error
        latency = (time.monotonic() - started) * 1000
        if response.status_code in (401, 403): raise AuthenticationError()
        if response.status_code == 429: raise RateLimitedError()
        if response.status_code >= 500: raise ProviderUnavailableError()
        if response.status_code != 200:
            try:
                error = (response.json().get("error") or {})
                message = str(error.get("message") or "").casefold()
            except (ValueError, AttributeError):
                message = ""
            if "credit balance" in message or "billing" in message or "quota" in message:
                raise InsufficientQuotaError()
            raise InvalidResponseError()
        try:
            body = response.json(); content = body["content"][0]["text"]; usage_raw = body.get("usage") or {}
            if not isinstance(content, str): raise InvalidResponseError()
        except InvalidResponseError: raise
        except (KeyError, IndexError, TypeError, ValueError) as error: raise InvalidResponseError() from error
        input_tokens, output_tokens = usage_raw.get("input_tokens"), usage_raw.get("output_tokens")
        total = input_tokens + output_tokens if isinstance(input_tokens, int) and isinstance(output_tokens, int) else None
        return LLMResponse(content=content, provider="anthropic", model=self._model, usage=LLMUsage(input_tokens, output_tokens, total), latency_ms=latency)

    def stream(self, request: LLMRequest):
        images = list(request.metadata.get("images") or [])
        content = [{"type": "image", "source": {"type": "base64", "media_type": item["mime_type"], "data": item["base64"]}} for item in images] + [{"type": "text", "text": request.user_prompt}] if images else request.user_prompt
        payload = {"model": self._model, "system": request.system_prompt, "messages": [{"role": "user", "content": content}], "temperature": request.temperature, "max_tokens": request.max_tokens, "stream": True}
        try:
            with httpx.stream("POST", f"{self._base_url}/messages", json=payload, headers={"x-api-key": self._api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"}, timeout=self._timeout_seconds) as response:
                if response.status_code in (401, 403): raise AuthenticationError()
                if response.status_code == 429: raise RateLimitedError()
                if response.status_code >= 500: raise ProviderUnavailableError()
                if response.status_code != 200: raise InvalidResponseError()
                for line in response.iter_lines():
                    if not line.startswith("data: "): continue
                    try:
                        event = json.loads(line[6:]); delta = event.get("delta") or {}
                        chunk = delta.get("text") if event.get("type") == "content_block_delta" else None
                    except (ValueError, TypeError): chunk = None
                    if chunk: yield chunk
        except httpx.TimeoutException as error: raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error: raise ProviderUnavailableError() from error
        except httpx.HTTPError as error: raise NetworkError() from error
