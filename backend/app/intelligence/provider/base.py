from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Mapping


@dataclass(frozen=True, slots=True)
class IntelligenceRequest:
    instruction: str
    context: Mapping[str, Any] = field(default_factory=dict)
    response_schema: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class IntelligenceResponse:
    content: Mapping[str, Any]
    provider: str
    model: str


class IntelligenceProvider(ABC):
    """Replaceable structured-reasoning provider boundary."""

    name: str

    @abstractmethod
    def reason(self, request: IntelligenceRequest) -> IntelligenceResponse:
        raise NotImplementedError
