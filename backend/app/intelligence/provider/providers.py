from collections.abc import Callable
from typing import Any, Mapping

from app.intelligence.provider.base import IntelligenceProvider, IntelligenceRequest, IntelligenceResponse

ProviderTransport = Callable[[IntelligenceRequest], Mapping[str, Any]]


class _TransportProvider(IntelligenceProvider):
    def __init__(self, *, model: str, transport: ProviderTransport):
        self.model = model
        self._transport = transport

    def reason(self, request: IntelligenceRequest) -> IntelligenceResponse:
        return IntelligenceResponse(content=dict(self._transport(request)), provider=self.name, model=self.model)


class GPTProvider(_TransportProvider):
    name = "gpt"


class ClaudeProvider(_TransportProvider):
    name = "claude"


class DeepSeekProvider(_TransportProvider):
    name = "deepseek"
