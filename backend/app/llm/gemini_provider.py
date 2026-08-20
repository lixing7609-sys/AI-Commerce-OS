import json
import time

import httpx

from app.llm.exceptions import AuthenticationError, InvalidResponseError, LLMTimeoutError, NetworkError, ProviderUnavailableError, RateLimitedError
from app.llm.models import LLMRequest, LLMResponse, LLMUsage
from app.llm.provider import LLMProvider


class GeminiProvider(LLMProvider):
    def __init__(self, *, api_key: str, base_url: str, model: str, timeout_seconds: float):
        self._api_key, self._base_url, self._model, self._timeout_seconds = api_key, base_url.rstrip("/"), model, timeout_seconds

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload = {"systemInstruction": {"parts": [{"text": request.system_prompt}]}, "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}], "generationConfig": {"temperature": request.temperature, "maxOutputTokens": request.max_tokens}}
        started = time.monotonic()
        try:
            response = httpx.post(f"{self._base_url}/models/{self._model}:generateContent", params={"key": self._api_key}, json=payload, timeout=self._timeout_seconds)
        except httpx.TimeoutException as error: raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error: raise ProviderUnavailableError() from error
        except httpx.HTTPError as error: raise NetworkError() from error
        latency = (time.monotonic() - started) * 1000
        if response.status_code in (401, 403): raise AuthenticationError()
        if response.status_code == 429: raise RateLimitedError()
        if response.status_code >= 500: raise ProviderUnavailableError()
        if response.status_code != 200: raise InvalidResponseError()
        try:
            body = response.json(); content = body["candidates"][0]["content"]["parts"][0]["text"]
            usage = body.get("usageMetadata") or {}
            return LLMResponse(content=content, provider="gemini", model=self._model, usage=LLMUsage(usage.get("promptTokenCount"), usage.get("candidatesTokenCount"), usage.get("totalTokenCount")), latency_ms=latency)
        except (KeyError, IndexError, TypeError, ValueError) as error: raise InvalidResponseError() from error

    def stream(self, request: LLMRequest):
        payload = {"systemInstruction": {"parts": [{"text": request.system_prompt}]}, "contents": [{"role": "user", "parts": [{"text": request.user_prompt}]}], "generationConfig": {"temperature": request.temperature, "maxOutputTokens": request.max_tokens}}
        try:
            with httpx.stream("POST", f"{self._base_url}/models/{self._model}:streamGenerateContent", params={"key": self._api_key, "alt": "sse"}, json=payload, timeout=self._timeout_seconds) as response:
                if response.status_code in (401, 403): raise AuthenticationError()
                if response.status_code == 429: raise RateLimitedError()
                if response.status_code >= 500: raise ProviderUnavailableError()
                if response.status_code != 200: raise InvalidResponseError()
                for line in response.iter_lines():
                    if not line.startswith("data: "): continue
                    try: chunk = json.loads(line[6:])["candidates"][0]["content"]["parts"][0]["text"]
                    except (ValueError, KeyError, IndexError, TypeError): chunk = None
                    if chunk: yield chunk
        except httpx.TimeoutException as error: raise LLMTimeoutError() from error
        except (httpx.ConnectError, httpx.ConnectTimeout) as error: raise ProviderUnavailableError() from error
        except httpx.HTTPError as error: raise NetworkError() from error
