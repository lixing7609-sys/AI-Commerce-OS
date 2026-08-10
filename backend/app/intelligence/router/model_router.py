from dataclasses import dataclass
from enum import StrEnum

from app.intelligence.provider import IntelligenceProvider


class IntelligenceTask(StrEnum):
    ARCHITECTURE = "architecture"
    STRATEGY = "strategy"
    LONG_CODING = "long_coding"
    EXECUTION = "execution"
    COST_OPTIMIZED = "cost_optimized"


@dataclass(frozen=True, slots=True)
class ModelRoute:
    provider: str
    model: str
    executor: str | None = None


class ModelRouter:
    """Routes capabilities without embedding model choices in business services."""

    ROUTES = {
        IntelligenceTask.ARCHITECTURE: ModelRoute("gpt", "gpt", None),
        IntelligenceTask.STRATEGY: ModelRoute("gpt", "gpt", None),
        IntelligenceTask.LONG_CODING: ModelRoute("claude", "claude", None),
        IntelligenceTask.EXECUTION: ModelRoute("codex", "codex", "codex"),
        IntelligenceTask.COST_OPTIMIZED: ModelRoute("deepseek", "deepseek", None),
    }

    def __init__(self, providers: dict[str, IntelligenceProvider] | None = None):
        self._providers = dict(providers or {})

    def route(self, task: IntelligenceTask | str) -> ModelRoute:
        return self.ROUTES[IntelligenceTask(task)]

    def provider_for(self, task: IntelligenceTask | str) -> IntelligenceProvider:
        route = self.route(task)
        if route.executor:
            raise ValueError(f"{route.executor} is an executor, not an intelligence provider")
        try:
            return self._providers[route.provider]
        except KeyError as error:
            raise LookupError(f"intelligence provider is not configured: {route.provider}") from error
