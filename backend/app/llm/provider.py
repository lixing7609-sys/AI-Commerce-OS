from abc import ABC, abstractmethod

from app.llm.models import LLMRequest, LLMResponse


class LLMProvider(ABC):
    """
    统一 Provider 接口。所有具体 Provider（DeepSeek/Ollama/…）都
    实现这一个方法；Agent 和 LLMGateway 只依赖这个抽象，不感知
    具体供应商的 URL、鉴权方式或响应结构。
    """

    @abstractmethod
    def generate(self, request: LLMRequest) -> LLMResponse:
        raise NotImplementedError
